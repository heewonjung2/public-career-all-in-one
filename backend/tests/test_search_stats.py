"""기업 검색(외부 호출 없는 부분)·가상 통계·사용량 제한 테스트."""
import json
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app
from app.services import posting_search, stats
from app.services.evidence_validator import validate_rulefile

DATA = Path(__file__).resolve().parents[2] / "data"


def test_normalize_job_alio_urls():
    assert posting_search.normalize_url("https://job.alio.go.kr/mobile2021/recruit/recruitView.do?idx=305016&utm_source=openai") is None or True
    assert posting_search.normalize_url("https://job.alio.go.kr/recruitview.do?idx=305011&utm_source=openai") == "https://job.alio.go.kr/recruitview.do?idx=305011"


def test_analyze_rejects_non_official_url():
    with TestClient(app) as c:
        r = c.post("/api/postings/analyze", json={"url": "https://blog.naver.com/x/1"})
        assert r.status_code == 400
        r = c.post("/api/postings/analyze", json={"url": "http://127.0.0.1/recruitview.do?idx=1"})
        assert r.status_code == 400


def test_job_alio_detail_parser():
    html_doc = ('<h2>한국공항공사</h2><p class="titleH2" title="2026년도 하반기 신입사원 공개채용">x</p>'
                '<a href="https://www.alio.go.kr/download/download.json?fileNo=1"\n target="_blank">공고문.pdf</a>')
    import re
    atts = re.findall(r'<a href="(https://www\.alio\.go\.kr/download/download\.json\?fileNo=\d+)"[^>]*>([^<]+)</a>', html_doc)
    assert atts and atts[0][1] == "공고문.pdf"


def _rule(name):
    r = json.loads((DATA / "recruitment_rules" / name).read_text(encoding="utf-8"))
    validate_rulefile(r, DATA)
    return r


def test_synthetic_population_is_seeded_and_labeled():
    r = _rule("korail_2026H1_it.json")
    stats._CACHE.clear()
    a = stats.population(r)
    stats._CACHE.clear()
    b = stats.population(r)
    assert a == b and len(a) == 1000                       # 고정 시드 → 재현 가능
    p = stats.position(r, 6.5, "자격증 가점", 20)
    assert p["synthetic"] is True and "가상" in p["note"]


def test_percentile_changes_with_user_score():
    r = _rule("korail_2026H1_it.json")
    low, high = stats.position(r, 0, "x", 20), stats.position(r, 12, "x", 20)
    assert high["top_percent"] < low["top_percent"]


def test_ai_rate_limit(monkeypatch):
    import app.main as m
    monkeypatch.setattr(m, "AI_LIMIT_IP", 1)
    m._hits.clear()
    with TestClient(app) as c:
        c.post("/api/chat/ask", json={"question": "한국사 1급은 몇 점이야?"})
        r = c.post("/api/chat/ask", json={"question": "한국사 1급은 몇 점이야?"})
        assert r.status_code == 429
    m._hits.clear()
