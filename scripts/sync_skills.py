"""데스크톱의 Claude Code skill 을 이 저장소로 옮겨, 모바일(클라우드) 세션에서도 쓰게 한다.

클라우드 세션은 컨테이너에서 저장소를 새로 clone 해서 시작하므로, 데스크톱의
~/.claude/skills/ 는 보이지 않는다. 대신 저장소의 .claude/skills/ 는 그대로 로드된다.
그래서 데스크톱에서 이 스크립트를 한 번 돌리고 커밋·푸시하면 된다.

    python scripts/sync_skills.py              # 새 skill 만 복사
    python scripts/sync_skills.py --update     # 이미 있는 skill 도 데스크톱 쪽으로 덮어씀
    python scripts/sync_skills.py --dry-run    # 무엇을 할지만 출력
    python scripts/sync_skills.py --zip-dir skill-zips   # claude.ai 업로드용 zip 도 생성

--zip-dir 로 만든 zip 을 claude.ai 설정의 Skills 에 올리면, 이 저장소 밖의 세션에서도 쓸 수 있다.

시크릿처럼 보이는 내용이 든 skill 은 복사하지 않는다(저장소에 커밋되기 때문).
scan_output.py 의 패턴을 그대로 쓰지 않는 이유: 거기의 `access_token` 단어 패턴은
skill 문서가 API 사용법을 설명하기만 해도 걸려서, 값 모양의 패턴만 추렸다.
"""

from __future__ import annotations

import argparse
import pathlib
import re
import shutil
import sys
import zipfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
DEST_SKILLS = ROOT / ".claude" / "skills"
DEST_COMMANDS = ROOT / ".claude" / "commands"

SKIP_DIRS = {".git", "__pycache__", "node_modules", ".venv", "venv", ".pytest_cache"}
SKIP_FILES = re.compile(r"(^\.env(\..*)?$|\.pem$|\.key$|^\.DS_Store$|\.pyc$)")
MAX_FILE_BYTES = 5 * 1024 * 1024

SECRET_PATTERNS = {
    "Bearer 헤더": re.compile(r"(?i)\bBearer\s+[\w.\-]{16,}"),
    "Anthropic API 키": re.compile(r"sk-ant-[\w\-]{8,}"),
    "GitHub 토큰": re.compile(r"\b(gh[pousr]_[A-Za-z0-9]{16,}|github_pat_[A-Za-z0-9_]{20,})\b"),
    "OpenAI 키": re.compile(r"\bsk-(proj-)?[A-Za-z0-9]{32,}"),
    "AWS 액세스 키": re.compile(r"\bAKIA[0-9A-Z]{16}\b"),
    "개인 키": re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
}

# 클라우드 컨테이너에는 없는 경로. 경고만 하고 복사는 한다.
LOCAL_PATH = re.compile(r"([A-Za-z]:[\\/]Users[\\/]|/Users/[^/\s]+/|/home/[^/\s]+/)")


def skill_files(skill_dir: pathlib.Path) -> tuple[list[pathlib.Path], list[str]]:
    """복사할 파일 목록과, 건너뛴 파일에 대한 설명을 돌려준다."""
    files, skipped = [], []
    for path in sorted(skill_dir.rglob("*")):
        rel = path.relative_to(skill_dir)
        if any(part in SKIP_DIRS for part in rel.parts) or not path.is_file():
            continue
        if SKIP_FILES.search(path.name):
            skipped.append(f"{rel} (민감하거나 불필요한 파일)")
        elif path.stat().st_size > MAX_FILE_BYTES:
            skipped.append(f"{rel} (5MB 초과)")
        else:
            files.append(path)
    return files, skipped


def scan(skill_dir: pathlib.Path, files: list[pathlib.Path]) -> tuple[list[str], list[str]]:
    """(시크릿 발견 목록, 로컬 경로 경고 목록)."""
    secrets, local_paths = [], []
    for path in files:
        text = path.read_text(encoding="utf-8", errors="ignore")
        rel = path.relative_to(skill_dir)
        for label, pattern in SECRET_PATTERNS.items():
            if pattern.search(text):
                secrets.append(f"{rel}: {label}")
        if LOCAL_PATH.search(text):
            local_paths.append(str(rel))
    return secrets, local_paths


def copy_skill(skill_dir: pathlib.Path, files: list[pathlib.Path], dest: pathlib.Path) -> None:
    if dest.exists():
        shutil.rmtree(dest)
    for path in files:
        target = dest / path.relative_to(skill_dir)
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, target)


def zip_skill(skill_dir: pathlib.Path, files: list[pathlib.Path], zip_path: pathlib.Path) -> None:
    """claude.ai 업로드 형식: zip 최상위에 skill 이름 폴더, 그 안에 SKILL.md."""
    zip_path.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for path in files:
            zf.write(path, pathlib.PurePosixPath(skill_dir.name, *path.relative_to(skill_dir).parts))


def sync(
    src: pathlib.Path,
    dest: pathlib.Path,
    *,
    update: bool = False,
    dry_run: bool = False,
    exclude: frozenset[str] = frozenset(),
    zip_dir: pathlib.Path | None = None,
) -> dict[str, list[str]]:
    report: dict[str, list[str]] = {
        "added": [], "updated": [], "unchanged": [], "kept": [], "blocked": [], "warnings": [],
    }
    for skill_dir in sorted(p for p in src.iterdir() if p.is_dir()):
        name = skill_dir.name
        if name in exclude or not (skill_dir / "SKILL.md").is_file():
            continue
        files, skipped = skill_files(skill_dir)
        secrets, local_paths = scan(skill_dir, files)
        if secrets:
            report["blocked"].append(f"{name}: " + ", ".join(secrets))
            continue
        report["warnings"] += [f"{name}/{s} 건너뜀" for s in skipped]
        if local_paths:
            report["warnings"].append(
                f"{name}: 로컬 절대경로 참조 ({', '.join(local_paths)}) — 클라우드에서 실패할 수 있음"
            )

        if zip_dir is not None and not dry_run:
            zip_skill(skill_dir, files, zip_dir / f"{name}.zip")

        target = dest / name
        if not target.exists():
            status = "added"
        elif _same(skill_dir, files, target):
            status = "unchanged"
        elif update:
            status = "updated"
        else:
            status = "kept"
        report[status].append(name)
        if status in ("added", "updated") and not dry_run:
            copy_skill(skill_dir, files, target)
    return report


def sync_commands(src: pathlib.Path, dest: pathlib.Path, *, update: bool, dry_run: bool) -> list[str]:
    """~/.claude/commands/*.md (skill 을 부르는 slash command) 도 같이 옮긴다."""
    copied = []
    if not src.is_dir():
        return copied
    for path in sorted(src.glob("*.md")):
        target = dest / path.name
        if target.exists() and (not update or target.read_bytes() == path.read_bytes()):
            continue
        copied.append(path.name)
        if not dry_run:
            dest.mkdir(parents=True, exist_ok=True)
            shutil.copy2(path, target)
    return copied


def _same(skill_dir: pathlib.Path, files: list[pathlib.Path], target: pathlib.Path) -> bool:
    theirs = {p.relative_to(target) for p in target.rglob("*") if p.is_file()}
    ours = {p.relative_to(skill_dir) for p in files}
    return theirs == ours and all(
        (target / rel).read_bytes() == (skill_dir / rel).read_bytes() for rel in ours
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--src", type=pathlib.Path, default=pathlib.Path.home() / ".claude" / "skills")
    parser.add_argument("--commands-src", type=pathlib.Path, default=pathlib.Path.home() / ".claude" / "commands")
    parser.add_argument("--update", action="store_true", help="저장소에 이미 있는 skill 도 덮어쓴다")
    parser.add_argument("--dry-run", action="store_true", help="복사하지 않고 결과만 출력")
    parser.add_argument("--exclude", default="", help="제외할 skill 이름, 쉼표로 구분")
    parser.add_argument("--zip-dir", type=pathlib.Path, help="claude.ai 업로드용 zip 을 만들 폴더")
    args = parser.parse_args(argv)

    if not args.src.is_dir():
        print(f"skill 폴더가 없습니다: {args.src}")
        return 1

    exclude = frozenset(s.strip() for s in args.exclude.split(",") if s.strip())
    report = sync(
        args.src, DEST_SKILLS,
        update=args.update, dry_run=args.dry_run, exclude=exclude, zip_dir=args.zip_dir,
    )
    commands = sync_commands(args.commands_src, DEST_COMMANDS, update=args.update, dry_run=args.dry_run)

    labels = {
        "added": "추가", "updated": "갱신", "unchanged": "동일(건너뜀)",
        "kept": "저장소 쪽과 다름(유지, --update 로 덮어쓰기)",
        "blocked": "시크릿 의심으로 복사 안 함", "warnings": "경고",
    }
    prefix = "[dry-run] " if args.dry_run else ""
    for key, label in labels.items():
        if report[key]:
            print(f"{prefix}{label}:")
            for item in report[key]:
                print(f"  - {item}")
    if commands:
        print(f"{prefix}command 복사:")
        for name in commands:
            print(f"  - {name}")
    if args.zip_dir and not args.dry_run:
        print(f"업로드용 zip: {args.zip_dir}")

    if (report["added"] or report["updated"] or commands) and not args.dry_run:
        print("\n다음으로 커밋·푸시하면 모바일 세션에서 쓸 수 있습니다:")
        print('  git add .claude && git commit -m "chore: 데스크톱 skill 동기화" && git push')
    return 1 if report["blocked"] else 0


if __name__ == "__main__":
    sys.exit(main())
