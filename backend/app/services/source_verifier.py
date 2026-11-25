"""공식 출처 검증 + SSRF 방지.

- 기업별 허용 도메인(정확 일치 또는 하위 도메인)만 공식 출처로 인정한다.
- 도메인 문자열에 기업명이 '포함'되는 것만으로는 인정하지 않는다 (예: korail-job.blog.com 거부).
- 리다이렉트는 직접 따라가며 각 단계의 최종 목적지를 다시 검증한다.
- 사설/루프백/링크로컬 IP로 해석되는 호스트는 차단한다.
"""
from __future__ import annotations

import ipaddress
import socket
from dataclasses import dataclass
from urllib.parse import urljoin, urlparse

import httpx

# 공통 공식 채용정보 시스템 (공공기관 공식)
COMMON_OFFICIAL_DOMAINS = ["job.alio.go.kr", "www.alio.go.kr", "alio.go.kr", "job.cleaneye.go.kr"]

# 기업별 공식 도메인. 외부 채용대행 사이트는 공식 홈페이지에서 연결이 확인된 경우에만 추가한다.
COMPANY_DOMAINS: dict[str, list[str]] = {
    "korail": ["korail.com"],
    "kepco": ["kepco.co.kr"],
    "seoulmetro": ["seoulmetro.co.kr"],
}

BLOCKED_HINTS = ["blog.naver.com", "cafe.naver.com", "tistory.com", "dcinside.com", "instagram.com", "facebook.com"]

MAX_DOWNLOAD_BYTES = 30 * 1024 * 1024


@dataclass
class VerifyResult:
    ok: bool
    reason: str
    host: str | None = None


def _host_matches(host: str, domain: str) -> bool:
    host = host.lower().rstrip(".")
    domain = domain.lower()
    return host == domain or host.endswith("." + domain)


def allowed_domains(company_id: str | None) -> list[str]:
    doms = list(COMMON_OFFICIAL_DOMAINS)
    if company_id and company_id in COMPANY_DOMAINS:
        doms += COMPANY_DOMAINS[company_id]
    elif company_id is None:
        for v in COMPANY_DOMAINS.values():
            doms += v
    return doms


def _is_public_host(host: str) -> tuple[bool, str]:
    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror:
        return False, "호스트 이름을 해석할 수 없음"
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast or ip.is_unspecified:
            return False, f"내부/사설 네트워크 주소로 해석됨 ({ip})"
    return True, ""


def verify_url(url: str, company_id: str | None, resolve_dns: bool = True) -> VerifyResult:
    try:
        p = urlparse(url.strip())
    except ValueError:
        return VerifyResult(False, "URL 형식 오류")
    if p.scheme not in ("http", "https"):
        return VerifyResult(False, "http/https URL만 허용")
    if not p.hostname:
        return VerifyResult(False, "호스트가 없는 URL")
    if p.username or p.password:
        return VerifyResult(False, "인증 정보가 포함된 URL은 허용하지 않음")
    host = p.hostname.lower()
    try:
        ipaddress.ip_address(host)
        return VerifyResult(False, "IP 주소 직접 접근은 허용하지 않음", host)
    except ValueError:
        pass
    if host in ("localhost",) or host.endswith(".localhost") or host.endswith(".local"):
        return VerifyResult(False, "로컬 주소는 허용하지 않음", host)
    if any(_host_matches(host, b) for b in BLOCKED_HINTS):
        return VerifyResult(False, "비공식 출처(블로그/카페/SNS)로 분류됨", host)
    if not any(_host_matches(host, d) for d in allowed_domains(company_id)):
        return VerifyResult(False, f"허용된 공식 도메인이 아님: {host}", host)
    if resolve_dns:
        ok, why = _is_public_host(host)
        if not ok:
            return VerifyResult(False, why, host)
    return VerifyResult(True, "공식 도메인 확인", host)


def fetch_official(url: str, company_id: str | None, max_redirects: int = 5) -> tuple[bytes, str, str]:
    """리다이렉트 단계마다 검증하며 다운로드. (content, final_url, content_type) 반환."""
    current = url
    with httpx.Client(follow_redirects=False, timeout=20.0, headers={"User-Agent": "PublicCareerAllInOne/0.1"}) as client:
        for _ in range(max_redirects + 1):
            v = verify_url(current, company_id)
            if not v.ok:
                raise ValueError(f"공식 출처 검증 실패: {v.reason}")
            with client.stream("GET", current) as r:
                if r.status_code in (301, 302, 303, 307, 308):
                    loc = r.headers.get("location")
                    if not loc:
                        raise ValueError("리다이렉트 대상 없음")
                    current = urljoin(current, loc)
                    continue
                r.raise_for_status()
                buf = bytearray()
                for chunk in r.iter_bytes():
                    buf += chunk
                    if len(buf) > MAX_DOWNLOAD_BYTES:
                        raise ValueError("파일 크기 제한(30MB) 초과")
                return bytes(buf), current, r.headers.get("content-type", "")
    raise ValueError("리다이렉트 횟수 초과")
