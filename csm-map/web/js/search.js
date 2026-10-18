/* 상단 검색 — 시군구·대리점·거래처를 한 번에. ↑↓ 로 고르고 Enter. */
(function (CSM) {
  const { util } = CSM;
  const search = {};
  let input, box, H = {}, data = { stores: [], dealers: [], regions: [], counts: new Map(), hexOf: () => "#888" };
  let items = [], idx = -1, undismiss = null;

  search.init = function (handlers) {
    H = handlers;
    input = util.$("#search");
    box = util.$("#search-results");
    input.addEventListener("input", util.debounce(run, 90));
    input.addEventListener("focus", () => { if (input.value.trim()) run(); });
    input.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        if (!items.length) return;
        idx = (idx + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
        mark();
      } else if (e.key === "Enter") {
        const it = items[idx >= 0 ? idx : 0];
        if (it) pick(it);
      } else if (e.key === "Escape") {
        input.value = ""; close(); H.highlight && H.highlight(null); input.blur();
      }
    });
  };
  search.setData = (d) => { data = d; };
  search.focus = () => { input.focus(); input.select(); };

  function close() {
    box.hidden = true; input.setAttribute("aria-expanded", "false");
    if (undismiss) { undismiss(); undismiss = null; }
  }

  function run() {
    const q = input.value.trim();
    if (!q) { close(); H.highlight && H.highlight(null); return; }
    const ql = q.toLowerCase();
    const has = (v) => (v || "").toLowerCase().includes(ql);
    const regions = data.regions.filter((r) => has(r.display) || has(r.name)).sort((a, b) => (data.counts.get(b.code) || 0) - (data.counts.get(a.code) || 0)).slice(0, 4);
    const dealers = data.dealers.filter((d) => has(d.name)).slice(0, 4);
    const storesAll = data.stores.filter((s) => has(s.name) || has(s.address) || has(s.dealer_name));
    const stores = storesAll.slice(0, 8);
    H.highlight && H.highlight(new Set(storesAll.map((s) => s.id)));
    items = [];
    box.innerHTML = "";
    const group = (label) => box.append(util.h("div.sr__group", {}, label));
    const add = (kind, obj, icon, title, sub) => {
      const i = items.length;
      items.push({ kind, obj });
      const b = util.h("button.sr__item", { type: "button", role: "option", onmousedown: (e) => e.preventDefault(), onclick: () => pick(items[i]), onmouseenter: () => { idx = i; mark(); } },
        [icon, util.h("span", {}, [util.h("b", { html: util.mark(title, q) }), util.h("small", { html: sub })]), util.h("span")]);
      box.append(b);
    };
    if (regions.length) {
      group("시군구 — 누르면 이 권역만 봅니다");
      for (const r of regions) add("region", r, util.h("span.sr__icon", { style: "background:var(--surface-3)", html: '<svg viewBox="0 0 20 20" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M3.5 6.5 8 4.5l4 2 4.5-2v9L12 15.5l-4-2-4.5 2z"/></svg>' }),
        r.display, `${util.esc(r.sido)} · 거래처 ${data.counts.get(r.code) || 0}곳`);
    }
    if (dealers.length) {
      group("대리점");
      for (const d of dealers) {
        const hex = data.hexOf(d);
        add("dealer", d, util.h("span.sr__icon", { style: `background:${hex};color:${util.onColor(hex)};font:700 var(--t-glyph)/1 var(--font)` }, util.initials(d.name)), d.name, `거래처 ${d.store_ids.length}곳${d.sgg_name ? ` · ${util.esc(d.sgg_name)}` : ""}`);
      }
    }
    if (stores.length) {
      group(storesAll.length > stores.length ? `거래처 ${storesAll.length}곳 중 ${stores.length}` : "거래처");
      for (const s of stores) {
        const d = data.dealers.find((x) => x.id === s.dealer_id);
        add("store", s, util.h("span.sr__icon", { html: `<span class="st is-in${util.isFix(s) ? " st--fix" : ""}" style="--c:${data.hexOf(d)};position:static;margin:0;display:block"></span>` }),
          s.name, `${util.esc(s.dealer_name)} · ${util.mark(s.address || "주소 없음", q)}`);
      }
    }
    if (!items.length) box.append(util.h("div.sr__empty", {}, `「${q}」 결과가 없습니다`));
    idx = items.length ? 0 : -1;
    mark();
    box.hidden = false;
    input.setAttribute("aria-expanded", "true");
    if (!undismiss) undismiss = util.dismissable(box, input, close);
  }

  function mark() { util.$$(".sr__item", box).forEach((b, i) => b.classList.toggle("is-active", i === idx)); const a = box.querySelector(".is-active"); if (a) a.scrollIntoView({ block: "nearest" }); }

  function pick(it) {
    close();
    input.blur();
    H.highlight && H.highlight(null);
    if (it.kind === "region") H.region && H.region(it.obj);
    else if (it.kind === "dealer") H.dealer && H.dealer(it.obj);
    else H.store && H.store(it.obj);
  }

  CSM.search = search;
})(window.CSM);
