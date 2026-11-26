# 기법: Quad Gaussian Splat으로 3D 픽셀아트

원리를 설명해야 하거나 코어(`pixelsplat/`)를 고칠 때 읽는다. 인물만 만든다면 SKILL.md로 충분하다.

동기는 Tommaso Checchi(@_tomcc)의 2026-11 데모 "quad gaussian splats that learn the whole g-buffer"와
"Almost Pixel Perfect"다. 원문 스레드와 그의 코드는 보지 못했고, 영상·번역문에서 추론해 **같은 결과를 내는
공개 기술(2DGS, deferred GS, pixel snapping)로 재구성**한 것이다. 그의 실제 구현과 같다고 말하지 않는다.

## 한 줄씩

```
형태(SDF 또는 mesh) ─▶ ① 정답 G-buffer 렌더(여러 시점)
                   └▶ ② 표면에 splat 뿌리기 ─▶ ③ 미분 가능 rasterizer로 G-buffer 비교·학습 ─▶ model.pt
model.pt ─▶ ④ patch snap(APP) ─▶ ⑤ 저해상도 G-buffer ─▶ ⑥ 2배 투표·정리 ─▶ ⑦ deferred 조명 ─▶ ⑧ 픽셀 hack ─▶ PNG/GIF/MP4
```

| 개념 | 무엇 | 코드 |
|---|---|---|
| 납작한 splat (2DGS식 surfel¹) | splat이 공이 아니라 방향이 있는 원판. 앞뒤가 분명해 법선·깊이가 정확하고, 그래서 조명 계산에 맞는다 | `splats.py` `SplatModel` (위치·회전·크기·불투명도·albedo·roughness·metallic·patch·part) |
| 광선-평면 교차 | 픽셀을 지나는 광선이 splat 평면과 만나는 점의 (u, v)를 homography²로 정확히 구한다. 화면에 투영한 타원으로 근사하지 않는다 | `raster.py` `project`, `rasterize` |
| quad 커널 | `G(u,v) = exp(-½·ρ^m)`, `ρ = (|u|^p + |v|^p)^(1/p)`. `p=2, m=2` = 둥근 가우시안(학습용), **`p=8, m=6` = 모서리가 각지고 경계가 딱 떨어지는 사각 quad**(렌더용) | `RasterConfig.kernel_p`, `kernel_m` |
| sparse tile binning | 화면을 tile(4~8px)로 나누고 splat-tile 교차쌍만 정렬한다. tile당 최대 K개. 넘치면(overflow) 추론 때 K를 늘려 다시 그린다 | `raster.py`, `shade.py` `render_gbuffer_frame` (K ≤ 2048) |
| G-buffer 학습 | 색이 아니라 albedo·normal·depth·roughness·metallic·coverage 6채널을 정답과 L1으로 비교(Adam). 조명은 굽지 않는다 | `train.py` `train`, `TrainConfig`; 정답은 `gt.py`의 numba z-buffer |
| 무혼합(hard) | 추론 hack: 불투명도가 문턱을 넘는 맨 앞 splat 하나만 그린다. 가장자리가 칼같고 색이 섞이지 않는다 | `RasterConfig.hard` |
| deferred 조명 | G-buffer에서 픽셀마다 PBR(GGX specular + Lambert + 하늘/땅 반사). 빛을 움직여도 재학습이 없다 | `shade.py` `shade`, `ShadeConfig`, `Light` |
| shadow map | 빛 방향의 직교 깊이 지도로 몸·바닥 그림자 | `shadow.py` |
| APP | splat을 약 80개 patch로 묶고, patch 중심을 화면에 투영해 픽셀 중앙까지의 오차(< 0.5px)만큼 patch 전체를 옮긴다 | `shade.py` `patch_snap_shift`; patch는 `train.assign_patches` 또는 뼈별 `shared.bone_patches` |
| 2배 렌더 투표 | G-buffer를 2배로 그린 뒤 아트 픽셀³마다 투표: 절반 이상 덮였나(4표 중 2표 동점은 덮인 것), 과반이 보는 깊이 층은 어디인가. 그 층의 표본만 평균한다. 다른 면과는 섞지 않는다 | `gbuffer.py` `select_downsample`; `FrameConfig.supersample=2` |
| despeckle | 이웃 8칸 대부분과 같은 면인데 혼자 튀는 픽셀, 뒤가 비치는 pin-hole을 같은 면의 이웃으로 교체. 1픽셀 선은 서로 지지하므로 남는다 | `gbuffer.py` `despeckle`, `smooth_normals` |
| stylized 룩 | 어두운 바탕에 일부만 밝게(low-key), 명암 경계를 빠르게, 골은 어둡게·능선은 밝게, rim, 따뜻한 밝은 곳·차가운 그림자, bloom | `shade.py` `stylized()`; 조합은 `template/look.py` |
| 강체 skinning | 뼈 행렬로 splat의 위치·방향을 옮긴다. 가중치가 one-hot이면 같은 뼈 안의 splat 간격이 변하지 않는다 | `skin.py` `Skeleton`, `pose_splats` |
| SDF 조형 | 구·타원체·캡슐·둥근 원뿔·부드러운 합집합으로 형태를 빚고 marching cubes⁴로 메시화 | `sdf.py` |

## APP는 어디에 듣고 어디에 안 듣나 (잰 값, 데모 기사 128px 20프레임)

프레임 사이에 색이 바뀐 물체 픽셀의 비율. 낮을수록 안정적이다.

| 움직임 | 화면 | snap 끔 | snap 켬 |
|---|---|---|---|
| pan (프레임당 0.13px 평행 이동) | albedo | 9.2 % | **4.4 %** |
| pan | lit | 16.2 % | **10.7 %** |
| orbit (프레임당 0.15° 회전) | albedo | 1.6 % | 1.3 % |
| orbit | lit | 2.3 % | 3.0 % |

평행 이동에서는 지글거림이 절반으로 준다. **회전에서는 patch마다 다른 순간에 1px씩 점프해 이득이 없거나 나빠진다**
(tomcc가 말한 "locally pixel-perfect but too noisy"). 카메라가 주로 평행 이동하는 시점(횡스크롤·탑다운)에서 켜고,
turntable 연출에서는 끈다.

인물에서는 patch가 **한 뼈 안에서만** 만들어진다(`shared.bone_patches`). patch가 두 뼈에 걸치면 관절이 굽을 때
patch 안이 강체가 아니게 되어 snap의 전제가 깨진다.

## G-buffer 정리의 대가 (잰 값, 60k 모델 128px)

2배 투표 + despeckle은 정지 화면의 점 노이즈와 구멍을 없애고 걷기 중 깜빡임을 1.02 % → 0.87 %로 줄인다.
그러나 카메라가 서브픽셀로 흐를 때 "바뀐 픽셀 수"는 1.6~4.4 %p **늘어난다**(여러 표본의 평균이 조금씩 연속으로 변하므로).
가만히 흐르는 카메라에서 최대한 고정된 픽셀이 필요하면 `supersample=1`이 가장 안정적이다.

## 레퍼런스와의 차이 (아직 남은 것)

- 레퍼런스는 quad가 픽셀보다 커서 같은 색 픽셀이 2~4개씩 뭉친다("붓자국"). 여기서는 128px에서 splat이 픽셀과 비슷하거나 작아 픽셀마다 값이 다르다. `lod.py`(작은 splat 병합)는 실험용으로만 있다.
- 금속·가죽·천이 섞여야 specular 하이라이트가 화면을 살린다. 재질을 여러 가지로 칠하는 것이 룩에 직접 도움이 된다.
- 같은 화면 크기에서 아트 픽셀이 많을수록(256px) 격차가 준다. 다만 메모리와 시간이 늘어난다.

## 코어를 고칠 때 지킬 것 (`tests/test_fixes.py`가 고정한 9가지)

| # | 고친 것 | 다시 깨지면 보이는 증상 |
|---|---|---|
| F1 | 패딩 자리의 NaN이 프레임을 오염시키지 않게 | 마지막 splat이 나쁘면 화면 전체가 NaN |
| F2 | 비스듬한 splat의 깊이(`min_screen_sigma`)가 splat 밖으로 나가지 않게 | 가장자리 픽셀의 깊이가 튀어 외곽선·그림자가 깨짐 |
| F3 | overflow 재시도는 **splat이 있는 tile만** 보고 판단, 그림이 안 바뀔 때는 재시도 안 함 | 빈 배경이 넓으면 재시도를 안 해 구멍 / 쓸데없이 K를 키워 메모리 폭증 |
| F4 | 2배 투표의 2/4 동점은 덮인 것으로 | 아트 픽셀 경계에 걸친 가는 선이 사라짐 |
| F5 | 외곽선이 화면 반대편으로 돌아 나오지 않게 | 왼쪽 끝 물체의 선이 오른쪽 끝에 나타남 |
| F6 | marching cubes 면이 바깥을 향하게 | 메시가 뒤집혀 정답 G-buffer가 비고 splat 법선이 반대 |
| F7 | 그림자에 normal offset | 비스듬히 빛 받는 면에 줄무늬(shadow acne) |
| F8 | 학습 결과를 patch 배정 **전에** 저장 | patch 단계에서 죽으면 20분 학습이 사라짐 |
| F9 | `part`(메시 부분 번호 = 뼈 번호)가 prune·저장·불러오기를 따라감 | splat이 엉뚱한 뼈를 따라 움직임 |

## 한계

- CPU 전용이라 느리다. GPU가 있으면 gsplat의 `rasterization_2dgs`로 바꿀 수 있다(채널 구조가 같다) — 해 보지는 않았다.
- densification(splat을 쪼개고 늘리기)이 없다. splat 수는 초기화 때 정해진다.
- normal map 텍스처는 쓰지 않고 형태의 법선만 쓴다.

---
¹ **surfel**: surface element. 표면 위에 놓인 작은 원판 하나.
² **homography**: 한 평면 위의 좌표를 다른 평면(화면)의 좌표로 옮기는 3×3 행렬.
³ **아트 픽셀**: 확대하기 전, 저해상도 그림의 픽셀 한 칸.
⁴ **marching cubes**: SDF를 촘촘한 격자에서 계산한 뒤 표면을 삼각형 그물(메시)로 뽑아내는 방법.
