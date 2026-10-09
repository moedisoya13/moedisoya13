// ─────────────────────────────────────────────────────────────
// Boot + main loop
// ─────────────────────────────────────────────────────────────

function render() {
  const ph = G.phase;
  if (ph === 'punish') { Comic.draw(); return; }
  renderWorld();
  if (ph !== 'title' && ph !== 'intro') drawHUD();
  if (ph === 'play') drawControls();
  else { Input.layout.act = null; Input.layout.honey = null; }
  let zoom = 1, zx = 0, zy = 0;
  if (ph === 'closeup') { const f = Ease.outCubic(Math.min(1, G.phaseT / 0.55)); zoom = 1 + 2.2 * f; zx = G.closeup.x - G.camX; zy = G.closeup.y - G.camY; }
  presentFrame(0, 0, zoom, zx, zy);
  if (ph === 'title') drawTitleHi();
  else if (ph === 'intro') drawIntroHi();
  else if (ph === 'shazam') drawShazamHi();
  else if (ph === 'closeup') drawCloseupHi();
  else if (ph === 'return') fadeHi(1 - G.phaseT / 0.9);
  else if (ph === 'gameover') drawEndHi(false);
  else if (ph === 'victory') drawEndHi(true);
}

function onScreenResized() { if (typeof Comic !== 'undefined') Comic.cache = null; }

let _errShown = false;
function showError(e) {
  console.error(e);
  if (_errShown) return;
  _errShown = true;
  const d = document.createElement('pre');
  d.style.cssText = 'position:fixed;left:8px;right:8px;bottom:8px;max-height:40%;overflow:auto;background:#200;color:#fdd;font:11px/1.4 monospace;padding:8px;z-index:9;white-space:pre-wrap';
  d.textContent = 'Error: ' + (e && e.stack ? e.stack : e);
  document.body.appendChild(d);
}

function boot() {
  setupScreen();
  Input.init();
  newGame();
  G.phase = 'title';
  let last = performance.now();
  const frame = (now) => {
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    try { updateGame(dt); render(); } catch (e) { showError(e); }
    Input.endFrame();
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  document.addEventListener('visibilitychange', () => { if (document.hidden) Sfx.suspend(); else Sfx.resume(); });
  // test hook (read-only handles for automated checks)
  window.__SXS = { get G() { return G; }, get P() { return P; }, get M() { return M; }, startPhase, newGame, CFG, Comic, Input };
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
