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
      H.world().run = BD.gen.run(seed, 0, { v1: true }); // v2 runs are big floors; the v1 rooms are still generated on request
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

  // GDD-V2 §5.6 (replaces the v1-engine "slack" property: the client no longer has a camera of its
  // own, it draws BD.view.focusOf(w), so C ⊂ S is what every screen shows)
  'the camera is simulation state: C inside S inside the frame, the hero inside C, the client focus is the simulation focus': (t) => {
    const BD = t.load(), V = BD.view, C = BD.C;
    const H = BD.harness(); H.start({ seed: 3, hand: [] }); H.stage({ size: [48, 48], enemies: 0 });
    const w = H.world(), rng = BD.Rng(7), f = V.frame(w.grid);
    for (let i = 0; i < 2000; i++) {
      w.hero.x = rng.range(0.4, 47.6); w.hero.y = rng.range(0.4, 47.6);
      V.snapCam(w);
      const r = V.rect(w), s = V.screen(w), [fx, fy] = V.focusOf(w);
      t.assert(r.x0 >= s.x0 && r.x1 <= s.x1 && r.y0 >= s.y0 && r.y1 <= s.y1, 'C inside S');
      t.near(s.x0, fx - C.ROOM_CX, 1e-9); t.near(s.y1, fy + C.VIEW_H - C.ROOM_CY, 1e-9);
      t.assert(s.x0 >= f.x0 - 1e-6 && s.x1 <= f.x1 + 1e-6 && s.y0 >= f.y0 - 1e-6 && s.y1 <= f.y1 + 1e-6, 'S inside the frame');
      t.assert(V.inView(w, w.hero.x, w.hero.y) && V.onScreen(w, w.hero.x, w.hero.y), 'the hero is in the combat window');
      t.assert(w.cam.x >= 5 && w.cam.x <= 43 && w.cam.y >= 5 && w.cam.y <= 43, 'cam clamped to [5, 43]');
    }
  },

  'the simulation camera eases toward the hero plus 1.5u along the walk and snaps on a teleport (GDD-V2 §5.6)': (t) => {
    const BD = t.load(), V = BD.view;
    const H = BD.harness(); H.start({ seed: 3, hand: [] }); H.stage({ size: [48, 48], enemies: 0 });
    const w = H.world();
    w.hero.x = 24; w.hero.y = 24; V.snapCam(w);
    t.eq([w.cam.x, w.cam.y], [24, 24]);
    // walking +x for 2 s: the target leads by 1.5u and the camera follows it at rate 8/s, so in a
    // steady walk it sits 1.5 − speed / 8 ahead
    H.input({ mx: 1, my: 0 }); H.step(120);
    t.near(w.cam.x - w.hero.x, 1.5 - BD.C.HERO.speed / 8, 0.03); t.near(w.cam.y, w.hero.y, 1e-6);
    H.input({ mx: 0, my: 0 }); H.step(120); // stopped: the lead goes back to 0
    t.near(w.cam.x, w.hero.x, 0.05);
    w.hero.x = 6; w.hero.y = 30; H.step(1); // a teleport snaps
    t.eq([w.cam.x, w.cam.y], [6, 30]);
    w.hero.x = 1; w.hero.y = 1; H.step(1);
    t.eq([w.cam.x, w.cam.y], [5, 5], 'clamped at the floor edge');
    t.eq(V.focusOf(w), V.focus(w.grid, ...V.map(w.cam.x, w.cam.y)));
  },

  'inView: near in, far out, pad shrinks or grows, corners and ai helpers agree': (t) => {
    const BD = t.load(), V = BD.view;
    const H = BD.harness(); H.start({ seed: 3, hand: [] }); H.stage({ size: [48, 48], enemies: 0 });
    const w = H.world();
    w.hero.x = 24; w.hero.y = 24; V.snapCam(w);
    t.assert(V.inView(w, 26, 24), '2u away is in view');
    t.assert(!V.inView(w, 40, 24), '16u away is not');
    t.assert(!V.inView(w, 24 + 9, 24 - 9), '9u right on screen (720 px from the centre) is past the combat window (592 px)');
    t.assert(!V.onScreen(w, 24 + 9, 24 - 9) && V.onScreen(w, 24 + 7.6, 24 - 7.6) && !V.inView(w, 24 + 7.6, 24 - 7.6), 'between C (592 px) and S (640 px)');
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
