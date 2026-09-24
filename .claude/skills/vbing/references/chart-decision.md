# 차트 결정 트리

사용자 의도와 변수 구성으로 차트 타입을 결정합니다.

## 1단계 — 목적 분류

| 사용자 표현 | 목적 카테고리 |
|---|---|
| "비교", "크기", "순위", "A vs B" | **비교 (Comparison)** |
| "관계", "상관", "분포", "A와 B" | **관계 (Relation)** |
| "분포", "빈도", "퍼짐", "통계" | **분포 (Distribution)** |
| "비율", "점유율", "구성" | **구성 (Composition)** |
| "추이", "시간", "변화", "트렌드" | **추이 (Trend)** |

## 2단계 — 변수 구성 × 목적 → 차트

### 비교 (Comparison)
| 변수 구성 | 권장 | 치트시트 |
|---|---|---|
| 카테고리 1개 + 값 1개 | `plt.bar` / `plt.barh` | Ch 4-1 |
| 카테고리 2개 (그룹화) | `sns.barplot(hue=)` | Ch 7-1 |
| 카테고리 + 평균값 (CI 필요) | `sns.barplot` (기본 errorbar 있음) | Ch 7-1 |

### 관계 (Relation)
| 변수 구성 | 권장 | 치트시트 |
|---|---|---|
| 수치 2개 | `plt.scatter` / `sns.scatterplot` | Ch 4-2, 7-2 |
| 수치 2개 + 그룹 | `sns.scatterplot(hue=, style=)` | Ch 7-2 |
| 수치 2개 + 크기 | `sns.scatterplot(size=)` | Ch 7-2 |
| 행렬(N×N) 상관 | `sns.heatmap` | Ch 4-3 |

### 분포 (Distribution)
| 변수 구성 | 권장 | 치트시트 |
|---|---|---|
| 수치 1개 | `plt.hist` / `sns.histplot` | Ch 5-1, 7-4 |
| 수치 1개 + 밀도 | `sns.kdeplot` / `sns.displot(kind='kde')` | Ch 7-4 |
| 수치 1개 + 카테고리 | `plt.boxplot` / `sns.boxplot` | Ch 5-2 |
| 분포 모양 강조 | `plt.violinplot` / `sns.violinplot` | Ch 5-3 |
| 2변수 결합 분포 | `sns.jointplot` | Ch 7-4 |

### 구성 (Composition)
| 변수 구성 | 권장 | 치트시트 |
|---|---|---|
| 카테고리 비율 (≤6개) | `plt.pie` | Ch 5-4 |
| 카테고리 비율 (>6개) | `plt.barh` (pie 대신) | Ch 4-1 |

### 추이 (Trend)
| 변수 구성 | 권장 | 치트시트 |
|---|---|---|
| 시간 + 수치 1개 | `plt.plot` | Ch 1-2 |
| 시간 + 수치 + 그룹 | `sns.lineplot(hue=)` | Ch 7-3 |
| 시간 + 수치 (CI) | `sns.lineplot` (errorbar='ci') | Ch 7-3 |

## 3단계 — 강조 요소 매핑

사용자가 "강조"를 언급하면 다음 요소 추가:

| 요청 | 기법 | 치트시트 |
|---|---|---|
| "최대값 표시" | `plt.annotate` + 화살표 | Ch 6-4 |
| "평균선" | `plt.axhline` | Ch 6-3 |
| "특정 구간 강조" | `plt.axvspan` / `fill_between` | Ch 6-2 |
| "이상치" | boxplot (자동) / scatter (색상 구분) | Ch 5-2 |
| "이중 y축" | `ax.twinx()` | Ch 6-5 |

## 4단계 — 서브플롯 결정

- 차트 1개면 단일 figure
- 사용자가 "여러 개", "나란히", "비교 뷰" 언급 → `plt.subplots(rows, cols)` (Ch 3-3)
- 서로 다른 크기/위치 → `fig.add_axes([x,y,w,h])` (Ch 3-2)
