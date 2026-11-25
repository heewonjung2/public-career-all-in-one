"""공공기관 약칭 검색·AI 취업 에이전트 빠른 실행 테스트."""
from fastapi.testclient import TestClient

from app.main import app
from app.services import institutions as I


def top(q):
    r = I.search(q)["results"]
    return r[0]["name"] if r else None


def test_required_abbreviations():
    assert top("한수원") == "한국수력원자력(주)"
    assert top("마사회") == "한국마사회"
    assert top("인국공") == "인천국제공항공사"
    assert top("코레일") == "한국철도공사"
    assert top("서교공") == "서울교통공사"
    assert top("디트로") == "대구교통공사"
    assert top("서울교통공사") == "서울교통공사"


def test_spacing_and_partial():
    assert top("서울 교통") == "서울교통공사"
    assert top("수력원자력") == "한국수력원자력(주)"


def test_alio_count_and_groups():
    d = I.search("")
    assert d["sources"]["central"]["count"] == 355
    assert I.search("", group="지방공공기관")["total"] > 0


def test_no_result():
    assert I.search("존재하지않는기관명xyz")["total"] == 0


def test_agent_quick_actions():
    with TestClient(app) as c:
        c.post("/api/profile/reset-demo")
        c.put("/api/active", json={"recruitment_id": "korail-2026H1-it"})
        a = c.post("/api/chat/ask", json={"context": {"company_id": "korail", "company_name": "한국철도공사"}, "question": "내 자격증 가점 몇 점이야?"}).json()["answers"][0]
        assert a["mode"] == "rule_engine" and "6.5" in a["answer"]["summary"]
        b = c.post("/api/chat/ask", json={"context": {"company_id": "korail", "company_name": "한국철도공사"}, "question": "기사 자격증 뭐 더 따면 좋아?"}).json()["answers"][0]
        assert b["mode"] == "simulator" and any("+4.0점" in l for l in b["answer"]["lines"])
        w = c.post("/api/chat/ask", json={"context": {"company_id": "korail", "company_name": "한국철도공사"}, "question": "이번 주 할 일 알려줘"}).json()["answers"][0]
        assert w["mode"] == "roadmap"
