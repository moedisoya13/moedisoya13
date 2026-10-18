"""대리점 색 배정: 겹치는 영업권끼리 다른 색, 결정적, 필터와 무관."""
from csmmap.config import Config
from csmmap.palette import CVD, HUES, NV, assign_hues, conflict_weights, penalty
from csmmap.pipeline import Pipeline


def test_matrices_are_symmetric_and_sane():
    assert len(NV) == len(CVD) == HUES
    for i in range(HUES):
        assert NV[i][i] == 0 and CVD[i][i] == 0
        for j in range(HUES):
            assert NV[i][j] == NV[j][i] and CVD[i][j] == CVD[j][i]
            if i != j:
                assert NV[i][j] >= 15  # 정상 시각 전 쌍 하한 (dataviz 검증기)


def test_penalty_orders_same_above_close_above_far():
    assert penalty(0, 0) > penalty(0, 2) > penalty(0, 5) >= 0


def test_assignment_is_deterministic_and_separates_overlaps(folder, regions):
    p = Pipeline(folder, regions, Config(folder), demo=True)
    p.geocode()
    first = {d.id: d.hue for d in p.dataset.dealers}
    second = assign_hues(p.dataset, regions.neighbors)
    assert first == second and all(0 <= h < HUES for h in first.values())
    w = conflict_weights(p.dataset, regions.neighbors)
    heavy = [(a, b) for (a, b), v in w.items() if a < b and v >= 1]
    assert heavy and all(first[a] != first[b] for a, b in heavy)


def test_neighbors_are_symmetric(regions):
    for a, ns in regions.neighbors.items():
        for b in ns:
            assert a in regions.neighbors[b]
    assert "41194" in regions.neighbors["41192"]  # 부천 원미구 ↔ 소사구
