import * as THREE from 'three';
import { HP_SCALE, atk, type Atk } from './stats';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { Fx, FlipSheet } from './fx';
import { settle, walk } from './world';

/**
 * Temple Guardian: a 3.6 m red stone golem with a lotus shield on his left forearm.
 *   dormant  -> wakes when the hero comes close or hits him, roars
 *   chase    -> walks at the hero
 *   punch    -> shield bash at close range, telegraphed by a red cone on the ground
 *   blast    -> palm thrust that sends a shock wave along a telegraphed lane (dash through it to dodge)
 *   enrage   -> at half health he roars again, then moves and attacks faster
 *   dead     -> crumbles into the floor, returns after a while (test build)
 */
type BossState = 'dormant' | 'roar' | 'chase' | 'punch' | 'blast' | 'recover' | 'dead';
interface ClipInfo { duration: number; speed: number; loop?: boolean; hitTime?: number; stanceSpeed?: number }
export interface BossHooks {
  /** The hero is inside the attack area at the moment of impact: returns true if it landed (false = dodged). */
  hitHero: (fromX: number, fromZ: number, heavy: boolean, atk?: Atk) => boolean;
  ring: (p: THREE.Vector3, r0: number, r1: number, dur: number, color: number) => void;
  burst: (p: THREE.Vector3, n: number, power: number, color: number) => void;
  shake: (amount: number) => void;
  sound: (name: 'slam' | 'warn' | 'roar' | 'die') => void;
}

export const BOSS_HEIGHT = 3.6;
const WAKE_RADIUS = 9;
const PUNCH_RANGE = 3.3;            // he starts the bash inside this distance
const PUNCH_REACH = 3.9;            // and it hits up to here, in a 70 degree cone
const BLAST_LEN = 13, BLAST_HALF_W = 1.25, BLAST_SPEED = 16;
const WAVE_SIZE = 4.8;               // the fire-wave flipbook, metres across; its bright front sits ~30% right of the cell centre

/** The big bar's numbers: current / max health. */
export function setBossHp(hp: number, max: number): void { const el = document.getElementById('boss-hp'); if (el) { const t = `${Math.max(0, Math.ceil(hp)).toLocaleString('en-US')} / ${Math.round(max).toLocaleString('en-US')}`; if (el.textContent !== t) el.textContent = t; } }

export class Boss {
  readonly kind = 'boss' as const;
  readonly root = new THREE.Group();
  readonly radius = 1.15;
  readonly maxHp = 40 * HP_SCALE;
  hp = 40 * HP_SCALE;
  dead = false;
  /** Chapter 1: once beaten, it stays beaten (the arena brings it back for another round). */
  stayDead = false;
  state: BossState = 'dormant';
  stateT = 0;
  facing = 0;
  enraged = false;
  loaded = false;
  readonly spawn = new THREE.Vector3();

  private model: THREE.Object3D | null = null;
  private mixer: THREE.AnimationMixer | null = null;
  private actions = new Map<string, THREE.AnimationAction>();
  private cur: THREE.AnimationAction | null = null;
  private clips: Record<string, ClipInfo> = {};
  private scale = 1;
  private mats: THREE.MeshStandardMaterial[] = [];
  private flash = 0;
  private struck = false;
  private blastCd = 4;
  private deadT = 0;
  private vel = new THREE.Vector3();
  private telegraph: THREE.Mesh;
  private lane: THREE.Mesh;
  private wave: THREE.Mesh;
  private waveOn = false;
  private waveDist = 0;
  private waveHit = false;
  private waveOrigin = new THREE.Vector3();
  private waveDir = new THREE.Vector3();
  private fx: Fx | null = null;
  private waveSheet: FlipSheet | null = null;
  private waveFx: THREE.Mesh | null = null;
  private bar = document.getElementById('boss-bar');
  private barFill = document.getElementById('boss-fill');

  constructor(x: number, z: number, facing: number) {
    this.spawn.set(x, 0, z); this.root.position.copy(this.spawn); this.facing = facing; this.root.rotation.y = facing;
    const red = (o: number) => new THREE.MeshBasicMaterial({ color: 0xff3b2f, transparent: true, opacity: o, depthWrite: false, side: THREE.DoubleSide });
    // punch cone (70 degrees, PUNCH_REACH long)
    this.telegraph = new THREE.Mesh(new THREE.CircleGeometry(PUNCH_REACH, 32, Math.PI / 2 - THREE.MathUtils.degToRad(35), THREE.MathUtils.degToRad(70)), red(0));
    this.telegraph.rotation.x = Math.PI / 2;   // +Y of the shape becomes +Z: in front of him this.telegraph.position.y = 0.05; this.telegraph.visible = false; this.root.add(this.telegraph);
    // blast lane (in front of him, BLAST_LEN long)
    const lg = new THREE.PlaneGeometry(BLAST_HALF_W * 2, BLAST_LEN); lg.translate(0, BLAST_LEN / 2 + 0.6, 0);
    this.lane = new THREE.Mesh(lg, red(0)); this.lane.rotation.x = Math.PI / 2; this.lane.position.y = 0.05; this.lane.visible = false; this.root.add(this.lane);
    // the travelling shock wave (world space)
    this.wave = new THREE.Mesh(new THREE.TorusGeometry(BLAST_HALF_W * 0.9, 0.22, 8, 24, Math.PI), new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.wave.visible = false;
  }

  /** Use the GPT fire-wave flipbook (Guardian-Lane-Blast) for the shock wave instead of the plain arc. */
  useWaveSheet(fx: Fx, sheet: FlipSheet): void { this.fx = fx; this.waveSheet = sheet; }

  /** The wave lives in world space; add it to the scene next to the root. */
  get extras(): THREE.Object3D[] { return [this.wave]; }
  get pos(): THREE.Vector3 { return this.root.position; }

  async load(url: string, metaUrl: string): Promise<void> {
    const [gltf, meta] = await Promise.all([new GLTFLoader().loadAsync(url), fetch(metaUrl).then((r) => r.json())]);
    this.clips = meta.clips; this.scale = BOSS_HEIGHT / meta.height;
    this.model = gltf.scene; this.model.scale.setScalar(this.scale); this.root.add(this.model);
    this.model.traverse((o) => {
      const m = o as THREE.Mesh; if (!m.isMesh) return; m.castShadow = true; m.frustumCulled = false;
      const mat = m.material as THREE.MeshStandardMaterial; if (mat?.isMeshStandardMaterial) { mat.metalness = 0; mat.roughness = 0.9; this.mats.push(mat); }
    });
    this.mixer = new THREE.AnimationMixer(this.model);
    for (const clip of gltf.animations) {
      const name = clip.name.replace(/^.*[|:]/, ''); const a = this.mixer.clipAction(clip);
      a.setLoop(this.clips[name]?.loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity); a.clampWhenFinished = true; this.actions.set(name, a);
    }
    this.play('Idle', 0); this.loaded = true;
  }

  private play(name: string, fade = 0.2, speed?: number): void {
    const next = this.actions.get(name); if (!next) return;
    const sp = (speed ?? this.clips[name]?.speed ?? 1) * (this.enraged && name !== 'Roar' ? 1.2 : 1);
    if (this.cur === next) { next.timeScale = sp; if (!next.loop || next.loop === THREE.LoopRepeat) return; }
    next.reset(); next.timeScale = sp; next.setEffectiveWeight(1); next.play();
    if (this.cur && this.cur !== next) fade > 0 ? this.cur.crossFadeTo(next, fade, false) : this.cur.stop();
    this.cur = next;
  }

  /** Seconds of clip time until the impact, at the current play speed. */
  private impactAt(name: string): number { const c = this.clips[name]; return (c?.hitTime ?? 0.5) / ((c?.speed ?? 1) * (this.enraged ? 1.2 : 1)); }
  private clipLen(name: string): number { const c = this.clips[name]; return (c?.duration ?? 1) / ((c?.speed ?? 1) * (this.enraged && name !== 'Roar' ? 1.2 : 1)); }

  private setState(s: BossState, hooks?: BossHooks): void {
    this.state = s; this.stateT = 0; this.struck = false; this.telegraph.visible = false; this.lane.visible = false;
    if (s === 'roar') { this.play('Roar', 0.2); hooks?.sound('roar'); }
    if (s === 'chase') this.play('Walk', 0.25);
    if (s === 'punch') { this.play('Punch', 0.12); this.telegraph.visible = true; hooks?.sound('warn'); }
    if (s === 'blast') { this.play('Blast', 0.15); this.lane.visible = true; hooks?.sound('warn'); }
    if (s === 'recover') this.play('Idle', 0.3);
    if (s === 'dormant') this.play('Idle', 0.2);
  }

  hurt(amount: number, dirX: number, dirZ: number, knockback: number, heavy: boolean): void {
    if (this.dead || !this.loaded) return;
    this.hp = Math.max(0, this.hp - amount); this.flash = 0.12;
    this.vel.set(dirX, 0, dirZ).multiplyScalar(knockback * (heavy ? 0.8 : 0.4));        // a stone giant barely moves
    if (this.state === 'dormant') this.wake = true;
    if (this.hp <= 0) { this.groundY = this.root.position.y; this.dead = true; this.state = 'dead'; this.stateT = 0; this.deadT = 0; this.telegraph.visible = false; this.lane.visible = false; this.cur?.fadeOut(0.3); this.cur = null; }
  }
  private wake = false;
  /** Test hook: wake up on the next update. */
  wakeNow(): void { this.wake = true; }

  update(dt: number, hero: THREE.Vector3, hooks: BossHooks): void {
    const px = this.root.position.x, pz = this.root.position.z;
    this.step(dt, hero, hooks);
    if (!this.dead) { settle(this.root.position, px, pz); this.root.position.y = walk.h(this.root.position.x, this.root.position.z); }
  }
  private groundY = 0;

  private step(dt: number, hero: THREE.Vector3, hooks: BossHooks): void {
    if (!this.loaded) return;
    this.stateT += dt; this.mixer?.update(dt);
    this.flash = Math.max(0, this.flash - dt); const f = this.flash / 0.12;
    for (const m of this.mats) { m.emissive.setRGB(1, 0.55, 0.3); m.emissiveIntensity = f * 0.6; }
    this.root.position.addScaledVector(this.vel, dt); this.vel.multiplyScalar(Math.max(0, 1 - 8 * dt));
    this.updateWave(dt, hero, hooks);
    this.updateBar();
    if (this.dead) { this.crumble(dt, hooks); return; }

    const dx = hero.x - this.root.position.x, dz = hero.z - this.root.position.z, dist = Math.hypot(dx, dz);
    const want = Math.atan2(dx, dz);
    const turn = (rate: number) => { let d = want - this.facing; d = Math.atan2(Math.sin(d), Math.cos(d)); this.facing += Math.max(-rate * dt, Math.min(rate * dt, d)); this.root.rotation.y = this.facing; };
    this.blastCd -= dt;
    if (!this.enraged && this.hp <= this.maxHp / 2 && (this.state === 'chase' || this.state === 'recover')) { this.enraged = true; this.setState('roar', hooks); hooks.ring(this.pos.clone().setY(0.1), 1, 7, 0.7, 0xff5a2a); hooks.shake(0.5); return; }

    switch (this.state) {
      case 'dormant':
        if (dist < WAKE_RADIUS || this.wake) { this.wake = false; this.setState('roar', hooks); hooks.ring(this.pos.clone().setY(0.1), 1, 6, 0.6, 0xffb060); hooks.shake(0.35); }
        break;
      case 'roar': turn(2.5); if (this.stateT >= this.clipLen('Roar') * 0.92) this.setState('chase', hooks); break;
      case 'chase': {
        turn(this.enraged ? 2.6 : 2.0);
        const walk = (this.clips.Walk?.stanceSpeed ?? 0.58) * BOSS_HEIGHT * (this.enraged ? 1.2 : 1);
        if (dist > PUNCH_RANGE) { this.root.position.x += Math.sin(this.facing) * walk * dt; this.root.position.z += Math.cos(this.facing) * walk * dt; }
        else { this.setState('punch', hooks); break; }
        if (this.blastCd <= 0 && dist > 5 && dist < BLAST_LEN - 1) { this.blastCd = this.enraged ? 5 : 7.5; this.setState('blast', hooks); }
        break; }
      case 'punch': {
        const hit = this.impactAt('Punch'); if (this.stateT < hit - 0.15) turn(1.6);
        (this.telegraph.material as THREE.MeshBasicMaterial).opacity = this.stateT < hit ? 0.15 + 0.4 * (this.stateT / hit) : 0;
        if (!this.struck && this.stateT >= hit) {
          this.struck = true; this.telegraph.visible = false;
          const p = this.pos.clone().add(new THREE.Vector3(Math.sin(this.facing), 0, Math.cos(this.facing)).multiplyScalar(2.4)).setY(0.1);
          hooks.ring(p, 0.4, 3.2, 0.4, 0xffb060); hooks.burst(p.clone().setY(0.3), 26, 5, 0xc8794a); hooks.shake(0.6); hooks.sound('slam');
          const ang = Math.abs(Math.atan2(Math.sin(want - this.facing), Math.cos(want - this.facing)));
          if (dist < PUNCH_REACH + 0.4 && ang < THREE.MathUtils.degToRad(40)) hooks.hitHero(this.pos.x, this.pos.z, true, atk('guardianPunch'));
        }
        if (this.stateT >= this.clipLen('Punch') * 0.85) this.setState('recover', hooks);
        break; }
      case 'blast': {
        const hit = this.impactAt('Blast'); if (this.stateT < hit - 0.25) turn(1.4);
        (this.lane.material as THREE.MeshBasicMaterial).opacity = this.stateT < hit ? 0.12 + 0.35 * (this.stateT / hit) : 0;
        if (!this.struck && this.stateT >= hit) {
          this.struck = true; this.lane.visible = false; hooks.sound('slam'); hooks.shake(0.35);
          this.waveOn = true; this.waveDist = 0.6; this.waveHit = false; this.waveOrigin.copy(this.pos); this.waveDir.set(Math.sin(this.facing), 0, Math.cos(this.facing));
          if (this.fx && this.waveSheet) {
            this.waveFx = this.fx.groundFlip(this.waveSheet, this.pos, WAVE_SIZE, 16 / (BLAST_LEN / BLAST_SPEED), false, 0);
            this.waveFx.rotation.z = this.facing - Math.PI / 2;            // the sheet's +X (where the front faces) points down the lane
          } else { this.wave.visible = true; this.wave.rotation.set(0, this.facing, 0); }
        }
        if (this.stateT >= this.clipLen('Blast') * 0.85) this.setState('recover', hooks);
        break; }
      case 'recover': turn(1.5); if (this.stateT >= (this.enraged ? 0.35 : 0.7)) this.setState('chase', hooks); break;
      default: break;
    }
  }

  private updateWave(dt: number, hero: THREE.Vector3, hooks: BossHooks): void {
    if (!this.waveOn) return;
    this.waveDist += BLAST_SPEED * dt;
    const p = this.waveOrigin.clone().addScaledVector(this.waveDir, this.waveDist); this.wave.position.set(p.x, walk.h(p.x, p.z) + 0.45, p.z);
    if (this.waveFx) { const wx2 = p.x - this.waveDir.x * WAVE_SIZE * 0.3, wz2 = p.z - this.waveDir.z * WAVE_SIZE * 0.3; this.waveFx.position.set(wx2, walk.h(wx2, wz2) + 0.07, wz2); }
    if (Math.random() < 0.7) hooks.burst(p.clone().setY(0.2), 2, 2.5, 0xff8a3a);
    if (!this.waveHit) {
      const rel = hero.clone().sub(this.waveOrigin); const along = rel.dot(this.waveDir); const side = Math.abs(rel.x * this.waveDir.z - rel.z * this.waveDir.x);
      if (Math.abs(along - this.waveDist) < 0.9 && side < BLAST_HALF_W + 0.35) { this.waveHit = true; hooks.hitHero(p.x - this.waveDir.x, p.z - this.waveDir.z, false, atk('guardianWave')); }
    }
    if (this.waveDist > BLAST_LEN) { this.waveOn = false; this.wave.visible = false; if (this.waveFx) { this.fx?.kill(this.waveFx, 0.15); this.waveFx = null; } }
  }

  private crumble(dt: number, hooks: BossHooks): void {
    this.deadT += dt;
    if (this.deadT < 2.4) {
      const k = this.deadT / 2.4; this.root.position.y = this.groundY - k * k * BOSS_HEIGHT * 0.95; if (this.model) this.model.rotation.x = k * 0.35;
      if (Math.random() < 0.5) hooks.burst(this.pos.clone().setY(0.3).add(new THREE.Vector3((Math.random() - 0.5) * 2.4, 0, (Math.random() - 0.5) * 2.4)), 3, 3, 0xb4643a);
      if (this.deadT - dt <= 0) { hooks.sound('die'); hooks.shake(0.8); hooks.ring(this.pos.clone().setY(0.1), 1, 8, 1.0, 0xffd27a); }
    } else this.root.visible = false;
    if (this.deadT > 9 && !this.stayDead) this.respawn();
  }

  /** Set while another boss (the Hydra) owns the bar. */
  static yieldBar = false;
  private updateBar(): void {
    if (!this.bar || !this.barFill || Boss.yieldBar) return;
    const show = this.loaded && !this.dead && this.state !== 'dormant';
    if (show) { const nm = document.querySelector('#boss-bar .name'); if (nm) nm.textContent = 'TEMPLE GUARDIAN'; }
    this.bar.classList.toggle('show', show); this.bar.classList.toggle('enraged', this.enraged);
    this.barFill.style.width = `${(100 * this.hp) / this.maxHp}%`; if (show) setBossHp(this.hp, this.maxHp);
  }

  respawn(): void {
    this.dead = false; this.hp = this.maxHp; this.enraged = false; this.wake = false; this.blastCd = 4; this.vel.set(0, 0, 0);
    this.root.position.copy(this.spawn); this.root.visible = true; if (this.model) this.model.rotation.set(0, 0, 0);
    this.waveOn = false; this.wave.visible = false; if (this.waveFx) { this.fx?.kill(this.waveFx, 0.01); this.waveFx = null; } this.setState('dormant');
  }
}
