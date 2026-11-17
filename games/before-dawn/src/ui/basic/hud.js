// BARE HUD (engine placeholder). The UI agent owns src/ui/ and replaces this file.
// HP, radiance, clock, floor + next type, wave/guardian/boss bar, three card slots,
// toasts, banners, dash and pause buttons.

const C = BD.C;
const FAMILY_COLORS = { shape: '#ffffff', element: '#8fd3ff', trigger: '#a6e36b', target: '#e0392f', quest: '#ffd24a', combo: '#b07ce8' };
BD.ui.FAMILY_COLORS = FAMILY_COLORS;

const MSG = { toasts: [], banner: null };
BD.ui.effects.register({
  id: 'basic_messages',
  reset() { MSG.toasts = []; MSG.banner = null; },
  on: {
    toast(ev, ui) { MSG.toasts.push({ text: ev.text, t: ui.time }); if (MSG.toasts.length > 3) MSG.toasts.shift(); },
    banner(ev, ui) { MSG.banner = { text: ev.text, t: ui.time }; },
  },
});

function bar(g, x, y, w, h, k, color) {
  g.fillStyle = '#0a0a0c'; g.fillRect(x, y, w, h);
  g.fillStyle = color; g.fillRect(x + 2, y + 2, Math.max(0, (w - 4) * k), h - 4);
  g.strokeStyle = '#6d6a64'; g.lineWidth = 2; g.strokeRect(x, y, w, h);
}

BD.ui.hud.register({
  id: 'basic',
  order: 0,
  draw(g, ui) {
    const w = ui.world, h = w.hero, app = ui.app;
    // HP
    bar(g, 16, 16, 260, 22, h.hp / h.maxHp, h.hp > 30 ? '#c8283a' : '#ff4040');
    ui.text(h.hp + ' / ' + h.maxHp, 146, 33, { size: 15, align: 'center', stroke: 3 });
    for (let i = 0; i < C.RADIANCE_MAX; i++) {
      g.beginPath(); g.arc(24 + i * 16, 50, 5, 0, Math.PI * 2);
      g.fillStyle = i < h.radiance ? '#ffd24a' : '#2a2a30'; g.fill(); g.strokeStyle = '#0a0a0c'; g.lineWidth = 2; g.stroke();
    }
    // clock + floor
    const clock = BD.flow.clockStr(w);
    g.fillStyle = '#0a0a0c'; g.fillRect(1050, 16, 150, 40); g.strokeStyle = '#6d6a64'; g.lineWidth = 2; g.strokeRect(1050, 16, 150, 40);
    const late = w.t >= w.mods.runSec;
    ui.text(clock, 1125, 46, { size: 28, align: 'center', color: late ? (Math.floor(ui.time * 3) % 2 ? '#ff4040' : '#f3ead8') : BD.flow.clockMin(w) >= 660 ? '#ffb070' : '#f3ead8' });
    const next = w.floor.nextDomType ? C.TYPE_NAMES[w.floor.nextDomType] : '—';
    ui.text((w.floorN === 6 ? '옥상' : w.floorN + 'F') + '  다음: ' + next, 1050, 80, { size: 16, stroke: 3 });
    ui.button({ x: 1212, y: 14, w: 44, h: 44, label: 'Ⅱ', size: 20, onTap: () => app.pause() });
    // progress / guardian / boss
    const boss = w.enemies.find((e) => !e.dead && (e.guardian || e.boss));
    if (boss) {
      const bw = boss.boss ? 560 : 360, bx = 640 - bw / 2;
      bar(g, bx, 22, bw, 14, Math.max(0, boss.hp) / boss.maxHp, '#ffd24a');
      ui.text(boss.boss ? boss.def.name : (boss.def.guardian && boss.def.guardian.name) || boss.def.name, 640, 56, { size: 16, align: 'center', stroke: 3 });
    } else if (w.floorN < 6) {
      const s = w.trial && w.trial.state === 'active' ? '시련' : w.stairs && w.stairs.open ? '계단이 열렸다' : '무리 ' + Math.min(3, w.wave.n) + '/3';
      ui.text(s, 640, 36, { size: 18, align: 'center', stroke: 3 });
    }
    // banner
    if (MSG.banner && ui.time - MSG.banner.t < 1.5) ui.text(MSG.banner.text, 640, 130, { size: 34, align: 'center', stroke: 5 });
    // toasts
    MSG.toasts = MSG.toasts.filter((x) => ui.time - x.t < 3);
    MSG.toasts.forEach((x, i) => ui.text(x.text, 16, 420 + i * 28, { size: 17, stroke: 3 }));
    // card slots
    for (let i = 0; i < 3; i++) {
      const x = 640 - 138 + i * 96, y = 616;
      const c = w.cards[i];
      g.fillStyle = '#0a0a0c'; g.fillRect(x, y, 84, 84);
      g.lineWidth = 3; g.strokeStyle = c ? FAMILY_COLORS[c.def.family] : '#3a3a40'; g.strokeRect(x + 1.5, y + 1.5, 81, 81);
      if (c) {
        ui.text(c.def.name, x + 42, y + 36, { size: 18, align: 'center' });
        const hd = c.def.hud ? c.def.hud(c.state, BD.cardRt.ctx(w, c)) || {} : {};
        if (hd.ring !== undefined) { g.fillStyle = '#b07ce8'; g.fillRect(x + 6, y + 72, 72 * Math.max(0, Math.min(1, hd.ring)), 5); }
        if (hd.text) ui.text(hd.text, x + 78, y + 64, { size: 16, align: 'right' });
      }
      ui.button({ x, y, w: 84, h: 84, style: 'none', onTap: () => app.pause() });
    }
    // dash button
    const r = 46, cx = 1194, cy = 624, cd = h.dashCd / C.DASH.cd;
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fillStyle = cd > 0 ? 'rgba(10,10,12,0.75)' : 'rgba(30,26,20,0.85)'; g.fill();
    g.lineWidth = 4; g.strokeStyle = '#3a3a40'; g.stroke();
    g.beginPath(); g.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - cd)); g.strokeStyle = cd > 0 ? '#8a8a90' : BD.ui.ORANGE; g.stroke();
    ui.text('돌진', cx, cy + 7, { size: 18, align: 'center', color: cd > 0 ? '#8a8a90' : '#f3ead8' });
    ui.button({ x: cx - r, y: cy - r, w: 2 * r, h: 2 * r, style: 'none', onPress: () => { BD.client.input.st.dashReq = true; } });
  },
});
