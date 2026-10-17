/* 우측 패널: 대리점 / 거래처 / 미해결 / 표 + 상세 카드 */
(function (CSM) {
  const { util } = CSM;
  const pn = {};
  let data = { stores: [], dealers: [] };
  let ctx = {};
  let h = {};
  let activeDealer = null;
  let dealerSort = "count";
  let query = "";
  let tableSort = { key: "dealer_name", dir: 1 };
  let els;

  pn.init = function (handlers) {
    h = handlers;
    els = {
      dealers: util.$("#dealer-list"), stores: util.$("#store-list"), issues: util.$("#issue-list"), table: util.$("#table"),
      detail: util.$("#detail"), storeHint: util.$("#store-hint"), tableHint: util.$("#table-hint"), sort: util.$("#dealer-sort"),
    };
    for (const tab of util.$$(".tab")) tab.addEventListener("click", () => pn.setTab(tab.dataset.tab));
    els.sort.addEventListener("click", () => {
      dealerSort = dealerSort === "count" ? "name" : "count";
      els.sort.textContent = dealerSort === "count" ? "거래처 수순" : "이름순";
      renderDealers();
    });
  };

  pn.setTab = function (name) {
    for (const t of util.$$(".tab")) { const on = t.dataset.tab === name; t.classList.toggle("is-active", on); t.setAttribute("aria-selected", on); }
    for (const p of util.$$(".tabpane")) p.classList.toggle("is-active", p.dataset.pane === name);
  };

  pn.render = function (d, c) {
    data = d; ctx = c;
    renderDealers(); renderStores(); renderIssues(); renderTable();
    util.$('[data-n="dealers"]').textContent = d.dealers.length;
    util.$('[data-n="stores"]').textContent = d.stores.length;
    const fixes = d.stores.filter(util.isFix).length + d.dealers.filter((x) => x.address && util.isFix(x)).length;
    util.$('[data-n="issues"]').textContent = fixes || "";
  };

  pn.setActive = function (dealerId) {
    activeDealer = dealerId;
    for (const row of util.$$(".row[data-dealer]", els.dealers)) row.classList.toggle("is-active", row.dataset.dealer === dealerId);
    if (dealerId) {
      const row = util.$(`.row[data-dealer="${dealerId}"]`, els.dealers);
      row && row.scrollIntoView({ block: "nearest", behavior: util.reduced() ? "auto" : "smooth" });
    }
  };

  pn.setQuery = function (q) { query = (q || "").trim().toLowerCase(); renderStores(); renderTable(); };

  function storesOf(dealerId) { return data.stores.filter((s) => s.dealer_id === dealerId); }
  function inSel(s) { return !ctx.selection.size || ctx.selection.has(s.sgg_code); }

  function renderDealers() {
    const list = [...data.dealers].sort((a, b) => dealerSort === "count"
      ? (b.store_ids.length - a.store_ids.length) || a.name.localeCompare(b.name, "ko")
      : a.name.localeCompare(b.name, "ko"));
    els.dealers.innerHTML = "";
    for (const d of list) {
      const stores = storesOf(d.id);
      const inside = stores.filter(inSel).length;
      const sub = [];
      if (d.address) sub.push(d.sgg_name || "주소 등록"); else sub.push("주소 미등록");
      if (ctx.selection.size) sub.push(`권역 내 ${inside}`);
      if (d.similar_to && d.similar_to.length) sub.push(`유사: ${d.similar_to.join(", ")}`);
      const row = util.h("button.row", {
        type: "button", "data-dealer": d.id,
        onclick: () => h.dealerClick && h.dealerClick(d),
        onmouseenter: () => h.dealerHover && h.dealerHover(d),
        onmouseleave: () => h.dealerLeave && h.dealerLeave(d),
        onfocus: () => h.dealerHover && h.dealerHover(d),
        onblur: () => h.dealerLeave && h.dealerLeave(d),
      }, [
        util.h("span.badge" + (d.address ? "" : ".badge--noaddr"), { style: `--c:${ctx.dealerColorOf(d)}` }, util.initials(d.name)),
        util.h("span", {}, [util.h("div.row__name", {}, d.name), util.h("div.row__sub", {}, sub.join(" · "))]),
        util.h("span.row__n", { html: `${stores.length}<small>곳</small>` }),
      ]);
      row.classList.toggle("is-active", d.id === activeDealer);
      els.dealers.append(util.h("li", {}, row));
    }
  }

  function matches(s) {
    if (!query) return true;
    return [s.name, s.dealer_name, s.address, s.sgg_name].some((v) => (v || "").toLowerCase().includes(query));
  }

  function renderStores() {
    const list = data.stores.filter(matches).sort((a, b) => a.dealer_name.localeCompare(b.dealer_name, "ko") || a.name.localeCompare(b.name, "ko"));
    els.stores.innerHTML = "";
    els.storeHint.textContent = query ? `검색 결과 ${list.length}곳` : `${list.length}곳 · 클릭하면 지도에서 찾습니다`;
    if (!list.length) els.stores.append(util.h("li.list__empty", {}, "일치하는 거래처가 없습니다"));
    let lastDealer = null;
    for (const s of list) {
      const d = data.dealers.find((x) => x.id === s.dealer_id);
      if (s.dealer_name !== lastDealer && !query) { lastDealer = s.dealer_name; }
      const tags = [];
      if (s.precision === "needs_fix") tags.push(util.h("span.pill.pill--fix", { title: s.reason || "" }, "정정 필요"));
      if (s.precision === "approx") tags.push(util.h("span.pill.pill--warn", {}, "근사"));
      if (s.precision === "failed") tags.push(util.h("span.pill.pill--err", {}, "실패"));
      if (s.precision === "manual") tags.push(util.h("span.pill.pill--ok", {}, "수동"));
      if (ctx.selection.size && s.lat != null && !inSel(s)) tags.push(util.h("span.pill.pill--out", {}, "권역 밖"));
      const row = util.h("button.row", {
        type: "button", "data-store": s.id,
        onclick: () => h.storeClick && h.storeClick(s),
        onmouseenter: () => h.storeHover && h.storeHover(s, true),
        onmouseleave: () => h.storeHover && h.storeHover(s, false),
      }, [
        util.h("span.badge", { style: `--c:${ctx.dealerColorOf(d)};width:22px;height:22px;font-size:9px` }, util.initials(s.dealer_name)),
        util.h("span", {}, [util.h("div.row__name", {}, s.name), util.h("div.row__sub", {}, `${s.dealer_name} · ${s.sgg_name || s.address || "주소 없음"}`)]),
        util.h("span.row__actions", {}, tags),
      ]);
      els.stores.append(util.h("li", {}, row));
    }
  }

  function issueRow(s, pill, sub) {
    const actions = [];
    if (!CSM.api.isStatic && s.dealer_id) {
      actions.push(util.h("button.btn.btn--ghost.btn--sm", { type: "button", onclick: (e) => { e.stopPropagation(); h.place && h.place(s); } }, "위치 지정"));
    }
    return util.h("li", {}, util.h("div.row", { tabindex: 0, role: "button", onclick: () => s.dealer_id && h.storeClick && h.storeClick(s) }, [
      pill,
      util.h("span", {}, [util.h("div.row__name", {}, s.name), util.h("div.row__sub", { title: s.address || "" }, sub)]),
      util.h("span.row__actions", {}, actions),
    ]));
  }

  function renderIssues() {
    els.issues.innerHTML = "";
    // 1) 정정 필요 — 주소 검색을 했지만 찾지 못함 / 주소 빈칸 (거래처 + 대리점)
    const fixStores = data.stores.filter(util.isFix).sort((a, b) => a.dealer_name.localeCompare(b.dealer_name, "ko") || a.name.localeCompare(b.name, "ko"));
    const fixDealers = data.dealers.filter((d) => d.address && util.isFix(d));
    const nFix = fixStores.length + fixDealers.length;
    const exportBtn = util.$("#btn-fix-export");
    if (exportBtn) { exportBtn.disabled = nFix === 0; exportBtn.textContent = nFix ? `정정 요청 목록 내보내기 (${nFix}건)` : "정정 요청 목록 내보내기"; }
    els.issues.append(util.h("li.group-head", {}, [util.h("b", {}, "정정 필요"), util.h("span", {}, ` ${nFix}건 · 주소 검색 결과가 없거나 주소가 비어 있음`)]));
    if (!nFix) els.issues.append(util.h("li.list__empty", {}, "정정이 필요한 주소가 없습니다 ✓"));
    const short = (r) => (!r || r.startsWith("주소 검색 결과 없음") ? (r && r.includes("시군구") ? "시군구 불명" : "결과 없음") : r === "주소 없음" ? "주소 없음" : r);
    for (const s of fixStores) {
      els.issues.append(issueRow(s, util.h("span.pill.pill--fix", { title: s.reason || "" }, short(s.reason)),
        `${s.dealer_name} · ${s.address || "주소 칸이 비어 있음"}`));
    }
    for (const d of fixDealers) {
      els.issues.append(issueRow(d, util.h("span.pill.pill--fix", { title: d.reason || "" }, "대리점"), `${short(d.reason)} · ${d.address}`));
    }
    // 2) 미확인 — 검색하지 않음(데모·키 없음·API 오류)
    const unverified = data.stores.filter((s) => s.precision === "approx" || s.precision === "failed");
    if (unverified.length) {
      els.issues.append(util.h("li.group-head", {}, [util.h("b", {}, "미확인"), util.h("span", {}, ` ${unverified.length}건 · 아직 주소 검색을 하지 않아 시군구 중심 부근에 둔 위치`)]));
      for (const s of unverified.slice(0, 200)) {
        els.issues.append(issueRow(s, util.h("span.pill" + (s.precision === "failed" ? ".pill--err" : ".pill--warn"), {}, s.precision === "failed" ? "실패" : "근사"),
          `${s.dealer_name} · ${s.address || "주소 없음"}`));
      }
    }
    if (data.warnings && data.warnings.length) {
      els.issues.append(util.h("li.warn-row", {}, "⚠ " + data.warnings.join(" / ")));
    }
  }

  const COLS = [
    ["dealer_name", "대리점"], ["name", "거래처"], ["sgg_name", "시군구"], ["address", "주소"], ["precision", "정밀도"], ["reason", "사유"], ["lat", "위도"], ["lng", "경도"],
  ];
  function renderTable() {
    const rows = data.stores.filter(matches).sort((a, b) => {
      const va = a[tableSort.key] ?? "", vb = b[tableSort.key] ?? "";
      return (typeof va === "number" ? va - vb : String(va).localeCompare(String(vb), "ko")) * tableSort.dir;
    });
    const thead = els.table.tHead, tbody = els.table.tBodies[0];
    thead.innerHTML = ""; tbody.innerHTML = "";
    const tr = util.h("tr");
    for (const [key, label] of COLS) {
      const th = util.h("th", { onclick: () => { tableSort = { key, dir: tableSort.key === key ? -tableSort.dir : 1 }; renderTable(); } },
        label + (tableSort.key === key ? (tableSort.dir > 0 ? " ↑" : " ↓") : ""));
      th.classList.toggle("is-sorted", tableSort.key === key);
      tr.append(th);
    }
    thead.append(tr);
    for (const s of rows) {
      const r = util.h("tr", { onclick: () => h.storeClick && h.storeClick(s) });
      for (const [key] of COLS) {
        let v = s[key];
        if (key === "precision") v = util.precisionLabel[v] || v;
        if ((key === "lat" || key === "lng") && v != null) v = Number(v).toFixed(5);
        r.append(util.h("td" + (key === "lat" || key === "lng" ? ".num" : ""), {}, v ?? ""));
      }
      tbody.append(r);
    }
    els.tableHint.textContent = `${rows.length}행 · 열 제목을 눌러 정렬`;
  }

  /** 상세 카드 */
  pn.showDealer = function (d) {
    const stores = storesOf(d.id);
    const withXY = stores.filter((s) => s.lat != null);
    const avg = d.lat != null && withXY.length ? (withXY.reduce((a, s) => a + util.haversine(d, s), 0) / withXY.length).toFixed(1) + " km" : "–";
    const regionsCount = new Set(stores.map((s) => s.sgg_code).filter(Boolean)).size;
    els.detail.hidden = false;
    els.detail.innerHTML = "";
    els.detail.append(
      util.h("h3", {}, [util.h("span.badge", { style: `--c:${ctx.dealerColorOf(d)}` }, util.initials(d.name)), d.name,
        util.h("button.detail__close", { type: "button", "aria-label": "닫기", onclick: () => h.closeDetail && h.closeDetail() }, "×")]),
      util.h("dl", {}, [
        util.h("dt", {}, "주소"), util.h("dd", {}, d.address || "미등록"),
        util.h("dt", {}, "납품 거래처"), util.h("dd", {}, `${stores.length}곳 · 시군구 ${regionsCount}개`),
        util.h("dt", {}, "평균 거리"), util.h("dd", {}, avg),
        ...(d.similar_to && d.similar_to.length ? [util.h("dt", {}, "유사 명칭"), util.h("dd", {}, d.similar_to.join(", "))] : []),
      ]),
      util.h("div.detail__stores", {}, stores.map((s) => util.h("button", { type: "button", onclick: () => h.storeClick && h.storeClick(s) }, s.name))),
    );
  };
  pn.showStore = function (s) {
    const d = data.dealers.find((x) => x.id === s.dealer_id);
    els.detail.hidden = false;
    els.detail.innerHTML = "";
    els.detail.append(
      util.h("h3", {}, [s.name, util.h("button.detail__close", { type: "button", "aria-label": "닫기", onclick: () => h.closeDetail && h.closeDetail() }, "×")]),
      util.h("dl", {}, [
        util.h("dt", {}, "대리점"), util.h("dd", {}, d ? d.name : s.dealer_name),
        util.h("dt", {}, "주소"), util.h("dd", {}, s.address || "없음"),
        util.h("dt", {}, "권역"), util.h("dd", {}, s.sgg_name ? `${s.sido} ${s.sgg_name}` : "미확정"),
        util.h("dt", {}, "좌표"), util.h("dd", {}, s.lat != null ? `${s.lat.toFixed(5)}, ${s.lng.toFixed(5)} (${util.precisionLabel[s.precision]})` : "없음"),
        ...(d && d.lat != null && s.lat != null ? [util.h("dt", {}, "대리점 거리"), util.h("dd", {}, util.haversine(d, s).toFixed(1) + " km")] : []),
        util.h("dt", {}, "출처"), util.h("dd", {}, `${s.source} ${s.row}행`),
      ]),
    );
  };
  pn.hideDetail = function () { els.detail.hidden = true; };

  CSM.panel = pn;
})(window.CSM);
