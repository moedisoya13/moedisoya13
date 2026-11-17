// 해류 (element) — GDD §5.3, §5.6, GDD-V2 §4.4, §8. Unlock: 4000 kills in total (v2).
// Every enemy the blade hits is pushed straight away from the hero and is wet. The push is scaled
// by the enemy's knockScale (heavy 0.33 → 0.4u, guardian ≤ 0.33, boss 0; engine and enemy defs) and
// an elite takes 0.4u like the heavies (GDD-V2 §4.4 "중갑·정예·수호자 0.4u"). An enemy pushed into a
// wall or obstacle takes the slam damage and is stunned 0.5 s (engine `slam`, damage per level).
// Wet enemies turn fire into steam and strengthen 뇌전.
// Levels (cumulative, ctx.lv):
//   1 push 1.2u, wet 4 s, slam 8   2 slam 14
//   3 push 1.8u; a pushed enemy that runs into another enemy: both take 6 (once each per push)
//   4 wet 6 s, slam 20
//   5 every 4th hitting swing a wave: a 5u × 2.4u line at factor 0.8 that pushes 3u
// On screen: blue #3aa0ff stripes on every trail (engine), a splash where the water hits (vfx
// 'splash'), a bump ring where pushed enemies collide (vfx 'tide_bump'), the level-5 wave as a
// curling blue wall along the aim (trail 'tide'), a water mark under wet enemies (engine).
const K = BD.cardKit;
const M = BD.math;
const T = { eliteScale: 0.33 };

// 3단계: the pushed enemy sweeps the path of its push; every other living enemy its body would run
// into on the way (centre within the two radii of the path, ahead of it) is bumped once.
function bumps(ctx, e, nx, ny, dist) {
  const w = ctx.w, dmg = ctx.lv.bump;
  const out = [];
  for (const o of w.enemies) {
    if (o === e || o.dead || o.down || o.hp <= 0) continue;
    const rx = o.x - e.x, ry = o.y - e.y, along = rx * nx + ry * ny;
    if (along <= 0 || along > dist + e.r + o.r) continue;
    if (Math.abs(rx * ny - ry * nx) > e.r + o.r) continue;
    out.push(o);
  }
  if (!out.length) return;
  let total = ctx.damage(e, dmg, { source: 'slam', direct: false });
  for (const o of out) total += ctx.damage(o, dmg, { source: 'slam', direct: false });
  ctx.credit(total);
  K.vfx(ctx, 'tide_bump', { x: K.r3(e.x + nx * Math.min(dist, 0.6)), y: K.r3(e.y + ny * Math.min(dist, 0.6)), life: 0.35 });
}

BD.cards.register({
  id: 'tide', name: '해류', family: 'element', element: 'tide', icon: 'tide',
  unlock: (save) => save.counters.kills >= 4000, unlockText: '누적 처치 4000',
  desc: '맞은 적을 용사 반대쪽으로 1.2u 밀고(중갑·정예·수호자 0.4u, 마왕 0) 4초간 젖음. 밀린 적이 벽·장애물에 부딪히면 8 피해와 0.5초 기절.',
  T,
  levels: [null,
    { text: '맞은 적을 1.2u 밀고(중갑·정예·수호자 0.4u) 4초 젖음. 벽에 부딪히면 8 피해·0.5초 기절', push: 1.2, wet: 4, slam: 8, bump: 0, wave: 0 },
    { text: '충돌 피해 14', slam: 14 },
    { text: '미는 거리 1.8u. 밀린 적이 다른 적과 부딪히면 둘 다 6 피해', push: 1.8, bump: 6 },
    { text: '젖음 6초, 충돌 피해 20', wet: 6, slam: 20 },
    { text: '맞힌 베기 4번째마다 파도: 길이 5u·폭 2.4u 직선, 배율 0.8, 3u 민다', wave: 0.8 },
  ],
  init(ctx) { ctx.state.n = 0; },
  shapes(ctx) {
    if (!ctx.lv.wave || !K.nthSwing(ctx.state, 4)) return [];
    return [{ kind: 'line', len: 5, width: 2.4, factor: ctx.lv.wave, source: 'slash', tideWave: true }];
  },
  onHit(ctx, e, hit) {
    const h = ctx.hero, lv = ctx.lv;
    const wave = !!(hit.shape && hit.shape.card === 'tide');
    let nx, ny;
    if (wave) { nx = Math.cos(hit.shape.dir); ny = Math.sin(hit.shape.dir); } else {
      [nx, ny] = M.norm(e.x - h.x, e.y - h.y);
      if (!nx && !ny) { nx = Math.cos(ctx.swing.aim); ny = Math.sin(ctx.swing.aim); }
    }
    if (wave) ctx.credit(hit.dmg);
    if (!e.down && e.hp > 0) {
      const push = wave ? 3 : lv.push;
      const scale = e.elite && !e.guardian ? Math.min(1, T.eliteScale / (e.knockScale || 1)) : 1; // elites move 0.4u like heavies
      ctx.knock(e, nx, ny, push * scale, { slam: true, slamDmg: lv.slam });
      if (lv.bump) bumps(ctx, e, nx, ny, push * scale * e.knockScale);
    }
    if (!e.dead) ctx.status(e, 'wet', { dur: lv.wet });
    K.vfx(ctx, 'splash', { x: K.r3(e.x), y: K.r3(e.y), dir: K.r3(Math.atan2(ny, nx)), life: 0.4 });
  },
  on: {
    steam(ev, ctx) { K.steamFeedback(ctx, ev); },
    swing_end(ev, ctx) { if (ev.hitCount > 0) ctx.state.n++; },
  },
  hud(state, ctx) { return ctx && ctx.lv.wave ? { pips: state.n % 4 } : {}; },
});

BD.render.vfx.register({
  id: 'splash',
  draw(g, v, ev, k) {
    const D = K.draw, a = 1 - k;
    // a crest of water thrown along the push, then droplets
    const arc = D.arcPts(v, ev.x, ev.y, 0.45 + 0.5 * k, ev.dir - 1.0, ev.dir + 1.0, 10, 12 + 10 * (1 - k));
    D.path(g, arc);
    g.lineCap = 'round';
    g.strokeStyle = 'rgba(10,10,12,' + 0.8 * a + ')'; g.lineWidth = 7; g.stroke();
    g.strokeStyle = D.rgba('#3aa0ff', a); g.lineWidth = 4.5; g.stroke();
    g.strokeStyle = 'rgba(220,240,255,' + a + ')'; g.lineWidth = 1.5; g.stroke();
    g.lineCap = 'butt';
    for (let i = 0; i < 6; i++) {
      const an = ev.dir + (i - 2.5) * 0.4, d = 0.3 + k * (0.7 + (i % 3) * 0.2);
      const c = v.proj(ev.x + Math.cos(an) * d, ev.y + Math.sin(an) * d, 10 + 30 * k * (1 - k) * 4);
      g.beginPath(); g.arc(c[0], c[1], 3.2 * a + 1, 0, M.TAU);
      g.fillStyle = D.rgba('#3aa0ff', a); g.fill();
      g.lineWidth = 1; g.strokeStyle = 'rgba(10,10,12,' + a + ')'; g.stroke();
    }
  },
});

// 3단계: two bodies knocking together — a white-blue ring with an ink star
BD.render.vfx.register({
  id: 'tide_bump',
  draw(g, v, ev, k) {
    const D = K.draw, a = 1 - k, c = v.proj(ev.x, ev.y, 24);
    D.ellipse(g, v, ev.x, ev.y, 0.3 + 0.5 * k, null, D.rgba('#3aa0ff', a), 4);
    g.save(); g.translate(c[0], c[1]); g.globalAlpha = a;
    const s = 10 + 8 * k;
    D.path(g, [[0, -s], [s * 0.25, -s * 0.25], [s, 0], [s * 0.25, s * 0.25], [0, s], [-s * 0.25, s * 0.25], [-s, 0], [-s * 0.25, -s * 0.25]], true);
    g.fillStyle = '#e6f4ff'; g.fill(); g.lineWidth = 2; g.strokeStyle = K.INK; g.stroke();
    g.restore();
  },
});

// 5단계: the wave — a curling wall of water that runs out along the line
BD.render.trails.register({
  id: 'tide',
  draw(g, v, s, k, tr, w) {
    const D = K.draw, a = 1 - k;
    const run = Math.min(1, 0.2 + k * 3), cx = Math.cos(s.dir), cy = Math.sin(s.dir), nx = -cy, ny = cx;
    const L = s.len * run, hw = s.width / 2;
    const p = (u, off, z) => v.proj(s.x + cx * u + nx * off, s.y + cy * u + ny * off, z);
    const body = [p(0.3, -hw, 4), p(L, -hw * 0.8, 4), p(L + 0.4, 0, 30), p(L, hw * 0.8, 4), p(0.3, hw, 4)];
    D.path(g, body, true);
    g.fillStyle = D.rgba('#3aa0ff', 0.45 * a); g.fill();
    g.lineWidth = 4; g.strokeStyle = 'rgba(10,10,12,' + 0.8 * a + ')'; g.stroke();
    // the crest: white foam along the front edge
    const crest = [];
    for (let i = 0; i <= 10; i++) { const off = -hw + (2 * hw * i) / 10; crest.push(p(L - Math.abs(off) * 0.35, off, 26 + 8 * Math.sin(i + k * 9))); }
    D.path(g, crest);
    g.lineCap = 'round';
    g.strokeStyle = 'rgba(10,10,12,' + 0.8 * a + ')'; g.lineWidth = 9; g.stroke();
    g.strokeStyle = D.rgba('#3aa0ff', a); g.lineWidth = 6; g.stroke();
    g.strokeStyle = 'rgba(240,250,255,' + a + ')'; g.lineWidth = 2.5; g.stroke();
    g.lineCap = 'butt';
  },
});
