"""맞춤형 학습 로드맵 생성.

- 기본: 규칙 기반 생성기(공식 출제범위 × 사용자 준비 상태 → 우선순위). API 키 없이 항상 동작.
- ANTHROPIC_API_KEY 가 설정되면 ai_analyzer.generate_roadmap_ai 로 보강 가능(별도 표시).
"""
from __future__ import annotations

from .engine import LEVEL_SCORE

NCS_DETAIL = {
    "수리능력": ["응용수리: 소금물 농도 유형 20문제", "응용수리: 속력·거리·시간 유형 20문제", "응용수리: 원가·정가·할인 유형 20문제", "자료해석: 표·그래프 증감률 계산 15문제"],
    "의사소통능력": ["문서 이해(주제·일치/불일치) 20문제", "공문서·보도자료 독해 15문제"],
    "문제해결능력": ["명제·논리 추론 15문제", "조건 배치·규칙 적용 문제 15문제"],
}
MAJOR_DETAIL = {
    "운영체제": ["프로세스/스레드·스케줄링 정리", "교착상태·메모리 관리(페이징) 문제 풀이"],
    "데이터베이스": ["정규화·트랜잭션 ACID 정리", "SQL(JOIN/GROUP BY) 실전 문제"],
    "데이터통신": ["OSI 7계층·TCP/IP 정리", "오류 검출·다중화·라우팅 문제 풀이"],
    "소프트웨어공학": ["개발 생명주기·테스트 기법 정리", "UML·디자인 패턴 기출 풀이"],
    "정보보호개론": ["암호(대칭/비대칭/해시) 정리", "접근통제·네트워크 공격 유형 정리"],
    "전자계산기": ["컴퓨터구조: CPU·명령어 사이클 정리", "기억장치 계층·캐시·입출력 방식 문제"],
}


def from_strategy(opt: dict, weeks: int = 8) -> dict:
    """통합 전략 최적화 결과(주간 시간 배분 + 선택 자격증)를 주차별 체크리스트로 변환."""
    alloc = opt["weekly_allocation"]
    certs = opt["certificates"]["chosen"]
    plan = []
    for w in range(1, weeks + 1):
        tasks = []
        for a in alloc:
            s = a["subject"]
            pool = NCS_DETAIL.get(s) or MAJOR_DETAIL.get(s) or [f"{s} 조문·개념 정리"]
            detail = pool[(w - 1) % len(pool)]
            tasks.append({"title": f"{s} {a['hours']:g}시간 · {detail}", "category": s})
        for c in certs:
            tasks.append({"title": f"{c} 자격증 준비 (전략 배정 시간)", "category": "자격증"})
        if w >= weeks - 1:
            tasks.append({"title": "실전 모의고사 + 오답 정리 (과목별 40% 과락 주의)", "category": "실전"})
        plan.append({"week": w, "title": f"주 {opt['study_hours']:g}시간 배분 · {opt['strategy']['label']}", "tasks": tasks})
    return {"generator": "strategy_optimizer", "label": f"통합 전략 최적화 결과 적용({opt['strategy']['label']})",
            "summary": {"basis": "통합 취업 전략 최적화(한계효용 시간 배분 + 자격증 조합 완전탐색)",
                        "weakest_ncs": [s["subject"] for s in opt["subjects"] if s["kind"] == "NCS"][:1],
                        "weakest_major": [s["subject"] for s in opt["subjects"] if s["kind"] == "전공"][:3],
                        "daily_hours": round(opt["inputs"]["weekly_hours"] / 7, 1), "not_in_scope_note": []},
            "weeks": plan}


def _priority(status: str) -> int:
    return LEVEL_SCORE.get(status, 0)


def generate_rule_based(rec: dict, profile: dict, weeks: int = 8) -> dict:
    we = rec.get("written_exam") or rec.get("written_exam_reference") or {}
    ncs = profile.get("ncs_status", {}) or {}
    major = profile.get("major_status", {}) or {}
    if not major.get("전자계산기") and major.get("컴퓨터구조"):
        major = dict(major, 전자계산기=major["컴퓨터구조"])

    ncs_sorted = sorted(we.get("ncs_subjects", []), key=lambda s: _priority(ncs.get(s, "미시작")))
    major_sorted = sorted(we.get("major_subjects", []), key=lambda s: _priority(major.get(s, "미시작")))

    plan: list[dict] = []
    # 1~2주: 가장 약한 NCS + 가장 약한 전공 2과목
    phases = [
        (1, f"NCS 취약 영역 집중: {ncs_sorted[0] if ncs_sorted else 'NCS'}", [ncs_sorted[0]] if ncs_sorted else [], major_sorted[:1]),
        (2, f"NCS {ncs_sorted[0] if ncs_sorted else ''} 심화 + 전공 {', '.join(major_sorted[1:2])}", ncs_sorted[:1], major_sorted[1:2]),
        (3, f"전공 취약 과목: {', '.join(major_sorted[2:4])}", ncs_sorted[1:2], major_sorted[2:4]),
        (4, f"전공 나머지 과목: {', '.join(major_sorted[4:6])}", ncs_sorted[2:3], major_sorted[4:6]),
        (5, "철도법령 10문항 대비 + NCS 전 영역 혼합", ncs_sorted, []),
        (6, "전공 6과목 기출·실전 문제 풀이", [], major_sorted),
        (7, "실전 모의고사(70문항/70분) 2회 + 오답 정리", ncs_sorted, []),
        (8, "최종 오답 정리 및 시간 배분 연습", [], []),
    ][:weeks]
    for week, title, n_subj, m_subj in phases:
        tasks = []
        for s in n_subj:
            tasks += [{"title": t, "category": f"NCS·{s}"} for t in NCS_DETAIL.get(s, [f"{s} 문제 20문제"])[:2]]
        for s in m_subj:
            tasks += [{"title": t, "category": f"전공·{s}"} for t in MAJOR_DETAIL.get(s, [f"{s} 개념 정리"])[:2]]
        if week == 5:
            tasks.append({"title": "철도산업발전기본법·한국철도공사법·철도사업법 및 시행령 조문 정리", "category": "철도법령"})
        if week >= 7:
            tasks.append({"title": "70분 70문항 시간 배분 실전 연습 (과목별 40% 과락 주의)", "category": "실전"})
        if not tasks:
            tasks.append({"title": "주간 오답노트 복습", "category": "복습"})
        plan.append({"week": week, "title": title, "tasks": tasks})

    hours = profile.get("study_hours_per_day")
    summary = {
        "basis": "공식 공고의 필기 출제범위 × 내가 입력한 준비 상태 (규칙 기반 추천)",
        "weakest_ncs": ncs_sorted[:1],
        "weakest_major": major_sorted[:3],
        "daily_hours": hours,
        "not_in_scope_note": [s for s in major if s not in we.get("major_subjects", []) and s != "컴퓨터구조"],
    }
    return {"generator": "rule_based", "label": "규칙 기반 추천(공식 채용 요건 아님)", "summary": summary, "weeks": plan}
