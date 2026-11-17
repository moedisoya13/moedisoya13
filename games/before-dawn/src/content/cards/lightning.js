// 뇌전 (element) — GDD §5.3, §5.6, §4.
// From the swing's primary target, the bolt jumps to the nearest enemy not hit yet whose edge
// is within 3.0u of the last link, up to 3 jumps. Each jump deals 60 % of the final damage the
// primary took from that swing (source 'chain', indirect: the front guard does not apply).
// If the path holds a wet enemy (the primary included — 해류 wets it first in ⑤ order) the
// chain deals 100 % and may run to 5 jumps.
// Strikes without a swing primary: a wave chains from the first enemy it hits (once per swing,
// and not if the blade already chained); a riposte from the hit enemy nearest to the hero;
// 무결's echo carries the swing's primary and chains from it.
// On screen: pale blue #bfe9ff stripes on every trail (engine) and a zigzag bolt along the
// chain path (vfx 'chain_bolt'). Lightning is pale blue, never yellow (GDD §16 ③).
const K = BD.cardKit;
const M = BD.math;
const T = { range: 3.0, jumps: 3, jumpsWet: 5, pct: 0.6, pctWet: 1.0 };

function chainPath(w, from, used) {
  const path = [];
  let cur = from, wet = !!from.statuses.wet, max = wet ? T.jumpsWet : T.jumps;
  while (path.length < max) {
    let best = null, bd = Infinity;
    for (const o of w.enemies) {
      if (o.dead || o.down || o.hp <= 0 || used.has(o.id)) continue;
      const d = M.dist(cur.x, cur.y, o.x, o.y) - o.r;
      if (d > T.range + 1e-9) continue;
      if (d < bd - 1e-9 || (Math.abs(d - bd) <= 1e-9 && o.id < best.id)) { bd = d; best = o; }
    }
    if (!best) break;
    used.add(best.id);
    path.push(best);
    if (!wet && best.statuses.wet) { wet = true; max = T.jumpsWet; }
    cur = best;
  }
  return { path, wet };
}

BD.cards.register({
  id: 'lightning', name: '뇌전', family: 'element', element: 'lightning', unlock: 'base', icon: 'lightning',
  desc: '표적(주 대상)에서 3.0u 안의 아직 안 맞은 적으로 최대 3번 연쇄. 연쇄 피해는 베기 피해의 60%. 연쇄 경로에 젖은 적이 있으면 100%, 최대 5번.',
  T,
  onHit(ctx, e, hit) {
    const sw = ctx.swing;
    if (sw.data.chained) return;
    const p = sw.data.projectile;
    let used;
    if (p) {
      if (p.chained) return;
      p.chained = true;
      used = new Set(p.hitIds);
    } else {
      if (sw.primaryId) { if (e.id !== sw.primaryId) return; } else {
        let best = null, bd = Infinity;
        for (const h of sw.hits) {
          const d = M.dist(sw.x, sw.y, h.e.x, h.e.y);
          if (d < bd - 1e-9 || (Math.abs(d - bd) <= 1e-9 && h.e.id < best.id)) { bd = d; best = h.e; }
        }
        if (best !== e) return;
      }
      used = new Set(sw.hits.map((h) => h.e.id));
    }
    sw.data.chained = true;
    used.add(e.id);
    const { path, wet } = chainPath(ctx.w, e, used);
    if (!path.length) return;
    const amount = hit.dmg * (wet ? T.pctWet : T.pct);
    let total = 0;
    for (const o of path) total += ctx.damage(o, amount, { source: 'chain', direct: false });
    ctx.credit(total);
    K.vfx(ctx, 'chain_bolt', { points: [[K.r3(e.x), K.r3(e.y)]].concat(path.map((o) => [K.r3(o.x), K.r3(o.y)])), wet, life: 0.28 });
  },
  hud() { return {}; },
});

BD.render.vfx.register({
  id: 'chain_bolt',
  draw(g, v, ev, k, w, t) {
    const D = K.draw, a = 1 - k * k;
    const flick = Math.floor(t * 30);
    const pts = [];
    for (let i = 0; i < ev.points.length - 1; i++) {
      const [x0, y0] = ev.points[i], [x1, y1] = ev.points[i + 1];
      const dx = x1 - x0, dy = y1 - y0, L = Math.sqrt(dx * dx + dy * dy) || 1, nx = -dy / L, ny = dx / L;
      const n = Math.max(3, Math.round(L * 2.5));
      for (let j = 0; j <= n; j++) {
        if (i > 0 && j === 0) continue;
        const u = j / n, off = j === 0 || j === n ? 0 : (D.hash(i * 31 + j, flick) - 0.5) * 0.55;
        pts.push(v.proj(x0 + dx * u + nx * off, y0 + dy * u + ny * off, 26));
      }
    }
    if (pts.length < 2) return;
    D.path(g, pts);
    g.lineJoin = 'miter'; g.lineCap = 'round';
    g.strokeStyle = 'rgba(10,10,12,' + 0.85 * a + ')'; g.lineWidth = 7; g.stroke();
    g.strokeStyle = D.rgba(ev.wet ? '#3aa0ff' : '#bfe9ff', 0.55 * a); g.lineWidth = 10; g.stroke();
    g.strokeStyle = D.rgba('#bfe9ff', a); g.lineWidth = 3.5; g.stroke();
    g.strokeStyle = 'rgba(255,255,255,' + a + ')'; g.lineWidth = 1.4; g.stroke();
    for (const [x, y] of ev.points.slice(1)) D.ellipse(g, v, x, y, 0.28 + 0.2 * (1 - k), D.rgba('#bfe9ff', 0.45 * a), null, 0, 0);
    g.lineCap = 'butt';
  },
});
