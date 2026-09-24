"""분포 차트 — hist / box / violin / pie."""
import numpy as np
import matplotlib.pyplot as plt

plt.rcParams['font.family'] = 'Malgun Gothic'
plt.rcParams['axes.unicode_minus'] = False


def hist_with_mean(data, bins=30, title='히스토그램', xlabel='값'):
    fig, ax = plt.subplots(figsize=(9, 6))
    ax.hist(data, bins=bins, color='steelblue', edgecolor='white', alpha=0.8)
    mean_v = np.mean(data)
    ax.axvline(mean_v, color='red', ls='--', lw=2, label=f'평균: {mean_v:.2f}')
    ax.set_title(title, fontsize=16, fontweight='bold')
    ax.set_xlabel(xlabel); ax.set_ylabel('빈도')
    ax.legend(); ax.grid(axis='y', ls=':', alpha=0.5)
    plt.tight_layout(); plt.show()


def box_multi(datasets, labels, title='박스플롯'):
    fig, ax = plt.subplots(figsize=(9, 6))
    bp = ax.boxplot(datasets, labels=labels, patch_artist=True,
                    medianprops=dict(color='red', lw=2))
    for patch, color in zip(bp['boxes'], plt.cm.Set2.colors):
        patch.set_facecolor(color)
    ax.set_title(title, fontsize=16, fontweight='bold')
    ax.grid(axis='y', ls=':', alpha=0.5)
    plt.tight_layout(); plt.show()


def violin_multi(datasets, labels, title='바이올린플롯'):
    fig, ax = plt.subplots(figsize=(9, 6))
    ax.violinplot(datasets, showmeans=True, showmedians=True)
    ax.set_xticks(range(1, len(labels) + 1))
    ax.set_xticklabels(labels)
    ax.set_title(title, fontsize=16, fontweight='bold')
    ax.grid(axis='y', ls=':', alpha=0.5)
    plt.tight_layout(); plt.show()


def pie_with_explode(values, labels, title='구성비', explode_max=True):
    explode = [0.1 if (explode_max and v == max(values)) else 0 for v in values]
    fig, ax = plt.subplots(figsize=(8, 8))
    ax.pie(values, labels=labels, autopct='%1.1f%%',
           startangle=90, colors=plt.cm.Pastel1.colors,
           explode=explode, shadow=True)
    ax.set_title(title, fontsize=16, fontweight='bold')
    ax.axis('equal')
    plt.tight_layout(); plt.show()
