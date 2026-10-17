/* 기본 지도: 시군구/시도 벡터 경계, 라벨, 선택 권역 강조, 온라인 타일 토글 */
(function (CSM) {
  const { util } = CSM;
  const mv = {};
  let map, sggLayer, sidoLayer, labelLayer, tileLayer = null;
  let selection = new Set();       // 적용된 시군구 코드
  let hoverCode = null;
  let ghostVisible = true;
  let labelsOn = true;
  const regions = [];              // {code, sido, name, display, layer, label: L.LatLng, bounds}
  const byCode = new Map();
  const TILES = {
    light: "https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png",
    dark: "https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png",
  };
  mv.TILES_ATTRIB = '© <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a> © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors';

  function displayName(sggnm) {
    const m = /^(.+?시)(.+구)$/.exec(sggnm);
    return m && m[1].length >= 2 && m[2].length >= 2 ? `${m[1]} ${m[2]}` : sggnm;
  }

  function colors() {
    return {
      fill: util.cssVar("--map-fill"), fillActive: util.cssVar("--map-fill-active"), fillHover: util.cssVar("--map-fill-hover"),
      stroke: util.cssVar("--map-stroke"), strokeActive: util.cssVar("--map-stroke-active"), sido: util.cssVar("--map-sido-stroke"),
      ghost: util.cssVar("--map-ghost"),
    };
  }

  function styleFor(code) {
    const c = colors();
    const hasSel = selection.size > 0;
    const sel = selection.has(code);
    if (hoverCode === code) {
      return { fill: true, fillColor: c.fillHover, fillOpacity: 0.9, color: c.strokeActive, weight: 1.4, opacity: 1 };
    }
    if (!hasSel) return { fill: true, fillColor: c.fill, fillOpacity: 1, color: c.stroke, weight: 0.8, opacity: 1 };
    if (sel) return { fill: true, fillColor: c.fillActive, fillOpacity: 1, color: c.strokeActive, weight: 1.2, opacity: 1 };
    return { fill: true, fillColor: c.fill, fillOpacity: ghostVisible ? 0.35 : 0, color: c.ghost, weight: ghostVisible ? 0.8 : 0, opacity: 1 };
  }

  function sidoStyle() {
    const c = colors();
    return { fill: false, color: c.sido, weight: selection.size ? 0.9 : 1.1, opacity: selection.size ? 0.55 : 0.9, interactive: false };
  }

  mv.init = function (containerId, topo, { onRegionClick } = {}) {
    map = L.map(containerId, {
      zoomControl: false, attributionControl: false, zoomSnap: 0.25, zoomDelta: 0.5, wheelPxPerZoomLevel: 90,
      minZoom: 6, maxZoom: 18, worldCopyJump: false, preferCanvas: false, maxBoundsViscosity: 0.7,
      zoomAnimationThreshold: 8,
    });
    map.setView([36.4, 127.8], 7);
    map.createPane("labels").style.zIndex = 450;
    map.getPane("labels").style.pointerEvents = "none";
    map.createPane("tiles").style.zIndex = 150;

    const sgg = topojson.feature(topo, topo.objects.sgg);
    const sido = topojson.feature(topo, topo.objects.sido);
    const labels = topojson.feature(topo, topo.objects.labels);
    const labelByCode = new Map(labels.features.map((f) => [String(f.properties.sgg), L.latLng(f.geometry.coordinates[1], f.geometry.coordinates[0])]));

    sggLayer = L.geoJSON(sgg, {
      style: (f) => ({ ...styleFor(String(f.properties.sgg)), className: "rg" }),
      onEachFeature: (f, layer) => {
        const code = String(f.properties.sgg);
        const r = { code, sido: f.properties.sidonm, name: f.properties.sggnm, display: displayName(f.properties.sggnm), layer, label: labelByCode.get(code), bounds: layer.getBounds() };
        regions.push(r); byCode.set(code, r);
        layer.on("mouseover", () => { hoverCode = code; layer.setStyle(styleFor(code)); layer.bringToFront(); });
        layer.on("mouseout", () => { hoverCode = null; layer.setStyle(styleFor(code)); });
        layer.on("click", () => onRegionClick && onRegionClick(r));
        layer.bindTooltip(() => `<div class="tip__title">${util.esc(r.display)}</div><div class="tip__sub">${util.esc(r.sido)}${r.count ? ` · 거래처 ${r.count}곳` : ""}</div>`,
          { sticky: true, direction: "top", offset: [0, -6], opacity: 1 });
      },
    }).addTo(map);
    sidoLayer = L.geoJSON(sido, { style: sidoStyle, interactive: false }).addTo(map);

    labelLayer = L.layerGroup().addTo(map);
    for (const r of regions) {
      if (!r.label) continue;
      r.labelMarker = L.marker(r.label, {
        pane: "labels", interactive: false, keyboard: false,
        icon: L.divIcon({ className: "map-label", html: util.esc(r.display), iconSize: null }),
      });
      labelLayer.addLayer(r.labelMarker);
    }
    map.on("zoomend", updateLabelVisibility);
    map.on("zoomend moveend", () => map.fire("csm:view"));
    updateLabelVisibility();
    return map;
  };

  function updateLabelVisibility() {
    const z = map.getZoom();
    const show = labelsOn && z >= 9;
    map.getContainer().classList.toggle("map--labels", show);
    // 거래처가 없는 시군구 라벨은 더 확대해야 보인다 (밀도 억제)
    for (const r of regions) {
      const el = r.labelMarker && r.labelMarker.getElement();
      if (!el) continue;
      el.classList.toggle("is-minor", !r.count && z < 11);
    }
  }

  mv.map = () => map;
  mv.regions = () => regions;
  mv.region = (code) => byCode.get(code);
  mv.selection = () => selection;

  mv.setCounts = function (counts) { for (const r of regions) r.count = counts.get(r.code) || 0; updateLabelVisibility(); };

  mv.restyle = function () {
    sggLayer.eachLayer((l) => l.setStyle(styleFor(String(l.feature.properties.sgg))));
    sidoLayer.setStyle(sidoStyle());
    for (const r of regions) {
      if (!r.labelMarker) continue;
      const el = r.labelMarker.getElement();
      if (!el) continue;
      el.classList.toggle("is-muted", selection.size > 0 && !selection.has(r.code));
      el.classList.toggle("is-active", selection.has(r.code));
    }
  };

  mv.selectionBounds = function () {
    let b = null;
    for (const code of selection) {
      const r = byCode.get(code);
      if (!r) continue;
      b = b ? b.extend(r.bounds) : L.latLngBounds(r.bounds.getSouthWest(), r.bounds.getNorthEast());
    }
    return b;
  };

  /** 적용된 선택을 바꾸고 뷰를 맞춘다 */
  mv.setSelection = function (codes, { fit = true, animate = true } = {}) {
    selection = new Set(codes);
    mv.restyle();
    const b = mv.selectionBounds();
    if (b) {
      map.setMaxBounds(b.pad(0.9));
      if (fit) mv.fitBounds(b, animate);
    } else {
      map.setMaxBounds(null);
    }
  };

  mv.fitBounds = function (b, animate = true, pad = [48, 48]) {
    if (!b || !b.isValid()) return;
    if (animate && !util.reduced() && map._loaded) map.flyToBounds(b, { padding: pad, duration: 0.9, easeLinearity: 0.2, maxZoom: 13 });
    else map.fitBounds(b, { padding: pad, maxZoom: 13 });
  };

  mv.fitSelectionOrAll = function (allLatLngs) {
    const b = mv.selectionBounds() || (allLatLngs && allLatLngs.length ? L.latLngBounds(allLatLngs) : null);
    if (b) mv.fitBounds(b.isValid() ? b : null);
    else map.setView([36.4, 127.8], 7);
  };

  mv.setTiles = function (on, theme) {
    if (tileLayer) { map.removeLayer(tileLayer); tileLayer = null; }
    if (on) {
      tileLayer = L.tileLayer(TILES[theme === "dark" ? "dark" : "light"], { pane: "tiles", subdomains: "abcd", maxZoom: 19, opacity: 0.9 });
      tileLayer.addTo(map);
    }
    map.getContainer().classList.toggle("map--tiles", !!on);
    // 타일이 깔리면 폴리곤 채움을 비워 배경이 보이게
    sggLayer.setStyle((f) => {
      const s = styleFor(String(f.properties.sgg));
      if (on && !(selection.size && selection.has(String(f.properties.sgg)))) s.fillOpacity = Math.min(s.fillOpacity, 0.15);
      if (on && selection.size && selection.has(String(f.properties.sgg))) s.fillOpacity = 0.35;
      return s;
    });
  };
  mv.tilesOn = () => !!tileLayer;

  mv.setGhost = function (on) { ghostVisible = on; mv.restyle(); };
  mv.setLabels = function (on) { labelsOn = on; updateLabelVisibility(); };
  mv.flashRegion = function (code) {
    const r = byCode.get(code);
    if (!r) return;
    hoverCode = code; r.layer.setStyle(styleFor(code));
    setTimeout(() => { hoverCode = null; r.layer.setStyle(styleFor(code)); }, 700);
  };

  CSM.mapview = mv;
})(window.CSM);
