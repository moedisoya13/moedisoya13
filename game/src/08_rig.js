// ─────────────────────────────────────────────────────────────
// Procedural 3D rig → 3/4 projection → crisp pixel primitives.
// Every joint is recomputed each frame from continuous phase/angle,
// so motion is as finely subdivided as the display refresh allows.
// Local space: f = forward, r = right, z = up (pixels).
// ─────────────────────────────────────────────────────────────

const K3 = 0.62; // ground-plane foreshortening for the 3/4 view

class Rig {
  constructor(X, Y, ang, s = 1, tilt = 0, roll = 0) {
    this.X = X; this.Y = Y; this.s = s;
    this.fx = Math.cos(ang); this.fy = Math.sin(ang);
    this.rx = -Math.sin(ang); this.ry = Math.cos(ang);
    this.ct = Math.cos(tilt); this.st = Math.sin(tilt);
    this.cr = Math.cos(roll); this.sr = Math.sin(roll);
    this.ops = [];
    this.flash = null;
  }
  P(f, r, z) {
    const f2 = f * this.ct + z * this.st;
    let z2 = -f * this.st + z * this.ct;
    const r2 = r * this.cr - z2 * this.sr;
    z2 = r * this.sr + z2 * this.cr;
    const wx = (this.fx * f2 + this.rx * r2) * this.s, wy = (this.fy * f2 + this.ry * r2) * this.s;
    return { x: this.X + wx, y: this.Y + wy * K3 - z2 * this.s, d: wy + z2 * 0.002 };
  }
  Pj(j) { return this.P(j[0], j[1], j[2]); }
  line(a, b, w, c, db = 0) { this.ops.push({ k: 0, a, b, w: Math.max(1, w * this.s), c, d: (a.d + b.d) / 2 + db }); }
  disc(p, r, c, db = 0) { this.ops.push({ k: 1, p, r: r * this.s, c, d: p.d + db }); }
  poly(pts, c, db = 0) { let d = 0; for (const p of pts) d += p.d; this.ops.push({ k: 2, pts, c, d: d / pts.length + db }); }
  fn(d, draw) { this.ops.push({ k: 3, d, draw }); }
  render(outline = C.ink) {
    const ops = this.ops.sort((a, b) => a.d - b.d);
    const fl = this.flash;
    if (outline) {
      for (const o of ops) {
        if (o.k === 0) thickLine(o.a.x, o.a.y, o.b.x, o.b.y, o.w + 2, outline);
        else if (o.k === 1) disc(o.p.x, o.p.y, o.r + 1, outline);
        else if (o.k === 2) {
          const n = o.pts.length;
          for (let i = 0; i < n; i++) { const a = o.pts[i], b = o.pts[(i + 1) % n]; thickLine(a.x, a.y, b.x, b.y, 2, outline); }
        }
      }
    }
    for (const o of ops) {
      const c = fl && o.c ? fl : o.c;
      if (o.k === 0) thickLine(o.a.x, o.a.y, o.b.x, o.b.y, o.w, c);
      else if (o.k === 1) disc(o.p.x, o.p.y, o.r, c);
      else if (o.k === 2) { const flat = []; for (const p of o.pts) flat.push(p.x, p.y); poly(flat, c); }
      else if (o.k === 3 && !fl) o.draw();
    }
  }
}

function groundShadow(X, Y, rx, ry, a = 0.45) {
  L.globalAlpha = a;
  ellipse(X, Y + 0.5, rx, ry, 0, '#000000');
  L.globalAlpha = 1;
}

// ── humanoid pose generator ──────────────────────────────────
// o: phase, amt(0..1 stride), lean, hunch, leg, torso, sh, hip, armAmp,
//    breath, handR/handL overrides [f,r,z], crouch, headTurn
function humanPose(o) {
  const s = Math.sin(o.phase), c = Math.cos(o.phase);
  const amt = o.amt;
  const stride = (o.stride ?? 3.4) * amt;
  const leg = o.leg ?? 8, torso = o.torso ?? 5, sh = o.sh ?? 3.2, hip = o.hip ?? 1.8;
  const bob = Math.abs(c) * 0.8 * amt;
  const hipZ = leg - (o.crouch || 0) + bob * 0.6;
  const lean = (o.lean || 0) + amt * 1.1;
  const hunch = o.hunch || 0;
  const J = {};
  const fL = s * stride, fR = -s * stride;
  const liftL = Math.max(0, c) * 2.3 * amt, liftR = Math.max(0, -c) * 2.3 * amt;
  J.hipL = [lean * 0.25, -hip, hipZ];
  J.hipR = [lean * 0.25, hip, hipZ];
  J.hipC = [lean * 0.25, 0, hipZ];
  J.footL = [fL, -hip * 0.95, liftL];
  J.footR = [fR, hip * 0.95, liftR];
  J.kneeL = [(J.hipL[0] + fL) / 2 + 0.9 + liftL * 0.45, -hip, (hipZ + liftL) / 2 + liftL * 0.3];
  J.kneeR = [(J.hipR[0] + fR) / 2 + 0.9 + liftR * 0.45, hip, (hipZ + liftR) / 2 + liftR * 0.3];
  const chestZ = hipZ + torso - hunch * 0.6 + (o.breath || 0);
  J.chest = [lean + hunch, 0, chestZ];
  const tw = -s * 0.24 * amt + (o.twist || 0);
  J.shL = [J.chest[0] + sh * Math.sin(tw), -sh * Math.cos(tw), chestZ - 0.4];
  J.shR = [J.chest[0] - sh * Math.sin(tw), sh * Math.cos(tw), chestZ - 0.4];
  const arm = (o.armAmp ?? 3) * amt;
  const swL = -s * arm, swR = s * arm;
  J.handL = o.handL || [J.shL[0] + swL, J.shL[1] * 1.15, chestZ - 5.2 + Math.max(0, swL) * 0.35];
  J.handR = o.handR || [J.shR[0] + swR, J.shR[1] * 1.15, chestZ - 5.2 + Math.max(0, swR) * 0.35];
  const elbow = (shJ, hand, side) => [(shJ[0] + hand[0]) / 2 - 0.9, (shJ[1] + hand[1]) / 2 + side * 0.5, (shJ[2] + hand[2]) / 2 + 0.2];
  J.elbL = elbow(J.shL, J.handL, -1);
  J.elbR = elbow(J.shR, J.handR, 1);
  J.head = [J.chest[0] + lean * 0.35 + hunch * 0.9, 0, chestZ + (o.neck ?? 3.4) - hunch * 0.5];
  J.headAng = o.headTurn || 0;
  return J;
}

// shared humanoid body: legs, torso, arms, head. Colors in `k`.
function drawHumanBody(rig, J, k, dims) {
  const P = (j) => rig.Pj(j);
  const hl = P(J.hipL), hr = P(J.hipR), kl = P(J.kneeL), kr = P(J.kneeR), fl = P(J.footL), fr = P(J.footR);
  // legs
  rig.line(hl, kl, dims.thigh ?? 2.2, k.legs); rig.line(kl, fl, dims.shin ?? 2, k.legs2 || k.legs);
  rig.line(hr, kr, dims.thigh ?? 2.2, k.legs); rig.line(kr, fr, dims.shin ?? 2, k.legs2 || k.legs);
  rig.disc(fl, dims.foot ?? 1.2, k.boot, 0.01); rig.disc(fr, dims.foot ?? 1.2, k.boot, 0.01);
  // torso
  const hc = P(J.hipC), ch = P(J.chest);
  rig.line(hc, ch, dims.torsoW ?? 5, k.body);
  rig.disc(ch, (dims.torsoW ?? 5) * 0.55, k.body, 0.02);
  if (k.belly) rig.disc(P([J.hipC[0] + 0.6, 0, J.hipC[2] + 1.2]), (dims.torsoW ?? 5) * 0.48, k.belly, 0.03);
  // arms
  const sl = P(J.shL), sr = P(J.shR), el = P(J.elbL), er = P(J.elbR), hal = P(J.handL), har = P(J.handR);
  rig.line(sl, el, dims.arm ?? 1.7, k.sleeve || k.body); rig.line(el, hal, dims.fore ?? 1.5, k.sleeve2 || k.sleeve || k.body);
  rig.line(sr, er, dims.arm ?? 1.7, k.sleeve || k.body); rig.line(er, har, dims.fore ?? 1.5, k.sleeve2 || k.sleeve || k.body);
  rig.disc(hal, dims.hand ?? 1, k.hand); rig.disc(har, dims.hand ?? 1, k.hand);
  return { hl, hr, kl, kr, fl, fr, hc, ch, sl, sr, el, er, hal, har };
}

// face direction helper: returns points on the head sphere
function headPts(rig, J, R, turn = 0) {
  const a = turn;
  const hf = J.head[0], hz = J.head[2];
  const front = (d, side, dz = 0) => rig.P(hf + Math.cos(a) * d - Math.sin(a) * side, Math.sin(a) * d + Math.cos(a) * side, hz + dz);
  return { c: rig.Pj(J.head), front, R };
}

// ═════════════════════════════════════════════════════════════
// Characters
// ═════════════════════════════════════════════════════════════

function drawRunner(X, Y, st) {
  const rig = new Rig(X, Y, st.ang, st.scale || 1, st.tilt || 0, st.roll || 0);
  if (st.flash) rig.flash = st.flash;
  const J = humanPose({ phase: st.phase, amt: st.amt, breath: st.breath, lean: st.lean, headTurn: st.headTurn, crouch: st.crouch, handL: st.handL, handR: st.handR });
  const k = { legs: '#2d3552', legs2: '#232a40', boot: C.boot, body: C.coat, sleeve: C.coat, sleeve2: C.coat2, hand: C.skin };
  drawHumanBody(rig, J, k, {});
  // coat hem flares behind the hips
  rig.disc(rig.P(J.hipC[0] - 0.6, 0, J.hipC[2] - 1.4), 2.7, C.coat2, -0.05);
  const H = headPts(rig, J, 3.2, J.headAng);
  rig.disc(H.c, 3.3, C.coat, 0.05);              // hood
  rig.disc(H.front(1.4, 0, -0.2), 2.2, C.skin, 0.12); // face opening
  rig.disc(H.front(-1.6, 0, 0.6), 2.2, C.coat2, 0.04);
  rig.fn(rig.Pj(J.head).d + 0.3, () => {
    const e1 = H.front(3.1, -1, 0.2), e2 = H.front(3.1, 1, 0.2);
    if (rig.fy > -0.25) { px(e1.x, e1.y, '#1b1214'); px(e2.x, e2.y, '#1b1214'); }
  });
  rig.render();
  return rig;
}

// Cape-wearing muscle giant with a lightning chest emblem
function drawHero(X, Y, st, t) {
  const rig = new Rig(X, Y, st.ang, (st.scale || 1) * 1.42, st.tilt || 0, 0);
  if (st.flash) rig.flash = st.flash;
  const J = humanPose({ phase: st.phase, amt: st.amt, breath: st.breath, lean: st.lean, sh: 4.3, hip: 2.1, torso: 5.6, leg: 8.2, armAmp: 3.4, stride: 3.8, handR: st.handR, handL: st.handL });
  // cape (behind)
  // cape hangs from the shoulders and streams back + down with speed
  const fl = Math.sin(t * 9) * 0.7 * (0.4 + st.amt);
  const tipZ = 0.8 + st.amt * 2.2, back = -2.2 - st.amt * 3.2;
  const cL = rig.Pj(J.shL), cR = rig.Pj(J.shR), nape = rig.P(J.chest[0] - 1.4, 0, J.chest[2] + 0.4);
  const tL = rig.P(back + fl, -3.6, tipZ), tR = rig.P(back - fl, 3.6, tipZ + 0.4), tM = rig.P(back - 0.8, 0, tipZ - 0.5 + fl * 0.4);
  rig.poly([cL, nape, tM, tL], '#efe6d2', -0.6);
  rig.poly([cR, tR, tM, nape], '#cfc4ad', -0.6);
  const k = { legs: C.hero, legs2: C.hero2, boot: C.gold, body: C.hero, sleeve: C.hero, sleeve2: C.hero, hand: C.heroSkin };
  const B = drawHumanBody(rig, J, k, { thigh: 2.8, shin: 2.4, torsoW: 7, arm: 2.6, fore: 2.3, hand: 1.4, foot: 1.5 });
  // belt
  rig.line(rig.P(J.hipC[0] + 0.3, -2.4, J.hipC[2] + 0.8), rig.P(J.hipC[0] + 0.3, 2.4, J.hipC[2] + 0.8), 1.2, C.gold, 0.08);
  // chest bolt emblem
  rig.fn(B.ch.d + 0.4, () => {
    if (rig.fy < -0.3) return;
    const p = rig.P(J.chest[0] + 2.6, 0, J.chest[2] - 0.5);
    const c = st.flash || C.gold;
    px(p.x + 1, p.y - 2, c); px(p.x, p.y - 1, c); px(p.x - 1, p.y, c); px(p.x, p.y, c); px(p.x + 1, p.y, c); px(p.x, p.y + 1, c); px(p.x - 1, p.y + 2, c);
  });
  const H = headPts(rig, J, 3.2);
  rig.disc(H.c, 3.0, C.heroSkin, 0.05);
  rig.disc(H.front(-1.2, 0, 1.2), 2.6, '#1a1210', 0.06); // hair (back)
  rig.disc(H.front(0.2, 0, 2.2), 2.3, '#1a1210', 0.07);  // hair (crown, visible from the front)
  rig.fn(B.ch.d + 0.5, () => {
    if (rig.fy > -0.25) { const e1 = H.front(2.7, -1, 0.4), e2 = H.front(2.7, 1, 0.4); px(e1.x, e1.y, '#ffffff'); px(e2.x, e2.y, '#ffffff'); }
  });
  rig.render();
}

// Generic killer humanoid builder (style-driven)
function drawKillerHuman(X, Y, st, style) {
  const rig = new Rig(X, Y, st.ang, (st.scale || 1) * style.scale, st.tilt || 0, st.roll || 0);
  if (st.flash) rig.flash = st.flash;
  const J = humanPose({
    phase: st.phase, amt: st.amt, breath: st.breath, lean: style.lean || 0, hunch: style.hunch || 0,
    sh: style.sh, hip: style.hip, torso: style.torso, leg: style.leg, stride: style.stride, armAmp: style.armAmp,
    handR: st.handR, handL: st.handL, neck: style.neck,
  });
  if (style.behind) style.behind(rig, J, st);
  const B = drawHumanBody(rig, J, style.k, style.dims || {});
  if (style.extra) style.extra(rig, J, st, B);
  rig.render();
  return rig;
}

// attack arm helper: windup (raised back) → strike (forward slash) → recover
function attackHand(st, base) {
  const a = st.atk;
  if (!a) return null;
  if (a.phase === 'windup') { const u = Ease.outCubic(a.f); return [lerp(base[0], -1.5, u), lerp(base[1], 3.4, u), lerp(base[2], 17, u)]; }
  if (a.phase === 'strike') { const u = Ease.outCubic(a.f); return [lerp(-1.5, 6.5, u), lerp(3.4, -1, u), lerp(17, 7, u)]; }
  if (a.phase === 'recover') { const u = Ease.inOutSine(a.f); return [lerp(6.5, base[0], u), lerp(-1, base[1], u), lerp(7, base[2], u)]; }
  return null;
}
