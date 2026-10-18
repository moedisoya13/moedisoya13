/* 권역 밖 표시 — 고른 권역 밖의 거래처를 실제 방향의 지도 가장자리에 점(+방향 화살표)으로.
   화면 안이지만 권역 밖인 거래처는 제자리에 흐린 작은 점으로. 가까운 것끼리는 +N 으로 묶고,
   범례·도구·상세 카드에 가리지 않도록 그 둘레로 비켜 놓는다. */
(function (CSM) {
  const { util } = CSM;
  const edge = {};
  let map, layer, tip, tipOwner = null;
  let items = [];               // {id, lat, lng, name, dealerId, dealerName, hex, sgg}
  let focus = null;
  const nodes = new Map();
  const positions = new Map();
  let H = {};
  const MARGIN = 20, CELL = 46, AVOID = ["#legend", ".tools", "#card"];

  edge.init = function (m, el, handlers = {}) {
    map = m; layer = el; H = handlers;
    tip = util.h("div.edge-tip", { hidden: true });
    layer.appendChild(tip);
    const upd = util.rafThrottle(edge.update);
    map.on("move zoom viewreset resize", upd);
    map.on("movestart zoomstart", hideTip);
    window.addEventListener("resize", upd);
  };

  edge.setItems = function (list) { items = list; edge.update(); };
  edge.setFocus = function (did) {
    focus = did;
    layer.classList.toggle("has-focus", !!did);
    for (const el of nodes.values()) el.classList.toggle("is-lit", !!did && el._dealers.has(did));
  };
  edge.positionFor = (id) => { const p = positions.get(id); return p ? L.point(p.x, p.y) : null; };
  edge.count = () => items.length;

  function obstacles() {
    const base = layer.getBoundingClientRect();
    const out = [];
    for (const sel of AVOID) {
      const el = document.querySelector(sel);
      if (!el || el.hidden || !el.offsetParent) continue;
      const r = el.getBoundingClientRect();
      out.push({ x1: r.left - base.left - 12, y1: r.top - base.top - 12, x2: r.right - base.left + 12, y2: r.bottom - base.top + 12 });
    }
    return out;
  }

  function avoid(x, y, W, Hh, obs) {
    for (const o of obs) {
      if (x < o.x1 || x > o.x2 || y < o.y1 || y > o.y2) continue;
      const onSide = x <= MARGIN + 1 || x >= W - MARGIN - 1;
      if (onSide) {
        const up = o.y1, down = o.y2;
        y = (Math.abs(y - up) < Math.abs(down - y) && up > MARGIN) || down > Hh - MARGIN ? up : down;
      } else {
        const left = o.x1, right = o.x2;
        x = (Math.abs(x - left) < Math.abs(right - x) && left > MARGIN) || right > W - MARGIN ? left : right;
      }
    }
    return [util.clamp(x, MARGIN, W - MARGIN), util.clamp(y, MARGIN, Hh - MARGIN)];
  }

  function hideTip() { tip.hidden = true; tipOwner = null; }
  function showTip(el) {
    tipOwner = el;
    const m = el._members;
    const rows = m.slice(0, 7).map((x) => `<div class="row" style="--c:${x.hex}"><i></i><span>${util.esc(x.name)} <small>· ${util.esc(x.dealerName)}${x.sgg ? ` · ${util.esc(x.sgg)}` : ""}</small></span></div>`).join("");
    tip.innerHTML = `<b>권역 밖 거래처 ${m.length}곳</b>${rows}${m.length > 7 ? `<small>외 ${m.length - 7}곳</small><br>` : ""}<small>누르면 보이도록 넓혀 줍니다</small>`;
    tip.hidden = false;
    const r = layer.getBoundingClientRect();
    const x = parseFloat(el.style.getPropertyValue("--x")), y = parseFloat(el.style.getPropertyValue("--y"));
    const tw = 260, th = tip.offsetHeight || 80;
    tip.style.left = `${util.clamp(x + 16, 8, r.width - tw - 8)}px`;
    tip.style.top = `${util.clamp(y + 14, 8, r.height - th - 8)}px`;
  }

  edge.update = function () {
    if (!map || !layer) return;
    const W = layer.clientWidth, Hh = layer.clientHeight;
    const obs = obstacles();
    const groups = [];
    positions.clear();
    for (const it of items) {
      const p = map.latLngToContainerPoint([it.lat, it.lng]);
      const inside = p.x >= MARGIN && p.x <= W - MARGIN && p.y >= MARGIN && p.y <= Hh - MARGIN;
      if (inside) {
        positions.set(it.id, { x: p.x, y: p.y });
        groups.push({ x: p.x, y: p.y, rot: 0, members: [it], ghost: true, key: `g:${it.id}` });
        continue;
      }
      let cx = util.clamp(p.x, MARGIN, W - MARGIN), cy = util.clamp(p.y, MARGIN, Hh - MARGIN);
      const rot = (Math.atan2(p.y - cy, p.x - cx) * 180) / Math.PI + 90;
      [cx, cy] = avoid(cx, cy, W, Hh, obs);
      positions.set(it.id, { x: cx, y: cy });
      let g = groups.find((q) => !q.ghost && Math.hypot(q.sx / q.members.length - cx, q.sy / q.members.length - cy) < CELL);
      if (!g) { g = { sx: 0, sy: 0, srot: 0, members: [], ghost: false }; groups.push(g); }
      g.members.push(it); g.sx += cx; g.sy += cy; g.srot += rot;
    }
    const seen = new Set();
    for (const g of groups) {
      const n = g.members.length;
      if (!g.ghost) {
        g.x = g.sx / n; g.y = g.sy / n; g.rot = g.srot / n;
        if (n > 1) { const half = 14 + String(n).length * 4; g.x = util.clamp(g.x, half + 6, W - half - 6); g.y = util.clamp(g.y, 16, Hh - 16); }
      }
      const key = g.ghost ? g.key : g.members.map((m) => m.id).sort().join("|");
      seen.add(key);
      let el = nodes.get(key);
      if (!el) {
        el = util.h("div.edge", { tabindex: 0, role: "button" }, [util.h("span.edge__arrow"), util.h("span.edge__dot")]);
        el.addEventListener("mouseenter", () => { showTip(el); H.hover && H.hover(el._members, true); });
        el.addEventListener("mouseleave", () => { hideTip(); H.hover && H.hover(el._members, false); });
        el.addEventListener("focus", () => showTip(el));
        el.addEventListener("blur", hideTip);
        el.addEventListener("click", () => H.click && H.click(el._members));
        el.addEventListener("keydown", (e) => { if (e.key === "Enter") H.click && H.click(el._members); });
        layer.appendChild(el);
        nodes.set(key, el);
      }
      el._members = g.members;
      el._dealers = new Set(g.members.map((m) => m.dealerId));
      el.classList.toggle("edge--multi", n > 1);
      el.classList.toggle("edge--ghost", g.ghost);
      el.classList.toggle("is-lit", !!focus && el._dealers.has(focus));
      el.style.setProperty("--x", `${g.x.toFixed(1)}px`);
      el.style.setProperty("--y", `${g.y.toFixed(1)}px`);
      el.style.setProperty("--rot", `${g.rot.toFixed(0)}deg`);
      el.style.setProperty("--c", n === 1 ? g.members[0].hex : "var(--ink)");
      const dot = el.lastElementChild;
      if (n > 1) {
        const hexes = [...new Set(g.members.map((m) => m.hex))].slice(0, 3);
        dot.innerHTML = hexes.map((h) => `<s style="--c:${h}"></s>`).join("") + `<span>${n}</span>`;
      } else dot.innerHTML = "";
      el.setAttribute("aria-label", n > 1 ? `권역 밖 거래처 ${n}곳` : `권역 밖 거래처 ${g.members[0].name}`);
    }
    for (const [key, el] of nodes) {
      if (seen.has(key)) continue;
      if (el === tipOwner) { hideTip(); H.hover && H.hover(el._members, false); }   // 사라지는 표시의 툴팁이 남지 않게
      el.remove(); nodes.delete(key);
    }
    map.fire("csm:edges");
  };

  CSM.edge = edge;
})(window.CSM);
