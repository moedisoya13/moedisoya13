// Card state feedback (GDD §9.3), for every card, read from events and card state only:
//   equip / swap      slot stamp-in, blade flash, card_set
//   quest +1          number pops, a gold dot flies from the kill to the slot, quest_tick, "앞으로 2"
//   awaken            gold burst + gold frame, gold ring round the hero, gold mark on the cape, awaken
//   combo +1 / stage  ×N pops, cape one segment longer, combo_up (pitch by stack), stage word overhead
//   combo max         violet flame frame, sparks at the blade, combo_max, "연참 ×5"
//   combo timer < 1 s ring blinks red, red ring at the hero's feet, combo_warn
//   combo reset       slot shakes, ×0 grey, ink drips off the cape, combo_break, the reason as a toast
//   leech / riposte / drawcut / target hits / steam: slot flashes, sounds, first-steam toast
// Per-card attack visuals (white cross, armour shards, chains, lightning …) are drawn by the cards,
// and so are the 연참 timer ring at the feet, the max afterglow, 반격's pauldron flash and 발도's
// white blade; the UI's versions of those four only stand in when the card's decor is missing.

const C = BD.C;
const K = BD.ui.K;
const S = BD.ui.S;
const CI = BD.ui.cards;
const MSG = BD.ui.msg;
const rng = K.rng;

// Slot geometry: the engine's (BD.slotRect, GDD §9.2), shared with the cards' quest dot
BD.ui.slotRect = BD.slotRect;
const slotCenter = BD.slotCenter;

const typeOf = (kind) => (BD.enemies.has(kind) ? BD.enemies.get(kind).type : null);
const slotOf = (w, id) => w.cards.findIndex((c) => c && c.id === id);
const nameOf = (id) => (BD.cards.has(id) ? BD.cards.get(id).name : id);
const FX = { awakenAt: -9, flashAt: -9, riposteAt: -9, dripAt: -9, cardLabelAt: -9, inkAt: -9, motes: [], maxSparkT: 0, steamToast: false, lastKill: null, lastHurt: null, pending: [], targetFlashAt: {}, charged: false, capeTip: null };
BD.ui.cardfx = FX;

function slot(i) { return S.slots[i] || (S.slots[i] = {}); }
// The cards draw some §9.3 feedback themselves (docs/requests/cards.md); the UI's own version
// of it stands in only when that decor is not registered.
const cardDraws = (decorId) => BD.render.decor.has(decorId);
function flyTo(ui, wx, wy, i, color) {
  const [x0, y0] = ui.view.proj(wx, wy, 40);
  const [x1, y1] = slotCenter(i);
  S.flights.push({ x0, y0, x1, y1, born: ui.time, life: 0.55, color: color || '#ffd24a', slot: i });
  if (S.flights.length > 12) S.flights.shift();
}

// GDD §9.3 reset reasons in words (used when the card itself did not toast)
function resetText(card, reason) {
  const n = card.def.name;
  if (reason === 'timeout') return n + ' 끊김: ' + (card.id === 'chain_slash' ? '4초 동안 베지 못했다' : '제때 베지 못했다');
  if (reason === 'too_close') return n + ' 흐트러짐: 품을 내줬다';
  if (reason === 'hurt') {
    const h = FX.lastHurt;
    let why = '피격';
    if (h) {
      if (h.source === 'zone') why = '불 장판';
      else if (BD.enemies.has(h.source)) { const d = BD.enemies.get(h.source); why = d.name + '의 ' + ((d.attacks[h.attack] && d.attacks[h.attack].name) || h.attack); }
    }
    return n + ' 깨짐: ' + why;
  }
  return n + ' 끊김';
}

BD.ui.effects.register({
  id: 'cardfx',
  reset(ui) {
    S.slots = [{}, {}, {}]; S.flights = [];
    Object.assign(FX, { awakenAt: -9, flashAt: -9, riposteAt: -9, dripAt: -9, cardLabelAt: -9, inkAt: -9, motes: [], maxSparkT: 0, steamToast: false, lastKill: null, lastHurt: null, pending: [], targetFlashAt: {}, charged: false, capeTip: null });
  },
  on: {
    run_start(ev, ui) {
      ev.hand.forEach((id, i) => { S.slots[i] = { id, setAt: ui.time + i * 0.12 }; });
      if (ev.hand.length) ui.sfxSafe('card_set');
    },
    card_swap(ev, ui) {
      S.slots[ev.slot] = { id: ev.inId, setAt: ui.time };
      FX.flashAt = ui.time;
      ui.sfxSafe('card_set');
    },
    kill(ev) { FX.lastKill = { x: ev.x, y: ev.y }; },
    hurt(ev) { FX.lastHurt = { source: ev.source, attack: ev.attack }; },
    quest_progress(ev, ui) {
      const w = ui.world, i = slotOf(w, ev.cardId);
      if (i < 0) return;
      const s = slot(i);
      s.popAt = ui.time + 0.5;
      // the gold dot to the slot: most quest cards fly their own (vfx quest_mote, sent right
      // after this event); ours waits for the end of the tick and is dropped if theirs came
      const from = FX.lastKill || w.hero;
      FX.motes.push(() => flyTo(ui, from.x, from.y, i));
      ui.sfxSafe('quest_tick');
      const left = ev.goal - ev.value;
      if (left > 0 && left <= 2) MSG.toast(nameOf(ev.cardId) + ': 앞으로 ' + left, 'gain');
    },
    quest_awaken(ev, ui) {
      const i = slotOf(ui.world, ev.cardId);
      if (i >= 0) slot(i).burstAt = ui.time;
      FX.awakenAt = ui.time;
      ui.sfxSafe('awaken');
      MSG.toast('각성: ' + nameOf(ev.cardId), 'gain');
    },
    combo_change(ev, ui) {
      const w = ui.world, i = slotOf(w, ev.cardId);
      if (i < 0) return;
      const card = w.cards[i], s = slot(i);
      if (ev.reason === 'gain') {
        s.popAt = ui.time;
        ui.sfxSafe('combo_up', { stack: ev.to });
        const max = card.def.maxStack;
        if (max && ev.to >= max && ev.from < max) {
          s.maxAt = ui.time;
          ui.sfxSafe('combo_max');
          MSG.toast(card.def.name + ' ×' + ev.to, 'gain');
        }
      } else if (ev.reason !== 'swap') {
        s.shakeAt = ui.time;
        FX.dripAt = ui.time;
        ui.sfxSafe('combo_break');
        FX.pending.push({ card, reason: ev.reason, covered: false });
      }
    },
    toast(ev) {
      for (const p of FX.pending) if (ev.text.indexOf(p.card.def.name) === 0) p.covered = true;
    },
    heal(ev, ui) {
      if (ev.source !== 'leech' && ev.source !== 'kings_hunt') return;
      ui.sfxSafe('heal_small');
      const w = ui.world, i = slotOf(w, ev.source);
      if (i >= 0) slot(i).flashAt = ui.time;
      // ink drawn into the blade from the last kill (unless the card drew its own: vfx leech_ink)
      if (ui.time - FX.inkAt < 0.05) return;
      const from = FX.lastKill || w.hero, h = w.hero;
      for (let k = 0; k < 8; k++) {
        const t = k / 8;
        ui.fx.emit({ x: from.x + (h.x - from.x) * t, y: from.y + (h.y - from.y) * t, z: 30, vx: (h.x - from.x) * 1.6, vy: (h.y - from.y) * 1.6, vz: 10, life: 0.35 + t * 0.1, color: K.INK, size: 3.5 });
      }
    },
    strike(ev, ui) {
      if (ev.source !== 'riposte') return;
      FX.riposteAt = ui.time;
      const i = slotOf(ui.world, 'riposte');
      if (i >= 0) slot(i).flashAt = ui.time;
      ui.sfxSafe('riposte');
    },
    hit(ev, ui) {
      if (!ev.direct) return;
      const w = ui.world, type = typeOf(ev.kind);
      for (let i = 0; i < 3; i++) {
        const c = w.cards[i];
        if (!c || c.def.family !== 'target' || !c.def.targetType || c.def.targetType !== type) continue;
        const last = FX.targetFlashAt[c.id] || -9;
        if (ui.time - last < 0.5) continue; // at most twice a second (GDD §9.3)
        FX.targetFlashAt[c.id] = ui.time;
        slot(i).flashAt = ui.time;
        ui.sfxSafe('hit_type');
      }
    },
    vfx(ev, ui) {
      if (ev.kind === 'combo_label') FX.cardLabelAt = ui.time;
      if (ev.kind === 'leech_ink') FX.inkAt = ui.time;
      if (ev.kind === 'quest_mote') FX.motes = [];
    },
    steam(ev, ui) {
      if (!FX.steamToast) { FX.steamToast = true; MSG.toast('증기: 젖은 적에 불이 닿았다', 'info'); }
    },
  },
  update(dt, ui) {
    const w = ui.world;
    if (!w || ui.app.mode !== 'play') return;
    for (const f of FX.motes) f();
    FX.motes = [];
    // reset reasons the card did not put into words itself
    for (const p of FX.pending) if (!p.covered) MSG.toast(resetText(p.card, p.reason), 'break');
    FX.pending = [];
    // per-frame state transitions: timer warning, stage badges, drawcut ready, max sparks
    let anyMax = false;
    for (let i = 0; i < 3; i++) {
      const c = w.cards[i], s = slot(i);
      if (!c) { s.warn = false; continue; }
      if (s.id !== c.id) { s.id = c.id; s.setAt = ui.time; }
      const hd = CI.hud(w, c);
      if (hd.warn && !s.warn) ui.sfxSafe('combo_warn');
      s.warn = hd.warn;
      if (hd.badge && hd.badge !== s.badge && (s.lastStack || 0) < hd.stack) {
        s.badgeAt = ui.time;
        // the word over the head: the cards letter their own stages (vfx 'combo_label');
        // the UI letters it only for a card that does not
        if (ui.time - FX.cardLabelAt > 0.3) BD.ui.feel.letter(ui, hd.badge, w.hero.x, w.hero.y, { z: 135, size: 28, fill: '#efe2ff', fill2: K.VIOLET, always: true, life: 0.9 });
      }
      // a card's own flash flag (target hit, at most twice a second)
      if (hd.flash && !(ui.time - (s.flashAt === undefined ? -9 : s.flashAt) < 0.3)) s.flashAt = ui.time;
      s.badge = hd.badge; s.lastStack = hd.stack;
      if (hd.maxed) anyMax = true;
    }
    const charged = !!(w.hero.stats && w.hero.stats.charged);
    if (charged && !FX.charged) {
      ui.sfxSafe('charge_ready');
      const i = w.cards.findIndex((c) => c && c.def.stats && c.id === 'drawcut');
      for (let k = 0; k < 3; k++) if (w.cards[k] && (k === i || i < 0) && w.cards[k].def.family === 'trigger') slot(k).flashAt = ui.time;
    }
    FX.charged = charged;
    if (anyMax && !w.hero.dead && !cardDraws('combo_afterglow')) {
      FX.maxSparkT -= dt;
      if (FX.maxSparkT <= 0) {
        FX.maxSparkT = 0.12;
        const h = w.hero;
        ui.fx.emit({ x: h.x + Math.cos(h.aim) * 0.5, y: h.y + Math.sin(h.aim) * 0.5, z: 30 + rng.range(0, 30), vx: rng.range(-0.4, 0.4), vy: rng.range(-0.4, 0.4), vz: rng.range(20, 50), g: -10, life: 0.45, color: rng.next() < 0.5 ? K.VIOLET : '#efe2ff', size: 2.5 });
      }
    }
    // ink dripping from the cape after a reset
    if (FX.capeTip && ui.time - FX.dripAt < 0.5 && rng.next() < 0.5) {
      ui.fx.emit({ x: FX.capeTip[0] + rng.range(-4, 4), y: FX.capeTip[1], vy: 60, g: -400, vz: 0, life: 0.5, color: K.INK, size: rng.range(2.5, 4.5), screen: true, layer: 'world' });
    }
  },
  draw(g, ui, layer) {
    const w = ui.world;
    if (!w || ui.app.mode !== 'play') return;
    if (layer === 'floor') {
      const v = ui.view, h = w.hero;
      // red ring at the feet while a combo timer is about to run out (연참 draws its own)
      if (!cardDraws('chain_slash_ring') && S.slots.some((s) => s && s.warn) && Math.floor(ui.time * 8) % 2 === 0) BD.client.render.ellipse(g, v, h.x, h.y, 0.62, null, '#ff3b3b', 3.5);
      // gold ring spreading from the hero on awakening
      const ak = (ui.time - FX.awakenAt) / 1.2;
      if (ak >= 0 && ak < 1) {
        g.globalAlpha = 1 - ak;
        BD.client.render.ellipse(g, v, h.x, h.y, 0.6 + ak * 2.4, null, K.INK, 7);
        BD.client.render.ellipse(g, v, h.x, h.y, 0.6 + ak * 2.4, null, '#ffd24a', 4);
        g.globalAlpha = 1;
      }
    }
    if (layer === 'screen' && !ui.app.overlay()) {
      // gold dots flying to their slot
      for (const f of S.flights) {
        const k = (ui.time - f.born) / f.life;
        if (k < 0 || k >= 1) continue;
        const e = K.ease(k);
        const x = K.lerp(f.x0, f.x1, e), y = K.lerp(f.y0, f.y1, e) - Math.sin(k * Math.PI) * 80;
        K.circle(g, x, y, 7); g.fillStyle = f.color; g.fill(); K.ink(g, 2.5);
      }
      S.flights = S.flights.filter((f) => ui.time - f.born < f.life);
    }
  },
});

// ---- the cape: a code-drawn ribbon behind the hero, one segment per combo stack --------------
const CAPE = { len: 0 };
BD.render.decor.register({
  id: 'ui_cape',
  target: 'hero_back',
  draw(g, v, h, w, box, t) {
    let stacks = 0, awakened = false;
    for (const c of w.cards) {
      if (!c) continue;
      if (c.def.family === 'combo') stacks += c.state.stack || 0;
      if (c.def.family === 'quest' && c.state.awakened) awakened = true;
    }
    const target = stacks > 0 ? 18 + Math.min(stacks, 8) * 7 : awakened ? 16 : 0;
    CAPE.len += (target - CAPE.len) * 0.18;
    if (CAPE.len < 2) { FX.capeTip = null; return; }
    const hh = box.y - box.top;
    const root = [box.x + (box.flip ? 6 : -6), box.top + hh * 0.3];
    let dx = 0, dy = 1;
    if (h.moving) { const s = v.worldDirToScreen(-h.moveX, -h.moveY); const l = Math.hypot(s[0], s[1]) || 1; dx = s[0] / l; dy = s[1] / l * 0.6 + 0.4; }
    else { dx = box.flip ? 0.45 : -0.45; dy = 0.9; }
    const dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl;
    const px = -dy, py = dx, n = 7, freq = 6 + Math.min(stacks, 8) * 1.2, amp = 2 + Math.min(stacks, 8) * 0.45;
    const L = [], Rr = [];
    for (let i = 0; i <= n; i++) {
      const k = i / n, wave = Math.sin(t * freq - i * 0.9) * amp * k;
      const cx = root[0] + dx * CAPE.len * k + px * wave, cy = root[1] + dy * CAPE.len * k + py * wave;
      const wd = 12 * (1 - k * 0.35);
      L.push([cx + px * wd, cy + py * wd]); Rr.push([cx - px * wd, cy - py * wd]);
    }
    const pts = L.concat(Rr.reverse());
    K.poly(g, pts); g.fillStyle = '#f5f3ee'; g.fill();
    K.poly(g, L.concat([[L[L.length - 1][0] - px * 10, L[L.length - 1][1] - py * 10], [root[0], root[1]]])); g.fillStyle = '#cfc8bb'; g.fill();
    // ragged hem: ink teeth across the end
    const e0 = L[L.length - 1], e1 = pts[L.length];
    for (let k = 0; k < 3; k++) {
      const a = [e0[0] + (e1[0] - e0[0]) * (k / 3), e0[1] + (e1[1] - e0[1]) * (k / 3)], b = [e0[0] + (e1[0] - e0[0]) * ((k + 1) / 3), e0[1] + (e1[1] - e0[1]) * ((k + 1) / 3)];
      K.poly(g, [a, b, [(a[0] + b[0]) / 2 + dx * 7, (a[1] + b[1]) / 2 + dy * 7]]); g.fillStyle = '#2a2830'; g.fill();
    }
    K.poly(g, pts); K.ink(g, 2.5);
    // burnt hem
    const tip = [(L[L.length - 1][0] + pts[L.length][0]) / 2, (L[L.length - 1][1] + pts[L.length][1]) / 2];
    K.circle(g, tip[0], tip[1], 4); g.fillStyle = K.INK; g.fill();
    FX.capeTip = tip;
    if (awakened) {
      const m = L[3], q = pts[pts.length - 4];
      const cx = (m[0] + q[0]) / 2, cy = (m[1] + q[1]) / 2;
      K.poly(g, [[cx, cy - 6], [cx + 5, cy], [cx, cy + 6], [cx - 5, cy]]); g.fillStyle = '#ffd24a'; g.fill(); K.ink(g, 1.5);
    }
  },
});

// Flashes on the hero: blade flash when a card is set, pauldron flash on a riposte.
BD.render.decor.register({
  id: 'ui_hero_flash',
  target: 'hero_front',
  draw(g, v, h, w, box, t) {
    const ui = BD.client.shell.ui, now = ui.time;
    const hh = box.y - box.top;
    const star = (x, y, r, a) => {
      g.globalAlpha = a;
      const pts = [];
      for (let i = 0; i < 8; i++) { const rr = i % 2 ? r * 0.3 : r, an = (i * Math.PI) / 4; pts.push([x + Math.cos(an) * rr, y + Math.sin(an) * rr]); }
      K.poly(g, pts); g.fillStyle = '#ffffff'; g.fill(); K.ink(g, 2);
      g.globalAlpha = 1;
    };
    const fk = (now - FX.flashAt) / 0.3;
    if (fk >= 0 && fk < 1) star(box.x + (box.flip ? -22 : 22), box.y - hh * 0.32, 16 * (1 - fk * 0.4), 1 - fk);
    const rk = (now - FX.riposteAt) / 0.25;
    if (rk >= 0 && rk < 1 && !cardDraws('riposte_flash')) star(box.x + (box.flip ? 10 : -10), box.top + hh * 0.24, 14, 1 - rk);
    if (FX.charged && !h.dead && !cardDraws('drawcut_blade')) star(box.x + (box.flip ? -24 : 24), box.y - hh * 0.36, 6 + Math.sin(t * 10) * 2, 0.85);
  },
});
