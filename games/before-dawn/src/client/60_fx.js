// Particle pool for presentation effects. Cap 300 (GDD §0): the oldest particles are
// dropped first. Particles never touch the simulation; world.particleCount mirrors the size.
// p = {x, y, z, vx, vy, vz, g (gravity px/s²), life, color, size, shape: 'dot'|'line'|'text',
//      text, layer: 'floor'|'world'|'screen', screen: bool (x/y are logical px)}

const C = BD.C;
const FX = BD.client.fx = { list: [] };

FX.emit = function (p) {
  p.age = 0;
  p.z = p.z || 0; p.vx = p.vx || 0; p.vy = p.vy || 0; p.vz = p.vz || 0;
  p.layer = p.layer || 'world';
  FX.list.push(p);
  if (FX.list.length > C.CAP.particles) FX.list.splice(0, FX.list.length - C.CAP.particles);
};
FX.reset = function () { FX.list = []; };
FX.update = function (dt) {
  for (const p of FX.list) {
    p.age += dt;
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.z += p.vz * dt; p.vz -= (p.g || 0) * dt;
    if (p.z < 0 && !p.screen) { p.z = 0; p.vz = 0; p.vx *= 0.5; p.vy *= 0.5; }
  }
  FX.list = FX.list.filter((p) => p.age < p.life);
};
FX.draw = function (g, v, layer) {
  for (const p of FX.list) {
    if (p.layer !== layer) continue;
    const k = 1 - p.age / p.life;
    const [x, y] = p.screen ? [p.x, p.y] : v.proj(p.x, p.y, p.z);
    g.globalAlpha = Math.max(0, Math.min(1, k * (p.alpha || 1)));
    if (p.shape === 'text') {
      g.font = BD.ui.font(p.size || 22, 900);
      g.textAlign = 'center'; g.lineWidth = 4; g.strokeStyle = BD.ui.INK; g.strokeText(p.text, x, y); g.fillStyle = p.color; g.fillText(p.text, x, y);
    } else {
      g.fillStyle = p.color;
      g.beginPath(); g.arc(x, y, (p.size || 3) * (0.5 + 0.5 * k), 0, Math.PI * 2); g.fill();
    }
  }
  g.globalAlpha = 1;
};
