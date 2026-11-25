"""채용공고 버전 관리 + 정정 공고 변경 감지.

단계:
 1) 파일 SHA-256 비교 (바이너리 동일 여부)
 2) 정규화 텍스트 해시 비교 (메타데이터·생성시각만 바뀐 경우 '변경 없음')
    - 정규화: 줄 끝 공백 제거, 연속 공백 1칸, 빈 줄 제거. 숫자·날짜·표의 줄 구조는 유지
 3) difflib 줄 단위 원문 Diff (추가/삭제/수정)
 4) 구조화 규칙 Diff (모집 인원·일정·지원자격·자격증 등급/목록·가점 상한·시험 과목)
 5) 중요도 분류(서비스 내부 알림 기준) + 사용자 영향 분석(규칙 엔진 재실행)
동일 모집 건 판정이 불명확하면 자동 연결하지 않는다.
"""
from __future__ import annotations

import difflib
import hashlib
import re

from . import engine

SCHEMA = """
CREATE TABLE IF NOT EXISTS recruitment_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recruitment_id TEXT NOT NULL, version_number INTEGER NOT NULL, label TEXT,
  source_url TEXT, attachment_url TEXT, published_at TEXT, fetched_at TEXT,
  raw_file_hash TEXT, normalized_text_hash TEXT, previous_version_id INTEGER,
  verification_status TEXT, is_demo INTEGER DEFAULT 0, change_summary TEXT,
  UNIQUE(recruitment_id, version_number)
);
CREATE TABLE IF NOT EXISTS recruitment_changes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recruitment_id TEXT, from_version INTEGER, to_version INTEGER, detected_at TEXT,
  items TEXT, text_diff TEXT, impact TEXT, is_demo INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dedupe_key TEXT UNIQUE, recruitment_id TEXT, title TEXT, body TEXT, severity TEXT,
  created_at TEXT, read INTEGER DEFAULT 0, is_demo INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS collection_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recruitment_id TEXT, checked_at TEXT, status TEXT, detail TEXT
);
"""

SEVERITY = {
    "접수 마감일": "매우 중요", "접수 시작일": "매우 중요", "필기시험일": "매우 중요", "면접일": "중요",
    "지원 자격": "매우 중요", "모집 직렬": "매우 중요", "인정 자격증": "매우 중요", "자격증 가점": "매우 중요", "가점 상한": "매우 중요",
    "모집 인원": "중요", "시험 과목": "중요", "전형 절차": "중요", "발표일": "중요",
}


def sha(b: bytes | str) -> str:
    if isinstance(b, str):
        b = b.encode("utf-8")
    return hashlib.sha256(b).hexdigest()


def normalize_text(pages: list[str]) -> str:
    out = []
    for p in pages:
        for ln in p.splitlines():
            ln = re.sub(r"[ \t ]+", " ", ln).strip()
            if ln:
                out.append(ln)
    return "\n".join(out)


def compare_files(old_raw: bytes, new_raw: bytes, old_pages: list[str], new_pages: list[str]) -> dict:
    raw_same = sha(old_raw) == sha(new_raw)
    t_old, t_new = normalize_text(old_pages), normalize_text(new_pages)
    text_same = sha(t_old) == sha(t_new)
    status = "동일 파일" if raw_same else ("메타데이터만 변경(내용 동일)" if text_same else "내용 변경")
    return {"raw_same": raw_same, "text_same": text_same, "status": status,
            "diff": [] if text_same else text_diff(t_old, t_new)}


def text_diff(a: str, b: str) -> list[dict]:
    al, bl = a.splitlines(), b.splitlines()
    out = []
    for op, i1, i2, j1, j2 in difflib.SequenceMatcher(None, al, bl, autojunk=False).get_opcodes():
        if op == "equal":
            continue
        if op == "replace":
            for k in range(max(i2 - i1, j2 - j1)):
                o = al[i1 + k] if i1 + k < i2 else None
                n = bl[j1 + k] if j1 + k < j2 else None
                out.append({"type": "modified" if o and n else ("deleted" if o else "added"), "old": o, "new": n})
        elif op == "delete":
            out += [{"type": "deleted", "old": x, "new": None} for x in al[i1:i2]]
        elif op == "insert":
            out += [{"type": "added", "old": None, "new": x} for x in bl[j1:j2]]
    return out


# ------------------------------------------------------------------ 동일 모집 건 판정
def _notice_base(no: str | None) -> str:
    return re.sub(r"\s", "", no or "")


def same_recruitment(old: dict, new: dict) -> dict:
    reasons = []
    if new.get("corrects_notice_no"):
        if _notice_base(new["corrects_notice_no"]) == _notice_base(old.get("notice_no")):
            return {"decision": "same", "reasons": ["정정 공고가 원 공고 번호를 명시함"]}
        return {"decision": "different", "reasons": ["정정 대상 공고 번호가 다름"]}
    if _notice_base(new.get("notice_no")) and _notice_base(new.get("notice_no")) == _notice_base(old.get("notice_no")):
        if new.get("company_id") == old.get("company_id"):
            return {"decision": "same", "reasons": ["동일 기관·동일 공고 번호"]}
    for k in ("company_id", "recruitment_year", "half", "recruitment_type"):
        if old.get(k) != new.get(k):
            reasons.append(f"{k} 불일치")
    if reasons:
        return {"decision": "different", "reasons": reasons}
    return {"decision": "uncertain", "reasons": ["공고 번호가 다르고 정정 대상 명시가 없음 - 자동 연결하지 않음(확인 필요)"]}


# ------------------------------------------------------------------ 구조화 규칙 Diff
def _sched(rule):
    m = {"접수시작": "접수 시작일", "접수마감": "접수 마감일", "필기": "필기시험일", "면접": "면접일"}
    out = {}
    for s in rule.get("schedule", []):
        key = m.get(s["type"], f"발표일:{s['label']}")
        out[key] = (s["date"] + (f"~{s['end']}" if s.get("end") else ""), s)
    return out


def _certs(rule):
    return {(c["name"] + " " + "/".join(c.get("levels", []))).strip(): (c["grade"], c) for c in rule.get("cert_catalog", [])}


def rule_diff(old: dict, new: dict) -> list[dict]:
    items = []

    def add(field, before, after, ev_old=None, ev_new=None):
        base = field.split(":")[0]
        items.append({"field": field, "before": before, "after": after,
                      "severity": SEVERITY.get(base, "일반"), "evidence_old": ev_old, "evidence_new": ev_new})

    if old.get("headcount") != new.get("headcount"):
        add("모집 인원", old.get("headcount"), new.get("headcount"), _ev(old.get("headcount_evidence")), _ev(new.get("headcount_evidence")))
    if old.get("job_category") != new.get("job_category"):
        add("모집 직렬", old.get("job_category"), new.get("job_category"))
    so, sn = _sched(old), _sched(new)
    for k in sorted(set(so) | set(sn)):
        a, b = so.get(k, (None, None)), sn.get(k, (None, None))
        if a[0] != b[0]:
            add(k if not k.startswith("발표일:") else "발표일:" + k.split(":", 1)[1], a[0], b[0], _ev(a[1]), _ev(b[1]))
    eo = {e["id"]: e for e in old.get("eligibility_rules", [])}
    en = {e["id"]: e for e in new.get("eligibility_rules", [])}
    for k in sorted(set(eo) | set(en)):
        a, b = eo.get(k), en.get(k)
        if (a or {}).get("rule_text") != (b or {}).get("rule_text") or (a or {}).get("params") != (b or {}).get("params"):
            add(f"지원 자격:{(a or b)['item']}", (a or {}).get("rule_text"), (b or {}).get("rule_text"), _ev(a), _ev(b))
    co, cn = _certs(old), _certs(new)
    for k in sorted(set(co) | set(cn)):
        a, b = co.get(k), cn.get(k)
        if not a:
            add(f"인정 자격증:{k}", "목록에 없음", f"추가({b[0]})", None, _ev(b[1]))
        elif not b:
            add(f"인정 자격증:{k}", f"인정({a[0]})", "목록에서 삭제", _ev(a[1]), None)
        elif a[0] != b[0]:
            add(f"자격증 가점:{k}", a[0], b[0], _ev(a[1]), _ev(b[1]))
    po, pn = old.get("score_policy") or {}, new.get("score_policy") or {}
    if po.get("grade_points") != pn.get("grade_points"):
        add("자격증 가점:등급별 점수", po.get("grade_points"), pn.get("grade_points"))
    for key, label in (("max_points", "일반 자격증 상한"), ("max_count", "인정 개수")):
        a, b = (po.get("general_cert") or {}).get(key), (pn.get("general_cert") or {}).get(key)
        if a != b:
            add(f"가점 상한:{label}", a, b, _ev((po.get("general_cert") or {}).get("evidence")), _ev((pn.get("general_cert") or {}).get("evidence")))
    wo, wn = old.get("written_exam") or {}, new.get("written_exam") or {}
    if wo.get("major_subjects") != wn.get("major_subjects") or wo.get("ncs_subjects") != wn.get("ncs_subjects"):
        add("시험 과목", ", ".join(wo.get("ncs_subjects", []) + wo.get("major_subjects", [])),
            ", ".join(wn.get("ncs_subjects", []) + wn.get("major_subjects", [])))
    order = {"매우 중요": 0, "중요": 1, "일반": 2}
    items.sort(key=lambda x: order[x["severity"]])
    return items


def _ev(x):
    if x and x.get("quote"):
        return {"doc": x["doc"], "page": x["page"], "quote": x["quote"], "verified": x.get("evidence_verified", False)}
    return None


# ------------------------------------------------------------------ 사용자 영향
def impact(old: dict, new: dict, profile: dict, items: list[dict]) -> dict:
    eo, en = engine.check_eligibility(old, profile), engine.check_eligibility(new, profile)
    bo, bn = engine.calculate_bonus(old, profile), engine.calculate_bonus(new, profile)
    out = []
    if eo["overall"] != en["overall"]:
        out.append({"type": "지원 자격", "text": f"지원 자격 판단이 '{eo['overall']}' → '{en['overall']}'(으)로 바뀝니다."})
    if bo.get("available") and bn.get("available"):
        d = round(bn["total_confirmed"] - bo["total_confirmed"], 1)
        if d:
            out.append({"type": "가점", "text": f"내 확정 가점이 {bo['total_confirmed']}점 → {bn['total_confirmed']}점({'+' if d > 0 else ''}{d}점)으로 바뀝니다."})
        so = {r["cert"]: r["status"] for r in bo["rows"]}
        for r in bn["rows"]:
            if so.get(r["cert"]) != r["status"]:
                out.append({"type": "보유 자격증", "text": f"{r['cert']}: {so.get(r['cert'])} → {r['status']}"})
    if any(i["field"] in ("접수 마감일", "접수 시작일", "필기시험일", "면접일") or i["field"].startswith("발표일") for i in items):
        out.append({"type": "캘린더", "text": "확정 일정이 변경되어 캘린더 일정 수정이 필요합니다."})
    if any(i["field"] == "시험 과목" for i in items):
        out.append({"type": "로드맵", "text": "필기 출제 범위가 바뀌어 학습 로드맵 재생성이 필요합니다."})
    unverified = [i for i in items if (i.get("evidence_new") and not i["evidence_new"].get("verified"))]
    return {"items": out, "before": {"eligibility": eo["overall"], "bonus": bo.get("total_confirmed")},
            "after": {"eligibility": en["overall"], "bonus": bn.get("total_confirmed")},
            "needs_confirmation": bool(unverified),
            "note": "검증되지 않은 변경이 있어 분석을 자동 확정하지 않습니다." if unverified else "모든 변경 근거가 수정 문서 원문에서 확인되었습니다."}
