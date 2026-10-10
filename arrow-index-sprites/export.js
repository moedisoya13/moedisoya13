// Arrow Index artifact HTML에서 core/art/gfx 부분만 잘라 headless Chromium에서 실행, sprite를 PNG로 저장
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const [src, out] = process.argv.slice(2);
const lines = fs.readFileSync(src, 'utf8').split('\n');
const sliceBetween = (a, b) => {
  const i = lines.findIndex(l => l.startsWith(a)), j = lines.findIndex(l => l.startsWith(b));
  if (i < 0 || j < 0) throw new Error('marker not found: ' + a + ' / ' + b);
  return lines.slice(i, j).join('\n');
};
const code = sliceBetween('// ── core.js ──', '// ── data.js ──') + '\n' + sliceBetween('// ── gfx.js ──', '// ── audio.js ──');

const pageFn = (SCALES) => {
  Gfx.init();
  const files = {}, meta = { scales: SCALES, art: {}, icons: {}, digits: {}, procedural: {}, dither: {} };
  const url = c => c.toDataURL('image/png');
  const sheet = (cells, cols, P) => {             // cells: [{bm}] or canvases at 1x
    const cw = Math.max(...cells.map(b => b.w)), ch = Math.max(...cells.map(b => b.h));
    const rows = Math.ceil(cells.length / cols);
    const c = document.createElement('canvas');
    c.width = cw * cols * P; c.height = ch * rows * P;
    const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
    const rects = cells.map((b, i) => {
      const x = (i % cols) * cw, y = ((i / cols) | 0) * ch;
      g.drawImage(rasterize(b, P), x * P, y * P);
      return { x: x * P, y: y * P, w: b.w * P, h: b.h * P };
    });
    return { c, rects, cw, ch };
  };
  for (const P of SCALES) {
    const d = `${P}x`;
    // 캐릭터/몬스터/보스/아이템: 프레임별 + 가로 strip
    for (const name in Gfx.bitmaps) {
      const frs = Gfx.bitmaps[name];
      frs.forEach((bm, i) => { files[`${d}/art/${name}/${name}_${i}.png`] = url(rasterize(bm, P)); });
      const s = sheet(frs, frs.length, P);
      files[`${d}/sheets/art_${name}.png`] = url(s.c);
      meta.art[name] = meta.art[name] || { frames: frs.length, size: frs.map(b => [b.w, b.h]) };
      meta.art[name][`sheet_${d}`] = s.rects;
      // 정예(반전) variant
      frs.forEach((bm, i) => { files[`${d}/art_elite/${name}/${name}_${i}.png`] = url(rasterize(bm, P, 'i')); });
    }
    // 업그레이드 아이콘
    for (const name in ICONS) {
      const bm = withOutline(parseRows(ICONS[name]));
      files[`${d}/icons/${name}.png`] = url(rasterize(bm, P));
      meta.icons[name] = [bm.w, bm.h];
    }
    // 데미지 숫자
    const dnames = { '!': 'bang', '+': 'plus', '-': 'minus' };
    const dk = Object.keys(DIGITS);
    for (const k of dk) {
      const bm = Gfx.digitBm[k];
      files[`${d}/digits/${dnames[k] || k}.png`] = url(rasterize(bm, P));
      meta.digits[k] = { file: (dnames[k] || k) + '.png', size: [bm.w, bm.h] };
    }
    files[`${d}/sheets/digits.png`] = url(sheet(dk.map(k => Gfx.digitBm[k]), dk.length, P).c);
    meta.digits.sheetOrder = dk;
    // 절차적 회전 sprite (64방향): 1x 비트맵을 다시 만들기 위해 rasterPts 를 1배율로 호출 후 확대
    Gfx.P = 1; Gfx.buildProcedural(); Gfx.buildDither();
    const toBm = c => { const g = c.getContext('2d'), im = g.getImageData(0, 0, c.width, c.height); return { c, w: c.width, h: c.height }; };
    const procSheet = (list, label) => {
      const n = list.length, cols = 8, cw = list[0].width, ch = list[0].height, rows = Math.ceil(n / cols);
      const c = document.createElement('canvas'); c.width = cw * cols * P; c.height = ch * rows * P;
      const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
      list.forEach((s, i) => g.drawImage(s, (i % cols) * cw * P, ((i / cols) | 0) * ch * P, cw * P, ch * P));
      files[`${d}/procedural/${label}.png`] = url(c);
      // 0°(오른쪽) 한 장
      const one = document.createElement('canvas'); one.width = cw * P; one.height = ch * P;
      const og = one.getContext('2d'); og.imageSmoothingEnabled = false; og.drawImage(list[0], 0, 0, cw * P, ch * P);
      files[`${d}/procedural/${label}_0deg.png`] = url(one);
      meta.procedural[label] = { angles: n, cols, cell: [cw, ch], note: 'index i = angle i/64*360°, 0° = 오른쪽, 시계방향(canvas y-down)' };
    };
    for (const k in Gfx.arrows) procSheet(Gfx.arrows[k], `arrow_${k}`);
    procSheet(Gfx.bows[0], 'bow_rest'); procSheet(Gfx.bows[1], 'bow_drawn'); procSheet(Gfx.feathers, 'feather');
    // 디더 타일 17단계 (4x4 Bayer, 투명 배경 위 잉크)
    const dt = Gfx.ditherTiles, dc = document.createElement('canvas');
    dc.width = 4 * 17 * P; dc.height = 4 * P;
    const dg = dc.getContext('2d'); dg.imageSmoothingEnabled = false;
    dt.forEach((t, i) => dg.drawImage(t, i * 4 * P, 0, 4 * P, 4 * P));
    files[`${d}/sheets/dither_17.png`] = url(dc);
    meta.dither = { levels: 17, tile: [4, 4], note: 'level n = Bayer 값 < n 인 칸에 잉크' };
  }
  // 전체 미리보기 (4x, 어두운 배경)
  const P = 4, pad = 10, colW = 140, names = Object.keys(Gfx.bitmaps);
  const cols = 8, rowH = 56 * P / 2 + 30;
  const items = names.map(n => Gfx.bitmaps[n][0]);
  const maxH = Math.max(...items.map(b => b.h)) * 3;
  const ov = document.createElement('canvas');
  ov.width = cols * colW + pad * 2; ov.height = Math.ceil(names.length / cols) * (maxH + 26) + pad * 2;
  const og = ov.getContext('2d'); og.imageSmoothingEnabled = false;
  og.fillStyle = PAPER; og.fillRect(0, 0, ov.width, ov.height);
  og.fillStyle = '#8d8a80'; og.font = '12px monospace'; og.textAlign = 'center';
  names.forEach((n, i) => {
    const bm = Gfx.bitmaps[n][0], s = Math.min(3, Math.floor((colW - 8) / bm.w));
    const x = pad + (i % cols) * colW, y = pad + ((i / cols) | 0) * (maxH + 26);
    og.drawImage(rasterize(bm, s), x + (colW - bm.w * s) / 2, y + maxH - bm.h * s);
    og.fillText(`${n} ×${Gfx.bitmaps[n].length}`, x + colW / 2, y + maxH + 16);
  });
  files['preview_art.png'] = url(ov);
  return { files, meta };
};

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' }).catch(() => chromium.launch());
  const page = await browser.newPage();
  page.on('pageerror', e => { console.error('pageerror', e); process.exitCode = 1; });
  await page.setContent('<!doctype html><meta charset=utf-8><body>');
  await page.addScriptTag({ content: code + '\nwindow.__export = ' + pageFn.toString() + ';' });
  const { files, meta } = await page.evaluate(() => window.__export([1, 4]));
  await browser.close();
  for (const [p, d] of Object.entries(files)) {
    const fp = path.join(out, p);
    fs.mkdirSync(path.dirname(fp), { recursive: true });
    fs.writeFileSync(fp, Buffer.from(d.split(',')[1], 'base64'));
  }
  fs.writeFileSync(path.join(out, 'atlas.json'), JSON.stringify(meta, null, 1));
  console.log('wrote', Object.keys(files).length, 'png');
})();
