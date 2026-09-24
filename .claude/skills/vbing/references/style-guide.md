# 스타일 가이드 (Ch 2·Ch 6 요약)

## 한글폰트 (필수)

```python
import matplotlib.pyplot as plt
plt.rcParams['font.family'] = 'Malgun Gothic'   # Windows
# plt.rcParams['font.family'] = 'AppleGothic'    # macOS
plt.rcParams['axes.unicode_minus'] = False      # 마이너스 깨짐 방지
```

## 색상

- 단일 지정: `color='skyblue'`, `color='#A566FF'`, 약자 `'r'`, `'g'`, `'b'`, `'k'` 등
- 팔레트 (seaborn): `palette='Set2'`, `'pastel'`, `'viridis'`, `'coolwarm'`
- 투명도: `alpha=0.5`

## 마커 / 선

```python
plt.plot(x, y,
    color='#A566FF',
    marker='D', ms=10, mec='b', mew=3, mfc='y',
    ls=':', lw=3)
```

- marker: `* . , o v ^ < > s p h H + x D d`
- ls: `'-'` solid, `'--'` dashed, `'-.'` dash-dot, `':'` dotted
- 단축형: `plt.plot(x, y, 'g*:', ms=10, mec='r', mfc='k', lw=3)`

## 제목 / 축 / 그리드

```python
plt.title('제목', loc='center', pad=10, color='r', fontsize=20, fontweight='bold')
plt.xlabel('X축', loc='right', labelpad=10, fontsize=12)
plt.ylabel('Y축', loc='top', labelpad=10, fontsize=12)
plt.grid(True, axis='y', color='skyblue', alpha=0.5, ls=':')
```

## 축 범위 / 눈금

```python
plt.xlim(1, 12); plt.ylim(0, 100)
plt.xticks(range(0, 14, 1), labels=['1월','2월', ...])
plt.tick_params(direction='out', length=6, width=2, color='k', labelcolor='b')
```

## 범례

```python
plt.legend(loc='upper right', fontsize=10, frameon=True, shadow=True, ncol=2)
# loc: 'best', 'upper/lower left/right', 'center'
```

## 강조 (Ch 6)

### 영역 채우기
```python
plt.fill_between(x, y1, y2, alpha=0.3, color='skyblue')
plt.axvspan(xmin, xmax, alpha=0.3, color='yellow')  # 수직 영역
plt.axhspan(ymin, ymax, alpha=0.3, color='pink')    # 수평 영역
```

### 수직·수평선
```python
plt.axhline(y=mean_val, color='r', ls='--', lw=2, label='평균')
plt.axvline(x=peak_x, color='g', ls=':', lw=2)
```

### 텍스트 / annotation
```python
plt.text(x, y, '메모', fontsize=12, color='b', ha='center')
plt.annotate('최대값', xy=(x_max, y_max), xytext=(x_max+1, y_max+5),
             arrowprops=dict(arrowstyle='->', color='r'))
```

### 이중 Y축
```python
fig, ax1 = plt.subplots()
ax2 = ax1.twinx()
ax1.plot(x, y1, 'b-'); ax1.set_ylabel('Y1', color='b')
ax2.plot(x, y2, 'r-'); ax2.set_ylabel('Y2', color='r')
```

## 공통 rc 설정

```python
plt.rcParams.update({
    'font.family': 'Malgun Gothic',
    'axes.unicode_minus': False,
    'figure.figsize': (10, 6),
    'axes.grid': True,
    'grid.alpha': 0.3,
    'axes.titlesize': 16,
    'axes.labelsize': 12,
})
```
