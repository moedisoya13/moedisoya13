/* 거래처 점 · 대리점 육각 배지 마커 */
(function (CSM) {
  const { util } = CSM;
  const mk = {};
  let map;
  const storeMarkers = new Map();   // id -> marker
  const dealerMarkers = new Map();
  const handlers = { dealerHover: null, dealerLeave: null, dealerClick: null, storeClick: null, storeHover: null, storeLeave: null };
  let group;

  const HEX = '<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M20 2.5 36 11.5v17L20 37.5 4 28.5v-17z"/></svg>';

  mk.init = function (leafletMap) {
    map = leafletMap;
    group = L.layerGroup().addTo(map);
  };
  mk.on = (name, fn) => { handlers[name] = fn; };

  function storeTip(s, dealer) {
    const where = s.sgg_name ? `${util.esc(s.sido)} ${util.esc(s.sgg_name)}` : "권역 미확정";
    return `<div class="tip__title">${util.esc(s.name)}${util.precisionTag(s.precision)}</div>
      <div class="tip__sub">${util.esc(dealer ? dealer.name : s.dealer_name)} · ${where}</div>
      ${s.precision === "needs_fix" ? `<div class="tip__fix"><b>${util.esc(s.reason || "주소 검색 결과 없음")}</b><br><small>시군구 중심 부근에 임시로 둔 위치입니다</small></div>` : ""}
      <div class="tip__line">${util.esc(s.address || "주소 없음")}</div>`;
  }
  function dealerTip(d, stores) {
    const withCoords = stores.filter((s) => s.lat != null);
    let dist = "";
    if (d.lat != null && withCoords.length) {
      const km = withCoords.reduce((a, s) => a + util.haversine(d, s), 0) / withCoords.length;
      dist = ` · 평균 ${km.toFixed(1)}km`;
    }
    return `<div class="tip__title">${util.esc(d.name)}${util.precisionTag(d.precision)}</div>
      <div class="tip__sub">대리점 · 납품 거래처 ${stores.length}곳${dist}</div>
      ${d.address ? `<div class="tip__line">${util.esc(d.address)}</div>` : '<div class="tip__line tip__sub">주소 미등록 (H:I 열에 주소를 넣으면 지도에 표시)</div>'}`;
  }

  /**
   * @param data   {stores, dealers}
   * @param ctx    {visibleIds:Set, colorMode, dark, dealerColorOf(dealer)}
   */
  mk.render = function (data, ctx) {
    group.clearLayers();
    storeMarkers.clear(); dealerMarkers.clear();
    const dealers = new Map(data.dealers.map((d) => [d.id, d]));
    const storesByDealer = new Map();
    for (const s of data.stores) {
      if (!storesByDealer.has(s.dealer_id)) storesByDealer.set(s.dealer_id, []);
      storesByDealer.get(s.dealer_id).push(s);
    }

    const visible = data.stores.filter((s) => s.lat != null && ctx.visibleIds.has(s.id));
    // 서 → 동 스윕 등장 순서
    const order = [...visible].sort((a, b) => a.lng - b.lng);
    const rank = new Map(order.map((s, i) => [s.id, i]));
    const n = Math.max(1, order.length);

    for (const s of visible) {
      const d = dealers.get(s.dealer_id);
      const color = ctx.dealerColorOf(d);
      const cls = ["pt", { approx: "pt--approx", manual: "pt--manual", needs_fix: "pt--fix" }[s.precision] || ""].filter(Boolean).join(" ");
      const icon = L.divIcon({ className: "pt-wrap", iconSize: [12, 12], iconAnchor: [6, 6], html: `<div class="${cls}" style="--c:${color}" role="button" aria-label="${util.esc(s.name)}${s.precision === "needs_fix" ? " (정정 필요)" : ""}"></div>` });
      const m = L.marker([s.lat, s.lng], { icon, keyboard: true, riseOnHover: true, title: "" });
      m.storeId = s.id; m.dealerId = s.dealer_id;
      m.bindTooltip(() => storeTip(s, d), { direction: "top", offset: [0, -8], opacity: 1 });
      m.on("click", () => handlers.storeClick && handlers.storeClick(s, m));
      m.on("mouseover focus", () => handlers.storeHover && handlers.storeHover(s, m));
      m.on("mouseout blur", () => handlers.storeLeave && handlers.storeLeave(s, m));
      m.on("add", () => {
        const el = m.getElement();
        if (!el) return;
        const dot = el.firstElementChild;
        const delay = util.reduced() ? 0 : Math.round((rank.get(s.id) / n) * 560);
        dot.style.transitionDelay = `${delay}ms`;
        requestAnimationFrame(() => requestAnimationFrame(() => {
          dot.classList.add("is-in");
          setTimeout(() => { dot.style.transitionDelay = ""; }, delay + 320);
        }));
        el.setAttribute("aria-label", `${s.name} (${s.dealer_name})`);
      });
      group.addLayer(m);
      storeMarkers.set(s.id, m);
    }

    for (const d of data.dealers) {
      if (d.lat == null) continue;
      const stores = storesByDealer.get(d.id) || [];
      const size = Math.round(22 + Math.min(12, stores.length * 0.6));
      const color = ctx.dealerColorOf(d);
      const cls = ["hex", d.precision === "approx" ? "hex--approx" : "", d.precision === "needs_fix" ? "hex--fix" : ""].filter(Boolean).join(" ");
      const html = `<div class="${cls}" style="--c:${color};--sz:${size}px">${HEX}<span>${util.esc(util.initials(d.name))}</span></div>`;
      const icon = L.divIcon({ className: "pt-wrap", iconSize: [size, size], iconAnchor: [size / 2, size / 2], html });
      const m = L.marker([d.lat, d.lng], { icon, keyboard: true, zIndexOffset: 1000, riseOnHover: true, title: "" });
      m.dealerId = d.id;
      m.bindTooltip(() => dealerTip(d, stores), { direction: "top", offset: [0, -size / 2 - 2], opacity: 1 });
      m.on("mouseover focus", () => handlers.dealerHover && handlers.dealerHover(d, m));
      m.on("mouseout blur", () => handlers.dealerLeave && handlers.dealerLeave(d, m));
      m.on("click", (e) => { L.DomEvent.stop(e); handlers.dealerClick && handlers.dealerClick(d, m); });
      m.on("keypress", (e) => { if (e.originalEvent.key === "Enter") handlers.dealerClick && handlers.dealerClick(d, m); });
      m.on("add", () => {
        const el = m.getElement();
        if (!el) return;
        el.setAttribute("aria-label", `대리점 ${d.name}, 거래처 ${stores.length}곳`);
        requestAnimationFrame(() => requestAnimationFrame(() => el.firstElementChild.classList.add("is-in")));
      });
      group.addLayer(m);
      dealerMarkers.set(d.id, m);
    }
  };

  mk.store = (id) => storeMarkers.get(id);
  mk.dealer = (id) => dealerMarkers.get(id);
  mk.visibleStoreIds = () => new Set(storeMarkers.keys());

  function dot(m) { const el = m.getElement(); return el && el.firstElementChild; }

  /** 대리점 포커스: 그 대리점의 거래처만 밝히고 나머지는 흐리게. null 이면 해제 */
  mk.setFocus = function (dealerId) {
    for (const m of storeMarkers.values()) {
      const el = dot(m); if (!el) continue;
      el.classList.toggle("is-lit", !!dealerId && m.dealerId === dealerId);
      el.classList.toggle("is-dim", !!dealerId && m.dealerId !== dealerId);
    }
    for (const m of dealerMarkers.values()) {
      const el = dot(m); if (!el) continue;
      el.classList.toggle("is-lit", !!dealerId && m.dealerId === dealerId);
      el.classList.toggle("is-dim", !!dealerId && m.dealerId !== dealerId);
    }
  };
  mk.setPinned = function (dealerId) {
    for (const m of dealerMarkers.values()) {
      const el = dot(m); if (el) el.classList.toggle("is-pinned", !!dealerId && m.dealerId === dealerId);
    }
  };
  /** 검색 결과 강조 */
  mk.setSearch = function (idSet) {
    for (const m of storeMarkers.values()) {
      const el = dot(m); if (!el) continue;
      el.classList.toggle("is-search", !!idSet && idSet.has(m.storeId));
      el.classList.toggle("is-dim", !!idSet && !idSet.has(m.storeId));
    }
  };
  mk.hit = function (id, on) {
    const m = storeMarkers.get(id); const el = m && dot(m);
    if (el) el.classList.toggle("is-hit", on);
  };

  CSM.markers = mk;
})(window.CSM);
