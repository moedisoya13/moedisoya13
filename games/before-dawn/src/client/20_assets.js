// Sprites decoded from the base64 embedded by build.js. Decoded through Blob +
// createImageBitmap so no URL (and so no request) is ever made. Also prepares a white
// silhouette per sprite (hit flash, outlines) and the sprite's dominant hue (§6.2 border rule).

BD.client = BD.client || {};
const AS = BD.client.assets = { img: {}, white: {}, hue: {}, ready: false };

function b64ToBytes(b64) {
  const bin = atob(b64), out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function rgbToHue(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (d === 0) return { h: 0, s: 0 };
  let h;
  if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s: d / mx };
}
AS.hexHue = function (hex) {
  const n = parseInt(hex.slice(1), 16);
  return rgbToHue((n >> 16) & 255, (n >> 8) & 255, n & 255).h;
};

function prepare(id, bmp) {
  AS.img[id] = bmp;
  const c = document.createElement('canvas');
  c.width = bmp.width; c.height = bmp.height;
  const g = c.getContext('2d');
  g.drawImage(bmp, 0, 0);
  // dominant hue of saturated pixels (8-bin histogram weighted by saturation)
  try {
    const d = g.getImageData(0, 0, c.width, c.height).data;
    const bins = new Float64Array(36);
    for (let i = 0; i < d.length; i += 16) {
      if (d[i + 3] < 200) continue;
      const { h, s } = rgbToHue(d[i], d[i + 1], d[i + 2]);
      if (s < 0.35) continue;
      bins[Math.floor(h / 10) % 36] += s;
    }
    let best = -1, bi = 0;
    for (let i = 0; i < 36; i++) if (bins[i] > best) { best = bins[i]; bi = i; }
    AS.hue[id] = best > 0 ? bi * 10 + 5 : null;
  } catch (err) { AS.hue[id] = null; }
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, c.width, c.height);
  AS.white[id] = c;
}

AS.load = function () {
  const ids = Object.keys(BD.assetData || {});
  return Promise.all(ids.map((id) => {
    const url = BD.assetData[id];
    const b64 = url.slice(url.indexOf(',') + 1);
    const blob = new Blob([b64ToBytes(b64)], { type: 'image/webp' });
    const viaBitmap = typeof createImageBitmap === 'function' ? createImageBitmap(blob) : Promise.reject(new Error('no createImageBitmap'));
    return viaBitmap.catch(() => new Promise((res, rej) => {
      const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = url;
    })).then((bmp) => prepare(id, bmp));
  })).then(() => { AS.ready = true; });
};
