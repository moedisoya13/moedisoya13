# 분석: "Quad Gaussian Splat"으로 3D 픽셀아트 만들기

> 대상: Tommaso Checchi(@_tomcc)가 2026-11-23~24에 X에 올린 기사(knight) 데모 2편과 설명 트윗 2개.
> 작성: 2026-11-25. 이 문서는 **관찰 → 해석 → 근거 소스 → 구현 대응** 순서로 정리합니다.

## 0. 먼저 밝혀 둘 한계

- **원문 스레드를 직접 읽지 못했습니다.** 이 작업 환경의 네트워크 정책이 x.com과 그 미러(xcancel, fxtwitter)를 막아 둔 상태입니다. 검색 색인에도 해당 글이 없었습니다.
  그래서 아래의 "tomcc가 실제로 한 일"은 **공유받은 스크린샷의 번역문 2개와 영상 2편만 보고 추론한 것**입니다.
- tomcc의 공개 GitHub(`tomcc/tomcc.github.io`, 마지막 커밋 2018)에도 이 기법의 코드는 없습니다. 그래서 그의 코드를 분석한 것이 아니라, **같은 결과를 내는 공개 기술(2DGS, deferred GS, pixel snapping)의 소스를 분석해서 재구성**했습니다.

## 1. 관찰한 사실 (영상·이미지)

| 관찰 | 의미 |
|---|---|
| 기사가 turntable로 돌 때 **하이라이트(번쩍임)가 표면을 따라 이동**한다 | 색이 이미지에 구워져 있지 않음 → 조명을 **매 프레임 다시 계산** (deferred shading¹) |
| 등 쪽으로 돌면 어두워지고 테두리만 빛난다 | 월드에 고정된 key light + 뒤쪽 rim light |
| 칼·방패 같은 금속은 밝게, 천·가죽은 무광 | splat마다 **roughness / metallic** 같은 재질값이 있음 |
| 픽셀이 큼직하고 화면 격자에 맞아 있다 | **저해상도로 직접 렌더**한 뒤 nearest²로 확대 (AI 필터가 아님) |
| 가장자리가 반투명하지 않고 칼같이 끊긴다 | coverage(alpha)를 **0/1로 자르는 hack** |
| 디버그 이미지: 몸이 약 80개의 색 조각(patch)으로 나뉘어 있다 | splat들을 **공간 덩어리로 묶은 것** → "Almost Pixel Perfect" snapping 단위 |

## 2. 트윗 문장 해석

**"quad gaussian splats that learn the whole g-buffer"**
- *gaussian splat*: 3D 장면을 수만 개의 반투명 "얼룩"으로 표현하고, 사진과 비교하며 얼룩을 조금씩 고치는(학습) 기술입니다(3DGS³).
- *quad*: 얼룩이 공 모양이 아니라 **납작한 사각/원판**이라는 뜻으로 해석했습니다(추론). 2DGS⁴의 "surfel"이 정확히 이 구조입니다. 납작하면 앞뒤가 분명해서 **법선(normal)과 깊이(depth)가 정확**하므로 조명 계산에 딱 맞습니다.
- *learn the whole g-buffer*: 완성된 색 대신 G-buffer⁵ 전체(albedo, normal, depth, roughness, metallic, coverage)를 정답 이미지와 비교하며 학습한다는 뜻입니다. 조명은 나중에 붙이므로 **빛을 마음대로 움직일 수 있습니다**.

**"a ton of hacks on top"** — 구체적인 목록은 원문에 없습니다. 영상에서 확인할 수 있는 것은 저해상도 렌더, binary alpha, 강한 specular, 어두운 배경입니다.

**"Almost Pixel Perfect™ … snaps patches of the model to the screen-space grid and then recombines them … locally pixel-perfect, but too noisy"**
- 문제: 3D 물체가 0.3픽셀처럼 **픽셀 단위보다 작게** 움직이면 픽셀 무늬가 매 프레임 바뀌어 지글거립니다(pixel creep⁶).
- 기존 해법(ProPixelizer, t3ssel8r): 물체나 카메라 **전체**를 픽셀 격자에 맞춰 반올림해 이동합니다. 하지만 원근 카메라나 회전에서는 한 번의 이동으로 전체를 맞출 수 없습니다("pixel creep can only ever be solved for orthographic projections" — ProPixelizer 문서).
- tomcc 방식(추론): 모델을 **약 80개 patch로 쪼개고, patch마다 따로 반올림**합니다. patch 내부는 정수 픽셀로만 움직이므로 무늬가 안정되지만(locally pixel-perfect), **patch끼리 경계에서 서로 다르게 반올림되어** 이음새 노이즈가 생깁니다. 그가 "too noisy"라고 한 이유가 이것으로 보입니다.

## 3. 근거 소스 (직접 열어 본 것 = ✅, 검색 요약만 본 것 = 🔎)

| 주제 | 소스 | 가져온 것 |
|---|---|---|
| 2DGS 원본 | ✅ github.com/hbb1/2d-gaussian-splatting · arxiv 2403.17888 | 납작한 원판(surfel), 광선-평면 교차, normal consistency·distortion 정규화 |
| 2DGS 순수 PyTorch 구현 | ✅ gsplat `gsplat/cuda/_torch_impl_2dgs.py` | **homography 행렬 T로 픽셀→(u,v) 정확히 계산**, AABB 공식, 화면 공간 low-pass(min σ) |
| gsplat 2DGS API | ✅ gsplat `rendering.py::rasterization_2dgs` | `colors`에 임의 채널 → G-buffer를 "다채널 색"으로 rasterize 가능 |
| Deferred GS | ✅ GS-IR(lzhnb/GS-IR) · ✅ 3DGS-DR(gapszju/3DGS-DR) | splat에 albedo·roughness·metallic·normal 저장 → **픽셀 단위 PBR shading** |
| Forward 방식(비교용) | ✅ Relightable3DGaussian · ✅ GaussianShader | splat마다 먼저 shading (우리는 이 방식을 쓰지 않음) |
| quad/billboard 계열 | 🔎 Textured Gaussians · BBSplat · Gaussian Billboards | "quad"가 평평한 textured primitive를 뜻할 가능성 |
| 안정적 3D 픽셀아트 | ✅ Texel Splatting(dylanebert/texel-splatting) · 🔎 t3ssel8r · 🔎 ProPixelizer | 저해상도 렌더, 격자 snapping, depth/normal 외곽선 |

## 4. 구현 대응표 (이 repo)

| 단계 | 파일 | 내용 |
|---|---|---|
| ① 정답 만들기 | `pixelsplat/gt.py` | mesh를 numba z-buffer로 rasterize → albedo·normal·depth·roughness·metallic·alpha. 2× 슈퍼샘플링으로 가장자리 anti-alias |
| ② splat 초기화 | `pixelsplat/splats.py` | mesh 표면에서 면적 비례로 점을 뽑아 원판을 붙임(법선 방향, 텍스처 색, 재질값) |
| ③ 미분 가능 렌더 | `pixelsplat/raster.py` | 2DGS homography + tile binning(sparse 교차쌍 정렬) + front-to-back 합성, autograd로 역전파 |
| ④ G-buffer 학습 | `pixelsplat/train.py` | 6채널 전부 L1 loss, Adam, 48개 시점 |
| ⑤ patch 나누기 | `train.py::assign_patches` | 위치 + 약간의 normal로 k-means → 약 80 patch |
| ⑥ Almost Pixel Perfect | `shade.py::patch_snap_shift` | patch 중심을 화면에 투영 → 픽셀 중앙까지 남은 오차(<0.5px)만큼 patch 전체를 화면에서 이동 |
| ⑦ deferred 조명 | `shade.py::shade` | GGX specular + Lambert + 하늘/땅 env 반사 |
| ⑧ hacks | `shade.py::postprocess`, `RasterConfig` | binary alpha, 외곽선, 팔레트 양자화, toon 단계, quad 커널(`--quad`), 무혼합(`--hard`) |

### "quad" 커널
splat 하나의 모양은 `G(u,v) = exp(-½·ρ^m)`, `ρ = (|u|^p + |v|^p)^(1/p)`입니다.
- `p=2, m=2`: 표준 2DGS(둥근 가우시안). 학습에 사용합니다.
- `p=8, m=6`: 모서리가 각지고 경계가 딱 떨어지는 **사각 quad**. 렌더할 때 `--quad`로 켭니다.

## 5. 검증한 것

- 학습 전 초기 splat의 실루엣이 mesh 실루엣을 99% 이상 덮습니다(perspective·orthographic 모두). 초기에는 약 1px이 바깥으로 걸치지만 학습이 깎아냅니다.
- 같은 픽셀에서 깊이 오차의 중앙값 < 0.02, 법선 코사인의 중앙값 > 0.95.
- quad 커널을 포함한 모든 gradient가 유한합니다(NaN 없음).
- snapping 이동량은 항상 0.5px 이하이고, 같은 patch는 같은 양만큼 움직입니다.
- (`tests/test_pipeline.py`, 10개 통과)

### snapping 실측 (`scripts/snap_stability.py`, 데모 기사, 128px, 20프레임)
프레임 사이에 색이 바뀐 물체 픽셀의 비율입니다. 낮을수록 안정적입니다.

| 움직임 | 화면 | snap off | snap on |
|---|---|---|---|
| pan (프레임당 0.13px 평행 이동) | albedo | 9.2% | **4.4%** |
| pan | lit | 16.2% | **10.7%** |
| orbit (프레임당 0.15° 회전) | albedo | 1.6% | 1.3% |
| orbit | lit | 2.3% | 3.0% |

→ **평행 이동에는 확실히 효과가 있습니다**(지글거림 절반).
**회전에서는 patch마다 서로 다른 순간에 1px씩 점프해서 이득이 없거나 오히려 나빠집니다.** tomcc가 말한 "locally pixel-perfect but too noisy"와 같은 현상입니다.
조명(lit)은 specular가 시점에 따라 변하므로 snap으로 완전히 고정되지 않습니다.
권장: 카메라가 주로 **평행 이동하는 게임 시점**(탑다운·횡스크롤)에서는 `--snap`을 켜고, turntable·회전 연출에서는 끕니다.

## 6. 알려진 한계 / 다음 단계

- **CPU 전용**이라 느립니다. 16k splat·160px 학습 1500 step에 약 10분이 걸립니다. GPU가 있으면 gsplat의 CUDA `rasterization_2dgs`로 바꾸면 됩니다(채널 구조가 같습니다).
- normal map 텍스처는 무시하고 geometry normal만 씁니다.
- densification(splat 쪼개기·늘리기)이 없습니다. splat 수는 초기화 때 고정됩니다.
- 입력이 **3D mesh**일 때만 동작합니다. 사진이나 영상만 있다면 카메라 위치 추정(COLMAP)이 먼저 필요합니다. 그림 한 장이라면 image-to-3D 모델(GPU 필요)을 먼저 거쳐야 합니다.
- tomcc의 실제 hack 목록·채널 구성은 원문을 확인하지 못한 **추론**입니다.

---
¹ **deferred shading**: 먼저 "무슨 재질이 어디 있는지"만 그려 두고, 조명은 맨 마지막에 픽셀마다 계산하는 방식입니다. 빛을 바꿔도 다시 학습할 필요가 없습니다.
² **nearest(최근접) 확대**: 작은 그림을 키울 때 픽셀을 뭉개지 않고 같은 색 블록으로 복제하는 방식입니다. 픽셀아트의 각진 느낌이 여기서 나옵니다.
³ **3DGS(3D Gaussian Splatting)**: 2023년에 나온 3D 표현 기술입니다. 수십만 개의 반투명 타원체를 쌓아 사진처럼 보이게 만듭니다.
⁴ **2DGS**: 3DGS의 타원체를 종이처럼 납작한 원판으로 바꾼 버전입니다. 표면이 또렷해서 모양(geometry) 복원에 강합니다.
⁵ **G-buffer**: 픽셀마다 색·표면 방향·거리·광택 같은 재료 정보를 따로 저장한 "재료 지도 묶음"입니다.
⁶ **pixel creep**: 물체가 조금 움직일 때 픽셀 무늬가 기어다니듯 지글거리는 현상입니다.
