"""공식 채용문서 기반 RAG (검색 → 근거 검증 → 답변 / 보류).

검색: SQLite FTS5 + BM25. 한국어 형태소 분석기 없이도 동작하도록 '문자 2-gram' 토큰으로 색인한다.
범위 제어: 검색은 반드시 하나의 공고 버전(recruitment_id)으로 필터링한다. 복수 기업 질문은 기업별로 분리 검색.
답변:
  - 규칙 질문(가점·중복·인정 여부): 기존 규칙 엔진 결과 + 엔진 근거 원문 (AI 미사용, 결정적)
  - 그 외: ANTHROPIC_API_KEY 가 있으면 검색 결과만 근거로 LLM 답변 생성 → 인용문이 검색된 Chunk 에 실제 존재하는지 코드 검증 → 실패 시 보류
           키가 없으면 AI 답변을 만들지 않고 '검색된 공식 원문'만 보여 준다.
  - 검색 점수/질의어 적중률이 기준 미달이면 답변 보류
"""
from __future__ import annotations

import json
import os
import re
from pathlib import Path

from . import engine
from .document_parser import normalize, quote_exists
from .evidence_validator import load_pages

CHUNK_CHARS = 700
OVERLAP_LINES = 2
HEADING = re.compile(r"^\s*(□|○|◦|\[참고\d+\]|\d+\.\s|[가-하]\.\s|<.+>)")
STOP = set("은는이가을를의에와과도로으로에서하고하면해요해야돼나요인가요있어없어어떻게뭐야무엇몇점이야알려줘")
NO_ANSWER = "선택한 공식 채용공고 및 첨부파일에서 해당 내용을 확인할 수 없습니다."

COMPANY_ALIASES = {
    "korail": ["코레일", "한국철도", "철도공사", "korail"],
    "kepco": ["한전", "한국전력", "kepco"],
    "seoulmetro": ["서울교통공사", "서울교통", "서울메트로"],
}
DOC_TYPE = {"notice": "채용공고 본문", "reference": "채용 참고자료(자격증 가산점표·필기 세부사항 등)"}


def bigrams(text: str) -> list[str]:
    toks = []
    for w in re.findall(r"[가-힣]+|[A-Za-z]+|\d+", text or ""):
        w = w.lower()
        if re.match(r"[가-힣]", w):
            if len(w) == 1:
                toks.append(w)
            toks += [w[i:i + 2] for i in range(len(w) - 1)]
        else:
            toks.append(w)
    return toks


SYNONYMS = {"졸업": "학력", "나이": "연령", "토익": "TOEIC", "몇살": "연령", "시험시간": "필기시험 시간", "과락": "40% 미만",
            "일정": "채용일정", "몇명": "채용인원", "인원": "합계", "전공시험": "전공과목 출제범위", "비중": "문항"}
GENERIC = {"지원", "원할", "할수", "수있", "있어", "공고", "채용", "시험", "기준", "어떻", "떻게", "되어", "어있", "포함", "함돼"}
DF: dict[str, int] = {}
N_DOCS = [1]


FILLER = {"몇", "몇명", "몇점", "몇분", "언제", "언제야", "어떻게", "어떤", "뭐야", "뭐", "알려줘", "있어", "있나요", "돼", "되나요",
          "이야", "인가요", "해", "되어", "있는지", "무엇", "무엇인가요", "어디", "어디야", "계획", "조건", "기준", "대해", "관련", "내용"}
ENDINGS = re.compile(r"(이었어|었어|이에요|예요|인가요|나요|이야|되어|돼|해|야|은|는|이|가|을|를|의|에|도|으로|로|와|과|어)$")


def clean_query(q: str) -> str:
    words = []
    for w in re.findall(r"[가-힣A-Za-z0-9]+", q):
        if w in FILLER:
            continue
        for _ in range(2):
            if len(w) > 2:
                w = ENDINGS.sub("", w)
        if w and w not in FILLER:
            words.append(w)
    return " ".join(words)


def query_terms(q: str) -> list[str]:
    for k, v in SYNONYMS.items():
        if k in q:
            q = q + " " + v
    q = clean_query(q)
    out = []
    for t in bigrams(q):
        if t in GENERIC:
            continue
        if len(t) == 2 and all(ch in STOP for ch in t):
            continue
        out.append(t)
    return list(dict.fromkeys(out))


def chunk_page(text: str) -> list[str]:
    """구조 보존 분할: 페이지 경계 유지, 제목(□, ○, [참고n], 1. 등)에서 우선 분할, 표 행은 줄 단위로 보존, 2줄 overlap."""
    lines = [l.rstrip() for l in text.splitlines() if l.strip()]
    chunks, cur, size = [], [], 0
    for ln in lines:
        brk = size >= CHUNK_CHARS or (size >= CHUNK_CHARS * 0.5 and HEADING.match(ln))
        if brk and cur:
            chunks.append("\n".join(cur))
            cur = cur[-OVERLAP_LINES:]
            size = sum(len(x) for x in cur)
        cur.append(ln)
        size += len(ln)
    if cur:
        chunks.append("\n".join(cur))
    return chunks


SCHEMA = """
CREATE TABLE IF NOT EXISTS document_chunks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recruitment_id TEXT, company_id TEXT, doc_key TEXT, document_title TEXT, document_type TEXT,
  recruitment_year INTEGER, recruitment_type TEXT, job_category TEXT, recruitment_region TEXT,
  official_source_url TEXT, attachment_url TEXT, page_number INTEGER, published_at TEXT,
  version_id TEXT, document_hash TEXT, verification_status TEXT, chunk_index INTEGER, text TEXT
);
CREATE VIRTUAL TABLE IF NOT EXISTS chunk_fts USING fts5(tokens, chunk_id UNINDEXED);
"""


def build_index(conn, rules: dict[str, dict], data_dir: Path, versions: dict[str, str]) -> dict:
    conn.executescript(SCHEMA)
    conn.execute("DELETE FROM document_chunks")
    conn.execute("DELETE FROM chunk_fts")
    DF.clear()
    from .document_parser import sha256
    n = 0
    for rid, r in rules.items():
        if r["official_source"].get("verification_status") != "verified":
            continue  # 공식 출처 미검증 문서는 검색 대상에서 제외
        for key, d in r.get("documents", {}).items():
            pages = load_pages(data_dir, d["local_file"])
            if not pages:
                continue
            h = sha256((data_dir / d["local_file"]).read_bytes())
            for pno, text in enumerate(pages, 1):
                for ci, ch in enumerate(chunk_page(text)):
                    cur = conn.execute(
                        "INSERT INTO document_chunks (recruitment_id, company_id, doc_key, document_title, document_type, recruitment_year, recruitment_type, job_category, recruitment_region, official_source_url, attachment_url, page_number, published_at, version_id, document_hash, verification_status, chunk_index, text) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                        (rid, r["company_id"], key, d["name"], DOC_TYPE.get(key, key), r.get("recruitment_year"), r.get("recruitment_type"),
                         r.get("job_category"), r.get("location"), r["official_source"]["url"], d["url"], pno, r.get("published_at"),
                         versions.get(rid, "v1"), h, "verified", ci, ch))
                    toks = bigrams(ch)
                    conn.execute("INSERT INTO chunk_fts (tokens, chunk_id) VALUES (?, ?)", (" ".join(toks), cur.lastrowid))
                    for t in set(toks):
                        DF[t] = DF.get(t, 0) + 1
                    n += 1
    N_DOCS[0] = max(n, 1)
    return {"chunks": n}


def idf(t: str) -> float:
    import math
    return math.log((N_DOCS[0] + 1) / (DF.get(t, 0) + 0.5))


def search(conn, query: str, recruitment_id: str, k: int = 5) -> list[dict]:
    terms = query_terms(query)
    if not terms:
        return []
    match = " OR ".join(f'"{t}"' for t in terms)
    rows = conn.execute(
        "SELECT c.*, bm25(chunk_fts) AS score FROM chunk_fts JOIN document_chunks c ON c.id = chunk_fts.chunk_id "
        "WHERE chunk_fts MATCH ? AND c.recruitment_id = ? ORDER BY score LIMIT ?", (match, recruitment_id, k)).fetchall()
    out = []
    for r in rows:
        d = dict(r)
        toks = set(bigrams(d["text"]))
        d["term_hits"] = [t for t in terms if t in toks]
        # IDF 가중 질의어 적중률: 문서 전체에 없는 핵심어(예: '대행사', 'TOEIC')가 빠지면 크게 낮아짐 → 답변 보류 근거
        tot = sum(idf(t) for t in terms) or 1
        d["coverage"] = round(sum(idf(t) for t in d["term_hits"]) / tot, 3)
        d["score"] = round(-d["score"], 3)  # bm25()는 낮을수록 관련 → 부호 반전
        d["best_lines"] = best_lines(d["text"], terms)
        out.append(d)
    return out


def best_lines(text: str, terms: list[str], n: int = 3) -> list[str]:
    scored = []
    for ln in text.splitlines():
        t = set(bigrams(ln))
        s = sum(1 for x in terms if x in t)
        if s:
            scored.append((s, ln.strip()))
    scored.sort(key=lambda x: -x[0])
    return [l for _, l in scored[:n]]


# ------------------------------------------------------------------ 질문 분석
def detect_companies(q: str) -> list[str]:
    ql = q.lower()
    return [cid for cid, al in COMPANY_ALIASES.items() if any(a.lower() in ql for a in al)]


SHORT_ALIASES = {"한국사": "한국사능력검정시험", "컴활": "컴퓨터활용능력"}


def detect_certs(q: str, rule: dict) -> list[dict]:
    for short, full in SHORT_ALIASES.items():
        if short in q and full not in q:
            q = q.replace(short, full)
    qn = engine._norm(q)
    found = []
    for c in rule.get("cert_catalog", []):
        names = [c["name"]] + c.get("aliases", [])
        for nm in names:
            if engine._norm(nm) and engine._norm(nm) in qn:
                lv = (c.get("levels") or [""])[0]
                if c.get("levels") and not any(engine._norm(l) in qn for l in c["levels"]):
                    # 등급 미지정 시 첫 등급을 가정하지 않고 등급 언급이 없으면 상위 등급 하나만 후보로
                    pass
                found.append({"name": c["name"], "grade": lv if any(engine._norm(l) in qn for l in c.get("levels", [])) else (c.get("levels") or [""])[0]})
                break
    # 목록 외 자격증 언급 (가산대상 목록에 없음을 보여주기 위해)
    for extra in ["SQLD", "SQLP", "TOEIC", "토익", "OPIc", "TEPS", "정보처리기사"]:
        if engine._norm(extra) in qn and not any(engine._norm(extra) in engine._norm(f["name"]) for f in found):
            found.append({"name": extra, "grade": ""})
    # 이름 중복 제거
    seen, uniq = set(), []
    for f in found:
        k = (f["name"], f["grade"])
        if k not in seen:
            seen.add(k); uniq.append(f)
    return uniq


def is_recommend_question(q: str) -> bool:
    return bool(re.search(r"(무슨|어떤|뭘|무엇|뭐).{0,12}(자격증|기사|산업기사|자격)|(자격증|기사).{0,10}(추천|더 따|따면|따야|취득하면|따는 게|따는게)|추천.{0,6}자격증", q))


def recommend_certs(rule: dict, profile: dict, top: int = 6, q: str = "") -> dict:
    """현재 공고·직렬·보유 자격증 기준으로 후보별 '실제 추가 가점'을 엔진으로 계산(가점 시뮬레이터와 동일 엔진)."""
    from .bonus import in_scope
    from .screening import document_score
    sp = rule.get("score_policy") or {}
    if not sp.get("calculation_verified") or not rule.get("cert_catalog"):
        return {"answer": {"summary": f"{rule['company']} {rule['job_category']}의 자격증 가점 규칙이 아직 검증되지 않아 추천 점수를 계산할 수 없어요.",
                           "next": ["공식 공고의 자격증 가산점 표(인정 목록·등급별 점수)", "그룹별·전체 인정 개수와 상한", "자격증 인정 기준일(취득 기준)", "직렬별 적용 범위"]},
                "citations": [], "items": []}
    base = engine.calculate_bonus(rule, profile)
    ds0 = document_score(rule, profile)
    owned_kinds = {r["kind"] for r in base["rows"] if r.get("kind") and r["status"] not in ("가산대상 목록에 없음",)}
    job = rule.get("job")
    seen, items = set(), []
    for c in rule["cert_catalog"]:
        key = (c["name"], tuple(c.get("levels", [])))
        if key in seen or not c.get("evidence_verified", True):
            continue
        seen.add(key)
        if not in_scope(c, job):
            continue
        cand = {"name": c["name"], "grade": (c.get("levels") or [""])[0]}
        new = engine.calculate_bonus(rule, profile, [cand])
        gain = round(new["total_confirmed"] - base["total_confirmed"], 2)
        row = next((r for r in new["rows"] if r.get("hypothetical")), {})
        if gain > 0:
            reason = f"{row.get('category')} {row.get('grade')} {row.get('points')}점 · 현재 조합에 추가 인정"
        elif c["kind"] in owned_kinds:
            reason = "이미 같은 종별 자격증을 보유(동일 종별 최고 1개만 인정)"
        else:
            reason = row.get("reason") or row.get("status") or "추가 인정 없음"
        doc_gain = None
        if ds0.get("available"):
            doc_gain = round(gain * ds0["weights"]["multiplier"], 2)
        items.append({"cert": (c["name"] + (" " + cand["grade"] if cand["grade"] else "")).strip(), "category": c["category"], "grade": c["grade"],
                      "gain": gain, "doc_gain": doc_gain, "reason": reason, "status": "추천" if gain > 0 else "+0점",
                      "evidence": {"doc": c["doc"], "page": c["page"], "quote": c["quote"], "verified": c.get("evidence_verified", False)}})
    if "기사" in q and "기술사" not in q:
        items = [i for i in items if i["grade"] == "기사"]
    items.sort(key=lambda x: (-x["gain"], 0 if x["cert"].endswith("기사") else 1, x["cert"]))
    good = [i for i in items if i["gain"] > 0][:top]
    zero = [i for i in items if i["gain"] <= 0 and ("기사" in i["cert"])][:3]
    lines = []
    for i in good:
        doc = f" (서류 +{i['doc_gain']}점)" if i["doc_gain"] is not None else ""
        lines.append(f"{i['cert']} / +{i['gain']}점{doc} / {i['reason']}")
    lines += [f"{i['cert']} / +0점 / {i['reason']}" for i in zero]
    unit = "서류 점수에는 자격증 점수×" + str(ds0["weights"]["multiplier"]) + "로 반영" if ds0.get("available") else "필기 우대가점"
    summary = (f"현재 공고({rule['recruitment_title']}) · {rule['job_category']} · 보유 자격증 기준, 추가로 따면 점수가 오르는 자격증이에요. "
               f"현재 확정 {base['total_confirmed']}점, {unit}. 같은 그룹 개수 제한·동일 종별·상한이 반영된 실제 증가분입니다.")
    if not good:
        summary = "현재 보유 자격증 조합에서는 추가로 점수가 오르는 자격증이 없어요(그룹 제한·상한 도달)."
    notes = []
    if rule.get("cert_catalog_note"):
        notes.append(rule["cert_catalog_note"])
    notes.append("시험 일정·합격 발표일이 공고의 자격증 인정 기준일 안에 들어오는지는 별도 확인이 필요해요(로드맵 → 공고 일정 계획).")
    return {"answer": {"summary": summary, "lines": lines, "notes": notes}, "citations": [i["evidence"] for i in good[:3]], "items": items}


def is_rule_question(q: str) -> bool:
    return bool(re.search(r"가점|가산|중복|몇 ?점|인정", q))


def ask(conn, q: str, rule: dict, profile: dict, k: int = 4, min_coverage: float = 0.6) -> dict:
    scope = {"company": rule["company"], "job_category": rule["job_category"], "recruitment_id": rule["id"],
             "recruitment_title": rule["recruitment_title"], "published_at": rule.get("published_at"),
             "official_url": rule["official_source"]["url"], "status_note": rule.get("status_note")}
    hits = search(conn, q, rule["id"], k)
    result = {"scope": scope, "retrieved": [_public(h) for h in hits], "mode": None, "answer": None, "citations": [], "abstained": False}

    # 0) 자격증 추천 질문 → 가점 시뮬레이터(규칙 엔진) 연결. 문서 검색 보류 판단보다 먼저 처리
    if is_recommend_question(q):
        rec = recommend_certs(rule, profile, q=q)
        result.update(mode="simulator", answer=rec["answer"], citations=rec["citations"], recommendations=rec.get("items"))
        return result

    # 1) 규칙 엔진 경로
    if is_rule_question(q) and rule.get("score_policy"):
        certs = detect_certs(q, rule)
        mine = bool(re.search(r"내 |내가|보유", q))
        if certs or mine:
            prof = dict(profile, certificates=[] if certs and not mine else profile.get("certificates", []))
            b = engine.calculate_bonus(rule, prof, certs if certs else None)
            if b.get("available"):
                lines, cits = [], []
                for row in b["rows"]:
                    pts = f"{row['points']}점" if row.get("points") is not None else "-"
                    lines.append(f"{row['cert']}: {row['status']} ({pts})" + (f" - {row['note']}" if row.get("note") else ""))
                    if row.get("evidence"):
                        cits.append(row["evidence"])
                for e in b["policy_evidence"][:3]:
                    cits.append({"doc": e["doc"], "page": e["page"], "quote": e["quote"], "verified": e.get("evidence_verified", False)})
                summary = f"규칙 엔진 계산 결과: 확정 {b['total_confirmed']}점 / 해석 필요 포함 {b['total_with_interpretation']}점 (필기 우대가점, 일반 자격증 최대 3개·12점, 동일 종별 최고 1개)"
                result.update(mode="rule_engine", answer={"summary": summary, "lines": lines,
                              "notes": [n["text"] for n in b["interpretation_notes"]]}, citations=_dedupe(cits))
                return result

    # 1-b) 채용 인원: 표 셀이 흩어져 LLM 인용이 불안정하므로 검증된 규칙 값으로 답변
    if re.search(r"채용\s?인원|모집\s?인원|몇\s?명", q) and rule.get("analysis_supported", True) and rule.get("headcount") and rule.get("headcount_evidence"):
        e = rule["headcount_evidence"]
        loc = f"{rule.get('location')} " if rule.get("location") else ""
        result.update(mode="rule_engine", answer={"summary": f"{rule['job_category']} 채용 인원은 {loc}{rule['headcount']}명입니다 (검증된 공고 규칙 값).",
                      "lines": [f"공고문 1쪽 채용 인원표 '{rule['job_category']}' 행 기준"]},
                      citations=[{"doc": e["doc"], "page": e["page"], "quote": e["quote"], "verified": e.get("evidence_verified", False)}])
        return result

    # 2) 검색 충분성 판단
    if not hits or hits[0]["coverage"] < min_coverage:
        result.update(mode="abstain", abstained=True, answer={"summary": NO_ANSWER,
                      "next": ["공식 채용 FAQ", "자격증 인정 기준표", "기관 채용 담당 부서 문의", "추후 정정 공고"]})
        return result

    # 3) LLM 답변 (키가 있을 때만)
    from . import llm
    if llm.provider():
        return _llm_answer(q, rule, hits, result)

    result.update(mode="retrieval_only", answer={"summary": "AI 답변 생성 미사용(LLM API 키 미설정). 질문과 관련된 공식 원문 검색 결과입니다.",
                  "lines": hits[0]["best_lines"]},
                  citations=[{"doc": h["doc_key"], "page": h["page_number"], "quote": h["best_lines"][0] if h["best_lines"] else "", "verified": True}
                             for h in hits[:3] if h["best_lines"]])
    return result


def _public(h: dict) -> dict:
    return {k: h[k] for k in ("id", "recruitment_id", "doc_key", "document_title", "document_type", "page_number", "score", "coverage", "best_lines", "text", "version_id", "attachment_url")}


def _dedupe(cits):
    seen, out = set(), []
    for c in cits:
        k = (c["doc"], c["page"], c["quote"])
        if k not in seen:
            seen.add(k); out.append(c)
    return out


PROMPT_PATH = Path(__file__).resolve().parents[1] / "prompts" / "rag_chat.md"


OTHER_SCOPE = ["지역인재", "지방대학", "거주지", "보훈", "장애인", "제한경쟁", "고졸", "열차승무", "차량", "토목", "건축", "전기통신", "관제", "무선제어", "운전", "문산"]

_CHARMAP = str.maketrans({"’": "'", "‘": "'", "“": '"', "”": '"', "∼": "~", "～": "~", "〜": "~", "ㆍ": "·", "•": "·", "－": "-", "–": "-", "—": "-"})


def quote_in_chunk(quote: str, chunk: str) -> bool:
    """엄격한 원문 존재 검증: 공백 제거 + 따옴표·물결표 등 표기 통일만 허용.
    말줄임(…, ...)으로 나뉜 인용은 각 조각(4자 이상)이 모두 원문에 있어야 통과."""
    src = normalize(chunk.translate(_CHARMAP))
    parts = [p for p in re.split(r"…|\.\.\.", (quote or "").translate(_CHARMAP)) if len(normalize(p)) >= 4]
    return bool(parts) and all(normalize(p) in src for p in parts)


def _verify(data, by_id):
    cits, ok = [], True
    for c in data.get("citations", []) or []:
        try:
            h = by_id.get(int(c.get("chunk_id")))
        except (TypeError, ValueError):
            h = None
        verified = bool(h) and quote_in_chunk(c.get("quote", ""), h["text"])
        ok &= verified
        if h:
            cits.append({"doc": h["doc_key"], "page": h["page_number"], "quote": c.get("quote", ""), "verified": verified})
        else:
            ok = False
    return cits, ok


def _llm_answer(q, rule, hits, result):
    from . import llm
    ctx = "\n".join(f"<chunk id=\"{h['id']}\" doc=\"{h['doc_key']}\" page=\"{h['page_number']}\">\n{h['text']}\n</chunk>" for h in hits)
    status = " (접수 마감된 과거 공고)" if rule.get("status_note") else ""
    user = (f"분석 대상: {rule['company']} / {rule['job_category']} / {rule['recruitment_title']} ({rule.get('published_at')}){status}\n"
            f"<search_results>\n{ctx}\n</search_results>\n\n질문: {q}")
    system = PROMPT_PATH.read_text(encoding="utf-8")
    by_id = {h["id"]: h for h in hits}
    result["model"] = llm.model_name()
    result["attempts"] = 0
    cits, ok, data = [], False, {}
    for attempt in range(2):  # 인용 검증 실패 시 1회만 재요청(검증 기준은 완화하지 않음)
        prompt = user if attempt == 0 else (
            user + "\n\n[재요청] 직전 답변의 인용문 일부가 chunk 원문과 글자 단위로 일치하지 않았습니다. "
                   "quote 는 chunk 텍스트에서 연속된 한 줄을 그대로 복사하세요(요약·말줄임·표 행 합치기 금지).")
        try:
            data = llm.complete_json(system, prompt)
        except llm.LLMError as e:
            result.update(mode="abstain", abstained=True, answer={"summary": f"AI 호출 또는 응답 형식 오류로 답변을 보류합니다 ({e})."})
            return result
        result["attempts"] = attempt + 1
        cits, ok = _verify(data, by_id)
        if data.get("unanswerable") or (cits and ok):
            break
    # 범위 가드(코드): 인용문이 질문하지 않은 다른 전형·직렬에 관한 문장이면 보류
    if not data.get("unanswerable") and cits and ok:
        foreign = sorted({t for c in cits for t in OTHER_SCOPE if t in c["quote"] and t not in q and t not in rule.get("job_category", "")})
        if foreign:
            result.update(mode="abstain", abstained=True, citations=cits,
                          answer={"summary": f"인용된 원문이 다른 전형·직렬({', '.join(foreign)})에 관한 내용이라 이 직렬의 근거로 쓰지 않고 답변을 보류합니다. " + NO_ANSWER,
                                  "next": ["공식 공고문 지원자격 표 직접 확인", "기관 채용 담당 부서 문의"]})
            result["scope_guard"] = foreign
            return result
    # 인용문 '존재'만으로는 부족: 인용문이 답변의 핵심 주장을 직접 뒷받침하는지 별도 판정
    if not data.get("unanswerable") and cits and ok:
        judge_sys = ("당신은 근거 검증기다. 주어진 인용문들만 읽고, 답변의 핵심 주장이 인용문에 의해 '직접' 뒷받침되는지 판정한다. "
                     "인용문이 다른 대상(다른 직렬·다른 전형·지역인재 등)에 관한 내용이거나 추론이 필요하면 supported=false. "
                     'JSON만 출력: {"supported": boolean, "reason": string}')
        judge_user = f"질문: {q}\n답변: {data.get('answer', '')}\n인용문:\n" + "\n".join(f"- {c['quote']}" for c in cits)
        try:
            j = llm.complete_json(judge_sys, judge_user, max_tokens=300)
            result["support_check"] = {"supported": bool(j.get("supported")), "reason": j.get("reason", "")}
        except llm.LLMError as e:
            result["support_check"] = {"supported": False, "reason": f"판정 실패: {e}"}
        if not result["support_check"]["supported"]:
            result.update(mode="abstain", abstained=True, citations=cits,
                          answer={"summary": "검색된 인용문이 답변을 직접 뒷받침하지 않아 답변을 보류합니다. " + NO_ANSWER,
                                  "notes": [f"검증기 판단: {result['support_check']['reason']}"],
                                  "next": ["공식 공고문 지원자격 표 직접 확인", "기관 채용 담당 부서 문의"]})
            return result
    if data.get("unanswerable") or not cits or not ok:
        result.update(mode="abstain", abstained=True, answer={"summary": NO_ANSWER if data.get("unanswerable") or not cits else "AI 답변의 인용문이 검색된 공식 원문과 일치하지 않아 답변을 보류합니다."}, citations=cits)
        return result
    result.update(mode="llm_grounded", answer={"summary": data.get("answer", ""), "lines": data.get("details", []), "notes": data.get("unknown", [])}, citations=cits)
    return result
