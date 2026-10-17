/* 거미줄: 대리점 ↔ 납품 거래처를 살짝 휜 곡선으로 연결하는 SVG 오버레이.
   권역 밖(숨은) 거래처는 가장자리 표시기 위치까지 점선으로 이어진다. */
(function (CSM) {
  const { util } = CSM;
  const sp = {};
  let map, svg, pane;
  let current = null;   // {from: LatLng, targets: [{latlng?, containerPoint?, dashed}], pinned, color}

  const SVG_NS = "http://www.w3.org/2000/svg";

  sp.init = function (leafletMap) {
    map = leafletMap;
    pane = map.createPane("spider");
    pane.style.zIndex = 620;
    pane.style.pointerEvents = "none";
    svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("class", "spider leaflet-zoom-hide");
    pane.appendChild(svg);
    map.on("move zoom viewreset resize csm:edges", redraw);
  };

  function pathD(p0, p1, i) {
    const dx = p1.x - p0.x, dy = p1.y - p0.y;
    const len = Math.hypot(dx, dy) || 1;
    const bow = Math.min(60, len * 0.16) * (i % 2 ? 1 : -1);
    const mx = (p0.x + p1.x) / 2 - (dy / len) * bow;
    const my = (p0.y + p1.y) / 2 + (dx / len) * bow;
    return `M${p0.x.toFixed(1)},${p0.y.toFixed(1)} Q${mx.toFixed(1)},${my.toFixed(1)} ${p1.x.toFixed(1)},${p1.y.toFixed(1)}`;
  }

  function redraw() {
    if (!current) return;
    const size = map.getSize();
    const topLeft = map.containerPointToLayerPoint([0, 0]);
    L.DomUtil.setPosition(svg, topLeft);
    svg.setAttribute("width", size.x); svg.setAttribute("height", size.y);
    svg.setAttribute("viewBox", `0 0 ${size.x} ${size.y}`);
    const p0 = map.latLngToContainerPoint(current.from);
    const paths = svg.querySelectorAll("path");
    current.targets.forEach((t, i) => {
      const p1 = t.latlng ? map.latLngToContainerPoint(t.latlng) : (t.point ? t.point() : null);
      const path = paths[i];
      if (!path || !p1) { if (path) path.setAttribute("d", ""); return; }
      path.setAttribute("d", pathD(p0, p1, i));
      if (!path.dataset.measured) {
        const len = path.getTotalLength();
        path.style.setProperty("--len", len.toFixed(0));
        path.dataset.measured = "1";
      }
      const c = svg.querySelectorAll("circle")[i];
      if (c) { c.setAttribute("cx", p1.x); c.setAttribute("cy", p1.y); }
    });
  }

  /**
   * @param from   {lat,lng} 대리점
   * @param targets [{latlng:[lat,lng]} | {point: () => L.Point, dashed:true}]
   */
  sp.show = function (from, targets, { pinned = false, color = null } = {}) {
    sp.hide();
    if (!targets.length) return;
    current = { from: L.latLng(from.lat, from.lng), targets, pinned };
    svg.classList.toggle("is-pinned", pinned);
    if (color) svg.style.setProperty("--c", color); else svg.style.removeProperty("--c");
    const p0 = map.latLngToContainerPoint(current.from);
    // 가까운 것부터 그려지도록 거리순 지연
    const dists = targets.map((t) => {
      const p1 = t.latlng ? map.latLngToContainerPoint(t.latlng) : (t.point ? t.point() : p0);
      return p1 ? Math.hypot(p1.x - p0.x, p1.y - p0.y) : 0;
    });
    const maxD = Math.max(1, ...dists);
    targets.forEach((t, i) => {
      const path = document.createElementNS(SVG_NS, "path");
      path.style.setProperty("--delay", util.reduced() ? "0ms" : `${Math.round((dists[i] / maxD) * 260)}ms`);
      if (t.dashed) { path.setAttribute("stroke-dasharray", "4 4"); path.style.opacity = 0.55; path.style.animation = "none"; }
      svg.appendChild(path);
      const c = document.createElementNS(SVG_NS, "circle");
      c.setAttribute("r", t.dashed ? 0 : 2.4);
      c.style.setProperty("--delay", `${Math.round((dists[i] / maxD) * 260) + 200}ms`);
      svg.appendChild(c);
    });
    redraw();
  };

  sp.hide = function () {
    current = null;
    while (svg.firstChild) svg.removeChild(svg.firstChild);
  };
  sp.isPinned = () => !!(current && current.pinned);
  sp.refresh = redraw;

  CSM.spider = sp;
})(window.CSM);
