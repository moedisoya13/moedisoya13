# 달빛 결투 (pixel-duel)

코드로 조각한 Gaussian splat 픽셀아트 검객이 1:1로 겨루는 모바일 웹 게임입니다.
[ink-studio](https://github.com/siliconjungle/shapeshift-labs-ink-studio)로 형태를 만들고,
[Kimodo](https://github.com/nv-tlabs/kimodo)가 쓰는 SOMA 스켈레톤에 맞춰 리깅했습니다.
게임 자체는 빌드 단계 없이 정적 파일만으로 돌아갑니다(WebGL 2).

## 실행

```sh
npm install        # ink-studio (커밋 고정). 조각·검수·베이크에만 필요
npm run serve      # http://127.0.0.1:8765
npm test           # 게임 규칙 + 손맛 규칙
```

| 조작 | 터치 | 키보드 |
| --- | --- | --- |
| 이동 | 화면 왼쪽을 끌기 | A/D, ←/→ |
| 베기 | 베기 버튼 | J |
| 막기 | 막기 버튼 (칼이 닿기 직전 0.22초) | K |
| 회피 | 회피 버튼, 또는 왼쪽을 빠르게 튕기기 | L, Space, 방향 두 번 |
| 찌르기 | 막아낸 뒤 `CHANCE!` 동안 베기 | J |

주소 뒤에 붙이는 옵션: `?fps=1` 프레임 시간 표시, `?rows=160` 아트 격자 세로 픽셀 수(기본 216),
`?speed=0.25` 슬로모션, `?seed=3` 상대의 판단 고정, `?auto=1` 타이틀 건너뛰기.

## 만드는 순서

1. **조각** — `src/rig/swordsman.mjs`. SDF 입체를 관절 좌표계에 놓고 관절 이름으로 태그합니다.
2. **검수** — 화면을 열지 않고 ink-studio가 그린 PNG로 확인합니다.
   ```sh
   npx ink-studio sheet scenes/swordsman.js --t 0,1,2,3,4,5 --cols 6   # 스탠스
   npx ink-studio sheet scenes/reel.js --from 0 --to 0.55 --n 12       # 베기를 프레임 단위로
   npx ink-studio render scenes/arena.js --w 960 --h 540               # 배경
   ```
3. **베이크** — `npm run bake`. splat을 12 float 배열로 내보냅니다(`assets/`). 결과는 바이트 단위로 재현됩니다.
4. **플레이** — `index.html`. 런타임은 ink-studio를 싣지 않고 `assets/`와 `src/`만 씁니다.

## 구조

| 경로 | 내용 |
| --- | --- |
| `src/rig/skeleton.mjs` | SOMA 30관절의 부분집합 + 칼. T-pose, 미터, Y-up, +Z가 정면 |
| `src/rig/solve.mjs` | 스탠스(골반·발·손 위치, 칼끝 방향)를 관절 회전으로 푸는 2-bone IK |
| `src/rig/poses.mjs` | 손으로 쓴 스탠스 14개 |
| `src/anim/clips.mjs` | 클립. 곡선이 아니라 "그림 목록"이며 기본이 컷(보간 없음) |
| `src/anim/pose.mjs` | 블렌딩, 몸통 과장, 본 행렬 |
| `src/anim/motion.mjs` | Kimodo 모션 샘플링(부드럽게 / 그림 단위로 / 골라낸 프레임만) |
| `src/game/` | 결투 규칙(순수 로직), 상대 AI, 입력, 합성 사운드 |
| `src/render/` | splat 렌더러와 잔상·불꽃·먼지 |
| `scenes/` | ink-studio 검수용 장면 |
| `tools/` | `bake.mjs`, `feel.mjs`, `kimodo_import.py` |

## 손맛 규칙

부드러운 모션을 일부러 끊는 규칙입니다. `npm run feel`이 포즈에서 직접 재고, 어기면 실패합니다.

| 규칙 | 기준 | 현재 값 |
| --- | --- | --- |
| 휘두르는 0.11초는 그림 2장 | ≤ 2장 | 베기 2, 찌르기 2 |
| 입력 첫 프레임에 몸이 크게 움직임 | ≥ 17 cm | 20.7 / 23.5 cm |
| 맞은 프레임에 가장 젖혀진 자세로 점프 | ≥ 24 cm | 31 cm |
| 칼 쥔 손의 속도 | ≥ 14 m/s | 14.2 / 14.5 m/s |
| 세로 늘이기·줄이기 | ±10% 이내 | 0.90 – 1.10 |
| 허리·가슴 회전 1.5배, 칼 방향은 그대로 | 칼 방향 변화 0° | 21.3° → 31.9°, 0° |

히트스톱은 공격마다 멈추는 그림이 정해져 있습니다. 베기는 닿는 그림, 찌르기는 다 뻗은 그림에서 멈추고,
맞은 쪽은 이미 가장 뒤로 젖혀진 첫 그림에 멈춥니다.

## Kimodo 모션 넣기

Kimodo의 회전은 모든 관절이 identity인 T-pose 기준이고 축도 이 스켈레톤과 같아서, 회전을 그대로 옮깁니다.
NVIDIA가 저장소에 넣어둔 샘플 모션으로 변환과 재생을 확인했습니다(생성 자체는 GPU가 필요해 여기서 하지 않았습니다).

```sh
python3 tools/kimodo_import.py motion.npz studio/motions/slash.json --meta meta.json
DUEL_MOTION=studio/motions/slash.json npx ink-studio sheet scenes/kimodo.js --from 0 --to 4 --n 10
DUEL_MOTION=... DUEL_FPS=12 npx ink-studio sheet scenes/kimodo.js ...   # 12fps 그림 단위로
```

게임 클립으로 쓰려면 `motion.mjs`의 `cut()`으로 결정적인 프레임만 골라 `clips.mjs`와 같은 형태로 만듭니다.
`exaggerateTorso()`는 생성 모션에도 그대로 적용됩니다.

## 알려진 한계

- 실제 폰에서의 프레임 시간은 재지 않았습니다. 헤드리스 소프트웨어 GL에서만 돌려봤습니다. `?fps=1`로 확인하고, 느리면 `?rows=`를 낮추세요.
- 명암은 조각한 자세에서 한 번 구운 것입니다. 관절이 돌아가도 다시 계산하지 않습니다.
- 공격 모션은 손으로 쓴 스탠스입니다. Kimodo 전투 클립은 아직 들어가지 않았습니다.
- 배경 splat이 4.3만 개로 전체의 대부분입니다. 줄일 여지가 큽니다.

## 라이선스 메모

ink-studio는 MIT이며 의존성으로만 쓰고 소스는 포함하지 않습니다. Kimodo 코드는 Apache-2.0, 모델 가중치는
NVIDIA Open Model License(변형별로 다름)입니다. 상용 배포 전에 가중치 라이선스 원문을 확인하세요.
