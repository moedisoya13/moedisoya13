/* 상세 카드 — 지도 오른쪽 위에 뜬다. 대리점(고정) 또는 거래처를 자세히. */
(function (CSM) {
  const { util } = CSM;
  const card = {};
  let el, H = {};

  card.init = function (handlers) {
    H = handlers;
    el = util.$("#card");
  };
  card.hide = function () { el.hidden = true; el.innerHTML = ""; CSM.edge && CSM.edge.update(); };
  card.isOpen = () => !el.hidden;

  function head(hex, hubText, title, sub, isStore) {
    return util.h("header.card__head", { style: `--c:${hex};--on:${util.onColor(hex)}` }, [
      util.h("span.card__hub" + (isStore ? ".is-store" : ""), { style: isStore ? `background:${hex}` : "" }, isStore ? "" : hubText),
      util.h("div.card__title", {}, [util.h("h3", {}, title), util.h("p", {}, sub)]),
      util.h("button.icon-btn", { type: "button", "aria-label": "닫기", title: "닫기 (Esc)", onclick: () => H.close && H.close(),
        html: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m6 6 8 8M14 6l-8 8"/></svg>' }),
    ]);
  }
  function show(nodes) {
    el.innerHTML = "";
    el.append(...nodes);
    el.hidden = false;
    el.style.animation = "none"; void el.offsetWidth; el.style.animation = "";
    CSM.edge && CSM.edge.update();
  }

  /** D: app.derive() 결과 */
  card.showDealer = function (d, D, hexOf) {
    const hex = hexOf(d);
    const list = (D.storesByDealer.get(d.id) || []);
    const inScope = list.filter(D.inScope);
    const withXY = list.filter((s) => s.lat != null);
    const avg = d.lat != null && withXY.length ? withXY.reduce((a, s) => a + util.haversine(d, s), 0) / withXY.length : null;
    const byRegion = new Map();
    for (const s of list) { const k = s.sgg_name || "권역 미확정"; byRegion.set(k, (byRegion.get(k) || 0) + 1); }
    const regionRows = [...byRegion.entries()].sort((a, b) => b[1] - a[1]);
    const max = Math.max(1, ...regionRows.map(([, n]) => n));
    const fixN = list.filter(util.isFix).length;

    const body = util.h("div.card__body", {}, [
      util.h("div.card__stats", {}, [
        util.h("div", {}, [util.h("b", {}, D.hasSelection ? `${inScope.length}/${list.length}` : String(list.length)), util.h("span", {}, D.hasSelection ? "이 권역 / 전체 거래처" : "거래처")]),
        util.h("div", {}, [util.h("b", {}, String(byRegion.size)), util.h("span", {}, "시군구")]),
        util.h("div", {}, [util.h("b", {}, avg != null ? avg.toFixed(1) : "–"), util.h("span", {}, "평균 거리 km")]),
      ]),
      util.h("dl.kv", {}, [
        util.h("dt", {}, "거점 주소"), util.h("dd", {}, d.address || "미등록 · CSM.xlsx I열에 넣으면 지도에 거점이 표시됩니다"),
        ...(d.similar_to && d.similar_to.length ? [util.h("dt", {}, "비슷한 이름"), util.h("dd", {}, d.similar_to.join(", "))] : []),
        ...(fixN ? [util.h("dt", {}, "정정 필요"), util.h("dd", {}, `${fixN}건`)] : []),
      ]),
      util.h("h4", {}, "시군구별 거래처"),
      util.h("div.bars", { style: `--c:${hex}` }, regionRows.slice(0, 10).map(([name, n]) =>
        util.h("div", {}, [util.h("span", { title: name }, name), util.h("i", { style: `--w:${Math.round((n / max) * 100)}%` }), util.h("b", {}, String(n))]))),
      util.h("h4", {}, `거래처 ${list.length}곳`),
      util.h("div.chips", {}, list.slice().sort((a, b) => a.name.localeCompare(b.name, "ko")).map((s) =>
        util.h("button.chip", { type: "button", style: `--c:${hex}`, title: s.address || "", onclick: () => H.store && H.store(s) },
          [util.h("i" + (util.isFix(s) ? ".is-fix" : "")), s.name]))),
      util.h("div.card__actions", {}, [
        util.h("button.btn.btn--sm", { type: "button", onclick: () => H.scopeToDealer && H.scopeToDealer(d) }, "이 대리점 권역만 보기"),
      ]),
    ]);
    show([head(hex, util.initials(d.name), d.name, `대리점${d.sgg_name ? ` · ${d.sgg_name}` : ""}`), body]);
  };

  card.showStore = function (s, D, hexOf) {
    const d = D.dealersById.get(s.dealer_id);
    const hex = hexOf(d);
    const rows = [
      util.h("dt", {}, "대리점"), util.h("dd", {}, [util.h("button.chip", { type: "button", style: `--c:${hex}`, onclick: () => H.dealer && H.dealer(d) }, [util.h("i"), d ? d.name : s.dealer_name])]),
      util.h("dt", {}, "주소"), util.h("dd", {}, s.address || "주소 칸이 비어 있습니다"),
      util.h("dt", {}, "시군구"), util.h("dd", {}, s.sgg_name ? `${s.sido} ${s.sgg_name}` : "확정되지 않음"),
      util.h("dt", {}, "위치"), util.h("dd", { html: s.lat != null ? `<span class="mono">${s.lat.toFixed(5)}, ${s.lng.toFixed(5)}</span> ${util.precisionTag(s.precision) || '<span class="tag tag--manual">정확</span>'}` : util.precisionTag(s.precision) }),
    ];
    if (s.reason) rows.push(util.h("dt", {}, "사유"), util.h("dd", {}, s.reason));
    if (d && d.lat != null && s.lat != null) rows.push(util.h("dt", {}, "거점 거리"), util.h("dd", {}, `${util.haversine(d, s).toFixed(1)} km`));
    rows.push(util.h("dt", {}, "원본"), util.h("dd", {}, `${s.source} ${s.row}행`));
    const actions = [];
    if (!CSM.api.isStatic && (s.precision === "needs_fix" || s.precision === "approx" || s.precision === "manual")) {
      actions.push(util.h("button.btn.btn--sm.btn--ink", { type: "button", onclick: () => H.place && H.place(s) }, s.precision === "manual" ? "위치 다시 지정" : "지도에서 위치 지정"));
    }
    if (D.hasSelection && !D.inScope(s)) actions.push(util.h("span.tag.tag--out", {}, "선택 권역 밖"));
    show([
      head(hex, "", s.name, `${d ? d.name : s.dealer_name} 거래처`, true),
      util.h("div.card__body", {}, [util.h("dl.kv", {}, rows), actions.length ? util.h("div.card__actions", {}, actions) : null]),
    ]);
  };

  CSM.card = card;
})(window.CSM);
