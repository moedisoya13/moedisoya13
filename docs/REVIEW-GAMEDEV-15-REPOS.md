# 게임 개발 repo 15종 — 전역 설치 검토 (2026-10-16)

출처: 업로드 영상 `Mnilax_2026-10-14` — "15 repos, 1 game studio" (STUDIO · UNREAL · ENGINES · ART+SOUND · WORLDS 5개 부서).
15개 repo 를 모두 GitHub 에서 찾아 shallow clone 하고 README · LICENSE · 설치 방식을 직접 확인했다.
별 수는 영상 표기 그대로이며 따로 검증하지 않았다. 최근 커밋은 2026-10-16 clone 시점의 기본 브랜치 HEAD 다.

## 결론

**전역 설치 적합: 0종.** 15종 중 Claude Code 자산(agents/skills/MCP)이 엔진이나 프로젝트 없이 혼자 돌아가는 것은 없다.

| 판정 | repo | 한 줄 이유 |
|---|---|---|
| 🟡 조건부 (필요해지면 데스크톱 user-scope 로) | godot-mcp, ACE-Step 1.5 동봉 skill | Godot 를 쓰거나 음악을 만들 때만 의미가 있다. 아래 주의사항 참고 |
| 🔵 프로젝트 단위로만 | Claude-Code-Game-Studios, UnrealClaude, Unreal_mcp, VibeUE, unreal-engine-skills, UnrealGenAISupport, Unity-MCP, ml-agents, Audio2Face-3D | 엔진 프로젝트 안(`Plugins/`, `Packages/`, 프로젝트 `.claude/`)에 설치하는 구조 |
| 🔴 보류 / 사용 불가 | CHORD, HunyuanVideo-Foley, Hunyuan-GameCraft, Matrix-Game | 라이선스(연구 전용, **한국 제외**) 또는 80GB 급 GPU |

"전역" 은 이 저장소의 `.claude/skills/`(→ 클라우드·모바일 세션 전부) 와 데스크톱 `~/.claude/` + `claude mcp add --scope user` 를 뜻한다.
판정 기준은 ① Claude Code 자산인가 ② 특정 엔진·프로젝트·GPU 없이 동작하나 ③ 라이선스(한국 거주자 사용 가능, 상업 이용) ④ 매 세션 컨텍스트 비용 ⑤ 이름 충돌·보안 다섯 가지다.

참고로 현재 게임 프로젝트 `how-to-survive-a-slasher-film` 은 Three.js + Vite 웹 게임이라 Unreal / Unity / Godot 전용 도구 9종은 해당 사항이 없다.

## 15종 일람

| # | 부서 | repo | 형태 | 라이선스 | 요구 사항 | 최근 커밋 | 판정 |
|---|---|---|---|---|---|---|---|
| 1 | STUDIO | [Donchitos/Claude-Code-Game-Studios](https://github.com/Donchitos/Claude-Code-Game-Studios) (25.4K★) | Claude Code **프로젝트 템플릿**: agent 49 · skill 74 · hook 스크립트 14 · `settings.json` · `CLAUDE.md` · `project.yaml` | MIT | Claude Code, Python 3, Bash, jq | 2026-10-08 | 🔵 |
| 2 | UNREAL | [Natfii/UnrealClaude](https://github.com/Natfii/UnrealClaude) (907★) | UE **에디터 플러그인**(C++) + 내장 MCP, 에디터 안에서 Claude Code CLI 실행 | MIT | **UE 5.7 전용**, 소스 빌드(RunUAT), Node.js | 2026-06-26 | 🔵 |
| 3 | UNREAL | [ChiR24/Unreal_mcp](https://github.com/ChiR24/Unreal_mcp) (856★) | UE 플러그인 `EngineWire` + npm MCP 서버 `unreal-engine-mcp-server` | MIT | UE 5.0–5.8, C++ 프로젝트, Node ≥20.19 | 2026-10-16 | 🔵 |
| 4 | UNREAL | [kevinpbuckley/VibeUE](https://github.com/kevinpbuckley/VibeUE) (589★) | UE 플러그인 — UE 내장 MCP 를 확장(별도 서버 없음), skill 약 36개를 엔진에 등록 | MIT | **UE 5.8+**, 내장 Unreal MCP 먼저 활성화 | 2026-10-01 | 🔵 |
| 5 | UNREAL | [quodsoler/unreal-engine-skills](https://github.com/quodsoler/unreal-engine-skills) (335★) | **Claude skill 31개**(마크다운만, 스크립트 없음) | MIT | 없음 — UE 5.8 API 기준 | 2026-09-28 | 🔵 |
| 6 | UNREAL | [prajwalshettydev/UnrealGenAISupport](https://github.com/prajwalshettydev/UnrealGenAISupport) (634★) | UE 플러그인 — LLM API 래퍼 + Python 소켓 기반 MCP | MIT | UE 5.4–5.7, Python + fastmcp, 공급사 API 키 | 2026-04-28 | 🔵 |
| 7 | UNREAL | [NVIDIA/Audio2Face-3D](https://github.com/NVIDIA/Audio2Face-3D) (450★) | **허브 repo**(README·이미지뿐) → SDK / UE5·Maya 플러그인 / 학습 프레임워크 / HF 모델로 링크 | SDK MIT · 학습 Apache · 모델 NVIDIA Open Model | NVIDIA GPU(CUDA/TensorRT) | 2025-09-24 | 🔵 |
| 8 | ENGINES | [IvanMurzak/Unity-MCP](https://github.com/IvanMurzak/Unity-MCP) (4.0K★) | Unity 패키지 `com.ivanmurzak.unity.mcp` 1.0.1 + `unity-mcp-cli` — 에디터와 **빌드된 게임 런타임**에서 동작 | Apache-2.0 | Unity 2022.3+ | 2026-10-16 | 🔵 |
| 9 | ENGINES | [Unity-Technologies/ml-agents](https://github.com/Unity-Technologies/ml-agents) (19.7K★) | Unity 패키지 `com.unity.ml-agents` 4.1.0 + Python(PyTorch) 트레이너 — 강화학습 NPC | Apache-2.0 | **Unity 6 (6000.0)+**, Python | 2026-10-13 | 🔵 |
| 10 | ENGINES | [Coding-Solo/godot-mcp](https://github.com/Coding-Solo/godot-mcp) (5.6K★) | npx 로 뜨는 **독립 MCP 서버** — 실행·디버그 출력 수집·씬 편집 도구 14개 | MIT | Godot 실행 파일, Node ≥18 | 2026-04-16 | 🟡 |
| 11 | ART+SOUND | [ubisoft/ubisoft-laforge-chord](https://github.com/ubisoft/ubisoft-laforge-chord) (193★) | Python 모델 — 텍스처 1장 → PBR 맵 5종, ComfyUI 노드 별도 | **Ubisoft ML License (Research-Only, Copyleft)** | Python 3.12, HF 약관 동의, CUDA 권장(없으면 CPU) | 2025-12-09 | 🔴 |
| 12 | ART+SOUND | [ace-step/ACE-Step-1.5](https://github.com/ace-step/ACE-Step-1.5) (12.8K★) | Python 음악 생성 모델 + Gradio/REST 서버, `.claude/skills/` 에 **skill 6개 동봉** | MIT | Python 3.11–3.12, VRAM 4GB 미만(기본) / 12GB 이상(XL) | 2026-08-29 | 🟡 (skill 만) |
| 13 | ART+SOUND | [Tencent-Hunyuan/HunyuanVideo-Foley](https://github.com/Tencent-Hunyuan/HunyuanVideo-Foley) (1.1K★) | Python 모델 — 영상에 맞는 효과음 생성 | **Tencent Hunyuan Community License — 한국·EU·영국 제외** | CUDA, VRAM 8–20GB | 2025-09-29 | 🔴 |
| 14 | WORLDS | [Tencent-Hunyuan/Hunyuan-GameCraft-1.0](https://github.com/Tencent-Hunyuan/Hunyuan-GameCraft-1.0) (742★) | Python 모델 — 이미지 + WASD 입력 → 플레이 영상 | **Tencent Hunyuan Community License — 한국·EU·영국 제외** | 최소 24GB(매우 느림) / 권장 80GB | 2025-11-28 | 🔴 |
| 15 | WORLDS | [SkyworkAI/Matrix-Game](https://github.com/SkyworkAI/Matrix-Game) (2.3K★) | 월드 모델 1.0–4.0 모음. 영상의 "기억하는 실시간 월드"는 3.0 이고, **4.0 이 2026-10-15 공개됨** | 1–3: MIT · 4.0: Apache-2.0 | Linux + NVIDIA. 1.0 은 80GB, 4.0 은 A100 80GB / RTX 5090 · 5080 · 5070 Ti 프리셋 | 2026-10-16 | 🔴 (관찰만) |

## 항목별 근거

### 1. Claude-Code-Game-Studios — 전역 설치 금지, 프로젝트 템플릿으로만

- README 가 스스로 "clone 해서 시작하는 **template**" 이라고 한다. `settings.json` 의 hook 이 전부 `$CLAUDE_PROJECT_DIR/.claude/hooks/*.sh` 를 부르고, 모든 skill 과 hook 이 프로젝트 루트의 `project.yaml` 을 읽는다. 전역에 두면 경로가 깨진다.
- **이름 충돌.** skill `help` 는 내장 `/help` 와, `code-review` 는 전역 command `code-review.md` 와 겹치고, `settings` · `start` · `security-audit` · `prototype` 같은 범용 이름이 모든 프로젝트에 끼어든다.
- `settings.json` 에 `rm -rf` · `git push --force` · `git reset --hard` 류 deny 규칙과 statusLine 이 있어서, 전역으로 퍼지면 다른 저장소의 동작까지 바뀐다.
- 엔진별 specialist 는 Godot / Unity / Unreal 셋뿐이다. slasher 프로젝트(Three.js)에 쓰려면 템플릿 전체를 덮지 말고 엔진과 무관한 agent(`game-designer`, `level-designer`, `sound-designer`, `qa-tester` 등)만 골라 **그 프로젝트의** `.claude/agents/` 로 옮기는 편이 낫다.

### 5. unreal-engine-skills — 깨끗하지만 전역에 두기엔 비싸다

- 31개 모두 마크다운뿐이고 실행 스크립트가 없어서 보안 위험은 낮다.
- skill description 합계가 **20,564자**다. 이 저장소의 skill 130개 description 합계(29,006자)의 **71%** 를, Unreal 을 쓰지 않는 세션에도 매번 얹게 된다.
- UE 프로젝트를 시작하면 그 프로젝트 안에서 `npx skills add quodsoler/unreal-engine-skills --skill <필요한 것만>` 으로 설치한다.

### 10. godot-mcp — 조건부 (데스크톱 + Godot 사용 시)

- `claude mcp add --scope user godot -- npx @coding-solo/godot-mcp` 한 줄이면 되지만, Godot 실행 파일이 있는 데스크톱에서만 동작한다. 클라우드 컨테이너에는 Godot 가 없다.
- 유지보수 신호가 약하다: 패키지 0.1.1, `@modelcontextprotocol/sdk` 0.6.0 고정, 마지막 커밋 2026-04-16.
- 쓸 거라면 npx 에 버전을 고정(`@coding-solo/godot-mcp@<버전>`)해서 공급망 변경이 자동으로 들어오지 않게 한다.

### 12. ACE-Step 1.5 — 모델은 로컬 GPU 서비스, 동봉 skill 만 조건부

- 동봉 skill: `acestep`(생성·편집 API 호출), `acestep-songwriting`(작사·BPM·구성 가이드, 지식만), `acestep-docs`, `acestep-lyrics-transcription`(OpenAI / ElevenLabs 키), `acestep-thumbnail`(Gemini 키), `acestep-simplemv`(Remotion).
- `acestep` 는 `curl` + `jq` 로 로컬 서버(`127.0.0.1:8001`)나 공식 클라우드 `api.acemusic.ai`(무료 키)를 부른다. GPU 없이도 클라우드 API 로는 쓸 수 있다.
- **주의 — 키 유출 경로.** `acestep.sh config --set api_key …` 는 키를 **skill 디렉터리 안의** `scripts/config.json` 에 쓴다. 데스크톱에서 키를 설정한 뒤 `scripts/sync_skills.py` 로 동기화하면 그 파일이 이 저장소에 커밋된다. `sync_skills.py` 의 `SECRET_PATTERNS` 는 Anthropic · OpenAI · GitHub · AWS 형식만 잡으므로 acemusic 키나 Gemini 키(`AIza…`)는 **걸러지지 않는다.**
- 도입한다면 `acestep` + `acestep-songwriting` 두 개만, 데스크톱 `~/.claude/skills/` 에 두고, 동기화 전에 `config.json` 을 빼거나 `SKIP_FILES` 에 추가한다.

### 13·14. Hunyuan 2종 — 한국에서는 라이선스가 없다

두 repo 모두 LICENSE 첫 줄이 "THIS LICENSE AGREEMENT DOES NOT APPLY IN THE EUROPEAN UNION, UNITED KINGDOM AND SOUTH KOREA" 이고,
5(c)항이 Territory 밖에서의 사용 · 출력물 사용까지 금지한다. 한국 거주자는 설치 대상에서 제외한다.

### 11. CHORD — 연구 전용

Ubisoft Machine Learning License (Research-Only, Copyleft): 허용 목적이 "academic or research purposes only" 이고 상업적 이득을 위한 사용을 금지한다.
게임에 들어갈 텍스처 제작에는 쓸 수 없다.

### 15. Matrix-Game — 설치 대상은 아니지만 지켜볼 만하다

4.0 은 "실행 가능한 low-poly 게임의 RGB 프레임을 스트리밍 neural rendering 으로 고해상도화" 하는 구조라 slasher 의 low-poly 룩 방향과 개념이 맞닿아 있다.
다만 Linux + A100 80GB 또는 RTX 5090 급이 필요하고 공개된 지 하루밖에 안 됐다. 지금은 관찰만 한다.

### 그 밖의 엔진 플러그인 (2 · 3 · 4 · 6 · 7 · 8 · 9)

모두 엔진 프로젝트의 `Plugins/` 나 `Packages/` 에 들어가는 구조라 "전역" 개념이 없다. 해당 엔진 프로젝트를 시작할 때 고른다. 고를 때 볼 점:

- **엔진 버전이 서로 배타적이다.** UnrealClaude 는 5.7 만, VibeUE 는 5.8 이상만, UnrealGenAISupport 는 5.4–5.7 을 지원한다. Unreal_mcp 는 5.0–5.8 로 가장 넓다.
- **Unreal_mcp** — README 가 설명하는 것은 0.6 beta 다. npm `latest` 는 아직 0.5.30 이라서 `@beta` 를 붙이지 않으면 플러그인과 버전이 어긋난다. capability token 으로 보호된다.
- **UnrealGenAISupport** — README 가 "MCP in this free plugin is not being actively developed" 라고 밝힌다. LLM 이 만든 Python 을 에디터에서 실행하는 기능이 있다.
- **Unity-MCP** — 빌드된 게임 런타임에도 AI 연결을 넣을 수 있다. 출시 빌드에 남기지 않도록 주의한다.
- **Audio2Face-3D** — repo 자체에는 코드가 없다. 실제 설치 대상은 SDK repo 와 UE5 플러그인이다.
