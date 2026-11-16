import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export const ARENA_RADIUS = 15;
/** Ground rule for everything that walks. The arena is a disc; Chapter 1 swaps in its floor grid. */
export const walk = {
  ok: (x: number, z: number): boolean => Math.hypot(x, z) < ARENA_RADIUS - 1.2,
  h: (_x: number, _z: number): number => 0,
  /** In the air at height y: low obstacles whose top is below y can be crossed. */
  air: (x: number, z: number, _y: number): boolean => walk.ok(x, z),
  /** What a body at (x, z) with its feet at y stands on: the floor, or the top of anything lower than y (a log, a broken wall, a dais). */
  top: (x: number, z: number, _y: number): number => walk.h(x, z),
};
/** Move from (px, pz) to (x, z) without leaving walkable ground: slide along whichever axis still works. */
/** `r` is the body radius: the centre and four points around it must all be walkable (ignored if the start already fails it). */
export function settle(pos: { x: number; z: number }, px: number, pz: number, r = 0, rule: (x: number, z: number) => boolean = walk.ok): void {
  const body = (x: number, z: number) => rule(x, z) && rule(x + r, z) && rule(x - r, z) && rule(x, z + r) && rule(x, z - r)
    && rule(x + r * 0.7, z + r * 0.7) && rule(x - r * 0.7, z + r * 0.7) && rule(x + r * 0.7, z - r * 0.7) && rule(x - r * 0.7, z - r * 0.7);
  const ok = r > 0 && body(px, pz) ? body : rule;
  if (ok(pos.x, pos.z)) return;
  if (ok(pos.x, pz)) { pos.z = pz; return; }
  if (ok(px, pos.z)) { pos.x = px; return; }
  pos.x = px; pos.z = pz;
}

function canvasTexture(size: number, draw: (g: CanvasRenderingContext2D, s: number) => void, repeat: number): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = c.height = size; draw(c.getContext('2d')!, size);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

function flagstones(g: CanvasRenderingContext2D, s: number): void {
  g.fillStyle = '#1b1d22'; g.fillRect(0, 0, s, s); const n = 4, w = s / n;
  let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const v = 36 + rnd() * 22; g.fillStyle = `rgb(${v},${v + 2},${v + 8})`; g.fillRect(x * w + 3, y * w + 3, w - 6, w - 6);
    g.fillStyle = 'rgba(255,255,255,0.035)'; g.fillRect(x * w + 3, y * w + 3, w - 6, 5);
    if (rnd() < 0.35) { g.fillStyle = 'rgba(40,110,60,0.22)'; g.beginPath(); g.ellipse(x * w + rnd() * w, y * w + rnd() * w, 20 + rnd() * 30, 10 + rnd() * 18, rnd() * 3, 0, 7); g.fill(); }
  }
  for (let i = 0; i < 1500; i++) { g.fillStyle = `rgba(0,0,0,${rnd() * 0.12})`; g.fillRect(rnd() * s, rnd() * s, 2, 2); }
}

function bricks(g: CanvasRenderingContext2D, s: number): void {
  g.fillStyle = '#17100f'; g.fillRect(0, 0, s, s); let seed = 11; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const rows = 10, bh = s / rows, bw = s / 4;
  for (let r = 0; r < rows; r++) for (let c = -1; c < 5; c++) { const off = r % 2 ? bw / 2 : 0, v = rnd(); g.fillStyle = `rgb(${88 + v * 40},${38 + v * 14},${30 + v * 10})`; g.fillRect(c * bw + off + 2, r * bh + 2, bw - 4, bh - 4); }
}

export function buildWorld(scene: THREE.Scene, renderer: THREE.WebGLRenderer): { lamps: Array<{ light: THREE.PointLight; flame: THREE.Mesh; base: number }>; sun: THREE.DirectionalLight } {
  scene.background = new THREE.Color(0x07161a); scene.fog = new THREE.Fog(0x07161a, 40, 100);
  const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.45;
  scene.add(new THREE.HemisphereLight(0x9fd8c0, 0x20181a, 0.7));
  const sun = new THREE.DirectionalLight(0xffe2b0, 2.1); sun.position.set(-8, 16, -6); sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024); const sc = sun.shadow.camera; sc.left = -9; sc.right = 9; sc.top = 9; sc.bottom = -9; sc.near = 2; sc.far = 40; sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
  scene.add(sun); scene.add(sun.target);

  const floor = new THREE.Mesh(new THREE.CircleGeometry(ARENA_RADIUS + 6, 64), new THREE.MeshStandardMaterial({ map: canvasTexture(512, flagstones, 14), roughness: 0.92, metalness: 0 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  const bronze = new THREE.MeshStandardMaterial({ color: 0xb07a2a, roughness: 0.4, metalness: 0.9 });
  for (const [r, w] of [[9, 0.12], [8.5, 0.06], [3.2, 0.1]] as const) { const ring = new THREE.Mesh(new THREE.RingGeometry(r, r + w, 72), bronze); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.02; scene.add(ring); }

  const brick = new THREE.MeshStandardMaterial({ map: canvasTexture(256, bricks, 1), roughness: 0.95 });
  const flameMat = new THREE.MeshBasicMaterial({ color: 0x7dff4a });
  const lamps: Array<{ light: THREE.PointLight; flame: THREE.Mesh; base: number }> = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2, r = ARENA_RADIUS + 0.8, x = Math.cos(a) * r, z = Math.sin(a) * r;
    const broken = i % 3 === 1; const h = broken ? 2.2 : 5.5;
    const col = new THREE.Mesh(new THREE.BoxGeometry(1.5, h, 1.5), brick); col.position.set(x, h / 2, z); col.castShadow = true; col.receiveShadow = true; scene.add(col);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.3, 1.9), brick); cap.position.set(x, h + 0.15, z); scene.add(cap);
    if (i % 3 === 0) {
      const lx = Math.cos(a) * (ARENA_RADIUS - 0.8), lz = Math.sin(a) * (ARENA_RADIUS - 0.8);
      const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 1.1, 8), brick); stand.position.set(lx, 0.55, lz); scene.add(stand);
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.3, 0.3, 12), bronze); bowl.position.set(lx, 1.2, lz); scene.add(bowl);
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.7, 8), flameMat); flame.position.set(lx, 1.7, lz); scene.add(flame);
      const light = new THREE.PointLight(0x6dff3a, 18, 14, 2); light.position.set(lx, 1.8, lz); scene.add(light); lamps.push({ light, flame, base: 18 });
    }
  }
  for (let i = 0; i < 24; i++) {   // rubble ring so the edge reads as ruins
    const a = Math.random() * Math.PI * 2, r = ARENA_RADIUS - 1 + Math.random() * 3; const s = 0.2 + Math.random() * 0.5;
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), new THREE.MeshStandardMaterial({ color: 0x3a3d44, roughness: 1 })); rock.position.set(Math.cos(a) * r, s * 0.4, Math.sin(a) * r); rock.rotation.set(Math.random() * 3, Math.random() * 3, 0); rock.castShadow = true; scene.add(rock);
  }
  return { lamps, sun };
}
