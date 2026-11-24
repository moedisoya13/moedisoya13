/* Draws splats the way ink-studio's own renderer does, on the graphics card: every splat is a small 3D gaussian, carried by its
   bone, flattened onto a low-resolution grid of art pixels as a hard-edged ellipse, nearest first by depth. Colours are palette
   entries and nothing is blended, so the picture stays inside the palette with no resolve pass. A second pass enlarges the
   grid by a whole number, fills the dark of the hall round the ring and inks a one-pixel line round the boxers.
   The camera looks down at the ring from any side: { target, yaw, pitch, dist }. WebGL 2 only. */
const FOV = (38 * Math.PI) / 180; // ink-studio's own, so a splat is the size on screen it was sculpted to be
const MAX_BONES = 24;
const MAX_PALETTE = 48;
const NO_RINGS = new Float32Array(8);

const SPLAT_VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 a_corner;
layout(location=1) in vec3 a_pos;
layout(location=2) in vec3 a_covA;  // c00 c01 c02
layout(location=3) in vec3 a_covB;  // c11 c12 c22
layout(location=4) in vec3 a_misc;  // palette index, bone (in a layer with no bones: 1 marks a speck of light, and a number below 0 pulls it that many metres toward the eye), density
uniform vec4 u_bones[${MAX_BONES * 3}]; // per bone three rows: a 3x3 by rows, the move in w
uniform mat4 u_view;
uniform vec2 u_art;    // the art grid, in pixels
uniform float u_focal; // pixels
uniform vec2 u_shake;  // pixels
uniform vec2 u_depth;  // near, far
uniform vec4 u_wave;   // a ripple through what was struck: where it began (world), and how far out its front is now
uniform float u_mask;
uniform vec3 u_waveK;  // its width (metres), its strength (0 is no ripple; by the damage, render/blow.mjs), and how far it sways what it passes (metres)
uniform vec4 u_ground; // a ring through the canvas: where it began (world x, z), how far out its front is, and its width (metres)
uniform vec2 u_groundK; // how high it lifts what it passes (metres; 0 is no ring), and the lift past which a tile is drawn a step lighter (0: never)
uniform vec4 u_rings[2]; // the other kind of ring (render/blow.mjs FX.ground.kind 'shake'), two at once, his trunk's and his head's: where each began (world x, z), how far out its front is, and its width (metres)
uniform vec3 u_ringsK;   // how many art pixels each moves what it passes, at its crest (0: none), and 1 for a dark line at their crests
out vec2 v_d;
out vec3 v_conic;
flat out float v_pal;
flat out float v_al;
flat out float v_light;
flat out vec3 v_floor; // (the rings' dark line: where on the canvas this splat lies, world x and z, and 1 if the line may darken it)
flat out vec4 v_jac;   // (and the canvas round it: the metres along it, x and z, that an art pixel across and one up the picture go)
/* The other kind of ring through the canvas (u_rings): no light and no lift, only the picture of the canvas shaken as the
   ring's front passes, the way water shakes a reflection. A splat lying on the canvas is moved in the picture's own plane
   along the line from where the ring began out through it: outward at the crest, back at the trough behind it and out
   again at the smaller crest trailing (the light ring's train of waves, measured flat along the canvas). It is so many art
   pixels however far the camera is, but never so many that the canvas is stretched between a trough and a crest by more
   than 0.7 of its own length (the game's canvas is a splat every 10 cm, each 17 cm across: so no gap opens in it), and
   less within half the ring's width of where it began, where the line out has no way to go. -> art pixels, across and up
   the picture (before they are made whole) */
vec2 shaken(vec4 ring, float most, vec3 world, vec3 c) {
  vec2 r = world.xz - ring.xy;
  float d = length(r), x = d - ring.z, w = ring.w;
  float env = x > 0.0 ? exp(-(x * x) / (0.09 * w * w)) : exp(-(x * x) / (w * w));
  // (a step of 5 cm out along the canvas from here, as the picture has it: the way out, and how many art pixels a metre)
  vec3 c1 = (u_view * vec4(world + vec3(r.x, 0.0, r.y) * (0.05 / max(d, 1e-4)), 1.0)).xyz;
  vec2 way = (c1.xy / -c1.z - c.xy / -c.z) * u_focal / 0.05;
  float k = length(way);
  if (k < 1e-4) return vec2(0.0);
  float push = min(most, 0.7 * 1.4 * w * k / 6.2832);
  return way / k * push * env * cos(6.2832 * x / (1.4 * w)) * smoothstep(0.0, 0.5 * w, d);
}
void main() {
  v_floor = vec3(0.0);
  v_jac = vec4(0.0);
  int b = int(max(a_misc.y, 0.0) + 0.5) * 3;
  vec4 r0 = u_bones[b], r1 = u_bones[b + 1], r2 = u_bones[b + 2];
  mat3 R = mat3(r0.x, r1.x, r2.x, r0.y, r1.y, r2.y, r0.z, r1.z, r2.z);
  vec3 world = R * a_pos + vec3(r0.w, r1.w, r2.w);
  float pal = a_misc.x;
  /* The ring through the canvas, where a knocked-down man comes down on it: no light, only the canvas lifted and let down as
     a ring of waves goes out over it from that point, measured flat along the canvas (a crest at its front, steep ahead of
     it, and a trough and a smaller crest trailing behind). Only what lies on the canvas moves: a post, a rope or a man
     standing on it does not. Where a tile of the canvas (its ramp, 22 to 25) is lifted past the glow, it is drawn a step
     lighter, never more. */
  if (u_groundK.x > 0.0) {
    float x = length(world.xz - u_ground.xy) - u_ground.z, w = u_ground.w;
    float env = x > 0.0 ? exp(-(x * x) / (0.09 * w * w)) : exp(-(x * x) / (w * w));
    float h = u_groundK.x * env * cos(6.2832 * x / (1.4 * w)) * (1.0 - smoothstep(0.03, 0.12, abs(world.y)));
    world.y += h;
    if (u_groundK.y > 0.0 && h > u_groundK.y && pal > 21.5 && pal < 24.5) pal += 1.0;
  }
  mat3 S = mat3(a_covA.x, a_covA.y, a_covA.z, a_covA.y, a_covB.x, a_covB.y, a_covA.z, a_covB.y, a_covB.z);
  mat3 M = mat3(u_view) * R;
  mat3 C = M * S * transpose(M);
  vec3 c = (u_view * vec4(world, 1.0)).xyz;
  /* The ripple: no light, only the picture of him swaying as it passes, the way a reflection does on water a stone has
     gone into. It is worked in the picture's own plane, so everything on one line of sight moves as one: the rows of
     him are carried to one side and the other as a short train of waves goes out from the height the blow landed at
     (mostly up and down him: a little rounded, as a ring would be), steep ahead of its front and trailing off behind.
     The waves are long for how far they carry (a wave 3.2 widths long), so that neighbouring rows are never sheared
     apart far enough to show what is under his skin. Only a few centimetres round the place the blow landed are left
     alone (2 to 10 cm), so that a blow to the head ripples the head too. */
  if (u_waveK.y > 0.0) {
    vec2 from = c.xy - (u_view * vec4(u_wave.xyz, 1.0)).xy;
    float d = length(vec2(from.x * 0.35, from.y)), x = d - u_wave.w, w = u_waveK.x;
    float env = x > 0.0 ? exp(-(x * x) / (w * w)) : exp(-(x * x) / (6.25 * w * w));
    c.x += u_waveK.z * u_waveK.y * env * sin(6.2832 * x / (3.2 * w)) * smoothstep(0.02, 0.10, length(from));
  }
  /* (the other kind of ring: only the canvas's own colours, 22 to 25, lying on it, moved by whole art pixels, the two rings
     together never further than the larger moves; nothing standing on the canvas, a post's foot or a man, moves. No colour
     is changed here: the dark line is drawn a pixel at a time, SPLAT_FS crest) */
  vec2 moved = vec2(0.0);
  if (u_ringsK.x + u_ringsK.y > 0.0 && pal > 21.5 && pal < 25.5) {
    float low = 1.0 - smoothstep(0.03, 0.12, abs(world.y));
    moved = (shaken(u_rings[0], u_ringsK.x, world, c) + shaken(u_rings[1], u_ringsK.y, world, c)) * low;
    moved = floor(moved * min(1.0, max(u_ringsK.x, u_ringsK.y) / max(length(moved), 1e-6)) + 0.5);
    // (for the dark line, worked out a pixel at a time: the canvas round this splat, as flat as it lies, seen in the picture)
    if (u_ringsK.z > 0.5 && low > 0.5) {
      vec3 ax = (u_view * vec4(world + vec3(0.01, 0.0, 0.0), 1.0)).xyz, az = (u_view * vec4(world + vec3(0.0, 0.0, 0.01), 1.0)).xyz;
      vec2 at = c.xy / -c.z;
      mat2 J = inverse(mat2((ax.xy / -ax.z - at) * u_focal / 0.01, (az.xy / -az.z - at) * u_focal / 0.01));
      v_floor = vec3(world.xz, 1.0);
      v_jac = vec4(J[0], J[1]);
    }
  }
  float dist = -c.z;
  if (dist < u_depth.x) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  /* (a loose splat may be taken as a little nearer the eye than it is, for deciding what is nearest only: the parts of one
     glob, so that its head is drawn over its body and its body over its tail from any side; render/fx.mjs) */
  float pull = max(-a_misc.y, 0.0);
  float iz = 1.0 / dist;
  vec3 ja = vec3(u_focal * iz, 0.0, u_focal * c.x * iz * iz);
  vec3 jb = vec3(0.0, u_focal * iz, u_focal * c.y * iz * iz);
  float A = dot(ja, C * ja) + 0.15, B = dot(ja, C * jb), D = dot(jb, C * jb) + 0.15;
  float det = A * D - B * B;
  if (det <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  v_conic = vec3(D, -B, A) / det;
  v_al = a_misc.z;
  v_light = u_mask < 0.9 && a_misc.y > 0.5 ? 1.0 : 0.0;
  v_pal = pal;
  // the ellipse ends where density * exp(-m2 / 2) falls to a half
  float m2 = 2.0 * log(max(a_misc.z, 0.51) * 2.0);
  vec2 extent = sqrt(m2 * vec2(A, D)) + 1.0;
  v_d = a_corner * extent;
  vec2 centre = c.xy * u_focal * iz + u_art * 0.5 + u_shake + moved;
  gl_Position = vec4((centre + v_d) / u_art * 2.0 - 1.0, (max(dist - pull, u_depth.x) - u_depth.x) / (u_depth.y - u_depth.x) * 2.0 - 1.0, 1.0);
}`;
const SPLAT_FS = `#version 300 es
precision highp float;
in vec2 v_d;
in vec3 v_conic;
flat in float v_pal;
flat in float v_al;
flat in float v_light;
flat in vec3 v_floor;
flat in vec4 v_jac;
uniform vec3 u_palette[${MAX_PALETTE}];
uniform float u_mask;  // what kind of thing this is, kept in alpha for the second pass
uniform vec4 u_rings[2];
uniform vec3 u_ringsK;
out vec4 o;
/* The rings' dark line (u_ringsK.z): the canvas a step darker on one art pixel along each ring's front, where the point of
   the canvas this pixel shows (as it was before the ring moved it) is within half a pixel of it; thinned through a 4x4
   dither as the ring's push falls below a pixel, and gone with it. */
float crest(vec4 ring, float push, vec2 p, mat2 J) {
  vec2 r = p - ring.xy;
  float d = length(r);
  if (push <= 0.0 || d < 1e-4) return 0.0;
  int i = int(gl_FragCoord.x) & 3, j = int(gl_FragCoord.y) & 3;
  int m[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
  return abs(d - ring.z) < 0.5 * length(transpose(J) * (r / d)) && (float(m[j * 4 + i]) + 0.5) / 16.0 < push ? 1.0 : 0.0;
}
void main() {
  float pw = -0.5 * (v_conic.x * v_d.x * v_d.x + v_conic.z * v_d.y * v_d.y) - v_conic.y * v_d.x * v_d.y;
  if (v_al * exp(pw) < 0.5) discard;
  float pal = v_pal;
  if (v_floor.z > 0.5 && pal > 22.5) {
    mat2 J = mat2(v_jac.xy, v_jac.zw);
    vec2 p = v_floor.xy + J * v_d;
    pal -= max(crest(u_rings[0], u_ringsK.x, p, J), crest(u_rings[1], u_ringsK.y, p, J));
  }
  // (a speck of light keeps its own mark, 0.7: the second pass must not ink it where it crosses in front of a boxer)
  o = vec4(u_palette[int(pal + 0.5)], v_light > 0.5 ? 0.7 : u_mask);
}`;
const POST_VS = `#version 300 es
void main() { gl_Position = vec4(vec2(gl_VertexID == 1 ? 3.0 : -1.0, gl_VertexID == 2 ? 3.0 : -1.0), 0.0, 1.0); }`;
const POST_FS = `#version 300 es
precision highp float;
uniform sampler2D u_tex;
uniform ivec2 u_art;
uniform float u_scale;
uniform vec2 u_origin;
uniform float u_white; // a flash over everything (a parry's: a blow that lands has none, render/blow.mjs)
uniform float u_dim;   // 0..1 toward the ink colour
uniform vec3 u_hall[4]; // the dark beyond the ropes, from under the lamp outward
uniform vec3 u_ink;
out vec4 o;
float bayer(ivec2 p) {
  int x = p.x & 3, y = p.y & 3;
  int m[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
  return (float(m[y * 4 + x]) + 0.5) / 16.0;
}
// where nothing was drawn: the hall, a little less dark under the lamp, stepped through a dither
vec3 hall(ivec2 p) {
  vec2 q = (vec2(p) + 0.5) / vec2(u_art) - vec2(0.5, 0.56);
  q.x *= float(u_art.x) / float(u_art.y);
  float f = clamp(length(q) * 1.9, 0.0, 0.999) * 3.0;
  return u_hall[clamp(int(f + (bayer(p) - 0.5) * 0.9), 0, 3)];
}
float maskAt(ivec2 p) { return texelFetch(u_tex, clamp(p, ivec2(0), u_art - 1), 0).a; }
void main() {
  ivec2 p = ivec2(floor((gl_FragCoord.xy - u_origin) / u_scale));
  if (p.x < 0 || p.y < 0 || p.x >= u_art.x || p.y >= u_art.y) { o = vec4(u_ink, 1.0); return; }
  vec4 c = texelFetch(u_tex, p, 0);
  vec3 col = c.a < 0.2 ? hall(p) : c.rgb;
  if (c.a < 0.9 && abs(c.a - 0.7) > 0.04) {
    float near = max(max(maskAt(p + ivec2(1, 0)), maskAt(p - ivec2(1, 0))), max(maskAt(p + ivec2(0, 1)), maskAt(p - ivec2(0, 1))));
    if (near > 0.9) col = u_ink;
  }
  col = mix(col, u_ink, u_dim);
  o = vec4(mix(col, vec3(1.0), u_white), 1.0);
}`;

function program(gl, vs, fs) {
  const p = gl.createProgram();
  for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('Shader: ' + gl.getShaderInfoLog(s));
    gl.attachShader(p, s);
  }
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('Program: ' + gl.getProgramInfoLog(p));
  const uniforms = {};
  for (let i = 0; i < gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); i++) {
    const name = gl.getActiveUniform(p, i).name.replace(/\[0\]$/, '');
    uniforms[name] = gl.getUniformLocation(p, name);
  }
  return { p, u: uniforms };
}
/* The camera's view, as the shader takes it (a 4x4 by columns): { target, yaw, pitch, dist } -> out */
export function viewOf(cam, out) {
  const cp = Math.cos(cam.pitch),
    sp = Math.sin(cam.pitch),
    cy = Math.cos(cam.yaw),
    sy = Math.sin(cam.yaw),
    // the camera's own axes in the world: x to its right, y up the picture, z back toward the eye
    X = [cy, 0, -sy],
    Z = [cp * sy, sp, cp * cy],
    Y = [Z[1] * X[2] - Z[2] * X[1], Z[2] * X[0] - Z[0] * X[2], Z[0] * X[1] - Z[1] * X[0]],
    e = [cam.target[0] + Z[0] * cam.dist, cam.target[1] + Z[1] * cam.dist, cam.target[2] + Z[2] * cam.dist],
    dot = a => -(a[0] * e[0] + a[1] * e[1] + a[2] * e[2]);
  out = out || new Float32Array(16);
  out.set([X[0], Y[0], Z[0], 0, X[1], Y[1], Z[1], 0, X[2], Y[2], Z[2], 0, dot(X), dot(Y), dot(Z), 1]);
  return out;
}
/* What the ring of shaken pixels does to one splat (the shader's own reckoning, for checking it): a layer's ground row of
   that kind (render/blow.mjs groundRow), a splat's middle p (world) and its palette entry, seen by cam in a picture `rows`
   art pixels high -> the whole art pixels it is moved by in the picture, [across, up] (raw: as it is before it is made
   whole) */
export function shakeOf(row, p, pal, cam, rows, raw) {
  if (!row || row.length <= 7 || !(row[7] + row[11] > 0) || pal < 21.5 || pal > 25.5) return [0, 0];
  const V = viewOf(cam),
    focal = rows / 2 / Math.tan(FOV / 2),
    see = q => [0, 1, 2].map(i => V[i] * q[0] + V[4 + i] * q[1] + V[8 + i] * q[2] + V[12 + i]),
    c = see(p),
    smooth = (a, b, x) => ((x = Math.max(0, Math.min(1, (x - a) / (b - a)))), x * x * (3 - 2 * x)),
    out = [0, 0];
  for (const [rx, rz, front, w, most] of [[row[0], row[2], row[3], row[4], row[7]], [row[8], row[9], row[10], row[4], row[11]]]) {
    const r = [p[0] - rx, p[2] - rz],
      d = Math.hypot(r[0], r[1]),
      x = d - front,
      env = x > 0 ? Math.exp(-(x * x) / (0.09 * w * w)) : Math.exp(-(x * x) / (w * w)),
      s = 0.05 / Math.max(d, 1e-4),
      c1 = see([p[0] + r[0] * s, p[1], p[2] + r[1] * s]),
      way = [0, 1].map(i => ((c1[i] / -c1[2] - c[i] / -c[2]) * focal) / 0.05),
      k = Math.hypot(way[0], way[1]);
    if (k < 1e-4) continue;
    const push = Math.min(most, (0.7 * 1.4 * w * k) / 6.2832),
      f = push * env * Math.cos((6.2832 * x) / (1.4 * w)) * smooth(0, 0.5 * w, d);
    out[0] += (way[0] / k) * f;
    out[1] += (way[1] / k) * f;
  }
  const low = 1 - smooth(0.03, 0.12, Math.abs(p[1])),
    top = Math.max(row[7], row[11]),
    scale = low * Math.min(1, top / Math.max(Math.hypot(out[0] * low, out[1] * low), 1e-6));
  return out.map(v => (raw ? v * scale : Math.floor(v * scale + 0.5)));
}
export const rgb = hex => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
export function paletteArray(palette) {
  const out = new Float32Array(MAX_PALETTE * 3);
  palette.forEach((hex, i) => out.set(rgb(hex), i * 3));
  return out;
}

export function createRenderer(canvas, o) {
  o = o || {};
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'high-performance' });
  if (!gl) throw new Error('This browser has no WebGL 2');
  const splat = program(gl, SPLAT_VS, SPLAT_FS),
    post = program(gl, POST_VS, POST_FS);
  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

  // a set of splats on the card: twelve floats each (see tools/bake.mjs; a loose splat's are render/fx.mjs's write)
  function mesh(data, count, dynamic) {
    const vao = gl.createVertexArray(),
      buffer = gl.createBuffer();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, dynamic ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW);
    for (let i = 0; i < 4; i++) {
      gl.enableVertexAttribArray(1 + i);
      gl.vertexAttribPointer(1 + i, 3, gl.FLOAT, false, 48, i * 12);
      gl.vertexAttribDivisor(1 + i, 1);
    }
    gl.bindVertexArray(null);
    return {
      vao,
      buffer,
      count,
      update(rows, n) {
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, rows, 0, n * 12);
        this.count = n;
      }
    };
  }

  // (the depth buffer carries a stencil too: a layer may keep its silhouette there for another layer to stay out of)
  const target = { fbo: gl.createFramebuffer(), colour: gl.createTexture(), depth: gl.createRenderbuffer(), w: 0, h: 0, scale: 1 };
  const still = new Float32Array(MAX_BONES * 12);
  for (let b = 0; b < MAX_BONES; b++) (still[b * 12] = 1), (still[b * 12 + 5] = 1), (still[b * 12 + 10] = 1);
  const view = new Float32Array(16);

  /* Fit the art grid to the canvas: `rows` art pixels down the screen, give or take, each a whole number of screen pixels. */
  function resize(rows) {
    const cw = canvas.width,
      ch = canvas.height,
      scale = Math.max(1, Math.round(ch / (rows || 216))),
      w = Math.ceil(cw / scale),
      h = Math.ceil(ch / scale);
    if (w === target.w && h === target.h && scale === target.scale) return target;
    Object.assign(target, { w, h, scale });
    gl.bindTexture(gl.TEXTURE_2D, target.colour);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindRenderbuffer(gl.RENDERBUFFER, target.depth);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH24_STENCIL8, w, h);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, target.colour, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_STENCIL_ATTACHMENT, gl.RENDERBUFFER, target.depth);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return target;
  }

  /* A picture is one or more cells: begin(), then cell(rect, frame) for each, then end(post).
       rect:  { x, y, w, h } in art pixels from the bottom left of the grid, or none for the whole grid
       frame: { camera: { target, yaw, pitch, dist }, shake: [x, y] art pixels,
                layers: [{ mesh, bones (vec4 rows, or none for things that stand still), palette (paletteArray), mask,
                           wave: [x, y, z, front, width, strength, sway] (a ripple through it, from a point in the world: it sways, with no light),
                           ground: [x, y, z, front, width, lift, glow] (the other kind of ripple, through the canvas: a ring measured flat
                             along it, lifting what lies on it by up to `lift` metres, a tile of the canvas lifted past `glow` a step
                             lighter; render/blow.mjs groundRow); or, for the ring of shaken pixels (FX.ground.kind 'shake'), two
                             rings at once: [x, y, z, front, width, 0, 0, push, x, z, front, push, line], the first ring's then
                             the second's, push the art pixels it moves what lies on the canvas at its crest (0: none), line 1 for
                             a dark line one art pixel wide at their crests (its first seven are a ring of the first kind that
                             lifts nothing),
                           silhouette: k, 1 to 8 (every pixel of the cell this layer covers is kept as silhouette k, whether or not
                             something nearer hides it there: its whole outline in the picture, not only what shows of it),
                           outside: k (this layer is drawn only off silhouette k, in front of it or behind it alike; elsewhere depth
                             decides as for anything else. Such a layer is drawn after the cell's others, wherever it is in the
                             list, so that the silhouette is all there when it comes: what a blow throws off a man, which must
                             never be seen over him) }] }
       post:  { white, dim, hall: [4 colours], ink }
     draw(frame) is the three together for a picture of one cell. */
  function begin() {
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
    gl.viewport(0, 0, target.w, target.h);
    gl.disable(gl.SCISSOR_TEST);
    gl.disable(gl.STENCIL_TEST);
    gl.clearColor(0, 0, 0, 0);
    gl.clearDepth(1);
    gl.clearStencil(0);
    gl.stencilMask(0xff);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LESS);
    gl.disable(gl.BLEND);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
    gl.useProgram(splat.p);
    gl.uniform2f(splat.u.u_depth, 0.3, 40);
  }
  function cell(rect, frame) {
    const r = rect || { x: 0, y: 0, w: target.w, h: target.h };
    viewOf(frame.camera, view);
    gl.viewport(r.x, r.y, r.w, r.h);
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(r.x, r.y, r.w, r.h);
    gl.uniformMatrix4fv(splat.u.u_view, false, view);
    gl.uniform2f(splat.u.u_art, r.w, r.h);
    gl.uniform1f(splat.u.u_focal, r.h / 2 / Math.tan(FOV / 2));
    gl.uniform2f(splat.u.u_shake, Math.round(frame.shake ? frame.shake[0] : 0), Math.round(frame.shake ? frame.shake[1] : 0));
    const layers = frame.layers.filter(l => !l.outside).concat(frame.layers.filter(l => l.outside));
    if (layers.some(l => l.silhouette || l.outside)) (gl.stencilMask(0xff), gl.clear(gl.STENCIL_BUFFER_BIT)); // (this cell's, under the scissor)
    let drawn = 0;
    for (const layer of layers) {
      if (!layer.mesh.count) continue;
      const keep = layer.silhouette ? 1 << (layer.silhouette - 1) : 0,
        off = layer.outside ? 1 << (layer.outside - 1) : 0;
      if (keep || off) {
        gl.enable(gl.STENCIL_TEST);
        // (a silhouette is kept whether or not the depth test lets the fragment through: a man behind something is still there)
        gl.stencilFunc(off ? gl.EQUAL : gl.ALWAYS, keep, off);
        gl.stencilOp(gl.KEEP, keep ? gl.REPLACE : gl.KEEP, keep ? gl.REPLACE : gl.KEEP);
        gl.stencilMask(keep);
      } else gl.disable(gl.STENCIL_TEST);
      gl.uniform4fv(splat.u.u_bones, layer.bones || still);
      gl.uniform3fv(splat.u.u_palette, layer.palette);
      gl.uniform1f(splat.u.u_mask, layer.mask === undefined ? 0.5 : layer.mask);
      const wv = layer.wave;
      gl.uniform4f(splat.u.u_wave, wv ? wv[0] : 0, wv ? wv[1] : 0, wv ? wv[2] : 0, wv ? wv[3] : 0);
      gl.uniform3f(splat.u.u_waveK, wv ? wv[4] : 1, wv ? wv[5] : 0, wv ? wv[6] : 0);
      const gr = layer.ground;
      gl.uniform4f(splat.u.u_ground, gr ? gr[0] : 0, gr ? gr[2] : 0, gr ? gr[3] : 0, gr ? gr[4] : 1);
      gl.uniform2f(splat.u.u_groundK, gr ? gr[5] : 0, gr ? gr[6] : 0);
      const two = gr && gr.length > 7;
      gl.uniform4fv(splat.u.u_rings, two ? [gr[0], gr[2], gr[3], gr[4], gr[8], gr[9], gr[10], gr[4]] : NO_RINGS);
      gl.uniform3f(splat.u.u_ringsK, two ? gr[7] : 0, two ? gr[11] : 0, two ? gr[12] || 0 : 0);
      gl.bindVertexArray(layer.mesh.vao);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, layer.mesh.count);
      drawn += layer.mesh.count;
    }
    gl.disable(gl.STENCIL_TEST);
    return drawn;
  }
  function end(frame) {
    const { w, h, scale } = target;
    gl.disable(gl.SCISSOR_TEST);
    gl.bindVertexArray(null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.disable(gl.DEPTH_TEST);
    gl.useProgram(post.p);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, target.colour);
    gl.uniform1i(post.u.u_tex, 0);
    gl.uniform2i(post.u.u_art, w, h);
    gl.uniform1f(post.u.u_scale, scale);
    // the grid may overhang the canvas by part of an art pixel: share the overhang between both edges
    gl.uniform2f(post.u.u_origin, Math.floor((canvas.width - w * scale) / 2), Math.floor((canvas.height - h * scale) / 2));
    gl.uniform1f(post.u.u_white, frame.white || 0);
    gl.uniform1f(post.u.u_dim, frame.dim || 0);
    gl.uniform3fv(post.u.u_hall, frame.hall);
    gl.uniform3fv(post.u.u_ink, frame.ink);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  function draw(frame) {
    begin();
    const drawn = cell(null, frame);
    end(frame);
    return drawn;
  }

  /* Bone matrices as the pose code makes them (twelve numbers a joint: 3x3 by rows, then the move) laid out as the shader
     reads them, behind bone 0, which never moves. */
  function packBones(mats, out) {
    out = out || new Float32Array(MAX_BONES * 12);
    out[0] = out[5] = out[10] = 1;
    for (let j = 0, n = mats.length / 12; j < n; j++) {
      const s = j * 12,
        d = (j + 1) * 12;
      for (let r = 0; r < 3; r++) {
        out[d + r * 4] = mats[s + r * 3];
        out[d + r * 4 + 1] = mats[s + r * 3 + 1];
        out[d + r * 4 + 2] = mats[s + r * 3 + 2];
        out[d + r * 4 + 3] = mats[s + 9 + r];
      }
    }
    return out;
  }
  const widthAt = dist => dist * 2 * Math.tan(FOV / 2) * (target.w / target.h);
  const distFor = width => width / (2 * Math.tan(FOV / 2) * (target.w / target.h));
  return { gl, mesh, resize, draw, begin, cell, end, packBones, target, widthAt, distFor, maxBones: MAX_BONES };
}
