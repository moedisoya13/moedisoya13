#!/usr/bin/env python3
"""Render a credit-card-sized panel banner for a PyPI project.

Metadata comes from the PyPI JSON API; the palette and type are PyPI's own
design tokens (see palette.json). Rendering is Chromium via Playwright at 2x,
so the PNG is 300 dpi card geometry at 600 dpi output.

    python3 generate.py python-barcode -o out/python-barcode.png
"""
from __future__ import annotations

import argparse
import asyncio
import base64
import json
import pathlib
import re
import urllib.request

HERE = pathlib.Path(__file__).resolve().parent
ASSETS = HERE / "assets"
TEMPLATE = HERE / "card_template.html"

CARD_W, CARD_H = 1011, 638          # 85.6 x 54 mm at 300 dpi
SCALE = 2                            # -> 2022 x 1276 px

CHROMIUM_CANDIDATES = [
    "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    "/opt/pw-browsers/chromium/chrome-linux/chrome",
]


def data_uri(path: pathlib.Path, mime: str) -> str:
    return f"data:{mime};base64," + base64.b64encode(path.read_bytes()).decode()


def fetch_meta(package: str) -> dict:
    url = f"https://pypi.org/pypi/{package}/json"
    with urllib.request.urlopen(url, timeout=30) as r:
        info = json.load(r)["info"]
    return {
        "name": info["name"],
        "version": info["version"],
        "summary": (info.get("summary") or "").strip(),
    }


def esc(s: str) -> str:
    return (s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))


def build_html(meta: dict, command: str) -> str:
    html = TEMPLATE.read_text()
    subs = {
        "__FONT_SS_REG__":  data_uri(ASSETS / "fonts/SourceSans3-Regular.ttf.woff2", "font/woff2"),
        "__FONT_SS_SEMI__": data_uri(ASSETS / "fonts/SourceSans3-Semibold.ttf.woff2", "font/woff2"),
        "__FONT_SS_BOLD__": data_uri(ASSETS / "fonts/SourceSans3-Bold.ttf.woff2", "font/woff2"),
        "__FONT_SCP_REG__": data_uri(ASSETS / "fonts/SourceCodePro-Regular.ttf.woff2", "font/woff2"),
        "__FONT_SCP_MED__": data_uri(ASSETS / "fonts/SourceCodePro-Medium.ttf.woff2", "font/woff2"),
        "__LOGO__":         data_uri(ASSETS / "pypi-logo.svg", "image/svg+xml"),
        "__CUBES__":        data_uri(ASSETS / "white-cubes.svg", "image/svg+xml"),
        "__NAME__":         esc(meta["name"]),
        "__VERSION__":      esc(meta["version"]),
        "__SUMMARY__":      esc(meta["summary"]),
        "__COMMAND__":      esc(command),
    }
    for key, value in subs.items():
        html = html.replace(key, value)
    left = re.findall(r"__[A-Z_]+__", html)
    if left:
        raise SystemExit(f"unfilled placeholders: {sorted(set(left))}")
    return html


async def render(html: str, out: pathlib.Path) -> None:
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
            viewport={"width": CARD_W, "height": CARD_H},
            device_scale_factor=SCALE,
        )
        await page.goto(page_html.as_uri(), wait_until="load")
        await page.wait_for_function("document.documentElement.dataset.ready === '1'", timeout=15000)
        await page.locator(".card").screenshot(path=str(out))
        await browser.close()


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("package", help="PyPI project name, e.g. python-barcode")
    ap.add_argument("-o", "--out", type=pathlib.Path, help="output PNG path")
    ap.add_argument("--summary", help="override the one-line summary")
    ap.add_argument("--version", dest="ver", help="override the version string")
    ap.add_argument("--command", help="override the install command")
    args = ap.parse_args()

    meta = fetch_meta(args.package)
    if args.summary:
        meta["summary"] = args.summary
    if args.ver:
        meta["version"] = args.ver
    command = args.command or f"pip install {meta['name']}"
    out = (args.out or HERE / "out" / f"{meta['name']}.png").resolve()

    asyncio.run(render(build_html(meta, command), out))
    print(f"{out}  ({CARD_W * SCALE}x{CARD_H * SCALE})  {meta['name']} {meta['version']}")


if __name__ == "__main__":
    main()
