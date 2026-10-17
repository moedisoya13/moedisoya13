from csmmap.regions import RegionIndex


def test_load_counts(regions: RegionIndex):
    assert len(regions.regions) == 256
    assert regions.meta.get("version") == "20261001"


def test_locate_known_points(regions: RegionIndex):
    assert regions.locate(37.5665, 126.9780).display == "중구"          # 서울시청
    assert regions.locate(37.5035, 126.7660).display == "부천시 원미구"  # 부천시청
    assert regions.locate(37.4563, 126.7052).display == "남동구"        # 인천시청(구월동)
    assert regions.locate(37.0, 125.0) is None                         # 서해


def test_2026_reorganized_districts_exist(regions: RegionIndex):
    names = {r.name for r in regions.regions if r.sido == "인천광역시"}
    assert {"제물포구", "영종구", "서해구", "검단구"} <= names
    names_bc = {r.display for r in regions.regions if r.sido == "경기도"}
    assert {"부천시 원미구", "부천시 소사구", "부천시 오정구"} <= names_bc


def test_by_name_handles_spacing_and_old_sido(regions: RegionIndex):
    assert regions.by_name("경기도", "고양시 덕양구").code == regions.by_name("경기도", "고양시덕양구").code
    assert regions.by_name("인천광역시", "서해구") is not None
    # 시도 이름이 달라도 시군구가 유일하면 찾는다
    assert regions.by_name("광주광역시", "미추홀구").display == "미추홀구"
    assert regions.by_name("경기도", "없는구") is None


def test_centroid_inside_region(regions: RegionIndex):
    r = regions.by_name("경기도", "시흥시")
    lat, lng = r.centroid
    assert regions.locate(lat, lng).code == r.code
