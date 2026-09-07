"""커밋 직전 안전망.

digests/ 와 state/ 에 토큰처럼 보이는 문자열이 섞여 들어가면 커밋을 막는다.
파이프라인이 시크릿을 쓰지 않도록 짜여 있어도, 실수로 새는 경로를 기계적으로 차단한다.
"""

from __future__ import annotations

import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
TARGETS = ("digests", "state")

PATTERNS = {
    "카카오/일반 access token": re.compile(r"(?i)\b(access|refresh)_token\b"),
    "Bearer 헤더": re.compile(r"(?i)\bBearer\s+[\w.\-]{16,}"),
    "Anthropic API 키": re.compile(r"sk-ant-[\w\-]{8,}"),
    "GitHub 토큰": re.compile(r"\b(gh[pousr]_[A-Za-z0-9]{16,}|github_pat_[A-Za-z0-9_]{20,})\b"),
}


def main() -> int:
    findings = []
    for target in TARGETS:
        for path in (ROOT / target).rglob("*"):
            if not path.is_file():
                continue
            text = path.read_text(encoding="utf-8", errors="replace")
            for label, pattern in PATTERNS.items():
                if pattern.search(text):
                    findings.append(f"{path.relative_to(ROOT)}: {label}")

    if findings:
        print("커밋 대상 파일에서 시크릿처럼 보이는 내용을 찾았습니다:")
        for finding in findings:
            print(f"  - {finding}")
        return 1
    print("시크릿 스캔 통과.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
