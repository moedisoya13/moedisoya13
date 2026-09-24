---
name: vbing
description: Use when the user wants to visualize data with matplotlib or seaborn — covers all chart types (bar, scatter, line, hist, box, violin, pie, heatmap, subplots), Korean font setup, and end-to-end flow from data intake through hybrid interview to executable Python code. Triggers on keywords like 시각화, 그래프, 차트, 플롯, 막대그래프, 산점도, 히스토그램, 박스플롯, 파이차트, 히트맵, visualize, chart, plot, matplotlib, seaborn.
---

# vbing — Data Visualization Interview Skill

해커톤용 데이터 시각화 자동화 Skill. 사용자 요청을 받아 **인터뷰 → 차트 결정 → 실행 가능한 파이썬 코드 생성**까지 6단계로 처리합니다.

## When to Use

다음 키워드가 감지되면 즉시 활성화:
- **한국어**: 시각화, 그래프, 차트, 플롯, 막대그래프, 산점도, 히스토그램, 박스플롯, 바이올린, 파이차트, 히트맵, 서브플롯
- **영어**: visualize, chart, plot, graph, matplotlib, seaborn, bar chart, scatter, histogram, boxplot

## Core Workflow (6 Steps)

### Step 1 — Data Intake
사용자 메시지에서 데이터 소스 감지.

- **파일 경로 有** (`.csv`, `.xlsx`, `.json`) → `scripts/data-loader.md` 참조하여 pandas 로드
  ```python
  import pandas as pd
  df = pd.read_csv(path)  # 또는 read_excel / read_json
  print(df.head()); print(df.dtypes)
  ```
- **인라인 값 有** (예: `[A:30, B:25]`) → 딕셔너리/리스트로 직접 파싱
- **데이터 無** → Step 3에서 데이터 질문 추가

### Step 2 — Free-form Parse
사용자 서술에서 다음 4개 슬롯을 추출 시도. 한 번의 파싱으로 채워진 슬롯은 **질문하지 않음**.

| 슬롯 | 예시 값 |
|---|---|
| 목적 | 비교 / 관계 / 분포 / 구성 / 추이 |
| 축·변수 | x축, y축, 그룹(hue) |
| 강조 | 최대값, 평균선, 이상치, annotation |
| 스타일 | 한글폰트, 색상, 다크테마, 범례 위치 |

### Step 3 — Clarify Missing (Hybrid)
**비어 있는 슬롯만** `AskUserQuestion`으로 최소 질문. 모든 슬롯이 채워졌으면 0개 질문.

### Step 4 — Chart Decision
`references/chart-decision.md` 로드하여 목적 + 변수 조합으로 차트 타입 확정.

### Step 5 — Code Generation
`templates/` 에서 해당 차트 스니펫 로드 → 사용자 변수로 채워 출력. 항상 **한글폰트 설정 포함**.

템플릿 인덱스:
- `templates/basic.py` — plot/bar/hist/scatter/box/violin/pie 기본형
- `templates/styled.py` — 제목·축·그리드·범례 완성형
- `templates/subplot.py` — subplots / add_subplot 패턴
- `templates/comparison.py` — bar / barh / grouped
- `templates/distribution.py` — hist / box / violin / pie
- `templates/relation.py` — scatter / heatmap / lineplot
- `templates/seaborn.py` — barplot / scatterplot / lineplot / histplot / kdeplot / jointplot

### Step 6 — Render & Verify
코드 실행 후 이미지 확인. 스타일 이슈 있으면 `references/style-guide.md` 참조하여 조정.

## References (Lazy Load)

필요할 때만 로드:
- `references/cheatsheet.md` — Chapter 1~11 전체 치트시트 원본
- `references/chart-decision.md` — 목적→차트 결정 트리
- `references/style-guide.md` — 한글폰트·색상·마커·제목·축·그리드·annotation
- `references/seaborn-quick.md` — seaborn 핵심 7개 함수

## Scripts
- `scripts/interview-protocol.md` — 하이브리드 인터뷰 질문 스크립트
- `scripts/data-loader.md` — CSV/Excel/JSON 로드 패턴 + 인코딩 이슈 대응

## Hard Rules

1. **한글폰트 기본 포함**: 모든 생성 코드에 `plt.rcParams['font.family'] = 'Malgun Gothic'`, `plt.rcParams['axes.unicode_minus'] = False`
2. **즉시 실행 가능**: import 문 포함, 하드코딩된 임의 경로 금지
3. **최소 질문**: Step 2에서 채워진 슬롯은 재질문 금지
4. **치트시트 우선**: 명령어/옵션 불확실 시 `references/cheatsheet.md` 재조회 후 답변
