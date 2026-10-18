/* 앱 본체 — 데이터 → 파생값(derive) → 지도·패널·검색 렌더, 상호작용 연결 */
(function (CSM) {
  const { util, api, mapview, markers, network, edge, regionpicker, rail, card, sheet, search } = CSM;
  const root = document.getElementById("app");
  const S = {
    data: null, config: {}, D: null, hexes: [], theme: "light", mode: "territory", links: true, labels: true, tiles: false, legendKeys: false,
    selection: new Set(), preset: null, pinned: null, placing: null, firstData: true,
  };
  const LS = {
    get: (k, d) => { try { const v = localStorage.getItem("csm2:" + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set: (k, v) => { try { localStorage.setItem("csm2:" + k, JSON.stringify(v)); } catch { /* 저장 불가 환경 */ } },
  };
  const hexOf = (d) => (d ? S.hexes[(d.hue || 0) % S.hexes.length] : util.cssVar("--ink-3"));

  // ───────────── 파생값 ─────────────
  function derive() {
    const { stores, dealers } = S.data;
    const dealersById = new Map(dealers.map((d) => [d.id, d]));
    const storeById = new Map(stores.map((s) => [s.id, s]));
    const storesByDealer = new Map();
    for (const s of stores) { if (!storesByDealer.has(s.dealer_id)) storesByDealer.set(s.dealer_id, []); storesByDealer.get(s.dealer_id).push(s); }
    const hasSelection = S.selection.size > 0;
    const inScope = (s) => !hasSelection || S.selection.has(s.sgg_code);
    const scopeStores = stores.filter(inScope);
    const countsAll = new Map();
    const stats = new Map();
    for (const s of stores) {
      if (!s.sgg_code) continue;
      countsAll.set(s.sgg_code, (countsAll.get(s.sgg_code) || 0) + 1);
      let st = stats.get(s.sgg_code);
      if (!st) stats.set(s.sgg_code, (st = { count: 0, by: new Map(), fix: 0 }));
      st.count += 1;
      st.by.set(s.dealer_id, (st.by.get(s.dealer_id) || 0) + 1);
      if (util.isFix(s)) st.fix += 1;
    }
    for (const st of stats.values()) {
      const arr = [...st.by.entries()].sort((a, b) => b[1] - a[1]);
      st.dom = arr.length ? arr[0][0] : null;
      st.share = arr.length ? arr[0][1] / st.count : 0;
      st.top = arr.map(([id, n]) => ({ id, n, name: (dealersById.get(id) || {}).name || "", hex: hexOf(dealersById.get(id)) }));
    }
    const byDealerScope = new Map();
    for (const s of scopeStores) byDealerScope.set(s.dealer_id, (byDealerScope.get(s.dealer_id) || 0) + 1);
    let focus = hasSelection ? new Set(S.selection) : new Set(countsAll.keys());
    if (!focus.size) focus = new Set(mapview.regions().filter((r) => /서울|인천|경기/.test(r.sido)).map((r) => r.code));
    return {
      stores, dealers, dealersById, storeById, storesByDealer, hasSelection, inScope, scopeStores, countsAll, stats, byDealerScope, focus,
      regionsInScope: hasSelection ? S.selection.size : countsAll.size,
      dealersInScope: [...byDealerScope.values()].filter((n) => n > 0).length,
      fixAll: stores.filter(util.isFix).length + dealers.filter((d) => d.address && util.isFix(d)).length,
      fixScope: scopeStores.filter(util.isFix).length,
    };
  }

  // ───────────── 렌더 ─────────────
  function renderAll({ fit = false, fly = false, pop = false } = {}) {
    const D = (S.D = derive());
    mapview.render({ focus: D.focus, stats: D.stats, mode: S.mode, hueOf: (id) => hexOf(D.dealersById.get(id)), hasSelection: D.hasSelection, fit, animate: fly });
    markers.render(S.data, {
      visible: new Set(D.stores.filter((s) => s.lat != null && D.inScope(s)).map((s) => s.id)),
      hexOf, dealersById: D.dealersById, storesByDealer: D.storesByDealer, inScope: D.inScope, focusHas: (c) => D.focus.has(c), animate: pop,
    });
    const outside = D.hasSelection ? D.stores.filter((s) => s.lat != null && !D.inScope(s)) : [];
    edge.setItems(outside.map((s) => ({ id: s.id, lat: s.lat, lng: s.lng, name: s.name, dealerId: s.dealer_id, dealerName: s.dealer_name, hex: hexOf(D.dealersById.get(s.dealer_id)), sgg: s.sgg_name })));
    const links = [];
    for (const d of D.dealers) {
      if (d.lat == null || !markers.hub(d.id)) continue;
      const to = (D.storesByDealer.get(d.id) || []).filter((s) => s.lat != null).map((s) => ({ sid: s.id, latlng: L.latLng(s.lat, s.lng), out: D.hasSelection && !D.inScope(s) }));
      if (to.length) links.push({ did: d.id, hex: hexOf(d), from: L.latLng(d.lat, d.lng), to });
    }
    network.set(links);
    rail.render(D, { label: regionpicker.label(S.selection, S.preset), hexOf });
    regionpicker.setCounts(D.countsAll);
    search.setData({ stores: D.stores, dealers: D.dealers, regions: mapview.regions(), counts: D.countsAll, hexOf });
    renderMeta(D);
    sheet.refresh(D, hexOf);
    if (S.pinned && D.dealersById.has(S.pinned)) applyFocus(S.pinned, { animate: false, scroll: false });
    else { S.pinned = null; }
  }

  function renderMeta(D) {
    const files = S.data.files || [];
    const when = files.length ? files[0].modified.replace("T", " ").slice(5, 16).replace("-", "/") : "";
    util.$("#brand-sub").textContent = files.length ? `${files.map((f) => f.name).join(", ")} · ${when} 수정` : "엑셀 파일 없음";
    const empty = util.$("#empty");
    if (!D.stores.length) {
      empty.hidden = false;
      empty.innerHTML = "<div><b>거래처가 없습니다</b><p>앱과 같은 폴더에 CSM.xlsx(B 대리점명 · C 거래처명 · D 주소)를 두고 다시 실행하세요.</p></div>";
    } else if (D.hasSelection && !D.scopeStores.length) {
      empty.hidden = false;
      empty.innerHTML = "<div><b>이 권역에는 거래처가 없습니다</b><p>위의 「권역」에서 다른 시군구를 고르거나 맞닿은 시군구를 눌러 더해 보세요.</p></div>";
    } else empty.hidden = true;
  }

  function updateMapOnly() {
    const D = (S.D = derive());
    mapview.render({ focus: D.focus, stats: D.stats, mode: S.mode, hueOf: (id) => hexOf(D.dealersById.get(id)), hasSelection: D.hasSelection, fit: false, animate: false });
  }

  // ───────────── 강조·고정 ─────────────
  function applyFocus(did, { animate = true, scroll = true } = {}) {
    markers.setFocus(did);
    markers.setPinned(S.pinned);
    network.focus(did, { animate });
    edge.setFocus(did);
    rail.setActive(did, { scroll });
  }
  function clearFocus() {
    if (S.pinned) { applyFocus(S.pinned, { animate: false, scroll: false }); return; }
    markers.setFocus(null); markers.setPinned(null); network.focus(null); edge.setFocus(null); rail.setActive(null, { scroll: false });
  }
  function hoverDealer(d, from) { if (!S.pinned) applyFocus(d.id, { animate: true, scroll: from === "map" }); }
  function togglePin(d) {
    if (S.pinned === d.id) { S.pinned = null; card.hide(); clearFocus(); return; }
    S.pinned = d.id;
    card.showDealer(d, S.D, hexOf);
    applyFocus(d.id, { animate: true, scroll: true });
    revealDealer(d);
  }
  /** 고정한 대리점의 거점·권역 안 거래처가 상세 카드나 화면 밖에 가려 있으면, 카드를 피해 보이도록 옮긴다(확대는 하지 않음) */
  function revealDealer(d) {
    const map = mapview.map();
    const pts = (S.D.storesByDealer.get(d.id) || []).filter((s) => s.lat != null && S.D.inScope(s)).map((s) => [s.lat, s.lng]);
    if (d.lat != null) pts.push([d.lat, d.lng]);
    if (!pts.length) return;
    const b = L.latLngBounds(pts);
    const size = map.getSize(), box = map.getContainer().getBoundingClientRect();
    const cardEl = util.$("#card"), lg = util.$("#legend");
    const right = cardEl.hidden ? 76 : Math.max(76, box.right - cardEl.getBoundingClientRect().left + 28);
    const bottom = lg ? lg.offsetHeight + 30 : 56;
    const nw = map.latLngToContainerPoint(b.getNorthWest()), se = map.latLngToContainerPoint(b.getSouthEast());
    if (nw.x >= 40 && nw.y >= 40 && se.x <= size.x - right && se.y <= size.y - bottom) return;
    map.flyToBounds(b, { paddingTopLeft: [56, 52], paddingBottomRight: [right, bottom], maxZoom: map.getZoom(), duration: 0.6 });
  }
  function unpin() { if (S.pinned) { S.pinned = null; clearFocus(); } card.hide(); }

  function focusStore(s) {
    card.showStore(s, S.D, hexOf);
    if (s.lat == null) { util.toast(`「${s.name}」은 좌표가 없어 지도에 없습니다`); return; }
    const map = mapview.map();
    const pulse = () => { markers.hit(s.id, true); setTimeout(() => markers.hit(s.id, false), 1700); };
    if (!markers.store(s.id)) {
      const b = mapview.boundsOf(S.D.focus) || L.latLngBounds([[s.lat, s.lng]]);
      mapview.peek(b.extend([s.lat, s.lng]));
      util.toast("선택 권역 밖 거래처라 잠시 넓혀 보여 줍니다 · 「맞추기」로 돌아갑니다");
      return;
    }
    if (!map.getBounds().pad(-0.1).contains([s.lat, s.lng]) || map.getZoom() < 12) {
      map.once("moveend", pulse);
      map.flyTo([s.lat, s.lng], Math.max(map.getZoom(), 13), { duration: 0.7 });
    } else pulse();
  }

  // ───────────── 권역 ─────────────
  function setSelection(set, preset = null) {
    S.selection = new Set(set);
    S.preset = preset;
    regionpicker.setSelection(S.selection, preset);
    LS.set("selection", [...S.selection]);
    LS.set("preset", preset);
    if (!api.isStatic) api.config({ active_preset: preset }).catch(() => {});
    renderAll({ fit: true, fly: true, pop: true });
  }
  function regionClick(code, kind, ev) {
    if (S.placing) return;
    const r = mapview.region(code);
    if (kind === "ctx") {
      const base = S.selection.size ? S.selection : S.D.focus;
      setSelection(new Set([...base, code]), null);
      util.toast(`${r.display}을(를) 권역에 더했습니다`);
    } else if (!S.selection.size) {
      setSelection(new Set([code]), null);
    } else if (ev && ev.shiftKey) {
      if (S.selection.size > 1) { const n = new Set(S.selection); n.delete(code); setSelection(n, null); util.toast(`${r.display}을(를) 권역에서 뺐습니다`); }
    } else {
      mapview.map().flyToBounds(r.bounds, { padding: [60, 60], duration: 0.6, maxZoom: 14 });
    }
  }
  function scopeToDealer(d) {
    const codes = new Set((S.D.storesByDealer.get(d.id) || []).map((s) => s.sgg_code).filter(Boolean));
    if (d.sgg_code) codes.add(d.sgg_code);
    if (codes.size) setSelection(codes, null);
  }

  // ───────────── 위치 지정 ─────────────
  function startPlacing(s) {
    S.placing = s;
    sheet.close();
    util.$("#placing").hidden = false;
    util.$("#placing-name").textContent = s.name;
    mapview.map().getContainer().classList.add("is-placing");
    card.showStore(s, S.D, hexOf);
  }
  function stopPlacing() { S.placing = null; util.$("#placing").hidden = true; mapview.map().getContainer().classList.remove("is-placing"); }

  // ───────────── 상태 표시 ─────────────
  function setStatus(kind, { done = 0, total = 0, text = "" } = {}) {
    const el = util.$("#status");
    el.className = "status" + (kind ? ` is-${kind}` : "");
    const frac = kind === "running" ? (total ? done / total : 0.05) : kind === "done" || kind === "warn" ? 1 : 0;
    el.querySelector(".status__arc").style.setProperty("--off", (47.1 * (1 - frac)).toFixed(1));
    util.$("#status-text").textContent = text || (kind === "running" ? `주소 확인 ${done}/${total}` : "준비");
    el.dataset.kind = kind;
  }
  function statusAfterData() {
    const m = S.data.meta || {};
    if (api.isStatic) return setStatus("done", { text: `공유본 · ${(m.generated_at || "").slice(0, 10)}` });
    if (m.last_error) return setStatus("error", { text: "주소 검색 오류" });
    const stores = S.data.stores;
    const exact = stores.filter((s) => s.precision === "exact" || s.precision === "manual").length;
    if (m.demo) return setStatus("warn", { text: "근사 위치 · 키 설정" });
    if (!m.geocoded) return setStatus("", { text: "준비" });
    setStatus("done", { text: `위치 확정 ${util.pct(exact, stores.length)}%` });
  }

  // ───────────── 내보내기 ─────────────
  function csvText() {
    const rows = [["대리점명", "거래처명", "주소", "시도", "시군구", "위도", "경도", "위치 상태", "사유"]];
    for (const s of S.data.stores) rows.push([s.dealer_name, s.name, s.address, s.sido, s.sgg_name, s.lat ?? "", s.lng ?? "", util.precisionLabel[s.precision], s.reason || ""]);
    return util.csv(rows);
  }
  async function doExport(kind) {
    try {
      if (kind === "csv-dl") { util.download(`CSM_거래처좌표_${new Date().toISOString().slice(0, 10)}.csv`, csvText()); return; }
      const r = await api.exportFile(kind);
      util.toast(kind === "corrections" ? `정정 요청 ${r.count}건을 저장했습니다 · ${r.name}` : `저장했습니다 · ${r.name}`, { ms: 6500 });
    } catch (e) {
      const what = { html: "지도 공유 파일을 저장", corrections: "정정 요청 엑셀을 저장", csv: "좌표 목록(CSV)을 저장" }[kind] || "파일을 저장";
      util.toast(util.failText(what, e), { error: true, ms: 8000 });
    }
  }

  // ───────────── 테마·표시 옵션 ─────────────
  function setTheme(t, { save = true } = {}) {
    S.theme = t === "dark" ? "dark" : "light";
    document.documentElement.dataset.theme = S.theme;
    S.hexes = util.hues();
    if (save) { LS.set("theme", S.theme); if (!api.isStatic) api.config({ theme: S.theme }).catch(() => {}); }
    if (S.data && mapview.map()) { if (S.tiles) mapview.setTiles(true, S.theme); renderAll(); renderLegend(); }
  }
  function setMode(m) {
    S.mode = m; LS.set("mode", m);
    for (const b of util.$$("#legend [data-mode]")) { const on = b.dataset.mode === m; b.classList.toggle("is-on", on); b.setAttribute("aria-checked", on); }
    renderLegend();
    if (S.data && mapview.map()) updateMapOnly();
  }
  /** 범례 설명과 색 띠 — 영업권은 '1위 대리점 비중' 두 단계, 밀도는 거래처 수 다섯 단계 */
  function renderLegend() {
    const m = S.mode, note = util.$("#legend-note"), ramp = util.$("#legend-ramp");
    note.textContent = m === "territory" ? "시군구 바탕색 = 그곳 1위 대리점의 색"
      : m === "density" ? "시군구 바탕색 = 그곳의 거래처 수" : "바탕색 없이 점과 연결선만 봅니다";
    ramp.hidden = m === "plain";
    if (m === "density") ramp.innerHTML = mapview.densitySteps().map(([t, v]) => `<span style="--c:var(${v})">${t}</span>`).join("");
    else if (m === "territory") {
      const land = util.cssVar("--land"), hue = S.hexes[6] || util.cssVar("--h6");
      ramp.innerHTML = `<span style="--c:${util.mix(land, hue, 0.16)}">1위 비중 50% 미만</span><span style="--c:${util.mix(land, hue, 0.3)}">50% 이상</span>`;
    }
  }
  function setLegendKeys(open) {
    S.legendKeys = !!open; LS.set("legendKeys", S.legendKeys);
    util.$("#legend-keys").hidden = !S.legendKeys;
    util.$("#legend-more").setAttribute("aria-expanded", S.legendKeys);
    edge.update();
  }
  function setLinks(on) { S.links = !!on; LS.set("links", S.links); network.setOn(S.links); util.$("#btn-links").setAttribute("aria-pressed", S.links); }
  function setTiles(on, { save = true } = {}) {
    S.tiles = !!on; mapview.setTiles(S.tiles, S.theme);
    util.$("#btn-tiles").setAttribute("aria-pressed", S.tiles);
    const map = mapview.map();
    if (S.tiles) { if (!map._csmAttr) { map._csmAttr = L.control.attribution({ prefix: false, position: "bottomright" }).addAttribution(mapview.TILES_ATTRIB); } map._csmAttr.addTo(map); }
    else if (map._csmAttr) map._csmAttr.remove();
    if (save && !api.isStatic) api.config({ tiles: S.tiles }).catch(() => {});
    LS.set("tiles", S.tiles);
  }
  function setLabels(on) { S.labels = !!on; LS.set("labels", S.labels); mapview.setLabels(S.labels); }
  function toggleRail() {
    const off = root.classList.toggle("rail-off");
    util.$("#btn-rail").setAttribute("aria-expanded", !off);
    LS.set("railOff", off);
    setTimeout(() => { mapview.map().invalidateSize({ animate: true }); edge.update(); network.redraw(); mapview.cull(); }, 440);
  }

  function fillInfo() {
    const m = S.data.meta || {}, b = m.boundaries || {};
    const files = (S.data.files || []).map((f) => `${f.name} (시트 ${f.sheet}, ${f.modified.replace("T", " ").slice(0, 16)} 수정, 거래처 ${f.stores})`).join(" / ") || "–";
    const rows = [
      ["데이터", files],
      ["좌표", `${m.provider || "–"} · 주소 검색만 사용하며, 찾지 못한 주소는 거래처명으로 대신 찾지 않고 '정정 필요'로 모읍니다.`],
      ["행정구역 경계", `ver${b.version || "?"} · 통계청 행정구역 경계를 vuski/admdongkor 가 가공한 자료를 시군구로 묶어 단순화`],
      ["색", "대리점마다 10색 중 하나. 영업권이 겹치거나 맞닿은 대리점끼리는 서로 잘 구분되는 색이 가도록 배정했고, 멀리 떨어진 대리점은 같은 색일 수 있습니다. 이름과 이니셜이 항상 함께 나옵니다."],
      ["지도 그리기", "전국 지도를 깔지 않고, 고른 권역(없으면 거래처가 있는 시군구)만 판으로 새로 그립니다. 둘레의 흐린 시군구는 맞닿은 곳이며 누르면 권역에 더합니다."],
      ["기호", "원 = 정확한 위치 · 점선 원 = 근사(검색 전) · 점선 마름모 = 정정 필요 · 가운데 흰 점 = 수동 지정 · 큰 원 = 대리점 거점(겹치면 비켜 서고 가는 선으로 제자리를 가리킴) · 흐린 작은 점 = 화면 안의 권역 밖 거래처 · 가장자리 화살표 = 화면 밖 권역 밖 거래처의 방향"],
      ["생성", (m.generated_at || "").replace("T", " ")],
    ];
    const dl = util.$("#info-list");
    dl.innerHTML = "";
    for (const [k, v] of rows) dl.append(util.h("dt", {}, k), util.h("dd", {}, v));
  }

  // ───────────── 부트 ─────────────
  async function boot() {
    if (api.isStatic) root.dataset.static = "1";
    let cfg = {};
    if (!api.isStatic) {
      if (!api.hasToken()) util.toast("접근 토큰이 없습니다. 앱이 연 창이나 콘솔에 찍힌 주소로 열어 주세요.", { error: true, ms: 10000 });
      try { const st = await api.state(); cfg = st.config || {}; S.data = st.data; S.config = cfg; }
      catch (e) {
        util.$("#empty").hidden = false;
        util.$("#empty").innerHTML = `<div><b>서버에 연결할 수 없습니다</b><p>${util.esc(e.message)} · 앱(run_csm_map.bat)을 다시 실행하세요.</p></div>`;
        root.classList.remove("is-booting");
        return;
      }
    } else S.data = window.CSM_DATA;

    setTheme(cfg.theme || LS.get("theme", window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"), { save: false });
    const topo = await api.boundaries();
    const map = mapview.init("map", topo, { regionClick });
    markers.init(map); network.init(map);
    edge.init(map, util.$("#edge-layer"), {
      click: (members) => {
        const b = mapview.boundsOf(S.D.focus) || map.getBounds();
        for (const m of members) b.extend([m.lat, m.lng]);
        mapview.peek(b);
        util.toast(`권역 밖 거래처 ${members.length}곳이 보이게 넓혔습니다 · 「맞추기」(F)로 돌아갑니다`);
      },
      hover: (members, on) => members.forEach((m) => markers.hit(m.id, on)),
    });
    regionpicker.init(mapview.regions(), {
      change: (set, preset) => setSelection(set, preset),
      presets: (list, active) => { LS.set("presets", list); if (!api.isStatic) api.config({ presets: list, active_preset: active }).catch(() => {}); },
    });
    rail.init({
      hover: (d, o) => hoverDealer(d, o && o.from), leave: () => clearFocus(), click: (d) => togglePin(d),
      fix: () => sheet.openFix(S.D, hexOf), table: () => sheet.openTable(S.D, hexOf),
    });
    card.init({ close: unpin, store: focusStore, dealer: (d) => { if (S.pinned !== d.id) togglePin(d); }, place: startPlacing, scopeToDealer });
    sheet.init({ store: (s) => { sheet.close(); focusStore(s); }, place: startPlacing, export: doExport });
    search.init({
      region: (r) => setSelection(new Set([r.code]), null),
      dealer: (d) => { if (S.pinned !== d.id) togglePin(d); },
      store: focusStore,
      highlight: (ids) => markers.setSearch(ids),
    });
    markers.on("dealerHover", (d) => hoverDealer(d, "map"));
    markers.on("dealerLeave", () => clearFocus());
    markers.on("dealerClick", togglePin);
    markers.on("storeClick", (s) => card.showStore(s, S.D, hexOf));
    markers.on("storeHover", (s, on) => {
      if (S.pinned) return;
      if (on) { markers.setFocus(s.dealer_id); network.focus(s.dealer_id); edge.setFocus(s.dealer_id); rail.setActive(s.dealer_id, { scroll: false }); }
      else clearFocus();
    });
    map.on("click", async (e) => {
      if (!S.placing) return;
      const s = S.placing; stopPlacing();
      try { const r = await api.override(s.id, e.latlng.lat, e.latlng.lng); S.data = r.data; renderAll(); card.showStore(S.D.storeById.get(s.id) || s, S.D, hexOf); util.toast(`「${s.name}」 위치를 저장했습니다`); }
      catch (err) { util.toast(util.failText("위치를 저장", err), { error: true, ms: 7000 }); }
    });

    // 저장된 표시 상태 복원
    const presets = cfg.presets && cfg.presets.length ? cfg.presets : LS.get("presets", []);
    const activeName = cfg.active_preset ?? LS.get("preset", null);
    regionpicker.setPresets(presets, activeName);
    const preset = presets.find((p) => p.name === activeName);
    const valid = new Set(mapview.regions().map((r) => r.code));
    S.selection = new Set((preset ? preset.regions : LS.get("selection", [])).filter((c) => valid.has(c)));
    S.preset = preset ? preset.name : null;
    regionpicker.setSelection(S.selection, S.preset);
    setMode(LS.get("mode", "territory"));
    setLegendKeys(LS.get("legendKeys", false));
    setLinks(LS.get("links", true));
    setLabels(LS.get("labels", true));
    setTiles(cfg.tiles ?? LS.get("tiles", false), { save: false });
    if (LS.get("railOff", false)) { root.classList.add("rail-off"); util.$("#btn-rail").setAttribute("aria-expanded", "false"); setTimeout(() => map.invalidateSize(), 50); }

    renderAll({ fit: true, fly: false, pop: true });
    statusAfterData();
    requestAnimationFrame(() => { root.classList.remove("is-booting"); root.classList.add("is-ready"); });
    setTimeout(() => root.classList.remove("is-ready"), 1600);

    if (!api.isStatic) {
      api.events({
        progress: (p) => setStatus("running", { done: p.done, total: p.total }),
        done: (p) => {
          S.data = p.data;
          renderAll({ fit: S.firstData && !S.selection.size, fly: true, pop: true });
          S.firstData = false;
          statusAfterData();
          const fix = S.D.fixAll;
          if (!(S.data.meta || {}).demo) util.toast(fix ? `주소 확인을 마쳤습니다 · 정정 필요 ${fix}건` : "주소 확인을 마쳤습니다 · 모두 찾았습니다", { ms: 5000 });
        },
        error: (p) => { setStatus("error", { text: "주소 검색 오류" }); util.toast(p.message, { error: true, ms: 7000 }); },
      });
      setInterval(() => api.ping(), 10000);
      api.ping();
    }
    bindUI();
  }

  function bindUI() {
    util.$("#btn-theme").addEventListener("click", () => setTheme(S.theme === "dark" ? "light" : "dark"));
    util.$("#btn-rail").addEventListener("click", toggleRail);
    util.$("#btn-zoom-in").addEventListener("click", () => mapview.map().zoomIn());
    util.$("#btn-zoom-out").addEventListener("click", () => mapview.map().zoomOut());
    util.$("#btn-fit").addEventListener("click", () => mapview.fit(true));
    util.$("#btn-links").addEventListener("click", () => setLinks(!S.links));
    util.$("#btn-tiles").addEventListener("click", () => setTiles(!S.tiles));
    for (const b of util.$$("#legend [data-mode]")) b.addEventListener("click", () => setMode(b.dataset.mode));
    util.$("#legend-more").addEventListener("click", () => setLegendKeys(!S.legendKeys));
    util.$("#placing-cancel").addEventListener("click", stopPlacing);
    util.$("#status").addEventListener("click", () => {
      const k = util.$("#status").dataset.kind;
      if (k === "warn" || k === "error") openSettings();
      else if (S.D && S.D.fixAll) sheet.openFix(S.D, hexOf);
    });

    const exportBtn = util.$("#btn-export"), menu = util.$("#export-menu");
    let undismiss = null;
    const closeMenu = (why) => { menu.hidden = true; exportBtn.setAttribute("aria-expanded", "false"); if (undismiss) { undismiss(); undismiss = null; } if (why === "escape") exportBtn.focus(); };
    exportBtn.addEventListener("click", () => {
      if (!menu.hidden) return closeMenu();
      menu.hidden = false; exportBtn.setAttribute("aria-expanded", "true");
      undismiss = util.dismissable(menu, exportBtn, closeMenu);
    });
    for (const b of util.$$("#export-menu [data-export]")) b.addEventListener("click", () => { closeMenu(); doExport(b.dataset.export); });

    // 설정
    const dlg = util.$("#settings");
    function openSettings() {
      const key = util.$("#api-key");
      key.value = "";
      key.placeholder = S.config.has_key ? `등록됨 (${S.config.api_key_masked}) · 바꾸려면 새 키 입력` : "REST API 키 붙여넣기";
      for (const b of util.$$("#set-theme button")) b.classList.toggle("is-on", b.dataset.v === S.theme);
      util.$("#set-links").checked = S.links; util.$("#set-labels").checked = S.labels; util.$("#set-tiles").checked = S.tiles;
      dlg.showModal();
    }
    for (const b of util.$$("#set-theme button")) b.addEventListener("click", () => { for (const x of util.$$("#set-theme button")) x.classList.toggle("is-on", x === b); });
    util.$("#btn-settings").addEventListener("click", openSettings);
    util.$("#settings-cancel").addEventListener("click", () => dlg.close());
    util.$("#settings-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const th = (util.$("#set-theme .is-on") || {}).dataset;
      if (th && th.v !== S.theme) setTheme(th.v);
      setLinks(util.$("#set-links").checked); setLabels(util.$("#set-labels").checked);
      if (util.$("#set-tiles").checked !== S.tiles) setTiles(util.$("#set-tiles").checked);
      const key = util.$("#api-key").value.trim();
      dlg.close();
      if (key && !api.isStatic) {
        try { const r = await api.config({ api_key: key }); S.config = r.config; util.toast("키를 저장했습니다 · 주소 확인을 시작합니다"); await api.geocode(false); setStatus("running"); }
        catch (err) { util.toast(util.failText("키를 저장", err), { error: true, ms: 7000 }); }
      }
    });
    // 모든 주소 다시 검색 — 브라우저 기본 확인 창 대신 앱 대화상자로, 몇 건을 다시 찾는지 알린다
    const regeo = util.$("#regeo");
    util.$("#btn-regeocode").addEventListener("click", () => {
      const n = S.data.stores.filter((s) => s.address).length + S.data.dealers.filter((d) => d.address).length;
      util.$("#regeo-n").textContent = util.fmt(n);
      dlg.close();
      regeo.returnValue = "";
      regeo.showModal();
    });
    regeo.addEventListener("close", async () => {
      if (regeo.returnValue !== "ok") return;
      try { await api.geocode(true); setStatus("running"); } catch (err) { util.toast(util.failText("주소 다시 검색을 시작", err), { error: true, ms: 7000 }); }
    });
    util.$("#btn-info").addEventListener("click", () => { fillInfo(); util.$("#info").showModal(); });
    util.$("#info-close").addEventListener("click", () => util.$("#info").close());
    CSM.app.openSettings = openSettings;

    // 키보드
    document.addEventListener("keydown", (e) => {
      const typing = e.target.closest("input, textarea, select, [contenteditable]") || document.querySelector("dialog[open]");
      if (e.key === "Escape") {
        if (S.placing) return stopPlacing();
        if (sheet.isOpen()) return sheet.close();
        if (S.pinned || card.isOpen()) return unpin();
        return;
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "/") { e.preventDefault(); search.focus(); }
      else if (e.key === "r" || e.key === "R") { e.preventDefault(); regionpicker.isOpen() ? regionpicker.close() : regionpicker.open(); }
      else if (e.key === "f" || e.key === "F") mapview.fit(true);
      else if (e.key === "l" || e.key === "L") setLinks(!S.links);
      else if (e.key === "\\") toggleRail();
    });
  }

  CSM.app = { state: S, renderAll, setSelection, togglePin, focusStore, setTheme, setMode, setLinks, derive: () => S.D };
  boot().catch((e) => { console.error(e); util.toast(`지도를 여는 중 문제가 생겼습니다${e.message ? ` (${e.message})` : ""}. 앱을 닫고 다시 실행해 주세요.`, { error: true, ms: 10000 }); });
})(window.CSM);
