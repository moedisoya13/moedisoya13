"""비교 차트 — bar / barh / grouped bar + annotation."""
import numpy as np
import matplotlib.pyplot as plt

plt.rcParams['font.family'] = 'Malgun Gothic'
plt.rcParams['axes.unicode_minus'] = False


def bar_with_max(labels, values, title='카테고리별 값 비교', highlight_max=True):
    """최대값 강조 막대그래프."""
    fig, ax = plt.subplots(figsize=(9, 6))
    colors = ['tomato' if (highlight_max and v == max(values)) else 'skyblue' for v in values]
    bars = ax.bar(labels, values, color=colors, edgecolor='navy')
    ax.set_title(title, fontsize=16, fontweight='bold')
    ax.grid(axis='y', ls=':', alpha=0.5)
    for b, v in zip(bars, values):
        ax.text(b.get_x() + b.get_width() / 2, v, f'{v:,.0f}',
                ha='center', va='bottom', fontsize=10)
    if highlight_max:
        i = values.index(max(values))
        ax.annotate('최대값', xy=(i, max(values)),
                    xytext=(i, max(values) * 1.15),
                    ha='center', color='red', fontweight='bold',
                    arrowprops=dict(arrowstyle='->', color='red'))
    plt.tight_layout()
    plt.show()


def grouped_bar(labels, group_values, group_names, title='그룹별 비교'):
    """그룹(카테고리 2개)화 막대그래프.

    labels: x축 카테고리 리스트
    group_values: [[group1 값...], [group2 값...], ...]
    group_names: 각 그룹 이름
    """
    x = np.arange(len(labels))
    width = 0.8 / len(group_values)
    fig, ax = plt.subplots(figsize=(10, 6))
    for i, (vals, name) in enumerate(zip(group_values, group_names)):
        offset = (i - (len(group_values) - 1) / 2) * width
        ax.bar(x + offset, vals, width, label=name)
    ax.set_xticks(x); ax.set_xticklabels(labels)
    ax.set_title(title, fontsize=16, fontweight='bold')
    ax.legend()
    ax.grid(axis='y', ls=':', alpha=0.5)
    plt.tight_layout()
    plt.show()


def horizontal_bar_sorted(labels, values, title='가로 막대 (정렬)'):
    """값 기준 정렬된 가로 막대그래프."""
    pairs = sorted(zip(values, labels))
    sorted_vals, sorted_labels = zip(*pairs)
    fig, ax = plt.subplots(figsize=(9, max(4, len(labels) * 0.4)))
    ax.barh(sorted_labels, sorted_vals, color='steelblue')
    ax.set_title(title, fontsize=16, fontweight='bold')
    ax.grid(axis='x', ls=':', alpha=0.5)
    plt.tight_layout()
    plt.show()
