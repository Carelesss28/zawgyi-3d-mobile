import * as THREE from 'three';

/**
 * Main-menu backdrop: Dark Zaw Gyi seated on the broken seal pillar he was sealed in (blue runes, the princess's red crack),
 * staff on his shoulder, high on the pillar, gazing down at the player from a low camera. Cold moonlight and drifting dust.
 * Rendered on the game canvas until Start; the camera frames him on the right so the menu sits on the left.
 */
export class MainMenu {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(38, 16 / 9, 0.1, 100);
  private mixer: THREE.AnimationMixer;
  private t = 0;
  private embers: THREE.Points; private emberV: Float32Array;
  private motes: THREE.Points;
  private runeMat: THREE.MeshStandardMaterial;
  private seatY = 0.8;
  private readonly H = 2.1;
  private holder!: THREE.Group;
  /** Turntable: drag to spin him; it eases back to face the player when let go. */
  private yaw = -0.25; private yawV = 0; private dragging = false; private lastX = 0; private idle = 0;                      // pillar height: he sits up high

  constructor(hero: THREE.Object3D, clip: THREE.AnimationClip | undefined, base: string) {
    const sc = this.scene;
    sc.background = new THREE.Color(0x05070c); sc.fog = new THREE.Fog(0x070a12, 7, 18);
    // lights: cold moonlight rim from above and behind, a dim front key, blue rune glow from the pillar
    const moon = new THREE.DirectionalLight(0xb8d0ff, 3.4); moon.position.set(-1.5, 6, -4); sc.add(moon);
    const rim = new THREE.PointLight(0x7aa8ff, 18, 8, 1.6); rim.position.set(1.2, 3.6, -1.6); sc.add(rim);
    const key = new THREE.DirectionalLight(0xd8c8b8, 1.5); key.position.set(1.5, 1.0, 4); sc.add(key);
    const blue = new THREE.PointLight(0x4aa8ff, 6, 4, 2); blue.position.set(0, 1.0, 1.2); sc.add(blue);
    sc.add(new THREE.HemisphereLight(0x4a5878, 0x0a0c12, 0.9));
    // a huge full moon behind him: he reads as a silhouette rimmed in pale light
    const mc = document.createElement('canvas'); mc.width = mc.height = 256; const mg2 = mc.getContext('2d')!;
    const grd = mg2.createRadialGradient(128, 128, 0, 128, 128, 128); grd.addColorStop(0, 'rgba(235,240,255,1)'); grd.addColorStop(0.42, 'rgba(210,222,255,0.95)'); grd.addColorStop(0.47, 'rgba(150,175,255,0.35)'); grd.addColorStop(1, 'rgba(60,80,160,0)');
    mg2.fillStyle = grd; mg2.fillRect(0, 0, 256, 256); for (let k = 0; k < 40; k++) { mg2.fillStyle = `rgba(150,160,190,${0.08 + Math.random() * 0.12})`; mg2.beginPath(); mg2.arc(80 + Math.random() * 96, 80 + Math.random() * 96, 4 + Math.random() * 14, 0, 7); mg2.fill(); }
    const moonTex = new THREE.CanvasTexture(mc); moonTex.colorSpace = THREE.SRGBColorSpace;
    const moonS = new THREE.Sprite(new THREE.SpriteMaterial({ map: moonTex, transparent: true, depthWrite: false, fog: false, toneMapped: false })); moonS.position.set(0.15, 6.6, -9); moonS.scale.setScalar(7.0); sc.add(moonS);

    // the hero, posed on the pillar
    this.mixer = new THREE.AnimationMixer(hero);
    if (clip) { const a = this.mixer.clipAction(clip); a.setLoop(THREE.LoopRepeat, Infinity); a.play(); }
    this.mixer.update(0.01); hero.updateMatrixWorld(true);
    this.restyle(hero, 0.12, 0.035);                                                          // a deeper crouch and broader shoulders (the pose is static, so it holds)
    let hips: THREE.Object3D | null = null; hero.traverse((o) => { if (!hips && /hips/i.test(o.name)) hips = o; });
    const hp = new THREE.Vector3(); if (hips) (hips as THREE.Object3D).getWorldPosition(hp); this.seatY = Math.max(0.3, hp.y - 0.15);   // the seat of his robe, just under the hips
    hero.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = false; m.frustumCulled = false; } });
    // perched: crouched on top of the pillar, only his feet on it, toes at the front rim (like a hero splash-art pose)
    const ft = new THREE.Vector3(), f2 = new THREE.Vector3(); let lf: THREE.Object3D | null = null, rf: THREE.Object3D | null = null;
    hero.traverse((o) => { if (o.name === 'Left_Foot') lf = o; if (o.name === 'Right_Foot') rf = o; });
    if (lf && rf) { (lf as THREE.Object3D).getWorldPosition(ft); (rf as THREE.Object3D).getWorldPosition(f2); ft.add(f2).multiplyScalar(0.5); } else ft.set(hp.x, 0.1, hp.z + 0.4);
    hero.position.set(-ft.x, this.H - (ft.y - 0.09), 0.3 - ft.z);
    const holder = new THREE.Group(); holder.add(hero); holder.rotation.y = -0.25; sc.add(holder); this.holder = holder;   // facing the camera

    // the broken seal pillar: a stump of the column he was sealed in
    const rune = document.createElement('canvas'); rune.width = 512; rune.height = 256; const g = rune.getContext('2d')!;
    g.fillStyle = '#000'; g.fillRect(0, 0, 512, 256); g.strokeStyle = '#fff'; g.lineWidth = 3;
    for (let k = 0; k < 7; k++) { g.beginPath(); g.arc(37 + k * 73, 128, 26, 0, 7); g.stroke(); g.beginPath(); g.moveTo(37 + k * 73, 92); g.lineTo(37 + k * 73, 164); g.moveTo(14 + k * 73, 128); g.lineTo(60 + k * 73, 128); g.stroke(); }
    g.lineWidth = 2; g.beginPath(); g.moveTo(0, 40); g.lineTo(512, 40); g.moveTo(0, 216); g.lineTo(512, 216); g.stroke();
    const runeTex = new THREE.CanvasTexture(rune); runeTex.wrapS = THREE.RepeatWrapping; runeTex.colorSpace = THREE.SRGBColorSpace;
    const stone = document.createElement('canvas'); stone.width = stone.height = 256; const s2 = stone.getContext('2d')!;
    s2.fillStyle = '#3e3a40'; s2.fillRect(0, 0, 256, 256); for (let k = 0; k < 1400; k++) { s2.fillStyle = `rgba(${Math.random() < 0.5 ? 10 : 120},${Math.random() < 0.5 ? 12 : 115},${Math.random() < 0.5 ? 20 : 125},0.18)`; s2.fillRect(Math.random() * 256, Math.random() * 256, 2 + Math.random() * 5, 2 + Math.random() * 4); }
    s2.strokeStyle = 'rgba(255,60,30,1)'; s2.lineWidth = 4; s2.shadowColor = '#ff3010'; s2.shadowBlur = 8; s2.beginPath(); let x = 140, y = 0; s2.moveTo(x, y); while (y < 256) { x += (Math.random() - 0.5) * 22; y += 10 + Math.random() * 14; s2.lineTo(x, y); } s2.stroke();   // her crack
    const stoneTex = new THREE.CanvasTexture(stone); stoneTex.colorSpace = THREE.SRGBColorSpace;
    this.runeMat = new THREE.MeshStandardMaterial({ map: stoneTex, roughness: 0.9, emissive: 0x3aa0ff, emissiveMap: runeTex, emissiveIntensity: 0.9 });
    const pg = new THREE.CylinderGeometry(0.44, 0.58, this.H, 28, 8); const pp = pg.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pp.count; i++) if (pp.getY(i) > this.H / 2 - 0.01 && Math.hypot(pp.getX(i), pp.getZ(i)) > 0.36) pp.setY(i, pp.getY(i) - Math.random() * 0.1);   // broken rim
    pg.computeVertexNormals();
    runeTex.wrapT = THREE.RepeatWrapping; runeTex.repeat.set(1, 3); stoneTex.wrapS = stoneTex.wrapT = THREE.RepeatWrapping; stoneTex.repeat.set(1, 2.5);
    const pillar = new THREE.Mesh(pg, this.runeMat); pillar.position.y = this.H / 2; holder.add(pillar);
        // broken pieces of the upper column lying around, and the floor
    const shardMat = new THREE.MeshStandardMaterial({ map: stoneTex, roughness: 0.95, emissive: 0x2a80d0, emissiveMap: runeTex, emissiveIntensity: 0.7 });
    for (const [px, pz, sz, ry] of [[-1.3, -1.4, 0.2, 0.4], [-0.6, -1.9, 0.16, 1.2], [1.0, -2.2, 0.24, 2.0]]) {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(sz * 0.9, sz, sz * 1.6, 12), shardMat); c.position.set(px, sz * 0.8, pz); c.rotation.set(Math.PI / 2 * 0.9, ry, 0.2); holder.add(c);
    }
    const floor = new THREE.Mesh(new THREE.CircleGeometry(40, 48).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x1c1416, roughness: 1 })); sc.add(floor);
    const glyph = new THREE.Mesh(new THREE.RingGeometry(1.0, 1.06, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x3a90ff, transparent: true, opacity: 0.5, toneMapped: false })); glyph.position.y = 0.01; holder.add(glyph);
    for (let k = 0; k < 6; k++) { const col = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.4, 7, 10), new THREE.MeshStandardMaterial({ color: 0x0c0809, roughness: 1 })); const a = -2.4 + k * 0.55; col.position.set(Math.sin(a) * 6.5, 3.5, Math.cos(a) * 6.5 - 1.5); sc.add(col); }

    // dust drifting in the moonlight, blue rune motes circling the pillar
    const N = 140; const pos = new Float32Array(N * 3); this.emberV = new Float32Array(N);
    for (let i = 0; i < N; i++) { pos[i * 3] = (Math.random() - 0.5) * 6; pos[i * 3 + 1] = Math.random() * 5; pos[i * 3 + 2] = -2 + Math.random() * 4; this.emberV[i] = 0.05 + Math.random() * 0.15; }
    const eg = new THREE.BufferGeometry(); eg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.embers = new THREE.Points(eg, new THREE.PointsMaterial({ color: 0xc8d8ff, size: 0.03, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false })); sc.add(this.embers);
    const M = 50; const mp = new Float32Array(M * 3); for (let i = 0; i < M; i++) { const a = Math.random() * 6.28, r = 0.6 + Math.random() * 1.2; mp[i * 3] = Math.cos(a) * r; mp[i * 3 + 1] = Math.random() * 2.4; mp[i * 3 + 2] = Math.sin(a) * r; }
    const mg = new THREE.BufferGeometry(); mg.setAttribute('position', new THREE.BufferAttribute(mp, 3));
    this.motes = new THREE.Points(mg, new THREE.PointsMaterial({ color: 0x6ac0ff, size: 0.035, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false })); holder.add(this.motes);
  }

  /**
   * Pose tweaks on top of the clip: drop the hips by `drop` (world m) and re-solve both legs so the feet stay planted
   * (two-bone IK in the leg's own bend plane), push the shoulders outward by `widen`, and carry the staff grip along with
   * the right hand so it stays in his fist.
   */
  private restyle(hero: THREE.Object3D, drop: number, widen: number): void {
    const bone = (n: string) => { let b: THREE.Object3D | null = null; hero.traverse((o) => { if (!b && o.name === n) b = o; }); return b as THREE.Object3D | null; };
    const W = (o: THREE.Object3D) => o.getWorldPosition(new THREE.Vector3());
    const hips = bone('Hips'), grip = bone('Staff_Grip'), hand = bone('Right_Hand'); if (!hips) return;
    hero.updateMatrixWorld(true);
    const handBefore = hand ? W(hand) : null;
    const legs = (['Left', 'Right'] as const).map((sd) => { const up = bone(`${sd}_UpperLeg`)!, lo = bone(`${sd}_LowerLeg`)!, ft = bone(`${sd}_Foot`)!; return { up, lo, ft, A0: W(up), K0: W(lo), F0: W(ft) }; });
    // drop the hips (in their parent's space)
    const hw = W(hips).add(new THREE.Vector3(0, -drop, 0)); hips.position.copy(hips.parent!.worldToLocal(hw)); hero.updateMatrixWorld(true);
    const aim = (b: THREE.Object3D, from: THREE.Vector3, to: THREE.Vector3) => {            // rotate bone b (world) so the direction `from` becomes `to`
      const q = new THREE.Quaternion().setFromUnitVectors(from.clone().normalize(), to.clone().normalize());
      const wq = b.getWorldQuaternion(new THREE.Quaternion()); const pq = b.parent!.getWorldQuaternion(new THREE.Quaternion());
      b.quaternion.copy(pq.invert().multiply(q.multiply(wq))); b.updateMatrixWorld(true);
    };
    for (const l of legs) {
      const L1 = l.A0.distanceTo(l.K0), L2 = l.K0.distanceTo(l.F0); const A = W(l.up), F = l.F0;
      const d = Math.min(L1 + L2 - 1e-3, A.distanceTo(F)); const dir = F.clone().sub(A).normalize();
      const pole = l.K0.clone().sub(l.A0).addScaledVector(dir, -l.K0.clone().sub(l.A0).dot(dir)).normalize();   // the knee keeps pointing the same way
      const ca = (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), sa = Math.sqrt(Math.max(0, 1 - ca * ca));
      const K = A.clone().addScaledVector(dir, L1 * ca).addScaledVector(pole, L1 * sa);
      aim(l.up, W(l.lo).sub(A), K.clone().sub(A)); aim(l.lo, W(l.ft).sub(W(l.lo)), F.clone().sub(W(l.lo)));
    }
    // broader shoulders: push each collarbone outward along the body's sideways axis
    const side = new THREE.Vector3(1, 0, 0);
    for (const [n, sgn] of [['Left_Shoulder', 1], ['Right_Shoulder', -1]] as const) {
      const b = bone(n); if (!b) continue; const w = W(b); const lw = W(bone(n === 'Left_Shoulder' ? 'Left_UpperArm' : 'Right_UpperArm') ?? b);
      const out = lw.clone().sub(w); out.y = 0; if (out.lengthSq() < 1e-6) out.copy(side).multiplyScalar(sgn); out.normalize();
      b.position.copy(b.parent!.worldToLocal(w.addScaledVector(out, widen))); hero.updateMatrixWorld(true);
    }
    // the staff follows his fist
    if (grip && hand && handBefore) { const gw = W(grip).add(W(hand).sub(handBefore)); grip.position.copy(grip.parent!.worldToLocal(gw)); hero.updateMatrixWorld(true); }
  }

  /** Hook pointer drags on the canvas (the menu overlay lets drags through on its right side). */
  bindDrag(el: HTMLElement, active: () => boolean): void {
    el.addEventListener('pointerdown', (e) => { if (!active()) return; this.dragging = true; this.lastX = e.clientX; this.yawV = 0; });
    window.addEventListener('pointermove', (e) => { if (!this.dragging) return; const d = (e.clientX - this.lastX) / Math.max(200, el.clientWidth) * 6; this.lastX = e.clientX; this.yaw += d; this.yawV = d * 30; this.idle = 0; });
    window.addEventListener('pointerup', () => { this.dragging = false; });
  }

  render(renderer: THREE.WebGLRenderer, dt: number): void {
    if (!this.dragging) { this.yaw += this.yawV * dt; this.yawV *= Math.max(0, 1 - 3 * dt); this.idle += dt; if (this.idle > 2.5) this.yaw += (-0.25 - this.yaw) * Math.min(1, dt * 0.8); }
    this.holder.rotation.y = this.yaw;
    this.t += dt;                                                                              // (the seated pose is static: no mixer update, so the pose tweaks hold)
    const el = renderer.domElement, w = el.clientWidth || 16, h = el.clientHeight || 9;
    this.camera.aspect = w / h;
    // slow drift; hero framed on the right (view offset) so the menu has the left side
    const a = Math.sin(this.t * 0.12) * 0.12;
    this.camera.position.set(Math.sin(a) * 4.4, 0.75 + Math.sin(this.t * 0.2) * 0.05, Math.cos(a) * 4.4);   // low: he looks down at the player
    this.camera.lookAt(0, 2.25, 0);
    this.camera.setViewOffset(w, h, -w * 0.2, 0, w, h); this.camera.updateProjectionMatrix();
    const p = this.embers.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) { let y = p.getY(i) + this.emberV[i] * dt; let x = p.getX(i) + Math.sin(this.t * 1.3 + i) * dt * 0.15; if (y > 5) { y = 0; x = (Math.random() - 0.5) * 6; } p.setXY(i, x, y); }
    p.needsUpdate = true;
    this.motes.rotation.y = this.t * 0.15;
    this.runeMat.emissiveIntensity = 0.8 + Math.sin(this.t * 1.7) * 0.25;
    renderer.render(this.scene, this.camera);
  }
}
