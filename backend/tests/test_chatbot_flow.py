"""취뽀봇: 질문부터 받기 → 기업 되묻기 → 원래 질문 답변 → 같은 기준으로 후속 질문."""
from fastapi.testclient import TestClient

from app.main import app


def test_clarify_then_continue():
    with TestClient(app) as c:
        c.post("/api/profile/reset-demo")
        r = c.post("/api/chat/ask", json={"question": "나 SQLD 가점 몇 점이야?"}).json()
        assert r["clarify"]["question"] == "어느 기업 기준으로 볼까요?" and r["answers"] == []
        assert any("한국철도공사" in o for o in r["clarify"]["options"])
        r2 = c.post("/api/chat/ask", json={"question": "코레일 IT", "pending_question": r["pending_question"]}).json()
        assert r2["context"]["company_id"] == "korail" and r2["answers"][0]["answer"]["summary"]
        assert r2["question"] == "나 SQLD 가점 몇 점이야?"
        r3 = c.post("/api/chat/ask", json={"question": "그럼 컴활 2급은?", "context": r2["context"]}).json()
        assert "clarify" not in r3 and r3["answers"][0]["scope"]["company"] == "한국철도공사"
        sim = c.post("/api/chat/ask", json={"question": "기사 뭐 더 따면 좋아?", "context": r2["context"]}).json()["answers"][0]
        assert sim["mode"] == "simulator"


def test_other_org_no_mix():
    with TestClient(app) as c:
        c.post("/api/profile/reset-demo")
        r = c.post("/api/chat/ask", json={"question": "이번 주 할 일 알려줘", "context": {"company_id": "org:한국수력원자력", "company_name": "한국수력원자력"}}).json()
        a = r["answers"][0]
        assert a["scope"]["company"] == "한국수력원자력" and "코레일" not in str(a["answer"]) and "철도" not in str(a["answer"])
        # 채팅의 기업 변경은 홈 목표에 반영되지 않음
        assert c.get("/api/target/scope").json()["company_id"] == "korail"


def test_followup_cert_uses_engine():
    with TestClient(app) as c:
        c.post("/api/profile/reset-demo")
        a = c.post("/api/chat/ask", json={"question": "그럼 컴활 2급은?", "context": {"company_id": "korail", "company_name": "한국철도공사"}}).json()["answers"][0]
        assert a["mode"] == "rule_engine"
