import * as THREE from 'three';
import { HP_SCALE, atk } from './stats';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { Fx, FlipSheet } from './fx';
import type { BossHooks } from './boss';
import { setBossHp } from './boss';
import { settle, walk } from './world';

/**
 * Chapter 1's final boss, keeper of the gate to Chapter 2: the Burmese Naga dragon (art/build_dragon_glb.py; the class still
 * handles the older five-headed hydra model too). One mouth, five elements, each with its own strike clip:
 *   0 centre - FIRE      : breath along a telegraphed cone
 *   1 right  - ICE       : a fan of five ice shards
 *   2 left   - POISON    : lobs bile at the hero; lingering green pools hurt while you stand in them
 *   3 left   - LIGHTNING : marks four spots round the hero, then bolts strike from the sky
 *   4 right  - EARTH     : slams the ground; a shockwave ring rolls outward (dash through it)
 * Dormant in its lair until the hero comes close; heads attack in turn; at half health it roars and gets faster,
 * sometimes striking with two heads at once. When it dies the gate opens and the chapter's treasure unlocks.
 */
type HState = 'dormant' | 'roar' | 'fight' | 'strike' | 'dead';
interface ClipInfo { duration: number; speed: number; loop?: boolean; hitTime?: number }
export interface HydraSheets { flame?: FlipSheet; lightning?: FlipSheet; impact?: FlipSheet; wave?: FlipSheet }

export const HYDRA_LENGTH = 18;                                  // metres nose to tail (the Naga rears ~10 m high)
const WAKE = 26, LEASH = 18;
const ELEMENTS = ['fire', 'ice', 'poison', 'lightning', 'earth'] as const;
const COLORS = { fire: 0xff6a20, ice: 0x8fd8ff, poison: 0x6aff4a, lightning: 0xffe86a, earth: 0xc89050 };

export class Hydra {
  readonly kind = 'hydra' as const;
  readonly root = new THREE.Group();
  readonly fxGroup = new THREE.Group();                         // telegraphs and projectiles (world space)
  readonly radius = 3.4;
  readonly maxHp = 160 * HP_SCALE;
  hp = 160 * HP_SCALE;
  dead = false;
  state: HState = 'dormant';
  stateT = 0;
  facing: number;
  loaded = false;
  enraged = false;
  readonly home = new THREE.Vector3();
  private homeFacing: number;
  private model: THREE.Object3D | null = null;
  /** The loaded model and clips, untouched by the fight (the swimming Naga clones it). */
  src: { scene: THREE.Object3D; animations: THREE.AnimationClip[]; scale: number } | null = null;
  private mixer: THREE.AnimationMixer | null = null;
  private actions = new Map<string, THREE.AnimationAction>();
  private cur: THREE.AnimationAction | null = null;
  private clips: Record<string, ClipInfo> = {};
  private heads: Array<[number, number]> = [];
  private mouth: [number, number, number] | null = null;          // Blender coords (model units) of the mouth, when the model has one head
  private cy = -0.25;                                              // Blender Y of the body centre (it sits on the root)
  private S = HYDRA_LENGTH;
  private mats: THREE.MeshStandardMaterial[] = [];
  private flash = 0;
  private cd = 2.5;
  private next = 0;
  private head = 0;
  private struck = false;
  private second = -1;                                           // enraged: a second head joins in
  private wake = false;
  private deadT = 0;
  private circleSide = 1; private circleT = 5;
  private fx: Fx | null = null;
  private sh: HydraSheets = {};
  private tele: THREE.Mesh[] = [];
  private shards: Array<{ m: THREE.Mesh; dir: THREE.Vector3; d: number }> = [];
  private pools: Array<{ m: THREE.Mesh; at: THREE.Vector3; t: number; tick: number }> = [];
  private lobs: Array<{ at: THREE.Vector3; t: number; mark: THREE.Mesh }> = [];
  private strikes: Array<{ at: THREE.Vector3; t: number; mark: THREE.Mesh }> = [];
  private rings: Array<{ m: THREE.Mesh; r: number; hit: boolean }> = [];
  private breath: { t: number; hit: boolean; ang: number; at: THREE.Vector3 } | null = null;
  private bar = document.getElementById('boss-bar');
  private barFill = document.getElementById('boss-fill');
  private barName = document.querySelector('#boss-bar .name');

  constructor(x: number, z: number, facing: number) {
    this.home.set(x, 0, z); this.root.position.copy(this.home); this.facing = this.homeFacing = facing; this.root.rotation.y = facing;
  }
  get pos(): THREE.Vector3 { return this.root.position; }
  get extras(): THREE.Object3D[] { return [this.fxGroup]; }
  /** True while it owns the boss bar (awake and alive). */
  get barActive(): boolean { return this.loaded && !this.dead && this.state !== 'dormant'; }
  useFx(fx: Fx, sheets: HydraSheets): void { this.fx = fx; this.sh = sheets; }

  async load(url: string, metaUrl: string): Promise<void> {
    const [gltf, meta] = await Promise.all([new GLTFLoader().loadAsync(url), fetch(metaUrl).then((r) => r.json())]);
    this.clips = meta.clips; this.heads = meta.heads ?? []; this.mouth = meta.mouth ?? null; this.cy = meta.centerY ?? -0.25; const sc = this.S / meta.length;
    this.model = gltf.scene; this.model.scale.setScalar(sc); this.model.position.z = this.cy * this.S;   // the body (not mid-tail) sits on the root
    this.src = { scene: gltf.scene, animations: gltf.animations, scale: sc };                              // for the swimming Naga (src/swimmer.ts)
    this.root.add(this.model);
    this.model.traverse((o) => { const m = o as THREE.Mesh; if (!m.isMesh) return; m.castShadow = true; m.frustumCulled = false; const mat = m.material as THREE.MeshStandardMaterial; if (mat?.isMeshStandardMaterial) { mat.metalness = 0; mat.roughness = 0.75; this.mats.push(mat); } });
    this.mixer = new THREE.AnimationMixer(this.model);
    for (const c of gltf.animations) { const n = c.name.replace(/^.*[|:]/, ''); const a = this.mixer.clipAction(c); a.setLoop(this.clips[n]?.loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity); a.clampWhenFinished = true; this.actions.set(n, a); }
    this.play('Idle', 0); this.loaded = true;
  }

  private play(name: string, fade = 0.25, speed = 1): void {
    const next = this.actions.get(name) ?? (name === 'Walk' ? this.actions.get('Move') : undefined); if (!next) return; next.timeScale = speed * (this.enraged ? 1.25 : 1);
    if (this.cur === next && next.loop === THREE.LoopRepeat) return;
    next.reset(); next.setEffectiveWeight(1); next.play(); if (this.cur && this.cur !== next) this.cur.crossFadeTo(next, fade, false); this.cur = next;
  }
  private len(name: string): number { return (this.clips[name]?.duration ?? 1.5) / (this.enraged ? 1.25 : 1); }
  private hitAt(name: string): number { return (this.clips[name]?.hitTime ?? 0.66) / (this.enraged ? 1.25 : 1); }

  /** World position of head i's mouth (from the head layout in the clip json). */
  headPos(i: number, out = new THREE.Vector3()): THREE.Vector3 {
    let lx: number, ly: number, lz: number;
    if (this.mouth) { const [mx, my, mz] = this.mouth; lx = mx * this.S; ly = mz * this.S; lz = (-my + this.cy) * this.S + 0.6; }
    else { const [hx, hy] = this.heads[i] ?? [0, -0.45]; lx = hx * this.S; ly = 0.31 * this.S; lz = (-hy + this.cy) * this.S + 0.6; }
    const c = Math.cos(this.facing), s = Math.sin(this.facing);
    return out.set(this.pos.x + lx * c + lz * s, this.pos.y + ly, this.pos.z - lx * s + lz * c);
  }

  wakeNow(): void { this.wake = true; }
  hurt(amount: number, _dx: number, _dz: number, _k: number, _heavy: boolean): void {
    if (this.dead || !this.loaded) return;
    this.hp = Math.max(0, this.hp - amount); this.flash = 0.12; if (this.state === 'dormant') this.wake = true;
    if (this.hp <= 0) { this.dead = true; this.state = 'dead'; this.stateT = 0; this.deadT = 0; this.clearTele(); this.play('Death', 0.2); }
  }

  update(dt: number, hero: THREE.Vector3, hooks: BossHooks): void {
    if (!this.loaded) return;
    const px = this.pos.x, pz = this.pos.z;
    this.stateT += dt; this.mixer?.update(dt);
    this.flash = Math.max(0, this.flash - dt); for (const m of this.mats) { m.emissive.setRGB(1, 0.5, 0.3); m.emissiveIntensity = (this.flash / 0.12) * 0.5; }
    this.updateAttacks(dt, hero, hooks); this.updateBar();
    if (this.dead) { this.deadT += dt; if (this.deadT - dt <= 0) { hooks.sound('die'); hooks.shake(1.0); hooks.ring(this.pos.clone().setY(0.1), 2, 16, 1.4, 0xffd27a); } return; }
    const dx = hero.x - this.pos.x, dz = hero.z - this.pos.z, dist = Math.hypot(dx, dz), want = Math.atan2(dx, dz);
    const turn = (rate: number) => { let d = want - this.facing; d = Math.atan2(Math.sin(d), Math.cos(d)); this.facing += Math.max(-rate * dt, Math.min(rate * dt, d)); this.root.rotation.y = this.facing; };
    const fromHome = Math.hypot(hero.x - this.home.x, hero.z - this.home.z);
    if (this.state !== 'dormant' && fromHome > 70) { this.respawn(); return; }                // he ran off: back to its post, whole again (and its bar hides)
    if (!this.enraged && this.hp <= this.maxHp / 2 && this.state === 'fight') { this.enraged = true; this.state = 'roar'; this.stateT = 0; this.play('Roar', 0.2); hooks.sound('roar'); hooks.shake(0.8); hooks.ring(this.pos.clone().setY(0.1), 2, 14, 0.9, 0xff5a2a); return; }

    switch (this.state) {
      case 'dormant':
        if (fromHome < WAKE || this.wake) { this.wake = false; this.state = 'roar'; this.stateT = 0; this.play('Roar', 0.2); hooks.sound('roar'); hooks.shake(0.6); hooks.ring(this.pos.clone().setY(0.1), 2, 12, 0.8, 0xffb060); }
        else { let d = this.homeFacing - this.facing; d = Math.atan2(Math.sin(d), Math.cos(d)); this.facing += d * Math.min(1, dt); this.root.rotation.y = this.facing; }
        break;
      case 'roar': turn(1.2); if (this.stateT >= this.len('Roar') * 0.9) { this.state = 'fight'; this.stateT = 0; this.play('Idle', 0.3); } break;
      case 'fight': {
        this.cd -= dt;
        const homeD = Math.hypot(this.pos.x - this.home.x, this.pos.z - this.home.z);
        // slither: always on the move like a great snake - circle the hero at 8-12 m, swap direction now and then,
        // turn gradually (it steers by its head), stay inside the lair; only a strike stops it
        this.circleT -= dt; if (this.circleT <= 0) { this.circleSide = -this.circleSide; this.circleT = 4 + Math.random() * 4; }
        let tx: number, tz: number;
        if (fromHome > LEASH + 14 || homeD > LEASH) { tx = this.home.x; tz = this.home.z; }                       // hero ran off / too far out: back to the gate
        else {
          const ux = -dx / Math.max(dist, 0.01), uz = -dz / Math.max(dist, 0.01); const want = dist > 12 ? 9 : dist < 8 ? 11 : 10;
          tx = hero.x + ux * want + uz * 6 * this.circleSide; tz = hero.z + uz * want - ux * 6 * this.circleSide;      // a point on the circle, ahead of it
        }
        const head = Math.atan2(tx - this.pos.x, tz - this.pos.z); let dh = head - this.facing; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
        this.facing += Math.max(-0.9 * dt, Math.min(0.9 * dt, dh)); this.root.rotation.y = this.facing;
        if (Math.hypot(tx - this.pos.x, tz - this.pos.z) > 1.5) { this.play('Walk', 0.4, 1.0); this.step(this.facing, this.enraged ? 4.2 : 3.4, dt); }
        else this.play('Idle', 0.4);
        if (this.cd <= 0 && fromHome < LEASH + 14) {
          this.head = this.next; this.next = (this.next + 1 + (Math.random() < 0.3 ? 1 : 0)) % 5;
          this.second = this.enraged && Math.random() < 0.45 ? (this.head + 2) % 5 : -1;
          this.state = 'strike'; this.stateT = 0; this.struck = false; this.play(`Strike${this.head}`, 0.15); this.telegraph(this.head, hero);
          if (this.second >= 0) this.telegraph(this.second, hero);
          hooks.sound('warn');
        }
        break; }
      case 'strike': {
        const hit = this.hitAt(`Strike${this.head}`); if (this.stateT < hit * 0.7) turn(1.2);
        for (const t of this.tele) { const m = t.material as THREE.MeshBasicMaterial; m.opacity = 0.15 + 0.4 * Math.min(1, this.stateT / hit); }
        if (!this.struck && this.stateT >= hit) { this.struck = true; this.clearTele(); this.unleash(this.head, hero, hooks); if (this.second >= 0) this.unleash(this.second, hero, hooks); }
        if (this.stateT >= this.len(`Strike${this.head}`) * 0.9) { this.state = 'fight'; this.stateT = 0; this.cd = (this.enraged ? 1.3 : 2.1) + Math.random() * 0.8; }
        break; }
      default: break;
    }
    settle(this.pos, px, pz, 0); this.pos.y = walk.h(this.pos.x, this.pos.z);
  }
  private step(a: number, v: number, dt: number): void { this.pos.x += Math.sin(a) * v * dt; this.pos.z += Math.cos(a) * v * dt; }

  // ---------------------------------------------------------------- attacks
  private mark(color: number, geo: THREE.BufferGeometry, at: THREE.Vector3, rotY = 0): THREE.Mesh {
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide }));
    m.rotation.set(-Math.PI / 2, 0, rotY); m.position.set(at.x, walk.h(at.x, at.z) + 0.07, at.z); m.renderOrder = 2; this.fxGroup.add(m); return m;
  }
  private clearTele(): void { for (const t of this.tele) t.removeFromParent(); this.tele = []; }

  /** Wind-up warnings drawn on the ground while the head rears back. */
  private telegraph(i: number, hero: THREE.Vector3): void {
    const el = ELEMENTS[i], col = COLORS[el];
    if (el === 'fire') {                                                                 // cone from the mouth toward the hero
      const hp = this.headPos(i); const a = Math.atan2(hero.x - hp.x, hero.z - hp.z);
      const g = new THREE.CircleGeometry(12, 24, Math.PI / 2 - 0.45, 0.9); this.tele.push(this.mark(col, g, hp, a + Math.PI));
    } else if (el === 'earth') this.tele.push(this.mark(col, new THREE.RingGeometry(this.radius + 0.5, this.radius + 1.2, 48), this.pos));
    else if (el === 'ice') { const hp = this.headPos(i); const a = Math.atan2(hero.x - hp.x, hero.z - hp.z); this.tele.push(this.mark(col, new THREE.CircleGeometry(14, 20, Math.PI / 2 - 0.55, 1.1), hp, a + Math.PI)); }
    else if (el === 'poison') for (let k = 0; k < 3; k++) { const at = hero.clone().add(new THREE.Vector3((Math.random() - 0.5) * 6 * (k ? 1 : 0), 0, (Math.random() - 0.5) * 6 * (k ? 1 : 0))); this.lobs.push({ at, t: -0.2 - k * 0.15, mark: this.mark(col, new THREE.CircleGeometry(2.2, 28), at) }); }
    else if (el === 'lightning') for (let k = 0; k < 4; k++) { const at = hero.clone().add(new THREE.Vector3(k ? (Math.random() - 0.5) * 8 : 0, 0, k ? (Math.random() - 0.5) * 8 : 0)); this.strikes.push({ at, t: -0.1 - k * 0.22, mark: this.mark(col, new THREE.RingGeometry(1.3, 1.7, 32), at) }); }
  }

  private unleash(i: number, hero: THREE.Vector3, hooks: BossHooks): void {
    const el = ELEMENTS[i], col = COLORS[el], hp = this.headPos(i);
    hooks.burst(hp, 14, 4, col);
    if (el === 'fire') { this.breath = { t: 0, hit: false, ang: Math.atan2(hero.x - hp.x, hero.z - hp.z), at: hp.clone() }; hooks.sound('roar'); }
    else if (el === 'ice') {
      const a0 = Math.atan2(hero.x - hp.x, hero.z - hp.z);
      for (let k = -2; k <= 2; k++) {
        const a = a0 + k * 0.2, dir = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
        const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.35, 0).scale(0.6, 0.6, 2.2), new THREE.MeshBasicMaterial({ color: 0xcff0ff, toneMapped: false }));
        m.position.copy(hp).setY(walk.h(hp.x, hp.z) + 1.4); m.rotation.y = a; this.fxGroup.add(m); this.shards.push({ m, dir, d: 0 });
      }
    } else if (el === 'earth') {
      hooks.shake(0.9); hooks.sound('slam'); hooks.burst(this.pos.clone().setY(0.4), 30, 6, col);
      const m = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 64), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }));
      m.rotation.x = -Math.PI / 2; m.position.copy(this.pos).setY(this.pos.y + 0.15); this.fxGroup.add(m); this.rings.push({ m, r: this.radius, hit: false });
      if (this.fx && this.sh.wave) { const w = this.fx.groundFlip(this.sh.wave, this.pos, 10, 14); (w.material as THREE.MeshBasicMaterial).color.setHex(col); }
    }
    // poison and lightning were armed by the telegraph; they land on their own timers
  }

  private updateAttacks(dt: number, hero: THREE.Vector3, hooks: BossHooks): void {
    if (this.breath) {                                                                   // fire breath: 1.1 s of flame along the cone
      const b = this.breath; b.t += dt;
      if (this.fx && this.sh.flame && Math.random() < 0.8) { const d = 1.5 + Math.random() * 10, a = b.ang + (Math.random() - 0.5) * 0.8 * (d / 12);
        const p = b.at.clone().add(new THREE.Vector3(Math.sin(a) * d, 0, Math.cos(a) * d)); p.y = 0.6 + d * 0.06; this.fx.flip(this.sh.flame, p, 1.6 + d * 0.25, 22); }
      else if (Math.random() < 0.6) hooks.burst(b.at.clone().add(new THREE.Vector3(Math.sin(b.ang) * 5, 0, Math.cos(b.ang) * 5)).setY(1), 6, 4, 0xff6a20);
      if (!b.hit) { const dx = hero.x - b.at.x, dz = hero.z - b.at.z, d = Math.hypot(dx, dz), off = Math.abs(Math.atan2(Math.sin(Math.atan2(dx, dz) - b.ang), Math.cos(Math.atan2(dx, dz) - b.ang)));
        if (d < 12 && off < 0.45 + 0.1 && b.t > 0.15) { if (hooks.hitHero(b.at.x, b.at.z, true, atk('nagaBreath'))) b.hit = true; } }
      if (b.t > 1.1) this.breath = null;
    }
    for (let i = this.shards.length - 1; i >= 0; i--) {                                 // ice shards
      const s = this.shards[i]; const step = 15 * dt; s.d += step; s.m.position.addScaledVector(s.dir, step); s.m.rotation.z += dt * 8;
      if (Math.random() < 0.4) hooks.burst(s.m.position.clone(), 1, 0.5, 0xcff0ff);
      const hit = Math.hypot(hero.x - s.m.position.x, hero.z - s.m.position.z) < 0.7;
      if (hit) hooks.hitHero(s.m.position.x - s.dir.x, s.m.position.z - s.dir.z, false, atk('nagaShard'));
      if (hit || s.d > 18) { hooks.burst(s.m.position.clone(), 8, 2.5, 0xcff0ff); s.m.removeFromParent(); this.shards.splice(i, 1); }
    }
    for (let i = this.lobs.length - 1; i >= 0; i--) {                                   // poison: the bile lands, leaving a pool
      const l = this.lobs[i]; l.t += dt; if (l.t < 0) continue; (l.mark.material as THREE.MeshBasicMaterial).opacity = 0.2 + 0.4 * Math.min(1, l.t);
      if (l.t >= 1.0) {
        l.mark.removeFromParent(); this.lobs.splice(i, 1); hooks.burst(l.at.clone().setY(0.4), 16, 4, 0x6aff4a);
        const m = this.mark(0x3aff2a, new THREE.CircleGeometry(2.2, 28), l.at); (m.material as THREE.MeshBasicMaterial).opacity = 0.55; (m.material as THREE.MeshBasicMaterial).blending = THREE.AdditiveBlending;
        this.pools.push({ m, at: l.at, t: 0, tick: 0.3 });
      }
    }
    for (let i = this.pools.length - 1; i >= 0; i--) {
      const p = this.pools[i]; p.t += dt; p.tick -= dt; (p.m.material as THREE.MeshBasicMaterial).opacity = 0.55 * (1 - p.t / 4.5) * (0.8 + 0.2 * Math.sin(p.t * 6));
      if (Math.random() < 0.15) hooks.burst(p.at.clone().add(new THREE.Vector3((Math.random() - 0.5) * 3, 0.1, (Math.random() - 0.5) * 3)), 1, 1, 0x6aff4a);
      if (p.tick <= 0 && Math.hypot(hero.x - p.at.x, hero.z - p.at.z) < 2.1) { p.tick = 0.9; hooks.hitHero(p.at.x, p.at.z, false, atk('nagaPool')); }
      if (p.t > 4.5) { p.m.removeFromParent(); this.pools.splice(i, 1); }
    }
    for (let i = this.strikes.length - 1; i >= 0; i--) {                                // lightning: bolts from the sky on the marks
      const s = this.strikes[i]; s.t += dt; if (s.t < 0) continue; (s.mark.material as THREE.MeshBasicMaterial).opacity = 0.25 + 0.5 * Math.min(1, s.t / 0.9) * (0.7 + 0.3 * Math.sin(s.t * 30));
      if (s.t >= 0.95) {
        s.mark.removeFromParent(); this.strikes.splice(i, 1); hooks.shake(0.3); hooks.burst(s.at.clone().setY(0.3), 18, 5, 0xffe86a); hooks.ring(s.at.clone().setY(0.1), 0.3, 2.2, 0.35, 0xffe86a);
        if (this.fx && this.sh.lightning) this.fx.beam(this.sh.lightning, s.at.clone().setY(16), s.at.clone().setY(0.2), 30);
        if (this.fx && this.sh.impact) { const f = this.fx.flip(this.sh.impact, s.at.clone().setY(0.6), 3, 30); (f.material as THREE.SpriteMaterial).color.setHex(0xfff0a0); }
        if (Math.hypot(hero.x - s.at.x, hero.z - s.at.z) < 1.7) hooks.hitHero(s.at.x, s.at.z, true, atk('nagaStrike'));
      }
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {                                  // earth: shockwave rolls outward
      const r = this.rings[i]; r.r += 11 * dt; r.m.scale.setScalar(r.r); (r.m.material as THREE.MeshBasicMaterial).opacity = 0.85 * (1 - r.r / 16);
      if (Math.random() < 0.6) { const a = Math.random() * 6.28; hooks.burst(r.m.position.clone().add(new THREE.Vector3(Math.sin(a) * r.r, 0.2, Math.cos(a) * r.r)), 2, 2, 0xc89050); }
      if (!r.hit && Math.abs(Math.hypot(hero.x - r.m.position.x, hero.z - r.m.position.z) - r.r) < 0.8) { if (hooks.hitHero(r.m.position.x, r.m.position.z, true, atk('nagaRing'))) r.hit = true; }
      if (r.r > 16) { r.m.removeFromParent(); this.rings.splice(i, 1); }
    }
  }

  private updateBar(): void {
    if (!this.bar || !this.barFill || !this.barActive) return;
    if (this.barName) this.barName.textContent = 'NAGA DRAGON — KEEPER OF THE GATE';
    this.bar.classList.add('show'); this.bar.classList.toggle('enraged', this.enraged); this.barFill.style.width = `${(100 * this.hp) / this.maxHp}%`; setBossHp(this.hp, this.maxHp);
  }

  respawn(): void {
    this.dead = false; this.hp = this.maxHp; this.enraged = false; this.wake = false; this.cd = 2.5; this.next = 0;
    this.root.position.copy(this.home).setY(walk.h(this.home.x, this.home.z)); this.facing = this.homeFacing; this.root.rotation.y = this.facing;
    this.clearTele(); for (const l of [...this.lobs, ...this.strikes]) l.mark.removeFromParent(); for (const p of this.pools) p.m.removeFromParent(); for (const s of this.shards) s.m.removeFromParent(); for (const r of this.rings) r.m.removeFromParent();
    this.lobs = []; this.strikes = []; this.pools = []; this.shards = []; this.rings = []; this.breath = null;
    this.state = 'dormant'; this.stateT = 0; if (this.loaded) this.play('Idle', 0.1);
  }
}
