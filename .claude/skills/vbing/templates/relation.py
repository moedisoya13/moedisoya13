"""관계·추이 차트 — scatter / lineplot / heatmap."""
import numpy as np
import matplotlib.pyplot as plt

plt.rcParams['font.family'] = 'Malgun Gothic'
plt.rcParams['axes.unicode_minus'] = False


def scatter_with_trend(x, y, title='산점도', xlabel='X', ylabel='Y'):
    """추세선 포함 산점도."""
    fig, ax = plt.subplots(figsize=(9, 6))
    ax.scatter(x, y, alpha=0.6, c='steelblue', edgecolors='w', s=60)
    z = np.polyfit(x, y, 1)
    xs = np.linspace(min(x), max(x), 100)
    ax.plot(xs, np.poly1d(z)(xs), 'r--', lw=2, label=f'추세선 y={z[0]:.2f}x+{z[1]:.2f}')
    ax.set_title(title, fontsize=16, fontweight='bold')
    ax.set_xlabel(xlabel); ax.set_ylabel(ylabel)
    ax.legend(); ax.grid(ls=':', alpha=0.5)
    plt.tight_layout(); plt.show()


def line_multi(x, y_dict, title='추이 비교', xlabel='시간', ylabel='값'):
    """여러 계열을 동일 축에 그리는 선그래프. y_dict = {'계열명': [values]}"""
    fig, ax = plt.subplots(figsize=(10, 6))
    for name, y in y_dict.items():
        ax.plot(x, y, marker='o', lw=2, label=name)
    ax.set_title(title, fontsize=16, fontweight='bold')
    ax.set_xlabel(xlabel); ax.set_ylabel(ylabel)
    ax.legend(); ax.grid(ls=':', alpha=0.5)
    plt.tight_layout(); plt.show()


def heatmap_matrix(matrix, row_labels, col_labels, title='히트맵', cmap='coolwarm'):
    """상관행렬/빈도행렬 히트맵 (seaborn 없이)."""
    fig, ax = plt.subplots(figsize=(max(6, len(col_labels) * 0.7), max(5, len(row_labels) * 0.5)))
    im = ax.imshow(matrix, cmap=cmap, aspect='auto')
    ax.set_xticks(range(len(col_labels))); ax.set_xticklabels(col_labels, rotation=45, ha='right')
    ax.set_yticks(range(len(row_labels))); ax.set_yticklabels(row_labels)
    for i in range(len(row_labels)):
        for j in range(len(col_labels)):
            ax.text(j, i, f'{matrix[i][j]:.2f}', ha='center', va='center', color='black')
    ax.set_title(title, fontsize=16, fontweight='bold')
    plt.colorbar(im, ax=ax)
    plt.tight_layout(); plt.show()
