/* 공용 유틸 — 전역 CSM 네임스페이스 (단독 HTML 내보내기에서도 그대로 동작해야 하므로 모듈 미사용) */
window.CSM = window.CSM || {};
(function (CSM) {
  const util = {};

  util.$ = (sel, root = document) => root.querySelector(sel);
  util.$$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  util.esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /** h('button.btn', {onclick, style:'--c:red'}, [children]) — 텍스트는 항상 텍스트 노드로 (XSS 방지) */
  util.h = (spec, attrs = {}, children = []) => {
    const [tag, ...classes] = spec.split(".");
    const el = document.createElement(tag || "div");
    if (classes.length) el.className = classes.join(" ");
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
      else if (k === "html") el.innerHTML = v;
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
  util.debounce = (fn, ms = 150) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  util.rafThrottle = (fn) => {
    let queued = false, last;
    return (...a) => { last = a; if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; fn(...last); }); };
  };
  util.reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  util.cssVar = (name, el = document.documentElement) => getComputedStyle(el).getPropertyValue(name).trim();

  /** 숫자 카운트업 (모션 축소 시 즉시) */
  util.countUp = (el, to, { duration = 520 } = {}) => {
    const from = Number(el.dataset.v || 0);
    el.dataset.v = to;
    if (util.reduced() || from === to) { el.textContent = util.fmt(to); return; }
    const t0 = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - t0) / duration), e = 1 - Math.pow(1 - k, 3);
      el.textContent = util.fmt(Math.round(from + (to - from) * e));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  // ── 색 ──────────────────────────────────────────────
  const hexRgb = (hex) => { const h = hex.replace("#", ""); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255); };
  const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const enc = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
  const toOklab = (hex) => {
    const [r, g, b] = hexRgb(hex).map(lin);
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
  };
  const fromOklab = ([L, a, b]) => {
    const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3, s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
    const rgb = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
    return "#" + rgb.map((c) => Math.round(util.clamp(enc(util.clamp(c, 0, 1)), 0, 1) * 255).toString(16).padStart(2, "0")).join("");
  };
  /** OKLab 에서 섞기: t=0 → a, t=1 → b */
  util.mix = (a, b, t) => { const A = toOklab(a), B = toOklab(b); return fromOklab(A.map((v, i) => v + (B[i] - v) * t)); };
  const lum = (hex) => { const [r, g, b] = hexRgb(hex).map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  util.contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  /** 색 위 글자색: 흰색과 잉크 중 대비가 큰 쪽 */
  util.onColor = (hex) => (util.contrast(hex, "#ffffff") >= util.contrast(hex, "#17161a") ? "#ffffff" : "#17161a");
  /** 현재 테마의 대리점 10색 */
  util.hues = () => Array.from({ length: 10 }, (_, i) => util.cssVar(`--h${i}`) || "#888888");

  util.haversine = (a, b) => {
    const R = 6371, rad = (d) => (d * Math.PI) / 180;
    const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s));
  };

  util.precisionLabel = { exact: "정확", manual: "수동 지정", needs_fix: "정정 필요", approx: "근사 위치", failed: "위치 없음" };
  util.isFix = (x) => x && x.precision === "needs_fix";
  util.precisionTag = (p) => {
    if (p === "exact") return "";
    const cls = { needs_fix: "tag tag--fix", approx: "tag tag--approx", manual: "tag tag--manual" }[p] || "tag tag--approx";
    return `<span class="${cls}">${util.esc(util.precisionLabel[p] || p)}</span>`;
  };

  util.initials = (name) => {
    const core = String(name || "").replace(/\(주\)|주식회사|㈜|\(유\)|\s/g, "");
    return (core || name || "?").slice(0, 2);
  };
  /** 검색어 강조(이스케이프 후) */
  util.mark = (text, q) => {
    const s = util.esc(text);
    if (!q) return s;
    const i = String(text).toLowerCase().indexOf(q.toLowerCase());
    if (i < 0) return s;
    return util.esc(text.slice(0, i)) + "<mark>" + util.esc(text.slice(i, i + q.length)) + "</mark>" + util.esc(text.slice(i + q.length));
  };

  util.toast = (msg, { error = false, ms = 3400 } = {}) => {
    const el = document.getElementById("toast");
    el.textContent = msg;
    el.classList.toggle("is-error", !!error);
    el.hidden = false;
    el.style.animation = "none"; void el.offsetWidth; el.style.animation = "";
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
    let s = v == null ? "" : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;   // 엑셀 수식 인젝션 방지
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(",")).join("\n");

  /** 바깥 클릭/ESC 로 닫히는 팝업 공통 처리 */
  /** 바깥을 누르거나 Esc 를 누르면 닫는다. onClose(사유) — "escape" 면 키보드 사용자이므로 연 버튼으로 포커스를 돌려준다 */
  /** 오류 알림 = 무엇을 못 했는지 + 왜 / 어떻게 하면 되는지. what 예: "정정 요청 엑셀을 저장" */
  util.failText = (what, err) => {
    const msg = (err && err.message) || "";
    if (err && !err.status && (err.name === "TypeError" || /Failed to fetch|NetworkError/i.test(msg)))
      return `${what}하지 못했습니다. 앱 서버와 연결이 끊겼습니다 — 앱(run_csm_map.bat)을 다시 실행해 주세요.`;
    if (err && (err.code === "file_locked" || err.code === "io" || (err.status >= 400 && err.status < 500))) return `${what}하지 못했습니다. ${msg}`;
    return `${what}하지 못했습니다${msg ? ` (${msg})` : ""}. 다시 해도 같으면 앱을 닫고 다시 실행해 주세요.`;
  };

  util.dismissable = (el, anchor, onClose) => {
    const onDown = (e) => { if (!el.contains(e.target) && !(anchor && anchor.contains(e.target))) onClose("outside"); };
    const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); onClose("escape"); } };
    setTimeout(() => document.addEventListener("pointerdown", onDown, true), 0);
    document.addEventListener("keydown", onKey, true);
    return () => { document.removeEventListener("pointerdown", onDown, true); document.removeEventListener("keydown", onKey, true); };
  };

  CSM.util = util;
})(window.CSM);
