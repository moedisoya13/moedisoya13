# 조형 · 학습 · 렌더: 명령, 파라미터, 시간, 메모리

단계 ⑦·⑧, 그리고 무거운 작업을 계획할 때 읽는다. 시간은 CPU 4코어·메모리 15 GB 컨테이너에서의 값이다.
"잰 값"은 직접 잰 것, "문서값"은 이 엔진을 만든 세션의 기록이다.

## 산출물 (`-o out/NAME` 폴더)

| 파일 | 만든 명령 | 내용 |
|---|---|---|
| `soldier_mesh.npz` | sculpt | 뼈별 메시(꼭짓점·면·법선·색·재질·숨는 면 표시) + 입은 옷 이름 |
| `soldier.glb`, `sculpt_albedo.png` | sculpt | 다른 도구로 열어 볼 메시 / 네 방향 색 미리보기 |
| `soldier_splats.pt`, `soldier_splats.json` | bake | splat 모델(뼈 번호 `part` 포함) / 뼈별 splat 수 |
| `*_sheet_app.png`, `gbuffer_app.png`, `walk_cycle_app.gif/.mp4` … | animate | `--app`이면 이름에 `_app` |
| `soldier_verify.json` | verify | 검사 결과(검사를 나눠 돌리면 누적) |

`animate`·`verify`·`mocap render`는 그 폴더의 mesh와 splat을 함께 읽는다. 비교하려면 폴더를 따로 만든다.

## sculpt

```bash
python template/soldier.py sculpt -o out/fig [--voxel 0.0075] [--outfit soldier|none] [--paint costume|rig]
```

| `--voxel` | 용도 | 시간 |
|---|---|---|
| 0.02 | selftest (마네킹) | 약 6초 (잰 값) |
| 0.014 | 테스트용 | — |
| **0.0075 (기본)** | 작업·최종 | 옷 입힌 36개 뼈: 46~50초 (잰 값, 렌더와 CPU를 나눠 쓰는 중; 손 뼈가 없던 32개 때는 혼자 돌려 34초) |

뼈마다 자기 상자에서 따로 marching cubes를 돌리고, 손·머리·발과 얇은 천은 `VOXEL_SCALE`로 더 촘촘하다.
둘째 줄 로그 `buried in every one of 306 poses: 5.6% of the surface dropped`가 숨는 면이다(템플릿: 표면적 5.007 → 4.728).

## bake

```bash
python template/soldier.py bake -o out/fig [--splats 30000] [--res 192] [--views 48] [--iters 0] [--elev-lo -20] [--elev-hi 35]
```

| 설정 | 용도 | 시간 |
|---|---|---|
| `--splats 3000 --res 64 --iters 0` | selftest | 약 2초 (잰 값) |
| `--iters 0` (기본 30000) | **형태 확인용**: 학습 없이 메시 표면에서 splat 초기화 | 약 4초 (잰 값) |
| `--splats 60000 --res 320 --views 56 --iters 300` | **최종** | 정답 뷰 56장 약 1분 + 300 step × 3.9~5.7 s = 20~25분 (만든 세션의 실측) |

- `--iters 0`의 한계: splat이 윤곽 밖으로 1px쯤 삐져나오고 확대하면 덩어리져 보인다. 30000개로는 리벳·징·단추가 한두 픽셀 얼룩이 된다. 학습(60000개)이 줄여 주는 부분이다.
- `--res`(학습 해상도)는 최종 픽셀아트 해상도보다 크게 잡는다(192px로 그릴 것을 320px로 학습).
- `--elev-lo/hi`는 학습 카메라의 높낮이 범위다. 아래에서 올려다보는 장면이 필요하면 `--elev-lo`를 더 내린다.
- 학습 로그의 `overflow 0.10` 정도는 정상 범위다. loss 참고값: 니케 60k·320px·300 step에서 0.0338.
- 학습은 **쉬는 자세만** 본다. 다른 뼈 속이거나 그 근처인 splat(60000개 기준 약 40 %)은 메시 초기값으로 보호된다(`[bake] … kept untrained` 로그).
- 20분짜리는 백그라운드로 돌리고 로그 파일을 본다(`> out/fig/bake.log 2>&1 &`, 끝은 `[bake] saved` 줄). 그동안 다른 무거운 작업을 돌리면 3.9 → 6 s/step으로 느려진다.

**다시 구워야 하는 때**: 뼈 구조·관절 위치·옷의 형태·칠을 바꿨을 때. 룩·조명·카메라·모션만 바꿨다면 렌더만 다시 한다.

## animate

```bash
python template/soldier.py animate -o out/fig --app --clips sheets,costume,gbuffer [--px 192] [--scale 4] [--look stylized|classic] [--cycle-frames 24] [--fps 24]
```

| `--clips` | 내용 | 프레임 수 |
|---|---|---|
| `sheets` | 쉬는 자세 4방향 · 걷기 8 · 회전판 8 | 20 |
| `costume` | 투구·어깨·치마·망토 확대 | 9 |
| `joints` | 극단 자세의 관절 확대 | 9 |
| `big` | 합성 달리기 4 + 도약 4 | 8 |
| `grip` | 왼손 확대: grip 0 · 0.25 · 0.5 · 0.75 · 1 × 손등 쪽·손바닥 쪽 시트 + 쥐었다 펴는 GIF(두 시점 나란히) | 10 + `--cycle-frames` × 2 |
| `gbuffer` | lit · albedo · normal · depth · material(빨강 = metallic, 초록 = roughness) · patch · 뼈 색 | 7 |
| `walk` / `turn` | 제자리 걷기 / 회전판 loop → GIF + MP4 | 24씩 |
| `across` | 옆에서 본 전진 걷기, **가로 2배 화면** | 48 — 아래 "메모리" 참고 |

| 모델 | 한 장 (192×144px, APP + stylized) | 클립 |
|---|---|---|
| 학습 전 30000개 | 5~12초, 두 장 그린 프로세스의 최대 메모리 5.75 GB (잰 값; 자세에 따라 차이가 커서 문서값의 장당 약 3초보다 느렸다) | `sheets,costume,gbuffer` 약 2분, `joints,walk` 약 2분, `turn` 약 1.5분 (문서값) |
| 학습한 60000개 | 7~10초 (만든 세션의 실측) | 시트 + 걷기 + 회전 8~14분 (만든 세션의 실측) |

긴 클립은 `mocap.py render`처럼 프레임을 디스크에 바로 쓰고, 같은 명령으로 이어서 그리는 방식을 쓴다.

`--app` = 뼈별 patch snap + 무혼합 합성(Almost Pixel Perfect). 끄면 splat을 섞어 그리는 부드러운 그림이 나온다.
직접 한 장을 그리려면:

```python
import sys; sys.path[:0] = [".", "template"]
import soldier, motion, shared
from pixelsplat.shade import upscale
sc, model, bones = soldier.load_model("out/fig")
with sc.worn():                                             # 입은 옷의 한계·상자를 켠다
    R = soldier.Renderer(model, bones, app=True)            # look_name="stylized"
    cam = soldier.camera(az=63, el=8, px=192)               # aspect 0.75, target=CENTER, extent=EXTENT
    mats, root = motion.walk_pose(soldier.SKEL, 0.1)
    img = R.frame(cam, mats, root, az=63)                   # mode="lit"|"albedo"|"normal"|"depth"|"patches"|"bones"|"material"
shared.save_png(upscale(img, 4), "out/fig/one.png")
```

## 메모리: 인물이 화면에서 작으면 터진다

tile 하나에 들어가는 splat이 K개를 넘으면(overflow) 추론 때 K를 256 → 512 → 1024 → 2048로 두 배씩 늘려 다시 그린다.
**인물이 화면에서 작을수록** 같은 수의 splat이 더 적은 tile에 몰려 K가 커지고, tile 수 × K만큼 메모리가 든다.
실제로 가로 2배 화면(`across`)에서 프로세스가 `Killed`(메모리 부족)로 죽었다. 보통 화면 한 장도 수 GB를 쓰므로(위 표),
메모리 15 GB에서 렌더 둘을 겹치면 모자란다.

- 프레임 세로는 **192px 이하**, 인물이 틀을 채우게(`EXTENT`는 키의 0.60배), 렌더 프로세스는 **한 번에 하나**.
- 넓은 화면이 필요할 때의 대안(해 보지는 않았다): 인물을 따라가는 좁은 카메라로 그려 배경 위에 붙이기, 또는 splat 수가 적은 모델 쓰기. `mocap.py render`는 카메라가 root를 따라가는 방식이라 이 문제를 피한다.
- 2배 투표(`supersample=2`)는 래스터 크기를 4배로 만든다. 메모리가 모자라면 `--look classic`(투표·정리 없음)으로 먼저 확인한다.

## 룩 (`look.py` → `pixelsplat/shade.py`)

`look.upgrade(fc, "stylized")` = G-buffer 정리(`supersample=2`, `select="mean"`, `despeckle`, `normal_smooth=0.6`; 무혼합인
`--app`일 때만) + `look.studio_shade`(아래 옵션을 켠 색·명암). `--look classic`은 둘 다 끈다.

| 묶음 | 옵션 (`ShadeConfig`) | 하는 일 |
|---|---|---|
| 명암 | `terminator` | 밝은 면은 경계 직전까지 밝게 두고 명암 경계에서 빠르게 떨어뜨림 |
| 형태 | `ssao`, `cavity`, `ridge` | 주름 속을 어둡게, 골은 어둡게·능선은 밝게 → 형태가 선으로 읽힘 |
| 가장자리 | `rim`, `outline`, `outline_silhouette` | 뒤에서 스치는 빛. 어두운 배경에서는 실루엣 외곽선을 끈다(어두운 선이 실루엣만 깎는다) |
| 색 | `contrast`, `saturation`, `shadow_tint`, `highlight_tint` | 밝은 곳은 따뜻하게, 그림자는 차갑게(hue shifting) |
| 빛 번짐 | `bloom`, `glow` | 하이라이트 번짐 / 배경의 옅은 후광 |
| 팔레트 | `palette_colors` + `fit_palette()` | 클립 전체에서 **한 번** 뽑은 고정 팔레트(프레임마다 뽑으면 색이 깜빡인다) |

`look.studio_shade`(어두운 배경, low-key)와 `look.colossus_shade`(밝은 하늘 배경: 노출 유지, 실루엣 외곽선 유지)가 있다.
빛 자체(따뜻한 key + 뒤쪽 차가운 rim, 배경색, 그림자)는 `shared.studio_lights`이고, `soldier.soldier_shade(az)`가 그 빛을
카메라와 함께 돌려 모든 시점이 같은 쪽에서 비치게 한다.

## 인물 없이 코어만: mesh 파일을 굽기

```bash
python -m pixelsplat bake  model.glb -o out/mine/model.pt   # --splats 16000 --res 160 --iters 1500 --patches 80 [--up z]
python -m pixelsplat render out/mine/model.pt -o out/mine   # --px 128 --scale 6 [--snap] [--quad] [--hard] [--ortho] [--palette 24]
python -m pixelsplat demo -o out/demo                       # 내장 데모 기사로 전 과정 (문서값 10~15분)
```

`--quad`가 사각 커널(p=8, m=6), `--hard`가 무혼합, `--snap`이 patch snap, `--app`이 둘을 합친 APP(`--snap --hard`)다.
