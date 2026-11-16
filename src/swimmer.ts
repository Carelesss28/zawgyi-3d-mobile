import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { WATERWAYS } from './chapter1';
import { sfx } from './audio';

/**
 * The Naga, glimpsed: long before the lair it swims the river and the streams (chapter1 WATERWAYS). A clone of the boss model
 * (shared geometry and textures) with its own mixer; under the surface the jungle floor hides it, so a dark shape on the water
 * shows where it is, with a wake of foam rings and spray. Five kinds of glimpse, from a shadow sliding past to the head rising.
 */
export type GlimpseKind = 'shadow' | 'coils' | 'eyes' | 'roar' | 'rise';
type Water = { name: string; curve: THREE.Curve<THREE.Vector3>; y: number; hw: number; L: number; pts: Array<{ x: number; z: number; u: number }> };
type Run = { w: Water; u: number; dir: 1 | -1; uStop: number; uEnd: number; t: number; kind: GlimpseKind; hold: number; held: number; surf: number; broke: boolean; dived: boolean; wakeT: number; sprayT: number };

const BODY = 14;                       // metres nose to tail (a little smaller than the boss: the streams are narrow)
const N_DROP = 420, N_RING = 36;

export class NagaSwimmer {
  readonly root = new THREE.Group();
  private model: THREE.Object3D;
  private mixer: THREE.AnimationMixer;
  private actions = new Map<string, THREE.AnimationAction>();
  private cur: THREE.AnimationAction | null = null;
  private waters: Water[] | null = null;
  private run: Run | null = null;
  // the shape under the water
  private shade: THREE.Mesh; private shadeMat: THREE.MeshBasicMaterial;
  private eyes: THREE.Sprite[] = [];
  // spray and foam
  private dropGeo = new THREE.BufferGeometry(); private dropPos = new Float32Array(N_DROP * 3); private dropA = new Float32Array(N_DROP);
  private dropV = new Float32Array(N_DROP * 3); private dropLife = new Float32Array(N_DROP); private dropFloor = new Float32Array(N_DROP); private dropNext = 0;
  private rings: Array<{ m: THREE.Mesh; t: number; dur: number; r0: number; r1: number; a: number }> = [];
  private ringNext = 0;

  constructor(private scene: THREE.Scene, src: { scene: THREE.Object3D; animations: THREE.AnimationClip[]; scale: number }, private shake: (s: number) => void) {
    this.model = cloneSkinned(src.scene); const k = BODY / 18;                                    // the boss is 18 m
    this.model.scale.multiplyScalar(k); this.model.position.multiplyScalar(k);
    this.model.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = false; m.frustumCulled = false; } });
    this.root.add(this.model); this.root.visible = false; scene.add(this.root);
    this.mixer = new THREE.AnimationMixer(this.model);
    for (const c of src.animations) { const a = this.mixer.clipAction(c); this.actions.set(c.name.replace(/^.*[|:]/, ''), a); }
    // the dark shape: a ribbon along the water behind the head, soft at its edges
    const cv = document.createElement('canvas'); cv.width = 64; cv.height = 4; const g = cv.getContext('2d')!; const gr = g.createLinearGradient(0, 0, 64, 0);
    gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.3, 'rgba(255,255,255,0.85)'); gr.addColorStop(0.5, 'rgba(255,255,255,1)'); gr.addColorStop(0.7, 'rgba(255,255,255,0.85)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 4);
    this.shadeMat = new THREE.MeshBasicMaterial({ color: 0x03100f, alphaMap: new THREE.CanvasTexture(cv), transparent: true, opacity: 0, depthWrite: false, fog: true });
    const sg = new THREE.BufferGeometry(); const S = 24; sg.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array((S + 1) * 2 * 3), 3));
    sg.setAttribute('uv', new THREE.Float32BufferAttribute(Array.from({ length: (S + 1) * 2 }, (_, i) => [i % 2, Math.floor(i / 2) / S]).flat(), 2));
    const idx: number[] = []; for (let i = 0; i < S; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); } sg.setIndex(idx);
    this.shade = new THREE.Mesh(sg, this.shadeMat); this.shade.renderOrder = 5; this.shade.frustumCulled = false; this.shade.visible = false; scene.add(this.shade);
    // two red eyes that open on the surface
    const ec = document.createElement('canvas'); ec.width = ec.height = 32; const eg = ec.getContext('2d')!; const rg = eg.createRadialGradient(16, 16, 0, 16, 16, 16);
    rg.addColorStop(0, 'rgba(255,240,200,1)'); rg.addColorStop(0.25, 'rgba(255,60,30,0.95)'); rg.addColorStop(1, 'rgba(255,0,0,0)'); eg.fillStyle = rg; eg.fillRect(0, 0, 32, 32);
    const em = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(ec), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, opacity: 0 });
    for (let i = 0; i < 2; i++) { const s = new THREE.Sprite(em); s.scale.setScalar(0.55); s.renderOrder = 6; s.visible = false; scene.add(s); this.eyes.push(s); }
    // spray: soft round droplets that arc and fall back into the water
    this.dropGeo.setAttribute('position', new THREE.BufferAttribute(this.dropPos, 3)); this.dropGeo.setAttribute('aA', new THREE.BufferAttribute(this.dropA, 1));
    const dm = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      vertexShader: `attribute float aA; varying float vA; void main(){ vA = aA; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = (0.12 + 0.2 * aA) * 520.0 / max(1.0, -mv.z); }`,
      fragmentShader: `varying float vA; void main(){ vec2 c = gl_PointCoord - 0.5; float d = length(c); if (d > 0.5) discard; float a = smoothstep(0.5, 0.15, d) * vA; gl_FragColor = vec4(vec3(0.86, 0.95, 1.0), a * 0.9); }`,
    });
    const pts = new THREE.Points(this.dropGeo, dm); pts.frustumCulled = false; pts.renderOrder = 7; scene.add(pts);
    // foam rings on the surface
    const rgeo = new THREE.RingGeometry(0.72, 1, 36).rotateX(-Math.PI / 2);
    for (let i = 0; i < N_RING; i++) { const m = new THREE.Mesh(rgeo, new THREE.MeshBasicMaterial({ color: 0xd8eef2, transparent: true, opacity: 0, depthWrite: false, fog: true })); m.visible = false; m.renderOrder = 5; scene.add(m); this.rings.push({ m, t: 1, dur: 1, r0: 0, r1: 0, a: 0 }); }
  }

  get active(): boolean { return !!this.run; }

  private loadWaters(): Water[] {
    if (!this.waters) this.waters = WATERWAYS.map((w) => { const L = w.curve.getLength(), n = Math.ceil(L); return { ...w, L, pts: Array.from({ length: n + 1 }, (_, i) => { const p = w.curve.getPointAt(i / n); return { x: p.x, z: p.z, u: (i / n) * L }; }) }; });
    return this.waters;
  }

  /** Start a glimpse in the water nearest (hx, hz), if any is within reach. Returns false when there is no water close enough. */
  glimpse(kind: GlimpseKind, hx: number, hz: number, reach = 28): boolean {
    if (this.run) return false;
    let best: { w: Water; u: number; d: number } | null = null;
    for (const w of this.loadWaters()) for (const p of w.pts) { const d = Math.hypot(p.x - hx, p.z - hz); if (d < reach && (!best || d < best.d)) best = { w, u: p.u, d }; }
    if (!best) return false;
    const w = best.w, span = kind === 'shadow' || kind === 'coils' ? 26 : 18;
    let dir: 1 | -1 = Math.random() < 0.5 ? 1 : -1; if (best.u - dir * span < 6 || best.u - dir * span > w.L - 6) dir = (-dir) as 1 | -1;
    const uStop = best.u + dir * (kind === 'shadow' || kind === 'coils' ? 0 : 3);
    const u0 = Math.min(w.L - 6, Math.max(6, best.u - dir * span)), uEnd = Math.min(w.L - 2, Math.max(2, best.u + dir * span));
    this.run = { w, u: u0, dir, uStop, uEnd, t: 0, kind, hold: kind === 'eyes' ? 2.6 : kind === 'roar' ? 2.4 : kind === 'rise' ? 3.6 : 0, held: 0, surf: 0, broke: false, dived: false, wakeT: 0, sprayT: 0 };
    this.root.visible = kind !== 'shadow' && kind !== 'eyes'; this.shade.visible = true; this.play('Move', 0); sfx.splash(false);   // a heavy splash upstream: something to turn round for
    return true;
  }

  private leaving = false;
  /** Spared: it leaves for good, swimming out of the lair down the north stream (once; story stops do not cut it short). */
  leave(name = 'north'): boolean {
    const w = this.loadWaters().find((q) => q.name === name); if (!w || this.leaving) return false; this.run = null;
    this.run = { w, u: 4, dir: 1, uStop: 30, uEnd: Math.min(w.L - 2, 120), t: 0, kind: 'coils', hold: 0, held: 0, surf: 0, broke: false, dived: false, wakeT: 0, sprayT: 0 };
    this.leaving = true; this.root.visible = true; this.shade.visible = true; this.play('Move', 0); sfx.splash(true); return true;
  }
  stop(): void { if (!this.run || this.leaving) return; this.run = null; this.root.visible = false; this.shade.visible = false; for (const e of this.eyes) e.visible = false; }

  private play(name: string, fade = 0.3): void {
    const a = this.actions.get(name); if (!a || a === this.cur) return;
    a.reset(); a.setLoop(name === 'Move' || name === 'Idle' ? THREE.LoopRepeat : THREE.LoopOnce, Infinity); a.clampWhenFinished = true; a.play();
    if (this.cur) this.cur.crossFadeTo(a, fade, false); this.cur = a;
  }

  private at(u: number): { x: number; z: number; tx: number; tz: number } {
    const w = this.run!.w, t = Math.min(1, Math.max(0, u / w.L)), p = w.curve.getPointAt(t), tg = w.curve.getTangentAt(t); const l = Math.hypot(tg.x, tg.z) || 1;
    return { x: p.x, z: p.z, tx: (tg.x / l) * this.run!.dir, tz: (tg.z / l) * this.run!.dir };
  }

  private drop(x: number, y: number, z: number, vx: number, vy: number, vz: number, floor: number): void {
    const i = this.dropNext; this.dropNext = (i + 1) % N_DROP;
    this.dropPos[i * 3] = x; this.dropPos[i * 3 + 1] = y; this.dropPos[i * 3 + 2] = z; this.dropV[i * 3] = vx; this.dropV[i * 3 + 1] = vy; this.dropV[i * 3 + 2] = vz; this.dropLife[i] = 1; this.dropFloor[i] = floor;
  }
  /** A burst of spray: n droplets thrown up from (x, z) with the given strength. */
  private splash(x: number, z: number, y: number, n: number, power: number, along = { x: 0, z: 0 }): void {
    for (let k = 0; k < n; k++) { const a = Math.random() * 6.283, s = Math.random() * power * 0.45; this.drop(x + Math.cos(a) * 0.4, y + 0.05, z + Math.sin(a) * 0.4, Math.cos(a) * s + along.x, power * (0.55 + Math.random() * 0.6), Math.sin(a) * s + along.z, y); }
  }
  private ring(x: number, z: number, y: number, r0: number, r1: number, dur: number, a: number): void {
    const r = this.rings[this.ringNext]; this.ringNext = (this.ringNext + 1) % N_RING;
    r.m.position.set(x, y + 0.02, z); r.t = 0; r.dur = dur; r.r0 = r0; r.r1 = r1; r.a = a; r.m.visible = true;
  }

  update(dt: number, hero: THREE.Vector3): void {
    // the spray and the foam keep going after a run ends
    for (let i = 0; i < N_DROP; i++) {
      if (this.dropLife[i] <= 0) { this.dropA[i] = 0; continue; }
      this.dropV[i * 3 + 1] -= 9.8 * dt; this.dropPos[i * 3] += this.dropV[i * 3] * dt; this.dropPos[i * 3 + 1] += this.dropV[i * 3 + 1] * dt; this.dropPos[i * 3 + 2] += this.dropV[i * 3 + 2] * dt;
      this.dropLife[i] -= dt * 0.7; if (this.dropPos[i * 3 + 1] < this.dropFloor[i] && this.dropV[i * 3 + 1] < 0) this.dropLife[i] = 0;
      this.dropA[i] = Math.max(0, Math.min(1, this.dropLife[i] * 1.6));
    }
    (this.dropGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true; (this.dropGeo.attributes.aA as THREE.BufferAttribute).needsUpdate = true;
    for (const r of this.rings) { if (!r.m.visible) continue; r.t += dt; const f = r.t / r.dur; if (f >= 1) { r.m.visible = false; continue; } r.m.scale.setScalar(r.r0 + (r.r1 - r.r0) * (1 - (1 - f) * (1 - f))); (r.m.material as THREE.MeshBasicMaterial).opacity = r.a * (1 - f); }

    const run = this.run; if (!run) return;
    this.mixer.update(dt); run.t += dt;
    const w = run.w, Y = w.y, toEnd = (run.uEnd - run.u) * run.dir, pastStop = (run.u - run.uStop) * run.dir >= 0;
    // speed: glides in, stops to show itself (eyes, roar, rise), then away
    let speed = run.kind === 'shadow' ? 7.5 : 6;
    if (run.hold > 0 && !pastStop) speed = Math.max(1.2, Math.min(speed, Math.abs(run.uStop - run.u) * 1.4));
    if (run.hold > 0 && pastStop && run.held < run.hold) { speed = 0; run.held += dt; }
    run.u += run.dir * speed * dt;
    // how far up it comes: 0 deep (only its shape shows) .. 1 breaking the surface
    const holding = run.hold > 0 && pastStop && run.held < run.hold;
    let want = 0;
    if (run.kind === 'coils') { const f = 1 - Math.abs((run.u - run.uStop) * run.dir) / 14; want = f > 0 ? 1 : 0; }
    if (run.kind === 'roar' || run.kind === 'rise') want = holding || (!pastStop && Math.abs(run.uStop - run.u) < 4) ? 1 : 0;
    run.surf += (want - run.surf) * Math.min(1, dt * (want > run.surf ? 1.6 : 1.1));
    const head = this.at(run.u), mid = this.at(run.u - run.dir * BODY * 0.45);
    // where the body is: its middle on the water, turned along the flow; deep, or high enough for its back (rise: head and neck) to break the surface
    const lift = run.kind === 'rise' ? 0.6 : run.kind === 'roar' ? -0.15 : -1.9;
    this.root.position.set(mid.x, Y - 3.2 + (3.2 + lift) * run.surf, mid.z); this.root.rotation.y = Math.atan2(head.x - mid.x, head.z - mid.z);
    if ((run.kind === 'roar' || run.kind === 'rise') && holding && run.held < dt * 1.5) { this.play('Roar', 0.35); sfx.roar(); this.shake(run.kind === 'roar' ? 0.7 : 0.5); }
    if ((run.kind === 'roar' || run.kind === 'rise') && run.held >= run.hold && this.cur !== this.actions.get('Move')) this.play('Move', 0.5);
    // breaking the surface and going under: a crash of spray, foam and the sound of it
    if (!run.broke && run.surf > 0.55) { run.broke = true; for (let k = 0; k < 5; k++) { const p = this.at(run.u - run.dir * k * 2.6); this.splash(p.x, p.z, Y, 26, 6.5); this.ring(p.x, p.z, Y, 0.6, 4.2, 1.6, 0.8); } sfx.splash(true); }
    if (run.broke && !run.dived && run.surf < 0.35) { run.dived = true; for (let k = 0; k < 4; k++) { const p = this.at(run.u - run.dir * k * 3); this.splash(p.x, p.z, Y, 20, 5); this.ring(p.x, p.z, Y, 0.5, 3.6, 1.5, 0.7); } sfx.splash(true); }
    // the wake: a bow wave at the head, foam rings left behind, spray where its back cuts the surface
    run.wakeT -= dt;
    if (run.wakeT <= 0 && speed > 0.5) { run.wakeT = 0.12; this.ring(head.x, head.z, Y, 0.3, 1.5 + run.surf, 1.1, 0.35 + 0.35 * run.surf); this.splash(head.x + head.tx * 0.6, head.z + head.tz * 0.6, Y, 2 + Math.round(run.surf * 5), 2.2 + run.surf * 2.5, { x: head.tx * 1.5, z: head.tz * 1.5 }); }
    run.sprayT -= dt;
    if (run.surf > 0.4 && run.sprayT <= 0) { run.sprayT = 0.05; const p = this.at(run.u - run.dir * Math.random() * BODY * 0.85); this.splash(p.x, p.z, Y, 3, 3 + run.surf * 2); }
    if (holding && Math.random() < dt * 6) { this.ring(head.x + (Math.random() - 0.5) * 2, head.z + (Math.random() - 0.5) * 2, Y, 0.4, 2.4, 1.4, 0.45); }
    if (run.broke && !run.dived && Math.hypot(head.x - hero.x, head.z - hero.z) < 30 && Math.random() < dt * 0.8) sfx.splash(false);
    // the shape under the water: darker as it rises, gone once it breaks the surface
    const pos = this.shade.geometry.attributes.position as THREE.BufferAttribute; const S = pos.count / 2 - 1, hw = Math.min(w.hw * 0.75, 1.3);
    for (let i = 0; i <= S; i++) {
      const s = i / S, p = this.at(run.u - run.dir * s * BODY * 0.95), nx = -p.tz, nz = p.tx, wid = hw * (s < 0.12 ? 0.55 + s * 3.6 : 1 - Math.pow((s - 0.12) / 0.88, 1.6) * 0.85) * (1 + 0.06 * Math.sin(run.t * 5 - s * 9));
      const sw = Math.sin(run.t * 3.2 - s * 7) * 0.35 * s;                                       // it swims: a slow S through the body
      pos.setXYZ(i * 2, p.x + nx * (sw - wid), Y + 0.015, p.z + nz * (sw - wid)); pos.setXYZ(i * 2 + 1, p.x + nx * (sw + wid), Y + 0.015, p.z + nz * (sw + wid));
    }
    pos.needsUpdate = true;
    const fadeIn = Math.min(1, run.t / 1.2, Math.max(0, toEnd) / 6);
    this.shadeMat.opacity = fadeIn * (0.38 + 0.3 * Math.min(1, run.surf * 1.5)) * (this.root.visible ? 1 - run.surf * 0.6 : 1);
    // eyes: open on the surface while it watches, then sink
    const eyeA = run.kind === 'eyes' ? (holding ? Math.min(1, run.held / 0.6, (run.hold - run.held) / 0.6) : 0) : 0;
    for (let i = 0; i < 2; i++) { const e = this.eyes[i], s2 = i ? 1 : -1; e.visible = eyeA > 0.01; e.position.set(head.x - head.tz * 0.38 * s2 - head.tx * 0.4, Y + 0.14, head.z + head.tx * 0.38 * s2 - head.tz * 0.4); (e.material as THREE.SpriteMaterial).opacity = eyeA; }
    if (run.kind === 'eyes' && holding && run.held < dt * 1.5) { this.ring(head.x, head.z, Y, 0.3, 2.2, 2.0, 0.5); sfx.splash(false); }
    if (toEnd <= 0) { this.leaving = false; this.stop(); }
  }
}
