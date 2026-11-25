"""시연용 가상 취업준비생 분포 (실제 이용자 데이터 아님).

- 고정 시드(공고 ID 기반)로 1,000명 생성 → 같은 공고면 항상 같은 분포
- 각 가상 프로필의 자격증은 해당 공고의 가산대상 목록에서 무작위로 뽑고, 점수는 '실제 계산 엔진'으로 산출
  (2027 사전예고처럼 서류 점수제면 어학 환산 + 자격증×배수, 아니면 필기 자격증 가점)
- 사용자 점수가 바뀌면 백분위를 다시 계산
"""
from __future__ import annotations

import random
import statistics
import zlib
from datetime import date, timedelta

from .bonus import calculate_bonus
from .screening import document_score

N = 1000
_CACHE: dict[str, list[float]] = {}


def _metric(rule: dict, prof: dict) -> float | None:
    ds = document_score(rule, prof)
    if ds.get("available"):
        return ds["total"]
    b = calculate_bonus(rule, prof)
    return b["total_confirmed"] if b.get("available") else None


def population(rule: dict) -> list[float]:
    if rule["id"] in _CACHE:
        return _CACHE[rule["id"]]
    rng = random.Random(zlib.crc32(rule["id"].encode()))
    cat = [c for c in rule.get("cert_catalog", []) if c.get("evidence_verified", True)]
    recent = str(date.today() - timedelta(days=120))
    vals = []
    for _ in range(N):
        k = rng.choices([0, 1, 2, 3, 4], weights=[12, 28, 30, 20, 10])[0]
        certs = []
        for c in rng.sample(cat, min(k, len(cat))):
            certs.append({"name": c["name"], "grade": (c.get("levels") or [""])[0]})
        toeic = int(min(990, max(400, rng.gauss(760, 110))) // 5 * 5)
        prof = {"certificates": certs, "languages": [{"test": "TOEIC", "score": str(toeic), "exam_date": recent}] if rng.random() < 0.85 else []}
        v = _metric(rule, prof)
        if v is not None:
            vals.append(v)
    _CACHE[rule["id"]] = vals
    return vals


def position(rule: dict, my_value: float | None, metric_label: str, max_value: float) -> dict:
    vals = population(rule)
    if not vals or my_value is None:
        return {"available": False}
    bins = 20
    width = max_value / bins if max_value else 1
    hist = [0] * bins
    for v in vals:
        hist[min(int(v / width), bins - 1)] += 1
    below = sum(1 for v in vals if v < my_value)
    equal = sum(1 for v in vals if v == my_value)
    pct_rank = (below + equal / 2) / len(vals)
    return {
        "available": True, "synthetic": True, "n": len(vals), "metric": metric_label, "max": max_value,
        "mean": round(statistics.mean(vals), 1), "median": round(statistics.median(vals), 1),
        "my_value": my_value, "top_percent": round((1 - pct_rank) * 100), "histogram": hist, "bin_width": width,
        "note": "고정 시드로 생성한 시연용 가상 준비생 1,000명과의 비교입니다. 실제 지원자·합격 가능성과 무관합니다.",
    }
