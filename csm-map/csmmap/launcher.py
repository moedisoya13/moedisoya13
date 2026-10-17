"""Edge/Chrome 을 '앱 모드'(주소창 없는 창) 로 연다. 못 찾으면 기본 브라우저."""
from __future__ import annotations

import getpass
import os
import pathlib
import platform
import shutil
import subprocess
import sys
import tempfile
import webbrowser

WINDOWS_CANDIDATES = [
    r"%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe",
    r"%ProgramFiles%\Microsoft\Edge\Application\msedge.exe",
    r"%LocalAppData%\Microsoft\Edge\Application\msedge.exe",
    r"%ProgramFiles%\Google\Chrome\Application\chrome.exe",
    r"%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe",
    r"%LocalAppData%\Google\Chrome\Application\chrome.exe",
    r"%ProgramFiles%\BraveSoftware\Brave-Browser\Application\brave.exe",
    r"%LocalAppData%\Programs\Opera\opera.exe",
]
MAC_CANDIDATES = [
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
]
LINUX_CANDIDATES = ["microsoft-edge", "microsoft-edge-stable", "google-chrome", "google-chrome-stable",
                    "chromium", "chromium-browser", "brave-browser"]


def find_browser() -> str | None:
    system = platform.system()
    if system == "Windows":
        for c in WINDOWS_CANDIDATES:
            p = os.path.expandvars(c)
            if "%" not in p and pathlib.Path(p).is_file():
                return p
    elif system == "Darwin":
        for c in MAC_CANDIDATES:
            if pathlib.Path(c).is_file():
                return c
    else:
        for c in LINUX_CANDIDATES:
            p = shutil.which(c)
            if p:
                return p
    return None


def _profile_dir() -> pathlib.Path:
    """브라우저 전용 프로필. 공용 /tmp 에서 다른 사용자가 미리 만든 디렉터리를 쓰지 않도록
    사용자 이름을 붙이고 0700 으로 만들며, 소유자가 다르면 새 임시 디렉터리를 쓴다."""
    base = pathlib.Path(tempfile.gettempdir()) / f"csm-map-profile-{getpass.getuser()}"
    try:
        base.mkdir(mode=0o700, exist_ok=True)
        if hasattr(os, "getuid") and base.stat().st_uid != os.getuid():
            raise PermissionError
        return base
    except (OSError, PermissionError):
        return pathlib.Path(tempfile.mkdtemp(prefix="csm-map-profile-"))


def open_app_window(url: str, size: tuple[int, int] = (1440, 900)) -> str:
    """앱 모드로 열고 사용한 방식('app' | 'browser') 을 돌려준다."""
    exe = find_browser()
    if exe:
        profile = _profile_dir()
        args = [
            exe, f"--app={url}", f"--window-size={size[0]},{size[1]}",
            f"--user-data-dir={profile}", "--no-first-run", "--no-default-browser-check",
            "--disable-features=Translate",
        ]
        try:
            kwargs = {}
            if platform.system() == "Windows":
                kwargs["creationflags"] = getattr(subprocess, "DETACHED_PROCESS", 0)
            subprocess.Popen(args, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, **kwargs)
            return "app"
        except OSError:
            pass
    webbrowser.open(url)
    return "browser"


def open_folder(path: pathlib.Path) -> None:
    system = platform.system()
    try:
        if system == "Windows":
            os.startfile(str(path))  # type: ignore[attr-defined]
        elif system == "Darwin":
            subprocess.Popen(["open", str(path)])
        else:
            subprocess.Popen(["xdg-open", str(path)])
    except OSError:
        print(f"폴더: {path}", file=sys.stderr)
