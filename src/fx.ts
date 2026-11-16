import * as THREE from 'three';
import { walk } from './world';
/** Effect positions are given as height above the floor; this lifts them onto raised floors (terrace, stairs). */
const lift = (p: THREE.Vector3) => p.clone().setY(p.y + walk.h(p.x, p.z));

/** A sprite sheet: frames laid out left to right, top to bottom, on a black background (drawn additively, so black is invisible). */
export interface FlipSheet { tex: THREE.Texture; cols: number; rows: number; frames: number }

/** Restrained, pooled effects: sparks, ground rings, a staff trail ribbon, flipbook sprites, floating damage numbers, camera shake. */
export class Fx {
  shake = 0;
  private sparks: THREE.Points;
  private sp = { pos: new Float32Array(0), col: new Float32Array(0), vel: [] as THREE.Vector3[], life: [] as number[], floor: [] as number[], max: 160 };
  private rings: Array<{ mesh: THREE.Mesh; t: number; dur: number; r0: number; r1: number }> = [];
  private trail: THREE.Mesh;
  private trailSamples: Array<{ a: THREE.Vector3; b: THREE.Vector3; t: number }> = [];
  private readonly trailMax = 16;
  private dmgPool: HTMLDivElement[] = [];
  private dmgActive: Array<{ el: HTMLDivElement; pos: THREE.Vector3; t: number; vy: number }> = [];
  private flips: Array<{ obj: THREE.Object3D; mat: THREE.SpriteMaterial | THREE.MeshBasicMaterial; sheet: FlipSheet; t: number; fps: number; loop: boolean; spin: number; fade: number; fadeDur: number; brightness: number }> = [];

  static async loadSheet(url: string, cols: number, rows: number, frames = cols * rows): Promise<FlipSheet> {
    const tex = await new THREE.TextureLoader().loadAsync(url); tex.colorSpace = THREE.SRGBColorSpace; tex.generateMipmaps = true;
    return { tex, cols, rows, frames };
  }

  private sheetMap(sheet: FlipSheet): THREE.Texture { const map = sheet.tex.clone(); map.repeat.set(1 / sheet.cols, 1 / sheet.rows); map.needsUpdate = true; return map; }

  /** Play a sheet as a camera-facing sprite. loop = keeps going until kill(); otherwise it removes itself after the last frame. */
  flip(sheet: FlipSheet, pos: THREE.Vector3, size: number, fps: number, loop = false, spin = 0, parent: THREE.Object3D = this.scene, upright = false): THREE.Sprite {
    const mat = new THREE.SpriteMaterial({ map: this.sheetMap(sheet), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false });
    const sprite = new THREE.Sprite(mat); sprite.position.copy(parent === this.scene ? lift(pos) : pos); sprite.scale.setScalar(size); mat.rotation = upright ? 0 : Math.random() * Math.PI * 2; parent.add(sprite);
    this.flips.push({ obj: sprite, mat, sheet, t: 0, fps, loop, spin, fade: 0, fadeDur: 0, brightness: 1 }); this.setFrame(mat, sheet, 0); return sprite;
  }

  /** Play a sheet lying flat on the floor (magic circles, scorch marks). Scale it with the returned mesh. */
  groundFlip(sheet: FlipSheet, pos: THREE.Vector3, size: number, fps: number, loop = false, spin = 0): THREE.Mesh {
    const mat = new THREE.MeshBasicMaterial({ map: this.sheetMap(sheet), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide, fog: false });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat); mesh.rotation.x = -Math.PI / 2; mesh.position.copy(pos).setY(walk.h(pos.x, pos.z) + 0.06); mesh.scale.setScalar(size); mesh.renderOrder = 2;
    this.scene.add(mesh); this.flips.push({ obj: mesh, mat, sheet, t: 0, fps, loop, spin, fade: 0, fadeDur: 0, brightness: 1 }); this.setFrame(mat, sheet, 0); return mesh;
  }

  /**
   * Play a sheet on a flat plane at `pos` (not lifted), turned by yaw around Y after lying it down (tilt lifts it back toward upright).
   * Lying flat, the cell's up points to world -Z rotated by yaw, and its +X to world +X rotated by yaw. mirror flips it left/right.
   */
  planeFlip(sheet: FlipSheet, pos: THREE.Vector3, size: number, fps: number, yaw: number, tilt = 0, mirror = false): THREE.Mesh {
    const mat = new THREE.MeshBasicMaterial({ map: this.sheetMap(sheet), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide, fog: false });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat); mesh.position.copy(pos); mesh.scale.set(mirror ? -size : size, size, 1); mesh.renderOrder = 3;
    mesh.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2 + tilt));
    this.scene.add(mesh); this.flips.push({ obj: mesh, mat, sheet, t: 0, fps, loop: false, spin: 0, fade: 0, fadeDur: 0, brightness: 1 }); this.setFrame(mat, sheet, 0); return mesh;
  }

  /**
   * Play a sheet as a bolt from a to b. The lightning sheet's bolt runs from (0.21, 0.24) to (0.79, 0.72) of each cell (uv, y up):
   * the quad is turned so that line lies on +X, stretched to the distance, and faces the camera around that axis.
   */
  beam(sheet: FlipSheet, a0: THREE.Vector3, b0: THREE.Vector3, fps: number): THREE.Mesh {
    const a = lift(a0), b = lift(b0);
    const mat = new THREE.MeshBasicMaterial({ map: this.sheetMap(sheet), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide, fog: false });
    const geo = new THREE.PlaneGeometry(1, 1).rotateZ(-Math.atan2(0.48, 0.58));
    const mesh = new THREE.Mesh(geo, mat); const mid = a.clone().lerp(b, 0.5); mesh.position.copy(mid);
    const X = b.clone().sub(a); const d = Math.max(0.5, X.length()); X.normalize();
    const Z = this.camera.position.clone().sub(mid); Z.addScaledVector(X, -Z.dot(X)).normalize(); const Y = Z.clone().cross(X);
    mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z));
    const s = d / 0.75; mesh.scale.set(s, Math.min(s, 3.4), 1); mesh.renderOrder = 3; this.scene.add(mesh);
    this.flips.push({ obj: mesh, mat, sheet, t: 0, fps, loop: false, spin: 0, fade: 0, fadeDur: 0, brightness: 1 }); this.setFrame(mat, sheet, 0); return mesh;
  }

  /** Multiply a flipbook's brightness (additive: >1 flares it). */
  brighten(obj: THREE.Object3D, k: number): void { const f = this.flips.find((x) => x.obj === obj); if (f) { f.brightness = k; f.mat.color.setScalar(k); } }

  /** Fade a flipbook out over `fade` seconds, then remove it. */
  kill(obj: THREE.Object3D, fade = 0.12): void { const f = this.flips.find((x) => x.obj === obj); if (f) { f.loop = false; f.fade = Math.max(0.001, fade); f.fadeDur = f.fade; } }

  private setFrame(mat: THREE.SpriteMaterial | THREE.MeshBasicMaterial, sh: FlipSheet, i: number): void {
    const c = i % sh.cols, r = Math.floor(i / sh.cols); mat.map!.offset.set(c / sh.cols, 1 - (r + 1) / sh.rows);
  }

  constructor(private scene: THREE.Scene, private camera: THREE.PerspectiveCamera) {
    const n = this.sp.max; this.sp.pos = new Float32Array(n * 3); this.sp.col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { this.sp.vel.push(new THREE.Vector3()); this.sp.life.push(0); this.sp.floor.push(0.02); this.sp.pos[i * 3 + 1] = -100; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(this.sp.pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(this.sp.col, 3));
    this.sparks = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.11, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }));
    this.sparks.frustumCulled = false; scene.add(this.sparks);
    // trail ribbon (triangle strip as indexed quads)
    const tg = new THREE.BufferGeometry(); const m = this.trailMax;
    tg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(m * 2 * 3), 3)); tg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(m * 2 * 4), 4));
    const idx: number[] = []; for (let i = 0; i < m - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } tg.setIndex(idx);
    this.trail = new THREE.Mesh(tg, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    this.trail.frustumCulled = false; scene.add(this.trail);
  }

  burst(p0: THREE.Vector3, n: number, power: number, color = 0xffe39a): void {
    const p = lift(p0); const floor = p.y - p0.y; const c = new THREE.Color(color); let made = 0;
    for (let i = 0; i < this.sp.max && made < n; i++) {
      if (this.sp.life[i] > 0) continue; made++;
      this.sp.life[i] = 0.25 + Math.random() * 0.25; this.sp.floor[i] = floor + 0.02;
      this.sp.pos.set([p.x, p.y, p.z], i * 3); this.sp.col.set([c.r, c.g, c.b], i * 3);
      this.sp.vel[i].set((Math.random() - 0.5) * 2, Math.random() * 1.4 + 0.2, (Math.random() - 0.5) * 2).normalize().multiplyScalar(power * (0.5 + Math.random()));
    }
  }

  ring(p: THREE.Vector3, r0: number, r1: number, dur: number, color = 0xffe39a): void {
    const mesh = new THREE.Mesh(new THREE.RingGeometry(0.86, 1, 40), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    mesh.rotation.x = -Math.PI / 2; mesh.position.copy(p).setY(walk.h(p.x, p.z) + 0.05); mesh.scale.setScalar(r0); this.scene.add(mesh); this.rings.push({ mesh, t: 0, dur, r0, r1 });
  }

  addTrailSample(a: THREE.Vector3, b: THREE.Vector3): void {
    this.trailSamples.unshift({ a: a.clone(), b: b.clone(), t: 0 }); if (this.trailSamples.length > this.trailMax) this.trailSamples.pop();
  }

  damageNumber(p: THREE.Vector3, text: string, kind: string = ''): void {
    const el = this.dmgPool.pop() ?? Object.assign(document.createElement('div'), { className: 'dmg' }); el.className = 'dmg ' + kind; el.textContent = text; document.body.appendChild(el);
    this.dmgActive.push({ el, pos: lift(p), t: 0, vy: 1.4 });
  }

  update(dt: number): void {
    // sparks
    const g = this.sparks.geometry as THREE.BufferGeometry;
    for (let i = 0; i < this.sp.max; i++) {
      if (this.sp.life[i] <= 0) { this.sp.pos[i * 3 + 1] = -100; continue; }
      this.sp.life[i] -= dt; const v = this.sp.vel[i]; v.y -= 6 * dt;
      this.sp.pos[i * 3] += v.x * dt; this.sp.pos[i * 3 + 1] += v.y * dt; this.sp.pos[i * 3 + 2] += v.z * dt;
      if (this.sp.pos[i * 3 + 1] < this.sp.floor[i]) { this.sp.pos[i * 3 + 1] = this.sp.floor[i]; v.y *= -0.3; }
    }
    (g.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true; (g.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
    // flipbooks
    for (let i = this.flips.length - 1; i >= 0; i--) {
      const f = this.flips[i]; f.t += dt;
      if (f.mat instanceof THREE.SpriteMaterial) f.mat.rotation += f.spin * dt; else f.obj.rotation.z += f.spin * dt;
      let frame = Math.floor(f.t * f.fps); let done = false;
      if (f.loop) frame %= f.sheet.frames;
      else if (f.fadeDur > 0) { f.fade -= dt; f.mat.opacity = Math.max(0, f.fade / f.fadeDur); frame %= f.sheet.frames; done = f.fade <= 0; }
      else if (frame >= f.sheet.frames) done = true;
      if (done) {
        f.obj.removeFromParent(); f.mat.map?.dispose(); f.mat.dispose(); if ((f.obj as THREE.Mesh).isMesh) (f.obj as THREE.Mesh).geometry.dispose();
        this.flips.splice(i, 1); continue;
      }
      this.setFrame(f.mat, f.sheet, Math.min(frame, f.sheet.frames - 1));
    }
    // rings
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i]; r.t += dt; const k = Math.min(1, r.t / r.dur); const e = 1 - (1 - k) * (1 - k);
      r.mesh.scale.setScalar(r.r0 + (r.r1 - r.r0) * e); (r.mesh.material as THREE.MeshBasicMaterial).opacity = 0.85 * (1 - k);
      if (k >= 1) { this.scene.remove(r.mesh); r.mesh.geometry.dispose(); (r.mesh.material as THREE.Material).dispose(); this.rings.splice(i, 1); }
    }
    // trail
    for (const s of this.trailSamples) s.t += dt;
    while (this.trailSamples.length && this.trailSamples[this.trailSamples.length - 1].t > 0.18) this.trailSamples.pop();
    const pos = (this.trail.geometry.getAttribute('position') as THREE.BufferAttribute), col = (this.trail.geometry.getAttribute('color') as THREE.BufferAttribute);
    for (let i = 0; i < this.trailMax; i++) {
      const s = this.trailSamples[Math.min(i, this.trailSamples.length - 1)]; const alive = !!s && i < this.trailSamples.length;
      const a = alive ? s.a : new THREE.Vector3(0, -100, 0), b = alive ? s.b : new THREE.Vector3(0, -100, 0); const al = alive ? Math.max(0, 1 - s.t / 0.18) * 0.42 : 0;
      pos.setXYZ(i * 2, a.x, a.y, a.z); pos.setXYZ(i * 2 + 1, b.x, b.y, b.z);
      col.setXYZW(i * 2, 1, 0.72, 0.28, al); col.setXYZW(i * 2 + 1, 0.9, 0.35, 0.1, al * 0.15);
    }
    pos.needsUpdate = true; col.needsUpdate = true;
    // damage numbers (DOM, projected)
    const v = new THREE.Vector3();
    for (let i = this.dmgActive.length - 1; i >= 0; i--) {
      const d = this.dmgActive[i]; d.t += dt; d.pos.y += d.vy * dt; d.vy *= 0.94;
      v.copy(d.pos).project(this.camera); d.el.style.left = ((v.x * 0.5 + 0.5) * innerWidth) + 'px'; d.el.style.top = ((-v.y * 0.5 + 0.5) * innerHeight) + 'px';
      d.el.style.opacity = String(Math.max(0, 1 - Math.max(0, d.t - 0.5) / 0.4));
      if (d.t > 0.9) { d.el.remove(); this.dmgPool.push(d.el); this.dmgActive.splice(i, 1); }
    }
    this.shake = Math.max(0, this.shake - dt * 1.6);
  }

  shakeOffset(out: THREE.Vector3): THREE.Vector3 {
    const s = this.shake * this.shake * 5; return out.set((Math.random() - 0.5) * s, (Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
  }
}
