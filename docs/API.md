# API

## 기본
| Method | Endpoint | 기능 |
|---|---|---|
| GET | /api/health | 상태, AI 활성 여부, 근거 검증 결과 |
| GET/PUT | /api/profile | 스펙 조회/저장 |
| POST | /api/profile/reset-demo | 데모 프로필 초기화 |
| GET | /api/companies | 기업, 허용 도메인, 데이터 상태 |
| GET | /api/recruitments, /api/recruitments/{id} | 공고 목록과 상세 |
| GET | /api/evidence/{id}/{doc}/{page} | 공식 PDF 페이지 원문 |
| GET | /api/documents/{id}/{doc}/file | 공식 PDF 보관본 |
| POST | /api/source/verify, /api/recruitments/import | 출처 검증, 검증 후 수집 |
| POST | /api/documents/parse | PDF 업로드(공식 출처 미검증) |
| GET/POST | /api/documents/{doc_id}, /api/documents/{doc_id}/ai-extract | 등록 문서, (선택) AI 추출 |
| POST | /api/analysis, /api/simulate | 자격·가점 분석, 시뮬레이션 |
| GET | /api/simulate/options/{id} | 가산대상 자격증 |
| POST/GET, PATCH | /api/roadmaps, /api/tasks/{id} | 로드맵, 과제 완료 |
| GET | /api/books, /api/calendar/events, /api/calendar/export | 학습 자료, 일정, ICS |
| GET/PUT | /api/notifications/settings | 알림 설정 |

## 통합 취업 전략
| Method | Endpoint | 기능 |
|---|---|---|
| POST | /api/strategy/optimize | 최적화(시간 배분, 자격증 조합, 과목 매트릭스, 요건 공백, 제외 기업) |
| POST | /api/strategy/compare | 전략 5종 결과 비교 |
| GET | /api/strategy/common-subjects | 목표 기업 과목 매트릭스 |
| POST | /api/strategy/certificate-efficiency | 자격증 취득 효율 |
| POST | /api/strategy/apply-roadmap | 전략 결과를 로드맵으로 생성 |

## 공식 문서 RAG
| Method | Endpoint | 기능 |
|---|---|---|
| POST | /api/chat/ask | 질문 → 범위 제어 → 검색 → 규칙 엔진, LLM 답변 또는 보류 |
| POST | /api/documents/index | 색인 재구축 |
| GET | /api/documents/search?q=&recruitment_id= | 검색 결과(BM25, IDF 적중률) |
| GET | /api/chat/sources | 상담 가능한 공고 버전 |
| DELETE | /api/chat/history | 서버 저장 없음 안내(기록은 브라우저 세션에만 있음) |

## 공고 변경 추적
| Method | Endpoint | 기능 |
|---|---|---|
| GET | /api/recruitments/{id}/versions | 버전 목록(해시 2종) |
| GET | /api/recruitments/{id}/changes | 감지된 변경, 수집 로그, 스케줄러 상태 |
| POST | /api/recruitments/{id}/refresh | 공식 첨부를 다시 내려받아 비교(1분 제한) |
| GET | /api/recruitments/{id}/impact | 사용자 영향 |
| GET | /api/recruitments/compare-link/{a}/{b} | 동일 모집 건 판정 |
| GET | /api/demo/correction | 시연용 가상 문서 A/B 전체 파이프라인 |
| GET, PATCH | /api/notifications, /api/notifications/{id}/read | 웹 알림 |
