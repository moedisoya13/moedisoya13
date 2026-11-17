// Sync catalog/data.json with the game's registries, so the catalog shows the numbers the game
// actually uses. The design-document value is kept beside each synced number, and the page
// shows "GDD → now" where they differ.
//   node catalog/sync.js [GAME_DIR]     (GAME_DIR defaults to this game; it must contain tools/load.js)
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const here = __dirname;
const gameDir = path.resolve(process.argv[2] || path.join(here, '..'));
const { load } = require(path.join(gameDir, 'tools', 'load.js'));
const BD = load();
const file = path.join(here, 'data.json');
const D = JSON.parse(fs.readFileSync(file, 'utf8'));

let rev = process.env.REV || '';
if (!rev) try { rev = execSync('git rev-parse --short HEAD', { cwd: gameDir }).toString().trim(); } catch (e) { /* not a checkout */ }

const fmt = (v) => (Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100));
// set one field, remembering the first (design) value it had
function put(obj, key, now) {
  obj.gdd = obj.gdd || {};
  if (!(key in obj.gdd)) obj.gdd[key] = obj[key];
  obj[key] = now;
}

const changes = [];
for (const e of D.enemies) {
  const d = BD.enemies.get(e.id);
  // the ghoul keeps its revive HP in a local tuning table; read it from the source
  let reviveHp = null;
  if (typeof d.revive === 'function') {
    const src = fs.readFileSync(path.join(gameDir, 'src', 'content', 'enemies', e.id + '.js'), 'utf8');
    const m = src.match(/reviveHp:\s*([\d.]+)/); if (m) reviveHp = Number(m[1]);
  }
  const hp = reviveHp ? `${fmt(d.hp)}+${fmt(reviveHp)}` : fmt(d.hp);
  put(e, 'hp', hp);
  put(e, 'dmg', e.id === 'mage' ? `${fmt(d.dmg)}+장판` : fmt(d.dmg));
  put(e, 'radius', fmt(d.radius));
  put(e, 'cost', fmt(d.cost));
  if (e.id !== 'slime') put(e, 'speed', fmt(d.speed));
  if (e.gdd.hp !== e.hp || e.gdd.dmg !== e.dmg) changes.push(`${e.id}: HP ${e.gdd.hp} → ${e.hp}, 피해 ${e.gdd.dmg} → ${e.dmg}`);
}
const boss = BD.enemies.get('demon_king');
put(D.boss, 'hp', fmt(boss.hp));
const gHp = (BD.enemyTune && BD.enemyTune.guardianHp) || BD.C.GUARDIAN.hp;
put(D.guardian, 'hp', '1~5층 ' + gHp.slice(1, 6).map(fmt).join(' / '));
D.source = `게임 데이터${rev ? ' (커밋 ' + rev + ')' : ''}. 기획서와 다른 수치는 '기획서 → 현재'로 표시`;
D.synced = { rev, cards: BD.cards.ids().length, enemies: BD.enemies.ids().length };

// every card in the game must be in the catalog, and the other way round
const ids = new Set(BD.cards.ids());
const missing = [...ids].filter((id) => !D.cards.some((c) => c.id === id));
const extra = D.cards.filter((c) => !ids.has(c.id)).map((c) => c.id);
if (missing.length || extra.length) throw new Error(`card lists differ: missing ${missing} extra ${extra}`);
for (const c of D.cards) {
  const g = BD.cards.get(c.id);
  if (g.name !== c.name) changes.push(`card ${c.id}: name ${c.name} → ${g.name}`), put(c, 'name', g.name);
}

fs.writeFileSync(file, JSON.stringify(D, null, 1) + '\n');
console.log(`synced ${D.cards.length} cards, ${D.enemies.length} enemies + boss from ${rev || gameDir}`);
for (const c of changes) console.log('  ' + c);
