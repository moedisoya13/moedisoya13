/* Draws splats the way ink-studio's own renderer does, on the graphics card: every splat is a small 3D gaussian, carried by its
   bone, flattened onto a low-resolution grid of art pixels as a hard-edged ellipse, nearest first by depth. Colours are palette
   entries and nothing is blended, so the picture stays inside the palette with no resolve pass. A second pass enlarges the
   grid by a whole number, paints the sky where nothing was drawn and inks a one-pixel line round the fighters.
   WebGL 2 only: it is what every current phone browser has. */
const FOV = (38 * Math.PI) / 180; // ink-studio's own, so a splat is the size on screen it was sculpted to be
const MAX_BONES = 28;
const MAX_PALETTE = 48;

const SPLAT_VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 a_corner;
layout(location=1) in vec3 a_pos;
layout(location=2) in vec3 a_covA;  // c00 c01 c02
layout(location=3) in vec3 a_covB;  // c11 c12 c22
layout(location=4) in vec3 a_misc;  // palette index, bone, density
uniform vec4 u_bones[${MAX_BONES * 3}]; // per bone three rows: a 3x3 by rows, the move in w
uniform mat4 u_view;
uniform vec2 u_art;    // the art grid, in pixels
uniform float u_focal; // pixels
uniform vec2 u_shake;  // pixels
uniform vec2 u_depth;  // near, far
out vec2 v_d;
out vec3 v_conic;
flat out float v_pal;
flat out float v_al;
void main() {
  int b = int(a_misc.y + 0.5) * 3;
  vec4 r0 = u_bones[b], r1 = u_bones[b + 1], r2 = u_bones[b + 2];
  mat3 R = mat3(r0.x, r1.x, r2.x, r0.y, r1.y, r2.y, r0.z, r1.z, r2.z);
  vec3 world = R * a_pos + vec3(r0.w, r1.w, r2.w);
  mat3 S = mat3(a_covA.x, a_covA.y, a_covA.z, a_covA.y, a_covB.x, a_covB.y, a_covA.z, a_covB.y, a_covB.z);
  mat3 M = mat3(u_view) * R;
  mat3 C = M * S * transpose(M);
  vec3 c = (u_view * vec4(world, 1.0)).xyz;
  float dist = -c.z;
  if (dist < u_depth.x) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  float iz = 1.0 / dist;
  vec3 ja = vec3(u_focal * iz, 0.0, u_focal * c.x * iz * iz);
  vec3 jb = vec3(0.0, u_focal * iz, u_focal * c.y * iz * iz);
  float A = dot(ja, C * ja) + 0.15, B = dot(ja, C * jb), D = dot(jb, C * jb) + 0.15;
  float det = A * D - B * B;
  if (det <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  v_conic = vec3(D, -B, A) / det;
  v_al = a_misc.z;
  v_pal = a_misc.x;
  // the ellipse ends where density * exp(-m2 / 2) falls to a half
  float m2 = 2.0 * log(max(a_misc.z, 0.51) * 2.0);
  vec2 extent = sqrt(m2 * vec2(A, D)) + 1.0;
  v_d = a_corner * extent;
  vec2 centre = c.xy * u_focal * iz + u_art * 0.5 + u_shake;
  gl_Position = vec4((centre + v_d) / u_art * 2.0 - 1.0, (dist - u_depth.x) / (u_depth.y - u_depth.x) * 2.0 - 1.0, 1.0);
}`;
const SPLAT_FS = `#version 300 es
precision highp float;
in vec2 v_d;
in vec3 v_conic;
flat in float v_pal;
flat in float v_al;
uniform vec3 u_palette[${MAX_PALETTE}];
uniform float u_mask;  // what kind of thing this is, kept in alpha for the second pass
uniform float u_flash; // 0..1 toward white: a struck fighter
out vec4 o;
void main() {
  float pw = -0.5 * (v_conic.x * v_d.x * v_d.x + v_conic.z * v_d.y * v_d.y) - v_conic.y * v_d.x * v_d.y;
  if (v_al * exp(pw) < 0.5) discard;
  o = vec4(mix(u_palette[int(v_pal + 0.5)], vec3(1.0), u_flash), u_mask);
}`;
const POST_VS = `#version 300 es
void main() { gl_Position = vec4(vec2(gl_VertexID == 1 ? 3.0 : -1.0, gl_VertexID == 2 ? 3.0 : -1.0), 0.0, 1.0); }`;
const POST_FS = `#version 300 es
precision highp float;
uniform sampler2D u_tex;
uniform ivec2 u_art;
uniform float u_scale;
uniform vec2 u_origin;
uniform float u_time;
uniform float u_pan;   // how far the camera has moved along the terrace, in art pixels
uniform float u_white; // a flash over everything
uniform float u_dim;   // 0..1 toward the ink colour
uniform vec3 u_sky[6]; // from the horizon up
uniform vec3 u_ink;
out vec4 o;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float bayer(ivec2 p) {
  int x = p.x & 3, y = p.y & 3;
  int m[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
  return (float(m[y * 4 + x]) + 0.5) / 16.0;
}
vec3 sky(ivec2 p) {
  float h = float(u_art.y);
  float v = float(p.y) / h;
  // bands of the palette's night, stepped through a dither so each boundary is a pattern, not a line
  float f = clamp(v * 1.15 - 0.12, 0.0, 0.999) * 5.0;
  int band = int(f + (bayer(p) - 0.5) * 0.9);
  vec3 col = u_sky[clamp(band, 0, 5)];
  vec2 q = vec2(p) + vec2(floor(u_pan * 0.08), 0.0);
  // stars: one art pixel each, a few of them twinkling
  float star = hash(floor(q));
  if (v > 0.45 && star > 0.9965) col = mix(col, vec3(0.86, 0.9, 1.0), 0.55 + 0.45 * sin(u_time * (1.0 + star * 40.0) + star * 90.0));
  // moon: a disc with a darker limb and two dithered seas
  vec2 mc = vec2(float(u_art.x) * 0.72 - floor(u_pan * 0.05), h * 0.8);
  float r = h * 0.085, d = length(vec2(p) + 0.5 - mc);
  if (d < r) {
    vec2 n = (vec2(p) + 0.5 - mc) / r;
    float shade = dot(n, vec2(-0.55, 0.6));
    float sea = step(length(n - vec2(0.25, 0.2)), 0.32) + step(length(n - vec2(-0.3, -0.35)), 0.22);
    col = shade + (bayer(p) - 0.5) * 0.5 < -0.35 || sea > 0.5 ? vec3(0.81, 0.86, 1.0) : vec3(0.96, 0.97, 1.0);
  } else if (d < r * 1.5 && bayer(p) > (d - r) / (r * 0.5)) col = mix(col, vec3(0.5, 0.6, 0.9), 0.22);
  return col;
}
float maskAt(ivec2 p) { return texelFetch(u_tex, clamp(p, ivec2(0), u_art - 1), 0).a; }
void main() {
  ivec2 p = ivec2(floor((gl_FragCoord.xy - u_origin) / u_scale));
  if (p.x < 0 || p.y < 0 || p.x >= u_art.x || p.y >= u_art.y) { o = vec4(u_ink, 1.0); return; }
  vec4 c = texelFetch(u_tex, p, 0);
  // nothing drawn: sky above the wall, and under the terrace's front edge only the dark
  vec3 col = c.a < 0.2 ? (float(p.y) < float(u_art.y) * 0.4 ? u_ink : sky(p)) : c.rgb;
  if (c.a < 0.9) {
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

  // a set of splats on the card: twelve floats each (see tools/bake.mjs)
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
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, target.colour, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, target.depth);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return target;
  }

  /* frame: { camera: { x, y, dist, pitch }, shake: [x, y] art pixels, time, white, dim, sky: [6 colours], ink,
              layers: [{ mesh, bones (vec4 rows, or none for things that stand still), palette (paletteArray), mask, flash }] } */
  function draw(frame) {
    const { w, h, scale } = target,
      cam = frame.camera,
      cp = Math.cos(cam.pitch),
      sp = Math.sin(cam.pitch),
      e = [cam.x, cam.y + cam.dist * sp, cam.dist * cp];
    // world to camera, columns first: the camera looks down its own -Z, from +Z toward the fighting line
    view.set([1, 0, 0, 0, 0, cp, sp, 0, 0, -sp, cp, 0, -e[0], -(cp * e[1] - sp * e[2]), -(sp * e[1] + cp * e[2]), 1]);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 0);
    gl.clearDepth(1);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LESS);
    gl.disable(gl.BLEND);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(splat.p);
    gl.uniformMatrix4fv(splat.u.u_view, false, view);
    gl.uniform2f(splat.u.u_art, w, h);
    gl.uniform1f(splat.u.u_focal, h / 2 / Math.tan(FOV / 2));
    gl.uniform2f(splat.u.u_shake, Math.round(frame.shake ? frame.shake[0] : 0), Math.round(frame.shake ? frame.shake[1] : 0));
    gl.uniform2f(splat.u.u_depth, 0.3, 40);
    let drawn = 0;
    for (const layer of frame.layers) {
      if (!layer.mesh.count) continue;
      gl.uniform4fv(splat.u.u_bones, layer.bones || still);
      gl.uniform3fv(splat.u.u_palette, layer.palette);
      gl.uniform1f(splat.u.u_mask, layer.mask === undefined ? 0.5 : layer.mask);
      gl.uniform1f(splat.u.u_flash, layer.flash || 0);
      gl.bindVertexArray(layer.mesh.vao);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, layer.mesh.count);
      drawn += layer.mesh.count;
    }
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
    gl.uniform1f(post.u.u_time, frame.time || 0);
    gl.uniform1f(post.u.u_pan, (cam.x * (h / 2 / Math.tan(FOV / 2))) / cam.dist);
    gl.uniform1f(post.u.u_white, frame.white || 0);
    gl.uniform1f(post.u.u_dim, frame.dim || 0);
    gl.uniform3fv(post.u.u_sky, frame.sky);
    gl.uniform3fv(post.u.u_ink, frame.ink);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
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
  // metres a whole art pixel covers on the fighting line: the camera is moved in steps of this so the courtyard never crawls
  const pixelSize = dist => (dist * 2 * Math.tan(FOV / 2)) / target.h;
  const widthAt = dist => dist * 2 * Math.tan(FOV / 2) * (target.w / target.h);
  const distFor = width => width / (2 * Math.tan(FOV / 2) * (target.w / target.h));
  return { gl, mesh, resize, draw, packBones, target, pixelSize, widthAt, distFor, maxBones: MAX_BONES };
}
