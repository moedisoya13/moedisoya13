import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

/** 비네트 + 필름 그레인 + 미세한 색수차 — 야간 중계 화면 같은 질감. */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uVignette: { value: 1.05 },
    uGrain: { value: 0.03 },
    uAberration: { value: 0.0016 },
    uExposure: { value: 1.0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uVignette;
    uniform float uGrain;
    uniform float uAberration;
    uniform float uExposure;
    varying vec2 vUv;

    float rand(vec2 co) {
      return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main() {
      vec2 c = vUv - 0.5;
      float r2 = dot(c, c);

      // 화면 가장자리로 갈수록 채널을 조금씩 어긋나게 한다
      vec2 dir = c * uAberration * (0.4 + r2 * 2.0);
      vec4 col;
      col.r = texture2D(tDiffuse, vUv + dir).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv - dir).b;
      col.a = 1.0;

      col.rgb *= uExposure;

      // 비네트
      float vig = smoothstep(0.95, 0.18, r2 * uVignette);
      col.rgb *= mix(0.32, 1.0, vig);

      // 필름 그레인 (어두운 부분에 더 많이)
      float g = rand(vUv * vec2(1024.0, 640.0) + fract(uTime) * 91.7) - 0.5;
      float lum = dot(col.rgb, vec3(0.299, 0.587, 0.114));
      col.rgb += g * uGrain * mix(1.4, 0.35, lum);

      gl_FragColor = col;
    }
  `,
};

export function createWorld(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
    stencil: false,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x04060b);
  scene.fog = new THREE.FogExp2(0x070c16, 0.0092);

  const camera = new THREE.PerspectiveCamera(
    38,
    window.innerWidth / window.innerHeight,
    0.08,
    500
  );
  camera.position.set(0, 3, -9);
  camera.lookAt(0, 1.4, 10);

  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  composer.setSize(window.innerWidth, window.innerHeight);

  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  const bloom = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.58, // strength
    0.7, // radius
    0.88 // threshold — 램프와 공 트레일만 번지게 한다
  );
  composer.addPass(bloom);

  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);

  composer.addPass(new OutputPass());

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    composer.setPixelRatio(dpr);
    composer.setSize(w, h);
    bloom.setSize(w, h);
    camera.aspect = w / h;
    // 세로로 긴 화면에서도 피사체가 잘리지 않도록 수직 화각을 보정한다
    camera.updateProjectionMatrix();
  }

  function render(elapsed) {
    grade.uniforms.uTime.value = elapsed;
    composer.render();
  }

  function dispose() {
    composer.dispose();
    renderer.dispose();
  }

  return { renderer, scene, camera, composer, bloom, grade, resize, render, dispose };
}
