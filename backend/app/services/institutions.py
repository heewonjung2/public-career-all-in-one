"""공공기관 검색: 공식 기관명 목록(ALIO 355 + 주요 지방공기업) + 약칭·부분 입력·띄어쓰기 차이 허용."""
from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path

PATH = Path(__file__).resolve().parents[3] / "data" / "institutions" / "institutions.json"
KNOWN_IDS = {"한국철도공사": "korail", "한국전력공사": "kepco", "서울교통공사": "seoulmetro"}


def norm(s: str) -> str:
    s = (s or "").lower()
    s = re.sub(r"\(주\)|\(재\)|\(사\)|주식회사|재단법인|학교법인", "", s)
    return re.sub(r"[\s·\-_.()]", "", s)


@lru_cache
def load() -> dict:
    d = json.loads(PATH.read_text(encoding="utf-8"))
    for i in d["institutions"]:
        i["id"] = KNOWN_IDS.get(i["name"], "org:" + i["name"])
        i["_n"] = norm(i["name"])
    return d


def _subseq(q: str, s: str) -> bool:
    it = iter(s)
    return all(ch in it for ch in q)


def search(q: str, group: str | None = None, limit: int = 20) -> dict:
    d = load()
    items = [i for i in d["institutions"] if not group or group == "전체" or i["group"] == group]
    nq = norm(q)
    if not nq:
        return {"query": q, "results": [_pub(i) for i in items], "total": len(items), "sources": d["sources"]}
    scored = []
    alias_target = next((v for k, v in d["aliases"].items() if norm(k) == nq), None)
    for i in items:
        s = i["_n"]
        if alias_target and i["name"] == alias_target:
            score, why = 100, f"약칭 '{q}'"
        elif s == nq:
            score, why = 95, "기관명 일치"
        elif s.startswith(nq):
            score, why = 85, "앞부분 일치"
        elif nq in s:
            score, why = 75, "부분 일치"
        elif len(nq) >= 2 and _subseq(nq, s) and len(s) <= len(nq) * 4:
            score, why = 50, "글자 순서 일치"
        else:
            continue
        scored.append((score, len(s), i, why))
    scored.sort(key=lambda x: (-x[0], x[1]))
    res = [dict(_pub(i), match=why) for _, _, i, why in scored[:limit]]
    return {"query": q, "results": res, "total": len(res), "sources": d["sources"]}


def _pub(i: dict) -> dict:
    return {k: v for k, v in i.items() if not k.startswith("_")}
