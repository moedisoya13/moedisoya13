/* 권역 고르기 — 상단 '권역' 버튼의 팝오버.
   시도 → 시군구(거래처 수 내림차순) 체크. 체크하는 즉시 지도가 그 권역으로 새로 그려진다.
   지금 선택을 이름 붙여 저장하고 다시 불러올 수 있다. */
(function (CSM) {
  const { util } = CSM;
  const rp = {};
  let els, regions = [], counts = new Map(), selection = new Set();
  let sido = "", showAll = false, query = "", presets = [], active = null;
  let H = {}, undismiss = null;
  const emit = util.debounce(() => H.change && H.change(new Set(selection), active), 140);

  rp.init = function (regionList, handlers) {
    regions = regionList; H = handlers;
    els = {
      btn: util.$("#btn-region"), clear: util.$("#btn-scope-clear"), label: util.$("#scope-label"), pop: util.$("#region-pop"),
      sido: util.$("#sido-list"), sgg: util.$("#sgg-list"), search: util.$("#region-search"), all: util.$("#region-all"),
      presets: util.$("#presets"), form: util.$("#preset-form"), name: util.$("#preset-name"), count: util.$("#region-count"),
    };
    els.btn.addEventListener("click", () => (els.pop.hidden ? rp.open() : rp.close()));
    els.clear.addEventListener("click", () => { selection = new Set(); active = null; sync(); H.change && H.change(new Set(), null); });
    els.search.addEventListener("input", () => { query = els.search.value.trim(); renderList(); });
    els.search.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { const first = els.sgg.querySelector(".opt input"); if (first) { first.click(); els.search.select(); } }
    });
    els.all.addEventListener("change", () => { showAll = els.all.checked; render(); });
    els.form.addEventListener("submit", (e) => { e.preventDefault(); savePreset(); });
    window.addEventListener("resize", () => { if (!els.pop.hidden) position(); });
  };

  rp.setCounts = function (m) {
    const same = m.size === counts.size && [...m].every(([k, v]) => counts.get(k) === v);
    counts = m;
    if (!same && !els.pop.hidden) render();
  };
  /** 바깥(지도 클릭·대리점 권역 등)에서 선택이 바뀔 때. 체크 중인 목록은 다시 그리지 않고 상태만 맞춘다. */
  rp.setSelection = function (set, presetName = null) {
    const same = set.size === selection.size && [...set].every((c) => selection.has(c));
    selection = new Set(set); active = presetName;
    if (same || els.pop.hidden) { syncLabel(); if (!els.pop.hidden) { syncChecks(); renderPresets(); } return; }
    syncLabel(); syncChecks(); renderSido(); renderCount(); renderPresets();
  };
  rp.setPresets = function (list, activeName) { presets = Array.isArray(list) ? list : []; active = activeName || null; renderPresets(); };
  rp.presets = () => presets;
  rp.selection = () => new Set(selection);
  rp.isOpen = () => !els.pop.hidden;

  /** 버튼·요약에 쓰는 이름: "전체" / "부천시 원미구" / "부천시 원미구 외 2곳" / 프리셋 이름 */
  rp.label = function (set = selection, presetName = active) {
    if (!set.size) return "전체";
    if (presetName) return presetName;
    const names = regions.filter((r) => set.has(r.code)).sort((a, b) => (counts.get(b.code) || 0) - (counts.get(a.code) || 0)).map((r) => r.display);
    return names.length === 1 ? names[0] : `${names[0]} 외 ${names.length - 1}곳`;
  };

  rp.open = function () {
    els.pop.hidden = false;
    els.btn.setAttribute("aria-expanded", "true");
    render();
    position();
    setTimeout(() => els.search.focus(), 30);
    undismiss = util.dismissable(els.pop, els.btn, (why) => rp.close({ restoreFocus: why === "escape" }));
  };
  rp.close = function ({ restoreFocus = false } = {}) {
    if (els.pop.hidden) return;
    els.pop.hidden = true;
    els.btn.setAttribute("aria-expanded", "false");
    if (undismiss) { undismiss(); undismiss = null; }
    if (restoreFocus) els.btn.focus();
  };

  function position() {
    const b = els.btn.getBoundingClientRect();
    const w = els.pop.offsetWidth || 660;
    els.pop.style.left = `${util.clamp(b.left, 12, window.innerWidth - w - 12)}px`;
    els.pop.style.top = `${b.bottom + 8}px`;
  }

  function syncLabel() {
    els.label.textContent = rp.label();
    els.clear.hidden = selection.size === 0;
    els.btn.classList.toggle("has-sel", selection.size > 0);
  }
  function syncChecks() {
    for (const input of els.sgg.querySelectorAll("input[data-code]")) input.checked = selection.has(input.dataset.code);
    renderToolsLine();
  }
  function sync() {
    syncLabel();
    if (!els.pop.hidden) render();
  }

  function toggle(code, on) {
    if (on) selection.add(code); else selection.delete(code);
    active = null;
    syncLabel();
    renderSido(); renderCount(); renderPresets(); renderToolsLine();
    emit();
  }
  function renderToolsLine() {
    const t = els.sgg.querySelector(".sgg__tools > span:first-child");
    if (!t) return;
    const codes = [...els.sgg.querySelectorAll("input[data-code]")].map((i) => i.dataset.code);
    const inView = codes.filter((c) => selection.has(c)).length;
    t.textContent = `${codes.length}개 시군구${inView ? ` · ${inView}개 선택` : ""}`;
  }

  function render() { renderSido(); renderList(); renderPresets(); renderCount(); }

  function sidoTotals() {
    const t = new Map();
    for (const r of regions) {
      const n = counts.get(r.code) || 0;
      if (!t.has(r.sido)) t.set(r.sido, { n: 0, sel: 0, any: 0 });
      const x = t.get(r.sido);
      x.n += n; x.any += 1;
      if (selection.has(r.code)) x.sel += 1;
    }
    return t;
  }

  function renderSido() {
    const t = sidoTotals();
    const list = [...t.entries()].filter(([, v]) => showAll || v.n > 0 || v.sel > 0).sort((a, b) => b[1].n - a[1].n || a[0].localeCompare(b[0], "ko"));
    if (sido && !list.some(([n]) => n === sido)) sido = "";
    const total = [...t.values()].reduce((a, v) => a + v.n, 0);
    const selAll = selection.size;
    els.sido.innerHTML = "";
    const mkBtn = (value, label, n, sel) => {
      const b = util.h("button", { type: "button", onclick: () => { sido = value; renderSido(); renderList(); els.sgg.scrollTop = 0; } },
        [util.h("b", {}, [label, sel ? util.h("em", {}, String(sel)) : null]), util.h("span", {}, util.fmt(n))]);
      b.classList.toggle("is-on", sido === value);
      return b;
    };
    els.sido.append(mkBtn("", "전체", total, selAll));
    for (const [name, v] of list) els.sido.append(mkBtn(name, CSM.mapview.shortSido(name), v.n, v.sel));
  }

  function renderList() {
    const top = els.sgg.scrollTop;
    const q = query.toLowerCase();
    const max = Math.max(1, ...regions.map((r) => counts.get(r.code) || 0));
    const list = regions.filter((r) => {
      const n = counts.get(r.code) || 0;
      if (sido && r.sido !== sido) return false;
      if (q && !(r.display.toLowerCase().includes(q) || r.name.toLowerCase().includes(q))) return false;
      return showAll || n > 0 || selection.has(r.code);
    }).sort((a, b) => (counts.get(b.code) || 0) - (counts.get(a.code) || 0) || a.display.localeCompare(b.display, "ko"));

    els.sgg.innerHTML = "";
    const inView = list.filter((r) => selection.has(r.code)).length;
    const tools = util.h("div.sgg__tools", {}, [
      util.h("span", {}, `${list.length}개 시군구${inView ? ` · ${inView}개 선택` : ""}`),
      util.h("span", {}, [
        util.h("button", { type: "button", onclick: () => { for (const r of list) selection.add(r.code); active = null; sync(); emit(); } }, "모두 선택"),
        "  ·  ",
        util.h("button", { type: "button", onclick: () => { for (const r of list) selection.delete(r.code); active = null; sync(); emit(); } }, "모두 해제"),
      ]),
    ]);
    els.sgg.append(tools);
    if (!list.length) { els.sgg.append(util.h("p.sr__empty", {}, query ? `「${query}」에 맞는 시군구가 없습니다` : "거래처가 있는 시군구가 없습니다")); return; }
    const grid = util.h("div.sgg__grid");
    for (const r of list) {
      const n = counts.get(r.code) || 0;
      const input = util.h("input", { type: "checkbox", "data-code": r.code });
      input.checked = selection.has(r.code);
      input.addEventListener("change", () => {
        toggle(r.code, input.checked);
        label.classList.remove("just"); void label.offsetWidth; label.classList.add("just");
      });
      const label = util.h("label.opt" + (n ? "" : ".is-empty"), { title: `${r.sido} ${r.display}` }, [
        input, util.h("span.box"),
        util.h("span.opt__name", {}, [r.display, !sido ? util.h("small", {}, CSM.mapview.shortSido(r.sido)) : null]),
        util.h("span.opt__n", {}, [util.fmt(n), util.h("i", { style: `--w:${Math.round((n / max) * 100)}%` })]),
      ]);
      grid.append(label);
    }
    els.sgg.append(grid);
    els.sgg.scrollTop = top;
  }

  function renderCount() {
    const n = selection.size;
    const stores = [...selection].reduce((a, c) => a + (counts.get(c) || 0), 0);
    els.count.textContent = n ? `${n}개 시군구 · 거래처 ${util.fmt(stores)}곳 표시 중` : "선택 없음 · 거래처가 있는 시군구 전체 표시";
  }

  function renderPresets() {
    els.presets.innerHTML = "";
    for (const p of presets) {
      const chip = util.h("span.preset", {}, [
        util.h("button", { type: "button", title: `${p.regions.length}개 시군구`, onclick: () => applyPreset(p) }, [p.name, util.h("small", {}, String(p.regions.length))]),
        util.h("button", { type: "button", "aria-label": `${p.name} 삭제`, title: "삭제", onclick: () => deletePreset(p) }, "×"),
      ]);
      chip.classList.toggle("is-on", active === p.name);
      els.presets.append(chip);
    }
  }

  function applyPreset(p) {
    const valid = new Set(regions.map((r) => r.code));
    selection = new Set(p.regions.filter((c) => valid.has(c)));
    active = p.name;
    sync();
    H.change && H.change(new Set(selection), active);
  }
  function deletePreset(p) {
    presets = presets.filter((x) => x.name !== p.name);
    if (active === p.name) active = null;
    renderPresets();
    els.label.textContent = rp.label();
    H.presets && H.presets(presets, active);
    util.toast(`「${p.name}」을 지웠습니다`);
  }
  function savePreset() {
    const name = els.name.value.trim();
    if (!selection.size) { util.toast("저장할 시군구를 먼저 고르세요"); return; }
    if (!name) { els.name.focus(); return; }
    presets = presets.filter((x) => x.name !== name).concat([{ name, regions: [...selection] }]);
    active = name;
    els.name.value = "";
    renderPresets();
    els.label.textContent = rp.label();
    H.presets && H.presets(presets, active);
    H.change && H.change(new Set(selection), active);
    util.toast(`「${name}」으로 저장했습니다`);
  }

  CSM.regionpicker = rp;
})(window.CSM);
