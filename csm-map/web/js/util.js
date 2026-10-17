/* 공용 유틸 — 전역 네임스페이스 CSM 아래에 모은다 (내보낸 단독 HTML 에서도 그대로 동작해야 하므로 모듈 미사용) */
window.CSM = window.CSM || {};
(function (CSM) {
  const util = {};

  util.$ = (sel, root = document) => root.querySelector(sel);
  util.$$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  util.esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /** h('button.btn', {onclick, 'data-x': 1}, [children|string]) */
  util.h = (spec, attrs = {}, children = []) => {
    const [tag, ...classes] = spec.split(".");
    const el = document.createElement(tag || "div");
    if (classes.length) el.className = classes.join(" ");
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
      else if (k === "html") el.innerHTML = v;
      else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
      else if (k === "class") el.className = v;
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (const c of [].concat(children)) {
      if (c == null || c === false) continue;
      el.append(c.nodeType ? c : document.createTextNode(String(c)));
    }
    return el;
  };

  util.fmt = (n) => (n == null || Number.isNaN(n) ? "–" : Number(n).toLocaleString("ko-KR"));
  util.pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  util.clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  util.debounce = (fn, ms = 150) => {
    let t;
    return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  };
  util.rafThrottle = (fn) => {
    let queued = false, lastArgs;
    return (...a) => {
      lastArgs = a;
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; fn(...lastArgs); });
    };
  };

  util.reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /** 숫자 카운트업 (모션 축소 시 즉시) */
  util.countUp = (el, to, { duration = 600, suffix = "" } = {}) => {
    const from = Number(el.dataset.count || 0);
    el.dataset.count = to;
    if (util.reduced() || from === to) { el.textContent = util.fmt(to) + suffix; return; }
    const t0 = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - t0) / duration);
      const e = 1 - Math.pow(1 - k, 3);
      el.textContent = util.fmt(Math.round(from + (to - from) * e)) + suffix;
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  util.cssVar = (name, el = document.documentElement) => getComputedStyle(el).getPropertyValue(name).trim();

  /** 대리점별 색 (옵션 모드). 황금각으로 이웃 색을 멀리 두고, 라이트/다크에서 명도만 바꾼다. */
  util.dealerColor = (idx, dark = false) => {
    const hue = (idx * 137.508 + 210) % 360;
    const light = dark ? 64 : (idx % 2 ? 40 : 48);
    const sat = dark ? 70 : 60;
    return `hsl(${hue.toFixed(0)} ${sat}% ${light}%)`;
  };

  /** km */
  util.haversine = (a, b) => {
    const R = 6371, toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s));
  };

  util.precisionLabel = { exact: "정확", keyword: "키워드", manual: "수동", approx: "근사", failed: "실패" };
  util.precisionTag = (p) => {
    if (p === "exact" || p === "keyword") return "";
    const cls = p === "approx" ? "tip__tag tip__tag--approx" : p === "manual" ? "tip__tag tip__tag--manual" : "tip__tag";
    return `<span class="${cls}">${util.precisionLabel[p] || p}</span>`;
  };

  util.toast = (msg, { error = false, ms = 3200 } = {}) => {
    const el = document.getElementById("toast");
    el.textContent = msg;
    el.classList.toggle("is-error", !!error);
    el.hidden = false;
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.hidden = true; }, ms);
  };

  util.download = (name, text, type = "text/csv") => {
    const blob = new Blob(["﻿" + text], { type: type + ";charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  util.csv = (rows) => rows.map((r) => r.map((v) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(",")).join("\n");

  util.initials = (name) => {
    const core = String(name || "").replace(/\(주\)|주식회사|㈜|\(유\)|\s/g, "");
    return (core || name || "?").slice(0, 2);
  };

  CSM.util = util;
})(window.CSM);
