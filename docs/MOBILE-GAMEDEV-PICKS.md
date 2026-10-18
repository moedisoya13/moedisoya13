# 신규 모바일 게임 개발에 쓸 요소 — 15종에서 추린 것 (2026-10-16)

[전역 설치 검토](REVIEW-GAMEDEV-15-REPOS.md)에서 다룬 repo 15개 가운데 **모바일 게임 개발에 실제로 도움이 되는 요소만** 골랐다.
repo 를 통째로 들이는 게 아니라 그 안의 파일 · 기능 단위로 골랐고, 모두 새 게임 **프로젝트 안**에 두는 것을 전제로 한다(전역 아님).

엔진이 아직 정해지지 않았다고 보고 ① 엔진과 무관하게 쓸 것 ② 엔진을 고르면 따라오는 것으로 나눴다.
Three.js 같은 웹 기반으로 간다면(slasher 와 같은 방식) ①만 해당한다.

## 한눈에 보기

| 우선 | 요소 | 출처 | 모바일에 주는 것 | 엔진 |
|---|---|---|---|---|
| ★★★ | 문서 템플릿 (UX · HUD · 접근성 · 경제 · 출시) | Claude-Code-Game-Studios | 터치 · 플랫폼 항목이 들어간 기획 · 출시 문서 틀 | 무관 |
| ★★★ | 모바일 점검 항목 (스모크 · 출시) | Claude-Code-Game-Studios | 터치, 화면 회전, 백그라운드 전환, 발열, 저장 공간 부족 · 오프라인 | 무관 |
| ★★☆ | 역할 agent (UX · 성능 · 경제 · 접근성 등) | Claude-Code-Game-Studios | 전문 관점 리뷰어 | 무관 |
| ★★☆ | BGM · 앰비언스 생성 | ACE-Step 1.5 | 상업 이용 가능한(MIT) 배경음악을 직접 생성 | 무관 |
| ★★☆ | 학습한 NPC 를 기기에서 실행 | ml-agents | 적 AI · 자동 플레이 테스트 봇, 기기 CPU 추론 | Unity |
| ★★☆ | 에디터 자동화 · 테스트 · 프로파일러 | Unity-MCP | Claude Code 에서 씬 · 프리팹 · 테스트 · 프로파일 조작 | Unity |
| ★☆☆ | 실행 → 에러 읽기 루프 | godot-mcp | 데스크톱 개발 루프 단축 | Godot |
| ★☆☆ | 모바일 관련 skill 몇 개 | unreal-engine-skills · VibeUE | 모바일 오디오 예산, 세이브 크기, 프레임레이트 | Unreal |

## ① 엔진과 무관하게 쓸 것

### 1. 문서 템플릿 — Claude-Code-Game-Studios `.claude/docs/templates/`

템플릿 39개는 그냥 마크다운이라 컨텍스트 비용이 없고, 프레임워크 설정 파일(`project.yaml`)을 참조하는 것도 한 개뿐이다.
새 게임 repo 의 `docs/templates/` 로 복사해서 쓴다. 모바일에 쓸모 있는 것:

| 템플릿 | 모바일 관련 내용 |
|---|---|
| `ux-spec.md` | Platform Target 에 Mobile, **터치 대상 최소 44×44px** 체크 항목 |
| `hud-design.md` | 플랫폼별 safe zone 여백 표, 최저 해상도 기준 최소 요소 크기(아이콘 40px · 글자 18px). 노치 · 홈 인디케이터 여백을 채워 넣는 칸으로 쓴다 |
| `interaction-pattern-library.md` | "hover 없는 터치 전용 플랫폼에서는 쓰지 말 것" 같은 패턴별 사용 조건 |
| `accessibility-requirements.md` | iOS VoiceOver · Android TalkBack 항목, Apple · Google 접근성 가이드라인 체크 |
| `economy-model.md` · `difficulty-curve.md` | F2P 재화 · 난이도 곡선 설계 |
| `game-concept.md` · `game-pillars.md` · `game-design-document.md` | 기획 뼈대 |
| `sound-bible.md` | 사운드 방향 정의 (아래 ACE-Step 과 연결) |
| `release-checklist-template.md` · `release-notes.md` | 스토어 출시 · 패치 노트 |

### 2. 모바일 점검 항목 — `smoke-check` · `launch-checklist` 에서 발췌

skill 자체는 CCGS 프레임워크(`project.yaml` · hook)에 묶여 있어서 그대로 옮기지 말고, **체크 항목만** 프로젝트 QA 문서로 옮긴다.

- 스모크 테스트 — `smoke-check --platform mobile` 의 4가지: 터치 조작 / 화면 회전(세로 ↔ 가로) / 백그라운드 ↔ 포그라운드 전환(홈 버튼) / 대상 기기에서의 성능 · 발열 스로틀링
- 출시 전 — `launch-checklist` 에서: 저장 공간 부족 · 네트워크 없음 · 일시정지 후 복귀 엣지 케이스 / 최저 사양 기기에서 목표 FPS / 플랫폼별 로딩 시간 · 메모리 예산 / 연령 등급 · 콘텐츠 태그 / 스토어 페이지(스크린샷 · 설명) 완성

### 3. 역할 agent — `.claude/agents/` 에서 골라 쓰기

agent 본문의 전문 지식은 범용이지만, 그대로 옮기면 안 된다. 실제로 이식해 보니 손볼 곳이 처음 예상("경로 한두 줄")보다 많았다 — 세션 상태 파일(`production/session-state/active.md`), 원본 skill(`skills: [balance-check]`, `/design-review` 등), 작업 모드(`modes.workflow`), 엔진 레퍼런스 경로, 설치하지 않은 agent 로의 보고 · 위임 체계. 모바일에 쓸모 있는 것:

- `ux-designer` — 터치 UX 리뷰
- `performance-analyst` — 프레임 시간 · 메모리 분석. 모바일은 발열 · 배터리가 곧 성능 문제다
- `economy-designer` · `live-ops-designer` · `analytics-engineer` — F2P · 라이브 운영 게임일 때만
- `accessibility-specialist` · `localization-lead` — 스토어 글로벌 출시 시
- `game-designer` · `level-designer` · `sound-designer` · `qa-tester` — 기본 팀

### 4. BGM · 앰비언스 — ACE-Step 1.5

- **MIT** 라이선스라 생성한 음악을 게임에 넣을 수 있다. 단, README 면책 조항대로 기존 곡과 비슷하지 않은지는 직접 확인한다.
- 길이 10초–10분, BPM · 키 · 박자 지정 가능, 가사에 `[inst]` 를 넣으면 연주곡만 만든다. `repaint` 로 구간만 다시 생성할 수 있다.
- 곡 몇 개(README 기준 8곡, 3090 에서 1시간)로 LoRA 를 학습하면 **게임 전체의 음악 톤을 통일**할 수 있다.
- 출력은 mp3 · wav · flac 뿐이다. 모바일용 ogg · AAC 변환과 루프 포인트 처리는 ffmpeg 로 따로 한다(루프 전용 기능은 없다).
- 실행: 로컬 GPU(기본 모델 VRAM 4GB 미만) 또는 공식 클라우드 `api.acemusic.ai`(무료 키 — 상업 이용 조건은 사이트 약관을 따로 확인).
- Claude Code 연동: 동봉 skill `acestep` · `acestep-songwriting` 을 **게임 repo 의** `.claude/skills/` 에 두고, 키가 저장되는 `scripts/config.json` 은 `.gitignore` 에 넣는다.

## ② 엔진을 고르면 따라오는 것

### Unity 를 고를 때

- **ml-agents** (Apache-2.0, Unity 6 이상) — PC 에서 학습하고, 학습한 모델은 Unity Inference Engine 으로 **기기 위에서** 실행된다. 공식 문서상 Unity 런타임 플랫폼 전부를 지원하고, ML-Agents 모델은 GPU 보다 CPU(Burst) 추론이 더 빠르다고 명시돼 있어 모바일에 유리하다. 쓰임새는 추격 · 회피 같은 적 AI와, 밸런스 · 회귀 테스트용 자동 플레이 봇이다. 추론 성능은 사용자 기기 CPU 에 묶인다.
- **Unity-MCP** (Apache-2.0, Unity 2022.3 이상) — Claude Code 에서 씬 · GameObject · 프리팹 · C# 스크립트를 조작하고, `tests-run`(EditMode/PlayMode), 프로파일러 스냅샷(메모리 · 렌더링 · 프레임), Game View 스크린샷을 돌린다. 런타임 AI 기능은 출시용 모바일 빌드에 넣지 않는다 — API 키가 클라이언트에 실린다.
- **CCGS Unity agent** — `unity-addressables-specialist` 는 "Mobile: 전체 에셋 메모리 512MB 미만" 기준을 갖고 있어 앱 용량 · 다운로드 분할 설계에 쓸 수 있다. `unity-ui-specialist` · `unity-shader-specialist` 도 함께 쓴다.

### Godot 를 고를 때

- **godot-mcp** (MIT) — 프로젝트 실행 → 디버그 출력 읽기 → 수정 루프를 Claude Code 안에서 돌린다. 데스크톱 개발용이며 Android · iOS 내보내기 도구는 없다. 유지보수가 뜸하니(0.1.1, 2026-04 이후 커밋 없음) 버전을 고정한다.
- **CCGS Godot agent** — `godot-specialist` · `godot-gdscript-specialist` · `godot-shader-specialist`

### Unreal 을 고를 때 (모바일에는 무거운 선택)

- **unreal-engine-skills** — 31개 중 모바일 내용이 있는 것만: `ue-audio-system`(모바일 보이스 예산, HRTF 피하기), `ue-serialization-savegames`(모바일 세이브 크기), `ue-module-build-system`(IOS · Android 플랫폼 설정)
- **VibeUE**(UE 5.8 이상) — 동봉 skill `frame-rate` · `profiling`
- **Unreal_mcp** — UE 5.0–5.8 로 지원 범위가 가장 넓다. 엔진 버전을 아직 못 정했으면 이쪽

## 모바일 기준으로 제외한 것

| repo | 이유 |
|---|---|
| Hunyuan-GameCraft · HunyuanVideo-Foley | 라이선스가 한국을 제외한다 |
| CHORD | 연구 전용 라이선스 — 출시 게임의 텍스처에 쓸 수 없다 |
| Matrix-Game | 서버급 GPU 의 neural rendering — 폰에서 못 돌고, 스트리밍하면 서버 비용이 든다 |
| Audio2Face-3D | 기기 위 실행이 아니라 Maya 로 미리 구워 FBX 로 넣거나 서버(NIM)를 둬야 한다. 3D 얼굴 대사 연출이 없으면 불필요 |
| UnrealClaude | UE 5.7 전용, 에디터 채팅 도구라 모바일과 무관 |
| UnrealGenAISupport | 모바일 빌드에서 LLM API 를 부르면 키가 클라이언트에 실린다. MCP 는 개발 중단 상태 |
| Claude-Code-Game-Studios 템플릿 전체 | 위의 템플릿 · 점검 항목 · agent 만 골라 쓰고, 프레임워크 통째 도입은 하지 않는다 |

## 설치 결과 (2026-10-18)

클라우드 작업 환경(4 CPU · GPU 없음 · Unity / Godot / Unreal 없음)에서 가능한 것만 게임 repo
[`how-to-survive-a-slasher-film`](https://github.com/moedisoya13/how-to-survive-a-slasher-film) 에 프로젝트 단위로 설치했다. 전역(이 저장소 `.claude/`)에는 아무것도 넣지 않았다.

| 요소 | 설치 위치 | 상태 |
|---|---|---|
| 문서 템플릿 12 + 가이드 7 | `docs/templates/` | 경로를 `docs/design/` 기준으로 바꾸고 원본 slash command · 작업 모드 언급 제거 |
| 모바일 점검표 | `docs/qa/mobile-checklist.md` | 항목별 "현재 코드" 상태 포함. 깜빡임 끄기 설정 없음, 오디오용 `visibilitychange` 처리 없음을 표시 |
| 역할 agent 6종 | `.claude/agents/` | game · level · ux · technical-artist · performance · sound. qa-tester 는 Godot · Unity · Unreal 테스트 패턴과 원본 버그 템플릿에 묶여 있어 제외 |
| ACE-Step skill 2종 | `.claude/skills/acestep`, `acestep-songwriting` | 설치됨. 단 이 클라우드 환경에서는 `api.acemusic.ai` · `huggingface.co` 가 네트워크 정책으로 막혀 생성은 못 한다 — 데스크톱이나 도메인 허용 후 사용 |

설치하지 않은 것: ml-agents · Unity-MCP(Unity 없음), godot-mcp(Godot 없음, 게임도 Godot 아님), Unreal 계열(엔진 없음), ACE-Step 모델 자체(GPU 없음, 컨테이너가 매번 새로 만들어짐).
