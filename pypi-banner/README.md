# PyPI project card

A credit-card-sized panel banner for a PyPI project, drawn with the Python
Package Index's own colours and type.

![python-barcode card](out/python-barcode.png)

```
python3 generate.py python-barcode
```

## Geometry

ID-1 / credit card: **85.6 × 54 mm**, rendered as a 1011 × 638 px board at
300 dpi and screenshotted at `device_scale_factor=2` → **2022 × 1276 px**
(≈600 dpi), so the card stays sharp when printed or dropped into a README.

## Palette

Colours are not sampled from a screenshot; they are PyPI's own design tokens,
read from `warehouse/static/sass/settings/_colors.scss` and the blocks that
paint the project header (`_banner.scss`, `_project-header.scss`,
`_site-header.scss`). `palette.json` records each role and its provenance.

| Swatch | Hex | Warehouse token | Used for |
| --- | --- | --- | --- |
| ▰ | `#0073b7` | `adjust($primary-color, +2%)` — site header | gradient light stop |
| ▰ | `#006dad` | `$primary-color` — the project banner, ~70% of the header UI | panel base |
| ▰ | `#005d93` | `adjust($primary-color, -5%)` | install command chip |
| ▰ | `#004d7a` | `$primary-color-dark` | gradient dark stop |
| ▰ | `#ffffff` | `$white` | title, summary, logo |
| ▰ | `rgba(255,255,255,.4)` | `$transparent-white` | dotted rules, chip borders |
| ▰ | `#ffd343` | `$highlight-color` | left spine, echoing the yellow in the PyPI logo |

Type is PyPI's too: **Source Sans 3** for the display text, **Source Code Pro**
for the install command (`settings/_fonts.scss`). Both are embedded as woff2
data URIs, so rendering needs no network.

## Elements

1. **Platform** — PyPI logo + wordmark + "Python Package Index", version chip on the right.
2. **Name** — shrink-to-fit, 86 px down to 42 px, so long project names never clip.
3. **Summary** — the project's own one-liner, clamped to two lines.
4. **Install** — `pip install <name>` in the dotted-bordered chip PyPI uses, with its copy affordance.

The package cubes in the lower right are PyPI's `white-cubes.svg` at 8.5% opacity.

## Options

```
python3 generate.py <package> [-o out.png] [--summary ...] [--version ...] [--command ...]
```

Metadata comes from `https://pypi.org/pypi/<package>/json`; the overrides let you
card a pre-release, a `uv pip install` line, or a hand-written summary.

## Requirements

`pip install playwright` and a Chromium build (this repo's runner uses the one at
`/opt/pw-browsers`; otherwise `playwright install chromium`).

## Assets

* `assets/pypi-logo.svg`, `assets/white-cubes.svg` — from
  [pypi/warehouse](https://github.com/pypi/warehouse) (Apache-2.0; the PyPI logo
  is a PSF trademark — use it to refer to PyPI, not to brand something else).
* `assets/fonts/*` — Source Sans 3 and Source Code Pro, SIL Open Font License 1.1.
