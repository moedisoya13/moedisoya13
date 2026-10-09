# Slasher X Slasher — 작업 안내 (game/)

iPhone 세로 화면용 단일 HTML 웹 게임. 사용자와 한국어로 대화한다.

- **설계의 원본은 `GDD.md`.** 사용자가 정한 내용은 "원안"으로, 구현하면서 정한 세부는 "세부"나 §12/§13 구현 노트로 남긴다. 규칙을 바꾸면 GDD도 같은 커밋에서 갱신하고, 사용자 피드백으로 바뀐 항목에는 그렇다고 적는다.
- 모드 두 개:
  - **RUN** (도망자, GDD §0–§12)
  - **HUNT** (살인마, GDD §13)

## 빌드

```
node game/build.mjs                         # → game/slasher-x-slasher.html (외부 에셋 없는 단일 파일)
node game/build.mjs --artifact <out.html>   # claude.ai Artifact용 본문(문서 골격 없음)도 함께 생성
```

`src/NN_*.js`를 번호 순서대로 이어 붙여 `src/template.html`의 `/*__GAME_JS__*/` 자리에 넣는다. 모든 파일이 한 스크립트로 합쳐지므로, 다른 파일의 전역 함수와 상수를 그대로 쓴다.

| 파일 | 내용 |
|---|---|
| `00_core.js` | 유틸, 난수, URL 파라미터, **`CFG` 튜닝 값**, 팔레트, 픽셀 폰트 |
| `01_screen.js` | 저해상도 버퍼(가로 약 196px)와 픽셀 그리기 함수 |
| `02_audio.js` | Web Audio 합성 효과음 `Sfx` (살인마별 비명은 `Sfx.scream(kind)`) |
| `03_input.js` | 플로팅 조이스틱, 버튼(`act`, `honey`, `abil`, `ctx`), 키보드 |
| `04_map.js` | 막다른 길 없는 미로, 방, 문, 가구 생성. 버튼 겹침 없는 배치 규칙 |
| `05_path.js` | 경로 탐색, 시야 판정 |
| `06_vision.js` | 시야와 안개 |
| `07_fx.js` | 파티클과 핏자국 |
| `08_rig.js` | 3D 리그 캐릭터 |
| `09_cast.js` | 살인마 외형(`STY_*`, `KILLER_STYLES`), 가구, 아이콘 |
| `10_player.js` | 레일 이동(`gridMove`, `railCands`, 꺾임 따라가기), 도망자 |
| `11_enemy.js` | 살인마 공통 AI `Enemy` (순찰, 추격, 수색, 문 부수기, 공격) |
| `12_items.js` | 열쇠, 월계관, 슬롯, 꿀 |
| `13_killers.js` | **살인마 6명 클래스**와 `KILLER_TYPES` |
| `14_comic.js` | 처벌 시퀀스(극화체). 살인마 얼굴 `drawComicKillerHead`는 HUNT 선택 화면 초상화에도 쓰인다 |
| `15_game.js` | 게임 상태 `G`, 페이즈, RUN 진행 |
| `16_hud.js` | RUN HUD, 타이틀, 인트로와 결과 화면 |
| `17_hunt.js` | HUNT 모드 전체: 도망자 AI `Victim`, 조작, 능력, HUD, 선택 화면 |
| `18_main.js` | 렌더 분기와 부트 |

## 테스트 (Playwright + 설치된 Chromium)

```
NODE_PATH=$(npm root -g) node game/tests/<파일>.js      # 스크린샷은 game/tests/shots/ (git 무시)
```

| 파일 | 확인하는 것 |
|---|---|
| `run-mechanics.js` | RUN 기믹 14종: 숨기, 문, 변기, 슬롯, 지옥문, 가짜 양초, 박사, 수위 등급, 진화, 창, 우물, 벽 뚫기 |
| `run-flow.js <killer> <seed> <맞힐 번개 수>` | RUN 한 판 전체: 추격 → SHAZAM → 복수극 → 처벌 시퀀스 |
| `run-soak.js` | RUN 장시간 무작위 플레이 |
| `controls.js` | 꺾임 따라가기, 늦은 코너 깎기, 대각선 입력 |
| `map-audit.js` | 맵 300개에서 버튼 겹침 칸이 0인지 |
| `hunt-flow.js <killer> <seed> dawn\|win` | HUNT 한 판 전체: 선택 → 인트로 → 공격, 능력, 수색, 문, 변기 → 결과 |
| `hunt-rules.js` | HUNT 살인마별 규칙 |
| `hunt-damage.js` | HUNT 피해원별 생명점, 넉백, 무피해 시간 |
| `hunt-ten-victims.js` | 도망자 10명 배치, 박사와 머신의 시야 공유(두 모드), 성능 |
| `janitor-honey.js` | 수위가 꿀 설치를 목격하면 등급이 오르는지(두 모드) |
| `honey-immune.js` | 꿀을 10번 밟은 살인마의 면역(두 모드) |
| `hunt-bot.js <killer> <seed> <초>` | 위치를 다 아는 봇의 자동 플레이 소크 |

페이지에는 테스트 훅 `window.__SXS`(`G`, `P`, `M`, `startPhase`, `newGame`, `CFG`, `Comic`, `Input`)가 있다. 전역 함수는 `page.evaluate`에서 바로 부를 수 있다.

URL 파라미터:
- `?killer=witch`, 또는 claude.ai 링크에서는 `#witch`
- `?seed=7`
- `?god=1`
- `?letters=SHAZM`
- `?keys=3`
- `?honey=3`

타이틀에서 `K`를 누르면 HUNT, 선택 화면에서 `Enter`를 누르면 시작한다.

## 새 살인마 추가 체크리스트

1. **GDD**: §6에 프로필(원안/세부)을 추가하고, §13.5 HUNT 표에도 한 줄 넣는다.
2. **`00_core.js`**: `CFG`에 튜닝 값을 추가한다.
3. **`13_killers.js`**:
   - `class Xxx extends Enemy`를 만든다.
   - 생성자에서 `title`과 `ko`를 정하고, 필요하면 `dmg`, `knockMul`, `bashTime`, `headH`도 정한다.
   - 매 프레임 능력은 `ability(dt)`에 넣는다. true를 반환하면 그 프레임의 기본 AI를 건너뛴다.
   - 전역 타이머는 `globalUpdate(dt)`에, 외형은 `drawBody`에 둔다.
   - 끝으로 `KILLER_TYPES`에 등록한다. 등록하면 RUN의 무작위 선택과 HUNT 선택 화면에 자동으로 들어간다. 선택 화면은 2열이고, 행 수는 인원에 맞춰 늘어난다.
4. **`09_cast.js`**: 사람형이면 `STY_*`를 만들어 `KILLER_STYLES`에 넣는다. 크리처형이면 전용 draw 함수를 만든다.
5. **`02_audio.js`**: `Sfx.scream(kind)`에 귀엽게 변조된 비명을 추가한다.
6. **`14_comic.js`**: `drawComicKillerHead`에 극화체 얼굴을 추가한다. 처벌 시퀀스와 선택 화면 초상화에 같이 쓰인다. 선택 화면에서는 `_menace`가 true면 노려보는 얼굴이 된다.
7. **`17_hunt.js`** (HUNT):
   - 설명: `HUNT_INFO`, `KILLER_TITLE`
   - 능력 버튼: `huntAbilityReady`, `tryHuntAbility`, `huntAbilityTick`, `drawAbilityIcon`
   - HUD 게이지: `drawHuntHUD`의 switch
   - 시간에 따라 저절로 일어나는 규칙: `huntKillerRules`
   - 피해는 항상 `hurtVictim(v, dmg, fromX, fromY, opts)`로 준다. 즉사는 `killVictim`이다.
8. **`15_game.js`**: SHAZAM이나 복수극과 얽히는 규칙이 있으면 여기에 넣는다(예: 박사 머신 소멸, 초진화체 알 부화).
9. 빌드한 뒤 `run-mechanics.js`, `run-flow.js`, `hunt-flow.js`에 새 살인마를 넣어 돌린다. 스크린샷으로 외형을 확인한다.

## 배포

- 플레이 링크(Artifact): https://claude.ai/artifact/3gjCyu6dwvn3XqzQqXoaBh
  - 다른 세션에서 갱신하려면 먼저 이 URL을 `read`한다.
  - 그다음 `node game/build.mjs --artifact <파일>`로 만든 본문을 `url`과 함께 publish한다.
- 작업 브랜치: `claude/iphone-web-game-3g2v3z`
