// Drives the play page (examples/map/play/index.html, built into a folder) in headless Chromium for
// tests/test_play_page.py.  Reads one JSON job from stdin, prints one JSON result:
//   {url, viewport: [w, h], dsf, touch, cpu (throttle rate), scenarios: [[step, ...], ...]}
// Steps: {op: "load"} | {op: "teleport", x, z, facing} | {op: "down" | "up", code} | {op: "press", code}
//        {op: "wait", ms} | {op: "state"} | {op: "sample", ms, every} (states every `every` ms)
//        {op: "eval", js} | {op: "pixel", x, y} (screen pixel of the drawn buffer) | {op: "shot", path}
//        {op: "focus", how: "tab"} | {op: "frames"} (frame times in ms) | {op: "rows"} (figure pixels drawn per row)
//        {op: "viewport", w, h} (resize the window) | {op: "align"} (screenshot vs the page's own pixels, see below)
//        {op: "touch", type: "touchStart" | "touchMove" | "touchEnd", points: [[x, y, id], ...]} (CSS px)
//        {op: "ticks", dts: [ms, ...]} with job.manualRaf: run the page's frame callback once per dt, with rAF
//            timestamps advancing by exactly those dts (the page cannot tell them from a real display); returns
//            the state after each
// Every scenario starts on a fresh page.  Console errors and page errors are returned too.
const { chromium } = require("playwright");

// Registration of the two canvases: a device-pixel screenshot compared with what the page says it shows
// (bbDebug.pixel), inside the figure box and in a ring around it, at shifts of -4..4 device px.  Two layers in
// register agree best at the SAME shift (0, 0 when the view sits on whole device pixels), with ~0 % mismatch.
async function align(page) {
  const hide = (on) => page.evaluate((on) => {   // (the HUD, the touch hint and the button lie over the game area)
    for (const e of document.querySelectorAll(".hud, .pad-hint, .acts")) e.style.visibility = on ? "hidden" : "";
  }, on);
  await hide(true);
  const buf = await page.screenshot({ scale: "device" });
  await hide(false);
  return page.evaluate(async (b64) => {
    const im = new Image(); im.src = "data:image/png;base64," + b64; await im.decode();
    const c = document.createElement("canvas"); c.width = im.naturalWidth; c.height = im.naturalHeight;
    const x = c.getContext("2d"); x.drawImage(im, 0, 0); const d = x.getImageData(0, 0, c.width, c.height).data;
    const v = window.bbDebug.state().view, dpr = devicePixelRatio;
    const vr = document.getElementById("view").getBoundingClientRect();
    const L = Math.round(vr.left * dpr), T = Math.round(vr.top * dpr);   // (layout keeps 1/64 CSS px: 42.984 for 43)
    const box = window.bbDebug.state().box, cam = window.bbDebug.state().cam;   // the figure box, in view art px
    const fx0 = box[0] - cam.x, fy0 = box[1] - cam.y, FW = box[2], FH = box[3], res = {};
    for (const region of ["fig", "ring"]) {
      const best = [];
      for (let oy = -4; oy <= 4; oy++) for (let ox = -4; ox <= 4; ox++) {
        let n = 0, bad = 0;
        for (let sy = fy0 - 30; sy < fy0 + FH + 30; sy++) for (let sx = fx0 - 30; sx < fx0 + FW + 30; sx++) {
          const inFig = sx >= fx0 && sy >= fy0 && sx < fx0 + FW && sy < fy0 + FH;
          if ((region === "fig") !== inFig || sx < 0 || sy < 0 || sx >= v.w || sy >= v.h) continue;
          const want = window.bbDebug.pixel(sx, sy);
          for (const [qx, qy] of [[0.2, 0.2], [0.8, 0.8], [0.2, 0.8], [0.8, 0.2]]) {
            const X = Math.floor(L + (sx + qx) * v.sDev) + ox, Y = Math.floor(T + (sy + qy) * v.sDev) + oy;
            if (X < 0 || Y < 0 || X >= c.width || Y >= c.height) continue;
            const o = 4 * (Y * c.width + X);
            n++; if (Math.abs(d[o] - want[0]) + Math.abs(d[o + 1] - want[1]) + Math.abs(d[o + 2] - want[2]) > 12) bad++;
          }
        }
        best.push([bad / Math.max(n, 1) * 100, ox, oy]);
      }
      const at0 = best.find((q) => q[1] === 0 && q[2] === 0)[0];
      best.sort((a, b) => a[0] - b[0] || Math.abs(a[1]) + Math.abs(a[2]) - Math.abs(b[1]) - Math.abs(b[2]));
      res[region] = { best: best[0], at0 };
    }
    return { fig: res.fig, ring: res.ring, origin: [L, T], view: v, dpr };
  }, buf.toString("base64"));
}

(async () => {
  const job = JSON.parse(require("fs").readFileSync(0, "utf8"));
  const browser = await chromium.launch();
  const out = { scenarios: [] };
  try {
    for (const steps of job.scenarios) {
      const ctx = await browser.newContext({ viewport: { width: job.viewport[0], height: job.viewport[1] },
        deviceScaleFactor: job.dsf || 1, hasTouch: !!job.touch, isMobile: !!job.touch });
      const page = await ctx.newPage();
      const res = { results: [], errors: [] };
      page.on("console", (m) => { if (m.type() === "error") res.errors.push(m.text()); });
      page.on("pageerror", (e) => res.errors.push(String(e)));
      if (job.manualRaf) await ctx.addInitScript(() => {
        const queue = []; let ts = 1000;
        window.requestAnimationFrame = (cb) => { queue.push(cb); return queue.length; };
        window.__tick = (dt) => { ts += dt; const q = queue.splice(0); for (const f of q) f(ts); return q.length; };
      });
      if (job.cpu) { const cdp = await ctx.newCDPSession(page); await cdp.send("Emulation.setCPUThrottlingRate", { rate: job.cpu }); }
      await page.goto(job.url, { waitUntil: "load" });
      await page.waitForFunction(() => window.bbDebug || document.querySelector("#status.error"), null,
                                 { timeout: 120000, polling: 50 });   // (not "raf": the page's rAF may be manual)
      for (const s of steps) {
        if (s.op === "teleport") res.results.push(await page.evaluate((a) => window.bbDebug.teleport(a.x, a.z, a.facing), s));
        else if (s.op === "down") await page.keyboard.down(s.code);
        else if (s.op === "up") await page.keyboard.up(s.code);
        else if (s.op === "press") await page.keyboard.press(s.code);
        else if (s.op === "wait") await page.waitForTimeout(s.ms);
        else if (s.op === "state") res.results.push(await page.evaluate(() => window.bbDebug ? window.bbDebug.state() : null));
        else if (s.op === "sample") {
          const n = Math.round(s.ms / s.every), states = [];
          for (let i = 0; i < n; i++) { states.push(await page.evaluate(() => window.bbDebug.state())); await page.waitForTimeout(s.every); }
          res.results.push(states);
        } else if (s.op === "eval") res.results.push(await page.evaluate("(" + s.js + ")()"));
        else if (s.op === "pixel") res.results.push(await page.evaluate((a) => window.bbDebug.pixel(a.x, a.y), s));
        else if (s.op === "shot") { await page.screenshot({ path: s.path }); res.results.push(s.path); }
        else if (s.op === "focus") { await page.keyboard.press("Tab"); res.results.push(await page.evaluate(() => document.activeElement && document.activeElement.id)); }
        else if (s.op === "frames") res.results.push(await page.evaluate(() => window.bbDebug.times()));
        else if (s.op === "rows") res.results.push(await page.evaluate(() => window.bbDebug.rows()));
        else if (s.op === "viewport") await page.setViewportSize({ width: s.w, height: s.h });
        else if (s.op === "touch") {
          if (!res.cdp) res.cdp = await ctx.newCDPSession(page);
          await res.cdp.send("Input.dispatchTouchEvent", { type: s.type, touchPoints: s.points.map(([x, y, id]) => ({ x, y, id })) });
        } else if (s.op === "ticks") res.results.push(await page.evaluate((dts) => dts.map((dt) => {
          window.__tick(dt); const st = window.bbDebug.state(); return [st.anim, st.k, st.gi, st.x, st.z, st.frame, st.facing, st.phase]; }), s.dts));
        else if (s.op === "align") res.results.push(await align(page));
        else if (s.op === "status") res.results.push(await page.evaluate(() => { const e = document.getElementById("status"); return { hidden: e.hidden, text: e.textContent, error: e.classList.contains("error") }; }));
        else throw new Error("unknown step " + s.op);
      }
      delete res.cdp;
      out.scenarios.push(res);
      await ctx.close();
    }
  } finally {
    await browser.close();
  }
  process.stdout.write(JSON.stringify(out));
})().catch((e) => { process.stderr.write(String(e && e.stack || e)); process.exit(1); });
