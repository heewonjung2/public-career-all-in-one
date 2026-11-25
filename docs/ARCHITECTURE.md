# 아키텍처

```
사용자 (브라우저)
  │
  ▼
React 19 + TypeScript + Tailwind (frontend/, 빌드 후 FastAPI가 정적 파일로 서빙)
  │  REST /api/*
  ▼
FastAPI (backend/app/main.py)
  ├── source_verifier.py    공식 출처 검증(허용 도메인, 위장 도메인·블로그 차단, 리다이렉트 단계별 재검증, SSRF 차단, 30MB 제한)
  ├── document_parser.py    PyMuPDF 페이지별 텍스트, SHA-256, 근거 후보 탐색, 인용문 존재 확인
  ├── evidence_validator.py 규칙 파일의 모든 doc/page/quote를 공식 PDF 원문과 대조(서버 시작 시)
  ├── engine.py             지원 자격 판단 / 필기 가점 계산 / 출제범위 대비 준비 상태 (AI 미사용)
  ├── roadmap.py            규칙 기반 8주 로드맵
  └── ai_analyzer.py        (선택) Claude 구조화 추출 → Pydantic 검증 → 인용문 재검증 → '검증 필요' 저장
  │
  ├── SQLite (backend/app.db): profile, documents, roadmaps, study_tasks, notification_settings
  ├── data/official_documents/  JOB-ALIO에서 내려받은 공식 공고 PDF 보관본
  └── data/recruitment_rules/   공고 단위 검증 규칙(JSON, 모든 항목에 페이지·인용문)
```

## AI와 코드의 역할 분리
| AI (선택, 키 필요) | 코드 |
|---|---|
| 새 공고 PDF의 비정형 정보를 구조화 후보로 추출 | 출처 검증, 인용문 존재 검증, 자격 판단, 가점 계산, 유효기간·기준일, 일정·ICS, 중복 방지 |

AI가 추출한 결과는 사람이 원문과 대조해 규칙 파일로 확정하기 전까지 계산에 쓰이지 않습니다.

## 가점 계산 알고리즘 (코레일 2026 상반기 기준)
1. 보유 자격증을 [참고4] 가산대상 목록과 매칭합니다. 목록에 없으면 "가산대상 목록에 없음"으로 처리합니다.
2. 기준일(입사지원 마감일 2026-03-11) 이후 취득했거나 유효기간이 만료된 자격증은 "미인정"으로 처리합니다.
3. 동일 종별은 최고점 1개만 남깁니다.
4. 영역별 인정 개수를 적용합니다(공통직무 1, 안전 1, 직렬별 2).
5. 전체 최대 3개, 12점, 자격증 총 20점 상한을 적용합니다.
6. "해석 필요" 영역(직렬별 목록의 IT 적용 여부)을 제외한 합계와 포함한 합계를 각각 산출합니다.
