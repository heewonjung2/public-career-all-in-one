"""2027 사전예고 PDF → 규칙 파일 생성 (환산표는 PDF 텍스트 행 파싱)."""
import json
import re
import sys
from pathlib import Path

root = Path(sys.argv[1])
pages = (root / "data/official_documents/korail_2027_recruit_change_notice.pages.txt").read_text(encoding="utf-8").split("=== PAGE ")
table_rows = []
for pg in pages:
    if not pg.strip():
        continue
    no = int(pg.split(" ===")[0])
    if no < 4:
        continue
    lines = [l.strip() for l in pg.split("\n")[1:] if l.strip()]
    # 헤더 이후 숫자로 시작하는 TOEIC 값 기준으로 행 분리
    toks, rows, cur = [], [], None
    for l in lines:
        if re.fullmatch(r"\d{3}", l) and (cur is None or len(cur) >= 6):
            if cur:
                rows.append(cur)
            cur = [l]
        elif l.startswith("850이상"):
            cur = [l]
        elif cur is not None:
            if l.startswith("이하") or l.startswith("[단위"):
                continue
            cur.append(l)
    if cur:
        rows.append(cur)
    for r in rows:
        table_rows.append({"page": no, "cells": r})

conv = {"TOEIC": [], "JPT": [], "TEPS": [], "TOEIC Speaking": {}, "OPIc": {}, "HSK5": [], "HSK4": []}
# PyMuPDF find_tables() 결과(표 격자 기반) 사용 — 행·열 관계 보존
trows = json.loads((root / "data/official_documents/korail_2027_recruit_change_notice.table.json").read_text(encoding="utf-8"))


def rng(s):
    n = [int(x) for x in re.findall(r"\d+", s or "")]
    return (n[0], n[-1]) if n else None


conv["TOEIC Speaking"] = {"IH": 850, "AL": 850, "AM": 850, "AH": 850}
conv["OPIc"] = {"IM3": 850, "IH": 850, "AL": 850}
conv["TEPS"].append({"min": 336, "max": 600, "eq": 850})
conv["HSK5"].append({"min": 255, "max": 300, "eq": 850, "note": "255점이상"})
conv["HSK6_all"] = 850
for r in trows:
    _, toeic, teps, ts, op, jpt, h5, h4 = (r + [""] * 8)[:8]
    if toeic in ("TOEIC",) or "이상" in (toeic + jpt):
        continue
    eq = int(re.findall(r"\d+", toeic or jpt)[0])
    conv["TOEIC"].append(eq)
    if rng(teps):
        a, b = rng(teps); conv["TEPS"].append({"min": a, "max": b, "eq": eq})
    if ts and ts != "-":
        conv["TOEIC Speaking"][ts] = eq
    if op and op != "-":
        conv["OPIc"][op] = eq
    for key, v in (("HSK5", h5), ("HSK4", h4)):
        if rng(v):
            a, b = rng(v); conv[key].append({"min": a, "max": b, "eq": eq})
table_rows = []
for row in table_rows:
    c = row["cells"]
    if c[0].startswith("850이상"):
        eq = 850
        conv["TOEIC Speaking"]["IH"] = 850
        conv["TOEIC Speaking"]["AL"] = 850
        conv["TOEIC Speaking"]["AM"] = 850  # 'IH이상'
        conv["TOEIC Speaking"]["AH"] = 850
        conv["OPIc"]["IM3"] = 850
        conv["OPIc"]["IH"] = 850
        conv["OPIc"]["AL"] = 850  # 'IM3이상'
        conv["TEPS"].append({"min": 336, "max": 600, "eq": 850})
        conv["HSK5"].append({"min": 255, "max": 300, "eq": 850, "note": "255점이상(6급 전체)"})
        continue
    eq = int(c[0])
    teps = c[1]
    m = re.match(r"(\d+)\s*[~∼\-]\s*(\d+)", teps)
    if m:
        conv["TEPS"].append({"min": int(m.group(1)), "max": int(m.group(2)), "eq": eq})
    elif re.fullmatch(r"\d+", teps):
        conv["TEPS"].append({"min": int(teps), "max": int(teps), "eq": eq})
    rest = c[2:]
    grades = [x for x in rest if re.fullmatch(r"(IH|IM\d?|IL|NH|NM|NL)", x)]
    # 7열 행: [TS, OPIc, JPT, HSK5, HSK4]
    if len(rest) >= 5:
        ts, op, jpt, h5, h4 = rest[0], rest[1], rest[2], rest[3], rest[4]
        if ts != "-":
            conv["TOEIC Speaking"][ts] = eq
        if op != "-":
            conv["OPIc"][op] = eq
        for key, v in (("HSK5", h5), ("HSK4", h4)):
            mm = re.match(r"(\d+)\s*[~∼\-]\s*(\d+)", v)
            if mm:
                conv[key].append({"min": int(mm.group(1)), "max": int(mm.group(2)), "eq": eq})
            elif re.fullmatch(r"\d+", v):
                conv[key].append({"min": int(v), "max": int(v), "eq": eq})
    conv["TOEIC"].append(eq)

old = json.loads((root / "data/recruitment_rules/korail_2026H1_it.json").read_text(encoding="utf-8"))
doc = "notice"
rule = {
    "id": "korail-2027H1-preview",
    "company_id": "korail",
    "company": "한국철도공사",
    "recruitment_title": "2027년 상반기 채용방식 변경 사전예고",
    "notice_no": "2027년 채용제도 변경 사전예고(2026. 9. 15.)",
    "rule_version_type": "사전예고",
    "target_year": 2027,
    "recruitment_year": 2027,
    "half": "상반기",
    "recruitment_type": "신입(공개경쟁채용 등 필기에 전공시험 포함 분야)",
    "job_category": "사무영업(IT)",
    "location": None,
    "headcount": None,
    "published_at": "2026-09-16",
    "status_note": "공식 사전예고 자료이며 최종 채용공고가 아닙니다. 접수 기준일·세부 배점·자격증 목록은 2027년 최종 공고에서 확인해야 합니다.",
    "analysis_supported": True,
    "official_source": {"url": "https://info.korail.com/info/selectBbsNttView.do?bbsNo=198&key=733&nttNo=27302",
                        "site": "한국철도공사 공식 홈페이지 채용공고 게시판", "verification_status": "verified", "checked_at": "2026-11-25",
                        "verified_by": "공식 첨부 PDF 다운로드 후 원문 대조, 표는 페이지 이미지로 육안 대조"},
    "documents": {"notice": {"name": "2027년 채용방식 개선 사전예고.pdf", "url": "https://info.korail.com/info/downloadBbsFile.do?atchmnflNo=28602",
                             "local_file": "official_documents/korail_2027_recruit_change_notice.pdf"}},
    "job": {"series": "사무영업", "field": "IT", "source": "직렬 계층은 2026 상반기 공고(과거 기준) 참고 — 2027 최종 공고에서 재확인 필요",
            "evidence": [{"what": "2027 사전예고의 사무영업 분야 비율", "doc": doc, "page": 2, "quote": "공개경쟁(사무영업/열차승무)"}]},
    "eligibility_rules": [
        {"id": "language_required", "item": "어학성적", "type": "not_in_notice",
         "rule_text": "어학성적·자격증 미보유자도 입사지원 가능(서류 점수에만 반영)", "doc": doc, "page": 1, "quote": "공인 어학성적 또는 자격증 미보유자도 입사지원 가능"},
        {"id": "etc_2027", "item": "연령·학력·병역 등", "type": "pending_final_notice",
         "rule_text": "사전예고에는 지원자격 변경 내용이 없음 → 2027 최종 공고 확인 필요(2026 기준은 과거 참고)", "doc": None, "page": None, "quote": None},
    ],
    "document_screening": {
        "type": "점수제",
        "applies_to": "공개경쟁채용, 자격증제한경쟁채용(운전 및 관제) 등 필기시험에 전공시험이 포함되는 분야",
        "applies_evidence": {"doc": doc, "page": 1, "quote": "필기시험에 전공시험이 포함되는 분야"},
        "selection_ratio": 10,
        "selection_evidence": {"doc": doc, "page": 1, "quote": "100점 만점을 기준으로 채용예정인원의 10배수이내 선발"},
        "weights": {"사무영업": {"language": 60, "cert": 40, "multiplier": 2}, "열차승무": {"language": 60, "cert": 40, "multiplier": 2},
                    "기타": {"language": 40, "cert": 60, "multiplier": 3}},
        "weights_evidence": {"doc": doc, "page": 2, "quote": "60+(자격증 점수×2)"},
        "full_language_toeic": 850,
        "formula": "TOEIC 환산 850점 이상: 어학배점 + 자격증점수×배수 / 미만: (환산점수÷850)×어학배점 + 자격증점수×배수",
        "formula_evidence": {"doc": doc, "page": 2, "quote": "{(어학성적÷850)×60}+(자격증 점수×2)"},
        "cert_raw_max": 20,
        "cert_evidence": {"doc": doc, "page": 2, "quote": "필기시험 우대 가점 자격증과 동일하게 반영하여 원점수 20점*을 구성"},
        "cert_combo_evidence": {"doc": doc, "page": 3, "quote": "일반 자격증 3개 조합 최대 12점 반영, 철도 직무 자격증 2개 조합 최대 8점 반영"},
        "required_cert_excluded": {"doc": doc, "page": 3, "quote": "지원자격에 해당 하는 필수 자격증은 자격증 점수에 미반영"},
        "veteran_disabled_bonus": {"doc": doc, "page": 2, "quote": "보훈 및 장애인 가산점 적용"},
        "intern_exemption": {"text": "체험형 인턴 우수 수료자는 서류전형 면제, 서류 합격 10배수 인원에 포함", "doc": doc, "page": 3, "quote": "공사 체험형 인턴사원 우수 수료자는 서류전형을"},
        "self_intro": {"text": "자기소개서는 필기시험 합격자만 제출", "doc": doc, "page": 1, "quote": "자기소개서는 필기시험 합격자에 한하여 제출"},
        "previous": {"text": "기존: 자기소개서 AI 검증 후 적격자 전원 서류전형 합격", "doc": doc, "page": 1, "quote": "적격자 전원 서류전형 합격"},
        "cert_list_status": "2027 최종 공고의 필기 우대 가점 자격증 목록이 아직 없으므로 2026 상반기 목록([참고4])을 참고 적용 → 자격증 점수는 '예상'",
    },
    "language_policy": {
        "required": False,
        "accepted_tests": ["TOEIC", "TOEIC Speaking", "TEPS", "OPIc", "JPT", "HSK"],
        "tests_evidence": {"doc": doc, "page": 2, "quote": "TOEIC/TOEIC SPEAKING/TEPS/OPIC/JPT/HSK를"},
        "opic_english_only": True,
        "opic_evidence": {"doc": doc, "page": 2, "quote": "OPIC의 경우 ‘영어’ 시험 성적만 인정"},
        "validity_years": 2,
        "validity_basis": "성적 취득일",
        "validity_evidence": {"doc": doc, "page": 2, "quote": "공인 어학성적 유효기간은 성적 취득일로부터 2년으로 하고"},
        "prereg_accepted": True,
        "prereg_rule": "국가공무원채용시스템(어학성적 사전등록)에 등록한 경우 해당 시스템이 인정하는 기간까지 유효",
        "prereg_evidence": {"doc": doc, "page": 2, "quote": "국가공무원채용"},
        "reference_date": None,
        "reference_date_note": "유효기간 판단 기준일(접수 마감일 등)은 2027 최종 공고에서 확정 — 현재는 오늘 날짜로 잠정 판단",
        "conversion": conv,
        "conversion_evidence": {"doc": doc, "page": 4, "quote": "서류전형 공인 어학성적 점수 환산표"},
        "hearing_impaired_note": {"doc": doc, "page": 3, "quote": "청각장애인(심한 장애에 한함) 입사지원자의"},
    },
    # 자격증 규칙: '필기 우대 가점 자격증과 동일' → 2026 목록을 참고 기준으로 복사(미확정 표시)
    "score_policy": dict(old["score_policy"], reference_date=None, calculation_verified=True,
                         reference_note="2027 기준일 미정 — 취득일 판단은 잠정(오늘 기준)"),
    "cert_catalog": [dict(c, source_version="korail-2026H1-it", provisional=True) for c in old["cert_catalog"]],
    "cert_catalog_note": "2027 필기 우대 가점 자격증 목록 미발표 → 2026 상반기 [참고4] 목록을 참고 적용(예상치)",
    "documents_ref_2026": {"reference": old["documents"]["reference"]},
    "other_bonus_rules": [],
    "written_exam": None,
    "written_exam_note": "사전예고에 필기시험 구성 변경 내용 없음 → 변경 여부 미공개(2026 상반기 구성은 과거 참고)",
    "schedule": [],
    "missing_information": ["2027 접수 기간·기준일", "2027 필기 우대 가점 자격증 목록(2026 목록 준용 여부)", "필기시험 구성 변경 여부",
                            "체험형 인턴 '우수 수료자' 세부 기준", "지원자격(연령·병역 등) 변경 여부", "채용 인원"],
    "changes_vs_2026": [
        {"item": "서류전형 방식", "before": "자기소개서 적격/부적격(적격자 전원 합격)", "after": "어학+자격증 100점 점수제, 10배수 선발", "status": "공식 발표된 변경 예정",
         "evidence": {"doc": doc, "page": 1, "quote": "고득점자 순 10배수이내 선발"}},
        {"item": "어학성적", "before": "반영하지 않음", "after": "사무영업 60점 배점(TOEIC 환산 850 이상 만점), 6종 시험 인정", "status": "공식 발표된 변경 예정",
         "evidence": {"doc": doc, "page": 2, "quote": "TOEIC/TOEIC SPEAKING/TEPS/OPIC/JPT/HSK를"}},
        {"item": "자격증", "before": "필기 우대 가점(최대 20점)", "after": "서류 점수에 원점수×2(사무영업) 반영 — 필기 가점 목록과 동일 기준", "status": "공식 발표된 변경 예정",
         "evidence": {"doc": doc, "page": 2, "quote": "필기시험 우대 가점 자격증과 동일하게 반영하여 원점수 20점*을 구성"}},
        {"item": "자기소개서", "before": "서류전형에서 제출·AI 검증", "after": "필기시험 합격자만 제출", "status": "공식 발표된 변경 예정",
         "evidence": {"doc": doc, "page": 1, "quote": "자기소개서는 필기시험 합격자에 한하여 제출"}},
        {"item": "체험형 인턴", "before": "필기 가점 2점(동일 직렬)·우수자 1점", "after": "우수 수료자 서류전형 면제(10배수에 포함). 필기 가점 유지 여부는 미공개", "status": "공식 발표된 변경 예정",
         "evidence": {"doc": doc, "page": 3, "quote": "공사 체험형 인턴사원 우수 수료자는 서류전형을"}},
        {"item": "필기 우대 가점", "before": "자격증 최대 20점 등", "after": "사전예고에 변경 언급 없음", "status": "세부 기준 미확정", "evidence": None},
        {"item": "필기시험 구성", "before": "NCS 30·전공 30·철도법령 10, 70분", "after": "사전예고에 언급 없음", "status": "최종 채용공고 확인 필요", "evidence": None},
    ],
}
def remap(o):
    """2026 문서 근거를 2027 파일 안에서 별도 문서 키로 참조(과거 참고 기준임을 명시)."""
    if isinstance(o, dict):
        o = {k: remap(v) for k, v in o.items()}
        if o.get("quote") and o.get("doc") in ("notice", "reference"):
            o["doc"] = "ref2026_" + o["doc"]
        return o
    if isinstance(o, list):
        return [remap(x) for x in o]
    return o


rule["score_policy"] = remap(rule["score_policy"])
rule["cert_catalog"] = remap(rule["cert_catalog"])
rule["documents"]["ref2026_notice"] = dict(old["documents"]["notice"], name="[과거 참고] " + old["documents"]["notice"]["name"])
rule["documents"]["ref2026_reference"] = dict(old["documents"]["reference"], name="[과거 참고] " + old["documents"]["reference"]["name"])
rule.pop("documents_ref_2026", None)
out = root / "data/recruitment_rules/korail_2027H1_preview.json"
out.write_text(json.dumps(rule, ensure_ascii=False, indent=2), encoding="utf-8")
print("rows", len(table_rows), "toeic", len(conv["TOEIC"]), "teps", len(conv["TEPS"]), "TS", conv["TOEIC Speaking"], "OPIc", conv["OPIc"], "HSK5", len(conv["HSK5"]), "HSK4", len(conv["HSK4"]))
