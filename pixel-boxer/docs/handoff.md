# 인계 문서 (세션 "Mobile game development analysis" → 같은 제목의 새 세션)

작성 2026-11-22. 이전 세션의 대화·스크래치패드·업로드 파일은 새 세션에 넘어가지 않는다. 이어 가는 데 필요한 것은 모두 이 저장소에 있다.

## 1. 저장소와 브랜치

- 저장소 `moedisoya13/moedisoya13`, 프로젝트 폴더 `pixel-boxer/`, 작업 브랜치 `claude/vibrant-ritchie-xornhd`.
- 인계 시점 HEAD: `210ebef` 다음의 인계 커밋(이 문서). 모두 푸시됨.
- 검증 상태(인계 시점): `npm test` 328/328, `node tools/feel.mjs` 10/10, `node tools/audit.mjs` 447개 장면, 예외는 다운 착지뿐(대본마다 2프레임 이하, 최악 12.7 g; 규칙은 4프레임·14 g).
- `git stash` 의 `stash@{0}`("system WIP: timed-reaction defence AI, attribute ranges, block stamina cost")은 사용자의 것이다. 손대지 않는다.

## 2. 일하는 규칙 (사용자가 정한 것)

- 답은 한국어가 우선(필요하면 영어를 섞음). 사람에게 보이는 텍스트에서 남의 대명사는 they/them.
- 기획은 Fable 모델로(동작·순서·타이밍을 문서로), 구현은 Opus 에이전트로.
- **에이전틱 모션 구현 (사용자 지시, 2026-11-22).** 사용자가 소스(영상·이미지)를 주거나 특정 기술의 구현을 요청하면 이 세 단계로 한다:
  1. **기획: Fable, effort high.** 소스 분석(영상이면 프레임을 뽑아 재고, 접촉 시트를 `docs/ref/`에 남김)과 동작 기획: 관절이 움직이는 순서, 협응(다리·골반·허리·가슴·어깨·팔의 타이밍과 양), 등급별 차이, 잴 것과 시험. 문서로.
  2. **구현: Opus 구현팀, effort xhigh.** 기획 문서대로 구현한다.
  3. **Physics 철저 점검.** 구현팀의 단계 끝 QC(`docs/moves-plan-6.md` §6.3: test, feel, audit와 새 점검, 사건 비교, 구간·무릎·회전 표, 위·옆 리뷰 시트)에 더해, 구현하지 않은 **따로의 점검 에이전트**가 리뷰 시트를 프레임마다 보고 audit 출력을 읽어 관통·튐·발 미끄러짐·뒤집힌 관절·가동 범위를 보고하고, 마지막으로 내가 직접 다시 돌리고 시트를 본 뒤에야 커밋·게시한다. audit 한도는 넓히지 않는다.
  6차 기획의 남은 동작 단계(M부터)도 이 방식(구현 xhigh + 따로의 점검)으로 한다. 이전의 "구현 effort high"는 이것으로 바뀌었다.
- **노력도 통일 (사용자 지시, 2026-11-23).** 기획 쪽 모델은 effort high, 구현·점검 쪽 모델은 effort xhigh로 통일한다. 다만 지금까지 medium으로 돌던 것은 medium으로 둔다(사용자, 같은 날: "기존 medium은 유지"): 워크플로 안에서 단계마다 붙던 가벼운 점검, 미결 카탈로그 클립 녹화 같은 보조 작업. 따로의 깊은 점검(세 번째부터)은 xhigh. 구현과 점검 에이전트는 모델과 노력도를 지정해 새로 띄운다: 메시지로 이어 시킨 에이전트는 그때 메인 세션의 모델·노력도로 돌기 때문이다(11-23 오후 N·U·V 3·4차가 그렇게 어긋났고, 5차는 지정해 새로 띄운 에이전트가 이어받음). 한 라운드가 끝나면 다음 라운드도 새로 띄우고, 브리프는 `scratchpad/wfout2/brief-*.md`처럼 파일로 넘긴다.
- 남은 일은 **한 번에 하나씩 순서대로**(병렬은 사용자가 다시 원할 때만). 각 단계 끝에 테스트·feel·audit 통과, 리뷰 시트(PNG) 직접 확인, 커밋·푸시, 카탈로그 아티팩트 재게시.
- 커밋 메시지 끝: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` 와 `Claude-Session: <새 세션 URL>`(그 세션의 지시를 따름). 코드·문서·커밋에 모델 이름을 쓰지 않는다. PR은 요청이 있을 때만.
- 사용자 이메일 등 개인 정보는 외부로 보내지 않는다.
- 오토 배틀러다: 조작이 없다. 새 기술은 모두 선수 AI(`src/game/brain.mjs`, `ai.mjs`)가 로드아웃(`src/game/techniques.mjs`)에서 고른다.
- 등급은 7개: 1, 2, 3, 4명, 4암, 5명, 5암. 코드·문서는 명/암, **카탈로그 화면은 L/D**(4L/4D/5L/5D, `src/catalog.mjs`의 표시 변환).
- 카탈로그 배치: 한 행에 두 개, 가로 스크롤 없음. 차례(하이퍼링크 목차)와 "새"/"바뀜" 표시(`src/catalog.mjs`의 `SINCE`, 측정 비교는 `tools/events.mjs`).
- audit 한도는 넓히지 않는다. 못 맞추면 수치로 보고한다.

## 3. 아티팩트

| 이름 | 주소 | 상태 |
|---|---|---|
| 모션 카탈로그 | https://claude.ai/artifact/GGHUZQ9rFWLoRojwCzaK3N | 현행 v37(2026-11-24: 팔방 표를 M을 합친 엔진으로 다시 씀, `shift@4m`만 1~2 cm); v36(2026-11-23 밤: 단계 M 반영: 자기 글러브가 다른 팔 안으로 들지 않음; 움직인 20줄에 "바뀜", crossArm 메모의 조치 "반영됨"); v35(2026-11-23: 메모가 있는 26줄에 "조치 · 단계 · 상태"와 한 줄 설명(`src/memo.actions.mjs`: 게시할 때마다 손으로 고침; 동작은 v34와 같음); v34: 새 부 "콤비네이션"(단계 C0: 콤비네이션 하나가 기술 한 줄, 일곱 줄); v33: 새 부 "팔방"(단계 O: 위에서 본 길과 돈 칸, 13줄); v32: 변동 없는 줄은 접음(`SINCE`에 없는 것); v31: 다운 타격의 용암을 두 번(0.1 s 간격); v30: 용암·불티 채택, 덩이 11개; v29: K 끝(쓰러짐의 허리 묶기), §2.4C(보통 타격은 예전 색, 다운 타격만 용암 덩이와 불티); v28: 다운 효과 §2.4B(슬로, 착지 파문, 바닥 고리 파문, ¼ 리플레이), 줄마다 메모, J의 이펙트(수·굵기·수명이 데미지에 비례, 수명 기준 5% 짧게, 속도 +5%), v22 기준의 새·바뀜 표시). 메모는 아티팩트 `db`의 `feedback` 컬렉션, 메모 하나가 문서 하나 `{item: 줄 id, text, at, by}`(`src/memo.mjs`): `ArtifactData`의 `list`로 읽는다. 재게시 때 `capabilities`는 생략(저장된 `db`·`user` 유지). 재게시: `node tools/artifact.mjs catalog.html src/catalog.mjs <out.html> > <files.json>` 후 `root`를 `pixel-boxer`로, files 맵 그대로 publish |
| 미결 카탈로그 | https://claude.ai/artifact/UEM19aKseUxnixVYkrnAzd | 현행 v24(2026-11-24: V의 네 번째 점검 — `rocked-slow`에 느린 팔이 AI 시합의 다운을 18% 줄임(192판 324 → 266, 우연 아님), 권장은 V 6차의 표를 보고 다시; `downside-front`에 받아들이면 함께 받는 것(엉덩이 인대의 팔꿈치 뒤집힘 42~71°, 엎드린 데서 일어날 때 글러브 튐)); v23(2026-11-24, 사용자 요청 "최신화": 클립을 N 7차·U 5차·V 5차로 다시 녹화(`--root n1=scratchpad/pcwork/n7.tmp/pixel-boxer --root u2=…/u5.tmp/… --root v1=…/v5.tmp/…`; 잰 값은 v18과 같음, 으쓱만 0.001 cm), 사용자가 정한 여섯(`n-way`·`crossarm-weak`·`third-hook-frame`·`upperbody-waist`·`grid-test-scope`·`merge-classes`)에 "정해짐", 열린 항목의 상태를 지금으로(`order-memo-first`, `jump-watch`, `hookr-bound`, `beckon-room`, `shrug-view`, `twist-chin`, `rocked-slow`(AI 96판 다운 160 → 125), `downside-front`, `pull-test`, `inside-rule`·`waist-bound`(N은 이 구현으로 합침), `merge-bar`)); v22(2026-11-24: N 7차 뒤 새 항목 `n-way`(N의 갈림길: 알려진 한계로 합침 / 범위를 줄임 / 더 고침 / 잠시 둠), 5부 50항목·전체 78항목); v21(2026-11-24: N 6차가 남긴 결정 넷 `third-hook-frame`·`upperbody-waist`·`grid-test-scope`·`merge-classes`를 더해 5부 49항목·전체 77항목; `inside-rule`(가드가 내려가 있을 때만)·`hookr-bound`·`crossarm-weak`(뒷손 훅 카드의 세기)·`beckon-room`·`merge-bar`의 상태를 지금으로); v20(2026-11-24: N 5차의 크로스암 표로 `crossarm-weak`의 선택지); v19(2026-11-24: `fx-ground-ring-game`은 색의 한계, 선택지와 비교 그림); v18(2026-11-24: 타격 이펙트 확정(`fx-twice` 정해짐), 클립을 N 4차·U 4차·V 4b차로 다시 녹화(`--root n1=scratchpad/pcwork/n4.tmp/pixel-boxer --root u2=…/u4.tmp/… --root v1=…/v4b.tmp/…`), 항목 상태를 지금 기준으로); v17(2026-11-23 밤: `crossarm-weak`·`twist-chin` 고침, 새 항목 `downside-front`·`rocked-slow`·`merge-bar`, 5부 45항목); v16(2026-11-23 밤, M을 합친 뒤 다시 녹화: `low2-block`은 "M 전 대 지금"(`--root prem=scratchpad/pcwork/prem`), 새 항목 `inside-rule`·`waist-bound`로 5부 42항목); v15(2026-11-23, 5부의 여덟 항목에 녹화 비교 카드 29클립: `src/clips.data.mjs`·`src/clips/`·`tools/clips.mjs`, 기획 `docs/pending-catalog.md` §1.1; **재게시 전에 클립을 다시 녹화**(명령은 §1.1; 작업 폴더의 얼린 사본은 `scratchpad/pcwork/{m,n1,u1,u2,v1,vchin}`), 파일이 1 MB쯤 늘었고 `src/replay.mjs`가 파일 목록에 더해짐); v14(`low2-block`·`jump-watch`에 M의 두 번째 점검의 수치; v13: M·N·U·V의 1차 결과에서 나온 여덟 항목을 더해 40항목: `jump-watch`, `hookr-bound`, `crossarm-weak`, `beckon-room`, `twist-chin`, `low2-block`, `shrug-view`, `pull-test`); v12(콤보의 세 항목을 더해 32항목; v11: 소스 C·D의 일곱 항목을 더해 29항목; v10: 22항목을 맨 위에, 차례는 접음, 휴대폰 폭의 가로 스크롤 고침, 용암 두 번; v9: 용암·불티 채택, 덩이 11개; v8: §2.4C 반영; 게시가 한 번 거절됨: 다른 곳에서 올라온 버전(1795406506)이 카드 글줄이 줄바꿈으로 페이지를 밀지 않게 하는 스타일 8줄을 더해 두었고, 그것을 `pending.html`에 합쳐 다시 게시; v6: 다운 효과 §2.4B; v5: J 반영, 이펙트 데미지 비례). `pending.html`/`src/pending.mjs`, 기획 `docs/pending-catalog.md`. 결정은 아티팩트 `db`의 `decisions/<항목 id>` `{choice, note, at}`: `ArtifactData`의 `list`로 읽는다. 재게시: `node tools/artifact.mjs pending.html src/pending.mjs <out.html> > <files.json>`, `root`는 `pixel-boxer`, `capabilities`는 생략(저장된 `db`·`user` 유지) |
| 타격 이펙트 시안 | https://claude.ai/artifact/5tZd5Xyp7iiRxCuftpNwL6 | 새 주소 v8(2026-11-23, 용암 두 번(0.1 s 간격); v7: 용암·불티 채택, 덩이 11개; v6: §2.4C 용암과 불티; v5: 다운 효과 §2.4B; v4: 이전 것은 지워져 있었다; 수·굵기·수명이 데미지에 비례, 속도 +5%). `fxlab.html`/`src/fxlab.mjs`: "전"(접촉점 입자 + 흰 번쩍임)과 "확정"(반대쪽 면 입자 + 파문) 두 열, 장면 여섯. 재게시: `node tools/artifact.mjs fxlab.html src/fxlab.mjs <out.html> > <files.json>`, `root`는 `pixel-boxer`, `url`에 이 주소 |
| 한밤의 링 | (없음) | 정리 승인 뒤 확인하니 이미 지워져 있었다 |
| 달빛 결투 | (없음) | 정리 승인 뒤 확인하니 이미 지워져 있었다 |

아티팩트 목록 전체는 새 세션에서 `Artifact` 도구의 `list`로 확인한다(이 밖에 땀 시안 등 이전 게시본이 있을 수 있다).

## 4. 참고 자료 (`docs/ref/`)

사용자가 올린 영상(1080×1920, 30 fps, 9~11초)의 4 fps 접촉 시트. 원본 영상은 이전 세션의 업로드에만 있었다. 프레임 단위로 다시 재야 하면 사용자에게 다시 올려 달라고 한다.

| 파일 | 내용 | 쓰인 곳 |
|---|---|---|
| `down-parry-counter.jpg` | 다운패링 & 카운터 | §4.2 `parryDown` |
| `pull-counter-3-ways.jpg` | 풀백 3형제(바디샷=리버샷, 뒷손 훅, 스트레이트) | §3, §3.8 `pullCounter` |
| `block-and-fire.jpg` | 리버샷을 팔꿈치로 막고 반격 | §4.3 `blockFire` |
| `wave.jpg` | 파도(알리, 슬릭백 서클링) | §4.1 `wave` |
| `defense-or-a-trap.jpg` | 웅크린 팔꿈치 방어 | §4.5 `shell` |
| `tyson-shift.jpg` | 타이슨 시프트 | §4.4 `shift` |
| `cross-arm-guard.jpg` | 크로스암 가드 정석형(이미지 검색 화면) | §4A |

## 5. 문서 지도

- `README.md`: 구조, 채널, 표, 알려진 한계(5차 기획의 모든 편차가 수치와 함께 있다).
- `docs/moves-plan-4.md`: 4차 기획(무릎 변수, 숏 훅·어퍼, 더킹 대시, 홉 어웨이, 과시형 암, 실신 1판, 피격·다운 물리, 전설 복합 모션, 이펙트).
- `docs/moves-plan-5.md`: 5차 기획 2판(실신 재작업, 위빙 1·2, 바디샷, 기술 로드아웃, 파도, 다운패링, 블록 & 파이어, 피커부 셸, 타이슨 시프트, 크로스암 재설계, 숄더롤 & 카운터). §9가 변경 기록.
- `docs/pending.md`: 미결 목록(이 문서의 6절과 같은 내용을 유지).
- `docs/moves-plan-6.md`: 6차 기획(허리, 타격 이펙트 §2~§2.4C, 메모 반영, 반응 시간 수비, 단계 K~Z).
- `docs/leaping-hook.md`: 도약 훅의 동작 기획(단계 N2), 참고 시트 `docs/ref/leaping-hook.jpg`.
- `docs/game-sketch.md`: 게임 시스템의 스케치(사용자의 원문과 읽은 것): 선수 생활의 칩 서른 장, 플레이어의 백·흑 주사위. 기획이 아님.
- `docs/combos-plan.md`: 기본 콤보 일곱과 변형(가볍게·세게, 페이크, 같은 손 두 번, 바디), "훅 언더"(다 실은 앞손 훅 → 기울임 → 같은 손 바디 어퍼), 앞손 어퍼, 콤비네이션 데이터와 머리의 규칙, 카탈로그의 기술 줄, 단계 C0~C4.
- `docs/source-cd-proposal.md`: 소스 C(콤비네이션 1-S-5-2-3-2)·D(연속 백스텝)의 분석과 구현 제안(후보 P1~P8, 묶는 방법 셋; 사용자 피드백 뒤 작업), 참고 시트 `docs/ref/source-c.jpg`, `source-d.jpg`.
- `docs/bearing-system-plan.md`: 팔방 위치 시스템(상대의 정면 기준 여덟 칸과 거리 띠, 동작마다 돈 칸·잡은 칸, 다시 축 잡기 규칙, 칸의 값, 머리의 자리 잡기, 기초 단계 O), 그림 `docs/ref/bearing-cells.svg`.
- `docs/waist-more-plan.md`: 허리로 더 좋아질 여섯 동작(A1 수비 → 반격의 장전, A3 막을 때 허리, A2 콤비네이션의 되감기, A4 바디에 맞음, B1 더킹 대시·대시의 멈춤, B2 방향 전환)의 기획, 단계 N4·V2와 P·Q·R에 접는 것.
- `docs/source-ab-plan.md`: 소스 A(12박 콤비네이션)·B(원투 뒤의 방어 다섯)에서 뽑은 기술의 동작 기획(제안 단계 N3, R2; 사용자 확인 대기), 참고 시트 `docs/ref/source-a.jpg`, `source-b.jpg`.

## 6. 미결 내역 (새 세션의 브리핑 대상)

### 6.1 남은 구현
1. **I 최종 통합** (§5): 카탈로그 전 행 점검(H2의 "크로스암 · 바디", "숄더 롤 & 카운터"까지 게시), 회피 구간 재측정, 승률 점검(`tools/balance.mjs` 계획), README 마무리.
2. **타격 이펙트를 게임 본편과 카탈로그에 붙이기**: 버전 결정 대기(아래 6.2). 실루엣 가림은 렌더러에 있다(`silhouette`/`outside` 레이어 옵션, `fx.spray`; 바디샷은 `e.trunk`로 0.6배).

### 6.2 사용자의 결정을 기다리는 것
1. 타격 이펙트 버전: A 기본 / B 크고 느리게 / C 잘고 빠르게, 또는 조합(입자·파문 따로).
2. 기획자가 정한 기본값: 로드아웃 칸 수(최고 등급 1·2→1, 3→2, 4→4, 5→6), 기본 로드아웃(3·4명·5명: 풀백 카운터; 4암·5암: 풀백 카운터 + 크로스암), 시프트의 주먹 순서(스트레이트 → 왼손 바디 훅 → 오른손 어퍼; 영상 재확인으로 같음), 5명 다운패링의 반격 잽(영상에 없는 차이).
3. 균형: 같은 시드 36경기에서 다운 66 중 리버 다운 44. 4·5단계 리버 훅이 기획보다 25~35% 세다(4명 138, 5명 163 N·s). 낮출지.
4. 다운패링의 시합 성공률이 낮다(잽 100개에 4명 2.9, 5명 3.3번). 머리(`brain.mjs`)가 가드를 올리는 시점을 바꾸면 오른다. 바꿀지.

### 6.3 엔진 한계로 기획과 다른 것 (수용 여부를 사용자에게 보여 줄 것; 자세한 수치는 README 알려진 한계)
- 파도의 둘레 속도 0.86 m/s(기획 1.9~2.2): 디딘 발이 미끄러지지 못함.
- 훅 실신의 몸 회전 7°(기획 12°), 축 발 바깥날 0.75 cm(기획 0.5).
- 어퍼 실신 카드는 4명 어퍼(프로 어퍼는 실신 기준을 못 넘김).
- 위빙 1·2단계 구간 −11~−10, −11~−9(기획 −17~−14, −12~−10), 여유 1 cm 안팎.
- 바디: 명치는 가드의 뒷팔꿈치가 덮어 바디 스트레이트만 좁은 틈으로 닿음. 바디 스트레이트 63·바디 어퍼 58 N·s(기획 80~90, 60~70). 뒷손 훅 89(기획 95~105).
- 크로스암 가드: 뒷팔이 45~50° 기움(기획 수직 근처). 명치의 틈과 0.74 m 안 숏 훅의 약점은 열리지 않음. 롤 중 왼쪽 옆구리는 열리나 "갈비"가 아니라 "몸통"으로 읽힘. 숄더롤 창 1~3프레임.
- 숄더롤 & 카운터 4단계 반격(68 N·s)이 감지 않은 훅보다 약함. 블록 & 파이어는 같은 순간의 그냥 어퍼보다 느림(기획 순서를 지키느라 기다림).
- 피커부 셸: 팔꿈치가 몸통에 붙지 않음(13~34 cm), 잽이 머리 위로 지나가는 구간 없음, 무릎은 기획의 절반.
- 타이슨 시프트: 상대 앞발 바깥 각 23°/28°(기획 25~30°/30~35°), 엉덩이 회전 1.30/1.52배(기획 1.6), 박자 규칙 없음.
- 풀백 카운터 1~3단계가 기획보다 67~200 ms 느림(스웨이가 길어서).
- 과시형 암 몇 카드의 1프레임 3~5 cm 튐.

### 6.4 정리 후보 (사용자 승인 후 파기)
- 이전 세션(이 세션)과 그 대화.
- 아티팩트: "한밤의 링", "달빛 결투", 쓰지 않을 이펙트 시안 버전(결정 후), 그 밖에 `list`로 나오는 지난 시안.
- 채택되지 않은 코드: `src/render/fx.mjs`의 관성 땀 `sweat()`(시안 1판), 한꺼번에 풀리는 림프 `out`(시험이 아직 씀), `fxlab`의 "지금" 비교 카드(이펙트 결정 후).
- 이전 세션 스크래치패드(리뷰 시트 PNG, 측정 스크립트)는 새 세션에 넘어가지 않는다. 필요한 측정 도구는 `tools/`에 있다.
- `stash@{0}`은 사용자의 것이라 후보가 아니다.

## 7. 다시 만들 수 있는 것
- 리뷰 시트: `review.html` + Playwright(Chromium 설치됨, `require('playwright')`). 장면 목록은 `src/review.mjs`.
- 회피 구간: `node tools/windows.mjs --grades --write`.
- 사건 비교(바뀐 행 찾기): `tools/events.mjs`.
- 무릎 점검: `tools/knees.mjs`. 등급 사다리: `tools/ladder.mjs`, `tools/grades.mjs`.
