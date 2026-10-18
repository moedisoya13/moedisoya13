"""글꼴 규칙 — design-taste 기준을 코드로 지킨다.
- 글자 글꼴 굵기 3종(400·600·700), 숫자 글꼴 3종(400·500·600). 선언하지 않은 굵기를 쓰면 브라우저가 가짜 굵게를 만든다.
- 화면 글자 12px 이상, 지도 기호·이니셜만 11px.
- 내장한 글꼴 파일은 모두 실제로 있고, 라이선스 문서가 함께 있다."""
import pathlib
import re

WEB = pathlib.Path(__file__).resolve().parents[1] / "web"
FONTS_CSS = (WEB / "fonts.css").read_text(encoding="utf-8")
APP_CSS = (WEB / "app.css").read_text(encoding="utf-8")
TOKENS = (WEB / "tokens.css").read_text(encoding="utf-8")
JS = "\n".join(p.read_text(encoding="utf-8") for p in (WEB / "js").glob("*.js"))
FACES = re.findall(r'@font-face \{ font-family: "([^"]+)"; font-weight: (\d+);[^}]*url\("([^"]+)"\)', FONTS_CSS)


def weights(family):
    return {int(w) for f, w, _ in FACES if f == family}


def test_declared_faces_exist_and_have_licenses():
    assert FACES, "fonts.css 에 @font-face 가 없다"
    for _, _, url in FACES:
        assert (WEB / url).is_file(), url
    vendor = WEB / "vendor" / "fonts"
    assert (vendor / "LICENSE-NanumSquareNeo.txt").is_file() and (vendor / "LICENSE-IBMPlexMono.txt").is_file()
    assert "SIL OPEN FONT LICENSE Version 1.1" in (vendor / "LICENSE-NanumSquareNeo.txt").read_text(encoding="utf-8")
    assert not list(vendor.glob("Pretendard*")), "쓰지 않는 글꼴 파일이 남아 있다"


def test_weight_sets():
    assert weights("NanumSquare Neo") == {400, 600, 700}
    assert weights("IBM Plex Mono") == {400, 500, 600}
    assert '"NanumSquare Neo"' in re.search(r"--font:\s*([^;]+);", TOKENS).group(1).split(",")[0]


def test_css_only_requests_declared_weights():
    sans, mono = weights("NanumSquare Neo"), weights("IBM Plex Mono")
    for css in (APP_CSS, JS):
        for w in re.findall(r"font-weight:\s*(\d{3})", css):
            assert int(w) in sans, f"font-weight {w}"
        for w, fam in re.findall(r"font:\s*(\d{3})\s[^;\"`]*?var\(--(font|mono)\)", css):
            assert int(w) in (sans if fam == "font" else mono), f"font: {w} … var(--{fam})"


def test_type_floor():
    toks = dict(re.findall(r"(--t-[\w-]+):\s*([\d.]+)px", TOKENS))
    assert float(toks.pop("--t-glyph")) == 11
    assert all(float(v) >= 12 for v in toks.values()), toks
    for css in (APP_CSS, JS):
        for px in re.findall(r"font(?:-size)?:\s*(?:\d{3}\s+)?([\d.]+)px", css):
            assert float(px) >= 11, f"{px}px 글자"
