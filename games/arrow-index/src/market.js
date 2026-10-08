// ── EXP 증시 ────────────────────────────────────────────────────
// 주가 = EXP 한 단위의 가치. 1초마다 한 틱.
// 매수 버튼을 누르는 동안: 틱이 멈추고(가격 정지), 그 사이 주운 EXP 는 정지 가격으로 주식이 된다.
// 매도: 보유 주식 전부를 현재가로 팔아 (현재가 / 평단) 배율만큼 EXP 를 받는다.
const BASE_PRICE = 1000;
const HIST_LEN = 48;

const Market = {
  reset() {
    this.price = BASE_PRICE;
    this.prev = BASE_PRICE;
    this.hist = [];
    for (let i = 0; i < HIST_LEN; i++) this.hist.push(BASE_PRICE);
    this.tickT = 0;           // 0..1, 다음 틱까지 진행률
    this.anim = 1;            // 마지막 점 보간 진행률
    this.frozen = false;
    this.frozenT = 0;
    this.shares = 0;          // 보유 수량
    this.cost = 0;            // 투입한 EXP 합계
    this.regime = { mu: 0, vol: 1, left: 8, name: 'calm' };
    this.lo = BASE_PRICE * 0.9; this.hi = BASE_PRICE * 1.1; // 그래프 y 범위 (부드럽게 추적)
    this.flash = 0;           // 매도 순간 그래프 섬광
    this.trades = 0;
    this.bestRatio = 0;
    this.netGain = 0;
    this.stockedFx = 0;
    this.genNext();
    for (let i = 0; i < HIST_LEN; i++) {
      this.prev = this.price; this.price = this.next;
      this.hist.push(this.price); this.hist.shift();
      this.genNext();
    }
    this.prev = this.hist[HIST_LEN - 2];
    let lo = Infinity, hi = -Infinity;
    for (const p of this.hist) { lo = Math.min(lo, p); hi = Math.max(hi, p); }
    this.lo = lo - 30; this.hi = hi + 30;
  },

  get avg() { return this.shares > 0 ? this.cost / this.shares : 0; },
  get value() { return this.shares * this.price; },

  vol() {
    // 스테이지가 오를수록 변동성이 커진다
    return 0.024 + G.stage * 0.0055;
  },

  newRegime() {
    const r = Math.random();
    const s = this.vol();
    if (r < 0.28) this.regime = { name: 'bull', mu: rand(0.4, 0.9) * s, vol: rand(0.6, 1.0), left: randi(6, 16) };
    else if (r < 0.56) this.regime = { name: 'bear', mu: -rand(0.4, 0.9) * s, vol: rand(0.6, 1.0), left: randi(6, 16) };
    else if (r < 0.82) this.regime = { name: 'calm', mu: 0, vol: rand(0.35, 0.6), left: randi(5, 12) };
    else this.regime = { name: 'wild', mu: 0, vol: rand(1.6, 2.4), left: randi(4, 9) };
  },

  genNext() {
    if (--this.regime.left <= 0) this.newRegime();
    const s = this.vol();
    let r = this.regime.mu + gauss() * s * this.regime.vol;
    r -= 0.045 * Math.log(this.price / BASE_PRICE); // 평균 회귀
    if (chance(0.02 + G.stage * 0.004)) r += (chance(0.5) ? 1 : -1) * rand(0.07, 0.17); // 급등락
    this.next = clamp(this.price * Math.exp(r), 220, 4500);
  },

  tick() {
    this.prev = this.price;
    this.price = this.next;
    this.hist.push(this.price);
    if (this.hist.length > HIST_LEN + 1) this.hist.shift();
    this.anim = 0;
    this.ticked = true;
    // 배당: 보유 수량이 조금씩 늘어난다
    const div = G.passive.dividend || 0;
    if (div && this.shares > 0) this.shares *= 1 + 0.004 * div;
    Sfx.play('tick', this.price >= this.prev ? 1 : -1);
    this.genNext();
  },

  update(dt) {
    if (this.frozen) this.frozenT += dt;
    else {
      this.tickT += dt;
      while (this.tickT >= 1) { this.tickT -= 1; this.tick(); }
    }
    this.anim = Math.min(1, this.anim + dt / 0.28);
    this.flash = Math.max(0, this.flash - dt * 2.5);
    // y 범위 부드럽게
    let lo = Infinity, hi = -Infinity;
    for (const p of this.hist) { if (p < lo) lo = p; if (p > hi) hi = p; }
    if (this.shares > 0) { lo = Math.min(lo, this.avg); hi = Math.max(hi, this.avg); }
    const pad = Math.max(30, (hi - lo) * 0.18);
    this.lo = damp(this.lo, lo - pad, 6, dt);
    this.hi = damp(this.hi, hi + pad, 6, dt);
  },

  buyStart() {
    if (this.frozen) return;
    this.frozen = true;
    this.frozenT = 0;
    Sfx.play('buy');
  },
  buyEnd() {
    if (!this.frozen) return;
    this.frozen = false;
    Sfx.play('unbuy');
  },

  // 매수 중 주운 EXP → 주식
  stock(xp) {
    this.shares += xp / this.price;
    this.cost += xp;
  },

  ratioNow() {
    if (this.shares <= 0) return 1;
    const raw = this.price / this.avg;
    const lev = 1 + 0.5 * (G.passive.leverage || 0);
    let eff = 1 + (raw - 1) * lev;
    const sl = G.passive.stoploss || 0;
    if (sl) eff = Math.max(eff, [0, 0.75, 0.85, 0.95][sl]);
    return Math.max(0, eff);
  },

  // 반환: {gain, ratio} 또는 null
  sell() {
    if (this.shares <= 0) { Sfx.play('dud'); return null; }
    const ratio = this.ratioNow();
    const gain = this.cost * ratio;
    this.trades++;
    this.bestRatio = Math.max(this.bestRatio, ratio);
    this.netGain += gain - this.cost;
    const res = { gain, ratio, cost: this.cost };
    this.shares = 0; this.cost = 0;
    this.flash = 1;
    Sfx.play(ratio >= 1 ? 'sellUp' : 'sellDown');
    return res;
  },
};
