/* 상단 권역 필터: 시도 세그먼트 → 시군구 칩(거래처 수 내림차순) → 적용 / 프리셋 저장 */
(function (CSM) {
  const { util } = CSM;
  const fl = {};
  let regions = [];            // mapview.regions()
  let counts = new Map();      // code -> 거래처 수
  let sidoCounts = new Map();
  let sido = "";               // 현재 보는 시도 ('' = 전체)
  let draft = new Set();       // 칩에서 고른 것
  let applied = new Set();     // 적용된 것
  let presets = [];            // [{name, regions:[]}]
  let onApply = null, onDraft = null, onPresets = null;
  let els;

  fl.init = function (regionList, handlers) {
    regions = regionList;
    onApply = handlers.apply; onDraft = handlers.draft; onPresets = handlers.presets;
    els = {
      seg: util.$("#sido-seg"), chips: util.$("#chips"), apply: util.$("#btn-apply"), applyCount: util.$("#apply-count"),
      clear: util.$("#btn-clear"), presetSel: util.$("#preset-select"), save: util.$("#btn-preset-save"), del: util.$("#btn-preset-delete"),
    };
    els.apply.addEventListener("click", () => fl.apply());
    els.clear.addEventListener("click", () => { draft = new Set(); fl.apply(); });
    els.save.addEventListener("click", savePreset);
    els.del.addEventListener("click", deletePreset);
    els.presetSel.addEventListener("change", () => {
      const p = presets.find((x) => x.name === els.presetSel.value);
      els.del.disabled = !p;
      if (p) { draft = new Set(p.regions.filter((c) => regions.some((r) => r.code === c))); fl.apply(p.name); }
    });
  };

  fl.setData = function (stores) {
    counts = new Map(); sidoCounts = new Map();
    for (const s of stores) {
      if (!s.sgg_code) continue;
      counts.set(s.sgg_code, (counts.get(s.sgg_code) || 0) + 1);
      sidoCounts.set(s.sido, (sidoCounts.get(s.sido) || 0) + 1);
    }
    render();
  };
  fl.counts = () => counts;
  fl.applied = () => applied;
  fl.draft = () => draft;

  fl.setPresets = function (list, activeName) {
    presets = Array.isArray(list) ? list : [];
    renderPresets(activeName);
  };
  fl.presets = () => presets;

  /** 외부(설정 복원 등)에서 선택을 넣고 적용 */
  fl.setApplied = function (codes, { silent = false } = {}) {
    applied = new Set(codes); draft = new Set(codes);
    render();
    if (!silent && onApply) onApply(applied);
  };

  fl.toggle = function (code) {
    if (draft.has(code)) draft.delete(code); else draft.add(code);
    render(code);
    onDraft && onDraft(draft);
  };

  fl.apply = function (presetName) {
    applied = new Set(draft);
    render();
    if (!presetName) { els.presetSel.value = ""; els.del.disabled = true; }
    onApply && onApply(applied, presetName || null);
  };

  function render(justToggled) {
    // 시도 세그먼트: 데이터가 있는 시도만, 거래처 수 내림차순
    const sidos = [...sidoCounts.entries()].sort((a, b) => b[1] - a[1]);
    if (sido && !sidoCounts.has(sido)) sido = "";
    els.seg.innerHTML = "";
    const total = [...sidoCounts.values()].reduce((a, b) => a + b, 0);
    els.seg.append(segBtn("", "전체", total));
    for (const [name, n] of sidos) els.seg.append(segBtn(name, shortSido(name), n));

    // 칩
    els.chips.innerHTML = "";
    const list = regions.filter((r) => counts.get(r.code) && (!sido || r.sido === sido))
      .sort((a, b) => (counts.get(b.code) - counts.get(a.code)) || a.display.localeCompare(b.display, "ko"));
    if (!list.length) {
      els.chips.append(util.h("span.chips__empty", {}, "표시할 시군구가 없습니다 — 먼저 지오코딩을 실행하세요."));
    }
    if (sido && list.length > 1) {
      const allOn = list.every((r) => draft.has(r.code));
      els.chips.append(util.h("button.chip", {
        type: "button", title: `${shortSido(sido)} 전체 ${allOn ? "해제" : "선택"}`,
        onclick: () => { for (const r of list) allOn ? draft.delete(r.code) : draft.add(r.code); render(); onDraft && onDraft(draft); },
      }, [allOn ? "전체 해제" : `${shortSido(sido)} 전체`]));
    }
    for (const r of list) {
      const chip = util.h("button.chip", {
        type: "button", "data-code": r.code, "aria-pressed": draft.has(r.code) ? "true" : "false",
        onclick: () => fl.toggle(r.code),
        onmouseenter: () => CSM.mapview.flashRegion(r.code),
      }, [...(!sido ? [util.h("i.chip__sido", {}, shortSido(r.sido))] : []), r.display, util.h("b", {}, String(counts.get(r.code)))]);
      chip.classList.toggle("is-on", draft.has(r.code));
      chip.classList.toggle("is-applied", applied.has(r.code));
      if (justToggled === r.code) chip.classList.add("just-toggled");
      els.chips.append(chip);
    }

    // 적용 버튼: 초안과 적용 상태가 다를 때만 활성
    const dirty = draft.size !== applied.size || [...draft].some((c) => !applied.has(c));
    els.apply.disabled = !dirty;
    els.applyCount.hidden = draft.size === 0;
    els.applyCount.textContent = String(draft.size);
    els.clear.disabled = applied.size === 0 && draft.size === 0;
  }

  function segBtn(value, label, n) {
    const b = util.h("button.seg__btn", { type: "button", role: "tab", "aria-selected": sido === value ? "true" : "false",
      onclick: () => { sido = value; render(); } }, [label, util.h("b", {}, String(n))]);
    b.classList.toggle("is-active", sido === value);
    return b;
  }

  function shortSido(name) {
    return name.replace(/특별자치시|특별자치도|통합특별시|광역시|특별시/, "").replace(/^경기도$/, "경기").replace(/^(충청|경상|전라)(남|북)도$/, "$1$2").replace(/^전남광주$/, "전남·광주");
  }

  function renderPresets(activeName) {
    els.presetSel.innerHTML = "";
    els.presetSel.append(util.h("option", { value: "" }, "저장된 필터…"));
    for (const p of presets) els.presetSel.append(util.h("option", { value: p.name }, `${p.name} (${p.regions.length})`));
    els.presetSel.value = activeName && presets.some((p) => p.name === activeName) ? activeName : "";
    els.del.disabled = !els.presetSel.value;
  }

  function savePreset() {
    if (!draft.size) { util.toast("저장할 시군구를 먼저 선택하세요."); return; }
    const name = prompt("필터 이름", els.presetSel.value || defaultPresetName());
    if (!name) return;
    presets = presets.filter((p) => p.name !== name);
    presets.push({ name, regions: [...draft] });
    renderPresets(name);
    applied = new Set(draft); render();
    onPresets && onPresets(presets, name);
    onApply && onApply(applied, name);
    util.toast(`「${name}」 저장됨`);
  }
  function deletePreset() {
    const name = els.presetSel.value;
    if (!name) return;
    presets = presets.filter((p) => p.name !== name);
    renderPresets("");
    onPresets && onPresets(presets, null);
    util.toast(`「${name}」 삭제됨`);
  }
  function defaultPresetName() {
    const names = regions.filter((r) => draft.has(r.code)).map((r) => r.display);
    return names.slice(0, 2).join("·") + (names.length > 2 ? ` 외 ${names.length - 2}` : "");
  }

  CSM.filters = fl;
})(window.CSM);
