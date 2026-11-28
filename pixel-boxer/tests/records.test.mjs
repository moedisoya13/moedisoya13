// The project's own records say what the checkout does (the 11-25 self-audit, eye 10 and 8: a-since, a-catalog-text,
// a-history, a-spar-docs, a-dispose-list; fixed 2026-11-28): the publishing tool's --since names a page whose own .html
// alone changed; the motion catalogue's notes on the collar and uppercut, the beckon and the windmill give the numbers the
// motion is made of; every published artifact has its current version's commit in docs/artifact-history.md; docs/spar.md's
// earliest knockdown and weakest knockdown blow are not beaten by the two rounds that once beat them; and what the disposal
// list says was deleted is gone, with nothing left calling it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, writeFileSync, copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { COLLAR } from '../src/anim/show.mjs';
import { MOVES } from '../src/anim/moves.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = f => readFileSync(path.join(root, f), 'utf8');
const walk = d => readdirSync(path.join(root, d), { withFileTypes: true }).flatMap(e => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));

test('artifact --since: a page whose own .html alone changed is not "nothing changed"', t => {
  let top;
  try {
    top = execFileSync('git', ['-C', root, 'rev-parse', '--show-toplevel'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return t.skip('not a git checkout');
  }
  const sub = path.relative(top, root),
    head = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    dir = mkdtempSync(path.join(tmpdir(), 'since-'));
  try {
    execFileSync('git', ['clone', '--quiet', '--shared', '--no-checkout', top, dir]);
    execFileSync('git', ['-C', dir, 'checkout', '--quiet', head, '--', sub]);
    const pb = path.join(dir, sub);
    // (this checkout's tool, whatever HEAD's is)
    copyFileSync(path.join(root, 'tools/artifact.mjs'), path.join(pb, 'tools/artifact.mjs'));
    const run = page => JSON.parse(execFileSync(process.execPath, [path.join(pb, 'tools/artifact.mjs'), page, 'src/spar.mjs', path.join(dir, 'out.html'), '--since', head], { encoding: 'utf8' }));
    assert.deepEqual(run('spar.html'), {}, 'nothing of the page changed');
    const f = path.join(pb, 'spar.html');
    writeFileSync(f, readFileSync(f, 'utf8').replace('</body>', '<p>changed</p>\n</body>'));
    assert.deepEqual(run('spar.html'), { 'spar.html': 'spar.html' }, 'the page itself changed');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the motion catalogue says what the collar, the beckon and the windmill do now', () => {
  const cat = read('src/catalog.mjs'),
    note = id => cat.match(new RegExp(`^\\s+${id}: '([^']+)'`, 'm'))[1];
  const collar = note('collar').match(/어퍼가 닿고 ([\d.]+)초\(5암 ([\d.]+)초\) 뒤 놓습니다/);
  assert.ok(collar, 'the collar note says when he lets go');
  assert.deepEqual([+collar[1], +collar[2]], COLLAR.let, 'lets go: the note and COLLAR.let [4암, 5암]');
  assert.match(note('collar'), new RegExp(`${COLLAR.wait}초 기다렸다`), 'the uppercut waits COLLAR.wait');
  assert.match(note('collar'), new RegExp(`뒤로 ${COLLAR.brace}° 버티`), 'he braces COLLAR.brace');
  const taps = MOVES.beckon.keys.filter(k => k.lz === 0.3).length;
  assert.match(note('beckon'), new RegExp(`${['', '한', '두', '세', '네'][taps]} 번 까딱`), `${taps} beckons`);
  const c = MOVES.wind.circles;
  assert.match(note('wind'), new RegExp(`뒷주먹 ${c.R.turns}바퀴, 앞주먹 ${c.L.turns}바퀴`), 'the windmill\'s turns');
  assert.doesNotMatch(note('wind'), /한 바퀴/);
});

test('every published artifact has its current version and that version\'s commit in the publishing record', () => {
  const ho = read('docs/handoff.md'),
    hist = read('docs/artifact-history.md'),
    rows = ho.split('\n').filter(l => /^\| .* \| https:\/\/claude\.ai\/artifact\//.test(l)).map(l => l.split('|').map(s => s.trim()));
  assert.ok(rows.length >= 6, `${rows.length} artifacts in handoff §3`);
  for (const r of rows) {
    const id = r[2].split('/').pop(),
      line = hist.split('\n').find(l => l.includes(id));
    assert.ok(line, `${r[1]}: no row in docs/artifact-history.md`);
    assert.match(line, /\| (?:현행 )?v\d+\(\d{4}-\d\d-\d\d, [0-9a-f]{7}/, `${r[1]}: its current version's commit`);
    assert.match(r[5], /^[0-9a-f]{7}/, `${r[1]}: handoff §3's last commit`);
  }
});

test('docs/spar.md: its earliest knockdown and weakest knockdown blow are not beaten by seeds 43 and 12', async () => {
  const doc = read('docs/spar.md'),
    earliest = +doc.match(/\| 첫 다운까지\(보는 시간\) \| ([\d.]+) \//)[1],
    weakest = +doc.match(/45 N·s에 못 미친 판 \d+\(([\d.]+)~/)[1];
  const { planOf } = await import('../src/spar/plan.mjs');
  // (the two the 11-25 audit found beating the numbers then written: 8-4, 8-3)
  const at = planOf(43).ko.at,
    worth = planOf(12).ko.worth;
  assert.ok(at >= earliest, `#43 goes down at ${at} s, docs/spar.md says the earliest is ${earliest} s (node tools/spar.mjs --seeds 1-50)`);
  assert.ok(worth >= weakest, `#12 goes down to ${worth} N·s, docs/spar.md says the weakest is ${weakest}`);
});

test('what the disposal list says was deleted is gone, and nothing calls it', () => {
  // (cleanup-fx-sweat: the one method, and no caller)
  assert.doesNotMatch(read('src/render/fx.mjs'), /^\s+sweat\(/m);
  for (const f of [...walk('src'), ...walk('tools'), ...walk('tests')].filter(f => f.endsWith('.mjs'))) assert.doesNotMatch(read(f), /\.sweat\(/, f);
  // (cleanup-fxlab-now: fxlab has no "지금" column to delete; its versions are the two it shows)
  const fxlab = read('src/fxlab.mjs'),
    versions = [...fxlab.slice(fxlab.indexOf('const VERSIONS')).matchAll(/\{ id: '(\w+)', name: '([^']+)'/g)].map(m => m[2]);
  assert.ok(versions.length && !versions.includes('지금'), versions.join(', '));
  // (del-code-pending-old, cleanup-fx-versions, del-ref-video: the files the §7 rows name are gone, and nothing loads them)
  const row = id => read('docs/handoff.md').split('\n').find(l => l.startsWith(`| \`${id}\``));
  // (the files the row deletes whole: before the clips, of which only some went)
  const named = (row('del-code-pending-old').split('|')[2].split('정해진 항목만')[0].match(/`[^`]+\.(?:mjs|html|md)`/g) || []).map(s => s.slice(1, -1));
  assert.ok(named.length >= 7, named.join(' '));
  for (const f of named) assert.ok(!existsSync(path.join(root, f)), `${f} is still there`);
  for (const f of [...walk('src'), ...walk('tools'), ...walk('tests'), ...readdirSync(root).filter(f => f.endsWith('.html'))].filter(f => /\.(mjs|html)$/.test(f)))
    assert.doesNotMatch(read(f), /from '\.{1,2}\/(?:src\/)?pending(?:\.data|\.numbers)?\.mjs'|import\('\.\/pending\.mjs'\)|src="src\/pending\.mjs"/, f);
  const shake = Number((row('del-ref-video').match(/ground-shake-\*` (\d+)개/) || [])[1]);
  assert.equal(shake, 12, 'the row says how many');
  assert.deepEqual(readdirSync(path.join(root, 'docs/ref')).filter(f => f.startsWith('ground-shake-')), []);
  // (and what the list keeps: the two ground-ring pictures, the player the other pages use)
  for (const f of ['docs/ref/ground-ring-game-1.jpg', 'docs/ref/ground-ring-game-2.jpg', 'src/replay.mjs', 'src/clips.data.mjs', 'tools/clips.mjs']) assert.ok(existsSync(path.join(root, f)), f);
});
