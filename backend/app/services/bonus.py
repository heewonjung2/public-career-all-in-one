"""가점 계산 엔진 v2 — 공고별 규칙을 만족하는 '최대 가점 조합'을 정확히 탐색한다.

규칙 표현(공고 규칙 파일 score_policy / cert_catalog):
  pools: [{id, label, groups: {그룹명: 최대 인정 개수}, max_count, max_points}]  (예: 일반 자격증 12점, 철도 직무 8점)
  cert_total_cap: 모든 pool 합계 상한
  same_kind_highest_only: 동일 종별(kind)은 1개만 인정
  cert_catalog[i]: {name, levels, kind, category(=그룹), pool, grade, scope{all | series[] | fields[] | exclude_fields[]}, verified}
    · 같은 자격증이 여러 그룹/pool 에 속하면 catalog 항목이 여러 개 → 탐색에서 '어느 그룹에 배정할지'까지 결정

알고리즘:
  각 보유 자격증 i 에 대해 선택지 = {미배정} ∪ {적용 가능한 catalog 항목들}
  모든 배정 조합(곱집합)을 완전탐색하며 제약(그룹 개수, pool 개수, 동일 종별 1개, 자격증 1회 사용)을 만족하는 것 중
  목적함수 min(Σ_pool min(pool합, pool상한), 총상한) 최대 → 동점이면 사용 개수 적은 조합 → 원점수 합 큰 조합.
  보유 자격증은 보통 10개 이하이므로 완전탐색이 실용적이며, 탐욕법이 놓치는 경우(복수 그룹 소속·전체 개수 제한)를 모두 처리한다.
  확인되지 않은 규칙(verified=false 또는 근거 검증 실패)은 '확정' 계산에서 제외하고 별도 합계로 분리한다.
"""
from __future__ import annotations

import itertools
import re
from datetime import date

MAX_EXHAUSTIVE = 12  # 후보 자격증이 이보다 많으면 상위 점수 후보로 제한(경고 표시)

ST_OK = "인정"
ST_BEST = "최고점 자격증으로 선택"
ST_CAPPED = "가점 상한 도달"
ST_KIND = "중복 인정 제한으로 제외"
ST_GROUP = "그룹별 인정 개수 제한으로 제외"
ST_TOTAL = "전체 인정 개수 제한으로 제외"
ST_SCOPE = "지원 직렬 인정 대상 아님"
ST_EXPIRED = "유효기간 만료"
ST_VALIDITY = "유효기간 확인 필요"
ST_UNVERIFIED = "공식 기준 확인 필요"
ST_NOT_LISTED = "가산대상 목록에 없음"
ST_DATE = "기준일 이후 취득"


def _norm(s: str | None) -> str:
    return re.sub(r"[\s()\-_·.]", "", (s or "")).lower()


def _date(s):
    try:
        return date.fromisoformat(s) if s else None
    except ValueError:
        return None


def policy_pools(sp: dict) -> list[dict]:
    """신규 pools 표현이 없으면 구형 general_cert 표현을 변환(가상 정정 문서 등 호환)."""
    if sp.get("pools"):
        return sp["pools"]
    g = sp.get("general_cert") or {}
    return [{"id": "general", "label": "자격증", "groups": g.get("category_caps", {}), "max_count": g.get("max_count", 99),
             "max_points": g.get("max_points", 999), "evidence": g.get("evidence")}]


def entry_names(c: dict) -> list[str]:
    return [_norm(c["name"])] + [_norm(a) for a in c.get("aliases", [])]


def match_entries(user_cert: dict, catalog: list[dict]) -> list[dict]:
    """보유 자격증 1개에 해당하는 catalog 항목 '전부'(복수 그룹 소속 가능)."""
    name = _norm(user_cert.get("name"))
    joined = name + _norm(user_cert.get("grade"))
    exact, loose = [], []
    for c in catalog:
        lv = [_norm(x) for x in c.get("levels", [])]
        if lv and not any(x in joined for x in lv):
            continue
        names = entry_names(c)
        if name in names:
            exact.append(c)
        elif any(n and len(n) >= 4 and (n in name or name in n) for n in names):
            loose.append(c)
    if exact:
        return exact
    if not loose:
        return []
    best = max(len(_norm(c["name"])) for c in loose)  # 가장 구체적인 이름만
    return [c for c in loose if len(_norm(c["name"])) == best]


def in_scope(entry: dict, job: dict | None) -> bool:
    sc = entry.get("scope") or {"all": True}
    if sc.get("all"):
        ok = True
    else:
        ok = True
        if sc.get("series"):
            ok = bool(job) and job.get("series") in sc["series"]
        if ok and sc.get("fields"):
            ok = bool(job) and job.get("field") in sc["fields"]
    if ok and sc.get("exclude_fields") and job and job.get("field") in sc["exclude_fields"]:
        ok = False
    return ok


def _validity(cert: dict, ref: date) -> str | None:
    acq, exp = _date(cert.get("acquired_at")), _date(cert.get("expires_at"))
    if acq and acq > ref:
        return ST_DATE
    if exp and exp < ref:
        return ST_EXPIRED
    return None


def optimize(items: list[dict], pools: dict[str, dict], total_cap: float | None, same_kind: bool):
    """items: [{idx, options:[{entry, group, pool, points, kind}]}] → (best_assign, best_value)
    best_assign: {idx: option}  (완전탐색, 정확 최적)"""
    best, best_key = {}, (-1.0, 0, 0.0)
    choices = [[None] + it["options"] for it in items]
    for combo in itertools.product(*choices):
        g_cnt, p_cnt, p_sum, kinds = {}, {}, {}, set()
        feasible = True
        for opt in combo:
            if opt is None:
                continue
            pool = pools[opt["pool"]]
            gk = (opt["pool"], opt["group"])
            g_cnt[gk] = g_cnt.get(gk, 0) + 1
            p_cnt[opt["pool"]] = p_cnt.get(opt["pool"], 0) + 1
            if g_cnt[gk] > pool["groups"].get(opt["group"], 0) or p_cnt[opt["pool"]] > pool["max_count"]:
                feasible = False
                break
            if same_kind:
                if opt["kind"] in kinds:
                    feasible = False
                    break
                kinds.add(opt["kind"])
            p_sum[opt["pool"]] = p_sum.get(opt["pool"], 0) + opt["points"]
        if not feasible:
            continue
        value = sum(min(v, pools[k]["max_points"]) for k, v in p_sum.items())
        if total_cap is not None:
            value = min(value, total_cap)
        used = sum(1 for o in combo if o is not None)
        raw = sum(p_sum.values())
        key = (round(value, 6), -used, raw)
        if key > best_key:
            best_key = key
            best = {items[i]["idx"]: o for i, o in enumerate(combo) if o is not None}
    return best, max(best_key[0], 0.0)


def calculate_bonus(rec: dict, profile: dict, extra_certs: list[dict] | None = None, include_interpretation: bool = True) -> dict:
    sp = rec.get("score_policy") or {}
    if not sp.get("calculation_verified"):
        return {"available": False, "reason": "검증된 가점 규칙이 없어 계산하지 않음"}
    gp = sp["grade_points"]
    pools_list = [p for p in policy_pools(sp) if p.get("loaded", True)]
    pools = {p["id"]: p for p in pools_list}
    total_cap = sp.get("cert_total_cap")
    same_kind = sp.get("same_kind_highest_only", True)
    ref = _date(sp.get("reference_date")) or date.today()
    job = rec.get("job")
    catalog = rec.get("cert_catalog", [])

    certs = list(profile.get("certificates", []) or []) + [dict(c, hypothetical=True) for c in (extra_certs or [])]
    rows, items_conf, items_all = [], [], []
    for idx, uc in enumerate(certs):
        label = (uc.get("name", "") + (f" {uc['grade']}" if uc.get("grade") else "")).strip()
        row = {"idx": idx, "cert": label, "hypothetical": uc.get("hypothetical", False), "matched": None, "category": None,
               "grade": None, "points": None, "applied": 0.0, "status": None, "reason": None, "evidence": None, "kind": None,
               "interpretation_needed": False}
        rows.append(row)
        entries = match_entries(uc, catalog)
        if not entries:
            row.update(status=ST_NOT_LISTED, reason="공고 [참고4] 가산대상 자격증 목록에서 확인되지 않음(목록은 열거식)")
            continue
        e0 = entries[0]
        row.update(matched=e0["name"] + (" " + "/".join(e0["levels"]) if e0.get("levels") else ""), category=e0["category"],
                   grade=e0["grade"], points=gp.get(e0["grade"]), kind=e0["kind"],
                   evidence={"doc": e0["doc"], "page": e0["page"], "quote": e0["quote"], "verified": e0.get("evidence_verified", False)})
        scoped = [e for e in entries if in_scope(e, job) and e.get("pool", "general") in pools]
        if not scoped:
            sc = e0.get("scope", {})
            row.update(status=ST_SCOPE, reason=f"이 자격증의 가산 분류({e0['category']})는 {', '.join(sc.get('series', []))} 직렬에만 적용")
            continue
        bad = _validity(uc, ref)
        if bad:
            row.update(status=bad, reason=f"우대 기준일 {ref} 기준")
            continue
        opts_all, opts_conf = [], []
        for e in scoped:
            o = {"entry": e, "group": e["category"], "pool": e.get("pool", "general"), "points": gp.get(e["grade"], 0), "kind": e["kind"]}
            opts_all.append(o)
            if e.get("evidence_verified", False) and e.get("verified", True):
                opts_conf.append(o)
        if not opts_conf:
            row["interpretation_needed"] = True
        if opts_all:
            items_all.append({"idx": idx, "options": opts_all})
        if opts_conf:
            items_conf.append({"idx": idx, "options": opts_conf})

    def limit(items):
        if len(items) <= MAX_EXHAUSTIVE:
            return items, False
        items = sorted(items, key=lambda it: -max(o["points"] for o in it["options"]))
        return items[:MAX_EXHAUSTIVE], True

    items_conf, trunc1 = limit(items_conf)
    items_all, trunc2 = limit(items_all)
    best_conf, val_conf = optimize(items_conf, pools, total_cap, same_kind)
    best_all, val_all = optimize(items_all, pools, total_cap, same_kind) if include_interpretation else (best_conf, val_conf)

    # 상태 부여 (확정 조합 기준; 확정 조합에 없고 '해석 포함' 조합에만 있으면 확인 필요)
    chosen = best_conf
    by_group: dict[tuple, list] = {}
    for i, o in chosen.items():
        by_group.setdefault((o["pool"], o["group"]), []).append((i, o))
    # 상한에 의해 잘린 점수 배분(점수 낮은 것부터 잘림)
    applied = {i: o["points"] for i, o in chosen.items()}
    for pid, pool in pools.items():
        mem = sorted([(i, o) for i, o in chosen.items() if o["pool"] == pid], key=lambda x: -x[1]["points"])
        remain = pool["max_points"]
        for i, o in mem:
            applied[i] = min(o["points"], max(remain, 0))
            remain -= applied[i]
    if total_cap is not None:
        remain = total_cap
        for i in sorted(applied, key=lambda k: -applied[k]):
            a = min(applied[i], max(remain, 0))
            applied[i] = a
            remain -= a

    group_cnt = {k: len(v) for k, v in by_group.items()}
    pool_cnt = {}
    for o in chosen.values():
        pool_cnt[o["pool"]] = pool_cnt.get(o["pool"], 0) + 1
    chosen_kinds = {o["kind"]: (i, o) for i, o in chosen.items()}
    all_items = {it["idx"]: it for it in items_all}

    for r in rows:
        i = r["idx"]
        if r["status"]:
            continue
        if i in chosen:
            o = chosen[i]
            r["category"], r["points"] = o["group"], o["points"]
            r["applied"] = round(applied[i], 2)
            e = o["entry"]
            r["evidence"] = {"doc": e["doc"], "page": e["page"], "quote": e["quote"], "verified": e.get("evidence_verified", False)}
            rivals = [x for x in rows if x["idx"] != i and x["idx"] in all_items and x["category"] == o["group"] and x["idx"] not in chosen]
            if r["applied"] < o["points"]:
                r["status"], r["reason"] = ST_CAPPED, f"{pools[o['pool']]['label']} 상한 {pools[o['pool']]['max_points']}점 도달로 {r['applied']}점만 반영"
            elif rivals:
                r["status"], r["reason"] = ST_BEST, f"같은 {o['group']} 그룹에서 점수가 가장 높아 선택"
            else:
                r["status"] = ST_OK
            continue
        if i in best_all and i not in chosen:
            r.update(status=ST_UNVERIFIED, reason="공식 적용 범위가 확정되지 않은 규칙에서만 인정됨", interpretation_needed=True)
            continue
        it = all_items.get(i)
        if not it:
            r.update(status=ST_UNVERIFIED, reason="근거 검증된 규칙 없음")
            continue
        o = max(it["options"], key=lambda x: x["points"])
        kind_holder = chosen_kinds.get(o["kind"])
        pool = pools[o["pool"]]
        if same_kind and kind_holder:
            r.update(status=ST_KIND, reason=f"동일 종별({o['kind']})은 가장 높은 1개만 인정 → {rows[kind_holder[0]]['cert']} 인정")
        elif group_cnt.get((o["pool"], o["group"]), 0) >= pool["groups"].get(o["group"], 0):
            r.update(status=ST_GROUP, reason=f"{o['group']} 그룹 최대 {pool['groups'].get(o['group'], 0)}개 인정, 더 높은 점수 자격증이 선택됨")
        elif pool_cnt.get(o["pool"], 0) >= pool["max_count"]:
            r.update(status=ST_TOTAL, reason=f"{pool['label']} 전체 최대 {pool['max_count']}개 인정 초과")
        else:
            r.update(status=ST_CAPPED, reason="추가해도 가점 상한으로 증가 없음")

    usage = []
    for pid, pool in pools.items():
        for g, cap in pool["groups"].items():
            usage.append({"pool": pool["label"], "group": g, "used": group_cnt.get((pid, g), 0), "cap": cap})
        usage.append({"pool": pool["label"], "group": "전체", "used": pool_cnt.get(pid, 0), "cap": pool["max_count"],
                      "points": round(sum(applied[i] for i, o in chosen.items() if o["pool"] == pid), 2), "max_points": pool["max_points"]})

    others = _other_bonus(rec, profile)
    other_conf = sum(o["points"] for o in others if isinstance(o.get("points"), (int, float)) and o["status"] == ST_OK)
    ge = (pools_list[0].get("evidence") if pools_list else None)
    return {
        "available": True,
        "engine": "v2-exhaustive",
        "stage": sp.get("applies_to_stage"),
        "evaluation_type": sp.get("evaluation_type"),
        "base_score_note": sp.get("base_score_note"),
        "rows": rows,
        "others": others,
        "usage": usage,
        "held": len(certs),
        "recognized": len(chosen),
        "cert_points_confirmed": round(val_conf, 2),
        "cert_points_with_interpretation": round(val_all, 2),
        "total_confirmed": round(val_conf + other_conf, 2),
        "total_with_interpretation": round(val_all + other_conf, 2),
        "caps": {"general_max": pools_list[0]["max_points"] if pools_list else None, "general_max_count": pools_list[0]["max_count"] if pools_list else None,
                 "category_caps": pools_list[0]["groups"] if pools_list else {}, "cert_total_cap": total_cap},
        "interpretation_notes": [],
        "scope_resolution": rec.get("scope_resolution", []),
        "job": job,
        "truncated_search": trunc1 or trunc2,
        "policy_evidence": [e for e in [ge, sp.get("same_kind_evidence"), sp.get("cert_total_cap_evidence"), sp.get("grade_points_evidence"),
                                        sp.get("min_subject_ratio_note"), sp.get("validity_note")] if e],
        "rail_cert_note": (sp.get("rail_cert") or {}).get("note") or next((p.get("note") for p in policy_pools(sp) if not p.get("loaded", True)), None)
                          or "철도 직무 자격증 목록은 아직 반영하지 않음(보유 시 [참고4] 6항 직접 확인)",
    }


def _other_bonus(rec: dict, profile: dict) -> list[dict]:
    out = []
    intern = profile.get("intern") or {}
    rule_map = {o["id"]: o for o in rec.get("other_bonus_rules", [])}
    job = rec.get("job") or {}
    if "intern" in rule_map:
        o = rule_map["intern"]
        ev = {"doc": o["doc"], "page": o["page"], "quote": o["quote"], "verified": o.get("evidence_verified", False)}
        if not intern.get("is_korail_experience_intern"):
            st, pts, note = "해당 없음", 0, "한국철도공사 체험형 인턴 이력 없음(입력 기준)"
        elif not intern.get("completed_at"):
            st, pts, note = "확인 필요", None, "수료 전 - 수료 후 2년간 적용 가능, 수료일 입력 필요"
        elif _norm(intern.get("job_category")) not in (_norm(rec.get("job_category")), _norm(job.get("field")), _norm(job.get("series")) + _norm(job.get("field"))):
            st, pts, note = "확인 필요", None, f"인턴 근무 직렬({intern.get('job_category') or '미입력'})이 지원 직렬({rec.get('job_category')})과 동일해야 적용"
        else:
            st, pts, note = ST_OK, o["points"], "동일 직렬 체험형 인턴 수료"
        out.append({"item": o["item"], "status": st, "points": pts, "note": note, "evidence": ev})
    lang = rec.get("language_bonus")
    if lang:
        out.append({"item": "어학 성적", "status": "공고에 기준 없음", "points": None, "note": lang["text"], "evidence": None})
    return out
