// 픽셀 스프라이트. 외부 이미지 없이 코드로 그린 뒤 시작 시 canvas 로 굽는다.
// 사람 캐릭터는 humanoid() 한 틀에 팔레트·머리·옷 스타일만 바꿔서 만든다 — 손으로 프레임마다
// 찍는 것보다 애니메이션이 일관되고, 적 종류를 늘리기 쉽다.

const OUT = '#1b1020';
export const SPR = {};

// ---------- 격자 도우미 ----------
function grid(w, h) {
  return { w, h, d: new Array(w * h).fill(null) };
}
function px(g, x, y, c) {
  if (x >= 0 && y >= 0 && x < g.w && y < g.h) g.d[y * g.w + x] = c;
}
function rect(g, x, y, w, h, c) {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) px(g, x + i, y + j, c);
}
function get(g, x, y) {
  return x >= 0 && y >= 0 && x < g.w && y < g.h ? g.d[y * g.w + x] : null;
}
function fromRows(rows, pal) {
  const g = grid(rows[0].length, rows.length);
  rows.forEach((r, y) => {
    for (let x = 0; x < r.length; x++) {
      const ch = r[x];
      if (ch !== '.' && pal[ch]) px(g, x, y, pal[ch]);
    }
  });
  return g;
}
function recolor(g, fn) {
  const o = grid(g.w, g.h);
  o.d = g.d.map((c) => (c ? fn(c) : null));
  return o;
}

const rgbCache = new Map();
function rgb(hex) {
  let v = rgbCache.get(hex);
  if (!v) {
    const n = parseInt(hex.slice(1), 16);
    v = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    rgbCache.set(hex, v);
  }
  return v;
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

// 격자 → canvas (+1px 외곽선, 좌우 반전본, 흰색 실루엣)
function bake(name, g, opts = {}) {
  const outline = opts.outline !== false;
  const pad = outline ? 1 : 0;
  const W = g.w + pad * 2;
  const H = g.h + pad * 2;
  const make = (white, flip) => {
    const c = makeCanvas(W, H);
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(W, H);
    const put = (x, y, hex) => {
      const xx = flip ? W - 1 - x : x;
      const i = (y * W + xx) * 4;
      const [r, gg, b] = white ? [255, 255, 255] : rgb(hex);
      img.data[i] = r;
      img.data[i + 1] = gg;
      img.data[i + 2] = b;
      img.data[i + 3] = 255;
    };
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const c0 = get(g, x - pad, y - pad);
        if (c0) put(x, y, c0);
        else if (outline && !white) {
          if (get(g, x - pad - 1, y - pad) || get(g, x - pad + 1, y - pad) || get(g, x - pad, y - pad - 1) || get(g, x - pad, y - pad + 1)) put(x, y, OUT);
        }
      }
    }
    ctx.putImageData(img, 0, 0);
    return c;
  };
  SPR[name] = {
    c: make(false, false),
    f: make(false, true),
    w: make(true, false),
    wf: make(true, true),
    W,
    H,
    ox: opts.ox ?? Math.floor(W / 2),
    oy: opts.oy ?? H - 4,
  };
}

// ---------- 사람 캐릭터 ----------
const EYE = '#1b1020';

function humanoid(o, pose = 'idle', f = 0) {
  const g = grid(16, 20);
  const wide = o.wide ? 1 : 0;
  const tx0 = 5 - wide;
  const tx1 = 10 + wide;
  const tw = tx1 - tx0 + 1;
  const skin = o.skin;
  const shade = o.skinShade;
  const sleeve = o.sleeves ? o.shirt : skin;
  const sleeveB = o.sleeves ? o.shirtShade || o.shirt : shade;
  const pants = o.pants;
  const pantsB = o.pantsShade || o.pants;
  const legW = wide ? 3 : 2;

  // 다리
  const leg = (hx, fx, col) => {
    rect(g, hx, 13, legW, 3, col);
    rect(g, fx, 16, legW, 3, col);
    rect(g, fx, 19, legW + 1, 1, o.shoes);
  };
  if (!o.robe) {
    if (pose === 'kick') {
      leg(6, 5, pantsB);
      rect(g, 9, 12, 6, 2, pants);
      rect(g, 15, 11, 1, 3, o.shoes);
    } else if (pose === 'run') {
      const L = [
        [[6, 4], [8, 10]],
        [[6, 6], [8, 8]],
        [[6, 5], [8, 9]],
        [[7, 7], [8, 8]],
      ][f % 4];
      leg(L[0][0], L[0][1], pantsB);
      leg(L[1][0], L[1][1], pants);
    } else {
      leg(5 - wide, 4 - wide, pantsB);
      leg(9 + wide, 10 + wide, pants);
    }
  } else {
    // 도포: 다리를 덮는다
    rect(g, tx0, 13, tw, 6, o.shirt);
    rect(g, tx0, 18, tw, 1, o.trim);
    rect(g, tx0 + 1, 19, 2, 1, o.shoes);
    rect(g, tx1 - 2, 19, 2, 1, o.shoes);
  }

  // 뒷팔
  const swing = pose === 'run' ? [1, 0, -1, 0][f % 4] : 0;
  const bx = tx0 - 1;
  if (pose === 'hurt') {
    rect(g, bx, 3, 1, 5, sleeveB);
    px(g, bx, 2, shade);
  } else if (pose === 'kick') {
    rect(g, bx - 1, 6, 1, 2, sleeveB);
    rect(g, bx, 8, 1, 2, sleeveB);
    px(g, bx - 1, 5, shade);
  } else {
    rect(g, bx, 8, 1, 2, sleeveB);
    rect(g, bx - swing, 10, 1, 2, sleeveB);
    px(g, bx - swing, 12, shade);
  }

  // 몸통
  rect(g, tx0, 7, tw, 6, o.shirt);
  switch (o.style) {
    case 'tank':
      px(g, tx0, 7, skin);
      px(g, tx1, 7, skin);
      px(g, tx0 + 2, 7, skin);
      px(g, tx1 - 2, 7, skin);
      rect(g, tx0, 11, tw, 1, o.shirtShade);
      break;
    case 'dots':
      px(g, tx0 + 1, 8, o.shirt2);
      px(g, tx1 - 1, 9, o.shirt2);
      px(g, tx0 + 2, 11, o.shirt2);
      px(g, tx1, 11, o.shirt2);
      px(g, tx0 + 3, 7, skin);
      px(g, tx0 + 2, 7, skin);
      break;
    case 'jacket':
      rect(g, tx0 + 2, 7, 2, 5, o.shirt2);
      break;
    case 'suit':
      px(g, tx0 + 3, 7, o.shirt2);
      rect(g, tx0 + 3, 8, 1, 3, o.tie);
      px(g, tx0 + 2, 8, o.shirtShade);
      px(g, tx0 + 4, 8, o.shirtShade);
      break;
    case 'track':
      rect(g, tx0, 7, 1, 6, o.shirt2);
      rect(g, tx1, 7, 1, 6, o.shirt2);
      break;
    case 'robe':
      rect(g, tx0 + 2, 7, 1, 6, o.trim);
      px(g, tx0 + 3, 8, o.trim);
      break;
    default:
      break;
  }
  if (o.belt) rect(g, tx0, 12, tw, 1, o.belt);

  // 머리
  rect(g, 5, 1, 6, 6, skin);
  px(g, 5, 1, null);
  px(g, 10, 1, null);
  px(g, 5, 6, null);
  px(g, 10, 6, null);
  px(g, 6, 4, shade);
  rect(g, 6, 6, 4, 1, shade);
  const hair = o.hair;
  switch (o.hairStyle) {
    case 'bowl':
      rect(g, 5, 0, 6, 2, hair);
      rect(g, 4, 1, 2, 4, hair);
      rect(g, 8, 2, 3, 1, hair);
      px(g, 7, 2, hair);
      break;
    case 'spiky':
      px(g, 5, 0, hair);
      px(g, 7, 0, hair);
      px(g, 9, 0, hair);
      rect(g, 4, 1, 7, 1, hair);
      rect(g, 4, 2, 2, 2, hair);
      break;
    case 'slick':
      rect(g, 4, 1, 7, 1, hair);
      rect(g, 4, 2, 2, 2, hair);
      px(g, 7, 1, o.hairShine || '#666');
      break;
    case 'bald':
      px(g, 7, 2, o.shine || '#ffe3c0');
      break;
    case 'mask':
      rect(g, 4, 1, 7, 6, hair);
      px(g, 4, 1, null);
      rect(g, 7, 4, 4, 1, skin);
      break;
    case 'headband':
      rect(g, 4, 0, 6, 2, hair);
      rect(g, 4, 2, 7, 1, o.band);
      px(g, 3, 2, o.band);
      px(g, 2, 3, o.band);
      break;
    case 'gray':
      rect(g, 5, 0, 5, 1, hair);
      rect(g, 4, 1, 2, 4, hair);
      break;
    case 'long':
      rect(g, 4, 0, 7, 2, hair);
      rect(g, 3, 1, 2, 9, hair);
      rect(g, 8, 6, 3, 3, hair); // 수염
      px(g, 9, 9, hair);
      break;
    default:
      break;
  }
  if (o.eyes === 'shades') {
    rect(g, 7, 4, 4, 1, '#0b0b10');
    px(g, 8, 4, '#4a5a7a');
  } else if (o.eyes === 'glasses') {
    px(g, 7, 4, '#777');
    px(g, 8, 4, EYE);
    px(g, 9, 4, '#777');
    px(g, 10, 4, EYE);
  } else {
    px(g, 8, 4, EYE);
    px(g, 10, 4, EYE);
  }
  if (pose === 'hurt') px(g, 11, 2, '#7fd0ff');

  // 앞팔 (마지막에 그려야 주먹이 몸 위로 나온다)
  const fx = tx1 + 1;
  if (pose === 'punch') {
    rect(g, fx, 8, 3, 2, sleeve);
    rect(g, fx + 3, 7, 2, 3, o.glove || skin);
  } else if (pose === 'kick') {
    rect(g, fx, 7, 3, 1, sleeve);
    px(g, fx + 3, 7, skin);
  } else if (pose === 'hurt') {
    rect(g, fx, 3, 1, 5, sleeve);
    px(g, fx, 2, skin);
  } else if (pose === 'pose') {
    rect(g, fx, 2, 1, 6, sleeve);
    rect(g, fx - 1, 0, 2, 2, skin);
  } else {
    rect(g, fx, 8, 1, 2, sleeve);
    rect(g, fx + swing, 10, 1, 2, sleeve);
    px(g, fx + swing, 12, skin);
    if (o.knife) rect(g, fx + swing + 1, 9, 1, 4, '#d8dde6');
  }
  return g;
}

const CHAR = {
  jacky: {
    skin: '#f0c090', skinShade: '#cf9466', hair: '#1d1411', hairStyle: 'bowl',
    shirt: '#f4f0e4', shirtShade: '#cbc3b0', style: 'tank',
    pants: '#34405c', pantsShade: '#262f45', shoes: '#141014', belt: '#6b4a2a',
  },
  thug: {
    skin: '#e8b07f', skinShade: '#c48a5c', hair: '#4a2f1a', hairStyle: 'spiky', eyes: 'shades',
    shirt: '#ff8a3d', shirt2: '#ffe066', style: 'dots', pants: '#c9b48a', pantsShade: '#a8946b', shoes: '#3b2418',
  },
  knife: {
    skin: '#e3a877', skinShade: '#bf8657', hair: '#141014', hairStyle: 'slick', hairShine: '#555',
    shirt: '#24242c', shirtShade: '#18181e', shirt2: '#e8e8e8', style: 'jacket', sleeves: true,
    pants: '#2b2b36', shoes: '#0e0e12', knife: true,
  },
  ninja: {
    skin: '#e0a677', skinShade: '#b9845a', hair: '#2a2246', hairStyle: 'mask',
    shirt: '#2a2246', shirtShade: '#1e1834', style: 'gi', sleeves: true, belt: '#9a2433',
    pants: '#2a2246', pantsShade: '#1e1834', shoes: '#16121f',
  },
  thrower: {
    skin: '#e6b080', skinShade: '#c28c5e', hair: '#2a1a12', hairStyle: 'headband', band: '#d63a3a',
    shirt: '#2e8b57', shirtShade: '#226b43', shirt2: '#f0f0f0', style: 'track', sleeves: true,
    pants: '#2e8b57', pantsShade: '#226b43', shoes: '#f0f0f0',
  },
  heavy: {
    wide: true, skin: '#d9a06a', skinShade: '#b37b4a', hairStyle: 'bald',
    shirt: '#b03a2e', shirtShade: '#8a2c22', style: 'tank', pants: '#3b3b3b', pantsShade: '#2b2b2b', shoes: '#1a1a1a',
  },
  boss1: {
    wide: true, skin: '#c98b5a', skinShade: '#a46a3e', hairStyle: 'bald', eyes: 'shades',
    shirt: '#4a6fa5', shirtShade: '#36547f', style: 'tank', pants: '#2a2a2a', pantsShade: '#1c1c1c', shoes: '#1a1010', belt: '#c9a04a',
  },
  boss2: {
    skin: '#e2aa7a', skinShade: '#bd8656', hair: '#101010', hairStyle: 'slick', hairShine: '#777', eyes: 'shades',
    shirt: '#ece6d6', shirtShade: '#c9c1ad', shirt2: '#ffffff', tie: '#b01e2e', style: 'suit', sleeves: true,
    pants: '#ece6d6', pantsShade: '#c9c1ad', shoes: '#5a2a1a',
  },
  boss3: {
    skin: '#e0b088', skinShade: '#b98a62', hair: '#ececec', hairStyle: 'long',
    shirt: '#151515', shirtShade: '#0c0c0c', trim: '#d4a83a', style: 'robe', robe: true, sleeves: true, shoes: '#3a2a10', pants: '#151515',
  },
  oldman: {
    skin: '#e8b585', skinShade: '#c39062', hair: '#bcbcbc', hairStyle: 'gray', eyes: 'glasses',
    shirt: '#f2f2ea', shirtShade: '#cfcfc4', style: 'tank', pants: '#555', shoes: '#222',
  },
};

// ---------- 소형 스프라이트 (문자열) ----------
const ITEMS = {
  xp1: {
    pal: { a: '#d8bf94', b: '#f6e8c8', c: '#fffaf0' },
    rows: ['..a.a..', '.abcba.', 'abbbbba', 'abbbbba', '.aaaaa.'],
  },
  xp2: {
    pal: { a: '#6fae55', b: '#b8e6a0', c: '#e8ffe0' },
    rows: ['..a.a..', '.abcba.', 'abbbbba', 'abbbbba', '.aaaaa.'],
  },
  xp3: {
    pal: { a: '#d0607a', b: '#ffb3c4', c: '#fff0f4' },
    rows: ['...a.a...', '..abcba..', '.abbbbba.', 'abbbbbbba', 'abbbbbbba', '.aaaaaaa.'],
  },
  coin: {
    pal: { o: '#b8860b', y: '#ffd34d', h: '#5a3d10', l: '#fff1a8' },
    rows: ['..oooo..', '.oylyyo.', 'oylyyyyo', 'oyyhhyyo', 'oyyhhyyo', 'oyyyyyyo', '.oyyyyo.', '..oooo..'],
  },
  coin5: {
    pal: { r: '#a8322a', d: '#7a2018', y: '#ffd34d', s: '#e8c08a' },
    rows: ['...ss...', '..rssr..', '.rrrrrr.', 'rrryyrrr', 'rryddyrr', 'rrryyrrr', 'drrrrrrd', '.dddddd.'],
  },
  food: {
    pal: { w: '#f4f4f4', b: '#3a6fd8', n: '#ffd36b', s: '#a0522d', g: '#7bd36b' },
    rows: ['.....s.s.', '....s.s..', '.nngnnnn.', 'wwwwwwwww', 'wbbbbbbbw', '.wwwwwww.', '..wwwww..'],
  },
  magnet: {
    pal: { r: '#e03a3a', g: '#cfd6e0', d: '#a02020' },
    rows: ['gg...gg', 'rr...rr', 'rr...rr', 'rr...rr', 'drr.rrd', '.drrrd.', '..ddd..'],
  },
  pager: {
    pal: { k: '#222831', g: '#8fe38f', d: '#4a7a4a', b: '#555f6e' },
    rows: ['kkkkkkk', 'kgggggk', 'kgdgdgk', 'kgggggk', 'kkkkkkk', 'kbkbkbk', 'kkkkkkk'],
  },
  chest: {
    pal: { r: '#b0242a', d: '#7a1418', y: '#ffd34d', k: '#3a1a10' },
    rows: ['.rrrrrrrr.', 'rrrrrrrrrr', 'yyyyyyyyyy', 'rrrryyrrrr', 'rrrykyrrrr', 'rrrryyrrrr', 'dddddddddd'],
  },
  fist: {
    pal: { s: '#f0c090', d: '#cf9466', S: '#b97f55', w: '#f4f4f4', r: '#d63a3a' },
    rows: ['.ssssss.', 'sdsdsdss', 'sssssssS', 'ssssddSS', '.sssssS.', '..wrww..'],
  },
  ladder: {
    pal: { w: '#b07a3e', d: '#7a5228' },
    rows: ['w...w', 'wdddw', 'w...w', 'w...w', 'wdddw', 'w...w', 'w...w', 'wdddw', 'w...w', 'w...w', 'wdddw', 'w...w', 'w...w', 'wdddw', 'w...w'],
  },
  chair: {
    pal: { w: '#c58a48', d: '#8a5a28' },
    rows: ['wwwwwwww', 'dddddddd', '.d....d.', '.d....d.', '.dwwwwd.', '.d....d.', '.d....d.'],
  },
  bottle: {
    pal: { g: '#3fa34d', l: '#9fe8a0', c: '#c8a060' },
    rows: ['.c.', '.g.', '.g.', 'ggg', 'glg', 'glg', 'ggg', 'ggg'],
  },
  umbrella: {
    pal: { r: '#e03a3a', w: '#f4f4f4', k: '#3a2a1a' },
    rows: ['.....rrwwrr.....', '...rrrwwwwrrr...', '..rrrrwwwwrrrr..', '.rrrrrwwwwrrrrr.', 'rrrrrrwwwwrrrrrr', '.......kk.......', '.......k........', '.......k........', '......kk........'],
  },
  shuriken: {
    pal: { g: '#cfd6e0', d: '#7a8494' },
    rows: ['..g..', '.gdg.', 'gdddg', '.gdg.', '..g..'],
  },
  knifeShot: {
    pal: { g: '#e6ebf2', b: '#6a3a1a' },
    rows: ['bbgggg.', 'bbggggg'],
  },
  crate: {
    pal: { w: '#b07a3e', d: '#7a5228', l: '#d29a5a' },
    rows: ['llllllllllll', 'wdwwwwwwwwdw', 'wwdwwwwwwdww', 'wwwdwwwwdwww', 'wwwwdwwdwwww', 'wwwwwddwwwww', 'wwwwwddwwwww', 'wwwwdwwdwwww', 'wwwdwwwwdwww', 'wwdwwwwwwdww', 'wdwwwwwwwwdw', 'dddddddddddd'],
  },
  barrel: {
    pal: { b: '#3d6e9c', d: '#284c70', l: '#6a9cd0', r: '#c0c8d0' },
    rows: ['.llllllll.', 'bbbbbbbbbb', 'rrrrrrrrrr', 'blbbbbbbdb', 'blbbbbbbdb', 'blbbbbbbdb', 'rrrrrrrrrr', 'blbbbbbbdb', 'blbbbbbbdb', 'rrrrrrrrrr', 'dddddddddd'],
  },
  jar: {
    pal: { c: '#b5643c', d: '#8a4426', l: '#d88a5a', k: '#3a1a10' },
    rows: ['...kkkk...', '...cccc...', '..cccccc..', '.clccccdc.', 'clcccccccd', 'clcccccccd', 'clcccccccd', '.ccccccdd.', '..cccccd..', '...dddd...'],
  },
};

const ICONS = {
  i_might: {
    pal: { s: '#f0c090', d: '#cf9466' },
    rows: ['...ss....', '..ssss...', '..ss.s...', '..ss.....', '.sssss...', 'sssssss..', 'sdsssss..', 'ssssssd..', '.sssss...'],
  },
  i_shoes: {
    pal: { k: '#1a1a1a', w: '#f4f4f4', r: '#d63a3a' },
    rows: ['.........', '...kkk...', '...kkk...', '...kkkk..', '..kkkkkk.', '.kkrkkkkk', 'wwwwwwwww', '.........', '.........'],
  },
  i_breath: {
    pal: { b: '#9fdcff', w: '#ffffff' },
    rows: ['.........', '.bbbbb...', 'b.....b..', '....bb...', '.bbbbbbb.', 'b.......b', '.....bb..', '..bbb....', '.........'],
  },
  i_qi: {
    pal: { b: '#5aa0ff', l: '#bfe0ff', w: '#ffffff' },
    rows: ['...bbb...', '..bllll..', '.blwwllb.', 'blwwwwllb', 'blwwwwllb', 'bllwwllb.', '.bllllb..', '..bbbb...', '.........'],
  },
  i_heart: {
    pal: { r: '#e83a4a', l: '#ff9aa6', d: '#a01c2a' },
    rows: ['.........', '.rr...rr.', 'rlrr.rrrr', 'rlrrrrrrr', 'rrrrrrrrd', '.rrrrrrd.', '..rrrrd..', '...rrd...', '....d....'],
  },
  i_recovery: {
    pal: { w: '#f4f4f4', g: '#5ad06a', b: '#3a6fd8' },
    rows: ['...g.g...', '..g.g....', '...g.g...', '.........', 'wwwwwwwww', 'wbbbbbbbw', '.wwwwwww.', '..wwwww..', '.........'],
  },
  i_clone: {
    pal: { a: '#1d1411', b: '#f0c090', c: '#7fc8ff' },
    rows: ['.cc..aa..', 'cccc.aaa.', '.cc..bb..', '.cc..bb..', 'cccc.bbbb', 'c.cc.b.bb', '.cc..bb..', '.c.c.b.b.', '.c.c.b.b.'],
  },
};

// 3x5 비트맵 글꼴 (데미지 숫자, 영어 의성어)
const GLYPHS = {
  0: ['###', '#.#', '#.#', '#.#', '###'],
  1: ['.#.', '##.', '.#.', '.#.', '###'],
  2: ['###', '..#', '###', '#..', '###'],
  3: ['###', '..#', '.##', '..#', '###'],
  4: ['#.#', '#.#', '###', '..#', '..#'],
  5: ['###', '#..', '###', '..#', '###'],
  6: ['###', '#..', '###', '#.#', '###'],
  7: ['###', '..#', '.#.', '.#.', '.#.'],
  8: ['###', '#.#', '###', '#.#', '###'],
  9: ['###', '#.#', '###', '..#', '###'],
  A: ['.#.', '#.#', '###', '#.#', '#.#'],
  B: ['##.', '#.#', '##.', '#.#', '##.'],
  F: ['###', '#..', '##.', '#..', '#..'],
  H: ['#.#', '#.#', '###', '#.#', '#.#'],
  I: ['###', '.#.', '.#.', '.#.', '###'],
  K: ['#.#', '#.#', '##.', '#.#', '#.#'],
  M: ['#.#', '###', '###', '#.#', '#.#'],
  O: ['###', '#.#', '#.#', '#.#', '###'],
  P: ['##.', '#.#', '##.', '#..', '#..'],
  W: ['#.#', '#.#', '###', '###', '#.#'],
  '!': ['.#.', '.#.', '.#.', '...', '.#.'],
  '+': ['...', '.#.', '###', '.#.', '...'],
  '-': ['...', '...', '###', '...', '...'],
};
export const BITMAP_RE = /^[0-9ABFHIKMOPW!+-]+$/;
const glyphCache = new Map();

export function drawBitmapText(ctx, str, x, y, color, scale = 1) {
  // 중앙 정렬, 1px 검은 외곽선
  const w = str.length * 4 - 1;
  let cx = Math.round(x - (w * scale) / 2);
  const cy = Math.round(y);
  for (const ch of str) {
    const key = ch + color;
    let img = glyphCache.get(key);
    if (!img) {
      const rows = GLYPHS[ch];
      if (!rows) continue;
      const g = fromRows(rows, { '#': color });
      const c = makeCanvas(5, 7);
      const cctx = c.getContext('2d');
      cctx.fillStyle = OUT;
      for (let yy = 0; yy < 5; yy++) for (let xx = 0; xx < 3; xx++) if (get(g, xx, yy)) cctx.fillRect(xx, yy, 3, 3);
      cctx.fillStyle = color;
      for (let yy = 0; yy < 5; yy++) for (let xx = 0; xx < 3; xx++) if (get(g, xx, yy)) cctx.fillRect(xx + 1, yy + 1, 1, 1);
      img = c;
      glyphCache.set(key, img);
    }
    ctx.drawImage(img, cx - scale, cy - scale, 5 * scale, 7 * scale);
    cx += 4 * scale;
  }
}

// ---------- 특수 스프라이트 ----------
function biker(f) {
  const g = grid(26, 17);
  const R = '#d63a3a';
  const D = '#9a2020';
  const K = '#1a1a1a';
  const G = '#9aa4b0';
  // 바퀴
  const wheel = (cx, cy) => {
    rect(g, cx - 2, cy - 3, 5, 7, K);
    rect(g, cx - 3, cy - 2, 7, 5, K);
    px(g, cx, cy, G);
    if (f % 2) {
      px(g, cx - 1, cy - 1, G);
      px(g, cx + 1, cy + 1, G);
    } else {
      px(g, cx + 1, cy - 1, G);
      px(g, cx - 1, cy + 1, G);
    }
  };
  wheel(5, 13);
  wheel(20, 13);
  rect(g, 6, 10, 14, 2, R);
  rect(g, 12, 8, 6, 2, R);
  rect(g, 8, 9, 5, 1, K);
  rect(g, 2, 11, 4, 1, G);
  px(g, 19, 7, G);
  px(g, 20, 6, G);
  px(g, 21, 6, G);
  px(g, 22, 9, '#ffe14d');
  rect(g, 7, 12, 10, 1, D);
  // 라이더
  rect(g, 10, 0, 5, 5, '#2a2a2a'); // 헬멧
  rect(g, 13, 2, 2, 2, '#7fd0ff');
  rect(g, 9, 5, 5, 4, '#1f1f26'); // 재킷
  rect(g, 13, 6, 6, 1, '#1f1f26');
  px(g, 19, 6, '#e3a877');
  rect(g, 10, 9, 5, 1, '#2b2b36');
  rect(g, 14, 10, 1, 2, '#2b2b36');
  return g;
}

function cart(f) {
  const g = grid(30, 31);
  const W = '#f4f4f4';
  const R = '#d63a3a';
  const B = '#9a6a3a';
  const Bd = '#6a4422';
  const P = '#5a3a1e';
  // 깃발 (빨간 상승 차트)
  rect(g, 27, 0, 1, 11, P);
  rect(g, 19, 0, 8, 5, W);
  px(g, 20, 3, R);
  px(g, 21, 2, R);
  px(g, 22, 3, R);
  px(g, 23, 2, R);
  px(g, 24, 1, R);
  px(g, 25, 1, R);
  // 차양
  for (let x = 1; x < 29; x++) rect(g, x, 6, 1, 4, Math.floor(x / 3) % 2 ? R : W);
  rect(g, 2, 10, 26, 1, '#a02020');
  rect(g, 3, 11, 1, 9, P);
  rect(g, 26, 11, 1, 9, P);
  // 왕씨 (상반신)
  const man = humanoid(CHAR.oldman, 'idle', 0);
  for (let y = 0; y < 9; y++) for (let x = 0; x < 16; x++) {
    const c = get(man, x, y);
    if (c) px(g, x + 7, y + 11, c);
  }
  // 냄비 + 김
  rect(g, 18, 16, 6, 3, '#8a929e');
  rect(g, 18, 16, 6, 1, '#b8c0cc');
  if (f % 2) {
    px(g, 19, 14, '#e8e8e8');
    px(g, 21, 13, '#e8e8e8');
    px(g, 22, 15, '#e8e8e8');
  } else {
    px(g, 20, 14, '#e8e8e8');
    px(g, 22, 13, '#e8e8e8');
    px(g, 19, 12, '#e8e8e8');
  }
  // 수레
  rect(g, 2, 19, 26, 8, B);
  rect(g, 2, 19, 26, 1, '#c08a52');
  for (let x = 4; x < 28; x += 5) rect(g, x, 20, 1, 7, Bd);
  rect(g, 8, 20, 14, 5, '#f2e6c8');
  // 간판: 상승 화살표
  px(g, 10, 23, R);
  px(g, 11, 22, R);
  px(g, 12, 23, R);
  px(g, 13, 22, R);
  px(g, 14, 21, R);
  px(g, 15, 21, R);
  px(g, 16, 21, R);
  px(g, 16, 22, R);
  px(g, 18, 23, '#3a6fd8');
  px(g, 19, 22, '#3a6fd8');
  px(g, 20, 22, '#3a6fd8');
  // 바퀴
  rect(g, 6, 26, 5, 5, '#2a2a2a');
  rect(g, 20, 26, 5, 5, '#2a2a2a');
  px(g, 8, 28, '#8a929e');
  px(g, 22, 28, '#8a929e');
  return g;
}

// ---------- 굽기 ----------
export function buildSprites() {
  const poses = [
    ['idle', 0],
    ['run', 0],
    ['run', 1],
    ['run', 2],
    ['run', 3],
    ['punch', 0],
    ['kick', 0],
    ['hurt', 0],
    ['pose', 0],
  ];
  for (const name of Object.keys(CHAR)) {
    for (const [pose, f] of poses) {
      const key = pose === 'run' ? `${name}_run${f}` : `${name}_${pose}`;
      bake(key, humanoid(CHAR[name], pose, f), { oy: 18 });
    }
  }
  // 날아차기 잔상: 재키 발차기 프레임을 푸른색으로
  bake('ghost', recolor(humanoid(CHAR.jacky, 'kick', 0), () => '#7fc8ff'), { oy: 18, outline: false });

  bake('biker0', biker(0), { oy: 15 });
  bake('biker1', biker(1), { oy: 15 });
  bake('cart0', cart(0), { oy: 28 });
  bake('cart1', cart(1), { oy: 28 });

  for (const [k, v] of Object.entries(ITEMS)) bake(k, fromRows(v.rows, v.pal), { oy: Math.floor(v.rows.length / 2) + 1 });
  for (const [k, v] of Object.entries(ICONS)) bake(k, fromRows(v.rows, v.pal));
  SPR.i_punch = SPR.fist;
  SPR.i_kick = SPR.jacky_kick;
  SPR.i_ladder = SPR.ladder;
  SPR.i_chair = SPR.chair;
  SPR.i_umbrella = SPR.umbrella;
  SPR.i_flyingkick = SPR.ghost;
  SPR.i_bottle = SPR.bottle;
  SPR.i_magnet = SPR.magnet;
  SPR.i_coin = SPR.coin;
}

// ---------- 그리기 ----------
export function drawSprite(ctx, name, x, y, o = {}) {
  const s = SPR[name];
  if (!s) return;
  const img = o.white ? (o.flip ? s.wf : s.w) : o.flip ? s.f : s.c;
  const sc = o.scale || 1;
  if (o.alpha !== undefined) ctx.globalAlpha = o.alpha;
  if (o.rot) {
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));
    ctx.rotate(o.rot);
    ctx.drawImage(img, -Math.floor((s.W * sc) / 2), -Math.floor((s.H * sc) / 2), s.W * sc, s.H * sc);
    ctx.restore();
  } else {
    const ox = o.flip ? s.W - s.ox : s.ox;
    ctx.drawImage(img, Math.round(x - ox * sc), Math.round(y - s.oy * sc), s.W * sc, s.H * sc);
  }
  if (o.alpha !== undefined) ctx.globalAlpha = 1;
}

const urlCache = new Map();
// 메뉴(DOM)용 아이콘 이미지
export function spriteURL(name, scale = 3) {
  const key = name + '@' + scale;
  if (urlCache.has(key)) return urlCache.get(key);
  const s = SPR[name];
  if (!s) return '';
  const c = makeCanvas(s.W * scale, s.H * scale);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(s.c, 0, 0, s.W * scale, s.H * scale);
  const url = c.toDataURL();
  urlCache.set(key, url);
  return url;
}
