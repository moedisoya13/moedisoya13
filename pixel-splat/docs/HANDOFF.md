# HANDOFF — Pixel art 쿼드 가우시안 스플랫 모델링

> 작성 2026-11-25 · 이전 세션 `session_01Juyi5GikZkVpyhYK2rjr6D` → 같은 제목의 새 세션으로 인계
> 이 문서 하나만 읽으면 이어서 작업할 수 있도록 썼습니다. 세부는 각 README·문서 링크를 따라가세요.

## 0. 30초 요약

- **무엇**: 3D 모델을 납작한 가우시안 splat("quad splat") 수만 개로 표현하고, 색 대신 G-buffer¹(albedo·normal·depth·roughness·metallic·coverage)를 학습시켜 저해상도로 그린 뒤 조명을 나중에 붙이는 **3D 픽셀아트 렌더러** `pixel-splat/`. tomcc(@_tomcc)의 2026-11 데모가 동기.
- **예제**: 「사모트라케의 니케」를 코드로 조형(SDF²) → 60k splat 학습 → 뼈대·IK 걷기 → Almost Pixel Perfect(APP) → 아이폰 전체 화면 "거상" 영상.
- **현재 빌드**: **v4** = 사진에서 오려낸 좌우 날개 + 발 자리의 손 + 새 룩(stylized). 모델은 `pixel-splat/models/nike_v4_60k.pt`.
- **미결**: 28건(결정 21 + 파기 승인 7). 카탈로그 artifact에서 사용자가 답하는 중 → §6.
- **다음 할 일**: §8의 시작 절차(미결 briefing → Opus(high) 10회 점검 제안).

## 1. 위치와 상태

| 항목 | 값 |
|---|---|
| repo | `moedisoya13/moedisoya13` (GitHub 접근은 이 repo로만 한정됨) |
| 작업 브랜치 | `claude/vibrant-dijkstra-2srtrd` — **`master`에 병합되지 않음, PR 없음** |
| 프로젝트 폴더 | `pixel-splat/` (repo의 다른 내용은 긱뉴스 다이제스트 자동화로, 이 작업과 무관) |
| 테스트 | `cd pixel-splat && python -m pytest -q -p no:cacheprovider` → 27 passed |
| 카탈로그 | https://claude.ai/artifact/E3CXeGxitRj3ALsZH9iEte (소스: `docs/catalog/open-items.html`) |

**새 세션은 새 컨테이너에서 `master`를 기준으로 시작합니다.** 먼저 작업 브랜치를 가져와야 `pixel-splat/`이 보입니다(§8).
`out/`(산출물)·`.venv/`·scratchpad는 git에 없으므로 새 세션에는 없습니다. 재생성 방법은 §5.

## 2. 사용자와 작업 규칙

- **한글 우선 출력**, 영어는 효율을 위해 섞어 씀. 문서·보고·커밋 설명 본문 모두.
- 사용자는 비전공자·바이브 코더: **생소한 용어·원리는 쉬운 말 각주**를 붙임.
- **구현은 Fable(high) agent**, **점검(audit)은 Opus(high)** — 사용자가 지정한 역할 분담. 주 세션은 분배·검증·학습·렌더·보고.
- agent 보고는 그대로 믿지 않고 **결과 이미지를 직접 열어 확인**한 뒤 병합(이전 세션에서 agent의 사진 라벨 오류 지적 등으로 효과 확인).
- 추정과 확인을 구분해서 말하기. 사진 대조·수치는 "쟀다/추정이다"를 명시.
- PR은 사용자가 요청할 때만. 커밋·push는 작업 브랜치에.
- **파기는 사용자 승인 후에만** (카탈로그의 "파기 승인" 절).
- 저작권: 원본 사진은 repo에 넣지 않음(파생 윤곽 `wings.npz`만). 기존 게임·캐릭터 재현 금지 규칙과 무관한 공공 조각상.

## 3. 요청 이력과 결과 (시간순)

| # | 사용자 요청 | 한 일 | 결과물 |
|---|---|---|---|
| 1 | tomcc의 quad gaussian splat 픽셀아트 기법을 소스로 분석·숙지 | 2DGS·gsplat·deferred GS 소스 분석, CPU용 미분 가능 tile rasterizer 직접 구현, 데모 기사 | `docs/ANALYSIS.md`, `pixelsplat/` 코어 |
| 2 | 예제: 승리의 여신상을 자연스럽게 걷게 | SDF 조형, 12뼈 skeleton, 2-bone IK 걷기(발 고정), 접지 그림자 | `examples/nike/nike.py`, `pixelsplat/sdf.py`·`skin.py` |
| 3 | 날개 형태를 사진으로 다시 참조 | 뒤로 누운 아치형으로 재조형 | (v2) |
| 4 | Almost pixel perfect로 | 뼈 기준 patch + 격자 snap + 무혼합 합성 | `--app` |
| 5 | 원본 날개는 비대칭·더 짧음, 이미지 검색 후 재검증 | Commons 사진 14장 확보, 수치 대조, 좌우 다른 날개 | (v3) README "날개 검증" |
| 6 | iPhone 화면 가득, 거상처럼 재구축 | 60k splat·320px 학습, 눈높이 카메라, 광장·사람·shadow map | `colossus.py`, `pixelsplat/shadow.py` |
| 7 | ①옆모습 사진에서 좌우 날개 추출해 그대로 모델링 ②APP 샘플 수준 화질 ③발 대신 달걀 덮은 듯한 손 | Fable(high) agent 2개 병렬 → 병합·재학습·재렌더 | (v4) `wings.py`·`extract_wings.py`·`wings.npz`, `gbuffer.py`·`look.py`·`marble.py`, `hand_sdf` |
| 8 | 새 세션 handoff, 미결 카탈로그, 파기 승인 절차, 개시 prompt | 이 문서, 카탈로그 artifact | `docs/HANDOFF.md`, `docs/catalog/` |

## 4. 코드 지도

```
pixel-splat/
  pixelsplat/                코어 라이브러리
    camera.py     카메라(OpenCV 규약). 원근·직교를 3x4 행렬 하나로
    mesh.py       GLB/OBJ 로더(PBR), 데모 기사
    gt.py         정답 G-buffer용 numba z-buffer 렌더러, 표면 샘플링
    splats.py     SplatModel(위치·회전·크기·불투명도·재질·patch)
    raster.py     ★ 미분 가능한 2D 가우시안 tile rasterizer (sparse binning, hard=무혼합)
    train.py      G-buffer 학습(L1, Adam), patch k-means, TrainConfig(extent/target/elev_range)
    shade.py      deferred PBR, postprocess, patch snap, FrameConfig/ShadeConfig, stylized()
    gbuffer.py    2배 렌더 후 투표(select_downsample), despeckle, normal smoothing, SSAO
    shadow.py     splat shadow map(직교 깊이 지도) → 몸·바닥 그림자
    skin.py       Skeleton, 거리 기반 가중치, pose_splats(LBS)
    sdf.py        SDF 조형 도구 + marching cubes
    lod.py        (실험) 화면 크기 이하 splat 병합 — 기본 룩에는 미사용
    cli.py        python -m pixelsplat bake|render|demo
  examples/nike/
    nike.py           조형(body/trail/hand_sdf) · skeleton · walk_pose · sculpt/bake/animate CLI
    wings.py          사진 기반 날개 SDF (wings.npz 사용)   ← extract_wings.py 가 생성
    extract_wings.py  옆모습 사진 → 윤곽 SDF + 깃털 결 (사진 필요, §5)
    marble.py         풍화 대리석 칠(paint), repaint_splats
    look.py           룩 조합: upgrade(studio), colossus_shade, clean
    repaint.py        학습된 모델에 새 칠만 입히기(형태가 같을 때만 유효)
    colossus.py       아이폰 해상도 거상 렌더(walk/still/orbit)
  models/nike_v4_60k.pt   v4 학습 모델(60k splat) — handoff용으로 보존
  scripts/        snap_stability.py, look_stability.py (프레임 간 변화 픽셀 측정)
  tests/          test_pipeline.py(11) + test_look.py(16)
  docs/           ANALYSIS.md(기법 분석) · LOOK.md(룩 옵션·측정) · HANDOFF.md · catalog/
```

좌표계: **y 위, 정면 +z, +x가 그녀의 왼쪽, 바닥 y=-1**, 목 절단면 y≈0.64. 거상에서는 1 단위 = 20 m.

## 5. 환경 구축과 재현

```bash
# 1) 브랜치 (새 세션에서)
git fetch origin claude/vibrant-dijkstra-2srtrd
# 2) 환경 — PyPI의 torch는 CUDA 빌드지만 CPU에서 동작. download.pytorch.org는 차단됨. 설치 약 5분
uv venv .venv -p 3.13 && source .venv/bin/activate && uv pip install -r pixel-splat/requirements.txt
cd pixel-splat && python -m pytest -q -p no:cacheprovider          # 27 passed
# 3) 보존된 v4 모델로 바로 렌더 (out/ 은 git 밖)
mkdir -p out/nike_v4 && cp models/nike_v4_60k.pt out/nike_v4/nike_splats.pt
python examples/nike/nike.py animate -o out/nike_v4 --app --clips cycle --px 256 --scale 3   # 약 4.5분
python examples/nike/colossus.py -o out/nike_v4 --clips still                                 # 약 40초
python examples/nike/colossus.py -o out/nike_v4 --clips walk                                  # 약 24분 (72프레임)
python examples/nike/colossus.py -o out/nike_v4 --clips orbit                                 # 약 46분 (144프레임)
# 4) 형태를 바꿨다면 처음부터
python examples/nike/nike.py sculpt -o out/nike_v4 --voxel 0.006                              # 약 1.5~4분
python examples/nike/nike.py bake   -o out/nike_v4 --splats 60000 --res 320 --views 56 --iters 300 --elev-lo -35 --elev-hi 30   # 약 15분 (2.9 s/it)
```

빠른 반복용: `sculpt --voxel 0.011`(약 20초), `bake --splats 30000 --res 192 --iters 0`(학습 없이 mesh에서 초기화).

**날개를 다시 추출하려면 사진이 필요합니다**(repo에 없음). 출처는 `wings.npz`의 `meta`에 기록:
왼쪽 = 사용자가 준 왼쪽 옆모습 사진(1750×2576, 새 세션에 다시 첨부 필요), 오른쪽 = Commons `Louvre Victoire de Samothrace (Winged Victory) (9811957165).jpg`.

## 6. 미결 사항 (카탈로그와 같은 ID)

사용자 응답은 카탈로그 artifact의 DB에 저장됩니다. **읽는 법**: `ArtifactData`(ToolSearch로 로드) `action:"get"`, `url:"https://claude.ai/artifact/E3CXeGxitRj3ALsZH9iEte"`, `collection:"responses"`, `doc_id:"current"` → `answers.{ID}.{choice,label,note}`, `text`(요약). 이력은 `submissions` collection. 문서가 없으면 아직 미제출입니다.

| ID | 미결 | 선택지(→ 제안) |
|---|---|---|
| B1 | 스튜디오 기준 빌드 v3 vs v4 | → v4 / v3 / 섞기 |
| B2 | 룩 classic vs stylized | → stylized / classic / 약하게 |
| B3 | APP 기본 여부 | → 켬 / 끔 / 장면별 |
| B4 | 거상 걷기 v3 vs v4 | → v4 / v3 / 다시 |
| B5 | 거상 회전 채택·구도(날개 잘림) | v4 그대로 / → 카메라 멀리 / 제외 |
| S1 | 손 모양(손가락 길고 벌어짐) | → 짧고 둥글게 / 유지 / 더 크게 / 발로 복귀 |
| S2 | 오른쪽 날개 +20% | 사진 그대로 / → 왼쪽 크기로 / 왼쪽 뒤집어 사용 / 각도 재추정 |
| S3 | 정면 날개 위치(낮고 작음, 3/4 정면에서 오른쪽 날개가 막대처럼 보임) | → 보정 / 유지 |
| S4 | 몸통·옷 주름 정밀도 | 유지 / → 옷자락 개선 / 사진 추출 |
| S5 | 날개·천 움직임 | → 유지 / 천 / 날개 큰 동작 |
| L1 | 색 덩어리(dab) 질감 | → LOD 재시도 / 팔레트 / 보류 |
| L2 | 역광 쪽 흰 구멍 | → 고침 / 보류 |
| L3 | 밝기·대비 | → 밝은 대리석 / low-key / 둘 다 |
| L4 | 거상 픽셀 크기·기종 | → 9 / 6 / 12 / 다른 기종 |
| L5 | 배경화면 프레임 | → 두 손 다 땅 / 유지 |
| L6 | 거상 조명 | → 옆 노을 / 역광 / 둘 다 |
| O1 | 저장 위치 | → 작업 브랜치 / PR / 별도 repo |
| O2 | 모델 보관 | → repo 유지 / 제거 |
| O3 | tomcc 원문 확인 | 붙여넣기 / 네트워크 허용 / → 생략 |
| O4 | 렌더 속도 | → CPU / 최적화 / GPU |
| O5 | Opus(high) 10회 점검 | → 10회 / 5회 / 생략 |
| D1–D7 | 파기 승인 | §7 |

## 7. 자산 목록

**보존(채택 또는 필수)** — repo에 있음
- 코드 전체, `examples/nike/wings.npz`(사진에서 뽑은 날개), `models/nike_v4_60k.pt`(sha256 `b6b034e52bea890a…`)
- `docs/images/` 중 README가 쓰는 것, 카탈로그 artifact(샘플 영상 8개 + 손 이미지 포함)

**파기 후보 — 사용자 승인 전에는 지우지 않음** (이전 세션 컨테이너에만 있음; 새 컨테이너에는 애초에 없음)

| ID | 대상 | 크기 | 비고 |
|---|---|---|---|
| D1 | `out/nike` (v3 모델·영상) | 29MB | B1에서 v3를 고르면 보류 |
| D2 | `out/nike_colossus` (거상 v3) | 88MB | |
| D3 | scratchpad(시험 렌더, agent 중간 결과, gsplat·2DGS clone) | 818MB | 세션 종료 시 자동 소멸 |
| D4 | 내려받은 원본 사진(`tool-results/`) | 50MB | S2 재추정 시 다시 받아야 함 |
| D5 | 로컬 브랜치 `worktree-agent-aac6012330e4d0961` + `.claude/worktrees/` | — | 내용은 병합됨(`e5b6d35`). 원격에는 없음 |
| D6 | `docs/images/`의 옛 이미지 | <1MB | `nike_soft_vs_app.png`, `nike_side.png` 등 v3 시절 것. 데모 기사 2장은 README가 사용 중 |
| D7 | 이전 세션 자체 | — | 새 세션이 이 문서·카탈로그를 읽은 것 확인 후 |

최종 영상(거상 walk/orbit MP4, 배경화면 PNG, 스튜디오 GIF)은 대화에서 사용자에게 전달됨. 카탈로그에는 축소 샘플이 들어 있음.

## 8. 새 세션 시작 절차

1. 작업 브랜치 fetch → 새 세션의 지정 브랜치를 그 위에 올림(또는 merge). `pixel-splat/docs/HANDOFF.md`(이 문서) 정독.
2. 환경 구축(§5 2~3단계)과 테스트 27개 통과 확인.
3. 카탈로그 응답 읽기(§6). 미제출이면 그렇게 말하고 미결 표로 briefing.
4. **미결 briefing**: 응답된 것/안 된 것, 응답에 따라 바로 실행 가능한 작업과 순서.
5. **디버그 제안 — 가벼운 자체 점검 Opus(high) 10회**: 아래 10개 관점. 실행 전 사용자 승인(O5)을 받음. 각 agent는 **읽기 전용, 수정 금지, 근거(파일:줄·재현 명령)와 함께 발견만 보고**, 주 세션이 검증 후 목록화.

| # | 점검 관점 | 볼 곳 |
|---|---|---|
| 1 | rasterizer 정확성: binning overflow, hard/soft 경로, snap shift, ortho/persp | `raster.py`, `shade.py::patch_snap_shift` |
| 2 | 학습·손실: premultiply 일관성, 깊이 스케일, 학습 300 step의 충분성 | `train.py`, `gt.py` |
| 3 | G-buffer 정리: 2배 투표·despeckle가 snap·posed와 맞는지, 흰 구멍(L2) 원인 | `gbuffer.py`, `shade.py` |
| 4 | shadow map: bias·범위(extent 1.45)·posed splat, 걷는 동안 잘림 | `shadow.py`, `colossus.py` |
| 5 | skinning·걷기: 가중치 경계 늘어짐(다리 사이 hem 3×), 손 접지, loop 이음 | `nike.py`, `skin.py` |
| 6 | 날개 추출: 카메라 추정, 좌우 20% 차(S2), 3/4 정면 막대 문제(S3) | `wings.py`, `extract_wings.py` |
| 7 | 손 조형: 관절 비례·둥글기(S1), ground clip, 엄지 | `nike.py::hand_sdf` |
| 8 | 거상 장면: 지평선·사람 크기 수학, loop 주기(TILE=SPEED/2), 1178px 인코딩 | `colossus.py` |
| 9 | 문서 대 코드: README·ANALYSIS·LOOK의 수치·명령이 현재 코드와 맞는지, 낡은 서술 | `README.md`들, `docs/` |
| 10 | 테스트·재현성: 빠진 테스트(skin/shadow/wings/colossus), requirements, CLI 기본값 | `tests/`, `requirements.txt`, `cli.py` |

## 9. 알아 둘 함정 (이전 세션에서 실제로 겪은 것)

- **네트워크**: 샌드박스의 curl은 Wikimedia에서 429(요청 한도). `web-fetch` agent로 `https://commons.wikimedia.org/wiki/Special:FilePath/<파일명>`(**width 파라미터 없이**)을 받으면 원본이 `tool-results/`에 저장됨. `thumb.wikimedia.org`, x.com, louvre.fr, wikipedia.org는 차단.
- **scratchpad에 받은 파일이 사라질 수 있음**(한 번 겪음). 받은 직후 사용하거나 다시 받기.
- **메모리**: 아이폰 해상도 프레임을 메모리에 쌓으면 144프레임에서 OOM → 프레임을 디스크로 바로 쓰고 이어하기(`render_clip`)로 수정됨.
- **H.264는 짝수 폭**: 1179 → 1178px로 1px 자름. 배경화면 PNG는 1179 그대로.
- **tile overflow**: splat이 픽셀보다 작으면 tile당 K개 제한에 걸려 구멍. 추론 때는 K를 자동으로 늘림. 학습 로그의 `overflow 0.10` 정도는 정상 범위로 운용.
- **worktree agent**: 격리 worktree가 `master`(옛 커밋)에서 만들어져 프로젝트가 없었음 → agent에게 작업 브랜치 tip으로 reset 지시 필요.
- **CPU 4코어 공유**: 학습 중 다른 렌더를 돌리면 step당 2.9초 → 5.6초. 무거운 작업은 순차로.
- **`repaint.py`는 형태가 같을 때만 유효**. 조형을 바꾸면 sculpt → bake.
- **`nike.py animate`는 `<out>/nike_splats.pt`를 읽음**. 비교 렌더는 폴더를 따로 만들어 모델을 복사.
- 긴 백그라운드 작업은 로그 파일 + `until grep …` 대기. 포그라운드 대기는 10분 제한.
- agent가 붙인 사진 라벨을 믿지 말 것: Commons 분류명과 실제 시점이 달랐음(`우측 편향` 파일이 실제로는 정면-왼쪽).

## 10. 검증된 수치 (다시 재지 않아도 되는 것)

- 디딤발(손) 월드 위치 변화 0.0000(stance 구간), 지면 대비 +0.004/−0.002.
- 날개: 옆에서 본 길이 ≈ 몸 높이(목~발)의 0.54배. 정면에서 어깨 밖으로 ≈0.45. 원본으로 남은 날개는 왼쪽 하나, 오른쪽은 1880년대 석고 복원(검색 요약으로만 확인, 원문 미열람).
- APP: 자세 고정 0.3px 이동 시 변화 픽셀 44.6% → 28.4%. 회전에서는 이득 없음.
- 새 룩: 정지 화면 잡티·구멍 제거. 변화 픽셀은 pan 12.9% → 16.5%로 소폭 악화(`docs/LOOK.md`).
- 레퍼런스 대비: 밝기 중앙값 0.32 vs 우리 0.5, 채도 0.32 vs 0.26, 이웃 픽셀 차 0.039 vs 0.07~0.09.
- 학습: v4 60k·320px·300 step → loss 0.0338.

---
¹ **G-buffer**: 픽셀마다 색·표면 방향·거리·광택 같은 재료 정보를 따로 저장한 묶음. 조명은 나중에 이 정보로 계산합니다.
² **SDF**: "이 점이 표면에서 얼마나 떨어져 있나"를 계산하는 수식으로 형태를 정의하는 방법. 점토처럼 녹여 붙일 수 있습니다.
