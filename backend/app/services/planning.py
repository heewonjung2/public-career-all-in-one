"""채용 일정 기반 준비 계획 + 자격증 회차 반영 가능성 + '지금 해야 할 일'.

기준 일정(anchor):
  1) 현재 공고에 공식 접수 마감일이 있고 오늘 이후 → '공식 일정'
  2) 사용자가 목표 월(target_month, YYYY-MM)을 정했으면 → 그 달 1일을 공고 예상일로 '예상 일정'
  3) 사전예고(예: 2027 상반기)면 같은 회사 직전 동일 반기 확정 공고 일정을 1년 이동해 '예상 일정(과거 일정 기준 추정)'
자격증 회차 판단:
  - 공식 시험 일정(data/cert_schedules.json, 시행기관 공식 일정만 등록)이 있으면 회차별로
    합격 발표일 ≤ 공고의 자격증 인정 기준일 → '이번 채용 반영 가능'
    시험일 ≤ 기준일 < 합격 발표일 → '이번 채용 반영 어려움'
  - 공식 일정이 없거나 기준일을 알 수 없으면 '확인 필요'
"""
from __future__ import annotations

import json
from datetime import date, timedelta
from pathlib import Path

DATA = Path(__file__).resolve().parents[3] / "data"


def _d(s):
    try:
        return date.fromisoformat(s) if s else None
    except (ValueError, TypeError):
        return None


def load_cert_schedules() -> dict:
    p = DATA / "cert_schedules.json"
    if not p.exists():
        return {"schedules": {}}
    return json.loads(p.read_text(encoding="utf-8"))


def feasibility(entries: list[dict], ref: date | None, today: date) -> dict:
    """entries: [{round, apply_start, apply_end, exam_date, result_date, source}]"""
    if not entries:
        return {"status": "확인 필요", "reason": "시행기관 공식 시험 일정이 아직 등록되지 않음(Q-Net 등 확인)", "round": None}
    if not ref:
        return {"status": "확인 필요", "reason": "공고의 자격증 인정 기준일이 확정되지 않음", "round": None}
    open_rounds = [e for e in entries if (_d(e.get("apply_end")) or date.max) >= today]
    for e in sorted(open_rounds, key=lambda x: x.get("exam_date") or ""):
        res, ex = _d(e.get("result_date")), _d(e.get("exam_date"))
        if res and res <= ref:
            return {"status": "이번 채용 반영 가능", "reason": f"{e['round']} 합격 발표 {res} ≤ 인정 기준일 {ref}", "round": e}
        if ex and ex <= ref and (not res or res > ref):
            return {"status": "이번 채용 반영 어려움", "reason": f"{e['round']} 시험은 {ex}이지만 합격 발표 {res or '미정'}가 인정 기준일 {ref} 이후", "round": e}
    return {"status": "이번 채용 반영 어려움", "reason": f"인정 기준일 {ref} 이전에 합격 발표되는 남은 회차 없음", "round": None}


def anchor(rule: dict, rules: dict, profile: dict, today: date) -> dict:
    sched = {s["type"]: s for s in rule.get("schedule", []) or []}
    end = _d((sched.get("접수마감") or {}).get("date"))
    if end and end >= today:
        return {"kind": "공식 일정", "deadline": end, "exam": _d((sched.get("필기") or {}).get("date")),
                "reference_date": _d((rule.get("score_policy") or {}).get("reference_date")) or end, "basis": rule["recruitment_title"]}
    tm = profile.get("target_month")
    if tm:
        try:
            y, m = map(int, str(tm)[:7].split("-"))
            dl = date(y, m, 1)
            return {"kind": "예상 일정", "deadline": dl, "exam": dl + timedelta(days=21), "reference_date": dl,
                    "basis": f"사용자가 설정한 목표 월 {tm}"}
        except ValueError:
            pass
    ty = rule.get("target_year") or rule.get("recruitment_year")
    prev = [r for r in rules.values() if r["company_id"] == rule["company_id"] and r.get("half") == rule.get("half")
            and (r.get("recruitment_year") or 0) < (ty or 0) and r.get("schedule")]
    if prev:
        pr = sorted(prev, key=lambda r: r.get("recruitment_year"))[-1]
        ps = {s["type"]: s for s in pr["schedule"]}
        shift = (ty or 0) - pr["recruitment_year"]

        def mv(d):
            d0 = _d(d)
            return d0.replace(year=d0.year + shift) if d0 else None
        dl = mv((ps.get("접수마감") or {}).get("date"))
        if dl:
            return {"kind": "예상 일정", "deadline": dl, "exam": mv((ps.get("필기") or {}).get("date")), "reference_date": dl,
                    "basis": f"{rule['recruitment_title']}(공식) + 직전 동일 반기 공고({pr['recruitment_title']}) 일정을 {shift}년 이동한 추정"}
    return {"kind": "일정 미정", "deadline": None, "exam": None, "reference_date": None, "basis": "공식 일정·목표 월 없음 — 내 스펙에서 목표 월을 설정하세요"}


def build(rule: dict, rules: dict, profile: dict, recommend: dict, doc_score: dict | None, today: date | None = None) -> dict:
    today = today or date.today()
    an = anchor(rule, rules, profile, today)
    weeks_left = max(0, (an["deadline"] - today).days // 7) if an["deadline"] else None
    weekly = float(profile.get("weekly_hours") or 15)
    cs = load_cert_schedules()
    certs = []
    from .strategy import DEFAULT_PREP_HOURS
    budget = (weeks_left * weekly * 0.4) if weeks_left is not None else None  # 주간 시간의 40%를 자격증에 쓴다고 가정(추정)
    pool = [i for i in recommend.get("items", []) if i["gain"] > 0 and (budget is None or DEFAULT_PREP_HOURS.get(i["grade"], 100) <= budget)]
    pool.sort(key=lambda i: (-i["gain"] / DEFAULT_PREP_HOURS.get(i["grade"], 100), 0 if i["cert"].endswith("기사") else 1))
    for it in pool[:5]:
        entries = cs.get("schedules", {}).get(it["cert"].split(" ")[0], [])
        f = feasibility(entries, an["reference_date"], today)
        certs.append({"cert": it["cert"], "gain": it["gain"], "doc_gain": it.get("doc_gain"), "prep_hours_estimate": DEFAULT_PREP_HOURS.get(it["grade"], 100), **f})
    before, after, actions = [], [], []
    langs = profile.get("languages", []) or []
    if doc_score and doc_score.get("available"):
        if doc_score.get("language_points_if_valid") is not None:
            actions.append({"title": "어학성적 응시일 입력", "due": None, "why": "응시일이 없어 서류 어학 점수(최대 60점)를 확정할 수 없어요", "link": "/spec?tab=edit"})
        if doc_score.get("language_points", 0) < doc_score["weights"]["language"] and doc_score.get("language_points_if_valid") is None:
            before.append({"title": "공인 어학성적 확보(TOEIC 환산 850 이상이 만점)", "detail": "유효기간 2년 · 국가공무원채용시스템 사전등록 성적은 그 인정기간까지(사전예고 p.2)"})
    for l in langs:
        exp = _d(l.get("original_expiry_date"))
        if exp and l.get("preregistration_status") != "등록 완료(사용자 입력)" and today <= exp <= today + timedelta(days=90):
            actions.append({"title": f"{l.get('test')} 성적 사전등록 검토", "due": str(exp), "why": "기존 유효기간 만료 전에만 사전등록 가능 — 통합채용포털", "link": "https://career.gosi.kr/"})
    for c in certs:
        r = c.get("round")
        if r and _d(r.get("apply_start")) and _d(r.get("apply_start")) - timedelta(days=14) <= today <= (_d(r.get("apply_end")) or today):
            actions.append({"title": f"{c['cert']} 원서 접수", "due": r.get("apply_end"), "why": c["reason"], "link": "https://www.q-net.or.kr"})
    if certs:
        best = certs[0]
        before.append({"title": f"자격증: {best['cert']} (+{best['gain']}점{', 서류 +' + str(best['doc_gain']) + '점' if best.get('doc_gain') else ''})",
                       "detail": f"{best['status']} — {best['reason']}"})
    ncs = profile.get("ncs_status", {}) or {}
    weak = [k for k, v in ncs.items() if v in ("취약", "미시작", "보완 필요")]
    if weak:
        before.append({"title": f"NCS 취약 영역 기초 완성: {', '.join(weak)}", "detail": "주간 시간의 가장 큰 비중 배정(통합 전략 참고)"})
    major = profile.get("major_status", {}) or {}
    we = rule.get("written_exam") or rule.get("written_exam_reference") or {}
    gaps = [s for s in we.get("major_subjects", []) if major.get(s, major.get("컴퓨터구조") if s == "전자계산기" else None) in (None, "미시작", "취약")]
    if gaps:
        before.append({"title": f"전공 미시작 과목 1회독: {', '.join(gaps)}", "detail": "공식 출제범위" + (" (과거 공고 참고)" if not rule.get("written_exam") else "")})
    after += [{"title": "최종 공고에서 직렬·인원·지원자격·자격증 인정 기준일 확인", "detail": "사전예고와 달라진 점은 변경 이력에서 비교"},
              {"title": "서류 점수·가점 재계산(공식 일정으로 다시 계산)", "detail": "분석 기준을 확정 공고로 바꾸면 자동 재계산"},
              {"title": "철도법령 10문항 집중 암기 + 실전 모의고사(70문항/70분)", "detail": "필기일까지 주 2회"}]
    if rule.get("document_screening"):
        after.append({"title": "자기소개서는 필기 합격 후 제출(2027 사전예고)", "detail": "필기 결과 발표 직후 바로 작성할 수 있게 소재 정리"})
    if an["deadline"]:
        actions.append({"title": f"{'예상 ' if an['kind'] != '공식 일정' else ''}공고 접수 마감까지 D-{(an['deadline'] - today).days}", "due": str(an["deadline"]), "why": an["basis"], "link": "/jobs"})
    actions.sort(key=lambda a: a["due"] or "0000")
    return {"anchor": {k: (str(v) if isinstance(v, date) else v) for k, v in an.items()}, "weeks_left": weeks_left,
            "hours_available": round(weeks_left * weekly) if weeks_left is not None else None, "weekly_hours": weekly,
            "before_notice": before, "after_notice": after, "certificates": certs, "actions": actions,
            "cert_schedule_note": cs.get("note") or "자격증 시험 일정은 시행기관(Q-Net 등) 공식 일정만 사용 — 아직 등록되지 않은 자격증은 '확인 필요'"}
