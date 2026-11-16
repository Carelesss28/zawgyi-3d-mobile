import * as THREE from 'three';
import { HP_SCALE, atk } from './stats';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { Fx, FlipSheet } from './fx';
import type { BossHooks } from './boss';
import { settle, walk } from './world';

/**
 * Necromancer: a hooded caster with a bone scythe who guards his patch of jungle.
 *   guard   -> stands at home; wakes when the hero steps into his territory
 *   chase   -> walks at the hero (gives up and walks home if the hero leaves the leash range)
 *   slash   -> scythe swing at close range, telegraphed by a purple cone
 *   bolt    -> Soul Bolt: a fast spectral skull flies at where the hero stood (dodge sideways or dash through)
 *   grasp   -> Grave Grasp: a rune circle under the hero; skeletal hands erupt from it a moment later (step out)
 *   return  -> walks home, healing; back to guard
 *   dead    -> defeat clip, sinks away, returns after a while
 * Spell visuals use placeholder sheets (orb / sigil / impact, tinted) until the necromancer's own sheets are in.
 */
type NecroState = 'guard' | 'chase' | 'slash' | 'bolt' | 'grasp' | 'recover' | 'return' | 'dead';
interface ClipInfo { duration: number; speed: number; loop?: boolean; hitTime?: number; stanceSpeed?: number }
export interface NecroSheets { bolt?: FlipSheet; boltHit?: FlipSheet; circle?: FlipSheet; hands?: FlipSheet }

export const NECRO_HEIGHT = 2.2;
const TERRITORY = 11;          // the hero entering this radius around his home wakes him
const LEASH = 18;              // he gives up when the hero is this far from his home
const SLASH_RANGE = 2.4, SLASH_REACH = 3.0;
const BOLT_SPEED = 11, BOLT_RANGE = 15;
const GRASP_R = 2.0, GRASP_DELAY = 1.1;
const GREEN = 0x5cff9a, PURPLE = 0xb04cff;

export class Necro {
  readonly kind = 'necro' as const;
  readonly root = new THREE.Group();
  readonly radius = 0.55;
  readonly maxHp = 18 * HP_SCALE;
  hp = 18 * HP_SCALE;
  dead = false;
  /** Chapter 1: once beaten, it stays beaten (the arena brings it back for another round). */
  stayDead = false;
  state: NecroState = 'guard';
  stateT = 0;
  facing = 0;
  loaded = false;
  readonly home = new THREE.Vector3();
  private homeFacing = 0;

  private model: THREE.Object3D | null = null;
  private mixer: THREE.AnimationMixer | null = null;
  private actions = new Map<string, THREE.AnimationAction>();
  private cur: THREE.AnimationAction | null = null;
  private clips: Record<string, ClipInfo> = {};
  private mats: THREE.MeshStandardMaterial[] = [];
  private flash = 0;
  private struck = false;
  private boltCd = 2.5;
  private graspCd = 5;
  private deadT = 0;
  private vel = new THREE.Vector3();
  private cone: THREE.Mesh;
  private fx: Fx | null = null;
  private sheets: NecroSheets = {};
  private bolts: Array<{ obj: THREE.Object3D; dir: THREE.Vector3; dist: number; t: number }> = [];
  private grasps: Array<{ at: THREE.Vector3; t: number; mark: THREE.Object3D; ring: THREE.Mesh }> = [];

  constructor(x: number, z: number, facing: number) {
    this.home.set(x, 0, z); this.root.position.copy(this.home); this.facing = this.homeFacing = facing; this.root.rotation.y = facing;
    this.cone = new THREE.Mesh(new THREE.CircleGeometry(SLASH_REACH, 28, Math.PI / 2 - THREE.MathUtils.degToRad(50), THREE.MathUtils.degToRad(100)),
      new THREE.MeshBasicMaterial({ color: PURPLE, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
    this.cone.rotation.x = Math.PI / 2; this.cone.position.y = 0.05; this.cone.visible = false; this.root.add(this.cone);
  }

  get pos(): THREE.Vector3 { return this.root.position; }
  get extras(): THREE.Object3D[] { return []; }

  /** Effects: until his own sheets exist, the orb / sigil / impact sheets are tinted green and purple. */
  useFx(fx: Fx, sheets: NecroSheets): void { this.fx = fx; this.sheets = sheets; }

  async load(url: string, metaUrl: string): Promise<void> {
    const [gltf, meta] = await Promise.all([new GLTFLoader().loadAsync(url), fetch(metaUrl).then((r) => r.json())]);
    this.clips = meta.clips; const scale = NECRO_HEIGHT / meta.height;
    this.model = gltf.scene; this.model.scale.setScalar(scale); this.root.add(this.model);
    this.model.traverse((o) => {
      const m = o as THREE.Mesh; if (!m.isMesh) return; m.castShadow = true; m.frustumCulled = false;
      const mat = m.material as THREE.MeshStandardMaterial; if (mat?.isMeshStandardMaterial) { mat.metalness = 0; mat.roughness = 0.85; this.mats.push(mat); }
    });
    this.mixer = new THREE.AnimationMixer(this.model);
    for (const clip of gltf.animations) {
      const name = clip.name.replace(/^.*[|:]/, ''); const a = this.mixer.clipAction(clip);
      a.setLoop(this.clips[name]?.loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity); a.clampWhenFinished = true; this.actions.set(name, a);
    }
    this.play('Idle', 0); this.loaded = true;
  }

  private play(name: string, fade = 0.2): void {
    const next = this.actions.get(name); if (!next) return;
    if (this.cur === next && next.loop === THREE.LoopRepeat) return;
    next.reset(); next.timeScale = this.clips[name]?.speed ?? 1; next.setEffectiveWeight(1); next.play();
    if (this.cur && this.cur !== next) fade > 0 ? this.cur.crossFadeTo(next, fade, false) : this.cur.stop();
    this.cur = next;
  }
  private impactAt(name: string): number { const c = this.clips[name]; return (c?.hitTime ?? 0.6) / (c?.speed ?? 1); }
  private clipLen(name: string): number { const c = this.clips[name]; return (c?.duration ?? 1) / (c?.speed ?? 1); }
  private get walkSpeed(): number { return (this.clips.Walk?.stanceSpeed ?? 0.62) * NECRO_HEIGHT; }

  private setState(s: NecroState): void {
    this.state = s; this.stateT = 0; this.struck = false; this.cone.visible = false;
    if (s === 'chase' || s === 'return') this.play('Walk', 0.25);
    if (s === 'slash') { this.play('Slash', 0.12); this.cone.visible = true; }
    if (s === 'bolt' || s === 'grasp') this.play('Cast', 0.15);
    if (s === 'recover' || s === 'guard') this.play('Idle', 0.3);
  }

  hurt(amount: number, dirX: number, dirZ: number, knockback: number, heavy: boolean): void {
    if (this.dead || !this.loaded) return;
    this.hp = Math.max(0, this.hp - amount); this.flash = 0.12;
    this.vel.set(dirX, 0, dirZ).multiplyScalar(knockback * (heavy ? 1.6 : 0.9));
    if (this.state === 'guard' || this.state === 'return') this.setState('chase');
    if (this.hp <= 0) { this.dead = true; this.state = 'dead'; this.stateT = 0; this.deadT = 0; this.cone.visible = false; this.play('Death', 0.15); }
  }

  update(dt: number, hero: THREE.Vector3, hooks: BossHooks): void {
    if (!this.loaded) return;
    const px = this.root.position.x, pz = this.root.position.z;
    this.step(dt, hero, hooks);
    this.updateSpells(dt, hero, hooks);
    if (!this.dead) { settle(this.root.position, px, pz, 0.3); this.root.position.y = walk.h(this.root.position.x, this.root.position.z); }
  }

  private step(dt: number, hero: THREE.Vector3, hooks: BossHooks): void {
    this.stateT += dt; this.mixer?.update(dt);
    this.flash = Math.max(0, this.flash - dt); const f = this.flash / 0.12;
    for (const m of this.mats) { m.emissive.setHex(GREEN); m.emissiveIntensity = f * 0.7; }
    this.root.position.addScaledVector(this.vel, dt); this.vel.multiplyScalar(Math.max(0, 1 - 8 * dt));
    if (this.dead) { this.die(dt); return; }

    const dx = hero.x - this.pos.x, dz = hero.z - this.pos.z, dist = Math.hypot(dx, dz);
    const heroFromHome = Math.hypot(hero.x - this.home.x, hero.z - this.home.z);
    const faceTo = (want: number, rate: number) => { let d = want - this.facing; d = Math.atan2(Math.sin(d), Math.cos(d)); this.facing += Math.max(-rate * dt, Math.min(rate * dt, d)); this.root.rotation.y = this.facing; };
    const want = Math.atan2(dx, dz);
    const stepTo = (ang: number, sp: number) => { this.root.position.x += Math.sin(ang) * sp * dt; this.root.position.z += Math.cos(ang) * sp * dt; };
    this.boltCd -= dt; this.graspCd -= dt;

    switch (this.state) {
      case 'guard':
        faceTo(this.homeFacing, 1.5);
        if (heroFromHome < TERRITORY) { this.setState('chase'); hooks.sound('warn'); hooks.ring(this.pos.clone().setY(0.1), 0.5, 3.5, 0.5, PURPLE); }
        break;
      case 'chase':
        faceTo(want, 3.2);
        if (heroFromHome > LEASH) { this.setState('return'); break; }
        if (dist < SLASH_RANGE) { this.setState('slash'); break; }
        if (this.boltCd <= 0 && dist > 4 && dist < 12) { this.boltCd = 4.5; this.setState('bolt'); break; }
        if (this.graspCd <= 0 && dist > 2.6 && dist < 10) { this.graspCd = 7.5; this.setState('grasp'); this.castGrasp(hero); break; }
        stepTo(this.facing, this.walkSpeed);
        break;
      case 'slash': {
        const hit = this.impactAt('Slash'); if (this.stateT < hit - 0.2) faceTo(want, 2.4);
        (this.cone.material as THREE.MeshBasicMaterial).opacity = this.stateT < hit ? 0.12 + 0.35 * (this.stateT / hit) : 0;
        if (!this.struck && this.stateT >= hit) {
          this.struck = true; this.cone.visible = false;
          const p = this.pos.clone().add(new THREE.Vector3(Math.sin(this.facing), 0, Math.cos(this.facing)).multiplyScalar(1.6)).setY(1.0);
          hooks.burst(p, 16, 4, 0xff3355); hooks.sound('slam');
          const ang = Math.abs(Math.atan2(Math.sin(want - this.facing), Math.cos(want - this.facing)));
          if (dist < SLASH_REACH + 0.3 && ang < THREE.MathUtils.degToRad(55) && Math.abs(hero.y - this.pos.y) < 2.0) hooks.hitHero(this.pos.x, this.pos.z, false, atk('necroSlash'));
        }
        if (this.stateT >= this.clipLen('Slash') * 0.8) this.setState('recover');
        break; }
      case 'bolt': {
        const hit = this.impactAt('Cast'); if (this.stateT < hit) faceTo(want, 3);
        if (!this.struck && this.stateT >= hit) { this.struck = true; this.fireBolt(hero, hooks); }
        if (this.stateT >= this.clipLen('Cast') * 0.85) this.setState('recover');
        break; }
      case 'grasp':
        faceTo(want, 2);
        if (this.stateT >= this.clipLen('Cast') * 0.85) this.setState('recover');
        break;
      case 'recover': faceTo(want, 2); if (this.stateT >= 0.6) this.setState(heroFromHome > LEASH ? 'return' : 'chase'); break;
      case 'return': {
        const hx = this.home.x - this.pos.x, hz = this.home.z - this.pos.z, hd = Math.hypot(hx, hz);
        this.hp = Math.min(this.maxHp, this.hp + dt * 3 * HP_SCALE);
        if (heroFromHome < TERRITORY * 0.8) { this.setState('chase'); break; }
        if (hd < 0.4) { this.setState('guard'); break; }
        faceTo(Math.atan2(hx, hz), 3); stepTo(this.facing, this.walkSpeed);
        break; }
      default: break;
    }
  }

  /** Soul Bolt: a spectral skull from his casting hand toward where the hero is now. */
  private fireBolt(hero: THREE.Vector3, hooks: BossHooks): void {
    const fwd = new THREE.Vector3(Math.sin(this.facing), 0, Math.cos(this.facing));
    const start = this.pos.clone().addScaledVector(fwd, 0.8); start.y = 1.4;
    const dir = hero.clone().setY(0).sub(start.clone().setY(0)); if (dir.lengthSq() < 0.01) dir.copy(fwd); dir.normalize();
    let obj: THREE.Object3D;
    if (this.fx && this.sheets.bolt) { const s = this.fx.flip(this.sheets.bolt, start, 1.5, 24, true); (s.material as THREE.SpriteMaterial).color.setHex(GREEN); obj = s; }
    else { obj = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 8), new THREE.MeshBasicMaterial({ color: GREEN })); obj.position.copy(start); this.root.parent?.add(obj); }
    this.bolts.push({ obj, dir, dist: 0, t: 0 }); hooks.sound('warn');
  }

  /** Grave Grasp: a rune circle under the hero; the hands erupt GRASP_DELAY seconds later. */
  private castGrasp(hero: THREE.Vector3): void {
    const at = hero.clone().setY(0);
    const ring = new THREE.Mesh(new THREE.RingGeometry(GRASP_R - 0.12, GRASP_R, 40), new THREE.MeshBasicMaterial({ color: PURPLE, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.copy(at).setY(walk.h(at.x, at.z) + 0.07); this.root.parent?.add(ring);
    let mark: THREE.Object3D = ring;
    if (this.fx && this.sheets.circle) { const m = this.fx.groundFlip(this.sheets.circle, at, GRASP_R * 2.3, 12, true, 1.2); (m.material as THREE.MeshBasicMaterial).color.setHex(PURPLE); mark = m; }
    this.grasps.push({ at, t: 0, mark, ring });
  }

  private updateSpells(dt: number, hero: THREE.Vector3, hooks: BossHooks): void {
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i]; b.t += dt; const stepD = BOLT_SPEED * dt; b.dist += stepD;
      b.obj.position.addScaledVector(b.dir, stepD); b.obj.position.y = walk.h(b.obj.position.x, b.obj.position.z) + 1.3;
      if (Math.random() < 0.6) hooks.burst(b.obj.position.clone().setY(1.3), 1, 0.8, GREEN);
      const hitHero = Math.hypot(hero.x - b.obj.position.x, hero.z - b.obj.position.z) < 0.75;
      if (hitHero || b.dist > BOLT_RANGE || !walk.ok(b.obj.position.x, b.obj.position.z)) {
        const p = b.obj.position.clone().setY(1.2);
        if (hitHero) hooks.hitHero(p.x - b.dir.x, p.z - b.dir.z, false, atk('necroBolt'));
        hooks.burst(p, hitHero ? 22 : 10, 4, GREEN);
        if (this.fx && this.sheets.boltHit) { const s = this.fx.flip(this.sheets.boltHit, p, hitHero ? 2.6 : 1.6, 26); (s.material as THREE.SpriteMaterial).color.setHex(GREEN); }
        if (this.fx && this.sheets.bolt) this.fx.kill(b.obj, 0.05); else b.obj.removeFromParent();
        this.bolts.splice(i, 1);
      }
    }
    for (let i = this.grasps.length - 1; i >= 0; i--) {
      const g = this.grasps[i]; g.t += dt; const k = Math.min(1, g.t / GRASP_DELAY);
      (g.ring.material as THREE.MeshBasicMaterial).opacity = 0.4 + 0.5 * k * (0.6 + 0.4 * Math.sin(g.t * 18));
      if (g.t >= GRASP_DELAY) {
        const p = g.at.clone().setY(0.3);
        hooks.burst(p, 26, 5, PURPLE); hooks.ring(g.at.clone().setY(0.1), 0.4, GRASP_R + 0.6, 0.45, GREEN); hooks.shake(0.3); hooks.sound('slam');
        if (this.fx && this.sheets.hands) { const s = this.fx.flip(this.sheets.hands, g.at.clone().setY(1.0), GRASP_R * 2.2, 22); (s.material as THREE.SpriteMaterial).color.setHex(GREEN); }
        if (Math.hypot(hero.x - g.at.x, hero.z - g.at.z) < GRASP_R) hooks.hitHero(g.at.x, g.at.z, true, atk('necroGrasp'));
        if (g.mark !== g.ring && this.fx) this.fx.kill(g.mark, 0.2);
        g.ring.removeFromParent(); this.grasps.splice(i, 1);
      }
    }
  }

  private die(dt: number): void {
    this.deadT += dt;
    const fall = this.clipLen('Death');
    if (this.deadT > fall + 1.2 && this.deadT < fall + 3.2) this.root.position.y -= dt * 0.6;           // sinks into the earth
    if (this.deadT > fall + 3.2) this.root.visible = false;
    if (this.deadT > 25 && !this.stayDead) this.respawn();
  }

  respawn(): void {
    this.dead = false; this.hp = this.maxHp; this.vel.set(0, 0, 0); this.boltCd = 2.5; this.graspCd = 5;
    this.root.position.copy(this.home).setY(walk.h(this.home.x, this.home.z)); this.root.visible = true; this.facing = this.homeFacing; this.root.rotation.y = this.facing;
    for (const b of this.bolts) { if (this.fx && this.sheets.bolt) this.fx.kill(b.obj, 0.01); else b.obj.removeFromParent(); } this.bolts = [];
    for (const g of this.grasps) { g.ring.removeFromParent(); if (g.mark !== g.ring) this.fx?.kill(g.mark, 0.01); } this.grasps = [];
    this.setState('guard');
  }
}
