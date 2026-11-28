// Drives the play page (examples/map/play/index.html, built into a folder) in headless Chromium for
// tests/test_play_page.py.  Reads one JSON job from stdin, prints one JSON result:
//   {url, viewport: [w, h], dsf, touch, cpu (throttle rate), scenarios: [[step, ...], ...]}
// Steps: {op: "load"} | {op: "teleport", x, z, facing} | {op: "down" | "up", code} | {op: "press", code}
//        {op: "wait", ms} | {op: "state"} | {op: "sample", ms, every} (states every `every` ms)
//        {op: "eval", js} | {op: "pixel", x, y} (screen pixel of the drawn buffer) | {op: "shot", path}
//        {op: "focus", how: "tab"} | {op: "frames"} (frame times in ms)
// Every scenario starts on a fresh page.  Console errors and page errors are returned too.
const { chromium } = require("playwright");

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
      if (job.cpu) { const cdp = await ctx.newCDPSession(page); await cdp.send("Emulation.setCPUThrottlingRate", { rate: job.cpu }); }
      await page.goto(job.url, { waitUntil: "load" });
      await page.waitForFunction(() => window.bbDebug || document.querySelector("#status.error"), null, { timeout: 120000 });
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
        else if (s.op === "status") res.results.push(await page.evaluate(() => { const e = document.getElementById("status"); return { hidden: e.hidden, text: e.textContent, error: e.classList.contains("error") }; }));
        else throw new Error("unknown step " + s.op);
      }
      out.scenarios.push(res);
      await ctx.close();
    }
  } finally {
    await browser.close();
  }
  process.stdout.write(JSON.stringify(out));
})().catch((e) => { process.stderr.write(String(e && e.stack || e)); process.exit(1); });
