"""가점 엔진 v2 테스트 — 가상 규칙(실제 기관 기준 아님) + 실제 코레일 규칙.
기대값은 엔진 출력이 아니라 규칙을 사람이 직접 계산해 작성했다."""
import json
from pathlib import Path

import pytest

from app.services import engine
from app.services.evidence_validator import validate_rulefile

DATA = Path(__file__).resolve().parents[2] / "data"


def entry(name, cat, grade, kind=None, scope=None, pool="general", **kw):
    return {"name": name, "levels": [], "kind": kind or name, "category": cat, "grade": grade, "pool": pool,
            "scope": scope or {"all": True}, "doc": "x", "page": 1, "quote": "q", "evidence_verified": True, **kw}


def vrule(catalog, groups=None, max_count=3, max_points=12, job=None, total=None):
    """요청서 6절의 가상 규칙: 공통 1, 안전 1, 직렬별 2, 전체 3개, 12점."""
    return {"job": job or {"series": "사무영업", "field": "IT"}, "job_category": "사무영업(IT)",
            "score_policy": {"calculation_verified": True, "applies_to_stage": "필기", "reference_date": "2026-03-11",
                             "same_kind_highest_only": True, "cert_total_cap": total,
                             "grade_points": {"A": 2.5, "B": 1.0, "C": 2.0, "D": 4.0, "E": 3.0, "X": 5.0},
                             "pools": [{"id": "general", "label": "일반", "groups": groups or {"공통직무": 1, "안전": 1, "직렬별": 2},
                                        "max_count": max_count, "max_points": max_points}]},
            "cert_catalog": catalog}


BASE = [entry("A", "공통직무", "A"), entry("B", "공통직무", "B"), entry("C", "안전", "C"), entry("D", "직렬별", "D"), entry("E", "직렬별", "E")]


def calc(rule, names, **kw):
    return engine.calculate_bonus(rule, {"certificates": [{"name": n, "grade": "", **kw.get(n, {})} for n in names]})


def st(b):
    return {r["cert"]: r["status"] for r in b["rows"]}


def test_example_ade_is_optimal():
    b = calc(vrule(BASE), ["A", "B", "C", "D", "E"])
    assert b["total_confirmed"] == 9.5           # A2.5 + D4 + E3
    s = st(b)
    assert s["B"] == "그룹별 인정 개수 제한으로 제외"
    assert s["C"] == "전체 인정 개수 제한으로 제외"   # A,C,D,E 합 11.5 가 되면 안 됨
    assert all(s[k] in ("인정", "최고점 자격증으로 선택") for k in "ADE")


def test_common_highest_selected():
    b = calc(vrule(BASE), ["A", "B"])
    assert b["total_confirmed"] == 2.5 and st(b)["A"] == "최고점 자격증으로 선택"


def test_series_group_cap():
    b = calc(vrule(BASE + [entry("F", "직렬별", "B")]), ["D", "E", "F"])
    assert b["total_confirmed"] == 7.0 and st(b)["F"] == "그룹별 인정 개수 제한으로 제외"


def test_total_count_cap():
    b = calc(vrule(BASE), ["A", "C", "D", "E"])
    assert b["total_confirmed"] == 9.5 and st(b)["C"] == "전체 인정 개수 제한으로 제외"


def test_max_points_cap():
    cat = [entry("P", "공통직무", "X"), entry("Q", "안전", "X"), entry("R", "직렬별", "X")]
    b = calc(vrule(cat), ["P", "Q", "R"])
    assert b["total_confirmed"] == 12.0
    assert any(r["status"] == "가점 상한 도달" and r["applied"] == 2.0 for r in b["rows"])


def test_cert_in_multiple_groups_assigned_optimally():
    # M 은 공통직무·안전 양쪽 소속. 공통엔 A(2.5)가 있으므로 M 은 안전에 배정해야 최적(탐욕적으로 공통 배정 시 4.0)
    cat = BASE + [entry("M", "공통직무", "D", kind="M"), entry("M", "안전", "D", kind="M")]
    b = calc(vrule(cat), ["A", "M"])
    assert b["total_confirmed"] == 6.5
    assert [r for r in b["rows"] if r["cert"] == "M"][0]["category"] == "안전"


def test_same_kind_limit():
    cat = [entry("정보처리기사", "직렬별", "D", kind="정보처리"), entry("정보처리산업기사", "직렬별", "A", kind="정보처리")]
    b = calc(vrule(cat), ["정보처리기사", "정보처리산업기사"])
    assert b["total_confirmed"] == 4.0 and st(b)["정보처리산업기사"] == "중복 인정 제한으로 제외"


def test_recalc_after_add_and_remove():
    r = vrule(BASE)
    assert calc(r, ["A", "D"])["total_confirmed"] == 6.5
    assert calc(r, ["A", "D", "E"])["total_confirmed"] == 9.5
    assert calc(r, ["D", "E"])["total_confirmed"] == 7.0


def test_parent_series_rule_inherited():
    cat = [entry("S", "직렬별", "D", scope={"series": ["사무영업", "열차승무"]})]
    assert calc(vrule(cat, job={"series": "사무영업", "field": "IT"}), ["S"])["total_confirmed"] == 4.0
    b = calc(vrule(cat, job={"series": "차량", "field": "기계"}), ["S"])
    assert b["total_confirmed"] == 0 and st(b)["S"] == "지원 직렬 인정 대상 아님"


def test_field_exclusion():
    cat = [entry("S", "직렬별", "D", scope={"series": ["사무영업"], "exclude_fields": ["IT"]})]
    b = calc(vrule(cat), ["S"])
    assert b["total_confirmed"] == 0 and st(b)["S"] == "지원 직렬 인정 대상 아님"


def test_expired():
    b = calc(vrule(BASE), ["D"], D={"expires_at": "2025-12-31"})
    assert b["total_confirmed"] == 0 and st(b)["D"] == "유효기간 만료"


def test_unverified_rule_not_confirmed():
    b = calc(vrule([entry("U", "직렬별", "D", verified=False)]), ["U"])
    assert b["total_confirmed"] == 0 and b["total_with_interpretation"] == 4.0
    assert st(b)["U"] == "공식 기준 확인 필요"


def test_not_listed():
    b = calc(vrule(BASE), ["SQLD"])
    assert st(b)["SQLD"] == "가산대상 목록에 없음" and b["total_confirmed"] == 0


@pytest.fixture(scope="module")
def korail():
    r = json.loads((DATA / "recruitment_rules" / "korail_2026H1_it.json").read_text(encoding="utf-8"))
    validate_rulefile(r, DATA)
    return r


def test_written_bonus_vs_document_screening(korail):
    b = engine.calculate_bonus(korail, {"certificates": []})
    assert b["stage"] == "필기"
    assert korail["screening"]["document_stage"].startswith("자기소개서 적격/부적격")
    assert korail["score_policy"]["base_score"] is None


def test_korail_demo_profile(korail):
    """공고문 p.3 + 참고자료 p.24~26 기준 수기 계산:
    직렬별 정보처리기사(기사) 4.0 / 공통직무 한국사 1급(산업기사) 2.5, 컴활 2급(기능사) 1.0 → 공통 1개만 → 2.5
    SQLD 목록 없음 / 합계 6.5"""
    p = json.loads((DATA / "demo" / "demo_profile.json").read_text(encoding="utf-8"))
    b = engine.calculate_bonus(korail, p)
    assert b["total_confirmed"] == 6.5
    s = st(b)
    assert s["컴퓨터활용능력 2급"] == "그룹별 인정 개수 제한으로 제외" and s["SQLD"] == "가산대상 목록에 없음"
    u = {x["group"]: x for x in b["usage"]}
    assert u["공통직무"]["used"] == 1 and u["직렬별"]["used"] == 1 and u["전체"]["used"] == 2


def test_engine_shared_by_simulator_strategy_rag():
    from fastapi.testclient import TestClient
    from app.main import app
    with TestClient(app) as c:
        c.post("/api/profile/reset-demo")
        a = c.post("/api/analysis", json={"recruitment_id": "korail-2026H1-it"}).json()["bonus"]["total_confirmed"]
        s = c.post("/api/simulate", json={"recruitment_id": "korail-2026H1-it", "add_certificates": []}).json()["current"]["total_confirmed"]
        g = c.post("/api/strategy/optimize", json={}).json()["companies"][0]["current_bonus"]
        q = c.post("/api/chat/ask", json={"question": "내 자격증 가점 몇 점이야?"}).json()["answers"][0]["answer"]["summary"]
    assert a == s == g == 6.5 and "6.5" in q
