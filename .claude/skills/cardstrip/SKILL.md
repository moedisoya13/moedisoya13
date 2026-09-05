---
name: cardstrip
description: 'Generates a wide PNG "strip" banner for a PyPI package, GitHub repo,
  or winget package: platform logo, project name, one-line summary, and the install/clone
  command, drawn in that platform''s own real colours and type. Use it whenever
  the user wants a project card, badge, banner, poster, or thumbnail for one of
  those — phrasings like "PyPI 배너 만들어줘", "카드/배너 이미지 제작", "리포지토리 카드 만들어줘", "이 라이브러리
  홍보 이미지 만들어줘", "make a project card for some-package", "make a card for this
  GitHub repo", or a bare pypi.org/github.com URL or a dotted winget PackageIdentifier
  (Git.Git, OpenJS.NodeJS.LTS) paired with a request for an image. Trigger it
  proactively when the task is clearly "make a promo/share image" for such a project
  even if the user never says "card" or "banner". Don''t use it for other registries
  (npm, crates.io, ...) until a palette file for them exists under references/,
  or for marketing graphics unrelated to a specific project.'
---

# Project card

Renders a project's own metadata into a wide banner strip: platform logo,
name, one-line summary, and the install/clone command. Not a fixed-ratio
card — the box height is intrinsic to the actual content, so a
one-sentence summary and a two-line one both render tight, with no leftover
void and no clipping.

![PyPI example](assets/example-pypi.png)
![GitHub example](assets/example-github.png)
![winget example](assets/example-winget.png)
![multi-package example](assets/example-winget-multi.png)

## When to use this

Trigger on any request for a promotional/share image, card, banner, badge,
or thumbnail for **a specific PyPI package, GitHub repository, or winget
package**. Accept a bare package name, a PyPI URL, a `github.com/owner/repo`
URL, an `owner/repo` shorthand, or a dotted winget `PackageIdentifier`
(`Publisher.Package[.Suffix]`, e.g. `Git.Git`, `OpenJS.NodeJS.LTS`) — the
script auto-detects PyPI vs. GitHub from the input shape (see
`detect_platform` in `scripts/generate.py`), but **winget is never
auto-detected**: pass `--platform winget` explicitly, because a dotted
winget ID is syntactically indistinguishable from a real dotted PyPI
package name (`zope.interface`, `ruamel.yaml`, ... are genuine PyPI
packages). If the name is unfamiliar or ambiguous (e.g. it doesn't
resolve, or a GitHub profile was named instead of a repo), resolve it
before rendering rather than guessing — a near-miss name fetches the wrong
project silently. See the `korean-law-mcp` case in this skill's own
history: given a GitHub *profile*, the right move was checking which of
that user's pinned repos actually exists on PyPI, not rendering the first
guess.

## How to generate one

```bash
python3 scripts/generate.py <package>                                    # PyPI, by name
python3 scripts/generate.py https://github.com/<owner>/<repo>            # GitHub, by URL
python3 scripts/generate.py <owner>/<repo> --platform github             # GitHub, explicit
python3 scripts/generate.py Git.Git --platform winget                    # winget, always explicit
python3 scripts/generate.py "Git.Git,OpenJS.NodeJS.LTS" --platform winget  # multiple, one strip
```

Comma-separate multiple targets to fold them into one combined card instead
of a separate image per package — handy for "here's what to install"
round-ups. It reuses the exact same single-card template and layout, just
with joined fields: the title becomes every package's name joined with
`", "`, the summary the same for their descriptions, and the install row
becomes one real, copy-pasteable command covering all of them — `pip
install a b c` / `winget install a b c` (both accept multiple package
arguments in one invocation), or `git clone a.git && git clone b.git` for
GitHub, since a single `git clone` can't take more than one repo. The
top-right chip shows a package count instead of a version/star-count. All
targets in a multi-render must resolve to the same platform (the whole
panel is one platform's palette/logo, so a mixed PyPI+GitHub strip is
rejected with a clear error rather than guessing which one should win);
pass `--platform` to force them all the same way if auto-detection would
otherwise disagree. `--name`/`--summary`/`--chip`/`--command` are
single-target-only overrides and are rejected outright when more than one
target is given, since it's ambiguous which package they'd apply to.

Always run this from inside `.claude/skills/cardstrip/` (or pass paths
relative to it) so the script's own relative asset/reference lookups
resolve. Metadata comes from each platform's own public source — PyPI's
`https://pypi.org/pypi/<package>/json`, GitHub's
`https://api.github.com/repos/<owner>/<repo>` (see the override escape
hatch above when that host is unreachable), winget's
`microsoft/winget-pkgs` (the community manifest repo winget itself
installs from — there's no separate "winget API": the script lists
`manifests/<first-letter>/<Publisher>/<Package>/...` via the GitHub
Contents API to find the newest version folder, then reads that version's
`.locale.en-US.yaml` straight off `raw.githubusercontent.com`). All of
this is unauthenticated, so subject to GitHub's public rate limit — fine
for occasional use, not for batch generation. No network access is needed
for rendering itself: fonts and logos are already bundled as data URIs.

Useful overrides, e.g. to shorten an overlong summary or pin a specific
command:

```bash
python3 scripts/generate.py <target> -o <out.png> \
  --summary "..." --chip "v2.0.0" --command "pip install '<package>[extra]'"
```

Always pass `-o` to an explicit path — the default, when omitted, is
`<name>.png` in the current working directory.

**When the lookup isn't available**, pass both `--summary` and `--chip` and
the script skips the metadata fetch entirely, deriving the name and the
install/clone command from the target itself. That covers a rate-limited
`api.github.com` (60 req/hr unauthenticated), an offline run, and sandboxes
that gate GitHub hosts behind repo attachment — the environment this skill
was built in does exactly that, so every GitHub and winget card here needs
those two flags. Don't reach for a hand-written harness that imports
`generate` and calls `build_html()`/`render()` directly: the flags produce a
pixel-identical result through the real entry point, and a harness silently
skips whatever the CLI does around it.

After rendering, show the image to the user (read it back / attach it) so
they can confirm it before you consider the task done. The shrink-to-fit
script keeps most names readable and an ellipsis safety-net catches the
rest, but a visual check is still the only way to catch a genuinely wrong
crop or a summary that reads oddly once clamped.

## Dependencies

Requires `playwright` (Python) and a Chromium build:

```bash
pip install playwright
```

winget cards additionally need PyYAML, to parse the manifest files:

```bash
pip install pyyaml
```

For the browser: on a sandbox that already has one under
`/opt/pw-browsers/`, no `playwright install` is needed — `generate.py`
auto-detects it via `CHROMIUM_CANDIDATES` at the top of the script. If
neither known path exists, run `playwright install chromium` and add the
resulting path to that list (or let Playwright fall back to its default
lookup by passing no `executable_path`).

## The palette registry — reuse before you re-extract

Every colour and font this skill uses is a real design token from that
platform's own source (its CSS/design-system repo), never sampled from a
screenshot. Each platform's tokens, with full provenance, live in
`references/palette-<platform>.json`:

- `references/palette-pypi.json` — from PyPI's Warehouse sass
  (`warehouse/static/sass/settings/_colors.scss` and the blocks that paint
  the project header). Panel blue `#006dad`, Python-yellow spine `#ffd343`.
- `references/palette-github.json` — from GitHub's own Primer primitives
  (`primer/primitives`, the dark-theme base color scale and its
  `bgColor`/`fgColor`/`borderColor` functional tokens), plus the brand
  mark's official black (`#181717`, from github.com/logos via the
  simple-icons dataset). Canvas near-black `#0d1117`, accent blue `#4493f8`.
- `references/palette-winget.json` — winget has no web design system to
  pull a sass/CSS file from (it's a CLI), so every hex is pixel-sampled
  directly from the official icon in `microsoft/winget-cli`
  (`.github/images/WindowsPackageManager_Assets/ICO/PNG/_256.png`) — the
  base tone, its lightest and darkest points, and a mid shadow band, each
  at a documented (x,y) coordinate in the JSON. Gold `#9c640a`, deep umber
  gradient stop `#634006`.

**Before generating a card for a platform that doesn't have one of these
files yet, extract its palette first** — don't invent colours or guess
from memory. Find that platform's own design-token source (a sass/CSS
variables file, a design-system primitives package, brand guideline
SVGs/hex values) the same way the two above were built, and write a new
`references/palette-<platform>.json` following this schema before writing
any template changes:

```json
{
  "platform": "npm",
  "displayName": "npm",
  "metaLabel": "SHORT CATEGORY LABEL SHOWN NEXT TO THE WORDMARK",
  "source": "where every hex below actually came from — repo + file path, not a screenshot",
  "logo": "assets/<platform>-logo.svg",
  "watermark": "assets/<platform>-logo.svg (or a dedicated glyph)",
  "colors": {
    "gradientLight": {"hex": "#xxxxxx", "token": "...", "role": "gradient light stop"},
    "base":          {"hex": "#xxxxxx", "token": "...", "role": "panel background"},
    "gradientDark":  {"hex": "#xxxxxx", "token": "...", "role": "gradient dark stop"},
    "chip":          {"hex": "#xxxxxx", "token": "...", "role": "install/clone chip background"},
    "text":          {"hex": "#xxxxxx", "token": "...", "role": "title/body text"},
    "rule":          {"hex": "#xxxxxx or rgba(...)", "token": "...", "role": "chip border / dividers"},
    "accent":        {"hex": "#xxxxxx", "token": "...", "role": "left spine accent"}
  },
  "type": {"display": "...", "mono": "...", "source": "..."}
}
```

That registry is the entire point of doing this extraction work once: the
next session (or the next platform request) reads the existing file
instead of re-deriving hex values from scratch. Once the palette file
exists, also add that platform's logo (and a watermark asset, or reuse the
logo faint) under `assets/`, and extend `detect_platform()` /
`fetch_meta_*()` in `scripts/generate.py` to recognise and fetch metadata
for it — the template itself (`assets/card_template.html`) needs no
changes; it's driven entirely by the `__COLOR_*__` and `__PLATFORM_NAME__`
/`__META_LABEL__` placeholders that `build_html()` fills from the palette
file and platform metadata.

## Layout notes (`assets/card_template.html`)

- Top row: platform logo + wordmark + a short category label (from
  `metaLabel`), a chip on the right (version for PyPI, `★ star-count` for
  GitHub, `v<version>` for winget).
- Name: for GitHub, rendered as `owner/` (dimmed, regular weight) +
  `repo` (bold) — mirroring how GitHub itself displays a repo header. For
  PyPI, just the package name. Shrink-to-fit runs 74px down to 36px after
  fonts load; beyond that floor, CSS `text-overflow: ellipsis` truncates
  cleanly rather than letting text bleed past the card edge (verified with
  a synthetic ~90-character `owner/repo` + a full clone URL — see this
  skill's own commit history for that render if you want to see the
  failure mode it fixes).
- Summary: the project's own one-line PyPI summary or GitHub description,
  clamped to 2 lines.
- Install/clone row: `pip install <name>` or `git clone <url>.git`, styled
  as a dotted-border chip with a copy-icon affordance (decorative only in
  the static PNG). Same ellipsis safety-net as the name.
- **Height is intrinsic** — `.card` has no fixed height; Playwright's
  element screenshot bounds itself to whatever the content actually
  renders at. Don't reintroduce a fixed height or a `space-between` flex
  gap between the summary and the install row — that's what produced the
  dead middle space this skill's strip format replaced a credit-card-ratio
  layout to fix. If you widen `.card` (currently `1080px`) or change type
  sizes, re-render a short-summary case and a long-name case together to
  confirm neither dead space nor clipping crept back in.
- Corner watermark: the platform's own mark, faint (`.085` opacity),
  bottom-right.
- **Multi-package mode** is not a separate template — `combine_meta()` in
  `generate.py` folds N packages' fields into the same shape a single
  target already produces (joined name/summary strings, one combined
  install command) and hands that straight to `build_html()` /
  `card_template.html`. Resist the urge to give it its own DOM (tiles,
  columns, ...): every layout guarantee above (intrinsic height,
  shrink-to-fit, the ellipsis safety-net) already works correctly for a
  long joined string without any extra code, and a second template is
  exactly the kind of thing that quietly drifts out of sync with the
  first one.

Edit the template directly for layout changes — it's plain HTML/CSS, no
build step. Always re-render at least four cases after a layout edit: a
short name with a one-line summary (e.g. `requests`), a long name with a
two-line summary (e.g. `opentelemetry-instrumentation-fastapi`), a GitHub
repo (which exercises the owner-prefix title and the star chip that PyPI
cards don't have), and a winget package (which exercises the lightest,
warmest panel of the three — check text contrast didn't quietly degrade if
you touch the gradient stops).

## Trademarks

Logos are each platform's own trademark (PyPI's is a PSF mark, GitHub's
Octocat is a GitHub mark, the winget package icon is a Microsoft asset) —
use them to refer to that platform/project itself, not to brand something
else.
