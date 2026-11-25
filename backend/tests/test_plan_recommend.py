"""자격증 추천(시뮬레이터 연결)·회차 반영 가능성·공고 일정 계획 테스트. 시험 일정은 테스트용 가상 회차."""
from datetime import date

from fastapi.testclient import TestClient

from app.main import app
from app.services import planning

T = date(2026, 11, 25)
REF = date(2027, 3, 11)


def test_feasible_round():
    e = [{"round": "가상 1회", "apply_end": "2027-01-10", "exam_date": "2027-02-01", "result_date": "2027-03-01"}]
    assert planning.feasibility(e, REF, T)["status"] == "이번 채용 반영 가능"


def test_exam_before_but_result_after_reference():
    e = [{"round": "가상 1회", "apply_end": "2027-02-01", "exam_date": "2027-03-01", "result_date": "2027-03-20"}]
    r = planning.feasibility(e, REF, T)
    assert r["status"] == "이번 채용 반영 어려움" and "합격 발표" in r["reason"]


def test_no_schedule_or_reference_needs_check():
    assert planning.feasibility([], REF, T)["status"] == "확인 필요"
    assert planning.feasibility([{"round": "x", "exam_date": "2027-01-01", "result_date": "2027-02-01"}], None, T)["status"] == "확인 필요"


def test_closed_application_round_skipped():
    e = [{"round": "마감 회차", "apply_end": "2026-10-01", "exam_date": "2026-11-01", "result_date": "2026-12-01"}]
    assert planning.feasibility(e, REF, T)["status"] == "이번 채용 반영 어려움"


def test_chat_recommendation_uses_simulator():
    with TestClient(app) as c:
        c.post("/api/profile/reset-demo")
        a = c.post("/api/chat/ask", json={"context": {"company_id": "korail", "company_name": "한국철도공사"}, "question": "나 무슨 기사 자격증 더 따는 게 좋아?", "recruitment_id": "korail-2026H1-it"}).json()["answers"][0]
        assert a["mode"] == "simulator" and not a["abstained"]
        lines = a["answer"]["lines"]
        assert any(l.startswith("정보보안기사 / +4.0점") for l in lines)        # 직렬별 2번째 자리 → +4
        assert any(l.startswith("정보처리기사 / +0점") and "동일 종별" in l for l in lines)


def test_plan_estimated_when_no_official_schedule():
    with TestClient(app) as c:
        c.post("/api/profile/reset-demo")
        c.put("/api/active", json={"recruitment_id": "korail-2027H1-preview"})
        r = c.get("/api/plan").json()
        assert r["anchor"]["kind"] == "예상 일정" and r["before_notice"] and r["after_notice"]
        assert all(x["status"] == "확인 필요" for x in r["certificates"])         # 공식 시험 일정 미등록
