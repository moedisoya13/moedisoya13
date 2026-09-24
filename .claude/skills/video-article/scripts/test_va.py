"""Self-check: python test_va.py  (ffmpeg/Whisper 없이 표식 왕복·출력 경로만 검증)"""
import tempfile
from pathlib import Path

import va

with tempfile.TemporaryDirectory() as d:
    folder = Path(d)
    tricky = "앤트로픽 $9 vs $200 — '하네스' & 실험.mp4"  # Windows 파일명에 허용되면서 escape 대상인 ' &
    (folder / tricky).write_bytes(b"")
    (folder / "plain.mp4").write_bytes(b"")

    assert va.processed_sources(folder) == set()

    # render가 박은 표식을 pending이 원래 파일명으로 되읽는가
    out = folder / "some-article.html"
    out.write_text(va.render(tricky, "제목 <b>", "메타 & 정보", "<p>본문 {{TITLE}}</p>", "2026-01-01"), encoding="utf-8")
    assert va.processed_sources(folder) == {tricky}, va.processed_sources(folder)
    page = out.read_text(encoding="utf-8")
    assert "<title>제목 &lt;b&gt;</title>" in page
    assert "<p>본문 {{TITLE}}</p>" in page  # 본문 속 플레이스홀더는 재치환되지 않음

    # 남의 HTML과 이름이 겹치면 .article.html 로 비켜간다
    assert va.output_paths(folder / "plain.mp4")["html"].endswith("plain.html")
    (folder / "plain.html").write_text("<p>user file</p>", encoding="utf-8")
    assert va.output_paths(folder / "plain.mp4")["html"].endswith("plain.article.html")
    assert va.output_paths(folder / "plain.mp4")["audio"].endswith("plain.mp3")

assert va.hms(3725.9) == "01:02:05"
assert va.parse_ts("1:02:05", 0) == 3725
assert va.parse_ts("02:05", 0) == 125
assert va.parse_ts("7.5", 0) == 7.5
assert va.parse_ts(" 25% ", 200) == 50
print("ok")
