"""시연용 가상 정정 공고 테스트 문서 생성기.

실제 기관의 공고가 아니다. '시연용 가상기관'의 최초 공고(A)와 정정 공고(B)를 만들어
변경 감지 파이프라인을 시연·테스트하는 데만 사용한다.
실행: backend/.venv/Scripts/python.exe data/demo/correction_test/generate.py
"""
import json
from pathlib import Path

import pymupdf

HERE = Path(__file__).resolve().parent

COMMON_HEAD = ["[시연용 가상 테스트 문서 - 실제 기관의 채용공고가 아님]", "시연용 가상기관 2026년 신입사원 채용 공고", "[가상기관 2026-01호]"]

A = COMMON_HEAD + [
    "□ 모집 분야: 전산(IT) 10명",
    "□ 지원 자격",
    "연령 제한없음(단, 2009. 1. 1.이후 출생자는 불가)",
    "학력 및 전공 제한없음",
    "□ 일정",
    "입사지원서 접수 2026. 3. 2. ~ 3. 6. 18:00",
    "필기시험 2026. 3. 21.(토)",
    "□ 자격증 가산점 (최대 2개, 최대 8점)",
    "정보처리기사 4.0점",
    "컴퓨터활용능력 1급 2.5점",
    "한국사능력검정시험 1급 2.5점",
    "□ 필기 전공: 운영체제, 데이터베이스, 네트워크",
]

B = [COMMON_HEAD[0], "시연용 가상기관 2026년 신입사원 채용 정정 공고", "[가상기관 2026-01호 정정]"] + [
    "□ 모집 분야: 전산(IT) 12명",
    "□ 지원 자격",
    "연령 제한없음(단, 2009. 1. 1.이후 출생자는 불가)",
    "학력 및 전공 제한없음",
    "□ 일정",
    "입사지원서 접수 2026. 3. 2. ~ 3. 9. 18:00",
    "필기시험 2026. 3. 21.(토)",
    "□ 자격증 가산점 (최대 2개, 최대 8점)",
    "정보처리기사 4.0점",
    "컴퓨터활용능력 1급 2.5점",
    "SQLD 2.5점",
    "□ 필기 전공: 운영체제, 데이터베이스, 네트워크, 정보보안",
]


def make_pdf(lines, path, title):
    doc = pymupdf.open()
    page = doc.new_page()
    y = 60
    for ln in lines:
        page.insert_text((50, y), ln, fontname="korea", fontsize=11)
        y += 22
    doc.set_metadata({"title": title, "producer": "demo-generator"})
    doc.save(path)


def rule(version, lines_head, headcount, end, certs, subjects, notice_no, corrects=None):
    cat = []
    for name, lv, grade, cat_name, kind, quote in certs:
        cat.append({"name": name, "levels": [lv] if lv else [], "kind": kind, "category": "공통직무", "grade": grade,
                    "doc": "notice", "page": 1, "quote": quote})
    return {
        "id": "demo-correction", "is_demo": True, "company_id": "demo", "company": "시연용 가상기관",
        "recruitment_title": lines_head, "notice_no": notice_no, "corrects_notice_no": corrects,
        "recruitment_year": 2026, "half": "상반기", "recruitment_type": "신입", "job_category": "전산(IT)", "location": "가상",
        "headcount": headcount, "published_at": "2026-02-25" if version == 1 else "2026-02-27",
        "official_source": {"url": None, "site": "시연용 가상 문서", "verification_status": "demo", "checked_at": None},
        "documents": {"notice": {"name": f"demo_v{version}.pdf", "url": None, "local_file": f"demo/correction_test/demo_v{version}.pdf"}},
        "headcount_evidence": {"doc": "notice", "page": 1, "quote": f"모집 분야: 전산(IT) {headcount}명"},
        "eligibility_rules": [
            {"id": "age", "item": "연령", "type": "birth_range", "params": {"born_after": "1900-01-01", "born_before": "2009-01-01"},
             "rule_text": "연령 제한없음(2009.1.1. 이후 출생자 불가)", "doc": "notice", "page": 1, "quote": "연령 제한없음(단, 2009. 1. 1.이후 출생자는 불가)"},
            {"id": "education", "item": "학력 및 전공", "type": "no_limit", "rule_text": "제한없음", "doc": "notice", "page": 1, "quote": "학력 및 전공 제한없음"},
        ],
        "score_policy": {"evaluation_type": "필기 + 가점", "applies_to_stage": "필기", "grade_points": {"기사": 4.0, "산업기사": 2.5, "기능사": 1.0, "기술사": 5.5, "기능장": 5.5},
                         "general_cert": {"category_caps": {"공통직무": 2}, "max_count": 2, "max_points": 8,
                                          "evidence": {"doc": "notice", "page": 1, "quote": "자격증 가산점 (최대 2개, 최대 8점)"}},
                         "cert_total_cap": 8, "same_kind_highest_only": True, "reference_date": end, "calculation_verified": True},
        "cert_catalog": cat,
        "written_exam": {"ncs_subjects": [], "major_subjects": subjects, "composition": {}, "question_count": None, "evidence": []},
        "schedule": [
            {"type": "접수시작", "date": "2026-03-02", "label": "입사지원서 접수 시작", "doc": "notice", "page": 1, "quote": "입사지원서 접수 2026. 3. 2."},
            {"type": "접수마감", "date": end, "label": "입사지원서 접수 마감", "doc": "notice", "page": 1, "quote": f"~ 3. {int(end[-2:])}. 18:00"},
            {"type": "필기", "date": "2026-03-21", "label": "필기시험", "doc": "notice", "page": 1, "quote": "필기시험 2026. 3. 21.(토)"},
        ],
    }


if __name__ == "__main__":
    make_pdf(A, HERE / "demo_v1.pdf", "demo v1")
    make_pdf(B, HERE / "demo_v2.pdf", "demo v2")
    # 메타데이터만 다른 사본(내용 동일) - 테스트용
    make_pdf(A, HERE / "demo_v1_meta.pdf", "demo v1 (metadata changed)")
    ra = rule(1, A[1], 10, "2026-03-06",
              [("정보처리기사", "", "기사", "", "정보처리", "정보처리기사 4.0점"),
               ("컴퓨터활용능력", "1급", "산업기사", "", "컴퓨터활용능력", "컴퓨터활용능력 1급 2.5점"),
               ("한국사능력검정시험", "1급", "산업기사", "", "한국사능력검정", "한국사능력검정시험 1급 2.5점")],
              ["운영체제", "데이터베이스", "네트워크"], "[가상기관 2026-01호]")
    rb = rule(2, B[1], 12, "2026-03-09",
              [("정보처리기사", "", "기사", "", "정보처리", "정보처리기사 4.0점"),
               ("컴퓨터활용능력", "1급", "산업기사", "", "컴퓨터활용능력", "컴퓨터활용능력 1급 2.5점"),
               ("SQLD", "", "산업기사", "", "SQL", "SQLD 2.5점")],
              ["운영체제", "데이터베이스", "네트워크", "정보보안"], "[가상기관 2026-01호 정정]", corrects="[가상기관 2026-01호]")
    (HERE / "demo_rule_v1.json").write_text(json.dumps(ra, ensure_ascii=False, indent=1), encoding="utf-8")
    (HERE / "demo_rule_v2.json").write_text(json.dumps(rb, ensure_ascii=False, indent=1), encoding="utf-8")
    print("generated")
