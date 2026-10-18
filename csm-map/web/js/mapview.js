/* 지도 판(plate) 렌더러
   전국 지도를 깔지 않는다. 고른 권역(없으면 거래처가 있는 시군구)만 '판'으로 새로 그리고,
   그 판과 맞닿은 시군구만 흐린 맥락으로 둘레에 그린다. 필터가 바뀌면 A/B 두 벌의 레이어를
   번갈아 쓰며 교차 페이드로 바꿔 그린다. */
(function (CSM) {
  const { util } = CSM;
  const mv = {};
  let map, topo, geoms;
  const feats = [];
  const byCode = new Map();
  const nbr = new Map();
  const groups = { A: null, B: null };
  let slot = "A";
  let state = { focus: new Set(), context: new Set(), key: "" };
  let opts = null;
  let handlers = {};
  let tileLayer = null;
  let labelsOn = true;
  let hovered = null;

  const TILES = {
    light: "https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png",
    dark: "https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png",
  };
  mv.TILES_ATTRIB = '© <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a> © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';
  const PANES = ["ctx", "plate", "edge", "label"];

  const codeOf = (g) => String(g.properties.sgg);
  const displayName = (n) => { const m = /^(.+?시)(.+구)$/.exec(n); return m && m[1].length >= 2 && m[2].length >= 2 ? `${m[1]} ${m[2]}` : n; };
  const shortSido = (n) => n.replace(/특별자치시|특별자치도|통합특별시|광역시|특별시/, "").replace(/^경기도$/, "경기").replace(/^(충청|경상|전라)(남|북)도$/, "$1$2");
  mv.shortSido = shortSido;

  function pane(name, z, noPointer) {
    const p = map.createPane(name);
    p.style.zIndex = z;
    p.classList.add("pane-fade");
    if (noPointer) p.style.pointerEvents = "none";
    return p;
  }

  mv.init = function (id, topoData, h = {}) {
    handlers = h;
    map = L.map(id, {
      zoomControl: false, attributionControl: false, zoomSnap: 0.25, zoomDelta: 0.5, wheelPxPerZoomLevel: 110,
      minZoom: 6, maxZoom: 17, maxBoundsViscosity: 0.9, keyboard: true, inertia: true,
    });
    map.setView([37.45, 126.85], 10);
    map.createPane("tiles").style.zIndex = 150;
    for (const s of ["A", "B"]) {
      pane(`ctx${s}`, 300); pane(`plate${s}`, 340); pane(`edge${s}`, 360, true); pane(`label${s}`, 450, true);
    }
    topo = topoData;
    geoms = topo.objects.sgg.geometries;
    const fc = topojson.feature(topo, topo.objects.sgg);
    const labels = new Map(topojson.feature(topo, topo.objects.labels).features
      .map((f) => [String(f.properties.sgg), L.latLng(f.geometry.coordinates[1], f.geometry.coordinates[0])]));
    fc.features.forEach((f) => {
      const c = String(f.properties.sgg);
      const r = { code: c, sido: f.properties.sidonm, name: f.properties.sggnm, display: displayName(f.properties.sggnm),
        feature: f, label: labels.get(c), bounds: L.geoJSON(f).getBounds() };
      feats.push(r); byCode.set(c, r);
    });
    const nb = topojson.neighbors(geoms);
    geoms.forEach((g, i) => nbr.set(codeOf(g), new Set(nb[i].map((j) => codeOf(geoms[j])))));
    map.on("zoomend", onZoom);
    map.on("csm:layout", () => cullLabels());
    onZoom();
    return map;
  };

  mv.map = () => map;
  mv.regions = () => feats;
  mv.region = (c) => byCode.get(c);
  mv.neighbors = (c) => nbr.get(c) || new Set();
  mv.focus = () => state.focus;

  function colors() {
    const v = (n) => util.cssVar(n);
    return {
      land: v("--land"), land2: v("--land-2"), gap: v("--land-gap"), edge: v("--land-edge"), ink: v("--ink"),
      ctx: v("--land-ctx"), ctxHover: v("--land-ctx-hover"), ctxLine: v("--land-ctx-line"), sido: v("--sido-line"),
      seq: [1, 2, 3, 4, 5].map((i) => v(`--seq-${i}`)),
    };
  }
  let C = null;

  function densityFill(n) {
    if (n >= 11) return C.seq[4];
    if (n >= 7) return C.seq[3];
    if (n >= 4) return C.seq[2];
    if (n >= 2) return C.seq[1];
    return C.seq[0];
  }
  mv.densitySteps = () => [["1", "--seq-1"], ["2–3", "--seq-2"], ["4–6", "--seq-3"], ["7–10", "--seq-4"], ["11+", "--seq-5"]];

  function plateFill(code) {
    const st = opts.stats.get(code);
    if (!st || !st.count) return C.land2;
    if (opts.mode === "territory" && st.dom) return util.mix(C.land, opts.hueOf(st.dom), st.share >= 0.5 ? 0.3 : 0.16);
    if (opts.mode === "density") return densityFill(st.count);
    return C.land;
  }
  function plateStyle(f) {
    const code = String(f.properties.sgg);
    const fill = plateFill(code);
    return {
      className: "rg rg--focus", fill: true, fillColor: hovered === code ? util.mix(fill, C.ink, 0.07) : fill,
      fillOpacity: tileLayer ? 0.62 : 1, color: C.gap, weight: 1.5, opacity: 1, lineJoin: "round",
    };
  }
  function ctxStyle(f) {
    const code = String(f.properties.sgg);
    return {
      className: "rg rg--ctx", fill: true, fillColor: hovered === code ? C.ctxHover : C.ctx,
      fillOpacity: tileLayer ? 0.28 : 1, color: C.ctxLine, weight: 0.9, opacity: 1,
    };
  }

  function tipHtml(code, kind) {
    const r = byCode.get(code);
    const st = opts.stats.get(code) || { count: 0, top: [] };
    const rows = (st.top || []).slice(0, 4).map((t) =>
      `<div style="--c:${t.hex}"><i></i><span>${util.esc(t.name)}</span><b>${t.n}</b></div>`).join("");
    const hint = kind === "ctx"
      ? "누르면 이 시군구를 권역에 더합니다"
      : (opts.hasSelection ? "Shift+클릭: 권역에서 빼기" : "누르면 이 시군구만 봅니다");
    return `<div class="tip__in" style="--c:${st.top && st.top[0] ? st.top[0].hex : "var(--line-3)"}">
      <div class="tip__t">${util.esc(r.display)}</div>
      <div class="tip__s">${util.esc(r.sido)} · 거래처 ${st.count}곳${st.fix ? ` · 정정 필요 ${st.fix}` : ""}</div>
      ${rows ? `<div class="tip__rows">${rows}</div>` : ""}
      <div class="tip__hint">${hint}</div></div>`;
  }

  function bindRegion(layer, f, kind) {
    const code = String(f.properties.sgg);
    layer.on("mouseover", () => { hovered = code; layer.setStyle(kind === "ctx" ? ctxStyle(f) : plateStyle(f)); });
    layer.on("mouseout", () => { if (hovered === code) hovered = null; layer.setStyle(kind === "ctx" ? ctxStyle(f) : plateStyle(f)); });
    layer.on("click", (e) => handlers.regionClick && handlers.regionClick(code, kind, e.originalEvent));
    layer.bindTooltip(() => tipHtml(code, kind), { className: "tip", sticky: true, direction: "top", offset: [0, -12], opacity: 1 });
  }

  function labelMarker(r, kind, count, s) {
    const html = kind === "focus"
      ? `<span class="lbl">${util.esc(r.display)}${count ? `<b>${count}</b>` : ""}</span>`
      : `<span class="lbl lbl--ctx">${util.esc(r.display)}</span>`;
    const m = L.marker(r.label || r.bounds.getCenter(), {
      pane: `label${s}`, interactive: false, keyboard: false,
      icon: L.divIcon({ className: "lbl-wrap", html, iconSize: [0, 0] }),
    });
    m.priority = (kind === "focus" ? 1000 : 0) + (count || 0);
    return m;
  }

  function clearSlot(s) {
    const g = groups[s];
    if (!g) return;
    for (const layer of g.layers) map.removeLayer(layer);
    groups[s] = null;
  }
  function slotPanes(s) { return PANES.map((p) => map.getPane(`${p}${s}`)); }
  function showSlot(s, on, animate) {
    for (const p of slotPanes(s)) {
      if (on) {
        p.classList.remove("is-gone");
        if (animate && !util.reduced()) {
          p.classList.add("is-rising");
          requestAnimationFrame(() => requestAnimationFrame(() => p.classList.remove("is-rising")));
        }
      } else {
        p.classList.add("is-gone");
      }
    }
  }

  function build(s) {
    const inFocus = (g) => state.focus.has(codeOf(g));
    const drawn = (g) => state.focus.has(codeOf(g)) || state.context.has(codeOf(g));
    const fcOf = (set) => ({ type: "FeatureCollection", features: feats.filter((r) => set.has(r.code)).map((r) => r.feature) });
    const ctx = L.geoJSON(fcOf(state.context), { pane: `ctx${s}`, style: ctxStyle, onEachFeature: (f, l) => bindRegion(l, f, "ctx") });
    const plate = L.geoJSON(fcOf(state.focus), { pane: `plate${s}`, style: plateStyle, onEachFeature: (f, l) => bindRegion(l, f, "focus") });
    const rim = topojson.mesh(topo, topo.objects.sgg, (a, b) => inFocus(a) !== inFocus(b) || (a === b && inFocus(a)));
    const edgeLine = L.geoJSON(rim, { pane: `edge${s}`, interactive: false, style: { color: C.edge, weight: 1.25, opacity: 0.9, fill: false, lineJoin: "round" } });
    const sidoMesh = topojson.mesh(topo, topo.objects.sgg, (a, b) => a !== b && drawn(a) && drawn(b) && a.properties.sidonm !== b.properties.sidonm);
    const sido = L.geoJSON(sidoMesh, { pane: `edge${s}`, interactive: false, style: { color: C.sido, weight: 1.1, opacity: 0.8, dashArray: "1 4", lineCap: "round", fill: false } });
    const labels = L.layerGroup();
    const g = { s, ctx, plate, edgeLine, sido, labels, layers: [ctx, plate, edgeLine, sido, labels] };
    groups[s] = g;
    fillLabels(g);
    for (const layer of g.layers) layer.addTo(map);
    requestAnimationFrame(cullLabels);
  }

  function fillLabels(g) {
    g.labels.clearLayers();
    for (const code of state.focus) {
      const r = byCode.get(code);
      const st = opts.stats.get(code);
      g.labels.addLayer(labelMarker(r, "focus", st ? st.count : 0, g.s));
    }
    for (const code of state.context) g.labels.addLayer(labelMarker(byCode.get(code), "ctx", 0, g.s));
  }

  /** 이름표 배치: 거래처가 많은 시군구부터, 제자리 → 아래 → 위 → 오른쪽 → 왼쪽 순으로 자리를 찾는다.
      다른 이름표·대리점 거점과 겹치면 안 되고, 거래처 점은 되도록 덜 가리는 자리를 고른다. 자리가 없으면 숨긴다. */
  function cullLabels() {
    const g = groups[slot];
    if (!g) return;
    const obs = (CSM.markers && CSM.markers.obstacles && CSM.markers.obstacles()) || { hard: [], soft: [] };
    const hitsCircle = (o, r) => {
      const cx = Math.max(r.x1, Math.min(o.x, r.x2)), cy = Math.max(r.y1, Math.min(o.y, r.y2));
      return (o.x - cx) ** 2 + (o.y - cy) ** 2 < o.r * o.r;
    };
    const kept = [];
    const ms = [];
    g.labels.eachLayer((m) => ms.push(m));
    ms.sort((a, b) => b.priority - a.priority);
    for (const m of ms) {
      const el = m.getElement() && m.getElement().firstElementChild;
      if (!el) continue;
      const p = map.latLngToLayerPoint(m.getLatLng());
      const w = el.offsetWidth, hgt = el.offsetHeight;
      const ctx = m.priority < 1000;
      const nearY = hgt / 2 + 13, farY = hgt / 2 + 30, sideX = w / 2 + 18, farX = w / 2 + 36;
      const cands = ctx ? [[0, 0], [0, hgt + 4], [0, -hgt - 4]]
        : [[0, 0], [0, nearY], [0, -nearY], [sideX, 0], [-sideX, 0], [0, farY], [0, -farY], [farX, 0], [-farX, 0], [sideX, nearY], [-sideX, -nearY]];
      let best = null;
      for (const [dx, dy] of cands) {
        const r = { x1: p.x + dx - w / 2 - 3, x2: p.x + dx + w / 2 + 3, y1: p.y + dy - hgt / 2 - 2, y2: p.y + dy + hgt / 2 + 2 };
        let hard = kept.some((k) => r.x1 < k.x2 && r.x2 > k.x1 && r.y1 < k.y2 && r.y2 > k.y1) ? 1 : 0;
        for (const o of obs.hard) if (hitsCircle(o, r)) hard++;
        let soft = 0;
        for (const o of obs.soft) if (hitsCircle(o, r)) soft++;
        const score = hard * 1000 + soft * 6 + Math.abs(dx) / 40 + Math.abs(dy) / 20;
        if (!best || score < best.score) best = { score, dx, dy, r, hard };
      }
      const hide = best.hard > 0;
      el.style.opacity = hide ? "0" : "";
      el.style.setProperty("--lx", `${best.dx.toFixed(0)}px`);
      el.style.setProperty("--ly", `${best.dy.toFixed(0)}px`);
      if (!hide) kept.push(best.r);
    }
  }

  function onZoom() {
    const el = map.getContainer();
    el.classList.toggle("zoom-low", map.getZoom() < 10.5);
    el.classList.toggle("show-labels", labelsOn);
    // 이름표 자리는 점 배치가 끝난 뒤(csm:layout) 다시 잡는다
  }

  function restyle() {
    const g = groups[slot];
    if (!g) return;
    g.plate.setStyle(plateStyle);
    g.ctx.setStyle(ctxStyle);
    g.edgeLine.setStyle({ color: C.edge });
    g.sido.setStyle({ color: C.sido });
    fillLabels(g);
    requestAnimationFrame(cullLabels);
  }

  /**
   * @param o {focus:Set, stats:Map(code→{count,dom,share,top,fix}), mode, hueOf(dealerId)→hex, hasSelection, fit, animate}
   */
  mv.render = function (o) {
    opts = o;
    C = colors();
    const focus = new Set(o.focus);
    const context = new Set();
    for (const c of focus) for (const n of nbr.get(c) || []) if (!focus.has(n)) context.add(n);
    const key = [...focus].sort().join(",");
    if (key === state.key && groups[slot]) {
      restyle();
      if (o.fit) mv.fit(o.animate);
      return false;
    }
    state = { focus, context, key };
    const next = groups[slot] ? (slot === "A" ? "B" : "A") : slot;
    const prev = slot;
    clearSlot(next);
    build(next);
    showSlot(next, true, o.animate);
    if (next !== prev) {
      showSlot(prev, false, o.animate);
      setTimeout(() => { if (slot !== prev) clearSlot(prev); }, o.animate ? 480 : 0);
    }
    slot = next;
    if (o.fit !== false) mv.fit(o.animate);
    return true;
  };

  function boundsOf(set) {
    let b = null;
    for (const c of set) {
      const r = byCode.get(c);
      if (!r) continue;
      b = b ? b.extend(r.bounds) : L.latLngBounds(r.bounds.getSouthWest(), r.bounds.getNorthEast());
    }
    return b;
  }
  mv.boundsOf = boundsOf;
  /** 범례(왼쪽 아래)에 판이 가리지 않도록 아래 여백을 범례 높이만큼 둔다 */
  function pad() {
    const lg = document.getElementById("legend");
    const bottom = lg && !lg.hidden ? lg.offsetHeight + 30 : 56;
    return { paddingTopLeft: [56, 52], paddingBottomRight: [76, Math.max(56, bottom)] };
  }

  /** 판에 맞춰 보고, 판 밖으로 너무 멀리 나가지 않게 이동·축소 범위를 잠근다 */
  mv.fit = function (animate = true) {
    const b = boundsOf(state.focus);
    if (!b) return;
    const all = boundsOf(new Set([...state.focus, ...state.context])) || b;
    map.setMaxBounds(null);
    map.setMinZoom(5);
    const lock = () => {
      const z = map.getBoundsZoom(b, false, L.point(132, 108));
      map.setMinZoom(Math.max(5, Math.min(z, map.getZoom()) - 1.25));
      map.setMaxBounds(all.pad(0.45));
    };
    if (animate && !util.reduced() && map._loaded) {
      map.once("moveend", lock);
      map.flyToBounds(b, { ...pad(), duration: 0.85, easeLinearity: 0.25, maxZoom: 14 });
    } else {
      map.fitBounds(b, { ...pad(), maxZoom: 14, animate: false });
      lock();
    }
  };
  /** 특정 범위를 잠깐 보여준다(판 밖 거래처 확인 등) — 잠금 해제 후 이동 */
  mv.peek = function (bounds) {
    map.setMaxBounds(null);
    map.setMinZoom(5);
    map.flyToBounds(bounds, { ...pad(), duration: 0.8, maxZoom: 14 });
  };

  mv.setTiles = function (on, theme) {
    if (tileLayer) { map.removeLayer(tileLayer); tileLayer = null; }
    if (on) {
      tileLayer = L.tileLayer(TILES[theme === "dark" ? "dark" : "light"], { pane: "tiles", subdomains: "abcd", maxZoom: 19 });
      tileLayer.addTo(map);
    }
    map.getContainer().classList.toggle("has-tiles", !!on);
    if (opts) { C = colors(); restyle(); }
  };
  mv.setLabels = function (on) { labelsOn = on; onZoom(); };
  mv.refresh = function () { if (opts) { C = colors(); restyle(); } };
  mv.cull = () => cullLabels();

  CSM.mapview = mv;
})(window.CSM);
