# Seaborn 빠른 참조 (Ch 7)

```python
import seaborn as sns
import matplotlib.pyplot as plt
plt.rcParams['font.family'] = 'Malgun Gothic'
plt.rcParams['axes.unicode_minus'] = False
sns.set_theme(style='whitegrid')   # darkgrid, white, dark, ticks
```

## barplot (Ch 7-1)
```python
sns.barplot(data=df, x='day', y='total_bill',
            hue='sex', palette='Set2',
            errorbar='sd')          # 또는 'ci', None
```
- 자동 평균 + 신뢰구간. `estimator=np.median` 등으로 집계 방식 변경 가능.

## scatterplot (Ch 7-2)
```python
sns.scatterplot(data=df, x='total_bill', y='tip',
                hue='day', style='time', size='size',
                palette='deep', alpha=0.8)
```

## lineplot (Ch 7-3)
```python
sns.lineplot(data=df, x='year', y='sales',
             hue='region', style='region',
             markers=True, dashes=False,
             errorbar='ci')
```

## 분포 그래프 (Ch 7-4)

### histplot
```python
sns.histplot(data=df, x='tip', bins=20, kde=True, hue='sex')
```

### kdeplot
```python
sns.kdeplot(data=df, x='tip', hue='sex', fill=True, common_norm=False)
```

### displot (figure-level)
```python
sns.displot(data=df, x='tip', col='sex', row='time', kind='hist')
```

### boxplot / violinplot
```python
sns.boxplot(data=df, x='day', y='total_bill', hue='sex', palette='pastel')
sns.violinplot(data=df, x='day', y='total_bill', hue='sex', split=True, inner='quartile')
```

### jointplot (2변수 결합)
```python
sns.jointplot(data=df, x='total_bill', y='tip', kind='reg')
# kind: scatter, kde, hist, hex, reg, resid
```

### pairplot (다변수 매트릭스)
```python
sns.pairplot(df, hue='species', diag_kind='kde')
```

### heatmap
```python
corr = df.corr(numeric_only=True)
sns.heatmap(corr, annot=True, fmt='.2f', cmap='coolwarm', center=0)
```

## 팔레트 치트
- 순차: `Blues`, `Greens`, `viridis`, `rocket`
- 범주: `Set1`, `Set2`, `Set3`, `pastel`, `deep`, `muted`
- 발산: `coolwarm`, `RdBu_r`, `vlag`
