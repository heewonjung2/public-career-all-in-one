"""서류전형 점수 계산 (2027 한국철도공사 사전예고처럼 '어학+자격증 점수제'인 규칙에만 적용).

- 어학: 규칙의 인정 시험·환산표로 TOEIC 환산점수 산출 → 유효기간(규칙 기준) 판단 → 가장 유리한 성적 선택
- 자격증: 공통 가점 엔진(bonus.calculate_bonus)의 원점수 × 직렬별 배수 (페이지별 별도 계산 없음)
- 기준일이 공고에 없으면 오늘 날짜로 '잠정' 판단하고 그 사실을 반환
"""
from __future__ import annotations

import re
from datetime import date

from .bonus import calculate_bonus

ALIASES = {"toeic": "TOEIC", "토익": "TOEIC", "toeicspeaking": "TOEIC Speaking", "토익스피킹": "TOEIC Speaking",
           "opic": "OPIc", "오픽": "OPIc", "teps": "TEPS", "newteps": "TEPS", "텝스": "TEPS", "jpt": "JPT", "hsk": "HSK"}


def exam_type(name: str) -> str | None:
    k = re.sub(r"[\s\-_]", "", (name or "")).lower()
    return ALIASES.get(k)


def _d(s):
    try:
        return date.fromisoformat(s) if s else None
    except ValueError:
        return None


def to_toeic_equiv(lang: dict, conv: dict) -> tuple[int | None, str]:
    t = exam_type(lang.get("test") or lang.get("exam_type"))
    raw = str(lang.get("score") or lang.get("grade") or "").strip().upper()
    if t == "TOEIC" or t == "JPT":
        if not raw.isdigit():
            return None, "점수 형식 확인 필요"
        s = int(raw)
        if s >= 850:
            return 850, "850점 이상 → 만점 구간"
        steps = sorted(conv["TOEIC"], reverse=True)
        eq = next((x for x in steps if s >= x), None)
        return eq, ("환산표 최저(400) 미만 → 점수 없음" if eq is None else f"{s}점 → 환산 {eq}")
    if t in ("TOEIC Speaking", "OPIc"):
        g = raw.replace(" ", "")
        eq = conv[t].get(g)
        return eq, (f"{g} → 환산 {eq}" if eq else f"{g}: 환산표에 없는 등급")
    if t == "TEPS":
        if not raw.isdigit():
            return None, "점수 형식 확인 필요"
        s = int(raw)
        hit = next((r for r in conv["TEPS"] if r["min"] <= s <= r["max"]), None)
        return (hit["eq"], f"NEW TEPS {s} → 환산 {hit['eq']}") if hit else (None, "환산표 범위 밖")
    if t == "HSK":
        level = re.findall(r"[456]", str(lang.get("grade") or lang.get("level") or ""))
        sc = re.findall(r"\d{3}", raw)
        if not level or not sc:
            return None, "HSK 급수·점수 입력 필요"
        if level[0] == "6":
            return conv.get("HSK6_all", 850), "HSK 6급 → 환산 850"
        table = conv.get("HSK" + level[0], [])
        s = int(sc[0])
        hit = next((r for r in table if r["min"] <= s <= r["max"]), None)
        return (hit["eq"], f"HSK {level[0]}급 {s} → 환산 {hit['eq']}") if hit else (None, "환산표 범위 밖")
    return None, "이 공고에서 인정하지 않는 시험"


def language_validity(lang: dict, policy: dict, ref: date) -> tuple[str, str]:
    """반환: (공고 인정 상태, 사유). 상태: 해당 공고 인정 / 사전등록 성적으로 인정 / 해당 공고 미인정 / 공식 기준 확인 필요"""
    exam = _d(lang.get("exam_date") or lang.get("result_date"))
    prereg = lang.get("preregistration_status") == "등록 완료(사용자 입력)"
    pre_exp = _d(lang.get("preregistration_expiry_date"))
    if prereg:
        if policy.get("prereg_accepted") is True:
            if pre_exp:
                return ("사전등록 성적으로 인정", f"사전등록 인정기간 {pre_exp}까지(사용자 입력)") if pre_exp >= ref else ("해당 공고 미인정", f"사전등록 인정기간 만료({pre_exp})")
            return "공식 기준 확인 필요", "사전등록 인정기간 만료일 입력 필요(사전등록 확인서 기준)"
        if policy.get("prereg_accepted") is False:
            pass
        else:
            return "공식 기준 확인 필요", "이 공고의 사전등록 성적 인정 여부 미확인"
    if not exam:
        return "공식 기준 확인 필요", "응시일(성적 취득일) 미입력 — 유효기간을 판단할 수 없음"
    years = policy.get("validity_years")
    if not years:
        return "공식 기준 확인 필요", "공고에 유효기간 기준 없음"
    try:
        exp = exam.replace(year=exam.year + years)
    except ValueError:
        exp = exam.replace(year=exam.year + years, day=28)
    if lang.get("original_expiry_date"):
        exp = _d(lang["original_expiry_date"]) or exp
    return ("해당 공고 인정", f"유효기간 {exp}까지") if exp >= ref else ("해당 공고 미인정", f"유효기간 만료({exp})")


def document_score(rule: dict, profile: dict, extra_certs: list[dict] | None = None, extra_langs: list[dict] | None = None) -> dict:
    ds = rule.get("document_screening")
    lp = rule.get("language_policy") or {}
    if not ds or ds.get("type") != "점수제":
        return {"available": False}
    ref = _d(lp.get("reference_date")) or date.today()
    provisional_date = not lp.get("reference_date")
    job = rule.get("job") or {}
    w = ds["weights"].get(job.get("series"), ds["weights"]["기타"])

    langs = []
    for l in list(profile.get("languages", []) or []) + list(extra_langs or []):
        t = exam_type(l.get("test") or l.get("exam_type"))
        row = {"test": l.get("test") or l.get("exam_type"), "score": l.get("score") or l.get("grade"), "exam_type": t,
               "hypothetical": l in (extra_langs or [])}
        if not t or t not in lp.get("accepted_tests", []):
            row.update(status="해당 공고 미인정", reason="인정 시험(TOEIC/TOEIC Speaking/TEPS/OPIc/JPT/HSK) 아님", equiv=None)
        else:
            eq, why = to_toeic_equiv(l, lp["conversion"])
            st, vr = language_validity(l, lp, ref)
            row.update(equiv=eq, conversion=why, status=st if eq else "해당 공고 미인정", reason=vr if eq else why)
        langs.append(row)
    usable = [r for r in langs if r["equiv"] and r["status"] in ("해당 공고 인정", "사전등록 성적으로 인정")]
    pending = [r for r in langs if r["equiv"] and r["status"] == "공식 기준 확인 필요"]
    best = max(usable, key=lambda r: r["equiv"], default=None)
    best_pending = max(pending, key=lambda r: r["equiv"], default=None)

    def lang_points(eq):
        return float(w["language"]) if eq >= ds["full_language_toeic"] else round(eq / ds["full_language_toeic"] * w["language"], 2)

    b = calculate_bonus(rule, profile, extra_certs)
    cert_raw = min(b["cert_points_confirmed"], ds["cert_raw_max"]) if b.get("available") else 0
    cert_pts = round(cert_raw * w["multiplier"], 2)
    confirmed_lang = lang_points(best["equiv"]) if best else 0.0
    cond_lang = lang_points(best_pending["equiv"]) if best_pending and (not best or best_pending["equiv"] > best["equiv"]) else None
    total = round(confirmed_lang + cert_pts, 2)
    for r in langs:
        r["selected"] = r is best
    return {
        "available": True,
        "weights": w, "selection_ratio": ds["selection_ratio"],
        "reference_date": str(ref), "reference_date_provisional": provisional_date,
        "languages": langs,
        "language_points": confirmed_lang,
        "language_points_if_valid": cond_lang,
        "cert_raw": cert_raw, "cert_points": cert_pts, "cert_list_status": ds.get("cert_list_status"),
        "bonus": b,
        "total": total,
        "total_if_language_valid": round(cond_lang + cert_pts, 2) if cond_lang is not None else None,
        "max": 100,
        "formula": ds["formula"],
        "evidence": {k: ds.get(k) for k in ("weights_evidence", "formula_evidence", "selection_evidence", "cert_evidence", "cert_combo_evidence", "intern_exemption", "veteran_disabled_bonus")},
        "language_evidence": {k: lp.get(k) for k in ("tests_evidence", "validity_evidence", "prereg_evidence", "conversion_evidence", "opic_evidence")},
        "intern_note": ds.get("intern_exemption", {}).get("text"),
        "note": "서비스 내부 계산(사전예고 기준). 합격 여부·합격선과 무관하며 최종 공고에서 기준이 바뀔 수 있음",
    }
