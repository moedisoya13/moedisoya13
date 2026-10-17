from csmmap.normalize import (
    address_variants, clean_text, display_sgg, initials, parse_region, region_key, similar_dealer_groups,
)


def test_address_variants_get_simpler_in_order():
    v = address_variants("경기도 부천시 소사구 범안로 103, 1층 전체 (범박동)")
    assert v[0] == "경기도 부천시 소사구 범안로 103, 1층 전체 (범박동)"
    assert v[-1] == "경기도 부천시 소사구 범안로 103"
    assert len(v) == len(set(v))


def test_address_variants_strips_building_and_units():
    v = address_variants("서울특별시 강서구 강서로 254, 상가동 지하 1층 (화곡동, 우장산아이파크이편한세상)")
    assert "서울특별시 강서구 강서로 254" in v
    v2 = address_variants("경기도 부천시 오정구 소사로776번길 26, 102·103호 (원종동, 한울팰리스)")
    assert v2[-1] == "경기도 부천시 오정구 소사로776번길 26"


def test_address_variants_empty():
    assert address_variants("") == []
    assert address_variants(None) == []


def test_parse_region_city_with_gu():
    assert parse_region("경기도 고양시 덕양구 화신로260번길 74") == ("경기도", "고양시 덕양구")
    assert parse_region("경기도 부천시 소사구 범안로 103") == ("경기도", "부천시 소사구")


def test_parse_region_plain():
    assert parse_region("인천광역시 강화군 강화읍 중앙로 68") == ("인천광역시", "강화군")
    assert parse_region("서울특별시 양천구 중앙로 268") == ("서울특별시", "양천구")
    assert parse_region("경기도 시흥시 배곧4로 32-32") == ("경기도", "시흥시")


def test_parse_region_aliases_old_names():
    assert parse_region("서울 강서구 x")[0] == "서울특별시"
    assert parse_region("광주광역시 서구 x")[0] == "전남광주통합특별시"
    assert parse_region("전라북도 전주시 완산구 x") == ("전북특별자치도", "전주시 완산구")
    assert parse_region("세종특별자치시 한누리대로 1") == ("세종특별자치시", "세종특별자치시")


def test_region_key_ignores_spaces():
    assert region_key("경기도", "고양시 덕양구") == region_key("경기도", "고양시덕양구")


def test_display_sgg():
    assert display_sgg("고양시덕양구") == "고양시 덕양구"
    assert display_sgg("부천시원미구") == "부천시 원미구"
    assert display_sgg("시흥시") == "시흥시"
    assert display_sgg("미추홀구") == "미추홀구"


def test_similar_dealer_groups():
    groups = similar_dealer_groups(["(주)가양유통", "가양유통", "현대유통", "주식회사 현대유통", "연희"])
    assert ["(주)가양유통", "가양유통"] in groups
    assert ["주식회사 현대유통", "현대유통"] in groups
    assert all("연희" not in g for g in groups)


def test_initials_and_clean():
    assert initials("(주)대상유통") == "대상"
    assert initials("G마트") == "G마"
    assert clean_text("  대성할인마트  ") == "대성할인마트"
    assert clean_text(None) == ""
