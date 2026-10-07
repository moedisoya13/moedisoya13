// 앱 아이콘 생성: 게임 스프라이트(재키 포즈) + 빨간 상승 차트.
// 사용: NODE_PATH="$(npm root -g)" node tools/make-icons.cjs
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const { serve } = await import(path.join(__dirname, 'serve.mjs'));
  const server = await serve(8124);
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' });
  const page = await browser.newPage();
  await page.goto('http://localhost:8124/manifest.webmanifest');
  const out = await page.evaluate(async () => {
    const { buildSprites, SPR } = await import('/src/sprites.js');
    buildSprites();
    const res = {};
    for (const size of [180, 192, 512]) {
      const N = 48; // 48x48 픽셀 아트로 그린 뒤 확대
      const c = document.createElement('canvas');
      c.width = N;
      c.height = N;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#1d1420';
      ctx.fillRect(0, 0, N, N);
      ctx.fillStyle = '#2a1e30';
      for (let y = 0; y < N; y += 6) for (let x = (y / 6) % 2 ? 3 : 0; x < N; x += 6) ctx.fillRect(x, y, 5, 5);
      // 상승 차트
      const pts = [[2, 40], [10, 34], [16, 37], [24, 24], [30, 28], [38, 12], [45, 6]];
      ctx.fillStyle = '#ff4d5e';
      for (let i = 1; i < pts.length; i++) {
        const [x0, y0] = pts[i - 1];
        const [x1, y1] = pts[i];
        const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
        for (let k = 0; k <= n; k++) ctx.fillRect(Math.round(x0 + ((x1 - x0) * k) / n), Math.round(y0 + ((y1 - y0) * k) / n), 2, 2);
      }
      ctx.fillRect(42, 4, 5, 2);
      ctx.fillRect(45, 4, 2, 5);
      const s = SPR.jacky_pose;
      ctx.drawImage(s.c, 2, N - s.H * 2 + 1, s.W * 2, s.H * 2);
      const big = document.createElement('canvas');
      big.width = size;
      big.height = size;
      const b = big.getContext('2d');
      b.imageSmoothingEnabled = false;
      b.drawImage(c, 0, 0, size, size);
      res[size] = big.toDataURL('image/png');
    }
    return res;
  });
  for (const [size, url] of Object.entries(out)) {
    fs.writeFileSync(path.join(__dirname, '../web/icons', `icon-${size}.png`), Buffer.from(url.split(',')[1], 'base64'));
  }
  console.log('icons:', Object.keys(out).join(', '));
  await browser.close();
  server.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
