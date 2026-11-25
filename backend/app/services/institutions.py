"""공공기관 검색: 공식 기관명 목록(ALIO 355 + 주요 지방공기업) + 약칭·부분 입력·띄어쓰기 차이 허용."""
from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path

PATH = Path(__file__).resolve().parents[3] / "data" / "institutions" / "institutions.json"
EXTRA = PATH.parent / "extra_institutions.json"
KNOWN_IDS = {"한국철도공사": "korail", "한국전력공사": "kepco", "서울교통공사": "seoulmetro"}


def norm(s: str) -> str:
    s = (s or "").lower()
    s = re.sub(r"\(주\)|\(재\)|\(사\)|주식회사|재단법인|학교법인|사단법인", "", s)
    return re.sub(r"[\s·\-_.()&,'\[\]]", "", s)


@lru_cache
def load() -> dict:
    d = json.loads(PATH.read_text(encoding="utf-8"))
    al: dict[str, list[str]] = {norm(k): [v] for k, v in d["aliases"].items()}
    if EXTRA.exists():  # 공식 출처로 확인한 목록 외 기관 + 영문명·영문 약칭
        ex = json.loads(EXTRA.read_text(encoding="utf-8"))
        for i in ex["institutions"]:
            d["institutions"].append({k: v for k, v in i.items() if k != "aliases"})
            for a in i.get("aliases", []):
                al.setdefault(norm(a), []).append(i["name"])
        for k, v in ex["aliases"].items():
            al[norm(k)] = v if isinstance(v, list) else [v]
    names = {i["name"] for i in d["institutions"]}
    d["_alias"] = {k: [n for n in v if n in names] for k, v in al.items()}
    d["sources"]["extra"] = {"name": "목록 외 공식 출처 확인 기관", "count": len(ex["institutions"]) if EXTRA.exists() else 0}
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
    alias_targets = d["_alias"].get(nq, [])
    alias_prefix = {n for k, v in d["_alias"].items() if len(nq) >= 2 and k.startswith(nq) for n in v}
    for i in items:
        s = i["_n"]
        if i["name"] in alias_targets:
            score, why = 100, f"약칭 '{q}'" + (" · 여러 기관 후보" if len(alias_targets) > 1 else "")
        elif i["name"] in alias_prefix:
            score, why = 80, "약칭·영문명 앞부분 일치"
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


def all_names() -> list[str]:
    return [i["name"] for i in load()["institutions"]]
