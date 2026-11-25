"""고도화 기능 테스트: 전략 최적화, RAG 범위·보류, 정정 공고 변경 감지."""
import json
from pathlib import Path

import pymupdf
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import strategy, versions
from app.services.evidence_validator import validate_rulefile

DATA = Path(__file__).resolve().parents[2] / "data"
DEMO = DATA / "demo" / "correction_test"


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="module")
def rule():
    r = json.loads((DATA / "recruitment_rules" / "korail_2026H1_it.json").read_text(encoding="utf-8"))
    validate_rulefile(r, DATA)
    return r


PROFILE = {"birth_year": 2004, "military_status": "해당없음", "certificates": [{"name": "한국사능력검정시험", "grade": "1급"}],
           "ncs_status": {"수리능력": "취약", "의사소통능력": "준비 완료", "문제해결능력": "준비 중"},
           "major_status": {"운영체제": "준비 완료", "데이터통신": "미시작"}}


# ---------------- 최적화
def test_exact_beats_greedy_when_caps_interact(rule):
    """단독 가치 순 탐욕법은 같은 영역(안전 1개) 제한을 무시해 0점짜리 자격증을 담는다. 완전탐색은 이를 피한다."""
    ctx = [{"rule": rule, "weight": 1.0, "base_value": 2.5}]
    opts = strategy.cert_options(rule)
    best, best_v, cands, _ = strategy.optimize_certs(ctx, PROFILE, opts, hour_limit=240, budget_limit=0, include_interp=False)
    g, g_v = strategy.greedy_certs(ctx, PROFILE, cands, 240, 0, False)
    assert best_v > g_v
    kinds = [o["category"] for o in best]
    assert kinds.count("안전") <= 1


def test_no_cert_when_hours_insufficient(rule):
    ctx = [{"rule": rule, "weight": 1.0, "base_value": 2.5}]
    best, v, _, _ = strategy.optimize_certs(ctx, PROFILE, strategy.cert_options(rule), 10, 0, False)
    assert best == [] and v == 0


def test_budget_constraint(rule):
    ctx = [{"rule": rule, "weight": 1.0, "base_value": 2.5}]
    ov = {o["key"]: {"fee": 100000} for o in strategy.cert_options(rule)}
    best, _, _, _ = strategy.optimize_certs(ctx, PROFILE, strategy.cert_options(rule, ov), 1000, 50000, False)
    assert best == []


def test_owned_cert_not_recommended(rule):
    ctx = [{"rule": rule, "weight": 1.0, "base_value": 2.5}]
    best, _, cands, _ = strategy.optimize_certs(ctx, PROFILE, strategy.cert_options(rule), 1000, 0, False)
    assert all("한국사" not in o["name"] for o in cands)


def test_interpretation_excluded_by_default(rule):
    ctx = [{"rule": rule, "weight": 1.0, "base_value": 2.5}]
    _, _, cands, _ = strategy.optimize_certs(ctx, PROFILE, strategy.cert_options(rule), 1000, 0, False)
    assert all(not o["interpretation_needed"] for o in cands)


def test_hour_allocation_optimal_vs_proportional():
    w = {"a": 5.0, "b": 1.0, "c": 0.5}
    alloc = strategy.allocate_hours(w, 10)
    assert abs(sum(alloc.values()) - 10) < 1e-9
    tw = sum(w.values())
    prop = {k: 10 * v / tw for k, v in w.items()}
    assert strategy.objective(w, alloc) >= strategy.objective(w, prop) - 1e-9
    # 0.5시간 단위 전수 탐색과 동일한 최적값
    import itertools
    best = max(strategy.objective(w, {"a": a / 2, "b": b / 2, "c": (20 - a - b) / 2})
               for a, b in itertools.product(range(21), range(21)) if a + b <= 20)
    assert abs(strategy.objective(w, alloc) - best) < 1e-9


def test_strategy_api_missing_companies(client):
    r = client.post("/api/strategy/optimize", json={"weekly_hours": 15}).json()
    assert r["available"]
    assert {m["company_id"] for m in r["missing"]} == {"kepco", "seoulmetro"}
    assert abs(sum(a["hours"] for a in r["weekly_allocation"]) - r["study_hours"]) < 1e-9
    assert "합격 확률이 아닙니다" in r["disclaimer"]


def test_mismatched_job_not_used(client):
    r = client.post("/api/strategy/optimize", json={"targets": [{"company_id": "korail", "job_category": "차량", "priority": 1}]}).json()
    assert not r["available"]


# ---------------- RAG
def test_rag_scope_and_abstain(client):
    r = client.post("/api/chat/ask", json={"context": {"company_id": "korail", "company_name": "한국철도공사"}, "question": "NCS 출제 대행사가 공개되어 있어?"}).json()
    assert r["answers"][0]["abstained"]
    r = client.post("/api/chat/ask", json={"context": {"company_id": "korail", "company_name": "한국철도공사"}, "question": "한국전력공사 지원 자격은?"}).json()
    assert r["answers"][0]["abstained"] and "한국전력공사" in r["answers"][0]["answer"]["summary"]
    assert r["history_stored_on_server"] is False


def test_rag_search_filtered_to_one_version(client):
    hits = client.get("/api/documents/search", params={"q": "접수", "recruitment_id": "korail-2026H1-it"}).json()
    assert hits and all(h["recruitment_id"] == "korail-2026H1-it" for h in hits)


def test_rag_rule_engine_answer(client):
    a = client.post("/api/chat/ask", json={"context": {"company_id": "korail", "company_name": "한국철도공사"}, "question": "정보처리기사랑 SQLD 가점이 중복 인정돼?"}).json()["answers"][0]
    assert a["mode"] == "rule_engine"
    assert any("SQLD" in l and "목록에 없음" in l for l in a["answer"]["lines"])
    assert all(c["verified"] for c in a["citations"])


def test_rag_no_fake_ai_answer_without_key(client):
    a = client.post("/api/chat/ask", json={"context": {"company_id": "korail", "company_name": "한국철도공사"}, "question": "철도법령 출제범위 알려줘"}).json()["answers"][0]
    assert a["mode"] in ("retrieval_only", "llm_grounded")


# ---------------- 정정 공고
def _pages(p):
    return [pg.get_text() for pg in pymupdf.open(p)]


def test_same_file_no_change():
    b = (DEMO / "demo_v1.pdf").read_bytes()
    r = versions.compare_files(b, b, _pages(DEMO / "demo_v1.pdf"), _pages(DEMO / "demo_v1.pdf"))
    assert r["status"] == "동일 파일"


def test_metadata_only_change():
    a, m = DEMO / "demo_v1.pdf", DEMO / "demo_v1_meta.pdf"
    r = versions.compare_files(a.read_bytes(), m.read_bytes(), _pages(a), _pages(m))
    assert not r["raw_same"] and r["text_same"] and r["diff"] == []


def test_demo_rule_diff_and_impact(client):
    d = client.get("/api/demo/correction").json()
    assert d["is_demo"]
    fields = {i["field"]: i for i in d["items"]}
    assert fields["접수 마감일"]["after"] == "2026-03-09" and fields["접수 마감일"]["severity"] == "매우 중요"
    assert fields["모집 인원"]["before"] == 10 and fields["모집 인원"]["after"] == 12
    assert "시험 과목" in fields
    assert any(k.startswith("인정 자격증:SQLD") for k in fields)
    assert any(x["type"] == "캘린더" for x in d["impact"]["items"])
    assert d["versions"][0]["evidence_check"]["failed"] == [] and d["versions"][1]["evidence_check"]["failed"] == []


def test_real_h1_h2_not_linked(client):
    r = client.get("/api/recruitments/compare-link/korail-2026H1-it/korail-2026H2-general").json()
    assert r["decision"] == "different"


def test_uncertain_link_not_auto():
    a = {"company_id": "x", "recruitment_year": 2026, "half": "상반기", "recruitment_type": "신입", "notice_no": "1호"}
    b = dict(a, notice_no="2호")
    assert versions.same_recruitment(a, b)["decision"] == "uncertain"


def test_notification_dedupe(client):
    client.get("/api/demo/correction")
    client.get("/api/demo/correction")
    n = [x for x in client.get("/api/notifications").json() if x["is_demo"]]
    assert len(n) == 1


def test_versions_preserved(client):
    v = client.get("/api/recruitments/korail-2026H1-it/versions").json()
    assert v and v[0]["version_number"] == 1 and len(v[0]["raw_file_hash"]) == 64
