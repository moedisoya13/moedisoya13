"""디자인 토큰 대비비 검증 — 가이드북 기준: 수치/텍스트 4.5:1, 그래프 색면 3:1."""
import pathlib
import re

import pytest

TOKENS = pathlib.Path(__file__).resolve().parents[1] / "web" / "tokens.css"


def parse_tokens():
    css = TOKENS.read_text(encoding="utf-8")
    blocks = re.findall(r"(:root(?:\[data-theme=\"(\w+)\"\])?)\s*\{([^}]*)\}", css)
    themes = {}
    for _, theme, body in blocks:
        name = theme or "light"
        themes.setdefault(name, {})
        for k, v in re.findall(r"(--[\w-]+)\s*:\s*([^;]+);", body):
            themes[name][k] = v.strip()
    # 다크는 라이트를 상속
    themes["dark"] = {**themes["light"], **themes.get("dark", {})}
    return themes


def hex_to_rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))


def luminance(h):
    def ch(c):
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = (ch(c) for c in hex_to_rgb(h))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(a, b):
    la, lb = luminance(a), luminance(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


TEXT_PAIRS = [  # 4.5:1
    ("--text", "--bg-page"), ("--text", "--bg-standard"), ("--text-label", "--bg-page"), ("--text-label", "--bg-standard"),
    ("--text-strong", "--bg-highlight"), ("--link", "--bg-page"), ("--map-label", "--map-fill"),
]
GRAPHIC_PAIRS = [  # 3:1
    ("--primary", "--map-fill"), ("--primary", "--map-fill-active"), ("--dot-store", "--map-fill"), ("--dot-store", "--map-fill-active"),
    ("--neutral-mid", "--map-fill"), ("--map-stroke-active", "--map-fill-active"), ("--spider", "--map-fill-active"),
    ("--negative", "--bg-page"), ("--success", "--bg-page"),
]


@pytest.mark.parametrize("theme", ["light", "dark"])
@pytest.mark.parametrize("fg,bg", TEXT_PAIRS)
def test_text_contrast(theme, fg, bg):
    t = parse_tokens()[theme]
    assert contrast(t[fg], t[bg]) >= 4.5, f"{theme} {fg} on {bg}: {contrast(t[fg], t[bg]):.2f}"


@pytest.mark.parametrize("theme", ["light", "dark"])
@pytest.mark.parametrize("fg,bg", GRAPHIC_PAIRS)
def test_graphic_contrast(theme, fg, bg):
    t = parse_tokens()[theme]
    assert contrast(t[fg], t[bg]) >= 3.0, f"{theme} {fg} on {bg}: {contrast(t[fg], t[bg]):.2f}"


def test_white_text_on_primary_and_badges():
    t = parse_tokens()
    assert contrast("#ffffff", t["light"]["--primary"]) >= 4.5
    assert contrast("#ffffff", t["light"]["--neutral-mid"]) >= 4.5
