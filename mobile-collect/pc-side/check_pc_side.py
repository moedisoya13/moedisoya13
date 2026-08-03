#!/usr/bin/env python3
"""PC측(쿠팡 저장소) 확인 1~3 계측기.

NOTES.md의 확인 1~3은 "코드를 못 봐서 확정하지 못한 항목"이다. 이 스크립트는 그 확인을
**추측이 아니라 측정**으로 바꾼다. 쿠팡 저장소(`C:\\Users\\gram\\Downloads\\NewPipe`) 루트에서
한 번 실행하면 무엇을 고쳐야 하는지가 파일:줄 단위로 나온다.

    python mobile-collect/pc-side/check_pc_side.py

성질:
  - **표준 라이브러리만** 쓴다. 설치할 것이 없다.
  - **읽기 전용**이다. 어떤 파일도 만들거나 고치지 않는다.
  - 확인 3은 완전히 결정적이다(집합 차분). 확인 1은 판정하지 않고 **근거를 인쇄**한다 —
    NOTES.md의 결정표 중 어느 칸인지는 사람이 코드를 보고 고른다.

확인 4·5(파서 교정·CSV 검수)는 **의도적으로 넣지 않았다.** 실물 모바일 픽스처 없이 파서를
판정하는 것은 이 프로젝트가 금지한 행위다(인수인계 문서 §10 버그 #3이 정확히 그렇게 생겼다).
이 스크립트는 확인 3까지 끝내고 멈춘다.

종료코드 (인수인계 문서 §8 관례와 같은 결):
  0  차이 없음 — 그대로 동작한다
  1  조치 필요 — 무엇을 어디서 고칠지 인쇄했다
  3  대상 파일을 못 찾음 — 쿠팡 저장소 루트에서 실행했는지 확인
"""

from __future__ import annotations

import argparse
import ast
import json
import sys
from pathlib import Path
from typing import Iterable, NamedTuple

EXIT_OK = 0
EXIT_ACTION_NEEDED = 1
EXIT_TARGET_MISSING = 3

PACKAGE = "coupang_crawler"

# 확인 3 — parse.py에서 차단 마커 목록으로 볼 상수 이름의 힌트.
#
# ⚠ "MARKER"를 힌트로 넣지 말 것. parse.py에는 SELLER_SECTION_MARKERS 같은 **차단과 무관한**
#   마커 목록이 있고, 그것까지 끌어오면 '다른 판매자' 같은 정상 문구가 차단 마커 차이로
#   보고된다. 그 보고를 그대로 따르면 정상 페이지가 차단으로 판정돼 수집이 조용히 버려진다.
#   차단을 뜻하는 낱말만 힌트로 쓴다.
MARKER_NAME_HINTS = ("BLOCK", "DENIED", "DENY", "REJECT")

# 확인 1 — 파일명을 다루는 코드의 표지.
FILENAME_HINTS = (".stem", ".name", "splitext", "basename", "glob", "iterdir", "rsplit")

# 확인 2 — 접미사 → source 매핑.
SUFFIX_TO_SOURCE = {
    "": "option_list",
    "_sellers": "other_sellers",
    "_search": "search_results",
}


class Hit(NamedTuple):
    """소스에서 찾은 문자열 리터럴 한 건."""

    path: Path
    lineno: int
    value: str


class Module(NamedTuple):
    """파싱에 성공한 파이썬 모듈."""

    path: Path
    source: str
    tree: ast.Module


# ── 공통 ──────────────────────────────────────────────────────


def rel(path: Path, root: Path) -> str:
    """가능하면 저장소 기준 상대경로로 보여 준다."""
    try:
        return str(path.relative_to(root))
    except ValueError:
        return str(path)


def load_module(path: Path) -> Module | None:
    """파이썬 파일을 읽어 AST까지 만든다. 실패하면 None."""
    try:
        source = path.read_text(encoding="utf-8")
    except OSError:
        return None
    try:
        tree = ast.parse(source, filename=str(path))
    except SyntaxError as err:
        print(f"  ! 파싱 실패 {path}: {err}")
        return None
    return Module(path=path, source=source, tree=tree)


def docstring_node_ids(tree: ast.Module) -> set[int]:
    """docstring과 statement로 쓰인 문자열의 노드 id를 모은다.

    이것들은 **설명이지 코드가 아니다.** 산문에 `_sellers`가 나온다고 해서 접미사를
    처리한다는 증거가 될 수 없다(거짓 통과의 주된 경로).
    """
    ids: set[int] = set()
    for node in ast.walk(tree):
        body = getattr(node, "body", None)
        if isinstance(body, list) and body:
            first = body[0]
            if isinstance(first, ast.Expr) and isinstance(first.value, ast.Constant):
                if isinstance(first.value.value, str):
                    ids.add(id(first.value))
        if isinstance(node, ast.Expr) and isinstance(node.value, ast.Constant):
            if isinstance(node.value.value, str):
                ids.add(id(node.value))
    return ids


def string_hits(module: Module, needles: Iterable[str]) -> list[Hit]:
    """문자열 리터럴 중 needles를 포함하는 것을 모은다.

    주석이 아니라 **실제 리터럴**만 본다. grep과 달리 `# _sellers` 같은 주석에 속지 않고,
    docstring·설명용 문자열도 제외한다.
    """
    wanted = tuple(needles)
    skip = docstring_node_ids(module.tree)
    hits: list[Hit] = []
    for node in ast.walk(module.tree):
        if isinstance(node, ast.Constant) and isinstance(node.value, str):
            if id(node) in skip:
                continue
            for needle in wanted:
                if needle in node.value:
                    hits.append(Hit(module.path, node.lineno, node.value))
                    break
    return hits


def module_level_string_lists(module: Module) -> dict[str, tuple[int, list[str]]]:
    """모듈 최상단의 `이름 = ["문자열", ...]` 형태 상수를 전부 모은다."""
    found: dict[str, tuple[int, list[str]]] = {}
    for node in module.tree.body:
        if isinstance(node, ast.Assign):
            names = [t.id for t in node.targets if isinstance(t, ast.Name)]
        elif isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name):
            names = [node.target.id]
        else:
            continue

        value = node.value
        if not isinstance(value, (ast.List, ast.Tuple, ast.Set)):
            continue
        items = [
            elt.value
            for elt in value.elts
            if isinstance(elt, ast.Constant) and isinstance(elt.value, str)
        ]
        # 문자열이 아닌 원소가 섞여 있으면 마커 목록이 아니다.
        if not items or len(items) != len(value.elts):
            continue
        for name in names:
            found[name] = (node.lineno, items)
    return found


# ── 확인 1 — from_text.py의 파일명 규칙 ───────────────────────


def check1_filename_rule(module: Module, root: Path) -> bool:
    """파일명 → 상품 매핑이 어떻게 되는지 **근거를 인쇄**한다.

    판정하지 않는다. NOTES.md의 결정표(그대로 두기 / ⓐ 단축어 매핑 / ⓑ config.py 재사용)
    중 어느 칸인지는 사람이 아래 출력을 보고 고른다.

    Returns:
        조치가 필요해 보이면 True.
    """
    print("\n" + "─" * 68)
    print("확인 1 — from_text.py의 파일명 규칙")
    print("─" * 68)
    print(f"  대상: {rel(module.path, root)}")

    uses_product_id = [
        node.lineno
        for node in ast.walk(module.tree)
        if (isinstance(node, ast.Name) and node.id == "product_id")
        or (isinstance(node, ast.Attribute) and node.attr == "product_id")
        or (isinstance(node, ast.Constant) and node.value == "product_id")
    ]
    uses_name = [
        node.lineno
        for node in ast.walk(module.tree)
        if (isinstance(node, ast.Attribute) and node.attr == "name")
        or (isinstance(node, ast.Constant) and node.value == "name")
    ]

    print(f"\n  product_id 참조: {len(uses_product_id)}곳 {sorted(set(uses_product_id))[:12]}")
    print(f"  name 참조:       {len(uses_name)}곳 {sorted(set(uses_name))[:12]}")

    # 파일명을 만지는 함수의 소스를 그대로 보여 준다 — 이게 사람이 판단할 근거다.
    shown = 0
    for node in ast.walk(module.tree):
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        segment = ast.get_source_segment(module.source, node) or ""
        if not any(hint in segment for hint in FILENAME_HINTS):
            continue
        if shown >= 3:
            print("\n  … 파일명을 다루는 함수가 더 있습니다. 직접 열어 보세요.")
            break
        print(f"\n  ┌─ {node.name}()  ({rel(module.path, root)}:{node.lineno})")
        lines = segment.splitlines()
        for offset, line in enumerate(lines[:60]):
            print(f"  │ {node.lineno + offset:>4}  {line}")
        if len(lines) > 60:
            print(f"  │ … {len(lines) - 60}줄 생략")
        print("  └─")
        shown += 1

    if shown == 0:
        print("\n  ! 파일명을 다루는 함수를 찾지 못했습니다. 모듈을 직접 열어 보세요.")

    print("\n  판단 (NOTES.md 결정표):")
    print("    · 이미 product_id로 찾음      → 아무것도 안 함. 키트가 그대로 동작")
    print("    · 상품명(name) 기준           → ⓐ 단축어에 이름 매핑 사전 추가 (BUILD.md ⑥,")
    print("                                     Python 무수정)  또는  ⓑ config.py의 URL")
    print("                                     정규화를 **재사용**해 역인덱스 구성")
    print("    ⓑ를 택하면 정규식을 새로 짜지 마세요 — 규칙이 두 벌이 됩니다.")
    print("\n  → 이 항목은 스크립트가 판정하지 않습니다. 위 소스를 보고 사람이 고릅니다.")
    return False


# ── 확인 2 — `_sellers` 접미사를 알아보는가 ───────────────────


def check2_suffix(modules: list[Module], root: Path) -> bool:
    """`_search`는 있는데 `_sellers`가 없으면 추가할 위치를 지목한다."""
    print("\n" + "─" * 68)
    print("확인 2 — `_sellers` 접미사를 알아보는가")
    print("─" * 68)

    source_names = set(SUFFIX_TO_SOURCE.values())

    def suffix_hits(module: Module, suffix: str) -> list[Hit]:
        """접미사 리터럴만 고른다.

        ⚠ 단순 부분문자열 검색은 안 된다. source 이름 `other_sellers`가 `_sellers`를
          포함하므로, 접미사를 전혀 처리하지 않는 저장소도 통과해 버린다(거짓 통과).
          그러면 source가 틀린 채로 수집이 쌓이고 버그 #2식 유실이 난다.
          그래서 source 이름과 정확히 같은 리터럴은 접미사 증거에서 뺀다.
        """
        return [
            hit
            for hit in string_hits(module, [suffix])
            if hit.value not in source_names
            # 공백이 있으면 산문이다. 실제 접미사 리터럴은 `_sellers`, `*_sellers.txt`처럼
            # 공백이 없다.
            and not any(ch.isspace() for ch in hit.value)
        ]

    def dedupe(hits: list[Hit]) -> list[Hit]:
        seen: set[tuple[str, int, str]] = set()
        out: list[Hit] = []
        for hit in hits:
            key = (str(hit.path), hit.lineno, hit.value)
            if key not in seen:
                seen.add(key)
                out.append(hit)
        return out

    search_hits: list[Hit] = []
    sellers_hits: list[Hit] = []
    source_hits: dict[str, list[Hit]] = {name: [] for name in SUFFIX_TO_SOURCE.values()}

    for module in modules:
        search_hits.extend(suffix_hits(module, "_search"))
        sellers_hits.extend(suffix_hits(module, "_sellers"))
        for source_name in source_hits:
            source_hits[source_name].extend(
                hit for hit in string_hits(module, [source_name]) if hit.value == source_name
            )

    search_hits = dedupe(search_hits)
    sellers_hits = dedupe(sellers_hits)
    source_hits = {name: dedupe(hits) for name, hits in source_hits.items()}

    def report(label: str, hits: list[Hit]) -> None:
        if not hits:
            print(f"  {label:<18} 없음")
            return
        where = ", ".join(f"{rel(h.path, root)}:{h.lineno}" for h in hits[:6])
        extra = f" (+{len(hits) - 6})" if len(hits) > 6 else ""
        print(f"  {label:<18} {len(hits)}곳 — {where}{extra}")

    report("'_search'", search_hits)
    report("'_sellers'", sellers_hits)
    print()
    for source_name, hits in source_hits.items():
        report(f"'{source_name}'", hits)

    if search_hits and not sellers_hits:
        print("\n  ✗ 조치 필요 — `_search`는 알아보는데 `_sellers`가 없습니다.")
        print("     아래 위치에 `_search`와 같은 자리로 `_sellers`를 추가하세요:")
        for hit in search_hits[:6]:
            print(f"       {rel(hit.path, root)}:{hit.lineno}")
        print("\n     매핑: option_list ← 접미사 없음 / other_sellers ← _sellers"
              " / search_results ← _search")
        print("     §7의 중복 판정 키가 source마다 다릅니다(other_sellers의 식별자는 **판매자**).")
        print("     source가 틀리면 버그 #2와 같은 데이터 유실이 납니다.")
        return True

    if not search_hits and not sellers_hits:
        print("\n  ? 접미사 리터럴을 하나도 못 찾았습니다. from_text.py가 접미사를 다른 방식으로")
        print("    다루는지(정규식 등) 직접 확인하세요.")
        return True

    print("\n  ✓ `_sellers`를 알아봅니다.")
    return False


# ── 확인 3 — 차단 마커 목록 동기화 ────────────────────────────


def check3_markers(module: Module, markers_path: Path, root: Path) -> bool:
    """parse.py의 마커와 extract.js의 마커(markers.json)를 집합 차분한다.

    이 확인만은 완전히 결정적이다.
    """
    print("\n" + "─" * 68)
    print("확인 3 — 차단 마커 목록 동기화")
    print("─" * 68)

    try:
        payload = json.loads(markers_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as err:
        print(f"  ! markers.json을 읽지 못했습니다 ({markers_path}): {err}")
        print("    `cd mobile-collect && npm run dump:markers`로 생성하세요.")
        return True

    kit_markers = set(payload.get("hard", [])) | set(payload.get("soft", []))
    print(f"  extract.js 쪽: {len(kit_markers)}개 (markers.json)")

    candidates = module_level_string_lists(module)
    marker_consts = {
        name: value
        for name, value in candidates.items()
        if any(hint in name.upper() for hint in MARKER_NAME_HINTS)
    }

    if not marker_consts:
        print(f"  ! {rel(module.path, root)}에서 마커 목록으로 볼 상수를 못 찾았습니다.")
        if candidates:
            print("    최상단 문자열 리스트 상수 후보:")
            for name, (lineno, items) in list(candidates.items())[:10]:
                print(f"      {name} ({rel(module.path, root)}:{lineno}, {len(items)}개)")
            print("    이 중 차단 마커가 있으면 MARKER_NAME_HINTS를 늘리거나 직접 비교하세요.")
        return True

    parse_markers: set[str] = set()
    for name, (lineno, items) in sorted(marker_consts.items()):
        print(f"  parse.py 쪽: {name} ({rel(module.path, root)}:{lineno}, {len(items)}개)")
        parse_markers.update(items)

    # 차단 목록으로 보지 않은 상수도 보여 준다 — 이름이 특이해서 놓친 경우를 사람이 잡도록.
    skipped = sorted(set(candidates) - set(marker_consts))
    if skipped:
        print(f"  (차단 목록으로 보지 않음: {', '.join(skipped)})")

    only_parse = sorted(parse_markers - kit_markers)
    only_kit = sorted(kit_markers - parse_markers)

    if not only_parse and not only_kit:
        print(f"\n  ✓ 양쪽이 일치합니다 ({len(parse_markers)}개).")
        return False

    print()
    if only_parse:
        print("  ✗ parse.py에만 있음 — extract.js에 추가하세요:")
        for marker in only_parse:
            print(f"       {marker!r}")
    if only_kit:
        print("  ✗ extract.js에만 있음 — parse.py에 없는 문구입니다:")
        for marker in only_kit:
            print(f"       {marker!r}")
        print("     폰 쪽에만 있는 마커는 **오탐이면 정상 수집을 조용히 버립니다.**")
        print("     parse.py에도 넣을지, extract.js에서 뺄지 판단하세요.")

    print("\n  고친 뒤 반드시 함께 갱신:")
    print("       mobile-collect/tests/extract.test.mjs 의 고정 테스트")
    print("       npm run build:snippet   (단축어 스니펫)")
    print("       npm run dump:markers    (이 파일)")
    return True


# ── 진입점 ────────────────────────────────────────────────────


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="PC측 확인 1~3 계측기 (읽기 전용, 표준 라이브러리만).",
        epilog="확인 4·5는 실물 모바일 픽스처를 확보한 뒤에 합니다. 이 스크립트는 확인 3에서 멈춥니다.",
    )
    parser.add_argument(
        "--repo",
        type=Path,
        default=Path.cwd(),
        help="쿠팡 저장소 루트 (기본: 현재 디렉터리)",
    )
    parser.add_argument(
        "--markers",
        type=Path,
        default=Path(__file__).resolve().parent / "markers.json",
        help="extract.js에서 생성한 markers.json 경로",
    )
    args = parser.parse_args(argv)

    root: Path = args.repo.resolve()
    package_dir = root / PACKAGE

    print("=" * 68)
    print("PC측 확인 1~3 — 쿠팡 판매가 수집 (모바일 경로)")
    print("=" * 68)
    print(f"저장소: {root}")

    if not package_dir.is_dir():
        print(f"\n✗ {PACKAGE}/ 를 찾을 수 없습니다: {package_dir}")
        print("  쿠팡 저장소 루트에서 실행하거나 --repo 로 경로를 주세요.")
        print("  예: python mobile-collect/pc-side/check_pc_side.py --repo C:\\Users\\gram\\Downloads\\NewPipe")
        return EXIT_TARGET_MISSING

    from_text = load_module(package_dir / "from_text.py")
    parse_py = load_module(package_dir / "parse.py")

    missing = [
        name
        for name, module in (("from_text.py", from_text), ("parse.py", parse_py))
        if module is None
    ]
    if missing:
        print(f"\n✗ 읽지 못한 파일: {', '.join(missing)} (in {rel(package_dir, root)})")
        return EXIT_TARGET_MISSING

    assert from_text is not None and parse_py is not None  # 위에서 걸렀다

    # 확인 2는 패키지 전체를 훑는다 — 접미사 처리가 어디에 있을지 모른다.
    all_modules = [m for m in (load_module(p) for p in sorted(package_dir.glob("*.py"))) if m]

    needs_action = False
    needs_action |= check1_filename_rule(from_text, root)
    needs_action |= check2_suffix(all_modules, root)
    needs_action |= check3_markers(parse_py, args.markers, root)

    print("\n" + "=" * 68)
    if needs_action:
        print("결과: 조치 필요 — 위에 지목된 곳을 고치고 다시 실행하세요.")
    else:
        print("결과: 확인 1~3 통과. 키트가 그대로 동작합니다.")
    print()
    print("확인 4·5(파서 마커 교정·CSV 검수)는 **첫 실물 모바일 픽스처를 확보한 뒤**에 합니다.")
    print("  1. 실기기에서 첫 수집 → 실물 텍스트")
    print("  2. 그 텍스트를 받은 그대로 픽스처로 커밋")
    print("  3. 그제서야 파서 마커 교정")
    print("2번 없이 3번을 먼저 하면 버그 #3(상품명을 판매자로 지어냄)이 재발합니다.")
    print("=" * 68)

    return EXIT_ACTION_NEEDED if needs_action else EXIT_OK


if __name__ == "__main__":
    sys.exit(main())
