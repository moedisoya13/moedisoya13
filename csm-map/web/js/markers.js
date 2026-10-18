/* 거래처 점 · 대리점 거점
   - 점 색 = 소속 대리점 색. 형태 = 위치 상태(원: 정확 · 점선 원: 근사 · 점선 마름모: 정정 필요 · 가운데 점: 수동)
   - 같은 자리에 겹친 점은 해바라기(phyllotaxis) 배열로 펼쳐 모두 보이게 한다(줌마다 다시 계산)
   - 대리점 거점끼리 겹치면 서로 밀어내고, 원래 자리까지 짧은 지시선과 핀을 단다 */
(function (CSM) {
  const { util } = CSM;
  const mk = {};
  let map, group;
  const stores = new Map();   // id → marker
  const hubs = new Map();
  const offsets = new Map();  // id → {x,y} px
  const hubOffsets = new Map();
  let obstacles = { hard: [], soft: [] };   // 이름표 배치용(레이어 좌표)
  const H = {};
  const GOLDEN = 2.399963;    // 137.5°

  mk.init = function (m) {
    map = m;
    group = L.layerGroup().addTo(map);
    map.on("zoomend", () => mk.layout());
    // flyTo 가 최대 범위 잠금(maxBounds)에 부딪혀 끝나는 경우 마커 위치가 한 박자 늦게 남을 때가 있어, 이동이 끝나면 다시 맞춘다
    map.on("moveend", () => { for (const m of hubs.values()) m.update(); for (const m of stores.values()) m.update(); });
  };
  mk.on = (name, fn) => { H[name] = fn; };

  function storeTip(s, d, hex) {
    const where = s.sgg_name ? `${util.esc(s.sido)} ${util.esc(s.sgg_name)}` : "권역 미확정";
    const fix = s.precision === "needs_fix"
      ? `<div class="tip__fix"><b>주소 정정 필요</b> · ${util.esc(s.reason || "주소 검색 결과 없음")}<br>시군구 중심 부근에 임시로 둔 위치입니다</div>` : "";
    return `<div class="tip__in" style="--c:${hex}">
      <div class="tip__t">${util.esc(s.name)} ${util.precisionTag(s.precision)}</div>
      <div class="tip__s">${util.esc(d ? d.name : s.dealer_name)} · ${where}</div>
      <div class="tip__a">${util.esc(s.address || "주소 없음")}</div>${fix}</div>`;
  }
  function dealerTip(d, hex, inView, total, avgKm) {
    return `<div class="tip__in" style="--c:${hex}">
      <div class="tip__t">${util.esc(d.name)} ${util.precisionTag(d.precision)}</div>
      <div class="tip__s">대리점 · 거래처 ${inView === total ? `${total}곳` : `${inView}/${total}곳`}${avgKm != null ? ` · 평균 ${avgKm.toFixed(1)}km` : ""}</div>
      <div class="tip__a">${util.esc(d.address || "")}</div>
      <div class="tip__hint">누르면 납품망을 고정하고 자세히 봅니다</div></div>`;
  }

  /**
   * @param data {stores, dealers}
   * @param ctx  {visible:Set, hexOf(dealer), dealersById:Map, storesByDealer:Map, inScope(store), animate}
   */
  mk.render = function (data, ctx) {
    group.clearLayers(); stores.clear(); hubs.clear(); offsets.clear(); hubOffsets.clear();
    const center = map.getCenter();
    const items = data.stores.filter((s) => s.lat != null && ctx.visible.has(s.id));
    const dist = (s) => Math.hypot(s.lat - center.lat, (s.lng - center.lng) * 0.8);
    const maxD = Math.max(1e-6, ...items.map(dist));
    const animate = ctx.animate && !util.reduced();

    for (const s of items) {
      const d = ctx.dealersById.get(s.dealer_id);
      const hex = ctx.hexOf(d);
      const cls = "st" + ({ approx: " st--approx", needs_fix: " st--fix", manual: " st--manual" }[s.precision] || "");
      const icon = L.divIcon({ className: "mk-wrap", iconSize: [16, 16], iconAnchor: [8, 8], html: `<span class="${cls}" style="--c:${hex}"></span>` });
      const m = L.marker([s.lat, s.lng], { icon, keyboard: true, riseOnHover: true, title: "" });
      m.sid = s.id; m.did = s.dealer_id;
      m.bindTooltip(() => storeTip(s, d, hex), { className: "tip", direction: "top", offset: [0, -10], opacity: 1 });
      m.on("click", (e) => { L.DomEvent.stop(e); H.storeClick && H.storeClick(s); });
      m.on("keypress", (e) => { if (e.originalEvent.key === "Enter") H.storeClick && H.storeClick(s); });
      m.on("mouseover", () => H.storeHover && H.storeHover(s, true));
      m.on("mouseout", () => H.storeHover && H.storeHover(s, false));
      m.on("add", () => {
        const el = m.getElement();
        if (!el) return;
        el.setAttribute("aria-label", `${s.name} · ${s.dealer_name}${s.precision === "needs_fix" ? " · 정정 필요" : ""}`);
        const dot = el.firstElementChild;
        const o = offsets.get(s.id);
        if (o) { dot.style.setProperty("--dx", `${o.x}px`); dot.style.setProperty("--dy", `${o.y}px`); }
        const delay = animate ? Math.round((dist(s) / maxD) * 560) : 0;
        dot.style.transitionDelay = `${delay}ms`;
        requestAnimationFrame(() => requestAnimationFrame(() => {
          dot.classList.add("is-in");
          setTimeout(() => { dot.style.transitionDelay = ""; }, delay + 450);
        }));
      });
      group.addLayer(m);
      stores.set(s.id, m);
    }

    for (const d of data.dealers) {
      if (d.lat == null) continue;
      const list = ctx.storesByDealer.get(d.id) || [];
      const inView = list.filter(ctx.inScope).length;
      if (!inView && !ctx.focusHas(d.sgg_code)) continue;   // 권역과 무관한 거점은 그리지 않는다
      const hex = ctx.hexOf(d);
      const withXY = list.filter((s) => s.lat != null);
      const avg = withXY.length ? withXY.reduce((a, s) => a + util.haversine(d, s), 0) / withXY.length : null;
      const cls = "hub" + (d.precision === "approx" ? " hub--approx" : d.precision === "needs_fix" ? " hub--fix" : "");
      const html = `<span class="${cls}" style="--c:${hex};--on:${util.onColor(hex)}">${util.esc(util.initials(d.name))}<i>${inView}</i><em class="hub__pin"></em></span>`;
      const icon = L.divIcon({ className: "mk-wrap", iconSize: [36, 36], iconAnchor: [18, 18], html });
      const m = L.marker([d.lat, d.lng], { icon, keyboard: true, zIndexOffset: 1000, riseOnHover: true, title: "" });
      m.did = d.id;
      m.bindTooltip(() => dealerTip(d, hex, inView, list.length, avg), { className: "tip", direction: "top", offset: [0, -20], opacity: 1 });
      m.on("mouseover", () => H.dealerHover && H.dealerHover(d));
      m.on("mouseout", () => H.dealerLeave && H.dealerLeave(d));
      m.on("click", (e) => { L.DomEvent.stop(e); H.dealerClick && H.dealerClick(d); });
      m.on("keypress", (e) => { if (e.originalEvent.key === "Enter") H.dealerClick && H.dealerClick(d); });
      m.on("add", () => {
        const el = m.getElement();
        if (!el) return;
        el.setAttribute("aria-label", `대리점 ${d.name}, 이 권역 거래처 ${inView}곳`);
        const hub = el.firstElementChild;
        setHubVars(hub, hubOffsets.get(d.id));
        hub.style.transitionDelay = animate ? "380ms" : "0ms";
        requestAnimationFrame(() => requestAnimationFrame(() => hub.classList.add("is-in")));
      });
      group.addLayer(m);
      hubs.set(d.id, m);
    }
    mk.layout();
  };

  /** 화면에서 9px 안에 겹친 점들을 해바라기 배열로 펼친다 */
  mk.layout = function () {
    offsets.clear();
    const pts = [];
    for (const [id, m] of stores) pts.push({ id, m, p: map.latLngToContainerPoint(m.getLatLng()) });
    pts.sort((a, b) => a.p.x - b.p.x || a.p.y - b.p.y);
    const used = new Uint8Array(pts.length);
    const R = 9;
    for (let i = 0; i < pts.length; i++) {
      if (used[i]) continue;
      const c = [pts[i]];
      used[i] = 1;
      for (let j = i + 1; j < pts.length && pts[j].p.x - pts[i].p.x <= R; j++) {
        if (!used[j] && Math.abs(pts[j].p.y - pts[i].p.y) <= R) { c.push(pts[j]); used[j] = 1; }
      }
      if (c.length === 1) { place(c[0], 0, 0); continue; }
      const cx = c.reduce((a, q) => a + q.p.x, 0) / c.length, cy = c.reduce((a, q) => a + q.p.y, 0) / c.length;
      c.sort((a, b) => (a.id < b.id ? -1 : 1));
      c.forEach((q, k) => {
        const r = 6.4 * Math.sqrt(k + 0.5), th = k * GOLDEN;
        place(q, cx + r * Math.cos(th) - q.p.x, cy + r * Math.sin(th) - q.p.y);
      });
    }
    function place(q, dx, dy) {
      const o = { x: +dx.toFixed(1), y: +dy.toFixed(1) };
      offsets.set(q.id, o);
      const el = q.m.getElement();
      if (el && el.firstElementChild) {
        el.firstElementChild.style.setProperty("--dx", `${o.x}px`);
        el.firstElementChild.style.setProperty("--dy", `${o.y}px`);
      }
    }
    layoutHubs();
    const lp = (m, o) => { const p = map.latLngToLayerPoint(m.getLatLng()); return { x: p.x + o.x, y: p.y + o.y }; };
    obstacles = {
      hard: [...hubs].map(([id, m]) => ({ ...lp(m, hubOffsets.get(id) || { x: 0, y: 0 }), r: 19 })),
      soft: [...stores].map(([id, m]) => ({ ...lp(m, offsets.get(id) || { x: 0, y: 0 }), r: 6 })),
    };
    map.fire("csm:layout");
  };

  /** 거점(지름 30px + 고리)이 서로 34px 안으로 붙으면 겹친 만큼만 서로 밀어낸다 */
  function layoutHubs() {
    hubOffsets.clear();
    const hp = [];
    for (const [id, m] of hubs) { const p = map.latLngToContainerPoint(m.getLatLng()); hp.push({ id, m, x: p.x, y: p.y, ox: p.x, oy: p.y }); }
    hp.sort((a, b) => (a.id < b.id ? -1 : 1));
    const MIN = 34;
    for (let it = 0; it < 80; it++) {
      let moved = false;
      for (let i = 0; i < hp.length; i++) for (let j = i + 1; j < hp.length; j++) {
        const a = hp[i], b = hp[j];
        let dx = b.x - a.x, dy = b.y - a.y, dd = Math.hypot(dx, dy);
        if (dd >= MIN - 0.5) continue;
        if (dd < 0.01) { dx = Math.cos((i + 1) * GOLDEN); dy = Math.sin((i + 1) * GOLDEN); dd = 1; }
        const push = (MIN - dd) / 2;
        a.x -= (dx / dd) * push; a.y -= (dy / dd) * push;
        b.x += (dx / dd) * push; b.y += (dy / dd) * push;
        moved = true;
      }
      if (!moved) break;
    }
    for (const h of hp) {
      const o = { x: +(h.x - h.ox).toFixed(1), y: +(h.y - h.oy).toFixed(1) };
      hubOffsets.set(h.id, o);
      const el = h.m.getElement();
      if (el && el.firstElementChild) setHubVars(el.firstElementChild, o);
    }
  }
  function setHubVars(el, o) {
    o = o || { x: 0, y: 0 };
    const len = Math.hypot(o.x, o.y);
    el.style.setProperty("--hx", `${o.x}px`);
    el.style.setProperty("--hy", `${o.y}px`);
    el.style.setProperty("--len", `${Math.max(0, len - 15).toFixed(1)}px`);
    el.style.setProperty("--ang", `${((Math.atan2(-o.y, -o.x) * 180) / Math.PI).toFixed(1)}deg`);
    el.classList.toggle("is-moved", len > 4);
  }

  mk.offsetFor = (id) => offsets.get(id) || { x: 0, y: 0 };
  mk.hubOffset = (id) => hubOffsets.get(id) || { x: 0, y: 0 };
  mk.obstacles = () => obstacles;
  mk.store = (id) => stores.get(id);
  mk.hub = (id) => hubs.get(id);
  mk.visibleIds = () => new Set(stores.keys());
  const inner = (m) => { const el = m && m.getElement(); return el && el.firstElementChild; };

  mk.setFocus = function (did) {
    for (const m of stores.values()) {
      const el = inner(m); if (!el) continue;
      el.classList.toggle("is-lit", !!did && m.did === did);
      el.classList.toggle("is-dim", !!did && m.did !== did);
    }
    for (const m of hubs.values()) {
      const el = inner(m); if (!el) continue;
      el.classList.toggle("is-lit", !!did && m.did === did);
      el.classList.toggle("is-dim", !!did && m.did !== did);
    }
  };
  mk.setPinned = function (did) {
    for (const m of hubs.values()) { const el = inner(m); if (el) el.classList.toggle("is-pinned", !!did && m.did === did); }
  };
  mk.setSearch = function (ids) {
    for (const m of stores.values()) {
      const el = inner(m); if (!el) continue;
      el.classList.toggle("is-search", !!ids && ids.has(m.sid));
      el.classList.toggle("is-dim", !!ids && !ids.has(m.sid));
    }
  };
  mk.hit = function (id, on) { const el = inner(stores.get(id)); if (el) el.classList.toggle("is-hit", on); };

  CSM.markers = mk;
})(window.CSM);
