"""전국 공공기관 공식 채용공고 검색 + 요청 기반(on-demand) 분석.

Provider 구조:
  - OpenAIWebSearchProvider: OpenAI Responses API web_search(허용 도메인 필터: JOB-ALIO·ALIO·클린아이) → 후보 목록
  - (향후) DataGoKrProvider: 공공데이터포털 채용정보 API(인증키 필요, 미연동)
검증:
  - 결과 URL을 코드로 정규화(utm 제거, 모바일→PC 상세)하고 공식 도메인 검증 후 실제 상세 페이지를 받아
    기관명·공고 제목을 페이지에서 직접 확인(AI 응답만 믿지 않음)
분석:
  - 상세 페이지의 공식 첨부 링크(alio.go.kr download.json) 중 PDF 를 받아 페이지 텍스트 추출
  - AI 구조화 추출(ai_analyzer) → 인용문 원문 대조 → '일부 규칙 검증 필요' 상태로 반환
  - 문서 SHA-256 + 스키마 버전으로 추출 결과 캐시(공개 규칙만, 개인 정보 없음)
"""
from __future__ import annotations

import html
import json
import re
import time
from urllib.parse import parse_qs, urlparse

from . import ai_analyzer, document_parser, llm, source_verifier

SEARCH_DOMAINS = ["job.alio.go.kr", "alio.go.kr", "job.cleaneye.go.kr"]
SEARCH_MODEL = "gpt-5-mini"  # web_search 도메인 필터를 지원하는 모델(gpt-4o-mini 는 미지원, 실제 호출로 확인)
SCHEMA_VERSION = "extract-v2"

SEARCH_SCHEMA = """
CREATE TABLE IF NOT EXISTS search_cache (q TEXT PRIMARY KEY, data TEXT, created_at REAL);
CREATE TABLE IF NOT EXISTS extraction_cache (sha256 TEXT, schema_version TEXT, data TEXT, created_at REAL, PRIMARY KEY (sha256, schema_version));
"""


def normalize_url(u: str) -> str | None:
    try:
        p = urlparse(u.strip())
    except ValueError:
        return None
    if not p.hostname:
        return None
    qs = parse_qs(p.query)
    if p.hostname.endswith("job.alio.go.kr") and "idx" in qs:
        return f"https://job.alio.go.kr/recruitview.do?idx={qs['idx'][0]}"
    q = "&".join(f"{k}={v[0]}" for k, v in qs.items() if not k.startswith("utm_"))
    return f"{p.scheme}://{p.hostname}{p.path}" + (f"?{q}" if q else "")


class OpenAIWebSearchProvider:
    name = "OpenAI web_search(JOB-ALIO·ALIO·클린아이 도메인 한정)"

    def search(self, query: str) -> list[dict]:
        from openai import OpenAI, OpenAIError
        prompt = (f"공공기관 공식 채용정보 사이트에서 '{query}'의 최근 채용공고(신입·경력 등)를 찾아라. "
                  "반드시 JSON 배열만 출력: [{\"org\": 기관명, \"title\": 공고 제목, \"posted_at\": \"YYYY-MM-DD\" 또는 null, "
                  "\"url\": 공고 상세 URL, \"type\": 채용 유형 또는 null}] 최대 6개. 확인되지 않은 값은 null. 추측 금지.")
        try:
            r = OpenAI(timeout=120).responses.create(model=SEARCH_MODEL, input=prompt,
                                                     tools=[{"type": "web_search", "filters": {"allowed_domains": SEARCH_DOMAINS}}])
        except OpenAIError as e:
            raise RuntimeError(f"OpenAI 검색 실패: {e.__class__.__name__}") from e
        text = r.output_text or ""
        m = re.search(r"\[.*\]", text, re.S)
        items = []
        if m:
            try:
                items = json.loads(m.group(0))
            except json.JSONDecodeError:
                items = []
        urls = []
        for it in r.output:
            if getattr(it, "type", "") == "message":
                for ct in it.content:
                    for a in (getattr(ct, "annotations", None) or []):
                        if getattr(a, "url", None):
                            urls.append(a.url)
        return [i for i in items if isinstance(i, dict)] + [{"org": None, "title": None, "url": u} for u in urls]


def fetch_detail(url: str) -> dict:
    """JOB-ALIO 상세 페이지를 받아 기관명·제목·첨부를 페이지에서 직접 추출."""
    raw, final, ctype = source_verifier.fetch_official(url, None)
    page = raw.decode("utf-8", "ignore")
    org = re.search(r"<h2>([^<]{2,40})</h2>", page)
    title = re.search(r'class="titleH2"\s+title="([^"]+)"', page) or re.search(r'class="titleH2"[^>]*>([^<]+)<', page)
    atts = [{"url": html.unescape(u), "name": html.unescape(n).strip()} for u, n in
            re.findall(r'<a href="(https://www\.alio\.go\.kr/download/download\.json\?fileNo=\d+)"[^>]*>([^<]+)</a>', page)]
    dates = re.findall(r"(20\d\d[.\-]\d{2}[.\-]\d{2})", page)
    return {"final_url": final, "org": org.group(1).strip() if org else None, "title": html.unescape(title.group(1)).strip() if title else None,
            "attachments": atts, "dates": dates[:4], "html_len": len(page)}


def search(conn, query: str, max_verify: int = 6) -> dict:
    query = query.strip()[:40]
    if not query:
        raise ValueError("기업명을 입력하세요")
    conn.executescript(SEARCH_SCHEMA)
    row = conn.execute("SELECT data, created_at FROM search_cache WHERE q=?", (query,)).fetchone()
    if row and time.time() - row["created_at"] < 6 * 3600:
        return dict(json.loads(row["data"]), cached=True)
    if not llm.provider() == "openai":
        return {"query": query, "results": [], "status": "검색 불가", "message": "OPENAI_API_KEY 미설정 — 공식 URL 직접 입력·PDF 업로드를 이용하세요."}
    t0 = time.time()
    raw = OpenAIWebSearchProvider().search(query)
    seen, results = set(), []
    for it in raw:
        u = normalize_url(it.get("url") or "")
        if not u or u in seen:
            continue
        seen.add(u)
        v = source_verifier.verify_url(u, None, resolve_dns=False)
        if not v.ok or not any(source_verifier._host_matches(v.host, d) for d in SEARCH_DOMAINS):
            continue
        rec = {"url": u, "ai_org": it.get("org"), "ai_title": it.get("title"), "posted_at": it.get("posted_at"), "type": it.get("type"),
               "status": "검색 완료"}
        if len(results) < max_verify and "recruitview.do" in u:
            try:
                d = fetch_detail(u)
                rec.update(org=d["org"], title=d["title"], attachments=d["attachments"],
                           status="공식 출처 검증 완료" if d["title"] else "문서 확보 실패")
                if query.replace(" ", "") not in (d["org"] or "").replace(" ", "") and query.replace(" ", "") not in (d["title"] or "").replace(" ", ""):
                    rec["status"] = "기관명 불일치 — 확인 필요"
            except Exception as e:  # noqa: BLE001
                rec.update(status="문서 확보 실패", error=str(e)[:120])
        results.append(rec)
    out = {"query": query, "provider": OpenAIWebSearchProvider.name, "results": results, "elapsed_s": round(time.time() - t0, 1),
           "status": "검색 완료" if results else "공식 공고를 찾지 못함",
           "message": None if results else "공식 사이트에서 공고를 찾지 못했어요. 공고 URL을 직접 입력하거나 PDF를 업로드해 주세요.",
           "note": "검색은 OpenAI 웹 검색(공식 도메인 한정) 결과를 코드로 재검증한 것입니다. 모집 직렬·가점은 공고 분석 후 확인하세요."}
    conn.execute("INSERT OR REPLACE INTO search_cache VALUES (?,?,?)", (query, json.dumps(out, ensure_ascii=False), time.time()))
    return out


def analyze(conn, url: str, store_document) -> dict:
    """공고 상세 URL → 첨부 PDF 확보 → 텍스트 → AI 구조화(캐시) → 인용 검증."""
    conn.executescript(SEARCH_SCHEMA)
    stages = []
    d = fetch_detail(url)
    stages.append({"stage": "공식 출처 검증 완료", "detail": d["final_url"]})
    pdfs = [a for a in d["attachments"] if a["name"].lower().endswith(".pdf")]
    if not pdfs:
        kinds = ", ".join(sorted({a["name"].rsplit(".", 1)[-1] for a in d["attachments"]})) or "첨부 없음"
        return {"org": d["org"], "title": d["title"], "url": url, "attachments": d["attachments"], "stages": stages,
                "status": "지원하지 않는 문서 형식", "message": f"PDF 첨부가 없습니다(첨부 형식: {kinds}). HWP/이미지 공고는 구현 예정 — 첨부 PDF가 있다면 직접 업로드해 주세요."}
    pdf = pdfs[0]
    raw, final, _ = source_verifier.fetch_official(pdf["url"], None)
    if raw[:4] != b"%PDF":
        return {"org": d["org"], "title": d["title"], "url": url, "stages": stages, "status": "문서 확보 실패", "message": "첨부가 PDF 형식이 아닙니다."}
    sha = document_parser.sha256(raw)
    doc_id, dup, _ = store_document(raw, pdf["name"], pdf["url"], final, "official_source_unreviewed", f"{d['org']} 공식 첨부(JOB-ALIO)")
    pages = document_parser.extract_pages(raw)
    stages.append({"stage": "문서 확보 완료", "detail": f"{pdf['name']} · {len(pages)}쪽 · SHA-256 {sha[:12]}…"})
    if not document_parser.is_text_pdf(pages):
        return {"org": d["org"], "title": d["title"], "url": url, "stages": stages, "status": "문서 분석 실패", "message": "텍스트 추출이 불가능한 PDF(스캔본)입니다. OCR은 구현 예정입니다."}
    row = conn.execute("SELECT data FROM extraction_cache WHERE sha256=? AND schema_version=?", (sha, SCHEMA_VERSION)).fetchone()
    if row:
        ext = json.loads(row["data"]); cached = True
    else:
        budget, sel = 0, []
        for p in pages:  # 토큰 관리: 앞쪽부터 최대 약 45,000자
            if budget + len(p) > 45000:
                break
            sel.append(p); budget += len(p)
        ext = ai_analyzer.extract_with_ai(sel, None)
        cached = False
        if ext.get("status") == "extracted_needs_review":
            conn.execute("INSERT OR REPLACE INTO extraction_cache VALUES (?,?,?,?)", (sha, SCHEMA_VERSION, json.dumps(ext, ensure_ascii=False), time.time()))
    if ext.get("status") != "extracted_needs_review":
        stages.append({"stage": "분석 실패", "detail": ext.get("message")})
        return {"org": d["org"], "title": d["title"], "url": url, "stages": stages, "status": "분석 실패", "message": ext.get("message"), "document_id": doc_id}
    res = ext["result"]
    n_all = sum(len(res[k]) for k in ("eligibility_rules", "bonus_rules", "written_exam", "schedule"))
    n_ok = sum(1 for k in ("eligibility_rules", "bonus_rules", "written_exam", "schedule") for r in res[k] if r.get("evidence_verified"))
    stages.append({"stage": "규칙 추출 완료", "detail": f"AI 추출 {n_all}건 (모델 {ext.get('model')}){' · 캐시 사용' if cached else ''}"})
    stages.append({"stage": "인용 원문 대조 완료", "detail": f"{n_ok}/{n_all}건 원문 일치"})
    stages.append({"stage": "일부 규칙 검증 필요", "detail": "표 구조·적용 범위·각주는 검토자가 원문으로 확인 후 계산 규칙으로 승인해야 합니다."})
    return {"org": d["org"], "title": d["title"], "url": url, "pdf": pdf, "document_id": doc_id, "sha256": sha, "pages": len(pages),
            "cached": cached, "stages": stages, "status": "일부 규칙 검증 필요", "extraction": res, "verified": n_ok, "total": n_all,
            "message": "AI가 추출한 규칙은 아직 가점 계산에 자동 반영되지 않습니다(검토·승인 후 활성화)."}
