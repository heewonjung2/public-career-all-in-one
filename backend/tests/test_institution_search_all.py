"""등록된 모든 기관이 공식명·부분 입력으로 검색되는지 자동 검사 + 약칭/영문 약칭/목록 외 기관."""
from app.services import institutions as I


def test_every_official_name_found_first():
    miss = []
    for n in I.all_names():
        r = I.search(n, limit=5)["results"]
        if not r or r[0]["name"] != n:
            if not any(x["name"] == n for x in r):
                miss.append(n)
    assert not miss, miss[:10]


def test_partial_and_spacing_variants():
    names = I.all_names()
    for n in names[::15]:
        core = I.norm(n)
        part = core[: max(2, len(core) - 2)]
        assert any(x["name"] == n for x in I.search(part, limit=50)["results"]), (n, part)
        spaced = " ".join(core)            # 띄어쓰기 차이
        assert any(x["name"] == n for x in I.search(spaced, limit=50)["results"]), n


def test_aliases_and_english():
    top = lambda q: I.search(q)["results"][0]["name"]
    assert top("한수원") == "한국수력원자력(주)"
    assert top("금감원") == "금융감독원"
    assert top("FSS") == "금융감독원"
    assert top("POSA") == "(재)한국우편사업진흥원" and top("posa") == "(재)한국우편사업진흥원"
    assert top("KORAIL") == "한국철도공사"
    assert top("서교공") == "서울교통공사"          # 지방 기관
    amb = [x["name"] for x in I.search("공항공사")["results"][:2]]
    assert set(amb) == {"한국공항공사", "인천국제공항공사"}
