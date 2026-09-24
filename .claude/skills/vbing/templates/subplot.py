"""서브플롯 패턴 — Ch 3."""
import matplotlib.pyplot as plt

plt.rcParams['font.family'] = 'Malgun Gothic'
plt.rcParams['axes.unicode_minus'] = False


def grid_subplots(plot_fns, titles, rows, cols, figsize=None, suptitle=None):
    """여러 차트를 격자로 배치.

    plot_fns: [lambda ax: ax.plot(...), ...] 형태의 플로팅 함수 리스트
    titles: 각 서브플롯 제목
    """
    figsize = figsize or (cols * 5, rows * 4)
    fig, axes = plt.subplots(rows, cols, figsize=figsize)
    axes = axes.flatten() if rows * cols > 1 else [axes]
    for ax, fn, title in zip(axes, plot_fns, titles):
        fn(ax)
        ax.set_title(title)
        ax.grid(ls=':', alpha=0.5)
    for ax in axes[len(plot_fns):]:
        ax.axis('off')
    if suptitle:
        fig.suptitle(suptitle, fontsize=18, fontweight='bold')
    plt.tight_layout()
    plt.show()


def mixed_layout_example():
    """add_axes를 사용한 자유 배치 예시."""
    fig = plt.figure(figsize=(10, 7))
    ax1 = fig.add_axes([0.1, 0.55, 0.8, 0.35])  # 상단 전체
    ax2 = fig.add_axes([0.1, 0.1, 0.35, 0.35])  # 하단 좌
    ax3 = fig.add_axes([0.55, 0.1, 0.35, 0.35]) # 하단 우
    return fig, (ax1, ax2, ax3)
