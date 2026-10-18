"""디자인 토큰 대비 검증 — 글자 4.5:1, 그래픽(선·면) 3:1. 라이트·다크 모두."""
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
    themes["dark"] = {**themes["light"], **themes.get("dark", {})}
    return themes


def lum(h):
    h = h.lstrip("#")
    def ch(c):
        c = int(c, 16) / 255
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = ch(h[0:2]), ch(h[2:4]), ch(h[4:6])
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(a, b):
    la, lb = lum(a), lum(b)
    return (max(la, lb) + 0.05) / (min(la, lb) + 0.05)


TEXT = [  # 4.5:1
    ("--ink", "--surface"), ("--ink", "--paper"), ("--ink-2", "--surface"), ("--ink-2", "--surface-2"),
    ("--ink-3", "--surface"), ("--ink-3", "--surface-2"), ("--link", "--surface"), ("--accent-ink", "--accent"),
    ("--fix", "--fix-bg"), ("--ok", "--ok-bg"), ("--err", "--err-bg"), ("--label", "--land"), ("--label", "--land-2"),
]
GRAPHIC = [  # 3:1
    ("--land-edge", "--land"), ("--land-edge", "--land-ctx"), ("--sido-line", "--land-2"), ("--ink-3", "--sea"),
    ("--focus", "--surface"),
]


@pytest.mark.parametrize("theme", ["light", "dark"])
@pytest.mark.parametrize("fg,bg", TEXT)
def test_text_contrast(theme, fg, bg):
    t = parse_tokens()[theme]
    assert contrast(t[fg], t[bg]) >= 4.5, f"{theme} {fg} on {bg}: {contrast(t[fg], t[bg]):.2f}"


@pytest.mark.parametrize("theme", ["light", "dark"])
@pytest.mark.parametrize("fg,bg", GRAPHIC)
def test_graphic_contrast(theme, fg, bg):
    t = parse_tokens()[theme]
    assert contrast(t[fg], t[bg]) >= 3.0, f"{theme} {fg} on {bg}: {contrast(t[fg], t[bg]):.2f}"


def test_ten_dealer_hues_per_theme():
    t = parse_tokens()
    for theme in ("light", "dark"):
        hues = [t[theme][f"--h{i}"] for i in range(10)]
        assert len(set(hues)) == 10 and all(re.fullmatch(r"#[0-9a-f]{6}", h) for h in hues)


def test_dark_hues_hold_3_to_1_against_dark_land_with_ring():
    """다크 모드 점은 밝은 테두리(--dot-edge)를 두르므로, 색 자체는 다크 바탕 대비 2:1 이상이면 된다."""
    t = parse_tokens()["dark"]
    for i in range(10):
        assert contrast(t[f"--h{i}"], t["--land"]) >= 2.0, i
