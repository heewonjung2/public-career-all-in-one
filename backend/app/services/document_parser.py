"""PDF 페이지별 텍스트 추출 + 근거 원문 검증."""
from __future__ import annotations

import hashlib
import re

import fitz  # PyMuPDF

KEYWORDS = {
    "지원자격": ["지원자격", "응시자격", "자격요건"],
    "어학": ["TOEIC", "토익", "어학", "TEPS", "OPIc", "TOEIC Speaking"],
    "가점/우대": ["가점", "우대", "가산"],
    "자격증": ["자격증", "기사", "산업기사", "정보처리"],
    "필기시험": ["필기", "NCS", "직업기초능력", "전공", "문항"],
    "일정": ["접수", "원서", "발표", "면접", "시험일"],
    "채용인원": ["채용인원", "모집인원", "선발인원", "명"],
}


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def extract_pages(pdf_bytes: bytes) -> list[str]:
    with fitz.open(stream=pdf_bytes, filetype="pdf") as doc:
        return [page.get_text("text") for page in doc]


def normalize(s: str) -> str:
    return re.sub(r"\s+", "", s or "")


def quote_exists(pages: list[str], page: int | None, quote: str) -> bool:
    """공백을 제거하고 비교해 근거 원문이 해당 페이지(없으면 전체)에 실제로 존재하는지 확인."""
    q = normalize(quote)
    if not q:
        return False
    if page and 1 <= page <= len(pages):
        return q in normalize(pages[page - 1])
    return any(q in normalize(p) for p in pages)


def locate_evidence(pages: list[str], max_per_topic: int = 6) -> dict[str, list[dict]]:
    """AI 없이도 쓸 수 있는 근거 후보 탐색: 주제 키워드가 있는 줄과 페이지를 돌려준다."""
    out: dict[str, list[dict]] = {}
    for topic, kws in KEYWORDS.items():
        hits = []
        for i, text in enumerate(pages, start=1):
            for line in text.splitlines():
                line_s = line.strip()
                if len(line_s) < 4:
                    continue
                if any(k.lower() in line_s.lower() for k in kws):
                    hits.append({"page": i, "text": line_s[:200]})
                    if len(hits) >= max_per_topic:
                        break
            if len(hits) >= max_per_topic:
                break
        out[topic] = hits
    return out


def is_text_pdf(pages: list[str]) -> bool:
    return sum(len(p.strip()) for p in pages) > 200
