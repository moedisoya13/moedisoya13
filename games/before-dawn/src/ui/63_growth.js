// v2 proof slice on screen (GDD-V2 §4.3, §5.7, §7.1, §7.2, §11.1-7): the growth choice overlay,
// the light gauge with the level, the task count, light shards and the pick-up ring on the floor,
// the cheap fodder kill, the shard and level-up sounds. Everything is read from the world
// (w.choice, w.hero.level/xp/xpNeed, w.task, w.shards); nothing here changes a rule.

const C = BD.C;
const K = BD.ui.K;
const IC = BD.ui.icons;
const NAV = BD.ui.nav;
const M = BD.math;
const GR = BD.ui.growth = { openAt: 0, key: null, gaugeFlash: 0, lastShard: -9, shardStep: 0, swingKills: 0, kills: [] };
const LOCK = 0.35; // s: no input right after the overlay opens (§4.3)
const SHARD = '#ffe9a8';

// ---- the choice overlay ------------------------------------------------------------------------
const BOON_COLOR = '#e8c47a';
function boonGlyph(g, id, x, y, s) {
  K.circle(g, x, y, s * 0.42); g.fillStyle = '#2a2418'; g.fill(); K.ink(g, 3, K.GOLD);
  g.save(); g.translate(x, y); g.strokeStyle = K.GOLD_HI; g.fillStyle = K.GOLD_HI; g.lineWidth = s * 0.06; g.lineCap = 'round';
  const r = s * 0.24;
  if (id === 'edge') { g.beginPath(); g.moveTo(-r, r); g.lineTo(r, -r); g.stroke(); g.beginPath(); g.moveTo(r * 0.3, -r); g.lineTo(r, -r); g.lineTo(r, -r * 0.3); g.stroke(); }
  else if (id === 'quick') { for (const k of [-0.6, 0, 0.6]) { g.beginPath(); g.moveTo(-r, k * r); g.lineTo(r * 0.6, k * r); g.stroke(); } }
  else if (id === 'draw') { K.circle(g, 0, 0, r); g.stroke(); K.circle(g, 0, 0, r * 0.35); g.fill(); }
  else if (id === 'breath') { g.beginPath(); g.arc(0, r * 0.3, r * 0.8, Math.PI, 0); g.stroke(); g.beginPath(); g.moveTo(0, -r); g.lineTo(0, -r * 0.2); g.stroke(); }
  else { K.circle(g, 0, 0, r * 0.5); g.fill(); }
  g.restore();
}

function optionFace(ui, o, x, y, w, h, focused, locked) {
  const g = ui.g, def = o.kind === 'card' ? BD.cards.get(o.id) : null;
  const col = def ? K.famColor(def.family) : o.kind === 'boon' ? BOON_COLOR : '#9fd8ff';
  K.panel(g, x, y, w, h, { slant: 10, edge: locked ? '#3a3a40' : focused ? K.PAPER : col, edgeW: focused ? 4 : 3, facet: K.INK2, shadow: 5 });
  if (def) IC.card(g, def, x + w / 2, y + 74, 84);
  else boonGlyph(g, o.id, x + w / 2, y + 74, 96);
  K.text(ui, o.name, x + w / 2, y + 158, { size: 30, align: 'center', weight: 900, color: K.PAPER, maxW: w - 30 });
  const kind = o.kind === 'card' ? (K.FAMILY_NAMES[def.family] || '') + ' 성인' : o.kind === 'boon' ? '단련' : '회복';
  K.text(ui, kind, x + w / 2, y + 188, { size: 18, align: 'center', weight: 700, color: col });
  if (o.kind !== 'breath') {
    const stage = o.kind === 'card' ? o.from + '단계 → ' + o.to + '단계' : (o.from ? o.from + '단계 → ' : '') + o.to + '단계';
    K.text(ui, stage, x + w / 2, y + 226, { size: 26, align: 'center', weight: 900, color: K.GOLD_HI });
    // level pips: what it has, what this adds
    const max = o.kind === 'card' ? BD.cardRt.maxLevel(def) : BD.boons.get(o.id).max;
    for (let i = 0; i < max; i++) {
      const px = x + w / 2 + (i - (max - 1) / 2) * 22, py = y + 248;
      K.circle(g, px, py, 7); g.fillStyle = i < o.from ? K.GOLD : i < o.to ? '#ffffff' : '#2a2830'; g.fill(); K.ink(g, 2);
    }
  }
  K.para(ui, o.text, x + 24, y + (o.kind === 'breath' ? 236 : 288), w - 48, { size: 21, color: K.PAPER, weight: 700, lh: 28 });
}

BD.ui.overlays.register({
  id: 'choice',
  draw(g, ui) {
    const app = ui.app, w = ui.world, ch = w.choice;
    if (!ch) return;
    if (GR.key !== ch) { GR.key = ch; GR.openAt = ui.time; NAV.focus0(ui); }
    const age = ui.time - GR.openAt, locked = age < LOCK;
    K.dim(g, 0.7);
    K.letter(g, '성장 — Lv ' + w.hero.level, 640, 92, { size: 48, fill: K.PAPER, fill2: '#e8c47a' });
    K.text(ui, '셋 중 하나를 고른다', 640, 128, { size: 21, align: 'center', color: K.DIM, weight: 700 });
    const n = ch.options.length, cw = 330, gap = 36, x0 = 640 - (n * cw + (n - 1) * gap) / 2;
    const rise = (1 - K.ease(Math.min(1, age / 0.2))) * 60; // the three come up from below (0.2 s)
    ch.options.forEach((o, i) => {
      const x = x0 + i * (cw + gap), y = 158 + rise;
      const b = K.button(ui, { id: 'choice' + i, label: o.name, x, y, w: cw, h: 400, menu: true, bare: true, disabled: locked, onTap: () => app.cmd('choice', 'pick', i) });
      optionFace(ui, o, x, y, cw, 400, b.focused && !locked, locked);
      K.text(ui, String(i + 1), x + 26, y + 36, { size: 26, weight: 900, color: locked ? '#4a4850' : K.DIM });
    });
    K.text(ui, '1 · 2 · 3 또는 방향키 + Enter · 두드리기', 640, 610, { size: 19, align: 'center', color: K.DIM, weight: 600 });
  },
  key(ev, ui) {
    const w = ui.world, ch = w && w.choice;
    if (!ch || !w.choiceOpen) return false;
    if (ui.time - GR.openAt < LOCK) return true; // swallow keys during the lock
    const d = /^Digit([1-9])$/.exec(ev.code) || /^Numpad([1-9])$/.exec(ev.code);
    if (d && +d[1] <= ch.options.length) { ui.app.cmd('choice', 'pick', +d[1] - 1); return true; }
    return NAV.keyTick(ev, ui);
  },
});

// ---- HUD: the light gauge with the level, and the floor's task ----------------------------------
// §5.7: 420 × 10 px above the card tray (430–850, y 598–608), "Lv 7" on its left; a white sweep
// when it fills; it pulses above 90 %.
BD.ui.hud.register({
  id: 'gauge',
  order: 31,
  draw(g, ui) {
    const w = ui.world, h = w.hero;
    if (!w || h.level === undefined) return;
    const x = 430, y = 598, bw = 420, bh = 10, k = K.clamp(h.xp / h.xpNeed, 0, 1);
    K.text(ui, 'Lv ' + h.level, x - 12, y + 10, { size: 20, align: 'right', weight: 900, color: K.GOLD_HI, stroke: 4 });
    g.fillStyle = K.INK; g.fillRect(x - 3, y - 3, bw + 6, bh + 6);
    g.fillStyle = '#2a2830'; g.fillRect(x, y, bw, bh);
    const pulse = k >= 0.9 ? 0.75 + 0.25 * Math.sin(ui.time * 8) : 1;
    g.globalAlpha = pulse; g.fillStyle = SHARD; g.fillRect(x, y, bw * k, bh); g.globalAlpha = 1;
    g.fillStyle = '#ffffff'; g.fillRect(x + bw * k - 2, y, 2, bh);
    if (GR.gaugeFlash > 0) { // level up: white over the bar, then empties
      g.globalAlpha = Math.min(1, GR.gaugeFlash / 0.3); g.fillStyle = '#ffffff'; g.fillRect(x, y, bw, bh); g.globalAlpha = 1;
    }
  },
});
// The task count for the top centre (40_hud.js asks for it when no guardian or boss is up).
BD.ui.taskLabel = function (w) {
  const t = w.task;
  if (!t) return null;
  const def = BD.tasks.get(t.kind);
  return def.label ? def.label(t) : def.name + ' ' + t.value + '/' + t.goal;
};

// ---- the floor: shards and the pick-up ring (layer 'floor', under the actors) -----------------
function diamond(g, x, y, s, fill) {
  g.beginPath(); g.moveTo(x, y - s * 1.3); g.lineTo(x + s, y); g.lineTo(x, y + s * 1.3); g.lineTo(x - s, y); g.closePath();
  g.fillStyle = fill; g.fill(); g.lineWidth = 1.6; g.strokeStyle = K.INK; g.stroke();
}
BD.ui.effects.register({
  id: 'shards',
  reset() { GR.gaugeFlash = 0; GR.shardStep = 0; GR.lastShard = -9; GR.kills = []; },
  on: {
    level_up(ev, ui) {
      GR.gaugeFlash = 0.3;
      ui.sfxSafe('level_up');
      const h = ui.world.hero;
      for (let i = 0; i < 18; i++) { const a = (i / 18) * M.TAU; ui.fx.emit({ x: h.x, y: h.y, z: 20, vx: Math.cos(a) * 9, vy: Math.sin(a) * 9, vz: 0, g: 0, life: 0.35, color: SHARD, size: 4 }); }
    },
    choice_open(ev, ui) { ui.sfxSafe('choice_open'); },
    choice_pick(ev, ui) { ui.sfxSafe('card_set'); },
    pickup(ev, ui) {
      if (ev.kind !== 'shard') return;
      // §7.2: picks within 0.5 s climb a semitone each (12 steps), at most 20 a second
      const t = ui.time;
      GR.shardStep = t - GR.lastShard < 0.5 ? Math.min(12, GR.shardStep + 1) : 0;
      if (t - GR.lastShard >= 0.05) { GR.lastShard = t; ui.sfxSafe('shard', { step: GR.shardStep }); }
    },
  },
  update(dt) { if (GR.gaugeFlash > 0) GR.gaugeFlash -= dt; },
  draw(g, ui, layer) {
    const w = ui.world;
    if (layer !== 'floor' || !w || !w.shards) return;
    const v = ui.view, h = w.hero, R = BD.client.render;
    if (!h.dead && h.pickupR) R.ellipse(g, v, h.x, h.y, h.pickupR, 'rgba(255,233,168,0.12)', 'rgba(255,233,168,0.3)', 1.5);
    const t = ui.time;
    for (const s of w.shards) {
      if (!R.flatOn(v, s.x, s.y, 0.3)) continue;
      const z = s.popT > 0 ? Math.sin((1 - s.popT / C.V2.shard.pop) * Math.PI) * 18 : 4 + 2 * Math.sin(t * 4 + s.id);
      const [px, py] = v.proj(s.x, s.y, z);
      const sz = s.v >= 25 ? 9 : s.v >= 5 ? 6.5 : 4.5;
      if (s.pull) { const [tx, ty] = v.proj(s.x + (s.x - h.x) * 0.08, s.y + (s.y - h.y) * 0.08, z); g.strokeStyle = 'rgba(255,233,168,0.6)'; g.lineWidth = 3; g.beginPath(); g.moveTo(tx, ty); g.lineTo(px, py); g.stroke(); }
      diamond(g, px, py, sz, SHARD);
      g.fillStyle = '#ffffff'; g.fillRect(px - sz * 0.25, py - sz * 0.4, sz * 0.5, sz * 0.8);
    }
  },
});

