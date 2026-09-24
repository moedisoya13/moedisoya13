#!/usr/bin/env python3
"""video-article helper.

  pending    <folder|video>                      미처리 영상 목록(JSON)
  transcribe <video> [--work DIR]                <영상>.mp3 분리 + WORK/transcript.txt (+ 내장 자막 .srt)
  frames     <video> --work DIR (--at T,.. | --every SEC)
                                                 프레임 JPG (화면 자막 확인용)
  render     <video> --work DIR --out HTML --title T --meta M
                                                 WORK/parts/*.html → 아티클(처리 표식 포함)

전사는 watch 스킬의 whisper.py(Groq/OpenAI Whisper, stdlib only)를 재사용한다.
"""
from __future__ import annotations

import argparse
import datetime as dt
import html
import json
import os
import re
import subprocess
import sys
import tempfile
from collections import Counter
from pathlib import Path

SKILL_DIR = Path(__file__).resolve().parent.parent
TEMPLATE = SKILL_DIR / "assets" / "article-template.html"
WATCH_SCRIPTS = Path.home() / ".claude" / "skills" / "watch" / "scripts"
VIDEO_EXTS = {".mp4", ".mkv", ".mov", ".webm", ".avi", ".m4v", ".ts", ".flv", ".wmv", ".mpg", ".mpeg", ".3gp"}
MARKER_RE = re.compile(r'<meta name="video-article-source" content="([^"]*)"')
TEXT_SUBS = {"subrip", "mov_text", "ass", "ssa", "webvtt", "text"}  # 이미지 자막(PGS 등)은 텍스트로 못 뽑음


def hms(sec: float) -> str:
    s = int(sec)
    return f"{s // 3600:02d}:{s % 3600 // 60:02d}:{s % 60:02d}"


def parse_ts(token: str, duration: float) -> float:
    """'SS' / 'MM:SS' / 'HH:MM:SS' / 'NN%'(길이 대비) → 초."""
    token = token.strip()
    if token.endswith("%"):
        return duration * float(token[:-1]) / 100
    sec = 0.0
    for part in token.split(":"):
        sec = sec * 60 + float(part)
    return sec


def processed_sources(folder: Path) -> set[str]:
    """이 스킬이 만든 HTML(표식 meta)이 가리키는 영상 파일명 집합."""
    done: set[str] = set()
    for page in folder.glob("*.html"):
        try:
            head = page.read_text(encoding="utf-8", errors="replace")[:8192]
        except OSError:
            continue
        done.update(html.unescape(m) for m in MARKER_RE.findall(head))
    return done


def output_paths(video: Path) -> dict:
    page = video.with_suffix(".html")
    if page.exists():  # 같은 이름의 남의 HTML이 있으면 덮어쓰지 않는다
        page = video.with_name(video.stem + ".article.html")
    return {"html": str(page), "audio": str(video.with_suffix(".mp3"))}


def probe(video: Path) -> dict:
    r = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration:stream=codec_type", "-of", "json", str(video)],
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    if r.returncode != 0:
        return {"status": "unreadable", "reason": r.stderr.strip()[:200]}
    data = json.loads(r.stdout or "{}")
    try:
        duration = float(data.get("format", {}).get("duration"))
    except (TypeError, ValueError):
        duration = 0.0
    if duration <= 0:
        return {"status": "unreadable", "reason": "길이를 알 수 없음(다운로드 미완료/손상 가능)"}
    if not any(s.get("codec_type") == "audio" for s in data.get("streams", [])):
        return {"status": "no_audio", "duration": hms(duration), "seconds": round(duration, 1)}
    return {"status": "pending", "duration": hms(duration), "seconds": round(duration, 1)}


def cmd_pending(args) -> None:
    target = Path(args.path).expanduser().resolve()
    if target.is_dir():
        folder = target
        videos = sorted(p for p in target.iterdir() if p.suffix.lower() in VIDEO_EXTS and p.is_file())
    elif target.is_file():
        folder, videos = target.parent, [target]
    else:
        raise SystemExit(f"경로를 찾을 수 없음: {target}")
    done = processed_sources(folder)
    items = []
    for v in videos:
        if v.name in done:
            items.append({"video": str(v), "status": "done"})
        else:
            info = probe(v)
            items.append({"video": str(v), **info, **(output_paths(v) if info["status"] == "pending" else {})})
    counts = Counter(i["status"] for i in items)
    print(json.dumps({"folder": str(folder), "counts": counts, "items": items}, ensure_ascii=False, indent=2))


def watch_module(name: str):
    sys.path.insert(0, str(WATCH_SCRIPTS))
    try:
        return __import__(name)
    except ImportError:
        raise SystemExit(f"watch 스킬의 {name}.py를 찾을 수 없음: {WATCH_SCRIPTS}")


def extract_subs(video: Path, work: Path) -> list[str]:
    """내장 텍스트 자막 트랙 → WORK/subs_<n>_<lang>.srt. 소프트 자막은 프레임에 안 찍히므로 따로 뽑는다."""
    r = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "s", "-show_entries", "stream=codec_name:stream_tags=language",
         "-of", "json", str(video)],
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    out = []
    for n, s in enumerate(json.loads(r.stdout or "{}").get("streams", [])):
        if s.get("codec_name") not in TEXT_SUBS:
            continue
        srt = work / f"subs_{n}_{s.get('tags', {}).get('language', 'und')}.srt"
        done = subprocess.run(
            ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(video), "-map", f"0:s:{n}", str(srt)],
            capture_output=True,
        )
        if done.returncode == 0 and srt.exists():
            out.append(str(srt))
    return out


def cmd_transcribe(args) -> None:
    whisper = watch_module("whisper")

    video = Path(args.video).expanduser().resolve()
    audio = video.with_suffix(".mp3")
    work = Path(args.work).resolve() if args.work else Path(tempfile.mkdtemp(prefix="video-article-"))
    work.mkdir(parents=True, exist_ok=True)

    backend, key = whisper.load_api_key()
    if not key:
        raise SystemExit("Whisper API 키 없음: ~/.config/watch/.env 에 GROQ_API_KEY 또는 OPENAI_API_KEY 필요")

    if audio.exists() and audio.stat().st_size > 0:
        print(f"[va] 기존 오디오 재사용: {audio.name}", file=sys.stderr)
    else:
        part = audio.with_name(audio.stem + ".part.mp3")  # 중단된 추출물이 완성본으로 재사용되지 않게
        whisper.extract_audio(str(video), part)
        os.replace(part, audio)

    # watch의 transcribe_video()는 chunks/를 오디오 옆(사용자 폴더)에 만들므로 흐름만 다시 조립한다.
    def one(path: Path) -> list[dict]:
        return whisper._transcribe_file(backend, key, path)

    size = audio.stat().st_size
    duration = whisper.audio_duration(audio)
    if size <= whisper.MAX_UPLOAD_BYTES:
        segments = one(audio)
    else:
        plan = whisper.plan_chunks(duration, size)
        segments = whisper.transcribe_chunks(whisper.split_audio(audio, work / "chunks", plan), one)

    transcript = work / "transcript.txt"
    transcript.write_text("".join(f"[{hms(s['start'])}] {s['text']}\n" for s in segments), encoding="utf-8")

    # 청크 실패·무음 구간은 조용히 빠지므로 가장 긴 공백을 드러낸다.
    ends = [0.0] + [s["end"] for s in segments]
    starts = [s["start"] for s in segments] + [duration]
    chars = sum(len(s["text"]) for s in segments)
    print(json.dumps({
        "video": str(video),
        "audio": str(audio),
        "work": str(work),
        "transcript": str(transcript),
        "backend": backend,
        "duration": hms(duration),
        "segments": len(segments),
        "chars_per_min": round(chars / max(duration / 60, 1 / 60)),
        "max_gap": hms(max(b - a for a, b in zip(ends, starts))),
        "subtitle_files": extract_subs(video, work),
    }, ensure_ascii=False, indent=2))


def cmd_frames(args) -> None:
    frames = watch_module("frames")
    video = Path(args.video).expanduser().resolve()
    if not video.is_file():  # 빈 목록은 "자막 대조 생략" 신호로 쓰이므로 경로 실수와 섞이면 안 된다
        raise SystemExit(f"영상 파일 없음: {video}")
    duration = probe(video).get("seconds") or 0.0
    if args.every:
        times = [i * args.every for i in range(int(duration // args.every) + 1)]
    else:
        times = [parse_ts(t, duration) for t in args.at.split(",") if t.strip()]
    times = [min(t, max(duration - 0.5, 0.0)) for t in times]  # 정확히 끝 시점엔 프레임이 없다
    # extract_at_timestamps는 호출마다 out_dir의 cue_*.jpg를 지우므로 호출마다 폴더를 나눈다
    root = Path(args.work) / "frames"
    out_dir = root / f"{len(list(root.glob('*'))) if root.exists() else 0:03d}"
    shots, _ = frames.extract_at_timestamps(str(video), out_dir, times, resolution=args.width, max_frames=args.max)
    print(json.dumps([{"t": hms(s["timestamp_seconds"]), "path": s["path"]} for s in shots], ensure_ascii=False, indent=2))


def render(video_name: str, title: str, meta: str, body: str, date: str) -> str:
    page = TEMPLATE.read_text(encoding="utf-8")
    # BODY는 마지막에 치환: 본문에 우연히 든 {{…}} 문자열이 다시 치환되지 않게
    for key, val in (
        ("{{SOURCE}}", html.escape(video_name, quote=True)),
        ("{{TITLE}}", html.escape(title)),
        ("{{META}}", html.escape(meta)),
        ("{{DATE}}", date),
        ("{{BODY}}", body),
    ):
        page = page.replace(key, val)
    return page


def cmd_render(args) -> None:
    parts = sorted((Path(args.work) / "parts").glob("*.html"))
    if not parts:
        raise SystemExit(f"본문 조각 없음: {Path(args.work) / 'parts'}/*.html")
    body = "\n".join(p.read_text(encoding="utf-8").strip() for p in parts)
    page = render(Path(args.video).name, args.title, args.meta, body, dt.date.today().isoformat())
    out = Path(args.out)
    out.write_text(page, encoding="utf-8")
    print(json.dumps({"html": str(out), "parts": len(parts), "bytes": out.stat().st_size}, ensure_ascii=False))


def main() -> None:
    # Windows 기본 cp949에서는 한글 경로의 ffmpeg/ffprobe 출력 디코딩이 깨진다 → UTF-8 모드로 재실행
    if not sys.flags.utf8_mode:
        os.environ["PYTHONUTF8"] = "1"
        raise SystemExit(subprocess.call([sys.executable, *sys.argv]))

    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("pending")
    p.add_argument("path")
    p.set_defaults(fn=cmd_pending)
    t = sub.add_parser("transcribe")
    t.add_argument("video")
    t.add_argument("--work")
    t.set_defaults(fn=cmd_transcribe)
    f = sub.add_parser("frames")
    f.add_argument("video")
    f.add_argument("--work", required=True)
    g = f.add_mutually_exclusive_group(required=True)
    g.add_argument("--at", help="쉼표 구분 시점: SS, MM:SS, HH:MM:SS, NN%%")
    g.add_argument("--every", type=float, help="N초 간격 (--max 초과분은 균등 솎음)")
    f.add_argument("--max", type=int, default=60)
    f.add_argument("--width", type=int, default=960)
    f.set_defaults(fn=cmd_frames)
    r = sub.add_parser("render")
    r.add_argument("video")
    r.add_argument("--work", required=True)
    r.add_argument("--out", required=True)
    r.add_argument("--title", required=True)
    r.add_argument("--meta", required=True)
    r.set_defaults(fn=cmd_render)
    args = ap.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
