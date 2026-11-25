"""2027 상반기 채용방식 변경 사전예고(공식 PDF) 기반 서류 점수 계산 테스트.
기대값은 사전예고 p.2 공식 계산식과 붙임1 환산표를 보고 직접 계산했다."""
import json
from datetime import date, timedelta
from pathlib import Path

import pytest

from app.services import engine, screening
from app.services.evidence_validator import validate_rulefile

DATA = Path(__file__).resolve().parents[2] / "data"


@pytest.fixture(scope="module")
def r27():
    r = json.loads((DATA / "recruitment_rules" / "korail_2027H1_preview.json").read_text(encoding="utf-8"))
    res = validate_rulefile(r, DATA)
    assert res["failed"] == []
    return r


def recent(days=30):
    return str(date.today() - timedelta(days=days))


def prof(langs, certs=None):
    return {"languages": langs, "certificates": certs or []}


def test_conversion_table_spot_checks(r27):
    c = r27["language_policy"]["conversion"]
    assert c["TOEIC Speaking"]["IM3"] == 750 and c["TOEIC Speaking"]["IH"] == 850 and c["TOEIC Speaking"]["NM"] == 400
    assert c["OPIc"]["IM2"] == 740 and c["OPIc"]["IL"] == 620
    assert {"min": 333, "max": 335, "eq": 845} in c["TEPS"]
    assert min(c["TOEIC"]) == 400


def test_toeic_full_score_and_cert_x2(r27):
    # TOEIC 860(≥850) → 60점, 자격증 원점수: 정보처리기사 4 + 한국사 1급 2.5 = 6.5 → ×2 = 13 → 73
    p = prof([{"test": "TOEIC", "score": "860", "exam_date": recent()}],
             [{"name": "정보처리기사"}, {"name": "한국사능력검정시험", "grade": "1급"}])
    d = screening.document_score(r27, p)
    assert d["language_points"] == 60 and d["cert_points"] == 13.0 and d["total"] == 73.0


def test_below_850_formula(r27):
    # TOEIC 700 → (700/850)×60 = 49.41
    d = screening.document_score(r27, prof([{"test": "TOEIC", "score": "700", "exam_date": recent()}]))
    assert d["language_points"] == round(700 / 850 * 60, 2)


def test_best_of_multiple_scores(r27):
    d = screening.document_score(r27, prof([{"test": "TOEIC", "score": "700", "exam_date": recent()},
                                             {"test": "TOEIC Speaking", "score": "IM3", "exam_date": recent()},
                                             {"test": "TOEIC", "score": "780", "exam_date": recent()}]))
    assert d["language_points"] == round(780 / 850 * 60, 2)


def test_expired_language_not_counted(r27):
    d = screening.document_score(r27, prof([{"test": "TOEIC", "score": "900", "exam_date": "2023-01-01"}]))
    assert d["language_points"] == 0 and d["languages"][0]["status"] == "해당 공고 미인정"


def test_prereg_recognized(r27):
    d = screening.document_score(r27, prof([{"test": "TOEIC", "score": "900", "exam_date": "2023-01-01",
                                             "preregistration_status": "등록 완료(사용자 입력)", "preregistration_expiry_date": "2028-01-01"}]))
    assert d["language_points"] == 60 and d["languages"][0]["status"] == "사전등록 성적으로 인정"


def test_prereg_expired(r27):
    d = screening.document_score(r27, prof([{"test": "TOEIC", "score": "900", "exam_date": "2020-01-01",
                                             "preregistration_status": "등록 완료(사용자 입력)", "preregistration_expiry_date": "2025-01-01"}]))
    assert d["language_points"] == 0


def test_prereg_without_expiry_needs_check(r27):
    d = screening.document_score(r27, prof([{"test": "TOEIC", "score": "900", "preregistration_status": "등록 완료(사용자 입력)"}]))
    assert d["languages"][0]["status"] == "공식 기준 확인 필요"


def test_unknown_date_is_conditional(r27):
    d = screening.document_score(r27, prof([{"test": "TOEIC", "score": "860"}]))
    assert d["language_points"] == 0 and d["language_points_if_valid"] == 60


def test_not_accepted_exam(r27):
    d = screening.document_score(r27, prof([{"test": "IELTS", "score": "7.0", "exam_date": recent()}]))
    assert d["languages"][0]["status"] == "해당 공고 미인정" and d["language_points"] == 0


def test_2027_eligibility_pending(r27):
    assert engine.check_eligibility(r27, {}).get("overall").startswith("확인 필요")


def test_2026_has_no_document_score():
    r26 = json.loads((DATA / "recruitment_rules" / "korail_2026H1_it.json").read_text(encoding="utf-8"))
    assert screening.document_score(r26, {})["available"] is False
