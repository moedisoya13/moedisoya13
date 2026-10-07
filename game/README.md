# 재키 서바이버즈 — 맨손 액션 × 주식 투자

iPhone 세로 화면용 뱀서라이크(Vampire Survivors류) 픽셀 웹게임.
맨손 쿵푸와 사다리·의자·우산 같은 소품으로 15분을 버티면서, 주운 코인과 경험치로
**주식 2종**을 사고팔아 불리거나 날린다.

**플레이:** <https://moedisoya13.github.io/moedisoya13/>
(Safari → 공유 → **홈 화면에 추가** 하면 주소창 없는 전체화면 앱으로 실행된다)

## 처음 한 번: GitHub Pages 켜기

1. 저장소 **Settings → Pages → Build and deployment → Source** 를 **GitHub Actions** 로 바꾼다.
2. `master` 에 `game/` 변경이 머지되면 `.github/workflows/game-pages.yml` 이 테스트 후 자동 배포한다.
   (수동 배포: Actions → game-pages → Run workflow)

feature 브랜치는 배포되지 않는다 — `github-pages` environment 가 기본 브랜치만 허용하기 때문.

## 조작

- 화면 아무 곳이나 엄지를 대고 끌면 이동 (플로팅 조이스틱). 공격은 전부 자동.
- **차트 바는 엄지 반대쪽**에 붙는다: 아래를 터치하면 바가 위로, 위를 터치하면 아래로.
  가운데 띠(±10%)에서 시작한 터치는 바를 옮기지 않고, 드래그 중에도 옮기지 않는다.
  설정에서 위/아래 고정 가능.
- 차트 바 왼쪽 위 `II` = 일시정지, 오른쪽 위 `삐삐` = 원격 매매.

## 게임 규칙

| 요소 | 내용 |
|---|---|
| 런 | 15:00 생존 = 클리어. 5분 거구 마이크, 10분 삼합회 두목, 14분 흑룡 사부 |
| 기술 7종 | 연타 펀치(시작) · 회전 발차기 · 사다리 돌리기 · 의자 던지기 · 우산 막기(표창 반사) · 그림자 날아차기 · 병 던지기 (각 Lv8) |
| 패시브 9종 | 근력 · 쿵푸화 · 숨고르기 · 기공 · 체력 단련 · 보양식 · 자석 · 탐욕 · 분신술 |
| 드롭 | 만두 = XP, 엽전 = 코인. 상자·통·항아리를 부수면 코인/국수/자석/삐삐 |
| 주식 | **연꽃전자(LTS)** 우량주: 저변동·완만한 우상향 / **드래곤국수(DGN)** 테마주: 고변동·급등락 |
| 매매 | **왕씨 포장마차 증권**(약 55초마다 근처에 25초간 등장, 노란 화살표)에 닿거나 삐삐를 써야만 가능 |
| 결제 | 코인 우선, 모자라면 'XP 로 충당' 체크 시 XP(1 XP = 0.5코인)로. 레벨은 내려가지 않지만 레벨업이 늦어진다 |
| 매도 대금 | 코인. 왕씨 상점에서 국수(회복)·비전서(즉시 레벨업)·삐삐 구매 |
| 수수료 | 매수·매도 각 1% (금고 '투자 감각'으로 0.5%까지) |
| 런 종료 | 보유주는 그 순간 시세로 **강제청산** → 남은 코인을 금고에 입금 (시드머니는 반납) |
| 금고 | 영구 업그레이드: 체력·근력·이속·자석·탐욕·시드머니·투자 감각(Lv3 애널리스트 의견)·스턴트 대역(부활) |

차트 색은 한국식 — **빨강 = 상승, 파랑 = 하락**. 노란 점선 = 내 평단가.
시세는 0.5초 tick 의 로그가격 랜덤워크에 추세 구간(상승/하락/횡보, 15~40초)과 점프·뉴스가 섞여 있다.
보스를 잡으면 드래곤국수 CF 섭외설로 급등하고, 재키가 크게 다치면 '부상설'로 급락한다.

## 개발

의존성 없음 (vanilla ES modules + Canvas 2D, 빌드 단계 없음). Node 22 기준.

```bash
cd game
node tools/serve.mjs 8080          # http://localhost:8080/  (?debug=1 → 배속·치트 버튼·FPS)
node --test tests/*.test.mjs       # 시세·매매·차트 위치·스폰표·레벨업 + 헤드리스 봇 시뮬레이션
NODE_PATH="$(npm root -g)" node tools/smoke.cjs        # Playwright iPhone 에뮬 E2E (사전설치 chromium)
NODE_PATH="$(npm root -g)" node tools/make-icons.cjs   # 앱 아이콘 재생성
```

| 파일 | 역할 |
|---|---|
| `web/src/config.js` | **밸런스 상수 전부** (런 길이, XP 곡선, 브로커 주기, 수수료, 환율, 상점·금고 가격) |
| `web/src/market.js` | 주가 시뮬레이션 (pure) |
| `web/src/portfolio.js` | 보유·평단·매수/매도/청산 (pure, 코인은 정수 — 매수 올림/매도 내림) |
| `web/src/chartSide.js` | 차트 바 위/아래 결정 (pure) |
| `web/src/game.js` | 한 판의 상태와 업데이트. DOM 을 모르며 `run.events`/`run.sfx` 로 UI 와 통신 |
| `web/src/enemies.js` · `weapons.js` · `spawner.js` | 적·보스 AI, 기술 표, 시간대별 스폰표 |
| `web/src/sprites.js` | 코드로 그린 픽셀 스프라이트 (사람 캐릭터는 `humanoid()` 한 틀 + 팔레트) |
| `web/src/render.js` · `ui/` | 저해상도 월드 렌더, 고해상도 텍스트, 차트 바, DOM 메뉴 |
| `web/sw.js` | network-first 서비스워커 (오프라인 플레이용, 배포 후 옛 버전에 갇히지 않게) |

폰트: [Galmuri11](https://github.com/quiple/galmuri) (SIL OFL 1.1, `web/assets/fonts/Galmuri-OFL.txt`).
