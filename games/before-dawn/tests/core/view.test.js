// Camera math and the simulation's view rectangle (src/core/05_view.js).
'use strict';

const roomsV1 = (BD) => BD.C.ROOM_SIZES.concat([[12, 12], [13, 13]]);

module.exports = {
  'map / unmap round trip and the iso scale': (t) => {
    const BD = t.load(), V = BD.view;
    for (const [x, y] of [[0, 0], [3.25, 7.5], [47.9, 0.1], [-2, 5]]) {
      const [mx, my] = V.map(x, y), [bx, by] = V.unmap(mx, my);
      t.near(bx, x, 1e-9); t.near(by, y, 1e-9);
    }
    t.eq(V.map(1, 0), [40, 20]); t.eq(V.map(0, 1), [-40, 20]);
  },

  'every v1 room fits: the focus is the room centre whatever is asked (v1 camera unchanged)': (t) => {
    const BD = t.load(), V = BD.view, C = BD.C;
    for (const [W, H] of roomsV1(BD)) {
      const g = BD.Grid(W, H), f = V.frame(g);
      t.assert(f.fitX && f.fitY && V.fits(g), `${W}x${H} should fit`);
      for (const want of [[0, 0], [9999, -9999], [-500, 300]]) {
        const [fx, fy] = V.focus(g, want[0], want[1]);
        // the v1 renderer's room origin: rox = ROOM_CX − (W/2 − H/2)·ISO_X, roy = ROOM_CY − (W/2 + H/2)·ISO_Y
        t.eq([C.ROOM_CX - fx, C.ROOM_CY - fy], [C.ROOM_CX - (W / 2 - H / 2) * C.ISO_X, C.ROOM_CY - (W / 2 + H / 2) * C.ISO_Y]);
      }
    }
  },

  'v1 rooms: every floor cell is in view from anywhere (the rule hook never bites in v1)': (t) => {
    const BD = t.load(), H = BD.harness();
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      H.start({ seed, hand: [] });
      for (let n = 1; n <= 6; n++) {
        H.goto(n);
        const w = H.world();
        for (const hp of [[1.5, 1.5], [w.grid.w - 1.5, w.grid.h - 1.5], [w.grid.w / 2, w.grid.h / 2]]) {
          w.hero.x = hp[0]; w.hero.y = hp[1];
          for (let y = 0; y < w.grid.h; y++) for (let x = 0; x < w.grid.w; x++) {
            if (w.grid.get(x, y) === BD.CELL.VOID) continue;
            for (const c of [[x, y], [x + 1, y + 1], [x + 1, y], [x, y + 1]]) t.assert(BD.ai.inView(w, c[0], c[1]), `seed ${seed} ${n}F corner ${c} out of view`);
          }
        }
      }
    }
  },

  'big floor: the focus follows, clamps at the frame, and the view never leaves the frame': (t) => {
    const BD = t.load(), V = BD.view, C = BD.C;
    const g = BD.Grid(48, 48), f = V.frame(g);
    t.assert(!f.fitX && !f.fitY);
    // centre of the floor: focus = asked point
    const mid = V.map(24, 24);
    t.eq(V.focus(g, mid[0], mid[1]), mid);
    for (const [x, y] of [[0, 0], [48, 48], [48, 0], [0, 48], [24, 0]]) {
      const [mx, my] = V.map(x, y), [fx, fy] = V.focus(g, mx, my);
      t.assert(fx - C.ROOM_CX >= f.x0 - 1e-9 && fx + C.VIEW_W - C.ROOM_CX <= f.x1 + 1e-9, 'x window inside the frame');
      t.assert(fy - C.ROOM_CY >= f.y0 - 1e-9 && fy + C.VIEW_H - C.ROOM_CY <= f.y1 + 1e-9, 'y window inside the frame');
    }
    // a long thin floor follows on x and stands still on y when it fits that way
    const thin = BD.Grid(30, 2), ft = V.frame(thin);
    t.assert(!ft.fitX || !ft.fitY);
  },

  'view rect: guaranteed inside every client view the camera may show (slack property)': (t) => {
    const BD = t.load(), V = BD.view, C = BD.C;
    const H = BD.harness(); H.start({ seed: 3, hand: [] }); H.stage({ size: [48, 48], enemies: 0 });
    const w = H.world(), rng = BD.Rng(7);
    for (let i = 0; i < 2000; i++) {
      w.hero.x = rng.range(0.4, 47.6); w.hero.y = rng.range(0.4, 47.6);
      const r = V.rect(w), [hx, hy] = V.map(w.hero.x, w.hero.y);
      // any client camera: hero + a lag/lead within the slack, then clamped
      const dx = rng.range(-C.CAM.slack.x, C.CAM.slack.x), dy = rng.range(-C.CAM.slack.y, C.CAM.slack.y);
      const [fx, fy] = V.focus(w.grid, hx + dx, hy + dy);
      t.assert(r.x0 >= fx - C.ROOM_CX - 1e-6 && r.x1 <= fx + C.VIEW_W - C.ROOM_CX + 1e-6, 'x inside the shown window');
      t.assert(r.y0 >= fy - C.ROOM_CY - 1e-6 && r.y1 <= fy + C.VIEW_H - C.ROOM_CY + 1e-6, 'y inside the shown window');
      t.assert(V.inView(w, w.hero.x, w.hero.y), 'the hero is always in view');
    }
  },

  'inView: near in, far out, pad shrinks or grows, corners and ai helpers agree': (t) => {
    const BD = t.load(), V = BD.view;
    const H = BD.harness(); H.start({ seed: 3, hand: [] }); H.stage({ size: [48, 48], enemies: 0 });
    const w = H.world();
    w.hero.x = 24; w.hero.y = 24;
    t.assert(V.inView(w, 26, 24), '2u away is in view');
    t.assert(!V.inView(w, 40, 24), '16u away is not');
    t.assert(!V.inView(w, 24 + 9, 24 - 9), '9u right on screen (1018 px) is past the inset edge');
    // walk a point right along screen-x until it leaves; pad moves the edge by about pad·56.6 px
    const edge = (pad) => { let k = 0; while (V.inView(w, 24 + k, 24 - k, pad)) k += 0.01; return k; };
    const e0 = edge(0), e1 = edge(1), em = edge(-1);
    t.assert(e1 < e0 && em > e0, 'pad moves the edge');
    t.near((e0 - e1) * 2 * BD.C.ISO_X, BD.C.ISO_X * Math.SQRT2, 2, 'pad 1u ≈ 56.6 px across');
    const cs = V.corners(w);
    t.eq(cs.length, 4);
    for (const [x, y] of cs) t.assert(V.inView(w, x + (24 - x) * 0.01, y + (24 - y) * 0.01), 'just inside a corner is in view');
    const e = BD.W.makeEnemy(w, 'goblin', 25, 24);
    t.assert(BD.ai.seen(w, e) && BD.ai.inView(w, 25, 24));
    e.x = 45; e.y = 45;
    t.assert(!BD.ai.seen(w, e));
  },
};
