"""핵심 로직 테스트: 공식 출처 검증, 근거 원문 검증, 지원 자격, 가점 계산."""
import copy
import json
from pathlib import Path

import pytest

from app.services import engine, source_verifier
from app.services.document_parser import quote_exists
from app.services.evidence_validator import validate_rulefile

DATA = Path(__file__).resolve().parents[2] / "data"


@pytest.fixture(scope="module")
def rule():
    r = json.loads((DATA / "recruitment_rules" / "korail_2026H1_it.json").read_text(encoding="utf-8"))
    res = validate_rulefile(r, DATA)
    assert res["failed"] == [], res["failed"]
    return r


def profile(**kw):
    p = {"birth_year": 2004, "military_status": "해당없음", "nationality": "대한민국", "certificates": [],
         "intern": {}, "self_declarations": {"etc": True}}
    p.update(kw)
    return p


def cert(name, grade="", **kw):
    return {"name": name, "grade": grade, **kw}


# ---------------- 공식 출처
@pytest.mark.parametrize("url,ok", [
    ("https://job.alio.go.kr/recruitview.do?idx=297210", True),
    ("https://www.alio.go.kr/download/download.json?fileNo=3030414", True),
    ("https://blog.naver.com/someone/123", False),
    ("https://cafe.naver.com/korailjob", False),
    ("https://korail.com.evil.io/notice.pdf", False),     # 기업명이 들어간 위장 도메인
    ("https://korail-recruit.tistory.com", False),
    ("http://127.0.0.1:8000/api/health", False),          # SSRF
    ("http://localhost/admin", False),
    ("http://169.254.169.254/latest/meta-data", False),
    ("ftp://job.alio.go.kr/a.pdf", False),
    ("https://user:pw@job.alio.go.kr/", False),
])
def test_source_verifier(url, ok):
    assert source_verifier.verify_url(url, "korail", resolve_dns=False).ok is ok


def test_other_company_domain_rejected():
    assert not source_verifier.verify_url("https://www.korail.com/a.pdf", "kepco", resolve_dns=False).ok


# ---------------- 근거 원문 검증
def test_all_quotes_exist_in_official_pdf(rule):
    res = validate_rulefile(copy.deepcopy(rule), DATA)
    assert res["checked"] >= 70 and res["passed"] == res["checked"]


def test_fabricated_quote_detected():
    assert not quote_exists(["정보처리기사 4.0점"], 1, "SQLD 3점 가산")


# ---------------- 지원 자격
def test_eligibility_age(rule):
    assert engine.check_eligibility(rule, profile(birth_year=2010))["overall"].startswith("지원 불가")
    items = {i["id"]: i for i in engine.check_eligibility(rule, profile(birth_year=2009))["items"]}
    assert items["age"]["status"] == engine.CHECK  # 경계 연도는 확정하지 않음


def test_eligibility_unknown_not_confirmed(rule):
    r = engine.check_eligibility(rule, profile(self_declarations={}))
    assert r["overall"].startswith("확인 필요")


def test_eligibility_pass(rule):
    assert engine.check_eligibility(rule, profile())["overall"].startswith("지원 자격 충족")


def test_military_unfulfilled(rule):
    assert engine.check_eligibility(rule, profile(military_status="미필"))["overall"].startswith("지원 불가")


# ---------------- 가점 계산
def total(rule, certs, interp=False):
    b = engine.calculate_bonus(rule, profile(certificates=certs))
    return b["total_with_interpretation"] if interp else b["total_confirmed"], b


def test_single_cert(rule):
    assert total(rule, [cert("한국사능력검정시험", "1급")])[0] == 2.5


def test_same_category_only_one(rule):
    # 한국사 1급(2.5)과 컴활 2급(1.0)은 모두 공통직무 → 1개만 인정
    t, b = total(rule, [cert("한국사능력검정시험", "1급"), cert("컴퓨터활용능력", "2급")])
    assert t == 2.5
    assert {r["cert"]: r["status"] for r in b["rows"]}["컴퓨터활용능력 2급"] == "그룹별 인정 개수 제한으로 제외"


def test_same_kind_highest_only(rule):
    t, _ = total(rule, [cert("정보처리기사"), cert("정보처리산업기사")], interp=True)
    assert t == 4.0


def test_not_in_catalog_is_not_zero(rule):
    _, b = total(rule, [cert("SQLD"), cert("TOEIC")])
    assert all(r["status"] == "가산대상 목록에 없음" and r["points"] is None for r in b["rows"])


def test_max_three_and_12_cap(rule):
    certs = [cert("한국사능력검정시험", "1급"), cert("산업안전기사"), cert("정보처리기사"), cert("정보보안기사"), cert("정보통신기사")]
    t, b = total(rule, certs)
    # 공고 기준 수기 계산: 공통 2.5 / 안전 4.0 / 직렬별 4.0·4.0·4.0(최대 2개) / 전체 3개·12점
    # 최적 = 안전 4 + 직렬별 4 + 직렬별 4 = 12 → 한국사 2.5는 전체 3개 제한으로 제외
    assert t == 12.0
    st = {r["cert"]: r["status"] for r in b["rows"]}
    assert sum(1 for r in b["rows"] if r["applied"] > 0) == 3
    assert st["한국사능력검정시험 1급"] == "전체 인정 개수 제한으로 제외"


def test_it_inherits_samuyoungup_list(rule):
    """IT는 사무영업 직렬의 세부구분(공고문 p.1 인원표, 참고자료 p.4 직무소개서) → '사무영업 및 열차승무' 목록 적용."""
    t, b = total(rule, [cert("정보처리기사")])
    assert t == 4.0 and b["rows"][0]["status"] == "인정"


def test_expired_cert(rule):
    t, b = total(rule, [cert("한국사능력검정시험", "1급", expires_at="2025-01-01")])
    assert t == 0 and b["rows"][0]["status"] == "유효기간 만료"


def test_acquired_after_reference_date(rule):
    t, _ = total(rule, [cert("한국사능력검정시험", "1급", acquired_at="2026-04-01")])
    assert t == 0


def test_unverified_rule_blocks_calculation(rule):
    r = copy.deepcopy(rule)
    r["score_policy"]["calculation_verified"] = False
    assert engine.calculate_bonus(r, profile())["available"] is False


def test_intern_bonus_requires_same_job(rule):
    p = profile(intern={"is_korail_experience_intern": True, "job_category": "사무영업(일반)", "completed_at": "2026-02-01"})
    o = engine.calculate_bonus(rule, p)["others"][0]
    assert o["status"] == "확인 필요"
    p["intern"]["job_category"] = "사무영업(IT)"
    assert engine.calculate_bonus(rule, p)["others"][0]["points"] == 2
