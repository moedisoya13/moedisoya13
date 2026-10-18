"""대리점 색 배정 — 10색으로 26곳 이상을 구분하는 방법.

지도 위에서 사람이 확실히 구분할 수 있는 범주색은 많아야 10개 안팎이다. 그래서 대리점마다 고유색을 주는 대신,
**영업권이 겹치거나 맞닿은 대리점끼리는 서로 잘 구분되는 색**이 되도록 배정한다(지도 채색 문제).
멀리 떨어진 대리점은 같은 색을 써도 혼동되지 않는다. 색만으로 식별하지 않도록 대리점 배지에는 이니셜,
목록에는 이름이 항상 함께 나오고, 대리점에 포인터를 올리면 나머지가 흐려진다(보조 표기).

팔레트(web/tokens.css 의 --h0 … --h9)는 OKLCH 색상환을 10등분하고 명도를 번갈아 두어 만들었고,
dataviz 스킬 validate_palette.js 로 검증했다(라이트: 명도대·채도 하한·정상 시각 전 쌍 ΔE≥15 통과,
다크: 명도대 0.48–0.67·채도·정상 시각 통과). 색각이상 시뮬레이션의 전 쌍 분리는 10색으로는 불가능하므로
아래 CVD 행렬을 배정 비용에 넣어, 겹치는 대리점끼리는 색각이상에서도 헷갈리는 쌍을 피한다.

NV/CVD = OKLab ΔE×100. NV 는 정상 시각, CVD 는 적색맹·녹색맹 중 나쁜 값. 둘 다 라이트·다크 중 나쁜 값.
슬롯: 0 crimson · 1 coral · 2 ochre · 3 olive · 4 green · 5 teal · 6 petrol · 7 sky · 8 violet · 9 orchid
"""
from __future__ import annotations

from collections import Counter, defaultdict

from .model import Dataset

HUES = 10
NV = [[0,18.4,15.8,30.7,29,32.4,27,32.2,21.1,18.3],[18.4,0,17.2,19.6,28.8,27.7,32.1,30.4,32.6,20.8],[15.8,17.2,0,18.3,15.7,23.9,22,31.8,26.7,26.4],[30.7,19.6,18.3,0,17.1,15.9,27.5,28.6,36.5,31.8],[29,28.8,15.7,17.1,0,16.4,16,28.5,29.1,33.8],[32.4,27.7,23.9,15.9,16.4,0,17.3,16.3,28,27.7],[27,32.1,22,27.5,16,17.3,0,16.4,15.9,26.7],[32.2,30.4,31.8,28.6,28.5,16.3,16.4,0,18.3,19.3],[21.1,32.6,26.7,36.5,29.1,28,15.9,18.3,0,18.4],[18.3,20.8,26.4,31.8,33.8,27.7,26.7,19.3,18.4,0]]
CVD = [[0,17.4,5.5,15.8,1.6,15.4,10.8,23.8,16.5,17.5],[17.4,0,10,1.7,6.8,12.5,15.6,23.9,28.1,20.1],[5.5,10,0,14.2,2,19.1,19.6,30.6,26.2,21.6],[15.8,1.7,14.2,0,14.2,14.1,24.3,27.6,32.6,18.8],[1.6,6.8,2,14.2,0,16,15,25.9,20,17.4],[15.4,12.5,19.1,14.1,16,0,17.1,13.8,20.3,3],[10.8,15.6,19.6,24.3,15,17.1,0,15.6,5.3,6],[23.8,23.9,30.6,27.6,25.9,13.8,15.6,0,14.4,5.2],[16.5,28.1,26.2,32.6,20,20.3,5.3,14.4,0,12.4],[17.5,20.1,21.6,18.8,17.4,3,6,5.2,12.4,0]]
NV_SAFE = 24.0          # 이 이상이면 이웃해도 정상 시각에서 문제없음
CVD_SAFE = 12.0         # 이 이상이면 색각이상에서도 문제없음
ADJACENT_WEIGHT = 0.35  # 맞닿은 시군구에서 만나는 경우의 가중치(같은 시군구 = 1)
SALIENCE = 0.06         # 큰 대리점끼리는 멀리 있어도 목록·범례에서 나란히 보이므로 기본 가중치를 준다


def penalty(a: int, b: int) -> float:
    """두 색을 이웃 대리점에 줄 때의 비용. 같은 색이 가장 비싸다(1.6)."""
    if a == b:
        return 1.6
    nv = max(0.0, (NV_SAFE - NV[a][b]) / NV_SAFE) ** 2
    cvd = max(0.0, (CVD_SAFE - CVD[a][b]) / CVD_SAFE) ** 2
    return nv + 0.5 * cvd


def conflict_weights(dataset: Dataset, neighbors: dict[str, set[str]]) -> dict[tuple[str, str], float]:
    """대리점 쌍 → 지도 위에서 서로 섞여 보이는 정도."""
    per: dict[str, Counter] = defaultdict(Counter)
    for s in dataset.stores:
        if s.sgg_code:
            per[s.dealer_id][s.sgg_code] += 1
    for d in dataset.dealers:
        if d.sgg_code and d.lat is not None:
            per[d.id][d.sgg_code] += 2  # 대리점 거점은 그 지역에서 더 눈에 띈다
    ids = sorted(per)
    size = Counter(s.dealer_id for s in dataset.stores)
    w: dict[tuple[str, str], float] = {}
    for i, a in enumerate(ids):
        ca = per[a]
        for b in ids[i + 1:]:
            cb = per[b]
            total = SALIENCE * min(size[a], size[b])
            total += sum(min(n, cb[s]) for s, n in ca.items() if s in cb)
            for s, n in ca.items():
                for t in neighbors.get(s, ()):
                    if t in cb:
                        total += ADJACENT_WEIGHT * min(n, cb[t])
            if total:
                w[(a, b)] = w[(b, a)] = total
    return w


def assign_hues(dataset: Dataset, neighbors: dict[str, set[str]]) -> dict[str, int]:
    """결정적(같은 입력 → 같은 결과) 탐욕 배정 + 국소 개선."""
    ids = [d.id for d in dataset.dealers]
    if not ids:
        return {}
    w = conflict_weights(dataset, neighbors)
    stores = Counter(s.dealer_id for s in dataset.stores)
    weight_sum = {a: sum(v for (x, _), v in w.items() if x == a) for a in ids}
    order = sorted(ids, key=lambda a: (-weight_sum[a], -stores[a], a))
    nbrs: dict[str, list[tuple[str, float]]] = defaultdict(list)
    for (a, b), v in w.items():
        nbrs[a].append((b, v))

    hue: dict[str, int] = {}
    usage = Counter()

    def cost(a: str, h: int) -> float:
        return sum(v * penalty(h, hue[b]) for b, v in nbrs[a] if b in hue)

    for a in order:
        best = min(range(HUES), key=lambda h: (round(cost(a, h), 6), usage[h], h))
        hue[a] = best
        usage[best] += 1

    for _ in range(40):  # 국소 개선: 한 곳씩 색을 바꿔 총비용이 줄면 채택
        improved = False
        for a in order:
            cur = hue[a]
            others = {b: v for b, v in nbrs[a]}
            def c(h: int) -> float:
                return sum(v * penalty(h, hue[b]) for b, v in others.items())
            best = min(range(HUES), key=lambda h: (round(c(h), 6), usage[h] - (h == cur), h))
            if c(best) + 1e-9 < c(cur):
                usage[cur] -= 1
                usage[best] += 1
                hue[a] = best
                improved = True
        if not improved:
            break
    return hue


def total_cost(dataset: Dataset, neighbors: dict[str, set[str]], hue: dict[str, int]) -> float:
    w = conflict_weights(dataset, neighbors)
    return sum(v * penalty(hue[a], hue[b]) for (a, b), v in w.items() if a < b)
