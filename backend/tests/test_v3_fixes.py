"""v3 지시서 5절 기존 오류 수정 테스트."""
from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient

from app.main import app, migrate_profile


@pytest.fixture()
def c():
    with TestClient(app) as client:
        client.post("/api/profile/reset-demo")
        yield client
        client.post("/api/profile/reset-demo")


def test_migration_keeps_ambiguous_date():
    p = migrate_profile({"languages": [{"test": "TOEIC", "score": "860", "taken_at": "2025-05-01"}], "certificates": [{"name": "정보처리기사"}]})
    l = p["languages"][0]
    assert l["exam_date"] == "" and l["legacy_date"] == "2025-05-01"          # 임의 변환 금지
    assert "확인 필요" in l["verification_status"]
    assert l["preregistration_status"] == "미등록"
    assert p["certificates"][0]["has_validity"] is False


def test_exam_date_triggers_recalculation(c):
    p = c.get("/api/profile").json()
    c.put("/api/active", json={"recruitment_id": "korail-2027H1-preview"})
    before = c.post("/api/analysis", json={}).json()["document_screening"]
    assert before["language_points"] == 0 and before["language_points_if_valid"] == 60
    p["languages"][0]["exam_date"] = str(date.today() - timedelta(days=60))
    c.put("/api/profile", json=p)
    after = c.post("/api/analysis", json={}).json()["document_screening"]
    assert after["language_points"] == 60 and after["total"] == 73.0   # 6.5×2 + 60


def test_all_features_share_active_version(c):
    for rid in ("korail-2026H1-it", "korail-2027H1-preview"):
        c.put("/api/active", json={"recruitment_id": rid})
        a = c.post("/api/analysis", json={}).json()
        s = c.post("/api/simulate", json={"add_certificates": []}).json()
        g = c.post("/api/strategy/optimize", json={}).json()
        q = c.post("/api/chat/ask", json={"context": {"company_id": "korail", "company_name": "한국철도공사"}, "question": "한국사 1급은 몇 점이야?"}).json()
        assert a["recruitment"]["id"] == rid
        assert g["companies"][0]["recruitment_id"] == rid
        assert q["answers"][0]["scope"]["recruitment_id"] == rid
        assert s["current"]["total_confirmed"] == a["bonus"]["total_confirmed"]


def test_2027_page_without_screening_object(c):
    c.put("/api/active", json={"recruitment_id": "korail-2027H1-preview"})
    a = c.post("/api/analysis", json={}).json()
    assert a["screening"] is None and a["document_screening"]["available"]   # 구조가 달라도 응답 정상


def test_roadmap_for_2027_uses_labeled_reference(c):
    c.put("/api/active", json={"recruitment_id": "korail-2027H1-preview"})
    rm = c.post("/api/roadmaps", json={}).json()
    assert "2026년 상반기 공고 참고" in rm["label"]
