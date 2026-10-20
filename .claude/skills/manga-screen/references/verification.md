# 검증 기록 (2026-10-20, 클라우드 세션)

## 환경

- ComfyUI `b1a247c`(2026-10-19 master), Python 3.13, torch 2.14.1(PyPI 기본 휠), `--cpu`, 4 vCPU
- ComfyUI-MangaScreen `d0eb8dc`(v0.2.1)를 README 대로 `custom_nodes/` 에 git clone,
  `pip install -r requirements.txt`(opencv-python 5.0.0) → 재시작 후
  `image/postprocessing` 에 Manga Levels / Manga Finish / Manga Panel 등록 확인
- 입력: 게시물에 실린 그레이스케일 원화를 스크린샷에서 잘라 낸 795×831 이미지
  (원본보다 해상도가 낮고 JPEG 압축이 있음. 저장소에는 넣지 않음)

## CLI ↔ ComfyUI 일치

같은 입력·값으로 ComfyUI API 에 노드 체인을 넣어 돌린 결과와 `scripts/manga_screen.py`
결과를 픽셀 단위로 비교했다. 체인: LoadImage → ImageScaleToTotalPixels(lanczos, 2MP, 32)
→ [MangaLevels 0.2/0.7/1.3] → MangaFinish(250, 0.8, 0.3, 0.18, 0.42, 1.0, 0.3, 0.4)
→ MangaPanel(original, 0.5, 0.4, 5, 60, white, 0.5) → SaveImage.

| 경로 | 크기 | 다른 픽셀 | 최대 차이 |
|---|---|---|---|
| gray(Levels 없음), Finish 출력 | 1408×1472 | 0 | 0 |
| gray, Panel 까지 | 1572×1636 | 0 | 0 |
| lite(Levels 있음), Finish 출력 | 1408×1472 | 0 | 0 |
| lite, Panel 까지 | 1572×1636 | 0 | 0 |

CLI 는 torch 없는 venv(numpy, opencv-python-headless, pillow)에서 돌렸다.

## 속도

- Manga Finish 단독, 1408×1472: 3.2–3.5 초(첫 호출 7.7 초)
- ComfyUI 전체 체인(로드·스케일·Finish·Panel·저장 2장): 6.5–10 초

## 민감도 (`--report`, 같은 입력)

| 경로 | 종이 | 옅은 톤 | 짙은 톤 | 베타 | white ±0.03 | black ±0.03 |
|---|---|---|---|---|---|---|
| gray | 36.2% | 41.4% | 18.1% | 4.3% | 8.4% / 16.0% | 3.5% / 4.5% |
| lite | 72.0% | 16.6% | 7.1% | 4.3% | 5.7% / 4.5% | 1.0% / 0.5% |

이 원화는 바닥 돌의 명암이 `white_point` 0.80 근처에 몰려 있어서, 0.03 만 올려도 화면의
16% 가 다른 면이 된다 — 게시물이 말한 "설정 감도가 높다" 의 실체.

게시물의 결과와 눈으로 비교하면 바지·가방이 베타이고 바닥에 흰 하이라이트가 더 많다.
`black_point` 0.40, `white_point` 0.75 언저리가 가깝고, 가방·촉수의 디테일 선은 펜 선을
얹은 것으로 보인다(정확한 값은 게시물에 없음).

## 텍스트 → 만화 (같은 날, 클라우드 세션)

- Figma AI `generate_image`(기본 모델, 1536×1024 요청): "Insufficient Figma AI credits" 로 거절.
  2026-11-01 초기화. 차감 없음.
- Figma Weave `weave_run_model`, Nano Banana 2.1(`fal-ai/nano-banana-2/edit`),
  `aspect_ratio` 3:2, `resolution` 2K, png: 견적 5 크레딧 → 사용자 승인 → 실행.
  1~2 분 뒤 COMPLETED, 2528×1696 PNG.
- 결과 URL `media.weavy.ai/...` 를 curl 로 받음(HTTP 200, 7.3MB). 채널 차이 평균 0.96 —
  거의 순수 흑백.
- `--report`: 종이 69.0% / 옅은 톤 7.0% / 짙은 톤 7.1% / 베타 17.0%, 최대 변동 3.5%(보통).
- 기본값 변환이 가장 나았다. `black_point` 0.40 은 밤 조명 원뿔만 좁아짐.
- 같은 세션에서 Figma 이미지 호스트 `s3-alpha-sig.figma.com`, `api.figma.com` 은 프록시가
  CONNECT 를 거절함(Figma AI 생성 결과를 받는 경로는 확인 못 함).

## 확인하지 못한 것

- 펜 선(comfyui_controlnet_aux 의 Manga Lineart): 모델이 HuggingFace 에 있는데 이 세션의
  네트워크 정책이 HuggingFace 를 막아 받지 못했다. 그래서 `Manga-Lite.json` 을 통째로
  돌리지는 못했고, 그 노드만 빼고 같은 체인을 돌렸다. 나머지 노드 타입(ImageScaleToTotalPixels,
  GetImageSize, ImageCompare, LoadImage, SaveImage)은 등록돼 있음을 확인.
- QWEN-Manga 워크플로우(편집 모델 필요), GPU 실행.
- 같은 캐릭터 연속 컷(앞 이미지를 Weave `images` 참조로 넘기기).
