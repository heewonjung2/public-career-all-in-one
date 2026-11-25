"""(선택) Claude API를 사용한 공식 문서 구조화 추출.

- ANTHROPIC_API_KEY 가 없으면 비활성화되며, 서비스는 수동 검증 규칙만 사용한다.
- AI 결과는 Pydantic으로 검증하고, 모든 근거 원문이 실제 문서에 존재하는지 코드로 재확인한다.
- AI 추출 결과는 '검증 필요' 상태로만 저장되며 자동으로 점수 계산에 쓰이지 않는다.
"""
from __future__ import annotations

import json
import os
from pathlib import Path

from pydantic import BaseModel, ValidationError

from .document_parser import quote_exists

PROMPT_PATH = Path(__file__).resolve().parents[1] / "prompts" / "recruitment_extraction.md"
MODEL = None  # llm.model_name() 사용


class Evidence(BaseModel):
    page: int | None = None
    quote: str | None = None


class ExtractedRule(BaseModel):
    item: str
    rule_text: str | None = None
    points: str | None = None
    evidence: Evidence


class Extraction(BaseModel):
    recruitment_title: str | None = None
    job_categories: list[str] = []
    eligibility_rules: list[ExtractedRule] = []
    bonus_rules: list[ExtractedRule] = []
    written_exam: list[ExtractedRule] = []
    schedule: list[ExtractedRule] = []
    missing_information: list[str] = []
    conflicts: list[str] = []


def ai_available() -> bool:
    from . import llm
    return llm.provider() is not None


def extract_with_ai(pages: list[str], job_category: str | None) -> dict:
    from . import llm
    if not ai_available():
        return {"status": "disabled", "message": "AI 미연동: LLM API 키(OPENAI_API_KEY 또는 ANTHROPIC_API_KEY)가 설정되지 않아 AI 추출을 실행하지 않았습니다. 근거 후보 탐색 결과와 수동 검증 규칙을 사용하세요."}

    system = PROMPT_PATH.read_text(encoding="utf-8")
    doc_text = "\n".join(f"<page number=\"{i}\">\n{p}\n</page>" for i, p in enumerate(pages, start=1))
    user = (f"대상 직렬: {job_category or '전체'}\n\n<document>\n{doc_text}\n</document>\n\n"
            "위 문서만 근거로 지정된 JSON 스키마에 맞춰 반환하세요. JSON 외의 텍스트는 출력하지 마세요.")
    try:
        raw = llm.complete_json(system, user, max_tokens=16000)
    except llm.LLMError as e:
        return {"status": "error", "message": f"AI 호출 실패: {e}"}
    try:
        data = Extraction.model_validate(raw)
    except ValidationError as e:
        return {"status": "invalid", "message": f"AI 응답이 스키마 검증에 실패: {str(e)[:200]}"}
    out = data.model_dump()
    issues = []
    for key in ("eligibility_rules", "bonus_rules", "written_exam", "schedule"):
        for r in out[key]:
            ev = r["evidence"]
            ok = bool(ev.get("quote")) and quote_exists(pages, ev.get("page"), ev["quote"])
            r["evidence_verified"] = ok
            if not ok:
                issues.append(f"{r['item']}: 근거 원문이 문서에서 확인되지 않음")
    return {"status": "extracted_needs_review", "model": llm.model_name(), "result": out, "verification_issues": issues,
            "message": "AI 추출 결과는 검증 필요 상태이며 점수 계산에 자동 반영되지 않습니다."}
