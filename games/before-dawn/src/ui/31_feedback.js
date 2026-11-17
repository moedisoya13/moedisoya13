// The v2 loop's feedback (GDD-V2 §7.1–7.3) on top of 30_feel.js (kills) and 63_growth.js (gauge,
// choice): the kill streak, the shard at the hero's feet, the level up, the halo and the holy stone,
// the surge, sites starting and clearing, the task's progress and end, an elite arriving.
// All from events; nothing here changes a rule. Sounds are named here and synthesised in 20_audio.js.
//
//   streak (§7.1)   ×N under the kills; pops at 25 · 50 · 100 · 200; `streak` (a rising note) every
//                   25; ends 3 s of play without a kill (display only)
//   shard           a small gold mote at the hero's feet (≤ 10 a second); the gauge does the rest
//   level up        0.25 s slow motion, a gold ring out to 3u from the hero, `level_up`
//   halo            gold rings out from the hero, `halo` (the shards' own sound climbs as they land)
//   holy stone      a white shockwave ring out to 7u, a 0.05 s white flash, `holy_stone`
//   surge           banner (engine), the screen edge darkens for 0.5 s, red wedges on the two sides
//                   the packs come from for 1.5 s (read from where the next packs appear), `surge_horn`
//   site start      `site_start` (the stay ring is the engine's)
//   site clear      a ring out to 5u at the site (a hold task's beacon: a flash over the screen),
//                   `site_clear`; a task place also pops the task label and shows a banner 봉인 2/3
//   task progress   the label pops at each step of a small goal (≤ 6) and every quarter of a big one
//   elite arrives   `elite_in` (its skull marker is 42_map.js)

const C = BD.C;
const K = BD.ui.K;
const S = BD.ui.S;
const M = BD.math;
const msg = () => BD.ui.msg; // 32_messages.js loads after this file
const FEEL = BD.ui.feel;
const rng = K.rng;
const FB = BD.ui.fb = { rings: [], surge: null, dots: 0 };
const GOLD = '#ffd24a', SHARD = '#ffe9a8';

function ring(ui, x, y, r1, color, life, width) {
  FB.rings.push({ x, y, r1, color, life, width: width || 6, t0: ui.time });
  if (FB.rings.length > 8) FB.rings.shift();
}

// ---- the surge's sides, read from where its packs appear ---------------------------------------------
function surgeSide(ui, ev) {
  const s = FB.surge, w = ui.world;
  if (!s || ui.time - s.t0 > 0.9 || ev.via === 'door' || ev.via === 'rift') return;
  const a = Math.atan2(ev.y - w.hero.y, ev.x - w.hero.x);
  if (s.sides.some((b) => Math.abs(M.wrapAngle ? M.wrapAngle(a - b) : Math.atan2(Math.sin(a - b), Math.cos(a - b))) < 0.8)) return;
  if (s.sides.length < 2) s.sides.push(a);
}
// screen direction of a world angle
function screenAngle(ui, a) { const [x, y] = ui.view.worldDirToScreen(Math.cos(a), Math.sin(a)); return Math.atan2(y, x); }

FB.drawWash = function (g, ui, w) {
  const s = FB.surge;
  if (!s) return;
  const age = ui.time - s.t0;
  if (age > 1.6) { FB.surge = null; return; }
  if (age < 0.5) { // the edges darken and come back
    const k = Math.sin((age / 0.5) * Math.PI);
    FEEL.halftoneEdge(g, '#000000', 90, 0.55 * k);
    FEEL.edgeBand(g, '#0a0a0c', 18, 0.45 * k);
  }
  // red wedges on the border, toward each side a pack comes from
  const sides = s.sides.length ? s.sides : (s.walk !== null ? [s.walk, s.walk + Math.PI] : []);
  const a0 = age < 1.5 ? (age > 1.2 ? (1.5 - age) / 0.3 : 1) : 0;
  for (const wa of sides) {
    const sa = screenAngle(ui, wa), cx = 640, cy = 360;
    const dx = Math.cos(sa), dy = Math.sin(sa);
    const k = Math.min(dx ? ((dx > 0 ? 1270 : 10) - cx) / dx : Infinity, dy ? ((dy > 0 ? 710 : 10) - cy) / dy : Infinity);
    const x = cx + dx * k, y = cy + dy * k, pulse = 1 + 0.12 * Math.sin(age * 18);
    g.save(); g.globalAlpha = a0; g.translate(x, y); g.rotate(sa);
    for (let i = 0; i < 3; i++) {
      const off = -i * 26 * pulse;
      K.poly(g, [[off, 0], [off - 30, -26], [off - 22, 0], [off - 30, 26]]);
      g.fillStyle = i === 0 ? '#e8342c' : 'rgba(232,52,44,' + (0.7 - i * 0.2) + ')'; g.fill(); g.lineWidth = 2.5; g.strokeStyle = K.INK; g.stroke();
    }
    g.restore();
  }
};

BD.ui.effects.register({
  id: 'feedback',
  reset() { FB.rings = []; FB.surge = null; FB.dots = 0; S.streak = { n: 0, last: -99, popAt: undefined, t: -99 }; S.taskPop = undefined; },
  on: {
    kill(ev, ui) {
      const w = ui.world, st = S.streak || (S.streak = { n: 0, last: -99 });
      // the streak runs in play time (a choice or the pause does not break it)
      if (w.t - st.t > 3) st.n = 0;
      st.n++; st.t = w.t; st.last = ui.time;
      if (st.n % 25 === 0) { ui.sfxSafe('streak', { step: Math.min(12, st.n / 25 - 1) }); if (st.n === 25 || st.n === 50 || st.n === 100 || st.n === 200 || st.n % 100 === 0) st.popAt = ui.time; }
    },
    pickup(ev, ui) {
      const h = ui.world.hero;
      if (ev.kind === 'shard') {
        if (ui.time - FB.dots < 0.1) return;
        FB.dots = ui.time;
        ui.fx.emit({ x: h.x + rng.range(-0.2, 0.2), y: h.y + rng.range(-0.2, 0.2), z: 4, vz: rng.range(30, 60), g: 120, life: 0.28, color: SHARD, size: 3.5, layer: 'floor' });
        return;
      }
      if (ev.kind === 'halo') {
        ring(ui, h.x, h.y, 4, GOLD, 0.5, 7); ring(ui, h.x, h.y, 6.5, SHARD, 0.8, 4);
        ui.sfxSafe('halo');
      } else if (ev.kind === 'holy_stone') {
        ring(ui, ev.x, ev.y, 7, '#ffffff', 0.45, 10);
        FEEL.wash.flash = Math.max(FEEL.wash.flash, 0.07); FEEL.wash.flashColor = '#ffffff';
        FEEL.shake(6, 0.15);
        ui.sfxSafe('holy_stone');
      }
    },
    level_up(ev, ui) {
      const h = ui.world.hero;
      ring(ui, h.x, h.y, 3, GOLD, 0.35, 8);
      FEEL.slowmo(0.5, 0.25);
      ui.sfxSafe('level_up');
    },
    surge(ev, ui) {
      const h = ui.world.hero, mv = Math.hypot(h.moveX || 0, h.moveY || 0);
      FB.surge = { t0: ui.time, sides: [], walk: mv > 0.01 ? Math.atan2(h.moveY, h.moveX) : null };
      ui.sfxSafe('surge_horn');
    },
    spawn(ev, ui) {
      surgeSide(ui, ev);
      const e = BD.W.enemyById(ui.world, ev.enemyId);
      if (e && (e.elite || e.role === 'elite') && !e.guardian) ui.sfxSafe('elite_in');
    },
    site_start(ev, ui) { ui.sfxSafe('site_start'); },
    site_clear(ev, ui) {
      const w = ui.world, s = (w.sites || []).find((x) => x.id === ev.id);
      if (s) {
        if (ev.kind === 'brazier') { FEEL.wash.flash = Math.max(FEEL.wash.flash, 0.3); FEEL.wash.flashColor = '#ffe2a8'; ring(ui, s.x, s.y, 12, '#ffe2a8', 0.7, 10); }
        else ring(ui, s.x, s.y, ev.optional ? 2.5 : 5, ev.optional ? '#ffffff' : GOLD, 0.5, 8);
        if (!ev.optional) FEEL.shake(4, 0.12);
      }
      ui.sfxSafe('site_clear');
    },
    task_progress(ev, ui) {
      const goal = Number(ev.goal) || 0, small = goal > 0 && goal <= 6;
      const q = (v) => Math.floor((4 * v) / Math.max(1, goal));
      if (small || q(ev.value) !== q(ev.value - 1)) S.taskPop = ui.time;
      if (small && ev.value < goal) msg().banner(BD.ui.taskLabel(ui.world) || ev.task + ' ' + ev.value + '/' + goal, 'task');
    },
  },
  draw(g, ui, layer) {
    if (layer !== 'floor' || !FB.rings.length || !ui.world) return;
    const v = ui.view, R = BD.client.render;
    FB.rings = FB.rings.filter((r) => ui.time - r.t0 < r.life);
    for (const r of FB.rings) {
      const k = (ui.time - r.t0) / r.life, e = K.ease(k);
      R.ellipse(g, v, r.x, r.y, 0.4 + (r.r1 - 0.4) * e, null, K.INK, r.width * (1 - k) + 4);
      g.globalAlpha = 1 - k * 0.8;
      R.ellipse(g, v, r.x, r.y, 0.4 + (r.r1 - 0.4) * e, null, r.color, r.width * (1 - k) + 1.5);
      g.globalAlpha = 1;
    }
  },
});
