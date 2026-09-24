"""기본 차트 스니펫 모음 — matplotlib 전용.

모든 스니펫은 한글폰트 기본 포함, 즉시 실행 가능.
사용자 변수에 맞춰 x/y/labels만 교체하면 됨.
"""
import matplotlib.pyplot as plt

plt.rcParams['font.family'] = 'Malgun Gothic'
plt.rcParams['axes.unicode_minus'] = False


# 선 그래프
def line(x, y, title='선 그래프', xlabel='X', ylabel='Y'):
    plt.figure(figsize=(8, 5))
    plt.plot(x, y, 'bo-', mfc='r', mec='r', lw=2)
    plt.title(title); plt.xlabel(xlabel); plt.ylabel(ylabel)
    plt.grid(ls=':', alpha=0.5)
    plt.show()


# 막대 그래프
def bar(labels, values, title='막대 그래프', horizontal=False):
    plt.figure(figsize=(8, 5))
    if horizontal:
        plt.barh(labels, values, color='skyblue', edgecolor='navy')
    else:
        plt.bar(labels, values, color='skyblue', edgecolor='navy')
    plt.title(title)
    plt.grid(axis='y' if not horizontal else 'x', ls=':', alpha=0.5)
    plt.show()


# 파이차트
def pie(values, labels, title='파이차트'):
    plt.figure(figsize=(7, 7))
    plt.pie(values, labels=labels, autopct='%1.1f%%',
            startangle=90, colors=plt.cm.Set2.colors)
    plt.title(title)
    plt.axis('equal')
    plt.show()


# 히스토그램
def hist(data, bins=30, title='히스토그램', xlabel='값'):
    plt.figure(figsize=(8, 5))
    plt.hist(data, bins=bins, color='steelblue', edgecolor='white', alpha=0.8)
    plt.title(title); plt.xlabel(xlabel); plt.ylabel('빈도')
    plt.grid(axis='y', ls=':', alpha=0.5)
    plt.show()


# 박스플롯
def box(data, labels=None, title='박스플롯'):
    plt.figure(figsize=(8, 5))
    plt.boxplot(data, labels=labels, patch_artist=True,
                boxprops=dict(facecolor='lightblue'))
    plt.title(title)
    plt.grid(axis='y', ls=':', alpha=0.5)
    plt.show()


# 바이올린플롯
def violin(data, labels=None, title='바이올린플롯'):
    plt.figure(figsize=(8, 5))
    parts = plt.violinplot(data, showmeans=True, showmedians=True)
    if labels:
        plt.xticks(range(1, len(labels) + 1), labels)
    plt.title(title)
    plt.grid(axis='y', ls=':', alpha=0.5)
    plt.show()


# 산점도
def scatter(x, y, title='산점도', xlabel='X', ylabel='Y', c=None):
    plt.figure(figsize=(8, 5))
    plt.scatter(x, y, c=c, cmap='viridis', alpha=0.7, edgecolors='w')
    plt.title(title); plt.xlabel(xlabel); plt.ylabel(ylabel)
    if c is not None:
        plt.colorbar()
    plt.grid(ls=':', alpha=0.5)
    plt.show()
