// 빛의 고리 (halo) — GDD-V2 §6. Step on it (0.6u, not drawn in by the pick-up radius): every light
// shard on the floor flies to the hero (like the guardian's fall). From a chest (always) and a
// threat's death (2 %); at most 2 on a floor. Worth more the more shards lie about, so it can wait.
BD.pickups.register({
  id: 'halo', name: '빛의 고리', touch: BD.C.INTERACT.flaskTouch,
  take(w) {
    const n = w.shards.length;
    BD.growth.pullAll(w);
    BD.W.toast(w, '빛의 고리 — 조각 ' + n + '개가 날아온다');
    return true;
  },
});

// a pale gold ring, turning slowly, hovering (drawn in code, GDD-V2 §6)
BD.render.pickups.register({
  id: 'halo',
  draw(g, v, p, t) {
    const c = v.proj(p.x, p.y, 14 + Math.sin(t * 2.4 + p.id) * 3), a = t * 1.3 + p.id;
    const sh = v.proj(p.x, p.y);
    g.save();
    g.beginPath(); g.ellipse(sh[0], sh[1], 13, 6, 0, 0, Math.PI * 2); g.fillStyle = 'rgba(255,233,168,0.18)'; g.fill();
    g.translate(c[0], c[1]);
    const rx = 14, ry = 14 * (0.35 + 0.25 * Math.abs(Math.cos(a)));
    g.beginPath(); g.ellipse(0, 0, rx + 3, ry + 3, 0, 0, Math.PI * 2); g.strokeStyle = BD.ui.INK; g.lineWidth = 7; g.stroke();
    g.beginPath(); g.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); g.strokeStyle = '#ffe9a8'; g.lineWidth = 4.5; g.stroke();
    g.beginPath(); g.ellipse(0, 0, rx, ry, 0, Math.PI * 1.1, Math.PI * 1.5); g.strokeStyle = '#ffffff'; g.lineWidth = 2; g.stroke();
    for (let i = 0; i < 3; i++) { const b = a * 2 + (i * Math.PI * 2) / 3; g.fillStyle = '#fff7d8'; g.fillRect(Math.cos(b) * rx - 1.5, Math.sin(b) * ry - 1.5, 3, 3); }
    g.restore();
  },
});
