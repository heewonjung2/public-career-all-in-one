# API (구현된 엔드포인트)

| Method | Endpoint | 기능 |
|---|---|---|
| GET | /api/health | 서버 상태, AI 활성 여부, 근거 검증 결과(checked/passed/failed) |
| GET/PUT | /api/profile | 사용자 스펙 조회/저장 |
| POST | /api/profile/reset-demo | 가상 데모 프로필로 초기화 |
| GET | /api/companies | 기업 목록, 허용 공식 도메인, 데이터 상태 |
| GET | /api/recruitments | 검증 공고 + 사용자 등록 문서 목록 |
| GET | /api/recruitments/{id} | 공고 상세(필기, 일정, 미확인 정보) |
| GET | /api/evidence/{id}/{doc}/{page} | 공식 PDF 해당 페이지 원문 텍스트 |
| GET | /api/documents/{id}/{doc}/file | 공식 PDF 보관본 |
| POST | /api/source/verify | URL 공식 출처 검증만 수행 |
| POST | /api/recruitments/import | 공식 출처 검증 후 다운로드·저장(해시 중복 방지) |
| POST | /api/documents/parse | PDF 업로드(사용자 업로드 · 공식 출처 미검증) |
| GET | /api/documents/{doc_id} | 등록 문서 정보 + 근거 후보 |
| POST | /api/documents/{doc_id}/ai-extract | (선택) AI 구조화 추출 |
| POST | /api/analysis | 지원 자격, 가점, 출제범위 분석, 경쟁력(판단 불가 사유) |
| POST | /api/simulate | 가상 자격증 추가 시 가점 변화 |
| GET | /api/simulate/options/{id} | 시뮬레이션 가능한 가산대상 자격증 |
| POST/GET | /api/roadmaps | 로드맵 생성/조회 |
| PATCH | /api/tasks/{id} | 학습 과제 완료 처리 |
| GET | /api/books | 추천 학습 주제, 서점 검색 링크(가격 미제공) |
| GET | /api/calendar/events | 공식 일정 |
| GET | /api/calendar/export | ICS 다운로드(근거 검증된 일정만) |
| GET/PUT | /api/notifications/settings | 알림 설정(발송 미구현) |
