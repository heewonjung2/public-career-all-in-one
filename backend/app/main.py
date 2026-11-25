"""공기업 All-in-One - FastAPI 백엔드."""
from __future__ import annotations

import json
import re
from datetime import date, datetime, timedelta
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from .database import DATA_DIR, ROOT, connect, dumps, init_db, loads
from .services import ai_analyzer, document_parser, engine, rag, roadmap, screening, source_verifier, strategy, versions
from .services.evidence_validator import page_text, validate_rulefile

app = FastAPI(title="공기업 All-in-One API", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# ---- 유료 AI 호출 경로 사용량 제한(공개 배포 대비): IP당·전체 시간당 한도 ----
import os as _os  # noqa: E402
import time as _time  # noqa: E402
from collections import defaultdict, deque  # noqa: E402

from fastapi import Request  # noqa: E402
from fastapi.responses import JSONResponse  # noqa: E402

AI_PATHS = ("/api/chat/ask", "/api/search/postings", "/api/postings/analyze")
AI_LIMIT_IP = int(_os.environ.get("AI_LIMIT_PER_IP_HOUR", "20"))
AI_LIMIT_ALL = int(_os.environ.get("AI_LIMIT_TOTAL_HOUR", "200"))
_hits: dict[str, deque] = defaultdict(deque)


@app.middleware("http")
async def ai_rate_limit(request: Request, call_next):
    path = request.url.path
    if request.method == "POST" and (path in AI_PATHS or path.endswith("/ai-extract")):
        now_ = _time.time()
        ip = (request.headers.get("x-forwarded-for") or (request.client.host if request.client else "?")).split(",")[0].strip()
        for key, limit in ((ip, AI_LIMIT_IP), ("__all__", AI_LIMIT_ALL)):
            q = _hits[key]
            while q and now_ - q[0] > 3600:
                q.popleft()
            if len(q) >= limit:
                return JSONResponse({"detail": "AI 기능 사용량 한도(시간당)를 초과했습니다. 잠시 후 다시 시도해 주세요."}, status_code=429)
        _hits[ip].append(now_)
        _hits["__all__"].append(now_)
    return await call_next(request)


@app.get("/api/meta")
def meta():
    return {"public_demo": _os.environ.get("PUBLIC_DEMO") == "1", "ai_enabled": ai_analyzer.ai_available(),
            "notice": "공개 시연 서버입니다. 입력한 스펙은 다른 방문자와 공유될 수 있으니 실제 개인정보를 입력하지 마세요." if _os.environ.get("PUBLIC_DEMO") == "1" else None}

COMPANIES = [
    {"id": "korail", "name": "한국철도공사", "short": "KORAIL", "official_site": "https://www.korail.com",
     "recruit_info": "JOB-ALIO 공공기관 채용정보시스템", "allowed_domains": source_verifier.allowed_domains("korail"),
     "data_status": "공식 공고 검증 완료(2026 상반기 사무영업 IT)"},
    {"id": "kepco", "name": "한국전력공사", "short": "KEPCO", "official_site": "https://home.kepco.co.kr",
     "recruit_info": "JOB-ALIO / 공식 채용 홈페이지", "allowed_domains": source_verifier.allowed_domains("kepco"),
     "data_status": "공식 공고 미등록 - 분석 데이터 없음"},
    {"id": "seoulmetro", "name": "서울교통공사", "short": "SEOUL METRO", "official_site": "http://www.seoulmetro.co.kr",
     "recruit_info": "공식 채용 홈페이지(지방공기업)", "allowed_domains": source_verifier.allowed_domains("seoulmetro"),
     "data_status": "공식 공고 미등록 - 분석 데이터 없음"},
]

RULES: dict[str, dict] = {}
VALIDATION: dict[str, dict] = {}


def now() -> str:
    return datetime.now().isoformat(timespec="seconds")


def load_rules() -> None:
    for f in sorted((DATA_DIR / "recruitment_rules").glob("korail_20*.json")):
        rule = json.loads(f.read_text(encoding="utf-8"))
        VALIDATION[rule["id"]] = validate_rulefile(rule, DATA_DIR)
        if VALIDATION[rule["id"]]["failed"]:
            rule["official_source"]["verification_status"] = "partially_verified"
        RULES[rule["id"]] = rule


@app.on_event("startup")
def startup() -> None:
    init_db()
    load_rules()
    _seed_versions()
    _rebuild_index()
    with connect() as c:
        if not c.execute("SELECT 1 FROM profile WHERE id=1").fetchone():
            demo = json.loads((DATA_DIR / "demo" / "demo_profile.json").read_text(encoding="utf-8"))
            c.execute("INSERT INTO profile VALUES (1, ?, ?)", (dumps(demo), now()))
        if not c.execute("SELECT 1 FROM notification_settings WHERE id=1").fetchone():
            c.execute("INSERT INTO notification_settings VALUES (1, ?)",
                      (dumps({"email": "", "consent": False, "times": ["09:00", "18:00"], "timezone": "Asia/Seoul", "companies": ["korail"]}),))


LANG_FIELDS = ("exam_type", "score", "grade", "exam_date", "result_date", "original_expiry_date",
               "preregistration_status", "preregistration_date", "preregistration_expiry_date", "verification_status")


def migrate_profile(p: dict) -> dict:
    """구 스키마 → 신 스키마. 의미가 불명확한 날짜는 변환하지 않고 legacy_date 로 보존 + 확인 필요 표시."""
    langs = []
    for l in p.get("languages", []) or []:
        n = {k: l.get(k, "") for k in LANG_FIELDS}
        n["test"] = l.get("test") or l.get("exam_type") or ""
        n["exam_type"] = n["exam_type"] or n["test"]
        n["score"] = l.get("score", "")
        n["preregistration_status"] = l.get("preregistration_status") or "미등록"
        if l.get("taken_at") and not l.get("exam_date"):
            n["legacy_date"] = l["taken_at"]
            n["verification_status"] = "날짜 의미 확인 필요(응시일인지 만료일인지 불명확)"
        elif l.get("legacy_date"):
            n["legacy_date"] = l["legacy_date"]
        n["verification_status"] = n.get("verification_status") or "사용자 입력"
        langs.append(n)
    p["languages"] = langs
    certs = []
    for c in p.get("certificates", []) or []:
        c = dict(c)
        c.setdefault("issuer", "")
        c.setdefault("has_validity", bool(c.get("expires_at")))
        c.setdefault("renewal_required", False)
        certs.append(c)
    p["certificates"] = certs
    p["schema_version"] = 2
    return p


def get_profile() -> dict:
    with connect() as c:
        row = c.execute("SELECT data, updated_at FROM profile WHERE id=1").fetchone()
    p = migrate_profile(loads(row["data"]))
    p["_updated_at"] = row["updated_at"]
    return p


def _target_year(p: dict) -> int | None:
    m = re.search(r"(20\d\d)", str(p.get("target_year") or p.get("target_period") or ""))
    return int(m.group(1)) if m else None


def active_rid(p: dict | None = None) -> str | None:
    """모든 기능이 공유하는 '현재 분석 기준(공고 버전)'. 프로필에 저장된 값 → 목표 연도 기본값 → 첫 분석 가능 공고."""
    p = p or get_profile()
    rid = p.get("active_recruitment_id")
    if rid in RULES and RULES[rid].get("analysis_supported", True):
        return rid
    ty = _target_year(p)
    cands = sorted([r for r in RULES.values() if r.get("analysis_supported", True)],
                   key=lambda r: (r.get("target_year", r.get("recruitment_year")) or 0, r.get("published_at") or ""))
    same = [r for r in cands if r.get("target_year", r.get("recruitment_year")) == ty]
    return (same or cands or [{}])[-1].get("id")


def summary(rule: dict) -> dict:
    keys = ["id", "company_id", "company", "recruitment_title", "notice_no", "recruitment_year", "half", "recruitment_type",
            "job_category", "location", "headcount", "published_at", "status_note", "official_source", "documents"]
    s = {k: rule.get(k) for k in keys}
    s["analysis_supported"] = rule.get("analysis_supported", True)
    s["evidence_check"] = {k: v for k, v in VALIDATION.get(rule["id"], {}).items() if k != "failed"}
    s["evidence_failed"] = VALIDATION.get(rule["id"], {}).get("failed", [])
    sched = rule.get("schedule", [])
    start = next((x["date"] for x in sched if x["type"] == "접수시작"), None)
    end = next((x["date"] for x in sched if x["type"] == "접수마감"), None)
    s["application_period"] = {"start": start, "end": end}
    today = date.today().isoformat()
    s["application_status"] = "접수 예정" if start and today < start else ("접수 중" if end and today <= end else "마감")
    return s


# ------------------------------------------------------------------ 기본
@app.get("/api/health")
def health():
    return {"status": "ok", "ai_enabled": ai_analyzer.ai_available(), "rules_loaded": list(RULES),
            "evidence": VALIDATION, "time": now()}


@app.get("/api/profile")
def read_profile():
    return get_profile()


@app.put("/api/profile")
def save_profile(profile: dict):
    profile.pop("_updated_at", None)
    if not isinstance(profile.get("certificates", []), list):
        raise HTTPException(400, "certificates는 목록이어야 합니다")
    with connect() as c:
        c.execute("UPDATE profile SET data=?, updated_at=? WHERE id=1", (dumps(profile), now()))
    return get_profile()


@app.post("/api/profile/reset-demo")
def reset_demo():
    demo = json.loads((DATA_DIR / "demo" / "demo_profile.json").read_text(encoding="utf-8"))
    return save_profile(demo)


@app.get("/api/companies")
def companies():
    out = []
    for c in COMPANIES:
        recs = [summary(r) for r in RULES.values() if r["company_id"] == c["id"]]
        out.append(dict(c, recruitments=len(recs)))
    return out


# ------------------------------------------------------------------ 채용공고
@app.get("/api/recruitments")
def recruitments():
    items = [summary(r) for r in RULES.values()]
    with connect() as c:
        for row in c.execute("SELECT * FROM documents ORDER BY id DESC"):
            items.append({
                "id": f"doc-{row['id']}", "company_id": None, "company": "사용자 등록 문서",
                "recruitment_title": row["file_name"], "published_at": None, "job_category": None,
                "official_source": {"url": row["source_url"], "verification_status": row["verification_status"],
                                    "checked_at": row["checked_at"], "site": row["verification_note"]},
                "analysis_supported": False, "application_status": "확인 필요", "user_document": True,
                "status_note": row["verification_note"],
            })
    return items


@app.get("/api/recruitments/{rid}")
def recruitment_detail(rid: str):
    if rid not in RULES:
        raise HTTPException(404, "공고 없음")
    r = RULES[rid]
    return dict(summary(r), written_exam=r.get("written_exam"), screening=r.get("screening"),
                schedule=r.get("schedule", []), missing_information=r.get("missing_information", []),
                notices=r.get("notices", []), final_score=r.get("final_score"), competition=r.get("competition"))


@app.get("/api/evidence/{rid}/{doc}/{page}")
def evidence_page(rid: str, doc: str, page: int):
    if rid not in RULES:
        raise HTTPException(404, "공고 없음")
    text = page_text(RULES[rid], DATA_DIR, doc, page)
    if text is None:
        raise HTTPException(404, "페이지 없음")
    d = RULES[rid]["documents"][doc]
    return {"doc": doc, "page": page, "text": text, "document_name": d["name"], "document_url": d["url"]}


@app.get("/api/documents/{rid}/{doc}/file")
def document_file(rid: str, doc: str):
    if rid not in RULES or doc not in RULES[rid]["documents"]:
        raise HTTPException(404)
    return FileResponse(DATA_DIR / RULES[rid]["documents"][doc]["local_file"], media_type="application/pdf")


class ImportReq(BaseModel):
    url: str
    company_id: str | None = None


def _store_document(content: bytes, name: str, source_url: str | None, final_url: str | None, status: str, note: str):
    h = document_parser.sha256(content)
    with connect() as c:
        dup = c.execute("SELECT id FROM documents WHERE sha256=?", (h,)).fetchone()
        if dup:
            return dup["id"], True, None
    pages: list[str] = []
    if content[:4] == b"%PDF":
        try:
            pages = document_parser.extract_pages(content)
        except Exception:  # noqa: BLE001 - 손상 PDF
            pages = []
    with connect() as c:
        cur = c.execute(
            "INSERT INTO documents (file_name, source_url, final_url, sha256, page_count, pages, verification_status, verification_note, checked_at) VALUES (?,?,?,?,?,?,?,?,?)",
            (name, source_url, final_url, h, len(pages), dumps(pages), status, note, now()))
        return cur.lastrowid, False, pages


@app.post("/api/source/verify")
def verify_source(req: ImportReq):
    v = source_verifier.verify_url(req.url, req.company_id)
    return {"ok": v.ok, "reason": v.reason, "host": v.host}


@app.post("/api/recruitments/import")
def import_url(req: ImportReq):
    try:
        content, final_url, ctype = source_verifier.fetch_official(req.url, req.company_id)
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:  # noqa: BLE001
        raise HTTPException(502, f"공식 사이트 접속 실패: {e.__class__.__name__}")
    is_pdf = content[:4] == b"%PDF"
    name = final_url.rsplit("/", 1)[-1][:120] or "document"
    note = "공식 도메인에서 수집(규칙 미검증)" if is_pdf else f"공식 도메인 HTML 페이지(첨부 PDF URL을 등록해야 분석 가능, type={ctype[:40]})"
    doc_id, dup, _ = _store_document(content, name, req.url, final_url, "official_source_unreviewed", note)
    return {"document_id": doc_id, "duplicate": dup, "final_url": final_url, "is_pdf": is_pdf, "note": note}


@app.post("/api/documents/parse")
async def upload_pdf(file: UploadFile = File(...), source_url: str = Form("")):
    content = await file.read()
    if len(content) > source_verifier.MAX_DOWNLOAD_BYTES:
        raise HTTPException(400, "파일 크기 제한(30MB) 초과")
    if content[:4] != b"%PDF":
        raise HTTPException(400, "PDF 파일만 지원합니다 (HWP/HWPX는 구현 예정)")
    note = "사용자 업로드 자료 · 공식 출처 미검증"
    doc_id, dup, _ = _store_document(content, file.filename or "upload.pdf", source_url or None, None, "user_upload_unverified", note)
    return document_view(doc_id) | {"duplicate": dup}


@app.get("/api/documents/{doc_id:int}")
def document_view(doc_id: int):
    with connect() as c:
        row = c.execute("SELECT * FROM documents WHERE id=?", (doc_id,)).fetchone()
    if not row:
        raise HTTPException(404)
    pages = loads(row["pages"]) or []
    return {"id": row["id"], "file_name": row["file_name"], "source_url": row["source_url"], "final_url": row["final_url"],
            "sha256": row["sha256"], "page_count": row["page_count"], "verification_status": row["verification_status"],
            "verification_note": row["verification_note"], "checked_at": row["checked_at"],
            "text_extractable": document_parser.is_text_pdf(pages),
            "evidence_candidates": document_parser.locate_evidence(pages) if pages else {},
            "ai_enabled": ai_analyzer.ai_available()}


@app.post("/api/documents/{doc_id:int}/ai-extract")
def ai_extract(doc_id: int, job_category: str | None = None):
    with connect() as c:
        row = c.execute("SELECT pages FROM documents WHERE id=?", (doc_id,)).fetchone()
    if not row:
        raise HTTPException(404)
    pages = loads(row["pages"]) or []
    if not document_parser.is_text_pdf(pages):
        return {"status": "unsupported", "message": "텍스트 추출이 불가능한 문서(스캔 PDF 등) - OCR 구현 예정"}
    return ai_analyzer.extract_with_ai(pages, job_category)


# ------------------------------------------------------------------ 분석
class AnalysisReq(BaseModel):
    recruitment_id: str | None = None


def _analysis(rid: str, extra: list[dict] | None = None) -> dict:
    if rid not in RULES:
        raise HTTPException(404, "공고 없음")
    rule = RULES[rid]
    s = summary(rule)
    if not s["analysis_supported"]:
        return {"recruitment": s, "supported": False, "message": rule.get("status_note")}
    p = get_profile()
    elig = engine.check_eligibility(rule, p)
    bonus = engine.calculate_bonus(rule, p, extra)
    gap = engine.exam_gap(rule, p)
    met = [i["item"] for i in elig["items"] if i["status"] == engine.OK]
    todo = [f"{i['item']}: {i['reason']}" for i in elig["items"] if i["status"] in (engine.CHECK, engine.FAIL)]
    not_found = rule.get("missing_information", [])
    comp = rule.get("competition", {})
    hc = rule.get("headcount")
    ratio = (rule.get("screening") or {}).get("written_pass_ratio")
    return {
        "recruitment": s, "supported": True, "profile_updated_at": p.get("_updated_at"),
        "eligibility": elig, "bonus": bonus, "exam": gap,
        "met_conditions": met, "todo_conditions": todo, "not_found": not_found,
        "competition": {"judgement": "데이터 부족으로 판단 불가", "note": comp.get("note"),
                         "derived": (f"공고 기준 필기 합격 인원 = 채용인원 {hc}명 × {ratio}배수 = 약 {hc * ratio}명" if hc and ratio else None),
                         "criteria": "안정권/적정권/도전권은 동일 기준(직렬·지역·유형·점수산정 방식)의 공식 합격선이 확보된 경우에만 산출"},
        "final_score": rule.get("final_score"), "screening": rule.get("screening"), "notices": rule.get("notices", []),
        "document_screening": screening.document_score(rule, p),
        "rule_version": {"type": rule.get("rule_version_type", "확정 채용공고"), "target_year": rule.get("target_year", rule.get("recruitment_year")),
                         "changes_vs_2026": rule.get("changes_vs_2026"), "written_exam_note": rule.get("written_exam_note"),
                         "cert_catalog_note": rule.get("cert_catalog_note")},
        "analyzed_at": now(),
    }


@app.post("/api/analysis")
def analysis(req: AnalysisReq):
    return _analysis(req.recruitment_id or active_rid())


class SearchReq(BaseModel):
    q: str


class AnalyzeReq(BaseModel):
    url: str


@app.post("/api/search/postings")
def search_postings(req: SearchReq):
    from .services import posting_search
    try:
        with connect() as c:
            return posting_search.search(c, req.q)
    except ValueError as e:
        raise HTTPException(400, str(e))
    except RuntimeError as e:
        return {"query": req.q, "results": [], "status": "검색 실패", "message": str(e)}


@app.post("/api/postings/analyze")
def analyze_posting(req: AnalyzeReq):
    from .services import posting_search
    v = source_verifier.verify_url(req.url, None)
    if not v.ok or not any(source_verifier._host_matches(v.host, d) for d in posting_search.SEARCH_DOMAINS):
        raise HTTPException(400, f"공식 채용정보 사이트 URL이 아닙니다: {v.reason}")
    try:
        with connect() as c:
            return posting_search.analyze(c, req.url, _store_document)
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:  # noqa: BLE001
        return {"url": req.url, "status": "분석 실패", "message": f"{e.__class__.__name__}: {str(e)[:150]}", "stages": []}


@app.get("/api/institutions")
def institutions_search(q: str = "", group: str | None = None, limit: int = 20):
    from .services import institutions
    return institutions.search(q, group, 400 if not q.strip() else limit)


@app.get("/api/plan")
def plan(recruitment_id: str | None = None):
    from .services import planning
    rid = recruitment_id or active_rid()
    rule = RULES.get(rid)
    if not rule:
        raise HTTPException(404)
    p = get_profile()
    rec = rag.recommend_certs(rule, p)
    out = planning.build(rule, RULES, p, rec, screening.document_score(rule, p))
    out["recruitment_id"] = rid
    return out


@app.get("/api/stats/position")
def stats_position(recruitment_id: str | None = None):
    from .services import stats
    rid = recruitment_id or active_rid()
    rule = RULES.get(rid)
    if not rule:
        raise HTTPException(404)
    p = get_profile()
    ds = screening.document_score(rule, p)
    if ds.get("available"):
        mine = ds["total_if_language_valid"] if ds.get("total_if_language_valid") is not None else ds["total"]
        res = stats.position(rule, mine, "서류 점수(어학+자격증)", 100)
        res["conditional"] = ds.get("total_if_language_valid") is not None
    else:
        b = engine.calculate_bonus(rule, p)
        res = stats.position(rule, b.get("total_confirmed"), "자격증 가점", (rule.get("score_policy") or {}).get("cert_total_cap") or 20)
        res["conditional"] = False
    res["recruitment_id"] = rid
    return res


@app.get("/api/rule-versions/{company_id}")
def rule_versions(company_id: str):
    """분석 기준(채용 규칙 버전) 목록. 프로필 목표 연도와 같은 버전을 기본값으로 표시."""
    p = get_profile()
    m = re.search(r"(20\d\d)", p.get("target_period") or "")
    target = int(m.group(1)) if m else None
    out = []
    for r in RULES.values():
        if r["company_id"] != company_id or not r.get("analysis_supported", True):
            continue
        out.append({"recruitment_id": r["id"], "title": r["recruitment_title"], "type": r.get("rule_version_type", "확정 채용공고"),
                    "year": r.get("target_year", r.get("recruitment_year")), "published_at": r.get("published_at"), "status_note": r.get("status_note")})
    out.sort(key=lambda x: (x["year"] or 0, x["published_at"] or ""))
    default = active_rid(p)
    return {"versions": out, "default": default, "target_year": target}


class SimReq(BaseModel):
    recruitment_id: str | None = None
    add_certificates: list[dict] = []


@app.post("/api/simulate")
def simulate(req: SimReq):
    rule = RULES.get(req.recruitment_id or active_rid())
    if not rule:
        raise HTTPException(404)
    p = get_profile()
    base = engine.calculate_bonus(rule, p)
    if not base.get("available"):
        return {"available": False, "reason": base.get("reason")}
    new = engine.calculate_bonus(rule, p, req.add_certificates)
    return {"available": True, "current": base, "simulated": new,
            "delta_confirmed": round(new["total_confirmed"] - base["total_confirmed"], 1),
            "delta_with_interpretation": round(new["total_with_interpretation"] - base["total_with_interpretation"], 1)}


@app.get("/api/simulate/options")
@app.get("/api/simulate/options/{rid}")
def sim_options(rid: str | None = None):
    rid = rid or active_rid()
    rule = RULES.get(rid)
    if not rule:
        raise HTTPException(404)
    gp = rule["score_policy"]["grade_points"]
    return [{"name": c["name"], "grade": (c.get("levels") or [""])[0], "category": c["category"], "kind": c["kind"],
             "cert_grade": c["grade"], "points": gp[c["grade"]], "interpretation_needed": c["category"] in rule.get("category_interpretation", {}),
             "page": c["page"]}
            for c in rule.get("cert_catalog", []) if c.get("evidence_verified")]


# ------------------------------------------------------------------ 로드맵
class RoadmapReq(BaseModel):
    recruitment_id: str | None = None
    weeks: int = 8


@app.post("/api/roadmaps")
def create_roadmap(req: RoadmapReq):
    rid_ = req.recruitment_id or active_rid()
    rule = RULES.get(rid_)
    if not rule or not (rule.get("written_exam") or rule.get("written_exam_reference")):
        raise HTTPException(400, "필기시험 정보가 있는 공고에서만 로드맵을 생성할 수 있습니다")
    rm = roadmap.generate_rule_based(rule, get_profile(), max(1, min(req.weeks, 8)))
    if not rule.get("written_exam"):
        rm["label"] = "규칙 기반 추천 · 필기 범위는 과거 공고(2026 상반기) 참고 — 2027 최종 공고 확인 필요"
    with connect() as c:
        cur = c.execute("INSERT INTO roadmaps (recruitment_id, data, created_at) VALUES (?,?,?)",
                        (rid_, dumps(rm), now()))
        rid = cur.lastrowid
        for w in rm["weeks"]:
            for t in w["tasks"]:
                c.execute("INSERT INTO study_tasks (roadmap_id, week, title, category) VALUES (?,?,?,?)",
                          (rid, w["week"], t["title"], t["category"]))
    return get_roadmap()


@app.get("/api/roadmaps")
def get_roadmap():
    with connect() as c:
        row = c.execute("SELECT * FROM roadmaps ORDER BY id DESC LIMIT 1").fetchone()
        if not row:
            return None
        tasks = [dict(t) for t in c.execute("SELECT * FROM study_tasks WHERE roadmap_id=? ORDER BY week, id", (row["id"],))]
    data = loads(row["data"])
    done = sum(t["done"] for t in tasks)
    return {"id": row["id"], "recruitment_id": row["recruitment_id"], "created_at": row["created_at"], **data,
            "tasks": tasks, "progress": {"done": done, "total": len(tasks), "percent": round(done * 100 / len(tasks)) if tasks else 0}}


class TaskPatch(BaseModel):
    done: bool


@app.patch("/api/tasks/{tid}")
def patch_task(tid: int, body: TaskPatch):
    with connect() as c:
        c.execute("UPDATE study_tasks SET done=? WHERE id=?", (1 if body.done else 0, tid))
    return get_roadmap()


# ------------------------------------------------------------------ 학습 자료
@app.get("/api/books")
def books():
    from urllib.parse import quote
    p = get_profile()
    owned = set(p.get("owned_books", []) or [])
    def stores(q: str):
        return [{"store": "교보문고", "url": f"https://search.kyobobook.co.kr/search?keyword={quote(q)}"},
                {"store": "YES24", "url": f"https://www.yes24.com/Product/Search?query={quote(q)}"},
                {"store": "알라딘", "url": f"https://www.aladin.co.kr/search/wsearchresult.aspx?SearchWord={quote(q)}"}]
    recs = [
        {"topic": "한국철도공사 NCS 봉투모의고사", "query": "코레일 NCS 봉투모의고사", "reason": "공식 필기: NCS 30문항(의사소통·수리·문제해결) 70분 시험 대비", "official_link": True},
        {"topic": "NCS 응용수리·자료해석", "query": "NCS 응용수리 자료해석", "reason": "내 스펙에서 수리능력 '취약' 입력", "official_link": False},
        {"topic": "코레일 컴퓨터일반(IT 전공)", "query": "코레일 컴퓨터일반", "reason": "공식 전공 출제범위: 정보보호개론·운영체제·데이터통신·데이터베이스·소프트웨어공학·전자계산기", "official_link": True},
        {"topic": "철도법령", "query": "코레일 철도법령", "reason": "공식 필기 철도법령 10문항", "official_link": True},
        {"topic": "데이터통신·컴퓨터구조", "query": "데이터통신 컴퓨터구조 전공", "reason": "출제범위에 있으나 내 준비 상태 '미시작'", "official_link": False},
    ]
    for r in recs:
        r["stores"] = stores(r["query"])
        r["owned"] = r["topic"] in owned
    free = [
        {"name": "NCS 국가직무능력표준 공식 사이트(직업기초능력 학습자료)", "url": "https://www.ncs.go.kr"},
        {"name": "Q-Net 자격시험 일정·정보", "url": "https://www.q-net.or.kr"},
        {"name": "JOB-ALIO 공공기관 채용정보", "url": "https://job.alio.go.kr"},
        {"name": "국가법령정보센터(철도산업발전기본법 등 원문)", "url": "https://www.law.go.kr"},
    ]
    return {"recommendations": recs, "free": free,
            "price_comparison": {"implemented": False,
                                  "note": "온라인 서점 실시간 가격 API 연동이 되어 있지 않아 가격을 표시하지 않습니다. 서점별 검색 링크로 직접 비교하세요. 추천 교재는 일반 학습 보조 자료이며 공식 시험 범위의 근거가 아닙니다."}}


# ------------------------------------------------------------------ 캘린더
@app.get("/api/calendar/events")
def calendar_events():
    ev = []
    for r in RULES.values():
        for s in r.get("schedule", []):
            ev.append({"recruitment_id": r["id"], "company": r["company"], "title": f"{r['company']} {s['label']}",
                       "type": s["type"], "date": s["date"], "end": s.get("end"), "official_url": r["official_source"]["url"],
                       "evidence": {"doc": s.get("doc"), "page": s.get("page"), "quote": s.get("quote"), "verified": s.get("evidence_verified", False)},
                       "confirmed": True})
    return sorted(ev, key=lambda e: e["date"])


@app.get("/api/calendar/export")
def calendar_export():
    lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//PublicCareerAllInOne//KO", "CALSCALE:GREGORIAN"]
    for i, e in enumerate(calendar_events()):
        if not e["evidence"]["verified"]:
            continue
        d0 = date.fromisoformat(e["date"])
        d1 = date.fromisoformat(e["end"]) if e.get("end") else d0
        lines += ["BEGIN:VEVENT", f"UID:{e['recruitment_id']}-{i}@public-career-all-in-one",
                  f"DTSTAMP:{datetime.utcnow().strftime('%Y%m%dT%H%M%SZ')}",
                  f"DTSTART;VALUE=DATE:{d0.strftime('%Y%m%d')}", f"DTEND;VALUE=DATE:{(d1 + timedelta(days=1)).strftime('%Y%m%d')}",
                  f"SUMMARY:{e['title']}", f"DESCRIPTION:공식 공고 근거 p.{e['evidence']['page']} - {e['official_url']}",
                  f"URL:{e['official_url']}", "END:VEVENT"]
    lines.append("END:VCALENDAR")
    return PlainTextResponse("\r\n".join(lines) + "\r\n", media_type="text/calendar",
                             headers={"Content-Disposition": "attachment; filename=public-career-schedule.ics"})


# ------------------------------------------------------------------ 알림
@app.get("/api/notifications/settings")
def get_notify():
    with connect() as c:
        return loads(c.execute("SELECT data FROM notification_settings WHERE id=1").fetchone()["data"]) | {
            "sending_implemented": False,
            "note": "알림 설정 저장만 구현됨. 정기 공고 수집 스케줄러와 이메일 발송은 구현 예정이며 현재 메일을 보내지 않습니다."}


@app.put("/api/notifications/settings")
def put_notify(body: dict):
    body = {k: body.get(k) for k in ("email", "consent", "times", "timezone", "companies")}
    with connect() as c:
        c.execute("UPDATE notification_settings SET data=? WHERE id=1", (dumps(body),))
    return get_notify()


# ================================================================== 고도화 1: 통합 취업 전략
def _rules_by_company() -> dict[str, dict]:
    """기업별 분석 공고: 현재 분석 기준(active)이 속한 기업은 그 버전, 목표에 공고 ID가 지정되면 그 버전, 그 외 최신 검증 공고."""
    p = get_profile()
    act = active_rid(p)
    out = {}
    for t in p.get("targets", []) or []:
        if t.get("recruitment_id") in RULES:
            out[t["company_id"]] = RULES[t["recruitment_id"]]
    if act:
        out[RULES[act]["company_id"]] = RULES[act]
    for r in RULES.values():
        if r.get("analysis_supported", True) and r["official_source"].get("verification_status") in ("verified",):
            out.setdefault(r["company_id"], r)
    return out


class ActiveReq(BaseModel):
    recruitment_id: str


@app.get("/api/active")
def get_active():
    rid = active_rid()
    r = RULES.get(rid, {})
    return {"recruitment_id": rid, "company_id": r.get("company_id"), "company": r.get("company"), "job_category": r.get("job_category"),
            "title": r.get("recruitment_title"), "type": r.get("rule_version_type", "확정 채용공고"), "year": r.get("target_year", r.get("recruitment_year"))}


@app.put("/api/active")
def set_active(req: ActiveReq):
    if req.recruitment_id not in RULES:
        raise HTTPException(404, "공고 없음")
    p = get_profile()
    p.pop("_updated_at", None)
    p["active_recruitment_id"] = req.recruitment_id
    with connect() as c:
        c.execute("UPDATE profile SET data=?, updated_at=? WHERE id=1", (dumps(p), now()))
    return get_active()


class StrategyReq(BaseModel):
    targets: list[dict] | None = None
    weekly_hours: float = 15
    monthly_budget: float = 0
    weeks: int = 16
    strategy: str = "balanced"
    include_interpretation: bool = False
    cert_overrides: dict = {}


def _targets_match(targets: list[dict]) -> tuple[dict, list[dict]]:
    """사용자 목표 직렬과 공고 직렬이 다르면 기준을 사용하지 않음."""
    rb, rules, extra_missing = _rules_by_company(), {}, []
    for t in targets:
        r = rb.get(t["company_id"])
        if r and (not t.get("job_category") or engine._norm(t["job_category"]) == engine._norm(r["job_category"])):
            rules[t["company_id"]] = r
        elif r:
            extra_missing.append({"company_id": t["company_id"], "job_category": t.get("job_category"),
                                  "reason": f"등록된 공고 직렬({r['job_category']})과 목표 직렬이 달라 기준을 사용하지 않음"})
    return rules, extra_missing


@app.post("/api/strategy/optimize")
def strategy_optimize(req: StrategyReq):
    p = get_profile()
    targets = req.targets or [dict(t, priority=t.get("priority", i + 1)) for i, t in enumerate(p.get("targets", []))]
    rules, mism = _targets_match(targets)
    res = strategy.optimize(rules, p, req.model_dump() | {"targets": targets})
    names = {c["id"]: c["name"] for c in COMPANIES} | {t["company_id"]: t.get("company_name") for t in targets if t.get("company_name")}
    for m in res.get("missing", []) + mism:
        m["reason"] = "공식 공고는 확인 가능하지만 가점 규칙 검토·승인 전이라 가점 분석 준비 중" if str(m["company_id"]).startswith("org:") else m["reason"]
        m["company"] = names.get(m["company_id"], m["company_id"])
    res["missing"] = [m for m in res.get("missing", []) if m["company_id"] not in {x["company_id"] for x in mism}] + mism
    return res


@app.post("/api/strategy/compare")
def strategy_compare(req: StrategyReq):
    out = {}
    for key in strategy.STRATEGIES:
        r = strategy_optimize(req.model_copy(update={"strategy": key}))
        if r.get("available"):
            out[key] = {"label": r["strategy"]["label"], "allocation": r["weekly_allocation"], "certificates": r["certificates"]["chosen"],
                        "cert_value": r["certificates"]["value"]}
    return out


@app.get("/api/strategy/common-subjects")
def strategy_subjects():
    p = get_profile()
    rules, _ = _targets_match(p.get("targets", []))
    return strategy.subject_matrix(list(rules.values()), p)


@app.post("/api/strategy/certificate-efficiency")
def strategy_cert(req: StrategyReq):
    r = strategy_optimize(req)
    return r.get("certificates", {}).get("efficiency", [])


@app.post("/api/strategy/apply-roadmap")
def strategy_apply(req: StrategyReq):
    opt = strategy_optimize(req)
    if not opt.get("available"):
        raise HTTPException(400, "적용할 전략 결과가 없습니다")
    rm = roadmap.from_strategy(opt, max(1, min(req.weeks, 8)))
    rid = opt["companies"][0]["recruitment_id"]
    with connect() as c:
        cur = c.execute("INSERT INTO roadmaps (recruitment_id, data, created_at) VALUES (?,?,?)", (rid, dumps(rm), now()))
        for w in rm["weeks"]:
            for t in w["tasks"]:
                c.execute("INSERT INTO study_tasks (roadmap_id, week, title, category) VALUES (?,?,?,?)", (cur.lastrowid, w["week"], t["title"], t["category"]))
    return get_roadmap()


# ================================================================== 고도화 2: 공식 문서 RAG
class ChatReq(BaseModel):
    question: str
    recruitment_id: str | None = None


def _rebuild_index():
    with connect() as c:
        return rag.build_index(c, {k: v for k, v in RULES.items()}, DATA_DIR, {})


@app.post("/api/documents/index")
def documents_index():
    return _rebuild_index()


@app.get("/api/documents/search")
def documents_search(q: str, recruitment_id: str | None = None, k: int = 5):
    recruitment_id = recruitment_id or active_rid()
    if recruitment_id not in RULES:
        raise HTTPException(404)
    with connect() as c:
        return [rag._public(h) for h in rag.search(c, q, recruitment_id, k)]


@app.get("/api/chat/sources")
def chat_sources():
    return [{"recruitment_id": r["id"], "company": r["company"], "job_category": r["job_category"], "title": r["recruitment_title"],
             "published_at": r.get("published_at"), "status_note": r.get("status_note"), "default": r["id"] == active_rid()}
            for r in RULES.values() if r["official_source"].get("verification_status") == "verified"]


@app.post("/api/chat/ask")
def chat_ask(req: ChatReq):
    import time
    t0 = time.perf_counter()
    q = req.question.strip()[:500]
    if not q:
        raise HTTPException(400, "질문을 입력하세요")
    mentioned = rag.detect_companies(q)
    names = {c["id"]: c["name"] for c in COMPANIES}
    rid = req.recruitment_id or active_rid()
    if not req.recruitment_id and "하반기" in q:
        rid = "korail-2026H2-general"
    p = get_profile()
    # '이번 주 할 일' → 로드맵·준비 계획 연결(AI 미호출)
    if re.search(r"이번\s?주.{0,6}(할\s?일|목표|공부)|오늘\s?할\s?일|뭐\s?해야", q):
        from .services import planning
        rule = RULES[rid]
        rm = get_roadmap()
        lines, cits = [], []
        if rm:
            wk = next((w for w in rm["weeks"] if any(t["week"] == w["week"] and not t["done"] for t in rm["tasks"])), rm["weeks"][-1])
            todo = [t for t in rm["tasks"] if t["week"] == wk["week"]]
            lines = [f"{'☑' if t['done'] else '☐'} {t['title']} ({t['category']})" for t in todo]
            head = f"{wk['week']}주차 · {wk['title']} — {sum(1 for t in todo if t['done'])}/{len(todo)} 완료"
        else:
            head = "아직 학습 로드맵이 없어요. 로드맵 탭에서 8주 로드맵을 만들면 주간 할 일이 생겨요."
        pl = planning.build(rule, RULES, p, rag.recommend_certs(rule, p), screening.document_score(rule, p))
        acts = [f"{a['title']}{' (' + a['due'] + '까지)' if a.get('due') else ''}" for a in pl["actions"][:3]]
        return {"question": q, "answers": [{"scope": {"company": rule["company"], "job_category": rule["job_category"], "recruitment_id": rid,
                                                       "recruitment_title": rule["recruitment_title"], "published_at": rule.get("published_at")},
                                             "mode": "roadmap", "abstained": False, "retrieved": [], "citations": [],
                                             "answer": {"summary": head, "lines": lines, "notes": (["먼저 할 일: " + " · ".join(acts)] if acts else []) + [f"공고 일정 기준: {pl['anchor']['kind']} — {pl['anchor']['basis']}"]}}],
                "elapsed_ms": 0, "ai_enabled": ai_analyzer.ai_available(), "history_stored_on_server": False}
    # 개인정보 최소화: 실명/닉네임/학력 등은 전달하지 않고 계산에 필요한 자격증 목록만 사용
    min_profile = {"certificates": p.get("certificates", []), "birth_year": p.get("birth_year"),
                   "military_status": p.get("military_status"), "nationality": p.get("nationality"),
                   "self_declarations": p.get("self_declarations", {}), "intern": p.get("intern", {})}
    answers = []
    targets = mentioned or [RULES[rid]["company_id"]]
    for cid in targets:
        if cid == RULES[rid]["company_id"]:
            rule = RULES[rid]
        else:
            rule = next((r for r in RULES.values() if r["company_id"] == cid), None)
        if not rule:
            answers.append({"scope": {"company": names.get(cid, cid)}, "mode": "abstain", "abstained": True, "retrieved": [], "citations": [],
                            "answer": {"summary": f"{names.get(cid, cid)}의 검증된 공식 채용문서가 등록되어 있지 않아 답변할 수 없습니다.",
                                       "next": ["공식 채용공고 등록 후 다시 질문"]}})
            continue
        with connect() as c:
            answers.append(rag.ask(c, q, rule, min_profile))
    return {"question": q, "answers": answers, "elapsed_ms": round((time.perf_counter() - t0) * 1000),
            "ai_enabled": ai_analyzer.ai_available(), "history_stored_on_server": False}


@app.delete("/api/chat/history")
def chat_history_delete():
    return {"deleted": True, "note": "대화 기록은 서버에 저장하지 않으며 브라우저 탭 세션에만 보관됩니다."}


# ================================================================== 고도화 3: 정정 공고 버전·변경 감지
def _seed_versions():
    with connect() as c:
        c.executescript(versions.SCHEMA)
        for r in RULES.values():
            if c.execute("SELECT 1 FROM recruitment_versions WHERE recruitment_id=?", (r["id"],)).fetchone():
                continue
            d = r["documents"]["notice"]
            raw = (DATA_DIR / d["local_file"]).read_bytes()
            pages = document_parser.extract_pages(raw)
            c.execute("INSERT INTO recruitment_versions (recruitment_id, version_number, label, source_url, attachment_url, published_at, fetched_at, raw_file_hash, normalized_text_hash, verification_status, change_summary) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                      (r["id"], 1, "최초 공고", r["official_source"]["url"], d["url"], r.get("published_at"), r["official_source"].get("checked_at"),
                       versions.sha(raw), versions.sha(versions.normalize_text(pages)), "verified", "최초 공고"))


@app.get("/api/recruitments/{rid}/versions")
def rec_versions(rid: str):
    with connect() as c:
        return [dict(x) for x in c.execute("SELECT * FROM recruitment_versions WHERE recruitment_id=? ORDER BY version_number", (rid,))]


@app.get("/api/recruitments/{rid}/changes")
def rec_changes(rid: str):
    with connect() as c:
        rows = [dict(x) for x in c.execute("SELECT * FROM recruitment_changes WHERE recruitment_id=? ORDER BY id DESC", (rid,))]
        logs = [dict(x) for x in c.execute("SELECT * FROM collection_logs WHERE recruitment_id=? ORDER BY id DESC LIMIT 10", (rid,))]
    for r in rows:
        for k in ("items", "text_diff", "impact"):
            r[k] = loads(r[k])
    return {"changes": rows, "logs": logs, "scheduler": {"enabled": False,
            "note": "로컬 실행 환경이라 정기 자동 확인(매일 09:00·18:00 KST)은 비활성. 수동 새로고침만 동작합니다."}}


@app.post("/api/recruitments/{rid}/refresh")
def rec_refresh(rid: str):
    """공식 첨부파일을 다시 내려받아 최신 버전과 비교(실제 네트워크 요청)."""
    if rid not in RULES:
        raise HTTPException(404)
    r = RULES[rid]
    d = r["documents"]["notice"]
    with connect() as c:
        last = c.execute("SELECT * FROM collection_logs WHERE recruitment_id=? ORDER BY id DESC LIMIT 1", (rid,)).fetchone()
        if last and last["checked_at"] > (datetime.now() - timedelta(minutes=1)).isoformat(timespec="seconds"):
            raise HTTPException(429, "과도한 요청 방지: 1분 후 다시 시도하세요")
        latest = c.execute("SELECT * FROM recruitment_versions WHERE recruitment_id=? ORDER BY version_number DESC LIMIT 1", (rid,)).fetchone()
    try:
        raw, final, _ = source_verifier.fetch_official(d["url"], r["company_id"])
    except Exception as e:  # noqa: BLE001
        with connect() as c:
            c.execute("INSERT INTO collection_logs (recruitment_id, checked_at, status, detail) VALUES (?,?,?,?)", (rid, now(), "실패", f"{e.__class__.__name__}: {str(e)[:150]}"))
        return {"status": "실패", "detail": str(e)[:200]}
    pages = document_parser.extract_pages(raw) if raw[:4] == b"%PDF" else []
    raw_h, txt_h = versions.sha(raw), versions.sha(versions.normalize_text(pages))
    if raw_h == latest["raw_file_hash"]:
        status = "변경 없음(동일 파일)"
    elif txt_h == latest["normalized_text_hash"]:
        status = "변경 없음(메타데이터만 다름)"
    else:
        status = "내용 변경 감지 - 확인 필요(새 버전 규칙 미검증)"
        with connect() as c:
            c.execute("INSERT INTO recruitment_versions (recruitment_id, version_number, label, source_url, attachment_url, fetched_at, raw_file_hash, normalized_text_hash, previous_version_id, verification_status, change_summary) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                      (rid, latest["version_number"] + 1, "변경 감지본", r["official_source"]["url"], final, now(), raw_h, txt_h, latest["id"], "needs_review", status))
            c.execute("INSERT OR IGNORE INTO notifications (dedupe_key, recruitment_id, title, body, severity, created_at) VALUES (?,?,?,?,?,?)",
                      (f"{rid}:{txt_h}", rid, f"{r['company']} 공고 내용 변경 감지", "공식 첨부파일 내용이 바뀌었습니다. 변경 이력을 확인해 주세요.", "매우 중요", now()))
    with connect() as c:
        c.execute("INSERT INTO collection_logs (recruitment_id, checked_at, status, detail) VALUES (?,?,?,?)", (rid, now(), status, f"최종 URL {final}"))
    return {"status": status, "raw_hash": raw_h[:16], "text_hash": txt_h[:16], "checked_at": now()}


@app.get("/api/recruitments/{rid}/impact")
def rec_impact(rid: str):
    if rid != "demo-correction":
        return {"items": [], "note": "검증된 정정 공고가 없어 영향 분석 대상이 없습니다."}
    return demo_correction()["impact"]


def _load_demo():
    base = DATA_DIR / "demo" / "correction_test"
    a = json.loads((base / "demo_rule_v1.json").read_text(encoding="utf-8"))
    b = json.loads((base / "demo_rule_v2.json").read_text(encoding="utf-8"))
    for rr in (a, b):
        rr["validation"] = validate_rulefile(rr, DATA_DIR)
    return a, b


@app.get("/api/demo/correction")
def demo_correction():
    """시연용 가상 테스트 문서 A/B 비교 (실제 기관 데이터와 분리)."""
    a, b = _load_demo()
    base = DATA_DIR / "demo" / "correction_test"
    ra, rb, rm = (base / "demo_v1.pdf").read_bytes(), (base / "demo_v2.pdf").read_bytes(), (base / "demo_v1_meta.pdf").read_bytes()
    pa, pb, pm = (document_parser.extract_pages(x) for x in (ra, rb, rm))
    same = versions.same_recruitment(a, b)
    files = versions.compare_files(ra, rb, pa, pb)
    meta = versions.compare_files(ra, rm, pa, pm)
    items = versions.rule_diff(a, b) if same["decision"] == "same" else []
    imp = versions.impact(a, b, get_profile(), items)
    key = "demo:" + versions.sha(json.dumps(items, ensure_ascii=False))[:16]
    with connect() as c:
        if items:
            top = items[0]
            c.execute("INSERT OR IGNORE INTO notifications (dedupe_key, recruitment_id, title, body, severity, created_at, is_demo) VALUES (?,?,?,?,?,?,1)",
                      (key, "demo-correction", "[시연용] 가상기관 정정 공고: " + top["field"].split(":")[0] + " 변경",
                       f"변경 {len(items)}건 감지. 내 스펙 분석 결과를 다시 확인해 주세요.", top["severity"], now()))
    return {"is_demo": True, "label": "시연용 가상 테스트 문서 - 실제 기관의 정정 공고가 아님",
            "versions": [{"version": 1, "title": a["recruitment_title"], "notice_no": a["notice_no"], "published_at": a["published_at"], "evidence_check": a["validation"]},
                         {"version": 2, "title": b["recruitment_title"], "notice_no": b["notice_no"], "published_at": b["published_at"], "evidence_check": b["validation"]}],
            "same_recruitment": same, "file_compare": {k: v for k, v in files.items() if k != "diff"},
            "metadata_only_compare": {k: v for k, v in meta.items() if k != "diff"},
            "text_diff": files["diff"], "items": items, "impact": imp, "detected_at": now()}


@app.get("/api/recruitments/compare-link/{a}/{b}")
def compare_link(a: str, b: str):
    if a not in RULES or b not in RULES:
        raise HTTPException(404)
    return versions.same_recruitment(RULES[a], RULES[b])


@app.get("/api/notifications")
def notifications():
    with connect() as c:
        return [dict(x) for x in c.execute("SELECT * FROM notifications ORDER BY id DESC LIMIT 30")]


@app.patch("/api/notifications/{nid}/read")
def notification_read(nid: int):
    with connect() as c:
        c.execute("UPDATE notifications SET read=1 WHERE id=?", (nid,))
    return notifications()


# ------------------------------------------------------------------ 프론트엔드 정적 파일(빌드 후)
DIST = ROOT / "frontend" / "dist"
if DIST.exists():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

    @app.get("/{full_path:path}")
    def spa(full_path: str):
        if full_path.startswith("api/"):
            raise HTTPException(404)
        f = DIST / full_path
        if full_path and f.is_file():
            return FileResponse(f)
        return FileResponse(DIST / "index.html")
