/* 가장자리 표시기: 선택 권역 밖 거래처를 실제 방향의 뷰포트 가장자리에 점(+방향 화살표)으로 표시.
   뷰포트 안에 들어오는 권역 밖 거래처는 제자리에 흐린 점선 점(ghost)으로. 겹치면 +N 알약으로 묶는다. */
(function (CSM) {
  const { util } = CSM;
  const edge = {};
  let map, layer, tip;
  let items = [];                 // {id, lat, lng, name, dealerId, dealerName, color, sgg}
  let focusDealer = null;
  const nodes = new Map();        // key -> element
  const positions = new Map();    // storeId -> {x,y}
  let onClick = null, onHover = null;
  const MARGIN = 22, CELL = 34;

  edge.init = function (leafletMap, layerEl, handlers = {}) {
    map = leafletMap; layer = layerEl;
    onClick = handlers.click || null; onHover = handlers.hover || null;
    tip = util.h("div.edge-tip", { hidden: true });
    layer.appendChild(tip);
    const upd = util.rafThrottle(edge.update);
    map.on("move zoom viewreset resize", upd);
  };

  edge.setItems = function (list) { items = list; edge.update(); };
  edge.setFocus = function (dealerId) {
    focusDealer = dealerId;
    for (const el of nodes.values()) el.classList.toggle("is-lit", !!dealerId && el._dealers.has(dealerId));
  };
  edge.positionFor = function (storeId) {
    const p = positions.get(storeId);
    return p ? L.point(p.x, p.y) : null;
  };

  function hideTip() { tip.hidden = true; }
  function showTip(el, members) {
    const names = members.slice(0, 8).map((m) => `${util.esc(m.name)} <small>· ${util.esc(m.dealerName)}${m.sgg ? ` · ${util.esc(m.sgg)}` : ""}</small>`);
    const more = members.length > 8 ? `<small>외 ${members.length - 8}곳</small>` : "";
    tip.innerHTML = `<b>권역 밖 거래처 ${members.length}곳</b>${names.join("<br>")}${more ? "<br>" + more : ""}<br><small>클릭하면 보이게 확대합니다</small>`;
    tip.hidden = false;
    const r = layer.getBoundingClientRect();
    const x = parseFloat(el.style.getPropertyValue("--x")), y = parseFloat(el.style.getPropertyValue("--y"));
    const tw = 260, th = tip.offsetHeight || 60;
    tip.style.left = `${util.clamp(x + 14, 6, r.width - tw - 6)}px`;
    tip.style.top = `${util.clamp(y + 12, 6, r.height - th - 6)}px`;
  }

  edge.update = function () {
    if (!map || !layer) return;
    const size = map.getSize(), W = size.x, H = size.y;
    const groups = new Map();  // key -> {x,y,rot,members,ghost}
    positions.clear();
    for (const it of items) {
      const p = map.latLngToContainerPoint([it.lat, it.lng]);
      const inside = p.x >= MARGIN && p.x <= W - MARGIN && p.y >= MARGIN && p.y <= H - MARGIN;
      if (inside) {
        positions.set(it.id, { x: p.x, y: p.y });
        groups.set(`g:${it.id}`, { x: p.x, y: p.y, rot: 0, members: [it], ghost: true, key: `g:${it.id}` });
        continue;
      }
      let cx = util.clamp(p.x, MARGIN, W - MARGIN), cy = util.clamp(p.y, MARGIN, H - MARGIN);
      if (cy < 180 && cx > W - 60) cx = W - 60;   // 우상단 툴바 밑에 숨지 않게
      const rot = (Math.atan2(p.y - cy, p.x - cx) * 180) / Math.PI + 90;
      positions.set(it.id, { x: cx, y: cy });
      // 가까운 묶음에 합류(탐욕적 병합) — 알약끼리 겹치지 않게
      let g = null;
      for (const c of groups.values()) {
        if (c.ghost) continue;
        if (Math.hypot(c.x / c.members.length - cx, c.y / c.members.length - cy) < CELL) { g = c; break; }
      }
      if (!g) { g = { x: 0, y: 0, rot: 0, members: [], ghost: false, key: `c:${groups.size}` }; groups.set(g.key, g); }
      g.members.push(it); g.x += cx; g.y += cy; g.rot += rot;
    }
    const seen = new Set();
    for (const g of groups.values()) {
      const n = g.members.length;
      if (!g.ghost) { g.x /= n; g.y /= n; g.rot /= n; }
      // 묶음 식별은 구성원으로: 같은 구성이면 같은 노드를 재사용해 미끄러지듯 움직인다
      const key = g.ghost ? g.key : g.members.map((m) => m.id).sort().join("|");
      seen.add(key);
      let el = nodes.get(key);
      if (!el) {
        el = util.h("div.edge", { tabindex: 0, role: "button" }, [util.h("span.edge__arrow"), util.h("span.edge__dot")]);
        el._dealers = new Set(g.members.map((m) => m.dealerId));
        el.addEventListener("mouseenter", () => { showTip(el, el._members); onHover && onHover(el._members, true); });
        el.addEventListener("mouseleave", () => { hideTip(); onHover && onHover(el._members, false); });
        el.addEventListener("focus", () => showTip(el, el._members));
        el.addEventListener("blur", hideTip);
        el.addEventListener("click", () => onClick && onClick(el._members));
        el.addEventListener("keydown", (e) => { if (e.key === "Enter") onClick && onClick(el._members); });
        layer.appendChild(el);
        nodes.set(key, el);
      }
      el._members = g.members;
      el.classList.toggle("edge--multi", n > 1);
      el.classList.toggle("edge--ghost", g.ghost);
      el.classList.toggle("is-lit", !!focusDealer && el._dealers.has(focusDealer));
      el.style.setProperty("--x", `${g.x.toFixed(1)}px`);
      el.style.setProperty("--y", `${g.y.toFixed(1)}px`);
      el.style.setProperty("--rot", `${g.rot.toFixed(0)}deg`);
      el.style.setProperty("--c", n === 1 ? g.members[0].color : "var(--neutral-mid)");
      el.lastElementChild.textContent = n > 1 ? `+${n}` : "";
      el.setAttribute("aria-label", n > 1 ? `권역 밖 거래처 ${n}곳` : `권역 밖 거래처 ${g.members[0].name}`);
    }
    for (const [key, el] of nodes) {
      if (!seen.has(key)) { el.remove(); nodes.delete(key); }
    }
    map.fire("csm:edges");
  };

  edge.count = () => items.length;
  edge.nodeCount = () => nodes.size;

  CSM.edge = edge;
})(window.CSM);
