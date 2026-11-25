"""LLM 공급자 공통 호출부.

- 프로젝트 루트 .env 를 읽어 환경변수로 설정(키 값은 로그·응답에 출력하지 않음)
- OPENAI_API_KEY 가 있으면 OpenAI(Chat Completions, JSON 모드), 없고 ANTHROPIC_API_KEY 가 있으면 Claude 사용
- 모델은 OPENAI_MODEL / ANTHROPIC_MODEL 환경변수로 변경 가능
"""
from __future__ import annotations

import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]


def load_env() -> None:
    p = ROOT / ".env"
    if not p.exists():
        return
    for line in p.read_text(encoding="utf-8-sig").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        k, v = k.strip(), v.strip().strip('"').strip("'")
        if k and v and not os.environ.get(k):
            os.environ[k] = v


load_env()


def provider() -> str | None:
    if os.environ.get("OPENAI_API_KEY"):
        return "openai"
    if os.environ.get("ANTHROPIC_API_KEY"):
        return "anthropic"
    return None


def model_name() -> str | None:
    p = provider()
    if p == "openai":
        return os.environ.get("OPENAI_MODEL", "gpt-4o-mini")
    if p == "anthropic":
        return os.environ.get("ANTHROPIC_MODEL", "claude-opus-5-5")
    return None


class LLMError(Exception):
    pass


def complete_json(system: str, user: str, max_tokens: int = 4000) -> dict:
    """system/user 프롬프트로 JSON 객체 하나를 받아 dict 로 반환. 실패 시 LLMError."""
    p = provider()
    if p == "openai":
        from openai import OpenAI, OpenAIError
        try:
            r = OpenAI(timeout=60).chat.completions.create(
                model=model_name(), max_tokens=max_tokens, temperature=0,
                response_format={"type": "json_object"},
                messages=[{"role": "system", "content": system}, {"role": "user", "content": user}])
        except OpenAIError as e:
            raise LLMError(f"OpenAI 호출 실패: {e.__class__.__name__}") from e
        text = r.choices[0].message.content or ""
        if r.choices[0].finish_reason == "length":
            raise LLMError("응답이 길이 제한으로 잘림")
    elif p == "anthropic":
        import anthropic
        try:
            r = anthropic.Anthropic().messages.create(model=model_name(), max_tokens=max_tokens, system=system,
                                                      output_config={"effort": "low"}, messages=[{"role": "user", "content": user}])
        except anthropic.APIError as e:
            raise LLMError(f"Claude 호출 실패: {e.__class__.__name__}") from e
        if r.stop_reason == "refusal":
            raise LLMError("요청 거부(refusal)")
        text = "".join(b.text for b in r.content if b.type == "text")
    else:
        raise LLMError("LLM API 키 미설정")
    text = text.strip()
    if text.startswith("```"):
        text = text.strip("`")
        text = text[4:] if text.startswith("json") else text
    try:
        return json.loads(text)
    except json.JSONDecodeError as e:
        raise LLMError("JSON 형식이 아닌 응답") from e
