/**
 * Making the world feel alive (no camera changes):
 *  - glow (bloom) and colour grading: warm highlights, cool shadows, a soft vignette
 *  - a mood per region (light, sky fill, fog, grading, which particles drift): golden temple, cold green wasteland,
 *    teal marsh, misty monastery, red lair, steel garrison, warm hunting grounds, plain jungle in between
 *  - cloud shadows drifting over everything lit by the sun
 *  - grass clumps and wildflowers around the hero (instanced, swaying), fireflies, golden dust, spirit wisps, embers,
 *    falling leaves or ash, and butterflies
 * Phones get less of everything; `degrade()` sheds the costly parts first when the frame rate drops.
 */
import * as THREE from 'three';
import { LOOK } from './look';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

const NOISE = `
float at_h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float at_noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(at_h21(i), at_h21(i + vec2(1, 0)), f.x), mix(at_h21(i + vec2(0, 1)), at_h21(i + vec2(1, 1)), f.x), f.y); }
`;

// ------------------------------------------------------------------ moods
interface Mood {
  sun: number; sunI: number; sky: number; gnd: number; hemiI: number; fog: number; near: number; far: number;
  tint: [number, number, number]; sat: number; con: number;
  fire: number; mote: number; moteCol: number; wisp: number; wispCol: number; ember: number; leaf: number; ash: number; fly: number;
}
const M = (m: Partial<Mood>): Mood => ({ sun: 0xffecc8, sunI: 2.5, sky: 0xd6e4f2, gnd: 0x4a4232, hemiI: 1.15, fog: 0x8fa0a6, near: 34, far: 92, tint: [1.03, 1.0, 0.95], sat: 1.12, con: 1.05,
  fire: 0.25, mote: 0.15, moteCol: 0xfff0b0, wisp: 0, wispCol: 0x9ad8ff, ember: 0, leaf: 1, ash: 0, fly: 1, ...m });
export const MOODS: Record<string, Mood> = {
  jungle: M({}),
  temple: M({ sun: 0xffd9a0, sunI: 2.7, sky: 0xf0dcc0, gnd: 0x5a4a32, hemiI: 1.1, fog: 0xc0ae8a, near: 36, far: 100, tint: [1.07, 1.0, 0.88], sat: 1.1, con: 1.07, fire: 0.1, mote: 1, moteCol: 0xffd890, leaf: 0.4, fly: 0.5 }),
  waste: M({ sun: 0xa8b8d8, sunI: 1.7, sky: 0x7a8aa8, gnd: 0x262c26, hemiI: 0.95, fog: 0x5f7a72, near: 30, far: 74, tint: [0.88, 0.98, 1.05], sat: 0.72, con: 1.12, fire: 0, mote: 0, wisp: 1, wispCol: 0x7aff9a, leaf: 0.8, ash: 1, fly: 0 }),
  marsh: M({ sun: 0xc8e4e0, sunI: 1.85, sky: 0x98c4c0, gnd: 0x1e3430, hemiI: 1.05, fog: 0x6a9692, near: 30, far: 70, tint: [0.9, 1.02, 1.05], sat: 0.92, con: 1.04, fire: 1, mote: 0, wisp: 0.6, wispCol: 0x9ad8ff, leaf: 0.3, fly: 0.2 }),
  monastery: M({ sun: 0xe6eee0, sunI: 2.0, sky: 0xbcd4cc, gnd: 0x2e3a30, hemiI: 1.1, fog: 0x92b2aa, near: 32, far: 80, tint: [0.96, 1.02, 1.0], sat: 1.0, con: 1.03, fire: 0.6, mote: 0.3, moteCol: 0xe0f0ff, leaf: 0.5, fly: 0.6 }),
  lair: M({ sun: 0xff9468, sunI: 2.2, sky: 0xc87a68, gnd: 0x3a1810, hemiI: 1.0, fog: 0x6e3028, near: 32, far: 78, tint: [1.14, 0.9, 0.84], sat: 1.05, con: 1.12, fire: 0, mote: 0, ember: 1, leaf: 0, ash: 0.6, fly: 0 }),
  garrison: M({ sun: 0xdfe4ee, sunI: 2.2, sky: 0xb8c4d0, gnd: 0x3a3a36, fog: 0x929aa2, near: 32, far: 84, tint: [0.96, 0.98, 1.04], sat: 0.82, con: 1.08, fire: 0.05, mote: 0, leaf: 0.4, ash: 0.25, fly: 0.2 }),
  village: M({ sun: 0xffe2b0, sunI: 2.6, sky: 0xe8dcc4, gnd: 0x4e4630, fog: 0xb0a890, tint: [1.06, 1.0, 0.92], sat: 1.12, con: 1.05, mote: 0.6, moteCol: 0xfff0c0, leaf: 0.8, fly: 1.2, fire: 0.2 }),
  hunting: M({ sun: 0xffd8a0, sunI: 2.6, sky: 0xe0dcc0, gnd: 0x4a4026, fog: 0xa8a88a, tint: [1.06, 1.0, 0.9], sat: 1.15, con: 1.06, leaf: 1.2, fly: 1 }),
};
export interface MoodZone { mood: keyof typeof MOODS; x: number; z: number; core: number; out: number }

/** A mood held as plain numbers so two can be blended. */
class LiveMood {
  sun = new THREE.Color(); sky = new THREE.Color(); gnd = new THREE.Color(); fog = new THREE.Color(); moteCol = new THREE.Color(); wispCol = new THREE.Color();
  n: Record<string, number> = {}; tint = new THREE.Vector3(1, 1, 1);
  static NUM = ['sunI', 'hemiI', 'near', 'far', 'sat', 'con', 'fire', 'mote', 'wisp', 'ember', 'leaf', 'ash', 'fly'] as const;
  set(m: Mood): this { this.sun.setHex(m.sun); this.sky.setHex(m.sky); this.gnd.setHex(m.gnd); this.fog.setHex(m.fog); this.moteCol.setHex(m.moteCol); this.wispCol.setHex(m.wispCol);
    for (const k of LiveMood.NUM) this.n[k] = m[k] as number; this.tint.set(...m.tint); return this; }
  /** this = this * (1 - k) + other * k */
  mix(o: LiveMood, k: number): this {
    this.sun.lerp(o.sun, k); this.sky.lerp(o.sky, k); this.gnd.lerp(o.gnd, k); this.fog.lerp(o.fog, k); this.moteCol.lerp(o.moteCol, k); this.wispCol.lerp(o.wispCol, k);
    for (const key of LiveMood.NUM) this.n[key] += (o.n[key] - this.n[key]) * k; this.tint.lerp(o.tint, k); return this;
  }
}

// ------------------------------------------------------------------ grading pass
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uTint: { value: new THREE.Vector3(1, 1, 1) }, uSat: { value: 1.1 }, uCon: { value: 1.05 }, uVig: { value: 0.28 }, uAspect: { value: 1.6 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform vec3 uTint; uniform float uSat, uCon, uVig, uAspect; varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv); vec3 col = max(c.rgb * uTint, 0.0);
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = max(mix(vec3(l), col, uSat), 0.0);
      col = 0.18 * pow(col / 0.18, vec3(uCon));                                   // contrast round mid grey (linear light)
      col *= mix(vec3(0.93, 1.0, 1.07), vec3(1.05, 1.0, 0.94), smoothstep(0.02, 0.6, l));   // cool shadows, warm light
      vec2 d = (vUv - 0.5) * vec2(uAspect, 1.0); col *= mix(1.0 - uVig, 1.0, smoothstep(1.05, 0.3, length(d)));
      gl_FragColor = vec4(col, c.a);
    }`,
};

// ------------------------------------------------------------------ cloud shadows on every lit material
type CloudU = { t: { value: number }; a: { value: number } };
function cloudify(m: THREE.Material, u: CloudU): void {
  const mm = m as THREE.MeshStandardMaterial;
  if (m.userData.cloud || m.userData.noCloud || !(mm.isMeshStandardMaterial || (m as THREE.MeshLambertMaterial).isMeshLambertMaterial)) return;
  m.userData.cloud = true;
  const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey();
  m.onBeforeCompile = (sh, r) => {
    prev.call(m, sh, r); sh.uniforms.uCloudT = u.t; sh.uniforms.uCloudA = u.a;
    sh.vertexShader = 'varying vec2 vCloudW;\n' + sh.vertexShader.replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
      { vec4 cw = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        cw = instanceMatrix * cw;
      #endif
        vCloudW = (modelMatrix * cw).xz; }`);
    sh.fragmentShader = 'uniform float uCloudT; uniform float uCloudA; varying vec2 vCloudW;\n' + NOISE + sh.fragmentShader.replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
      { vec2 cp = vCloudW * 0.016 + vec2(uCloudT * 0.011, uCloudT * 0.006);
        float cl = at_noise(cp) * 0.65 + at_noise(cp * 2.3 + 5.0) * 0.35;
        float cs = 1.0 - uCloudA * smoothstep(0.5, 0.68, cl);
        reflectedLight.directDiffuse *= cs; reflectedLight.directSpecular *= cs; }`);
  };
  m.customProgramCacheKey = () => prevKey + '|cloud';
  m.needsUpdate = true;
}

// ------------------------------------------------------------------ drifting points (fireflies, dust, wisps, embers)
function driftPoints(n: number, o: { R: number; y0: number; y1: number; size: number; rise: number; sway: number; blink: number; color: number }) {
  const pos = new Float32Array(n * 3), ph = new Float32Array(n);
  for (let i = 0; i < n; i++) { pos[i * 3] = Math.random() * 400; pos[i * 3 + 1] = Math.random() * (o.y1 - o.y0); pos[i * 3 + 2] = Math.random() * 400; ph[i] = Math.random(); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aPh', new THREE.BufferAttribute(ph, 1));
  const u = { uC: { value: new THREE.Vector3() }, uT: { value: 0 }, uR: { value: o.R }, uY0: { value: o.y0 }, uY1: { value: o.y1 }, uRise: { value: o.rise }, uSway: { value: o.sway },
    uSize: { value: o.size }, uPx: { value: 500 }, uBlink: { value: o.blink }, uCol: { value: new THREE.Color(o.color) }, uAmt: { value: 0 } };
  const mat = new THREE.ShaderMaterial({
    uniforms: u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `uniform vec3 uC; uniform float uT, uR, uY0, uY1, uRise, uSway, uSize, uPx, uBlink; attribute float aPh; varying float vA;
      void main(){
        float H = uY1 - uY0; float y = mod(position.y + uT * uRise + aPh * H, H);
        vec3 p = vec3(uC.x + mod(position.x - uC.x + uR, 2.0 * uR) - uR, uC.y + uY0 + y, uC.z + mod(position.z - uC.z + uR, 2.0 * uR) - uR);
        p.x += sin(uT * 0.7 + aPh * 6.28) * uSway; p.z += cos(uT * 0.53 + aPh * 9.0) * uSway; p.y += sin(uT * 1.1 + aPh * 4.0) * uSway * 0.5;
        vec4 mv = viewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = uSize * uPx / max(1.0, -mv.z);
        float edge = smoothstep(uR, uR * 0.7, max(abs(p.x - uC.x), abs(p.z - uC.z)));
        float ends = uRise != 0.0 ? smoothstep(0.0, 0.15, y / H) * smoothstep(1.0, 0.7, y / H) : 1.0;
        float bl = uBlink > 0.0 ? pow(0.5 + 0.5 * sin(uT * uBlink + aPh * 40.0), 3.0) : 1.0;
        vA = edge * ends * bl;
      }`,
    fragmentShader: `uniform vec3 uCol; uniform float uAmt; varying float vA;
      void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d); gl_FragColor = vec4(uCol * a * a * vA * uAmt, 1.0); }`,
  });
  const pts = new THREE.Points(g, mat); pts.frustumCulled = false; pts.renderOrder = 5; return { pts, u };
}

/** Falling leaves (or ash): small tumbling quads drifting down around the hero. */
function leaves(n: number, R: number) {
  const base = new THREE.PlaneGeometry(0.17, 0.11); const g = new THREE.InstancedBufferGeometry(); g.index = base.index; g.setAttribute('position', base.getAttribute('position')); g.setAttribute('uv', base.getAttribute('uv'));
  const b = new Float32Array(n * 3), ph = new Float32Array(n), col = new Float32Array(n * 3); const c = new THREE.Color();
  const pal = [0x5a7a20, 0x7a8a28, 0xb09030, 0x8a5a22, 0x4a6a1a];
  for (let i = 0; i < n; i++) { b[i * 3] = Math.random() * 400; b[i * 3 + 1] = Math.random() * 7; b[i * 3 + 2] = Math.random() * 400; ph[i] = Math.random(); c.setHex(pal[i % pal.length]); col.set([c.r, c.g, c.b], i * 3); }
  g.setAttribute('aB', new THREE.InstancedBufferAttribute(b, 3)); g.setAttribute('aPh', new THREE.InstancedBufferAttribute(ph, 1)); g.setAttribute('aCol', new THREE.InstancedBufferAttribute(col, 3)); g.instanceCount = n;
  const u = { uC: { value: new THREE.Vector3() }, uT: { value: 0 }, uR: { value: R }, uAmt: { value: 0 }, uAsh: { value: 0 }, uLight: { value: 1 } };
  const mat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {}]), transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true,
    vertexShader: `uniform vec3 uC; uniform float uT, uR, uAmt; attribute vec3 aB; attribute float aPh; attribute vec3 aCol; varying vec3 vCol; varying float vA; varying vec2 vUv;
      #include <fog_pars_vertex>
      void main(){
        float H = 7.0; float y = mod(aB.y - uT * (0.55 + aPh * 0.5), H);
        vec3 c = vec3(uC.x + mod(aB.x - uC.x + uR, 2.0 * uR) - uR, uC.y + y, uC.z + mod(aB.z - uC.z + uR, 2.0 * uR) - uR);
        c.x += sin(uT * 1.3 + aPh * 20.0) * 0.6; c.z += cos(uT * 0.9 + aPh * 13.0) * 0.4;
        float a1 = uT * (2.0 + aPh * 3.0) + aPh * 10.0, a2 = uT * 1.7 + aPh * 7.0;
        mat3 rx = mat3(1.0, 0.0, 0.0, 0.0, cos(a1), sin(a1), 0.0, -sin(a1), cos(a1)); mat3 ry = mat3(cos(a2), 0.0, -sin(a2), 0.0, 1.0, 0.0, sin(a2), 0.0, cos(a2));
        vec3 w = c + ry * rx * position;
        vec4 mvPosition = viewMatrix * vec4(w, 1.0); gl_Position = projectionMatrix * mvPosition;
        vCol = aCol; vUv = uv; vA = smoothstep(uR, uR * 0.7, max(abs(c.x - uC.x), abs(c.z - uC.z))) * smoothstep(0.0, 0.5, y) * smoothstep(H, H - 1.0, y) * uAmt;
        #include <fog_vertex>
      }`,
    fragmentShader: `uniform float uAsh, uLight; varying vec3 vCol; varying float vA; varying vec2 vUv;
      #include <fog_pars_fragment>
      void main(){ vec2 q = vUv - 0.5; if (length(q * vec2(1.0, 1.7)) > 0.5 || vA < 0.02) discard;
        vec3 col = mix(vCol, vec3(0.16, 0.16, 0.17), uAsh) * uLight; gl_FragColor = vec4(col, vA);
        #include <fog_fragment>
      }`,
  });
  Object.assign(mat.uniforms, u);
  const mesh = new THREE.Mesh(g, mat); mesh.frustumCulled = false; mesh.renderOrder = 4; return { mesh, u };
}

/** Butterflies: two flapping wings each, wandering a loop near the ground. */
function butterflies(n: number, R: number) {
  const pos: number[] = [], uv: number[] = [];
  for (const s of [-1, 1]) { const x0 = 0, x1 = 0.15 * s; pos.push(x0, 0, -0.1, x1, 0, -0.1, x1, 0, 0.08, x0, 0, -0.1, x1, 0, 0.08, x0, 0, 0.08); uv.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1); }
  const g = new THREE.InstancedBufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  const b = new Float32Array(n * 3), ph = new Float32Array(n), col = new Float32Array(n * 3); const c = new THREE.Color(); const pal = [0xff9a2a, 0xffe060, 0x6aa8ff, 0xffffff, 0xff6aa0, 0xc080ff];
  for (let i = 0; i < n; i++) { b[i * 3] = Math.random() * 400; b[i * 3 + 2] = Math.random() * 400; ph[i] = Math.random(); c.setHex(pal[i % pal.length]); col.set([c.r, c.g, c.b], i * 3); }
  g.setAttribute('aB', new THREE.InstancedBufferAttribute(b, 3)); g.setAttribute('aPh', new THREE.InstancedBufferAttribute(ph, 1)); g.setAttribute('aCol', new THREE.InstancedBufferAttribute(col, 3)); g.instanceCount = n;
  const u = { uC: { value: new THREE.Vector3() }, uT: { value: 0 }, uR: { value: R }, uAmt: { value: 0 }, uLight: { value: 1 } };
  const mat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {}]), side: THREE.DoubleSide, fog: true, transparent: true, depthWrite: false,
    vertexShader: `uniform vec3 uC; uniform float uT, uR, uAmt; attribute vec3 aB; attribute float aPh; attribute vec3 aCol; varying vec3 vCol; varying vec2 vUv; varying float vA;
      #include <fog_pars_vertex>
      void main(){
        float s1 = uT * 0.35 + aPh * 6.28, s2 = uT * 0.27 + aPh * 4.0;
        vec3 c = vec3(uC.x + mod(aB.x - uC.x + uR, 2.0 * uR) - uR, uC.y, uC.z + mod(aB.z - uC.z + uR, 2.0 * uR) - uR);
        c += vec3(sin(s1) * 3.0, 0.7 + 0.45 * sin(uT * 1.3 + aPh * 5.0) + 0.08 * sin(uT * 9.0 + aPh * 3.0), cos(s2) * 3.0);
        float yaw = atan(cos(s1) * 1.05, -sin(s2) * 0.81);
        float fl = sin(uT * (15.0 + aPh * 6.0) + aPh * 30.0) * 1.15; vec3 p = position; float ax = abs(p.x);
        p = vec3(sign(p.x) * ax * cos(fl), ax * sin(fl) * 1.0, p.z);
        p = vec3(p.x * cos(yaw) + p.z * sin(yaw), p.y, -p.x * sin(yaw) + p.z * cos(yaw));
        vec4 mvPosition = viewMatrix * vec4(c + p, 1.0); gl_Position = projectionMatrix * mvPosition;
        vCol = aCol; vUv = uv; vA = smoothstep(uR, uR * 0.7, max(abs(c.x - uC.x), abs(c.z - uC.z))) * uAmt;
        #include <fog_vertex>
      }`,
    fragmentShader: `uniform float uLight; varying vec3 vCol; varying vec2 vUv; varying float vA;
      #include <fog_pars_fragment>
      void main(){ vec2 q = vUv - vec2(0.0, 0.5); float r = length(q * vec2(1.0, 1.25)); if (r > 0.95 || vA < 0.02) discard;
        vec3 col = mix(vCol, vCol * 0.25, smoothstep(0.65, 0.9, r)) * uLight; gl_FragColor = vec4(col, vA);
        #include <fog_fragment>
      }`,
  });
  Object.assign(mat.uniforms, u);
  const mesh = new THREE.Mesh(g, mat); mesh.frustumCulled = false; mesh.renderOrder = 4; return { mesh, u };
}

// ------------------------------------------------------------------ grass and wildflowers
const rng = (seed: number) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const h2 = (x: number, z: number) => { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); };
const vnoise = (x: number, z: number) => { const i = Math.floor(x), j = Math.floor(z), fx = x - i, fz = z - j, ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  return (h2(i, j) * (1 - ux) + h2(i + 1, j) * ux) * (1 - uz) + (h2(i, j + 1) * (1 - ux) + h2(i + 1, j + 1) * ux) * uz; };
const CH = 8, SPAN = 2;           // 8 m chunks, 5 x 5 around the hero (fade out by 18 m)
class Grass {
  readonly grass: THREE.InstancedMesh; readonly flowers: THREE.InstancedMesh; readonly u = { uTime: { value: 0 }, uHero: { value: new THREE.Vector3() }, uR: { value: 18 } };
  private cache = new Map<string, { g: Float32Array; f: Float32Array; fc: Float32Array }>(); private key = ''; private per: number;
  constructor(scene: THREE.Scene, private at: (x: number, z: number) => number, private hAt: (x: number, z: number) => number, per: number) {
    this.per = per;
    // a clump: 5 tapered blades leaning out, dark at the root, sunlit at the tip; normals point up so it lights like the ground
    const pos: number[] = [], col: number[] = [], nrm: number[] = []; const root = new THREE.Color(LOOK.grass[0]), tip = new THREE.Color(LOOK.grass[1]), tip2 = new THREE.Color(LOOK.grass[2]);
    for (let k = 0; k < 5; k++) {
      const a = k / 5 * 6.28 + 0.4, lean = 0.12 + (k % 2) * 0.1, h = (0.32 + (k % 3) * 0.1) * (LOOK.grassH ?? 1), w = 0.045, cx = Math.cos(a) * 0.06, cz = Math.sin(a) * 0.06, px = -Math.sin(a), pz = Math.cos(a), t = k === 2 ? tip2 : tip;
      pos.push(cx - px * w, 0, cz - pz * w, cx + px * w, 0, cz + pz * w, cx + Math.cos(a) * lean, h, cz + Math.sin(a) * lean);
      col.push(root.r, root.g, root.b, root.r, root.g, root.b, t.r, t.g, t.b); for (let q = 0; q < 3; q++) nrm.push(0, 1, 0);
    }
    const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); gg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); gg.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    const sway = (mat: THREE.Material, amp: number) => { mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.u);
      sh.vertexShader = 'uniform float uTime; uniform vec3 uHero; uniform float uR;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        vec4 ip = instanceMatrix[3]; float k = max(0.0, position.y);
        float w = sin(uTime * 2.1 + ip.x * 0.45 + ip.z * 0.3) * 0.6 + sin(uTime * 3.7 + ip.x * 1.3 + ip.z * 0.7) * 0.25;
        transformed.x += w * k * ${amp.toFixed(2)}; transformed.z += w * k * ${(amp * 0.6).toFixed(2)};
        float dd = distance(ip.xz, uHero.xz); transformed *= smoothstep(uR, uR * 0.72, dd);`);
      sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n normal = normalize(vNormal);');   // lit from above on both faces, like the ground
    }; mat.customProgramCacheKey = () => 'grass' + amp; };
    const gm = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }); sway(gm, 0.45);
    const cap = (2 * SPAN + 1) ** 2 * per;
    this.grass = new THREE.InstancedMesh(gg, gm, cap); this.grass.count = 0; this.grass.frustumCulled = false; this.grass.receiveShadow = true;
    // a flower: a thin stem and a small bright head (tinted per flower)
    const fpos: number[] = [], fcol: number[] = [], fn: number[] = []; const stem = new THREE.Color(0x4a6a24);
    fpos.push(-0.012, 0, 0, 0.012, 0, 0, 0, 0.3, 0.02); for (let q = 0; q < 3; q++) { fcol.push(stem.r * 2, stem.g * 2, stem.b * 2); fn.push(0, 1, 0); }
    const head = new THREE.OctahedronGeometry(0.055, 0); head.scale(1, 0.55, 1); head.translate(0, 0.31, 0.02); const hp = head.toNonIndexed().getAttribute('position');
    for (let i = 0; i < hp.count; i++) { fpos.push(hp.getX(i), hp.getY(i), hp.getZ(i)); fcol.push(1, 1, 1); fn.push(0, 1, 0); }
    const fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.Float32BufferAttribute(fpos, 3)); fg.setAttribute('color', new THREE.Float32BufferAttribute(fcol, 3)); fg.setAttribute('normal', new THREE.Float32BufferAttribute(fn, 3));
    const fm = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }); sway(fm, 0.3);
    this.flowers = new THREE.InstancedMesh(fg, fm, (2 * SPAN + 1) ** 2 * Math.ceil(per / 9)); this.flowers.count = 0; this.flowers.frustumCulled = false;
    this.flowers.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.flowers.instanceMatrix.count * 3), 3);
    scene.add(this.grass, this.flowers);
  }
  setDensity(per: number): void { this.per = per; this.cache.clear(); this.key = ''; }
  private chunk(cx: number, cz: number) {
    const k = `${cx},${cz}`; const hit = this.cache.get(k); if (hit) return hit;
    const r = rng(cx * 73856093 ^ cz * 19349663); const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
    const g: number[] = [], f: number[] = [], fc: number[] = []; const c = new THREE.Color(); const pal = [0xf2ead8, 0xe8dca0, 0xd8b8b0, 0xe6e0d0, 0xc8c090];   // muted: off-white, straw, dusty rose
    for (let i = 0; i < this.per; i++) {
      const x = (cx + r()) * CH, z = (cz + r()) * CH, rot = r(), sc = r(), roll = r(), pick = r();
      if (!this.at(x, z)) continue;
      const dens = Math.min(1, Math.max(0, (vnoise(x * 0.09, z * 0.09) - 0.2) / 0.5)); if (roll > 0.15 + 0.85 * dens) continue;
      p.set(x, this.hAt(x, z) - 0.01, z); q.setFromAxisAngle(Y, rot * 6.28); const ss = 0.95 + sc * 0.9; s.set(ss, ss * (0.8 + dens * 0.5), ss);
      m.compose(p, q, s); g.push(...m.elements);
      if (pick < 0.028 && dens > 0.45) { s.setScalar(0.65 + sc * 0.35); m.compose(p.set(x + 0.15, p.y, z + 0.1), q, s); f.push(...m.elements); c.setHex(pal[Math.floor(rot * pal.length * 7) % pal.length]); fc.push(c.r, c.g, c.b); }   // a few small wildflowers, not carpets
    }
    const out = { g: new Float32Array(g), f: new Float32Array(f), fc: new Float32Array(fc) }; this.cache.set(k, out);
    if (this.cache.size > 160) this.cache.delete(this.cache.keys().next().value!);
    return out;
  }
  update(t: number, hero: THREE.Vector3): void {
    this.u.uTime.value = t; this.u.uHero.value.copy(hero);
    const cx = Math.floor(hero.x / CH), cz = Math.floor(hero.z / CH), key = `${cx},${cz}`; if (key === this.key) return; this.key = key;
    let ng = 0, nf = 0; const G = this.grass.instanceMatrix.array as Float32Array, F = this.flowers.instanceMatrix.array as Float32Array, FC = this.flowers.instanceColor!.array as Float32Array;
    for (let dz = -SPAN; dz <= SPAN; dz++) for (let dx = -SPAN; dx <= SPAN; dx++) {
      const ch = this.chunk(cx + dx, cz + dz);
      const gn = Math.min(ch.g.length / 16, G.length / 16 - ng); G.set(ch.g.subarray(0, gn * 16), ng * 16); ng += gn;
      const fnn = Math.min(ch.f.length / 16, F.length / 16 - nf); F.set(ch.f.subarray(0, fnn * 16), nf * 16); FC.set(ch.fc.subarray(0, fnn * 3), nf * 3); nf += fnn;
    }
    this.grass.count = ng; this.flowers.count = nf; this.grass.instanceMatrix.needsUpdate = true; this.flowers.instanceMatrix.needsUpdate = true; this.flowers.instanceColor!.needsUpdate = true;
  }
}

// ------------------------------------------------------------------ the whole thing
export interface AtmoWorld { zones: MoodZone[]; grassAt: (x: number, z: number) => number; heightAt: (x: number, z: number) => number; sun: THREE.DirectionalLight }
export class Atmosphere {
  private composer: EffectComposer | null = null; private bloom: UnrealBloomPass | null = null; private grade: ShaderPass | null = null;
  glow: boolean; private t = 0; private cloud: CloudU = { t: { value: 0 }, a: { value: 0.32 } }; private scanT = 0;
  private live = new LiveMood(); private target = new LiveMood(); private tmp = new LiveMood(); private moodSet = false;
  private hemi: THREE.HemisphereLight | null = null; private grass: Grass | null = null;
  private fire: ReturnType<typeof driftPoints> | null = null; private mote: ReturnType<typeof driftPoints> | null = null; private wisp: ReturnType<typeof driftPoints> | null = null; private ember: ReturnType<typeof driftPoints> | null = null;
  private leaf: ReturnType<typeof leaves> | null = null; private fly: ReturnType<typeof butterflies> | null = null;
  constructor(private renderer: THREE.WebGLRenderer, private scene: THREE.Scene, private camera: THREE.PerspectiveCamera, private touch: boolean, private world: AtmoWorld | null, readonly enabled: boolean) {
    this.glow = enabled && localStorage.getItem('zg.glow') !== '0';
    if (!enabled) return;
    if (world) {
      scene.traverse((o) => { if (!this.hemi && (o as THREE.HemisphereLight).isHemisphereLight) this.hemi = o as THREE.HemisphereLight; });
      const lite = touch ? 0.6 : 1;
      this.fire = driftPoints(Math.round(70 * lite), { R: 16, y0: 0.3, y1: 2.6, size: 0.16, rise: 0, sway: 0.9, blink: 2.2, color: 0xd8ff70 });
      this.mote = driftPoints(Math.round(90 * lite), { R: 14, y0: 0.2, y1: 4.5, size: 0.07, rise: 0.12, sway: 0.5, blink: 0, color: 0xffd890 });
      this.wisp = driftPoints(Math.round(26 * lite), { R: 18, y0: 0.4, y1: 3.0, size: 0.55, rise: 0.15, sway: 1.6, blink: 0.9, color: 0x7aff9a });
      this.ember = driftPoints(Math.round(80 * lite), { R: 16, y0: 0, y1: 6, size: 0.08, rise: 0.9, sway: 0.4, blink: 5, color: 0xff7030 });
      this.leaf = leaves(Math.round(46 * lite), 15); this.fly = butterflies(touch ? 7 : 12, 17);
      for (const o of [this.fire, this.mote, this.wisp, this.ember]) scene.add(o.pts);
      scene.add(this.leaf.mesh, this.fly.mesh);
      this.grass = new Grass(scene, world.grassAt, world.heightAt, Math.round((touch ? 120 : 220) * (LOOK.grassMul ?? 1)));
    }
    this.setGlow(this.glow);
  }
  /** Turn glow + grading on or off (the Controls checkbox; off also when the device is slow). */
  setGlow(on: boolean): void {
    this.glow = on && this.enabled;
    if (!this.glow || this.composer) return;
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: this.touch ? 2 : 4 });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.38, 0.55, 0.9); this.composer.addPass(this.bloom);
    this.grade = new ShaderPass(GradeShader); this.composer.addPass(this.grade);
    this.composer.addPass(new OutputPass());
    this.setSize();
  }
  setSize(): void { if (!this.composer) return; this.composer.setPixelRatio(this.renderer.getPixelRatio()); this.composer.setSize(innerWidth, innerHeight); if (this.grade) this.grade.uniforms.uAspect.value = innerWidth / innerHeight; }
  render(): void { if (this.glow && this.composer) this.composer.render(); else this.renderer.render(this.scene, this.camera); }
  /** The frame rate is too low: drop the costliest extra still on. Returns false when there is nothing left to drop. */
  degrade(): boolean {
    if (!this.enabled) return false;
    if (this.bloom?.enabled && this.glow) { this.bloom.enabled = false; return true; }
    if (this.grass && (this.grass as unknown as { per: number }).per > 40) { this.grass.setDensity(36); return true; }
    if (this.glow) { this.glow = false; return true; }
    return false;
  }
  update(dt: number, hero: THREE.Vector3): void {
    if (!this.enabled) return; this.t += dt; this.cloud.t.value = this.t;
    if ((this.scanT -= dt) <= 0) { this.scanT = 2; this.scene.traverse((o) => { const m = (o as THREE.Mesh).material; if (!m || !(o as THREE.Mesh).isMesh) return; for (const mm of Array.isArray(m) ? m : [m]) cloudify(mm, this.cloud); }); }
    if (!this.world) { if (this.grade) { const g = this.grade.uniforms; g.uTint.value.set(1.03, 1, 0.95); g.uSat.value = 1.1; g.uCon.value = 1.05; } return; }
    // the mood: blend the zones the hero is in, then ease toward it
    let wsum = 0; this.target.set(MOODS.jungle); const ws: Array<[Mood, number]> = [];
    for (const z of this.world.zones) { const d = Math.hypot(hero.x - z.x, hero.z - z.z); const w = d <= z.core ? 1 : d >= z.out ? 0 : 1 - (d - z.core) / (z.out - z.core); if (w > 0) { const sw = w * w * (3 - 2 * w); ws.push([MOODS[z.mood], sw]); wsum += sw; } }
    if (wsum > 0) { let acc = Math.max(0, 1 - wsum); for (const [m, w] of ws) { acc += w; this.target.mix(this.tmp.set(m), w / acc); } }
    if (!this.moodSet) { this.live.set(MOODS.jungle).mix(this.target, 1); this.moodSet = true; } else this.live.mix(this.target, Math.min(1, dt * 0.8));
    const L = this.live, n = L.n;
    const sun = this.world.sun; sun.color.copy(L.sun); sun.intensity = n.sunI;
    if (this.hemi) { this.hemi.color.copy(L.sky); this.hemi.groundColor.copy(L.gnd); this.hemi.intensity = n.hemiI; }
    const fog = this.scene.fog as THREE.Fog | null; if (fog?.isFog) { fog.color.copy(L.fog); fog.near = n.near; fog.far = n.far; }
    if (this.scene.background instanceof THREE.Color) this.scene.background.copy(L.fog);
    if (this.grade) { const g = this.grade.uniforms; g.uTint.value.copy(L.tint); g.uSat.value = n.sat; g.uCon.value = n.con; }
    // particles follow the hero; their amounts come from the mood
    const fov = THREE.MathUtils.degToRad(this.camera.fov), px = this.renderer.getDrawingBufferSize(new THREE.Vector2()).y / (2 * Math.tan(fov / 2));
    const lightK = Math.min(1.2, 0.45 + n.sunI * 0.22);
    for (const [o, amt, col] of [[this.fire, n.fire, null], [this.mote, n.mote, L.moteCol], [this.wisp, n.wisp, L.wispCol], [this.ember, n.ember, null]] as const) {
      if (!o) continue; o.u.uC.value.copy(hero); o.u.uT.value = this.t; o.u.uPx.value = px; o.u.uAmt.value = amt; o.pts.visible = amt > 0.01; if (col) o.u.uCol.value.copy(col);
    }
    if (this.leaf) { const u = this.leaf.u; u.uC.value.copy(hero); u.uT.value = this.t; u.uAmt.value = Math.min(1, n.leaf); u.uAsh.value = n.ash; u.uLight.value = lightK; this.leaf.mesh.visible = n.leaf > 0.01; }
    if (this.fly) { const u = this.fly.u; u.uC.value.copy(hero); u.uT.value = this.t; u.uAmt.value = Math.min(1, n.fly); u.uLight.value = lightK; this.fly.mesh.visible = n.fly > 0.01; }
    this.grass?.update(this.t, hero);
  }
}
