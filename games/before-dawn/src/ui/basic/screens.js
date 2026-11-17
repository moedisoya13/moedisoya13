// BARE screens (engine placeholder): title → run → result → retry. The UI agent replaces these.

const C = BD.C;

BD.ui.screens.register({
  id: 'title',
  draw(g, ui) {
    BD.client.render.drawSky(g, null);
    g.fillStyle = 'rgba(5,6,13,0.4)'; g.fillRect(0, 0, C.VIEW_W, C.VIEW_H);
    const img = BD.client.assets.img.hero_slash;
    if (img) g.drawImage(img, 640 - img.width * 0.6, 330, img.width * 1.2, img.height * 1.2);
    ui.text('여명 전야', 640, 210, { size: 84, align: 'center', weight: 900, stroke: 8 });
    ui.text('Before Dawn', 640, 258, { size: 26, align: 'center', color: '#c9b98f', stroke: 4 });
    ui.button({ x: 540, y: 600, w: 200, h: 56, label: '출정', size: 28, style: 'primary', menu: true, onTap: () => ui.startRun() });
    const s = ui.app.save;
    ui.text('최고 기록: ' + (s.bestFloor ? (s.bestFloor === 6 ? '옥상' : s.bestFloor + 'F') : '—') + ' · 승리 ' + s.wins + '회', 640, 690, { size: 16, align: 'center', color: '#a8a090' });
  },
});

BD.ui.screens.register({
  id: 'result',
  draw(g, ui) {
    const r = ui.app.lastResult;
    BD.client.render.drawSky(g, null);
    g.fillStyle = 'rgba(5,6,13,0.6)'; g.fillRect(0, 0, C.VIEW_W, C.VIEW_H);
    if (!r) return;
    const win = r.result === 'win';
    ui.text(win ? '여명' : '쓰러졌다', 640, 150, { size: 72, align: 'center', weight: 900, stroke: 7, color: win ? '#ffe2a8' : '#f3ead8' });
    const where = r.floor === 6 ? '옥상' : r.floor + 'F';
    ui.text(win ? r.clock + ', 마왕이 쓰러졌다' : where + ' · ' + r.clock + ' · ' + r.causeText, 640, 205, { size: 24, align: 'center', stroke: 4 });
    let y = 270;
    for (const c of r.cards) {
      const extra = c.goal ? ' ' + c.progress + '/' + c.goal : c.bestStack ? ' 최고 ×' + c.bestStack : '';
      ui.text(c.name + extra + ' · 기여 ' + c.contrib, 640, y, { size: 20, align: 'center' });
      y += 30;
    }
    y += 10;
    ui.text('처치 ' + r.kills + ' · 시련 ' + r.trials + ' · 시드 ' + r.seed, 640, y, { size: 18, align: 'center', color: '#c9c1ae' });
    if (r.topDamage.length) ui.text('받은 피해: ' + r.topDamage.map((d) => d.text + ' ' + d.dmg).join(' · '), 640, y + 30, { size: 16, align: 'center', color: '#c9c1ae' });
    for (const u of r.unlocks || []) if (u.kind === 'card') { y += 26; ui.text('새 성인: ' + u.name, 640, y + 60, { size: 18, align: 'center', color: '#ffd24a' }); }
    ui.button({ x: 330, y: 600, w: 190, h: 54, label: '다시 오른다', menu: true, style: 'primary', onTap: () => { ui.app.retry(false); ui.focus = 0; } });
    ui.button({ x: 545, y: 600, w: 190, h: 54, label: '같은 밤 다시', menu: true, onTap: () => { ui.app.retry(true); ui.focus = 0; } });
    ui.button({ x: 760, y: 600, w: 190, h: 54, label: '타이틀로', menu: true, onTap: () => { ui.app.toTitle(); ui.focus = 0; } });
  },
});
