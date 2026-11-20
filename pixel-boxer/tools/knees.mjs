#!/usr/bin/env node
/* The knees, measured: every script in the catalogue (the footwork and the defence at every grade, the punches and the
   dirty fighter's techniques at every grade, being hit, going down) is fought once, and the boxer's knees are read off the
   pose the bout drew, sixty times a second, while he does what the script is about (his action, from its first frame to its
   last; a script with none, over all of it but the first half second):
     flex     each knee's bend from straight, least and most, degrees (the guard's are 38 lead and 48 rear)
     speed    the fastest either knee bent or straightened, degrees a second
     hips     how far the hips went down from where they were as it started (with no action, up and down), cm
     head     how far the head went down, cm
     share    the knees' share of the head going down: the hips' drop over the head's (the rest is the waist folding)
     back     how far the hips went back, in his own terms, cm
     node tools/knees.mjs              every script
     node tools/knees.mjs --only duck,roll   only these items (the part of the id before @)
     node tools/knees.mjs --md         the head going down and the knees' share of it, as README's table (items by grade)
     node tools/knees.mjs --json */
import { step } from '../src/game/bout.mjs';
import { freshBout, drive } from '../src/footwork.mjs';
import { SCRIPTS } from '../src/audit.mjs';
import { LEVELS, LEVEL } from '../src/anim/skill.mjs';
import { MOVES } from '../src/anim/moves.mjs';

const DT = 1 / 60;
const flexOf = (at, S) => {
  const h = at[S + 'Leg'],
    k = at[S + 'Shin'],
    a = at[S + 'Foot'],
    u = [h[0] - k[0], h[1] - k[1], h[2] - k[2]],
    v = [a[0] - k[0], a[1] - k[1], a[2] - k[2]],
    c = (u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) / (Math.hypot(...u) * Math.hypot(...v));
  return 180 - (Math.acos(Math.max(-1, Math.min(1, c))) * 180) / Math.PI;
};

// one script: the boxer's knees, hips and head while he does what it is about
export function knees(entry) {
  const bout = freshBout(entry),
    frames = [];
  for (let tick = 0; tick < Math.round(entry.loop / DT); tick++) {
    const held = bout.stop > 0;
    step(bout, drive(entry, bout, tick * DT, DT), DT);
    bout.fighters[1].hp = 1000;
    if (!entry.hurt) bout.fighters[0].hp = Math.max(bout.fighters[0].hp, 1000);
    const f = bout.fighters[0],
      at = f.pose.at,
      s = f.pose.stretch || 1,
      act = f.action ? f.action.name : null;
    frames.push({ tick, held, act, own: act && !MOVES[act].floor, L: flexOf(at, 'Left'), R: flexOf(at, 'Right'), hips: at.Hips[1] * s, hz: at.Hips[2] / Math.sqrt(s), head: f.points.head[1] });
  }
  // (what it is about: his own action, first frame to last, a fall's or a rise's aside; or all of it but the start)
  const mine = frames.map((f, i) => (f.own ? i : -1)).filter(i => i >= 0),
    from = mine.length ? mine[0] : 30,
    to = mine.length ? mine[mine.length - 1] : frames.length - 1,
    span = frames.slice(from, to + 1),
    // (from where he was as it started; with nothing to start, from as high as he went: the travel)
    base = mine.length ? frames[Math.max(0, from - 1)] : { hips: Math.max(...span.map(f => f.hips)), head: Math.max(...span.map(f => f.head)), hz: Math.max(...span.map(f => f.hz)) },
    live = span.filter(f => !f.held);
  let speed = 0;
  for (let i = 1; i < live.length; i++) if (live[i].tick === live[i - 1].tick + 1) speed = Math.max(speed, Math.abs(live[i].L - live[i - 1].L) / DT, Math.abs(live[i].R - live[i - 1].R) / DT);
  const min = k => Math.min(...span.map(f => f[k])),
    max = k => Math.max(...span.map(f => f[k])),
    hips = (base.hips - min('hips')) * 100,
    head = (base.head - min('head')) * 100;
  return {
    id: entry.id,
    action: mine.length ? frames[from].act : null,
    flex: { L: [+min('L').toFixed(0), +max('L').toFixed(0)], R: [+min('R').toFixed(0), +max('R').toFixed(0)] },
    speed: Math.round(speed),
    hips: +hips.toFixed(1),
    head: +head.toFixed(1),
    share: head > 2 ? Math.round((100 * Math.max(0, hips)) / head) : null,
    back: +((base.hz - min('hz')) * 100).toFixed(1)
  };
}

export const all = only => SCRIPTS.filter(e => !only || only.includes(e.id.split('@')[0])).map(knees);

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2),
    opt = n => (args.includes('--' + n) ? args[args.indexOf('--' + n) + 1] : null),
    rows = all(opt('only') ? opt('only').split(',') : null);
  if (args.includes('--json')) console.log(JSON.stringify(rows, null, 2));
  else if (args.includes('--md')) {
    const items = [...new Set(rows.map(r => r.id.split('@')[0]))];
    console.log('| | ' + LEVELS.map(lv => LEVEL[lv].label).join(' | ') + ' |');
    console.log('| --- |' + LEVELS.map(() => ' --- |').join(''));
    for (const item of items) {
      const cell = lv => {
        const r = rows.find(x => x.id === `${item}@${lv}`) || (lv === '3' ? rows.find(x => x.id === item) : null);
        return r ? `${r.head} cm · ${r.share ?? '–'}%` : '';
      };
      console.log(`| ${item} | ` + LEVELS.map(cell).join(' | ') + ' |');
    }
    console.log('(the head going down, cm, and the knees\' share of it, %)');
  } else {
    console.log('script'.padEnd(18) + 'action'.padEnd(9) + 'lead knee'.padEnd(11) + 'rear knee'.padEnd(11) + 'deg/s'.padStart(6) + 'hips'.padStart(7) + 'head'.padStart(7) + 'share'.padStart(7) + 'back'.padStart(7));
    for (const r of rows)
      console.log(r.id.padEnd(18) + String(r.action || '-').padEnd(9) + `${r.flex.L[0]}–${r.flex.L[1]}`.padEnd(11) + `${r.flex.R[0]}–${r.flex.R[1]}`.padEnd(11) + String(r.speed).padStart(6) + String(r.hips).padStart(7) + String(r.head).padStart(7) + (r.share === null ? '–' : r.share + '%').padStart(7) + String(r.back).padStart(7));
    console.log('(knee bend from straight, least–most, degrees; the fastest a knee bent, deg/s; hips and head down, cm; the knees\' share of the head going down; hips back, cm)');
  }
}
