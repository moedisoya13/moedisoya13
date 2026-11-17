// BARE effects (engine placeholder): ink sparks on hits and baked ink splats on kills, to
// show how effects use the particle pool and the floor bake layer. The UI agent replaces it.
BD.ui.effects.register({
  id: 'basic_hits',
  on: {
    hit(ev, ui) {
      const r = ui.world.rng.fx;
      for (let i = 0; i < 4; i++) {
        ui.fx.emit({ x: ev.x, y: ev.y, z: 20, vx: r.range(-2, 2), vy: r.range(-2, 2), vz: r.range(40, 120), g: 400, life: 0.35, color: '#0a0a0c', size: 3 });
      }
    },
    kill(ev, ui) {
      const r = ui.world.rng.fx;
      BD.client.render.bake((g, v) => {
        const [x, y] = v.proj(ev.x, ev.y);
        g.fillStyle = 'rgba(10,10,12,0.75)';
        for (let i = 0; i < 6; i++) { g.beginPath(); g.ellipse(x + r.range(-14, 14), y + r.range(-6, 6), r.range(3, 9), r.range(2, 4), 0, 0, Math.PI * 2); g.fill(); }
      });
    },
  },
});
