import * as THREE from 'three';

const KO_STACK =
  'system-ui, -apple-system, "Pretendard", "Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';

/**
 * 외부 폰트 파일을 받을 수 없는 환경이라 3D 안의 한글은 전부
 * canvas 2D로 그린 뒤 CanvasTexture로 올린다.
 */
export function makeCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return { canvas, ctx: canvas.getContext('2d') };
}

export function canvasTexture(canvas, { srgb = true, aniso = 4 } = {}) {
  const tex = new THREE.CanvasTexture(canvas);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = aniso;
  tex.needsUpdate = true;
  return tex;
}

/**
 * 전광판 등에 쓰는 텍스트 패널 텍스처.
 * lines: [{ text, size, color, font, gap }]
 */
export function textPanelTexture({
  width = 1024,
  height = 256,
  background = '#0a0d12',
  lines = [],
  padding = 24,
  align = 'center',
  border = null,
} = {}) {
  const { canvas, ctx } = makeCanvas(width, height);

  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);
  }
  if (border) {
    ctx.strokeStyle = border;
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, width - 4, height - 4);
  }

  const totalHeight = lines.reduce((sum, l) => sum + (l.size || 48) * 1.25 + (l.gap || 0), 0);
  let y = (height - totalHeight) / 2;
  const x = align === 'center' ? width / 2 : padding;

  ctx.textAlign = align;
  ctx.textBaseline = 'top';

  for (const line of lines) {
    const size = line.size || 48;
    ctx.font = `${line.weight || 700} ${size}px ${line.font || KO_STACK}`;
    if (line.glow) {
      ctx.shadowColor = line.glow;
      ctx.shadowBlur = size * 0.55;
    } else {
      ctx.shadowBlur = 0;
    }
    ctx.fillStyle = line.color || '#f2f5f8';
    if (line.letterSpacing && 'letterSpacing' in ctx) {
      ctx.letterSpacing = `${line.letterSpacing}px`;
    }
    ctx.fillText(line.text, x, y);
    y += size * 1.25 + (line.gap || 0);
  }
  ctx.shadowBlur = 0;

  return canvasTexture(canvas);
}

/** 잔디 결(모잉 스트라이프) 텍스처. */
export function grassTexture(size = 512, stripes = 14) {
  const { canvas, ctx } = makeCanvas(size, size);
  const band = size / stripes;
  for (let i = 0; i < stripes; i++) {
    ctx.fillStyle = i % 2 === 0 ? '#3f6a4b' : '#345a3f';
    ctx.fillRect(0, i * band, size, band);
  }
  // 미세한 얼룩으로 평면감을 줄인다
  const img = ctx.getImageData(0, 0, size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 16;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/** 내야 흙 텍스처. */
export function dirtTexture(size = 512) {
  const { canvas, ctx } = makeCanvas(size, size);
  ctx.fillStyle = '#8b6248';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 2600; i++) {
    const r = Math.random() * 3 + 0.5;
    const shade = Math.random();
    ctx.fillStyle = `rgba(${shade > 0.5 ? 168 : 104},${shade > 0.5 ? 124 : 74},${
      shade > 0.5 ? 94 : 56
    },0.5)`;
    ctx.beginPath();
    ctx.arc(Math.random() * size, Math.random() * size, r, 0, Math.PI * 2);
    ctx.fill();
  }
  return canvas;
}

/** 야구공 — 흰 가죽 + 붉은 실밥. */
export function baseballTexture(size = 256) {
  const { canvas, ctx } = makeCanvas(size, size / 2);
  const w = size;
  const h = size / 2;

  ctx.fillStyle = '#f6f4ee';
  ctx.fillRect(0, 0, w, h);

  // 아주 옅은 가죽 얼룩
  for (let i = 0; i < 500; i++) {
    ctx.fillStyle = `rgba(210,204,190,${Math.random() * 0.25})`;
    ctx.beginPath();
    ctx.arc(Math.random() * w, Math.random() * h, Math.random() * 4, 0, Math.PI * 2);
    ctx.fill();
  }

  // 두 줄의 실밥 곡선 + 그 위에 V자 스티치
  const drawSeam = (phase) => {
    ctx.strokeStyle = '#c0392b';
    ctx.lineWidth = h * 0.022;
    ctx.beginPath();
    for (let px = 0; px <= w; px += 2) {
      const t = px / w;
      const py = h / 2 + Math.sin(t * Math.PI * 2 + phase) * h * 0.3;
      px === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.stroke();

    ctx.lineWidth = h * 0.017;
    for (let px = 0; px <= w; px += w / 26) {
      const t = px / w;
      const py = h / 2 + Math.sin(t * Math.PI * 2 + phase) * h * 0.3;
      const slope = Math.cos(t * Math.PI * 2 + phase) * h * 0.3 * ((Math.PI * 2) / w);
      const nx = -slope / Math.hypot(1, slope);
      const ny = 1 / Math.hypot(1, slope);
      const len = h * 0.055;
      ctx.beginPath();
      ctx.moveTo(px - nx * len - 3, py - ny * len);
      ctx.lineTo(px + nx * len - 3, py + ny * len);
      ctx.stroke();
    }
  };
  drawSeam(0);
  drawSeam(Math.PI);

  return canvas;
}

/** 백네트용 격자 알파 텍스처. */
export function netTexture(size = 256, cell = 16) {
  const { canvas, ctx } = makeCanvas(size, size);
  ctx.clearRect(0, 0, size, size);
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 1.4;
  for (let i = 0; i <= size; i += cell) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(size, i);
    ctx.stroke();
  }
  return canvas;
}

/** 부드러운 원형 글로우 — 스프라이트/파티클용. */
export function glowTexture(size = 128, inner = '#ffffff', outer = 'rgba(255,255,255,0)') {
  const { canvas, ctx } = makeCanvas(size, size);
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, inner);
  g.addColorStop(0.28, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return canvas;
}

export { KO_STACK };
