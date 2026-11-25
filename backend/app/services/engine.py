"""지원 자격 판단 + 가점 계산 엔진 (AI 미사용, 검증된 규칙만 사용).

상태 값: 충족 / 미충족 / 확인 필요 / 해당 없음 / 공고에 기준 없음
"""
from __future__ import annotations

import re
from datetime import date

OK, FAIL, CHECK, NA, NONE = "충족", "미충족", "확인 필요", "해당 없음", "공고에 기준 없음"


def _norm(s: str) -> str:
    return re.sub(r"[\s()\-_·.]", "", (s or "")).lower()


def _parse_date(s: str | None) -> date | None:
    try:
        return date.fromisoformat(s) if s else None
    except ValueError:
        return None


def _ev(rule: dict) -> dict | None:
    if rule.get("quote"):
        return {"doc": rule["doc"], "page": rule["page"], "quote": rule["quote"],
                "verified": rule.get("evidence_verified", False)}
    return None


# ---------------------------------------------------------------- 지원 자격
def check_eligibility(rec: dict, profile: dict) -> dict:
    items = []
    declared = profile.get("self_declarations", {}) or {}
    for r in rec.get("eligibility_rules", []):
        status, reason = CHECK, ""
        t = r["type"]
        if r.get("quote") and not r.get("evidence_verified", False):
            status, reason = CHECK, "근거 원문 검증 실패 - 판단 보류"
        elif t == "birth_range":
            by = profile.get("birth_year")
            lo = _parse_date(r["params"]["born_after"]).year      # 이 날짜 '이전' 출생 불가
            hi = _parse_date(r["params"]["born_before"]).year     # 이 날짜 '이후' 출생 불가
            if not by:
                status, reason = CHECK, "출생연도 미입력"
            elif lo < by < hi:
                status, reason = OK, f"{by}년생 - 허용 범위({lo + 1}~{hi - 1}년생 전체 포함)"
            elif by < lo or by > hi:
                status, reason = FAIL, f"{by}년생 - 지원 불가 출생연도"
            else:
                status, reason = CHECK, "경계 연도 출생 - 생년월일로 직접 확인 필요"
        elif t == "no_limit":
            status, reason = OK, "공고상 제한 없음"
        elif t == "military":
            m = profile.get("military_status") or ""
            if m in ("군필", "면제", "해당없음"):
                status, reason = OK, f"병역: {m}"
            elif m == "복무중":
                status, reason = CHECK, f"전역일이 {r['params']['discharge_by']} 이전이어야 지원 가능"
            elif m == "미필":
                status, reason = FAIL, "군필/면제자에 한함"
            else:
                status, reason = CHECK, "병역 사항 미입력"
        elif t == "foreigner":
            nat = profile.get("nationality") or "대한민국"
            status, reason = (NA, "대한민국 국적") if nat == "대한민국" else (CHECK, "체류자격(F-2/F-4/F-5) 확인 필요")
        elif t == "self_declare":
            if declared.get(r["id"]):
                status, reason = OK, "본인 확인(자가 진술) 완료"
            else:
                status, reason = CHECK, "본인이 직접 확인해야 하는 요건 - 내 스펙에서 확인 체크"
        elif t == "not_in_notice":
            status, reason = NONE, r["rule_text"]
        items.append({"id": r["id"], "item": r["item"], "rule_text": r["rule_text"], "status": status,
                      "reason": reason, "evidence": _ev(r)})
    statuses = [i["status"] for i in items]
    if FAIL in statuses:
        overall = "지원 불가(미충족 항목 있음)"
    elif CHECK in statuses:
        overall = "확인 필요(지원 가능으로 확정하지 않음)"
    else:
        overall = "지원 자격 충족(공고 기준)"
    return {"overall": overall, "items": items}


# ---------------------------------------------------------------- 자격증 매칭
def _match_cert(user_cert: dict, catalog: list[dict]) -> dict | None:
    name = _norm(user_cert.get("name"))
    level = _norm(user_cert.get("grade") or "")
    best = None
    for c in catalog:
        names = [_norm(c["name"])] + [_norm(a) for a in c.get("aliases", [])]
        hit = any(n and (n == name or (len(n) >= 4 and n in name) or (len(name) >= 4 and name in n)) for n in names)
        if not hit:
            continue
        lv = [_norm(x) for x in c.get("levels", [])]
        if lv:
            joined = name + level
            if not any(x in joined for x in lv):
                continue
        # 더 긴 이름이 더 구체적인 매칭
        if best is None or len(_norm(c["name"])) > len(_norm(best["name"])):
            best = c
    # 정확 일치 우선(예: '정보처리기사' vs '정보처리산업기사')
    for c in catalog:
        if _norm(c["name"]) == name:
            lv = [_norm(x) for x in c.get("levels", [])]
            if not lv or any(x in name + level for x in lv):
                return c
    return best


def _is_valid(cert: dict, ref: date) -> tuple[bool, str]:
    acq = _parse_date(cert.get("acquired_at"))
    exp = _parse_date(cert.get("expires_at"))
    if acq and acq > ref:
        return False, f"기준일({ref}) 이후 취득"
    if exp and exp < ref:
        return False, f"유효기간 만료({exp})"
    return True, ""


from .bonus import calculate_bonus  # noqa: E402,F401  (v2 최적화 엔진)


# ---------------------------------------------------------------- 시험/학습 분석
LEVEL_SCORE = {"준비 완료": 3, "복습 필요": 2, "준비 중": 1, "보완 필요": 1, "취약": 0, "미시작": 0}


def exam_gap(rec: dict, profile: dict) -> dict:
    we = rec.get("written_exam")
    if not we:
        return {"available": False}
    ncs = profile.get("ncs_status", {}) or {}
    major = profile.get("major_status", {}) or {}
    ncs_rows = [{"subject": s, "official": True, "my_status": ncs.get(s, "미입력")} for s in we["ncs_subjects"]]
    major_rows = []
    for s in we["major_subjects"]:
        mine = major.get(s)
        if mine is None and s == "전자계산기":
            mine = major.get("컴퓨터구조")
        major_rows.append({"subject": s, "official": True, "my_status": mine or "미입력"})
    off = set(we["major_subjects"])
    not_in_scope = [s for s in major if s not in off and s != "컴퓨터구조"]
    return {"available": True, "exam": we, "ncs": ncs_rows, "major": major_rows,
            "my_subjects_not_in_scope": not_in_scope,
            "weak_ncs_detail": profile.get("weak_areas", [])}
