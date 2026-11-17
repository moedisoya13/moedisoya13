// Look of the rooftop's four fixed pillars (GDD §7.5; the engine builds the rooftop grid and
// names its pattern 'rooftop'). Black stone of the demon castle with a violet seam.
BD.render.obstacles.register({
  id: 'rooftop',
  draw(g, v, cx, cy, w, t) {
    BD.roomKit.drawPillar(g, v, cx, cy, 78, ['#4a4458', '#2c2836', '#221f2b']);
    const P = v.proj, a = P(cx + 0.5, cy + 0.84, 14), b = P(cx + 0.5, cy + 0.84, 64);
    g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]);
    g.strokeStyle = 'rgba(170,110,255,' + (0.45 + 0.2 * Math.sin(t * 2 + cx)) + ')'; g.lineWidth = 3; g.stroke();
  },
});
