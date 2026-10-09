'use strict';
// ─────────────────────────────────────────────────────────────
// Slasher X Slasher — core utilities, tunables, pixel font
// ─────────────────────────────────────────────────────────────

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
const smoothstep = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
const approach = (v, t, d) => (v < t ? Math.min(v + d, t) : Math.max(v - d, t));
function angDiff(a, b) { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; }
function angApproach(a, b, d) { const df = angDiff(a, b); return Math.abs(df) <= d ? b : a + Math.sign(df) * d; }
const Ease = {
  outCubic: (t) => 1 - (1 - t) ** 3,
  inCubic: (t) => t * t * t,
  inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  outBack: (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2; },
  outElastic: (t) => (t === 0 || t === 1 ? t : 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * (TAU / 3)) + 1),
};

// Seedable RNG (?seed=123 reproduces a map)
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let rnd = Math.random;
const rand = (a = 0, b = 1) => a + rnd() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b + 1));
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
function shuffle(arr) { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; }

// Debug/test params: ?killer=witch&seed=7&letters=SHAZM  or  #witch
const PARAMS = (() => {
  const p = {};
  try {
    new URLSearchParams(location.search).forEach((v, k) => { p[k] = v; });
    const h = (location.hash || '').replace('#', '');
    if (h && !p.killer) p.killer = h;
  } catch (e) { /* sandboxed frames may throw */ }
  return p;
})();

// ─────────────────────────────────────────────────────────────
// Tunables — every number here is an initial value for playtesting (GDD §10)
// ─────────────────────────────────────────────────────────────
const CFG = {
  TS: 14,                    // tile size in low-res pixels
  TARGET_W: 196,             // low-res target width (portrait)
  CELLS_W: 15, CELLS_H: 23,  // maze cells → tiles = 2n+1
  ROOMS: 8,
  EXTRA_LOOPS: 0.07,         // extra wall removals for Pac-Man-like openness
  LOCKED_DOOR_P: 0.38,

  PLAYER_SPEED: 4.6,         // tiles/s  (= "100")
  KILLER_RATIO: 0.94,        // 살인마 = 94
  HERO_RATIO: 1.18,          // 히어로 = 현재 살인마 속도 × 1.18 (20초 안에 잡을 수 있게)
  TURN_TOL: 0.46,            // cornering assist (tiles) — turn this far before/after a junction centre
  HP: 3,

  ATTACK_RANGE: 0.95,        // start swing
  ATTACK_REACH: 1.2,         // hit lands
  ATTACK_WINDUP: 0.28,
  ATTACK_RECOVER: 1.2,
  KNOCKBACK: 1.7,            // tiles

  DOOR_BASH: 8,
  TOILET_CD: 2,
  HIDE_CHECK: 5,

  LAURELS: 2, LAUREL_RESPAWN: 3,
  SLOT_LETTER_P: 0.8,
  SLOT_SPIN: 1.05,
  KEYS: 3, KEY_RESPAWN: 6, KEY_MAX: 9,
  DUP_BUFF: 5, DUP_SPEED: 1.12,
  HONEY_MAX: 3, HONEY_STICK: 3,

  REVENGE_TIME: 20,
  REVENGE_STUN: 1.3,
  HERO_HIT_STUN: 0.5,
  RETURN_STUN: 2.5,

  VISION_RANGE: 9.5, VISION_HALF: 1.3, VISION_NEAR: 3.0,   // 도망자 기본 시야 (넓힘)
  HERO_VISION_RANGE: 11, HERO_VISION_HALF: 1.5,
  KILLER_SIGHT: 8.5, KILLER_FOV: 1.25, KILLER_NEAR: 2.3,

  NOISE_DOOR: 8, NOISE_TOILET: 10, NOISE_HONEY: 4,

  // 도살자
  BUTCHER_BREAK_CD: 30, BUTCHER_BREAK_WINDUP: 0.8, BUTCHER_STUN: 2, BUTCHER_SHORTCUT: 8, BUTCHER_BASH: 4, BUTCHER_DMG: 2,
  // 마녀
  WITCH_CANDLE_EVERY: 20, WITCH_PLACE_PAUSE: 1, CANDLE_RADIUS: 2.6, CANDLE_HOLD: 0.5, CANDLE_EXPOSE: 3,
  WITCH_EYE_EVERY: 10, WITCH_EYE_SHOW: 2, WITCH_FAKE_EVERY: 12, WITCH_FAKE_MAX: 3, FAKE_SLOW: 3, FAKE_SLOW_MULT: 0.6,
  // 수위
  JANITOR_FLASH_CD: 5, JANITOR_FLASH_WINDUP: 0.3, JANITOR_FLASH_RANGE: 6, JANITOR_BLACKOUT: 8, JANITOR_SIREN: 3, JANITOR_KEY_SEE: 2,
  // 초진화체
  EGG_TELEPORT: 60, LARVA_STEALTH: 3, EVOLVE_ADULT: 90, EVOLVE_PERFECT: 180,
  TENTACLE_RANGE: 3, TENTACLE_CD: 30, TENTACLE_WINDUP: 0.5, PERFECT_UPGRADE_EVERY: 30, PERFECT_SPEED_STEP: 0.015, PERFECT_RANGE_STEP: 0.5,
  // 박사
  DOCTOR_COUNTDOWN: 300, DOCTOR_ACT_EVERY: 60, MACHINE_LEASH: 8, SAW_DASH_WINDUP: 0.5, SAW_DASH_TIME: 0.7, SAW_DASH_MULT: 1.75, DRILL_BASH: 4,
  // 무사
  SAMURAI_XRAY: 6, SPEAR_RANGE: 6, SPEAR_CD: 8, SPEAR_WINDUP: 0.7, WELL_FIRST: 22, WELL_GAP: 15,
};

// ─────────────────────────────────────────────────────────────
// Palette
// ─────────────────────────────────────────────────────────────
const C = {
  void: '#07060a', ink: '#0b0809',
  wallTop: '#2a1c23', wallTop2: '#31212a', wallHi: '#4b313a', wallFace: '#150c11', wallFace2: '#1d1118', baseboard: '#3d2a22',
  roomWallTop: '#2d1f1f', roomWallHi: '#55393a',
  wood: '#3a2921', wood2: '#33241d', woodSeam: '#271b16', woodHi: '#46322a',
  rubble: '#5a4f4a', rubble2: '#3c3431',
  carpetRed: '#4a1520', carpetRed2: '#5b1d2a', carpetGold: '#7a5a2a',
  tileA: '#56656a', tileB: '#46545a', grout: '#2c3539',
  green: '#1c3224', green2: '#24402d',
  kitchenA: '#4a3f33', kitchenB: '#3a3229',
  blue: '#1d2344', blue2: '#283060',
  door: '#6b4326', door2: '#4e2f1a', doorLocked: '#7b2b20', brass: '#e2ad45', brass2: '#9c7023',
  white: '#f4efe6', dim: '#8a8090', dark: '#141018',
  red: '#e0303a', blood: '#9c0f1a', blood2: '#c11d2a',
  gold: '#ffd23f', gold2: '#c7951f', goldHi: '#fff3b0',
  laurel: '#ffd34d', laurel2: '#b8902a',
  key: '#e0b04a', honey: '#f2a31b', honey2: '#a86410',
  skin: '#f1c6a0', skin2: '#d39e7a',
  coat: '#f2c230', coat2: '#c99a1a', boot: '#2a2326',
  hero: '#c4202b', hero2: '#8e1520', cape: '#a3141f', cape2: '#6e0b14', heroSkin: '#e8a77a',
  shadow: 'rgba(0,0,0,0.45)',
};

// ─────────────────────────────────────────────────────────────
// Pixel fonts (3×5 HUD font, 5×7 SHAZAM letters)
// ─────────────────────────────────────────────────────────────
const FONT3 = {
  A: ['.#.', '#.#', '###', '#.#', '#.#'], B: ['##.', '#.#', '##.', '#.#', '##.'], C: ['.##', '#..', '#..', '#..', '.##'], D: ['##.', '#.#', '#.#', '#.#', '##.'],
  E: ['###', '#..', '##.', '#..', '###'], F: ['###', '#..', '##.', '#..', '#..'], G: ['.##', '#..', '#.#', '#.#', '.##'], H: ['#.#', '#.#', '###', '#.#', '#.#'],
  I: ['###', '.#.', '.#.', '.#.', '###'], J: ['..#', '..#', '..#', '#.#', '.#.'], K: ['#.#', '#.#', '##.', '#.#', '#.#'], L: ['#..', '#..', '#..', '#..', '###'],
  M: ['#.#', '###', '###', '#.#', '#.#'], N: ['##.', '#.#', '#.#', '#.#', '#.#'], O: ['.#.', '#.#', '#.#', '#.#', '.#.'], P: ['##.', '#.#', '##.', '#..', '#..'],
  Q: ['.#.', '#.#', '#.#', '##.', '.##'], R: ['##.', '#.#', '##.', '#.#', '#.#'], S: ['.##', '#..', '.#.', '..#', '##.'], T: ['###', '.#.', '.#.', '.#.', '.#.'],
  U: ['#.#', '#.#', '#.#', '#.#', '###'], V: ['#.#', '#.#', '#.#', '#.#', '.#.'], W: ['#.#', '#.#', '###', '###', '#.#'], X: ['#.#', '#.#', '.#.', '#.#', '#.#'],
  Y: ['#.#', '#.#', '.#.', '.#.', '.#.'], Z: ['###', '..#', '.#.', '#..', '###'], '0': ['###', '#.#', '#.#', '#.#', '###'], '1': ['.#.', '##.', '.#.', '.#.', '###'],
  '2': ['##.', '..#', '.#.', '#..', '###'], '3': ['##.', '..#', '.#.', '..#', '##.'], '4': ['#.#', '#.#', '###', '..#', '..#'], '5': ['###', '#..', '##.', '..#', '##.'],
  '6': ['.##', '#..', '###', '#.#', '###'], '7': ['###', '..#', '.#.', '.#.', '.#.'], '8': ['###', '#.#', '###', '#.#', '###'], '9': ['###', '#.#', '###', '..#', '##.'],
  ':': ['...', '.#.', '...', '.#.', '...'], '.': ['...', '...', '...', '...', '.#.'], '!': ['.#.', '.#.', '.#.', '...', '.#.'], '?': ['##.', '..#', '.#.', '...', '.#.'],
  '-': ['...', '...', '###', '...', '...'], '+': ['...', '.#.', '###', '.#.', '...'], '/': ['..#', '..#', '.#.', '#..', '#..'], ' ': ['...', '...', '...', '...', '...'],
  x: ['...', '#.#', '.#.', '#.#', '...'],
};

const FONT5 = {
  S: ['.###.', '#...#', '#....', '.###.', '....#', '#...#', '.###.'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  A: ['..#..', '.#.#.', '#...#', '#...#', '#####', '#...#', '#...#'],
  Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
};

const LETTERS = ['S', 'H', 'A', 'Z', 'A', 'M'];
