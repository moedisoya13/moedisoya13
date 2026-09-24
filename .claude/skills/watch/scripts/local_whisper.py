#!/usr/bin/env python3
"""Local Whisper transcription via faster-whisper.

Unlike whisper.py (which uploads audio to Groq/OpenAI), this runs the model on
this machine — no audio ever leaves it. It reuses whisper.extract_audio so the
input is the same mono 16 kHz mp3 the API path uses, then hands it to
faster-whisper (CTranslate2, CPU int8 by default) and returns segments in the
same {start, end, text} shape as parse_vtt / the API path, so the rest of the
pipeline (filter_range, format_transcript) doesn't care where the transcript
came from.

The model weights download once from Hugging Face on first use (base ~140 MB,
small ~460 MB) and are cached under ~/.cache/huggingface afterwards.
"""
from __future__ import annotations

import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from whisper import extract_audio  # noqa: E402  (reuse the tested audio extractor)


def is_available() -> bool:
    """True if faster-whisper is importable on this interpreter."""
    try:
        import faster_whisper  # noqa: F401
        return True
    except Exception:
        return False


def transcribe_local(
    video_path: str,
    audio_out: Path,
    model_name: str = "base",
    compute_type: str = "int8",
    device: str = "cpu",
) -> tuple[list[dict], str]:
    """Extract audio, run faster-whisper locally, return (segments, backend_label).

    Raises SystemExit on any failure so watch.py's existing except-SystemExit
    handling treats it exactly like an API failure (logs, proceeds frames-only).
    """
    try:
        from faster_whisper import WhisperModel
    except Exception as exc:  # noqa: BLE001
        raise SystemExit(
            "faster-whisper is not installed. Install it with: "
            "python -m pip install --user faster-whisper"
        ) from exc

    print(f"[watch] extracting audio for local Whisper ({model_name})…", file=sys.stderr)
    audio_path = extract_audio(video_path, audio_out)

    print(
        f"[watch] loading local Whisper model '{model_name}' "
        f"(first run downloads weights from Hugging Face)…",
        file=sys.stderr,
    )
    try:
        model = WhisperModel(model_name, device=device, compute_type=compute_type)
    except Exception as exc:  # noqa: BLE001
        raise SystemExit(f"failed to load local Whisper model '{model_name}': {exc}") from exc

    try:
        segment_iter, _info = model.transcribe(str(audio_path.resolve()), vad_filter=True)
    except Exception as exc:  # noqa: BLE001
        raise SystemExit(f"local Whisper transcription failed: {exc}") from exc

    segments: list[dict] = []
    for seg in segment_iter:
        text = (seg.text or "").strip()
        if not text:
            continue
        segments.append({
            "start": round(float(seg.start or 0.0), 2),
            "end": round(float(seg.end or 0.0), 2),
            "text": text,
        })

    if not segments:
        raise SystemExit("local Whisper produced no transcript segments")

    print(f"[watch] transcribed {len(segments)} segments via local Whisper", file=sys.stderr)
    return segments, f"local whisper ({model_name})"


if __name__ == "__main__":
    import json

    if len(sys.argv) < 2:
        print("usage: local_whisper.py <video-path> [<audio-out.mp3>] [<model>]", file=sys.stderr)
        raise SystemExit(2)
    video = sys.argv[1]
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else Path("audio.mp3")
    model = sys.argv[3] if len(sys.argv) > 3 else "base"
    segs, backend = transcribe_local(video, out, model_name=model)
    print(json.dumps({"backend": backend, "segments": segs}, indent=2))
