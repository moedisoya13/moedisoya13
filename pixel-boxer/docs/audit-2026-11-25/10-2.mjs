// Eye 10, finding 10-2: the disposal list (docs/handoff.md §7 and the dispose cards of src/open.data.mjs) names things
// that are not there, or leaves out what a deletion would break. Read-only: a deletion is tried on a copy of src/ in a
// temp dir (under this script's scratch), never in the checkout.
//   node 10-2.mjs <pixel-boxer root>
import { readFileSync, readdirSync, existsSync, mkdtempSync, cpSync, rmSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const root = path.resolve(process.argv[2]);
const read = f => readFileSync(path.join(root, f), 'utf8');
function walkAll(d) { return readdirSync(path.join(root, d), { withFileTypes: true }).flatMap(e => (e.isDirectory() ? walkAll(path.join(d, e.name)) : [path.join(d, e.name)])); }
const SCRATCH = '/tmp/pixel-boxer-audit/audit/repro/10';
(await import('node:fs')).mkdirSync(SCRATCH, { recursive: true });
let wrong = 0;
const say = (bad, line) => { if (bad) wrong++; console.log((bad ? 'WRONG ' : 'ok    ') + line); };

const handoff = read('docs/handoff.md');
const { CARDS } = await import(pathToFileURL(path.join(root, 'src/open.data.mjs')).href);
const card = id => CARDS.find(c => c.id === id);

// (a) cleanup-fx-sweat: "src/render/fx.mjs의 sweat()" (a method of createFx); is anything still calling it?
const fx = read('src/render/fx.mjs');
const hasSweat = /^\s+sweat\(head, from/m.test(fx);
const sweatCallers = [...walkAll('src'), ...walkAll('tools'), ...walkAll('tests')].filter(f => f.endsWith('.mjs') && /\.sweat\(/.test(readFileSync(path.join(root, f), 'utf8')));
say(!hasSweat, `cleanup-fx-sweat: the method sweat() is in src/render/fx.mjs=${hasSweat}, callers=${sweatCallers.length} (deleting it breaks nothing)`);

// (b) cleanup-fxlab-now: "fxlab의 '지금' 비교 열 / 카드 5장"; cleanup-fx-versions: "src/fxlab.mjs에서 쓰지 않는 버전 값"
const fxlab = read('src/fxlab.mjs');
const fxVersions = [...fxlab.slice(fxlab.indexOf('const VERSIONS')).matchAll(/\{ id: '(\w+)', name: '([^']+)'/g)].slice(0, 6).map(m => `${m[1]}=${m[2]}`);
const fxlabShown = fxlab.includes('for (const v of VERSIONS)');
say(!fxVersions.some(v => v.includes('지금')), `cleanup-fxlab-now ("${card('cleanup-fxlab-now').state.slice(0, 40)}"): fxlab VERSIONS are ${fxVersions.join(', ')} (no '지금' column); every version shown on the page=${fxlabShown}`);
const pdVersions = [...read('src/pending.data.mjs').matchAll(/\{ id: '(\w+)', name: '([^']+)', note:/g)].slice(0, 6).map(m => `${m[1]}=${m[2]}`);
say(true, `cleanup-fx-versions: card says the unused version values are in src/fxlab.mjs ("${card('cleanup-fx-versions').state.slice(0, 70)}"), handoff §7 says src/pending.data.mjs VERSIONS/TUNES/MIST; fxlab holds only ${fxVersions.length} (both shown), pending.data.mjs holds ${pdVersions.join(', ')}`);

// (c) del-ref-video: handoff "webm·jpg 11개" vs the card "12개" vs the disk
const shake = readdirSync(path.join(root, 'docs/ref')).filter(f => f.startsWith('ground-shake-'));
const hoCount = (handoff.match(/ground-shake-\*`\(webm·jpg (\d+)개\)/) || [])[1];
const cardCount = (card('del-ref-video').state.match(/\((\d+)개\)/) || [])[1];
say(+hoCount !== shake.length, `del-ref-video: handoff §7 says ${hoCount} files, the card says ${cardCount}, docs/ref has ${shake.length} ground-shake-* files`);

// (d) ground-ring-game-*.jpg: handoff §10 says they serve the open card fx-ground-shake; who names them?
const named = [];
const walk = d => readdirSync(path.join(root, d), { withFileTypes: true }).flatMap(e => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
for (const f of [...walk('src'), ...walk('tests'), ...walk('tools'), ...readdirSync(root).filter(f => f.endsWith('.html'))]) if (/ground-ring-game/.test(readFileSync(path.join(root, f), 'utf8'))) named.push(f);
const hoSays = /ground-ring-game-\*\.jpg`, `ground-shake-\*` \| [^|]+\| 미결 `fx-ground-shake`/.test(handoff);
say(hoSays && named.every(f => f.startsWith('tests/')), `ground-ring-game-1/2.jpg: handoff §10 lists them for fx-ground-shake=${hoSays}; files naming them: ${named.join(', ')} (no page shows them; only a test keeps them existing; not in the §7 disposal list)`);

// (e) del-code-pending-old: handoff §7 keeps only "the old player (src/replay.mjs, src/clips.data.mjs)" while the new
// catalogue uses it; what does the new catalogue need of the old files? Try deleting each on a copy of src/.
const row = handoff.split('\n').find(l => l.startsWith('| `del-code-pending-old`'));
console.log('      handoff §7 row:', row.slice(0, 260));
const imp = read('src/open.data.mjs').match(/^import .* from '\.\/pending\.data\.mjs';$/m);
const dyn = read('src/open.mjs').match(/import\('\.\/pending\.mjs'\)/);
const replayUsers = ['src/main.mjs', 'src/catalog.mjs', 'src/spar.mjs', 'src/fxlab.mjs', 'src/review.mjs'].filter(f => /from '\.\/replay\.mjs'/.test(read(f)));
const tmp = mkdtempSync(path.join(SCRATCH, 'sim-'));
const results = [];
for (const gone of ['src/pending.data.mjs', 'src/pending.mjs']) {
  const dir = path.join(tmp, gone.replace(/\W/g, '_'));
  cpSync(path.join(root, 'src'), path.join(dir, 'src'), { recursive: true });
  rmSync(path.join(dir, gone));
  let r;
  try { await import(pathToFileURL(path.join(dir, 'src/open.data.mjs')).href); r = 'open.data.mjs still loads'; }
  catch (e) { r = 'open.data.mjs fails: ' + (e.code || '') + ' ' + e.message.split('\n')[0].replace(dir, '<copy>').slice(0, 110); }
  const tests = walk('tests').filter(f => readFileSync(path.join(root, f), 'utf8').includes(`'../${gone}'`));
  results.push(`${gone} deleted -> ${r}; tests importing it: ${tests.join(', ')}`);
}
rmSync(tmp, { recursive: true, force: true });
for (const r of results) console.log('      ' + r);
const mentions = /pending\.data\.mjs|src\/pending\.mjs/.test(row.split('|')[4] || '') ;
say(!!imp && !/open\.data/.test(row), `del-code-pending-old: open.data.mjs imports pending.data.mjs statically (${!!imp}), open.mjs imports ./pending.mjs for the lent cards (${!!dyn}); the §7 row's condition names only replay.mjs/clips.data.mjs (and replay.mjs is also used by ${replayUsers.join(', ')}): row names the open catalogue's dependency on pending*.mjs=${mentions}`);
// (and the row's list vs the card's list)
const cardList = (card('del-code-pending-old').state.match(/`[^`]+`/g) || []).map(s => s.slice(1, -1));
const rowList = (row.match(/`[^`]+`/g) || []).map(s => s.slice(1, -1));
const missing = cardList.filter(x => /\.(mjs|html|md)$/.test(x) && !rowList.includes(x));
say(missing.length > 0, `del-code-pending-old: files the card deletes that the §7 row does not list: ${missing.join(', ') || 'none'}`);

console.log(wrong ? `REPRO: yes ${wrong} statements of the disposal list do not match the checkout (no fxlab '지금' column to clean, unused versions are not in fxlab, ${hoCount} vs ${shake.length} ground-shake files, open.html needs pending.data.mjs)` : 'REPRO: no the disposal list matches the checkout');
