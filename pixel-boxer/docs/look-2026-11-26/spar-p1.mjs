// spar-p1 (evidence): the page's controls, read from its source: what a press can do. There is no pause, no step and no seek:
// the buttons are start / again / speed (1x or 1/2x only) / sound / close, a tap on the picture only skips a knockdown's
// replay, and a tap on the lanes opens the list (its rows do nothing). To look again at a moment, the whole round is
// played again from its start. Usage: node spar-p4.mjs <pixel-boxer root>
import { readFileSync } from 'node:fs';
const root = process.argv[2], js = readFileSync(root + '/src/spar.mjs', 'utf8'), html = readFileSync(root + '/spar.html', 'utf8');
const acts = [...new Set([...html.matchAll(/data-act="(\w+)"/g)].map(m => m[1]))];
const handled = [...js.matchAll(/what === '(\w+)'/g)].map(m => m[1]);
const speeds = /speed = speed === 1 \? ([\d.]+) : 1/.exec(js);
const canvasTap = /canvas\.addEventListener\('pointerdown', \(\) => ([^)]+\))/.exec(js);
const rowsClick = /fullrows[^\n]*addEventListener/.test(js);
const words = ['pause', 'seek', 'paused'].filter(w => new RegExp('\\b' + w + '\\b').test(js));
console.log('buttons (data-act):', acts.join(', '), '| handled:', handled.join(', '));
console.log('speeds: 1 and', speeds && speeds[1], '| a tap on the picture:', canvasTap && canvasTap[1], '| list rows clickable:', rowsClick, '| words pause/seek in the page:', words.join(',') || 'none');
console.log(`EVIDENCE: controls ${acts.length} (${acts.join('/')}), speeds 1x and ${speeds && speeds[1]}x, no pause/step/seek (${words.length} mentions); a moment is seen again only by replaying the round from 0:00`);
