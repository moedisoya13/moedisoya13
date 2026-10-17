/* 앱 오케스트레이션: 데이터 로드 → 지도/필터/패널 렌더 → 상호작용(거미줄·가장자리·검색·설정) */
(function (CSM) {
  const { util, api, mapview, markers, spider, edge, filters, panel } = CSM;
  const S = {
    data: null, config: {}, theme: "light", colorMode: "focus", tiles: false, ghost: true, labels: true,
    selection: new Set(), pinned: null, hover: null, placing: null, searchIds: null, firstRender: true,
  };
  const root = document.getElementById("app");
  const LS = {
    get: (k, d) => { try { const v = localStorage.getItem("csm:" + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set: (k, v) => { try { localStorage.setItem("csm:" + k, JSON.stringify(v)); } catch { /* 저장 불가 환경 */ } },
  };

  // ---------- 색 ----------
  const dealerColorOf = (d) => (!d ? util.cssVar("--dot-store") : S.colorMode === "dealer" ? util.dealerColor(d.color_idx, S.theme === "dark") : util.cssVar("--dot-store"));

  // ---------- 가시 집합 ----------
  function visibleStoreIds() {
    const ids = new Set();
    for (const s of S.data.stores) if (s.lat != null && (!S.selection.size || S.selection.has(s.sgg_code))) ids.add(s.id);
    return ids;
  }
  function outsideStores() {
    if (!S.selection.size) return [];
    return S.data.stores.filter((s) => s.lat != null && !S.selection.has(s.sgg_code));
  }

  // ---------- 렌더 ----------
  function renderAll({ fit = false } = {}) {
    const d = S.data;
    const ctx = { visibleIds: visibleStoreIds(), colorMode: S.colorMode, dark: S.theme === "dark", dealerColorOf, selection: S.selection };
    const counts = new Map();
    for (const s of d.stores) if (s.sgg_code) counts.set(s.sgg_code, (counts.get(s.sgg_code) || 0) + 1);
    mapview.setCounts(counts);
    markers.render(d, ctx);
    const dealers = new Map(d.dealers.map((x) => [x.id, x]));
    edge.setItems(outsideStores().map((s) => ({ id: s.id, lat: s.lat, lng: s.lng, name: s.name, dealerId: s.dealer_id, dealerName: s.dealer_name, color: dealerColorOf(dealers.get(s.dealer_id)), sgg: s.sgg_name })));
    panel.render(d, ctx);
    filters.setData(d.stores);
    renderKpis(); renderSummary(); renderInfo();
    if (S.pinned) applyFocus(S.pinned, true);
    if (fit) mapview.fitSelectionOrAll(d.stores.filter((s) => s.lat != null).map((s) => [s.lat, s.lng]));
  }

  function renderKpis() {
    const d = S.data, sel = S.selection.size > 0;
    const stores = d.stores, inside = stores.filter((s) => sel ? S.selection.has(s.sgg_code) : true);
    const withAddr = stores.filter((s) => s.address);
    const good = stores.filter((s) => ["exact", "keyword", "manual"].includes(s.precision)).length;
    const approx = stores.filter((s) => s.precision === "approx").length;
    const failed = withAddr.filter((s) => s.precision === "failed").length;
    const regionsAll = new Set(stores.map((s) => s.sgg_code).filter(Boolean)).size;
    const dealersWithAddr = d.dealers.filter((x) => x.address).length;
    const dealersInside = sel ? new Set(inside.map((s) => s.dealer_id)).size : d.dealers.length;

    const k = (name) => util.$(`.kpi[data-kpi="${name}"]`);
    for (const el of util.$$(".kpi")) el.classList.toggle("is-filtered", sel);
    util.countUp(k("stores").querySelector("[data-count]"), inside.length);
    const outside = sel ? stores.filter((s) => s.lat != null && !S.selection.has(s.sgg_code)).length : 0;
    k("stores").querySelector("[data-compare]").innerHTML = sel ? `전체 ${util.fmt(stores.length)} 중 <b>${util.pct(inside.length, stores.length)}%</b> · 권역 밖 <b>${outside}</b>` : "전체";
    util.countUp(k("dealers").querySelector("[data-count]"), dealersInside);
    k("dealers").querySelector("[data-compare]").textContent = sel ? `전체 ${d.dealers.length} · 주소 등록 ${dealersWithAddr}` : `주소 등록 ${dealersWithAddr}`;
    util.countUp(k("regions").querySelector("[data-count]"), sel ? S.selection.size : regionsAll);
    k("regions").querySelector("[data-compare]").textContent = sel ? `전체 ${regionsAll}개 권역 중` : "거래처가 있는 시군구";
    util.countUp(k("quality").querySelector("[data-count]"), util.pct(good, withAddr.length));
    k("quality").querySelector("[data-compare]").innerHTML = `근사 <b>${approx}</b> · 실패 <b>${failed}</b>`;

    const files = d.files || [];
    const when = files.map((f) => f.modified.replace("T", " ").slice(0, 16)).join(", ");
    util.$("#kpi-meta").innerHTML = `기준 시점<br>${util.esc(when || "–")}<br><span style="color:var(--text-muted)">${util.esc(files.map((f) => f.name).join(", "))}</span>`;
  }

  function renderSummary() {
    const d = S.data;
    const counts = new Map();
    for (const s of d.stores) if (s.sgg_name) counts.set(s.sgg_name, (counts.get(s.sgg_name) || 0) + 1);
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    const approx = d.stores.filter((s) => s.precision === "approx").length;
    const failed = d.stores.filter((s) => s.precision === "failed").length;
    const parts = [`거래처 ${util.fmt(d.stores.length)}곳`, `대리점 ${d.dealers.length}곳`];
    if (top) parts.push(`${top[0]} ${top[1]}곳 최다`);
    if (d.meta && d.meta.demo) parts.push("근사 좌표(데모)");
    else if (approx || failed) parts.push(`미해결 ${approx + failed}건`);
    if (S.selection.size) parts.push(`선택 권역 ${S.selection.size}개`);
    util.$("#summary").textContent = parts.join(" · ");
  }

  function renderInfo() {
    const d = S.data, m = d.meta || {};
    const files = (d.files || []).map((f) => `${f.name} (${f.sheet}, 수정 ${f.modified.replace("T", " ").slice(0, 16)})`).join(", ");
    util.$("#info-source").textContent = `출처 ${files || "–"}`;
    util.$("#info-geo").textContent = `지오코딩 ${m.provider || "–"}${m.cache_size ? ` · 캐시 ${m.cache_size}` : ""} · 생성 ${(m.generated_at || "").replace("T", " ").slice(0, 16)}`;
    const b = m.boundaries || {};
    util.$("#info-bnd").textContent = `경계 행정구역 ver${b.version || "?"} (통계청 자료 기반 vuski/admdongkor 가공)`;
    const approx = d.stores.filter((s) => s.precision === "approx").length, failed = d.stores.filter((s) => s.precision === "failed").length;
    const notes = [`근사 ${approx}`, `실패 ${failed}`];
    if (d.warnings && d.warnings.length) notes.push(`경고 ${d.warnings.length}`);
    if (m.last_error) notes.push(`오류: ${m.last_error}`);
    util.$("#info-notes").textContent = `주석 ${notes.join(" · ")}`;
    util.$("#info-attrib").innerHTML = S.tiles ? mapview.TILES_ATTRIB : "";
  }

  // ---------- 포커스(거미줄) ----------
  function applyFocus(dealerId, pinned) {
    const d = S.data.dealers.find((x) => x.id === dealerId);
    if (!d) return;
    markers.setFocus(dealerId); edge.setFocus(dealerId);
    panel.setActive(dealerId);
    if (d.lat == null) { spider.hide(); return; }
    const vis = markers.visibleStoreIds();
    const targets = [];
    for (const s of S.data.stores) {
      if (s.dealer_id !== dealerId || s.lat == null) continue;
      if (vis.has(s.id)) targets.push({ latlng: [s.lat, s.lng] });
      else targets.push({ point: () => edge.positionFor(s.id), dashed: true });
    }
    spider.show(d, targets, { pinned, color: S.colorMode === "dealer" ? dealerColorOf(d) : null });
  }
  function clearFocus() {
    if (S.pinned) { applyFocus(S.pinned, true); return; }
    markers.setFocus(null); edge.setFocus(null); spider.hide(); panel.setActive(null);
  }
  function togglePin(d) {
    if (S.pinned === d.id) { S.pinned = null; markers.setPinned(null); clearFocus(); panel.hideDetail(); return; }
    S.pinned = d.id; markers.setPinned(d.id); applyFocus(d.id, true); panel.showDealer(d);
    const stores = S.data.stores.filter((s) => s.dealer_id === d.id && s.lat != null);
    const pts = stores.map((s) => [s.lat, s.lng]); if (d.lat != null) pts.push([d.lat, d.lng]);
    const inSel = pts.length && (!S.selection.size || stores.some((s) => S.selection.has(s.sgg_code)));
    if (pts.length && !inSel) mapview.fitBounds(L.latLngBounds(pts), true, [60, 60]);
  }

  // ---------- 선택 적용 ----------
  function applySelection(codes, presetName) {
    S.selection = new Set(codes);
    if (S.pinned && !S.data.dealers.some((d) => d.id === S.pinned)) S.pinned = null;
    mapview.setSelection(S.selection, { fit: true });
    renderAll();
    LS.set("selection", [...S.selection]);
    LS.set("activePreset", presetName || null);
    if (!api.isStatic) api.config({ active_preset: presetName || null, presets: filters.presets() }).catch(() => {});
  }

  // ---------- 테마/모드 ----------
  function setTheme(t, { save = true } = {}) {
    S.theme = t; document.documentElement.dataset.theme = t;
    if (save) { LS.set("theme", t); if (!api.isStatic) api.config({ theme: t }).catch(() => {}); }
    if (S.data && mapview.map()) { mapview.restyle(); if (S.tiles) mapview.setTiles(true, t); renderAll(); }
  }
  function setColorMode(m, { save = true } = {}) {
    S.colorMode = m; root.dataset.mode = m;
    util.$("#btn-colormode").setAttribute("aria-pressed", m === "dealer");
    if (save) { LS.set("colorMode", m); if (!api.isStatic) api.config({ color_mode: m }).catch(() => {}); }
    if (S.data && mapview.map()) renderAll();
  }
  function setTiles(on, { save = true } = {}) {
    S.tiles = !!on; mapview.setTiles(S.tiles, S.theme);
    util.$("#btn-tiles").setAttribute("aria-pressed", S.tiles);
    if (save) { LS.set("tiles", S.tiles); if (!api.isStatic) api.config({ tiles: S.tiles }).catch(() => {}); }
    if (S.data) renderInfo();
  }

  // ---------- 지오코딩 상태 ----------
  const geo = { el: util.$("#geostatus"), fill: util.$("#geofill"), text: util.$("#geotext"), btn: util.$("#btn-geocode") };
  function setGeoStatus(state, done, total, msg) {
    geo.el.classList.remove("is-running", "is-done", "is-error");
    if (state === "running") { geo.el.classList.add("is-running"); geo.fill.style.width = `${total ? (done / total) * 100 : 5}%`; geo.text.textContent = `지오코딩 ${done}/${total}`; geo.btn.disabled = true; }
    else if (state === "done") { geo.el.classList.add("is-done"); geo.fill.style.width = "100%"; geo.text.textContent = msg || "완료"; geo.btn.disabled = false; }
    else if (state === "error") { geo.el.classList.add("is-error"); geo.text.textContent = msg || "오류"; geo.btn.disabled = false; }
    else { geo.fill.style.width = "0%"; geo.text.textContent = msg || "대기"; geo.btn.disabled = false; }
  }

  // ---------- 검색 ----------
  function search(q) {
    panel.setQuery(q);
    const query = q.trim().toLowerCase();
    if (!query) { S.searchIds = null; markers.setSearch(null); if (!S.pinned) markers.setFocus(null); return; }
    const ids = new Set(S.data.stores.filter((s) => [s.name, s.dealer_name, s.address, s.sgg_name].some((v) => (v || "").toLowerCase().includes(query))).map((s) => s.id));
    S.searchIds = ids; markers.setSearch(ids);
    if (panel) panel.setTab("stores");
  }
  function focusStore(s) {
    if (s.lat == null) { util.toast(`「${s.name}」은 좌표가 없어 지도에 표시되지 않습니다.`); panel.showStore(s); return; }
    const map = mapview.map();
    const m = markers.store(s.id);
    panel.showStore(s);
    const go = () => { const mk = markers.store(s.id); if (mk) { mk.openTooltip(); markers.hit(s.id, true); setTimeout(() => markers.hit(s.id, false), 1600); } };
    if (!m) {
      // 선택 권역 밖이면 그 점이 보이게 일시 확장
      const b = mapview.selectionBounds();
      const target = b ? b.extend([s.lat, s.lng]) : L.latLngBounds([[s.lat, s.lng]]);
      mapview.map().setMaxBounds(null);
      mapview.fitBounds(target, true, [60, 60]);
      util.toast("선택 권역 밖 거래처입니다 — 잠시 넓혀 보여줍니다.");
      return;
    }
    if (!map.getBounds().contains([s.lat, s.lng]) || map.getZoom() < 12) map.flyTo([s.lat, s.lng], Math.max(map.getZoom(), 13), { duration: 0.8 });
    map.once("moveend", go); setTimeout(go, 50);
  }

  // ---------- 위치 지정 ----------
  function startPlacing(s) {
    S.placing = s;
    util.$("#placing").hidden = false; util.$("#placing-name").textContent = s.name;
    mapview.map().getContainer().classList.add("is-placing");
    panel.showStore(s);
  }
  function stopPlacing() { S.placing = null; util.$("#placing").hidden = true; mapview.map().getContainer().classList.remove("is-placing"); }

  // ---------- 내보내기 ----------
  function csvText() {
    const rows = [["대리점명", "거래처명", "주소", "시도", "시군구", "위도", "경도", "정밀도"]];
    for (const s of S.data.stores) rows.push([s.dealer_name, s.name, s.address, s.sido, s.sgg_name, s.lat ?? "", s.lng ?? "", util.precisionLabel[s.precision]]);
    return util.csv(rows);
  }
  async function doExport(kind) {
    try {
      if (kind === "csv-dl") { util.download(`CSM_geocoded_${new Date().toISOString().slice(0, 10)}.csv`, csvText()); return; }
      const r = await api.exportFile(kind);
      util.toast(`저장됨: ${r.path}`, { ms: 6000 });
    } catch (e) { util.toast("내보내기 실패: " + e.message, { error: true }); }
  }

  // ---------- 부트 ----------
  async function boot() {
    root.classList.add("is-loading");
    if (api.isStatic) root.dataset.static = "1";
    // 저장된 표시 설정 (정적: localStorage, 앱: config.json 이 우선)
    let cfg = {};
    if (!api.isStatic) {
      try { const st = await api.state(); cfg = st.config || {}; S.data = st.data; S.config = cfg; } catch (e) { util.toast("서버에 연결할 수 없습니다: " + e.message, { error: true }); }
    } else { S.data = window.CSM_DATA; }
    const theme = cfg.theme || LS.get("theme", window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    setTheme(theme, { save: false });

    const topo = await api.boundaries();
    const map = mapview.init("map", topo, {
      onRegionClick: (r) => {
        if (S.placing) return;
        if (filters.counts().get(r.code)) { filters.toggle(r.code); util.toast(`${r.display} ${filters.draft().has(r.code) ? "선택" : "해제"} — 「적용」을 눌러 반영`); }
      },
    });
    markers.init(map); spider.init(map);
    edge.init(map, util.$("#edge-layer"), {
      click: (members) => {
        const b = mapview.selectionBounds() || map.getBounds();
        for (const m of members) b.extend([m.lat, m.lng]);
        map.setMaxBounds(null);
        mapview.fitBounds(b, true, [60, 60]);
        util.toast(`권역 밖 거래처 ${members.length}곳이 보이게 넓혔습니다. 「⤢」로 돌아갑니다.`);
      },
      hover: (members, on) => { for (const m of members) markers.hit(m.id, on); },
    });
    filters.init(mapview.regions(), {
      apply: applySelection,
      draft: () => {},
      presets: (list, active) => { LS.set("presets", list); if (!api.isStatic) api.config({ presets: list, active_preset: active }).catch(() => {}); },
    });
    panel.init({
      dealerClick: (d) => togglePin(d),
      dealerHover: (d) => { if (!S.pinned) applyFocus(d.id, false); },
      dealerLeave: () => clearFocus(),
      storeClick: (s) => focusStore(s),
      storeHover: (s, on) => markers.hit(s.id, on),
      place: (s) => startPlacing(s),
      closeDetail: () => { panel.hideDetail(); if (S.pinned) { S.pinned = null; markers.setPinned(null); clearFocus(); } },
    });
    markers.on("dealerHover", (d) => { if (!S.pinned) applyFocus(d.id, false); });
    markers.on("dealerLeave", () => clearFocus());
    markers.on("dealerClick", (d) => togglePin(d));
    markers.on("storeClick", (s) => { panel.showStore(s); });
    markers.on("storeHover", (s) => { if (!S.pinned && !S.hover) { const d = S.data.dealers.find((x) => x.id === s.dealer_id); if (d && d.lat != null) { S.hover = s.id; spider.show(d, [{ latlng: [s.lat, s.lng] }]); markers.setFocus(d.id); } } });
    markers.on("storeLeave", () => { if (S.hover) { S.hover = null; clearFocus(); } });

    map.on("click", async (e) => {
      if (!S.placing) return;
      const s = S.placing; stopPlacing();
      try { const r = await api.override(s.id, e.latlng.lat, e.latlng.lng); S.data = r.data; renderAll(); util.toast(`「${s.name}」 위치를 저장했습니다 (overrides.json)`); }
      catch (err) { util.toast("저장 실패: " + err.message, { error: true }); }
    });

    // 표시 옵션 복원
    setColorMode(cfg.color_mode || LS.get("colorMode", "focus"), { save: false });
    setTiles(cfg.tiles ?? LS.get("tiles", false), { save: false });
    S.ghost = LS.get("ghost", true); mapview.setGhost(S.ghost);
    S.labels = LS.get("labels", true); mapview.setLabels(S.labels);
    filters.setPresets(cfg.presets && cfg.presets.length ? cfg.presets : LS.get("presets", []), cfg.active_preset ?? LS.get("activePreset", null));

    root.classList.remove("is-loading");
    const saved = LS.get("selection", []);
    const active = cfg.active_preset ?? LS.get("activePreset", null);
    const preset = filters.presets().find((p) => p.name === active);
    const initial = preset ? preset.regions : saved;
    renderAll({ fit: !initial.length });
    if (initial.length) { filters.setApplied(initial, { silent: true }); applySelection(initial, preset ? preset.name : null); }

    // 지오코딩 상태 / SSE
    const m = S.data.meta || {};
    if (api.isStatic) setGeoStatus("done", 0, 0, m.demo ? "근사 좌표" : "좌표 확정");
    else {
      if (m.geocoded) setGeoStatus("done", 0, 0, m.demo ? "근사 좌표" : "완료");
      else setGeoStatus("idle", 0, 0, cfg.has_key || m.demo ? "준비" : "키 없음");
      api.events({
        progress: (p) => setGeoStatus("running", p.done, p.total),
        done: (p) => { S.data = p.data; renderAll({ fit: S.firstRender && !S.selection.size }); S.firstRender = false; setGeoStatus("done", 0, 0, "완료"); util.toast("지오코딩 완료"); },
        error: (p) => { setGeoStatus("error", 0, 0, "오류"); util.toast(p.message, { error: true, ms: 6000 }); },
      });
      setInterval(() => api.ping(), 10000);
      api.ping();
    }
    bindUI();
  }

  function bindUI() {
    util.$("#btn-theme").addEventListener("click", () => setTheme(S.theme === "dark" ? "light" : "dark"));
    util.$("#btn-colormode").addEventListener("click", () => setColorMode(S.colorMode === "dealer" ? "focus" : "dealer"));
    util.$("#btn-tiles").addEventListener("click", () => setTiles(!S.tiles));
    util.$("#btn-zoom-in").addEventListener("click", () => mapview.map().zoomIn());
    util.$("#btn-zoom-out").addEventListener("click", () => mapview.map().zoomOut());
    util.$("#btn-fit").addEventListener("click", () => { mapview.setSelection(S.selection, { fit: true }); if (!S.selection.size) mapview.fitSelectionOrAll(S.data.stores.filter((s) => s.lat != null).map((s) => [s.lat, s.lng])); });
    util.$("#btn-geocode").addEventListener("click", async () => {
      try { const r = await api.geocode(false); if (!r.started) util.toast("이미 진행 중입니다."); else setGeoStatus("running", 0, 0); }
      catch (e) { util.toast(e.message, { error: true }); }
    });
    util.$("#placing-cancel").addEventListener("click", stopPlacing);

    // 내보내기 메뉴
    const exportBtn = util.$("#btn-export"), menu = util.$("#export-menu");
    exportBtn.addEventListener("click", () => { menu.hidden = !menu.hidden; exportBtn.setAttribute("aria-expanded", !menu.hidden); });
    document.addEventListener("click", (e) => { if (!e.target.closest(".menu")) { menu.hidden = true; exportBtn.setAttribute("aria-expanded", "false"); } });
    for (const b of util.$$("[data-export]")) b.addEventListener("click", () => { menu.hidden = true; doExport(b.dataset.export); });

    // 검색
    const input = util.$("#search");
    input.addEventListener("input", util.debounce(() => search(input.value), 120));
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && S.searchIds && S.searchIds.size) { const s = S.data.stores.find((x) => S.searchIds.has(x.id)); if (s) focusStore(s); }
      if (e.key === "Escape") { input.value = ""; search(""); input.blur(); }
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "/" && document.activeElement !== input && !e.target.closest("input,select,textarea,dialog")) { e.preventDefault(); input.focus(); }
      if (e.key === "Escape") {
        if (S.placing) stopPlacing();
        else if (S.pinned) { S.pinned = null; markers.setPinned(null); clearFocus(); panel.hideDetail(); }
      }
    });

    // 설정
    const dlg = util.$("#settings");
    util.$("#btn-settings").addEventListener("click", () => {
      util.$("#api-key").value = ""; util.$("#api-key").placeholder = S.config.has_key ? `등록됨 (${S.config.api_key_masked}) — 바꾸려면 입력` : "developers.kakao.com → 내 애플리케이션 → REST API 키";
      util.$("#set-theme").value = S.theme; util.$("#set-colormode").value = S.colorMode;
      util.$("#set-tiles").checked = S.tiles; util.$("#set-ghost").checked = S.ghost; util.$("#set-labels").checked = S.labels;
      dlg.showModal();
    });
    util.$("#settings-cancel").addEventListener("click", () => dlg.close());
    util.$("#settings-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      setTheme(util.$("#set-theme").value); setColorMode(util.$("#set-colormode").value); setTiles(util.$("#set-tiles").checked);
      S.ghost = util.$("#set-ghost").checked; mapview.setGhost(S.ghost); LS.set("ghost", S.ghost);
      S.labels = util.$("#set-labels").checked; mapview.setLabels(S.labels); LS.set("labels", S.labels);
      const key = util.$("#api-key").value.trim();
      dlg.close();
      if (key && !api.isStatic) {
        try {
          const r = await api.config({ api_key: key }); S.config = r.config;
          util.toast("API 키를 저장했습니다. 지오코딩을 시작합니다.");
          await api.geocode(false); setGeoStatus("running", 0, 0);
        } catch (err) { util.toast(err.message, { error: true }); }
      }
    });
    util.$("#btn-regeocode").addEventListener("click", async () => {
      if (!confirm("캐시를 무시하고 모든 주소를 다시 조회합니다. 계속할까요?")) return;
      dlg.close();
      try { await api.geocode(true); setGeoStatus("running", 0, 0); } catch (err) { util.toast(err.message, { error: true }); }
    });
    util.$("#btn-defs").addEventListener("click", () => util.$("#defs").showModal());
    util.$("#defs-close").addEventListener("click", () => util.$("#defs").close());
  }

  CSM.app = { state: S, renderAll, applySelection, focusStore, togglePin, setTheme, setColorMode };
  boot().catch((e) => { console.error(e); util.toast("초기화 실패: " + e.message, { error: true, ms: 8000 }); });
})(window.CSM);
