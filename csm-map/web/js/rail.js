/* 왼쪽 패널 — 지금 보는 권역의 요약 + 대리점 목록(= 색 범례).
   비중 막대는 대리점 색으로 나눠 '누가 이 권역을 맡고 있는지'를 한 줄로 보여준다. */
(function (CSM) {
  const { util } = CSM;
  const rail = {};
  let els, H = {}, sort = "count", showOut = false, last = null, active = null;

  rail.init = function (handlers) {
    H = handlers;
    els = {
      title: util.$("#summary-title"), share: util.$("#share"), caption: util.$("#share-caption"), list: util.$("#dealer-list"),
      count: util.$("#dealer-count"), fixBtn: util.$("#btn-fix"), fixN: util.$("#fix-n"), fixSub: util.$("#fix-sub"),
    };
    for (const b of util.$$(".dealers__head [data-sort]")) {
      b.addEventListener("click", () => {
        sort = b.dataset.sort;
        for (const x of util.$$(".dealers__head [data-sort]")) x.classList.toggle("is-on", x === b);
        if (last) renderList(last);
      });
    }
    els.fixBtn.addEventListener("click", () => H.fix && H.fix());
    util.$("#btn-table").addEventListener("click", () => H.table && H.table());
    els.share.addEventListener("mouseleave", () => H.leave && H.leave());
  };

  /**
   * D: app.derive() 결과 { stores, dealers, scopeStores, byDealerScope:Map, dealersById, hasSelection, regionsInScope, fixScope, fixAll }
   * ctx: { label, hexOf, total }
   */
  rail.render = function (D, ctx) {
    last = { D, ctx };
    els.title.textContent = ctx.label === "전체" ? "거래처가 있는 모든 시군구" : ctx.label;
    const stat = (k) => util.$(`[data-stat="${k}"]`);
    util.countUp(stat("stores"), D.scopeStores.length);
    util.$('[data-stat-of="stores"]').textContent = D.hasSelection ? `/ ${util.fmt(D.stores.length)}` : "";
    util.countUp(stat("dealers"), D.dealersInScope);
    util.countUp(stat("regions"), D.regionsInScope);
    util.$("#summary").setAttribute("aria-label", `${els.title.textContent}: 거래처 ${D.scopeStores.length}곳, 대리점 ${D.dealersInScope}곳, 시군구 ${D.regionsInScope}개`);

    // 비중 막대
    const rows = [...D.byDealerScope.entries()].filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
    els.share.innerHTML = "";
    const total = rows.reduce((a, [, n]) => a + n, 0);
    for (const [did, n] of rows) {
      const d = D.dealersById.get(did);
      const seg = util.h("i", { style: `--c:${ctx.hexOf(d)};--n:${n}`, title: `${d.name} ${n}곳 (${util.pct(n, total)}%)`, "data-d": did });
      seg.addEventListener("mouseenter", () => H.hover && H.hover(d, { from: "share" }));
      seg.addEventListener("click", () => H.click && H.click(d));
      els.share.append(seg);
    }
    const top = rows.slice(0, 3).map(([did, n]) => {
      const d = D.dealersById.get(did);
      // 항목 하나(색 견본·이름·비율)는 한 덩어리로 줄바꿈 — 이름과 비율이 갈라지지 않게
      return `<span class="share__item"><span class="sw" style="--c:${ctx.hexOf(d)}"></span><b>${util.esc(d.name)}</b> ${util.pct(n, total)}%</span>`;
    });
    els.caption.innerHTML = total ? `상위 ${top.join(" · ")}` : "이 권역에는 거래처가 없습니다";

    // 정정 필요
    els.fixN.textContent = String(D.fixAll);
    els.fixBtn.classList.toggle("is-zero", D.fixAll === 0);
    els.fixSub.textContent = D.fixAll === 0 ? "모든 주소의 위치를 찾았습니다"
      : D.hasSelection ? `이 권역 ${D.fixScope}건 · 전체 ${D.fixAll}건` : "카카오 주소 검색에서 찾지 못한 주소";
    els.fixBtn.querySelector(".fix-btn__icon").textContent = D.fixAll === 0 ? "✓" : "!";
    renderList(last);
  };

  function renderList({ D, ctx }) {
    const scroll = els.list.scrollTop;
    const counts = D.byDealerScope;
    const inScope = D.dealers.filter((d) => (counts.get(d.id) || 0) > 0);
    const outScope = D.dealers.filter((d) => !(counts.get(d.id) || 0));
    const by = sort === "count"
      ? (a, b) => (counts.get(b.id) || 0) - (counts.get(a.id) || 0) || b.store_ids.length - a.store_ids.length || a.name.localeCompare(b.name, "ko")
      : (a, b) => a.name.localeCompare(b.name, "ko");
    inScope.sort(by); outScope.sort(by);
    const max = Math.max(1, ...inScope.map((d) => counts.get(d.id) || 0));
    els.count.textContent = D.hasSelection ? `${inScope.length}/${D.dealers.length}` : String(D.dealers.length);
    els.list.innerHTML = "";
    inScope.forEach((d, i) => els.list.append(row(d, D, ctx, counts.get(d.id) || 0, max, i)));
    if (outScope.length) {
      const head = util.h("li.dl-group", {}, [
        util.h("span", {}, `이 권역에 거래처 없음 · ${outScope.length}곳`),
        util.h("button", { type: "button", onclick: () => { showOut = !showOut; renderList({ D, ctx }); } }, showOut ? "접기" : "펼치기"),
      ]);
      els.list.append(head);
      if (showOut) outScope.forEach((d, i) => els.list.append(row(d, D, ctx, 0, max, inScope.length + i, true)));
    }
    els.list.scrollTop = scroll;
    rail.setActive(active, { scroll: false });
  }

  function row(d, D, ctx, n, max, i, dim) {
    const hex = ctx.hexOf(d);
    const regionsN = new Set(d.store_ids.map((id) => D.storeById.get(id)).filter((s) => s && s.sgg_code).map((s) => s.sgg_code)).size;
    const base = d.address ? (d.sgg_name ? `${d.sgg_name} 거점` : "거점 주소 등록") : "거점 주소 미등록";
    const sub = [base, `시군구 ${regionsN}`];
    if (d.similar_to && d.similar_to.length) sub.push(`비슷한 이름: ${d.similar_to.join(", ")}`);
    const b = util.h("button.dl" + (dim ? ".is-dim" : ""), {
      type: "button", "data-d": d.id, style: `--c:${hex};--on:${util.onColor(hex)};--i:${Math.min(i, 14)}`,
      "aria-label": `${d.name}, 이 권역 거래처 ${n}곳`,
      onmouseenter: () => H.hover && H.hover(d, { from: "rail" }), onmouseleave: () => H.leave && H.leave(d),
      onfocus: () => H.hover && H.hover(d, { from: "rail" }), onblur: () => H.leave && H.leave(d),
      onclick: () => H.click && H.click(d),
    }, [
      util.h("span.dl__hub" + (d.lat == null ? ".is-noaddr" : ""), { title: d.lat == null ? "거점 주소가 없어 지도에 거점이 표시되지 않습니다" : "" }, util.initials(d.name)),
      util.h("span.dl__main", {}, [util.h("b", {}, d.name), util.h("small", { title: sub.join(" · ") }, sub.join(" · "))]),
      util.h("span.dl__val", {}, [
        util.h("b", { html: D.hasSelection && d.store_ids.length !== n ? `${n}<small>/${d.store_ids.length}</small>` : String(n || d.store_ids.length) }),
        util.h("i", { style: `--w:${Math.round(((n || 0) / max) * 100)}%` }),
      ]),
    ]);
    return util.h("li", {}, b);
  }

  /** 대리점 강조 — 지도에서 올렸을 땐 목록을 그 줄까지 굴린다 */
  rail.setActive = function (did, { scroll = true } = {}) {
    active = did;
    for (const b of util.$$(".dl", els.list)) b.classList.toggle("is-active", b.dataset.d === did);
    for (const s of util.$$("i", els.share)) s.classList.toggle("is-lit", s.dataset.d === did);
    els.share.classList.toggle("has-focus", !!did);
    if (did && scroll) {
      const el = els.list.querySelector(`.dl[data-d="${did}"]`);
      if (el) el.scrollIntoView({ block: "nearest", behavior: util.reduced() ? "auto" : "smooth" });
    }
  };

  CSM.rail = rail;
})(window.CSM);
