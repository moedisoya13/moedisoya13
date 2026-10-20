---
name: manga-screen
description: 'Turns an illustration into a clean black-and-white manga page (crisp
  lines, four flat tone areas, real 45° screentone, white lines cut into solid black,
  panel frame) with ashukae/ComfyUI-MangaScreen, best on images generated in grayscale
  from the start. Use when the user wants 만화풍 / 흑백 원고 / 망점 / 스크린톤 / 톤 처리 /
  manga, comic B&W, halftone or screentone conversion of an image; asks to install,
  explain or tune ComfyUI-MangaScreen or its nodes (Manga Finish, Manga Levels, Manga
  Panel); or wants one fixed manga look applied across a series of generated images.
  Runs headless without ComfyUI or torch (numpy + OpenCV only).'
---

# Manga Screen

[ComfyUI-MangaScreen](https://github.com/ashukae/ComfyUI-MangaScreen)(MIT, ashukae)으로
일러스트를 인쇄된 흑백 만화 원고로 바꾼다. 선은 선명한 검정으로 분리하고, 명암은
**종이 / 옅은 톤 / 짙은 톤 / 베타** 네 면으로 정리하고, 페이지 전체에 45° 망점 하나만
찍는다. 일반 하프톤 필터처럼 모든 회색을 점으로 바꾸지 않는다.

## 핵심 기법 — 그레이스케일 원화 + 고정 워크플로우

출처: @imaginaldomain 의 X 게시물(2026-10-18, @renrenrenz5cq 가 공유한 이 저장소 인용).
"처음부터 그레이스케일로 생성하면 톤 정밀도가 좋다. 설정 감도가 높으니 원화를 안정시키고
WF 를 고정해서 쓰면 좋겠다. 그리고 엄청 빠르다."

1. **처음부터 그레이스케일로 생성한다.** Manga Finish 는 밝기만 보고 네 면을 나눈다.
   컬러를 나중에 흑백으로 바꾸면 빨간 옷과 빨간 리본, 홍조와 피부처럼 의미는 다른데
   밝기가 같은 색이 한 면으로 뭉개진다(README 가 Manga-Lite 의 한계로 든 것). 생성 단계에서
   흑백으로 뽑으면 모델이 명암을 '의미로' 이미 정해 주므로, QWEN 편집 단계 없이도 그
   효과를 얻는다. 그래서 이 경로에선 **Manga Levels 를 쓰지 않는다**(프리셋 `gray`).
   생성 프롬프트에 `monochrome, greyscale, manga, lineart, ink` 류를 넣고, 가능하면
   흰 피부·흰 옷은 밝게, 어두운 옷·머리는 확실히 어둡게 나오도록 한다.
2. **설정 감도가 높다 → 원화를 안정시키고 값은 고정한다.** 네 면은 문턱값으로 갈리므로
   명암이 문턱 근처에 몰린 그림은 값을 조금만 움직여도 넓은 면이 통째로 바뀐다.
   실측(그 게시물의 원화): `white_point` +0.03 → 화면의 **16%** 가 다른 면으로 바뀜.
   그러니 생성 레시피(모델·LoRA·프롬프트 문체·조명)를 먼저 고정하고, 대표 컷 하나로
   값을 맞춘 뒤 저장해서 시리즈 전체에 그대로 쓴다(`--save-params` → `--params`).
   매 컷마다 값을 만지면 컷끼리 톤이 달라진다.
3. **빠르다.** 모델 없이 OpenCV 연산뿐이다. 2MP 한 장이 CPU 에서 수 초.
   (QWEN-Manga 워크플로우의 느린 부분은 편집 모델이고, Finish 자체는 가볍다.)

## 빠른 사용 (ComfyUI 없이)

```bash
pip install numpy opencv-python-headless pillow     # torch 불필요
S=.claude/skills/manga-screen/scripts/manga_screen.py

python3 $S gen.png --compare                 # → manga-out/gen_manga.png, gen_compare.png
python3 $S gen.png --report                  # 톤 면적 + 문턱값 ±0.03 민감도만 출력
python3 $S key.png --black-point 0.40 --save-params series.json   # 대표 컷으로 맞추고 저장
python3 $S frames/*.png --params series.json -o out/              # 같은 값으로 일괄 적용
python3 $S color.png --preset lite           # 컬러 원화: Manga Levels(0.2/0.7/1.3) 먼저
python3 $S gen.png --pen lines.png           # 펜 선 맵(흰 선/검은 바탕)을 위에 얹기
python3 $S gen.png --no-panel                # 테두리·여백·잉크 질감 없이 순수 2값
```

첫 실행 때 노드 소스를 고정 커밋(`d0eb8dc`, v0.2.1)으로 `~/.cache/manga-screen/` 에
받아 두고, 그 안의 함수를 그대로 부른다(알고리즘 재구현 없음). 데스크톱에 이미
체크아웃이 있으면 `--src ComfyUI/custom_nodes/ComfyUI-MangaScreen`.

처리 순서와 기본값은 저장소의 `workflows/Manga-Lite.json` 과 같다:
작업 크기 2MP(lanczos, 32 배수) → [Manga Levels] → Manga Finish → Manga Panel(original).
작업 크기를 바꾸지 않으려면 `--megapixels 0` 이고, 그때는 망점 하나가 5px 이상이
되도록 `--screen-lines` 를 폭/5 이하로 낮춘다.

결과는 꼭 열어서 확인한다. 같은 값이라도 원화가 바뀌면 면이 크게 바뀐다(위 2번).

## 파라미터 — 맞추는 순서

| 순서 | 값 | 기본 | 움직이는 법 |
|---|---|---|---|
| 1 | `black_point` | 0.30 | 어두운 옷·머리를 베타로 보내려면 0.40, 더 과감히 0.5–0.6. 올리면 벽 윗부분 같은 그늘도 같이 베타가 되니 그 전에 멈춘다 |
| 2 | `white_point` | 0.80 | 낮추면 종이가 늘고 톤이 줄어든다(피부·밝은 바닥). **가장 민감한 값** — 0.02–0.03 단위로 |
| 3 | `light_tone` / `dark_tone` | 0.18 / 0.42 | 두 평면 톤의 망점 면적 |
| 4 | `gradation` | 1.0 | 매끈한 그림자를 계단 대신 그라데이션 톤으로. 0 = 평면만 |
| 5 | `white_lines` | 0.4 | 베타 안 주름·솔기를 흰 선으로. 0 = 끔 |
| - | `screen_lines` | 250 | 폭 방향 망점 줄 수. 120 굵게, 200 보통(README), 250 워크플로우 값, 300 곱게 |
| - | `pen_threshold` | 0.30 | 펜 선 맵이 있을 때만. 낮출수록 선이 많이 얹힌다 |
| - | 패널: `panel` `crop_x/y` `border` `margin` `paper` `ink` | original, 0.5/0.4, 5, 60, white, 0.5 | `--panel '4:3 wide'` 등으로 컷 모양. `ink 0` = 순수 흑백 |

`--report` 의 '변동' 은 각 문턱값을 ±0.03 움직였을 때 면이 바뀌는 픽셀 비율이다.
판정(안정 < 3% ≤ 보통 < 8% ≤ 민감)은 대략의 기준이다. 민감하게 나오면 값을 만지기보다
원화 명암(생성 레시피)을 먼저 고친다.

## ComfyUI 에 소스로 설치 (데스크톱)

```bash
cd ComfyUI/custom_nodes
git clone https://github.com/ashukae/ComfyUI-MangaScreen
pip install -r ComfyUI-MangaScreen/requirements.txt   # opencv-python, numpy (보통 이미 있음)
# 펜 선(선택): Manga Lineart 노드. 모델(erika.pth)은 첫 실행 때 HuggingFace 에서 받는다
git clone https://github.com/Fannovel16/comfyui_controlnet_aux
pip install -r comfyui_controlnet_aux/requirements.txt
# ComfyUI 재시작 → image/postprocessing 에 Manga Levels / Manga Finish / Manga Panel
```

- **그레이스케일 원화 기법**: `workflows/Manga-Lite.json` 을 끌어다 놓고 *Manga Levels*
  노드를 bypass(Ctrl+B) 하거나 값을 black 0 / white 1 / gamma 1 로 둔다(그러면 흑백 변환만
  한다). 대표 컷으로 Finish 값을 맞춘 뒤 워크플로우를 저장해 고정한다.
- **컬러 원화**: `QWEN-Manga.json`(Qwen-Image 2.1 Turbo 편집 → Finish, 모델 3개 필요)
  또는 모델 없는 `Manga-Lite.json`.
- 워크플로우 작업 크기는 2MP 다. 더 작게 돌리면 `screen_lines` 를 낮춘다.

## 알아 둘 것

- **업스트림 버그(v0.2.1)**: Manga Panel 의 `border` 가 0(또는 작은 그림에서 `border × 폭/1024`
  가 0 으로 반올림)이면 `p[-0:]` 이 배열 전체라 **컷 전체가 검게** 칠해진다. ComfyUI 에서는
  border ≥ 1 로 둘 것. 이 스킬의 CLI 는 우회해서 처리한다.
- 펜 선(Manga Lineart)은 HuggingFace 모델이 필요해 클라우드 세션(HF 차단)에선 못 만든다.
  데스크톱에서 만든 선 맵을 `--pen` 으로 넘기면 된다. 게시물 결과의 가방·촉수 디테일 선은
  펜 선을 얹은 것으로 보인다.
- 칠해진(페인팅) 배경은 얼룩이 된다. 배경도 선화 위주로 생성하거나, 컬러면 QWEN 경로.
- 검증: 같은 입력·값으로 실제 ComfyUI(CPU)에서 돌린 노드 체인과 이 CLI 의 출력이
  gray·lite, Panel 유무 네 경우 모두 **픽셀 단위로 같았다**. 2MP Finish 는 4 vCPU 에서 약 3 초.
  자세한 기록과 확인 못 한 것은 `references/verification.md`.
