import * as THREE from 'three';
import { HP_SCALE } from './stats';
import { settle, walk } from './world';

/** Simple placeholder enemies built from primitives: a training dummy and a clay sentry with a telegraphed strike. */
export type EnemyKind = 'dummy' | 'sentry';

export class Enemy {
  readonly kind: EnemyKind;
  readonly root = new THREE.Group();
  readonly body = new THREE.Group();
  readonly radius: number;
  readonly maxHp: number;
  hp: number;
  dead = false;
  state: 'idle' | 'chase' | 'windup' | 'strike' | 'recover' | 'dead' = 'idle';
  stateT = 0;
  stagger = 0;
  vel = new THREE.Vector3();
  facing = 0;
  spawn = new THREE.Vector3();
  respawnT = 0;
  hitFlash = 0;
  strikeDone = false;
  private mats: THREE.MeshStandardMaterial[] = [];
  private bar: THREE.Group;
  private barFill: THREE.Mesh;
  private telegraph: THREE.Mesh;
  private arm: THREE.Object3D | null = null;

  constructor(kind: EnemyKind, x: number, z: number) {
    this.kind = kind; this.radius = kind === 'sentry' ? 0.5 : 0.45; this.maxHp = (kind === 'sentry' ? 7 : 10) * HP_SCALE; this.hp = this.maxHp;
    this.spawn.set(x, 0, z); this.root.position.copy(this.spawn); this.root.add(this.body);
    const clay = this.mat(kind === 'sentry' ? 0x93502f : 0x8a6a45, 0.85), dark = this.mat(0x2a2220, 0.9), bronze = this.mat(0xb07a2a, 0.35, 0.9);
    const add = (m: THREE.Mesh, parent: THREE.Object3D = this.body) => { m.castShadow = true; parent.add(m); return m; };
    if (kind === 'sentry') {
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.42, 1.15, 10), clay)).position.y = 0.58;
      add(new THREE.Mesh(new THREE.SphereGeometry(0.27, 12, 10), clay)).position.y = 1.42;
      add(new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.28, 0.5), clay)).position.y = 1.12;
      const plate = add(new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.05, 16), bronze)); plate.rotation.x = Math.PI / 2; plate.position.set(0, 0.95, 0.4);
      const shield = add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.95, 0.7), bronze)); shield.position.set(-0.55, 0.9, 0.25);
      const eyes = add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.05, 0.05), new THREE.MeshBasicMaterial({ color: 0xffb347 }))); eyes.position.set(0, 1.45, 0.26);
      this.arm = new THREE.Group(); this.arm.position.set(0.55, 1.1, 0); this.body.add(this.arm);
      const club = add(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.17, 1.2, 8), dark), this.arm); club.position.set(0, 0.45, 0.15);
      add(new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), dark), this.arm).position.set(0, 1.05, 0.15);
    } else {
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 1.6, 8), clay)).position.y = 0.8;
      add(new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.14, 0.14), clay)).position.y = 1.3;
      add(new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), this.mat(0xc8a96a, 0.95))).position.y = 1.78;
      const plate = add(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.05, 18), bronze)); plate.rotation.x = Math.PI / 2; plate.position.set(0, 1.1, 0.2);
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.5, 0.12, 14), dark)).position.y = 0.06;
    }
    // health bar (billboarded in update)
    this.bar = new THREE.Group(); const w = 1.1;
    const back = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.1), new THREE.MeshBasicMaterial({ color: 0x1a0d0d, depthTest: false, transparent: true, opacity: 0.8, toneMapped: false })); back.renderOrder = 10;
    this.barFill = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.06, 0.06), new THREE.MeshBasicMaterial({ color: 0xff4a55, depthTest: false, toneMapped: false })); this.barFill.renderOrder = 11; this.barFill.position.z = 0.001;
    this.bar.add(back, this.barFill); this.bar.position.y = kind === 'sentry' ? 2.05 : 2.25; this.root.add(this.bar);
    // strike telegraph on the ground (sentry)
    this.telegraph = new THREE.Mesh(new THREE.CircleGeometry(1, 28, -Math.PI / 3, (Math.PI * 2) / 3), new THREE.MeshBasicMaterial({ color: 0xff3b2f, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
    this.telegraph.rotation.x = -Math.PI / 2; this.telegraph.position.y = 0.04; this.telegraph.scale.setScalar(2.5); this.root.add(this.telegraph); this.telegraph.visible = false;
  }

  private mat(color: number, rough: number, metal = 0): THREE.MeshStandardMaterial {
    const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal }); this.mats.push(m); return m;
  }

  get pos(): THREE.Vector3 { return this.root.position; }

  hurt(amount: number, dirX: number, dirZ: number, knockback: number, heavy: boolean): void {
    if (this.dead) return;
    this.hp -= amount; this.hitFlash = 0.1; this.vel.set(dirX, 0, dirZ).multiplyScalar(knockback * 4.5);
    this.stagger = heavy ? 0.55 : 0.28;
    if (this.state === 'windup' || this.state === 'strike') this.setState('recover');       // a clean hit interrupts the telegraph
    if (this.hp <= 0) { this.dead = true; this.setState('dead'); this.respawnT = 3.2; }
  }

  setState(s: Enemy['state']): void { this.state = s; this.stateT = 0; this.strikeDone = false; if (s !== 'windup') this.telegraph.visible = false; }

  update(dt: number, heroPos: THREE.Vector3, camera: THREE.Camera, onStrike: (e: Enemy) => void, onWarn: () => void): void {
    const px = this.root.position.x, pz = this.root.position.z;
    this.step(dt, heroPos, camera, onStrike, onWarn);
    if (!this.dead) { settle(this.root.position, px, pz); this.root.position.y = walk.h(this.root.position.x, this.root.position.z); }
  }

  private step(dt: number, heroPos: THREE.Vector3, camera: THREE.Camera, onStrike: (e: Enemy) => void, onWarn: () => void): void {
    this.stateT += dt;
    // flash + stagger tilt
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    const f = this.hitFlash > 0 ? this.hitFlash / 0.1 : 0; for (const m of this.mats) { m.emissive.setRGB(0.55, 0.38, 0.22); m.emissiveIntensity = f * 0.55; }
    // knock-back with friction
    this.root.position.addScaledVector(this.vel, dt); this.vel.multiplyScalar(Math.max(0, 1 - 9 * dt));
    this.body.rotation.x = this.dead ? THREE.MathUtils.lerp(this.body.rotation.x, -Math.PI / 2, Math.min(1, dt * 7)) : -Math.min(0.5, this.stagger) * 0.9;
    this.stagger = Math.max(0, this.stagger - dt);
    this.bar.visible = !this.dead && this.hp < this.maxHp; this.barFill.scale.x = Math.max(0.001, this.hp / this.maxHp); this.barFill.position.x = -(1 - this.barFill.scale.x) * (1.1 - 0.06) / 2;
    this.bar.quaternion.copy(camera.quaternion);
    if (this.dead) { this.respawnT -= dt; if (this.respawnT <= 0) this.respawn(); return; }
    if (this.kind === 'dummy' || this.stagger > 0) return;
    // sentry brain
    const dx = heroPos.x - this.root.position.x, dz = heroPos.z - this.root.position.z, dist = Math.hypot(dx, dz);
    const want = Math.atan2(dx, dz);
    const turn = (rate: number) => { let d = want - this.facing; d = Math.atan2(Math.sin(d), Math.cos(d)); this.facing += Math.max(-rate * dt, Math.min(rate * dt, d)); this.root.rotation.y = this.facing; };
    switch (this.state) {
      case 'idle': if (dist < 9) this.setState('chase'); break;
      case 'chase':
        turn(3.5);
        if (dist > 2.2) { this.root.position.x += Math.sin(this.facing) * 1.5 * dt; this.root.position.z += Math.cos(this.facing) * 1.5 * dt; }
        else { this.setState('windup'); this.telegraph.visible = true; onWarn(); }
        break;
      case 'windup': {
        turn(0.8); const k = this.stateT / 0.8; this.telegraph.visible = true; (this.telegraph.material as THREE.MeshBasicMaterial).opacity = 0.18 + 0.35 * k;
        if (this.arm) this.arm.rotation.x = -2.3 * Math.min(1, k * 1.2);
        if (this.stateT >= 0.8) this.setState('strike');
        break; }
      case 'strike':
        if (this.arm) this.arm.rotation.x = THREE.MathUtils.lerp(this.arm.rotation.x, 0.9, Math.min(1, dt * 30));
        if (!this.strikeDone) { this.strikeDone = true; onStrike(this); }
        if (this.stateT >= 0.18) this.setState('recover');
        break;
      case 'recover': if (this.arm) this.arm.rotation.x = THREE.MathUtils.lerp(this.arm.rotation.x, 0, Math.min(1, dt * 4)); if (this.stateT >= 0.9) this.setState('chase'); break;
      default: break;
    }
  }

  respawn(): void {
    this.dead = false; this.hp = this.maxHp; this.root.position.copy(this.spawn); this.vel.set(0, 0, 0); this.body.rotation.set(0, 0, 0); this.setState('idle'); this.stagger = 0;
  }
}
