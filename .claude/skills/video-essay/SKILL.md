---
name: video-essay
version: "0.1.0"
description: 유튜브 링크나 로컬 비디오 파일의 스크립트를 추출해, 잘 정돈된 에세이 형식의 한국어 교육 자료(HTML)로 만들고 모바일로 전달한다. 장편(1시간 안팎) 강연·다큐 처리에 초점. "영상 정리", "강의 에세이", "이 영상 교육자료로", "video essay" 요청 시 사용.
argument-hint: "<video-url-or-path> [독자·분량 등 지시]"
allowed-tools: Bash, Read, Write, SendUserFile, AskUserQuestion
user-invocable: true
---

# /video-essay

영상 하나를 **읽을 수 있는 교육 에세이**로 바꾼다. 전사는 `watch` 스킬에 위임하고,
이 스킬은 (1) 전사 → 에세이 재구성, (2) HTML 렌더, (3) 모바일 전달만 담당한다.

전사 코드를 새로 만들지 말 것. `watch`가 유튜브 자막 회수와 로컬 파일 오디오 전용
추출 + Whisper를 모두 처리한다.

## 경로 상수

- `WATCH_DIR` = `~/.claude/skills/watch/scripts` (플랫폼에 맞는 절대경로로 치환)
- `TPL` = 이 SKILL.md와 같은 디렉터리의 `assets/essay-template.html`
- 출력 기본 위치: 입력이 로컬 파일이면 그 파일과 같은 폴더, URL이면 `~/Downloads`.
  파일명은 `<안전하게-정리한-제목>.html`.

## Step 0 — watch 준비 확인

```bash
python "WATCH_DIR/setup.py" --json
```

- Windows에서는 `python3`가 아니라 `python`. 그리고 **모든** `watch` 호출 앞에
  `PYTHONUTF8=1 PYTHONIOENCODING=utf-8` 를 붙인다 — 없으면 한글 파일명/경로에서
  cp949 인코딩 오류로 전사가 통째로 실패한다.
- `can_proceed: false` → 사용자에게 무엇이 빠졌는지(`missing_binaries`, 키) 알리고 중단.
- JSON의 `whisper_backend` 와 `has_api_key` 를 기억해 둔다(Step 2에서 사용).

## Step 1 — 입력 파싱

사용자 입력에서 **소스**(URL 또는 로컬 경로)와 뒤따르는 **선택적 지시**(대상 독자,
분량, 강조점)를 분리한다. 지시가 없으면 기본값: 일반 성인 학습자 대상, 중간 분량.

## Step 2 — 전사 (watch에 위임)

작업 디렉터리를 하나 정하고(`WORK`), watch의 리포트를 **파일로 리다이렉트**한다.
전사문은 별도 파일이 아니라 이 리포트 본문의 ` ``` ` 블록 안에 들어간다:

```bash
mkdir -p "WORK"
PYTHONUTF8=1 PYTHONIOENCODING=utf-8 python "WATCH_DIR/watch.py" "<source>" \
  --detail transcript --out-dir "WORK" [--whisper <backend>] > "WORK/report.md" 2>&1
```

(백그라운드 실행 시엔 task 출력 파일이 곧 `report.md` 역할을 한다.)

- `--detail transcript` 고정: 프레임 없음, 전사만. 유튜브면 영상 다운로드 안 함.
- **`--whisper` 판단**: `.env`의 `WATCH_WHISPER` 가 키 없는 백엔드로 고정돼 있으면
  watch가 폴백을 거부한다. Step 0 JSON의 `has_api_key: true` 이고 `whisper_backend`
  가 실제 키 있는 값이면 `--whisper <그 값>` 을 명시해 config 고정을 덮어쓴다.
  (예: config가 `openai` 인데 Groq 키만 있으면 `--whisper groq`.)
- 로컬 파일: watch가 `ffmpeg -vn` 으로 오디오만 뽑아(~0.9MB/분, mp3) Whisper에 넘긴다.
  24MB 초과분은 자동 청크. 56분 영상 ≈ 27MB → 2청크, Groq로 1~2분 소요.
- `report.md` 의 헤더에서 **제목·업로더·길이·전사 방식**(`via captions` /
  `via whisper (groq)` 등)과 `## Transcript` 섹션의 `Source:` 줄을 뽑아둔다.
- `## Transcript` 아래가 `none available` 이면 → 자막도 Whisper도 실패한 것.
  **여기서 중단**하고 사용자에게 이유를 전한다. 빈 에세이를 만들지 말 것.
- 파일명이 내용과 무관할 수 있다(예: `역사 - X_3.mp4` 가 실제로는 영어 AI 강연).
  제목은 **전사 내용**에서 뽑고 파일명을 신뢰하지 않는다.

## Step 3 — 장편 처리 규칙 (핵심)

`WORK/report.md` 를 **통째로 컨텍스트에 올리지 않는다.** (~1시간 영상 ≈ 750줄 ≈ 10k
토큰이면 한 번에 읽어도 되지만, 2시간+면 1500줄을 넘는다.)

1. `Read` 의 `offset`/`limit` 으로 `report.md` 를 순차 청크(약 1200~1800줄 단위)로 읽는다.
2. 각 청크에서 소주제 · 핵심 논지 · 인상적 예시/수치/인용을 짧게 메모한다.
3. 모든 청크를 훑은 뒤 **섹션 트리(개요)** 를 먼저 확정한다 — 강연의 논리 흐름을
   따르되, 타임스탬프 나열이 아니라 주제 단위로.
4. 개요를 따라 섹션별로 산문을 쓴다. 청크 경계에서 논지가 잘렸으면 인접 청크
   메모를 병합해 이어붙인다.
5. 전사 문장을 그대로 옮기지 않는다(받아쓰기 금지). 화자의 논지를 **재구성**한다.
   확실하지 않은 고유명사·수치는 단정하지 말고 "대략", "약" 등으로 표시하거나 생략.

## Step 4 — 에세이 구성 (한국어)

- **제목**: 영상 주제를 담은 명사구(파일명 그대로 쓰지 말 것).
- **핵심 요약**: 1문단. 이 영상이 무엇을 논하고 어떤 결론에 이르는지.
- **본문**: `<h2>` 대주제, 필요 시 `<h3>` 소주제. 각 섹션은 문단 산문 중심,
  목록은 정말 열거가 맞을 때만.
- **개념 정의**는 `<div class="callout"><span class="k">개념</span> …</div>` 로.
- **직접 인용**이 힘있는 대목은 `<blockquote>` (짧게, 화자 표현 보존).
- **핵심 정리**: `<ul>` 3~7개, 템플릿의 `{{TAKEAWAYS}}` 자리에.
- 분량 감각: 56분 강연 ≈ 본문 1500~2500단어. 3분 영상이면 300~500단어. 부풀리지 말 것.

## Step 5 — HTML 렌더

`TPL` 을 읽어 플레이스홀더를 치환하고 출력 경로에 쓴다:

| 플레이스홀더 | 채울 내용 |
|---|---|
| `{{TITLE}}` | 에세이 제목 (2곳: `<title>`, `<h1>`) |
| `{{META}}` | `원본: <제목> · <업로더> · <길이> · 전사: <방식>` — URL이면 `<a href>` 로 |
| `{{SUMMARY}}` | 핵심 요약 1문단 |
| `{{BODY}}` | 본문 HTML (`<h2>`/`<h3>`/`<p>`/`<blockquote>`/`<div class="callout">`) |
| `{{TAKEAWAYS}}` | `<ul><li>…</li></ul>` |
| `{{FOOTER}}` | `이 자료는 영상 전사를 바탕으로 자동 생성된 요약본입니다. 원본 영상과 대조해 확인하세요. · 생성 <YYYY-MM-DD>` |

본문에 사용자 지시(대상 독자·강조점)를 반영한다. 스타일/CSS는 건드리지 않는다.

## Step 6 — 모바일 전달

```
SendUserFile(files=["<출력 .html 절대경로>"], display="render",
             status="normal",   # 사용자가 자리를 비웠을 때만 "proactive"
             caption="<제목> — <길이> 영상 요약 에세이")
```

전달 후 채팅에는 에세이 **전문을 붙여넣지 않는다.** 3~5줄 요약(무엇을 다뤘고 어떤
구조로 정리했는지)만 남기고, 원본과 대조 확인을 권한다.

## Step 7 — 정리

전사 작업 디렉터리는 후속 질문이 없을 것 같으면 `rm -rf` 로 지운다.
출력 HTML은 남긴다.

## 실패 모드

| 증상 | 대응 |
|---|---|
| `setup.py` `can_proceed: false` | 빠진 바이너리/키를 알리고 중단 |
| cp949 UnicodeDecodeError/EncodeError | `PYTHONUTF8=1 PYTHONIOENCODING=utf-8` 를 안 붙인 것 — 붙여 재실행 |
| `--whisper X was set but ... key is missing` | `.env` 가 키 없는 백엔드로 고정됨 → `--whisper <키 있는 backend>` 로 재실행 |
| Transcript `none available` | 자막·Whisper 모두 실패 → 중단, 이유 전달(빈 에세이 금지) |
| 전사가 너무 길어 컨텍스트 압박 | Step 3의 청크 읽기를 지켰는지 확인 — 전문을 한 번에 읽지 말 것 |

## Security & Permissions

- `watch` 가 로컬 파일에서 **오디오만** 추출해 설정된 Whisper API(Groq 또는 OpenAI)로
  보낸다. 영상 자체는 업로드되지 않는다. 오디오조차 기기 밖으로 내보내지 않으려면
  사용자가 `~/.config/watch/.env` 에 `WATCH_WHISPER=local` 과 faster-whisper 를
  설정해야 한다(이 스킬은 watch 의 백엔드 선택을 따를 뿐 강제하지 않는다).
- 유튜브 소스는 `yt-dlp` 가 공개 자막만 받는다(로그인·쿠키 없음).
- 생성된 HTML 은 `SendUserFile` 로 사용자 기기에만 전달된다. 외부 게시 없음.
