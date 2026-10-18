/* 오른쪽 시트 — 주소 정정 필요 목록 / 전체 목록 표 */
(function (CSM) {
  const { util } = CSM;
  const sheet = {};
  let els, H = {}, mode = null, tableSort = { key: "dealer_name", dir: 1 }, tableQ = "", tableScope = true, last = null, undismiss = null;

  sheet.init = function (handlers) {
    H = handlers;
    els = { root: util.$("#sheet"), eyebrow: util.$("#sheet-eyebrow"), title: util.$("#sheet-title"), tools: util.$("#sheet-tools"), body: util.$("#sheet-body") };
    util.$("#sheet-close").addEventListener("click", () => sheet.close());
  };
  sheet.isOpen = () => !els.root.hidden;
  sheet.mode = () => mode;
  sheet.close = function () {
    els.root.hidden = true; mode = null;
    if (undismiss) { undismiss(); undismiss = null; }
  };
  function open(m, wide) {
    mode = m;
    els.root.hidden = false;
    els.root.classList.toggle("is-wide", !!wide);
    els.root.style.animation = "none"; void els.root.offsetWidth; els.root.style.animation = "";
    if (!undismiss) undismiss = util.dismissable(els.root, document.querySelector(".rail__foot"), () => sheet.close());
  }
  sheet.refresh = function (D, hexOf) {
    if (!mode) return;
    if (mode === "fix") sheet.openFix(D, hexOf, { keep: true });
    else sheet.openTable(D, hexOf, { keep: true });
  };

  /* ── 정정 필요 ── */
  sheet.openFix = function (D, hexOf, { keep = false } = {}) {
    last = { D, hexOf };
    const scroll = keep ? els.body.scrollTop : 0;
    open("fix", false);
    const fixStores = D.stores.filter(util.isFix).sort((a, b) => a.dealer_name.localeCompare(b.dealer_name, "ko") || a.name.localeCompare(b.name, "ko"));
    const fixDealers = D.dealers.filter((d) => d.address && util.isFix(d));
    const unverified = D.stores.filter((s) => s.precision === "approx" || s.precision === "failed");
    const n = fixStores.length + fixDealers.length;
    els.eyebrow.textContent = "주소 정정";
    els.title.textContent = n ? `정정이 필요한 주소 ${n}건` : "정정할 주소가 없습니다";
    els.tools.innerHTML = "";
    els.tools.append(util.h("p.desc", {}, "카카오 주소 검색에서 위치를 찾지 못한 주소입니다. 거래처명으로 대신 찾지 않고 따로 모았습니다. 지도에는 주소상 시군구 중심 부근에 흐린 점선 마름모로만 표시됩니다."));
    if (!CSM.api.isStatic) {
      const b = util.h("button.btn.btn--ink", { type: "button", disabled: n ? null : true, onclick: () => H.export && H.export("corrections") }, `정정 요청 엑셀 만들기${n ? ` (${n}건)` : ""}`);
      els.tools.append(b, util.h("span.desc", { style: "flex-basis:auto" }, "노란 「수정 주소」 칸을 담당자가 채워 회신하면 CSM.xlsx 에 반영하세요."));
    }
    els.body.innerHTML = "";
    if (!n) els.body.append(util.h("div.sheet__empty", {}, [util.h("b", {}, "✓"), "모든 거래처·대리점 주소의 위치를 찾았습니다."]));
    if (fixStores.length) {
      els.body.append(util.h("div.sheet__group", {}, [util.h("span", {}, `거래처 ${fixStores.length}건`), util.h("span", {}, "대리점순")]));
      for (const s of fixStores) els.body.append(fixRow(s, D, hexOf));
    }
    if (fixDealers.length) {
      els.body.append(util.h("div.sheet__group", {}, `대리점 거점 ${fixDealers.length}건`));
      for (const d of fixDealers) els.body.append(util.h("div.fx", { style: `--c:${hexOf(d)}` }, [
        util.h("i"), util.h("div", {}, [util.h("b", {}, d.name), util.h("small", {}, "대리점 거점 (I열)"), util.h("p", {}, d.address)]),
        util.h("div.fx__act", {}, util.h("span.tag.tag--fix", {}, d.reason || "주소 검색 결과 없음")),
      ]));
    }
    if (unverified.length) {
      els.body.append(util.h("div.sheet__group", {}, [util.h("span", {}, `아직 검색 전 ${unverified.length}건`), util.h("span", {}, "키 설정 후 자동 검색")]));
      for (const s of unverified.slice(0, 300)) els.body.append(fixRow(s, D, hexOf, true));
    }
    els.body.scrollTop = scroll;
  };

  function fixRow(s, D, hexOf, unverified) {
    const d = D.dealersById.get(s.dealer_id);
    const acts = [util.h("span.tag" + (unverified ? ".tag--approx" : ".tag--fix"), {}, unverified ? util.precisionLabel[s.precision] : (s.reason || "주소 검색 결과 없음"))];
    const btns = [];
    if (s.lat != null) btns.push(util.h("button.btn.btn--sm.btn--ghost", { type: "button", onclick: () => H.store && H.store(s) }, "지도"));
    if (!CSM.api.isStatic) btns.push(util.h("button.btn.btn--sm", { type: "button", onclick: () => H.place && H.place(s) }, "위치 지정"));
    acts.push(util.h("span", { style: "display:flex;gap:4px" }, btns));
    return util.h("div.fx", { style: `--c:${hexOf(d)}` }, [
      util.h("i"),
      util.h("div", {}, [util.h("b", {}, s.name), util.h("small", {}, `${d ? d.name : s.dealer_name}${s.sgg_name ? ` · ${s.sgg_name}` : ""} · ${s.source} ${s.row}행`), util.h("p", {}, s.address || "주소 칸이 비어 있음")]),
      util.h("div.fx__act", {}, acts),
    ]);
  }

  /* ── 표 ── */
  const COLS = [["dealer_name", "대리점"], ["name", "거래처"], ["sgg_name", "시군구"], ["address", "주소"], ["precision", "위치"], ["lat", "위도"], ["lng", "경도"]];
  sheet.openTable = function (D, hexOf, { keep = false } = {}) {
    last = { D, hexOf };
    const scroll = keep ? els.body.scrollTop : 0;
    open("table", true);
    if (!keep || !els.tools.querySelector(".mini-search")) {
      els.tools.innerHTML = "";
      const input = util.h("input", { type: "search", placeholder: "이 표에서 찾기 · 이름·대리점·주소", value: tableQ });
      input.addEventListener("input", util.debounce(() => { tableQ = input.value.trim().toLowerCase(); renderTable(); }, 120));
      const scope = util.h("input", { type: "checkbox", id: "table-scope-in" });
      scope.checked = tableScope;
      scope.addEventListener("change", () => { tableScope = scope.checked; renderTable(); });
      els.tools.append(
        util.h("label.mini-search", {}, [util.h("span", { html: '<svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="8.6" cy="8.6" r="5.4"/><path d="m12.8 12.8 4 4"/></svg>' }), input]),
        util.h("label.chip-check", { id: "table-scope" }, [scope, util.h("span.box"), util.h("span", { id: "table-scope-text" }, "이 권역만")]),
        util.h("span.desc", { id: "table-count", style: "flex-basis:auto" }, ""),
        util.h("button.btn.btn--sm", { type: "button", onclick: () => H.export && H.export("csv-dl") }, "CSV 내려받기"),
      );
    }
    renderTable();
    els.body.scrollTop = scroll;
  };

  function renderTable() {
    const { D, hexOf } = last;
    const q = tableQ;
    const scoped = D.hasSelection && tableScope;
    const base = scoped ? D.scopeStores : D.stores;
    els.eyebrow.textContent = scoped ? "이 권역 목록" : "전체 목록";
    els.title.textContent = `거래처 ${util.fmt(base.length)}곳${scoped ? ` / ${util.fmt(D.stores.length)}` : ""}`;
    const sc = util.$("#table-scope");
    if (sc) { sc.hidden = !D.hasSelection; util.$("#table-scope-text").textContent = `이 권역만 (${util.fmt(D.scopeStores.length)})`; }
    const rows = base.filter((s) => !q || [s.name, s.dealer_name, s.address, s.sgg_name].some((v) => (v || "").toLowerCase().includes(q)))
      .sort((a, b) => {
        const va = a[tableSort.key] ?? "", vb = b[tableSort.key] ?? "";
        return (typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb), "ko")) * tableSort.dir;
      });
    const cnt = util.$("#table-count");
    if (cnt) cnt.textContent = q ? `${rows.length}곳 찾음` : `${rows.length}행 · 제목을 누르면 정렬`;
    const table = util.h("table.tbl");
    const tr = util.h("tr");
    for (const [key, label] of COLS) {
      const th = util.h("th", { scope: "col", onclick: () => { tableSort = { key, dir: tableSort.key === key ? -tableSort.dir : 1 }; renderTable(); } },
        label + (tableSort.key === key ? (tableSort.dir > 0 ? " ↑" : " ↓") : ""));
      th.classList.toggle("is-sorted", tableSort.key === key);
      tr.append(th);
    }
    table.append(util.h("thead", {}, tr));
    const tb = util.h("tbody");
    for (const s of rows) {
      const d = D.dealersById.get(s.dealer_id);
      const r = util.h("tr", { tabindex: 0, onclick: () => H.store && H.store(s), onkeydown: (e) => { if (e.key === "Enter") H.store && H.store(s); } }, [
        util.h("td", {}, util.h("span.dn", { style: `--c:${hexOf(d)}` }, [util.h("i"), s.dealer_name])),
        util.h("td.nw", {}, s.name),
        util.h("td.nw", {}, s.sgg_name || "–"),
        util.h("td.addr", {}, s.address || "–"),
        util.h("td", { html: util.precisionTag(s.precision) || '<span class="tag tag--manual">정확</span>' }),
        util.h("td.num", {}, s.lat != null ? s.lat.toFixed(5) : ""),
        util.h("td.num", {}, s.lng != null ? s.lng.toFixed(5) : ""),
      ]);
      tb.append(r);
    }
    table.append(tb);
    els.body.innerHTML = "";
    els.body.append(table);
  }

  CSM.sheet = sheet;
})(window.CSM);
