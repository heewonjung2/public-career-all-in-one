"""규칙 파일의 모든 근거(doc/page/quote)가 실제 공식 PDF 원문에 존재하는지 검증한다.

검증에 실패한 근거가 하나라도 있으면 해당 공고는 'verification_issues'에 기록되고,
실패한 규칙은 계산에 사용되지 않도록 표시된다.
"""
from __future__ import annotations

from pathlib import Path

from .document_parser import extract_pages, quote_exists

_PAGE_CACHE: dict[str, list[str]] = {}


def load_pages(data_dir: Path, rel: str) -> list[str] | None:
    if rel in _PAGE_CACHE:
        return _PAGE_CACHE[rel]
    path = data_dir / rel
    if not path.exists():
        return None
    pages = extract_pages(path.read_bytes())
    _PAGE_CACHE[rel] = pages
    return pages


def _walk(node, out: list[dict]):
    if isinstance(node, dict):
        if "quote" in node and node.get("quote") and node.get("doc"):
            out.append(node)
        for v in node.values():
            _walk(v, out)
    elif isinstance(node, list):
        for v in node:
            _walk(v, out)


def validate_rulefile(rule: dict, data_dir: Path) -> dict:
    docs = rule.get("documents", {})
    items: list[dict] = []
    _walk({k: v for k, v in rule.items() if k != "documents"}, items)
    passed, failed = 0, []
    for ev in items:
        d = docs.get(ev["doc"])
        pages = load_pages(data_dir, d["local_file"]) if d else None
        ok = bool(pages) and quote_exists(pages, ev.get("page"), ev["quote"])
        ev["evidence_verified"] = ok
        if ok:
            passed += 1
        else:
            failed.append({"doc": ev["doc"], "page": ev.get("page"), "quote": ev["quote"]})
    return {"checked": len(items), "passed": passed, "failed": failed}


def page_text(rule: dict, data_dir: Path, doc: str, page: int) -> str | None:
    d = rule.get("documents", {}).get(doc)
    if not d:
        return None
    pages = load_pages(data_dir, d["local_file"])
    if not pages or not (1 <= page <= len(pages)):
        return None
    return pages[page - 1]
