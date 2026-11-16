import * as THREE from 'three';
import { HP_SCALE, atk, type AtkId } from './stats';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { Fx, FlipSheet } from './fx';
import type { BossHooks } from './boss';
import { settle, walk } from './world';

/**
 * Camp minions:
 *   ghoul  - fast melee: runs in, crouches (telegraph), lunges and claws
 *   sword  - undead warrior with a dha: runs in and slashes (red cone telegraph)
 *   lance  - undead warrior with a lance: marches in and thrusts from further out (long narrow telegraph)
 *   caster - horned caster: keeps 6-10 m away, throws a slow purple bolt
 *   archer - goblin archer: crouches at 7-11 m, shuffles to keep the range, looses fast straight arrows (sidestep or dash)
 *   ghost  - female ghost: floats at 6-9 m, screams a widening sound-wave arc that rolls toward the hero (dash through it)
 *   monk   - drowned monk (the Sunken Monastery): shambles in and clubs with his alms bowl (fights like a sword warrior, shorter reach)
 * They guard a home spot, the whole camp wakes together, give up past a leash, die and come back later.
 * The ghoul and caster have no attack/death clips yet: those are done in code (squash / lean / topple).
 */
export type MinionKind = 'ghoul' | 'caster' | 'sword' | 'lance' | 'ghost' | 'archer' | 'king' | 'chief' | 'commander' | 'banshee' | 'monk' | 'abbot';
/** Elites fight like their base kind: the Goblin Chief like an archer, the commander like a sword warrior, the Banshee like a ghost. */
const ROLE: Partial<Record<MinionKind, MinionKind>> = { chief: 'archer', commander: 'sword', banshee: 'ghost', king: 'sword', monk: 'sword', abbot: 'sword' };
type MState = 'idle' | 'chase' | 'windup' | 'lunge' | 'swing' | 'cast' | 'recover' | 'return' | 'dead';
interface ClipInfo { duration: number; speed: number; loop?: boolean; hitTime?: number; end?: number }
interface Asset { scene: THREE.Object3D; clips: THREE.AnimationClip[]; meta: Record<string, ClipInfo>; height: number }

const SPEC: Record<MinionKind, { title?: string; asset: string; height: number; hp: number; radius: number; speed: number; aggro: number; leash: number; move: string; reach?: number; arc?: number; float?: number }> = {
  ghoul: { asset: 'ghoul', height: 1.75, hp: 5, radius: 0.45, speed: 4.6, aggro: 9, leash: 17, move: 'Run' },
  sword: { asset: 'warrior', height: 1.85, hp: 7, radius: 0.45, speed: 4.0, aggro: 9, leash: 17, move: 'Run', reach: 2.4, arc: 1.0 },
  lance: { asset: 'warrior', height: 1.85, hp: 7, radius: 0.45, speed: 2.4, aggro: 10, leash: 17, move: 'Walk', reach: 3.4, arc: 0.45 },
  caster: { asset: 'caster', height: 2.0, hp: 4, radius: 0.45, speed: 2.6, aggro: 12, leash: 19, move: 'Idle' },
  king: { title: 'The Undead King', asset: 'king', height: 2.7, hp: 30, radius: 0.7, speed: 3.0, aggro: 8, leash: 15, move: 'Walk', reach: 3.4, arc: 1.3 },
  chief: { title: 'Goblin Chief', asset: 'chief', height: 2.0, hp: 22, radius: 0.6, speed: 2.8, aggro: 14, leash: 22, move: 'Walk' },
  commander: { title: 'Undead Commander', asset: 'commander', height: 2.5, hp: 26, radius: 0.6, speed: 3.6, aggro: 11, leash: 20, move: 'Run', reach: 3.0, arc: 1.4 },
  banshee: { title: 'The Weeping Maid', asset: 'maid', height: 2.6, hp: 20, radius: 0.6, speed: 3.0, aggro: 14, leash: 22, move: 'Glide', float: 0.6 },
  archer: { asset: 'archer', height: 1.55, hp: 4, radius: 0.45, speed: 2.6, aggro: 13, leash: 19, move: 'Shuffle' },
  ghost: { asset: 'ghost', height: 2.1, hp: 4, radius: 0.45, speed: 3.0, aggro: 12, leash: 19, move: 'Glide', float: 0.45 },
  abbot: { title: 'The Drowned Abbot', asset: 'abbot', height: 3.0, hp: 26, radius: 0.7, speed: 2.6, aggro: 10, leash: 18, move: 'Walk', reach: 3.2, arc: 1.4 },
  monk: { asset: 'monk', height: 1.8, hp: 6, radius: 0.45, speed: 3.0, aggro: 9, leash: 17, move: 'Run', reach: 2.2, arc: 1.1 },
};
/** Seconds before a fallen camp unit returns (bosses and elites never do: `stayDead`). */
export const RESPAWN_S = 120;
const BOLT_SPEED = 8, BOLT_RANGE = 14, ARROW_SPEED = 17, ARROW_RANGE = 17;
const WAVE_SPEED = 9, WAVE_RANGE = 12, WAVE_ARC = 1.0;                 // scream: radians wide (the Banshee's is wider: see arc())
const assets = new Map<string, Promise<Asset>>();

/** Load each model once; every minion clones it (SkeletonUtils keeps the skin bound). */
function loadAsset(name: string, base: string): Promise<Asset> {
  let p = assets.get(name);
  if (!p) {
    p = Promise.all([new GLTFLoader().loadAsync(base + `assets/${name}.glb`), fetch(base + `assets/${name}-clips.json`).then((r) => r.json())]).then(([g, meta]) => {
      // run/walk clips carry the root bone forward; keep the body over the root (same fix as the hero's run)
      for (const clip of g.animations) for (const t of clip.tracks) {
        if (!t.name.endsWith('.position')) continue; const bone = g.scene.getObjectByName(t.name.split('.')[0]); if (!bone || (bone.parent as THREE.Bone)?.isBone) continue;
        const v = t.values, n = v.length / 3; let mx = 0, mz = 0; for (let i = 0; i < n; i++) { mx += v[i * 3]; mz += v[i * 3 + 2]; }
        for (let i = 0; i < n; i++) { v[i * 3] += bone.position.x - mx / n; v[i * 3 + 2] += bone.position.z - mz / n; }
      }
      return { scene: g.scene, clips: g.animations, meta: meta.clips, height: meta.height };
    });
    assets.set(name, p);
  }
  return p;
}

export class Minion {
  readonly root = new THREE.Group();
  readonly radius: number;
  readonly maxHp: number;
  hp: number;
  dead = false;
  /** Story foes (Chapter 1's king, shard holders and side bosses) stay dead once beaten; camp minions come back. */
  stayDead = false;
  state: MState = 'idle';
  stateT = 0;
  facing = 0;
  loaded = false;
  /** Set by spells: slowed (Mire) while slowT > 0, held fast while rootT > 0. */
  slowT = 0; rootT = 0;
  /** Stunned: frozen where it stands, its attack cut off. */
  stunT = 0;
  readonly home = new THREE.Vector3();
  /** How it fights (elites borrow their base kind's behaviour). */
  readonly role: MinionKind;
  /** Boss-bar name for elites. */
  get title(): string | undefined { return SPEC[this.kind].title; }
  /** Height of its overhead health bar above its feet. */
  get barHeight(): number { return SPEC[this.kind].height * (SPEC[this.kind].float ? 1.05 : 1) + 0.35; }
  /** The rest of its camp: when one wakes, they all come. */
  pack: Minion[] = [];
  private wakePack(): void { for (const m of this.pack) if (m !== this && !m.dead && (m.state === 'idle' || m.state === 'return')) m.setState('chase'); }

  private model: THREE.Object3D | null = null;
  private body = new THREE.Group();                    // procedural lean / squash / topple / float happens on this
  private mixer: THREE.AnimationMixer | null = null;
  private actions = new Map<string, THREE.AnimationAction>();
  private cur: THREE.AnimationAction | null = null;
  private meta: Record<string, ClipInfo> = {};
  private mats: THREE.MeshStandardMaterial[] = [];
  private flash = 0;
  private struck = false;
  private castCd = 1.5 + Math.random() * 2;
  private deadT = 0;
  private vel = new THREE.Vector3();
  private fx: Fx | null = null;
  private orbSheet: FlipSheet | null = null;
  private bolts: Array<{ obj: THREE.Object3D; dir: THREE.Vector3; dist: number; speed: number; range: number; arrow: boolean; y?: number }> = [];
  private waves: Array<{ mesh: THREE.Mesh; origin: THREE.Vector3; ang: number; r: number; hit: boolean; flip?: boolean }> = [];
  private cone: THREE.Mesh | null = null;
  private lungeDir = new THREE.Vector3();
  private steerSide = Math.random() < 0.5 ? 1 : -1;
  private detourT = 0; private stuckT = 0; private lastPos = new THREE.Vector3();
  private bobT = Math.random() * 6;

  constructor(readonly kind: MinionKind, x: number, z: number, facing: number) {
    this.role = ROLE[kind] ?? kind; const s = SPEC[kind]; this.radius = s.radius; this.maxHp = this.hp = s.hp * HP_SCALE;
    this.home.set(x, 0, z); this.root.position.copy(this.home); this.facing = facing; this.root.rotation.y = facing; this.root.add(this.body);
    if (s.reach) {                                                                       // warriors telegraph their swing on the ground
      const g = new THREE.CircleGeometry(s.reach, 24, Math.PI / 2 - s.arc! / 2, s.arc!);
      this.cone = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xff3b2f, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
      this.cone.rotation.x = Math.PI / 2; this.cone.position.y = 0.05; this.cone.visible = false; this.root.add(this.cone);
    }
  }
  get pos(): THREE.Vector3 { return this.root.position; }
  private waveSheet: FlipSheet | null = null;
  useFx(fx: Fx, orb: FlipSheet | undefined, wave?: FlipSheet): void { this.fx = fx; this.orbSheet = orb ?? null; this.waveSheet = wave ?? null; }

  /** Move the home spot to the nearest walkable ground (camp props and trees are placed after the camps were planned). */
  settleHome(): void {
    for (let r = 0; r < 6; r += 0.5) for (let a = 0; a < 6.28; a += 0.5) {
      const x = this.home.x + Math.cos(a) * r, z = this.home.z + Math.sin(a) * r;
      if (walk.ok(x, z) && walk.ok(x + 0.3, z) && walk.ok(x - 0.3, z) && walk.ok(x, z + 0.3) && walk.ok(x, z - 0.3)) { this.home.set(x, 0, z); this.pos.set(x, walk.h(x, z), z); return; }
    }
  }

  async load(base: string): Promise<void> {
    const s = SPEC[this.kind]; const a = await loadAsset(s.asset, base); this.meta = a.meta;
    this.model = SkeletonUtils.clone(a.scene); this.model.scale.setScalar(s.height / a.height); this.body.add(this.model);
    this.model.traverse((o) => {
      const m = o as THREE.Mesh; if (!m.isMesh) return;
      if (s.asset === 'warrior' && ((this.role === 'sword' && /Lance/i.test(o.name)) || (this.role === 'lance' && /Sword/i.test(o.name)))) { o.visible = false; return; }   // one weapon each
      m.castShadow = true; m.frustumCulled = false;
      const mat = (m.material as THREE.MeshStandardMaterial).clone(); mat.metalness = 0; mat.roughness = 0.85;
      if (this.role === 'ghost') { mat.transparent = true; mat.opacity = 0.82; mat.emissive.setHex(0x203038); mat.emissiveIntensity = 0.6; }
      m.material = mat; this.mats.push(mat);
    });
    // the elites wear their own Tripo models now (no tints, crown or cape added in code)
    this.mixer = new THREE.AnimationMixer(this.model);
    for (const clip of a.clips) { const n = clip.name.replace(/^.*[|:]/, ''); const ac = this.mixer.clipAction(clip); ac.setLoop(this.meta[n]?.loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity); ac.clampWhenFinished = true; this.actions.set(n, ac); }
    this.mixer.update(Math.random() * 2);
    this.play('Idle', 0); this.loaded = true;
  }

  /** Stun it (his combo's second hit, the Leap Strike). Elites shake it off in 60% of the time; it cancels a wind-up or a cast. */
  stun(sec: number): void {
    if (this.dead || !this.loaded) return; const s = sec * (SPEC[this.kind].title ? 0.6 : 1); if (s <= this.stunT) return;
    this.stunT = s; this.struck = true; if (this.cone) this.cone.visible = false; this.body.rotation.x = 0; this.body.scale.y = 1;
    if (this.actions.has('Hit')) this.play('Hit', 0.06);
  }

  private play(name: string, fade = 0.2, speed?: number): void {
    const next = this.actions.get(name); if (!next) return;
    next.timeScale = speed ?? this.meta[name]?.speed ?? 1;
    if (this.cur === next && next.loop === THREE.LoopRepeat) return;
    next.reset(); next.setEffectiveWeight(1); next.play();
    if (this.cur && this.cur !== next) fade > 0 ? this.cur.crossFadeTo(next, fade, false) : this.cur.stop();
    this.cur = next;
  }
  private get arc(): number { return this.kind === 'banshee' ? 2.2 : WAVE_ARC; }
  private get castClip(): string { return this.role === 'ghost' ? 'Scream' : this.role === 'archer' ? 'Shoot' : 'Cast'; }
  private clipTime(name: string, key: 'hitTime' | 'duration' | 'end', fallback: number): number { const c = this.meta[name]; return (c?.[key] ?? fallback) / (c?.speed ?? 1); }
  /** The attack clip this swing plays (the Undead King mixes in a wide sweep). */
  private swingClip = 'Slash';

  private setState(s: MState): void {
    this.state = s; this.stateT = 0; this.struck = false; if (this.cone) this.cone.visible = false;
    const spec = SPEC[this.kind];
    if (s === 'chase') this.play(spec.move, 0.2);
    if (s === 'return') this.play(this.role === 'sword' ? 'Walk' : spec.move, 0.2);
    if (s === 'idle' || s === 'recover') this.play('Idle', 0.25);
    if (s === 'cast') this.play(this.castClip, 0.15);
    if (s === 'swing') { this.swingClip = this.actions.has('Attack2') && Math.random() < 0.4 ? 'Attack2' : 'Slash'; this.play(this.swingClip, 0.12); if (this.cone) this.cone.visible = true; }
  }

  hurt(amount: number, dirX: number, dirZ: number, knockback: number, heavy: boolean): void {
    if (this.dead || !this.loaded) return;
    this.hp = Math.max(0, this.hp - amount); this.flash = 0.12;
    this.vel.set(dirX, 0, dirZ).multiplyScalar(knockback * (heavy ? 3.2 : 2));
    if (this.state === 'idle' || this.state === 'return') { this.setState('chase'); this.wakePack(); }
    if (this.hp <= 0) {
      this.dead = true; this.state = 'dead'; this.deadT = 0; if (this.cone) this.cone.visible = false;
      if (this.actions.has('Death')) this.play('Death', 0.12); else this.cur?.fadeOut(0.2);
    }
  }

  /** `near`: the hero is close enough to bother animating this one; far camps freeze, and are hidden past `show`. */
  update(dt: number, hero: THREE.Vector3, hooks: BossHooks, near: boolean, show = true): void {
    this.slowT = Math.max(0, this.slowT - dt); this.rootT = Math.max(0, this.rootT - dt);
    if (!this.loaded) return;
    this.updateBolts(dt, hero, hooks); this.updateWaves(dt, hero, hooks);
    this.root.visible = show && !(this.dead && this.deadT > 3.2);
    if (!near && this.state === 'idle') return;
    const px = this.pos.x, pz = this.pos.z;
    this.step(dt, hero, hooks);
    if (!this.dead) { settle(this.pos, px, pz, 0.25); this.pos.y = walk.h(this.pos.x, this.pos.z); }
  }

  private step(dt: number, hero: THREE.Vector3, hooks: BossHooks): void {
    this.stateT += dt; this.mixer?.update(dt);
    this.flash = Math.max(0, this.flash - dt); for (const m of this.mats) { if (this.role !== 'ghost') m.emissive.setRGB(1, 0.3, 0.3); m.emissiveIntensity = this.role === 'ghost' ? 0.6 + (this.flash / 0.12) : (this.flash / 0.12) * 0.8; }
    this.pos.addScaledVector(this.vel, dt); this.vel.multiplyScalar(Math.max(0, 1 - 9 * dt));
    const sp = SPEC[this.kind];
    if (sp.float && !this.dead) { this.bobT += dt; this.body.position.y = sp.float + Math.sin(this.bobT * 1.8) * 0.12; }
    if (this.dead) { this.die(dt, hooks, hero); return; }
    if (this.stunT > 0) { this.stunT -= dt; if (this.stunT <= 0) this.setState('recover'); return; }
    const dx = hero.x - this.pos.x, dz = hero.z - this.pos.z, dist = Math.hypot(dx, dz), want = Math.atan2(dx, dz);
    const fromHome = Math.hypot(hero.x - this.home.x, hero.z - this.home.z);
    const face = (a: number, rate: number) => { let d = a - this.facing; d = Math.atan2(Math.sin(d), Math.cos(d)); this.facing += Math.max(-rate * dt, Math.min(rate * dt, d)); this.root.rotation.y = this.facing; };
    const clear = (a: number) => {                                                     // a body-wide lane 1.2 m ahead is free
      const fx = Math.sin(a), fz = Math.cos(a);
      for (const d of [0.6, 1.2]) for (const sdev of [-0.35, 0, 0.35]) if (!walk.ok(this.pos.x + fx * d + fz * sdev, this.pos.z + fz * d - fx * sdev)) return false;
      return true;
    };
    const move = (a0: number, v: number) => {                                         // steer round trees and rocks: try the way ahead, then fan out
      if (this.detourT > 0) { this.detourT -= dt; a0 += 1.5 * this.steerSide; }
      let a = a0; for (const off of [0, 0.6, -0.6, 1.2, -1.2, 1.8, -1.8, 2.5, -2.5]) { if (clear(a0 + off * this.steerSide)) { a = a0 + off * this.steerSide; break; } }
      const vv = v * (this.rootT > 0 ? 0 : this.slowT > 0 ? 0.4 : 1); this.pos.x += Math.sin(a) * vv * dt; this.pos.z += Math.cos(a) * vv * dt;
      this.stuckT += dt;                                                                    // no progress for half a second: swing wide the other way
      if (this.stuckT > 0.5) { if (this.pos.distanceTo(this.lastPos) < 0.4) { this.steerSide = -this.steerSide; this.detourT = 0.9; } this.stuckT = 0; this.lastPos.copy(this.pos); }
    };
    this.body.rotation.x *= Math.max(0, 1 - 10 * dt); this.body.scale.y += (1 - this.body.scale.y) * Math.min(1, 10 * dt);
    this.castCd -= dt;
    const ranged = this.role === 'caster' || this.role === 'ghost' || this.role === 'archer';

    switch (this.state) {
      case 'idle': if (fromHome < sp.aggro) { this.setState('chase'); this.wakePack(); } break;
      case 'chase':
        if (fromHome > sp.leash) { this.setState('return'); break; }
        face(want, 6);
        if (this.role === 'ghoul') { if (dist < 1.9) { this.setState('windup'); hooks.sound('warn'); break; } move(this.facing, sp.speed); }
        else if (sp.reach) { if (dist < sp.reach - 0.3) { this.setState('swing'); hooks.sound('warn'); break; } move(this.facing, sp.speed); }
        else if (ranged) {
          if (this.castCd <= 0 && dist < (this.role === 'ghost' ? 10 : this.role === 'archer' ? 14 : 12)) { this.castCd = (this.role === 'ghost' ? 3.8 : this.role === 'archer' ? 2.4 : 3.2) + Math.random(); this.setState('cast'); break; }
          const near2 = this.role === 'ghost' ? 5.5 : this.role === 'archer' ? 7 : 5, far2 = this.role === 'ghost' ? 8.5 : this.role === 'archer' ? 11 : 9;
          if (dist < near2) move(want + Math.PI, sp.speed); else if (dist > far2) move(want, sp.speed);   // keep its distance
        }
        break;
      case 'windup':                                                                 // ghoul: crouch back, then spring
        face(want, 5); this.body.rotation.x = -0.35 * Math.min(1, this.stateT / 0.35); this.body.scale.y = 1 - 0.12 * Math.min(1, this.stateT / 0.35);
        if (this.stateT >= 0.42) { this.lungeDir.set(Math.sin(this.facing), 0, Math.cos(this.facing)); this.setState('lunge'); }
        break;
      case 'lunge':
        this.body.rotation.x = 0.45; if (this.stateT < 0.22) move(this.facing, 9);
        if (!this.struck && this.stateT >= 0.12) {
          this.struck = true; const ang = Math.abs(Math.atan2(Math.sin(want - this.facing), Math.cos(want - this.facing)));
          hooks.burst(this.pos.clone().add(this.lungeDir.clone().multiplyScalar(0.9)).setY(1.0), 8, 3, 0xd04040);
          if (dist < 1.9 && ang < 1.0 && Math.abs(hero.y - this.pos.y) < 1.4) hooks.hitHero(this.pos.x, this.pos.z, false, atk(this.kind as AtkId));   // can't reach him up on a ledge
        }
        if (this.stateT >= 0.45) this.setState('recover');
        break;
      case 'swing': {                                                                  // warriors: telegraphed slash / thrust from the clip's impact frame
        const clip = this.swingClip, hit = this.clipTime(clip, 'hitTime', 1.0); if (this.stateT < hit - 0.2) face(want, 3);
        if (this.cone) (this.cone.material as THREE.MeshBasicMaterial).opacity = this.stateT < hit ? 0.12 + 0.35 * (this.stateT / hit) : 0;
        if (!this.struck && this.stateT >= hit) {
          this.struck = true; if (this.cone) this.cone.visible = false;
          const ang = Math.abs(Math.atan2(Math.sin(want - this.facing), Math.cos(want - this.facing)));
          hooks.burst(this.pos.clone().add(new THREE.Vector3(Math.sin(this.facing), 0, Math.cos(this.facing)).multiplyScalar(sp.reach! * 0.6)).setY(1.0), 10, 3.5, 0xffd0a0);
          if (dist < sp.reach! + 0.3 && ang < sp.arc! / 2 + 0.2 && Math.abs(hero.y - this.pos.y) < (this.kind === 'lance' ? 2.0 : 1.4)) hooks.hitHero(this.pos.x, this.pos.z, false, atk(this.kind as AtkId));
        }
        if (this.stateT >= (this.meta[clip]?.end ? this.clipTime(clip, 'end', 2) : this.clipTime(clip, 'duration', 2) * 0.8)) this.setState('recover');
        break; }
      case 'cast': {
        face(want, 3); const clip = this.castClip; const hit = this.clipTime(clip, 'hitTime', 1.0);
        if (!this.struck && this.stateT >= hit) { this.struck = true; if (this.role === 'ghost') this.scream(hooks); else if (this.role === 'archer') { this.fireArrow(hero, 0); if (this.kind === 'chief') { this.fireArrow(hero, 0.2); this.fireArrow(hero, -0.2); } } else this.fireBolt(hero); }
        if (this.stateT >= this.clipTime(clip, 'duration', 2.0) * 0.85) this.setState('recover');
        break; }
      case 'recover': face(want, 3); if (this.stateT >= (this.role === 'ghoul' ? 0.55 : 0.4)) this.setState(fromHome > sp.leash ? 'return' : 'chase'); break;
      case 'return': {
        const hx = this.home.x - this.pos.x, hz = this.home.z - this.pos.z, hd = Math.hypot(hx, hz); this.hp = Math.min(this.maxHp, this.hp + dt * 2 * HP_SCALE);
        if (fromHome < sp.aggro * 0.8) { this.setState('chase'); break; }
        if (hd < 0.5) { this.setState('idle'); break; }
        face(Math.atan2(hx, hz), 5); move(this.facing, Math.min(sp.speed, 3) * 0.8); break; }
      default: break;
    }
  }

  private fireBolt(hero: THREE.Vector3): void {
    const fwd = new THREE.Vector3(Math.sin(this.facing), 0, Math.cos(this.facing)); const start = this.pos.clone().addScaledVector(fwd, 0.6);
    const dir = hero.clone().sub(start).setY(0); if (dir.lengthSq() < 0.01) dir.copy(fwd); dir.normalize();
    let obj: THREE.Object3D;
    if (this.fx && this.orbSheet) { const s = this.fx.flip(this.orbSheet, start.clone().setY(1.3), 1.1, 24, true); (s.material as THREE.SpriteMaterial).color.setHex(0xb04cff); obj = s; }
    else { obj = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), new THREE.MeshBasicMaterial({ color: 0xb04cff })); obj.position.copy(start); this.root.parent?.add(obj); }
    this.bolts.push({ obj, dir, dist: 0, speed: BOLT_SPEED, range: BOLT_RANGE, arrow: false, y: this.pos.y + 1.2 });
  }

  /** Archer: a fast straight arrow (shaft, iron head, green fletching) aimed where the hero is now. */
  private fireArrow(hero: THREE.Vector3, spread = 0): void {
    const fwd = new THREE.Vector3(Math.sin(this.facing), 0, Math.cos(this.facing)); const start = this.pos.clone().addScaledVector(fwd, 0.7);
    const dir = hero.clone().sub(start).setY(0); if (dir.lengthSq() < 0.01) dir.copy(fwd); dir.normalize(); if (spread) dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), spread);
    const g = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.9, 5).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x8a6a40 }));
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.14, 5).rotateX(Math.PI / 2).translate(0, 0, 0.5), new THREE.MeshBasicMaterial({ color: 0x9aa0a8 }));
    const fl = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.01, 0.16).translate(0, 0, -0.38), new THREE.MeshBasicMaterial({ color: 0x6ab040 }));
    g.add(shaft, head, fl, fl.clone().rotateZ(Math.PI / 2)); g.position.copy(start); g.rotation.y = Math.atan2(dir.x, dir.z); this.root.parent?.add(g);
    this.bolts.push({ obj: g, dir, dist: 0, speed: ARROW_SPEED, range: ARROW_RANGE, arrow: true, y: this.pos.y + 1.1 });
  }

  /** Ghost scream: a pale arc of sound rolls out toward the hero, widening as it goes. */
  private scream(hooks: BossHooks): void {
    if (this.fx && this.waveSheet) {                                                  // GPT sound-wave flipbook: the arcs spread from the cell's left edge toward +X
      const origin = this.pos.clone(); const size = WAVE_RANGE * 1.15, fwd = new THREE.Vector3(Math.sin(this.facing), 0, Math.cos(this.facing));
      const m = this.fx.groundFlip(this.waveSheet, origin.clone().addScaledVector(fwd, size * 0.38), size, 16 / (WAVE_RANGE / WAVE_SPEED));
      m.rotation.z = this.facing - Math.PI / 2; m.position.y += 0.9;
      this.waves.push({ mesh: m, origin, ang: this.facing, r: 0.8, hit: false, flip: true });
      hooks.ring(origin.clone().setY(1.2), 0.3, 1.6, 0.35, 0xbfe8ff); hooks.sound('roar'); return;
    }
    const mesh = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 32, 1, Math.PI / 2 - this.arc / 2, this.arc),
      new THREE.MeshBasicMaterial({ color: 0xbfe8ff, transparent: true, opacity: 0.75, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    mesh.rotation.set(-Math.PI / 2, 0, 0); mesh.renderOrder = 3; this.root.parent?.add(mesh);
    const origin = this.pos.clone(); this.waves.push({ mesh, origin, ang: this.facing, r: 0.8, hit: false });
    hooks.ring(origin.clone().setY(1.2), 0.3, 1.6, 0.35, 0xbfe8ff); hooks.sound('roar');
  }

  private updateWaves(dt: number, hero: THREE.Vector3, hooks: BossHooks): void {
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const w = this.waves[i]; w.r += WAVE_SPEED * dt; const k = w.r / WAVE_RANGE;
      if (!w.flip) {
        w.mesh.position.set(w.origin.x, walk.h(w.origin.x, w.origin.z) + 0.9, w.origin.z); w.mesh.scale.setScalar(w.r);
        w.mesh.rotation.set(-Math.PI / 2, 0, w.ang + Math.PI);                              // the arc's middle (+Y of the shape) points along the scream
        (w.mesh.material as THREE.MeshBasicMaterial).opacity = 0.75 * (1 - k);
      }
      if (!w.hit) {
        const dx = hero.x - w.origin.x, dz = hero.z - w.origin.z, d = Math.hypot(dx, dz), a = Math.atan2(dx, dz);
        const off = Math.abs(Math.atan2(Math.sin(a - w.ang), Math.cos(a - w.ang)));
        if (Math.abs(d - w.r) < 0.7 && off < this.arc / 2 + 0.1 && Math.abs(hero.y - w.origin.y) < 1.8) { w.hit = true; hooks.hitHero(w.origin.x, w.origin.z, false, atk(this.kind as AtkId)); }
      }
      if (w.r > WAVE_RANGE) { if (!w.flip) w.mesh.removeFromParent(); this.waves.splice(i, 1); }
    }
  }

  private updateBolts(dt: number, hero: THREE.Vector3, hooks: BossHooks): void {
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i]; const d = b.speed * dt; b.dist += d; b.obj.position.addScaledVector(b.dir, d);
      b.y = Math.max(walk.h(b.obj.position.x, b.obj.position.z) + (b.arrow ? 1.1 : 1.2), (b.y ?? 0) - d * 0.22); b.obj.position.y = b.y;   // from high ground it drops gently toward the floor
      if (!b.arrow && Math.random() < 0.5) hooks.burst(b.obj.position.clone().setY(1.2), 1, 0.6, 0xb04cff);
      const hit = Math.hypot(hero.x - b.obj.position.x, hero.z - b.obj.position.z) < 0.65 && Math.abs(hero.y + 1.1 - b.obj.position.y) < 1.6;
      if (hit || b.dist > b.range || !walk.air(b.obj.position.x, b.obj.position.z, b.obj.position.y)) {
        if (hit) hooks.hitHero(b.obj.position.x - b.dir.x, b.obj.position.z - b.dir.z, false, atk(this.kind as AtkId));
        hooks.burst(b.obj.position.clone().setY(1.2), hit ? 14 : 6, 3, b.arrow ? 0xc8b080 : 0xb04cff);
        if (!b.arrow && this.fx && this.orbSheet) this.fx.kill(b.obj, 0.05); else b.obj.removeFromParent();
        this.bolts.splice(i, 1);
      }
    }
  }

  private die(dt: number, hooks: BossHooks, hero: THREE.Vector3): void {
    this.deadT += dt;
    if (this.deadT - dt <= 0) hooks.burst(this.pos.clone().setY(1.0), 18, 3.5, this.role === 'ghoul' ? 0x8a9a7a : this.role === 'ghost' ? 0xbfe8ff : this.role === 'caster' ? 0xb04cff : this.role === 'archer' ? 0x7ab050 : 0xc8a060);
    const clip = this.actions.has('Death');
    if (!clip) this.body.rotation.x = -Math.min(1, this.deadT / 0.5) * Math.PI / 2;            // no death clip: topple backwards
    if (this.role === 'ghost') for (const m of this.mats) m.opacity = Math.max(0, 0.82 * (1 - this.deadT / 1.6));
    if (this.deadT > (clip ? 1.8 : 1.2)) this.body.position.y -= dt * 0.8;                   // and sink into the ground
    // camp units come back 2 minutes after they fall, but never in front of him: while he is within 25 m of the camp they wait
    if (this.deadT > RESPAWN_S && !this.stayDead && Math.hypot(hero.x - this.home.x, hero.z - this.home.z) > 25) this.respawn();
  }

  respawn(): void {
    this.dead = false; this.hp = this.maxHp; this.vel.set(0, 0, 0); this.body.rotation.set(0, 0, 0); this.body.position.set(0, 0, 0); this.body.scale.set(1, 1, 1);
    this.pos.copy(this.home).setY(walk.h(this.home.x, this.home.z)); this.root.visible = true;
    if (this.role === 'ghost') for (const m of this.mats) m.opacity = 0.82;
    for (const b of this.bolts) { if (!b.arrow && this.fx && this.orbSheet) this.fx.kill(b.obj, 0.01); else b.obj.removeFromParent(); } this.bolts = [];
    for (const w of this.waves) { if (w.flip) this.fx?.kill(w.mesh, 0.01); else w.mesh.removeFromParent(); } this.waves = [];
    if (this.loaded) this.setState('idle');
  }
}
