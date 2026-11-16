import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { addSpot, addQuest, spotDone, STORY } from './places';

/**
 * The grown valley's new places (the owner's 1.4x expansion plan), built by buildChapter1 with its helpers (the Kit). Everything here
 * draws from its own random stream, so the world's layout never moves. Stand-ins are simple procedural props; any can be registered
 * as a prop swap later when Tripo models arrive.
 */
export interface Kit {
  scene: THREE.Scene;
  put: (m: THREE.Mesh, x: number, y: number, z: number, rx?: number, ry?: number, rz?: number) => THREE.Mesh;
  solid: (x: number, z: number, r: number, h?: number) => void;
  solidRect: (x: number, z: number, w: number, d: number, h: number, ry?: number) => void;
  ground: (x: number, z: number) => number;
  sparkle: (x: number, y: number, z: number, s: number, col: number) => THREE.Sprite;
  anims: Array<(t: number) => void>;
  tex: (size: number, draw: (g: CanvasRenderingContext2D, s: number) => void, rep?: number) => THREE.CanvasTexture;
  nearPath: (x: number, z: number, d: number) => boolean;
  walkable: (x: number, z: number) => boolean;
  homes: Array<{ x: number; z: number; th: number; s: number; burnt: boolean }>;
  mats: { timber: THREE.Material; bamboo: THREE.Material; thatch: THREE.Material; charred: THREE.Material; sandstone: THREE.Material; gilt: THREE.Material };
  lootAt: (x: number, z: number, y: number | null, souls: number, name: string) => void;
  fragmentAt: (x: number, z: number, y: number | null, text: string) => void;
  captives: Array<{ camp: number; x: number; z: number; objs: THREE.Object3D[] }>;
  camps: Array<{ x: number; z: number; tent: number; evil: 'fire' | 'ritual' | 'cauldron' | 'totems' | 'cage' | 'graves'; region: 'goblin' | 'bone' | 'garrison' | 'marsh' | 'cross' | 'monastery' | 'village' | 'snare'; members: Array<'ghoul' | 'caster' | 'sword' | 'lance' | 'ghost' | 'archer' | 'monk'> }>;
  regions: Array<{ name: string; x: number; z: number }>;
  /** clear a place's footprint (scattered clutter and its colliders) before building there */
  clear: (x: number, z: number, r: number) => void;
  /** lay an old paved trail through these points */
  trail: (P: Array<[number, number]>) => void;
  /** run a build step and return the cells it blocked; untrack opens them again */
  track: (fn: () => void) => Array<[number, number, number]>;
  untrack: (cells: Array<[number, number, number]>) => void;
  /** the world's inscriptions (read by walking up): new ones are added at the end, so saves keep their order */
  steles: Array<{ x: number; z: number; title: string; text: string; read: boolean }>;
  /** water within d of (x, z): the river, a stream or a pool (places keep out of it) */
  wet: (x: number, z: number, d: number) => boolean;
  trenches: Array<{ pts: Array<[number, number]>; seg: number[]; w: number; d: number; name: string; len: number }>;
  bridges: Array<{ ax: number; az: number; dx: number; dz: number; len: number; w: number }>;
  /** lay a flat bridge now (centre, direction, length, width) */
  addBridge: (cx: number, cz: number, dx: number, dz: number, len: number, W: number) => void;
  polyAt: (pts: Array<[number, number]>, seg: number[], sd: number) => [number, number];
  /** the old village's lanes (they are not in the trail list) */
  lanes: Array<Array<[number, number]>>;
  /** the floor height inside the temple (its paving stands above the hill's ground) */
  floor: (x: number, z: number) => number;
}

/** Where each freed villager lives (their own house, by its door), filled when the village is built. */
export const VILLAGE_HOMES: Record<string, { x: number; z: number; ry: number }> = {};
/** What comes back to the village when someone comes home (run by game.ts when they return, and on load). */
export const RECOVER: Record<string, () => void> = {};

let seed = 777;
const R = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

/** Cloth in a village colour: woven stripes (madder red, indigo, saffron, faded green). */
function clothTex(k: Kit, base: string, stripe: string): THREE.CanvasTexture {
  return k.tex(64, (g, s) => { g.fillStyle = base; g.fillRect(0, 0, s, s); g.fillStyle = stripe; for (let y = 4; y < s; y += 14) g.fillRect(0, y, s, 3 + (y % 3)); g.fillStyle = 'rgba(0,0,0,0.12)'; for (let x = 0; x < s; x += 2) g.fillRect(x, 0, 1, s); });
}
const CLOTHS: Array<[string, string]> = [['#8a2e22', '#d8a040'], ['#2c3a6a', '#c8c0a0'], ['#c08a2a', '#6a2a1a'], ['#4a6a3a', '#d8c890'], ['#6a2a4a', '#e0b060']];

/** A hanging cloth (sags in the middle), from a to b at height h. */
function cloth(k: Kit, ax: number, az: number, bx: number, bz: number, h: number, drop: number, mat: THREE.Material, sag = 0.25): THREE.Mesh {
  const L = Math.hypot(bx - ax, bz - az), g = new THREE.PlaneGeometry(L, drop, 8, 2), p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) { const u = p.getX(i) / L + 0.5; p.setY(i, p.getY(i) - Math.sin(u * Math.PI) * sag); p.setZ(i, Math.sin(u * Math.PI * 3) * 0.03); }
  g.computeVertexNormals(); const m = new THREE.Mesh(g, mat); m.position.set((ax + bx) / 2, h - drop / 2, (az + bz) / 2); m.rotation.y = -Math.atan2(bz - az, bx - ax); m.castShadow = true; k.scene.add(m); return m;
}
/** A flat awning on two poles, sloping away from the house. */
function awning(k: Kit, x: number, z: number, ry: number, w: number, d: number, mat: THREE.Material): THREE.Object3D[] {
  const out: THREE.Object3D[] = [], c = Math.cos(ry), s = Math.sin(ry), gy = k.ground(x, z);
  const g = new THREE.PlaneGeometry(w, d, 6, 3).rotateX(-Math.PI / 2 + 0.28), p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) - Math.sin((p.getX(i) / w + 0.5) * Math.PI) * 0.12);
  g.computeVertexNormals(); const m = new THREE.Mesh(g, mat); m.position.set(x, gy + 2.2, z); m.rotation.y = ry; m.castShadow = true; k.scene.add(m); out.push(m);
  for (const a of [-w / 2 + 0.1, w / 2 - 0.1]) { const px = x + a * c + (d / 2) * s, pz = z - a * s + (d / 2) * c; out.push(k.put(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 2.0, 5), k.mats.bamboo), px, gy + 1.0, pz)); k.solid(px, pz, 0.12); }
  return out;
}
/** A weaver's loom: a timber frame, warp threads, a half-woven cloth and a bench. */
function loom(k: Kit, x: number, z: number, ry: number, clothMat: THREE.Material): THREE.Object3D[] {
  const gy = k.ground(x, z), g = new THREE.Group(); g.position.set(x, gy, z); g.rotation.y = ry; k.scene.add(g);
  const post = (px: number, pz: number, h: number) => { const m = new THREE.Mesh(new THREE.BoxGeometry(0.1, h, 0.1), k.mats.timber); m.position.set(px, h / 2, pz); g.add(m); };
  for (const px of [-0.8, 0.8]) { post(px, -0.6, 1.5); post(px, 0.6, 1.0); }
  for (const [y, z2] of [[1.45, -0.6], [0.95, 0.6], [0.35, -0.6]]) { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.7, 6).rotateZ(Math.PI / 2), k.mats.timber); m.position.set(0, y, z2); g.add(m); }
  const pts: number[] = []; for (let u = -0.7; u <= 0.71; u += 0.06) pts.push(u, 1.42, -0.58, u, 0.93, 0.58);
  const warp = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)), new THREE.LineBasicMaterial({ color: 0xd8ccb0 })); g.add(warp);
  const woven = new THREE.Mesh(new THREE.PlaneGeometry(1.42, 0.55).rotateX(-0.42), clothMat); woven.position.set(0, 1.05, 0.33); g.add(woven);
  const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.5, 10).rotateZ(Math.PI / 2), clothMat); roll.position.set(0, 0.95, 0.66); g.add(roll);
  const bench = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.08, 0.32), k.mats.timber); bench.position.set(0, 0.42, 1.15); g.add(bench);
  for (const px of [-0.4, 0.4]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.42, 0.25), k.mats.timber); l.position.set(px, 0.21, 1.15); g.add(l); }
  g.traverse((o) => { o.castShadow = true; }); k.solidRect(x, z, 1.8, 1.4, 1.5, ry); return [g];
}
/** A bamboo drying rack: an A-frame with three poles hung with bundles of herbs (fresh green, or dry and brown). */
function rack(k: Kit, x: number, z: number, ry: number, fresh: boolean): { obj: THREE.Group; herbs: THREE.Mesh } {
  const gy = k.ground(x, z), g = new THREE.Group(); g.position.set(x, gy, z); g.rotation.y = ry; k.scene.add(g);
  for (const px of [-1.2, 1.2]) for (const sz of [-1, 1]) { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 1.9, 5), k.mats.bamboo); m.position.set(px, 0.9, sz * 0.32); m.rotation.x = -sz * 0.36; g.add(m); }
  for (const y of [1.62, 1.25, 0.88]) { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.6, 5).rotateZ(Math.PI / 2), k.mats.bamboo); m.position.set(0, y, 0); g.add(m); }
  const bundles: THREE.BufferGeometry[] = [];
  for (const y of [1.62, 1.25, 0.88]) for (let u = -1.0; u <= 1.01; u += 0.28) bundles.push(new THREE.ConeGeometry(0.09, 0.42, 5).rotateX(Math.PI).translate(u + (R() - 0.5) * 0.06, y - 0.22, (R() - 0.5) * 0.08));
  const herbs = new THREE.Mesh(mergeGeometries(bundles), new THREE.MeshStandardMaterial({ color: fresh ? 0x5a8a3a : 0x7a6a42, roughness: 1, flatShading: true })); g.add(herbs);
  g.traverse((o) => { o.castShadow = true; }); k.solidRect(x, z, 2.6, 0.8, 1.7, ry); return { obj: g, herbs };
}
/** A raised household bed: a timber edge, dark soil and a few plants (wild and gone to seed, or tended). */
function bed(k: Kit, x: number, z: number, ry: number, w: number, d: number, plantMat: THREE.Material): THREE.Mesh {
  const gy = k.ground(x, z), c = Math.cos(ry), s = Math.sin(ry);
  for (const [a, b, ww, dd] of [[0, -d / 2, w, 0.1], [0, d / 2, w, 0.1], [-w / 2, 0, 0.1, d], [w / 2, 0, 0.1, d]] as Array<[number, number, number, number]>) k.put(new THREE.Mesh(new THREE.BoxGeometry(ww, 0.22, dd), k.mats.timber), x + a * c + b * s, gy + 0.11, z - a * s + b * c, 0, ry, 0);
  k.put(new THREE.Mesh(new THREE.BoxGeometry(w - 0.1, 0.16, d - 0.1), new THREE.MeshStandardMaterial({ color: 0x3a2c1e, roughness: 1 })), x, gy + 0.08, z, 0, ry, 0);
  const ps: THREE.BufferGeometry[] = []; for (let a = -w / 2 + 0.3; a < w / 2 - 0.2; a += 0.45) for (let b = -d / 2 + 0.3; b < d / 2 - 0.2; b += 0.45) ps.push(new THREE.ConeGeometry(0.14 + R() * 0.08, 0.3 + R() * 0.3, 5).translate(a, 0.3, b));
  const pm = new THREE.Mesh(mergeGeometries(ps), plantMat); pm.position.set(x, gy, z); pm.rotation.y = ry; pm.castShadow = true; k.scene.add(pm); return pm;
}
/** An old boat, pulled up and left: an open plank hull, a seat, a paddle. */
function boat(k: Kit, x: number, z: number, ry: number, tilt: number): THREE.Group {
  const gy = k.ground(x, z), g = new THREE.Group(); g.position.set(x, gy + 0.1, z); g.rotation.set(0, ry, tilt); k.scene.add(g);
  const hull = new THREE.CylinderGeometry(0.62, 0.62, 4.2, 12, 1, true, Math.PI / 2, Math.PI).rotateZ(Math.PI / 2).scale(1, 0.62, 1);
  const p = hull.attributes.position as THREE.BufferAttribute; for (let i = 0; i < p.count; i++) { const u = Math.abs(p.getX(i)) / 2.1; p.setZ(i, p.getZ(i) * (1 - u * u * 0.85)); }
  hull.computeVertexNormals(); const m = new THREE.Mesh(hull, new THREE.MeshStandardMaterial({ color: 0x5a442c, roughness: 0.95, side: THREE.DoubleSide })); m.position.y = 0.38; g.add(m);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.06, 0.95), k.mats.timber); seat.position.set(0.3, 0.3, 0); g.add(seat);
  const pad = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.04, 0.1), k.mats.timber); pad.position.set(-0.4, 0.42, 0.25); pad.rotation.y = 0.3; g.add(pad);
  g.traverse((o) => { o.castShadow = true; o.receiveShadow = true; }); k.solidRect(x, z, 4.0, 1.2, 0.8, ry); return g;
}
/** A broken stretch of bamboo fence: stakes, some snapped, some knocked flat. */
function brokenFence(k: Kit, ax: number, az: number, bx: number, bz: number): void {
  const L = Math.hypot(bx - ax, bz - az), n = Math.floor(L / 0.32), ry = Math.atan2(bx - ax, bz - az);
  for (let i = 0; i <= n; i++) {
    const u = i / n, x = ax + (bx - ax) * u, z = az + (bz - az) * u, gy = k.ground(x, z), gone = Math.sin(i * 1.7) > 0.55 || (u > 0.4 && u < 0.62);
    if (gone && R() < 0.6) { if (R() < 0.5) k.put(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.2, 5), k.mats.bamboo), x + (R() - 0.5) * 0.8, gy + 0.05, z + (R() - 0.5) * 0.8, Math.PI / 2, ry + (R() - 0.5), 0); continue; }
    const h = gone ? 0.25 + R() * 0.3 : 1.0 + R() * 0.3; k.put(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, h, 5), k.mats.bamboo), x, gy + h / 2, z, (R() - 0.5) * 0.15, 0, (R() - 0.5) * 0.25);
    if (!gone) k.solid(x, z, 0.1, h);
  }
}
/** Drag marks: two dark furrows in the earth, from a to b (people hauled away). */
function dragMarks(k: Kit, pts: Array<[number, number]>): void {
  const mat = new THREE.MeshBasicMaterial({ color: 0x1c140c, transparent: true, opacity: 0.42, depthWrite: false });
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i], L = Math.hypot(bx - ax, bz - az), ry = Math.atan2(bx - ax, bz - az), nx = Math.cos(ry), nz = -Math.sin(ry);
    for (const o of [-0.3, 0.3]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(0.16, L).rotateX(-Math.PI / 2), mat); m.rotation.y = ry; const x = (ax + bx) / 2 + nx * o, z = (az + bz) / 2 + nz * o; m.position.set(x, k.ground(x, z) + 0.02, z); m.renderOrder = 2; k.scene.add(m); }
  }
}
/** Things dropped in a hurry: overturned baskets, broken pots, a cloth in the dirt. */
function belongings(k: Kit, x: number, z: number, n: number, clothMat: THREE.Material): void {
  const pot = new THREE.MeshStandardMaterial({ color: 0x8a5a3a, roughness: 0.95 }), wicker = new THREE.MeshStandardMaterial({ color: 0x9a7a48, roughness: 1, flatShading: true });
  for (let i = 0; i < n; i++) {
    const a = R() * 6.28, d = R() * 2.2, px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d, gy = k.ground(px, pz), kind = i % 3;
    if (kind === 0) k.put(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.22, 0.35, 9, 1, true), wicker), px, gy + 0.2, pz, Math.PI / 2 + (R() - 0.5) * 0.4, R() * 6, 0);
    else if (kind === 1) for (let j = 0; j < 3; j++) k.put(new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.12, 0.08, 7, 1, true, R() * 6, 2.0), pot), px + (R() - 0.5) * 0.5, gy + 0.04, pz + (R() - 0.5) * 0.5, (R() - 0.5) * 2, R() * 6, (R() - 0.5) * 2);
    else { const m = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.6).rotateX(-Math.PI / 2), clothMat); m.position.set(px, gy + 0.025, pz); m.rotation.y = R() * 6; m.renderOrder = 2; k.scene.add(m); }
  }
}
/** A stone lantern, cold until someone lights it again: returns the glow to switch on. */
function lantern(k: Kit, x: number, z: number): { on: () => void } {
  const gy = k.ground(x, z), glow = k.sparkle(x, gy + 1.22, z, 1.2, 0xffc070); glow.visible = false; const ph = R() * 6;
  k.anims.push((t) => { if (glow.visible) glow.material.opacity = 0.75 + 0.2 * Math.sin(t * 7 + ph) * Math.sin(t * 2.3 + ph); });
  return { on: () => { glow.visible = true; } };
}

/**
 * The Old Village, a hub that changes: its districts (Weavers' Lane, the Herb Yards, the River Landing, the Burned Quarter round the
 * plaza) and what comes back when its people come home (the weaver's cloth, the herb woman's racks, the lamps the boy relights).
 */
export function buildVillageDistricts(k: Kit, V: { x: number; z: number }): void {
  const clothM = CLOTHS.map(([a, b]) => new THREE.MeshStandardMaterial({ map: clothTex(k, a, b), roughness: 0.9, side: THREE.DoubleSide }));
  const live = k.homes.filter((h) => !h.burnt), near = (x: number, z: number, used: Set<unknown>) => live.filter((h) => !used.has(h)).sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z))[0];
  const used = new Set<unknown>();
  /** A spot in a house's yard: out from its door (toward the lane) and to one side. */
  const yard = (h: { x: number; z: number; th: number; s: number }, out: number, side: number): [number, number, number] => { const fx = Math.sin(h.th), fz = Math.cos(h.th); return [h.x + fx * out + fz * side, h.z + fz * out - fx * side, h.th]; };
  const onLane = (x: number, z: number, d: number) => k.lanes.some((L) => L.some(([ax, az], i) => { if (i === 0) return false; const [bx, bz] = L[i - 1], ex = bx - ax, ez = bz - az, l2 = ex * ex + ez * ez || 1, u = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / l2)); return Math.hypot(x - ax - ex * u, z - az - ez * u) < d; }));
  const free = (x: number, z: number, r: number) => [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]].every(([a, b]) => k.walkable(x + a, z + b)) && !k.nearPath(x, z, r * 0.6 + 0.8) && !onLane(x, z, r + 1.6);
  const home = (id: string, h: { x: number; z: number; th: number; s: number }) => { const [x, z] = yard(h, h.s * 0.5 + 1.6, 0.9); VILLAGE_HOMES[id] = { x, z, ry: h.th + Math.PI }; };

  // ---- Weavers' Lane (the lane out to the fields): a loom under an awning, cloth awnings along the houses, a shared yard
  const wv = near(-20, 4, used); if (wv) {
    used.add(wv); home('weaver', wv);
    const [lx, lz, th] = yard(wv, wv.s * 0.5 + 1.2, -2.4); if (free(lx, lz, 1.2)) { loom(k, lx, lz, th, clothM[0]); awning(k, lx, lz, th, 3.0, 2.4, clothM[1]); }
    // her cloth comes out to dry when she is home
    const [ax, az] = yard(wv, wv.s * 0.5 + 2.8, 0.6); const line: THREE.Object3D[] = [];
    for (const sd of [-1.4, 1.4]) { const px = ax + Math.cos(th) * sd, pz = az - Math.sin(th) * sd; line.push(k.put(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 2.1, 5), k.mats.bamboo), px, k.ground(px, pz) + 1.05, pz)); }
    for (let i = 0; i < 3; i++) { const u0 = -1.3 + i * 0.9; line.push(cloth(k, ax + Math.cos(th) * u0, az - Math.sin(th) * u0, ax + Math.cos(th) * (u0 + 0.8), az - Math.sin(th) * (u0 + 0.8), k.ground(ax, az) + 2.0, 1.1, clothM[(i + 2) % clothM.length], 0.08)); }
    for (const o of line) o.visible = false; RECOVER.weaver = () => { for (const o of line) o.visible = true; };
  }
  for (const h of live.filter((q) => Math.hypot(q.x + 22, q.z - 5) < 12 && q !== wv).slice(0, 3)) { const [x, z, th] = yard(h, h.s * 0.5 + 0.9, 1.6); if (free(x, z, 1.0)) awning(k, x, z, th, 2.2, 1.6, clothM[Math.floor(R() * clothM.length)]); }

  // ---- the Herb Yards (the lane to the barrow trail): drying racks, neglected household beds, a work table
  const hb = near(-7, 26, used); const racks: Array<{ herbs: THREE.Mesh }> = [];
  if (hb) {
    used.add(hb); home('herbalist', hb);
    for (const [out, side] of [[3.2, -2.0], [3.2, 2.2], [5.6, 0]]) { const [x, z, th] = yard(hb, hb.s * 0.5 + out, side); if (free(x, z, 1.4)) racks.push(rack(k, x, z, th + Math.PI / 2, false)); }
    const wild = new THREE.MeshStandardMaterial({ color: 0x6a6a3a, roughness: 1, flatShading: true }), tended = new THREE.MeshStandardMaterial({ color: 0x4a8a3a, roughness: 1, flatShading: true });
    const beds: THREE.Mesh[] = [];
    for (const [out, side] of [[1.2, -4.4], [1.2, 4.6]]) { const [x, z, th] = yard(hb, hb.s * 0.5 + out, side); if (free(x, z, 1.3)) beds.push(bed(k, x, z, th, 2.4, 1.4, wild)); }
    const [tx, tz, th] = yard(hb, hb.s * 0.5 + 1.0, -1.9); if (free(tx, tz, 0.8)) { k.put(new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.08, 0.7), k.mats.timber), tx, k.ground(tx, tz) + 0.8, tz, 0, th, 0);
      for (const [a, b] of [[-0.6, -0.28], [0.6, -0.28], [-0.6, 0.28], [0.6, 0.28]]) k.put(new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.8, 0.07), k.mats.timber), tx + a * Math.cos(th) + b * Math.sin(th), k.ground(tx, tz) + 0.4, tz - a * Math.sin(th) + b * Math.cos(th));
      for (let i = 0; i < 4; i++) k.put(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.22, 8), new THREE.MeshStandardMaterial({ color: 0x8a5a3a, roughness: 0.9 })), tx + (i - 1.5) * 0.3 * Math.cos(th), k.ground(tx, tz) + 0.95, tz - (i - 1.5) * 0.3 * Math.sin(th));
      k.solidRect(tx, tz, 1.4, 0.7, 0.85, th); }
    RECOVER.herbalist = () => { for (const r of racks) (r.herbs.material as THREE.MeshStandardMaterial).color.setHex(0x5a8a3a); for (const b of beds) b.material = tended; };
  }

  // ---- the River Landing (the lane to the washing place): stone washing steps into the river, a boat left on the bank, a trading platform
  { const [lx, lz] = [30, 4], rx = 36.5, ry = Math.atan2(rx - lx, 0);
    for (let i = 0; i < 4; i++) { const x = lx + 2.6 + i * 0.75, z = lz + 0.5; k.put(new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.2, 3.2), k.mats.sandstone), x, k.ground(x, z) - 0.05 - i * 0.07, z, 0, 0, 0); }
    { const gy = k.ground(lx + 1.2, lz + 1.6); k.put(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.5, 5), k.mats.bamboo), lx + 1.2, gy + 0.75, lz + 1.6); k.put(new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.26, 0.22), k.mats.timber), lx + 1.2, gy + 1.36, lz + 1.6); k.solid(lx + 1.2, lz + 1.6, 0.15); }
    const bt = boat(k, lx + 0.5, lz + 4.2, ry + 0.35, 0.12), jl = lantern(k, lx + 1.2, lz + 1.6);
    const fy = near(26, 9, used); if (fy) { used.add(fy); home('ferry', fy); }
    RECOVER.ferry = () => { bt.rotation.z = 0; bt.position.y = k.ground(lx + 0.5, lz + 4.2) + 0.12; jl.on(); };   // she rights the boat and lights the landing
    const px = lx - 1.5, pz = lz - 5.0, deckY = k.ground(px, pz) + 0.6;
    const plank = [0x6e5236, 0x5e462e, 0x7a5c3c].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.95 }));
    for (let i = 0; i < 9; i++) { if (i === 6) continue; k.put(new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.08, 0.3), plank[i % 3]), px + (R() - 0.5) * 0.1, deckY + (R() - 0.5) * 0.03, pz - 1.3 + i * 0.33, (R() - 0.5) * 0.03, 0.05, 0); }   // one board missing
    for (const b of [-1.4, 1.4]) k.put(new THREE.Mesh(new THREE.BoxGeometry(4.3, 0.12, 0.14), plank[1]), px, deckY - 0.1, pz + b, 0, 0.05, 0);
    for (const [a, b] of [[-1.9, -1.3], [1.9, -1.3], [-1.9, 1.3], [1.9, 1.3]]) k.put(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.7, 6), k.mats.timber), px + a, deckY - 0.33, pz + b);
    const crate = new THREE.MeshStandardMaterial({ color: 0x7a6040, roughness: 0.95 }), sack = new THREE.MeshStandardMaterial({ color: 0xa89068, roughness: 1 });
    for (let i = 0; i < 2; i++) k.put(new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.5, 0.5), crate), px - 1.2 + i * 0.9, deckY + 0.3, pz - 0.9, 0, R(), 0);
    for (let i = 0; i < 2; i++) k.put(new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 6).scale(1, 0.7, 1.3), sack), px + 1.0 + i * 0.5, deckY + 0.24, pz + 0.6, 0, R() * 3, 0);
    k.solidRect(px, pz, 4.2, 3.0, 0.68, 0.05);
  }

  // ---- the Burned Quarter (south, where the goblins came in from the marsh): breached fences, emptied homes, drag marks to the marsh road
  const burnt = k.homes.filter((h) => h.burnt);
  for (const h of burnt.slice(0, 4)) { const [x, z] = [h.x, h.z], th = h.th; brokenFence(k, x + Math.cos(th) * 3.4 - Math.sin(th) * 2.8, z - Math.sin(th) * 3.4 - Math.cos(th) * 2.8, x - Math.cos(th) * 3.4 - Math.sin(th) * 2.8, z + Math.sin(th) * 3.4 - Math.cos(th) * 2.8);
    const [bx, bz] = yard(h, h.s * 0.5 + 1.4, 0); belongings(k, bx, bz, 5, clothM[(burnt.indexOf(h) + 1) % clothM.length]); }
  if (burnt.length) { const h = burnt[0], [sx, sz] = yard(h, h.s * 0.5 + 1.0, 0); dragMarks(k, [[sx, sz], [(sx + 9) / 2, (sz - 24) / 2], [9, -24], [12, -32]]); }

  // ---- the plaza's stone lanterns: cold until the lamp-keeper's boy comes home and lights them
  const lamps = [0, 1, 2, 3].map((i) => { const a = i * Math.PI / 2 + 0.78; return { x: V.x + Math.cos(a) * 7.6, z: V.z + Math.sin(a) * 7.6 }; }).filter((q) => !k.nearPath(q.x, q.z, 1.2)).map((q) => lantern(k, q.x, q.z));
  VILLAGE_HOMES.lampboy = { x: V.x + 5.5, z: V.z - 5.5, ry: Math.atan2(V.x - (V.x + 5.5), V.z - (V.z - 5.5)) };
  RECOVER.lampboy = () => { for (const l of lamps) l.on(); };
}

/** A bamboo cage: bars round a square floor with a top frame; open: the door bars gone. Straw on the floor, a bowl. */
const oldBamboo = new THREE.MeshStandardMaterial({ color: 0x6e6440, roughness: 0.95 });
function cage(k: Kit, x: number, z: number, ry: number, open: boolean): THREE.Object3D[] {
  const gy = k.ground(x, z), g = new THREE.Group(); g.position.set(x, gy, z); g.rotation.y = ry; k.scene.add(g);
  const bars: THREE.BufferGeometry[] = [], W = 1.8;
  for (let i = 0; i <= 6; i++) { const u = -W / 2 + (W * i) / 6; for (const [bx, bz] of [[u, -W / 2], [u, W / 2], [-W / 2, u], [W / 2, u]]) { if (open && bz === W / 2 && Math.abs(bx) < 0.5) continue; bars.push(new THREE.CylinderGeometry(0.035, 0.04, 1.9, 5).translate(bx, 0.95, bz)); } }
  for (const y of [0.05, 1.9]) for (const [a, b, w, d] of [[0, -W / 2, W, 0.06], [0, W / 2, W, 0.06], [-W / 2, 0, 0.06, W], [W / 2, 0, 0.06, W]] as Array<[number, number, number, number]>) bars.push(new THREE.BoxGeometry(w, 0.06, d).translate(a, y, b));
  const m = new THREE.Mesh(mergeGeometries(bars), oldBamboo); m.castShadow = true; g.add(m);
  const straw = new THREE.Mesh(new THREE.CircleGeometry(0.8, 10).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xa8904a, roughness: 1 })); straw.position.y = 0.03; straw.scale.set(1, 1, 0.8); g.add(straw);
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.1, 0.08, 9), new THREE.MeshStandardMaterial({ color: 0x6a4a30, roughness: 0.9 })); bowl.position.set(0.5, 0.06, -0.5); g.add(bowl);
  const c = Math.cos(ry), s = Math.sin(ry);
  if (!open) k.solidRect(x, z, W, W, 1.9, ry);
  else for (const [a, b, w, d] of [[-W / 2, 0, 0.2, W], [W / 2, 0, 0.2, W], [0, -W / 2, W, 0.2]] as Array<[number, number, number, number]>) k.solidRect(x + a * c + b * s, z - a * s + b * c, w, d, 1.9, ry);
  return [g];
}
/** A timber cart (two wheels, a bed), maybe with a bamboo cage on it: the goblins' caravans. */
function cart(k: Kit, x: number, z: number, ry: number, caged: boolean): void {
  const gy = k.ground(x, z), g = new THREE.Group(); g.position.set(x, gy, z); g.rotation.y = ry; k.scene.add(g);
  const bedM = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.18, 1.4), k.mats.timber); bedM.position.y = 0.85; g.add(bedM);
  for (const sd of [-1, 1]) { const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.12, 12).rotateX(Math.PI / 2), k.mats.charred); wh.position.set(0, 0.55, sd * 0.78); g.add(wh); }
  for (const sd of [-0.25, 0.25]) { const sh = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.2, 5).rotateZ(Math.PI / 2 - 0.25), k.mats.timber); sh.position.set(-2.1, 0.55, sd); g.add(sh); }
  if (caged) { const b: THREE.BufferGeometry[] = []; for (let i = 0; i <= 4; i++) for (const sd of [-0.65, 0.65]) b.push(new THREE.CylinderGeometry(0.025, 0.025, 1.2, 4).translate(-1.1 + i * 0.55, 1.5, sd)); for (const sd of [-0.65, 0.65]) b.push(new THREE.BoxGeometry(2.3, 0.05, 0.05).translate(0, 2.1, sd)); for (let i = 0; i <= 4; i++) b.push(new THREE.BoxGeometry(0.05, 0.05, 1.35).translate(-1.1 + i * 0.55, 2.1, 0)); g.add(new THREE.Mesh(mergeGeometries(b), oldBamboo)); }
  g.traverse((o) => { o.castShadow = true; }); k.solidRect(x, z, 2.4, 1.5, caged ? 2.1 : 1.0, ry);
}
/** A crate stamped with the Nine's seal (a red ring of nine points): garrison supplies, here in a goblin camp. */
function sealedCrate(k: Kit, x: number, z: number, ry: number, sealMat: THREE.Material, s = 1): void {
  const gy = k.ground(x, z), t = k.mats.timber, m = new THREE.Mesh(new THREE.BoxGeometry(0.8 * s, 0.6 * s, 0.6 * s), [t, t, t, t, sealMat, sealMat]);
  m.position.set(x, gy + 0.3 * s, z); m.rotation.y = ry; m.castShadow = true; k.scene.add(m); k.solid(x, z, 0.45 * s, 0.6 * s);
}
/** Which camp holds each of the new captives (game.ts maps it to the villager who goes home). */
export const CAPTIVE_CAMP: Record<string, number> = {};

/**
 * The goblins' capture route (Act II's region, south-west): the Snare Fields where people are caught, the holding pens, the supply camp
 * and caravan stop where captives are loaded for the carts north, and the Chief's stronghold. A road ties them together with drag marks
 * along it; a watch platform overlooks the traps; a bamboo-walled nook behind the stronghold, shut by thorns, holds the Chief's hoard.
 * Side quest "A Captive's Return": a ferry token in an empty pen leads to the caravan stop's prisoner, who goes home to the River Landing.
 */
export function buildGoblinRoute(k: Kit, S: { x: number; z: number }, C: { x: number; z: number }, M: { x: number; z: number }): void {
  const L = Math.hypot(C.x - S.x, C.z - S.z), dx = (C.x - S.x) / L, dz = (C.z - S.z) / L; let px = -dz, pz = dx;
  if (px * (M.x - S.x) + pz * (M.z - S.z) > 0) { px = -px; pz = -pz; }                        // "side" points away from the monastery
  const at = (u: number, side: number): [number, number] => [S.x + dx * u + px * side, S.z + dz * u + pz * side];
  const ry = Math.atan2(dx, dz);
  /** A spot for a place of radius r along the route: the first side offset (from side0, outward either way) clear of every trail and on open ground. */
  const spot = (u: number, side0: number, r: number): [number, number] => {
    for (let k2 = 0; k2 < 12; k2++) for (const sg of [1, -1]) { const sd = side0 + sg * k2 * 2; const [x, z] = at(u, sd); if (!k.nearPath(x, z, r) && !k.wet(x, z, r) && k.walkable(x, z) && k.walkable(x + r * 0.7, z) && k.walkable(x - r * 0.7, z) && k.walkable(x, z + r * 0.7) && k.walkable(x, z - r * 0.7)) return [x, z]; }
    return at(u, side0);
  };
  const sealMat = new THREE.MeshStandardMaterial({ roughness: 0.9, map: k.tex(64, (g, s) => {
    g.fillStyle = '#6e5236'; g.fillRect(0, 0, s, s); g.strokeStyle = 'rgba(40,28,18,0.6)'; for (let y = 8; y < s; y += 16) { g.beginPath(); g.moveTo(0, y); g.lineTo(s, y); g.stroke(); }
    g.strokeStyle = '#8a1e1a'; g.lineWidth = 3; g.beginPath(); g.arc(s / 2, s / 2, s * 0.26, 0, Math.PI * 2); g.stroke();
    for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2; g.beginPath(); g.moveTo(s / 2 + Math.cos(a) * s * 0.26, s / 2 + Math.sin(a) * s * 0.26); g.lineTo(s / 2 + Math.cos(a) * s * 0.38, s / 2 + Math.sin(a) * s * 0.38); g.stroke(); } }) });
  const cloths = CLOTHS.map(([a, b]) => new THREE.MeshStandardMaterial({ map: clothTex(k, a, b), roughness: 0.9, side: THREE.DoubleSide }));

  // the holding pens: three cages (one door hanging open), straw, a totem; a ferry token in the open one
  const [Px, Pz] = spot(L * 0.38, 7, 6.5); k.clear(Px, Pz, 7.5);
  for (const [u, sd, open] of [[-2.6, -2.4, false], [0.4, -3.0, true], [3.2, -2.2, false]] as Array<[number, number, boolean]>) cage(k, Px + dx * u + px * sd, Pz + dz * u + pz * sd, ry + (R() - 0.5) * 0.3, open);
  { const tx = Px + px * 2.5, tz = Pz + pz * 2.5, gy = k.ground(tx, tz); k.put(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 2.6, 6), k.mats.timber), tx, gy + 1.3, tz); k.put(new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), k.mats.sandstone), tx, gy + 2.7, tz).scale.set(1, 1.15, 0.9); k.solid(tx, tz, 0.2); }
  const Tx = Px + dx * 0.4 - px * 3.0, Tz = Pz + dz * 0.4 - pz * 3.0;
  addSpot({ id: 'pens_token', name: 'A Ferry Token', x: Tx, z: Tz, r: 1.8, on: 'touch', say: 'A wooden token on a cord, carved with a heron: the mark of the River Landing\'s ferry. Someone from the old village was kept here, and taken on down the road.' });
  k.regions.push({ name: 'HOLDING PENS', x: Px, z: Pz });

  // the caravan stop: a new camp (goblins guard a prisoner in a cage), carts for the road north, garrison crates, village belongings
  const [Qx, Qz] = spot(L * 0.7, -5, 10); k.clear(Qx, Qz, 11);
  const ci = k.camps.length; k.camps.push({ x: Qx, z: Qz, tent: ry + Math.PI / 2, evil: 'cage', region: 'goblin', members: ['archer', 'ghoul', 'ghoul', 'archer'] });
  { const gy = k.ground(Qx, Qz), fire = k.sparkle(Qx, gy + 0.5, Qz, 1.6, 0xff9040), ph = R() * 5; k.anims.push((t) => { fire.material.opacity = 0.7 + 0.25 * Math.sin(t * 9 + ph) * Math.sin(t * 3.1); fire.scale.setScalar(1.4 + 0.2 * Math.sin(t * 7)); });
    for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; k.put(new THREE.Mesh(new THREE.DodecahedronGeometry(0.22, 0), k.mats.sandstone), Qx + Math.cos(a) * 0.7, gy + 0.1, Qz + Math.sin(a) * 0.7); }
    for (let i = 0; i < 3; i++) k.put(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 1.1, 5), k.mats.charred), Qx, gy + 0.15, Qz, Math.PI / 2, i * 1.05, 0);
    k.solid(Qx, Qz, 0.8, 0.5); }
  const cg = (u: number, sd: number): [number, number] => [Qx + dx * u + px * sd, Qz + dz * u + pz * sd];
  { const [x, z] = cg(-1, 6.5); cage(k, x, z, ry, false); const gy = k.ground(x, z);
    const fig = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.6, 4, 8), new THREE.MeshStandardMaterial({ color: 0x8a9ab0, roughness: 0.85 })); fig.position.set(x, gy + 0.55, z); fig.rotation.z = 0.3; k.scene.add(fig);
    k.captives.push({ camp: ci, x, z, objs: [fig] }); }
  for (const [u, sd, rot, caged] of [[-6.5, -5.5, 0.3, true], [-6.0, 4.0, -0.5, false]] as Array<[number, number, number, boolean]>) { const [x, z] = cg(u, sd); cart(k, x, z, ry + rot, caged); }
  for (let i = 0; i < 5; i++) { const [x, z] = cg(4.5 + (i % 3) * 0.9, -5 + Math.floor(i / 3) * 0.8); sealedCrate(k, x, z, ry + (R() - 0.5) * 0.4, sealMat, i === 4 ? 0.8 : 1); }
  { const [bx, bz] = cg(5, 4); belongings(k, bx, bz, 6, cloths[1]); }
  { const [x, z] = cg(2.5, -7.5), gy = k.ground(x, z); for (const sd of [-1.4, 1.4]) k.put(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 2.0, 5), k.mats.timber), x + px * sd, gy + 1.0, z + pz * sd);
    const roof = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 2.2), new THREE.MeshStandardMaterial({ color: 0x7a6a48, roughness: 1, side: THREE.DoubleSide })); roof.position.set(x - dx * 0.6, gy + 1.6, z - dz * 0.6); roof.rotation.set(-Math.PI / 2 + 0.6, ry, 0, 'YXZ'); roof.castShadow = true; k.scene.add(roof); }
  k.regions.push({ name: 'CARAVAN STOP', x: Qx, z: Qz });

  // the capture road: from the trap field past the pens and the caravans to the stronghold, with drag marks the whole way
  const road: Array<[number, number]> = [at(15, 3), at(L * 0.38 - 4, 1.5), at(L * 0.38 + 4, 1.0), at(L * 0.7 - 7, 1.5), at(L * 0.7 + 7, 2.0), at(L - 9, 0.5)];
  k.trail(road); dragMarks(k, road.map(([x, z]) => [x + px * 0.6, z + pz * 0.6] as [number, number]));

  // behind the stronghold: a nook walled in bamboo, its mouth shut by thorns (fire clears them); the Chief's hoard inside
  { let Nx = C.x - px * 12 + dx * 3, Nz = C.z - pz * 12 + dz * 3; for (let t = 0; t < 10 && k.nearPath(Nx, Nz, 5.5); t++) { Nx -= px * 2; Nz -= pz * 2; } k.clear(Nx, Nz, 5.5); const canes: THREE.Matrix4[] = []; const o = new THREE.Object3D(), face = Math.atan2(px, pz);
    for (let a = 0; a < Math.PI * 2; a += 0.11) {
      if (Math.abs(Math.atan2(Math.sin(a - face), Math.cos(a - face))) < 0.42) continue;           // the mouth faces out, away from the camp
      const x = Nx + Math.sin(a) * 3.6, z = Nz + Math.cos(a) * 3.6; k.solid(x, z, 0.32);
      for (let j = 0; j < 3; j++) { const h = 3.5 + R() * 2.5; o.position.set(x + (R() - 0.5) * 0.5, k.ground(x, z) + h / 2, z + (R() - 0.5) * 0.5); o.rotation.set((R() - 0.5) * 0.15, R() * 6, (R() - 0.5) * 0.15); o.scale.set(1, h, 1); o.updateMatrix(); canes.push(o.matrix.clone()); }
    }
    const im = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.06, 0.07, 1, 5), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }), canes.length); const cc = new THREE.Color();
    canes.forEach((m, i) => { im.setMatrixAt(i, m); im.setColorAt(i, cc.setHex([0x4f6a2e, 0x5f7a36, 0x6a7a3a, 0x7a7a44][Math.floor(R() * 4)])); }); im.castShadow = true; im.computeBoundingSphere(); k.scene.add(im);
    const mx = Nx + px * 3.6, mz = Nz + pz * 3.6, thorn = new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 1, flatShading: true }), tobjs: THREE.Object3D[] = [];
    const tcells = k.track(() => { for (let s = -1.6; s <= 1.61; s += 0.5) { const x = mx + dx * s, z = mz + dz * s; k.solid(x, z, 0.5); const b = new THREE.Mesh(new THREE.DodecahedronGeometry(0.6, 0), thorn); b.position.set(x, k.ground(x, z) + 0.5, z); b.scale.set(1, 1.3, 1); b.castShadow = true; k.scene.add(b); tobjs.push(b);
      for (let j = 0; j < 4; j++) { const c = new THREE.Mesh(new THREE.ConeGeometry(0.06, 1.3, 4), thorn); c.position.set(x + (R() - 0.5) * 0.6, k.ground(x, z) + 0.8, z + (R() - 0.5) * 0.6); c.rotation.set((R() - 0.5) * 0.8, 0, (R() - 0.5) * 0.8); k.scene.add(c); tobjs.push(c); } } });
    addSpot({ id: 'hoard_thorns', name: 'The Thorns Burn', x: mx, z: mz, r: 2.0, on: 'fire', say: 'Behind the stronghold: the goblins\' hidden nook.', act: () => { for (const t of tobjs) t.visible = false; k.untrack(tcells); } });
    k.lootAt(Nx - px * 1.0, Nz - pz * 1.0, null, 90, 'The Chief\'s hoard: village silver, a child\'s bangle, and a garrison pay token');
  }

  // side quest: A Captive's Return
  CAPTIVE_CAMP.ferry = ci;
  addQuest({ id: 'captive', title: 'A Captive\'s Return', region: 'goblin', open: () => spotDone('pens_token'), reward: 'The Ferry-Woman is home. Her family\'s savings, hidden in the boat, are yours (+120 souls).',
    steps: [
      { text: 'Follow the drag marks to the caravan stop and free whoever they took from the pens.', done: () => STORY.freed.has(ci), at: () => [Qx, Qz] },
      { text: 'She went home to the River Landing. Find her there.', done: () => spotDone('ferry_home'), at: () => { const h = VILLAGE_HOMES.ferry; return h ? [h.x, h.z] : [30, 4]; } },
    ] });
  const fh = VILLAGE_HOMES.ferry;
  if (fh) addSpot({ id: 'ferry_home', name: 'The Ferry-Woman', x: fh.x, z: fh.z, r: 3.2, on: 'touch', when: () => STORY.freed.has(ci), say: '"Heron on the token, heron on the boat. My father carved both." She doesn\'t know your face. She thanks you anyway.' });
}

/** The nearest open spot to (x, z) for a place of radius r: off every trail, on open flat ground (a widening search). */
function findClear(k: Kit, x: number, z: number, r: number): [number, number] {
  const ok = (a: number, b: number) => !k.nearPath(a, b, r) && !k.wet(a, b, r) && [[0, 0], [r * 0.7, 0], [-r * 0.7, 0], [0, r * 0.7], [0, -r * 0.7]].every(([u, v]) => k.walkable(a + u, b + v) && Math.abs(k.ground(a + u, b + v) - k.ground(x, z)) < 0.25);
  if (ok(x, z)) return [x, z];
  for (let d = 2; d < 40; d += 2) for (let a = 0; a < Math.PI * 2; a += 0.5) { const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d; if (ok(px, pz)) return [px, pz]; }
  return [x, z];
}
/** A grave: a low mound of earth with a wooden stake at its head. */
function grave(k: Kit, x: number, z: number, ry: number, earth: THREE.Material): THREE.Mesh {
  const gy = k.ground(x, z); const m = k.put(new THREE.Mesh(new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(0.55, 0.28, 1.1), earth), x, gy - 0.02, z, 0, ry, 0);
  const sx = x + Math.sin(ry) * 1.25, sz = z + Math.cos(ry) * 1.25; k.put(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.9, 0.08), k.mats.timber), sx, gy + 0.42, sz, (R() - 0.5) * 0.2, ry, (R() - 0.5) * 0.25);
  return m;
}
/** A binding post with a hanging chain (the Necromancer's raising ground). */
function bindingPost(k: Kit, x: number, z: number, iron: THREE.Material): void {
  const gy = k.ground(x, z); k.put(new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 2.4, 6), k.mats.charred), x, gy + 1.2, z, (R() - 0.5) * 0.12, 0, (R() - 0.5) * 0.12);
  const links: THREE.BufferGeometry[] = []; for (let i = 0; i < 9; i++) links.push(new THREE.TorusGeometry(0.07, 0.018, 4, 8).rotateY(i % 2 ? Math.PI / 2 : 0).translate(0.2, 1.9 - i * 0.12, 0));
  const ch = new THREE.Mesh(mergeGeometries(links), iron); ch.position.set(x, gy, z); ch.rotation.y = R() * 6; k.scene.add(ch); k.solid(x, z, 0.25);
}

/**
 * The Bone Wastes, where the captives become the army: the receiving yard where the goblins' carts unload (the same carts and the same
 * sealed crates as the caravan stop), the Nameless Graves (rows of the dead with a few of their things), the raising ground round the
 * Necromancer (binding posts, raising pits, a ritual ring that stops pulsing once he falls) and the brothers' old burial shelter.
 * Side quest "Nameless Graves": three belongings set apart in the yard, each brought home to its grave in its own way.
 */
export function buildBoneWastes(k: Kit, necro: { x: number; z: number }, wasteR: number): void {
  const earth = new THREE.MeshStandardMaterial({ color: 0x4a3c2c, roughness: 1, flatShading: true }), ash = new THREE.MeshStandardMaterial({ color: 0x5a5a5e, roughness: 1, flatShading: true });
  const iron = new THREE.MeshStandardMaterial({ color: 0x3a3632, roughness: 0.7, metalness: 0.5 });
  const sealMat = new THREE.MeshStandardMaterial({ roughness: 0.9, map: k.tex(64, (g, s) => {
    g.fillStyle = '#6e5236'; g.fillRect(0, 0, s, s); g.strokeStyle = '#8a1e1a'; g.lineWidth = 3; g.beginPath(); g.arc(s / 2, s / 2, s * 0.26, 0, Math.PI * 2); g.stroke();
    for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2; g.beginPath(); g.moveTo(s / 2 + Math.cos(a) * s * 0.26, s / 2 + Math.sin(a) * s * 0.26); g.lineTo(s / 2 + Math.cos(a) * s * 0.38, s / 2 + Math.sin(a) * s * 0.38); g.stroke(); } }) });
  const cloth = new THREE.MeshStandardMaterial({ map: clothTex(k, '#2c3a6a', '#c8c0a0'), roughness: 0.9, side: THREE.DoubleSide });

  // the receiving yard: south of the wastes, where the road from the village comes in; carts unloaded, possessions sorted into heaps
  const [Yx, Yz] = findClear(k, necro.x + 24, necro.z - 20, 7); k.clear(Yx, Yz, 8);
  { const ry = Math.atan2(necro.x - Yx, necro.z - Yz);
    cart(k, Yx - 3, Yz + 2, ry + 0.4, true); cart(k, Yx + 3.5, Yz - 1, ry - 1.1, false);
    for (let i = 0; i < 3; i++) belongings(k, Yx + (i - 1) * 2.4, Yz - 3.2, 6, cloth);
    for (let i = 0; i < 4; i++) sealedCrate(k, Yx + 4.5 + (i % 2) * 0.9, Yz + 2.5 + Math.floor(i / 2) * 0.8, ry + (R() - 0.5) * 0.3, sealMat, i === 3 ? 0.8 : 1);
    const gy = k.ground(Yx - 4.5, Yz - 3); k.put(new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.8, 0.2), k.mats.timber), Yx - 4.5, gy + 0.9, Yz - 3); k.solid(Yx - 4.5, Yz - 3, 0.2);   // the tally post
    for (let i = 0; i < 12; i++) k.put(new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.12, 0.21), k.mats.charred), Yx - 4.5 + 0.1, gy + 0.6 + i * 0.09, Yz - 3, 0, 0, 0);
  }
  addSpot({ id: 'yard_pile', name: 'The Receiving Yard', x: Yx, z: Yz - 2.2, r: 2.6, on: 'touch', say: 'Everything they carried, sorted into heaps. Three things are set apart, as if someone meant to give them back: a weaving shuttle, a heron-carved paddle blade, a child\'s clay lamp.' });
  k.regions.push({ name: 'RECEIVING YARD', x: Yx, z: Yz });

  // the Nameless Graves: four rows of mounds and stakes, quiet, north-east of the wastes; three of them keep something of who they were
  const [Gx, Gz] = findClear(k, necro.x + 30, necro.z + 18, 9); k.clear(Gx, Gz, 10);
  const gry = Math.atan2(necro.x - Gx, necro.z - Gz); const c = Math.cos(gry), s = Math.sin(gry);
  const gp = (a: number, b: number): [number, number] => [Gx + a * c + b * s, Gz - a * s + b * c];
  for (let row = 0; row < 4; row++) for (let i = 0; i < 5; i++) { const [x, z] = gp((i - 2) * 1.9 + (R() - 0.5) * 0.3, (row - 1.5) * 3.0); grave(k, x, z, gry + (R() - 0.5) * 0.15, earth); }
  const [s1x, s1z] = gp(-3.8, -4.5), [s2x, s2z] = gp(0, 1.5), [s3x, s3z] = gp(3.8, 4.5);
  // the weaver's grave: a scrap of indigo cloth tied to its stake
  { const sx = s1x + Math.sin(gry) * 1.25, sz = s1z + Math.cos(gry) * 1.25; const m = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.5), cloth); m.position.set(sx + 0.08, k.ground(sx, sz) + 0.62, sz); m.rotation.y = gry + 0.6; k.scene.add(m);
    const sh = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.08), k.mats.timber); sh.position.set(s1x, k.ground(s1x, s1z) + 0.3, s1z); sh.visible = false; k.scene.add(sh);
    addSpot({ id: 'grave_shuttle', name: 'The Weaver\'s Grave', x: s1x, z: s1z, r: 1.8, on: 'touch', when: () => spotDone('yard_pile'), say: 'You lay the shuttle on the mound. Someone here wove for the whole village, and was proud of their reds.', act: () => { sh.visible = true; } }); }
  // the child's grave: a little clay lamp, cold until fire reaches it
  { const gy = k.ground(s2x, s2z); k.put(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.07, 0.07, 8), new THREE.MeshStandardMaterial({ color: 0x9a6a44, roughness: 0.9 })), s2x, gy + 0.32, s2z);
    const flame = k.sparkle(s2x, gy + 0.45, s2z, 0.45, 0xffc070); flame.visible = false; k.anims.push((t) => { if (flame.visible) flame.material.opacity = 0.7 + 0.25 * Math.sin(t * 8 + s2x); });
    addSpot({ id: 'grave_lamp', name: 'The Child\'s Grave', x: s2x, z: s2z, r: 1.8, on: 'fire', when: () => spotDone('yard_pile'), say: 'The little lamp catches. It burns steady, as if someone small were holding it.', act: () => { flame.visible = true; } }); }
  // the ferryman's grave: a paddle blade for a stake, and a water jar gone dry (water fills it)
  { const gy = k.ground(s3x, s3z); k.put(new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.9, 0.05), k.mats.timber), s3x + Math.sin(gry) * 1.2, gy + 0.45, s3z + Math.cos(gry) * 1.2, 0, gry, 0.12);
    k.put(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.4, 9, 1, true), new THREE.MeshStandardMaterial({ color: 0x7a5236, roughness: 0.9, side: THREE.DoubleSide })), s3x + 0.6, gy + 0.2, s3z);
    const wtr = new THREE.Mesh(new THREE.CircleGeometry(0.15, 9).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x2a5a6a, roughness: 0.15 })); wtr.position.set(s3x + 0.6, gy + 0.36, s3z); wtr.visible = false; k.scene.add(wtr);
    addSpot({ id: 'grave_heron', name: 'The Ferryman\'s Grave', x: s3x, z: s3z, r: 1.8, on: 'water', when: () => spotDone('yard_pile'), say: 'The jar fills. On the river they used to say: the water remembers what the people forget.', act: () => { wtr.visible = true; } }); }
  k.regions.push({ name: 'NAMELESS GRAVES', x: Gx, z: Gz });
  addQuest({ id: 'graves', title: 'Nameless Graves', region: 'bone', open: () => spotDone('yard_pile'), reward: 'A memory: he used to bless the dead at dawn, one name at a time. He cannot remember a single name. (+150 souls)',
    steps: [
      { text: 'The weaving shuttle: find the grave it belongs to.', done: () => spotDone('grave_shuttle'), at: () => [s1x, s1z] },
      { text: 'The clay lamp: light it for the child it was made for (fire).', done: () => spotDone('grave_lamp'), at: () => [s2x, s2z] },
      { text: 'The heron blade: the ferryman\'s jar has gone dry (water).', done: () => spotDone('grave_heron'), at: () => [s3x, s3z] },
    ] });

  // the raising ground: binding posts round the wastes' rim, raising pits, a ritual ring under the Necromancer that pulses until he falls
  for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2 + 0.3, x = necro.x + Math.cos(a) * (wasteR - 1.5), z = necro.z + Math.sin(a) * (wasteR - 1.5); if (!k.nearPath(x, z, 2.2)) bindingPost(k, x, z, iron); }
  for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2 + 0.9, x = necro.x + Math.cos(a) * (wasteR - 6), z = necro.z + Math.sin(a) * (wasteR - 6), gy = k.ground(x, z);
    const pit = new THREE.Mesh(new THREE.CircleGeometry(1.0, 12).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x0c0a08, transparent: true, opacity: 0.85, depthWrite: false })); pit.position.set(x, gy + 0.02, z); pit.scale.set(1, 1, 1.6); pit.rotation.y = a; pit.renderOrder = 2; k.scene.add(pit);
    for (let j = 0; j < 5; j++) k.put(new THREE.Mesh(new THREE.DodecahedronGeometry(0.3, 0), ash), x + Math.cos(a) * (1.3 + R() * 0.3) + (R() - 0.5) * 1.2, gy + 0.08, z + Math.sin(a) * (1.3 + R() * 0.3) + (R() - 0.5) * 1.2, R() * 3, R() * 3, 0); }
  { const ring = new THREE.Mesh(new THREE.RingGeometry(3.2, 3.6, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xa02018, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    ring.position.set(necro.x, k.ground(necro.x, necro.z) + 0.04, necro.z); ring.renderOrder = 3; k.scene.add(ring);
    k.anims.push((t) => { const on = !STORY.shards.has('necro'); (ring.material as THREE.MeshBasicMaterial).opacity = on ? 0.35 + 0.25 * Math.sin(t * 2.4) : Math.max(0, (ring.material as THREE.MeshBasicMaterial).opacity - 0.01); }); }
  k.regions.push({ name: 'RAISING GROUND', x: necro.x, z: necro.z + wasteR + 4 });

  // the brothers' burial shelter: west, away from it all; a stone bier where the dead were washed and sung to the saint
  { const [Sx, Sz] = findClear(k, necro.x - 52, necro.z + 10, 5); k.clear(Sx, Sz, 6); const gy = k.ground(Sx, Sz);
    for (const [a, b] of [[-1.8, -1.4], [1.8, -1.4], [-1.8, 1.4], [1.8, 1.4]]) { k.put(new THREE.Mesh(new THREE.BoxGeometry(0.4, 2.4, 0.4), k.mats.sandstone), Sx + a, gy + 1.2, Sz + b); k.solid(Sx + a, Sz + b, 0.3); }
    k.put(new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.3, 3.6), k.mats.sandstone), Sx, gy + 2.55, Sz, 0.04, 0, -0.06);
    k.put(new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.6, 0.9), k.mats.sandstone), Sx, gy + 0.3, Sz); k.solidRect(Sx, Sz, 2.0, 0.9, 0.6);
    for (const dx of [-0.6, 0.6]) k.put(new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.09, 0.08, 9), k.mats.gilt), Sx + dx, gy + 0.64, Sz);
    k.steles.push({ x: Sx, z: Sz + 2.4, title: 'The Brothers\' Shelter', read: false, text: 'Here the brothers of the hill temple washed the valley\'s dead, wrapped them in white and sang them to the saint, one name at a time. The saint\'s name is scraped from the lintel. The newer dead were not wrapped at all.' });
    k.regions.push({ name: 'BURIAL SHELTER', x: Sx, z: Sz });
  }
}

/** A row of sharpened stakes leaning one way (toward `fx, fz`): the garrison's barricades face the valley, not the outside world. */
function stakeRow(k: Kit, ax: number, az: number, bx: number, bz: number, fx: number, fz: number, block = true): void {
  const L = Math.hypot(bx - ax, bz - az), n = Math.max(2, Math.floor(L / 0.45)), tilt = 0.55, ang = Math.atan2(fx, fz);
  const g: THREE.BufferGeometry[] = [];
  for (let i = 0; i <= n; i++) { const u = i / n, x = ax + (bx - ax) * u, z = az + (bz - az) * u, h = 1.6 + R() * 0.6;
    g.push(new THREE.ConeGeometry(0.09, h, 5).translate(0, h / 2, 0).rotateX(tilt).rotateY(ang).translate(x, k.ground(x, z), z)); if (block) k.solid(x, z, 0.28, 1.4); }
  const m = new THREE.Mesh(mergeGeometries(g), k.mats.timber); m.castShadow = true; k.scene.add(m);
}
/** A torn banner on a pole (the garrison's old dark red). */
function banner(k: Kit, x: number, z: number, cloth: THREE.Material): void {
  const gy = k.ground(x, z); k.put(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 3.4, 5), k.mats.timber), x, gy + 1.7, z); k.solid(x, z, 0.12);
  const g = new THREE.PlaneGeometry(0.8, 1.5, 3, 4), p = g.attributes.position as THREE.BufferAttribute; for (let i = 0; i < p.count; i++) { if (p.getY(i) < -0.5 && Math.abs(p.getX(i)) < 0.2) p.setY(i, p.getY(i) + 0.4); p.setZ(i, Math.sin(p.getY(i) * 3) * 0.06); }
  const b = new THREE.Mesh(g, cloth); b.position.set(x + 0.42, gy + 2.55, z); b.castShadow = true; k.scene.add(b);
  const ph = R() * 6; k.anims.push((t) => { b.rotation.y = Math.sin(t * 1.3 + ph) * 0.25; });
}

/**
 * The Undead Garrison, the road that does not let you leave: an outer checkpoint on the valley side of the trench with its stakes facing
 * in, barracks and a supply yard, a command platform on Garrison Hill, and the old escape road north-east, barricaded against the valley.
 * The same order is cut three times, in three hands, the names scraped out of each. Inside, a winch lowers a drawbridge over the trench:
 * a permanent way in from the Bone Wastes side. Side quest "None Leaves": read the three orders and open the way.
 */
export function buildGarrison(k: Kit, front: { x: number; z: number }, hill: { x: number; z: number }, far: { x: number; z: number }, edge: { x1: number; z1: number }): void {
  const red = new THREE.MeshStandardMaterial({ color: 0x5a1a16, roughness: 0.95, side: THREE.DoubleSide }), iron = new THREE.MeshStandardMaterial({ color: 0x3a3632, roughness: 0.7, metalness: 0.5 });
  const T = k.trenches[0]; const ORDER = 'NONE LEAVES THE VALLEY. By order of the Nine.';
  const planks = new THREE.MeshStandardMaterial({ roughness: 0.95, map: k.tex(128, (g, sz) => { g.fillStyle = '#4e3a26'; g.fillRect(0, 0, sz, sz); for (let x = 0; x < sz; x += 16) { g.fillStyle = `rgb(${70 + R() * 30},${52 + R() * 20},${34 + R() * 14})`; g.fillRect(x + 1, 0, 14, sz); g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x + 7, 10 + R() * 90, 2, 6); } }, 3) });
  const darkThatch = new THREE.MeshStandardMaterial({ color: 0x5e4e32, roughness: 1, flatShading: true });
  const orders: Array<{ x: number; z: number; title: string; text: string; read: boolean }> = [];
  const order = (x: number, z: number, title: string, text: string) => { const gy = k.ground(x, z); k.put(new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.6, 0.3), k.mats.sandstone), x, gy + 0.8, z, (R() - 0.5) * 0.08, R() * 6, 0); k.solid(x, z, 0.55, 1.6);
    const s = { x, z, title, text, read: false }; k.steles.push(s); orders.push(s); };

  // the outer checkpoint: on the valley side of the trench bridge nearest the front camp, a barrier pole, a guard shed, stakes facing in
  { let best: { ax: number; az: number; dx: number; dz: number; len: number } | null = null, bd = 1e9;
    for (const b of k.bridges) { const mx = b.ax + b.dx * b.len / 2, mz = b.az + b.dz * b.len / 2, d = Math.hypot(mx - front.x, mz - front.z); if (d < bd && d < 60) { bd = d; best = b; } }
    if (best) { const b = best, mx = b.ax + b.dx * b.len / 2, mz = b.az + b.dz * b.len / 2;
      // which end of the bridge is the valley side (away from the front camp)
      const s0 = Math.hypot(b.ax - front.x, b.az - front.z) > Math.hypot(b.ax + b.dx * b.len - front.x, b.az + b.dz * b.len - front.z) ? 1 : -1, ox = -b.dx * s0, oz = -b.dz * s0;   // (ox, oz) points out to the valley
      const cx = mx + ox * (b.len / 2 + 6), cz = mz + oz * (b.len / 2 + 6), nx = -oz, nz = ox; k.clear(cx, cz, 5);
      const gy = k.ground(cx, cz); k.put(new THREE.Mesh(new THREE.BoxGeometry(0.25, 1.2, 0.25), k.mats.timber), cx + nx * 2.4, gy + 0.6, cz + nz * 2.4); k.solid(cx + nx * 2.4, cz + nz * 2.4, 0.2);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 4.2, 6).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x8a7a5a, roughness: 0.9 })); pole.position.set(cx + nx * 0.4, gy + 1.15, cz + nz * 0.4); pole.rotation.set(0, Math.atan2(nx, nz) - Math.PI / 2, 1.1); pole.castShadow = true; k.scene.add(pole);   // raised, rotted: nobody comes this way
      const sx = cx + nx * 4.5 + ox * 1.5, sz = cz + nz * 4.5 + oz * 1.5; for (const [a, c] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.put(new THREE.Mesh(new THREE.BoxGeometry(0.15, 2.2, 0.15), k.mats.timber), sx + a * 1.0, k.ground(sx, sz) + 1.1, sz + c * 1.0);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.1, 2.6), darkThatch); roof.position.set(sx, k.ground(sx, sz) + 2.25, sz); roof.rotation.z = 0.12; roof.castShadow = true; k.scene.add(roof); k.solidRect(sx, sz, 2.0, 2.0, 2.2);
      stakeRow(k, cx - nx * 5 + ox * 2.5, cz - nz * 5 + oz * 2.5, cx - nx * 2.2 + ox * 2.5, cz - nz * 2.2 + oz * 2.5, ox, oz); stakeRow(k, cx + nx * 6.5 + ox * 2.5, cz + nz * 6.5 + oz * 2.5, cx + nx * 9 + ox * 2.5, cz + nz * 9 + oz * 2.5, ox, oz);
      banner(k, cx - nx * 1.8, cz - nz * 1.8, red); banner(k, cx + nx * 1.8 + ox * 0.5, cz + nz * 1.8 + oz * 0.5, red);
      order(cx - nx * 3.2 - ox * 1.2, cz - nz * 3.2 - oz * 1.2, 'Orders, the oldest hand', ORDER + ' Signed by the hand of [scraped away], Captain of the Gate.');
      k.regions.push({ name: 'CHECKPOINT', x: cx, z: cz });
    } }

  // the barracks and supply yard, behind the front camp: a long timber hall, spear racks, sealed crates and barrels
  { const ax = front.x + (hill.x - front.x) * 0.35, az = front.z + (hill.z - front.z) * 0.35; const [Bx, Bz] = findClear(k, ax, az, 8); k.clear(Bx, Bz, 9);
    const ry = Math.atan2(hill.x - front.x, hill.z - front.z), c = Math.cos(ry), s = Math.sin(ry), gy = k.ground(Bx, Bz), W = 10, D = 4.6, H = 2.6;
    const lp = (a: number, b: number): [number, number] => [Bx + a * c + b * s, Bz - a * s + b * c];
    for (const [a, b, w, d] of [[0, -D / 2, W, 0.25], [0, D / 2, W, 0.25], [-W / 2, 0, 0.25, D], [W / 2, 0.9, 0.25, D - 1.8]] as Array<[number, number, number, number]>) { const [x, z] = lp(a, b); k.put(new THREE.Mesh(new THREE.BoxGeometry(w, H, d), planks), x, gy + H / 2, z, 0, ry, 0); k.solidRect(x, z, Math.max(w, 0.3), Math.max(d, 0.3), H, ry); }
    for (let i = 0; i < 3; i++) { const [x, z] = lp(-3 + i * 3, -D / 2 - 0.14); k.put(new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.45, 0.04), new THREE.MeshBasicMaterial({ color: 0x0c0a08 })), x, gy + 1.7, z, 0, ry, 0); }   // shuttered windows, dark
    for (const side of [-1, 1]) { const [x, z] = lp(0, side * D * 0.26); const roof = new THREE.Mesh(new THREE.BoxGeometry(W + 0.8, 0.14, D * 0.62), darkThatch); roof.rotation.order = 'YXZ'; roof.rotation.set(side * 0.5, ry, 0); roof.position.set(x, gy + H + 0.6, z); roof.castShadow = true; k.scene.add(roof); }
    for (let i = 0; i < 3; i++) { const [x, z] = lp(-3 + i * 3, D / 2 + 1.6); k.put(new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.1, 0.4), k.mats.timber), x, k.ground(x, z) + 1.2, z, 0, ry, 0);
      for (let j = 0; j < 4; j++) k.put(new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 2.4, 4), iron), x + (j - 1.5) * 0.35 * c, k.ground(x, z) + 1.2, z - (j - 1.5) * 0.35 * s, 0.15, 0, 0); k.solid(x, z, 0.5, 1.4); }
    const sealMat = new THREE.MeshStandardMaterial({ color: 0x5a4430, roughness: 0.95 });
    for (let i = 0; i < 6; i++) { const [x, z] = lp(-4 + (i % 3) * 1.0, -D / 2 - 2 - Math.floor(i / 3) * 0.9); sealedCrate(k, x, z, ry, sealMat, 1); }
    order(...lp(W / 2 + 1.6, -1.5), 'Orders, a later hand', ORDER + ' Copied fair, the old stone being worn. Signed by [scraped away].');
    k.regions.push({ name: 'BARRACKS', x: Bx, z: Bz });
  }

  // the command platform on Garrison Hill: a timber deck with a rail, the banners, a view over the whole valley
  { const [x, z] = [hill.x + 4, hill.z - 3], gy = k.ground(x, z), H = 1.5;
    for (const [a, b] of [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]]) k.put(new THREE.Mesh(new THREE.BoxGeometry(0.22, H, 0.22), k.mats.timber), x + a, gy + H / 2, z + b);
    k.put(new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.14, 3.6), k.mats.timber), x, gy + H, z); k.solidRect(x, z, 3.4, 3.4, H);
    for (const [a, b, w, d] of [[0, -1.75, 3.6, 0.06], [0, 1.75, 3.6, 0.06], [1.75, 0, 0.06, 3.6]] as Array<[number, number, number, number]>) k.put(new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, d), k.mats.timber), x + a, gy + H + 0.85, z + b);
    k.put(new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.75, 1.0), k.mats.timber), x - 2.4, gy + 0.37, z); k.solidRect(x - 2.4, z, 1.0, 1.0, 0.75);
    banner(k, x + 1.6, z + 1.6, red); banner(k, x - 1.6, z + 1.6, red);
  }

  // the escape road: out of the far camp toward the north-east edge, cut by a barricade that faces back into the valley
  { const dx = edge.x1 - far.x, dz = edge.z1 - far.z, L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L, run = Math.min(L - 14, 40);
    const road: Array<[number, number]> = [[far.x + ux * 9, far.z + uz * 9], [far.x + ux * (run * 0.5) + uz * 3, far.z + uz * (run * 0.5) - ux * 3], [far.x + ux * (run - 7), far.z + uz * (run - 7)]]; k.trail(road);
    const bx = far.x + ux * (run - 4), bz = far.z + uz * (run - 4), nx = -uz, nz = ux; k.clear(bx, bz, 6);
    stakeRow(k, bx - nx * 7, bz - nz * 7, bx + nx * 7, bz + nz * 7, -ux, -uz);                                    // pointing back at the valley
    cart(k, bx + nx * 2 + ux * 1.2, bz + nz * 2 + uz * 1.2, Math.atan2(nx, nz) + 0.3, false); cart(k, bx - nx * 3 + ux * 1.4, bz - nz * 3 + uz * 1.4, Math.atan2(nx, nz) - 0.4, false);
    order(bx - ux * 2.5 + nx * 1.5, bz - uz * 2.5 + nz * 1.5, 'Orders, the newest hand', ORDER + ' The road is closed. It has always been closed. Signed by [scraped away], who keeps the road.');
    k.regions.push({ name: 'THE CLOSED ROAD', x: bx, z: bz });
  }

  // the drawbridge: over the trench's long north-south arm, away from its other bridges; the winch is on the garrison side
  { let best = -1, bs = 0; for (let sd = 0; sd < T.len; sd += 2) { const [x, z] = k.polyAt(T.pts, T.seg, sd); const a1 = T.seg[1] + (T.seg[2] - T.seg[1]) * 0.25, a2 = T.seg[1] + (T.seg[2] - T.seg[1]) * 0.75; if (sd < a1 || sd > a2) continue; const dB = Math.min(...k.bridges.map((b) => Math.hypot(b.ax + b.dx * b.len / 2 - x, b.az + b.dz * b.len / 2 - z))); if (dB > 18 && (best < 0 || dB > bs)) { best = sd; bs = dB; } }
    if (best >= 0) {
      const [cx, cz] = k.polyAt(T.pts, T.seg, best), [x2, z2] = k.polyAt(T.pts, T.seg, best + 1); let tx = x2 - cx, tz = z2 - cz; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
      let dx = -tz, dz = tx; if ((front.x - cx) * dx + (front.z - cz) * dz < 0) { dx = -dx; dz = -dz; }                  // (dx, dz) points into the garrison
      const len = T.w + 3.6, W = 3.2, hx = cx + dx * len / 2, hz = cz + dz * len / 2, gy = k.ground(hx + dx * 0.5, hz + dz * 0.5);
      const deck = new THREE.Group(); deck.position.set(hx, gy + 0.1, hz); deck.rotation.y = Math.atan2(-dx, -dz); k.scene.add(deck);
      for (let i = 0; i < 9; i++) { const pl = new THREE.Mesh(new THREE.BoxGeometry(W, 0.12, len / 9 - 0.04), k.mats.timber); pl.position.set(0, 0, len / 18 + i * len / 9); pl.castShadow = true; deck.add(pl); }
      for (const s of [-1, 1]) { const rail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.2, len), k.mats.timber); rail.position.set(s * W / 2, 0.12, len / 2); deck.add(rail); }
      const hinge = new THREE.Group(); hinge.position.copy(deck.position); hinge.rotation.y = deck.rotation.y; k.scene.add(hinge); k.scene.remove(deck); deck.position.set(0, 0, 0); deck.rotation.set(0, 0, 0); hinge.add(deck);
      hinge.rotation.x = -1.25;                                                                                    // raised against the garrison's side
      for (const s of [-1, 1]) { const px = hx + dx * 1.2 - dz * s * (W / 2 + 0.5), pz = hz + dz * 1.2 + dx * s * (W / 2 + 0.5); k.put(new THREE.Mesh(new THREE.BoxGeometry(0.35, 4.2, 0.35), k.mats.timber), px, k.ground(px, pz) + 2.1, pz); k.solid(px, pz, 0.3); }
      const wx = hx + dx * 3.2 + dz * (W / 2 + 1.6), wz = hz + dz * 3.2 - dx * (W / 2 + 1.6), wy = k.ground(wx, wz);       // the winch, beside the road in
      k.put(new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 1.2, 10).rotateZ(Math.PI / 2), k.mats.timber), wx, wy + 0.9, wz, 0, Math.atan2(dx, dz), 0);
      for (const s of [-0.65, 0.65]) k.put(new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.3, 0.5), k.mats.timber), wx + Math.cos(Math.atan2(dx, dz)) * s, wy + 0.65, wz - Math.sin(Math.atan2(dx, dz)) * s);
      k.solid(wx, wz, 0.8, 1.3);
      let down = 0; k.anims.push(() => { if (down > 0 && hinge.rotation.x < 0) hinge.rotation.x = Math.min(0, hinge.rotation.x + 0.02); });
      addSpot({ id: 'drawbridge', name: 'The Drawbridge', x: wx - dx * 1.4, z: wz - dz * 1.4, r: 2.2, on: 'touch', say: 'The winch groans, the chains run, and the bridge comes down over the trench. A way in that stays open.',
        act: () => { down = 1; k.addBridge(cx, cz, -dx, -dz, len, W); } });
      k.regions.push({ name: 'DRAWBRIDGE', x: cx, z: cz });
      addQuest({ id: 'orders', title: 'None Leaves', region: 'garrison', open: () => orders.some((o) => o.read), reward: 'The garrison has a door now. A memory: soldiers of his own time, laughing at a gate that stood open. (+120 souls)',
        steps: [
          ...orders.map((o, i) => ({ text: `Read the garrison's orders (${i + 1} of ${orders.length}): ${o.title.toLowerCase()}.`, done: () => o.read, at: (): [number, number] => [o.x, o.z] })),
          { text: 'From inside the garrison, work the winch and lower the drawbridge.', done: () => spotDone('drawbridge'), at: () => [wx, wz] },
        ] });
    }
  }
}

/** The ferry's two landings (the River Landing in the village, the sunken landing in the Ghost Marsh): once the Ferry-Woman is home she
 *  poles him from one to the other (game.ts). */
export const FERRY: { a: { x: number; z: number } | null; b: { x: number; z: number } | null } = { a: null, b: null };

/** A bound spirit: a pale figure, faint light; released, it rises and fades. Returns its release. */
function spirit(k: Kit, x: number, z: number, hidden: boolean): () => void {
  const gy = k.ground(x, z), g = new THREE.Group(); g.position.set(x, gy, z); k.scene.add(g);
  const mat = new THREE.MeshBasicMaterial({ color: 0x9ae8e0, transparent: true, opacity: hidden ? 0 : 0.32, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.9, 4, 10), mat); body.position.y = 1.0; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), mat); head.position.y = 1.8; g.add(head);
  const glow = k.sparkle(x, gy + 1.2, z, 2.0, 0x6ad8d0); glow.material.opacity = hidden ? 0 : 0.35;
  let freed = 0; const ph = R() * 6;
  k.anims.push((t) => {
    if (freed > 0) { freed += 0.016; g.position.y = gy + freed * 4; mat.opacity = Math.max(0, 0.45 - freed * 0.25); glow.position.y = g.position.y + 1.2; glow.material.opacity = Math.max(0, 0.5 - freed * 0.3); return; }
    body.position.y = 1.0 + Math.sin(t * 1.4 + ph) * 0.08; head.position.y = body.position.y + 0.8;
  });
  return () => { freed = 0.01; mat.opacity = 0.45; glow.material.opacity = 0.5; };
}

/**
 * The Ghost Marsh, where even the dead are prisoners: a lantern causeway across the wet ground (fire relights its lanterns, and they
 * lead to the ferry), the half-sunk ferry landing on the river (the Ferry-Woman's boat crosses from here to the village once she is home),
 * offering lamps hung in the dead trees, and three spirits bound in three ways. Side quest "The Bound Dead".
 */
export function buildMarsh(k: Kit, M: { x: number; z: number }, toRiver: { x: number; z: number }): void {
  const lampLit: Array<() => void> = [];
  // the ferry landing: walk from the marsh toward the river until the water, and build where the bank is
  let fx = M.x, fz = M.z; { const dx = toRiver.x - M.x, dz = toRiver.z - M.z, L = Math.hypot(dx, dz); for (let d = 0; d < L + 30; d += 0.5) { const x = M.x + dx / L * d, z = M.z + dz / L * d; if (k.wet(x, z, -1.5)) break; fx = x; fz = z; } }
  { const ry = Math.atan2(toRiver.x - M.x, toRiver.z - M.z), ux = Math.sin(ry), uz = Math.cos(ry), gy = k.ground(fx, fz); k.clear(fx - ux * 2, fz - uz * 2, 4.5);
    for (let i = 0; i < 7; i++) { const x = fx + ux * (i * 0.55 - 1.5), z = fz + uz * (i * 0.55 - 1.5), sink = Math.max(0, i - 3) * 0.12;   // the far planks are going under
      k.put(new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.08, 0.5), k.mats.timber), x, gy + 0.25 - sink, z, (i > 3 ? 0.08 : 0), ry, (i > 4 ? 0.1 : 0)); }
    for (const s of [-1.3, 1.3]) for (const d of [-1.2, 1.6]) { const x = fx + ux * d - uz * s, z = fz + uz * d + ux * s; if (k.nearPath(x, z, 1.8)) continue; k.put(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 1.4, 6), k.mats.charred), x, gy + 0.4, z); }
    const sunk = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.3, 3.4), new THREE.MeshStandardMaterial({ color: 0x3e3022, roughness: 1 })); sunk.position.set(fx + ux * 2.4 + uz * 2, gy - 0.2, fz + uz * 2.4 - ux * 2); sunk.rotation.set(0.15, ry + 0.4, 0.3); k.scene.add(sunk);
    FERRY.b = { x: fx - ux * 1.0, z: fz - uz * 1.0 }; k.regions.push({ name: 'FERRY LANDING', x: fx, z: fz }); }

  // the lantern causeway: from the marsh's heart toward the landing, low planks on posts over the wet ground, lanterns every few metres
  { const ax = M.x + (fx - M.x) * 0.3, az = M.z + (fz - M.z) * 0.3, bx = M.x + (fx - M.x) * 0.78, bz = M.z + (fz - M.z) * 0.78, L = Math.hypot(bx - ax, bz - az), ry = Math.atan2(bx - ax, bz - az), nx = Math.cos(ry), nz = -Math.sin(ry);
    for (let d = 0; d <= L; d += 2.5) k.clear(ax + (bx - ax) * d / L, az + (bz - az) * d / L, 2.6);
    k.trail([[ax, az], [bx, bz]]);
    for (let d = 0; d < L; d += 0.7) { const x = ax + (bx - ax) * d / L, z = az + (bz - az) * d / L, gy = k.ground(x, z); if (R() < 0.08) continue;
      k.put(new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.07, 0.55), k.mats.timber), x + (R() - 0.5) * 0.1, gy + 0.2, z, (R() - 0.5) * 0.04, ry + Math.PI / 2 + (R() - 0.5) * 0.08, (R() - 0.5) * 0.05); }
    for (let d = 3; d < L; d += 6) for (const s of [-1, 1]) { if ((d / 6 + (s > 0 ? 1 : 0)) % 2 < 1) continue; const x = ax + (bx - ax) * d / L + nx * s * 2.3, z = az + (bz - az) * d / L + nz * s * 2.3, gy = k.ground(x, z);
      k.put(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.7, 5), k.mats.charred), x, gy + 0.85, z); k.put(new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.28, 0.22), k.mats.timber), x, gy + 1.6, z); k.solid(x, z, 0.12);
      const l = lantern(k, x, z); lampLit.push(() => l.on()); }
    addSpot({ id: 'causeway', name: 'The Lantern Causeway', x: ax, z: az, r: 3.0, on: 'fire', say: 'One by one the old lanterns catch, a line of light across the marsh to the river. Deeper in, three pale lights answer.', act: () => { for (const f of lampLit) f(); } });
    k.regions.push({ name: 'LANTERN CAUSEWAY', x: (ax + bx) / 2, z: (az + bz) / 2 });
  }

  // offering lamps left hanging in the trees round the marsh, long burnt down to a cold cyan glimmer
  for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2 + R() * 0.4, r = 14 + R() * 12, x = M.x + Math.cos(a) * r, z = M.z + Math.sin(a) * r; if (k.nearPath(x, z, 1.5) || k.wet(x, z, 0)) continue;
    const gy = k.ground(x, z), h = 1.8 + R() * 0.8; k.put(new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.6, 3), k.mats.charred), x, gy + h + 0.3, z); k.put(new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.07, 0.14, 7), new THREE.MeshStandardMaterial({ color: 0x5a4a3a, roughness: 0.9 })), x, gy + h, z);
    const gl = k.sparkle(x, gy + h, z, 0.6, 0x5ad0d8); const ph = R() * 6; k.anims.push((t) => { gl.material.opacity = 0.25 + 0.15 * Math.sin(t * 0.9 + ph); }); }

  // the three bound dead
  const [Ax, Az] = findClear(k, M.x - 18, M.z - 10, 3), [Bx, Bz] = findClear(k, M.x + 6, M.z - 20, 4), [Cx, Cz] = findClear(k, M.x - 6, M.z + 16, 3);
  // tied to a post with rope gone black: fire burns the binding
  { const rel = spirit(k, Ax, Az, false), gy = k.ground(Ax, Az); k.put(new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, 2.2, 6), k.mats.charred), Ax + 0.45, gy + 1.1, Az); k.solid(Ax + 0.45, Az, 0.2);
    const rope = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.04, 5, 14).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x1e1a14, roughness: 1 })); rope.position.set(Ax + 0.2, gy + 1.15, Az); k.scene.add(rope);
    addSpot({ id: 'spirit_rope', name: 'A Bound Spirit', x: Ax, z: Az, r: 1.8, on: 'fire', say: '"I only went out to check the nets. I told my sister I\'d be back before the rice was cooked." The rope burns through, and she goes.', act: () => { rope.visible = false; rel(); } }); }
  // caught in a knot of mist that never moves: air blows it away
  { const rel = spirit(k, Bx, Bz, false), puffs: THREE.Sprite[] = []; for (let i = 0; i < 9; i++) { const a = R() * 6.28, r = R() * 1.6, s = k.sparkle(Bx + Math.cos(a) * r, k.ground(Bx, Bz) + 0.4 + R() * 1.6, Bz + Math.sin(a) * r, 2.2 + R() * 1.4, 0xb0c8c8); s.material.blending = THREE.NormalBlending; s.material.opacity = 0.55; puffs.push(s); }
    let gone = 0; k.anims.push((t) => { for (const [i, p] of puffs.entries()) { if (gone > 0) { p.material.opacity = Math.max(0, p.material.opacity - 0.01); p.position.y += 0.01; } else p.position.y += Math.sin(t * 0.6 + i) * 0.002; } });
    addSpot({ id: 'spirit_mist', name: 'A Spirit in the Mist', x: Bx, z: Bz, r: 2.2, on: 'air', say: '"Is the roof fixed? I promised I\'d fix the roof before the rains." The mist tears apart, and he goes up through it.', act: () => { gone = 1; rel(); } }); }
  // hidden where only a soul can see: spirit shows it, and it remembers itself
  { const rel = spirit(k, Cx, Cz, true), gy = k.ground(Cx, Cz); k.put(new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.9, 0.25), k.mats.sandstone), Cx + 0.9, gy + 0.45, Cz, 0.12, R() * 3, 0); k.solid(Cx + 0.9, Cz, 0.4, 0.9);
    addSpot({ id: 'spirit_hidden', name: 'A Spirit Nobody Saw', x: Cx, z: Cz, r: 2.2, on: 'spirit', say: '"Everyone walked past me. For so long. You… see me?" A child, holding a paper boat. She smiles, and goes.', act: () => rel() }); }
  addQuest({ id: 'bound', title: 'The Bound Dead', region: 'marsh', open: () => spotDone('causeway') || spotDone('spirit_rope') || spotDone('spirit_mist') || spotDone('spirit_hidden'),
    reward: 'Three of the marsh\'s dead are free. A memory: he used to sit with the dying and hold their hands. (+150 souls)',
    steps: [
      { text: 'Free the spirit tied to the post (fire).', done: () => spotDone('spirit_rope'), at: () => [Ax, Az] },
      { text: 'Free the spirit caught in the still mist (air).', done: () => spotDone('spirit_mist'), at: () => [Bx, Bz] },
      { text: 'Somewhere a spirit waits that no eye has seen (spirit).', done: () => spotDone('spirit_hidden'), at: () => [Cx, Cz] },
    ] });
  // the village end of the ferry: by the River Landing's boat
  if (VILLAGE_HOMES.ferry) FERRY.a = { x: 29, z: 6.5 };
}

/**
 * The Sunken Monastery, the chapter's biggest optional branch: three sluice wheels beside the old rune stones let the flooded courts out
 * (the water drops by a third each, and wading gets easier); a raised gallery along the prayer hall shows how high the flood came (marks
 * on the stone, the day the Naga was bound); once the courts are drained a hatch in the main court's floor opens on the brothers' records
 * store (orderly shelves under the occupiers' mess); and when the Drowned Abbot is beaten, the page the brothers hid lies under his seat.
 * Side quest "The Drowned Records".
 */
export function buildMonastery(k: Kit, M: { x: number; z: number }, pools: Array<{ p: { x: number; z: number; r: number; d: number; drain: number }; mesh: THREE.Mesh | undefined }>,
  sluices: Array<[number, number]>, hall: { x: number; z: number }, abbot: { x: number; z: number }): void {
  const opened = new Set<number>();
  const drainTo = (level: number) => { let t = 0; const from = pools.map((q) => q.p.drain);
    k.anims.push(() => { if (t >= 1) return; t = Math.min(1, t + 0.004); for (const [i, q] of pools.entries()) { q.p.drain = from[i] + (level - from[i]) * t; if (q.mesh) { q.mesh.position.y = -0.3 - 0.13 - 0.5 * q.p.drain; q.mesh.scale.setScalar(1 - 0.55 * q.p.drain); } } }); };
  // the sluice wheels: one beside each rune stone; each turned lets a third of the water out
  sluices.forEach(([sx, sz], i) => {
    const [x, z] = findClear(k, sx + 1.8, sz, 0.9), gy = k.ground(x, z), g = new THREE.Group(); g.position.set(x, gy + 1.1, z); k.scene.add(g);
    k.put(new THREE.Mesh(new THREE.BoxGeometry(0.25, 1.1, 0.25), k.mats.timber), x, gy + 0.55, z); k.solid(x, z, 0.3, 1.2);
    const wheel = new THREE.Group(); g.add(wheel); wheel.add(new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.05, 6, 16), k.mats.timber));
    for (let j = 0; j < 4; j++) { const sp = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.0, 0.06), k.mats.timber); sp.rotation.z = (j * Math.PI) / 4; wheel.add(sp); }
    g.rotation.y = Math.atan2(M.x - x, M.z - z); g.traverse((o) => { o.castShadow = true; });
    let spin = 0; k.anims.push(() => { if (spin > 0) { wheel.rotation.z += 0.05; spin -= 0.05; } });
    const sp = addSpot({ id: `sluice_${i}`, name: 'A Sluice Wheel', x, z, r: 1.8, on: 'touch', say: 'The wheel turns, stiff with five hundred years of silt. Out in the courts the water drops.',
      act: () => { opened.add(i); spin = Math.PI * 2; drainTo(opened.size / sluices.length); if (opened.size === sluices.length) sp.say = 'The last sluice gives. Somewhere under the courts, water roars away, and the old floor comes up out of the dark.'; } });
  });

  // the raised gallery along the prayer hall's east side: crate steps up, a walk on posts, flood marks on the wall beside it
  { const gx = hall.x - 10.5, gz = hall.z, H = 2.4, gy = k.ground(gx, gz); k.clear(gx, gz - 4, 3);
    for (let d = -5; d <= 5; d += 2.5) for (const s of [-0.9, 0.9]) k.put(new THREE.Mesh(new THREE.BoxGeometry(0.2, H, 0.2), k.mats.timber), gx + s, gy + H / 2, gz + d);
    k.put(new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, 11), k.mats.timber), gx, gy + H, gz); k.solidRect(gx, gz, 2.0, 10.8, H);
    for (const [dz, h] of [[-6.6, 0.8], [-7.7, 1.6]] as Array<[number, number]>) { k.put(new THREE.Mesh(new THREE.BoxGeometry(1.1, h, 1.0), k.mats.timber), gx, gy + h / 2, gz + dz); k.solidRect(gx, gz + dz, 1.1, 1.0, h); }
    for (const s of [-1.05, 1.05]) k.put(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 11), k.mats.timber), gx + s, gy + H + 0.85, gz);
    const mark = new THREE.MeshBasicMaterial({ color: 0x2a3a30, transparent: true, opacity: 0.55, depthWrite: false });
    for (const [y, w] of [[3.1, 6], [2.5, 8], [1.6, 9]] as Array<[number, number]>) { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.12), mark); m.position.set(hall.x - 8.04, gy + y, gz); m.rotation.y = -Math.PI / 2; k.scene.add(m); }
    k.steles.push({ x: gx, z: gz + 4, title: 'The Flood Mark', read: false, text: 'Cut into the wall at the highest line: "The river rose in one night and did not go down. That was the night the great serpent was bound." Below, in a cruder hand: "Let them drown."' });
  }

  // the hatch in the main court: under the water until the courts drain, then it opens on the brothers' records store
  { const main = pools[0]?.p; if (main) {
    const hx = main.x, hz = main.z, gy = k.ground(hx, hz), lid = k.put(new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.2, 1.8), k.mats.sandstone), hx, gy + 0.1, hz);
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.0, 1.3, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x8ad8ff, transparent: true, opacity: 0, depthWrite: false, toneMapped: false })); ring.position.set(hx, gy + 0.22, hz); k.scene.add(ring);
    const hole = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x050403 })); hole.position.set(hx, gy + 0.05, hz); hole.visible = false; k.scene.add(hole);
    k.anims.push((t) => { (ring.material as THREE.MeshBasicMaterial).opacity = main.drain > 0.95 && !spotDone('hatch') ? 0.4 + 0.3 * Math.sin(t * 3) : 0; });
    addSpot({ id: 'hatch', name: 'The Records Store', x: hx, z: hz, r: 2.0, on: 'touch', when: () => main.drain > 0.95,
      say: 'The hatch lifts. Below: the brothers\' shelves, every scroll in its place and every name scraped away, and over them the occupiers\' leavings: bones, bowls, a sleeping mat. Something was kept here once in perfect order.',
      act: () => { lid.position.x += 1.6; lid.rotation.z = 0.5; hole.visible = true; } });
    k.lootAt(hx + 2.4, hz + 1.2, null, 70, 'The brothers\' strongbox, under the drained court: offerings, a ledger of the sick they sent up to the hill');
  } }

  // the Abbot's seat, broken, behind where he stands; the page the brothers hid lies under it (when he is beaten)
  { const [sx, sz] = findClear(k, abbot.x, abbot.z + 2.6, 1.0), gy = k.ground(sx, sz);
    k.put(new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.55, 1.0), k.mats.sandstone), sx, gy + 0.27, sz); k.put(new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.1, 0.2), k.mats.sandstone), sx, gy + 1.0, sz + 0.45, 0.15, 0, 0.12);
    k.put(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.4), k.mats.sandstone), sx + 1.0, gy + 0.17, sz - 0.3, 0.4, 0.6, 0.3); k.solidRect(sx, sz, 1.3, 1.0, 0.55);
    addSpot({ id: 'page', name: 'The Hidden Page', x: sx, z: sz - 1.0, r: 1.8, on: 'touch', when: () => STORY.downs.has('abbot'),
      say: 'Under the seat, wrapped in oilcloth: a page the chisels missed. "To the saint on the hill, from the brothers: forty-one carried up this spring, thirty-nine came down walking. He will not take our rice. He asks only that we boil the water." The name is a blank space, as if the ink itself forgot.' }); }

  // side quest: The Drowned Records
  addQuest({ id: 'records', title: 'The Drowned Records', region: 'monastery', open: () => opened.size > 0 || spotDone('hatch'),
    reward: 'The brothers\' page is found. A memory: boiling water in a great pot, and a queue of the sick down the hill. (+160 souls)',
    steps: [
      { text: 'Turn the three sluice wheels beside the old rune stones to drain the courts.', done: () => opened.size >= sluices.length, at: () => { const i = [0, 1, 2].find((j) => !opened.has(j)) ?? 0; return sluices[i]; } },
      { text: 'Open the hatch in the drained main court.', done: () => spotDone('hatch'), at: () => [pools[0]?.p.x ?? M.x, pools[0]?.p.z ?? M.z] },
      { text: 'Defeat the Drowned Abbot, U Lar Ba\'s chief disciple.', done: () => STORY.downs.has('abbot'), at: () => [abbot.x, abbot.z] },
      { text: 'Search under the Abbot\'s broken seat.', done: () => spotDone('page'), at: () => [abbot.x, abbot.z + 2.6] },
    ] });
  k.regions.push({ name: 'THE DROWNED RECORDS', x: hall.x, z: hall.z - 14 });
}

/**
 * The Alchemist's Garden, the healer under the anger: outside the old walls, his stone cistern and the dry channel that once fed his beds,
 * one bed of fever-leaf gone to sticks, the damaged shelter where he worked, and one patch that somehow survived. Water in the cistern runs
 * down the channel and the fever-leaf comes back; he remembers what it was for. Side quest "Fever-Leaf".
 */
export function buildGarden(k: Kit, G: { x: number; z: number }): void {
  const [Cx, Cz] = findClear(k, G.x + 12, G.z + 8, 1.6), [Bx, Bz] = findClear(k, G.x + 3, G.z + 13.5, 1.6);
  k.clear(Cx, Cz, 2.2); k.clear(Bx, Bz, 2.2);
  // the cistern: a square stone basin, dry
  { const gy = k.ground(Cx, Cz); for (const [a, b, w, d] of [[0, -0.9, 2.0, 0.25], [0, 0.9, 2.0, 0.25], [-0.9, 0, 0.25, 1.6], [0.9, 0, 0.25, 1.6]] as Array<[number, number, number, number]>) k.put(new THREE.Mesh(new THREE.BoxGeometry(w, 0.8, d), k.mats.sandstone), Cx + a, gy + 0.4, Cz + b);
    k.solidRect(Cx, Cz, 2.0, 2.0, 0.8); }
  const cisternWater = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x2a6070, roughness: 0.1, transparent: true, opacity: 0.85 })); cisternWater.position.set(Cx, k.ground(Cx, Cz) + 0.6, Cz); cisternWater.visible = false; k.scene.add(cisternWater);
  // the channel: two lines of edging stones from the cistern down to the bed, its bed dry earth (water runs in it once filled)
  const L = Math.hypot(Bx - Cx, Bz - Cz), ry = Math.atan2(Bx - Cx, Bz - Cz), nx = Math.cos(ry), nz = -Math.sin(ry); const stones: THREE.BufferGeometry[] = [];
  for (let d = 1.2; d < L - 1.0; d += 0.45) for (const s of [-0.35, 0.35]) { const x = Cx + (Bx - Cx) * d / L + nx * s, z = Cz + (Bz - Cz) * d / L + nz * s; stones.push(new THREE.DodecahedronGeometry(0.16, 0).scale(1, 0.6, 1.2).translate(x, k.ground(x, z) + 0.05, z)); }
  if (stones.length) { const m = new THREE.Mesh(mergeGeometries(stones), k.mats.sandstone); m.castShadow = true; k.scene.add(m); }
  const chan = new THREE.Mesh(new THREE.PlaneGeometry(0.5, Math.max(0.5, L - 2.0)).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x3a2c1e, roughness: 1 })); chan.position.set((Cx + Bx) / 2, k.ground((Cx + Bx) / 2, (Cz + Bz) / 2) + 0.02, (Cz + Bz) / 2); chan.rotation.y = ry; chan.renderOrder = 2; k.scene.add(chan);
  // the fever-leaf bed: sticks now; green again once the water comes
  const wild = new THREE.MeshStandardMaterial({ color: 0x6a5a3a, roughness: 1, flatShading: true }), fresh = new THREE.MeshStandardMaterial({ color: 0x5a9a4a, roughness: 1, flatShading: true });
  const feverBed = bed(k, Bx, Bz, ry, 2.6, 1.6, wild);
  addSpot({ id: 'garden_cistern', name: 'His Cistern', x: Cx, z: Cz, r: 2.2, on: 'touch', say: 'A stone cistern, dry for five hundred years, and a channel running down to one bed of dead sticks. Water would still find its way.' });
  addSpot({ id: 'garden_water', name: 'Water in the Channel', x: Cx, z: Cz, r: 2.6, on: 'water', say: 'The cistern fills and spills, and water runs down the old channel. By the time it reaches the bed, there is green in the sticks.',
    act: () => { cisternWater.visible = true; (chan.material as THREE.MeshStandardMaterial).color.setHex(0x2a6878); (chan.material as THREE.MeshStandardMaterial).roughness = 0.15; feverBed.material = fresh; } });
  addSpot({ id: 'garden_fever', name: 'Fever-Leaf', x: Bx, z: Bz, r: 2.0, on: 'touch', when: () => spotDone('garden_water'), say: 'He knows these leaves. Bruised in boiled water, for fever: three leaves for a child, seven for a grown man. He used to say it while he worked, so the village would learn it.' });
  addQuest({ id: 'garden', title: 'Fever-Leaf', region: 'garden', open: () => spotDone('garden_cistern') || spotDone('garden_water'), reward: 'The fever-leaf grows again under the hill. (+60 souls)',
    steps: [
      { text: 'Fill his dry cistern so the channel runs again (water).', done: () => spotDone('garden_water'), at: () => [Cx, Cz] },
      { text: 'See what comes back in the bed at the channel\'s end.', done: () => spotDone('garden_fever'), at: () => [Bx, Bz] },
    ] });
  // his work shelter, half fallen: posts, a slipped roof, a bench with a pestle; and the one patch that survived on its own
  { const [Wx, Wz] = findClear(k, G.x - 12, G.z + 7, 2.2); k.clear(Wx, Wz, 2.8); const gy = k.ground(Wx, Wz);
    for (const [a, b, h] of [[-1.3, -1.0, 2.3], [1.3, -1.0, 2.3], [-1.3, 1.0, 1.4], [1.3, 1.0, 0.9]] as Array<[number, number, number]>) { k.put(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, h, 6), k.mats.timber), Wx + a, gy + h / 2, Wz + b); k.solid(Wx + a, Wz + b, 0.15); }
    k.put(new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.1, 2.4), k.mats.thatch), Wx, gy + 1.9, Wz + 0.2, 0.45, 0, 0.12);
    k.put(new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.08, 0.6), k.mats.timber), Wx, gy + 0.75, Wz - 0.5); k.solidRect(Wx, Wz - 0.5, 1.6, 0.6, 0.8);
    k.put(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.12, 0.18, 9), k.mats.sandstone), Wx - 0.4, gy + 0.88, Wz - 0.5); k.put(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.32, 6), k.mats.timber), Wx - 0.4, gy + 1.0, Wz - 0.5, 0.4, 0, 0); }
  { const [Px, Pz] = findClear(k, G.x - 6, G.z - 12, 1.4); k.clear(Px, Pz, 1.8); bed(k, Px, Pz, R() * 3, 1.8, 1.2, new THREE.MeshStandardMaterial({ color: 0x4a8a3a, roughness: 1, flatShading: true }));
    for (let i = 0; i < 4; i++) { const f = k.sparkle(Px + (R() - 0.5) * 1.4, k.ground(Px, Pz) + 0.55, Pz + (R() - 0.5) * 0.9, 0.18, 0xffe0f0); f.material.opacity = 0.8; } }
}

/**
 * The temple, a sanctuary turned prison (developed round the existing rooms, not new ones): the Pilgrims' Rest by the head of the Grand
 * Stair where the sick were brought, the Healing Court on the hill's north side above his garden, the Nine's prison works laid over the
 * Relief Chamber (seal conduits across the old floor to the pillar, chain anchors drilled into the stone, a door bricked up), and the
 * Outer Gallery along the east rim to an overlook of the village. On the Grand Stair, lamp niches that fire relights, and pilgrim
 * waystones along the road up from the Temple Bridge.
 */
export function buildTemple(k: Kit, TX: number, seal: { x: number; z: number }, stair: { z0: number; z1: number; xTop: number; xBot: number }): void {
  const iron = new THREE.MeshStandardMaterial({ color: 0x24201e, roughness: 0.55, metalness: 0.6 }), darkStone = new THREE.MeshStandardMaterial({ color: 0x3a3a40, roughness: 0.9 });
  const sticks = new THREE.MeshStandardMaterial({ color: 0x6a5032, roughness: 0.95 }), jar = new THREE.MeshStandardMaterial({ color: 0x8a5a3a, roughness: 0.85 });

  // the Pilgrims' Rest: a low-walled room south of the stair's head; sleeping platforms, a medicine shelf, walking sticks, old offerings
  { const [Px, Pz] = findClear(k, TX - 38, -42, 4); k.clear(Px, Pz, 5); const gy = k.ground(Px, Pz), W = 7, D = 5;
    for (const [a, b, w, d] of [[0, -D / 2, W, 0.4], [-W / 2, 0, 0.4, D], [W / 2, 0, 0.4, D], [-2.2, D / 2, 2.6, 0.4], [2.2, D / 2, 2.6, 0.4]] as Array<[number, number, number, number]>) { k.put(new THREE.Mesh(new THREE.BoxGeometry(w, 1.3, d), k.mats.sandstone), Px + a, gy + 0.65, Pz + b); k.solidRect(Px + a, Pz + b, Math.max(w, 0.4), Math.max(d, 0.4), 1.3); }
    for (let i = 0; i < 3; i++) { const x = Px - 2.2 + i * 2.2, z = Pz - 1.2; k.put(new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.4, 2.0), k.mats.timber), x, gy + 0.2, z); k.put(new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.06, 1.8), new THREE.MeshStandardMaterial({ color: 0x9a8a6a, roughness: 1 })), x, gy + 0.43, z); k.solidRect(x, z, 1.6, 2.0, 0.45); }
    { const x = Px + W / 2 - 0.5, z = Pz + 0.6; for (const y of [0.6, 1.1]) k.put(new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.06, 2.0), k.mats.timber), x, gy + y, z); for (let i = 0; i < 7; i++) k.put(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.22, 7), jar), x, gy + (i < 4 ? 0.74 : 1.24), z - 0.8 + (i % 4) * 0.5); k.solidRect(x, z, 0.4, 2.0, 1.2); }
    for (let i = 0; i < 4; i++) k.put(new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 1.4, 5), sticks), Px - W / 2 + 0.4, gy + 0.7, Pz + 1.6 - i * 0.18, 0, 0, 0.25 - i * 0.03);
    for (let i = 0; i < 5; i++) k.put(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.08, 0.06, 9), k.mats.gilt), Px - 1 + i * 0.5, gy + 0.03, Pz + 1.8);
    addSpot({ id: 'pilgrims_rest', name: 'The Pilgrims\' Rest', x: Px, z: Pz, r: 2.6, on: 'touch', say: 'Sleeping boards for the sick, worn smooth. Walking sticks left by people who did not need them any more when they went down the hill.' });
    k.regions.push({ name: 'PILGRIMS\' REST', x: Px, z: Pz }); }

  // the Healing Court: open ground on the north side above the garden; treatment benches with headrests, herb troughs, a dry channel to the rim
  { const [Hx, Hz] = findClear(k, TX - 5, 42, 4.5); k.clear(Hx, Hz, 6); const gy = k.ground(Hx, Hz);
    for (let i = 0; i < 3; i++) { const x = Hx - 3 + i * 3, z = Hz;
      k.put(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.12, 2.0), k.mats.sandstone), x, gy + 0.62, z); for (const [a, b] of [[-0.35, -0.8], [0.35, -0.8], [-0.35, 0.8], [0.35, 0.8]]) k.put(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.6, 0.12), k.mats.sandstone), x + a, gy + 0.3, z + b);
      const rest = k.put(new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.18, 0.3), k.mats.sandstone), x, gy + 0.76, z - 0.82, i === 1 ? 0.5 : 0.12, 0, i === 1 ? 0.35 : 0); k.solidRect(x, z, 0.9, 2.0, 0.7);
      if (i === 1) addSpot({ id: 'bench', name: 'A Treatment Bench', x, z: z - 1.6, r: 1.6, on: 'touch', say: 'He reaches out and straightens the bench\'s headrest before he knows why. His hands remember the height exactly.', act: () => { rest.rotation.set(0.12, 0, 0); } }); }
    for (const s of [-1, 1]) { const x = Hx + s * 5.2, z = Hz + 1.8; k.put(new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.5, 2.4), k.mats.sandstone), x, gy + 0.25, z); k.put(new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.06, 2.2), new THREE.MeshStandardMaterial({ color: 0x3a2c1e, roughness: 1 })), x, gy + 0.48, z); k.solidRect(x, z, 1.0, 2.4, 0.5); }
    const ch = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 12).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x5a4a38, roughness: 1 })); ch.position.set(Hx, gy + 0.02, Hz + 6.5); ch.renderOrder = 2; k.scene.add(ch);
    k.regions.push({ name: 'HEALING COURT', x: Hx, z: Hz }); }

  // the prison works over the Relief Chamber: seal conduits across the old floor to the pillar, iron anchors, a door bricked shut
  { const gy = k.floor(seal.x + 4, seal.z + 4), red = new THREE.MeshBasicMaterial({ color: 0x8a1a14, transparent: true, opacity: 0.5, depthWrite: false, toneMapped: false });
    for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + 0.785, L = 6.5, cx = seal.x + Math.cos(a) * (2.6 + L / 2), cz = seal.z + Math.sin(a) * (2.6 + L / 2), ry = Math.atan2(Math.cos(a), Math.sin(a));
      const c = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, L), iron); c.position.set(cx, gy + 0.06, cz); c.rotation.y = ry; c.receiveShadow = true; k.scene.add(c);
      const glow = new THREE.Mesh(new THREE.PlaneGeometry(0.1, L).rotateX(-Math.PI / 2), red); glow.position.set(cx, gy + 0.125, cz); glow.rotation.y = ry; glow.renderOrder = 3; k.scene.add(glow);
      const ax = seal.x + Math.cos(a) * (2.6 + L + 0.4), az = seal.z + Math.sin(a) * (2.6 + L + 0.4); k.put(new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.06, 6, 12), iron), ax, gy + 0.3, az, Math.PI / 2, 0, 0); k.put(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.3, 8), iron), ax, gy + 0.15, az); }
    k.anims.push((t) => { red.opacity = 0.25 + 0.15 * Math.sin(t * 1.2); });
    const bx = seal.x + 7.6, bz = seal.z - 5.5; for (let r = 0; r < 6; r++) for (let c = 0; c < 4; c++) { if (r === 5 && (c === 0 || c === 3)) continue; k.put(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.42), darkStone), bx, gy + 0.2 + r * 0.42, bz - 0.75 + c * 0.5 + (r % 2) * 0.12); }
    k.solidRect(bx, bz, 0.5, 2.0, 2.6);
    k.steles.push({ x: seal.x - 4.5, z: seal.z + 4.5, title: 'Later Stone', read: false, text: 'These conduits and anchors are a different stone from the chamber: darker, fitted badly over the old carvings of herbs and open hands. Someone built a prison inside a place of healing, in a hurry.' }); }

  // the Outer Gallery: a walk along the east rim, north of the stair's head, to an overlook of the valley; a balustrade, a bench, a reward
  { const pts: Array<[number, number]> = [[TX - 50, -4], [TX - 51, 8], [TX - 50, 20]]; k.trail(pts);
    for (let z = -6; z <= 22; z += 1.6) { const x = TX - 54.2 + Math.sin(z * 0.3) * 0.3, gy = k.ground(x, z); if (gy < 5) continue; k.put(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.9, 0.3), k.mats.sandstone), x, gy + 0.45, z); k.solid(x, z, 0.22, 0.9); }
    const ox = TX - 51, oz = 24, gy = k.ground(ox, oz); k.clear(ox, oz, 2.5); k.put(new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.45, 0.5), k.mats.sandstone), ox, gy + 0.22, oz + 0.8); k.solidRect(ox, oz + 0.8, 1.6, 0.5, 0.45);
    k.lootAt(ox + 1.4, oz - 0.6, null, 50, 'A pilgrim\'s thank-offering, tucked under the overlook bench: a few coins and a dried lotus');
    k.regions.push({ name: 'OUTER GALLERY', x: ox, z: oz }); }

  // the Grand Stair: lamp niches along both rails (fire relights them all), carved lotus panels at its foot
  { const lamps: Array<() => void> = [];
    for (let x = stair.xBot + 3; x < stair.xTop - 1; x += 5) for (const z of [stair.z0 + 0.35, stair.z1 - 0.35]) { const gy = k.ground(x, (stair.z0 + stair.z1) / 2); k.put(new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.34, 0.5), k.mats.sandstone), x, gy + 0.95, z); const l = lantern(k, x, z); lamps.push(() => l.on()); }
    addSpot({ id: 'stair_lamps', name: 'The Pilgrims\' Lamps', x: stair.xBot + 4, z: (stair.z0 + stair.z1) / 2, r: 6, on: 'fire', say: 'The niches catch one after another all the way up the stair, the way they burned for the sick climbing on their knees.', act: () => { for (const f of lamps) f(); } });
    const lotus = k.tex(64, (g, s) => { g.fillStyle = '#9a9070'; g.fillRect(0, 0, s, s); g.strokeStyle = '#5e5844'; g.lineWidth = 2; for (let i = 0; i < 7; i++) { const a = -Math.PI / 2 + (i - 3) * 0.32; g.beginPath(); g.ellipse(s / 2 + Math.cos(a) * 12, s * 0.62 + Math.sin(a) * 12, 5, 13, a + Math.PI / 2, 0, Math.PI * 2); g.stroke(); } g.beginPath(); g.moveTo(8, s * 0.8); g.lineTo(s - 8, s * 0.8); g.stroke(); });
    for (const z of [stair.z0 - 1.6, stair.z1 + 1.6]) { const x = stair.xBot + 1.5, gy = k.ground(x, z); k.put(new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.2, 1.2), new THREE.MeshStandardMaterial({ map: lotus, roughness: 0.95 })), x, gy + 0.6, z); k.solid(x, z, 0.5, 1.2); } }

  // pilgrim waystones along the road up from the Temple Bridge: short pillars with a lotus cap, every fifteen metres
  for (let x = stair.xBot - 12; x > 48; x -= 15) { const z = -18.6, gy = k.ground(x, z); if (k.nearPath(x, z, 1.0)) continue; k.put(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 1.1, 8), k.mats.sandstone), x, gy + 0.55, z); k.put(new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), k.mats.sandstone), x, gy + 1.1, z); k.solid(x, z, 0.3, 1.2); }
}

/**
 * The Naga's approach, building the finale's presence: shed scales the size of shields beside the trail, a ruined hut with flood lines on
 * its walls, two old reliefs of the serpent sheltering people under its hood (a guardian once, not a monster), and round the lair six
 * binding pillars with chains and pulsing seal runes. When it is spared, the runes go dark and the chains drop.
 */
export function buildNagaApproach(k: Kit, lair: { x: number; z: number; r: number }, barrierR: number, gate: { x: number; z: number }): void {
  const ax = gate.x > lair.x ? -1 : 1;                                                         // the approach runs from the side away from the gate
  const at = (d: number, side: number): [number, number] => [lair.x + ax * (barrierR + d), lair.z + side];
  const scaleMat = new THREE.MeshStandardMaterial({ color: 0x3a8a7a, roughness: 0.35, metalness: 0.55, emissive: 0x0a2a24, emissiveIntensity: 0.4, side: THREE.DoubleSide });
  const iron = new THREE.MeshStandardMaterial({ color: 0x2a2624, roughness: 0.6, metalness: 0.6 });
  // shed scales along the trail
  for (let i = 0; i < 6; i++) { const [x, z] = at(6 + i * 4.5 + R() * 2, (i % 2 ? 1 : -1) * (4 + R() * 3)); if (k.nearPath(x, z, 1.4)) continue; const gy = k.ground(x, z);
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, 0.9).scale(1.3, 0.35, 1.0), scaleMat); m.position.set(x, gy + 0.12, z); m.rotation.set(-0.3 + R() * 0.2, R() * 6, 0.5 + R() * 0.6); m.castShadow = true; k.scene.add(m); k.solid(x, z, 0.8, 0.6); }
  // a ruined hut with flood lines
  { const [hx, hz] = findClear(k, ...at(22, 11), 3); k.clear(hx, hz, 3.5); const gy = k.ground(hx, hz), mark = new THREE.MeshBasicMaterial({ color: 0x223028, transparent: true, opacity: 0.6, depthWrite: false });
    for (const [a, b, w, d] of [[0, -1.8, 4.0, 0.35], [-1.9, 0, 0.35, 3.6], [1.9, 0.6, 0.35, 2.4]] as Array<[number, number, number, number]>) { k.put(new THREE.Mesh(new THREE.BoxGeometry(w, 2.0, d), k.mats.sandstone), hx + a, gy + 1.0, hz + b); k.solidRect(hx + a, hz + b, Math.max(w, 0.35), Math.max(d, 0.35), 2.0);
      for (const y of [0.7, 1.25, 1.7]) { const l = new THREE.Mesh(new THREE.PlaneGeometry(Math.max(w, d) - 0.1, 0.07), mark); l.position.set(hx + a + (d > w ? 0.18 : 0), gy + y, hz + b + (w > d ? 0.18 : 0)); l.rotation.y = d > w ? Math.PI / 2 : 0; k.scene.add(l); } } }
  // two reliefs: the serpent's hood spread over small figures, like a roof in the rain; iron spikes through its eyes
  const relief = k.tex(128, (g, s) => {
    g.fillStyle = '#8a8268'; g.fillRect(0, 0, s, s); g.strokeStyle = '#4a4434'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(s * 0.2, s * 0.95); g.bezierCurveTo(s * 0.1, s * 0.6, s * 0.3, s * 0.35, s * 0.5, s * 0.3); g.bezierCurveTo(s * 0.7, s * 0.35, s * 0.9, s * 0.6, s * 0.8, s * 0.95); g.stroke();   // the hood
    g.beginPath(); g.arc(s * 0.5, s * 0.22, s * 0.08, 0, Math.PI * 2); g.stroke();
    for (let i = 0; i < 5; i++) { const x = s * (0.3 + i * 0.1); g.beginPath(); g.arc(x, s * 0.7, s * 0.03, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.moveTo(x, s * 0.73); g.lineTo(x, s * 0.86); g.stroke(); }   // the people under it
    g.fillStyle = '#2a2420'; for (const dx of [-0.03, 0.03]) { g.beginPath(); g.arc(s * (0.5 + dx), s * 0.21, 3, 0, Math.PI * 2); g.fill(); } });
  for (const side of [-1, 1]) { let sd = 7.5; while (sd < 20 && k.nearPath(...at(14, side * sd), 2.2)) sd += 1; const [x, z] = at(14, side * sd), gy = k.ground(x, z); k.clear(x, z, 1.5);
    const m = k.put(new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.6, 0.4), [k.mats.sandstone, k.mats.sandstone, k.mats.sandstone, k.mats.sandstone, new THREE.MeshStandardMaterial({ map: relief, roughness: 0.95 }), new THREE.MeshStandardMaterial({ map: relief, roughness: 0.95 })]), x, gy + 1.3, z, 0.05 * side, Math.PI / 2, 0); void m; k.solidRect(x, z, 0.5, 2.2, 2.6); }
  k.steles.push({ x: at(14, 5.4)[0], z: at(14, 5.4)[1], title: 'The Old Relief', read: false, text: 'The great serpent coiled round the valley, its hood spread over the people like a roof in the rain. Long after, someone drove iron spikes through its carved eyes.' });
  // the binding pillars round the lair: chains running in toward it, seal runes pulsing until it is free
  const runes: THREE.MeshBasicMaterial[] = [], chains: THREE.Object3D[] = [];
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + 0.26, r = barrierR + 3.2, x = lair.x + Math.cos(a) * r, z = lair.z + Math.sin(a) * r; if (Math.hypot(x - gate.x, z - gate.z) < 7 || k.nearPath(x, z, 1.6)) continue; const gy = k.ground(x, z);
    k.put(new THREE.Mesh(new THREE.BoxGeometry(0.9, 4.2, 0.9), new THREE.MeshStandardMaterial({ color: 0x3a3440, roughness: 0.85 })), x, gy + 2.1, z, 0, a, 0); k.solid(x, z, 0.65);
    const rm = new THREE.MeshBasicMaterial({ color: 0xff3a2a, transparent: true, opacity: 0.7, toneMapped: false }); runes.push(rm);
    for (const y of [1.4, 2.4, 3.4]) { const rn = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), rm); rn.position.set(x - Math.cos(a) * 0.46, gy + y, z - Math.sin(a) * 0.46); rn.rotation.y = Math.atan2(-Math.cos(a), -Math.sin(a)); k.scene.add(rn); }
    const links: THREE.BufferGeometry[] = []; for (let j = 0; j < 14; j++) { const u = j / 14; links.push(new THREE.TorusGeometry(0.11, 0.03, 4, 8).rotateY(j % 2 ? Math.PI / 2 : 0).translate(-Math.cos(a) * u * 6, 3.6 - u * 3.4 + Math.sin(u * Math.PI) * -0.4, -Math.sin(a) * u * 6)); }
    const ch = new THREE.Mesh(mergeGeometries(links), iron); ch.position.set(x, gy, z); k.scene.add(ch); chains.push(ch); }
  k.anims.push((t) => { const free = STORY.downs.has('naga'); for (const [i, m] of runes.entries()) m.opacity = free ? Math.max(0, m.opacity - 0.01) : 0.45 + 0.3 * Math.sin(t * 2 + i); if (free) for (const c of chains) if (c.position.y > -3) c.position.y -= 0.03; });
  k.regions.push({ name: 'BINDING STONES', x: at(2, 0)[0], z: at(2, 0)[1] });
}
