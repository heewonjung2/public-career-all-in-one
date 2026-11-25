"""복수 기업 통합 취업 전략 최적화.

두 개의 최적화 문제로 분리한다.

1) 자격증 취득 조합 선택 (비선형 0/1 배낭 문제)
   - 가치: 기업별 '정규화 가점 개선량' (= 추가 가점 / 해당 기업 일반 자격증 가점 상한) × 기업 선호 가중치
     · 가점은 engine.calculate_bonus 로 '집합 단위'로 계산 → 동일 종별·영역별 개수·상한 규칙이 자동 반영(비가산적 가치)
     · 적격/부적격 전형은 점수가 아니라 지원요건 충족 여부로 다룸(현재 공고에는 필수 자격증 없음)
   - 제약: 자격증 준비 가능 시간(주간 시간 × 남은 주 × 자격증 배분 비율), 예산(월 예산 × 개월)
   - 해법: 후보(단독 개선량 > 0) 부분집합 완전탐색(후보 ≤ 14개 → 최대 16,384개) = 정확한 최적해
   - 비교 기준: 단독 개선량 내림차순 탐욕법(greedy)

2) 주간 학습 시간 배분 (분리 가능 오목 효용의 정수 자원 배분)
   - max Σ_i w_i · ln(1 + h_i)   s.t. Σ h_i = H (0.5시간 단위), h_i ≥ 0
   - w_i = 출제 비중 × 적용 기업 선호 합 × 취약도 × 전략 가중치
   - 해법: 한계효용 탐욕법. 목적함수가 분리 가능하고 오목하므로 이 방법이 정수 단위 최적해를 보장한다.

모든 점수는 서비스 내부의 '준비 전략 평가 지표'이며 합격 확률이 아니다.
"""
from __future__ import annotations

import itertools
import math

from . import engine

WEAKNESS = {"미시작": 1.0, "취약": 1.0, "미입력": 0.9, "보완 필요": 0.8, "준비 중": 0.6, "복습 필요": 0.45, "준비 완료": 0.15}

# 일반적인 준비 시간 추정치(시간). 개인차가 크므로 화면에서 '예상치'로 표시하고 사용자가 수정 가능.
DEFAULT_PREP_HOURS = {"기술사": 600, "기능장": 400, "기사": 120, "산업기사": 80, "기능사": 40}

STRATEGIES = {
    "balanced": {"label": "균형형", "cert_share": 0.2, "pref_power": 1.0, "weak_power": 1.0, "common_bonus": 1.5},
    "top_priority": {"label": "1순위 기업 집중형", "cert_share": 0.2, "pref_power": 3.0, "weak_power": 1.0, "common_bonus": 1.0},
    "bonus": {"label": "가점 확보형", "cert_share": 0.4, "pref_power": 1.0, "weak_power": 1.0, "common_bonus": 1.2},
    "exam": {"label": "필기 집중형", "cert_share": 0.0, "pref_power": 1.0, "weak_power": 1.3, "common_bonus": 1.2},
    "low_cost": {"label": "최소 비용형", "cert_share": 0.1, "pref_power": 1.0, "weak_power": 1.0, "common_bonus": 1.2, "budget_zero": True},
}


def pref_weight(priority: int, power: float) -> float:
    return (1.0 / max(priority, 1)) ** power


# ------------------------------------------------------------------ 공통 과목
def subject_matrix(rules: list[dict], profile: dict) -> list[dict]:
    """공식 공고에서 확인된 과목만 사용."""
    ncs = profile.get("ncs_status", {}) or {}
    major = dict(profile.get("major_status", {}) or {})
    if "전자계산기" not in major and "컴퓨터구조" in major:
        major["전자계산기"] = major["컴퓨터구조"]
    rows: dict[str, dict] = {}
    for r in rules:
        we = r.get("written_exam") or r.get("written_exam_reference") or {}
        comp = we.get("composition", {})
        total = we.get("question_count") or 1
        groups = [("NCS", we.get("ncs_subjects", []), comp.get("NCS", 0)),
                  ("전공", we.get("major_subjects", []), comp.get("전공", 0))]
        if comp.get("철도법령"):
            groups.append(("법령", ["철도법령"], comp["철도법령"]))
        ev = {e["what"]: e for e in we.get("evidence", [])}
        for kind, subs, q in groups:
            for s in subs:
                row = rows.setdefault(s, {"subject": s, "kind": kind, "companies": {}, "my_status": None})
                share = (q / len(subs)) / total if subs else 0
                evk = {"NCS": "NCS 출제범위", "전공": "IT 전공 출제범위", "법령": "철도법령 출제범위"}[kind]
                e = ev.get(evk)
                row["companies"][r["company_id"]] = {"status": "출제", "share": round(share, 4),
                                                     "evidence": {"doc": e["doc"], "page": e["page"], "quote": e["quote"], "verified": e.get("evidence_verified", False)} if e else None}
                st = ncs.get(s) if kind == "NCS" else major.get(s)
                row["my_status"] = st or ("미시작" if kind == "법령" else "미입력")
    return list(rows.values())


# ------------------------------------------------------------------ 자격증 효율
def _bonus_value(rule: dict, profile: dict, extra: list[dict], include_interp: bool) -> float:
    b = engine.calculate_bonus(rule, profile, extra)
    if not b.get("available"):
        return 0.0
    return b["total_with_interpretation"] if include_interp else b["total_confirmed"]


def cert_options(rule: dict, overrides: dict | None = None) -> list[dict]:
    overrides = overrides or {}
    gp = rule["score_policy"]["grade_points"]
    out = []
    for c in rule.get("cert_catalog", []):
        if not c.get("evidence_verified"):
            continue  # 공식 근거 검증 실패 항목은 최적화 대상에서 제외
        level = (c.get("levels") or [""])[0]
        key = f"{c['name']} {level}".strip()
        ov = overrides.get(key, {})
        out.append({"key": key, "name": c["name"], "grade": level, "category": c["category"], "kind": c["kind"],
                    "cert_grade": c["grade"], "points": gp[c["grade"]],
                    "interpretation_needed": c["category"] in rule.get("category_interpretation", {}),
                    "prep_hours": ov.get("prep_hours", DEFAULT_PREP_HOURS.get(c["grade"], 100)),
                    "prep_hours_is_estimate": "prep_hours" not in ov,
                    "fee": ov.get("fee"),  # 공식 응시료를 확보하지 못함 → 사용자 입력값만 사용
                    "evidence": {"doc": c["doc"], "page": c["page"], "quote": c["quote"], "verified": True}})
    return out


def _owned(profile: dict, opt: dict) -> bool:
    for uc in profile.get("certificates", []) or []:
        n = engine._norm(uc.get("name")) + engine._norm(uc.get("grade"))
        if engine._norm(opt["name"]) in n and (not opt["grade"] or engine._norm(opt["grade"]) in n):
            return True
    return False


def evaluate_set(ctx: list[dict], profile: dict, chosen: list[dict], include_interp: bool) -> tuple[float, list[dict]]:
    """선택 집합의 총 가치 = Σ_기업 선호가중치 × (추가가점 / 기업 가점상한)."""
    total, detail = 0.0, []
    extra = [{"name": o["name"], "grade": o["grade"]} for o in chosen]
    for c in ctx:
        rule = c["rule"]
        base = c["base_value"]
        new = _bonus_value(rule, profile, extra, include_interp) if extra else base
        cap = rule["score_policy"]["general_cert"]["max_points"]
        gain = new - base
        norm = gain / cap if cap else 0
        total += c["weight"] * norm
        detail.append({"company_id": rule["company_id"], "company": rule["company"], "gain": round(gain, 2),
                       "normalized": round(norm, 4), "cap": cap})
    return total, detail


def optimize_certs(ctx, profile, options, hour_limit, budget_limit, include_interp, max_candidates=14):
    # 후보: 미보유 + 단독 개선량 > 0
    cands = []
    for o in options:
        if _owned(profile, o):
            continue
        if not include_interp and o["interpretation_needed"]:
            continue
        v, _ = evaluate_set(ctx, profile, [o], include_interp)
        if v > 1e-9:
            cands.append(dict(o, solo_value=v))
    # 같은 종별의 후보는 최고 가치·최소 시간 우선으로 정렬 후 상위만 유지(정확성 유지: 같은 종별은 1개만 인정)
    cands.sort(key=lambda x: (-x["solo_value"], x["prep_hours"]))
    cands = cands[:max_candidates]

    def feasible(sub):
        hrs = sum(o["prep_hours"] for o in sub)
        fee = sum(o["fee"] or 0 for o in sub)
        return hrs <= hour_limit + 1e-9 and fee <= budget_limit + 1e-9

    best, best_v = [], 0.0
    evaluated = 0
    for r in range(1, len(cands) + 1):
        for sub in itertools.combinations(cands, r):
            if not feasible(sub):
                continue
            evaluated += 1
            v, _ = evaluate_set(ctx, profile, list(sub), include_interp)
            # 동일 가치면 준비 시간이 적은 조합 선호
            if v > best_v + 1e-9 or (abs(v - best_v) <= 1e-9 and best and sum(o["prep_hours"] for o in sub) < sum(o["prep_hours"] for o in best)):
                best, best_v = list(sub), v
    return best, best_v, cands, evaluated


def greedy_certs(ctx, profile, cands, hour_limit, budget_limit, include_interp):
    """비교용 단순 우선순위 정렬: 단독 가치 순으로 예산·시간 내에서 담기."""
    chosen, hrs, fee = [], 0.0, 0.0
    for o in sorted(cands, key=lambda x: -x["solo_value"]):
        if hrs + o["prep_hours"] <= hour_limit and fee + (o["fee"] or 0) <= budget_limit:
            chosen.append(o); hrs += o["prep_hours"]; fee += o["fee"] or 0
    v, _ = evaluate_set(ctx, profile, chosen, include_interp)
    return chosen, v


# ------------------------------------------------------------------ 시간 배분
def allocate_hours(weights: dict[str, float], hours: float, step: float = 0.5) -> dict[str, float]:
    """max Σ w_i ln(1+h_i), Σh_i = hours. 오목·분리 가능 → 한계효용 탐욕법이 최적."""
    alloc = {k: 0.0 for k in weights}
    units = int(round(hours / step))
    for _ in range(units):
        best_k, best_gain = None, -1.0
        for k, w in weights.items():
            gain = w * (math.log1p(alloc[k] + step) - math.log1p(alloc[k]))
            if gain > best_gain:
                best_k, best_gain = k, gain
        if best_k is None:
            break
        alloc[best_k] += step
    return {k: v for k, v in alloc.items() if v > 0}


def objective(weights, alloc):
    return sum(w * math.log1p(alloc.get(k, 0)) for k, w in weights.items())


# ------------------------------------------------------------------ 메인
def optimize(rules_by_company: dict[str, dict], profile: dict, req: dict) -> dict:
    strategy = STRATEGIES.get(req.get("strategy", "balanced"), STRATEGIES["balanced"])
    targets = sorted(req.get("targets") or profile.get("targets") or [], key=lambda t: t.get("priority", 99))
    weekly = float(req.get("weekly_hours") or 15)
    budget_m = 0.0 if strategy.get("budget_zero") else float(req.get("monthly_budget") or 0)
    weeks = int(req.get("weeks") or 8)
    include_interp = bool(req.get("include_interpretation", False))

    ctx, missing = [], []
    for i, t in enumerate(targets):
        pr = t.get("priority") or (i + 1)
        rule = rules_by_company.get(t["company_id"])
        if not rule:
            missing.append({"company_id": t["company_id"], "job_category": t.get("job_category"),
                            "reason": "공식 채용공고가 등록·검증되지 않아 분석 대상에서 제외(데이터 부족)"})
            continue
        w = pref_weight(pr, strategy["pref_power"])
        ctx.append({"rule": rule, "weight": w, "priority": pr,
                    "base_value": _bonus_value(rule, profile, [], include_interp)})

    if not ctx:
        return {"available": False, "missing": missing, "message": "분석 가능한 공식 데이터가 있는 목표 기업이 없습니다."}

    # 1) 자격증
    cert_hours = weekly * weeks * strategy["cert_share"]
    budget = budget_m * max(1, round(weeks / 4))
    options_all = cert_options(ctx[0]["rule"], req.get("cert_overrides"))
    chosen, best_v, cands, evaluated = optimize_certs(ctx, profile, options_all, cert_hours, budget, include_interp)
    g_chosen, g_v = greedy_certs(ctx, profile, cands, cert_hours, budget, include_interp)
    _, chosen_detail = evaluate_set(ctx, profile, chosen, include_interp)

    efficiency = []
    for o in cands:
        v, det = evaluate_set(ctx, profile, [o], include_interp)
        efficiency.append({k: o[k] for k in ("key", "name", "grade", "category", "kind", "cert_grade", "points", "interpretation_needed",
                                              "prep_hours", "prep_hours_is_estimate", "fee", "evidence")}
                          | {"value": round(v, 4), "per_100h": round(v / o["prep_hours"] * 100, 4) if o["prep_hours"] else None,
                             "companies_benefit": sum(1 for d in det if d["gain"] > 0), "detail": det,
                             "selected": any(c["key"] == o["key"] for c in chosen),
                             "fee_note": "공식 응시료 미확보 - 사용자 입력값" if o["fee"] is not None else "응시료 공식 확인 전(예산 계산에서 0원 처리)",
                             "schedule_note": "시험 일정은 Q-Net 등 시행기관 공식 공고 확인 필요(미수집)"})
    efficiency.sort(key=lambda x: -x["value"])

    # 2) 주간 시간 배분
    subjects = subject_matrix([c["rule"] for c in ctx], profile)
    pref_by_company = {c["rule"]["company_id"]: c["weight"] for c in ctx}
    weights = {}
    n_comp = len(ctx)
    for s in subjects:
        share = sum(v["share"] * pref_by_company[cid] for cid, v in s["companies"].items())
        coverage = len(s["companies"])
        common = strategy["common_bonus"] if n_comp > 1 and coverage == n_comp else 1.0
        weak = WEAKNESS.get(s["my_status"], 0.7) ** strategy["weak_power"]
        weights[s["subject"]] = share * weak * common * 10
    study_hours = weekly - (cert_hours / weeks if weeks else 0) if chosen else weekly
    study_hours = max(0.0, round(study_hours * 2) / 2)
    alloc = allocate_hours(weights, study_hours)
    # 비교: 비례 배분(단순 방식)
    tw = sum(weights.values()) or 1
    prop = {k: study_hours * w / tw for k, w in weights.items()}

    for s in subjects:
        s["coverage"] = len(s["companies"])
        s["weight"] = round(weights[s["subject"]], 4)
        s["hours"] = alloc.get(s["subject"], 0)
    subjects.sort(key=lambda x: -x["weight"])
    for i, s in enumerate(subjects, 1):
        s["priority"] = i

    elig_gaps = []
    for c in ctx:
        el = engine.check_eligibility(c["rule"], profile)
        for it in el["items"]:
            if it["status"] in (engine.CHECK, engine.FAIL):
                elig_gaps.append({"company": c["rule"]["company"], "item": it["item"], "status": it["status"], "reason": it["reason"], "evidence": it["evidence"]})

    return {
        "available": True,
        "strategy": {"key": req.get("strategy", "balanced"), **strategy},
        "disclaimer": "전략 평가 지표는 서비스 내부의 준비 전략 비교용 값이며 합격 확률이 아닙니다.",
        "inputs": {"weekly_hours": weekly, "monthly_budget": budget_m, "weeks": weeks, "include_interpretation": include_interp,
                   "cert_hours_limit": round(cert_hours, 1), "budget_limit": budget},
        "companies": [{"company_id": c["rule"]["company_id"], "company": c["rule"]["company"], "job_category": c["rule"]["job_category"],
                       "recruitment_id": c["rule"]["id"], "recruitment_title": c["rule"]["recruitment_title"], "priority": c["priority"],
                       "weight": round(c["weight"], 3), "current_bonus": c["base_value"]} for c in ctx],
        "missing": missing,
        "weekly_allocation": [{"subject": k, "hours": v} for k, v in sorted(alloc.items(), key=lambda x: -x[1])],
        "study_hours": study_hours,
        "allocation_objective": {"optimal": round(objective(weights, alloc), 4), "proportional": round(objective(weights, prop), 4)},
        "subjects": subjects,
        "certificates": {
            "chosen": [o["key"] for o in chosen], "chosen_detail": chosen_detail, "value": round(best_v, 4),
            "greedy_chosen": [o["key"] for o in g_chosen], "greedy_value": round(g_v, 4),
            "subsets_evaluated": evaluated, "candidates": len(cands),
            "prep_hours": sum(o["prep_hours"] for o in chosen), "fee_known": sum(o["fee"] or 0 for o in chosen),
            "efficiency": efficiency,
            "excluded_note": None if include_interp else "‘해석 필요’ 영역(직렬별 직무 자격증) 가점은 공식 적용 여부가 확정되지 않아 기본 설정에서 최적화 대상에서 제외",
        },
        "eligibility_gaps": elig_gaps,
        "algorithm": {
            "certificates": "비선형 0/1 배낭: 후보 부분집합 완전탐색(정확 최적), 가치는 규칙 엔진으로 집합 단위 계산",
            "hours": "max Σ w·ln(1+h) s.t. Σh=H, 0.5시간 단위 한계효용 탐욕법(오목·분리 가능 → 최적)",
        },
    }
