/* 납품 연결선 — 대리점 거점에서 거래처까지 살짝 휜 곡선.
   평소엔 아주 옅게(관계의 결) 깔려 있고, 대리점에 포인터를 올리면 그 대리점 선만 선명하게 그려진다.
   권역 밖 거래처로 가는 선은 평소엔 숨기고, 그 대리점을 볼 때만 가장자리 표시까지 점선으로 잇는다. */
(function (CSM) {
  const { util } = CSM;
  const net = {};
  const NS = "http://www.w3.org/2000/svg";
  let map, svg;
  let links = [];   // [{did, hex, from:LatLng, to:[{sid, latlng, out, el}]}]
  let focus = null;

  net.init = function (m) {
    map = m;
    const pane = map.createPane("net");
    pane.style.zIndex = 560;
    pane.style.pointerEvents = "none";
    svg = document.createElementNS(NS, "svg");
    svg.setAttribute("class", "net leaflet-zoom-hide links-on");
    pane.appendChild(svg);
    const redraw = util.rafThrottle(draw);
    map.on("move zoomend viewreset resize csm:layout csm:edges", redraw);
  };

  net.set = function (list) { links = list; build(); draw(); };
  net.setOn = function (on) { svg.classList.toggle("links-on", !!on); };

  net.focus = function (did, { animate = false } = {}) {
    focus = did;
    svg.classList.toggle("has-focus", !!did);
    const paths = svg.querySelectorAll("path");
    for (const p of paths) {
      p.classList.toggle("is-lit", !!did && p.dataset.d === did);
      p.classList.remove("draw");
    }
    if (!did || !animate || util.reduced()) return;
    requestAnimationFrame(() => {
      const lit = svg.querySelectorAll("path.is-lit");
      let k = 0;
      for (const p of lit) {
        const len = p.getTotalLength();
        p.style.setProperty("--len", len.toFixed(1));
        p.style.setProperty("--delay", `${Math.min(260, k++ * 18)}ms`);
        p.classList.add("draw");
        p.addEventListener("animationend", () => p.classList.remove("draw"), { once: true });
      }
    });
  };

  function build() {
    svg.textContent = "";
    for (const l of links) {
      for (const t of l.to) {
        const p = document.createElementNS(NS, "path");
        p.dataset.d = l.did;
        p.style.setProperty("--c", l.hex);
        if (t.out) p.classList.add("is-out");
        svg.appendChild(p);
        t.el = p;
      }
    }
    net.focus(focus);
  }

  function curve(p0, p1, i) {
    const dx = p1.x - p0.x, dy = p1.y - p0.y, len = Math.hypot(dx, dy) || 1;
    const bow = Math.min(40, len * 0.13) * (i % 2 ? 1 : -1);
    const mx = (p0.x + p1.x) / 2 - (dy / len) * bow, my = (p0.y + p1.y) / 2 + (dx / len) * bow;
    return `M${p0.x.toFixed(1)},${p0.y.toFixed(1)}Q${mx.toFixed(1)},${my.toFixed(1)} ${p1.x.toFixed(1)},${p1.y.toFixed(1)}`;
  }

  function draw() {
    if (!map) return;
    const size = map.getSize();
    L.DomUtil.setPosition(svg, map.containerPointToLayerPoint([0, 0]));
    svg.setAttribute("width", size.x);
    svg.setAttribute("height", size.y);
    svg.setAttribute("viewBox", `0 0 ${size.x} ${size.y}`);
    for (const l of links) {
      const h = map.latLngToContainerPoint(l.from), ho = CSM.markers.hubOffset(l.did);
      const p0 = L.point(h.x + ho.x, h.y + ho.y);
      l.to.forEach((t, i) => {
        let p1 = null;
        if (t.out) p1 = CSM.edge.positionFor(t.sid);
        else {
          const p = map.latLngToContainerPoint(t.latlng), o = CSM.markers.offsetFor(t.sid);
          p1 = L.point(p.x + o.x, p.y + o.y);
        }
        if (t.el) t.el.setAttribute("d", p1 ? curve(p0, p1, i) : "");
      });
    }
  }
  net.redraw = draw;

  CSM.network = net;
})(window.CSM);
