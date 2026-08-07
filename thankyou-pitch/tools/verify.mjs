/**
 * 빌드 결과 검증.
 *
 *   node tools/verify.mjs [url]
 *
 * 기본값은 dist/index.html을 file://로 여는 것 — 실제 배포 형태 그대로 확인한다.
 * 콘솔 에러를 모으고, 챕터별 대표 시각의 스크린샷을 tools/shots/에 남긴다.
 */
import { chromium } from 'playwright';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const shotsDir = resolve(here, 'shots');

const target = process.argv[2] || pathToFileURL(resolve(root, 'dist/index.html')).href;

/** 챕터별 대표 시각 (초) */
const MARKS = [
  { t: 3.0, name: '01-rumor' },
  { t: 10.5, name: '02-hunter' },
  { t: 17.5, name: '03-bait' },
  { t: 24.2, name: '04-fastball-flight' },
  { t: 25.1, name: '04-fastball-mitt' },
  { t: 31.9, name: '05-niagara-break' },
  { t: 33.0, name: '05-niagara-whiff' },
  { t: 40.4, name: '06-moon-swing' },
  { t: 41.6, name: '06-moon-after' },
  { t: 50.0, name: '07-identity' },
  { t: 57.5, name: '08-offer' },
  { t: 60.8, name: '08-title' },
];

const VIEWPORTS = [
  { name: 'wide', width: 1280, height: 720 },
  { name: 'hd', width: 1920, height: 1080 },
  { name: 'mobile', width: 390, height: 844 },
];

const problems = [];

function record(kind, text) {
  // three.js가 내는 정보성 로그는 걸러 낸다
  if (/THREE\.WebGLRenderer: WebGL context/i.test(text)) return;
  problems.push(`[${kind}] ${text}`);
}

// 이 환경에는 Chromium이 미리 깔려 있고 playwright 패키지가 기대하는 빌드 번호와
// 다를 수 있다. 있으면 그 실행 파일을 그대로 쓴다.
const PREINSTALLED = '/opt/pw-browsers/chromium';

const browser = await chromium.launch({
  ...(existsSync(PREINSTALLED) ? { executablePath: PREINSTALLED } : {}),
  args: [
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--allow-file-access-from-files',
    '--disable-lcd-text',
  ],
});

const page = await browser.newPage({ viewport: VIEWPORTS[0] });
page.on('console', (msg) => {
  if (msg.type() === 'error' || msg.type() === 'warning') record(msg.type(), msg.text());
});
page.on('pageerror', (err) => record('pageerror', err.message));
page.on('requestfailed', (req) => record('requestfailed', `${req.url()} ${req.failure()?.errorText}`));

console.log(`→ ${target}`);
await page.goto(target, { waitUntil: 'load' });

// 디렉터가 붙을 때까지 기다린다 (= 모듈이 실제로 실행됐다는 증거)
await page.waitForFunction(() => !!window.__director, null, { timeout: 15000 });

const info = await page.evaluate(() => ({
  duration: window.__director.duration,
  chapters: window.__director.chapters.map((c) => ({ no: c.no, title: c.title, t0: c.t0, t1: c.t1 })),
  webgl: !!window.__stage.world.renderer.getContext(),
}));

console.log(`  duration = ${info.duration}s, chapters = ${info.chapters.length}, webgl = ${info.webgl}`);

/* ---- 타임라인 정합성 ---- */
if (Math.abs(info.duration - 60) > 3) {
  problems.push(`[timeline] 총 길이 ${info.duration}s — 60±3s 범위를 벗어남`);
}
info.chapters.forEach((c, i) => {
  if (i > 0 && Math.abs(c.t0 - info.chapters[i - 1].t1) > 1e-6) {
    problems.push(`[timeline] 챕터 ${c.no} 시작(${c.t0})이 이전 챕터 끝(${info.chapters[i - 1].t1})과 불연속`);
  }
  if (c.t1 <= c.t0) problems.push(`[timeline] 챕터 ${c.no} 구간이 비었음`);
});

/* ---- 챕터별 스냅샷 ---- */
await rm(shotsDir, { recursive: true, force: true });
await mkdir(shotsDir, { recursive: true });

await page.evaluate(() => window.__director.pause());

for (const mark of MARKS) {
  await page.evaluate((t) => window.__director.seek(t, { keepPlaying: false }), mark.t);
  // seek 후 실제로 한 프레임이 그려질 때까지 기다린다
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  );
  await page.screenshot({ path: resolve(shotsDir, `${mark.name}.png`) });
  console.log(`  📸 t=${mark.t}s → ${mark.name}.png`);
}

/* ---- 반응형 ---- */
for (const vp of VIEWPORTS.slice(1)) {
  await page.setViewportSize({ width: vp.width, height: vp.height });
  await page.evaluate(() => window.__director.seek(57.5, { keepPlaying: false }));
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  );
  await page.screenshot({ path: resolve(shotsDir, `vp-${vp.name}.png`) });
  console.log(`  📐 ${vp.name} ${vp.width}x${vp.height}`);
}
await page.setViewportSize(VIEWPORTS[0]);

/* ---- 인터랙션 ---- */
await page.evaluate(() => window.__director.replay());
await page.waitForTimeout(600);
await page.evaluate(() => window.__director.pause());
const afterPause = await page.evaluate(() => window.__director.time);
await page.waitForTimeout(300);
const stillPaused = await page.evaluate(() => window.__director.time);
if (Math.abs(afterPause - stillPaused) > 1e-6) problems.push('[controls] 일시정지 후에도 시간이 흐름');

await page.evaluate(() => window.__director.jumpToChapter(6));
const jumped = await page.evaluate(() => ({ t: window.__director.time, no: window.__director.chapter.no }));
if (jumped.no !== 6) problems.push(`[controls] 챕터 점프 실패 (no=${jumped.no}, t=${jumped.t})`);

// 자막·사운드 토글이 예외 없이 동작하는지
await page.click('#btn-cc');
await page.click('#btn-cc');
await page.click('#btn-sound');
await page.waitForTimeout(400);
await page.click('#btn-sound');

/* ---- 실제 재생 (루프가 도는지 + 예외가 안 나는지) ----
   헤드리스 SwiftShader는 GPU보다 훨씬 느려서 타임라인이 실시간보다 느리게 흐른다.
   여기서는 "재생이 진행되는가"만 보고, 실제 속도는 fps로 따로 보고한다. */
await page.evaluate(() => window.__director.replay());
const t0 = Date.now();
await page.waitForTimeout(4000);
const running = await page.evaluate(() => window.__director.time);
const rate = running / ((Date.now() - t0) / 1000);
console.log(`  ▶ 재생 진행 ${running.toFixed(2)}s / 실시간 4s (배속 ${rate.toFixed(2)}x, 헤드리스 소프트웨어 렌더링 기준)`);
if (running < 0.15) {
  problems.push(`[playback] 4초 동안 타임라인이 ${running.toFixed(2)}s밖에 진행되지 않음 — 렌더 루프가 도는지 확인 필요`);
}

await browser.close();

/* ---- 결과 ---- */
console.log('');
if (problems.length === 0) {
  console.log('✅ 콘솔 에러/경고 0건, 타임라인·컨트롤 검증 통과');
  console.log(`   스냅샷: ${shotsDir}`);
} else {
  console.log(`❌ 문제 ${problems.length}건`);
  for (const p of problems) console.log('   ' + p);
  process.exitCode = 1;
}
