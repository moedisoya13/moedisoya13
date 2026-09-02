#!/usr/bin/env python3
"""Render a wide "strip" banner for a PyPI project or a GitHub repository.

Part of the cardstrip skill (see ../SKILL.md). Metadata comes from each
platform's own public API; the palette and type for a given platform are its
own real design tokens, recorded with provenance in
../references/palette-<platform>.json (see references/ for the ones already
extracted — reuse them rather than re-deriving hex values from a screenshot).
Rendering is Chromium via Playwright at 2x, so the PNG is crisp at ~2x CSS px.

    python3 generate.py python-barcode -o python-barcode.png
    python3 generate.py https://github.com/SeoNaRu/nulnul-harness -o nulnul-harness.png
    python3 generate.py SeoNaRu/nulnul-harness --platform github -o nulnul-harness.png
    python3 generate.py Git.Git --platform winget -o git.png

winget package IDs are never auto-detected (a dotted PyPI package name like
"zope.interface" would collide) — always pass --platform winget for those.
"""
from __future__ import annotations

import argparse
import asyncio
import base64
import json
import mimetypes
import pathlib
import re
import urllib.error
import urllib.parse
import urllib.request

HERE = pathlib.Path(__file__).resolve().parent
SKILL_ROOT = HERE.parent
ASSETS = SKILL_ROOT / "assets"
REFERENCES = SKILL_ROOT / "references"
TEMPLATE = ASSETS / "card_template.html"

STRIP_W = 1080                       # fixed width; height is intrinsic to content
RENDER_VIEWPORT_H = 1200             # generous — the element screenshot bounds
                                      # itself to the card's real (shorter) height
SCALE = 2                            # -> 2160px-wide output, ~2x sharp

CHROMIUM_CANDIDATES = [
    "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    "/opt/pw-browsers/chromium/chrome-linux/chrome",
]

GITHUB_URL_RE = re.compile(
    r"^(?:https?://)?(?:www\.)?github\.com/([^/\s]+)/([^/\s]+?)(?:\.git)?/?$"
)
OWNER_REPO_RE = re.compile(r"^([^/\s]+)/([^/\s]+?)(?:\.git)?$")


def data_uri(path: pathlib.Path, mime: str | None = None) -> str:
    if mime is None:
        mime = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    return f"data:{mime};base64," + base64.b64encode(path.read_bytes()).decode()


def esc(s: str) -> str:
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def load_palette(platform: str) -> dict:
    path = REFERENCES / f"palette-{platform}.json"
    if not path.exists():
        raise SystemExit(
            f"no references/palette-{platform}.json — extract that platform's own "
            f"design tokens (its CSS/design-system source, not a screenshot) and add "
            f"one following the schema of the existing palette-*.json files before "
            f"generating a card for it."
        )
    return json.loads(path.read_text())


def detect_platform(target: str) -> tuple[str, str]:
    """Return (platform, target) — target is a PyPI package name or 'owner/repo'."""
    m = GITHUB_URL_RE.match(target)
    if m:
        return "github", f"{m.group(1)}/{m.group(2)}"
    if "/" in target and OWNER_REPO_RE.match(target):
        return "github", target
    return "pypi", target


def fetch_meta_pypi(package: str) -> dict:
    url = f"https://pypi.org/pypi/{package}/json"
    with urllib.request.urlopen(url, timeout=30) as r:
        info = json.load(r)["info"]
    return {
        "name_prefix": "",
        "name": info["name"],
        "summary": (info.get("summary") or "").strip(),
        "chip_text": info["version"],
        "command": f"pip install {info['name']}",
    }


def fetch_meta_github(owner_repo: str) -> dict:
    owner, repo = owner_repo.split("/", 1)
    url = f"https://api.github.com/repos/{owner}/{repo}"
    req = urllib.request.Request(url, headers={"Accept": "application/vnd.github+json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            info = json.load(r)
    except urllib.error.HTTPError as e:
        if e.code == 404:
            raise SystemExit(f"no such GitHub repo: {owner}/{repo} (or it's private — "
                              f"this fetches unauthenticated, public repos only)")
        if e.code == 403:
            raise SystemExit(f"GitHub API returned 403 for {owner}/{repo} — most likely "
                              f"the unauthenticated rate limit (60 req/hr per IP); wait "
                              f"and retry, or (in a sandboxed environment that gates "
                              f"api.github.com behind repo attachment) check whether that "
                              f"gate, not GitHub itself, is the actual blocker")
        raise
    stars = info.get("stargazers_count") or 0
    return {
        "name_prefix": f"{info['owner']['login']}/",
        "name": info["name"],
        "summary": (info.get("description") or "").strip(),
        "chip_text": f"★ {stars:,}",
        "command": f"git clone {info['html_url']}.git",
    }


def _version_key(v: str) -> tuple[int, ...]:
    """Sort key for winget-pkgs version folder names ('2.55.0.3' etc.) —
    they aren't consistently zero-padded or equal-length, so compare as
    tuples of ints, not strings."""
    return tuple(int(p) if p.isdigit() else -1 for p in v.split("."))


def fetch_meta_winget(package_id: str) -> dict:
    """Fetch package metadata from microsoft/winget-pkgs, the same org's
    official community manifest repo winget itself installs from — there is
    no separate "winget API". Requires PyYAML (pip install pyyaml)."""
    try:
        import yaml
    except ImportError:
        raise SystemExit("winget cards need PyYAML: pip install pyyaml")

    parts = package_id.split(".")
    if len(parts) < 2:
        raise SystemExit(f"not a winget PackageIdentifier (expected dotted "
                          f"Publisher.Package[.Suffix...] form): {package_id!r}")
    dir_path = f"manifests/{parts[0][0].lower()}/" + "/".join(parts)

    listing_url = f"https://api.github.com/repos/microsoft/winget-pkgs/contents/{dir_path}"
    req = urllib.request.Request(listing_url, headers={"Accept": "application/vnd.github+json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            entries = json.load(r)
    except urllib.error.HTTPError as e:
        if e.code == 404:
            raise SystemExit(f"no such winget package: {package_id} (check the exact "
                              f"PackageIdentifier at https://github.com/microsoft/winget-pkgs"
                              f"/tree/master/{dir_path})")
        if e.code == 403:
            raise SystemExit(f"GitHub API returned 403 listing {dir_path} — most likely "
                              f"the unauthenticated rate limit (60 req/hr per IP); wait "
                              f"and retry, or (in a sandboxed environment that gates "
                              f"api.github.com behind repo attachment) check whether that "
                              f"gate, not GitHub itself, is the actual blocker")
        raise
    versions = [e["name"] for e in entries if e["type"] == "dir"]
    if not versions:
        raise SystemExit(f"no version folders found under {dir_path}")
    version = max(versions, key=_version_key)

    base = (f"https://raw.githubusercontent.com/microsoft/winget-pkgs/master/"
            f"{dir_path}/{version}")
    locale_url = f"{base}/{package_id}.locale.en-US.yaml"
    try:
        with urllib.request.urlopen(locale_url, timeout=30) as r:
            locale = yaml.safe_load(r.read())
    except urllib.error.HTTPError as e:
        if e.code != 404:
            raise
        # fall back to whatever DefaultLocale the version manifest declares
        with urllib.request.urlopen(f"{base}/{package_id}.yaml", timeout=30) as r:
            version_manifest = yaml.safe_load(r.read())
        default_locale = version_manifest["DefaultLocale"]
        locale_url = f"{base}/{package_id}.locale.{default_locale}.yaml"
        with urllib.request.urlopen(locale_url, timeout=30) as r:
            locale = yaml.safe_load(r.read())

    return {
        "name_prefix": "",
        "name": locale.get("PackageName") or parts[-1],
        "summary": (locale.get("ShortDescription") or "").strip(),
        "chip_text": f"v{version}",
        "command": f"winget install {package_id}",
    }


def build_html(platform: str, meta: dict, overrides: dict) -> str:
    palette = load_palette(platform)
    colors = palette["colors"]
    html = TEMPLATE.read_text()

    name = overrides.get("name") or meta["name"]
    summary = overrides.get("summary") or meta["summary"]
    chip_text = overrides.get("chip_text") or meta["chip_text"]
    command = overrides.get("command") or meta["command"]

    subs = {
        "__FONT_SS_REG__":  data_uri(ASSETS / "fonts/SourceSans3-Regular.ttf.woff2", "font/woff2"),
        "__FONT_SS_SEMI__": data_uri(ASSETS / "fonts/SourceSans3-Semibold.ttf.woff2", "font/woff2"),
        "__FONT_SS_BOLD__": data_uri(ASSETS / "fonts/SourceSans3-Bold.ttf.woff2", "font/woff2"),
        "__FONT_SCP_REG__": data_uri(ASSETS / "fonts/SourceCodePro-Regular.ttf.woff2", "font/woff2"),
        "__FONT_SCP_MED__": data_uri(ASSETS / "fonts/SourceCodePro-Medium.ttf.woff2", "font/woff2"),
        "__LOGO__":         data_uri(SKILL_ROOT / palette["logo"]),
        "__WATERMARK__":    data_uri(SKILL_ROOT / palette["watermark"]),
        "__COLOR_GRADIENT_LIGHT__": colors["gradientLight"]["hex"],
        "__COLOR_BASE__":           colors["base"]["hex"],
        "__COLOR_GRADIENT_DARK__":  colors["gradientDark"]["hex"],
        "__COLOR_CHIP__":           colors["chip"]["hex"],
        "__COLOR_TEXT__":           colors["text"]["hex"],
        "__COLOR_RULE__":           colors["rule"]["hex"],
        "__COLOR_ACCENT__":         colors["accent"]["hex"],
        "__PLATFORM_NAME__": esc(palette["displayName"]),
        "__META_LABEL__":    esc(palette["metaLabel"]),
        "__CHIP_TEXT__":     esc(chip_text),
        "__NAME_PREFIX__":   esc(meta["name_prefix"]),
        "__NAME__":          esc(name),
        "__SUMMARY__":       esc(summary),
        "__COMMAND__":       esc(command),
    }
    for key, value in subs.items():
        html = html.replace(key, value)
    left = re.findall(r"__[A-Z_]+__", html)
    if left:
        raise SystemExit(f"unfilled placeholders: {sorted(set(left))}")
    return html


async def render(html: str, out: pathlib.Path) -> tuple[int, int]:
    """Screenshot the (intrinsically-sized) .card element; return its
    actual rendered pixel dimensions at the capture scale."""
    from playwright.async_api import async_playwright

    exe = next((p for p in CHROMIUM_CANDIDATES if pathlib.Path(p).exists()), None)
    out.parent.mkdir(parents=True, exist_ok=True)
    page_html = out.with_suffix(".html")
    page_html.write_text(html)

    async with async_playwright() as p:
        browser = await p.chromium.launch(executable_path=exe, args=["--no-sandbox",
                                                                    "--force-color-profile=srgb",
                                                                    "--font-render-hinting=none"])
        page = await browser.new_page(
            viewport={"width": STRIP_W, "height": RENDER_VIEWPORT_H},
            device_scale_factor=SCALE,
        )
        await page.goto(page_html.as_uri(), wait_until="load")
        await page.wait_for_function("document.documentElement.dataset.ready === '1'", timeout=15000)
        card = page.locator(".card")
        box = await card.bounding_box()
        await card.screenshot(path=str(out))
        await browser.close()
        return round(box["width"] * SCALE), round(box["height"] * SCALE)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("target", help="PyPI project name, or a GitHub repo "
                                    "(github.com/owner/repo URL or owner/repo shorthand)")
    ap.add_argument("--platform", choices=["pypi", "github", "winget"],
                    help="override auto-detection (required for winget — "
                    "package IDs are never auto-detected, see module docstring)")
    ap.add_argument("-o", "--out", type=pathlib.Path, help="output PNG path")
    ap.add_argument("--name", help="override the displayed name")
    ap.add_argument("--summary", help="override the one-line summary/description")
    ap.add_argument("--chip", dest="chip_text", help="override the top-right chip "
                    "text (version for pypi, star count for github)")
    ap.add_argument("--command", help="override the install/clone command")
    args = ap.parse_args()

    platform, target = detect_platform(args.target)
    if args.platform:
        platform = args.platform

    fetchers = {"pypi": fetch_meta_pypi, "github": fetch_meta_github, "winget": fetch_meta_winget}
    meta = fetchers[platform](target)
    overrides = {"name": args.name, "summary": args.summary,
                 "chip_text": args.chip_text, "command": args.command}
    out = (args.out or pathlib.Path.cwd() / f"{meta['name']}.png").resolve()

    html = build_html(platform, meta, overrides)
    w, h = asyncio.run(render(html, out))
    print(f"{out}  ({w}x{h})  [{platform}] {meta['name_prefix']}{meta['name']}")


if __name__ == "__main__":
    main()
