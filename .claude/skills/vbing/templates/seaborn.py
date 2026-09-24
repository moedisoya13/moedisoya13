"""Seaborn 통합 템플릿 — bar / scatter / line / hist / kde / box / violin / joint / heatmap."""
import pandas as pd
import seaborn as sns
import matplotlib.pyplot as plt

plt.rcParams['font.family'] = 'Malgun Gothic'
plt.rcParams['axes.unicode_minus'] = False
sns.set_theme(style='whitegrid', palette='Set2')


def sns_bar(df, x, y, hue=None, title='Seaborn 막대그래프'):
    fig, ax = plt.subplots(figsize=(9, 6))
    sns.barplot(data=df, x=x, y=y, hue=hue, errorbar='sd', ax=ax)
    ax.set_title(title, fontsize=16, fontweight='bold')
    plt.tight_layout(); plt.show()


def sns_scatter(df, x, y, hue=None, size=None, style=None, title='Seaborn 산점도'):
    fig, ax = plt.subplots(figsize=(9, 6))
    sns.scatterplot(data=df, x=x, y=y, hue=hue, size=size, style=style, alpha=0.8, ax=ax)
    ax.set_title(title, fontsize=16, fontweight='bold')
    plt.tight_layout(); plt.show()


def sns_line(df, x, y, hue=None, title='Seaborn 선그래프'):
    fig, ax = plt.subplots(figsize=(10, 6))
    sns.lineplot(data=df, x=x, y=y, hue=hue, markers=True, errorbar='ci', ax=ax)
    ax.set_title(title, fontsize=16, fontweight='bold')
    plt.tight_layout(); plt.show()


def sns_hist(df, x, hue=None, bins=30, kde=True, title='분포'):
    fig, ax = plt.subplots(figsize=(9, 6))
    sns.histplot(data=df, x=x, hue=hue, bins=bins, kde=kde, ax=ax)
    ax.set_title(title, fontsize=16, fontweight='bold')
    plt.tight_layout(); plt.show()


def sns_box(df, x, y, hue=None, title='박스플롯'):
    fig, ax = plt.subplots(figsize=(9, 6))
    sns.boxplot(data=df, x=x, y=y, hue=hue, ax=ax)
    ax.set_title(title, fontsize=16, fontweight='bold')
    plt.tight_layout(); plt.show()


def sns_violin(df, x, y, hue=None, split=False, title='바이올린플롯'):
    fig, ax = plt.subplots(figsize=(9, 6))
    sns.violinplot(data=df, x=x, y=y, hue=hue, split=split, inner='quartile', ax=ax)
    ax.set_title(title, fontsize=16, fontweight='bold')
    plt.tight_layout(); plt.show()


def sns_joint(df, x, y, kind='reg'):
    """kind: scatter, kde, hist, hex, reg, resid"""
    g = sns.jointplot(data=df, x=x, y=y, kind=kind, height=7)
    plt.tight_layout(); plt.show()


def sns_heatmap_corr(df, title='상관 히트맵'):
    corr = df.corr(numeric_only=True)
    fig, ax = plt.subplots(figsize=(max(6, len(corr) * 0.8), max(5, len(corr) * 0.7)))
    sns.heatmap(corr, annot=True, fmt='.2f', cmap='coolwarm', center=0, ax=ax,
                square=True, linewidths=0.5)
    ax.set_title(title, fontsize=16, fontweight='bold')
    plt.tight_layout(); plt.show()


def sns_pair(df, hue=None):
    sns.pairplot(df, hue=hue, diag_kind='kde', corner=True)
    plt.show()
