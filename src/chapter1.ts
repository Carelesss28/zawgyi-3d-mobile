import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { LOOK, glsl } from './look';
import { buildVillageDistricts, buildGoblinRoute, buildBoneWastes, buildGarrison, buildMarsh, buildMonastery, buildGarden, buildTemple, buildNagaApproach, type Kit } from './ch1places';

/**
 * Chapter 1: the Lotus Temple ruins, laid out from art/Chapter-1-Full-Map-Tripo-Reference.png.
 * Layout coordinates are the reference image's pixels (0.05 m each). Image right = screen right, image up = screen up
 * (the chapter camera looks north, yaw 0): world x = -(px - 690) * 0.05, world z = -(py - 570) * 0.05.
 *
 * Rooms                               Built from
 *   Shrine of the Jade Altar  (NW)      floors, walls with pillars, ornate gable, lanterns, jade altar
 *   Offering Hall             (NE)      stepped altar, offering bowls on pedestals, lanterns
 *   Canal Gallery             (middle)  long walk beside a flowing water channel, broken pillars, rubble
 *   Relief Chamber            (SW)      carved relief wall under a gable, start point
 *   Lotus Courtyard           (SE)      boss arena: lotus floor seal, four great pillars with braziers, exit gate east
 * Around it: jungle tree walls (instanced, wind sway), a winding river with flowing water, Dire-style dead trees,
 * rubble and embers near the boss court. Every prop is a simple stand-in that a Tripo model can replace later.
 */

type Rect = [number, number, number, number];             // px: x0, y0, x1, y1
const PX = 0.07;                                                       // 0.05 m per layout pixel, times 1.4: the temple was enlarged 1.4x
/** The temple stands on a hill at the west (left) edge of the map: shifted TX m west and raised TY m on its plateau. */
export const TX = 177, TY = 8;                                           // 135 before the valley grew 1.4x (growCh1)
/** Height the temple and its plateau stand at right now (0 while the temple meshes are built inside their raised group). */
let TYH = TY;
const wx = (px: number) => -(px - 690) * PX + TX;
const wz = (py: number) => -(py - 570) * PX;
const at = (px: number, py: number) => new THREE.Vector3(wx(px), 0, wz(py));

/** h = floor height (m). Stairs ramp from h at their first edge (north for 'ns', west for 'ew') to h1 at the other. */
const TERRACE = 1.6;
const GY = -0.3;                                                       // jungle ground level
const FLOORS: Array<{ r: Rect; name: string; h: number; h1?: number; stairs?: 'ns' | 'ew'; ruin?: boolean; open?: boolean }> = [
  // ruined staircases out of the temple: from the raised Shrine and Offering Hall down to the jungle (north), and short steps at each breach
  { r: [288, 6, 348, 122], name: 'Shrine north stairs', h: GY, h1: TERRACE, stairs: 'ns', ruin: true },
  { r: [895, -14, 975, 102], name: 'Hall north stairs', h: GY, h1: TERRACE, stairs: 'ns', ruin: true },
  { r: [200, 998, 258, 1030], name: 'Relief breach steps', h: 0, h1: GY, stairs: 'ns', ruin: true },
  { r: [76, 515, 112, 565], name: 'Gallery breach steps', h: GY, h1: 0, stairs: 'ew', ruin: true },
  { r: [942, 1038, 1008, 1070], name: 'Court south steps', h: 0, h1: GY, stairs: 'ns', ruin: true },
  { r: [1098, 930, 1130, 990], name: 'Court east steps', h: 0, h1: GY, stairs: 'ew', ruin: true },
  { r: [150, 120, 360, 292], name: 'Shrine', h: TERRACE },
  { r: [205, 288, 300, 474], name: 'Shrine stairs', h: TERRACE, h1: 0, stairs: 'ns' },
  { r: [356, 200, 714, 290], name: 'Wall walk', h: TERRACE },
  { r: [710, 100, 1130, 372], name: 'Offering Hall', h: TERRACE },
  { r: [800, 368, 920, 474], name: 'Hall stairs', h: TERRACE, h1: 0, stairs: 'ns' },
  { r: [110, 468, 1080, 582], name: 'Canal Gallery', h: 0 },
  { r: [180, 578, 290, 724], name: 'Relief corridor', h: 0 },
  { r: [100, 720, 350, 1000], name: 'Relief Chamber', h: 0 },
  { r: [820, 578, 940, 644], name: 'Court stairs', h: 0, h1: 0, stairs: 'ns' },
  { r: [450, 640, 1100, 1040], name: 'Lotus Courtyard', h: 0 },
  { r: [1096, 705, 1270, 850], name: 'Exit stairs', h: 0, h1: GY, stairs: 'ew', open: true },   // the court's east gate: steps down onto the hill and out to the Grand Stair (its outer end open)
];
const WATER: Rect[] = [[140, 430, 207, 470], [298, 430, 802, 470], [918, 430, 1080, 470]];

/** Where things start. Facing 0 = +z = north = up the screen (the chapter camera looks north). */
export const CH1 = {
  spawn: at(235, 815 + 2.9 / PX), spawnFacing: Math.PI,                         // just stepped out of the broken seal pillar, facing out of it
  sealPillar: at(235, 815),                                          // the pillar the Nine sealed him in (intro panels 7-12): Relief Chamber
  foes: [] as Array<['dummy' | 'sentry', THREE.Vector3]>,                                          // the training dummies live in the arena only
  necro: { x: -9, z: 60, facing: Math.PI },
  // the Sunken Monastery's side boss: in the flooded court below the prayer hall's steps, his broken seat behind him
  abbot: { x: 114, z: -101, facing: Math.PI },
  // Act I-b: the real king, killed by the witches and bound to the temple as Zaw Gyi's jailer (Offering Hall terrace)
  undeadKing: { x: -3, z: 20, facing: Math.PI },
  // the four Curse Shard holders (Act II-V); elites join a camp's pack (camp index into `camps`)
  elites: [
    // placed by act: each act's camp is further from the temple than the last (II south of the river bend, III north, IV the garrison's
    // front camp, V the Weeping Pool just before the lair). Camps 16 and 18 are pushed below.
    { kind: 'chief', camp: 16, act: 'II' }, { kind: 'commander', camp: 6, act: 'IV' }, { kind: 'banshee', camp: 18, act: 'V' },
  ] as Array<{ kind: 'chief' | 'commander' | 'banshee'; camp: number; act: string }>,
  /** The camp whose cage holds Ma Hnin (Act II: the goblins who emptied the village, under the Goblin Chief). */
  mahninCamp: 16,
  orders: { x: -78, z: 105 },                                      // the garrison's carved orders, by the trail into the garrison
  mahnin: { x: 25.8, z: 16.8 },                                        // where Ma Hnin waits after her rescue (the Shrine terrace, by the altar-to-be)
  barrierR: 26.5,                                                  // the red barrier round the Naga's lair (falls with 4 shards)
  // map labels for the lore regions
  regions: [
    { name: 'RUINED TEMPLE', x: 0, z: 2 }, { name: 'BONE WASTES', x: -14, z: 100 }, { name: 'UNDEAD GARRISON', x: -125, z: 122 },
    { name: 'GOBLIN HUNTING GROUNDS', x: -110, z: -100 }, { name: 'GHOST MARSH', x: 118, z: 45 }, { name: 'JUNGLE CROSSROADS', x: -95, z: -48 },
    { name: 'SUNKEN MONASTERY', x: 118, z: -92 }, { name: "NAGA'S LAIR", x: -171, z: 22 },
  ],
  // the final boss: the Hydra's lair at the far right (east) edge, guarding the gate to Chapter 2 and the chapter's treasure
  lair: { x: -171, z: -2, r: 24 },
  hydra: { x: -163, z: -2, facing: Math.PI / 2 },                                                   // facing west, toward the way in
  gate: { x: -194, z: -2 },
  treasure: { x: -186.5, z: -2 },
  // minion camps out in the jungle (Dota-style neutral camps): ghouls round the fire, casters at the edge; `tent` = angle of the lean-to
  // evil: what the camp is up to besides its fire (ritual circle, witch's cauldron, skull totems, prisoner cage, open graves)
  // camps by lore region (AGENTS.md section 2). region: which part of the Sealed Zone the camp belongs to
  camps: [
    // GOBLIN HUNTING GROUNDS (south-east): the witches' paid hunters. G2 holds Ma Hnin in its cage.
    { x: -60, z: -92, tent: 0.6, evil: 'totems', region: 'goblin', members: ['archer', 'archer', 'ghoul', 'ghoul'] },
    { x: -110, z: -120, tent: 2.4, evil: 'cage', region: 'goblin', members: ['archer', 'archer', 'archer', 'ghoul', 'ghoul'] },
    { x: -160, z: -110, tent: 4.2, evil: 'fire', region: 'goblin', members: ['archer', 'archer', 'ghoul', 'ghoul'] },
    // BONE WASTES (north, round the Necromancer's wasteland): the dead army
    { x: -36, z: 88, tent: 1.2, evil: 'ritual', region: 'bone', members: ['caster', 'caster', 'ghost', 'ghoul'] },
    { x: 11, z: 121, tent: 3.3, evil: 'graves', region: 'bone', members: ['ghost', 'ghost', 'ghoul', 'ghoul'] },   // on the Barrow Mound
    { x: -42, z: 48, tent: 5.0, evil: 'cauldron', region: 'bone', members: ['caster', 'ghost', 'ghoul', 'ghoul'] },
    // UNDEAD GARRISON (far north-east): the king's old soldiers
    { x: -90, z: 96, tent: 2.0, evil: 'fire', region: 'garrison', members: ['sword', 'sword', 'lance', 'lance'] },
    { x: -150, z: 100, tent: 0.3, evil: 'totems', region: 'garrison', members: ['sword', 'lance', 'lance', 'caster'] },
    { x: -125, z: 145, tent: 4.6, evil: 'fire', region: 'garrison', members: ['sword', 'sword', 'sword', 'lance', 'lance'] },
    // GHOST MARSH (west bank, over the bridges): the drowned and the grieving
    { x: 85, z: 30, tent: 2.8, evil: 'graves', region: 'marsh', members: ['ghost', 'ghost', 'caster', 'ghoul'] },
    { x: 120, z: 95, tent: 1.6, evil: 'graves', region: 'marsh', members: ['ghost', 'ghost', 'ghost', 'caster'] },
    { x: 150, z: -40, tent: 3.9, evil: 'ritual', region: 'marsh', members: ['ghost', 'ghost', 'caster', 'caster'] },
    // JUNGLE CROSSROADS (middle): roaming mixed packs
    { x: -72, z: -28, tent: 1.0, evil: 'fire', region: 'cross', members: ['ghoul', 'ghoul', 'sword', 'caster'] },
    { x: -100, z: 40, tent: 3.0, evil: 'fire', region: 'cross', members: ['sword', 'lance', 'ghoul', 'archer'] },
  ] as Array<{ x: number; z: number; tent: number; evil: 'fire' | 'ritual' | 'cauldron' | 'totems' | 'cage' | 'graves'; region: 'goblin' | 'bone' | 'garrison' | 'marsh' | 'cross' | 'monastery' | 'village' | 'snare'; members: Array<'ghoul' | 'caster' | 'sword' | 'lance' | 'ghost' | 'archer' | 'monk'> }>,                                                     // test spot on the north path until his own area is built
  boss: at(775, 880), bossFacing: Math.atan2(wx(880) - wx(775), wz(642) - wz(880)),                   // looking at the court's north gate
};

/**
 * The temple grew 1.4x. Anchors written in world metres for the old layout go through this radial warp: inside 48 m it is the same
 * 1.4x scale as the temple; from there it eases back to no change at 140 m, so the far map (the lair, the edges) stays put.
 */
export function warpCh1(x: number, z: number): [number, number] {
  const r = Math.hypot(x, z), R1 = 48, R2 = 140, K = 1.4; if (r < 1e-6 || r >= R2) return [x, z];
  const g = r <= R1 ? r * K : r + (K - 1) * R1 * (R2 - r) / (R2 - R1); return [x * g / r, z * g / r];
}
const CAMP0 = CH1.camps.map((c) => [c.x, c.z] as [number, number]);                 // camp centres before the warp
/** Warp for trail points: within 12 m of a camp a point moves with the camp (so trails still end at the clearing's edge). */
const W2 = (x: number, z: number): [number, number] => {
  for (const [cx, cz] of CAMP0) if (Math.hypot(x - cx, z - cz) < 12) { const [wx2, wz2] = warpCh1(cx, cz); return growCh1(wx2 + x - cx, wz2 + z - cz); }
  return growCh1(...warpCh1(x, z));
};
for (const o of [CH1.necro, CH1.undeadKing, CH1.orders, CH1.mahnin, ...CH1.regions, ...CH1.camps]) { const [x, z] = warpCh1(o.x, o.z); o.x = x; o.z = z; }
CH1.undeadKing.x += TX;                                                                     // in the temple, which moved west onto its hill
CH1.mahnin.x = 5; CH1.mahnin.z = 6;                                                          // Ma Hnin keeps her altar in the old village (the hub)
CH1.camps[9].x = 6; CH1.camps[9].z = -60;                                                    // the Ghost Marsh: south of the village, round the river's bend
CH1.camps[11].x = 62; CH1.camps[11].z = -46;                                                 // a ghost camp across the river below the temple hill
CH1.camps[2].evil = 'cage';                                                                  // more captives to free (they go home to the village)
{ const t = CH1.regions.find((g) => g.name === 'RUINED TEMPLE')!; t.x = TX; t.z = -36; const m = CH1.regions.find((g) => g.name === 'GHOST MARSH')!; m.x = 40; m.z = -62; }
CH1.regions.push({ name: 'THE OLD VILLAGE', x: 0, z: -14 });

// ------------------------------------------------------------------ terrain: hills (camps on top) and trenches (bridged)
/**
 * Hills: a flat top (noisy rim) with steep rock sides, one or two 1:4 ramps up the trails, and a half-height rock shelf at the back
 * (a double jump up, another to the top). Trenches: vertical-walled ditches, shallow ramps at both ends, bridges where trails cross.
 * Steep edges become ledge cells (see markLedges): the hero can only climb what he can jump onto; minions keep to the ramps.
 */
export interface Hill { x: number; z: number; H: number; R: number; L: number; ramps: number[]; lines: Array<{ pts: Array<[number, number]>; seg: number[]; edge: number }>; back: number; seed: number; name: string; chest?: boolean }
export interface Trench { pts: Array<[number, number]>; w: number; d: number; kind: 'logs' | 'rock'; name: string; len: number; seg: number[] }
// ---- the south-west fields (docs/ch1-fill-plan.png): the Sunken Monastery, the Empty Village, the Snare Fields
export const SITES = { monastery: { x: 118, z: -112, r: 40 }, village: { x: 0, z: 0, r: 40 }, snare: { x: 22, z: -136, r: 22 } };
CH1.camps.push(
  { x: 140, z: -112, tent: 4.4, evil: 'ritual', region: 'monastery', members: ['monk', 'monk', 'ghost', 'caster'] },      // drowned monks
  { x: 92, z: -138, tent: 0.9, evil: 'graves', region: 'monastery', members: ['ghost', 'monk', 'monk', 'caster'] },
  { x: 70, z: -104, tent: 2.2, evil: 'cage', region: 'village', members: ['archer', 'archer', 'ghoul', 'ghoul'] },         // the goblins who emptied the village
  { x: 36, z: -146, tent: 5.2, evil: 'cage', region: 'snare', members: ['archer', 'archer', 'archer', 'ghoul'] },        // the trap-setters (and their prisoner)
  { x: -136, z: -64, tent: 1.2, evil: 'graves', region: 'marsh', members: ['ghost', 'ghost', 'caster', 'ghost'] },        // 18: the Weeping Pool, the Weeping Maid's (Act V)
);
CH1.regions.push({ name: 'WEEPING POOL', x: -140, z: -88 });
CH1.regions.push({ name: 'SNARE FIELDS', x: 22, z: -118 });

// ------------------------------------------------------------------ the 1.4 × 1.4 expansion (the owner's plan, 16 Nov 2026)
/**
 * The valley grew to 1.4x its width and length (almost twice the area). Nothing is scaled: the old village (the hub) stays as it is,
 * and the land eases outward from 45 m, reaching 1.4x at 175 m and beyond. Places move whole: each camp, the monastery, the snare
 * fields, the Weeping Pool and the lair shift by their anchor's move, so nothing inside them stretches; the temple hill moves with TX.
 * `growCh1` maps a position written for the old valley to the new one (test hook `__zg.ch1.G`).
 */
const XK = 1.4, XR0 = 45, XR1 = 175;
function growPt(x: number, z: number): [number, number] {
  const r = Math.hypot(x, z); if (r <= XR0) return [x, z];
  const s = Math.min(1, (r - XR0) / (XR1 - XR0)), f = 1 + (XK - 1) * s * s * (3 - 2 * s); return [x * f, z * f];
}
const RIGID: Array<{ x: number; z: number; r: number; dx: number; dz: number }> = [];
export function growCh1(x: number, z: number): [number, number] {
  for (const g of RIGID) if (Math.hypot(x - g.x, z - g.z) < g.r) return [x + g.dx, z + g.dz];
  return growPt(x, z);
}
{
  const rigid = (x: number, z: number, r: number) => { const [a, b] = growCh1(x, z); RIGID.push({ x, z, r, dx: a - x, dz: b - z }); };
  rigid(SITES.monastery.x, SITES.monastery.z, SITES.monastery.r); rigid(SITES.snare.x, SITES.snare.z, SITES.snare.r + 6);
  rigid(-138, -71, 18);                                                                       // the Weeping Pool and the Maid's camp beside it
  rigid(CH1.lair.x, CH1.lair.z, 40);                                                          // the lair, its barrier, its gate and its treasure
  for (const c of CH1.camps) rigid(c.x, c.z, 12);                                             // camps inside a site move with the site
  const grow = (o: { x: number; z: number }) => { const [x, z] = growCh1(o.x, o.z); o.x = x; o.z = z; };
  for (const c of CH1.camps) grow(c);
  for (const o of [CH1.necro, CH1.abbot, CH1.orders, CH1.lair, CH1.hydra, CH1.gate, CH1.treasure]) grow(o);
  for (const g of CH1.regions) if (g.name !== 'RUINED TEMPLE') grow(g);
  grow(SITES.monastery); grow(SITES.snare);
}
const growAll = (P: Array<[number, number]>): Array<[number, number]> => P.map(([x, z]) => growCh1(x, z));
/** Flooded courts of the monastery: shallow water you wade through (slower), sloping in from the edges. */
export const POOLS = [{ x: -141, z: -79, r: 7.5, d: 0.6 }, { x: 118, z: -117, r: 10, d: 0.75 }, { x: 99, z: -99, r: 6, d: 0.6 }, { x: 135, z: -96, r: 7, d: 0.6 }, { x: 104, z: -129, r: 6.5, d: 0.6 }, { x: 137, z: -131, r: 5.5, d: 0.6 }]
  .map((p) => { const [x, z] = growCh1(p.x, p.z); return { ...p, x, z, drain: 0 }; });   // drain: how far the sluices have let it out (0..1)
export function inWaterCh1(x: number, z: number): boolean { return POOLS.some((p) => Math.hypot(x - p.x, z - p.z) < (p.r - 1.0) * (1 - 0.85 * p.drain)) || (streamsCut && ((s) => s.d < 0.2 && s.dep > 0.6)(streamAt(x, z))); }
/** Streams: shallow channels that run from the Naga's lair (just inside its barrier) to the river, one by way of the Weeping Pool.
 *  He wades through them (slower); where a trail crosses there is a ford (paved, ankle deep, stepping stones) at full speed. The Naga
 *  swims them. Cut into the ground after the world is placed (`streamsCut`), so the layout of everything else never moves. */
export const STREAMS: Array<{ name: string; hw: number; pts: Array<[number, number]> }> = [
  { name: 'north', hw: 1.25, pts: [[-157, 19], [-150, 30], [-136, 45], [-118, 56], [-97, 62], [-77, 63], [-64, 47], [-43, 36], [-21, 43], [0, 49], [20, 53], [34, 62], [43, 72]] },
  { name: 'pool', hw: 1.05, pts: [[-174, -26], [-176, -44], [-172, -60], [-164, -71], [-153, -76], [-146, -77]] },
  { name: 'south', hw: 1.25, pts: [[-135, -79], [-124, -78], [-105, -75], [-85, -71], [-65, -73], [-45, -80], [-25, -86], [-3, -82], [16, -70], [28, -56], [41, -46]] },
];
export const STREAM_Y = GY - 0.06;
/** Every water the Naga can swim (the river and the streams), filled in when the world is built. */
export const WATERWAYS: Array<{ name: string; curve: THREE.Curve<THREE.Vector3>; y: number; hw: number }> = [];                                    // the stream's surface
const STREAM_DIP = 0.42;                                              // its bed, below the jungle floor (fords: a quarter of it)
export let streamsCut = false;
/** Footprints of the grown valley's places (src/ch1places.ts): filled at the end of the build, so the trees, logs and bamboo that load
 *  afterwards keep out of them (nothing placed during the build reads it: the world's layout never moves). */
export const PLACE_CLEAR: Array<{ x: number; z: number; r: number }> = [];
type SPt = { x: number; z: number; hw: number; si: number; u: number; dep: number };
for (const s of STREAMS) s.pts = growAll(s.pts);
export const streamCurves = STREAMS.map((s) => new THREE.CatmullRomCurve3(s.pts.map(([x, z]) => new THREE.Vector3(x, STREAM_Y, z)), false, 'catmullrom', 0.5));
const SPTS: SPt[] = []; const SHASH = new Map<number, SPt[]>(); const skey = (i: number, j: number) => (i + 500) * 1000 + (j + 500);
streamCurves.forEach((cv, si) => {
  const L = cv.getLength(), n = Math.ceil(L / 0.5);
  for (let i = 0; i <= n; i++) {
    const p = cv.getPointAt(i / n), u = (i / n) * L, end = Math.min(1, u / 4, (L - u) / 4);
    const q: SPt = { x: p.x, z: p.z, hw: STREAMS[si].hw * (1 + 0.18 * Math.sin(u * 0.13 + si * 2) + 0.1 * Math.sin(u * 0.41 + si)) * (0.6 + 0.4 * end), si, u, dep: 1 };
    SPTS.push(q); const k = skey(Math.floor(p.x / 4), Math.floor(p.z / 4)); (SHASH.get(k) ?? SHASH.set(k, []).get(k)!).push(q);
  }
});
/** The nearest stream to (x, z): d = distance past its waterline (negative in the water), dep = how deep its bed is there (0..1; fords ~0.25). */
export function streamAt(x: number, z: number): { d: number; dep: number; p: SPt | null } {
  const i0 = Math.floor(x / 4), j0 = Math.floor(z / 4); let best = 99, bp: SPt | null = null;
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const l = SHASH.get(skey(i0 + a, j0 + b)); if (l) for (const p of l) { const d = Math.hypot(p.x - x, p.z - z) - p.hw; if (d < best) { best = d; bp = p; } } }
  return { d: best, dep: bp ? bp.dep : 1, p: bp };
}
/** Is any stream's water within d of (x, z)? (a wider search than streamAt, for placing things) */
export function streamWithin(x: number, z: number, d: number): boolean {
  const i0 = Math.floor(x / 4), j0 = Math.floor(z / 4), r = Math.ceil((d + 3) / 4);
  for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) { const l = SHASH.get(skey(i0 + a, j0 + b)); if (l) for (const p of l) if (Math.hypot(p.x - x, p.z - z) - p.hw < d) return true; }
  return false;
}
/** How far the ground sinks at (x, z) for the streams (0 until they are cut). */
function streamSink(x: number, z: number): number {
  if (!streamsCut) return 0; const s = streamAt(x, z); if (s.d > 1.4) return 0;
  const k = Math.min(1, (1.4 - s.d) / 2.0); return STREAM_DIP * s.dep * k * k * (3 - 2 * k);
}
/** Mark the fords (trail crossings: a shallow paved bed) once the trails are known, then cut the streams into the ground. */
function cutStreams(nearPath: (x: number, z: number, d: number) => boolean): Array<{ x: number; z: number; si: number; u: number }> {
  const fords: Array<{ x: number; z: number; si: number; u: number }> = [];
  const hits: Array<{ si: number; u0: number; u1: number }> = [];                         // runs of the stream where a trail is on it; the ford is the middle of each
  for (const p of SPTS) if (nearPath(p.x, p.z, 1.2)) { const h = hits.find((q) => q.si === p.si && p.u - q.u1 < 3); if (h) h.u1 = p.u; else hits.push({ si: p.si, u0: p.u, u1: p.u }); }
  for (const h of hits) { const u = (h.u0 + h.u1) / 2, p = SPTS.filter((q) => q.si === h.si).reduce((a, b) => (Math.abs(b.u - u) < Math.abs(a.u - u) ? b : a)); fords.push({ x: p.x, z: p.z, si: h.si, u: p.u }); }
  for (const p of SPTS) { let m = 99; for (const f of fords) if (f.si === p.si) m = Math.min(m, Math.abs(f.u - p.u)); p.dep = m < 2.5 ? 0.22 : m < 5.5 ? 0.22 + 0.78 * (m - 2.5) / 3 : 1; }
  streamsCut = true; return fords;
}
/** Goblin traps in the Snare Fields: spike pits hurt, snares hold you for a moment. Jump over them. */
export const TRAPS: Array<{ x: number; z: number; r: number; kind: 'spike' | 'snare'; cd: number }> = [
  ...growAll([[20, -138], [27, -133], [13, -141], [22, -147], [31, -137], [9, -133], [17, -152], [28, -153]]).map(([x, z]) => ({ x, z, r: 0.85, kind: 'spike' as const, cd: 0 })),
  ...growAll([[24, -128], [12, -147], [33, -130], [16, -135], [26, -142], [6, -140]]).map(([x, z]) => ({ x, z, r: 0.6, kind: 'snare' as const, cd: 0 })),
];
/** Chests that open (souls), and the six Lost Fragments of the childhood memory. y = the height they sit at (null: on the ground). */
export const LOOT: Array<{ x: number; z: number; y: number | null; souls: number; name: string; opened: boolean; glow?: THREE.Object3D }> = [];
export const FRAGMENTS: Array<{ x: number; z: number; y: number | null; text: string; taken: boolean; obj?: THREE.Object3D }> = [];
const angTo = (x: number, z: number, p: [number, number]) => Math.atan2(p[1] - z, p[0] - x);
/** A hill; each ramp follows a trail (a polyline from the camp outward, old-layout metres), so the path climbs it wherever it bends or branches. */
function makeHill(x: number, z: number, H: number, R: number, trails: Array<Array<[number, number]>>, name: string, chest = false): Hill {
  const h: Hill = { x, z, H, R, L: 4 * H, ramps: [], lines: [], back: 0, seed: x * 0.13 + z * 0.07, name, chest };
  for (const t0 of trails) {
    const pts: Array<[number, number]> = [[x, z], ...t0.map(([a, b]) => W2(a, b))]; const seg = [0];
    for (let k = 1; k < pts.length; k++) seg.push(seg[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
    let edge = 0; for (let sd = 0; sd < seg[seg.length - 1]; sd += 0.25) { const [px, pz] = polyAt(pts, seg, sd); if (Math.hypot(px - x, pz - z) > hillRadius(h, Math.atan2(pz - z, px - x))) { edge = sd; break; } }
    h.lines.push({ pts, seg, edge }); h.ramps.push(angTo(x, z, pts[1]));
  }
  const mx = h.ramps.reduce((a, r) => a + Math.cos(r), 0), mz = h.ramps.reduce((a, r) => a + Math.sin(r), 0); h.back = Math.atan2(-mz, -mx);
  return h;
}
function polyAt(pts: Array<[number, number]>, seg: number[], sd: number): [number, number] {
  for (let k = 1; k < pts.length; k++) if (sd <= seg[k] || k === pts.length - 1) { const u = Math.min(1, (sd - seg[k - 1]) / Math.max(1e-6, seg[k] - seg[k - 1])); return [pts[k - 1][0] + (pts[k][0] - pts[k - 1][0]) * u, pts[k - 1][1] + (pts[k][1] - pts[k - 1][1]) * u]; }
  return pts[pts.length - 1];
}
function polyNear(pts: Array<[number, number]>, seg: number[], x: number, z: number): { d: number; s: number } {
  let best = { d: 1e9, s: 0 };
  for (let k = 1; k < pts.length; k++) {
    const [ax, az] = pts[k - 1], [bx, bz] = pts[k]; const ex = bx - ax, ez = bz - az, L2 = ex * ex + ez * ez || 1e-6;
    const u = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / L2)); const d = Math.hypot(x - ax - ex * u, z - az - ez * u);
    if (d < best.d) best = { d, s: seg[k - 1] + u * Math.sqrt(L2) };
  }
  return best;
}
const camp = (i: number): [number, number] => [CH1.camps[i].x, CH1.camps[i].z];
export const HILLS: Hill[] = [
  makeHill(...camp(0), 4.0, 12.5, [[[-53.6, -91], [-38, -88], [-19, -80]], [[-60, -98.5], [-85, -112], [-103.8, -117.8]]], 'Goblin Lookout'),
  makeHill(...camp(2), 3.0, 12.5, [[[-153.5, -110.5], [-138, -112], [-116.3, -118]], [[-160, -103.5], [-162, -60]]], "Hunters' Ridge"),
  makeHill(...camp(8), 4.2, 13.5, [[[-120, 140], [-108, 128], [-92.5, 102.5]]], 'Garrison Hill'),
  makeHill(...camp(4), 3.0, 12.5, [[[15.6, 115.8], [18, 113], [24, 100], [17, 76]], [[15.6, 115.8], [18, 113], [24, 100], [33, 98]]], 'Barrow Mound'),
  makeHill(...W2(-92, -50), 3.5, 8.5, [[[-92, -20]]], 'Crossroads Knoll', true),
];
function makeTrench(pts: Array<[number, number]>, w: number, d: number, kind: 'logs' | 'rock', name: string): Trench {
  const seg: number[] = [0]; for (let k = 1; k < pts.length; k++) seg.push(seg[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
  return { pts, w, d, kind, name, len: seg[seg.length - 1], seg };
}
export const TRENCHES: Trench[] = [
  makeTrench(growAll([[-62, 157], [-64, 120], [-68, 82], [-100, 76], [-150, 78], [-196, 74]]), 7, 3, 'logs', 'Garrison Trench'),
  makeTrench(growAll([[-124, 34], [-129, 12], [-130, -12], [-127, -36], [-134, -58]]), 8, 4, 'rock', "Naga's Scar"),
];
/** Distance from a point to a trench's centre line, and how far along it the nearest point is. */
function trenchNear(t: Trench, x: number, z: number): { d: number; s: number; tx: number; tz: number } {
  let best = { d: 1e9, s: 0, tx: 1, tz: 0 };
  for (let k = 1; k < t.pts.length; k++) {
    const [ax, az] = t.pts[k - 1], [bx, bz] = t.pts[k]; const ex = bx - ax, ez = bz - az, L2 = ex * ex + ez * ez;
    const u = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / L2)); const px = ax + ex * u, pz = az + ez * u, d = Math.hypot(x - px, z - pz);
    if (d < best.d) { const L = Math.sqrt(L2); best = { d, s: t.seg[k - 1] + u * L, tx: ex / L, tz: ez / L }; }
  }
  return best;
}
const TRENCH_RAMP = 12;
function hillRadius(h: Hill, a: number): number { return h.R * (1 + 0.05 * Math.sin(3 * a + h.seed) + 0.03 * Math.sin(5 * a + 2 * h.seed)); }
function hillHeight(h: Hill, x: number, z: number): number {
  const dx = x - h.x, dz = z - h.z; if (Math.abs(dx) > h.R * 1.1 + h.L + 6 || Math.abs(dz) > h.R * 1.1 + h.L + 6) return 0;
  const r = Math.hypot(dx, dz), a = Math.atan2(dz, dx), R = hillRadius(h, a); if (r <= R) return h.H;
  let hh = 0;
  for (const ln of h.lines) {
    const n = polyNear(ln.pts, ln.seg, x, z); if (n.d > 3.9) continue;
    const t = (n.s - (ln.edge + 0.5)) / h.L, side = n.d < 3.0 ? 1 : 1 - (n.d - 3.0) / 0.9;   // level to just past the rough rim (no step up onto the top), then down at 1:4   // 6 m of flat ramp (the grown trails bend a little off its line)                 // sides slope off over 0.9 m: walkable where the ramp is low
    if (t < 1) hh = Math.max(hh, h.H * Math.min(1, 1 - t) * side);
  }
  const off = Math.abs(Math.atan2(Math.sin(a - h.back), Math.cos(a - h.back)));
  if (off < 0.8 && r < R + 3.5) hh = Math.max(hh, h.H * 0.5);
  return hh;
}
/** The temple hill: a flat plateau round the temple (rounded rectangle, rough rim), cliffs all round, and the Grand Stair: a 30 m ramp
 *  of steps running east (toward the village) from the plateau's east edge. */
export const PLATEAU = { x: TX, z: 0, hx: 56, hz: 52, rr: 14 };
export const STAIR = { z0: -21, z1: -9, xTop: TX - 50, xBot: TX - 80 };
function plateauOut(x: number, z: number): number {                                    // signed distance outside the plateau rim (m)
  const dx = Math.abs(x - PLATEAU.x) - (PLATEAU.hx - PLATEAU.rr), dz = Math.abs(z - PLATEAU.z) - (PLATEAU.hz - PLATEAU.rr);
  const xr = x - TX + 135;                                                               // the hill keeps its shape wherever the temple stands (it moved out when the valley grew)
  const rim = Math.sin(xr * 0.31) * 0.9 + Math.sin(z * 0.27 + 1.3) * 0.8 + Math.sin((xr + z) * 0.11) * 1.2;   // a rough, natural edge
  return Math.hypot(Math.max(dx, 0), Math.max(dz, 0)) + Math.min(Math.max(dx, dz), 0) - PLATEAU.rr + rim;
}
export function plateauH(x: number, z: number): number {
  const o = plateauOut(x, z); let h = o <= 0 ? TYH : o < 1.4 ? TYH * (1 - o / 1.4) : 0;
  if (z > STAIR.z0 && z < STAIR.z1 && x > STAIR.xBot && x < STAIR.xTop) h = TYH * Math.max(0, (x - STAIR.xBot) / (STAIR.xTop - STAIR.xBot));   // cut into the rim: the ramp alone, no step where it meets the hill
  return h;
}
/** Jungle ground height: flat, raised by hills and the temple's plateau, cut by trenches. */
export function terrainH(x: number, z: number): number {
  const onHill = (Math.abs(x - PLATEAU.x) < PLATEAU.hx + 6 && Math.abs(z - PLATEAU.z) < PLATEAU.hz + 6) || (z > STAIR.z0 && z < STAIR.z1 && x > STAIR.xBot && x < STAIR.xTop + 2);   // the Grand Stair runs 30 m out past the hill
  let h = GY + (onHill ? plateauH(x, z) : 0);
  for (const hl of HILLS) { const v = hillHeight(hl, x, z); if (v > 0) h = Math.max(h, GY + v); }
  for (const p of POOLS) { const d = Math.hypot(x - p.x, z - p.z); if (d < p.r) { const k = Math.min(1, (p.r - d) / 2.5); h = Math.min(h, GY - p.d * k * k * (3 - 2 * k)); } }
  for (const t of TRENCHES) {
    const n = trenchNear(t, x, z); if (n.d >= t.w / 2) continue;
    const k = Math.min(1, Math.min(n.s, t.len - n.s) / TRENCH_RAMP); h = Math.min(h, GY - t.d * k);
  }
  if (streamsCut) h -= streamSink(x, z);
  return h;
}
/** Somewhere props should not stand: a trench, a hill's rock sides, its ramps or its shelf (the flat top is fine). */
/** The foot of the hill's north cliff at x (where the rough rim ends and the jungle floor begins). */
export function rimNorthZ(x: number): number { let z = PLATEAU.z + 30; while (z < PLATEAU.z + 90 && plateauOut(x, z) < 1.5) z += 0.1; return z; }
/** The Night Path: narrow steps cut along the north cliff, the princess's secret way up to the temple (she climbed it by night; her
 *  maid followed her this way). From the thorns at its foot (east end) to the hilltop (west end); filled in when the world is built. */
export const NIGHT_PATH = { x0: TX + 36, steps: [] as Array<{ x: number; z: number; top: number }> };
/** Soul Shrines: touch one to wake it; it heals while you stand by it, and any two awake shrines are a path for the soul butterflies (fast travel). */
export const SHRINES: Array<{ id: string; name: string; x: number; z: number; awake: boolean; obj?: THREE.Object3D }> = [
  { id: 'hill', name: 'Temple Hill', x: TX - 47, z: -33, awake: false }, { id: 'village', name: 'The Old Village', x: 9, z: -8, awake: false },
  { id: 'marsh', name: 'Ghost Marsh', x: 36, z: -62, awake: false }, { id: 'bone', name: 'Bone Wastes', x: -30, z: 50, awake: false },
  { id: 'cross', name: 'Jungle Crossroads', x: -56, z: -40, awake: false }];
/** Carved stones that tell what the land forgot (read by walking up to them). No witch appears; the saint's name is always scraped away. */
export const STELES: Array<{ x: number; z: number; title: string; text: string; read: boolean }> = [
  { x: -3, z: -6, title: 'The Old Village', text: 'We kept the hill temple\'s lamps lit, as our mothers did. Then one spring no one could say whose temple it was, and the lamps went out. The fields died, the river rose, and the goblins came for the rest.', read: false },
  { x: TX - 49, z: -26, title: 'The Grand Stair', text: 'Pilgrims climbed these steps on their knees, carrying the sick to the saint on the hill. The saint\'s name has been chiselled off every step.', read: false },
  { x: 27, z: -21, title: 'The Temple Bridge', text: 'Built by the village so the sick could be carried up to the hill in any flood.', read: false },
  { x: -22, z: 62, title: 'Graves of the Brothers', text: 'Brothers of the hill temple, who kept its records at the river monastery. They tended it until the last of them forgot what they were tending. When they left it, U Lar Ba\'s followers moved in.', read: false },
  { x: 14, z: -44, title: 'The Low Fields', text: 'The river took the low fields the year the temple fell silent. The Nine Saints called it a cleansing.', read: false },
  { x: TX + 6, z: rimNorthZ(TX + 6) - 5, title: 'The Night Path', text: 'Steps cut narrow enough for one slight climber, worn smooth by many nights and never by day. A thread of red silk is still caught on the thorns below.', read: false },
];
for (const o of [...SHRINES.filter((q) => q.id !== 'hill'), ...STELES.filter((q) => q.x < TX - 70)]) { const [x, z] = growCh1(o.x, o.z); o.x = x; o.z = z; }   // written for the old valley
/** Thorn walls that only fire clears (any fire spell exploding beside them). */
export const BRAMBLES: Array<{ x: number; z: number; r: number; name: string; burnt: boolean; cells: Array<[number, number, number]>; objs: THREE.Object3D[] }> = [
  { x: TX + 34.8, z: rimNorthZ(TX + 35) + 0.9, r: 3.0, name: 'the Night Path', burnt: false, cells: [], objs: [] },
  { x: TX + 42, z: 120, r: 2.4, name: 'the old herb chest', burnt: false, cells: [], objs: [] },
];
/** The Alchemist's Garden (north-west, under the temple hill): his own herbs, grown wild for 500 years, and his old crucible. */
export const GARDEN = { x: TX + 36, z: 112, r: 3.2 };
/** Where freed captives stand once they come home to the village. */
export const VILLAGE_SPOTS: Array<[number, number]> = [[-4, 11], [11, 2], [-13, 1], [5, -16], [-14, -7]];
/** The old village's lanes (x, z). A crossroads village: its lanes join the trails that end round it (the Temple Bridge, the marsh road,
 *  the crossroads and hunting-ground trails, the two north trails), plus a lane down to the washing place and one out to the fields. */
export const VILLAGE_LANES: Array<Array<[number, number]>> = [
  [[13, -9], [8, -12], [0, -11.5], [-8, -12.5], [-16, -16], [-24, -21], [-33, -27]],     // the main road: the Temple Bridge to the crossroads trail
  [[8, -12], [9, -18], [10, -24]],                                                         // down to the marsh road
  [[-16, -16], [-18, -26], [-19, -37]],                                                    // to the hunting-grounds trail
  [[0, -7.5], [0, -11.5]],                                                                 // the plaza to the road
  [[-1, 7.5], [2, 16], [10, 25], [19, 31], [26, 38]],                                      // north, to the bone wastes
  [[2, 16], [-6, 25], [-13, 33], [-17, 41]],                                               // north, to the barrow trail
  [[7.5, 0.5], [16, 2], [24, 3], [30, 4]],                                                 // to the washing place on the river
  [[-7.5, 0], [-16, 2], [-26, 6], [-33, 9]],                                               // out to the fields
];
/** Spots kept clear of trees and props (shrines, inscriptions, brambles, the garden, the hill's back path). */
const CLEAR: Array<{ x: number; z: number; r: number }> = [...Array.from({ length: 11 }, (_, i) => ({ x: NIGHT_PATH.x0 + 5 - i * 3.2, z: rimNorthZ(NIGHT_PATH.x0 + 5 - i * 3.2) + 2.5, r: 4.5 })),   // the Night Path stays open
  ...SHRINES.map((q) => ({ x: q.x, z: q.z, r: 2.2 })), ...STELES.map((q) => ({ x: q.x, z: q.z, r: 1.6 })),
  ...BRAMBLES.map((q) => ({ x: q.x, z: q.z, r: q.r + 1.5 })), { x: GARDEN.x, z: GARDEN.z, r: 11 }, { x: TX + 20, z: 58, r: 7 }];
/** Fire reached (x, z): any bramble within reach burns away (its ground is free again). Returns the ones that burnt. */
export function burnBrambles(x: number, z: number, reach: number): Array<{ x: number; z: number; name: string }> {
  const out: Array<{ x: number; z: number; name: string }> = [];
  for (const b of BRAMBLES) {
    if (b.burnt || Math.hypot(x - b.x, z - b.z) > b.r + reach) continue;
    b.burnt = true; for (const [k, g, t] of b.cells) { grid[k] = g; topY[k] = t; } for (const o of b.objs) o.visible = false; out.push({ x: b.x, z: b.z, name: b.name });
  }
  return out;
}
function terrainBusy(x: number, z: number, pad = 1): boolean {
  for (const c of CLEAR) if (Math.hypot(x - c.x, z - c.z) < c.r + pad) return true;
  { const o = plateauOut(x, z); if (o > -2.5 - pad && o < 3 + pad) return true; }                                   // the hill's cliffs
  if (z > STAIR.z0 - 2 - pad && z < STAIR.z1 + 2 + pad && x > STAIR.xBot - 2 && x < STAIR.xTop + 3) return true;    // the Grand Stair
  for (const s of Object.values(SITES)) if (Math.hypot(x - s.x, z - s.z) < s.r + pad) return true;                // the south-west places keep their ground clear
  for (const t of TRENCHES) if (trenchNear(t, x, z).d < t.w / 2 + pad) return true;
  for (const h of HILLS) {
    const dx = x - h.x, dz = z - h.z, r = Math.hypot(dx, dz); if (r > h.R * 1.1 + h.L + pad + 3) continue;
    const R = hillRadius(h, Math.atan2(dz, dx)); if (r > R * 0.85 - pad && r < R + 3.5 + pad) return true;
    for (const ln of h.lines) { const n = polyNear(ln.pts, ln.seg, x, z); if (n.d < 3.9 + pad && n.s < ln.edge + h.L + pad) return true; }
  }
  return false;
}

let trailFn: (x: number, z: number, d: number) => boolean = () => false;
let wasteFn: (x: number, z: number, pad?: number) => boolean = () => false;
/** Where grass may grow (1) or not (0): open jungle ground only, off the trails, the wasteland, the pools, camp clearings and the lair. */
export function grassAt(x: number, z: number): number {
  if (cell(ci(x), cj(z)) !== 4) return 0;
  if (Math.hypot(x - SITES.village.x, z - SITES.village.z) < 8.5) return 0;
  if (z > STAIR.z0 - 1 && z < STAIR.z1 + 1 && x > STAIR.xBot - 1 && x < STAIR.xTop + 2) return 0;
  { const o = plateauOut(x, z); if (o > -1 && o < 2) return 0; }
  if (trailFn(x, z, 1.5) || wasteFn(x, z, 1)) return 0;
  if (streamAt(x, z).d < 0.9) return 0;
  for (const p of POOLS) if (Math.hypot(x - p.x, z - p.z) < p.r + 0.3) return 0;
  for (const c of CH1.camps) if (Math.hypot(x - c.x, z - c.z) < 6.5) return 0;
  if (Math.hypot(x - CH1.lair.x, z - CH1.lair.z) < CH1.lair.r + 6) return 0;
  return 1;
}

/** The minimap: one pixel per grid cell (north up, east right), drawn once the map and its trees are in. */
export const ch1Map = { canvas: null as HTMLCanvasElement | null, toPx: (x: number, z: number): [number, number] => [0, 0], paths: [] as Array<{ x: number; z: number }> };
/** Flood fill from a point over every spot the hero's body fits (test hook): returns a lookup "can he get to (x, z)?". */
export function ch1Reach(x0: number, z0: number): (x: number, z: number, near?: number) => boolean {
  const fits = (i: number, j: number) => { const x = B.x0 + (i + 0.5) * CELL, z = B.z0 + (j + 0.5) * CELL; return walkableCh1(x, z) && walkableCh1(x + 0.32, z) && walkableCh1(x - 0.32, z) && walkableCh1(x, z + 0.32) && walkableCh1(x, z - 0.32); };
  const seen = new Uint8Array(NX * NZ); const q: number[] = []; const i0 = ci(x0), j0 = cj(z0);
  if (i0 >= 0 && j0 >= 0 && i0 < NX && j0 < NZ) { seen[j0 * NX + i0] = 1; q.push(j0 * NX + i0); }
  while (q.length) { const c = q.pop()!, i = c % NX, j = (c - i) / NX; for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= NX || b >= NZ) continue; const k = b * NX + a; if (!seen[k] && fits(a, b)) { seen[k] = 1; q.push(k); } } }
  return (x, z, near = 0) => { const r = Math.ceil(near / CELL); for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) { const a = ci(x) + di, b = cj(z) + dj; if (a >= 0 && b >= 0 && a < NX && b < NZ && seen[b * NX + a]) return true; } return false; };
}

// ------------------------------------------------------------------ walkable grid
const CELL = 0.5;
const B0 = { x0: wx(1300) - 22, x1: wx(60) + 22, z0: wz(1080) - 18, z1: wz(60) + 18 };     // the temple and the jungle right around it
const B = { x0: -296.5, x1: 297.5, z0: -243.5, z1: 243.5 };                                   // the whole map: 1.4x the old valley each way (growCh1)
const EDGE = 12;                                                                             // outer band: fog wall, not walkable
const NX = Math.ceil((B.x1 - B.x0) / CELL), NZ = Math.ceil((B.z1 - B.z0) / CELL);
const grid = new Uint8Array(NX * NZ);                                 // 0 void/wall, 1 floor, 2 canal, 3 solid on floor, 4 jungle ground, 5 solid on ground, 6 river
const GROUND_Y = GY;                                                  // the jungle floor sits a step below the temple paving
const isTemple = (v: number) => v >= 1 && v <= 3;
/** Timber bridges over the river: grid value 7, deck height arches up 0.55 m in the middle. */
const BRIDGES: Array<{ ax: number; az: number; dx: number; dz: number; len: number; w: number; flat?: boolean; broken?: boolean }> = [];
function bridgeAt(x: number, z: number): { u: number; side: number; flat?: boolean } | null {
  for (const b of BRIDGES) { const rx = x - b.ax, rz = z - b.az, u = (rx * b.dx + rz * b.dz) / b.len, side = -rx * b.dz + rz * b.dx; if (u >= -0.02 && u <= 1.02 && Math.abs(side) <= b.w / 2 + 0.3) return { u: Math.min(1, Math.max(0, u)), side, flat: b.flat }; }
  return null;
}
const deckH = (u: number) => -0.3 + 0.14 + 0.55 * Math.sin(Math.PI * u);
const topY = new Float32Array(NX * NZ).fill(99);                     // top of whatever blocks a cell (absolute y); 99 = too tall to jump
const ci = (x: number) => Math.floor((x - B.x0) / CELL), cj = (z: number) => Math.floor((z - B.z0) / CELL);
const cell = (i: number, j: number) => (i < 0 || j < 0 || i >= NX || j >= NZ ? 0 : grid[j * NX + i]);
const rectWorld = (r: Rect) => ({ x0: Math.min(wx(r[0]), wx(r[2])), x1: Math.max(wx(r[0]), wx(r[2])), z0: Math.min(wz(r[1]), wz(r[3])), z1: Math.max(wz(r[1]), wz(r[3])) });
function paint(r: Rect, v: number): void {
  const w = rectWorld(r);
  for (let j = cj(w.z0 + 0.01); j <= cj(w.z1 - 0.01); j++) for (let i = ci(w.x0 + 0.01); i <= ci(w.x1 - 0.01); i++) if (i >= 0 && j >= 0 && i < NX && j < NZ) grid[j * NX + i] = v;
}
for (const r of WATER) paint(r, 2);
for (const f of FLOORS) paint(f.r, 1);

/** Mark the floor under a prop as solid (grid value 3), so nobody walks through it. */
function solid(x: number, z: number, r: number, h = 99): void {
  for (let j = cj(z - r); j <= cj(z + r); j++) for (let i = ci(x - r); i <= ci(x + r); i++) {
    const cx = B.x0 + (i + 0.5) * CELL, cz = B.z0 + (j + 0.5) * CELL;
    if ((cx - x) ** 2 + (cz - z) ** 2 <= (r + CELL * 0.35) ** 2 && i >= 0 && j >= 0 && i < NX && j < NZ) {
      const c = j * NX + i, top = h >= 99 ? 99 : heightCh1(cx, cz) + h;
      if (grid[c] === 1 || grid[c] === 4) { grid[c] = grid[c] === 1 ? 3 : 5; topY[c] = top; } else if (grid[c] === 3 || grid[c] === 5) topY[c] = Math.max(topY[c], top);
    }
  }
}
function solidBox(x: number, z: number, w: number, d: number): void { for (let a = -w / 2; a <= w / 2 + 0.01; a += 0.4) for (let b = -d / 2; b <= d / 2 + 0.01; b += 0.4) solid(x + a, z + b, 0.2); }
function solidLine(x0: number, z0: number, x1: number, z1: number, r: number, h = 99): void { const n = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 0.3); for (let k = 0; k <= n; k++) solid(x0 + (x1 - x0) * k / n, z0 + (z1 - z0) * k / n, r, h); }

/** Floor height under a point (stairs ramp smoothly; anything off the temple is ground level 0). */
export function heightCh1(x: number, z: number): number {
  const px = 690 - (x - TX) / PX, py = 570 - z / PX; let flat: number | null = null;
  for (const f of FLOORS) {
    const [x0, y0, x1, y1] = f.r; if (px < x0 || px > x1 || py < y0 || py > y1) continue;
    if (f.stairs) { const t = f.stairs === 'ns' ? (py - y0) / (y1 - y0) : (px - x0) / (x1 - x0); return TYH + f.h + ((f.h1 ?? f.h) - f.h) * Math.min(1, Math.max(0, t)); }
    if (flat === null) flat = TYH + f.h;
  }
  if (flat === null && cell(ci(x), cj(z)) === 7) { const b = bridgeAt(x, z); return b ? (b.flat ? GY + 0.12 : deckH(b.u)) : terrainH(x, z); }
  if (flat === null && cell(ci(x), cj(z)) >= 4) return terrainH(x, z);
  return flat ?? TYH;
}
/** Highest floor within ~1.5 m (for props standing against a wall, which sit just off the floor grid). */
function heightNear(x: number, z: number): number { let h = heightCh1(x, z); for (const [dx, dz] of [[1.5, 0], [-1.5, 0], [0, 1.5], [0, -1.5]]) h = Math.max(h, heightCh1(x + dx, z + dz)); return h; }

/** Can a body of radius ~0.35 m stand here? */
/** Airborne at height y: floor and ground as usual, plus anything blocking whose top is below y (crumbled walls, logs, rubble). */
export function walkAirCh1(x: number, z: number, y: number): boolean {
  if (inBarrier(x, z)) return false;
  const r = 0.34;
  const ok = (i: number, j: number) => { const v = cell(i, j); if (v === 1 || v === 4 || v === 7) return true; if (v === 2 || v === 6 || i < 0 || j < 0 || i >= NX || j >= NZ) return false; return topY[j * NX + i] < y - 0.05; };
  return ok(ci(x - r), cj(z - r)) && ok(ci(x + r), cj(z - r)) && ok(ci(x - r), cj(z + r)) && ok(ci(x + r), cj(z + r));
}
/** Standing height at (x, z) for feet at y: the floor, raised to the top of any obstacle under the body whose top he is above. */
export function topCh1(x: number, z: number, y: number): number {
  let best = heightCh1(x, z); const r = 0.34;
  for (const [dx, dz] of [[0, 0], [-r, -r], [r, -r], [-r, r], [r, r]]) {
    const i = ci(x + dx), j = cj(z + dz), v = cell(i, j); if (v !== 0 && v !== 3 && v !== 5) continue;
    const t = topY[j * NX + i]; if (t <= y + 0.05) best = Math.max(best, t);
  }
  return best;
}
/** The barrier round the Naga's lair: while it stands, a band at CH1.barrierR is impassable (both ways). */
export const lairSeal = { on: false };
const inBarrier = (x: number, z: number) => lairSeal.on && Math.abs(Math.hypot(x - CH1.lair.x, z - CH1.lair.z) - CH1.barrierR) < 0.9;
export function walkableCh1(x: number, z: number): boolean {
  if (inBarrier(x, z)) return false;
  const r = 0.34; const ok = (v: number) => v === 1 || v === 4 || v === 7;   // temple floor, open jungle ground, a bridge deck
  return ok(cell(ci(x - r), cj(z - r))) && ok(cell(ci(x + r), cj(z - r))) && ok(cell(ci(x - r), cj(z + r))) && ok(cell(ci(x + r), cj(z + r)));
}

// ------------------------------------------------------------------ the seal pillar
/**
 * The pillar the Nine sealed Zaw Gyi in (lore; intro panels 7-12): a square column of blue seal-crystal carved with wave swirls,
 * on a two-step stone dais. The princess's blood crack runs red down its back wall; its front has burst open where he stepped out.
 * Open side faces south (-z, toward the camera). Solid: the dais steps (0.3 m, 0.6 m) and the low front stub can be jumped onto;
 * the standing walls are too tall.
 */
function buildSealPillar(scene: THREE.Scene, x: number, z: number): void {
  const H = 4.2, W = 1.7, T = 0.3, D0 = 0.6;
  // wave-swirl carving: white on black, used as the glow map (blue) and, softened, as the colour
  const c = document.createElement('canvas'); c.width = 256; c.height = 512; const g = c.getContext('2d')!;
  g.fillStyle = '#000'; g.fillRect(0, 0, 256, 512); g.strokeStyle = '#fff'; g.lineCap = 'round';
  for (let row = 0; row < 7; row++) {
    const y0 = 40 + row * 70; g.lineWidth = 5; g.beginPath();
    for (let xx = 0; xx <= 256; xx += 4) { const yy = y0 + Math.sin((xx / 256) * Math.PI * 4 + row) * 14; if (xx === 0) g.moveTo(xx, yy); else g.lineTo(xx, yy); } g.stroke();
    g.lineWidth = 3;
    for (let k = 0; k < 4; k++) { const cx = 32 + k * 64 + (row % 2) * 32, cy = y0 + Math.sin(((cx / 256) * Math.PI * 4) + row) * 14 - 16; g.beginPath(); for (let a = 0; a < Math.PI * 3.2; a += 0.15) { const rr = 2 + a * 3.2; g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.8); } g.stroke(); }
  }
  g.lineWidth = 6; g.strokeRect(6, 6, 244, 500);
  const runes = new THREE.CanvasTexture(c); runes.colorSpace = THREE.SRGBColorSpace; runes.wrapS = runes.wrapT = THREE.RepeatWrapping;
  const crystal = new THREE.MeshStandardMaterial({ color: 0x1d4f8f, roughness: 0.2, metalness: 0.15, emissive: 0x58b4ff, emissiveMap: runes, emissiveIntensity: 2.2, transparent: true, opacity: 0.9, side: THREE.DoubleSide });
  const stone = new THREE.MeshStandardMaterial({ color: 0x5a5852, roughness: 0.95 });
  const trim = new THREE.MeshBasicMaterial({ color: 0x5ab8ff, toneMapped: false });
  const add = (m: THREE.Mesh, px: number, py: number, pz: number, rx = 0, ry = 0, rz = 0) => { m.position.set(x + px, py, z + pz); m.rotation.set(rx, ry, rz); m.castShadow = true; m.receiveShadow = true; scene.add(m); return m; };
  // dais: two stone steps, glowing rune trim on each edge
  for (const [s, y] of [[3.6, 0.15], [2.6, 0.45]] as const) {
    add(new THREE.Mesh(new THREE.BoxGeometry(s, 0.3, s), stone), 0, y, 0);
    for (const [px, pz, w, d] of [[0, -s / 2, s, 0.04], [0, s / 2, s, 0.04], [-s / 2, 0, 0.04, s], [s / 2, 0, 0.04, s]] as const) add(new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, d), trim), px, y + 0.13, pz).castShadow = false;
  }
  // a slab with a broken top: vertices on the top face dropped, more toward the open (south) side
  const slab = (w: number, h: number, d: number, drop: number, slope: number) => {
    const geo = new THREE.BoxGeometry(w, h, d, 6, 8, 6); const p = geo.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) if (p.getY(i) > h / 2 - 0.01) p.setY(i, p.getY(i) - Math.random() * drop - (0.5 - p.getZ(i) / d - 0.5) * 0 - Math.max(0, -p.getZ(i)) * slope);
    geo.computeVertexNormals(); return geo;
  };
  const back = add(new THREE.Mesh(slab(W, H, T, 0.5, 0), crystal), 0, D0 + H / 2, W / 2 - T / 2);
  (back.material as THREE.MeshStandardMaterial).emissiveMap!.repeat.set(1, 1);
  add(new THREE.Mesh(slab(T, H * 0.74, W - T, 0.4, 1.4), crystal), -(W / 2 - T / 2), D0 + (H * 0.74) / 2, -T / 2);
  add(new THREE.Mesh(slab(T, H * 0.56, W - T, 0.4, 1.2), crystal), W / 2 - T / 2, D0 + (H * 0.56) / 2, -T / 2);
  add(new THREE.Mesh(slab(W - 2 * T, 0.55, T, 0.35, 0), crystal), 0, D0 + 0.275, -(W / 2 - T / 2));                           // what is left of the front
  // her crack: a red glowing seam down the inside of the back wall
  { const cc = document.createElement('canvas'); cc.width = 64; cc.height = 512; const h = cc.getContext('2d')!; h.strokeStyle = '#ff3a22'; h.shadowColor = '#ff2010'; h.shadowBlur = 10; h.lineWidth = 5;
    h.beginPath(); let px = 34, py = 0; h.moveTo(px, py); while (py < 512) { px = Math.min(56, Math.max(8, px + (Math.random() - 0.5) * 22)); py += 16 + Math.random() * 20; h.lineTo(px, py); } h.stroke();
    const ct = new THREE.CanvasTexture(cc); ct.colorSpace = THREE.SRGBColorSpace;
    const seam = new THREE.Mesh(new THREE.PlaneGeometry(0.5, H * 0.95), new THREE.MeshBasicMaterial({ map: ct, transparent: true, alphaTest: 0.02, depthWrite: false, toneMapped: false, color: 0xff2a14 }));
    seam.position.set(x + 0.1, D0 + H * 0.48, z + W / 2 - T - 0.01); seam.rotation.y = Math.PI; scene.add(seam);
    const seam2 = seam.clone(); seam2.position.z = z + W / 2 + 0.01; seam2.rotation.y = 0; seam2.position.x = x - 0.1; scene.add(seam2); }
  // shards: thrown out of the open front, some lying on the steps; a fallen block of the upper column
  for (let k = 0; k < 14; k++) {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2, r = 1.0 + Math.random() * 2.6, s = 0.08 + Math.random() * 0.16;
    const px = Math.cos(a) * r, pz = Math.sin(a) * r, inDais = Math.abs(px) < 1.8 && Math.abs(pz) < 1.8;
    add(new THREE.Mesh(new THREE.TetrahedronGeometry(s), crystal), px, (inDais ? (Math.abs(px) < 1.3 && Math.abs(pz) < 1.3 ? 0.6 : 0.3) : 0) + s * 0.4, pz, Math.random() * 3, Math.random() * 3, Math.random() * 3);
  }
  add(new THREE.Mesh(slab(1.1, 0.6, 0.9, 0.15, 0), crystal), -2.7, 0.3, -0.9, 0, 0.5, 0.06);
  // light: the cold seal glow and the red of her crack
  const blue = new THREE.PointLight(0x4aa8ff, 9, 11, 2); blue.position.set(x, D0 + 2.2, z - 0.4); scene.add(blue);
  const red = new THREE.PointLight(0xff3b2a, 2.5, 4, 2); red.position.set(x, D0 + 1.8, z + 0.3); scene.add(red);
  // solid: the dais steps and the low front stub can be stood on; the walls are too tall
  for (let a = -1.8; a <= 1.81; a += 0.3) for (let b = -1.8; b <= 1.81; b += 0.3) solid(x + a, z + b, 0.16, Math.abs(a) <= 1.3 && Math.abs(b) <= 1.3 ? D0 : 0.3);
  solidLine(x - W / 2, z + W / 2 - T / 2, x + W / 2, z + W / 2 - T / 2, 0.18);
  solidLine(x - (W / 2 - T / 2), z - 0.3, x - (W / 2 - T / 2), z + W / 2, 0.18); solidLine(x + (W / 2 - T / 2), z - 0.3, x + (W / 2 - T / 2), z + W / 2, 0.18);
  solidLine(x - W / 2 + T, z - (W / 2 - T / 2), x + W / 2 - T, z - (W / 2 - T / 2), 0.16, D0 + 0.55);
  solid(x - 2.7, z - 0.9, 0.55, 0.6);
}

// ------------------------------------------------------------------ procedural textures
let seed = 1;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
function tex(size: number, draw: (g: CanvasRenderingContext2D, s: number) => void, rep = 1): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = c.height = size; draw(c.getContext('2d')!, size);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
function blotches(g: CanvasRenderingContext2D, s: number, n: number, col: () => string, rmin: number, rmax: number): void {
  for (let i = 0; i < n; i++) { g.fillStyle = col(); g.beginPath(); g.ellipse(rnd() * s, rnd() * s, rmin + rnd() * (rmax - rmin), rmin + rnd() * (rmax - rmin), rnd() * 3, 0, 7); g.fill(); }
}
const flagDraw0 = (g: CanvasRenderingContext2D, s: number) => {                            // temple floor: worn sandstone flags with moss in the joints
  g.fillStyle = '#3a3e2e'; g.fillRect(0, 0, s, s); const n = 4, w = s / n;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const v = rnd(); g.fillStyle = `rgb(${143 + v * 32},${142 + v * 30},${108 + v * 32})`; g.fillRect(x * w + 3, y * w + 3, w - 6, w - 6);
    g.fillStyle = 'rgba(255,240,210,0.05)'; g.fillRect(x * w + 3, y * w + 3, w - 6, 4);
    if (rnd() < 0.3) { g.strokeStyle = 'rgba(40,30,20,0.5)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x * w + rnd() * w, y * w + 4); g.lineTo(x * w + rnd() * w, y * w + w - 4); g.stroke(); }
  }
  blotches(g, s, 55, () => `rgba(${100 + rnd() * 40},${125 + rnd() * 30},${60 + rnd() * 20},${0.14 + rnd() * 0.2})`, 6, 30);
  for (let i = 0; i < 2500; i++) { g.fillStyle = `rgba(0,0,0,${rnd() * 0.1})`; g.fillRect(rnd() * s, rnd() * s, 2, 2); }
};
const blockDraw0 = (g: CanvasRenderingContext2D, s: number) => {                           // walls: laid sandstone blocks, darker, mossy at the base
  g.fillStyle = '#2e3226'; g.fillRect(0, 0, s, s); const rows = 6, bh = s / rows, bw = s / 3;
  for (let r = 0; r < rows; r++) for (let c = -1; c < 4; c++) { const off = r % 2 ? bw / 2 : 0, v = rnd(); g.fillStyle = `rgb(${120 + v * 30},${118 + v * 28},${92 + v * 24})`; g.fillRect(c * bw + off + 2, r * bh + 2, bw - 4, bh - 4); }
  const gr = g.createLinearGradient(0, s, 0, s * 0.55); gr.addColorStop(0, 'rgba(70,90,36,0.6)'); gr.addColorStop(1, 'rgba(70,90,36,0)'); g.fillStyle = gr; g.fillRect(0, 0, s, s);
};
// ------------------------------------------------------------------ 500 years of weather: the temple's stone, aged
/** A paint context that draws nothing (the old painters run on it so the world's shared random stream is used exactly as before). */
const NOOP: CanvasRenderingContext2D = new Proxy(function () { /* */ }, { get: () => NOOP, set: () => true, apply: () => NOOP }) as unknown as CanvasRenderingContext2D;
let agedSeed = 7331;
/** Each aged texture its own random stream (never the world's). */
const agedRng = () => { let a = (agedSeed = (agedSeed * 48271) % 2147483647); return () => { a = (a * 16807) % 2147483647; return a / 2147483647; }; };
/** A worn stone outline: a rectangle with jittered corners, one or two of them chipped off. */
function wornRect(g: CanvasRenderingContext2D, R: () => number, x: number, y: number, w: number, h: number, inset: number, chip: number): void {
  const j = () => inset * (0.5 + R()), c = () => (R() < 0.45 ? chip * (0.4 + R()) : 0);
  const c1 = c(), c2 = c(), c3 = c(), c4 = c();
  g.beginPath(); g.moveTo(x + j() + c1, y + j()); g.lineTo(x + w - j() - c2, y + j()); g.lineTo(x + w - j(), y + j() + c2); g.lineTo(x + w - j(), y + h - j() - c3);
  g.lineTo(x + w - j() - c3, y + h - j()); g.lineTo(x + j() + c4, y + h - j()); g.lineTo(x + j(), y + h - j() - c4); g.lineTo(x + j(), y + j() + c1); g.closePath();
}
function crack(g: CanvasRenderingContext2D, R: () => number, x: number, y: number, len: number, a: number, w: number, depth = 0): void {
  g.strokeStyle = `rgba(28,22,14,${0.55 + R() * 0.3})`; g.lineWidth = w; g.beginPath(); g.moveTo(x, y);
  for (let k = 0; k < 5; k++) { a += (R() - 0.5) * 1.1; x += Math.cos(a) * len / 5; y += Math.sin(a) * len / 5; g.lineTo(x, y); if (depth < 2 && R() < 0.25) crack(g, R, x, y, len * 0.4, a + (R() - 0.5) * 2, w * 0.6, depth + 1); }   // branches, two levels at most
  g.stroke();
}
/** Wall blocks after 500 years: chipped and uneven, some cracked, a few fallen out, moss in the joints and at the foot, rain streaks, lichen. */
const agedBlockDraw = (g: CanvasRenderingContext2D, s: number) => {
  const R = agedRng(); g.fillStyle = '#22261b'; g.fillRect(0, 0, s, s); const rows = 6, bh = s / rows, bw = s / 3;
  for (let r = 0; r < rows; r++) for (let c = -1; c < 4; c++) {
    const off = r % 2 ? bw / 2 : 0, x = c * bw + off, y = r * bh;
    if (R() < 0.06) { const gr = g.createLinearGradient(0, y, 0, y + bh); gr.addColorStop(0, '#0e0f0a'); gr.addColorStop(1, '#25261c'); g.fillStyle = gr; g.fillRect(x + 3, y + 3, bw - 6, bh - 6); continue; }   // fallen out
    const v = R(), age = 0.78 + R() * 0.24; g.fillStyle = `rgb(${(110 + v * 36) * age},${(106 + v * 32) * age},${(82 + v * 26) * age})`;
    wornRect(g, R, x, y, bw, bh, 3, 9); g.fill();
    g.fillStyle = 'rgba(255,245,215,0.07)'; g.fillRect(x + 5, y + 4, bw - 10, 3);                                   // worn top edge catches the light
    g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(x + 4, y + bh - 7, bw - 8, 3);
    for (let k = 0; k < 6; k++) { g.fillStyle = `rgba(30,24,16,${0.15 + R() * 0.25})`; g.beginPath(); g.arc(x + 6 + R() * (bw - 12), y + 5 + R() * (bh - 10), 0.8 + R() * 2.2, 0, 7); g.fill(); }   // weathering pits
    if (R() < 0.28) crack(g, R, x + R() * bw, y + 4, bh * (0.6 + R() * 0.6), 1.57 + (R() - 0.5), 1.2);
  }
  for (let i = 0; i < 70; i++) {                                                           // moss creeping along the joints
    const horiz = R() < 0.6, x = R() * s, y = horiz ? Math.round(R() * rows) * bh : R() * s, l = 8 + R() * 40;
    g.strokeStyle = `rgba(${52 + R() * 30},${84 + R() * 40},${26 + R() * 16},${0.35 + R() * 0.4})`; g.lineWidth = 2 + R() * 3; g.beginPath(); g.moveTo(x, y); horiz ? g.lineTo(x + l, y + (R() - 0.5) * 3) : g.lineTo(x + (R() - 0.5) * 3, y + l); g.stroke();
  }
  for (let i = 0; i < 46; i++) { const x = R() * s, l = s * (0.2 + R() * 0.7), w = 2 + R() * 6; const gr = g.createLinearGradient(0, 0, 0, l); gr.addColorStop(0, `rgba(18,20,12,${0.12 + R() * 0.12})`); gr.addColorStop(1, 'rgba(18,20,12,0)'); g.fillStyle = gr; g.fillRect(x, 0, w, l); }   // rain streaks
  const gr = g.createLinearGradient(0, s, 0, s * 0.45); gr.addColorStop(0, 'rgba(58,86,30,0.7)'); gr.addColorStop(1, 'rgba(58,86,30,0)'); g.fillStyle = gr; g.fillRect(0, 0, s, s);   // damp moss at the foot
  for (let i = 0; i < 26; i++) { g.fillStyle = `rgba(${60 + R() * 30},${92 + R() * 40},${30 + R() * 20},${0.25 + R() * 0.3})`; g.beginPath(); g.ellipse(R() * s, s * (0.55 + R() * 0.45), 6 + R() * 18, 4 + R() * 10, R() * 3, 0, 7); g.fill(); }
  for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(${170 + R() * 40},${176 + R() * 30},${110 + R() * 30},${0.2 + R() * 0.25})`; g.beginPath(); g.arc(R() * s, R() * s, 0.8 + R() * 2.4, 0, 7); g.fill(); }   // lichen
};
/** Floor flags after 500 years: uneven, chipped, cracked and split, a few gone to earth and weeds, thick moss and grass in the joints, roots across. */
const agedFlagDraw = (g: CanvasRenderingContext2D, s: number) => {
  const R = agedRng(); g.fillStyle = '#2c3321'; g.fillRect(0, 0, s, s); const n = 4, w = s / n;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const X = x * w, Y = y * w;
    if (R() < 0) {                                                                           // (a flag gone: off; it repeats in rows when the texture tiles)
      g.fillStyle = '#3a2f20'; g.fillRect(X + 6, Y + 6, w - 12, w - 12);
      for (let k = 0; k < 60; k++) { g.strokeStyle = `rgba(${70 + R() * 50},${110 + R() * 50},${40 + R() * 20},0.8)`; g.lineWidth = 1.5; const px = X + 8 + R() * (w - 16), py = Y + 8 + R() * (w - 16); g.beginPath(); g.moveTo(px, py); g.lineTo(px + (R() - 0.5) * 5, py - 4 - R() * 8); g.stroke(); }
      continue;
    }
    const v = R(), sunk = R() < 0.15 ? 0.92 : 1; g.fillStyle = `rgb(${(146 + v * 16) * sunk},${(143 + v * 14) * sunk},${(112 + v * 14) * sunk})`;   // close in tone: no checkerboard when it repeats
    wornRect(g, R, X, Y, w, w, 6, 16); g.fill();
    g.fillStyle = 'rgba(255,240,210,0.05)'; g.fillRect(X + 8, Y + 7, w - 16, 4);
    if (R() < 0.5) { g.fillStyle = `rgba(${40 + R() * 20},${34 + R() * 16},${22 + R() * 10},${0.05 + R() * 0.07})`; g.beginPath(); g.ellipse(X + R() * w, Y + R() * w, 14 + R() * 30, 10 + R() * 20, R() * 3, 0, 7); g.fill(); }   // a faint stain
    if (R() < 0.55) crack(g, R, X + R() * w, Y + R() * w, w * (0.5 + R() * 0.6), R() * 6.28, 1.6);
    if (R() < 0.15) { g.strokeStyle = 'rgba(24,20,12,0.85)'; g.lineWidth = 3; g.beginPath(); g.moveTo(X + 6, Y + w * R()); g.lineTo(X + w - 6, Y + w * R()); g.stroke(); }   // split clean through
  }
  for (let i = 0; i < 120; i++) {                                                           // moss in the joints
    const horiz = R() < 0.5, along = R() * s, line = Math.round(R() * n) * w, l = 10 + R() * 50;
    g.strokeStyle = `rgba(${48 + R() * 34},${84 + R() * 46},${26 + R() * 18},${0.45 + R() * 0.4})`; g.lineWidth = 3 + R() * 5;
    g.beginPath(); horiz ? (g.moveTo(along, line), g.lineTo(along + l, line + (R() - 0.5) * 4)) : (g.moveTo(line, along), g.lineTo(line + (R() - 0.5) * 4, along + l)); g.stroke();
  }
  for (let i = 0; i < 420; i++) {                                                           // grass and weeds pushing up through the joints
    const horiz = R() < 0.5, along = R() * s, line = Math.round(R() * n) * w + (R() - 0.5) * 6, px = horiz ? along : line, py = horiz ? line : along;
    g.strokeStyle = `rgba(${70 + R() * 60},${112 + R() * 60},${36 + R() * 30},${0.6 + R() * 0.3})`; g.lineWidth = 1.3; g.beginPath(); g.moveTo(px, py); g.lineTo(px + (R() - 0.5) * 6, py - 3 - R() * 7); g.stroke();
  }
  for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(${64 + R() * 30},${100 + R() * 40},${34 + R() * 20},${0.18 + R() * 0.25})`; g.beginPath(); g.ellipse(R() * s, R() * s, 10 + R() * 34, 6 + R() * 22, R() * 3, 0, 7); g.fill(); }   // moss patches
  for (let k = 0; k < 3; k++) {                                                             // roots across the floor
    let x = R() * s, y = R() * s, a = R() * 6.28; g.strokeStyle = `rgba(${58 + R() * 20},${40 + R() * 14},${24 + R() * 10},0.85)`; g.lineWidth = 3 + R() * 3; g.lineCap = 'round'; g.beginPath(); g.moveTo(x, y);
    for (let q = 0; q < 14; q++) { a += (R() - 0.5) * 0.8; x += Math.cos(a) * 22; y += Math.sin(a) * 22; g.lineTo(x, y); } g.stroke();
  }
  for (let i = 0; i < 120; i++) { g.fillStyle = `rgba(${170 + R() * 40},${176 + R() * 30},${110 + R() * 30},${0.18 + R() * 0.22})`; g.beginPath(); g.arc(R() * s, R() * s, 1 + R() * 2.6, 0, 7); g.fill(); }   // lichen
};
/** Big uneven patches over the temple's stone (moss, damp, dirt) so the repeated texture never reads as a grid. */
function agedPatches<M extends THREE.MeshStandardMaterial>(m: M, key: string, cut = false): M {
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = NOISE + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      vec2 aw = vMapUv * 0.9;
      vec2 bw = mat2(0.8, -0.6, 0.6, 0.8) * aw;                                            // rotated off the tile grid; large patches only
      float mossP = smoothstep(0.5, 0.78, vnoise(bw * 0.3 + 3.0));
      float damp = smoothstep(0.5, 0.8, vnoise(bw * 0.2 + 11.0));
      float dirtP = smoothstep(0.6, 0.85, vnoise(bw * 0.45 + 23.0));
      diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.55, 0.78, 0.42), mossP * 0.7);
      diffuseColor.rgb *= 1.0 - damp * 0.22; diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.16, 0.13, 0.09), dirtP * 0.35);`);
    if (cut) focusCut(sh);                                                                 // tall walls never hide him: cut away between the camera and the hero
  };
  m.customProgramCacheKey = () => 'aged-' + key + (cut ? '-cut' : ''); return m;
}
const flagTex = () => { const t = tex(512, agedFlagDraw); flagDraw0(NOOP, 512); return t; };
const blockTex = () => { const t = tex(256, agedBlockDraw); blockDraw0(NOOP, 256); return t; };
/** A texture painted by a new painter, while the old one still runs blind (the world's shared random stream is used exactly as before). */
const keepTex = (size: number, draw: (g: CanvasRenderingContext2D, s: number) => void, old: (g: CanvasRenderingContext2D, s: number) => void, rep = 1) => { const t = tex(size, draw, rep); old(NOOP, size); return t; };
/** Tileable value noise from a given random stream (never the world's). */
function noiseR(p: number, R: () => number): (x: number, y: number) => number {
  const v = new Float32Array(p * p).map(() => R()); const w = (a: number) => ((a % p) + p) % p;
  return (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = v[w(yi) * p + w(xi)], b = v[w(yi) * p + w(xi + 1)], c = v[w(yi + 1) * p + w(xi)], d = v[w(yi + 1) * p + w(xi + 1)]; return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy; };
}
/** Camp clearings: trampled dark earth, a wide ragged edge into the grass, scuffs and footprints, ash round the fire, tufts at the rim. */
const campDirtDraw = (g: CanvasRenderingContext2D, s: number) => {
  const R = agedRng(), n = noiseR(10, R), n2 = noiseR(30, R); const img = g.createImageData(s, s); const d = img.data;
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const dx = x / s - 0.5, dy = y / s - 0.5, r = Math.hypot(dx, dy) * 2, ang = Math.atan2(dy, dx), v = n(x / s * 10, y / s * 10) * 0.6 + n2(x / s * 30, y / s * 30) * 0.4;
    const edge = 0.72 + (n(Math.cos(ang) * 3 + 5, Math.sin(ang) * 3 + 5) - 0.5) * 0.5, a = Math.max(0, Math.min(1, (edge - r) / 0.42)) * (0.75 + 0.25 * v);
    const ash = Math.max(0, 1 - r / 0.22); const i = (y * s + x) * 4;
    d[i] = (74 + v * 40) * (1 - ash * 0.55); d[i + 1] = (62 + v * 32) * (1 - ash * 0.55); d[i + 2] = (40 + v * 22) * (1 - ash * 0.45); d[i + 3] = a * 255;
  }
  g.putImageData(img, 0, 0);
  for (let k = 0; k < 70; k++) { const a = R() * 6.28, r = R() * 0.32 * s; g.fillStyle = `rgba(30,22,14,${0.12 + R() * 0.16})`; g.beginPath(); g.ellipse(s / 2 + Math.cos(a) * r, s / 2 + Math.sin(a) * r, 3 + R() * 3, 6 + R() * 4, R() * 3, 0, 7); g.fill(); }   // footprints, scuffs
  for (let k = 0; k < 160; k++) { const a = R() * 6.28, r = (0.3 + R() * 0.12) * s; g.strokeStyle = `rgba(${60 + R() * 40},${96 + R() * 50},${36 + R() * 20},${0.5 + R() * 0.4})`; g.lineWidth = 1.5; const x = s / 2 + Math.cos(a) * r, y = s / 2 + Math.sin(a) * r; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (R() - 0.5) * 4, y - 3 - R() * 6); g.stroke(); }   // tufts at the rim
  for (let k = 0; k < 220; k++) { g.fillStyle = `rgba(${90 + R() * 50},${84 + R() * 40},${70 + R() * 30},${0.4 + R() * 0.4})`; g.beginPath(); g.arc(R() * s, R() * s, 0.8 + R() * 1.6, 0, 7); g.fill(); }   // pebbles
};
/** Tent hide: irregular stitched panels in varied browns, stains, patches, the top darkened by smoke. */
const hideDraw = (g: CanvasRenderingContext2D, s: number) => {
  const R = agedRng(); g.fillStyle = '#7a5a3a'; g.fillRect(0, 0, s, s);
  for (let k = 0; k < 7; k++) { const x0 = R() * s, y0 = R() * s, w = s * (0.3 + R() * 0.4), h = s * (0.25 + R() * 0.35), v = R(); g.fillStyle = `rgb(${104 + v * 46},${76 + v * 34},${48 + v * 24})`;
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0 + w, y0 + (R() - 0.5) * 20); g.lineTo(x0 + w + (R() - 0.5) * 20, y0 + h); g.lineTo(x0 + (R() - 0.5) * 20, y0 + h + (R() - 0.5) * 10); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(40,24,12,0.85)'; g.setLineDash([3, 3]); g.lineWidth = 1.4; g.stroke(); g.setLineDash([]); }
  for (let k = 0; k < 14; k++) { g.fillStyle = `rgba(40,26,14,${0.08 + R() * 0.14})`; g.beginPath(); g.ellipse(R() * s, R() * s, 4 + R() * 16, 3 + R() * 10, R() * 3, 0, 7); g.fill(); }
  const gr = g.createLinearGradient(0, 0, 0, s * 0.45); gr.addColorStop(0, 'rgba(20,16,12,0.55)'); gr.addColorStop(1, 'rgba(20,16,12,0)'); g.fillStyle = gr; g.fillRect(0, 0, s, s);
  for (let k = 0; k < 300; k++) { g.fillStyle = `rgba(${R() < 0.5 ? '255,240,220' : '20,14,8'},${R() * 0.06})`; g.fillRect(R() * s, R() * s, 2, 2); }
};
/** Crate wood: planks with grain and knots, dark gaps, iron corner straps and nails, worn edges. */
const crateDraw = (g: CanvasRenderingContext2D, s: number) => {
  const R = agedRng(); g.fillStyle = '#2e2014'; g.fillRect(0, 0, s, s); const n = 5, ph = s / n;
  for (let k = 0; k < n; k++) { const v = R(); g.fillStyle = `rgb(${112 + v * 34},${80 + v * 24},${48 + v * 16})`; g.fillRect(2, k * ph + 2, s - 4, ph - 4);
    for (let q = 0; q < 10; q++) { g.strokeStyle = `rgba(60,38,20,${0.2 + R() * 0.3})`; g.lineWidth = 1; const y = k * ph + 4 + R() * (ph - 8); g.beginPath(); g.moveTo(2, y); g.bezierCurveTo(s * 0.3, y + (R() - 0.5) * 4, s * 0.7, y + (R() - 0.5) * 4, s - 2, y + (R() - 0.5) * 3); g.stroke(); }
    if (R() < 0.5) { g.fillStyle = 'rgba(50,30,16,0.7)'; g.beginPath(); g.ellipse(8 + R() * (s - 16), k * ph + ph / 2, 3, 2, 0, 0, 7); g.fill(); } }
  g.fillStyle = '#3a3634'; for (const [x, y] of [[0, 0], [s - 16, 0], [0, s - 16], [s - 16, s - 16]]) g.fillRect(x, y, 16, 16);   // iron corners
  g.fillStyle = '#16120e'; for (let k = 0; k < 16; k++) g.fillRect(k % 2 ? 5 : s - 8, 6 + Math.floor(k / 2) * (s / 8), 3, 3);   // nails
  g.strokeStyle = 'rgba(20,14,8,0.6)'; g.lineWidth = 4; g.strokeRect(2, 2, s - 4, s - 4);
};
/** Barrel: staves of slightly different woods, two rusty iron hoops, dark at the seams. */
const barrelDraw = (g: CanvasRenderingContext2D, s: number) => {
  const R = agedRng(); const n = 12;
  for (let k = 0; k < n; k++) { const v = R(); g.fillStyle = `rgb(${96 + v * 36},${66 + v * 24},${36 + v * 16})`; g.fillRect(k * s / n, 0, s / n, s); g.fillStyle = 'rgba(20,12,6,0.6)'; g.fillRect(k * s / n, 0, 1.5, s);
    for (let q = 0; q < 4; q++) { g.strokeStyle = `rgba(50,30,14,${0.2 + R() * 0.3})`; g.lineWidth = 1; const x = k * s / n + 2 + R() * (s / n - 4); g.beginPath(); g.moveTo(x, 0); g.lineTo(x + (R() - 0.5) * 3, s); g.stroke(); } }
  for (const y of [0.14, 0.8]) { g.fillStyle = '#3a2e26'; g.fillRect(0, s * y, s, 8); for (let q = 0; q < 30; q++) { g.fillStyle = `rgba(${130 + R() * 50},${60 + R() * 30},20,${0.3 + R() * 0.4})`; g.fillRect(R() * s, s * y + R() * 8, 2 + R() * 4, 1 + R() * 2); } }
};
/** Reeds: a clump of thin blades and a few cattail heads on a transparent card. */
const reedDraw = (g: CanvasRenderingContext2D, s: number) => {
  const R = agedRng(); g.clearRect(0, 0, s, s * 2);
  for (let k = 0; k < 22; k++) { const x = s * (0.15 + R() * 0.7), h = s * 2 * (0.45 + R() * 0.5), lean = (R() - 0.5) * s * 0.25, gg = 90 + R() * 70;
    g.strokeStyle = `rgb(${50 + R() * 40},${gg},${36 + R() * 30})`; g.lineWidth = 1.6 + R() * 1.4; g.beginPath(); g.moveTo(x, s * 2); g.quadraticCurveTo(x + lean * 0.3, s * 2 - h * 0.5, x + lean, s * 2 - h); g.stroke();
    if (R() < 0.25) { g.fillStyle = '#5a3c22'; g.beginPath(); g.ellipse(x + lean * 0.9, s * 2 - h * 0.92, 2.6, 8, 0, 0, 7); g.fill(); } }
};
/** Hanging vines: a strand with leaves, drawn on a tall transparent card. */
const vineTex = () => tex(128, (g, s) => {
  const R = agedRng(); g.clearRect(0, 0, s, s);
  for (let v = 0; v < 3; v++) {
    let x = s * (0.25 + v * 0.25 + (R() - 0.5) * 0.1); const L = s * (0.55 + R() * 0.45);
    g.strokeStyle = 'rgba(58,70,30,0.95)'; g.lineWidth = 2; g.beginPath(); g.moveTo(x, 0);
    for (let y = 0; y < L; y += 6) { x += (R() - 0.5) * 3; g.lineTo(x, y); } g.stroke();
    x = s * (0.25 + v * 0.25);
    for (let y = 2; y < L; y += 4 + R() * 5) {
      const sz = 3 + R() * 5 * (1 - y / s * 0.6), side = R() < 0.5 ? -1 : 1, gg = 90 + R() * 70;
      g.fillStyle = `rgb(${40 + R() * 30},${gg},${30 + R() * 25})`; g.beginPath(); g.ellipse(x + side * sz * 0.8 + (R() - 0.5) * 3, y, sz, sz * 0.55, side * 0.6 + (R() - 0.5), 0, 7); g.fill();
    }
  }
});
/** Tileable value noise on a 2D lattice of `p` cells (wraps, so the texture repeats seamlessly). */
function tileNoise(p: number): (x: number, y: number) => number {
  const v = new Float32Array(p * p).map(() => rnd());
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = v[((yi % p) + p) % p * p + ((xi % p) + p) % p], b = v[((yi % p) + p) % p * p + (((xi + 1) % p) + p) % p];
    const c = v[(((yi + 1) % p) + p) % p * p + ((xi % p) + p) % p], d = v[(((yi + 1) % p) + p) % p * p + (((xi + 1) % p) + p) % p];
    return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
  };
}
const groundTex = () => tex(512, (g, s) => {                          // jungle floor: yellow-green grass, shaded and sunlit (fractal noise), blades
  const n1 = tileNoise(6), n2 = tileNoise(14), n3 = tileNoise(40), n4 = tileNoise(110);
  const img = g.createImageData(s, s); const d = img.data;
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const u = x / s, v = y / s;
    const lush = n1(u * 6, v * 6) * 0.55 + n2(u * 14, v * 14) * 0.3 + n3(u * 40, v * 40) * 0.15;          // deep shaded grass vs sunlit grass
    const k = Math.min(1, Math.max(0, (lush - 0.38) * 2.6));
    const dry = Math.min(1, Math.max(0, (n2(u * 14 + 7, v * 14 + 3) - 0.68) * 4));                       // a few dry, pale patches
    const grain = n4(u * 110, v * 110) * 0.5 + n3(u * 40, v * 40) * 0.5;
    const G = LOOK.ground, D = G.dark, Lt = G.light, Dr = G.dry;                                          // the chosen look's greens (src/look.ts)
    let r = D[0] + (Lt[0] - D[0]) * k, gg = D[1] + (Lt[1] - D[1]) * k, b = D[2] + (Lt[2] - D[2]) * k;
    r += (Dr[0] - r) * dry * G.dryAmt; gg += (Dr[1] - gg) * dry * G.dryAmt; b += (Dr[2] - b) * dry * G.dryAmt;
    const m = 0.82 + grain * 0.36;
    const i = (y * s + x) * 4; d[i] = r * m; d[i + 1] = gg * m; d[i + 2] = b * m; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const Gb = LOOK.ground, [bd, bb, bp] = Gb.blades;
  let ls = 977; const lr = () => { ls = (ls * 16807) % 2147483647; return ls / 2147483647; };   // its own random stream: the look never moves the world's props
  for (let i = 0; i < Gb.bladeN; i++) {                                                                   // grass blades: dark roots, bright tips
    const r = lr(); g.strokeStyle = r < 0.45 ? `rgba(${bd},${0.25 + lr() * 0.35})` : r < 0.9 ? `rgba(${bb},${0.2 + lr() * 0.3})` : `rgba(${bp},${0.2 + lr() * 0.25})`;
    const x = lr() * s, y = lr() * s, a = -1.57 + (lr() - 0.5) * 0.9, l = 2 + lr() * Gb.bladeL; g.lineWidth = Gb.bladeW; g.lineCap = 'round'; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
  for (let i = 0; i < Gb.specks.n; i++) {                                                                 // fallen leaves and pebbles (small ellipses)
    const c = Gb.specks.cols[Math.floor(lr() * Gb.specks.cols.length)], x = lr() * s, y = lr() * s, w = Gb.specks.size * (0.6 + lr() * 0.8);
    g.fillStyle = `rgba(${c},${0.45 + lr() * 0.4})`; g.beginPath(); g.ellipse(x, y, w, w * (0.45 + lr() * 0.3), lr() * 3.14, 0, 6.29); g.fill();
  }
  for (let i = 0; i < 31200; i++) rnd();                                                                  // the shared stream moves on exactly as the original blades did (5200 x 6), so the layout matches
}, 9);
const lotusTex = () => tex(512, (g, s) => {                           // the courtyard seal: lotus in a double ring, carved into the floor
  g.clearRect(0, 0, s, s); const c = s / 2; g.translate(c, c);
  g.strokeStyle = 'rgba(214,170,90,0.95)'; g.lineWidth = 7; g.beginPath(); g.arc(0, 0, c * 0.93, 0, 7); g.stroke(); g.lineWidth = 3; g.beginPath(); g.arc(0, 0, c * 0.84, 0, 7); g.stroke();
  for (let i = 0; i < 48; i++) { g.save(); g.rotate((i / 48) * Math.PI * 2); g.fillStyle = 'rgba(214,170,90,0.8)'; g.fillRect(-2, -c * 0.92, 4, c * 0.07); g.restore(); }
  for (let ring = 0; ring < 2; ring++) for (let i = 0; i < 8; i++) {
    g.save(); g.rotate((i / 8) * Math.PI * 2 + ring * Math.PI / 8); const L = ring ? c * 0.55 : c * 0.74, W = ring ? c * 0.16 : c * 0.2;
    g.beginPath(); g.moveTo(0, -c * 0.12); g.quadraticCurveTo(W, -L * 0.6, 0, -L); g.quadraticCurveTo(-W, -L * 0.6, 0, -c * 0.12);
    g.fillStyle = ring ? 'rgba(200,150,80,0.35)' : 'rgba(170,120,60,0.3)'; g.fill(); g.strokeStyle = 'rgba(230,185,100,0.95)'; g.lineWidth = 4; g.stroke(); g.restore();
  }
  g.fillStyle = 'rgba(230,185,100,0.9)'; g.beginPath(); g.arc(0, 0, c * 0.12, 0, 7); g.fill();
});
const reliefTex = () => tex(512, (g, s) => {                          // carved relief: figures in procession under arches, gilded edges
  g.fillStyle = '#5a4430'; g.fillRect(0, 0, s, s / 2);
  for (let k = 0; k < 5; k++) {
    const x = s * (0.1 + k * 0.2), base = s * 0.44, gold = 'rgba(222,176,92,0.95)';
    g.fillStyle = 'rgba(40,28,18,0.55)'; g.beginPath(); g.ellipse(x, base - 70, 34, 66, 0, 0, 7); g.fill();
    g.fillStyle = '#8a6a48'; g.beginPath(); g.arc(x, base - 108, 13, 0, 7); g.fill(); g.fillRect(x - 15, base - 95, 30, 60); g.fillRect(x - 22, base - 40, 44, 40);
    g.strokeStyle = gold; g.lineWidth = 3; g.beginPath(); g.moveTo(x, base - 140); g.lineTo(x - 9, base - 120); g.lineTo(x + 9, base - 120); g.closePath(); g.stroke();
    g.beginPath(); g.arc(x, base - 108, 20, Math.PI * 1.05, Math.PI * 1.95); g.stroke();
  }
  g.strokeStyle = 'rgba(222,176,92,0.9)'; g.lineWidth = 6; g.strokeRect(6, 6, s - 12, s / 2 - 12);
});

/** Box with UVs scaled to its size, so a tiling texture keeps the same density on every face. */
function box(w: number, h: number, d: number, tile: number): THREE.BufferGeometry {
  const geo = new THREE.BoxGeometry(w, h, d); const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
  const faces: Array<[number, number]> = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * faces[f][0] / tile, uv.getY(i) * faces[f][1] / tile); }
  return geo;
}

// ------------------------------------------------------------------ water shader (river and canal)
const NOISE = `
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
`;
function waterMaterial(time: { value: number }, speed: number, shallow = false): THREE.ShaderMaterial {
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true,
    uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), uTime: time, uSpeed: { value: speed } },
    vertexShader: `varying vec2 vUv;
      #include <fog_pars_vertex>
      void main(){ vUv = uv; vec4 mvPosition = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: NOISE + `
      uniform float uTime; uniform float uSpeed; varying vec2 vUv;
      #include <fog_pars_fragment>
      void main(){
        float u = vUv.x, v = vUv.y, t = uTime * uSpeed;                         // u: across 0..1, v: metres along the flow
        float n1 = vnoise(vec2(u * 4.0, v * 0.55 - t * 0.9)), n2 = vnoise(vec2(u * 9.0 + 3.0, v * 1.4 - t * 1.6));
        float n = n1 * 0.6 + n2 * 0.4;
        float edge = smoothstep(0.0, 0.16, u) * smoothstep(1.0, 0.84, u);        // 0 at the banks, 1 in the middle
        vec3 shallow = vec3(0.048, 0.20, 0.29), deep = vec3(0.026, 0.15, 0.23), murk = vec3(0.03, 0.117, 0.15);
        vec3 col = mix(shallow, deep, edge);
        // the bed shows through: rounded stones, lighter tops and dark gaps, refracted (wobbling) by the flow
        vec2 bp = vec2(u * 5.0, v) * 1.7 + vec2(n1, n2) * 0.25;
        float st = vnoise(bp) * 0.6 + vnoise(bp * 2.3) * 0.4;
        col = mix(col, murk, smoothstep(0.42, 0.30, st) * 0.6);
        col = mix(col, vec3(0.10, 0.30, 0.36), smoothstep(0.62, 0.78, st) * (1.0 - edge * 0.6) * 0.7);
        col = mix(col, murk * 0.7, edge * 0.35);                                                  // deeper in the middle
        // bright ripple lines drifting downstream
        // short broken streaks stretched along the current, not closed rings
        float rp = vnoise(vec2(u * 11.0, v * 0.45 - t * 1.6)) * 0.75 + vnoise(vec2(u * 23.0, v * 1.1 - t * 2.2)) * 0.25;
        float line = pow(1.0 - abs(2.0 * fract(rp * 4.0) - 1.0), 18.0);
        line *= smoothstep(0.45, 0.75, vnoise(vec2(u * 6.0 + 9.0, v * 0.7 - t * 1.3)));
        col += vec3(0.24, 0.43, 0.50) * line * 0.6;
        float foam = (1.0 - smoothstep(0.0, 0.07, min(u, 1.0 - u))) * (0.5 + 0.5 * sin(v * 2.6 - t * 3.0 + n * 6.0));
        col = mix(col, vec3(0.45, 0.62, 0.66), clamp(foam, 0.0, 1.0) * 0.35);                    // white water where it meets the rocks
        float sp = pow(vnoise(vec2(u * 46.0, v * 9.0 - t * 2.4)), 40.0) * step(0.6, n);           // sparse glints
        col *= 1.05;                                                                              // daylight (this shader skips tone mapping)
        col += vec3(0.6, 0.8, 0.9) * sp * 0.35;
        gl_FragColor = vec4(col, 0.95);
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  if (shallow) {                                                                   // streams: thin and clear over the fords (aDep: 0 ford .. 1 full depth)
    m.vertexShader = 'attribute float aDep; varying float vDep;\n' + m.vertexShader.replace('vUv = uv;', 'vUv = uv; vDep = aDep;');
    m.fragmentShader = 'varying float vDep;\n' + m.fragmentShader.replace('gl_FragColor = vec4(col, 0.95);', 'gl_FragColor = vec4(mix(col * 1.15, col, vDep), 0.95 * mix(0.4, 1.0, vDep));');
  }
  return m;
}

/** Still pond water (the monastery's flooded courts): deep in the middle, a pale shoreline with lapping foam, slow ripple rings and glints. */
function poolMaterial(time: { value: number }, R: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: true,
    uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), uTime: time, uR: { value: R } },
    vertexShader: `varying vec2 vP;
      #include <fog_pars_vertex>
      void main(){ vP = position.xz; vec4 mvPosition = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: NOISE + `
      uniform float uTime, uR; varying vec2 vP;
      #include <fog_pars_fragment>
      void main(){
        float d = length(vP) / uR, t = uTime;
        vec3 deep = vec3(0.02, 0.10, 0.12), shallow = vec3(0.07, 0.22, 0.22), sky = vec3(0.30, 0.45, 0.50);
        vec3 col = mix(deep, shallow, smoothstep(0.35, 0.95, d));
        float n = vnoise(vP * 0.6 + vec2(t * 0.05, -t * 0.04)) * 0.6 + vnoise(vP * 1.7 - t * 0.08) * 0.4;
        col = mix(col, sky, smoothstep(0.55, 0.85, n) * 0.35);
        float ring = 0.0;
        for (int k = 0; k < 3; k++) { float fk = float(k); float per = 3.0 + fk; float cyc = t / per + fk * 0.37; float ph = fract(cyc);
          vec2 c = (vec2(vnoise(vec2(floor(cyc), fk * 7.0)), vnoise(vec2(fk * 3.0, floor(cyc) + 5.0))) - 0.5) * uR * 1.2;
          float rr = length(vP - c); ring += smoothstep(0.08, 0.0, abs(rr - ph * 2.2)) * (1.0 - ph); }
        col += vec3(0.25, 0.35, 0.35) * ring * 0.5;
        float shore = smoothstep(0.86, 1.0, d) * (0.6 + 0.4 * sin(d * 60.0 - t * 2.2 + n * 5.0));
        col = mix(col, vec3(0.55, 0.62, 0.58), clamp(shore, 0.0, 1.0) * 0.55);
        float gl = pow(vnoise(vP * 5.0 + vec2(t * 0.3, t * 0.2)), 24.0); col += vec3(0.7, 0.8, 0.8) * gl * 0.22;
        gl_FragColor = vec4(col * 1.05, 0.9 * smoothstep(1.0, 0.97, d) + 0.05);
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
}

/** A flat ribbon along a curve: uv.x across 0..1, uv.y = metres along the curve. */
function ribbon(curve: THREE.Curve<THREE.Vector3>, width: number | ((t: number, side: number) => number), segs: number, y: number): THREE.BufferGeometry {
  const pos: number[] = [], uv: number[] = [], idx: number[] = []; const L = curve.getLength();
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, p = curve.getPointAt(t), tg = curve.getTangentAt(t); const nx = -tg.z, nz = tg.x; const nl = Math.hypot(nx, nz) || 1;
    for (const s of [-1, 1]) { const hw = typeof width === 'number' ? width / 2 : width(t, s); pos.push(p.x + (nx / nl) * s * hw, y, p.z + (nz / nl) * s * hw); uv.push(s < 0 ? 0 : 1, t * L); }
    if (i < segs) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); return g;
}

/** Where the hero is: tree crowns and leaves between him and the camera dissolve so he is never hidden under the canopy. */
export const ch1Focus = { value: new THREE.Vector3(0, -99, 0) };
function focusCut(sh: THREE.WebGLProgramParametersWithUniforms): void {
  sh.uniforms.uFocus = ch1Focus;
  sh.vertexShader = 'varying vec3 vFocusW;\n' + sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
    #ifdef USE_INSTANCING
      vFocusW = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
    #else
      vFocusW = (modelMatrix * vec4(transformed, 1.0)).xyz;
    #endif`);
  sh.fragmentShader = 'uniform vec3 uFocus; varying vec3 vFocusW;\n' + sh.fragmentShader.replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
    {
      vec3 fA = uFocus + vec3(0.0, 1.0, 0.0); vec3 fD = normalize(cameraPosition - fA); float fT = dot(vFocusW - fA, fD);
      if (fT > 0.4 && vFocusW.y > uFocus.y + 0.6) {
        float fR = length(vFocusW - fA - fD * fT); float fK = smoothstep(2.0, 3.4, fR);
        if (fK < 1.0 && fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) > fK) discard;
      }
    }`);
}

// ------------------------------------------------------------------ build
export interface Lamp { light: THREE.PointLight; flame: THREE.Mesh; base: number }
export function buildChapter1(scene: THREE.Scene, renderer: THREE.WebGLRenderer): { lamps: Lamp[]; sun: THREE.DirectionalLight; update: (dt: number) => void; loadProps: (base: string) => Promise<void>; openGate: () => void; captives: Array<{ camp: number; x: number; z: number; objs: THREE.Object3D[] }>; setSealed: (on: boolean) => void } {
  seed = 1;
  // dusk in a dead temple: low amber light through smoke, a dark brown haze closing in; the braziers are the brightest thing
  // Dota-style daylight: warm white sun, bright sky fill, a light haze far off (it still hides the map's far reaches)
  scene.background = new THREE.Color(0x8fa6b4); scene.fog = new THREE.Fog(0x8fa0a6, 34, 92);
  renderer.toneMappingExposure = 1.0;
  const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.45;
  scene.add(new THREE.HemisphereLight(0xd6e4f2, 0x4a4232, 1.15));
  const sun = new THREE.DirectionalLight(0xfff0d8, 2.5); sun.castShadow = true; sun.shadow.mapSize.set(1536, 1536);
  const sc = sun.shadow.camera; sc.left = -17; sc.right = 17; sc.top = 17; sc.bottom = -17; sc.near = 2; sc.far = 60; sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);
  const time = { value: 0 }; const windUniforms: Array<{ value: number }> = [time];

  // ---- ground
  const groundGeos: THREE.BufferGeometry[] = [];                                         // kept: the streams are cut into them once the world is placed
  {
    // 16 m tiles: flat ones are two triangles, tiles touching a hill or trench are 0.5 m height grids (rock-tinted where steep)
    const T = 16, GX0 = B.x0 - 16, GZ0 = B.z0 - 16, NTX = Math.ceil((B.x1 - B.x0 + 32) / T), NTZ = Math.ceil((B.z1 - B.z0 + 32) / T);
    const boxes = [{ x0: PLATEAU.x - PLATEAU.hx - 8, x1: PLATEAU.x + PLATEAU.hx + 8, z0: PLATEAU.z - PLATEAU.hz - 8, z1: PLATEAU.z + PLATEAU.hz + 8 }, ...HILLS.map((h) => ({ x0: h.x - h.R * 1.1 - h.L - 4, x1: h.x + h.R * 1.1 + h.L + 4, z0: h.z - h.R * 1.1 - h.L - 4, z1: h.z + h.R * 1.1 + h.L + 4 })),
      ...POOLS.map((p) => ({ x0: p.x - p.r, x1: p.x + p.r, z0: p.z - p.r, z1: p.z + p.r })),
      ...TRENCHES.map((t) => ({ x0: Math.min(...t.pts.map((p) => p[0])) - t.w, x1: Math.max(...t.pts.map((p) => p[0])) + t.w, z0: Math.min(...t.pts.map((p) => p[1])) - t.w, z1: Math.max(...t.pts.map((p) => p[1])) + t.w }))];
    // one mesh for all the flat tiles, and one per 48 m block of detailed tiles, so terrain off screen is culled
    const parts = new Map<string, { pos: number[]; uv: number[]; idx: number[] }>(); const groundMat = new THREE.MeshStandardMaterial({ map: groundTex(), roughness: 1, vertexColors: true });
    groundMat.onBeforeCompile = (sh) => {                                       // no visible tiling: two scales of the texture, big lush / sun-dried patches, moss, bare earth
      sh.fragmentShader = NOISE + sh.fragmentShader.replace('#include <map_fragment>', `
        vec2 gw = vMapUv * 15.0;
        vec4 t1 = texture2D(map, vMapUv); vec4 t2 = texture2D(map, mat2(0.8, -0.6, 0.6, 0.8) * vMapUv * 0.43 + 0.17);
        diffuseColor *= mix(t1, t2, smoothstep(0.3, 0.7, vnoise(gw * 0.05)));
        vec2 rw = mat2(0.6, -0.8, 0.8, 0.6) * gw;
        float big = vnoise(gw * 0.018) * 0.6 + vnoise(gw * 0.045) * 0.4;
        diffuseColor.rgb *= mix(${glsl(LOOK.shade.low)}, ${glsl(LOOK.shade.high)}, big);
        float moss = smoothstep(0.58, 0.8, vnoise(rw * 0.11 + 7.0) * 0.7 + vnoise(gw * 0.3) * 0.3); diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * ${glsl(LOOK.shade.moss)}, moss * 0.55);
        float dirt = smoothstep(0.66, 0.84, vnoise(rw * 0.07 + 31.0) * 0.7 + vnoise(gw * 0.21 + 9.0) * 0.3) * (0.7 + 0.3 * vnoise(gw * 1.3));
        diffuseColor.rgb = mix(diffuseColor.rgb, ${glsl(LOOK.shade.dirt)}, dirt * ${LOOK.shade.dirtAmt.toFixed(2)});`);
    };
    groundMat.customProgramCacheKey = () => 'ch1-ground' + LOOK.name;
    const sTiles = new Set<number>(); for (const p of SPTS) { const r = p.hw + 3; for (const [ax, az] of [[-r, -r], [r, -r], [-r, r], [r, r]]) sTiles.add(Math.floor((p.x + ax - GX0) / T) * 1000 + Math.floor((p.z + az - GZ0) / T)); }
    for (let tj = 0; tj < NTZ; tj++) for (let ti = 0; ti < NTX; ti++) {
      const x0 = GX0 + ti * T, z0 = GZ0 + tj * T;
      let fine = sTiles.has(ti * 1000 + tj), hf = GY;
      if (boxes.some((b) => b.x1 > x0 && b.x0 < x0 + T && b.z1 > z0 && b.z0 < z0 + T)) { hf = terrainH(x0, z0); for (let a = 0; a <= 32 && !fine; a++) for (let c = 0; c <= 32 && !fine; c++) if (Math.abs(terrainH(x0 + a * 0.5, z0 + c * 0.5) - hf) > 0.01) fine = true; }   // only where the ground actually moves
      const key = fine ? `${Math.floor(ti / 3)},${Math.floor(tj / 3)}` : 'flat'; const P = parts.get(key) ?? parts.set(key, { pos: [], uv: [], idx: [] }).get(key)!;
      const n = fine ? 32 : 1, st = T / n, base = P.pos.length / 3;
      for (let b = 0; b <= n; b++) for (let a = 0; a <= n; a++) { const x = x0 + a * st, z = z0 + b * st; P.pos.push(x, (fine ? terrainH(x, z) : hf) - 0.02, z); P.uv.push(x / 15, z / 15); }
      for (let b = 0; b < n; b++) for (let a = 0; a < n; a++) { const q2 = base + b * (n + 1) + a; P.idx.push(q2, q2 + n + 1, q2 + 1, q2 + 1, q2 + n + 1, q2 + n + 2); }
    }
    for (const P of parts.values()) {
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P.pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(P.uv, 2)); g.setIndex(P.idx); g.computeVertexNormals();
      const nr = g.getAttribute('normal') as THREE.BufferAttribute, ps = g.getAttribute('position') as THREE.BufferAttribute; const col = new Float32Array(nr.count * 3);
      for (let i = 0; i < nr.count; i++) {
        const k = Math.min(1, Math.max(0, (0.93 - Math.abs(nr.getY(i))) / 0.35)), h = ps.getY(i) + 0.02 - GY;
        let r = 1, gg = 1, bb = 1;
        if (h > 0.4) { const u = Math.min(1, h / 4); r = 1 + 0.16 * u; gg = 1 + 0.08 * u; bb = 1 - 0.12 * u; }              // hilltops: drier, sunlit grass
        if (h < -0.4) { const u = Math.min(1, -h / 2.5); r = 1 - 0.38 * u; gg = 1 - 0.5 * u; bb = 1 - 0.52 * u; }          // trench floors: dark mud
        col[i * 3] = r * (1 - 0.2 * k); col[i * 3 + 1] = gg * (1 - 0.36 * k); col[i * 3 + 2] = bb * (1 - 0.4 * k);
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.computeBoundingSphere(); groundGeos.push(g);
      const ground = new THREE.Mesh(g, groundMat); ground.receiveShadow = true; scene.add(ground);
    }
  }

  // the temple stands on its hill: built in a group raised TY m, with every height computed as if it stood on the ground
  const tg = new THREE.Group(); tg.position.y = TY; scene.add(tg); TYH = 0; const topBefore = topY.slice();
  // ---- floors: paved tops, stone terrace bodies under raised rooms, real steps on the stairs
  const floorMat = agedPatches(new THREE.MeshStandardMaterial({ map: flagTex(), color: 0xd8d6c4, roughness: 0.95 }), 'floor');
  const stoneMat = agedPatches(new THREE.MeshStandardMaterial({ map: blockTex(), roughness: 0.95 }), 'wall', true);
  const floorGeos: THREE.BufferGeometry[] = [], baseGeos: THREE.BufferGeometry[] = [], stepGeos: THREE.BufferGeometry[] = []; const stairBits: THREE.Vector3[] = [];
  for (const f of FLOORS) {
    const w = rectWorld(f.r); const W = w.x1 - w.x0, D = w.z1 - w.z0, cx = (w.x0 + w.x1) / 2, cz = (w.z0 + w.z1) / 2;
    if (!f.stairs) {
      const top = box(W, 0.14, D, 2.0); top.translate(cx, f.h - 0.07, cz); floorGeos.push(top);
      const bodyH = f.h + 0.32 - 0.14; if (bodyH > 0.02) { const b = box(W, bodyH, D, 1.6); b.translate(cx, -0.32 + bodyH / 2, cz); baseGeos.push(b); }
      continue;
    }
    const h0 = f.h, h1 = f.h1 ?? f.h, along = f.stairs === 'ns' ? D : W;
    const n = Math.abs(h1 - h0) > 0.05 ? Math.max(2, Math.round(Math.abs(h1 - h0) / 0.2)) : Math.floor(along / 0.55);
    for (let k = 0; k < n; k++) {                                               // step k covers slice k (from the h0 edge), its top at the ramp height mid-slice
      const t = (k + 0.5) / n, hk = Math.abs(h1 - h0) > 0.05 ? h0 + (h1 - h0) * t + 0.08 : 0.04;
      const across = f.stairs === 'ns' ? W : D;
      const cut = f.ruin && rnd() < 0.5 ? (0.08 + rnd() * 0.16) * across : 0, side = rnd() < 0.5 ? -1 : 1;   // ruined: a broken-off end
      const slice = along / n, hh = hk + 0.32 - (f.ruin ? rnd() * 0.06 : 0);
      const g = f.stairs === 'ns' ? box(W - cut, hh, slice + 0.02, 1.2) : box(slice + 0.02, hh, D - cut, 1.2);
      // 'ns' runs from north (py small = z large) to south; 'ew' from west (px small = x large) to east
      if (f.stairs === 'ns') g.translate(cx + side * cut / 2, -0.32 + hh / 2, w.z1 - (k + 0.5) * slice); else g.translate(w.x1 - (k + 0.5) * slice, -0.32 + hh / 2, cz + side * cut / 2);
      if (cut > 0) stairBits.push(f.stairs === 'ns' ? new THREE.Vector3(cx - side * (W / 2 - cut / 2), hk, w.z1 - (k + 0.5) * slice) : new THREE.Vector3(w.x1 - (k + 0.5) * slice, hk, cz - side * (D / 2 - cut / 2)));
      stepGeos.push(g);
    }
  }
  const floors = new THREE.Mesh(mergeGeometries(floorGeos), floorMat); floors.receiveShadow = true; tg.add(floors);
  if (baseGeos.length) tg.add(Object.assign(new THREE.Mesh(mergeGeometries(baseGeos), stoneMat), { receiveShadow: true, castShadow: true }));
  tg.add(Object.assign(new THREE.Mesh(mergeGeometries(stepGeos), new THREE.MeshStandardMaterial({ map: blockTex(), color: 0xc4c0a8, roughness: 1 })), { receiveShadow: true, castShadow: true }));

  // ---- canal water (recessed below the walk) + its stone bed
  const canalGeos: THREE.BufferGeometry[] = [];
  for (const r of WATER) {
    const w = rectWorld(r); const g = new THREE.PlaneGeometry(w.x1 - w.x0, w.z1 - w.z0); g.rotateX(-Math.PI / 2);
    const uv = g.getAttribute('uv') as THREE.BufferAttribute;                                    // across = z, along = -x (flows east)
    for (let i = 0; i < uv.count; i++) { const u = uv.getX(i), v = uv.getY(i); uv.setXY(i, v, (1 - u) * (w.x1 - w.x0) + w.x0); }
    g.translate((w.x0 + w.x1) / 2, -0.16, (w.z0 + w.z1) / 2); canalGeos.push(g);
    const bed = box(w.x1 - w.x0, 0.2, w.z1 - w.z0, 2); bed.translate((w.x0 + w.x1) / 2, -0.42, (w.z0 + w.z1) / 2);
    const bm = new THREE.Mesh(bed, stoneMat); tg.add(bm);
  }
  tg.add(new THREE.Mesh(mergeGeometries(canalGeos), waterMaterial(time, 0.55)));

  // ---- walls: greedy rectangles over void cells that touch the temple, as tall as the floor beside them; then broken up into
  //      chunks, some crumbled to stumps (a ruin), pillars only on standing stretches, vines and floor damage on top
  const WALL_H = 3.75;                                                          // 3x the old height: no climbing out; the gates, stairs and breaches are the only ways out
  const cellH = (i: number, j: number) => heightCh1(B.x0 + (i + 0.5) * CELL, B.z0 + (j + 0.5) * CELL);
  const wallTop = new Float32Array(NX * NZ).fill(-1);
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
    if (cell(i, j) !== 0) continue; let top = -1;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) if (cell(i + di, j + dj) !== 0) top = Math.max(top, cellH(i + di, j + dj));
    if (top >= 0) wallTop[j * NX + i] = Math.round((top + WALL_H) * 5) / 5;          // quantised so long runs merge
  }
  // breaches: the wall beyond the low (ground) end of every ruined staircase has collapsed, so the hero walks out into the jungle
  const breachEnds: THREE.Vector3[] = [...stairBits];
  for (const f of FLOORS) {
    if (!f.ruin && !f.open) continue; const w = rectWorld(f.r); const lowFirst = f.h < (f.h1 ?? f.h);   // open: a gate, its end left clear (no rubble)
    const strip = f.stairs === 'ns' ? { x0: w.x0 + 0.05, x1: w.x1 - 0.05, z0: (lowFirst ? w.z1 : w.z0) - 1.3, z1: (lowFirst ? w.z1 : w.z0) + 1.3 }
      : { x0: (lowFirst ? w.x1 : w.x0) - 1.3, x1: (lowFirst ? w.x1 : w.x0) + 1.3, z0: w.z0 + 0.05, z1: w.z1 - 0.05 };
    for (let j = cj(strip.z0); j <= cj(strip.z1); j++) for (let i = ci(strip.x0); i <= ci(strip.x1); i++) if (i >= 0 && j >= 0 && i < NX && j < NZ && grid[j * NX + i] === 0) wallTop[j * NX + i] = -1;
    if (f.open) continue;
    if (f.stairs === 'ns') { const z = lowFirst ? w.z1 + 0.6 : w.z0 - 0.6; breachEnds.push(new THREE.Vector3(w.x0 - 0.3, 0.1, z), new THREE.Vector3(w.x1 + 0.3, 0.1, z)); }
    else { const x = lowFirst ? w.x1 + 0.6 : w.x0 - 0.6; breachEnds.push(new THREE.Vector3(x, 0.1, w.z0 - 0.3), new THREE.Vector3(x, 0.1, w.z1 + 0.3)); }
  }
  // everything outside the temple and its standing walls is open jungle ground, up to the fog band at the map's edge
  const e0 = Math.ceil(EDGE / CELL);
  for (let j = e0; j < NZ - e0; j++) for (let i = e0; i < NX - e0; i++) { const k = j * NX + i; if (grid[k] === 0 && wallTop[k] < 0) grid[k] = 4; }
  const wallChunks: Array<{ cx: number; cz: number; alongX: boolean; len: number; Th: number; top: number }> = [];
  const used = new Uint8Array(NX * NZ); const wallGeos: THREE.BufferGeometry[] = []; const copeGeos: THREE.BufferGeometry[] = []; const posts: THREE.Vector3[] = [];
  const brokenTops: THREE.Vector3[] = [...breachEnds, ...breachEnds];              // fallen blocks pile up either side of each breach
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
    const T = wallTop[j * NX + i]; if (used[j * NX + i] || T < 0) continue;
    let i1 = i; while (i1 + 1 < NX && !used[j * NX + i1 + 1] && wallTop[j * NX + i1 + 1] === T) i1++;
    let j1 = j; const rowOk = (jj: number) => { for (let k = i; k <= i1; k++) if (used[jj * NX + k] || wallTop[jj * NX + k] !== T) return false; return true; };
    while (j1 + 1 < NZ && rowOk(j1 + 1)) j1++;
    for (let jj = j; jj <= j1; jj++) for (let k = i; k <= i1; k++) used[jj * NX + k] = 1;
    const x0 = B.x0 + i * CELL, x1 = B.x0 + (i1 + 1) * CELL, z0 = B.z0 + j * CELL, z1 = B.z0 + (j1 + 1) * CELL;
    const alongX = x1 - x0 >= z1 - z0, L = alongX ? x1 - x0 : z1 - z0, Th = alongX ? z1 - z0 : x1 - x0;
    // chunks of 1-2 m; ~25% crumble to 35-70% height, a few to rubble stumps
    let a = 0; let lastStanding = true;
    while (a < L - 0.01) {
      const len = Math.min(L - a, 1 + rnd() * 1.2); const r = rnd();
      const keep0 = L < 2.2 ? 1 : r < 0.08 ? 0.22 : r < 0.3 ? 0.35 + rnd() * 0.35 : 1;
      const keep = keep0 === 1 ? 1 : 0.78 + (keep0 - 0.22) * 0.3;                     // crumbled: only the top falls away (it stays above a double jump)
      const top = T - WALL_H + WALL_H * keep, hh = top + 0.32;
      const c0 = a + len / 2;
      const g = alongX ? box(len, hh, Th, 1.6) : box(Th, hh, len, 1.6);
      const cx = alongX ? x0 + c0 : (x0 + x1) / 2, cz = alongX ? (z0 + z1) / 2 : z0 + c0;
      g.translate(cx, -0.32 + hh / 2, cz); wallGeos.push(g);
      if (hh > 1.1) wallChunks.push({ cx, cz, alongX, len, Th, top });
      { const ax0 = alongX ? x0 + a : x0, ax1 = alongX ? x0 + a + len : x1, az0 = alongX ? z0 : z0 + a, az1 = alongX ? z1 : z0 + a + len;
        for (let jj = cj(az0 + 0.01); jj <= cj(az1 - 0.01); jj++) for (let ii = ci(ax0 + 0.01); ii <= ci(ax1 - 0.01); ii++) if (ii >= 0 && jj >= 0 && ii < NX && jj < NZ) topY[jj * NX + ii] = top; }
      if (keep === 1) { const cp = alongX ? box(len + 0.06, 0.14, Th + 0.12, 1.6) : box(Th + 0.12, 0.14, len + 0.06, 1.6); cp.translate(cx, T + 0.07, cz); copeGeos.push(cp); }
      else brokenTops.push(new THREE.Vector3(cx, top, cz));
      if (keep === 1 && (!lastStanding || a === 0)) posts.push(new THREE.Vector3(alongX ? x0 + a : cx, T - WALL_H, alongX ? cz : z0 + a));
      lastStanding = keep === 1; a += len;
    }
    if (lastStanding) posts.push(new THREE.Vector3(alongX ? x1 : (x0 + x1) / 2, T - WALL_H, alongX ? (z0 + z1) / 2 : z1));
  }
  const walls = new THREE.Mesh(mergeGeometries(wallGeos), stoneMat); walls.castShadow = true; walls.receiveShadow = true; tg.add(walls);
  { // 500 years of jungle: vines hang from the wall tops on both faces (one instanced draw; their own random stream)
    const R = agedRng(), vm: THREE.Matrix4[] = [], o = new THREE.Object3D();
    for (const w of wallChunks) for (const side of [-1, 1]) {
      const n = Math.floor(w.len * 1.7 * R() + (R() < 0.5 ? 1 : 0));
      for (let k = 0; k < n; k++) {
        const u = (R() - 0.5) * w.len * 0.85, H = Math.min(w.top + 0.25, 1.2 + R() * 2.6), W = 0.5 + R() * 0.6, off = w.Th / 2 + 0.025;
        o.position.set(w.alongX ? w.cx + u : w.cx + side * off, w.top + 0.08, w.alongX ? w.cz + side * off : w.cz + u);
        o.rotation.set(0, w.alongX ? (side > 0 ? 0 : Math.PI) : (side > 0 ? Math.PI / 2 : -Math.PI / 2), 0); o.scale.set(W, H, 1); o.updateMatrix(); vm.push(o.matrix.clone());
      }
    }
    if (vm.length) {
      const vg = new THREE.PlaneGeometry(1, 1).translate(0, -0.5, 0), vmat = new THREE.MeshStandardMaterial({ map: vineTex(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.9 });
      const vi = new THREE.InstancedMesh(vg, vmat, vm.length); vm.forEach((m, k) => vi.setMatrixAt(k, m)); vi.computeBoundingSphere(); tg.add(vi);
    }
  }
  tg.add(Object.assign(new THREE.Mesh(mergeGeometries(copeGeos), agedPatches(new THREE.MeshStandardMaterial({ map: blockTex(), color: 0xa8ac84, roughness: 0.95 }), 'cope', true)), { castShadow: true }));
  const uniq: THREE.Vector3[] = []; for (const q of posts) if (!uniq.some((u) => (u.x - q.x) ** 2 + (u.z - q.z) ** 2 < 2.5)) uniq.push(q);
  const gold = new THREE.MeshStandardMaterial({ color: 0xc89a48, roughness: 0.35, metalness: 0.85 });
  const postGeo = mergeGeometries([box(0.9, 4.6, 0.9, 1.6).translate(0, 1.98, 0), box(1.1, 0.2, 1.1, 1.6).translate(0, 4.38, 0)]);   // pillars rise above the taller walls
  const postMesh = new THREE.InstancedMesh(postGeo, stoneMat, uniq.length); const goldCut = gold.clone(); goldCut.onBeforeCompile = (sh) => focusCut(sh); goldCut.customProgramCacheKey = () => 'gold-cut';   // the cap goes with its pillar
  const finial = new THREE.InstancedMesh(new THREE.ConeGeometry(0.22, 0.5, 8).translate(0, 4.73, 0), goldCut, uniq.length);
  const m4 = new THREE.Matrix4(); let nf2 = 0;
  uniq.forEach((q) => { if (rnd() < 0.15) return; m4.makeTranslation(q.x, q.y, q.z); postMesh.setMatrixAt(nf2, m4); finial.setMatrixAt(nf2++, m4); });   // a few posts lost too
  postMesh.count = finial.count = nf2; postMesh.castShadow = true; tg.add(postMesh, finial);

  // ruin dressing: rubble on the broken stretches, missing paving and moss on the floors, vines down the walls
  const ruinTmp = new THREE.Object3D();
  const rubbleMat2 = new THREE.MeshStandardMaterial({ map: stoneMat.map, color: 0xb4ae98, roughness: 1, flatShading: true });
  const rubble = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), rubbleMat2, brokenTops.length * 4); let nrb = 0;
  for (const q of brokenTops) for (let k = 0; k < 4; k++) {
    const s2 = 0.18 + rnd() * 0.25; const off = (rnd() - 0.5) * 2.2;
    ruinTmp.position.set(q.x + (rnd() < 0.5 ? off : (rnd() - 0.5) * 0.8), k === 0 ? q.y + s2 * 0.4 : heightNear(q.x, q.z) * 0 + s2 * 0.3 - 0.25, q.z + (rnd() < 0.5 ? (rnd() - 0.5) * 0.8 : off));
    if (k > 0) ruinTmp.position.y = Math.max(-0.25, heightCh1(ruinTmp.position.x, ruinTmp.position.z) + s2 * 0.3 - (cell(ci(ruinTmp.position.x), cj(ruinTmp.position.z)) === 0 ? 0.3 : 0));
    ruinTmp.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3); ruinTmp.scale.set(s2, s2 * 0.7, s2); ruinTmp.updateMatrix(); rubble.setMatrixAt(nrb++, ruinTmp.matrix);
  }
  rubble.count = nrb; rubble.castShadow = true; tg.add(rubble);
  const patchGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const blobTex = (rgb: string) => tex(128, (g, s2) => {                                         // soft irregular blob with a ragged edge
    for (let k = 0; k < 14; k++) { const gr = g.createRadialGradient(0, 0, 0, 0, 0, 1); gr.addColorStop(0, `rgba(${rgb},0.9)`); gr.addColorStop(1, `rgba(${rgb},0)`);
      g.save(); g.translate(s2 * (0.3 + rnd() * 0.4), s2 * (0.3 + rnd() * 0.4)); g.scale(s2 * (0.12 + rnd() * 0.16), s2 * (0.1 + rnd() * 0.14)); g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 1, 0, 7); g.fill(); g.restore(); }
    for (let k = 0; k < 400; k++) { g.fillStyle = `rgba(0,0,0,${rnd() * 0.25})`; g.fillRect(rnd() * s2, rnd() * s2, 2, 2); } });
  const holes = new THREE.InstancedMesh(patchGeo, new THREE.MeshStandardMaterial({ map: blobTex('45,30,20'), transparent: true, depthWrite: false, roughness: 1 }), 160);
  const moss = new THREE.InstancedMesh(patchGeo, new THREE.MeshStandardMaterial({ map: blobTex('62,82,40'), transparent: true, depthWrite: false, roughness: 1 }), 200);
  let nh = 0, nm = 0;
  for (let k = 0; k < 4000 && (nh < 160 || nm < 200); k++) {
    const f = FLOORS[Math.floor(rnd() * FLOORS.length)]; if (f.stairs) continue; const w = rectWorld(f.r);
    const x = w.x0 + 0.6 + rnd() * (w.x1 - w.x0 - 1.2), z = w.z0 + 0.6 + rnd() * (w.z1 - w.z0 - 1.2);
    const nearEdge = !walkableCh1(x + 1.2, z) || !walkableCh1(x - 1.2, z) || !walkableCh1(x, z + 1.2) || !walkableCh1(x, z - 1.2);
    const isMoss = rnd() < (nearEdge ? 0.75 : 0.45);
    ruinTmp.position.set(x, f.h + (isMoss ? 0.012 : 0.008), z); ruinTmp.rotation.set(0, rnd() * 3, 0);
    const sx = isMoss ? 0.8 + rnd() * 1.6 : 0.5 + rnd() * 0.6; ruinTmp.scale.set(sx, 1, isMoss ? sx * (0.5 + rnd() * 0.6) : sx); ruinTmp.updateMatrix();
    if (isMoss && nm < 200) moss.setMatrixAt(nm++, ruinTmp.matrix); else if (!isMoss && nh < 160) holes.setMatrixAt(nh++, ruinTmp.matrix);
  }
  holes.count = nh; moss.count = nm; holes.receiveShadow = moss.receiveShadow = true; tg.add(holes, moss);
  const vineGeo = mergeGeometries([new THREE.BoxGeometry(0.05, 1, 0.05).translate(0, -0.5, 0).toNonIndexed(), new THREE.IcosahedronGeometry(0.16, 0).translate(0.05, -0.35, 0), new THREE.IcosahedronGeometry(0.13, 0).translate(-0.04, -0.75, 0)]);
  const vines = new THREE.InstancedMesh(vineGeo, new THREE.MeshStandardMaterial({ color: 0x3f6a2a, roughness: 1, flatShading: true }), 220); let nv = 0;
  for (let k = 0; k < 3000 && nv < 220; k++) {
    const i = ci(B0.x0) + Math.floor(rnd() * (ci(B0.x1) - ci(B0.x0))), j = cj(B0.z0) + Math.floor(rnd() * (cj(B0.z1) - cj(B0.z0))); const T = wallTop[j * NX + i]; if (T < 0) continue;
    ruinTmp.position.set(B.x0 + (i + 0.5) * CELL + (rnd() - 0.5) * 0.4, T + 0.05, B.z0 + (j + 0.5) * CELL + (rnd() - 0.5) * 0.4);
    ruinTmp.rotation.set(0, rnd() * 6.28, 0); ruinTmp.scale.set(1, 0.6 + rnd() * 1.1, 1); ruinTmp.updateMatrix(); vines.setMatrixAt(nv++, ruinTmp.matrix);
  }
  vines.count = nv; tg.add(vines);

  const propStart = tg.children.length;                                             // props below get lifted onto the floor under them
  // ---- gates: pillars + lintel + tiered Burmese roof (pyatthat) with a gilded spire
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x6e4a2a, roughness: 0.55, metalness: 0.35 });
  const gates: Array<{ g: THREE.Group; span: number; scale: number }> = [];
  function gate(px: number, py: number, along: 'x' | 'z', span: number, scale = 1, opening = true): void {
    const g = new THREE.Group(); const p = at(px, py); g.position.copy(p); if (along === 'z') g.rotation.y = Math.PI / 2;
    const half = span / 2 + 0.45, H = 2.5 * scale;                                              // pillars stand just outside the doorway
    for (const s2 of [-1, 1]) { if (along === 'x') solid(p.x + s2 * half, p.z, 0.5); else solid(p.x, p.z - s2 * half, 0.5); }
    for (const s of [-1, 1]) {
      const col = new THREE.Mesh(box(0.8, H + 0.3, 0.8, 1.6), stoneMat); col.position.set(s * half, H / 2 - 0.15, 0); col.castShadow = true; g.add(col);
      const knob = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.5, 8), gold); knob.position.set(s * half, H + 0.55, 0); g.add(knob);
    }
    if (opening) { const lintel = new THREE.Mesh(box(span + 1.7, 0.32, 0.75, 1.6), stoneMat); lintel.position.set(0, H + 0.1, 0); lintel.castShadow = true; g.add(lintel); }
    const crestW = Math.min(2.4, span * 0.42) * scale, base = opening ? H + 0.26 : 1.4;                // small tiered crest (pyatthat) over the middle
    for (let k = 0; k < 3; k++) {
      const w = crestW * (1 - k * 0.3), y = base + 0.16 + k * 0.34;
      const tier = new THREE.Mesh(box(w, 0.3, 0.62 - k * 0.12, 1.6), roofMat); tier.position.set(0, y, 0); tier.castShadow = true; g.add(tier);
      for (const s of [-1, 1]) { const horn = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.34, 5), gold); horn.position.set(s * w / 2, y + 0.2, 0); horn.rotation.z = -s * 0.55; g.add(horn); }
    }
    const spire = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.95 * scale, 8), gold); spire.position.set(0, base + 3 * 0.34 + 0.45, 0); g.add(spire);
    const plate = new THREE.Mesh(new THREE.CircleGeometry(0.3, 16), gold); plate.position.set(0, base + 0.2, 0.33); g.add(plate);
    tg.add(g); gates.push({ g, span, scale }); void opening;
  }
  gate(252, 292, 'x', 4.75); gate(358, 245, 'z', 4.5); gate(712, 245, 'z', 4.5); gate(860, 372, 'x', 6.0);
  gate(235, 722, 'x', 5.5); gate(880, 642, 'x', 6.0, 1.15); gate(1098, 777, 'z', 7.25); gate(1262, 777, 'z', 7.25, 1.35);
  gate(318, 116, 'x', 3.0, 1.1); gate(935, 98, 'x', 4.0, 1.25);                                  // archways at the top of the north stairs

  // ---- light sources: stone lanterns (Myanmar) and Dire-style braziers
  const lamps: Lamp[] = []; const flameMat = new THREE.MeshBasicMaterial({ color: 0xffb04a }); const emberMat = new THREE.MeshBasicMaterial({ color: 0xff5a1e });
  const glowTex = tex(64, (g, s) => { const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2); gr.addColorStop(0, 'rgba(255,190,110,1)'); gr.addColorStop(1, 'rgba(255,120,40,0)'); g.fillStyle = gr; g.fillRect(0, 0, s, s); });
  let lights = 0; const braziers: THREE.Group[] = []; const fireSpots: THREE.Vector3[] = [];
  const flameCones: Array<{ cone: THREE.Mesh; h: number; dire: boolean }> = []; const flames: Array<{ s: THREE.Sprite; phase: number; speed: number }> = [];
  function lantern(px: number, py: number, dire = false, withLight = false): void {
    // the Tripo lotus brazier (art/source/props/brazier.glb) stands here; loadProps() puts the model into this holder
    const p = at(px, py); const H = dire ? 1.6 : 1.25; const top = H * 0.93;
    const holder = new THREE.Group(); holder.position.set(p.x, 0, p.z); holder.rotation.y = rnd() * 6.28; holder.userData.h = H; tg.add(holder); braziers.push(holder);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(H * 0.17, H * 0.45, 8).translate(0, H * 0.2, 0), dire ? emberMat : flameMat); flame.position.set(p.x, top, p.z); tg.add(flame);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: dire ? 0xff6a2a : 0xffb060, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.position.set(p.x, top + H * 0.2, p.z); glow.scale.setScalar(H * 2.0); tg.add(glow);
    solid(p.x, p.z, H * 0.38);
    fireSpots.push(new THREE.Vector3(p.x, top, p.z)); flameCones.push({ cone: flame, h: H, dire });
    if (withLight && lights < 8) { lights++; const l = new THREE.PointLight(dire ? 0xff5a22 : 0xffa64a, dire ? 26 : 18, dire ? 13 : 10, 2); l.position.set(p.x, top + 1.3, p.z); tg.add(l); lamps.push({ light: l, flame, base: dire ? 26 : 18 }); }
  }
  lantern(185, 195, false, true); lantern(325, 195); lantern(780, 160); lantern(1080, 160, false, true); lantern(780, 335); lantern(1080, 335);
  lantern(135, 830, false, true); lantern(315, 830);
  lantern(520, 690, true, true); lantern(1030, 690, true); lantern(520, 990, true); lantern(1030, 990, true, true);
  lantern(150, 525, true); lantern(1045, 525, true, true); lantern(1250, 720, true, true); lantern(1250, 835, true);

  // ---- room set pieces, ruined: cracked altars, a broken statue, toppled pedestals and fallen columns
  const jade = new THREE.MeshStandardMaterial({ color: 0x3f8f72, roughness: 0.3, metalness: 0.1, emissive: 0x0d2a20 });
  const add = (m: THREE.Mesh, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => { m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = true; m.receiveShadow = true; tg.add(m); return m; };
  { // Jade Shrine: stepped dais with a cracked top tier, the jade altar split in two, one half fallen; a broken seated statue behind
    const p = at(255, 180); solidBox(p.x, p.z, 4.6, 3.0); solid(p.x + 2.2, p.z + 1.3, 0.8);
    add(new THREE.Mesh(box(4.6, 0.26, 3.0, 1.6), stoneMat), p.x, 0.13, p.z);
    add(new THREE.Mesh(box(3.7, 0.26, 2.4, 1.6), stoneMat), p.x, 0.39, p.z, 0, 0.03, 0);
    add(new THREE.Mesh(box(1.5, 0.26, 1.9, 1.6), stoneMat), p.x - 0.75, 0.65, p.z, 0, 0, 0.04);              // top tier, cracked in two
    add(new THREE.Mesh(box(1.3, 0.26, 1.9, 1.6), stoneMat), p.x + 0.85, 0.6, p.z + 0.1, 0.05, -0.12, -0.08);
    add(new THREE.Mesh(box(1.25, 0.9, 1.4, 1), jade), p.x - 0.6, 1.23, p.z, 0, 0.05, 0.06);                  // standing half of the altar
    add(new THREE.Mesh(box(1.1, 0.8, 1.3, 1), jade), p.x + 2.2, 0.38, p.z + 1.3, 0.2, 0.9, 1.35);             // fallen half, on its side
    for (let k = 0; k < 7; k++) add(new THREE.Mesh(new THREE.DodecahedronGeometry(0.1 + rnd() * 0.12, 0), jade), p.x + 1.2 + rnd() * 2, 0.08, p.z + rnd() * 2, rnd() * 3, rnd() * 3, 0);
    const st = at(255, 140); solid(st.x, st.z, 1.1); solid(st.x - 1.6, st.z - 1.0, 0.4); const statue = new THREE.MeshStandardMaterial({ color: 0x8c7a62, roughness: 0.9, flatShading: true });
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.05, 0.5, 10), statue), st.x, 0.25, st.z);                    // lotus base
    add(new THREE.Mesh(new THREE.SphereGeometry(0.8, 9, 7).scale(1, 0.75, 0.7), statue), st.x, 0.95, st.z);         // crossed legs
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.62, 1.0, 9), statue), st.x, 1.55, st.z, 0, 0, 0.05);      // torso, shoulder broken off
    add(new THREE.Mesh(new THREE.SphereGeometry(0.36, 9, 7), statue), st.x - 1.6, 0.36, st.z - 1.0, 0.4, 0, 0.9);    // the head, fallen
    add(new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.4, 7), statue), st.x - 1.95, 0.25, st.z - 1.25, 0, 0, 1.6);     // its crown knob
  }
  { // Offering Hall: stepped altar whose upper block has slid off, bowl tipped over, two of four pedestals toppled
    const p = at(930, 250); solidBox(p.x, p.z, 3.8, 3.8); solid(p.x + 1.9, p.z - 1.2, 1.1); solid(p.x - 1.4, p.z + 1.9, 0.55);
    add(new THREE.Mesh(box(3.8, 0.32, 3.8, 1.6), stoneMat), p.x, 0.16, p.z);
    add(new THREE.Mesh(box(2.8, 0.32, 2.8, 1.6), stoneMat), p.x, 0.48, p.z, 0, 0.06, 0);
    add(new THREE.Mesh(box(1.8, 0.4, 1.8, 1.6), stoneMat), p.x + 1.9, 0.5, p.z - 1.2, 0.08, 0.5, 0.42);            // slid off and tilted
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.35, 0.4, 14, 1, true), gold), p.x - 1.4, 0.4, p.z + 1.9, 1.7, 0.4, 0);   // bowl on its side
    for (const [px, py, fallen] of [[850, 190, false], [1010, 190, true], [850, 315, true], [1010, 315, false]] as const) {
      const q = at(px, py); solid(fallen ? q.x + 0.4 : q.x, q.z, 0.55, fallen ? 0.6 : 99);
      if (!fallen) { add(new THREE.Mesh(box(0.9, 0.7, 0.9, 1.6), stoneMat), q.x, 0.35, q.z); add(new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.22, 0.26, 12), gold), q.x, 0.83, q.z); }
      else { add(new THREE.Mesh(box(0.9, 0.7, 0.9, 1.6), stoneMat), q.x + 0.4, 0.45, q.z, 0, 0.4, 1.57); add(new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.22, 0.26, 12), gold), q.x + 1.3, 0.2, q.z + 0.6, 1.2, 0, 0.6); }
    }
  }
  { const rt = reliefTex(); rt.repeat.set(1, 0.5); rt.offset.set(0, 0.5); const rm = new THREE.MeshStandardMaterial({ map: rt, roughness: 0.85 });
    for (const [px, w] of [[141, 3.5], [320, 2.6]] as const) {                                       // carved panels either side of the north doorway, facing the camera
      const q = at(px, 727); const panel = new THREE.Mesh(new THREE.PlaneGeometry(w, 1.75), rm); panel.position.set(q.x, 0.95, q.z); panel.rotation.y = Math.PI; tg.add(panel);
    } }
  buildSealPillar(tg as unknown as THREE.Scene, CH1.sealPillar.x, CH1.sealPillar.z);
  { const q = at(775, 840); const seal = new THREE.Mesh(new THREE.CircleGeometry(4.6, 48), new THREE.MeshStandardMaterial({ map: lotusTex(), transparent: true, roughness: 0.6, metalness: 0.3, depthWrite: false }));
    seal.rotation.x = -Math.PI / 2; seal.position.set(q.x, 0.012, q.z); seal.receiveShadow = true; tg.add(seal); }
  for (const [px, py, broken] of [[520, 690, false], [1030, 690, true], [520, 990, true], [1030, 990, false]] as const) {   // great pillars of the court: two snapped
    const q = at(px, py); const x = q.x + (px < 775 ? -1.6 : 1.6); solid(x, q.z, 0.95);
    if (broken) solidLine(x, q.z + 0.6, x + (px < 775 ? 3.1 : -3.1), q.z + 0.6, 0.6, 0.7);
    if (!broken) {
      add(new THREE.Mesh(box(1.4, 3.6, 1.4, 1.6), stoneMat), x, 1.8, q.z); add(new THREE.Mesh(box(1.8, 0.3, 1.8, 1.6), stoneMat), x, 3.75, q.z);
      add(new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.0, 8), gold), x, 4.4, q.z);
    } else {
      add(new THREE.Mesh(box(1.4, 1.5, 1.4, 1.6), stoneMat), x, 0.75, q.z, 0, 0.1, 0);                                  // stump
      add(new THREE.Mesh(box(1.3, 2.4, 1.3, 1.6), stoneMat), x + (px < 775 ? 1.9 : -1.9), 0.62, q.z + 0.6, 0.2, 0.3, Math.PI / 2 - 0.1);   // fallen shaft
    }
  }
  for (const [px, py, len, ry] of [[640, 760, 3.2, 0.3], [930, 980, 2.6, -1.2], [1000, 300, 2.4, 0.9], [560, 545, 2.0, 1.4]] as const) {   // fallen columns
    const q = at(px, py); const dx = -Math.cos(ry) * len / 2, dz = Math.sin(ry) * len / 2; solidLine(q.x - dx, q.z - dz, q.x + dx, q.z + dz, 0.45);
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.45, len, 10), stoneMat), q.x, 0.4, q.z, 0, ry, Math.PI / 2);
  }

  // ---- broken pillars along the canal (ruin dressing)
  const rubbleMat = new THREE.MeshStandardMaterial({ color: 0x4b554b, roughness: 1, flatShading: true });   // mossy grey river rock
  for (const [px, h] of [[330, 1.1], [410, 2.3], [555, 1.4], [670, 2.4], [735, 0.9], [1040, 2.0]] as const) {
    const q = at(px, 488); solid(q.x, q.z, 0.55); add(new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, h, 10), stoneMat), q.x, h / 2, q.z, 0, 0, rnd() * 0.06);
    add(new THREE.Mesh(new THREE.ConeGeometry(0.44, 0.5, 6), stoneMat), q.x, h + 0.12, q.z, 0.5, rnd() * 3, 0.3);
  }
  // lift every prop placed since propStart onto the floor beneath it (raised terrace, stairs)
  for (let k = propStart; k < tg.children.length; k++) { const o = tg.children[k]; if ((o as THREE.InstancedMesh).isInstancedMesh) continue; o.position.y += heightNear(o.position.x, o.position.z); }
  /** Instanced copies split into square chunks, so the camera only draws (and shadows) the chunks it can see. */
  TYH = TY; for (let k = 0; k < topY.length; k++) if (topY[k] !== topBefore[k] && topY[k] < 99) topY[k] += TY;   // the temple's solids, lifted with it
  /** Stand-ins waiting for their Tripo model (public/assets/p_*.glb: height 1, origin at the base centre, front toward +Z). When the GLB
   *  loads, the stand-in meshes hide and the model stands in their place, scaled to s (metres per model unit); the colliders stay. */
  const swaps: Array<{ f: string; hide: THREE.Object3D[]; at: THREE.Vector3; ry: number; s: [number, number, number]; tilt?: number; onLoad?: () => void }> = [];
  /** Everything a builder adds to the scene (to hide when its model arrives). */
  const grab = (fn: () => void): THREE.Object3D[] => { const n0 = scene.children.length; fn(); return scene.children.slice(n0); };
  /** Trees planted by hand (the village's palms and its temple tree): k is the tree kind (0 teak, 2 palm, 3 frangipani), s its size. */
  const villageTrees: Array<{ x: number; z: number; k: number; s: number }> = [];
  const chunked = (geo: THREE.BufferGeometry, mat: THREE.Material, mats: THREE.Matrix4[], size: number, shadow: boolean) => {
    const by = new Map<string, THREE.Matrix4[]>(); const v = new THREE.Vector3();
    for (const m of mats) { v.setFromMatrixPosition(m); const k = `${Math.floor(v.x / size)},${Math.floor(v.z / size)}`; (by.get(k) ?? by.set(k, []).get(k)!).push(m); }
    for (const list of by.values()) { const im = new THREE.InstancedMesh(geo, mat, list.length); list.forEach((m, i) => im.setMatrixAt(i, m)); im.computeBoundingSphere(); im.castShadow = shadow; scene.add(im); }
  };
  const rockMats: THREE.Matrix4[] = []; const tmp = new THREE.Object3D(); let nr = 0;
  const cullList: Array<{ im: THREE.InstancedMesh; c: THREE.Vector3; r: number; far: number }> = []; let cullT = 0, cullScan = 0;
  const addRock = (x: number, z: number, s: number) => { if (nr >= 900) return; tmp.position.set(x, heightCh1(x, z) + s * 0.3 - 0.05, z); tmp.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3); tmp.scale.set(s, s * 0.7, s); tmp.updateMatrix(); rockMats.push(tmp.matrix.clone()); nr++; };
  for (let k = 0; k < 40; k++) { const q = at(120 + rnd() * 950, 560 + rnd() * 18); if (walkableCh1(q.x, q.z)) continue; addRock(q.x, q.z, 0.15 + rnd() * 0.25); }
  for (let k = 0; k < 18; k++) { const q = at(440 + rnd() * 670, rnd() < 0.5 ? 650 : 1032); addRock(q.x, q.z, 0.2 + rnd() * 0.3); }

  // ---- river: winding down the west side and away to the south, banks of dark mud
  const river = new THREE.CatmullRomCurve3(([[26, 200], [32, 158], [43, 120], [47, 96], [42, 70], [38, 42], [36, 12], [37, -15], [40, -40], [51, -60], [74, -69], [106, -66], [140, -70], [176, -73], [212, -78], [245, -82]] as Array<[number, number]>).map(([x, z]) => growPt(x, z))
    .map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'catmullrom', 0.5);   // down the east foot of the temple hill, then west below it
  // the water and its banks wander: each side's width drifts on its own (three summed waves along the river, in metres)
  const RL = river.getLength();
  const wob = (t: number, k: number) => Math.sin(t * RL * 0.083 + k) * 0.5 + Math.sin(t * RL * 0.21 + k * 2.1) * 0.32 + Math.sin(t * RL * 0.57 + k * 3.7) * 0.18;
  const waterHW = (t: number, s: number) => 2.5 * (1 + 0.3 * wob(t, s < 0 ? 1 : 5)) + Math.sin(t * RL * 1.9 + s * 4) * 0.12 + Math.sin(t * RL * 4.3 + s) * 0.06;
  const bankHW = (t: number, s: number) => waterHW(t, s) + 1.3 + 2.2 * (0.5 + 0.5 * wob(t, s < 0 ? 9 : 13));
  {
    // mud: dark and wet at the waterline, drier and lighter outward, fading into the forest floor (vertex colour + alpha)
    const cols: Array<{ f: (t: number, s: number) => number; c: number; a: number }> = [
      { f: (t, s) => waterHW(t, s) - 0.6, c: 0x3a3226, a: 1 }, { f: (t, s) => waterHW(t, s) + 0.2, c: 0x4a3f2c, a: 1 },
      { f: (t, s) => waterHW(t, s) + 0.8, c: 0x564c34, a: 0.95 }, { f: (t, s) => (waterHW(t, s) + bankHW(t, s)) / 2 + 0.3, c: 0x4f5a30, a: 0.6 },
      { f: bankHW, c: 0x5e6842, a: 0 }];
    const SEG = 1400, pos: number[] = [], col: number[] = [], idx: number[] = []; const cc = new THREE.Color(); const per = cols.length * 2;
    for (let i = 0; i <= SEG; i++) {
      const t = i / SEG, p = river.getPointAt(t), tg = river.getTangentAt(t); const nl = Math.hypot(tg.x, tg.z) || 1, nx = -tg.z / nl, nz = tg.x / nl;
      for (const s of [-1, 1]) for (const cd of cols) {
        const d = cd.f(t, s) + (rnd() - 0.5) * 0.25; pos.push(p.x + nx * s * d, -0.29, p.z + nz * s * d);
        cc.setHex(cd.c).multiplyScalar(0.85 + rnd() * 0.3); col.push(cc.r, cc.g, cc.b, cd.a);
      }
      if (i < SEG) for (let side = 0; side < 2; side++) for (let k = 0; k < cols.length - 1; k++) {
        const a = i * per + side * cols.length + k, b = a + per; idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4)); g.setIndex(idx); g.computeVertexNormals();
    for (let k = 1; k < g.getAttribute('normal').count * 3; k += 3) (g.getAttribute('normal').array as Float32Array)[k] = 1;   // flat ground normals regardless of winding
    const bank = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, depthWrite: false, roughness: 0.85, side: THREE.DoubleSide }));
    bank.receiveShadow = true; bank.renderOrder = 1; scene.add(bank);
    scene.add(new THREE.Mesh(ribbon(river, waterHW, 1400, -0.27), waterMaterial(time, 1))); WATERWAYS.push({ name: 'river', curve: river, y: -0.27, hw: 2.5 });
    // the river is not walkable ground
    for (let i = 0; i <= 4000; i++) {
      const t = i / 4000, p = river.getPointAt(t), tg = river.getTangentAt(t); const nl = Math.hypot(tg.x, tg.z) || 1, nx = -tg.z / nl, nz = tg.x / nl;
      for (const s of [-1, 1]) for (let d = 0; d <= waterHW(t, s) - 0.35; d += 0.25) {
        const x = p.x + nx * s * d, z = p.z + nz * s * d, ii = ci(x), jj = cj(z); if (ii >= 0 && jj >= 0 && ii < NX && jj < NZ && grid[jj * NX + ii] >= 4) grid[jj * NX + ii] = 6;
      }
    }
    // ---- timber bridges, square across the river where the trails reach it: planked arched deck, posts and rails, piers in the water
    const wood = new THREE.MeshStandardMaterial({ color: 0x6a5238, roughness: 0.95 }), dark = new THREE.MeshStandardMaterial({ color: 0x3e2e1e, roughness: 1 });      // weathered timber
    for (const [tx, tz] of ([[37, -15], [108, -66], [47, 97]] as Array<[number, number]>).map(([x, z]) => growPt(x, z))) {          // the Temple Bridge, the monastery bridge, the north bridge
      let bt = 0, bd = 1e9; for (let i = 0; i <= 3000; i++) { const p = river.getPointAt(i / 3000); const d = (p.x - tx) ** 2 + (p.z - tz) ** 2; if (d < bd) { bd = d; bt = i / 3000; } }
      const p = river.getPointAt(bt), tg = river.getTangentAt(bt); const nl = Math.hypot(tg.x, tg.z) || 1, nx = -tg.z / nl, nz = tg.x / nl;
      const hwA = waterHW(bt, -1) + 2.6, hwB = waterHW(bt, 1) + 2.6, W = 3.2;
      const ax = p.x - nx * hwA, az = p.z - nz * hwA, len = hwA + hwB; BRIDGES.push({ ax, az, dx: nx, dz: nz, len, w: W });
      for (let u = 0; u <= len; u += 0.25) for (let sd = -W / 2; sd <= W / 2; sd += 0.25) {           // the deck is walkable, over water and banks alike
        const x = ax + nx * u - nz * sd, z = az + nz * u + nx * sd, ii = ci(x), jj = cj(z); if (ii >= 0 && jj >= 0 && ii < NX && jj < NZ && grid[jj * NX + ii] >= 4) grid[jj * NX + ii] = 7;
      }
      const deck: THREE.BufferGeometry[] = [], frame: THREE.BufferGeometry[] = []; const yaw = Math.atan2(nx, nz);
      const place = (g: THREE.BufferGeometry, u: number, sd: number, y: number, rx = 0) => g.rotateX(rx).rotateY(yaw).translate(ax + nx * u - nz * sd, y, az + nz * u + nx * sd);
      for (let u = 0.15; u < len; u += 0.34) {                                                     // planks, each tilted with the arch, a few askew
        const k = u / len, slope = Math.atan(0.55 * Math.PI * Math.cos(Math.PI * k) / len);
        deck.push(place(new THREE.BoxGeometry(W + 0.25 + (rnd() - 0.5) * 0.2, 0.07, 0.3), u, (rnd() - 0.5) * 0.08, deckH(k) - 0.04, -slope));
      }
      for (const sd of [-W / 2 + 0.15, W / 2 - 0.15]) for (let u = 0; u < len; u += 0.9) {          // stringers under the planks
        const k = (u + 0.45) / len; frame.push(place(new THREE.BoxGeometry(0.16, 0.18, 0.95), u + 0.45, sd, deckH(Math.min(1, k)) - 0.17, -Math.atan(0.55 * Math.PI * Math.cos(Math.PI * k) / len)));
      }
      const posts: Array<[number, number, number]> = [];
      for (let u = 0.3; u <= len - 0.3 + 1e-6; u += (len - 0.6) / Math.round((len - 0.6) / 1.7)) for (const sd of [-W / 2 - 0.05, W / 2 + 0.05]) {
        const y0 = deckH(u / len); frame.push(place(new THREE.CylinderGeometry(0.07, 0.08, 1.0, 6), u, sd, y0 + 0.45)); posts.push([u, sd, y0 + 0.92]);
      }
      for (let i = 0; i + 2 < posts.length; i += 2) for (const o of [0, 1]) {                       // hand rails from post top to post top
        const [u0, s0, y0] = posts[i + o], [u1, , y1] = posts[i + 2 + o]; const L2 = Math.hypot(u1 - u0, y1 - y0);
        frame.push(place(new THREE.CylinderGeometry(0.045, 0.045, L2, 5).rotateX(Math.PI / 2), (u0 + u1) / 2, s0, (y0 + y1) / 2, -Math.atan2(y1 - y0, u1 - u0)));
      }
      for (const k of [0.32, 0.68]) for (const sd of [-W / 2 + 0.2, W / 2 - 0.2]) frame.push(place(new THREE.CylinderGeometry(0.16, 0.2, 1.4, 8), k * len, sd, deckH(k) - 0.8));   // piers
      const dm = new THREE.Mesh(mergeGeometries(deck.map((g) => g.toNonIndexed())), wood), fm = new THREE.Mesh(mergeGeometries(frame.map((g) => g.toNonIndexed())), dark);
      dm.castShadow = fm.castShadow = true; dm.receiveShadow = fm.receiveShadow = true; scene.add(dm, fm);
    }
  }
  const nearBridge = (x: number, z: number, d: number) => BRIDGES.some((b) => { const rx = x - b.ax, rz = z - b.az, u = (rx * b.dx + rz * b.dz), sd = Math.abs(-rx * b.dz + rz * b.dx); return u > -d && u < b.len + d && sd < b.w / 2 + d; });
  const riverPts = river.getSpacedPoints(700);
  const rHash = new Map<string, THREE.Vector3[]>(); for (const p of riverPts) { const k = `${Math.floor(p.x / 8)},${Math.floor(p.z / 8)}`; (rHash.get(k) ?? rHash.set(k, []).get(k)!).push(p); }
  // stones half-sunk along both waterlines, a few boulders further up the bank
  for (let k = 0; k < 560; k++) {
    const t = rnd(), s = rnd() < 0.5 ? -1 : 1, p = river.getPointAt(t), tg = river.getTangentAt(t); const nl = Math.hypot(tg.x, tg.z) || 1;
    const big = rnd() < 0.2; const d = big ? waterHW(t, s) + 0.8 + rnd() * 1.6 : waterHW(t, s) - 0.3 + rnd() * 0.7;
    if (nearBridge(p.x - tg.z / nl * s * d, p.z + tg.x / nl * s * d, 1.5)) continue;
    addRock(p.x - tg.z / nl * s * d, p.z + tg.x / nl * s * d, big ? 0.35 + rnd() * 0.45 : 0.1 + rnd() * 0.22);
  }
  chunked(new THREE.DodecahedronGeometry(1, 0), rubbleMat, rockMats, 30, true);
  // reeds in clumps at the water's edge
  const reedGeo = mergeGeometries([0, 1, 2, 3, 4].map((k) => new THREE.ConeGeometry(0.03, 0.9 + (k % 3) * 0.25, 3).translate(0, 0.45, 0).rotateZ((k - 2) * 0.16).rotateY(k * 1.3).translate(Math.cos(k * 2.4) * 0.12, 0, Math.sin(k * 2.4) * 0.12)));
  const reedMats: THREE.Matrix4[] = [];
  for (let k = 0; k < 900; k++) {
    const t = rnd(), s = rnd() < 0.5 ? -1 : 1, p = river.getPointAt(t), tg = river.getTangentAt(t); const nl = Math.hypot(tg.x, tg.z) || 1;
    const d = waterHW(t, s) - 0.2 + rnd() * 0.8, sc = 0.7 + rnd() * 0.7; if (nearBridge(p.x - tg.z / nl * s * d, p.z + tg.x / nl * s * d, 1.2)) continue;
    tmp.position.set(p.x - tg.z / nl * s * d, -0.3, p.z + tg.x / nl * s * d); tmp.rotation.set(0, rnd() * 6.28, 0); tmp.scale.set(sc, sc * (0.8 + rnd() * 0.5), sc); tmp.updateMatrix(); reedMats.push(tmp.matrix.clone());
  }
  chunked(reedGeo, new THREE.MeshStandardMaterial({ color: 0x56683a, roughness: 1, flatShading: true }), reedMats, 30, false);

  // ---- jungle: tree walls (instanced, wind sway), dead Dire trees near the court, ferns
  const nearTemple = (x: number, z: number, d: number) => { const i0 = ci(x), j0 = cj(z), r = Math.ceil(d / CELL); for (let j = j0 - r; j <= j0 + r; j++) for (let i = i0 - r; i <= i0 + r; i++) if (isTemple(cell(i, j))) return true; return false; };
  const nearRiver = (x: number, z: number, d: number) => {
    const i0 = Math.floor(x / 8), j0 = Math.floor(z / 8), r = Math.ceil(d / 8);
    for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) for (const p of rHash.get(`${i0 + a},${j0 + b}`) ?? []) if ((p.x - x) ** 2 + (p.z - z) ** 2 < d * d) return true;
    return false;
  };
  // ---- dirt paths worn out from every staircase into the jungle (reference: sandy olive lanes, #a99b67 #8b8554 #5e6842)
  const PATHS0: Array<Array<[number, number]>> = [
    [[18.6, 27.5], [19, 40], [26, 56], [17, 76], [24, 100]],                 // Shrine north stairs (east of the statue)
    [[-12, 29.5], [-14, 42], [-8, 58], [-17, 80], [-10, 104]],               // Hall north stairs
    [[19, 40], [6, 45], [-14, 42]],                                          // between the two

    [[-14.2, -26.8], [-13, -34], [-19, -50], [-12, -72], [-20, -98]],        // Court south steps
    [[-23.5, -19.5], [-32, -20], [-45, -14], [-62, -18], [-84, -9], [-110, -16]],   // Court east steps
    // trails into every region and to each camp's clearing edge
    [[-110, -16], [-133, -9], [-149, -4]],                                   // to the Naga's lair
    [[-73, -13.5], [-72.5, -18], [-72.2, -21.5]],                            // crossroads: camp C1
    [[-84, -9], [-90, 12], [-95.5, 26.5], [-97, 30.4]],                        // crossroads: camp C2
    [[-17, 80], [-26, 84], [-30.2, 86]],                                     // bone wastes: B1
    [[-14, 42], [-28, 45], [-35.6, 47.2]],                                   // bone wastes: B3
    [[24, 100], [18, 113], [15.6, 115.8]],                                   // bone wastes: B2 (up the Barrow Mound)
    [[-10, 104], [-40, 108], [-70, 102], [-83.6, 97.5]],                     // garrison: U1 (from the Hall north trail)
    [[-100, 46], [-96, 70], [-92.5, 89.5]],                                  // crossroads -> garrison
    [[-96.5, 96.5], [-120, 104], [-143.5, 101]],                             // garrison: U2
    [[-92.5, 102.5], [-108, 128], [-120, 140]],                              // garrison: U3
    [[-19, -80], [-38, -88], [-53.6, -91]],                                  // hunting grounds: G1 (from the court south trail)
    [[-60, -98.5], [-85, -112], [-103.8, -117.8]],                           // hunting grounds: G2 (the cage)
    [[-116.3, -118], [-138, -112], [-153.5, -110.5]],                        // hunting grounds: G3
    [[-160, -103.5], [-162, -60], [-158, -25]],                              // hunting grounds -> the lair
    [[62, 95], [90, 97], [111.5, 95.8]],                                     // the monks' graves camp (off the north bridge)
  ];
  const W2s = (P: Array<[number, number]>) => P.map(([x, z]) => W2(x, z));
  const PATHS: Array<Array<[number, number]>> = PATHS0.map(W2s);            // laid out for the old temple; warped with it
  const BR_NEAR: Array<Array<[number, number]>> = [growAll([[14, -9], [24, -13], [30, -14.5]]), growAll([[64, -50], [80, -58], [92, -62]]), W2s([[24, 100], [33, 98]])];
  const BR_FAR: Array<Array<[number, number]>> = [[[TX - 82, -15], [TX - 78, -15]], growAll([[104, -77], [99, -82], [95, -88]]), []];   // the Temple Bridge leads straight to the Grand Stair
  for (let bi = 0; bi < 3; bi++) {
    const near = BR_NEAR[bi];
    const b = BRIDGES[bi]; if (!b) continue;
    const A: [number, number] = [b.ax, b.az], Bn: [number, number] = [b.ax + b.dx * b.len, b.az + b.dz * b.len];
    const flip = Math.hypot(near[near.length - 1][0] - A[0], near[near.length - 1][1] - A[1]) > Math.hypot(near[near.length - 1][0] - Bn[0], near[near.length - 1][1] - Bn[1]);
    const [s0, s1] = flip ? [Bn, A] : [A, Bn]; const ox = (s1[0] - s0[0]) / b.len, oz = (s1[1] - s0[1]) / b.len;
    PATHS.push([...near, [s0[0] - ox * 1.5, s0[1] - oz * 1.5], s0, s1, [s1[0] + ox * 1.5, s1[1] + oz * 1.5]]);                  // onto the deck and off the far end
    if (BR_FAR[bi].length) PATHS.push([[s1[0] + ox * 1.5, s1[1] + oz * 1.5], ...BR_FAR[bi]]);
  }
  PATHS.push(...([[[10, -24], [16, -40], [22, -58], [32, -76], [50, -84], [62, -88], [80, -96], [92, -104], [100, -108], [110, -104], [114, -98.6]],   // village -> marsh -> monastery
    [[16, -46], [11, -52], [8, -53]],                                                                                // the marsh camp
    [[50, -84], [46, -100], [36, -118], [30, -125]],                                                                 // marsh -> the snare fields
    [[47, -17], [49, -27], [57, -35], [62, -39]],                                                                    // under the hill: the Weeping Maid's camp
    ...VILLAGE_LANES,
    // every camp has its own trail to its clearing's edge
    [[-162, -63.8], [-152, -64.5], [-143, -64.5]],                                                                   // the Weeping Pool (Act V)
    [[74.7, -93.3], [72, -97.5]],                                                                                    // the goblins who emptied the village (Act II)
    [[114, -98.6], [124, -103], [133, -109]],                                                                        // the monastery's ritual court
    [[98.5, -107.8], [96, -120], [94, -131]],                                                                        // the monastery's graves
    [[30, -125], [32, -133], [34, -139]]] as Array<Array<[number, number]>>).map(growAll));
  PATHS.push([[TX - 48, -15], [TX - 44, -20], [TX - 34, -26]]);                     // on the hill: the Grand Stair up to the temple's east steps (moves with the temple)                                                                           // the trap-setters' camp
  // ---- trench bridges where trails cross, two broken ones, then the ledges (steep edges) of hills and trenches
  {
    const cross: Array<{ t: Trench; x: number; z: number; dx: number; dz: number; span: number }> = [];
    for (const P of PATHS) {
      const cv = new THREE.CatmullRomCurve3(P.map(([x, z]) => new THREE.Vector3(x, 0, z))); const L = cv.getLength(); let inside: { x: number; z: number; t: Trench } | null = null;
      for (let k = 0; k <= Math.ceil(L / 0.5); k++) {
        const p = cv.getPointAt(Math.min(1, k * 0.5 / L)); const t = TRENCHES.find((tt) => trenchNear(tt, p.x, p.z).d < tt.w / 2);
        if (t && !inside) inside = { x: p.x, z: p.z, t }; else if (!t && inside) { const ex = p.x - inside.x, ez = p.z - inside.z, L3 = Math.hypot(ex, ez) || 1; cross.push({ t: inside.t, x: (inside.x + p.x) / 2, z: (inside.z + p.z) / 2, dx: ex / L3, dz: ez / L3, span: L3 }); inside = null; }
      }
    }
    const want: Array<{ t: Trench; x: number; z: number; broken: boolean; dx?: number; dz?: number; span?: number }> = [];
    for (const c of cross) if (!want.some((w) => Math.hypot(w.x - c.x, w.z - c.z) < 12)) want.push({ ...c, broken: false });
    { const [ax2, az2] = growCh1(-150, 78), [bx2, bz2] = growCh1(-127, -36); want.push({ t: TRENCHES[0], x: ax2, z: az2, broken: true }, { t: TRENCHES[1], x: bx2, z: bz2, broken: true }); }   // the two broken bridges (moved out with the valley)
    for (const w of want) {
      const n = trenchNear(w.t, w.x, w.z), dx = w.dx ?? -n.tz, dz = w.dz ?? n.tx, len = (w.span ?? w.t.w) + 3.6, W = 3.2, [cx, cz] = polyAt(w.t.pts, w.t.seg, n.s);   // centred on the trench
      const ax = cx - dx * len / 2, az = cz - dz * len / 2; BRIDGES.push({ ax, az, dx, dz, len, w: W, flat: true, broken: w.broken });
      const gap = (u: number) => w.broken && Math.abs(u - len / 2) < 1.2;
      for (let u = 0; u <= len; u += 0.25) for (let sd = -W / 2; sd <= W / 2; sd += 0.25) {
        const x = ax + dx * u - dz * sd, z = az + dz * u + dx * sd, ii = ci(x), jj = cj(z); if (ii < 0 || jj < 0 || ii >= NX || jj >= NZ || gap(u)) continue;
        if (grid[jj * NX + ii] >= 4) grid[jj * NX + ii] = 7;
      }
      for (let u = 0; u <= len; u += 0.25) for (const sd of [-W / 2 - 0.3, W / 2 + 0.3]) {           // rails and piers: the sides are closed
        const x = ax + dx * u - dz * sd, z = az + dz * u + dx * sd; if (terrainH(x, z) < GY - 0.4) solid(x, z, 0.2);
      }
      // the deck: flat planks on stringers, posts and rails, piers down to the trench floor; a broken one has splintered ends
      const deck: THREE.BufferGeometry[] = [], frame: THREE.BufferGeometry[] = []; const yaw = Math.atan2(dx, dz), y = GY + 0.12;
      const place = (g: THREE.BufferGeometry, u: number, sd: number, yy: number, rx = 0, rz = 0) => g.rotateZ(rz).rotateX(rx).rotateY(yaw).translate(ax + dx * u - dz * sd, yy, az + dz * u + dx * sd);
      for (let u = 0.15; u < len; u += 0.34) { if (gap(u)) continue; const brk = w.broken && Math.abs(u - len / 2) < 1.9; deck.push(place(new THREE.BoxGeometry(W + 0.25 + (rnd() - 0.5) * 0.2 - (brk ? rnd() * 1.4 : 0), 0.07, 0.3), u, (brk ? (rnd() - 0.5) * 0.8 : (rnd() - 0.5) * 0.08), y - 0.04 - (brk ? rnd() * 0.12 : 0), brk ? (rnd() - 0.5) * 0.3 : 0, brk ? (rnd() - 0.5) * 0.2 : 0)); }
      for (const sd of [-W / 2 + 0.15, W / 2 - 0.15]) for (let u = 0; u < len; u += 0.9) { if (gap(u + 0.45)) continue; frame.push(place(new THREE.BoxGeometry(0.16, 0.18, 0.95), u + 0.45, sd, y - 0.17)); }
      const floorY = GY - w.t.d;
      for (const u of [1.0, len - 1.0, len / 2 - (w.broken ? 1.6 : 0), ...(w.broken ? [len / 2 + 1.6] : [])]) for (const sd of [-W / 2 + 0.2, W / 2 - 0.2]) {
        const hgt = y - floorY; frame.push(place(new THREE.CylinderGeometry(0.16, 0.2, hgt, 8), u, sd, floorY + hgt / 2));
      }
      for (let u = 0.3; u <= len - 0.3; u += 1.6) for (const sd of [-W / 2 - 0.05, W / 2 + 0.05]) { if (gap(u)) continue; frame.push(place(new THREE.CylinderGeometry(0.07, 0.08, 1.0, 6), u, sd, y + 0.45)); }
      for (const sd of [-W / 2 - 0.05, W / 2 + 0.05]) for (const [u0, u1] of w.broken ? [[0.3, len / 2 - 1.3], [len / 2 + 1.3, len - 0.3]] : [[0.3, len - 0.3]]) {
        const L2 = u1 - u0; frame.push(place(new THREE.CylinderGeometry(0.045, 0.045, L2, 5).rotateX(Math.PI / 2), (u0 + u1) / 2, sd, y + 0.92));
      }
      const wood = new THREE.MeshStandardMaterial({ color: 0x6a5238, roughness: 0.95 }), darkW = new THREE.MeshStandardMaterial({ color: 0x3e2e1e, roughness: 1 });
      const dm = new THREE.Mesh(mergeGeometries(deck.map((g) => g.toNonIndexed())), wood), fm = new THREE.Mesh(mergeGeometries(frame.map((g) => g.toNonIndexed())), darkW);
      dm.castShadow = fm.castShadow = true; dm.receiveShadow = fm.receiveShadow = true; scene.add(dm, fm);
    }
    // ledges: a ground cell with a neighbour more than a step lower is an edge you stand on or must jump up to
    const STEP = 0.32; const TH = new Float32Array(NX * NZ).fill(GY);
    const near = (x: number, z: number) => HILLS.some((h) => Math.abs(x - h.x) < h.R * 1.1 + h.L + 5 && Math.abs(z - h.z) < h.R * 1.1 + h.L + 5) || TRENCHES.some((t) => trenchNear(t, x, z).d < t.w / 2 + 2);
    const active: number[] = [];
    for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) { const x = B.x0 + (i + 0.5) * CELL, z = B.z0 + (j + 0.5) * CELL; if (!near(x, z)) continue; TH[j * NX + i] = terrainH(x, z); active.push(j * NX + i); }
    const ledge: Array<{ k: number; low: number; lx: number; lz: number }> = [];
    for (const k of active) {
      const v = grid[k]; if (v !== 4 && v !== 5) continue; const i = k % NX, j = (k - i) / NX, h = TH[k]; let low = h, lx = 0, lz = 0;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= NX || b >= NZ) continue; const v2 = grid[b * NX + a]; if (v2 !== 4 && v2 !== 5) continue; const h2 = TH[b * NX + a]; if (h2 < low) { low = h2; lx = di; lz = dj; } }
      if (low < h - STEP) { if (v === 4) { grid[k] = 5; topY[k] = h; } else topY[k] = Math.max(topY[k], h); ledge.push({ k, low, lx, lz }); }
    }
    // dressing: rock faces on hills and the scar, a log palisade shoring the garrison trench, sharpened stakes on its lip
    const rockM: THREE.Matrix4[] = [], postM: THREE.Matrix4[] = [], stakeM: THREE.Matrix4[] = []; const o = new THREE.Object3D();
    for (const e of ledge) {
      const i = e.k % NX, j = (e.k - i) / NX, x = B.x0 + (i + 0.5) * CELL + e.lx * 0.3, z = B.z0 + (j + 0.5) * CELL + e.lz * 0.3, h = TH[e.k], dh = h - e.low;
      const tr = TRENCHES.find((t) => trenchNear(t, x, z).d < t.w / 2 + 1.2);
      if (tr && tr.kind === 'logs') {
        o.position.set(x, e.low + dh / 2 + 0.12, z); o.rotation.set((rnd() - 0.5) * 0.06, rnd() * 6, (rnd() - 0.5) * 0.06); o.scale.set(1, dh + 0.25, 1); o.updateMatrix(); postM.push(o.matrix.clone());
        if ((i + j) % 5 === 0) { o.position.set(x - e.lx * 0.5, h + 0.35, z - e.lz * 0.5); o.rotation.set(e.lz * 0.7, 0, -e.lx * 0.7); o.scale.set(1, 1, 1); o.updateMatrix(); stakeM.push(o.matrix.clone()); }
      } else {
        // a stacked sandstone face: one boulder per metre of drop, wide and flat, filling the cliff
        for (let yy = e.low + 0.5; yy < h + 0.1; yy += 1.0) { const s2 = 0.75 + rnd() * 0.35; o.position.set(x + (rnd() - 0.5) * 0.3, Math.min(yy, h - 0.25), z + (rnd() - 0.5) * 0.3); o.rotation.set(rnd() * 0.6, rnd() * 6.28, rnd() * 0.6); o.scale.set(s2, 0.55 + rnd() * 0.2, s2); o.updateMatrix(); rockM.push(o.matrix.clone()); }
      }
    }
    const cliffMat = new THREE.MeshStandardMaterial({ color: 0x9a8668, roughness: 1, flatShading: true });
    chunked(new THREE.DodecahedronGeometry(1, 0), cliffMat, rockM, 30, true);
    chunked(new THREE.CylinderGeometry(0.17, 0.2, 1, 6), new THREE.MeshStandardMaterial({ color: 0x4e3a26, roughness: 1, flatShading: true }), postM, 30, true);
    chunked(new THREE.ConeGeometry(0.08, 1.1, 5).translate(0, 0.3, 0), new THREE.MeshStandardMaterial({ color: 0x8a6a44, roughness: 1, flatShading: true }), stakeM, 30, true);
  }
  let trailGeo: THREE.BufferGeometry | null = null; let trailMat: THREE.Material | null = null; const extraTrails: THREE.BufferGeometry[] = [];
  const pathPts: THREE.Vector3[] = []; const pHash = new Map<string, THREE.Vector3[]>();
  const flagsA: THREE.Matrix4[] = [], flagsB: THREE.Matrix4[] = []; const tmpS = new THREE.Object3D(); let slabS = 4242;
  {
    const cols: Array<{ d: number; c: number; a: number }> = [{ d: 0, c: 0xa99b67, a: 1 }, { d: 0.6, c: 0x9e9260, a: 1 }, { d: 1.0, c: 0x8b8554, a: 0.92 }, { d: 1.28, c: 0x6a6a44, a: 0 }];
    const pos: number[] = [], col: number[] = [], idx: number[] = []; const cc = new THREE.Color(); let base = 0;
    for (const P of PATHS) {
      const cv = new THREE.CatmullRomCurve3(P.map(([x, z]) => new THREE.Vector3(x, 0, z))); const L = cv.getLength(); const SEG = Math.ceil(L / 0.8);
      const per = cols.length * 2 - 1;                                                       // -edge .. centre .. +edge
      for (let i = 0; i <= SEG; i++) {
        const t = i / SEG, p = cv.getPointAt(t), tg = cv.getTangentAt(t); const nl = Math.hypot(tg.x, tg.z) || 1, nx = -tg.z / nl, nz = tg.x / nl;
        const wv = 1 + 0.25 * Math.sin(t * L * 0.3 + base) + 0.12 * Math.sin(t * L * 1.1);
        const fade = Math.min(1, t * L / 2, (1 - t) * L / 2);                                   // ends soften into the grass
        pathPts.push(p); const hk = `${Math.floor(p.x / 8)},${Math.floor(p.z / 8)}`; (pHash.get(hk) ?? pHash.set(hk, []).get(hk)!).push(p);
        if (t * L > 1.6 && (1 - t) * L > 1.6) for (let s2 = 0; s2 < 2; s2++) { if (rnd() > (s2 ? 0.25 : 0.62)) continue;   // a few loose slabs on the cobbles (the paving itself is in the trail's shader)
          const d = (rnd() - 0.5) * 1.5, px2 = p.x + nx * d, pz2 = p.z + nz * d, h0 = terrainH(px2, pz2); if (h0 < GY - 0.15 || inWaterCh1(px2, pz2)) continue;
          const sc = 0.75 + rnd() * 0.55; tmpS.position.set(px2, h0 + 0.012, pz2); tmpS.rotation.set((rnd() - 0.5) * 0.08, Math.atan2(tg.x, tg.z) + (rnd() - 0.5) * 0.5, (rnd() - 0.5) * 0.08); tmpS.scale.set(sc, 0.6 + rnd() * 0.6, sc * (0.8 + rnd() * 0.4)); tmpS.updateMatrix();
          const pick = rnd() < 0.5 ? flagsA : flagsB; slabS = (slabS * 16807) % 2147483647; if (slabS / 2147483647 < 0.1) pick.push(tmpS.matrix.clone()); }   // keep 1 in 10 (own random stream: the layout stays put)
        for (let q = -(cols.length - 1); q <= cols.length - 1; q++) {
          const cd = cols[Math.abs(q)]; const d = Math.sign(q) * (cd.d * wv + (cd.d > 0 ? (rnd() - 0.5) * 0.2 : 0));
          { const px2 = p.x + nx * d, pz2 = p.z + nz * d; pos.push(px2, terrainH(px2, pz2) + 0.012, pz2); } cc.setHex(cd.c).multiplyScalar(0.85 + rnd() * 0.3); col.push(cc.r, cc.g, cc.b, cd.a * fade);
        }
        if (i < SEG) for (let q = 0; q < per - 1; q++) { const a = base + i * per + q, b2 = a + per; idx.push(a, b2, a + 1, a + 1, b2, b2 + 1); }
      }
      base += (SEG + 1) * per;
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4)); g.setIndex(idx); trailGeo = g;
    g.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(pos.length).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
    const pm = new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, depthWrite: false, roughness: 1, side: THREE.DoubleSide });
    pm.onBeforeCompile = (sh) => {                                              // packed earth: grit, small stones, darker worn patches
      sh.vertexShader = 'varying vec2 vPW;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vPW = position.xz;');
      sh.fragmentShader = 'varying vec2 vPW;\n' + NOISE + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
        float gr = vnoise(vPW * 9.0) * 0.5 + vnoise(vPW * 23.0) * 0.5; diffuseColor.rgb *= 0.82 + 0.3 * gr;
        float st = smoothstep(0.84, 0.9, vnoise(vPW * 3.1 + 3.0)); diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 1.25, st * 0.6);
        float dk = smoothstep(0.55, 0.75, vnoise(vPW * 0.6)); diffuseColor.rgb *= 1.0 - dk * 0.12;
        // the old road: packed rounded cobbles (Voronoi cells about 0.4 m) with dark mossy joints; ruined: single stones gone,
        // broken stretches down to earth, and the edges crumbling into the grass (the ribbon's own alpha)
        vec2 cp = vPW * 2.5; vec2 ci = floor(cp), cf = fract(cp); float d1 = 8.0, d2 = 8.0; vec2 cid = ci;
        for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
          vec2 g = vec2(float(i), float(j)), q = ci + g; vec2 o = fract(sin(vec2(dot(q, vec2(127.1, 311.7)), dot(q, vec2(269.5, 183.3)))) * 43758.5453);
          vec2 r = g + 0.15 + o * 0.7 - cf; float dd = dot(r, r); if (dd < d1) { d2 = d1; d1 = dd; cid = q; } else if (dd < d2) d2 = dd; }
        float edge = sqrt(d2) - sqrt(d1), cobble = smoothstep(0.03, 0.16, edge);
        float tone = fract(sin(dot(cid, vec2(41.3, 289.1))) * 15731.7), dome = smoothstep(0.0, 0.45, edge);
        vec3 stone = mix(vec3(0.27, 0.28, 0.26), vec3(0.44, 0.43, 0.39), tone) * (0.86 + 0.24 * vnoise(vPW * 7.0)) * (0.82 + 0.3 * dome);
        vec3 joint = mix(vec3(0.07, 0.09, 0.06), vec3(0.12, 0.17, 0.08), vnoise(vPW * 3.0));
        vec3 cob = mix(joint, stone, cobble);
        float gone = step(0.8, fract(sin(dot(cid, vec2(12.9, 78.2))) * 43758.5));                    // a stone missing here and there
        float broken = smoothstep(0.58, 0.74, vnoise(vPW * 0.16 + 5.0) * 0.75 + vnoise(vPW * 0.9) * 0.25);   // stretches broken down to earth
        diffuseColor.rgb = mix(cob, diffuseColor.rgb, clamp(max(gone * 0.9, broken), 0.0, 1.0));`);
    };
    pm.customProgramCacheKey = () => 'ch1-trail'; trailMat = pm;
    const m = new THREE.Mesh(g, pm); m.receiveShadow = true; m.renderOrder = 3; scene.add(m);
    const flag = new THREE.BoxGeometry(0.95, 0.08, 0.75, 1, 1, 1).translate(0, -0.01, 0);
    chunked(flag, new THREE.MeshStandardMaterial({ map: blockTex(), color: 0x8a8a80, roughness: 1 }), flagsA, 30, false);
    chunked(flag, new THREE.MeshStandardMaterial({ map: blockTex(), color: 0x6c6c64, roughness: 1 }), flagsB, 30, false);
    // a leaning waymarker where each camp's trail meets its clearing
    const post = new THREE.MeshStandardMaterial({ map: blockTex(), color: 0x9a9480, roughness: 1 });
    for (const c of CH1.camps) {
      let best: THREE.Vector3 | null = null, bd = 14; for (const q of pathPts) { const d = Math.hypot(q.x - c.x, q.z - c.z); if (d < bd) { bd = d; best = q; } }
      if (!best) continue; const ax = best.x - c.x, az = best.z - c.z, al = Math.hypot(ax, az) || 1, sx = best.x - az / al * 1.5, sz = best.z + ax / al * 1.5;
      const mk = new THREE.Mesh(new THREE.BoxGeometry(0.34, 1.1, 0.3), post); mk.position.set(sx, terrainH(sx, sz) + 0.45, sz); mk.rotation.set((rnd() - 0.5) * 0.25, rnd() * 3, (rnd() - 0.5) * 0.25); mk.castShadow = true; scene.add(mk);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.12, 0.4), post); cap.position.set(sx, terrainH(sx, sz) + 1.05, sz); cap.rotation.copy(mk.rotation); scene.add(cap);
    }
  }
  const nearPath = (x: number, z: number, d: number) => {
    const i0 = Math.floor(x / 8), j0 = Math.floor(z / 8), r = Math.ceil(d / 8);
    for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) for (const p of pHash.get(`${i0 + a},${j0 + b}`) ?? []) if ((p.x - x) ** 2 + (p.z - z) ** 2 < d * d) return true;
    return false;
  };
  trailFn = nearPath;
  /** A trail laid after the world was placed (the grown valley's places): the same old paving, from its own random stream. */
  let trS = 4243; const trR = () => (trS = (trS * 16807) % 2147483647) / 2147483647;
  const addTrail = (P: Array<[number, number]>): void => {
    if (!trailMat) return;
    const cols = [{ d: 0, c: 0xa99b67, a: 1 }, { d: 0.6, c: 0x9e9260, a: 1 }, { d: 1.0, c: 0x8b8554, a: 0.92 }, { d: 1.28, c: 0x6a6a44, a: 0 }];
    const cv = new THREE.CatmullRomCurve3(P.map(([x, z]) => new THREE.Vector3(x, 0, z))), L = cv.getLength(), SEG = Math.ceil(L / 0.8), per = cols.length * 2 - 1;
    const pos: number[] = [], col: number[] = [], idx: number[] = []; const cc = new THREE.Color(), ph = trR() * 9;
    for (let i = 0; i <= SEG; i++) {
      const t = i / SEG, p = cv.getPointAt(t), tg = cv.getTangentAt(t), nl = Math.hypot(tg.x, tg.z) || 1, nx = -tg.z / nl, nz = tg.x / nl;
      const wv = 1 + 0.25 * Math.sin(t * L * 0.3 + ph) + 0.12 * Math.sin(t * L * 1.1), fade = Math.min(1, (t * L) / 2, ((1 - t) * L) / 2);
      pathPts.push(p); const hk = `${Math.floor(p.x / 8)},${Math.floor(p.z / 8)}`; (pHash.get(hk) ?? pHash.set(hk, []).get(hk)!).push(p);
      for (let q = -(cols.length - 1); q <= cols.length - 1; q++) {
        const cd = cols[Math.abs(q)], d = Math.sign(q) * (cd.d * wv + (cd.d > 0 ? (trR() - 0.5) * 0.2 : 0)), px = p.x + nx * d, pz = p.z + nz * d;
        pos.push(px, terrainH(px, pz) + 0.012, pz); cc.setHex(cd.c).multiplyScalar(0.85 + trR() * 0.3); col.push(cc.r, cc.g, cc.b, cd.a * fade);
      }
      if (i < SEG) for (let q = 0; q < per - 1; q++) { const a = i * per + q, b2 = a + per; idx.push(a, b2, a + 1, a + 1, b2, b2 + 1); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4)); g.setIndex(idx);
    g.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(pos.length).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
    const m = new THREE.Mesh(g, trailMat); m.receiveShadow = true; m.renderOrder = 3; scene.add(m); extraTrails.push(g);
  };
  /** Clear a place's footprint before it is built: scattered instanced clutter (rocks, ferns, slabs) and small props there go, with their
   *  colliders; the footprint is remembered so the trees and logs that load later keep out too. */
  const clearArea = (cx: number, cz: number, r: number): void => {
    PLACE_CLEAR.push({ x: cx, z: cz, r });
    const m = new THREE.Matrix4(), v = new THREE.Vector3(), zero = new THREE.Matrix4().makeScale(0, 0, 0), box = new THREE.Box3(), sz = new THREE.Vector3();
    for (const o of scene.children) {
      if (o.userData.stream || o.userData.place) continue; o.updateMatrixWorld(); const im = o as THREE.InstancedMesh;
      if (im.isInstancedMesh) {
        let ch = false; for (let i = 0; i < im.count; i++) { im.getMatrixAt(i, m); v.setFromMatrixPosition(m).applyMatrix4(im.matrixWorld); if (Math.hypot(v.x - cx, v.z - cz) < r && Math.abs(v.y - GY) < 2.5) { im.setMatrixAt(i, zero); ch = true; } }
        if (ch) { im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); }
      } else if ((o.position.x !== 0 || o.position.z !== 0) && o.visible && Math.hypot(o.position.x - cx, o.position.z - cz) < r && Math.abs(o.position.y - GY) < 2.5) {
        box.setFromObject(o).getSize(sz); if (Math.max(sz.x, sz.z) < 5) o.visible = false;
      }
    }
    for (let j = cj(cz - r); j <= cj(cz + r); j++) for (let i = ci(cx - r); i <= ci(cx + r); i++) {
      if (i < 0 || j < 0 || i >= NX || j >= NZ) continue; const k = j * NX + i, x = B.x0 + (i + 0.5) * CELL, z = B.z0 + (j + 0.5) * CELL;
      if (grid[k] === 5 && Math.hypot(x - cx, z - cz) < r && Math.abs(terrainH(x, z) - GY) < 0.15) { grid[k] = 4; topY[k] = 99; }
    }
  };
  /** Run a build step and return the grid cells it blocked (to open them again later: gates, thorns). */
  const track = (fn: () => void): Array<[number, number, number]> => {
    const g0 = grid.slice(), t0 = topY.slice(); fn(); const out: Array<[number, number, number]> = [];
    for (let k = 0; k < g0.length; k++) if (g0[k] !== grid[k] || t0[k] !== topY[k]) out.push([k, g0[k], t0[k]]);
    return out;
  };
  const untrack = (cells: Array<[number, number, number]>): void => { for (const [k, g, t] of cells) { grid[k] = g; topY[k] = t; } };
  let placeKit: Kit | null = null; const poolMeshes: THREE.Mesh[] = [];
  /** A flat timber bridge laid now (a drawbridge coming down): walkable from end to end over whatever is below. */
  const addBridge = (cx: number, cz: number, dx: number, dz: number, len: number, W: number): void => {
    const ax = cx - dx * len / 2, az = cz - dz * len / 2; BRIDGES.push({ ax, az, dx, dz, len, w: W, flat: true });
    for (let u = 0; u <= len; u += 0.25) for (let sd = -W / 2; sd <= W / 2; sd += 0.25) {
      const x = ax + dx * u - dz * sd, z = az + dz * u + dx * sd, ii = ci(x), jj = cj(z); if (ii < 0 || jj < 0 || ii >= NX || jj >= NZ) continue;
      if (grid[jj * NX + ii] >= 4) { grid[jj * NX + ii] = 7; topY[jj * NX + ii] = 99; }
    }
  };
  const treesP: THREE.Vector3[] = []; const deadP: THREE.Vector3[] = []; const procTrees: THREE.Object3D[] = [];
  const hash = new Map<string, THREE.Vector3[]>(); const key = (x: number, z: number) => `${Math.floor(x / 3)},${Math.floor(z / 3)}`;
  const crowded = (x: number, z: number, d: number) => { for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const q of hash.get(`${Math.floor(x / 3) + a},${Math.floor(z / 3) + b}`) ?? []) if ((q.x - x) ** 2 + (q.z - z) ** 2 < d * d) return true; return false; };
  for (let k = 0; k < 9000 && treesP.length < 520; k++) {
    const x = B0.x0 - 6 + rnd() * (B0.x1 - B0.x0 + 12), z = B0.z0 - 6 + rnd() * (B0.z1 - B0.z0 + 12);
    if (nearTemple(x, z, 2.2) || nearRiver(x, z, 4.6) || crowded(x, z, 1.9)) continue;
    if (nearTemple(x, z + 4.5, 4.5)) continue;                                                     // keep the camera side clear: no tall trees just south of a wall
    const v = new THREE.Vector3(x, 0, z); (hash.get(key(x, z)) ?? hash.set(key(x, z), []).get(key(x, z))!).push(v);
    const court = x < wx(430) && z < wz(620) && x > wx(1180) - 6;                                    // around the boss court: dead trees
    void court; treesP.push(v);
  }
  const leafMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true, side: THREE.DoubleSide });
  leafMat.onBeforeCompile = (sh) => {                                                                  // wind: leaves sway, more the higher they are
    sh.uniforms.uTime = time;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vec4 ip = instanceMatrix[3]; float hgt = max(0.0, position.y - 2.0);
      transformed.x += sin(uTime * 1.3 + ip.x * 0.37 + ip.z * 0.21) * 0.07 * hgt;
      transformed.z += cos(uTime * 1.1 + ip.x * 0.23 - ip.z * 0.31) * 0.05 * hgt;`);
  };
  const barkMat = new THREE.MeshStandardMaterial({ color: 0x4a3324, roughness: 1, flatShading: true });
  // palm crown: eight drooping fronds, each a long thin leaf bent down from the top
  const frond = (a: number) => new THREE.BoxGeometry(0.42, 0.04, 2.3).translate(0, 0, 1.15).rotateX(0.55).rotateY(a).translate(0, 5.0, 0);
  const SPECIES = [
    { name: 'broadleaf', weight: 0.4, trunk: new THREE.CylinderGeometry(0.16, 0.3, 2.6, 6).translate(0, 1.3, 0),
      crown: mergeGeometries([new THREE.IcosahedronGeometry(1.25, 0).translate(0, 3.2, 0), new THREE.IcosahedronGeometry(0.95, 0).translate(0.75, 2.75, 0.35), new THREE.IcosahedronGeometry(0.9, 0).translate(-0.6, 2.85, -0.45), new THREE.IcosahedronGeometry(0.8, 0).translate(0.1, 4.0, -0.1)]),
      greens: [0x2f5a2a, 0x3b6b2c, 0x24482a, 0x4f7a2e] },
    { name: 'rain tree', weight: 0.18, trunk: mergeGeometries([new THREE.CylinderGeometry(0.28, 0.48, 3.0, 7).translate(0, 1.5, 0), new THREE.CylinderGeometry(0.1, 0.18, 1.6, 5).rotateZ(0.8).translate(0.7, 2.9, 0), new THREE.CylinderGeometry(0.1, 0.18, 1.6, 5).rotateZ(-0.8).translate(-0.7, 2.9, 0)]),
      crown: mergeGeometries([new THREE.SphereGeometry(2.2, 8, 5).scale(1, 0.42, 1).translate(0, 3.7, 0), new THREE.SphereGeometry(1.4, 7, 4).scale(1, 0.5, 1).translate(0.6, 4.2, -0.4)]),
      greens: [0x3d6a30, 0x547c34, 0x46702c] },
    { name: 'palm', weight: 0.22, trunk: mergeGeometries([new THREE.CylinderGeometry(0.15, 0.2, 1.8, 6).translate(0, 0.9, 0), new THREE.CylinderGeometry(0.13, 0.15, 1.7, 6).rotateZ(0.12).translate(0.1, 2.6, 0), new THREE.CylinderGeometry(0.11, 0.13, 1.6, 6).rotateZ(0.2).translate(0.32, 4.2, 0)]),
      crown: mergeGeometries(([0, 1, 2, 3, 4, 5, 6, 7].map((k) => frond((k / 8) * Math.PI * 2 + (k % 2) * 0.2)) as THREE.BufferGeometry[]).concat([new THREE.SphereGeometry(0.3, 5, 4).translate(0, 4.95, 0)])).translate(0.35, 0, 0),
      greens: [0x5a8a34, 0x4d7d2e, 0x6a9436] },
    { name: 'emergent', weight: 0.2, trunk: new THREE.CylinderGeometry(0.18, 0.36, 5.2, 7).translate(0, 2.6, 0),
      crown: mergeGeometries([new THREE.IcosahedronGeometry(1.15, 0).translate(0, 5.8, 0), new THREE.IcosahedronGeometry(0.9, 0).translate(0.85, 5.4, 0.3), new THREE.IcosahedronGeometry(0.85, 0).translate(-0.75, 5.5, -0.35), new THREE.IcosahedronGeometry(0.6, 0).translate(0.4, 4.3, -0.5)]),
      greens: [0x24482a, 0x2c5236, 0x1f3f26] },
  ];
  const c = new THREE.Color(); const greens = [0x6b7549, 0x858b60, 0x4f552d, 0x687d3a, 0x556a2b, 0x7a8a4a];      // undergrowth (the frond texture and night light darken these a lot)
  const bySpecies: THREE.Vector3[][] = SPECIES.map(() => []);
  for (const p of treesP) { let r = rnd(), k = 0; while (k < SPECIES.length - 1 && r > SPECIES[k].weight) { r -= SPECIES[k].weight; k++; } bySpecies[k].push(p); }
  SPECIES.forEach((sp, si) => {
    const list = bySpecies[si]; if (!list.length) return;
    const trunks = new THREE.InstancedMesh(sp.trunk, barkMat, list.length), crowns = new THREE.InstancedMesh(sp.crown, leafMat, list.length);
    list.forEach((p, k) => {
      const s2 = (sp.name === 'palm' ? 0.9 : 1.05) + rnd() * 0.8; tmp.position.copy(p).setY(terrainH(p.x, p.z)); tmp.rotation.set(0, rnd() * 6.28, 0); tmp.scale.set(s2, s2 * (0.9 + rnd() * 0.35), s2); tmp.updateMatrix();
      trunks.setMatrixAt(k, tmp.matrix); crowns.setMatrixAt(k, tmp.matrix); c.setHex(sp.greens[Math.floor(rnd() * sp.greens.length)]).multiplyScalar(0.85 + rnd() * 0.3); crowns.setColorAt(k, c);
    });
    trunks.castShadow = crowns.castShadow = true; crowns.receiveShadow = true; scene.add(trunks, crowns); procTrees.push(trunks, crowns);
  });
  // dead trees: bare twisted trunk with three crooked branches, charcoal bark
  const deadGeo = mergeGeometries([new THREE.CylinderGeometry(0.1, 0.32, 3.4, 5).translate(0, 1.7, 0),
    new THREE.CylinderGeometry(0.05, 0.12, 1.6, 4).rotateZ(0.9).translate(0.55, 2.9, 0), new THREE.CylinderGeometry(0.05, 0.11, 1.4, 4).rotateZ(-1.0).translate(-0.5, 2.5, 0.1),
    new THREE.CylinderGeometry(0.04, 0.09, 1.2, 4).rotateX(0.9).translate(0, 3.3, 0.45)]);
  const dead = new THREE.InstancedMesh(deadGeo, new THREE.MeshStandardMaterial({ color: 0x2a2220, roughness: 1, flatShading: true }), Math.max(1, deadP.length));
  deadP.forEach((p, k) => { const s = 1 + rnd() * 0.6; solid(p.x, p.z, 0.25 * s); tmp.position.copy(p).setY(terrainH(p.x, p.z)); tmp.rotation.set((rnd() - 0.5) * 0.2, rnd() * 6.28, (rnd() - 0.5) * 0.2); tmp.scale.setScalar(s); tmp.updateMatrix(); dead.setMatrixAt(k, tmp.matrix); });
  dead.count = deadP.length; dead.castShadow = true; scene.add(dead);

  // ---- the Necromancer's wasteland: cracked blue-grey earth, charcoal dead trees, scattered stones, a sour red mist (reference: Dire side)
  const WASTE = { x: CH1.necro.x, z: CH1.necro.z, r: 19 };
  const inWaste = (x: number, z: number, pad = 0) => Math.hypot(x - WASTE.x, z - WASTE.z) < WASTE.r + pad; wasteFn = inWaste;
  {
    const crack = tex(512, (g2, s) => {
      const n1 = tileNoise(8), n2 = tileNoise(32); const img = g2.createImageData(s, s); const d = img.data;
      for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
        const v = n1(x / s * 8, y / s * 8) * 0.6 + n2(x / s * 32, y / s * 32) * 0.4; const i = (y * s + x) * 4;
        d[i] = 54 + v * 40; d[i + 1] = 62 + v * 38; d[i + 2] = 70 + v * 40; d[i + 3] = 255;                        // #363f46 .. #5a616e
      }
      g2.putImageData(img, 0, 0);
      g2.strokeStyle = 'rgba(18,20,26,0.85)'; g2.lineCap = 'round';                                                     // dry cracks, branching
      const crackLine = (x: number, y: number, a: number, len: number, w: number, depth: number): void => {
        g2.lineWidth = w; g2.beginPath(); g2.moveTo(x, y);
        for (let k = 0; k < len; k++) { a += (rnd() - 0.5) * 0.9; x += Math.cos(a) * 7; y += Math.sin(a) * 7; g2.lineTo(x, y); if (depth > 0 && rnd() < 0.08) { g2.stroke(); crackLine(x, y, a + (rnd() < 0.5 ? 1 : -1) * (0.6 + rnd() * 0.6), len * 0.5, w * 0.6, depth - 1); g2.lineWidth = w; g2.beginPath(); g2.moveTo(x, y); } }
        g2.stroke();
      };
      for (let k = 0; k < 26; k++) crackLine(rnd() * s, rnd() * s, rnd() * 6.28, 10 + rnd() * 20, 1.5 + rnd() * 2, 2);
      for (let k = 0; k < 300; k++) { g2.fillStyle = rnd() < 0.5 ? 'rgba(90,97,110,0.35)' : 'rgba(30,32,40,0.3)'; g2.fillRect(rnd() * s, rnd() * s, 2 + rnd() * 3, 2 + rnd() * 3); }
    }, 1);
    crack.repeat.set(6, 6);
    const mask = tex(256, (g2, s) => {                                                                                   // ragged round edge
      const n = tileNoise(12); const img = g2.createImageData(s, s); const d = img.data;
      for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
        const dx = x / s - 0.5, dy = y / s - 0.5, r = Math.hypot(dx, dy) * 2, ang = Math.atan2(dy, dx);
        const edge = 0.78 + (n(Math.cos(ang) * 3 + 6, Math.sin(ang) * 3 + 6) - 0.5) * 0.3;
        const a = Math.max(0, Math.min(1, (edge + 0.12 - r) / 0.24)); const i = (y * s + x) * 4; d[i] = d[i + 1] = d[i + 2] = a * 255; d[i + 3] = 255;
      }
      g2.putImageData(img, 0, 0);
    }); mask.colorSpace = THREE.NoColorSpace; mask.wrapS = mask.wrapT = THREE.ClampToEdgeWrapping;
    const disc = new THREE.Mesh(new THREE.PlaneGeometry(WASTE.r * 2.3, WASTE.r * 2.3), new THREE.MeshStandardMaterial({ map: crack, alphaMap: mask, transparent: true, depthWrite: false, roughness: 1 }));
    disc.rotation.x = -Math.PI / 2; disc.position.set(WASTE.x, GY + 0.008, WASTE.z); disc.receiveShadow = true; disc.renderOrder = 2; scene.add(disc);
    // charcoal dead trees, bigger and more twisted than the old court ones
    const wd = new THREE.InstancedMesh(deadGeo, new THREE.MeshStandardMaterial({ color: 0x3c3f44, roughness: 1, flatShading: true }), 18); let nd = 0;
    for (let k = 0; k < 600 && nd < 18; k++) {
      const a = rnd() * 6.28, r = 5 + rnd() * (WASTE.r - 5), x = WASTE.x + Math.cos(a) * r, z = WASTE.z + Math.sin(a) * r;
      if (nearPath(x, z, 2.0) || nearRiver(x, z, 4)) continue;
      const s = 1.3 + rnd() * 0.8; solid(x, z, 0.25 * s);
      tmp.position.set(x, GY, z); tmp.rotation.set((rnd() - 0.5) * 0.25, rnd() * 6.28, (rnd() - 0.5) * 0.25); tmp.scale.setScalar(s); tmp.updateMatrix(); wd.setMatrixAt(nd++, tmp.matrix);
      const H = 3.6 * s; swaps.push({ f: 'p_deadtree', hide: [wd], at: new THREE.Vector3(x, GY - 0.1, z), ry: tmp.rotation.y, s: [H, H, H] });
    }
    wd.count = nd; wd.castShadow = true; scene.add(wd);
    // more of the same dead tree where the land is dying: round the Naga's lair, the Weeping Pool, the Ghost Marsh
    const deadAt = (cx: number, cz: number, r0: number, r1: number, n: number, h0: number, h1: number, avoid: (x: number, z: number) => boolean) => {
      for (let k = 0, m = 0; k < 500 && m < n; k++) {
        const a = rnd() * 6.28, r = r0 + rnd() * (r1 - r0), x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
        if (avoid(x, z) || nearPath(x, z, 3) || nearRiver(x, z, 4) || CH1.camps.some((c) => Math.hypot(x - c.x, z - c.z) < 7) || inWaterCh1(x, z) || !walkableCh1(x, z) || terrainBusy(x, z, 1)) continue;
        const H = h0 + rnd() * (h1 - h0); solid(x, z, 0.05 * H); swaps.push({ f: 'p_deadtree', hide: [], at: new THREE.Vector3(x, terrainH(x, z) - 0.1, z), ry: rnd() * 6.28, s: [H, H, H] }); m++;
      }
    };
    deadAt(CH1.lair.x, CH1.lair.z, CH1.barrierR + 4, CH1.barrierR + 16, 10, 6, 9, (x, z) => Math.hypot(x - CH1.gate.x, z - CH1.gate.z) < 10);
    deadAt(...growCh1(-141, -79), 8.5, 14, 5, 4.5, 7, (x, z) => Math.hypot(x - CH1.camps[18].x, z - CH1.camps[18].z) < 8);
    deadAt(...growCh1(32, -62), 6, 26, 6, 4.5, 7, () => false);
    // stones and bone-pale rubble
    const ws = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0x4d5360, roughness: 1, flatShading: true }), 40); let nw = 0;
    for (let k = 0; k < 40; k++) {
      const a = rnd() * 6.28, r = 2 + rnd() * (WASTE.r - 2), x = WASTE.x + Math.cos(a) * r, z = WASTE.z + Math.sin(a) * r, s = 0.12 + rnd() * 0.35;
      tmp.position.set(x, GY + s * 0.3, z); tmp.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3); tmp.scale.set(s, s * 0.6, s); tmp.updateMatrix(); ws.setMatrixAt(nw++, tmp.matrix);
    }
    ws.count = nw; ws.castShadow = true; scene.add(ws);
  }
  // ---- minion camps: trampled clearing, stone-ringed campfire, sitting logs, a hide lean-to, crates and barrels (the chest comes with the props)
  const nearCamp = (x: number, z: number, d: number) => CH1.camps.some((c) => Math.hypot(x - c.x, z - c.z) < d) || Math.hypot(x - CH1.lair.x, z - CH1.lair.z) < CH1.lair.r + d * 0.5 || PLACE_CLEAR.some((c) => Math.hypot(x - c.x, z - c.z) < c.r + d * 0.4);
  const campChests: Array<{ x: number; z: number; ry: number }> = []; const captives: Array<{ camp: number; x: number; z: number; objs: THREE.Object3D[] }> = []; const campAnims: Array<(t: number, dt: number) => void> = [];
  for (const h of HILLS) if (h.chest) { campChests.push({ x: h.x, z: h.z, ry: h.back }); solid(h.x, h.z, 0.5, 0.7); }   // a lookout's reward on top
  {
    const dirt = keepTex(256, campDirtDraw, (g2, s) => {
      const n = tileNoise(10), n2 = tileNoise(30); const img = g2.createImageData(s, s); const d = img.data;
      for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
        const dx = x / s - 0.5, dy = y / s - 0.5, r = Math.hypot(dx, dy) * 2, ang = Math.atan2(dy, dx); const v = n(x / s * 10, y / s * 10) * 0.6 + n2(x / s * 30, y / s * 30) * 0.4;
        const edge = 0.8 + (n(Math.cos(ang) * 2 + 5, Math.sin(ang) * 2 + 5) - 0.5) * 0.35; const a = Math.max(0, Math.min(1, (edge - r) / 0.22));
        const i = (y * s + x) * 4; d[i] = 120 + v * 60; d[i + 1] = 108 + v * 50; d[i + 2] = 70 + v * 36; d[i + 3] = a * 255;          // #a99b67 .. #8b8554
      }
      g2.putImageData(img, 0, 0);
      for (let k = 0; k < 500; k++) { g2.fillStyle = `rgba(60,50,30,${rnd() * 0.25})`; g2.fillRect(rnd() * s, rnd() * s, 1 + rnd() * 3, 1 + rnd() * 2); }
    });
    dirt.wrapS = dirt.wrapT = THREE.ClampToEdgeWrapping;
    const woodTex = keepTex(256, crateDraw, (g2, s) => {                                                           // crate planks with a dark frame
      g2.fillStyle = '#6b4a2a'; g2.fillRect(0, 0, s, s);
      for (let k = 0; k < 4; k++) { const v = rnd(); g2.fillStyle = `rgb(${120 + v * 30},${84 + v * 20},${48 + v * 14})`; g2.fillRect(4, 4 + k * 30, s - 8, 26); }
      for (let k = 0; k < 200; k++) { g2.fillStyle = `rgba(50,30,15,${rnd() * 0.3})`; g2.fillRect(rnd() * s, rnd() * s, 6 + rnd() * 14, 1); }
      g2.strokeStyle = '#3a2614'; g2.lineWidth = 8; g2.strokeRect(4, 4, s - 8, s - 8); g2.beginPath(); g2.moveTo(8, 8); g2.lineTo(s - 8, s - 8); g2.stroke();
    });
    const hideTex = keepTex(256, hideDraw, (g2, s) => {                                                           // stitched hide patches
      g2.fillStyle = '#8a6a48'; g2.fillRect(0, 0, s, s);
      for (let k = 0; k < 9; k++) { const v = rnd(); g2.fillStyle = `rgb(${110 + v * 40},${80 + v * 30},${52 + v * 20})`; g2.fillRect((k % 3) * s / 3 + 2, Math.floor(k / 3) * s / 3 + 2, s / 3 - 4, s / 3 - 4); }
      g2.strokeStyle = 'rgba(40,25,12,0.8)'; g2.setLineDash([3, 3]); g2.lineWidth = 1.5; for (let k = 1; k < 3; k++) { g2.beginPath(); g2.moveTo(k * s / 3, 0); g2.lineTo(k * s / 3, s); g2.stroke(); g2.beginPath(); g2.moveTo(0, k * s / 3); g2.lineTo(s, k * s / 3); g2.stroke(); }
    });
    const barrelTex = keepTex(256, barrelDraw, (g2, s) => {
      g2.fillStyle = '#6e4c2c'; g2.fillRect(0, 0, s, s); for (let k = 0; k < 10; k++) { g2.fillStyle = `rgba(${90 + rnd() * 40},${60 + rnd() * 20},30,0.6)`; g2.fillRect(k * s / 10, 0, s / 10 - 1, s); }
      g2.fillStyle = '#2e2a26'; g2.fillRect(0, s * 0.14, s, 7); g2.fillRect(0, s * 0.8, s, 7);
    });
    const dirtMat = new THREE.MeshStandardMaterial({ map: dirt, transparent: true, depthWrite: false, roughness: 1 });
    const woodMat = new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.9 }), hideMat = new THREE.MeshStandardMaterial({ map: hideTex, roughness: 0.95, side: THREE.DoubleSide });
    const barrelMat = new THREE.MeshStandardMaterial({ map: barrelTex, roughness: 0.85 }), barkMat2 = new THREE.MeshStandardMaterial({ color: 0x5a4330, roughness: 1, flatShading: true });
    const stoneMat2 = new THREE.MeshStandardMaterial({ color: 0x777468, roughness: 1, flatShading: true }), charMat = new THREE.MeshStandardMaterial({ color: 0x1e1612, roughness: 1 });
    const glowTex = tex(64, (g2, s) => { const gr = g2.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2); gr.addColorStop(0, 'rgba(255,170,80,0.9)'); gr.addColorStop(1, 'rgba(255,120,40,0)'); g2.fillStyle = gr; g2.fillRect(0, 0, s, s); });
    const boneMat = new THREE.MeshStandardMaterial({ color: 0xd8d0b8, roughness: 0.8 }), candleMat = new THREE.MeshStandardMaterial({ color: 0x1a1418, roughness: 0.7 });
    const ironMat = new THREE.MeshStandardMaterial({ color: 0x2a2826, roughness: 0.6, metalness: 0.6 }), bambooMat = new THREE.MeshStandardMaterial({ color: 0x9a8a50, roughness: 0.9 });
    const graveMat = new THREE.MeshStandardMaterial({ color: 0x8a8a84, roughness: 1, flatShading: true }), soilMat = new THREE.MeshStandardMaterial({ color: 0x4a3a28, roughness: 1 });
    const skullGeo = mergeGeometries([new THREE.SphereGeometry(0.14, 8, 6).scale(1, 0.95, 1.1).toNonIndexed(), new THREE.BoxGeometry(0.16, 0.08, 0.12).translate(0, -0.12, 0.05).toNonIndexed()]);
    const runeTex = tex(256, (g2, s) => {                                                                  // a summoning circle: rings, a star, runes
      g2.clearRect(0, 0, s, s); g2.translate(s / 2, s / 2); g2.strokeStyle = '#fff'; g2.lineWidth = 5; g2.beginPath(); g2.arc(0, 0, s * 0.46, 0, 7); g2.stroke(); g2.lineWidth = 3; g2.beginPath(); g2.arc(0, 0, s * 0.38, 0, 7); g2.stroke();
      g2.beginPath(); for (let k = 0; k <= 5; k++) { const a = -Math.PI / 2 + k * 4 * Math.PI / 5; g2.lineTo(Math.cos(a) * s * 0.38, Math.sin(a) * s * 0.38); } g2.stroke();
      g2.font = `${s * 0.06}px serif`; g2.fillStyle = '#fff'; for (let k = 0; k < 16; k++) { g2.save(); g2.rotate(k / 16 * 6.28); g2.fillText('ᛟᚱᛉᛞᚦᛗᛒᛃ'[k % 8], -s * 0.02, -s * 0.405); g2.restore(); }
    }); runeTex.wrapS = runeTex.wrapT = THREE.ClampToEdgeWrapping;
    const put = (m: THREE.Mesh, x: number, y: number, z: number, ry = 0, rx = 0, rz = 0) => { m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = true; m.receiveShadow = true; scene.add(m); return m; };
    for (const [ci, c] of CH1.camps.entries()) {
      const GY = terrainH(c.x, c.z);                                                            // camps on hills stand on the hilltop
      const at2 = (ang: number, r: number): [number, number] => [c.x + Math.sin(ang) * r, c.z + Math.cos(ang) * r];
      const clearing = new THREE.Mesh(new THREE.PlaneGeometry(15, 15), dirtMat); clearing.rotation.x = -Math.PI / 2; clearing.position.set(c.x, GY + 0.006, c.z); clearing.receiveShadow = true; clearing.renderOrder = 2; scene.add(clearing);
      // campfire: ring of stones, crossed logs, charred bed, glow on the ground, GPT flame (swapped in with the brazier flames)
      put(new THREE.Mesh(new THREE.CircleGeometry(0.75, 16).rotateX(-Math.PI / 2), charMat), c.x, GY + 0.012, c.z).castShadow = false;
      for (let k = 0; k < 9; k++) { const a = k / 9 * 6.28, s = 0.16 + rnd() * 0.08; { const st = put(new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), stoneMat2), c.x + Math.sin(a) * 0.78, GY + s * 0.5, c.z + Math.cos(a) * 0.78, rnd() * 3, rnd() * 3); swaps.push({ f: 'p_mossrock', hide: [st], at: st.position.clone().setY(st.position.y - s * 0.55), ry: a * 2.3, s: [s * 1.7, s * 1.5, s * 1.7] }); }; }
      for (let k = 0; k < 4; k++) put(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 1.1, 6), barkMat2), c.x, GY + 0.2, c.z, k * 0.8, 1.1, 0);
      const glow = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 4.5).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.55 }));
      glow.position.set(c.x, GY + 0.02, c.z); glow.renderOrder = 2; scene.add(glow);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.8, 8), new THREE.MeshBasicMaterial({ color: 0xffa040 })); cone.position.set(c.x, GY + 0.25, c.z); scene.add(cone);
      flameCones.push({ cone, h: 1.6, dire: false }); fireSpots.push(new THREE.Vector3(c.x, GY + 0.5, c.z)); solid(c.x, c.z, 0.85, 0.45);
      // two sitting logs round the fire (low: jumpable)
      for (const a of [c.tent + 1.9, c.tent + 4.0]) { const [x, z] = at2(a, 2.3); put(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 1.8, 8), barkMat2), x, GY + 0.22, z, -a, 0, Math.PI / 2); solidLine(x - Math.cos(a) * 0.9, z + Math.sin(a) * 0.9, x + Math.cos(a) * 0.9, z - Math.sin(a) * 0.9, 0.22, 0.48); }
      // shelter: a hide teepee in every other camp, otherwise a lean-to (two poles and a sloped hide roof, open toward the fire)
      if (ci % 2) { const [x, z] = at2(c.tent, 4.8); const g = new THREE.Group(); g.position.set(x, GY, z);
        const tp = new THREE.Mesh(new THREE.ConeGeometry(1.5, 2.8, 16, 3, true), hideMat); tp.position.y = 1.4; tp.castShadow = true; tp.receiveShadow = true; g.add(tp);
        for (let k = 0; k < 5; k++) { const a = k / 5 * 6.28; const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 3.5, 5), barkMat2); pole.position.set(Math.cos(a) * 0.55, 1.7, Math.sin(a) * 0.55); pole.rotation.set(Math.sin(a) * 0.28, 0, -Math.cos(a) * 0.28); g.add(pole); }
        const door = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.2), charMat); const fx2 = -Math.sin(c.tent), fz2 = -Math.cos(c.tent); door.position.set(fx2 * 1.0, 0.6, fz2 * 1.0); door.rotation.set(0.28, Math.atan2(fx2, fz2), 0); g.add(door);   // dark doorway toward the fire
        scene.add(g); solid(x, z, 1.5); }
      else { const [x, z] = at2(c.tent, 4.6); const g = new THREE.Group(); g.position.set(x, GY, z); g.rotation.y = c.tent;
        for (const sx of [-1.4, 1.4]) { const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 2.1, 6), barkMat2); pole.position.set(sx, 1.05, -0.9); pole.rotation.x = -0.15; pole.castShadow = true; g.add(pole); }
        const roofG = new THREE.PlaneGeometry(3.2, 2.6, 8, 6); { const pa = roofG.getAttribute('position') as THREE.BufferAttribute; for (let q = 0; q < pa.count; q++) { const u = pa.getX(q) / 1.6, v = pa.getY(q) / 1.3; pa.setZ(q, -0.16 * (1 - u * u) * (1 - v * v)); } roofG.computeVertexNormals(); }   // the hide sags between the poles
        const roof = new THREE.Mesh(roofG, hideMat); roof.position.set(0, 1.0, 0.1); roof.rotation.x = -Math.PI / 2 + 0.75; roof.castShadow = true; roof.receiveShadow = true; g.add(roof);
        const bed = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.6).rotateX(-Math.PI / 2), hideMat); bed.position.set(0, 0.02, 0.2); g.add(bed); scene.add(g);
        const ax = Math.cos(c.tent), az = -Math.sin(c.tent); solidLine(x - ax * 1.4, z - az * 1.4, x + ax * 1.4, z + az * 1.4, 0.5); }
      // crates: two side by side and one stacked (the stack is too tall to jump)
      { const [x, z] = at2(c.tent + 1.1, 4.4); const ry = rnd() * 0.6;
        put(new THREE.Mesh(box(0.8, 0.8, 0.8, 0.8), woodMat), x, GY + 0.4, z, ry); put(new THREE.Mesh(box(0.7, 0.7, 0.7, 0.7), woodMat), x + Math.cos(ry) * 0.85, GY + 0.35, z - Math.sin(ry) * 0.85, ry + 0.2);
        put(new THREE.Mesh(box(0.65, 0.65, 0.65, 0.65), woodMat), x + 0.05, GY + 1.12, z, ry + 0.4); solid(x + Math.cos(ry) * 0.4, z - Math.sin(ry) * 0.4, 0.75); }
      // barrels
      { const [x, z] = at2(c.tent - 1.2, 4.3);
        for (let k = 0; k < 3; k++) { const bx = x + (k - 1) * 0.75, bz = z + (k === 1 ? 0.5 : 0); put(new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.3, 0.95, 12), barrelMat), bx, GY + 0.47, bz, rnd() * 3); solid(bx, bz, 0.3); } }
      { const [x, z] = at2(c.tent + 3.0, 4.0); campChests.push({ x, z, ry: -(c.tent + 3.0) }); solid(x, z, 0.5, 0.7); }
      // the camp's evil
      const [ex, ez] = at2(c.tent - 2.3, 5.0);
      if (c.evil === 'ritual') {                                                    // a glowing rune circle, black candles, skulls
        const rune = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 3.6).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: runeTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xb04cff, toneMapped: false }));
        rune.position.set(ex, GY + 0.03, ez); rune.renderOrder = 2; scene.add(rune);
        campAnims.push((t) => { rune.rotation.y = t * 0.25; (rune.material as THREE.MeshBasicMaterial).opacity = 0.7 + 0.3 * Math.sin(t * 2.3 + ci); });
        for (let k = 0; k < 6; k++) { const a = k / 6 * 6.28; put(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.32, 6), candleMat), ex + Math.cos(a) * 1.85, GY + 0.16, ez + Math.sin(a) * 1.85).castShadow = false;
          const fl = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), new THREE.MeshBasicMaterial({ color: 0xc88cff, toneMapped: false })); fl.position.set(ex + Math.cos(a) * 1.85, GY + 0.37, ez + Math.sin(a) * 1.85); scene.add(fl); }
        for (let k = 0; k < 4; k++) put(new THREE.Mesh(skullGeo, boneMat), ex + (rnd() - 0.5) * 0.8, GY + 0.12, ez + (rnd() - 0.5) * 0.8, rnd() * 6, 0, 0);
      } else if (c.evil === 'cauldron') {                                          // a witch's cauldron of green brew on its own fire
        const pot = put(new THREE.Mesh(new THREE.LatheGeometry([0, 0.35, 0.6, 0.72, 0.7, 0.62, 0.66].map((r, i) => new THREE.Vector2(r, i * 0.15)), 14), ironMat), ex, GY + 0.25, ez);
        pot.scale.setScalar(1.1);
        for (const a of [0, 2.1, 4.2]) put(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.4, 5), ironMat), ex + Math.cos(a) * 0.55, GY + 0.15, ez + Math.sin(a) * 0.55);
        const brew = new THREE.Mesh(new THREE.CircleGeometry(0.66, 18).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x6aff5a, toneMapped: false })); brew.position.set(ex, GY + 0.25 + 0.8, ez); scene.add(brew);
        const gl = new THREE.Mesh(new THREE.PlaneGeometry(4, 4).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: glowTex, color: 0x6aff5a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.6 })); gl.position.set(ex, GY + 0.025, ez); gl.renderOrder = 2; scene.add(gl);
        const cone2 = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.5, 8), new THREE.MeshBasicMaterial({ color: 0xffa040 })); cone2.position.set(ex, GY + 0.05, ez); scene.add(cone2); flameCones.push({ cone: cone2, h: 0.9, dire: false });
        const NB = 14, bg = new THREE.BufferGeometry(), bp = new Float32Array(NB * 3), age = new Float32Array(NB).map(() => Math.random());
        bg.setAttribute('position', new THREE.BufferAttribute(bp, 3)); scene.add(new THREE.Points(bg, new THREE.PointsMaterial({ color: 0x9aff7a, size: 0.12, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false })));
        campAnims.push((_t, dt) => { for (let k = 0; k < NB; k++) { age[k] += dt * 0.7; if (age[k] > 1) age[k] = 0; const a = k * 2.4; bp[k * 3] = ex + Math.cos(a) * 0.4 * (1 - age[k] * 0.5); bp[k * 3 + 1] = GY + 1.08 + age[k] * 1.2; bp[k * 3 + 2] = ez + Math.sin(a) * 0.4 * (1 - age[k] * 0.5); } bg.attributes.position.needsUpdate = true; });
        solid(ex, ez, 0.85);
      } else if (c.evil === 'totems') {                                            // skulls on pikes ringing the camp
        for (let k = 0; k < 5; k++) { const a = c.tent + 0.6 + k * 1.15, [tx, tz] = at2(a, 6.6);
          put(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 2.3, 6), barkMat2), tx, GY + 1.15, tz, 0, (rnd() - 0.5) * 0.15, (rnd() - 0.5) * 0.15);
          put(new THREE.Mesh(skullGeo, boneMat), tx, GY + 2.38, tz, -a + Math.PI, 0, 0).scale.setScalar(1.3);
          if (k % 2 === 0) put(new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.025, 5, 10), boneMat), tx, GY + 1.9, tz, a, Math.PI / 2, 0);
          solid(tx, tz, 0.2); }
      } else if (c.evil === 'cage') {                                              // a bamboo prisoner cage with a slumped captive
        const g = new THREE.Group(); g.position.set(ex, GY, ez); g.rotation.y = c.tent;
        for (let k = 0; k < 16; k++) { const side = Math.floor(k / 4), u = (k % 4) / 3 - 0.5; const bx = side < 2 ? u * 1.5 : (side === 2 ? -0.75 : 0.75), bz = side < 2 ? (side === 0 ? -0.75 : 0.75) : u * 1.5;
          const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 1.9, 5), bambooMat); bar.position.set(bx, 0.95, bz); bar.castShadow = true; g.add(bar); }
        { const fl = new THREE.Mesh(box(1.6, 0.08, 1.6, 1), bambooMat); fl.position.y = 0.05; g.add(fl); }
        for (const [w, d, x, z] of [[1.6, 0.08, 0, -0.76], [1.6, 0.08, 0, 0.76], [0.08, 1.6, -0.76, 0], [0.08, 1.6, 0.76, 0], [1.6, 0.06, 0, 0], [0.06, 1.6, 0, 0]]) { const r = new THREE.Mesh(box(w, 0.08, d, 1), bambooMat); r.position.set(x, 1.9, z); g.add(r); }   // an open lattice roof (she stays visible from above)
        const capMat = new THREE.MeshStandardMaterial({ color: 0xf4e4d8, roughness: 0.8, emissive: 0xffd8b0, emissiveIntensity: 0.35 });          // stand-in for Ma Hnin (her model replaces it)
        const cap = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.5, 4, 8), capMat); cap.position.set(0.1, 0.4, 0.2); cap.rotation.set(0.5, 0, 0.9); g.add(cap);
        const hd = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), capMat); hd.position.set(-0.25, 0.55, 0.35); g.add(hd);
        const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffd8a0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.6 })); halo.position.set(0, 0.6, 0.2); halo.scale.setScalar(1.8); g.add(halo);
        scene.add(g); solidBox(ex, ez, 1.7, 1.7); captives.push({ camp: ci, x: ex, z: ez, objs: [cap, hd, halo] });
      } else if (c.evil === 'graves') {                                            // freshly opened graves, tombstones, pale ghost-lights
        for (let k = 0; k < 4; k++) { const a = c.tent - 3.0 + k * 0.55, [gx, gz] = at2(a, 6.0);
          const st = put(new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.85, 0.16), graveMat), gx, GY + 0.4, gz, -a, (rnd() - 0.5) * 0.25, (rnd() - 0.5) * 0.3);
          put(new THREE.Mesh(new THREE.CylinderGeometry(0.275, 0.275, 0.16, 10, 1, false, 0, Math.PI), graveMat), gx, GY + 0.82, gz, -a + Math.PI / 2, 0, Math.PI / 2).rotation.copy(st.rotation);
          const mound = put(new THREE.Mesh(new THREE.SphereGeometry(0.45, 10, 6).scale(1, 0.18, 1.7), soilMat), gx - Math.sin(a) * 0.95, GY - 0.02, gz - Math.cos(a) * 0.95, -a); mound.castShadow = false;
          solid(gx, gz, 0.3, 0.85); }
        const pit = put(new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.8).rotateX(-Math.PI / 2), charMat), ex, GY + 0.015, ez, -c.tent); pit.castShadow = false;
        for (let k = 0; k < 3; k++) { const wisp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xa8e0ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
          wisp.scale.setScalar(0.7); scene.add(wisp); const ph = rnd() * 6;
          campAnims.push((t) => { wisp.position.set(ex + Math.sin(t * 0.6 + ph) * 2.2, GY + 1.2 + Math.sin(t * 1.3 + ph) * 0.4, ez + Math.cos(t * 0.5 + ph * 2) * 2.2); }); }
      }
    }
  }


  // ---- the south-west: Sunken Monastery, Empty Village, Snare Fields (procedural stand-ins; Tripo models can replace them)
  const swAnims: Array<(t: number) => void> = [];
  {
    const sandstone = new THREE.MeshStandardMaterial({ map: blockTex(), color: 0xa89a7c, roughness: 0.95 });
    const moss = new THREE.MeshStandardMaterial({ color: 0x5c6a3a, roughness: 1, flatShading: true });
    const gilt = new THREE.MeshStandardMaterial({ color: 0xb08a42, roughness: 0.45, metalness: 0.7 });
    const timber = new THREE.MeshStandardMaterial({ color: 0x6e5236, roughness: 0.95 }), charred = new THREE.MeshStandardMaterial({ color: 0x241c18, roughness: 1 });
    const thatch = new THREE.MeshStandardMaterial({ color: 0x9a8550, roughness: 1, flatShading: true, side: THREE.DoubleSide }), burntThatch = new THREE.MeshStandardMaterial({ color: 0x3a3026, roughness: 1, flatShading: true, side: THREE.DoubleSide });
    const bamboo = new THREE.MeshStandardMaterial({ color: 0x9a8a50, roughness: 0.9 });
    const put = (m: THREE.Mesh, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => { m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = true; m.receiveShadow = true; scene.add(m); return m; };
    const glowTex = tex(64, (g2, s) => { const gr = g2.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2); gr.addColorStop(0, 'rgba(255,250,220,1)'); gr.addColorStop(0.35, 'rgba(255,215,130,0.7)'); gr.addColorStop(1, 'rgba(255,180,80,0)'); g2.fillStyle = gr; g2.fillRect(0, 0, s, s); });
    const sparkle = (x: number, y: number, z: number, s: number, col: number) => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: col, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })); sp.position.set(x, y, z); sp.scale.setScalar(s); scene.add(sp); return sp; };
    const lootAt = (x: number, z: number, y: number | null, souls: number, name: string) => {
      campChests.push({ x, z, ry: rnd() * 6.28, ...(y !== null ? { y } : {}) } as { x: number; z: number; ry: number }); solid(x, z, 0.5, (y ?? terrainH(x, z)) - terrainH(x, z) + 0.7);
      const gy = (y ?? terrainH(x, z)) + 1.0; const glow = sparkle(x, gy, z, 1.1, 0xffd27a); swAnims.push((t) => { glow.position.y = gy + Math.sin(t * 2 + x) * 0.12; (glow as THREE.Sprite).material.opacity = 0.65 + 0.35 * Math.sin(t * 3 + z); });
      LOOT.push({ x, z, y, souls, name, opened: false, glow });
    };
    const fragmentAt = (x: number, z: number, y: number | null, text: string) => {
      const by = (y ?? terrainH(x, z)) + 1.2; const o = sparkle(x, by, z, 0.9, 0xfff0d0); const ring = sparkle(x, by, z, 2.2, 0xffc860); (ring as THREE.Sprite).material.opacity = 0.35; o.add(ring); ring.position.set(0, 0, 0); ring.scale.setScalar(2.4);
      swAnims.push((t) => { o.position.y = by + Math.sin(t * 1.6 + x) * 0.18; (o as THREE.Sprite).material.rotation = t * 0.6; });
      FRAGMENTS.push({ x, z, y, text, taken: false, obj: o });
    };
    const box2 = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
    const solidRect = (x: number, z: number, w: number, d: number, h: number, ry = 0) => { const c = Math.cos(ry), s = Math.sin(ry); for (let a = -w / 2 + 0.2; a <= w / 2 - 0.19; a += 0.35) for (let b = -d / 2 + 0.2; b <= d / 2 - 0.19; b += 0.35) solid(x + a * c + b * s, z - a * s + b * c, 0.18, h); };

    // ---- Sunken Monastery: flooded courts round a tilted stupa, a raised prayer hall, monks' cells, sluice stones
    const M = SITES.monastery;
    for (const p of POOLS) {
      const w = new THREE.Mesh(new THREE.CircleGeometry(p.r - 0.5, 48).rotateX(-Math.PI / 2), poolMaterial(time, p.r - 0.5)); w.position.set(p.x, GY - 0.13, p.z); w.renderOrder = 1; scene.add(w); poolMeshes.push(w);
      for (let k = 0; k < Math.round(p.r * 1.6); k++) { const a = rnd() * 6.28, rr = rnd() * (p.r - 1.5); const pad = put(new THREE.Mesh(new THREE.CircleGeometry(0.35 + rnd() * 0.3, 10, 0.3, 5.6).rotateX(-Math.PI / 2), moss), p.x + Math.cos(a) * rr, GY - 0.11, p.z + Math.sin(a) * rr, 0, rnd() * 6, 0); pad.castShadow = false;
        if (rnd() < 0.35) put(new THREE.Mesh(new THREE.SphereGeometry(0.13, 6, 4).scale(1, 0.7, 1), new THREE.MeshStandardMaterial({ color: 0xe8a0b8, roughness: 0.6 })), pad.position.x, GY - 0.04, pad.position.z); }
    }
    { // the stupa, half sunk and leaning, its gilt umbrella bent
      const prof = [[0, 0], [3.1, 0], [3.1, 0.45], [2.8, 0.5], [2.8, 0.95], [2.5, 1.0], [2.6, 1.6], [2.65, 2.4], [2.4, 3.2], [1.8, 3.9], [1.1, 4.3], [0.75, 4.5], [0.75, 4.8], [0.45, 5.0], [0.3, 6.2], [0.06, 7.2], [0, 7.25]].map(([r, y]) => new THREE.Vector2(r, y));
      const st = new THREE.Group(); const body = new THREE.Mesh(new THREE.LatheGeometry(prof, 20), sandstone); body.castShadow = body.receiveShadow = true; st.add(body);
      for (const [y, r] of [[5.2, 0.42], [5.6, 0.34], [6.0, 0.26]]) { const t = new THREE.Mesh(new THREE.TorusGeometry(r, 0.06, 6, 16).rotateX(Math.PI / 2), gilt); t.position.y = y; st.add(t); }
      const um = new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.3, 10, 1, true), gilt); um.position.set(0.1, 6.7, 0); um.rotation.z = 0.5; st.add(um);
      for (let k = 0; k < 9; k++) { const a = rnd() * 6.28; const mp = new THREE.Mesh(new THREE.SphereGeometry(0.5 + rnd() * 0.6, 6, 4).scale(1, 0.35, 1), moss); mp.position.set(Math.cos(a) * 2.5, 0.6 + rnd() * 2.2, Math.sin(a) * 2.5); st.add(mp); }
      const [stx, stz] = growCh1(118, -117); st.position.set(stx, GY - 0.9, stz); st.rotation.set(0.1, 0.6, 0.17); scene.add(st); solid(stx, stz, 3.0);
    }
    { // the prayer hall: a raised floor with steps, two rows of columns (some fallen), the abbot's broken seat, a monk statue
      const [hx, hz] = growCh1(114, -89.5), W = 16, D = 10, H = 0.9;
      put(new THREE.Mesh(box2(W, H, D), sandstone), hx, GY + H / 2, hz); solidRect(hx, hz, W, D, H);
      for (let k = 0; k < 3; k++) { const sw = 5, sd = 0.7, sh = 0.3 * (k + 1); put(new THREE.Mesh(box2(sw, sh, sd), sandstone), hx, GY + sh / 2, hz - D / 2 - 0.35 - (2 - k) * 0.7); solidRect(hx, hz - D / 2 - 0.35 - (2 - k) * 0.7, sw, sd, sh); }
      for (const row of [-3.8, 3.8]) for (let k = 0; k < 6; k++) {
        const cx = hx - 6.5 + k * 2.6, cz = hz + row, broken = rnd() < 0.4, ch = broken ? 0.8 + rnd() * 1.4 : 3.6;
        put(new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.4, ch, 10), sandstone), cx, GY + H + ch / 2, cz); solid(cx, cz, 0.42, H + ch);
        if (!broken) put(new THREE.Mesh(box2(0.95, 0.25, 0.95), sandstone), cx, GY + H + ch + 0.12, cz);
      }
      for (let k = 0; k < 3; k++) { const fx = hx - 5 + k * 5 + rnd(), fz = hz + (rnd() - 0.5) * 3; put(new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 2.6, 10), sandstone), fx, GY + H + 0.36, fz, 0, rnd() * 3, Math.PI / 2); }
      // at the head of the hall, from the brothers' time: the hooded travelling alchemist (the saint they kept records for), standing with
      // staff and gourd, face lost in the shadow of the hood; the later occupiers left it be. Moss on its shoulders.
      const sx = hx, sz = hz + 3.6; put(new THREE.Mesh(box2(2.2, 0.6, 1.6), sandstone), sx, GY + H + 0.3, sz);
      const hObjs = grab(() => { put(new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.62, 2.0, 10), sandstone), sx, GY + H + 1.6, sz); put(new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.9, 10), sandstone), sx, GY + H + 3.0, sz);
        put(new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), new THREE.MeshStandardMaterial({ color: 0x1a1612, roughness: 1 })), sx, GY + H + 2.75, sz - 0.18).scale.set(1, 1.1, 0.5);   // the shadow under the hood
        put(new THREE.Mesh(new THREE.SphereGeometry(0.5, 6, 4).scale(1, 0.35, 1), moss), sx + 0.2, GY + H + 2.6, sz); });
      swaps.push({ f: 'p_healer_statue', hide: hObjs, at: new THREE.Vector3(sx, GY + H + 0.58, sz), ry: Math.PI, s: [3.0, 3.0, 3.0] });
      solidRect(sx, sz, 2.2, 1.6, H + 3.2);
      fragmentAt(hx - 5.5, hz + 1.5, GY + H, 'Dusk. Warm stone under small hands. Someone is laughing beside him.');
    }
    // monks' cells: a broken ring of low rooms round the courts (low walls can be climbed and walked)
    for (let k = 0; k < 9; k++) {
      const a = 0.35 + k * (Math.PI * 2 / 9), cx = M.x + Math.cos(a) * 31, cz = M.z + Math.sin(a) * 27; if (Math.hypot(cx - growCh1(114, -89.5)[0], cz - growCh1(114, -89.5)[1]) < 12 || CH1.camps.some((c) => Math.hypot(cx - c.x, cz - c.z) < 9) || nearPath(cx, cz, 3.2)) continue;   // clear of the camps and the trails
      const ry = -a + Math.PI / 2;
      for (const [ox, oz, w, d] of [[0, -1.5, 3.4, 0.4], [-1.5, 0, 0.4, 3.0], [1.5, 0, 0.4, 3.0]] as Array<[number, number, number, number]>) {
        const h = 0.6 + rnd() * 1.6, c = Math.cos(ry), s = Math.sin(ry), x = cx + ox * c + oz * s, z = cz - ox * s + oz * c;
        put(new THREE.Mesh(box2(w, h, d), sandstone), x, GY + h / 2, z, 0, ry, 0); solidRect(x, z, Math.max(w, 0.4), Math.max(d, 0.4), h, ry);
      }
    }
    { const c1 = [M.x - 32, M.z + 0.5]; fragmentAt(c1[0], c1[1], null, '"You climb like a goat." A girl\'s voice, teasing.'); }
    fragmentAt(M.x + 26, M.z - 22, null, 'The temple wall. Higher than anyone was allowed to go.');
    // the three sluice stones that once drained the courts (a later quest turns them): carved blocks with a cold blue rune
    for (const [x, z] of growAll([[93.5, -99], [141.5, -95], [98.5, -129]])) {
      put(new THREE.Mesh(box2(1.3, 1.7, 1.3), sandstone), x, GY + 0.85, z, 0, rnd(), 0); solid(x, z, 0.75, 1.7);
      const rune = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x58b4ff, transparent: true, opacity: 0.85, toneMapped: false })); rune.position.set(x, GY + 1.72, z); scene.add(rune);
      swAnims.push((t) => { (rune.material as THREE.MeshBasicMaterial).opacity = 0.55 + 0.35 * Math.sin(t * 2 + x); });
    }
    lootAt(...growCh1(124.5, -106.5), null, 80, "The monastery's records chest (every name scraped out)");

    // ---- water's edge: reeds and mossy rocks along the river, the Ghost Marsh's reeds, mist and wet ground, charred rocks round the lair
    {
      const R = agedRng(), reedM: THREE.Matrix4[] = [], o = new THREE.Object3D();
      const reedAt = (x: number, z: number, h: number) => { o.position.set(x, terrainH(x, z) - 0.05, z); o.rotation.set(0, R() * 3.14, 0); o.scale.set(h * 0.6, h, h * 0.6); o.updateMatrix(); reedM.push(o.matrix.clone()); };
      for (let k = 0; k < 900; k++) {
        const t = R(), p = river.getPointAt(t), tg = river.getTangentAt(t), nl = Math.hypot(tg.x, tg.z) || 1, nx = -tg.z / nl, nz = tg.x / nl, sd = R() < 0.5 ? -1 : 1;
        const kind = R(), d = waterHW(t, sd) + (kind < 0.7 ? 0.1 + R() * 1.3 : 0.6 + R() * 1.8), x = p.x + nx * sd * d, z = p.z + nz * sd * d;
        if (nearBridge(x, z, 2.5) || nearPath(x, z, 2) || inWaterCh1(x, z)) continue;
        if (kind < 0.7) reedAt(x, z, 0.8 + R() * 0.9);
        else if (R() < 0.45) { const sc = 0.35 + R() * 0.7; swaps.push({ f: 'p_mossrock', hide: [], at: new THREE.Vector3(x, terrainH(x, z) - sc * 0.25, z), ry: R() * 6.28, s: [sc, sc * (0.7 + R() * 0.5), sc] }); }
      }
      const [MX, MZ] = growCh1(32, -62);                                                                // the Ghost Marsh
      for (let k = 0; k < 260; k++) { const a = R() * 6.28, r = R() * 28, x = MX + Math.cos(a) * r, z = MZ + Math.sin(a) * r; if (nearPath(x, z, 2) || !walkableCh1(x, z)) continue; reedAt(x, z, 0.7 + R() * 1.0); }
      const wet = new THREE.MeshStandardMaterial({ map: tex(128, (g, sz) => { const gr = g.createRadialGradient(sz / 2, sz / 2, 2, sz / 2, sz / 2, sz / 2); gr.addColorStop(0, 'rgba(20,28,22,0.85)'); gr.addColorStop(0.6, 'rgba(30,40,28,0.5)'); gr.addColorStop(1, 'rgba(30,40,28,0)'); g.fillStyle = gr; g.fillRect(0, 0, sz, sz); }), transparent: true, depthWrite: false, roughness: 0.4 });
      for (let k = 0; k < 14; k++) { const a = R() * 6.28, r = R() * 24, x = MX + Math.cos(a) * r, z = MZ + Math.sin(a) * r, w = 4 + R() * 7; const pm = new THREE.Mesh(new THREE.PlaneGeometry(w, w * (0.6 + R() * 0.5)).rotateX(-Math.PI / 2), wet); pm.position.set(x, terrainH(x, z) + 0.02, z); pm.rotation.y = R() * 6; pm.renderOrder = 2; pm.receiveShadow = true; scene.add(pm); }
      for (let k = 0; k < 9; k++) {                                                            // low mist drifting over the marsh
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xc8d8d0, transparent: true, depthWrite: false, opacity: 0.18 })); const a = R() * 6.28, r = R() * 20, x0 = MX + Math.cos(a) * r, z0 = MZ + Math.sin(a) * r, ph = R() * 6;
        sp.position.set(x0, GY + 0.9, z0); sp.scale.set(9 + R() * 6, 2.2, 1); scene.add(sp); campAnims.push((t) => { sp.position.x = x0 + Math.sin(t * 0.07 + ph) * 3; sp.material.opacity = 0.12 + 0.08 * Math.sin(t * 0.3 + ph); });
      }
      for (let k = 0; k < 16; k++) { const a = k / 16 * 6.28 + R() * 0.3, r = CH1.lair.r + 2 + R() * 6, x = CH1.lair.x + Math.cos(a) * r, z = CH1.lair.z + Math.sin(a) * r; if (Math.hypot(x - CH1.gate.x, z - CH1.gate.z) < 9 || nearPath(x, z, 2.5)) continue;
        const sc = 0.6 + R() * 0.9; swaps.push({ f: 'p_mossrock', hide: [], at: new THREE.Vector3(x, terrainH(x, z) - sc * 0.2, z), ry: R() * 6.28, s: [sc * 1.2, sc, sc * 1.2] }); }
      const reedG = mergeGeometries([new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0), new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0).rotateY(Math.PI / 2)]);
      const reedMat = new THREE.MeshStandardMaterial({ map: tex(128, reedDraw), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.9 });
      (reedMat.map as THREE.Texture).wrapS = (reedMat.map as THREE.Texture).wrapT = THREE.ClampToEdgeWrapping;
      chunked(reedG, reedMat, reedM, 30, false);
    }
    // ---- the Old Village (the hub): the people who once kept the hill temple's lamps left when nobody could remember whose temple it was.
    // Stilt huts round a little plaza, the village shrine (a small stupa and the hooded travelling alchemist, face lost in his hood), a well,
    // Ma Hnin's altar (after her rescue), a Soul Shrine and an inscription. Freed captives come home here.
    const hut = (x: number, z: number, ry: number, burnt: boolean) => {
      const hw = 4.2, hd = 3.4, fh = 1.2, post = burnt ? charred : timber, c = Math.cos(ry), s = Math.sin(ry);
      const loc = (a: number, b: number): [number, number] => [x + a * c + b * s, z - a * s + b * c];
      for (const a of [-hw / 2 + 0.2, 0, hw / 2 - 0.2]) for (const b of [-hd / 2 + 0.2, hd / 2 - 0.2]) { const [px, pz] = loc(a, b); put(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, fh, 6), post), px, GY + fh / 2, pz); }
      put(new THREE.Mesh(box2(hw, 0.16, hd), post), x, GY + fh, z, 0, ry, 0); solidRect(x, z, hw, hd, fh, ry);
      for (const [a, b, w, d] of [[0, hd / 2 - 0.05, hw, 0.1], [-hw / 2 + 0.05, 0, 0.1, hd], [hw / 2 - 0.05, 0, 0.1, hd]] as Array<[number, number, number, number]>) {
        const wh = burnt ? 0.4 + rnd() * 0.9 : 1.7; const [px, pz] = loc(a, b); put(new THREE.Mesh(box2(w, wh, d), burnt ? charred : bamboo), px, GY + fh + wh / 2, pz, 0, ry, 0);
        const ww = Math.max(w, d); for (let u = -ww / 2 + 0.2; u <= ww / 2 - 0.19; u += 0.35) { const [qx, qz] = w > d ? loc(a + u, b) : loc(a, b + u); solid(qx, qz, 0.16, fh + wh); }
      }
      if (!burnt) { for (const side of [-1, 1]) { const roof = new THREE.Mesh(box2(hw + 0.8, 0.12, hd * 0.62), thatch); const [px, pz] = loc(0, side * hd * 0.24); put(roof, px, GY + fh + 2.25, pz, side * 0.62, ry, 0); roof.rotation.order = 'YXZ'; roof.rotation.set(side * 0.62, ry, 0); } }
      else { const roof = new THREE.Mesh(box2(hw * 0.6, 0.12, hd * 0.5), burntThatch); const [px, pz] = loc(-0.6, 0.4); put(roof, px, GY + fh + 0.7, pz, 0.5, ry + 0.3, 0.35);
        for (let k = 0; k < 3; k++) { const sm = sparkle(x + (rnd() - 0.5) * 2, GY + 2.5, z + (rnd() - 0.5) * 2, 2.2, 0x6a6460); (sm as THREE.Sprite).material.blending = THREE.NormalBlending; const ph = rnd() * 3; swAnims.push((t) => { const k2 = ((t * 0.25 + ph) % 1); sm.position.y = GY + 2.2 + k2 * 4; (sm as THREE.Sprite).material.opacity = 0.35 * (1 - k2); sm.scale.setScalar(1.5 + k2 * 3); }); } }
      for (let k = 0; k < 3; k++) { const [px, pz] = loc(0, -hd / 2 - 0.45 - k * 0.6); const sh = 0.3 * (3 - k); put(new THREE.Mesh(box2(1.2, sh, 0.6), post), px, GY + sh / 2, pz, 0, ry, 0); solidRect(px, pz, 1.2, 0.6, sh, ry); }
      if (burnt) { const scorch = new THREE.Mesh(new THREE.CircleGeometry(3.4, 16).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x15100c, transparent: true, opacity: 0.55, depthWrite: false })); scorch.position.set(x, GY + 0.015, z); scorch.renderOrder = 2; scene.add(scorch); }
    };
    const V = SITES.village;
    { void flagTex(); const pm2 = new THREE.MeshStandardMaterial({ roughness: 1, transparent: true, depthWrite: false });
      pm2.onBeforeCompile = (sh) => {
        sh.vertexShader = 'varying vec3 vCW;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n vCW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
        sh.fragmentShader = 'varying vec3 vCW;\n' + NOISE + sh.fragmentShader.replace('#include <map_fragment>', `vec2 pw = vCW.xz;
        vec2 cp = pw * 2.5; vec2 ci = floor(cp), cf = fract(cp); float d1 = 8.0, d2 = 8.0; vec2 cid = ci;
        for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
          vec2 g = vec2(float(i), float(j)), q = ci + g; vec2 o = fract(sin(vec2(dot(q, vec2(127.1, 311.7)), dot(q, vec2(269.5, 183.3)))) * 43758.5453);
          vec2 r = g + 0.15 + o * 0.7 - cf; float dd = dot(r, r); if (dd < d1) { d2 = d1; d1 = dd; cid = q; } else if (dd < d2) d2 = dd; }
        float edge = sqrt(d2) - sqrt(d1), cobble = smoothstep(0.03, 0.16, edge);
        float tone = fract(sin(dot(cid, vec2(41.3, 289.1))) * 15731.7), dome = smoothstep(0.0, 0.45, edge);
        vec3 stone = mix(vec3(0.27, 0.28, 0.26), vec3(0.44, 0.43, 0.39), tone) * (0.86 + 0.24 * vnoise(pw * 7.0)) * (0.82 + 0.3 * dome);
        vec3 joint = mix(vec3(0.07, 0.09, 0.06), vec3(0.12, 0.17, 0.08), vnoise(pw * 3.0));
        vec3 cob = mix(joint, stone, cobble);
        float gone = step(0.8, fract(sin(dot(cid, vec2(12.9, 78.2))) * 43758.5));
        float broken = smoothstep(0.6, 0.78, vnoise(pw * 0.2 + 5.0) * 0.75 + vnoise(pw * 0.9) * 0.25);
        vec3 earth = mix(vec3(0.22, 0.18, 0.12), vec3(0.26, 0.36, 0.16), vnoise(pw * 1.3));
        diffuseColor.rgb = mix(cob * vec3(0.5, 0.52, 0.48), earth * 0.8, clamp(max(gone * 0.9, broken), 0.0, 1.0));   // opaque in full sun: darker than the trails' blended stones
        float rr = length(pw - vec2(${V.x.toFixed(2)}, ${V.z.toFixed(2)})); diffuseColor.a = 1.0 - smoothstep(9.0 - 1.8 - vnoise(pw * 0.8) * 1.4, 9.0, rr);`);
      }; pm2.customProgramCacheKey = () => 'plaza-cobble';
      const plaza = new THREE.Mesh(new THREE.CircleGeometry(9, 48).rotateX(-Math.PI / 2), pm2);
      plaza.position.set(V.x, GY + 0.02, V.z); plaza.receiveShadow = true; plaza.renderOrder = 2; scene.add(plaza); }
    // Houses along the lanes, set back with their ladders toward the lane, some with a second house behind; the south quarter, where the
    // goblins came in from the marsh, burnt. Yards with water jars, woodpiles, bamboo fences and palms; vegetable plots on the edge; a
    // washing place on the river.
    const lanePts: Array<{ x: number; z: number; tx: number; tz: number }> = [];
    for (const L of VILLAGE_LANES) for (let k = 0; k < L.length - 1; k++) {
      const [x0, z0] = L[k], [x1, z1] = L[k + 1], len = Math.hypot(x1 - x0, z1 - z0);
      for (let u = 0; u < len; u += 1) lanePts.push({ x: x0 + (x1 - x0) * u / len, z: z0 + (z1 - z0) * u / len, tx: (x1 - x0) / len, tz: (z1 - z0) / len });
    }
    const homes: Array<{ x: number; z: number; th: number; s: number; burnt: boolean }> = []; let nBurnt = 0;
    const flatFree = (x: number, z: number, r: number) => { for (const [a, b] of [[0, 0], [r, r], [-r, r], [r, -r], [-r, -r]]) if (!walkableCh1(x + a, z + b) || Math.abs(terrainH(x + a, z + b) - GY) > 0.05) return false; return true; };
    const homeOk = (x: number, z: number, s: number) => {
      const d0 = Math.hypot(x - V.x, z - V.z); if (d0 < 12.5 || d0 > V.r - 3) return false;
      if (Math.hypot(x - (V.x + 17), z - (V.z - 4)) < 5.5) return false;                         // the ox cart's spot
      if (nearPath(x, z, 3.0 + s * 0.5) || nearRiver(x, z, 8) || nearCamp(x, z, 12)) return false;
      if (CLEAR.some((q) => Math.hypot(x - q.x, z - q.z) < q.r + 3) || VILLAGE_SPOTS.some(([a, b]) => Math.hypot(x - a, z - b) < 4.5)) return false;
      if (homes.some((h) => Math.hypot(x - h.x, z - h.z) < (h.s + s) * 0.86)) return false;
      return flatFree(x, z, s * 0.55);
    };
    const addHome = (x: number, z: number, th: number, s: number) => {
      const burnt = z < -19 && nBurnt < 5; if (burnt) nBurnt++;
      const objs = grab(() => hut(x, z, th + Math.PI, burnt)); homes.push({ x, z, th, s, burnt });
      if (!burnt) swaps.push({ f: 'p_hut', hide: objs, at: new THREE.Vector3(x, GY, z), ry: th, s: [s, s, s] });
    };
    for (const p of lanePts) {
      if (rnd() > 0.38) continue;
      for (const side of [-1, 1]) {
        const nx = -p.tz * side, nz = p.tx * side, s = 4.2 + rnd() * 0.8, d = 3.4 + s * 0.62 + rnd() * 1.8, sl = (rnd() - 0.5) * 2;
        const x = p.x + nx * d + p.tx * sl, z = p.z + nz * d + p.tz * sl; if (!homeOk(x, z, s)) continue;
        addHome(x, z, Math.atan2(p.x - x, p.z - z) + (rnd() - 0.5) * 0.45, s);
        if (rnd() < 0.6) {                                                                     // a second house behind, facing the same lane
          const s2 = 4.1 + rnd() * 0.7, d2 = s * 0.6 + s2 * 0.6 + 1.5 + rnd() * 2, x2 = x + nx * d2 + p.tx * (rnd() - 0.5) * 5, z2 = z + nz * d2 + p.tz * (rnd() - 0.5) * 5;
          if (homeOk(x2, z2, s2)) addHome(x2, z2, Math.atan2(p.x - x2, p.z - z2) + (rnd() - 0.5) * 0.7, s2);
        }
      }
    }
    for (let k = 0; k < 900 && homes.length < 32; k++) {                                      // infill the blocks between lanes, each house turned to its nearest lane
      const a = rnd() * 6.28, r = 13 + rnd() * (V.r - 16), x = V.x + Math.cos(a) * r, z = V.z + Math.sin(a) * r, s = 4.1 + rnd() * 0.8;
      let best = lanePts[0], bd = 1e9; for (const q of lanePts) { const d = (q.x - x) ** 2 + (q.z - z) ** 2; if (d < bd) { bd = d; best = q; } }
      if (Math.sqrt(bd) > 22 || !homeOk(x, z, s)) continue;
      addHome(x, z, Math.atan2(best.x - x, best.z - z) + (rnd() - 0.5) * 0.8, s);
    }
    { // yards: jars by the door, a woodpile at the side, a bamboo fence on some, a palm out back
      const jarGeo = new THREE.LatheGeometry([[0, 0], [0.2, 0.02], [0.29, 0.22], [0.25, 0.46], [0.15, 0.56], [0.18, 0.62], [0, 0.62]].map(([a, b]) => new THREE.Vector2(a, b)), 10);
      const logGeo = mergeGeometries([0, 1, 2, 3, 4].map((k) => new THREE.CylinderGeometry(0.1, 0.1, 1.4, 6).rotateZ(Math.PI / 2).translate(0, k < 3 ? 0.1 : 0.27, k < 3 ? (k - 1) * 0.2 : (k - 3.5) * 0.2)));
      const postGeo = new THREE.CylinderGeometry(0.04, 0.05, 1.0, 5).translate(0, 0.5, 0), railGeo = new THREE.BoxGeometry(0.05, 0.05, 1).translate(0, 0, 0.5);
      const jars: THREE.Matrix4[] = [], logs: THREE.Matrix4[] = [], posts: THREE.Matrix4[] = [], rails: THREE.Matrix4[] = []; const o = new THREE.Object3D();
      const at = (m: THREE.Matrix4[], x: number, y: number, z: number, ry: number, sx = 1, sy = 1, sz = 1) => { o.position.set(x, y, z); o.rotation.set(0, ry, 0); o.scale.set(sx, sy, sz); o.updateMatrix(); m.push(o.matrix.clone()); };
      const clearAt = (x: number, z: number) => !nearPath(x, z, 1.6) && walkableCh1(x, z);
      for (const h of homes) {
        const fx = Math.sin(h.th), fz = Math.cos(h.th), rx = Math.cos(h.th), rz = -Math.sin(h.th), hw = 0.49 * h.s, hd = 0.58 * h.s;
        const P = (f: number, r: number): [number, number] => [h.x + fx * f + rx * r, h.z + fz * f + rz * r];
        if (!h.burnt) for (let k = 0; k < 1 + Math.floor(rnd() * 3); k++) { const [x, z] = P(hd - 0.7 - k * 0.1, hw + 0.45 + k * 0.6); if (clearAt(x, z)) { at(jars, x, GY, z, rnd() * 6, 1, 0.85 + rnd() * 0.3, 1); solid(x, z, 0.3, 0.6); } }
        { const sd = rnd() < 0.5 ? -1 : 1, [x, z] = P(-hd * 0.3, sd * (hw + 0.8)); if (clearAt(x, z)) { at(logs, x, GY, z, h.th, 1, 1, 1); solidRect(x, z, 0.6, 1.4, 0.5, h.th + Math.PI / 2); } }
        if (!h.burnt && rnd() < 0.4) {                                                          // a bamboo fence along one side of the front yard
          const sd = rnd() < 0.5 ? -1 : 1, L = 3.6; const [x0, z0] = P(hd - 0.2, sd * (hw + 0.4)); let ok = true;
          for (let u = 0; u <= L; u += 0.9) if (!clearAt(x0 + fx * u, z0 + fz * u)) ok = false;
          if (ok) { for (let u = 0; u <= L + 0.01; u += 0.9) at(posts, x0 + fx * u, GY, z0 + fz * u, 0, 1, 0.9 + rnd() * 0.25, 1);
            for (const y of [0.35, 0.75]) at(rails, x0, GY + y, z0, h.th, 1, 1, L); solidLine(x0, z0, x0 + fx * L, z0 + fz * L, 0.12, 0.9); }
        }
        if (rnd() < 0.55) { const [x, z] = P(-hd - 2.2 - rnd() * 1.5, (rnd() - 0.5) * 3); if (clearAt(x, z) && !nearPath(x, z, 3.5)) villageTrees.push({ x, z, k: 2, s: 0.75 + rnd() * 0.35 }); }
      }
      const add = (geo: THREE.BufferGeometry, mat: THREE.Material, list: THREE.Matrix4[]) => { if (!list.length) return; const im = new THREE.InstancedMesh(geo, mat, list.length); list.forEach((m, k) => im.setMatrixAt(k, m)); im.castShadow = im.receiveShadow = true; im.computeBoundingSphere(); scene.add(im); };
      add(jarGeo, new THREE.MeshStandardMaterial({ color: 0x8e5638, roughness: 0.85 }), jars); add(logGeo, timber, logs); add(postGeo, bamboo, posts); add(railGeo, bamboo, rails);
      if (flatFree(13, 11, 1.5) && !nearPath(13, 11, 4)) villageTrees.push({ x: 13, z: 11, k: 3, s: 1.35 });   // the old temple tree above the plaza
    }
    { // vegetable plots on the village's edge: tilled rows and herbs, gone half wild
      const soil = new THREE.MeshStandardMaterial({ map: tex(128, (g, s) => { g.fillStyle = '#4a3a26'; g.fillRect(0, 0, s, s); for (let y = 0; y < s; y += 16) { g.fillStyle = '#5e4a30'; g.fillRect(0, y, s, 8); g.fillStyle = '#3a2c1c'; g.fillRect(0, y + 10, s, 3); } }), roughness: 1 });
      let n = 0;
      for (let k = 0; k < 600 && n < 4; k++) {
        const a = rnd() * 6.28, r = 22 + rnd() * (V.r - 26), x = V.x + Math.cos(a) * r, z = V.z + Math.sin(a) * r, ry = rnd() * 3.14, W = 8, D = 5.5;
        const c = Math.cos(ry), s2 = Math.sin(ry); let ok = !nearRiver(x, z, 9) && !nearCamp(x, z, 14);
        for (const [u, v] of [[0, 0], [W / 2, D / 2], [-W / 2, D / 2], [W / 2, -D / 2], [-W / 2, -D / 2], [W / 2, 0], [-W / 2, 0]]) { const px = x + u * c + v * s2, pz = z - u * s2 + v * c; if (nearPath(px, pz, 2.5) || !flatFree(px, pz, 0.5) || homes.some((h) => Math.hypot(px - h.x, pz - h.z) < h.s * 0.75 + 1)) ok = false; }
        if (!ok) continue; n++;
        const pl = new THREE.Mesh(new THREE.PlaneGeometry(W, D).rotateX(-Math.PI / 2), soil); pl.position.set(x, GY + 0.025, z); pl.rotation.y = ry; pl.receiveShadow = true; pl.renderOrder = 2; scene.add(pl);
        for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) { if (rnd() < 0.18) continue; const u = -W / 2 + 0.8 + i * (W - 1.6) / 5, v = -D / 2 + 0.8 + j * (D - 1.6) / 3, hs = 0.3 + rnd() * 0.18;
          swaps.push({ f: 'p_herb_a', hide: [], at: new THREE.Vector3(x + u * c + v * s2, GY, z - u * s2 + v * c), ry: rnd() * 6.28, s: [hs, hs, hs] }); }
        CLEAR.push({ x, z, r: 5 });
      }
    }
    { // the washing place: a plank jetty at the end of the river lane
      const jx = 31, jz = 4; for (let u = 0; u < 6; u += 0.5) put(new THREE.Mesh(box2(0.45, 0.08, 1.8), timber), jx + u, GY + 0.16, jz, 0, (rnd() - 0.5) * 0.06, 0);
      for (const [u, v] of [[1, -0.95], [1, 0.95], [3.5, -0.95], [3.5, 0.95], [5.5, -0.95], [5.5, 0.95]]) put(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 1.2, 5), timber), jx + u, GY - 0.3, jz + v);
    }
    { const ax = CH1.mahnin.x, az = CH1.mahnin.z + 2.2;                                           // Ma Hnin's altar: a stone table, offering bowls, a lotus
      const objs = grab(() => { put(new THREE.Mesh(box2(1.6, 0.85, 0.9), sandstone), ax, GY + 0.42, az); for (const dx of [-0.5, 0.5]) put(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.1, 0.1, 10), gilt), ax + dx, GY + 0.9, az); });
      solid(ax, az, 0.8, 0.85); swaps.push({ f: 'p_altar', hide: objs, at: new THREE.Vector3(ax, GY, az), ry: Math.atan2(V.x - ax, V.z - az), s: [1.0, 1.0, 1.0] });
      sparkle(ax, GY + 1.25, az, 1.4, 0xffd8a0); }
    { const sx = V.x - 8, sz = V.z + 8;                                                          // the village shrine: a small stupa
      const prof = [[0, 0], [1.6, 0], [1.6, 0.4], [1.3, 0.5], [1.35, 1.2], [1.0, 1.9], [0.6, 2.3], [0.35, 2.5], [0.2, 3.4], [0, 3.6]].map(([a, b]) => new THREE.Vector2(a, b));
      const objs = grab(() => { put(new THREE.Mesh(new THREE.LatheGeometry(prof, 16), sandstone), sx, GY, sz); put(new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.4, 8), gilt), sx, GY + 3.75, sz); });
      solid(sx, sz, 1.7); swaps.push({ f: 'p_stupa', hide: objs, at: new THREE.Vector3(sx, GY - 0.05, sz), ry: Math.atan2(V.x - sx, V.z - sz), s: [4.8, 4.8, 4.8] });
      // the statue in front of it: a robed healer with a bowl; the face has been scraped flat (lore: whoever they were, they were erased)
      const tx2 = sx + 2.6, tz2 = sz - 1.2; solid(tx2, tz2, 0.7, 2.6);
      const sObjs = grab(() => { put(new THREE.Mesh(box2(1.2, 0.5, 1.0), sandstone), tx2, GY + 0.25, tz2);
        put(new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.5, 1.5, 10), sandstone), tx2, GY + 1.25, tz2); put(new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), sandstone), tx2, GY + 2.2, tz2).scale.set(1, 1.1, 0.7);
        put(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.12, 0.12, 10), sandstone), tx2, GY + 1.55, tz2 - 0.35); put(new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.6, 10), sandstone), tx2, GY + 2.45, tz2); });   // hooded
      swaps.push({ f: 'p_healer_statue', hide: sObjs, at: new THREE.Vector3(tx2, GY - 0.03, tz2), ry: Math.atan2(V.x - tx2, V.z - tz2), s: [3.0, 3.0, 3.0] }); }   // hooded, staff and gourd, face chiselled away: he faces the plaza
    { const wx2 = V.x - 9, wz2 = V.z - 6;                                                        // the well (the family chest hidden under its stones)
      const objs = grab(() => { put(new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.95, 0.75, 14, 1, true), sandstone), wx2, GY + 0.37, wz2);
        const wt = new THREE.Mesh(new THREE.CircleGeometry(0.75, 14).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x10181a, roughness: 0.2 })); wt.position.set(wx2, GY + 0.2, wz2); scene.add(wt); });
      solid(wx2, wz2, 0.95, 0.75); swaps.push({ f: 'p_well', hide: objs, at: new THREE.Vector3(wx2, GY - 0.05, wz2), ry: 0.6, s: [2.2, 2.2, 2.2] });
      lootAt(wx2 - 1.6, wz2 + 1.2, null, 40, 'A family chest, hidden under the well stones'); }
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + 0.78, x = V.x + Math.cos(a) * 7.6, z = V.z + Math.sin(a) * 7.6;   // stone lanterns round the plaza, long cold
      if (nearPath(x, z, 1.2)) continue; put(new THREE.Mesh(box2(0.45, 1.3, 0.45), sandstone), x, GY + 0.65, z); put(new THREE.Mesh(box2(0.8, 0.12, 0.8), sandstone), x, GY + 1.36, z); solid(x, z, 0.35, 1.45); }
    { const cart = new THREE.Group(); const bed = new THREE.Mesh(box2(2.2, 0.5, 1.3), timber); bed.position.y = 0.75; cart.add(bed); for (const s2 of [-1, 1]) { const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.12, 12).rotateX(Math.PI / 2), charred); wh.position.set(0.2, 0.5, s2 * 0.72); cart.add(wh); }
      const cx = V.x + 17, cz = V.z - 4;                                                      // left by the lane to the washing place
      cart.position.set(cx, GY, cz); cart.rotation.set(0, 2.2, 0.25); cart.traverse((o) => { o.castShadow = true; }); scene.add(cart); solidRect(cx, cz, 2.2, 1.3, 1.0, 2.2);
      swaps.push({ f: 'p_cart', hide: [cart], at: new THREE.Vector3(cx, GY - 0.03, cz), ry: 2.2 + Math.PI / 2, tilt: 0.05, s: [1.3, 1.3, 1.3] }); }
    fragmentAt(V.x + 5, V.z - 15, null, '"Do the stars come closer if we climb higher?"');
    // the grown valley's places (src/ch1places.ts) are built at the end of the build, with these helpers
    placeKit = { scene, put, solid, solidRect, ground: terrainH, sparkle, anims: swAnims, tex, nearPath, walkable: walkableCh1, homes, mats: { timber, bamboo, thatch, charred, sandstone, gilt },
      lootAt, fragmentAt, captives, camps: CH1.camps, regions: CH1.regions, clear: clearArea, trail: addTrail, track, untrack, steles: STELES,
      trenches: TRENCHES, bridges: BRIDGES, addBridge, polyAt,
      lanes: VILLAGE_LANES, floor: heightCh1,
      wet: (x: number, z: number, d: number) => nearRiver(x, z, d + 3) || streamWithin(x, z, d + 1.5) || POOLS.some((p) => Math.hypot(x - p.x, z - p.z) < p.r + d) };
    // out in the marsh, the low fields' last huts: burnt, half in the water
    for (const [x0, z0, ry] of [[44, -93, 2.0], [58, -98, 2.8]] as Array<[number, number, number]>) { const [x, z] = growCh1(x0, z0); hut(x, z, ry, true); }

    // ---- the temple hill: the Grand Stair (steps and parapets over the ramp), boulders along the cliff foot, the back path up the north cliff
    {
      const W = STAIR.z1 - STAIR.z0, cz = (STAIR.z0 + STAIR.z1) / 2, steps: THREE.BufferGeometry[] = [], steps2: THREE.BufferGeometry[] = [], walls: THREE.BufferGeometry[] = []; let si = 0;
      for (let x = STAIR.xBot; x < STAIR.xTop + 1.5; x += 1.2) {                                  // deep stone treads, each a step up (the ramp under them is what he walks)
        const top = terrainH(x + 0.6, cz), h = top - GY + 0.25; if (h < 0.05) continue;
        (si++ % 2 ? steps2 : steps).push(new THREE.BoxGeometry(1.24, h, W - 1.0).translate(x + 0.6, GY - 0.2 + h / 2 + 0.03, cz));
        for (const sz of [STAIR.z0 + 0.25, STAIR.z1 - 0.25]) walls.push(new THREE.BoxGeometry(1.24, h + 0.55, 0.5).translate(x + 0.6, GY - 0.2 + (h + 0.55) / 2, sz));
      }
      const pale = new THREE.MeshStandardMaterial({ map: blockTex(), color: 0xcfcab8, roughness: 0.95 }), shade = new THREE.MeshStandardMaterial({ map: blockTex(), color: 0xb4ae9c, roughness: 0.95 });
      const sm2 = new THREE.Mesh(mergeGeometries(steps2), shade); sm2.receiveShadow = true; scene.add(sm2);
      const sm = new THREE.Mesh(mergeGeometries(steps), pale), wm = new THREE.Mesh(mergeGeometries(walls), new THREE.MeshStandardMaterial({ map: blockTex(), color: 0x8e8670, roughness: 1 }));
      sm.receiveShadow = wm.receiveShadow = true; wm.castShadow = true; scene.add(sm, wm);
      // the Tripo stair: its treads climb 0.70 of its height over 2.0 of its 2.41 length (then a landing): 30 m and 8 m here, so it sinks ~1.1 m at the foot (its step noses then sit on the ramp he walks)
      swaps.push({ f: 'p_stair', hide: [sm, sm2, wm], at: new THREE.Vector3(STAIR.xBot + 18, GY - 1.15, cz), ry: -Math.PI / 2, s: [W / 1.27, TY / 0.70, 15] });
      for (const sz of [STAIR.z0 + 0.35, STAIR.z1 - 0.35]) solidLine(STAIR.xBot - 0.4, sz, STAIR.xTop + 1.5, sz, 0.35);   // the side rails are walls: no stepping or jumping off the stair's sides (on and off at the foot and the top only)
      for (const sz of [STAIR.z0 - 2.6, STAIR.z1 + 2.6]) {                                          // two great guardian lions (chinthe) flanking the foot, worn smooth
        const lx = STAIR.xBot - 2.8; const objs = grab(() => { put(new THREE.Mesh(box2(4.2, 2.7, 3.0), sandstone), lx, GY + 1.35, sz); put(new THREE.Mesh(new THREE.SphereGeometry(1.65, 10, 8).scale(1, 1.1, 0.9), sandstone), lx - 0.3, GY + 4.2, sz); }); solid(lx, sz, 2.1, 99);
        swaps.push({ f: 'p_lion', hide: objs, at: new THREE.Vector3(lx, GY, sz), ry: -Math.PI / 2, s: [7.8, 7.8, 7.8] });   // facing the approach (east)
      }
      { // Tripo cliff-wall sections along the hill's rim, overlapping (the stacked boulders stay behind them)
        const rim: Array<[number, number]> = [];
        for (let a = 0; a < Math.PI * 2; a += 0.004) { const ux = Math.cos(a), uz = Math.sin(a); let d = 20; while (d < 120 && plateauOut(PLATEAU.x + ux * d, PLATEAU.z + uz * d) < 1.4) d += 0.2; rim.push([PLATEAU.x + ux * d, PLATEAU.z + uz * d]); }
        let acc = 0; const L = 13, D = 4, H = TY + 0.5;
        for (let k = 1; k < rim.length; k++) {
          acc += Math.hypot(rim[k][0] - rim[k - 1][0], rim[k][1] - rim[k - 1][1]); if (acc < 9) continue; acc = 0;
          const [x, z] = rim[k], [x0, z0] = rim[(k - 25 + rim.length) % rim.length], [x1, z1] = rim[(k + 25) % rim.length];
          let tx = x1 - x0, tz = z1 - z0; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl; let nx = tz, nz = -tx;
          if ((x - PLATEAU.x) * nx + (z - PLATEAU.z) * nz < 0) { nx = -nx; nz = -nz; }
          if (x > B.x1 - 6 || Math.abs(z) > B.z1 - 6) continue;
          if (z > STAIR.z0 - 7 && z < STAIR.z1 + 7 && x < STAIR.xTop + 8) continue;                         // leave the stair's mouth open
          if (z > 25 && x > NIGHT_PATH.x0 - 34 && x < NIGHT_PATH.x0 + 5) continue;                             // and the Night Path's stretch of cliff
          swaps.push({ f: 'p_cliff_wall', hide: [], at: new THREE.Vector3(x - nx * D * 0.5, GY - 0.4, z - nz * D * 0.5), ry: Math.atan2(nx, nz), s: [L / 3.7, H, D / 1.22] });
        }
      }
      const rock = new THREE.MeshStandardMaterial({ color: 0x7a6e58, roughness: 1, flatShading: true }); const rg = new THREE.DodecahedronGeometry(1, 0); const mats: THREE.Matrix4[] = []; const m4 = new THREE.Object3D();
      for (let a = 0; a < Math.PI * 2; a += 0.012) {                                                // boulders along the cliff foot
        let d = 0; const ux = Math.cos(a), uz = Math.sin(a); while (d < 120 && plateauOut(PLATEAU.x + ux * d, PLATEAU.z + uz * d) < 1.6) d += 0.5;
        const x = PLATEAU.x + ux * d + (rnd() - 0.5) * 1.5, z = PLATEAU.z + uz * d + (rnd() - 0.5) * 1.5; if (x > B.x1 - 6 || Math.abs(z) > B.z1 - 6 || (z > STAIR.z0 - 2 && z < STAIR.z1 + 2 && x < STAIR.xTop + 4)) continue;
        if (rnd() < 0.5) continue; const sc = 0.5 + rnd() * 1.1; m4.position.set(x, GY + sc * 0.3, z); m4.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3); m4.scale.set(sc * 1.3, sc, sc * 1.1); m4.updateMatrix(); mats.push(m4.matrix.clone());
      }
      const im = new THREE.InstancedMesh(rg, rock, mats.length); mats.forEach((mm, k) => im.setMatrixAt(k, mm)); im.castShadow = im.receiveShadow = true; im.computeBoundingSphere(); scene.add(im);
      // the Night Path: steps cut along the north cliff, 0.3 m each (walked, not jumped), from the thorns at its foot up to the hilltop.
      // Each tread runs back into the cliff face (no crevice to fall into); a low outer parapet stops anyone jumping on half-way.
      // A landing half-way has a niche with a faded lotus; a red silk thread hangs near the top.
      {
        const solidAbs = (x: number, z: number, w: number, d: number, top: number) => { for (let a2 = -w / 2 + 0.15; a2 <= w / 2 - 0.1; a2 += 0.3) for (let b2 = -d / 2 + 0.15; b2 <= d / 2 - 0.1; b2 += 0.3) solid(x + a2, z + b2, 0.12, top - heightCh1(x + a2, z + b2)); };
        const stoneA = new THREE.MeshStandardMaterial({ map: blockTex(), color: 0xcfcab8, roughness: 0.95 }), stoneB = new THREE.MeshStandardMaterial({ map: blockTex(), color: 0xb4ae9c, roughness: 0.95 }), wallM = new THREE.MeshStandardMaterial({ map: blockTex(), color: 0x8e8670, roughness: 1 });
        const n = Math.ceil(TY / 0.3), S = 0.9, IN = 1.6, OUT = 1.8; let x = NIGHT_PATH.x0;
        for (let k = 1; k <= n; k++) {
          const len = k === 14 ? S * 2.4 : S, top = TY * k / n, cx = x - len / 2, rz = rimNorthZ(cx);
          const z0 = rz - IN, z1 = rz + OUT, cz = (z0 + z1) / 2;
          put(new THREE.Mesh(box2(len + 0.05, top + 0.4, z1 - z0), k % 2 ? stoneA : stoneB), cx, GY + (top + 0.4) / 2 - 0.4, cz, 0, (rnd() - 0.5) * 0.02, 0).castShadow = true;
          solidAbs(cx, (z0 + rz + OUT - 0.4) / 2, len, rz + OUT - 0.4 - z0, GY + top);
          if (k % 7 !== 4) { const ph = k % 5 === 2 ? 0.35 : 0.6; put(new THREE.Mesh(box2(len + 0.06, ph, 0.38), wallM), cx, GY + top + ph / 2, rz + OUT - 0.2, 0, 0, 0); }   // an even parapet, broken here and there (it still stops a jump)
          solidAbs(cx, rz + OUT - 0.2, len, 0.4, GY + top + 0.95);
          NIGHT_PATH.steps.push({ x: cx, z: rz + 0.6, top: GY + top });
          if (k === 14) {                                                                       // the landing's niche: a little carved shelf in the cliff, a faded lotus, a bowl
            put(new THREE.Mesh(box2(0.9, 1.1, 0.45), stoneB), cx, GY + top + 0.55, rz - 0.9);
            put(new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.2, 8), new THREE.MeshStandardMaterial({ color: 0xc89aa0, roughness: 0.8 })), cx, GY + top + 1.2, rz - 0.75);
            put(new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.08, 0.07, 10), new THREE.MeshStandardMaterial({ color: 0x8a7040, roughness: 0.6, metalness: 0.3 })), cx + 0.25, GY + top + 1.14, rz - 0.75);
            sparkle(cx, GY + top + 1.35, rz - 0.6, 0.9, 0xffd8c0);
          }
          if (k === n - 3) {                                                                    // the red silk thread, caught on the parapet's edge
            const th = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.75), new THREE.MeshStandardMaterial({ color: 0xa01828, emissive: 0x400008, roughness: 0.5, side: THREE.DoubleSide }));
            th.position.set(cx, GY + top + 0.55, rz + OUT + 0.02); th.rotation.set(0.15, 0.4, 0.2); scene.add(th);
          }
          x -= len;
        }
        // the top: a last landing reaching back over the cliff's edge onto the hill
        const lx = x - 1.2, lrz = rimNorthZ(lx), lz0 = lrz - 3.2, lz1 = lrz + OUT;
        put(new THREE.Mesh(box2(2.4, TY + 0.4, lz1 - lz0), stoneA), lx, GY + (TY + 0.4) / 2 - 0.4, (lz0 + lz1) / 2).castShadow = true;
        solidAbs(lx, (lz0 + lrz + OUT - 0.4) / 2, 2.4, lrz + OUT - 0.4 - lz0, GY + TY);
        NIGHT_PATH.steps.push({ x: lx, z: lrz - 1.5, top: GY + TY }, { x: lx, z: lrz - 4.5, top: GY + TY });
      }
    }
    // ---- brambles: thorn rings only fire clears
    {
      const thorn = new THREE.MeshStandardMaterial({ color: 0x3a3a1e, roughness: 1, flatShading: true }), berry = new THREE.MeshStandardMaterial({ color: 0x8a1a24, roughness: 0.6 });
      for (const b of BRAMBLES) {
        const g0 = grid.slice(), t0 = topY.slice();
        for (let a = 0; a < Math.PI * 2; a += 0.35) {
          const x = b.x + Math.cos(a) * b.r, z = b.z + Math.sin(a) * b.r; solid(x, z, 0.55);
          const cl = new THREE.Group(); for (let k = 0; k < 7; k++) { const c2 = new THREE.Mesh(new THREE.ConeGeometry(0.07, 1.6 + rnd() * 1.2, 4), thorn); c2.position.set((rnd() - 0.5) * 0.7, 0.8, (rnd() - 0.5) * 0.7); c2.rotation.set((rnd() - 0.5) * 1.1, 0, (rnd() - 0.5) * 1.1); cl.add(c2); }
          const bush = new THREE.Mesh(new THREE.DodecahedronGeometry(0.55, 0), thorn); bush.position.y = 0.4; bush.scale.set(1.2, 0.8, 1.2); cl.add(bush);
          if (rnd() < 0.5) { const bb = new THREE.Mesh(new THREE.SphereGeometry(0.07, 5, 4), berry); bb.position.set(0.3, 0.7, 0.1); cl.add(bb); }
          cl.position.set(x, terrainH(x, z), z); cl.traverse((o) => { o.castShadow = true; }); scene.add(cl); b.objs.push(cl);
        }
        for (let k = 0; k < g0.length; k++) if (g0[k] !== grid[k] || t0[k] !== topY[k]) b.cells.push([k, g0[k], t0[k]]);
      }
    }
    // ---- the Alchemist's Garden: herb beds gone wild, a faded alchemy circle, his old crucible still warm; his herb chest behind brambles
    {
      const G = GARDEN, herbs = [0x5a8a3a, 0x7a9a40, 0x8a5aa0, 0xc0a040, 0x4a7a5a];
      for (let k = 0; k < 60; k++) { const a = rnd() * 6.28, rr = 4 + rnd() * 6, x = G.x + Math.cos(a) * rr, z = G.z + Math.sin(a) * rr;
        const h = put(new THREE.Mesh(new THREE.DodecahedronGeometry(0.3 + rnd() * 0.25, 0), new THREE.MeshStandardMaterial({ color: herbs[k % herbs.length], roughness: 1, flatShading: true })), x, GY + 0.2, z); h.scale.y = 0.7 + rnd() * 0.8;
        const hs = 0.55 + rnd() * 0.5; swaps.push({ f: 'p_herb_a', hide: [h], at: new THREE.Vector3(x, GY - 0.03, z), ry: rnd() * 6.28, s: [hs, hs, hs] }); }
      for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + 0.4; const x = G.x + Math.cos(a) * 9, z = G.z + Math.sin(a) * 9; const wl = put(new THREE.Mesh(box2(4.5, 0.5, 0.5), sandstone), x, GY + 0.25, z, 0, -a + Math.PI / 2, 0);
        swaps.push({ f: 'p_garden_wall', hide: [wl], at: new THREE.Vector3(x, GY - 0.05, z), ry: wl.rotation.y, s: [4.6 / 2.05, 0.95, 0.8 / 1.17] }); }
      const ring = new THREE.Mesh(new THREE.RingGeometry(G.r - 0.25, G.r, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xd8b060, transparent: true, opacity: 0.45, depthWrite: false })); ring.position.set(G.x, GY + 0.03, G.z); scene.add(ring);
      const tri = new THREE.Mesh(new THREE.RingGeometry(G.r * 0.55, G.r * 0.62, 3).rotateX(-Math.PI / 2), ring.material); tri.position.set(G.x, GY + 0.035, G.z); scene.add(tri);
      put(new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.42, 0.7, 12, 1, true), new THREE.MeshStandardMaterial({ color: 0x2a2420, roughness: 0.6, metalness: 0.4, side: THREE.DoubleSide })), G.x, GY + 0.45, G.z); solid(G.x, G.z, 0.6, 0.8);
      const ember = sparkle(G.x, GY + 0.75, G.z, 1.1, 0xff8040); swAnims.push((t) => { (ember as THREE.Sprite).material.opacity = 0.5 + 0.3 * Math.sin(t * 3); });
      lootAt(BRAMBLES[1].x, BRAMBLES[1].z, null, 60, 'His old herb chest, under five centuries of thorns');
    }
    // ---- Soul Shrines and inscriptions
    for (const q of SHRINES) {
      const y = terrainH(q.x, q.z), g = new THREE.Group(); g.position.set(q.x, y, q.z);
      const base = new THREE.Mesh(box2(1.6, 0.4, 1.6), sandstone); base.position.y = 0.2; g.add(base);
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.42, 1.7, 8), sandstone); col.position.y = 1.25; g.add(col);
      const cap = new THREE.Mesh(new THREE.OctahedronGeometry(0.42, 0), new THREE.MeshStandardMaterial({ color: 0x2a5a6a, emissive: 0x7af0ff, emissiveIntensity: 0.25, roughness: 0.3 })); cap.position.y = 2.4; g.add(cap);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0x7af0ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.15 })); glow.position.y = 2.4; glow.scale.setScalar(1.6); g.add(glow);
      g.traverse((o) => { o.castShadow = true; }); scene.add(g); solid(q.x, q.z, 0.8, 2.8); q.obj = g;
      swaps.push({ f: 'p_soul_shrine', hide: [base, col, cap], at: new THREE.Vector3(q.x, y - 0.05, q.z), ry: rnd() * 6.28, s: [3.0, 3.0, 3.0], onLoad: () => { glow.position.y = 2.82; } });   // the model has its own crystal; the glow still shows it awake
      swAnims.push((t) => { cap.rotation.y = t * (q.awake ? 1.2 : 0.2); cap.position.y = 2.4 + (q.awake ? Math.sin(t * 2) * 0.1 : 0); (cap.material as THREE.MeshStandardMaterial).emissiveIntensity = q.awake ? 1.6 : 0.25; glow.material.opacity = q.awake ? 0.75 : 0.15; glow.scale.setScalar(q.awake ? 2.4 : 1.6); });
    }
    for (const q of STELES) {
      const y = terrainH(q.x, q.z), st = put(new THREE.Mesh(box2(0.9, 1.5, 0.28), new THREE.MeshStandardMaterial({ map: blockTex(), color: 0x9a9480, roughness: 1 })), q.x, y + 0.75, q.z, 0, 0.3, (rnd() - 0.5) * 0.08); void st;
      solid(q.x, q.z, 0.5, 1.5); const ins = sparkle(q.x, y + 1.7, q.z, 0.6, 0xfff0c0); swAnims.push((t) => { ins.visible = !q.read; (ins as THREE.Sprite).material.opacity = 0.5 + 0.3 * Math.sin(t * 2 + q.x); });
    }

    // ---- the Snare Fields: spike pits, root snares, and the trap-setters' watchtower (climb the crates)
    const pitMat = new THREE.MeshStandardMaterial({ map: tex(128, (g, sz) => { const R = agedRng(); g.clearRect(0, 0, sz, sz);
      const gr = g.createRadialGradient(sz / 2, sz / 2, 4, sz / 2, sz / 2, sz / 2); gr.addColorStop(0, 'rgba(10,7,4,1)'); gr.addColorStop(0.45, 'rgba(26,18,10,0.95)'); gr.addColorStop(0.8, 'rgba(50,38,22,0.5)'); gr.addColorStop(1, 'rgba(50,38,22,0)'); g.fillStyle = gr; g.fillRect(0, 0, sz, sz);
      for (let k = 0; k < 40; k++) { const a2 = R() * 6.28, r = sz * (0.18 + R() * 0.3); g.fillStyle = `rgba(${90 + R() * 60},${70 + R() * 50},${30 + R() * 20},${0.6 + R() * 0.3})`; g.beginPath(); g.ellipse(sz / 2 + Math.cos(a2) * r, sz / 2 + Math.sin(a2) * r, 4 + R() * 4, 2 + R() * 2, R() * 3, 0, 7); g.fill(); }   // leaves half hiding it
    }), transparent: true, depthWrite: false, roughness: 1 });
    for (const t of TRAPS) {
      if (t.kind === 'spike') {
        const pit = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 2.0).rotateX(-Math.PI / 2), pitMat); pit.position.set(t.x, GY + 0.012, t.z); pit.rotation.y = rnd(); pit.renderOrder = 2; scene.add(pit);
        for (let k = 0; k < 9; k++) put(new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.55, 5), timber), t.x + ((k % 3) - 1) * 0.45 + (rnd() - 0.5) * 0.1, GY + 0.2, t.z + (Math.floor(k / 3) - 1) * 0.45 + (rnd() - 0.5) * 0.1, (rnd() - 0.5) * 0.3, 0, (rnd() - 0.5) * 0.3);
      } else {
        put(new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.025, 4, 18).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x8a6a40, roughness: 1 })), t.x, GY + 0.03, t.z).castShadow = false;
        put(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.5, 5), timber), t.x + 0.55, GY + 0.2, t.z, 0, 0, 0.25);
      }
    }
    { const [TX, TZ] = growCh1(16, -128), PH = 3.6;                                                                 // the watchtower: four posts, a deck, a little roof
      for (const [a0, b0, a1, b1] of [[-1.5, -1.5, 1.5, -1.5], [-1.5, 1.5, 1.5, 1.5], [-1.5, -1.5, -1.5, 1.5], [1.5, -1.5, 1.5, 1.5]]) for (const flip of [0, 1]) {   // cross-braced sides
        const ax = TX + a0, az = TZ + b0, bx = TX + a1, bz = TZ + b1, L = Math.hypot(bx - ax, bz - az, PH - 0.6), br = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, L, 5), timber);
        br.position.set((ax + bx) / 2, GY + 0.3 + (PH - 0.6) / 2, (az + bz) / 2); br.lookAt(flip ? bx : ax, GY + PH, flip ? bz : az); br.rotateX(Math.PI / 2); br.castShadow = true; scene.add(br); }
      for (const sx of [-0.35, 0.35]) put(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, PH + 0.3, 5), timber), TX + sx, GY + (PH + 0.3) / 2, TZ - 1.9, 0, -0.12, 0);   // a ladder up the south side
      for (let y = 0.4; y < PH; y += 0.4) put(new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.05, 0.06), timber), TX, GY + y, TZ - 1.9 + y * 0.12);
      for (const [a, b] of [[-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5]]) { put(new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.17, PH + 1.6, 6), timber), TX + a, GY + (PH + 1.6) / 2, TZ + b); }
      put(new THREE.Mesh(box2(3.6, 0.22, 3.6), timber), TX, GY + PH, TZ); solidRect(TX, TZ, 3.5, 3.5, PH);
      for (const [a, b, w, d] of [[0, 1.75, 3.6, 0.08], [0, -1.75, 3.6, 0.08], [-1.75, 0, 0.08, 3.6]] as Array<[number, number, number, number]>) put(new THREE.Mesh(box2(w, 0.08, d), timber), TX + a, GY + PH + 0.8, TZ + b);
      put(new THREE.Mesh(new THREE.ConeGeometry(2.9, 1.3, 4), thatch), TX, GY + PH + 2.25, TZ, 0, Math.PI / 4, 0);
      for (const [x, z, h] of [[19.0, -127.0, 2.4], [20.4, -125.6, 1.2]] as Array<[number, number, number]>) {     // crates to climb: 1.2 m, 2.4 m, then the deck at 3.6 m
        for (let y = 0; y < h - 0.01; y += 1.2) put(new THREE.Mesh(box2(1.2, 1.2, 1.2), new THREE.MeshStandardMaterial({ map: blockTex(), color: 0x8a6a44, roughness: 0.9 })), x, GY + y + 0.6, z, 0, rnd() * 0.2, 0);
        solidRect(x, z, 1.2, 1.2, h);
      }
      lootAt(TX - 0.6, TZ + 0.6, GY + PH + 0.11, 50, "The trap-setters' takings");
    }
    // the last two fragments: on the Crossroads Knoll, and at the bottom of the Naga's Scar
    { const kn = HILLS.find((h) => h.chest); if (kn) { fragmentAt(kn.x + 2, kn.z + 1.5, null, 'A bracelet of jasmine, pressed into his palm. "For luck."'); LOOT.push({ x: kn.x, z: kn.z, y: null, souls: 40, name: 'A lookout\'s cache', opened: false, glow: (() => { const g = sparkle(kn.x, terrainH(kn.x, kn.z) + 1.0, kn.z, 1.1, 0xffd27a); return g; })() }); } }
    { const t = TRENCHES[1], [x, z] = t.pts[2]; fragmentAt(x, z, null, '"Promise me." The rest is lost in the wind.'); }
    { const [x, z] = growCh1(-125, 77); lootAt(x, z, null, 30, "A garrison soldier's pay chest, dropped in the trench"); }
  }
  // ---- the Hydra's lair: scorched, bone-strewn ground, a nest of giant eggs, ribcages and skulls; the gate and the treasure behind
  const lairAnims: Array<(t: number) => void> = []; let gateOpen = false; const gateParts: { ward?: THREE.Mesh; glow?: THREE.Mesh; chestGlow?: THREE.Sprite } = {};
  {
    const L = CH1.lair;
    const scorch = tex(512, (g2, s) => {
      const n = tileNoise(10), n2 = tileNoise(36); const img = g2.createImageData(s, s); const d = img.data;
      for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
        const dx = x / s - 0.5, dy = y / s - 0.5, r = Math.hypot(dx, dy) * 2, ang = Math.atan2(dy, dx), v = n(x / s * 10, y / s * 10) * 0.6 + n2(x / s * 36, y / s * 36) * 0.4;
        const edge = 0.86 + (n(Math.cos(ang) * 2 + 4, Math.sin(ang) * 2 + 4) - 0.5) * 0.25, a = Math.max(0, Math.min(1, (edge - r) / 0.16));
        const i = (y * s + x) * 4; d[i] = 46 + v * 40; d[i + 1] = 34 + v * 26; d[i + 2] = 28 + v * 18; d[i + 3] = a * 255;
      }
      g2.putImageData(img, 0, 0); g2.strokeStyle = 'rgba(255,110,40,0.14)'; g2.lineWidth = 1;
      for (let k = 0; k < 18; k++) { g2.beginPath(); let x = s / 2 + (rnd() - 0.5) * s * 0.7, y = s / 2 + (rnd() - 0.5) * s * 0.7; g2.moveTo(x, y); for (let j = 0; j < 8; j++) { x += (rnd() - 0.5) * 30; y += (rnd() - 0.5) * 30; g2.lineTo(x, y); } g2.stroke(); }
    }); scorch.wrapS = scorch.wrapT = THREE.ClampToEdgeWrapping;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(L.r * 2.3, L.r * 2.3), new THREE.MeshStandardMaterial({ map: scorch, transparent: true, depthWrite: false, roughness: 1 }));
    floor.rotation.x = -Math.PI / 2; floor.position.set(L.x, GY + 0.009, L.z); floor.receiveShadow = true; floor.renderOrder = 2; scene.add(floor);
    const bone = new THREE.MeshStandardMaterial({ color: 0xd8ccb0, roughness: 0.75 }), twig = new THREE.MeshStandardMaterial({ color: 0x4a3a28, roughness: 1, flatShading: true });
    const add2 = (m: THREE.Mesh, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => { m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = true; m.receiveShadow = true; scene.add(m); return m; };
    // the nest: a ring of piled branches with five giant mottled eggs (north side of the lair)
    const NX2 = L.x - 6, NZ2 = L.z + 12;
    const twigs = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.07, 0.1, 2.4, 5), twig, 90);
    for (let k = 0; k < 90; k++) { const a = rnd() * 6.28, rr = 3.2 + rnd() * 1.0; tmp.position.set(NX2 + Math.cos(a) * rr, GY + 0.2 + rnd() * 0.6, NZ2 + Math.sin(a) * rr); tmp.rotation.set(Math.PI / 2 + (rnd() - 0.5) * 0.6, a + Math.PI / 2 + (rnd() - 0.5) * 0.8, (rnd() - 0.5) * 0.5); tmp.scale.set(1, 0.8 + rnd() * 0.6, 1); tmp.updateMatrix(); twigs.setMatrixAt(k, tmp.matrix); }
    twigs.castShadow = true; scene.add(twigs); solidLine(NX2 - 4, NZ2, NX2 + 4, NZ2, 3.2);
    const eggTex = tex(128, (g2, s) => { g2.fillStyle = '#8a8f6a'; g2.fillRect(0, 0, s, s); for (let k = 0; k < 120; k++) { g2.fillStyle = `rgba(${40 + rnd() * 40},${50 + rnd() * 30},30,${0.3 + rnd() * 0.4})`; g2.beginPath(); g2.ellipse(rnd() * s, rnd() * s, 2 + rnd() * 6, 2 + rnd() * 4, rnd() * 3, 0, 7); g2.fill(); } });
    const eggMat = new THREE.MeshStandardMaterial({ map: eggTex, roughness: 0.6, emissive: 0x204010, emissiveIntensity: 0.4 });
    for (let k = 0; k < 5; k++) { const a = k / 5 * 6.28, e = add2(new THREE.Mesh(new THREE.SphereGeometry(0.75, 14, 10).scale(1, 1.35, 1), eggMat), NX2 + Math.cos(a) * 1.4, GY + 0.9, NZ2 + Math.sin(a) * 1.4, (rnd() - 0.5) * 0.3, 0, (rnd() - 0.5) * 0.3);
      const ph = rnd() * 6; lairAnims.push((t) => { eggMat.emissiveIntensity = 0.35 + 0.25 * Math.sin(t * 1.5); e.rotation.z = Math.sin(t * 3 + ph) * 0.04 * (Math.sin(t * 0.7 + ph) > 0.8 ? 1 : 0); }); }
    // ribcages of old prey, giant skulls, scattered bones
    for (const [rx, rz, ry] of [[L.x - 10, L.z - 13, 0.4], [L.x + 3, L.z - 17, 2.0], [L.x + 9, L.z + 16, 4.1]] as Array<[number, number, number]>) {
      for (let k = 0; k < 6; k++) add2(new THREE.Mesh(new THREE.TorusGeometry(1.4 - Math.abs(k - 2.5) * 0.15, 0.09, 6, 16, Math.PI * 1.1), bone), rx + Math.cos(ry) * (k - 2.5) * 0.55, GY + 0.1, rz - Math.sin(ry) * (k - 2.5) * 0.55, 0, ry + Math.PI / 2, 0);
      add2(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 3.6, 6), bone), rx, GY + 0.1, rz, 0, ry, Math.PI / 2); solidLine(rx - Math.cos(ry) * 1.7, rz + Math.sin(ry) * 1.7, rx + Math.cos(ry) * 1.7, rz - Math.sin(ry) * 1.7, 1.1, 0.8);
    }
    for (const [sx, sz, sr] of [] as Array<[number, number, number]>) {
      add2(new THREE.Mesh(new THREE.SphereGeometry(0.5 * sr, 12, 9).scale(1, 0.85, 1.2), bone), sx, GY + 0.35 * sr, sz, 0, rnd() * 6, 0.2);
      for (const e of [-1, 1]) add2(new THREE.Mesh(new THREE.SphereGeometry(0.12 * sr, 8, 6), new THREE.MeshBasicMaterial({ color: 0x100806 })), sx + e * 0.18 * sr, GY + 0.45 * sr, sz + 0.45 * sr);
      solid(sx, sz, 0.5 * sr, 1.0);
    }
    const bones = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.05, 0.05, 0.9, 5), new THREE.MeshStandardMaterial({ color: 0x9a907c, roughness: 0.9 }), 30);
    for (let k = 0; k < 30; k++) { const a = rnd() * 6.28, rr = 3 + rnd() * (L.r - 5); tmp.position.set(L.x + Math.cos(a) * rr, GY + 0.05, L.z + Math.sin(a) * rr); tmp.rotation.set(Math.PI / 2, rnd() * 6, rnd() * 3); tmp.scale.set(1, 0.6 + rnd() * 0.8, 1); tmp.updateMatrix(); bones.setMatrixAt(k, tmp.matrix); }
    scene.add(bones);
    // the ultimate treasure: a great chest on a hoard of gold, sealed by a red ward until the Hydra falls
    const T = CH1.treasure; const gold = new THREE.MeshStandardMaterial({ color: 0xffc23a, roughness: 0.35, metalness: 0.9, emissive: 0x402800, emissiveIntensity: 0.4 });
    const coins = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.11, 0.11, 0.025, 10), gold, 260);
    for (let k = 0; k < 260; k++) { const a = rnd() * 6.28, rr = Math.sqrt(rnd()) * 2.4, h = 0.45 * (1 - rr / 2.6); tmp.position.set(T.x + Math.cos(a) * rr, GY + 0.02 + rnd() * h, T.z + Math.sin(a) * rr); tmp.rotation.set(rnd() * 1.2, rnd() * 6, rnd() * 1.2); tmp.scale.setScalar(1); tmp.updateMatrix(); coins.setMatrixAt(k, tmp.matrix); }
    scene.add(coins); campChests.push({ x: T.x, z: T.z, ry: Math.PI / 2, big: true } as { x: number; z: number; ry: number });
    solid(T.x, T.z, 1.4);
    const cg = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexL(), color: 0xff3020, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    cg.position.set(T.x, GY + 1.2, T.z); cg.scale.setScalar(5); scene.add(cg); gateParts.chestGlow = cg;
    // the gate to Chapter 2: a giant archway at the map's edge (the archway model goes in with the others), a ward in its opening
    const G = CH1.gate;
    const ward = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 7), new THREE.MeshBasicMaterial({ map: wardTex(), color: 0xff3020, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false }));
    ward.position.set(G.x + 0.3, GY + 3.4, G.z); ward.rotation.y = Math.PI / 2; scene.add(ward); gateParts.ward = ward;
    solidLine(G.x + 0.5, G.z - 3, G.x + 0.5, G.z + 3, 0.6);
    lairAnims.push((t) => {
      const m = ward.material as THREE.MeshBasicMaterial; m.opacity = (gateOpen ? 0.85 : 0.6) + 0.15 * Math.sin(t * 3); m.map!.offset.y = -t * 0.15;
      (cg.material as THREE.SpriteMaterial).opacity = 0.55 + 0.25 * Math.sin(t * 2.2); cg.scale.setScalar(5 + Math.sin(t * 2.2) * 0.4);
    });
  }
  // the garrison's carved orders: a weathered stone slab by the trail into the garrison
  {
    const O = CH1.orders; const t2 = tex(256, (g2, s) => {
      g2.fillStyle = '#6e6a5e'; g2.fillRect(0, 0, s, s); for (let k = 0; k < 900; k++) { g2.fillStyle = `rgba(${rnd() < 0.5 ? 30 : 160},${rnd() < 0.5 ? 30 : 150},${rnd() < 0.5 ? 25 : 130},0.12)`; g2.fillRect(rnd() * s, rnd() * s, 2 + rnd() * 4, 2 + rnd() * 3); }
      g2.fillStyle = 'rgba(25,20,15,0.85)'; g2.textAlign = 'center'; g2.font = 'bold 26px Georgia, serif';
      g2.fillText('NONE LEAVES', s / 2, s * 0.36); g2.fillText('THE VALLEY', s / 2, s * 0.5); g2.font = 'italic 20px Georgia, serif'; g2.fillText('by order of the Nine', s / 2, s * 0.68);
    }); t2.wrapS = t2.wrapT = THREE.ClampToEdgeWrapping;
    const slab = new THREE.Mesh(new THREE.BoxGeometry(1.7, 2.2, 0.35), (() => { const carved = new THREE.MeshStandardMaterial({ map: t2, roughness: 1 }); return [stoneMat, stoneMat, stoneMat, stoneMat, carved, carved]; })());
    slab.position.set(O.x, GY + 1.05, O.z); slab.rotation.set(0, Math.atan2(-50 - O.x, 104 - O.z) * 0 + Math.PI * 0.08, 0.05); slab.castShadow = slab.receiveShadow = true; scene.add(slab); solid(O.x, O.z, 0.9);
  }
  // the barrier round the Naga's lair: a wall of red light (walls the lair off until the four shards are set)
  const barrierTex = tex(128, (g2, s) => { g2.clearRect(0, 0, s, s); for (let k = 0; k < 26; k++) { const x = rnd() * s, w = 2 + rnd() * 6; const gr = g2.createLinearGradient(0, 0, 0, s); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.7, `rgba(255,255,255,${0.3 + rnd() * 0.5})`); gr.addColorStop(1, 'rgba(255,255,255,0.9)'); g2.fillStyle = gr; g2.fillRect(x, 0, w, s); } });
  barrierTex.wrapS = THREE.RepeatWrapping; barrierTex.repeat.set(10, 1);
  const barrier = new THREE.Mesh(new THREE.CylinderGeometry(CH1.barrierR, CH1.barrierR, 9, 96, 1, true), new THREE.MeshBasicMaterial({ map: barrierTex, color: 0xff2a3a, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false }));
  barrier.position.set(CH1.lair.x, GY + 4.4, CH1.lair.z); barrier.visible = false; barrier.renderOrder = 7; scene.add(barrier);
  lairAnims.push((t) => { barrierTex.offset.x = t * 0.03; (barrier.material as THREE.MeshBasicMaterial).opacity = 0.42 + 0.12 * Math.sin(t * 2.4); });
  function glowTexL(): THREE.Texture { return tex(64, (g2, s) => { const gr = g2.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2); gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g2.fillStyle = gr; g2.fillRect(0, 0, s, s); }); }
  function wardTex(): THREE.Texture { const t2 = tex(128, (g2, s) => { g2.fillStyle = '#000'; g2.fillRect(0, 0, s, s); for (let k = 0; k < 40; k++) { g2.strokeStyle = `rgba(255,255,255,${0.2 + rnd() * 0.5})`; g2.lineWidth = 1 + rnd() * 2; g2.beginPath(); const x = rnd() * s; g2.moveTo(x, 0); g2.bezierCurveTo(x + (rnd() - 0.5) * 40, s * 0.3, x + (rnd() - 0.5) * 40, s * 0.7, x + (rnd() - 0.5) * 20, s); g2.stroke(); }
    const gr = g2.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s * 0.7); gr.addColorStop(0, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g2.fillStyle = gr; g2.fillRect(0, 0, s, s); }); t2.wrapS = t2.wrapT = THREE.RepeatWrapping; return t2; }

  // ferns and undergrowth along the outside of the walls and at tree feet
  // fern: six fronds (alpha-cut cards with a stem and leaflets) arching out from the centre
  const frondTex = tex(128, (g2, s) => {
    g2.clearRect(0, 0, s, s); g2.strokeStyle = '#d8e8c8'; g2.lineWidth = 2; g2.beginPath(); g2.moveTo(s / 2, s); g2.lineTo(s / 2, 4); g2.stroke();
    g2.fillStyle = '#ffffff';
    for (let y = 8; y < s - 6; y += 7) { const w = (s / 2 - 6) * Math.sin(Math.PI * (1 - y / s)) * 0.95; for (const d of [-1, 1]) { g2.beginPath(); g2.ellipse(s / 2 + d * w / 2, y, w / 2, 3, d * 0.35, 0, 7); g2.fill(); } }
  }); frondTex.wrapS = frondTex.wrapT = THREE.ClampToEdgeWrapping;
  const fernGeo = mergeGeometries([0, 1, 2, 3, 4, 5].map((k) => {
    const q = new THREE.PlaneGeometry(0.42, 1.1, 1, 3); const pa = q.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pa.count; i++) { const v = pa.getY(i) + 0.55; pa.setXYZ(i, pa.getX(i), v * 0.55 - v * v * 0.28, v * 0.8); }   // arch: up, then over
    q.computeVertexNormals(); const nn = q.getAttribute('normal') as THREE.BufferAttribute; for (let i = 0; i < nn.count; i++) nn.setXYZ(i, 0, 1, 0);
    return q.rotateY(k * Math.PI / 3 + (k % 2) * 0.3);
  }));
  const fernMat = new THREE.MeshStandardMaterial({ map: frondTex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 1 });
  const fernB = new Map<string, Array<{ m: THREE.Matrix4; c: number }>>(); let nf = 0;
  for (let k = 0; k < 60000 && nf < 3400; k++) {
    const nearT = nf < 520;                                                                  // first the band at the temple's feet, then the open jungle
    const x = nearT ? B0.x0 + rnd() * (B0.x1 - B0.x0) : B.x0 + rnd() * (B.x1 - B.x0), z = nearT ? B0.z0 + rnd() * (B0.z1 - B0.z0) : B.z0 + rnd() * (B.z1 - B.z0);
    if (nearT && !nearTemple(x, z, rnd() < 0.6 ? 2.8 : 8)) continue;
    if (nearTemple(x, z, 0.9) || nearRiver(x, z, 4.4) || nearPath(x, z, 1.6) || inWaste(x, z, 1) || nearCamp(x, z, 7.5)) continue;
    if (terrainBusy(x, z, 0.3)) continue;
    const s = 0.6 + rnd() * 0.9; tmp.position.set(x, terrainH(x, z), z); tmp.rotation.set(0, rnd() * 6.28, 0); tmp.scale.set(s, s * (0.6 + rnd() * 0.6), s); tmp.updateMatrix();
    const key = `${Math.floor(x / 28)},${Math.floor(z / 28)}`; (fernB.get(key) ?? fernB.set(key, []).get(key)!).push({ m: tmp.matrix.clone(), c: greens[Math.floor(rnd() * greens.length)] }); nf++;
  }
  for (const list of fernB.values()) {
    const fm = new THREE.InstancedMesh(fernGeo, fernMat, list.length); list.forEach((f, i) => { fm.setMatrixAt(i, f.m); fm.setColorAt(i, c.setHex(f.c)); });
    fm.computeBoundingSphere(); scene.add(fm);
  }

  // ---- ground fog: soft grey-green banks drifting slowly through the ruins and the jungle
  const fogTex = tex(128, (g, s) => { const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2); gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.55, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, s, s); });
  const fogs: Array<{ s: THREE.Sprite; vx: number; vz: number; base: number }> = [];
  for (let k = 0; k < 46; k++) {
    const temple = rnd() < 0.55; const f = FLOORS[Math.floor(rnd() * FLOORS.length)]; const w = rectWorld(f.r);
    const x = temple ? w.x0 + rnd() * (w.x1 - w.x0) : B0.x0 + rnd() * (B0.x1 - B0.x0), z = temple ? w.z0 + rnd() * (w.z1 - w.z0) : B0.z0 + rnd() * (B0.z1 - B0.z0);
    const m = new THREE.SpriteMaterial({ map: fogTex, color: rnd() < 0.35 ? 0xb8b4c8 : 0x9a96b0, transparent: true, depthWrite: false, opacity: 0.06 + rnd() * 0.08, fog: true });
    const sp = new THREE.Sprite(m); const base = heightCh1(x, z); sp.position.set(x, base + 0.5 + rnd() * 0.8, z); const sz = 6 + rnd() * 9; sp.scale.set(sz, sz * 0.45, 1); sp.renderOrder = 5; scene.add(sp);
    fogs.push({ s: sp, vx: (rnd() - 0.5) * 0.35, vz: (rnd() - 0.5) * 0.25, base: m.opacity });
  }
  const edgeFog: Array<{ s: THREE.Sprite; x: number; z: number; ph: number; base: number }> = [];
  {
    const edgeMats = [0, 1, 2, 3].map((k) => new THREE.SpriteMaterial({ map: fogTex, color: k % 2 ? 0x6f6a84 : 0x8a87a0, transparent: true, depthWrite: false, opacity: 0.55, fog: false }));
    const ring = (inset: number, step: number, size: number, op: number) => {
      const pts: Array<[number, number]> = [];
      for (let x = B.x0 + inset; x <= B.x1 - inset; x += step) pts.push([x, B.z0 + inset], [x, B.z1 - inset]);
      for (let z = B.z0 + inset + step; z <= B.z1 - inset - step; z += step) pts.push([B.x0 + inset, z], [B.x1 - inset, z]);
      for (const [x0, z0] of pts) {
        const x = x0 + (rnd() - 0.5) * step * 0.6, z = z0 + (rnd() - 0.5) * step * 0.6; if (Math.hypot(x - CH1.gate.x, z - CH1.gate.z) < 18) continue;   // the gate stands clear of the fog
        const m = edgeMats[Math.floor(rnd() * 4)].clone(); m.opacity = op * (0.8 + rnd() * 0.4);
        const sp = new THREE.Sprite(m); const sz = size * (0.8 + rnd() * 0.5); sp.position.set(x, 1.5 + rnd() * 2.5, z); sp.scale.set(sz, sz * 0.6, 1); sp.renderOrder = 6; scene.add(sp);
        edgeFog.push({ s: sp, x, z, ph: rnd() * 6.28, base: m.opacity });
      }
    };
    ring(EDGE + 3, 9, 20, 0.35); ring(EDGE * 0.55, 8, 24, 0.6); ring(1, 8, 26, 0.85);         // thin at the walkable edge, solid beyond it
    for (let k = 0; k < 10; k++) {
      const a = rnd() * 6.28, r = rnd() * WASTE.r * 0.85, x = WASTE.x + Math.cos(a) * r, z = WASTE.z + Math.sin(a) * r;
      const m = new THREE.SpriteMaterial({ map: fogTex, color: rnd() < 0.5 ? 0x7a3a4a : 0x4c3e46, transparent: true, depthWrite: false, opacity: 0.22, fog: true });
      const sp = new THREE.Sprite(m); const sz = 7 + rnd() * 6; sp.position.set(x, 0.6 + rnd() * 0.8, z); sp.scale.set(sz, sz * 0.45, 1); sp.renderOrder = 5; scene.add(sp);
      edgeFog.push({ s: sp, x, z, ph: rnd() * 6.28, base: 0.22 });
    }
  }

  // ---- sparks rising from every brazier
  const SPK = 6 * Math.max(1, fireSpots.length); const spkGeo = new THREE.BufferGeometry(); const sp3 = new Float32Array(SPK * 3); const spAge = new Float32Array(SPK);
  const fires = fireSpots.map((f) => f.clone().setY(f.y + heightNear(f.x, f.z)));
  for (let k = 0; k < SPK; k++) { spAge[k] = rnd() * 1.5; const f = fires[k % fires.length]; sp3[k * 3] = f.x; sp3[k * 3 + 1] = f.y + spAge[k]; sp3[k * 3 + 2] = f.z; }
  spkGeo.setAttribute('position', new THREE.BufferAttribute(sp3, 3));
  scene.add(new THREE.Points(spkGeo, new THREE.PointsMaterial({ color: 0xffa040, size: 0.07, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false })));

  // ---- embers drifting up around the boss court (Dire mood)
  const EMB = 70; const emberGeo = new THREE.BufferGeometry(); const ep = new Float32Array(EMB * 3); const court = rectWorld([450, 640, 1100, 1040]);
  for (let k = 0; k < EMB; k++) { ep[k * 3] = court.x0 + rnd() * (court.x1 - court.x0); ep[k * 3 + 1] = rnd() * 5; ep[k * 3 + 2] = court.z0 + rnd() * (court.z1 - court.z0); }
  emberGeo.setAttribute('position', new THREE.BufferAttribute(ep, 3));
  const embers = new THREE.Points(emberGeo, new THREE.PointsMaterial({ color: 0xff7a2a, size: 0.12, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false })); embers.position.y = TY; scene.add(embers);

  void windUniforms;
  const firstMesh = (root: THREE.Object3D): THREE.Mesh | null => { let m: THREE.Mesh | null = null; root.traverse((o) => { if ((o as THREE.Mesh).isMesh && !m) m = o as THREE.Mesh; }); return m; };

  /** Tripo stone archway on every gate: sized to the doorway, its legs become solid wall, the old stand-in gate is removed. */
  const loadArches = async (base: string): Promise<void> => {
    const src = firstMesh((await new GLTFLoader().loadAsync(base + 'assets/archway.glb')).scene); if (!src) return;
    const mat = src.material as THREE.MeshStandardMaterial; mat.roughness = 0.9; mat.metalness = 0;
    { const G = CH1.gate, H = 11; const m = new THREE.Mesh(src.geometry, mat); m.scale.set(H, H, H * 0.9); m.position.set(G.x, GY, G.z); m.rotation.y = Math.PI / 2; m.castShadow = true; m.receiveShadow = true; scene.add(m);
      const leg = 0.842 * H / 2; solid(G.x, G.z - leg + 0.6, 1.2); solid(G.x, G.z + leg - 0.6, 1.2); }   // the great gate to Chapter 2
    for (const { g, span, scale } of gates) {
      const H = 6.48 * Math.min(1.12, scale);                                      // 20% up from 5.4: opening 0.45 H ~ 2.9 m
      for (const c of [...g.children]) g.remove(c);
      const m = new THREE.Mesh(src.geometry, mat); m.scale.set(H, H, H * 0.9); m.castShadow = true; m.receiveShadow = true; g.add(m);
      g.updateMatrixWorld(true); const open = 0.45 * H / 2, outer = 0.842 * H / 2, v = new THREE.Vector3();
      for (let t = open + 0.4; t <= outer; t += 0.3) for (const sgn of [-1, 1]) { g.localToWorld(v.set(sgn * t, 0, 0)); solid(v.x, v.z, 0.35); }
    }
  };

  /** Tripo trees (banyan, ancient gnarled trunk, palm): bigger and fewer than the stand-ins, instanced per 14 m chunk so the
   *  phone only draws chunks on screen (and only the near ones in the shadow pass). Leaves sway with the wind. */
  const loadTrees = async (base: string): Promise<void> => {
    // trunk: collision radius; crown: where the leaves are (model units, height 1): centre x/z, radius, low/high; leaf: clusters added per tree and their size
    const kinds = [
      { f: 'tree_teak', H: 11.0, r: 2.4, w: 0.22, trunk: 0.05, crown: { x: 0, z: 0, r: 0.3, y0: 0.74, y1: 0.97 }, leaf: 5, ls: 0.2, plain: 'teak' as const },
      { f: 'tree_ancient', H: 7.4, r: 2.8, w: 0.22, trunk: 0.14, crown: { x: 0.027, z: -0.063, r: 0.36, y0: 0.48, y1: 0.83 }, leaf: 8, ls: 0.21, plain: undefined },
      { f: 'tree_palm', H: 8.0, r: 1.5, w: 0.30, trunk: 0.055, crown: { x: 0.013, z: -0.007, r: 0.27, y0: 0.66, y1: 0.86 }, leaf: 4, ls: 0.13, plain: undefined },
      { f: 'tree_frangipani', H: 6.2, r: 2.2, w: 0.14, trunk: 0.14, crown: { x: 0, z: 0, r: 0.3, y0: 0.55, y1: 0.95 }, leaf: 4, ls: 0.16, plain: 'frangi' as const },
      { f: 'tree_fir', H: 9.0, r: 2.4, w: 0.12, trunk: 0.06, crown: { x: 0, z: 0, r: 0.2, y0: 0.5, y1: 0.8 }, leaf: 0, ls: 0.1, plain: 'fir' as const }];
    const srcs = await Promise.all(kinds.map((k) => new GLTFLoader().loadAsync(base + 'assets/' + k.f + '.glb').then((g) => firstMesh(g.scene))));
    if (srcs.some((m) => !m)) return;
    const placed: Array<{ x: number; z: number; r: number; k: number }> = []; const CH = 14; const buckets = new Map<string, Array<{ x: number; z: number; k: number; s: number; ry: number }>>();
    const clearN = tileNoise(9); const tHash = new Map<string, Array<{ x: number; z: number; r: number }>>();
    for (let n = 0; n < 200000 && placed.length < 1900; n++) {                              // the grown valley: about the old density over most of it (clearings stay open)
      let pick = rnd(), k = 0; while (k < kinds.length - 1 && pick > kinds[k].w) { pick -= kinds[k].w; k++; }
      const kd = kinds[k]; const x = B.x0 - 8 + rnd() * (B.x1 - B.x0 + 16), z = B.z0 - 8 + rnd() * (B.z1 - B.z0 + 16);
      if (kd.plain === 'fir' && terrainH(x, z) - GY < 0.6 && x < 100) continue; if (kd.plain === 'frangi' && Math.hypot(x - 13, z - 11) > 95 && Math.abs(x - TX) > 70) continue;   // firs on the hills; temple trees round the village and the temple
      const farT = x < B0.x0 || x > B0.x1 || z < B0.z0 || z > B0.z1;
      if (farT && clearN(((x - B.x0) / (B.x1 - B.x0)) * 9, ((z - B.z0) / (B.z1 - B.z0)) * 9) > 0.6) continue;   // open clearings, room for quests later
      if (nearTemple(x, z, kd.r * 0.55 + 1.2) || nearRiver(x, z, 3.6 + kd.r * 0.3) || nearPath(x, z, 2.2 + kd.r * 0.35) || streamAt(x, z).d < 1.2 + kd.r * 0.3) continue;
      if (nearTemple(x, z + 5.5, 5.0) || inWaste(x, z, 3) || nearCamp(x, z, 9 + kd.r * 0.4) || terrainBusy(x, z, 1.5)) continue;                    // camera side of every wall stays clear; no jungle in the wasteland; not on cliffs or in trenches
      const hx = Math.floor(x / 8), hz = Math.floor(z / 8); let crowd = false;
      for (let a = -1; a <= 1 && !crowd; a++) for (let b = -1; b <= 1 && !crowd; b++) for (const p of tHash.get(`${hx + a},${hz + b}`) ?? []) if ((p.x - x) ** 2 + (p.z - z) ** 2 < ((p.r + kd.r) * 0.85) ** 2) { crowd = true; break; }
      if (crowd) continue;
      placed.push({ x, z, r: kd.r, k }); (tHash.get(`${hx},${hz}`) ?? tHash.set(`${hx},${hz}`, []).get(`${hx},${hz}`)!).push({ x, z, r: kd.r }); const key = `${k}:${Math.floor(x / CH)},${Math.floor(z / CH)}`;
      (buckets.get(key) ?? buckets.set(key, []).get(key)!).push({ x, z, k, s: 0.8 + rnd() * 0.45, ry: rnd() * 6.28 });
    }
    for (const t of villageTrees) { const key = `${t.k}:${Math.floor(t.x / CH)},${Math.floor(t.z / CH)}`; placed.push({ x: t.x, z: t.z, r: kinds[t.k].r, k: t.k }); (buckets.get(key) ?? buckets.set(key, []).get(key)!).push({ x: t.x, z: t.z, k: t.k, s: t.s, ry: rnd() * 6.28 }); }
    const wind = (sh: THREE.WebGLProgramParametersWithUniforms, base: number, amp: number) => {
      sh.uniforms.uTime = time;
      sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        vec4 ip = instanceMatrix[3]; float hgt = max(0.0, position.y - ${base.toFixed(2)});
        transformed.x += sin(uTime * 1.2 + ip.x * 0.37 + ip.z * 0.21) * ${(0.035 * amp).toFixed(4)} * hgt;
        transformed.z += cos(uTime * 1.0 + ip.x * 0.23 - ip.z * 0.31) * ${(0.025 * amp).toFixed(4)} * hgt;`);
    };
    const treeMat = (m: THREE.Mesh, leaf: string) => {
      const mat = (m.material as THREE.MeshStandardMaterial).clone(); mat.roughness = 0.92; mat.metalness = 0; mat.side = THREE.DoubleSide;
      mat.customProgramCacheKey = () => 'tree' + leaf;
      mat.onBeforeCompile = (sh) => {
        wind(sh, 0.38, 1); focusCut(sh);
        // theme: leaves (green texels) go deep jungle green, bark goes a darker warm brown
        sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
          vec3 c0 = diffuseColor.rgb; float lum = dot(c0, vec3(0.3, 0.59, 0.11));
          float leaf = smoothstep(0.004, 0.05, c0.g - max(c0.r, c0.b) * 0.95);
          diffuseColor.rgb = mix(${LOOK.tree.barkTint ? `${glsl(LOOK.tree.barkTint)} * (0.5 + 1.7 * lum)` : `c0 * ${glsl(LOOK.tree.bark)}`}, vec3(${leaf}) * (0.55 + 2.3 * lum), leaf);`);
      };
      return mat;
    };
    // the plain Tripo trees (no texture): bark and leaf colours painted per vertex by height and facing, then tinted per tree
    const PAL = { teak: { bark: [0.36, 0.31, 0.25], leaf: [0.32, 0.5, 0.16] }, frangi: { bark: [0.52, 0.46, 0.4], leaf: [0.14, 0.38, 0.14] }, fir: { bark: [0.3, 0.2, 0.13], leaf: [0.07, 0.24, 0.12] } };
    const hash3 = (x: number, y: number, z: number) => { const v = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return v - Math.floor(v); };
    const paint = (geo: THREE.BufferGeometry, kind: 'teak' | 'frangi' | 'fir'): THREE.BufferGeometry => {
      const g = geo.clone(); const p = g.getAttribute('position'), nm = g.getAttribute('normal'); const col = new Float32Array(p.count * 3); const pal = PAL[kind];
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i), ny = nm.getY(i); const ss = (a: number, b: number, v: number) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
        let l = kind === 'teak' ? ss(0.62, 0.72, y) : kind === 'frangi' ? ss(0.4, 0.58, y) * (Math.abs(ny) > 0.55 ? 1 : 0.4) : ss(0.1, 0.16, y);
        const n = 0.86 + 0.28 * hash3(Math.round(x * 14), Math.round(y * 14), Math.round(z * 14));
        const shade = kind === 'fir' ? 0.7 + 0.5 * y + 0.12 * Math.sin(y * 60) : 0.85 + 0.35 * y;
        for (let c = 0; c < 3; c++) col[i * 3 + c] = ((pal.bark[c] * (1 - l) + pal.leaf[c] * l * shade) * n * (l > 0.5 ? 1 : 0.9 + 0.2 * y)) ** 2.2;   // painted in sRGB, stored linear
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3)); return g;
    };
    const plainMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0, side: THREE.DoubleSide });
    plainMat.customProgramCacheKey = () => 'treeplain'; plainMat.onBeforeCompile = (sh) => { wind(sh, 0.38, 1); focusCut(sh); };
    kinds.forEach((kd, i) => { if (kd.plain) srcs[i]!.geometry = paint(srcs[i]!.geometry, kd.plain); });
    const mats = srcs.map((m, i) => kinds[i].plain ? plainMat : treeMat(m!, LOOK.tree.leaf.map((v) => v.toFixed(3)).join(', ')));
    // tint per tree and per region, so the same model reads differently across the map (fresh green by the river, golden in the dry north, frost on the hills)
    const tintC = new THREE.Color();
    const tint = (k: number, x: number, z: number): THREE.Color => {
      const n = 0.5 + 0.5 * Math.sin(x * 0.019 + 1.3) * Math.sin(z * 0.023 + 0.7), r = hash3(x, 3.1, z);
      if (k === 0) return tintC.setRGB(0.85 + n * 0.7 + r * 0.15, 1.0 - n * 0.1, 0.9 - n * 0.55 + r * 0.1);       // teak: fresh green → golden
      if (k === 1) return tintC.setRGB(0.92 + n * 0.22, 0.98 + r * 0.1, 0.9 - n * 0.1);                              // ancient: green, drier in places
      if (k === 2) return tintC.setRGB(0.95 + r * 0.12, 1.0 + n * 0.12, 0.9);                                         // palm
      if (k === 3) return tintC.setRGB(0.95 + r * 0.25, 1.0 + (r - 0.5) * 0.12, 0.95 + (r > 0.7 ? 0.2 : 0));          // frangipani: some bloom paler
      return tintC.setRGB(0.85 + n * 0.1, 1.0 + n * 0.1, 0.9 + n * 0.2);                                           // fir: deep to frosty
    };
    {
      // the wasteland keeps a few gnarled trees with blood-red leaves (#672c32 #511f25)
      const red = treeMat(srcs[1]!, '0.55, 0.05, 0.07'); const kd = kinds[1]; const im = new THREE.InstancedMesh(srcs[1]!.geometry, red, 5); let n = 0;
      for (let k = 0; k < 300 && n < 5; k++) {
        const a = rnd() * 6.28, r = 7 + rnd() * (WASTE.r - 9), x = WASTE.x + Math.cos(a) * r, z = WASTE.z + Math.sin(a) * r;
        if (nearPath(x, z, 3) || !walkableCh1(x, z)) continue;
        const S = kd.H * (0.8 + rnd() * 0.3); solid(x, z, kd.trunk * S);
        tmp.position.set(x, GROUND_Y, z); tmp.rotation.set(0, rnd() * 6.28, 0); tmp.scale.setScalar(S); tmp.updateMatrix(); im.setMatrixAt(n++, tmp.matrix);
      }
      im.count = n; im.computeBoundingSphere(); im.castShadow = true; scene.add(im);
    }
    // extra foliage: clusters of leaf cards (alpha-cut, procedural leaf texture) packed into each crown to thicken the canopy
    const leafTex = tex(256, (g, s) => {
      g.clearRect(0, 0, s, s);
      for (let k = 0; k < 110; k++) {
        const x = s * (0.1 + rnd() * 0.8), y = s * (0.1 + rnd() * 0.8); if ((x - s / 2) ** 2 + (y - s / 2) ** 2 > (s * 0.42) ** 2) continue;
        const v = rnd(); g.save(); g.translate(x, y); g.rotate(rnd() * 6.28);
        g.fillStyle = `rgb(${Math.round(64 + v * 40)},${Math.round(83 + v * 42)},${Math.round(32 + v * 26)})`;
        g.beginPath(); g.ellipse(0, 0, 7 + rnd() * 5, 16 + rnd() * 8, 0, 0, 7); g.fill();
        g.strokeStyle = 'rgba(10,25,8,0.6)'; g.lineWidth = 1; g.beginPath(); g.moveTo(0, -14); g.lineTo(0, 14); g.stroke(); g.restore();
      }
    });
    leafTex.wrapS = leafTex.wrapT = THREE.ClampToEdgeWrapping;
    const cardGeos: THREE.BufferGeometry[] = [];
    for (let k = 0; k < 6; k++) {
      const q = new THREE.PlaneGeometry(1, 1); q.rotateX(-Math.PI / 2 + (rnd() - 0.5) * 1.6); q.rotateY(rnd() * 6.28);
      q.translate((rnd() - 0.5) * 0.45, (rnd() - 0.5) * 0.3, (rnd() - 0.5) * 0.45); cardGeos.push(q);
    }
    const cluster = mergeGeometries(cardGeos); const nrm = cluster.getAttribute('normal') as THREE.BufferAttribute;
    for (let i = 0; i < nrm.count; i++) nrm.setXYZ(i, 0, 1, 0);                                  // lit like a canopy from above, both faces
    const leafMat = new THREE.MeshStandardMaterial({ map: leafTex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.9, color: LOOK.tree.card });
    leafMat.onBeforeCompile = (sh) => { wind(sh, -5, 0.35); focusCut(sh); };                     // whole cluster drifts with its crown
    const leafBuckets = new Map<string, THREE.Matrix4[]>(); const lt = new THREE.Object3D(); const rot = new THREE.Vector3();
    for (const [key, list] of buckets) {
      const k = Number(key.split(':')[0]); const kd = kinds[k];
      const im = new THREE.InstancedMesh(srcs[k]!.geometry, mats[k], list.length);
      list.forEach((t, i) => {
        tmp.position.set(t.x, terrainH(t.x, t.z), t.z); tmp.rotation.set(0, t.ry, 0); tmp.scale.setScalar(kd.H * t.s); tmp.updateMatrix(); im.setMatrixAt(i, tmp.matrix);
        im.setColorAt(i, tint(k, t.x, t.z));
        const S = kd.H * t.s; solid(t.x, t.z, kd.trunk * S);                                     // the trunk blocks like a wall
        const lk = key.split(':')[1]; const arr = leafBuckets.get(lk) ?? leafBuckets.set(lk, []).get(lk)!;
        for (let n = 0; n < kd.leaf; n++) {
          const a = rnd() * 6.28, rr = kd.crown.r * (0.35 + 0.6 * rnd());
          rot.set(kd.crown.x + Math.cos(a) * rr, kd.crown.y0 + rnd() * (kd.crown.y1 - kd.crown.y0), kd.crown.z + Math.sin(a) * rr).applyAxisAngle(THREE.Object3D.DEFAULT_UP, t.ry);
          lt.position.set(t.x + rot.x * S, terrainH(t.x, t.z) + rot.y * S, t.z + rot.z * S); lt.rotation.set(0, rnd() * 6.28, 0);
          lt.scale.setScalar(S * kd.ls * (0.75 + rnd() * 0.5)); lt.updateMatrix(); arr.push(lt.matrix.clone());
        }
      });
      im.computeBoundingSphere(); im.castShadow = true; im.receiveShadow = true; scene.add(im);
    }
    for (const arr of leafBuckets.values()) {
      const lm = new THREE.InstancedMesh(cluster, leafMat, arr.length); arr.forEach((m, i) => lm.setMatrixAt(i, m));
      lm.computeBoundingSphere(); lm.castShadow = true; lm.receiveShadow = true; scene.add(lm);
    }
    for (const o of procTrees) scene.remove(o);
    drawMap();
  };

  /** Minimap: temple stone, walls, water, paths, trees, wasteland; one pixel per 0.5 m cell, north up, east (-x) right. */
  const drawMap = (): void => {
    const c = document.createElement('canvas'); c.width = NX; c.height = NZ; const g2 = c.getContext('2d')!; const img = g2.createImageData(NX, NZ); const d = img.data;
    const COL: Record<number, number[]> = { 1: [184, 180, 154], 2: [62, 124, 147], 3: [120, 116, 96], 4: [58, 86, 38], 5: [22, 36, 14], 6: [45, 108, 131], 7: [150, 108, 64] };
    for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
      const v = grid[j * NX + i]; const x = B.x0 + (i + 0.5) * CELL, z = B.z0 + (j + 0.5) * CELL;
      let col = v === 0 ? (wallTop[j * NX + i] >= 0 ? [140, 134, 112] : [14, 14, 20]) : COL[v];
      if ((v === 4 || v === 5) && inWaste(x, z, -1)) col = v === 5 ? [30, 30, 36] : [74, 80, 92];
      if (v === 4 || v === 5) { const th = terrainH(x, z) - GY; if (th > 0.2) col = v === 5 && topY[j * NX + i] < 50 && Math.abs(topY[j * NX + i] - terrainH(x, z)) < 0.05 ? [96, 84, 62] : [Math.min(255, col[0] + th * 14), Math.min(255, col[1] + th * 12), Math.min(255, col[2] + th * 6)]; else if (th < -0.2) col = v === 5 && topY[j * NX + i] < 50 ? [70, 52, 36] : [34, 26, 18]; }
      if ((v === 4 || v === 5) && streamAt(x, z).d < 0.3) col = streamAt(x, z).dep < 0.6 ? [96, 118, 120] : [45, 108, 131];   // the streams (fords paler)
      const k = ((NZ - 1 - j) * NX + (NX - 1 - i)) * 4; d[k] = col[0]; d[k + 1] = col[1]; d[k + 2] = col[2]; d[k + 3] = 255;
    }
    g2.putImageData(img, 0, 0);
    g2.fillStyle = 'rgb(169,155,103)'; for (const p of pathPts) g2.fillRect(NX - 1 - (p.x - B.x0) / CELL - 1.5, NZ - 1 - (p.z - B.z0) / CELL - 1.5, 3, 3);
    ch1Map.paths = pathPts.map((p) => ({ x: p.x, z: p.z })); (ch1Map as { bridges?: unknown }).bridges = BRIDGES; ch1Map.canvas = c; ch1Map.toPx = (x, z) => [NX - 1 - (x - B.x0) / CELL, NZ - 1 - (z - B.z0) / CELL];
  };
  drawMap();

  /** Fallen logs lying in the jungle and across some paths: low (about 0.6 m), so they can be jumped. */
  /** `log`: the Tripo mossy log (height 1, 3.5 long along x, base at 0), or null for the plain stand-in. */
  const placeLogs = (log: THREE.Mesh | null): void => {
    const logM = (x: number, z: number, ry: number, L: number) => { if (log) { tmp.position.set(x, terrainH(x, z) - 0.03, z); tmp.scale.set(L / (3.5 * 0.62) * 0.62, 0.62, 0.62); } else { tmp.position.set(x, terrainH(x, z) + 0.28, z); tmp.scale.set(L, 1, 1); } tmp.rotation.set(0, ry, 0); tmp.updateMatrix(); return tmp.matrix.clone(); };
    const mats: THREE.Matrix4[] = []; const geo = mergeGeometries([new THREE.CylinderGeometry(0.3, 0.36, 1, 8).rotateZ(Math.PI / 2).toNonIndexed(), new THREE.CylinderGeometry(0.08, 0.12, 0.7, 5).rotateZ(0.9).translate(0.15, 0.35, 0.1).toNonIndexed()]);
    // one fixed log across the path north of the Offering Hall stairs (a known jump; the e2e test uses it)
    { const [lx, lz] = W2(-13.8, 40.5); solidLine(lx - 2.1, lz, lx + 2.1, lz, 0.28, 0.62); mats.push(logM(lx, lz, 0, 4.2)); }
    let n = 0;
    for (let k = 0; k < 3000 && n < 45; k++) {
      const p = null as THREE.Vector3 | null;                                                  // (no logs across trails any more)
      const x = p ? p.x : B.x0 + EDGE + rnd() * (B.x1 - B.x0 - EDGE * 2), z = p ? p.z : B.z0 + EDGE + rnd() * (B.z1 - B.z0 - EDGE * 2);
      if (nearTemple(x, z, 6) || nearRiver(x, z, 5) || inWaste(x, z, 2) || nearCamp(x, z, 10) || nearPath(x, z, 3.5) || nearBridge(x, z, 3) || !walkableCh1(x, z) || terrainBusy(x, z, 3) || Math.hypot(x - CH1.spawn.x, z - CH1.spawn.z) < 10) continue;
      const L = 2.6 + rnd() * 2.2, ry = rnd() * 6.28, ax = Math.cos(ry), az = -Math.sin(ry);         // the log's length runs along its local x
      solidLine(x - ax * L / 2, z - az * L / 2, x + ax * L / 2, z + az * L / 2, 0.28, 0.62);
      mats.push(logM(x, z, ry, L)); n++;
    }
    if (log) { const lm = log.material as THREE.MeshStandardMaterial; lm.roughness = 0.95; lm.metalness = 0; chunked(log.geometry, lm, mats, 40, true); }
    else chunked(geo, new THREE.MeshStandardMaterial({ color: 0x4a3a2a, roughness: 1, flatShading: true }), mats, 40, true);
  };

  /** Tripo bamboo clumps: groves along the river banks and the edges of the trails (never on them), swaying, solid at the stalks. */
  const loadBamboo = async (base: string): Promise<void> => {
    const src = firstMesh((await new GLTFLoader().loadAsync(base + 'assets/bamboo.glb')).scene); if (!src) return;
    const mat = (src.material as THREE.MeshStandardMaterial).clone(); mat.side = THREE.DoubleSide; mat.roughness = 0.9; mat.metalness = 0;
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = time;
      sh.vertexShader = 'uniform float uTime;' + String.fromCharCode(10) + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        vec4 ip = instanceMatrix[3]; float hgt = max(0.0, position.y - 0.25);
        transformed.x += sin(uTime * 1.5 + ip.x * 0.41 + ip.z * 0.27) * 0.05 * hgt; transformed.z += cos(uTime * 1.2 + ip.x * 0.3 - ip.z * 0.2) * 0.035 * hgt;`);
      focusCut(sh);
    };
    const mats: THREE.Matrix4[] = []; let n = 0;
    for (let k = 0; k < 20000 && n < 130; k++) {
      const byRiver = n < 70; let x: number, z: number;
      if (byRiver) { const p = riverPts[Math.floor(rnd() * riverPts.length)]; const a = rnd() * 6.28, d = 6 + rnd() * 5; x = p.x + Math.cos(a) * d; z = p.z + Math.sin(a) * d; }
      else { const p = pathPts[Math.floor(rnd() * pathPts.length)]; const a = rnd() * 6.28, d = 3.6 + rnd() * 2.5; x = p.x + Math.cos(a) * d; z = p.z + Math.sin(a) * d; }
      if (nearRiver(x, z, 5.5) || nearPath(x, z, 3.2) || nearBridge(x, z, 4) || nearTemple(x, z, 6) || nearCamp(x, z, 9) || inWaste(x, z, 2) || !walkableCh1(x, z) || !walkableCh1(x + 1, z) || !walkableCh1(x - 1, z)) continue;
      if (nearTemple(x, z + 5.5, 5.0) || Math.hypot(x - CH1.spawn.x, z - CH1.spawn.z) < 12 || terrainBusy(x, z, 1.5)) continue;           // nothing tall between the camera and a wall
      const H = 5 + rnd() * 2; solid(x, z, 0.75);
      tmp.position.set(x, terrainH(x, z), z); tmp.rotation.set(0, rnd() * 6.28, 0); tmp.scale.setScalar(H); tmp.updateMatrix(); mats.push(tmp.matrix.clone()); n++;
    }
    chunked(src.geometry, mat, mats, 30, true);
  };

  /** Tripo rock pillars: tall weathered stone standing in the jungle and the wasteland (solid, too tall to jump). */
  const loadRocks = async (base: string): Promise<void> => {
    const src = firstMesh((await new GLTFLoader().loadAsync(base + 'assets/rock_pillar.glb')).scene); if (!src) return;
    const mat = src.material as THREE.MeshStandardMaterial; mat.roughness = 0.95; mat.metalness = 0; mat.color.setHex(0xb8b4a8);
    const mats: THREE.Matrix4[] = []; let n = 0;
    for (let k = 0; k < 4000 && n < 30; k++) {
      const w = n < 6, a = rnd() * 6.28, r = 4 + rnd() * (WASTE.r - 4);
      const x = w ? WASTE.x + Math.cos(a) * r : B.x0 + EDGE + rnd() * (B.x1 - B.x0 - EDGE * 2), z = w ? WASTE.z + Math.sin(a) * r : B.z0 + EDGE + rnd() * (B.z1 - B.z0 - EDGE * 2);
      if (!w && (inWaste(x, z, 2) || Math.abs(x) < 45 && Math.abs(z) < 38)) continue;           // not crowding the temple
      if (nearTemple(x, z, 6) || nearPath(x, z, 3.5) || nearRiver(x, z, 6) || nearCamp(x, z, 11) || !walkableCh1(x, z) || terrainBusy(x, z, 3)) continue;
      const H = 3 + rnd() * 2.5, ry = rnd() * 6.28, ax = Math.sin(ry), az = Math.cos(ry), half = (0.758 - 0.367) * H / 2;
      solidLine(x - ax * half, z - az * half, x + ax * half, z + az * half, 0.367 * H * 0.42);
      tmp.position.set(x, terrainH(x, z) - 0.1, z); tmp.rotation.set(0, ry, 0); tmp.scale.setScalar(H); tmp.updateMatrix(); mats.push(tmp.matrix.clone()); n++;
    }
    { const L = CH1.lair; for (let k = 0; k < 11; k++) {                              // a ring of standing stones round the lair, open toward the west
      const a = Math.PI / 2 + 0.75 + k * (2 * Math.PI - 1.5) / 10, x = L.x + Math.sin(a) * (L.r + 1), z = L.z + Math.cos(a) * (L.r + 1);
      if (Math.hypot(x - CH1.gate.x, z - CH1.gate.z) < 7) continue;
      const H = 5 + rnd() * 3, ry = a; solid(x, z, 0.367 * H * 0.5); tmp.position.set(x, GY - 0.1, z); tmp.rotation.set(0, ry, (rnd() - 0.5) * 0.12); tmp.scale.setScalar(H); tmp.updateMatrix(); mats.push(tmp.matrix.clone()); } }
    chunked(src.geometry, mat, mats, 40, true);
  };

  /** Tints for models used many times, so the copies don't read as one model stamped out (multiplied into the texture). */
  const VARY: Record<string, Array<[number, number, number]>> = {
    p_hut: [[1, 0.94, 0.86], [0.8, 0.84, 0.9], [0.62, 0.54, 0.48], [1.18, 1.12, 0.96], [0.84, 0.92, 0.7], [0.7, 0.66, 0.64]],   // as built, rain-greyed, old dark wood, sun-bleached straw, mossy, smoky
    p_cliff_wall: [[1, 1, 1], [0.88, 0.88, 0.9], [1.04, 0.96, 0.88], [0.9, 0.86, 0.78]],
    p_herb_a: [[1, 1, 1], [0.82, 1.0, 0.78], [1.12, 1.06, 0.8], [0.8, 0.9, 0.96]],
    p_mossrock: [[1, 1, 1], [0.86, 0.9, 0.86], [1.1, 1.06, 0.96], [0.72, 0.74, 0.72]],
    p_deadtree: [[1, 1, 1], [0.78, 0.8, 0.86], [1.12, 1.04, 0.92], [0.62, 0.62, 0.66]],                                        // the Unity CourtyardTree: bark, ash-grey, sun-bleached, charred
  };
  /** Models whose texture is too strongly coloured for a tint to show: pulled part-way to grey first (0..1), then tinted. */
  const DESAT: Record<string, number> = { p_hut: 0.5, p_stair: 0.4, p_lion: 0.4 };
  /** A colour for single props (so they sit with the aged temple stone). */
  const TINT: Record<string, [number, number, number]> = { p_stair: [0.8, 0.76, 0.68], p_lion: [0.8, 0.76, 0.68] };
  /** A left-right mirror of a model (winding flipped so its faces still face out); null if it isn't indexed. */
  const mirrored = (g: THREE.BufferGeometry): THREE.BufferGeometry | null => {
    if (!g.index) return null; const m = g.clone(); m.scale(-1, 1, 1); const a = m.index!.array;
    for (let i = 0; i < a.length; i += 3) { const t = a[i + 1]; a[i + 1] = a[i + 2]; a[i + 2] = t; }
    m.index!.needsUpdate = true; return m;
  };
  /** Swap the stand-ins for their Tripo models (see `swaps`): one mesh each, or one instanced draw when a model is used many times. */
  const loadSwaps = async (base: string): Promise<void> => {
    for (let i = swaps.length - 1; i >= 0; i--) { const s = swaps[i]; if (!s.at || !PLACE_CLEAR.some((c) => Math.hypot(s.at.x - c.x, s.at.z - c.z) < c.r) || s.hide.some((o) => o.userData.place)) continue; for (const h of s.hide) h.visible = false; swaps.splice(i, 1); }   // nothing old loads inside a new place's footprint
    const files = [...new Set(swaps.map((s) => s.f))]; const srcs = new Map<string, THREE.Mesh>();
    await Promise.all(files.map(async (f) => {
      try { const m = firstMesh((await new GLTFLoader().loadAsync(base + 'assets/' + f + '.glb')).scene); if (!m) return; const mat = m.material as THREE.MeshStandardMaterial; mat.roughness = 0.9; mat.metalness = 0; mat.color.setRGB(0.82, 0.8, 0.78);
        const ds = DESAT[f]; if (ds) { mat.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', `float lumD = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11)); diffuseColor.rgb = mix(diffuseColor.rgb, vec3(lumD) * vec3(1.12, 1.04, 0.94), ${ds.toFixed(2)});
#include <color_fragment>`); }; mat.customProgramCacheKey = () => 'desat' + ds; }
        const tn = TINT[f]; if (tn) mat.color.setRGB(tn[0], tn[1], tn[2]);
        srcs.set(f, m); }   // Tripo's baked colours run warm: settle them into the scene's grade
      catch (e) { console.warn('prop model', f, e); }
    }));
    const o = new THREE.Object3D();
    for (const f of files) {
      const src = srcs.get(f); if (!src) continue; const list = swaps.filter((s) => s.f === f);
      const place = (s: typeof swaps[number], obj: THREE.Object3D) => { obj.position.copy(s.at); obj.rotation.set(s.tilt ?? 0, s.ry, 0, 'YXZ'); obj.scale.set(...s.s); };
      if (list.length > 4) {                                                                // repeated: instanced, half of them mirrored, each with its own tint
        const tints = VARY[f], hash = (q: THREE.Vector3) => Math.abs(Math.floor(q.x * 12.9898 + q.z * 78.233));
        const groups: Array<{ geo: THREE.BufferGeometry; items: typeof list }> = [{ geo: src.geometry, items: [] }];
        const mg = tints ? mirrored(src.geometry) : null; if (mg) groups.push({ geo: mg, items: [] });
        for (const s of list) groups[mg && hash(s.at) % 2 ? 1 : 0].items.push(s);
        for (const g of groups) {
          if (!g.items.length) continue; const im = new THREE.InstancedMesh(g.geo, src.material, g.items.length); const c = new THREE.Color();
          g.items.forEach((s, k) => {
            place(s, o); o.updateMatrix(); im.setMatrixAt(k, o.matrix);
            if (tints) { const t = tints[hash(s.at) % tints.length], j = 0.94 + ((hash(s.at) >> 3) % 13) / 100; im.setColorAt(k, c.setRGB(t[0] * j, t[1] * j, t[2] * j)); }
          });
          im.castShadow = im.receiveShadow = true; im.computeBoundingSphere(); scene.add(im);
        }
      } else for (const s of list) { const m = new THREE.Mesh(src.geometry, src.material); place(s, m); m.castShadow = m.receiveShadow = true; scene.add(m); }
      for (const s of list) { for (const h of s.hide) h.visible = false; s.onLoad?.(); }
    }
  };

  // ---- the grown valley's places: built after everything else is placed (each clears its footprint first, from its own random stream)
  if (placeKit) {
    for (const sz of [STAIR.z0 - 2.6, STAIR.z1 + 2.6]) PLACE_CLEAR.push({ x: STAIR.xBot - 2.8, z: sz, r: 3.5 });   // no tree grows into the great lions
    const n0 = scene.children.length, seed0 = seed;                                          // the shared stream is put back afterwards (the trees load from it later)
    buildVillageDistricts(placeKit, SITES.village); buildGoblinRoute(placeKit, SITES.snare, CH1.camps[CH1.mahninCamp], SITES.monastery); buildBoneWastes(placeKit, CH1.necro, 19);
    buildGarrison(placeKit, CH1.camps[6], CH1.camps[8], CH1.camps[7], { x1: B.x0 + EDGE + 10, z1: B.z1 - EDGE - 10 });
    { const [mx, mz] = growCh1(32, -62), [rx, rz] = growPt(62, -66); buildMarsh(placeKit, { x: mx, z: mz }, { x: rx, z: rz }); }
    { const [hx, hz] = growCh1(114, -89.5); buildMonastery(placeKit, SITES.monastery, POOLS.slice(1).map((p, i) => ({ p, mesh: poolMeshes[i + 1] })), growAll([[93.5, -99], [141.5, -95], [98.5, -129]]), { x: hx, z: hz }, CH1.abbot); }
    buildGarden(placeKit, GARDEN);
    buildTemple(placeKit, TX, CH1.sealPillar, STAIR);
    buildNagaApproach(placeKit, CH1.lair, CH1.barrierR, CH1.gate);
    for (const o of scene.children.slice(n0)) o.userData.place = true; seed = seed0;
  }

  // ---- the streams, cut last: everything above was placed without them (the shared random stream is untouched), then the ground
  //      and the trails sink into their beds, the water and its mud go in, and anything scattered that landed in a bed is cleared away
  const clearBeds = (): void => {
    const m = new THREE.Matrix4(), v = new THREE.Vector3(), zero = new THREE.Matrix4().makeScale(0, 0, 0), box = new THREE.Box3(), sz = new THREE.Vector3();
    for (const o of scene.children) {
      if (o.userData.stream) continue; o.updateMatrixWorld();
      const im = o as THREE.InstancedMesh;
      if (im.isInstancedMesh) {
        let ch = false; for (let i = 0; i < im.count; i++) { im.getMatrixAt(i, m); v.setFromMatrixPosition(m).applyMatrix4(im.matrixWorld); if (streamAt(v.x, v.z).d < 1.0 && Math.abs(v.y - GY) < 2) { im.setMatrixAt(i, zero); ch = true; } }
        if (ch) { im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); }
      } else if ((o.position.x !== 0 || o.position.z !== 0) && o.visible && streamAt(o.position.x, o.position.z).d < 0.3 && Math.abs(o.position.y - GY) < 2) {
        box.setFromObject(o).getSize(sz); if (Math.max(sz.x, sz.z) < 5) o.visible = false;                     // a stray rock, fern or log in the water
      }
    }
    for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {                                       // and their colliders: the bed is open water
      const k = j * NX + i; if (grid[k] !== 5) continue; const x = B.x0 + (i + 0.5) * CELL, z = B.z0 + (j + 0.5) * CELL;
      if (streamAt(x, z).d < 0.25) { grid[k] = 4; topY[k] = 99; }
    }
  };
  {
    const fords = cutStreams(nearPath);
    const sink = (g: THREE.BufferGeometry, normals: boolean) => { const ps = g.getAttribute('position') as THREE.BufferAttribute; let ch = false;
      for (let i = 0; i < ps.count; i++) { const s = streamSink(ps.getX(i), ps.getZ(i)); if (s > 0) { ps.setY(i, ps.getY(i) - s); ch = true; } }
      if (ch) { ps.needsUpdate = true; if (normals) g.computeVertexNormals(); g.computeBoundingSphere(); } };
    for (const g of groundGeos) sink(g, true); if (trailGeo) sink(trailGeo, false); for (const g of extraTrails) sink(g, false);
    let sr = 90127; const R = () => (sr = (sr * 16807) % 2147483647) / 2147483647;          // the streams' own random stream
    const bankMat = new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, depthWrite: false, roughness: 0.85, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
    const reedGeo = mergeGeometries([0, 1, 2, 3, 4].map((k) => new THREE.ConeGeometry(0.03, 0.8 + (k % 3) * 0.22, 3).translate(0, 0.4, 0).rotateZ((k - 2) * 0.16).rotateY(k * 1.3).translate(Math.cos(k * 2.4) * 0.12, 0, Math.sin(k * 2.4) * 0.12)));
    const reeds: THREE.Matrix4[] = [], stones: THREE.Matrix4[] = [], steps: THREE.Matrix4[] = []; const o = new THREE.Object3D(); const cc = new THREE.Color();
    streamCurves.forEach((cv, si) => {
      const P = SPTS.filter((p) => p.si === si), L = cv.getLength(), n = P.length - 1;
      const hwAt = (t: number) => P[Math.min(n, Math.round(t * n))].hw;
      const wg = ribbon(cv, (t) => hwAt(t) + 0.8, Math.ceil(L / 0.8), STREAM_Y), wn = wg.getAttribute('position').count;
      wg.setAttribute('aDep', new THREE.Float32BufferAttribute(Array.from({ length: wn }, (_, i) => { const k = Math.floor(i / 2) / (wn / 2 - 1); return Math.min(1, Math.max(0, (P[Math.min(n, Math.round(k * n))].dep - 0.22) / 0.78)); }), 1));
      const water = new THREE.Mesh(wg, waterMaterial(time, 0.75, true)); water.userData.stream = true; water.renderOrder = 4; scene.add(water);   // over the trails (they sink into the fords)
      // mud: dark and wet at the waterline, drier outward, fading into the grass (follows the sunken ground)
      const cols = [{ d: 0.2, c: 0x3a3226, a: 1 }, { d: 1.1, c: 0x4a3f2c, a: 0.92 }, { d: 2.0, c: 0x564c34, a: 0.6 }, { d: 2.9, c: 0x5e6842, a: 0 }];
      const pos: number[] = [], col: number[] = [], idx: number[] = []; const SEG = Math.ceil(L / 0.8), per = cols.length * 2;
      for (let i = 0; i <= SEG; i++) {
        const t = i / SEG, p = cv.getPointAt(t), tg = cv.getTangentAt(t), nl = Math.hypot(tg.x, tg.z) || 1, nx = -tg.z / nl, nz = tg.x / nl, hw = hwAt(t);
        for (const s of [-1, 1]) for (const cd of cols) { const d = hw + cd.d + (R() - 0.5) * 0.3, x = p.x + nx * s * d, z = p.z + nz * s * d; pos.push(x, terrainH(x, z) + 0.02, z); cc.setHex(cd.c).multiplyScalar(0.85 + R() * 0.3); col.push(cc.r, cc.g, cc.b, cd.a * Math.min(1, (t * L) / 3, ((1 - t) * L) / 3 + 0.3)); }
        if (i < SEG) for (let side = 0; side < 2; side++) for (let k = 0; k < cols.length - 1; k++) { const a = i * per + side * cols.length + k, b = a + per; idx.push(a, b, a + 1, a + 1, b, b + 1); }
        // reeds in clumps and half-sunk stones along both waterlines (not at the fords)
        const ford = P[Math.min(n, Math.round(t * n))].dep < 0.6;
        if (!ford && i % 2 === 0) for (const s of [-1, 1]) {
          if (R() < 0.55) { const d = hw + 0.2 + R() * 0.9, x = p.x + nx * s * d, z = p.z + nz * s * d, sc = 0.6 + R() * 0.7; o.position.set(x, terrainH(x, z), z); o.rotation.set(0, R() * 6.28, 0); o.scale.set(sc, sc * (0.8 + R() * 0.5), sc); o.updateMatrix(); reeds.push(o.matrix.clone()); }
          if (R() < 0.3) { const d = hw + 0.5 + (R() - 0.5) * 1.2, x = p.x + nx * s * d, z = p.z + nz * s * d, sc = 0.12 + R() * 0.3; o.position.set(x, terrainH(x, z) + sc * 0.25, z); o.rotation.set(R() * 3, R() * 3, R() * 3); o.scale.set(sc, sc * 0.7, sc); o.updateMatrix(); stones.push(o.matrix.clone()); }
        }
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4)); g.setIndex(idx);
      g.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(pos.length).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
      const bank = new THREE.Mesh(g, bankMat); bank.receiveShadow = true; bank.renderOrder = 1; bank.userData.stream = true; scene.add(bank);
      WATERWAYS.push({ name: STREAMS[si].name, curve: cv, y: STREAM_Y, hw: STREAMS[si].hw });
    });
    // fords: flat stepping stones across, standing just clear of the water
    for (const f of fords) {
      const cv = streamCurves[f.si], L = cv.getLength(), t = f.u / L, p = cv.getPointAt(t), tg = cv.getTangentAt(t), nl = Math.hypot(tg.x, tg.z) || 1, nx = -tg.z / nl, nz = tg.x / nl, hw = STREAMS[f.si].hw + 0.5;
      for (let d = -hw; d <= hw + 0.01; d += 0.74) for (const a of [-0.45, 0.45]) {
        const x = p.x + nx * d + (tg.x / nl) * (a + (R() - 0.5) * 0.2), z = p.z + nz * d + (tg.z / nl) * (a + (R() - 0.5) * 0.2), sc = 0.34 + R() * 0.1;
        o.position.set(x, STREAM_Y + 0.02, z); o.rotation.set((R() - 0.5) * 0.12, R() * 6.28, (R() - 0.5) * 0.12); o.scale.set(sc, 0.16, sc * (0.8 + R() * 0.3)); o.updateMatrix(); steps.push(o.matrix.clone());
      }
    }
    clearBeds();
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, list: THREE.Matrix4[], shadow: boolean) => { if (!list.length) return; const im = new THREE.InstancedMesh(geo, mat, list.length); list.forEach((mm, i) => im.setMatrixAt(i, mm)); im.computeBoundingSphere(); im.castShadow = shadow; im.receiveShadow = true; im.userData.stream = true; scene.add(im); };
    add(reedGeo, new THREE.MeshStandardMaterial({ color: 0x56683a, roughness: 1, flatShading: true }), reeds, false);
    add(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0x6d6656, roughness: 1, flatShading: true }), stones, true);
    add(new THREE.DodecahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ color: 0x6e685a, roughness: 0.95, flatShading: true }), steps, true);
  }

  /** Load the Tripo prop models and stand them in their holders (one draw each; they share geometry and material). */
  const loadProps = async (base: string): Promise<void> => {
    await Promise.all([loadArches(base).catch((e) => console.warn('archway', e)), loadTrees(base).catch((e) => console.warn('trees', e)), loadSwaps(base).catch((e) => console.warn('prop models', e))]);
    await loadRocks(base).catch((e) => console.warn('rock pillars', e));
    const mossLog = await new GLTFLoader().loadAsync(base + 'assets/mosslog.glb').then((g) => firstMesh(g.scene)).catch(() => null);
    placeLogs(mossLog); await loadBamboo(base).catch((e) => console.warn('bamboo', e)); clearBeds(); drawMap();
    try {
      const ch = firstMesh((await new GLTFLoader().loadAsync(base + 'assets/chest.glb')).scene);
      if (ch) { const cm = ch.material as THREE.MeshStandardMaterial; cm.roughness = 0.8; cm.metalness = 0;
        for (const c of campChests) { const m = new THREE.Mesh(ch.geometry, cm); m.scale.setScalar((c as { big?: boolean }).big ? 1.7 : 0.7); m.position.set(c.x, (c as { y?: number }).y ?? terrainH(c.x, c.z), c.z); m.rotation.y = c.ry; m.castShadow = true; m.receiveShadow = true; scene.add(m); } }
    } catch (e) { console.warn('chest', e); }
    const g = await new GLTFLoader().loadAsync(base + 'assets/brazier.glb'); let mesh: THREE.Mesh | null = null;
    g.scene.traverse((o) => { if ((o as THREE.Mesh).isMesh && !mesh) mesh = o as THREE.Mesh; });
    if (!mesh) return; const src = mesh as THREE.Mesh; const mat = src.material as THREE.MeshStandardMaterial; mat.roughness = 0.85; mat.metalness = 0.15;
    for (const h of braziers) { const m = new THREE.Mesh(src.geometry, mat); m.scale.setScalar(h.userData.h); m.castShadow = true; m.receiveShadow = true; h.add(m); }
    // GPT flame flipbook (Temple-Torch-Flame-4x4): looping, the flame's base sits ~10% above the bottom of each cell
    const sheet = await new THREE.TextureLoader().loadAsync(base + 'assets/vfx/flame.jpg'); sheet.colorSpace = THREE.SRGBColorSpace;
    for (const f of flameCones) {
      const map = sheet.clone(); map.repeat.set(0.25, 0.25); map.needsUpdate = true;
      const s2 = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, color: f.dire ? 0xffb090 : 0xffffff }));
      const W = f.h * (f.dire ? 0.8 : 0.62), Hh = W * 1.15; s2.scale.set(W, Hh, 1);
      s2.position.copy(f.cone.position); s2.position.y += Hh * 0.38; s2.renderOrder = 6; scene.add(s2);
      f.cone.visible = false; flames.push({ s: s2, phase: rnd() * 16, speed: 13 + rnd() * 5 });
    }
  };

  return {
    lamps, sun, loadProps,
    /** The Hydra is dead: the ward turns gold and the treasure's glow with it. */
    captives,
    /** Raise or drop the barrier round the Naga's lair. */
    setSealed: (on: boolean) => { lairSeal.on = on; barrier.visible = on; },
    openGate: () => { gateOpen = true; (gateParts.ward!.material as THREE.MeshBasicMaterial).color.setHex(0xffd060); (gateParts.chestGlow!.material as THREE.SpriteMaterial).color.setHex(0xffd060); },
    update: (dt: number) => {
      cullT -= dt;
      if (cullT <= 0) {                                                                       // 4x a second: hide props far from the hero
        cullT = 0.25; if (--cullScan <= 0) { cullScan = 8; cullList.length = 0;
          for (const o of scene.children) { const im = o as THREE.InstancedMesh; if (!im.isInstancedMesh || !im.boundingSphere) continue; const g = im.geometry; const tri = (g.index ? g.index.count : g.attributes.position.count) / 3;
            cullList.push({ im, c: im.boundingSphere.center.clone(), r: im.boundingSphere.radius, far: tri > 600 ? 85 : 50 }); } }
        const f = ch1Focus.value; for (const e of cullList) { const d = Math.hypot(e.c.x - f.x, e.c.z - f.z) - e.r; e.im.visible = d < e.far; }
      }
      time.value += dt; for (const f of campAnims) f(time.value, dt); for (const f of swAnims) f(time.value); for (const f of lairAnims) f(time.value);
      for (let k = 0; k < EMB; k++) { ep[k * 3 + 1] += dt * (0.35 + (k % 5) * 0.08); ep[k * 3] += Math.sin(time.value + k) * dt * 0.15; if (ep[k * 3 + 1] > 5.5) ep[k * 3 + 1] = 0; }
      emberGeo.attributes.position.needsUpdate = true;
      for (let k = 0; k < SPK; k++) {
        spAge[k] += dt; const f = fires[k % fires.length];
        if (spAge[k] > 1.5) { spAge[k] = 0; sp3[k * 3] = f.x + (Math.random() - 0.5) * 0.3; sp3[k * 3 + 1] = f.y + 0.2; sp3[k * 3 + 2] = f.z + (Math.random() - 0.5) * 0.3; }
        sp3[k * 3 + 1] += dt * 1.2; sp3[k * 3] += Math.sin(time.value * 3 + k) * dt * 0.3;
      }
      spkGeo.attributes.position.needsUpdate = true;
      for (const f of flames) { const fr = Math.floor(time.value * f.speed + f.phase) % 16; f.s.material.map!.offset.set((fr % 4) * 0.25, 0.75 - Math.floor(fr / 4) * 0.25); }
      for (const f of fogs) {                                                                     // fog drifts and breathes; wraps around the map
        f.s.position.x += f.vx * dt; f.s.position.z += f.vz * dt; f.s.material.opacity = f.base * (0.75 + 0.25 * Math.sin(time.value * 0.3 + f.s.position.x));
        if (f.s.position.x < B0.x0) f.s.position.x = B0.x1; else if (f.s.position.x > B0.x1) f.s.position.x = B0.x0;
        if (f.s.position.z < B0.z0) f.s.position.z = B0.z1; else if (f.s.position.z > B0.z1) f.s.position.z = B0.z0;
      }
      for (const f of edgeFog) {                                                                // the edge wall rolls slowly in place
        const tt = time.value * 0.12 + f.ph; f.s.position.x = f.x + Math.sin(tt) * 2.5; f.s.position.z = f.z + Math.cos(tt * 0.8) * 2.5;
        const dh = Math.hypot(f.x - ch1Focus.value.x, f.z - ch1Focus.value.z); f.s.visible = dh < 80;
        f.s.material.opacity = f.base * (0.8 + 0.2 * Math.sin(tt * 1.7)) * Math.min(1, Math.max(0, (80 - dh) / 30));   // only near the hero (no scene fog on these)
      }
    },
  };
}
