---
name: quad-gaussian-model
description: 'Images to model: turns reference photos or illustrations into an animated 3D pixel-art figure built as a Quad Gaussian Splat model - read the image, sculpt it in code (SDF) on a human-proportioned rig with ball joints and turntables, bake flat splats that learn the whole G-buffer, render with deferred light and Almost Pixel Perfect snapping, then walk it, drive it from video motion capture, or import motion made on another skeleton (elbows kept out of the trunk, mitten hands that close into fists with the punches). Bundles a CPU-only engine, a soldier template, setup and a self-test. Use whenever the user wants images to model / 이미지로 3D 모델, 사진·일러스트를 3D 픽셀아트 캐릭터로, quad gaussian splat, 가우시안 스플랫 모델링, G-buffer splat, Almost Pixel Perfect, 뼈대·관절 구슬·회전판 리그, 그림 속 복식을 입힌 인물, 걷기 loop·디딤발 고정, 영상 동작 모사·모션 캡처 (MediaPipe retarget), or 다른 뼈대의 모션 가져오기·팔꿈치 빼기·주먹 쥐기 (retarget from another rig, grip); also to continue, re-bake, re-render or verify such a model. Not for photogrammetry or NeRF reconstruction of a real scene from many photos, nor one-click image-to-3D.'
---

# Quad Gaussian Model — 이미지에서 움직이는 3D 픽셀아트 인물까지

참고 이미지(사진·일러스트)를 **읽어서** 그 형태와 복식을 코드(SDF¹)로 빚고, 납작한 가우시안 splat² 수만 개로
구운(bake) 뒤, 저해상도로 그리고 조명을 나중에 붙여(deferred³) **빛이 움직이는 3D 픽셀아트 인물**을 만든다.
인물은 처음부터 움직임을 위해 짓는다: 실제 인체 비례의 뼈대, 관절 구슬, 허리·목 회전판, 뼈 하나에 강체⁴로 붙은 splat.

이미지는 3D로 "변환"되지 않는다. 이미지는 **설계도**이고 조형은 SDF 코드다. 그래서 GPU도 image-to-3D 모델도
쓰지 않고 CPU에서 돈다. 대신 형태는 코드로 손수 빚고, 최종 학습은 20분 남짓 걸린다.

**어디서 시작하나**
- 이미지로 새 인물 → §0 → §1 표를 ⓪부터 → §3에서 템플릿 고치기.
- 이미 만든 모델을 다시 굽기·렌더·검증 → §0(작업 폴더가 이미 있으면 생략) → §2의 해당 명령 → §4.
- 영상의 동작을 인물에게 → [`references/mocap.md`](references/mocap.md). 기법의 원리·코어 수정 → [`references/technique.md`](references/technique.md).
- 다른 캐릭터의 뼈대에서 만든 모션(관절 회전 열)을 인물에게, 팔꿈치가 몸통에 박히는 것 고치기, 펀치에 맞춰 주먹 쥐기 → [`references/motion.md`](references/motion.md)의 "다른 뼈대의 모션 가져오기"·"팔 마무리".

## 0. 엔진 풀기 (작업 폴더마다 한 번)

엔진·템플릿·시험은 이 skill 안에 있다(`engine/`). skill 폴더는 읽기 전용일 수 있고 템플릿은 고쳐 써야 하므로
작업 폴더(`WORK`, 결과를 남길 곳)에 풀어서 쓴다. `SKILL`은 skill을 불러올 때 표시되는 base directory다.

```bash
bash $SKILL/scripts/setup.sh $WORK                          # engine/ → WORK/ 복사 + WORK/.venv 에 requirements 설치
$WORK/.venv/bin/python $SKILL/scripts/selftest.py $WORK     # 마네킹 조형 → bake → 강체 → APP 한 장 → 디딤발 → 주먹·팔꿈치
```

- 설치: `uv`가 있으면 `uv`로, 없으면 `python3 -m venv` + `pip`로. Python 3.13, 버전은 `engine/requirements.txt`에 고정.
  PyPI의 torch는 CUDA 빌드라 `.venv`가 약 6 GB다(CPU에서 그대로 돈다). 처음 받으면 약 5분, uv 캐시에 이미 있으면 1초 안팎.
- requirements가 이미 깔린 Python이 있으면 `setup.sh $WORK --no-venv` 후 그 Python으로 selftest를 돌린다.
- 이미 있는 파일은 덮어쓰지 않는다(고친 템플릿이 남음). 번들 것으로 되돌리려면 `--force`.
- **완료 기준**: `7/7 passed`(12~31초; 31초는 렌더와 CPU를 나눠 쓰며 잰 값), 그리고 `WORK/out/selftest/selftest_app.png`를 직접 열어 구슬 관절 마네킹이 걷는 자세로 서 있는지 본다.

```
WORK/
  pixelsplat/   코어: camera mesh gt splats raster train shade gbuffer shadow skin sdf lod cli
  template/     병사 예제 = 새 인물의 출발점: rig body costume motion soldier · clip retarget synth mocap · import_pose arms · look shared
  photo/        사진 실루엣 → SDF 본보기 (extract_wings.py, wings.py; 사진·결과 파일은 없음)
  tests/        pytest 132개(코어 수정 F1~F9, 룩, 병사, 모션 캡처, 모션 가져오기, 팔 마무리) — 병사 템플릿을 고정한다
  out/          산출물. out/ 과 .venv/ 는 커밋하지 않는다
```

명령은 모두 `WORK`에서 `WORK/.venv/bin/python`(아래의 `python`)으로 실행한다.

## 1. 전체 흐름

| # | 무엇을 | 고치는 곳 | 확인 | 완료 기준 |
|---|---|---|---|---|
| ⓪ | **이미지를 직접 열어 복식 표를 쓴다** | 표(대화) | 사용자 | 모든 행에 붙는 뼈·층·형태·재질·얹히는 순서·움직임이 있고, 사용자가 표를 확인 |
| ① | 인체 비례 뼈대 | `rig.py` `H` `RATIO`, 관절 상수 | `verify --checks proportions` | 19항목 편차 ≤ 3 % |
| ② | 관절 구슬⁵ | `rig.py` `BEAD` `SOCKET` | `verify --checks sdf` | `shared_ball < 0`, `posed_ball < 0`, `pivot < 1e-5`, `core < −0.3` |
| ③ | 허리·목 회전판⁶ | `rig.py` `TURNTABLE`, `body.py` | `verify --checks sdf` | `waist_turning`·`head_turning`·`waist_static < 1e-4` |
| ④ | 맨몸 마네킹 | `body.py` `_pelvis` `_chest` … | `sculpt --outfit none` | 오류 없이 뼈 24개 메시(몸 20 + 손가락 뭉치·엄지 4), `sculpt_albedo.png`를 열어 비례·구슬 확인 |
| ⑤ | 복식 층 | `costume.py` `layers` `paint` `MAT` | `sculpt` → `animate --clips costume` | 뼈 36개 메시, `costume_sheet`를 참고 이미지와 나란히 대조 |
| ⑥ | 강체 바인딩 | (자동: 메시 part = 뼈 번호) | `verify --checks rigid` | `one_hot`, 같은 뼈 splat 거리·크기 변화 `< 1e-5` |
| ⑦ | 굽기 | `soldier.py bake` | `bake --iters 0` → 최종 bake | 로그 `[bake] saved N splats on 36 bones`(맨몸이면 24) |
| ⑧ | APP⁷ + stylized 렌더 | `look.py` | `animate --app` | 시트를 전부 열어 봄. `--checks gaps`의 빈 픽셀이 쉬는 자세 + 1 %p 이내 |
| ⑨ | 모션 | `motion.py` | `verify --checks feet,loop`, 걷기·회전 GIF | `stance_slide < 1e-4`, `seam_position < 1e-5`, 한계 위반 0 |
| ⑩ | 검증 | — | `verify`, `verify --checks gaps` | §4 전부 + 눈 |
| ⑪ | 모션 캡처 | `mocap.py` | `retarget` → `retarget.json` | `axes` 세 값 ≈ 1, `slip.slide_contact_max < 0.02` |
| ⑫ | 다른 뼈대의 모션 가져오기 | `import_pose.py` `SOMA`(관절 대응 표) | `retarget` → `import.json`, `render --compare` | 보고서의 `clamps`·`feet`·`wrap`을 읽고, `compare_*.mp4`를 원본 막대 뼈대와 나란히, **정면 뷰 포함**해서 봄 |
| ⑬ | 팔 마무리: 팔꿈치 빼기 + 주먹 | `arms.py` (⑫가 기본으로 걺; 다른 클립은 `arms.py fix`) | `import.json`의 `elbows`·`grip` | `wrist_moved_max ≈ 0`, `hand_turned_max` ≤ 상한(기본 10°), 펀치마다 `grip_at_full = 1`, 가드에서 grip 0. `inside_after`·`hand_cap_limited`(상한에 막혀 위팔이 일부 든 프레임)·`not_cleared`·`wrist_end_inside`는 읽고 수치로 보고 |

①~④는 템플릿에 이미 서 있다. 성인 남성 평균 체형이라면 **⓪ → ⑤ → ⑦~⑩**만 한다. ⑪~⑬은 모션을 밖에서 가져올 때만.
손은 벙어리장갑식이다(손바닥 + 손가락 뭉치 + 엄지, 손마다 숫자 하나 `grip` 0…1로 쥠 → [`rig.md`](references/rig.md) 10절).
①~④를 건드리면(뼈 구조·관절 위치·반지름) 그 뒤의 sculpt·bake·검증을 전부 다시 한다.

**⓪이 이 작업의 절반이다.** 이미지를 Read로 직접 열고 부위마다 한 행: 부위 · 붙는 뼈 · 층 이름 · 형태(구·캡슐·둥근 상자·
회전체 등) · 색/재질 · 무늬 · 무엇 위에 얹히나 · 강체인가 보조 뼈인가. 이미지끼리 다르거나 가려진 곳은 "추정"이라 적고 묻는다.
표가 곧 `costume.py`의 목차다 → 쓰는 법과 병사의 표는 [`references/costume.md`](references/costume.md).

## 2. 명령 (병사 템플릿 기준, 시간은 CPU 4코어)

```bash
python template/soldier.py sculpt  -o out/rig --outfit none            # ④ 마네킹만 (황동 구슬·청색 회전판)
python template/soldier.py sculpt  -o out/fig                          # ⑤ 뼈별 메시 36개 + 숨는 면 표시 (35~45초)
python template/soldier.py bake    -o out/fig --iters 0                # ⑦ splat 30000개, 학습 없이 메시에서 (약 5초)
python template/soldier.py animate -o out/fig --app --clips sheets,costume,gbuffer   # ⑧ 미리보기 시트 (약 2분)
python template/soldier.py animate -o out/fig --app --clips joints,walk              # ⑨ 관절 확대 + 걷기 GIF/MP4 (약 2분)
python template/soldier.py animate -o out/fig --app --clips turn                     # ⑨ 회전판 (약 1.5분)
python template/soldier.py animate -o out/fig --app --clips grip                     # 손 확대: 펴진 손 → 주먹 시트 + GIF
python template/soldier.py verify  -o out/fig                          # ⑩ 비율·강체·관절·발·loop·숨는 면·관통 (약 90초)
python template/soldier.py verify  -o out/fig --checks gaps            # ⑩ splat 구멍, 75장 렌더 (약 1.5분) — 따로 실행
python -m pytest -q -p no:cacheprovider tests                          # 코어·템플릿을 고쳤을 때 (혼자 돌 때 2분 안팎; 렌더와 CPU를 나눠 쓰며 잰 값 3분 35초)

python template/import_pose.py retarget motion.json -o out/punch --outfit none --model out/fig   # ⑫⑬ 다른 뼈대의 모션 → clip.npz + import.json
python template/import_pose.py render -o out/punch --model out/fig --views catalog,front --compare --strip 30,44,49,59
python template/arms.py fix out/mocap/run/clip.npz -o out/mocap/run/clip_arms.npz                # ⑬ 만 따로: 아무 클립에나

# 최종 품질: 60000개·320px·56 views·300 step = 20~25분(3.9~5.7 s/step). 백그라운드로 돌리고 로그 끝의 "[bake] saved"를 기다린다.
nohup python template/soldier.py bake -o out/fig --splats 60000 --res 320 --views 56 --iters 300 \
      --elev-lo -20 --elev-hi 35 > out/fig/bake.log 2>&1 &
```

시트·GIF 시간은 학습 안 한 30000개의 문서값이다. 학습한 60000개 모델은 시트+걷기+회전에 8~14분, 192px 한 장에 7~10초였다(이 과정을 만든 세션의 실측).
`sculpt → bake --iters 0 → sheets`의 **빠른 고리(약 3분)** 로 형태를 맞추고, 형태가 확정된 뒤에만 최종 bake를 건다.
룩·조명·카메라·모션만 바꿨으면 다시 굽지 않고 렌더만 한다. 옵션·산출물·메모리는 [`references/render.md`](references/render.md).

## 3. 새 인물: 템플릿의 어디를 바꾸나

`cp -r template knight`처럼 `WORK` 바로 아래에 폴더째 복사해 그 안에서 고친다(모듈이 한 단계 위의 `pixelsplat/`을 찾는다).
명령은 `python knight/soldier.py …`. 원본 `template/`은 비교 기준으로 남긴다. `tests/`는 병사 템플릿을 고정한 것이라
새 인물을 검사하지 않는다 — 새 인물의 합격 판정은 `verify`와 눈이다.

| 바꾸고 싶은 것 | 파일 · 이름 | 주의 |
|---|---|---|
| 키 | `rig.py` `H` | 전체가 같은 비율로 커진다. 복식 치수는 `costume.S = H/1.80`으로 따라온다 |
| 체형·등신 | `rig.py` `RATIO`, 관절 상수(`WAIST_H` `HIP_X` `SHOULDER_X` …) | `verify --checks proportions`의 목표값도 `RATIO`에서 나온다 → [`rig.md`](references/rig.md) 9절 |
| 살집(가슴·골반·팔다리 굵기, 얼굴) | `body.py`의 `_chest` `_pelvis` `_thigh` … | "touches its box"가 나오면 `body._boxes()`의 그 뼈 여유를 키운다 |
| 관절 구슬·회전판 크기 | `rig.py` `BEAD` `SOCKET` `TURNTABLE` | 구슬 ≥ 소켓. 어기면 관절 틈이 열린다 |
| 관절 가동 범위 | `rig.py` `LIMITS`, 옷이 좁히는 값은 `costume.py` `LIMITS` | 판정·제한은 `rig.clamp_rot` / `check_limits`로만 |
| 손(쥐는 모양·주먹) | `rig.py` `KNUCKLE` `THUMB_BASE` `FIST_CURL` `THUMB_FIST`, `body.py` `_hand` `_fingers` `_thumb`, 장갑은 `costume._mitt` | 마디의 원통·엄지 밑동의 공도 구슬 ≥ 소켓. 모양을 바꾸면 `animate --clips grip`으로 0…1을 다 본다. 90°를 넘게 도는 경첩은 pitch 축에 둔다 |
| 새 뼈(관절)를 더하기 | `rig.make_skeleton`(맨 **뒤**에 붙임), `JOINTS`, `LIMITS`, `body.BUILDERS`·`_boxes` | 끼워 넣으면 옛 모델·클립의 뼈 번호가 밀린다. `limit_poses`에 새 관절의 끝 자세가 들어가는지 확인(숨는 면) |
| 펀치에 맞춘 주먹, 팔꿈치 빼기 | `arms.py`의 상수(`PUNCH_MIN` `CLOSE_S` `HOLD` `OPEN` / `ARM_BALLS` `CLEAR_MARGIN` `SMOOTH_S` `HAND_TURN_MOST`; CLI `--hand-turn-max` `--wrist-range`), 손목 한계 묶음 `rig.LIMIT_SETS` | 규칙과 잰 값은 [`motion.md`](references/motion.md). 형태가 아니라 모션이므로 굽지 않고 retarget·렌더만 다시 |
| **옷·갑옷·소품** | `costume.py`의 `layers()` `paint()` `MAT` | 뼈마다 `{층 이름: 거리}`. 아래 "복식의 규칙" |
| 늘어지는 천·깃털·꼬리 | `rig.py` 보조 뼈(`GORES` `CAPE` `PLUME`, `make_skeleton`) + `motion.drive_helpers` + `costume.BONES` | 뼈 구조가 바뀌므로 sculpt·bake 다시. 안 쓰는 보조 뼈는 층을 안 주면 splat이 없다 |
| 걸음걸이 | `motion.py` `WALK_PERIOD` `STRIDE` `WALK_NORM` `RUN_NORM` `Gait` | 디딘 발은 월드에 고정, 뜬 다리는 사람의 관절 곡선, 골반 높이는 받친 무릎에서 → [`motion.md`](references/motion.md) |
| 화면 틀·조명 방향 | `soldier.py` `CENTER` `EXTENT` `HERO_AZ` | 깃털·무기로 키가 커지면 `EXTENT`를 늘린다 |
| 룩(대비·rim·bloom) | `look.py`, `pixelsplat/shade.py` `stylized()` | 형태와 무관: 굽지 않고 렌더만 다시 |
| 관통 검사 대상 | `costume.py` `CLASH_PAIRS` `THROUGH` `COVERS` | 새 옷 조각을 여기에 올려야 `verify`가 본다 |

**복식의 규칙** (이유와 예시는 [`references/costume.md`](references/costume.md))

1. 옷 조각 하나는 **뼈 하나**에 붙는다. 관절을 넘는 옷(소매, 치마)은 뼈마다 조각을 나누고, 이음매는 부모 쪽 옷자락이 덮게 한다.
2. 한 뼈의 층들은 하나의 SDF로 합쳐진다(합집합). 옷에 덮인 맨몸 면은 메시에 생기지 않으므로 속살이 비칠 일이 없다.
3. 무늬는 **쉬는 자세 좌표의 함수**로 칠한다. 조각이 강체라 어떤 자세에서도 천 위에서 미끄러지지 않는다.
4. 몸은 그대로 둔다. 옷은 `body.wear(costume)`으로 얹는 outfit이고 `--outfit none`이면 마네킹이 그대로 나와야 한다.
5. 휘어야 하는 천은 강체 조각 여러 개 + 보조 뼈로 만들고, 각도는 몸의 자세에서 **기하로 계산**한다(시뮬레이션 없음).

뼈·관절·한계의 표와 원리는 [`references/rig.md`](references/rig.md), 걷기·회전판·보조 뼈 구동은 [`references/motion.md`](references/motion.md).

## 4. 검증 체크리스트 (⑩)

`verify`는 수치를 출력하고 `out/…/soldier_verify.json`에 모은다(통과·실패를 스스로 판정하지 않는다). 기준은 `tests/test_soldier.py`가
템플릿에 거는 값이고, 괄호는 병사 템플릿의 실측값이다.

| 검사 | 통과 기준 | 실패가 뜻하는 것 |
|---|---|---|
| 비율 | 19항목 편차 ≤ 3 % (최대 +0.9 %) | 관절 위치나 살 SDF가 비율 표에서 벗어남 |
| 강체 | `one_hot`, 같은 뼈 splat 거리·크기 변화 `< 1e-5` (1.5e−7) | splat이 여러 뼈에 걸림 → 걷는 동안 구멍 |
| 관절 틈 | `shared_ball < 0`, `posed_ball < 0`, `pivot < 1e-5`, `core < −0.3` | 구슬·소켓 반지름이 뒤집혔거나 살이 관절 구를 못 품음 |
| 회전판 | `waist_turning`·`head_turning`·`waist_static` `< 1e-4` | 회전판 위에 얹힌 것이 회전체가 아님 → 돌 때 윤곽이 튐 |
| 디딤발 | `stance_slide < 1e-4` (5.1e−8), `max_reach < 1`, `limit_violations = 0`, 지면 오차 ±0.004, 착지·이륙 속도 < 몸 속도의 2 % | 발이 미끄러지거나 IK⁸가 발을 끌어당김 |
| loop | `seam_position < 1e-5`, `kink`·`seam_kink` `< 0.4` (0.25 = 매끄러움) | 반복 이음매에서 튀거나 꺾임 |
| 관통 | "… through …" 행(몸이 옷 밖으로): 걷기·회전·달리기·도약 모두 `< −0.003`(안쪽). 치마 쪽끼리 `< 0.003`. 나머지 쌍은 대개 `< 0.004`, 설계상 맞닿은 쌍(어깨판/몸통 등)은 쉬는 자세 대비 `+0.004` 이내 | 몸이 옷을 뚫고 보임 / 조각끼리 파고듦 |
| 구멍 (`--checks gaps`) | `culled = 0`, 빈 픽셀(`missing`/`silhouette`)이 쉬는 자세 + 1 %p 이내 (학습 전 30000개: 0.12~0.30 %) | splat 수 부족, 숨는 면을 너무 걸러냄 |
| **눈** | 시트(rest·walk·turn·costume·joints)를 전부 열어 참고 이미지와 대조 | 숫자가 못 잡는 것: 비례감, 색, 읽히는 형태 |

숫자와 눈 둘 다 통과해야 끝이다. 수치가 좋아도 그림이 이상하면 그림이 맞다. 관통 기준의 쌍별 값은 `test_costume_does_not_clash_while_walking_or_turning`.

## 5. 함정 (실제로 겪은 것 — 이유와 대처는 [`references/pitfalls.md`](references/pitfalls.md))

- **화면에 인물이 작게 잡히면 메모리가 터진다(Killed).** 가로로 넓은 화면(`--clips across`)처럼 인물이 작아지면 tile⁹ 하나에 splat이 몰려 K가 자동으로 커진다. 프레임 세로는 192px 이하, 렌더·학습은 한 번에 하나.
- **CPU 4코어를 나눠 쓰면 학습이 3.9 → 6 s/step으로 느려진다.** 최종 bake 중에는 다른 렌더·agent 작업을 쉰다.
- **가중치를 섞는 skinning(LBS¹⁰)은 splat 사이를 최대 3배 벌려 구멍을 낸다.** 강체 + 관절 구슬로 간다.
- **뼈 구조를 바꾸면 반드시 sculpt + bake를 다시.** 옛 `.pt`는 옛 뼈 번호를 달고 있다.
- **강체 치마 4장은 옆판이 앞판을 뚫는다.** 8쪽으로 나누고 각자 바깥으로만 젖힌다. 대가: 고관절 120°에서 쪽 사이로 속이 보인다.
- **한계 판정은 각도를 거꾸로 풀지(`euler_angles`) 말고 "가장 가까운 허용 회전"으로.** roll ±90°에서 pitch·yaw가 하나로 정해지지 않는다(gimbal lock¹¹).
- **천을 미는 매끈한 함수는 0 이하에서 정확히 0이어야 한다.** 그렇지 않으면 천이 몸 쪽으로 들어간다(`motion.soft_pos`).
- **agent 보고는 믿지 말고 이미지와 수치를 직접 확인한다.** 관통 표의 옆쪽 수치가 잘못된 환산으로 실제의 약 0.7배로 나왔던 적이 있다.
- **선으로만 된 뼈대에서 지은 모션은 팔꿈치가 가슴 속에 든다.** 방향 오차 0°로 옮겨도 위팔이 가슴에 묻히고 아래팔이 명치에서 솟는다(원본에는 몸통 두께가 없다). `import_pose.py`가 기본으로 팔꿈치를 어깨–손목 선 둘레로 돌려 뺀다. 옆모습은 멀쩡해 보이니 **정면 뷰**를 본다.
- **팔을 통째로 돌려 빼면 장갑도 같이 돈다.** 손의 월드 방향은 따로 지키고 손목이 그 차이를 받게 한다. 손목 한계(신전 30°)에 걸려 남는 회전은 기본 10°까지만 허용하고(`--hand-turn-max`), 그 때문에 덜 빠진 프레임은 수치로 보고한다.
  `--wrist-range human`(손목 굴곡·신전 70°, 선택)이면 장갑 0°로 다 빠지지만 손목이 기본 한계 밖으로 젖혀진다 — 어느 쪽을 쓸지 사용자에게 묻는다.
- **MediaPipe는 시스템 라이브러리 `libegl1`·`libgles2`가 있어야 돈다.** 없으면 실제 영상 캡처는 못 하고 합성 캡처로만 확인된다 — 그렇게 보고한다.
- **저작권**: 참고 이미지에서 가져오는 것은 역사적·일반적 복식 요소(형태·색·재질·무늬)다. 얼굴·머리 모양 같은 인물의 생김새는 일반형으로 둔다. 참고 이미지 파일은 저장소에 넣지 않고, 사진에서 뽑은 파생 윤곽만 남긴다.

## 6. 일하는 방식 (권장)

이 과정을 만든 세션에서 잘 맞았던 분담이다. 도구가 없거나 작업이 작으면 한 세션이 다 해도 된다.

- **구현**은 Fable(high) agent에게: 단계 하나(예: "⑤ 어깨 판금")씩, 고칠 파일과 완료 기준(§1·§4의 수치)을 함께 준다.
- **점검**은 Opus(high) 읽기 전용 agent에게: 수정 없이, 근거(파일:줄, 재현 명령)와 함께 발견만 보고하게 한다.
- **주 세션**은 분배 · 검증 · 학습 · 렌더 · 보고. 무거운 학습과 렌더는 주 세션이 순차로 돌린다(코어를 나눠 쓰면 느려지고 메모리가 모자란다).
- agent가 가져온 결과는 주 세션이 `verify`를 다시 돌리고 이미지를 열어 본 뒤에 받아들인다.

보고는 한글로, **잰 것 / 문서에 따른 것 / 추정을 구분**하고, 생소한 용어에는 쉬운 말 각주를 붙인다. 만든 이미지는 경로와 함께 보여 준다.

## 7. 이 방법이 못 하는 것

- 사진 여러 장에서 장면을 자동 복원하지 않는다(photogrammetry·NeRF의 일). 입력은 코드로 빚은 형태, 또는 3D mesh 파일(`python -m pixelsplat bake model.glb`).
- 천은 휘지 않는 강체 조각이다. 손은 벙어리장갑까지다(손가락 넷이 한 덩어리로 마디에서만 꺾임 — 낱손가락·가운데 마디 없음). 표정은 없다.
- 팔꿈치 빼기는 손목을 움직이지 않는다: 원본이 **손목·손 자체**를 몸통 속에 두면 빼지 못하고 보고만 한다(`wrist_end_inside`). 장갑은 기본 10°까지만 돌므로, 그보다 더 돌아야 빠지는 프레임에서는 위팔이 가슴에 일부 남는다(`hand_cap_limited`). 이벤트가 없는 훅·어퍼컷은 주먹 규칙이 잡지 못한다.
- 학습은 쉬는 자세만 본다. 쉬는 자세에서 가려진 splat(60000개 기준 약 40 %)은 메시 초기값 그대로다.
- 한 대의 카메라 영상에서는 깊이가 모호하다. 옆에서 찍은 영상이 가장 정확하다.

---
¹ **SDF**: "이 점이 표면에서 얼마나 떨어져 있나"를 계산하는 수식으로 형태를 정하는 방법. 여러 도형을 점토처럼 합칠 수 있다.
² **gaussian splat / quad splat**: 3D 형태를 수만 개의 작은 얼룩으로 나타내는 기술. 여기서는 얼룩이 공이 아니라 종이처럼 납작한 판(quad)이라 앞뒤와 표면 방향이 분명하다.
³ **deferred(지연) 조명 / G-buffer**: 먼저 픽셀마다 "무슨 색·어느 방향·얼마나 멀리·얼마나 거친가"만 그려 두고(이 묶음이 G-buffer), 빛은 맨 마지막에 계산한다. 빛을 바꿔도 다시 학습하지 않는다.
⁴ **강체**: 모양이 변하지 않고 통째로만 움직이는 덩어리. splat 하나가 정확히 한 뼈만 따라간다는 뜻(one-hot).
⁵ **관절 구슬**: 인형의 구체 관절처럼, 부모 뼈와 자식 뼈의 입체가 관절 중심의 같은 공을 둘 다 품게 한 것. 어떤 각도에서도 표면이 열리지 않는다.
⁶ **회전판**: 허리와 목에 둔 원판. 그 위에 얹힌 쪽이 좌우로 돌아도 이음매 모습이 변하지 않는다.
⁷ **APP(Almost Pixel Perfect)**: 모델을 약 80개 조각(patch)으로 나눠 조각마다 픽셀 격자에 맞춰 반올림해 그리는 방법. 조금 움직일 때 픽셀이 지글거리는 것을 줄인다.
⁸ **IK(역운동학)**: "발이 여기 있어야 한다"에서 거꾸로 무릎·고관절 각도를 구하는 계산.
⁹ **tile / K**: 화면을 작은 칸(tile)으로 나누고 칸마다 최대 K개의 splat만 따져 그린다. 칸에 splat이 너무 많으면 K를 늘려 다시 그린다.
¹⁰ **LBS**: 점 하나가 여러 뼈의 움직임을 가중 평균으로 따라가게 하는 방법. 관절 근처에서 점 사이가 늘어난다.
¹¹ **gimbal lock**: 회전을 세 각도로 적을 때 가운데 각이 90°가 되면 나머지 두 각이 같은 축을 돌리게 되어 값이 하나로 정해지지 않는 현상.
