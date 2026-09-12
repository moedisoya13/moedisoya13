/*!
 * gradient-bg.js — reveal.js 배경용 layered radial 애니메이션 그라데이션
 *
 * 기법은 Justin Jay Wang, "Methods for random gradients" 의 layered radial 계열이다.
 * 팔레트에서 뽑은 색으로 radial gradient 타원(blob) 여러 장을 겹쳐 깔고, 각 blob 을
 * 아주 느리게 흘려서 움직이는 배경을 만든다.
 *
 * 의존성 없음. 전역 두 개를 노출한다.
 *   GradientBackground        — 스탠드얼론 API (mount/destroy/reseed/setPalette)
 *   RevealGradientBackground  — reveal.js 플러그인 객체
 *
 * 설계 메모(왜 이렇게 짰는지):
 *   - 캔버스를 작게(짧은 변 ~140px) 잡고 CSS 로 화면 크기까지 늘린다. 브라우저의
 *     GPU 바이리니어 보간이 곧 공짜 블러라, filter: blur() 를 매 프레임 먹이는 것보다
 *     압도적으로 싸다. blob 은 저주파라 이 정도 해상도에서 화질 손해가 없다.
 *   - blob 위치를 적분해서 누적하지 않고 시간 t 의 순수 함수(사인 2개 합)로 만든다.
 *     탭을 백그라운드에 뒀다 오거나 프레임을 건너뛰어도 튀지 않는다.
 *   - 슬라이드 전환은 캔버스 두 장을 알파 페이드하지 않고 blob 파라미터를 보간한다.
 *     겹치는 구간에서 색이 탁해지지 않고, 그릴 양도 그대로다.
 */
(function (global) {
  'use strict';

  var DEFAULTS = {
    target: null,          // 캔버스를 넣을 요소 (기본: document.body)
    insertBefore: null,    // 이 요소 앞에 넣는다 (reveal 플러그인이 .reveal 을 넘김)
    palette: null,         // ['#a5b4fc', ...] — 없으면 CSS 변수 --gbg-1..8 에서 읽는다
    baseColor: null,       // 바닥색 — 없으면 CSS 변수 --gbg-base
    count: 12,             // blob 개수
    speed: 1,              // 드리프트 속도 배율 (1 = 아주 느림)
    seed: 1,               // 초기 시드
    grain: 0.035,          // 그레인 오버레이 불투명도 (CSS 가 그린다)
    buffer: 140,           // 캔버스 짧은 변 픽셀 수 — 클수록 또렷, 작을수록 뿌옇다
    // 배경은 전경 텍스트에 자리를 내주는 쪽이 기본이다. 아래 둘이 그 손잡이다.
    intensity: 0.35,       // blob 알파 배율. 1 이면 색이 제일 진하다
    wash: 0.35,            // blob 위에 덮는 바닥색 베일 (0 이면 안 덮는다)
    transitionMs: 1200,    // 시드 교체 크로스페이드 길이
    fps: 30,               // 느린 배경이라 30fps 면 충분하다
    blend: 'source-over',  // 'multiply'(밝은 바탕에서 색이 진해짐) / 'lighter'(어두운 바탕)
    reseedOnSlide: true    // reveal 플러그인에서만 의미가 있다
  };

  // ---------------------------------------------------------------- 난수/해시

  // mulberry32 — 짧고 분포가 좋은 결정론적 PRNG.
  // 같은 시드면 항상 같은 구성이 나와야 한다(같은 슬라이드는 같은 배경).
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hashInts() {
    var h = 2166136261;
    for (var i = 0; i < arguments.length; i++) {
      h ^= (arguments[i] | 0) + 0x9e3779b9;
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  // ---------------------------------------------------------------- 색 처리

  var probeCtx = null;
  function colorProbe() {
    if (!probeCtx) probeCtx = document.createElement('canvas').getContext('2d');
    return probeCtx;
  }

  // 브라우저에게 파싱을 시킨다. hex/rgb()/색 이름/hsl() 뭐가 들어와도 받는다.
  function parseColor(input) {
    var ctx = colorProbe();
    ctx.fillStyle = '#000000';
    try { ctx.fillStyle = input; } catch (e) { return [0, 0, 0]; }
    var s = ctx.fillStyle;
    if (s.charAt(0) === '#') {
      var n = parseInt(s.slice(1), 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    var m = s.match(/rgba?\(([^)]+)\)/);
    if (!m) return [0, 0, 0];
    var p = m[1].split(',');
    return [parseFloat(p[0]) | 0, parseFloat(p[1]) | 0, parseFloat(p[2]) | 0];
  }

  function srgbToLinear(c) {
    c /= 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }

  function linearToSrgb(c) {
    var v = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
    return Math.max(0, Math.min(255, Math.round(v * 255)));
  }

  // sRGB 직선 보간은 파스텔끼리 섞으면 중간이 탁한 회색으로 내려앉는다.
  // OkLab 에서 섞으면 채도와 밝기가 유지된다.
  function rgbToOklab(rgb) {
    var R = srgbToLinear(rgb[0]), G = srgbToLinear(rgb[1]), B = srgbToLinear(rgb[2]);
    var l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
    var m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
    var s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
    return [
      0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
      1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
      0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
    ];
  }

  function oklabToRgb(lab) {
    var l_ = lab[0] + 0.3963377774 * lab[1] + 0.2158037573 * lab[2];
    var m_ = lab[0] - 0.1055613458 * lab[1] - 0.0638541728 * lab[2];
    var s_ = lab[0] - 0.0894841775 * lab[1] - 1.2914855480 * lab[2];
    var l = l_ * l_ * l_, m = m_ * m_ * m_, s = s_ * s_ * s_;
    return [
      linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
      linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
      linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s)
    ];
  }

  function mixOklab(labA, labB, t) {
    return [
      labA[0] + (labB[0] - labA[0]) * t,
      labA[1] + (labB[1] - labA[1]) * t,
      labA[2] + (labB[2] - labA[2]) * t
    ];
  }

  function lerp(a, b, t) { return a + (b - a) * t; }
  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  // ---------------------------------------------------------------- blob 생성

  // 균등 난수로 중심을 뿌리면 뭉치거나 빈 구석이 생긴다. 성긴 격자에 하나씩
  // 배치하고 셀 안에서 흔드는(jittered grid) 방식이 화면을 고르게 덮는다.
  function makeBlobs(seed, palette, count, speed) {
    var rnd = mulberry32(seed);
    var cols = Math.ceil(Math.sqrt(count * 1.4));
    var rows = Math.ceil(count / cols);
    var order = [];
    var i;
    for (i = 0; i < count; i++) order.push(i);
    // 팔레트 색이 격자 순서대로 깔리면 규칙적으로 보인다 — 순서를 섞는다.
    for (i = order.length - 1; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1));
      var tmp = order[i]; order[i] = order[j]; order[j] = tmp;
    }

    var blobs = [];
    for (i = 0; i < count; i++) {
      var cell = order[i];
      var cx = (cell % cols + 0.5) / cols;
      var cy = (Math.floor(cell / cols) + 0.5) / rows;
      var rgb = parseColor(palette[i % palette.length]);
      blobs.push({
        rgb: rgb,
        lab: rgbToOklab(rgb),
        // 격자 밖으로 조금 넘치게 흔들어 화면 가장자리까지 색이 닿게 한다.
        x: cx + (rnd() - 0.5) * (1.4 / cols),
        y: cy + (rnd() - 0.5) * (1.4 / rows),
        r: 0.34 + rnd() * 0.42,        // 짧은 변 대비 반지름
        squash: 0.62 + rnd() * 0.95,   // 타원 찌그러짐
        rot: rnd() * Math.PI * 2,
        alpha: 0.42 + rnd() * 0.38,
        // 드리프트: 주파수가 다른 사인 2개 — 궤도가 눈에 띄게 반복되지 않는다.
        ax: (0.02 + rnd() * 0.05),
        ay: (0.02 + rnd() * 0.05),
        f1: (0.03 + rnd() * 0.05) * speed,
        f2: (0.017 + rnd() * 0.031) * speed,
        p1: rnd() * Math.PI * 2,
        p2: rnd() * Math.PI * 2,
        fr: (0.011 + rnd() * 0.023) * speed,  // 반지름 맥동
        pr: rnd() * Math.PI * 2
      });
    }
    return blobs;
  }

  var LERP_KEYS = ['x', 'y', 'r', 'squash', 'rot', 'alpha',
                   'ax', 'ay', 'f1', 'f2', 'p1', 'p2', 'fr', 'pr'];

  function mixBlobs(from, to, t) {
    var out = [];
    for (var i = 0; i < to.length; i++) {
      var a = from[i % from.length], b = to[i], o = {};
      for (var k = 0; k < LERP_KEYS.length; k++) {
        var key = LERP_KEYS[k];
        o[key] = lerp(a[key], b[key], t);
      }
      o.lab = mixOklab(a.lab, b.lab, t);
      o.rgb = oklabToRgb(o.lab);
      out.push(o);
    }
    return out;
  }

  // ---------------------------------------------------------------- 마운트

  function readCssPalette(el) {
    var cs = getComputedStyle(el);

    // --gbg-palette 가 있으면 그것만 쓴다. --gbg-1..8 을 낱개로 덮어쓰는 방식은
    // 덮어쓰지 않은 슬롯이 이 파일의 :root 값으로 남아, 3색만 지정했는데 6색이
    // 깔리는 사고가 난다. 한 변수에 목록으로 주면 그 함정이 없다.
    var list = cs.getPropertyValue('--gbg-palette').trim();
    if (list) {
      // rgb(0, 0, 0) 처럼 색 안에 쉼표가 있을 수 있어 괄호 밖 쉼표로만 자른다.
      var parts = list.match(/(?:[^,(]|\([^)]*\))+/g) || [];
      var picked = [];
      for (var k = 0; k < parts.length; k++) {
        var c = parts[k].trim();
        if (c) picked.push(c);
      }
      if (picked.length) return picked;
    }

    var colors = [];
    for (var i = 1; i <= 8; i++) {
      var v = cs.getPropertyValue('--gbg-' + i).trim();
      if (v) colors.push(v);
    }
    return colors;
  }

  function mount(userOptions) {
    var opts = {};
    var key;
    for (key in DEFAULTS) if (DEFAULTS.hasOwnProperty(key)) opts[key] = DEFAULTS[key];
    if (userOptions) for (key in userOptions) if (userOptions.hasOwnProperty(key)) opts[key] = userOptions[key];

    var host = opts.target || document.body;
    // 캔버스를 감싸는 레이어를 따로 둔다. 그레인은 이 레이어의 ::after 로 얹는데,
    // canvas 는 대체 요소라 의사 요소를 못 갖고, 그레인을 슬라이드 위에 얹으면
    // 본문을 덮어 버리기 때문이다.
    var layer = document.createElement('div');
    layer.className = 'gradient-bg';
    layer.setAttribute('aria-hidden', 'true');
    var canvas = document.createElement('canvas');
    canvas.className = 'gradient-bg__canvas';
    layer.appendChild(canvas);
    // .reveal-viewport 처럼 position:relative 인 컨테이너 안에서는 absolute 가 안전하다.
    // body 에 직접 붙는 스탠드얼론 사용일 때만 fixed 로 화면에 고정한다.
    if (host === document.body) layer.classList.add('gradient-bg--fixed');
    if (opts.insertBefore && opts.insertBefore.parentNode === host) {
      host.insertBefore(layer, opts.insertBefore);
    } else {
      host.insertBefore(layer, host.firstChild);
    }

    var ctx = canvas.getContext('2d');
    var palette = (opts.palette && opts.palette.length) ? opts.palette.slice() : readCssPalette(host);
    if (!palette.length) palette = ['#c7d2fe', '#a7f3d0', '#fbcfe8', '#fde68a', '#bfdbfe', '#ddd6fe'];
    var baseColor = opts.baseColor ||
      getComputedStyle(host).getPropertyValue('--gbg-base').trim() || '#f7f7f8';
    var washRgb = parseColor(baseColor);

    layer.style.setProperty('--gbg-grain-opacity', String(opts.grain));

    var reduceMotion = false;
    var mq = null;
    if (global.matchMedia) {
      mq = global.matchMedia('(prefers-reduced-motion: reduce)');
      reduceMotion = mq.matches;
    }

    var seed = opts.seed;
    var toBlobs = makeBlobs(seed, palette, opts.count, opts.speed);
    var fromBlobs = toBlobs;
    var mixStart = 0;
    var mixDur = 0;
    var startedAt = (global.performance && performance.now ? performance.now() : Date.now());
    var lastDraw = -1e9;
    var rafId = 0;
    var paused = false;
    var destroyed = false;
    var width = 0, height = 0;

    function resize() {
      var w = host === document.body ? global.innerWidth : host.clientWidth;
      var h = host === document.body ? global.innerHeight : host.clientHeight;
      if (!w || !h) return false;
      // 짧은 변을 buffer 에 맞추고 긴 변은 종횡비를 따라간다.
      var scale = opts.buffer / Math.min(w, h);
      var nw = Math.max(2, Math.round(w * scale));
      var nh = Math.max(2, Math.round(h * scale));
      if (nw === width && nh === height) return false;
      width = canvas.width = nw;
      height = canvas.height = nh;
      return true;
    }

    function draw(now) {
      var t = reduceMotion ? 0 : (now - startedAt) / 1000;
      var blobs = toBlobs;
      if (mixDur > 0) {
        var m = (now - mixStart) / mixDur;
        if (m >= 1) { mixDur = 0; fromBlobs = toBlobs; }
        else blobs = mixBlobs(fromBlobs, toBlobs, easeInOutCubic(m));
      }

      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = baseColor;
      ctx.fillRect(0, 0, width, height);
      ctx.globalCompositeOperation = opts.blend;

      var unit = Math.min(width, height);
      for (var i = 0; i < blobs.length; i++) {
        var b = blobs[i];
        var x = (b.x + b.ax * Math.sin(b.f1 * t + b.p1) + b.ax * 0.5 * Math.sin(b.f2 * t + b.p2)) * width;
        var y = (b.y + b.ay * Math.sin(b.f2 * t + b.p2) + b.ay * 0.5 * Math.cos(b.f1 * t + b.p1)) * height;
        var r = b.r * unit * (1 + 0.12 * Math.sin(b.fr * t + b.pr));
        var c = b.rgb;
        var head = 'rgba(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ',';
        var alpha = b.alpha * opts.intensity;

        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(b.rot);
        ctx.scale(1, b.squash);
        var g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
        g.addColorStop(0, head + alpha.toFixed(3) + ')');
        g.addColorStop(0.45, head + (alpha * 0.55).toFixed(3) + ')');
        // 바깥 stop 은 반드시 같은 RGB 의 알파 0 이어야 한다. 'transparent' 는
        // rgba(0,0,0,0) 이라 캔버스가 검은색 쪽으로 보간해 회색 후광이 생긴다.
        g.addColorStop(1, head + '0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      drawWash();
    }

    // 바닥색 베일. 흰색을 박지 않고 baseColor 를 쓰므로 어두운 팔레트에서도
    // '바탕색 쪽으로 물러나는' 동작이 그대로 성립한다.
    // 중앙이 진하고 가장자리로 갈수록 옅어진다 — 텍스트가 앉는 가운데를 가장 많이
    // 진정시키면서 화면 테두리의 색기는 남긴다.
    function drawWash() {
      if (!(opts.wash > 0)) return;
      // blend 가 'lighter' 면 베일이 가산 합성돼 오히려 타 버린다. 반드시 되돌린다.
      ctx.globalCompositeOperation = 'source-over';
      var wc = washRgb;
      var head = 'rgba(' + wc[0] + ',' + wc[1] + ',' + wc[2] + ',';
      var g = ctx.createRadialGradient(
        width / 2, height / 2, 0,
        width / 2, height / 2, Math.max(width, height) * 0.72);
      g.addColorStop(0, head + opts.wash.toFixed(3) + ')');
      g.addColorStop(1, head + (opts.wash * 0.45).toFixed(3) + ')');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, width, height);
    }

    function frame() {
      rafId = 0;
      if (destroyed) return;
      var now = global.performance && performance.now ? performance.now() : Date.now();
      resize();
      if (now - lastDraw >= 1000 / opts.fps - 1) {
        lastDraw = now;
        draw(now);
      }
      // 정지 조건이면 루프를 돌리지 않는다. 프레임 1장만 남기고 멈춘다.
      if (!paused && (!reduceMotion || mixDur > 0)) rafId = global.requestAnimationFrame(frame);
    }

    function kick() {
      if (destroyed || paused) return;
      if (!rafId) rafId = global.requestAnimationFrame(frame);
    }

    function renderOnce() {
      if (destroyed) return;
      var now = global.performance && performance.now ? performance.now() : Date.now();
      resize();
      draw(now);
    }

    function onResize() {
      if (resize()) renderOnce();
      kick();
    }

    function onVisibility() {
      if (document.hidden) { api.pause(); } else { api.resume(); }
    }

    function onMotionChange() {
      reduceMotion = mq.matches;
      if (reduceMotion) renderOnce(); else kick();
    }

    var ro = null;
    if (global.ResizeObserver && host !== document.body) {
      ro = new ResizeObserver(onResize);
      ro.observe(host);
    }
    global.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', onVisibility);
    if (mq) {
      if (mq.addEventListener) mq.addEventListener('change', onMotionChange);
      else if (mq.addListener) mq.addListener(onMotionChange);
    }

    var api = {
      element: layer,
      canvas: canvas,
      options: opts,

      // 새 시드로 구성을 갈아끼운다. instant 가 아니면 transitionMs 동안 보간한다.
      reseed: function (nextSeed, config) {
        if (destroyed) return api;
        var instant = (config && config.instant) || reduceMotion || opts.transitionMs <= 0;
        var next = makeBlobs(nextSeed >>> 0, palette, opts.count, opts.speed);
        if (instant) {
          fromBlobs = toBlobs = next;
          mixDur = 0;
          renderOnce();
        } else {
          var now = global.performance && performance.now ? performance.now() : Date.now();
          // 전환 도중에 또 넘기면 지금 화면에 보이는 상태를 새 출발점으로 삼는다.
          if (mixDur > 0) {
            var m = Math.min(1, (now - mixStart) / mixDur);
            fromBlobs = mixBlobs(fromBlobs, toBlobs, easeInOutCubic(m));
          } else {
            fromBlobs = toBlobs;
          }
          toBlobs = next;
          mixStart = now;
          mixDur = opts.transitionMs;
          kick();
        }
        seed = nextSeed;
        return api;
      },

      setPalette: function (colors, config) {
        if (!colors || !colors.length) return api;
        palette = colors.slice();
        return api.reseed(seed, config);
      },

      setBaseColor: function (color) {
        baseColor = color;
        washRgb = parseColor(color);
        renderOnce();
        return api;
      },

      pause: function () {
        paused = true;
        if (rafId) { global.cancelAnimationFrame(rafId); rafId = 0; }
        return api;
      },

      resume: function () {
        if (destroyed) return api;
        paused = false;
        kick();
        return api;
      },

      destroy: function () {
        destroyed = true;
        if (rafId) global.cancelAnimationFrame(rafId);
        if (ro) ro.disconnect();
        global.removeEventListener('resize', onResize);
        document.removeEventListener('visibilitychange', onVisibility);
        if (mq) {
          if (mq.removeEventListener) mq.removeEventListener('change', onMotionChange);
          else if (mq.removeListener) mq.removeListener(onMotionChange);
        }
        if (layer.parentNode) layer.parentNode.removeChild(layer);
      }
    };

    renderOnce();
    kick();
    return api;
  }

  // ---------------------------------------------------------------- reveal 플러그인

  function slideSeed(deck) {
    var idx = deck.getIndices();
    // 인덱스에서 시드를 뽑으므로 뒤로 돌아오거나 링크로 바로 진입해도 같은 배경이 뜬다.
    return hashInts(idx.h || 0, idx.v || 0);
  }

  var revealPlugin = {
    id: 'gradient-background',
    init: function (deck) {
      var cfg = (deck.getConfig && deck.getConfig().gradientBackground) || {};
      var revealEl = deck.getRevealElement();
      var host = revealEl.parentNode || document.body;

      var options = { target: host, insertBefore: revealEl };
      for (var k in cfg) if (cfg.hasOwnProperty(k)) options[k] = cfg[k];

      var bg = mount(options);
      revealPlugin.background = bg;

      if (bg.options.reseedOnSlide) {
        bg.reseed(slideSeed(deck), { instant: true });
        deck.on('slidechanged', function () { bg.reseed(slideSeed(deck)); });
        // 인쇄 레이아웃이나 해시 점프로 인덱스가 바뀌는 경우까지 덮는다.
        deck.on('ready', function () { bg.reseed(slideSeed(deck), { instant: true }); });
      }
      deck.on('paused', function () { bg.pause(); });
      deck.on('resumed', function () { bg.resume(); });

      return bg;
    },
    destroy: function () {
      if (revealPlugin.background) revealPlugin.background.destroy();
    }
  };

  global.GradientBackground = {
    mount: mount,
    revealPlugin: revealPlugin,
    // 색 유틸은 팔레트를 직접 만들어 쓰는 쪽에서 재사용할 수 있게 열어 둔다.
    utils: { parseColor: parseColor, rgbToOklab: rgbToOklab, oklabToRgb: oklabToRgb, mixOklab: mixOklab }
  };
  global.RevealGradientBackground = revealPlugin;
})(window);
