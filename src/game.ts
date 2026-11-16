import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { Combo, COMBO_CONFIG, ComboStep } from './combo';
import { Enemy } from './enemies';
import { Boss, BOSS_HEIGHT, setBossHp } from './boss';
import { Necro } from './necro';
import { Minion } from './minion';
import { Hydra } from './hydra';
import { NagaSwimmer, type GlimpseKind } from './swimmer';
import { VILLAGE_HOMES, RECOVER, CAPTIVE_CAMP, FERRY } from './ch1places';
import { SPOTS, elementReached, touchedAt, restoreSpots, SIDE_QUESTS, questStep, STORY, type El, type Spot } from './places';
import { BigMap, type MapMarker } from './bigmap';
import { Dialogue } from './dialogue';
import { CH1_SCENES } from './story';
import { QuestTracker } from './quest';
import { Npc } from './npc';
import { MainMenu } from './menu';
import { Souls, Altar, type AttrId } from './souls';
import { ELEMENTS, SPELLS, elementOf, spellFor, spellById, loadLoadout, type ElementId, type SpellId } from './spells';
/** The 3D menu scene (src/menu.ts) is kept but off: the main menu now uses the owner's painted key art. */
const USE_3D_MENU = false;
import { Fx, FlipSheet } from './fx';
import { Input } from './input';
import { buildWorld, settle, walk } from './world';
import { buildChapter1, grassAt, SHRINES, STELES, burnBrambles, GARDEN, VILLAGE_SPOTS, NIGHT_PATH, TX, PLATEAU, STAIR, BRAMBLES, walkableCh1, walkAirCh1, topCh1, heightCh1, warpCh1, terrainH, HILLS, TRENCHES, LOOT, FRAGMENTS, TRAPS, inWaterCh1, CH1, ch1Focus, ch1Map, ch1Reach, STREAMS, streamAt, growCh1, SITES } from './chapter1';
import { sfx } from './audio';
import { Atmosphere } from './atmosphere';
import { heroStats, mitigate, armorBlock, defOf, atk, statsRows, levelCost, MAX_LEVEL, RELICS, BOONS, SPELL_UNIT, type Atk, type HeroStats } from './stats';

type HeroState = 'free' | 'attack' | 'dash' | 'hurt' | 'skill' | 'dead' | 'leap';
type Foe = Enemy | Boss | Necro | Minion | Hydra;
/** Skills: 1 = Alchemy Blast (golden orb, 3 damage in a small blast), 2 = Golden Seal (a sigil spreads under him and erupts twice, 2 + 2 damage around him),
 *  3 = Twin Kick (keyboard F: rising push kick for 2, then a spinning high kick for 3 that sends them flying). */
/** Mana each skill costs. */
const SKILL_MANA = { 1: 65, 2: 100, 3: 50, 4: 80 } as const;
const SKILLS = { 1: { clip: 'Skill1', cooldown: 4 }, 2: { clip: 'Seal', cooldown: 7 }, 3: { clip: 'Kick1', cooldown: 5 }, 4: { clip: 'Chain', cooldown: 6 } } as const;
type SkillId = 1 | 2 | 3 | 4;
/** 4 = Chain Lightning: the staff slam calls a bolt to the nearest foe, which jumps to the next one up to 4 times (3, 2, 2, 2 damage). */
const CHAIN_RANGE = 9, CHAIN_JUMP = 6.5, CHAIN_MAX = 4, CHAIN_STEP = 0.09;
const SEAL_RADIUS = 3.6;
const ORB_SPEED = 18, ORB_RANGE = 13, ORB_BLAST = 1.7;
const KICKS = [{ clip: 'Kick1', reach: 2.4, arc: 110, dmg: 2, knock: 1.0 }, { clip: 'Kick2', reach: 2.8, arc: 150, dmg: 3, knock: 2.6 }] as const;
interface Orb { mesh: THREE.Group; dir: THREE.Vector3; dist: number; sprite?: THREE.Sprite }
const HERO_SCALE = 1.842;           // the rig is 0.977 m tall; the hero is 1.8 m
const STEP_UP = 0.32;             // highest ledge he steps onto without jumping (m)
const LEDGE = 2.0;                // on foot he won't walk off a drop deeper than this (take the stairs); a jump will
const FALL_SAFE = 3.5;            // falls deeper than this hurt
const FLIP_TIME = 0.42;           // the double jump's front flip (s)
const JUMP_V = 8.0, GRAVITY = 24;     // apex v^2 / 2g = 1.33 m, 0.67 s in the air
const RUN_SPEED = 4.0;              // game run speed (m/s). The run clip is played faster or slower so the feet match it.
let RUN_CLIP_SPEED = 3.28;          // ground speed of the run clip's planted foot at normal play speed; overwritten from clips.json
interface ClipMeta { duration: number; speed: number; hitTime?: number; hit2Time?: number; loop: boolean; stanceSpeed?: number }
/** Which map: Chapter 1 by default, the round test arena with ?map=arena (the automated tests use the arena). */
const MAP: 'ch1' | 'arena' = new URLSearchParams(location.search).get('map') === 'arena' ? 'arena' : 'ch1';
const ZOOMS = [20.7, 27, 37.8];       // camera distance per zoom step (touch default 20.7: 20% higher than 17.25)
const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

export class Game {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly fx: Fx;
  readonly combo = new Combo(COMBO_CONFIG);
  readonly enemies: Foe[] = [];
  readonly boss: Boss;
  readonly necro: Necro | null = null;
  readonly minions: Minion[] = [];
  readonly hydra: Hydra | null = null;
  readonly campPacks: Minion[][] = [];
  undeadKing: Minion | null = null;
  bigmap: BigMap | null = null;
  menu: MainMenu | null = null;
  readonly dialogue = new Dialogue(import.meta.env.BASE_URL);
  /** Story scenes play in Chapter 1 (off under automated tests: they pause the game; tests call playScene directly). */
  storyOn = MAP === 'ch1' && !navigator.webdriver;
  private storySeen = new Set<string>();
  readonly quest = new QuestTracker();
  souls: Souls | null = null;
  private deadSeen = new Set<unknown>();
  /** Souls a fallen foe releases (bosses and elites give far more). */
  /** Bosses and elites carry a Relic the first time they fall. */
  private relicFrom(e: Foe): void {
    const id = e instanceof Boss ? 'lotus' : e instanceof Necro ? 'finger' : e instanceof Minion ? ({ king: 'crown', chief: 'fang', commander: 'plate', banshee: 'thread', abbot: 'beads' } as Record<string, string>)[e.kind] : undefined;
    if (id) this.grantRelic(id);
  }
  private soulValue(e: Foe): number {
    if (e instanceof Hydra) return 120; if (e instanceof Boss) return 40; if (e instanceof Necro) return 35;
    if (e instanceof Minion) return ({ king: 35, chief: 30, commander: 30, banshee: 30, abbot: 35, monk: 4, sword: 5, lance: 5, ghoul: 3, caster: 4, ghost: 4, archer: 4 } as Record<string, number>)[e.kind] ?? 3;
    return 2;
  }
  readonly elites: Minion[] = [];
  private captives: Array<{ camp: number; x: number; z: number; objs: THREE.Object3D[] }> = [];
  private setSealed: ((on: boolean) => void) | null = null;
  mahninFreed = false; private mahninFig: THREE.Group | null = null; mahninCage: Npc | null = null; mahninNpc: Npc | null = null; private mahninWaved = false; private barrierUp = false;
  /** Turn the Chapter 1 quest on (the barrier rises round the lair). On by default when the story is on; tests call it. */
  enableQuest(): void {
    if (MAP !== 'ch1' || this.quest.enabled) return; this.quest.enabled = true; this.barrierUp = true; this.setSealed?.(true);
    this.unlocked[2] = this.unlocked[3] = this.unlocked[4] = this.unlocked.elixir = false;      // skills are earned act by act
    for (const e of ELEMENTS) this.elements[e.id] = e.id === 'fire'; this.elKey = '';            // Fire from the start; the other four act by act
  }
  private toastEl: HTMLDivElement | null = null; private toastT = 0;
  /** A reward banner in the middle of the screen. */
  toast(t1: string, t2: string, t3 = '', secs = 3.2): void {
    if (!this.toastEl) { this.toastEl = document.createElement('div'); this.toastEl.id = 'toast'; document.body.appendChild(this.toastEl); }
    this.toastEl.innerHTML = `<div class="t1">${t1}</div><div class="t2">${t2}</div><div class="t3">${t3}</div>`; this.toastEl.classList.add('show'); this.toastT = secs;
  }
  /** Act rewards: each shard holder's fall (and the king's) earns the next skill. */
  private checkUnlocks(): void {
    if (!this.quest.enabled) return;
    if (this.undeadKing?.dead) this.kingDown = true;
    const got = (id: string) => this.shardsTaken.has(id);
    const earn = (key: 2 | 3 | 4 | 'elixir', name: string, how: string) => { if (!this.unlocked[key]) { this.unlocked[key] = true; this.toast('NEW SKILL', name, how); } };
    const learn = (el: ElementId) => { if (this.elements[el]) return; this.elements[el] = true; this.elKey = ''; const d = elementOf(el);
      this.toast('NEW ELEMENT', `${d.glyph} ${d.name} (${d.pali})`, this.loadout.includes(el) ? `${d.passive} while it circles you` : 'add it to your three on the SPELLS screen'); };
    if (this.kingDown) { learn('earth'); this.unlocked[2] = true; }
    if (got('chief')) { learn('air'); earn(3, 'Twin Kick', 'F: a push kick, then a spinning kick'); }
    if (got('necro')) { learn('water'); this.unlocked[4] = true; }
    if (got('commander') && !this.unlocked.heart) { this.unlocked.heart = true; this.applyStats(); this.toast('REWARD', '+100 Max Health', 'the garrison\'s hold on you breaks'); }
    if (got('banshee')) { learn('spirit'); this.unlocked.elixir = true; }
  }
  /** Play a Chapter 1 scene once. */
  playScene(id: string, force = false): Promise<void> {
    if ((!this.storyOn && !force) || this.storySeen.has(id) || !CH1_SCENES[id]) return Promise.resolve();
    this.storySeen.add(id); this.input.clear();
    return this.dialogue.play(CH1_SCENES[id]).then(() => { this.lastTime = 0; this.input.clear(); });
  }
  private worldOpenGate: (() => void) | null = null; private gateOpened = false; private chapterDone = false;
  readonly walk = walk;
  readonly ch1 = { map: ch1Map, reach: ch1Reach, CH1, W: warpCh1, T: (x: number, z: number) => { const [a, b] = warpCh1(x, z); return [a + TX, b]; }, TX, plateau: PLATEAU, stair: STAIR, shrines: SHRINES, steles: STELES, brambles: BRAMBLES, night: NIGHT_PATH, garden: GARDEN, terrain: terrainH, hills: HILLS, trenches: TRENCHES, streams: STREAMS, streamAt, inWater: inWaterCh1, G: growCh1, homes: VILLAGE_HOMES, frags: FRAGMENTS, loot: LOOT, spots: SPOTS, captiveCamp: CAPTIVE_CAMP, ferry: FERRY };      // test hooks                                     // test hook: the ground rules in use
  readonly hero = new THREE.Group();
  state: HeroState = 'free';
  hp = 777; maxHp = 777; mp = 333; maxMp = 333;
  /** Relics found and the (up to 3) worn; a slow on him (fraction, seconds); seconds since he was last hurt (regen x4 after 5 s). */
  relics: string[] = []; equipped: string[] = []; private slowK = 0; private slowT = 0; private sinceHit = 99; noCrit = false;
  /** Lost Fragments found (of 6) and how long a snare still holds him. */
  fragments = 0; private rootT = 0; private splashT = 0;
  /** Level and attributes: souls buy levels at Ma Hnin's altar, each level gives 3 points. */
  level = 1; points = 0;
  readonly attrs: Record<AttrId, number> = { str: 0, vit: 0, int: 0, agi: 0 };
  /** Every stat, from level, attributes, the circling elements and Relics (src/stats.ts). */
  get st(): HeroStats { return heroStats(this.level, this.attrs, this.held, this.equipped, this.unlocked.heart, this.boons); }
  /** Boons earned for good (freed villagers, his garden), and the villagers standing in the old village. */
  boons: string[] = []; private villagers: Array<{ npc: Npc; home: string; waved: boolean; camp: number }> = [];
  /** The captives' models, cowering in their cages until he frees them (by camp). */
  private caged = new Map<number, Npc>();
  /** Who each freed captive is: their model, height, and what they do at home. */
  private static readonly VILLAGER: Record<string, { asset: string; h: number; home: string }> = { weaver: { asset: 'weaver', h: 1.5, home: 'Sit' }, herbalist: { asset: 'herbwoman', h: 1.6, home: 'Idle' }, lampboy: { asset: 'boy', h: 1.3, home: 'Idle' }, ferry: { asset: 'herbwoman', h: 1.55, home: 'Idle' } }; private freed = new Set<number>(); private gardenDone = false; private nearShrine: (typeof SHRINES)[number] | null = null;   // the Ferry-Woman wears the Herb Woman's model until she has her own
  private static readonly CAPTIVE_BOON: Record<number, string> = { 2: 'weaver', 1: 'herbalist', 17: 'lampboy' };   // camp -> the villager in its cage (Ma Hnin's cage is CH1.mahninCamp)
  private get mahninCage0() { return this.captives.find((c) => c.camp === CH1.mahninCamp); }
  private grantBoon(id: string, t1: string, t3 = ''): void { if (this.boons.includes(id)) return; this.boons.push(id); this.applyStats(); const b = BOONS[id]; this.toast(t1, b.name, t3 || b.text, 5); }
  /** A spell's elements reach the ground in front of him (5 m) and where he stands: places that answer an element respond (places.ts). */
  private elementsReach(id: string): void {
    const pair = (Object.keys(SPELLS).find((k) => SPELLS[k].id === id) ?? '').split('+') as El[], p = this.hero.position;
    const f = new THREE.Vector3(Math.sin(this.facing), 0, Math.cos(this.facing)), P = p.clone().addScaledVector(f, 5);
    for (const el of new Set(pair)) if (el) for (const s of [...elementReached(el, P.x, P.z, 4), ...elementReached(el, p.x, p.z, 2.5)]) this.spotAnswered(s, el);
  }
  /** A place answered (an element reached it, or he walked up to it): a flash in its element's colour and its line. */
  private spotAnswered(s: Spot, el: El | 'touch'): void {
    const col = el === 'fire' ? 0xff8a3a : el === 'water' ? 0x6ad0ff : el === 'air' ? 0xd8f4ff : el === 'earth' ? 0xc8a070 : el === 'spirit' ? 0x9affd8 : 0xffe0a0;
    const at = new THREE.Vector3(s.x, this.walk.h(s.x, s.z) + 0.8, s.z); this.fx.burst(at, 22, 3.5, col); this.fx.ring(at.clone().setY(at.y - 0.7), 0.4, Math.max(2, s.r), 0.7, col);
    sfx.soul(); if (s.say) this.toast(s.name.toUpperCase(), s.say, '', 5.5);
  }
  /** Side quests: a quest opens when he finds its first clue; when its last step is done its reward is given (once). */
  private sideDone = new Set<string>(); private sideT = 0;
  private updateSideQuests(dt: number): void {
    this.sideT -= dt; if (this.sideT > 0) return; this.sideT = 0.4;
    const p = this.hero.position; let best: { d: number; title: string; text: string } | null = null;
    for (const q of SIDE_QUESTS) {
      if (this.sideDone.has(q.id) || !q.open()) continue; const k = questStep(q);
      if (k >= q.steps.length) { this.sideDone.add(q.id); this.sideReward(q.id); this.toast('SIDE QUEST COMPLETE', q.title, q.reward, 6); sfx.levelup(); continue; }
      const at = q.steps[k].at?.(), d = at ? Math.hypot(at[0] - p.x, at[1] - p.z) : 9999;
      if (!best || d < best.d) best = { d, title: q.title, text: q.steps[k].text };
    }
    this.quest.setSide(best ? best.title : '', best ? best.text : '');
  }
  /** What finishing a side quest gives (beyond what its places already changed in the world). */
  private sideReward(id: string): void { this.sideRewards[id]?.(); }
  readonly sideRewards: Record<string, () => void> = {};
  /** Fire reached a point: brambles nearby burn away. */
  private fireAt(at: THREE.Vector3, reach: number): void {
    if (MAP !== 'ch1') return;
    for (const b of burnBrambles(at.x, at.z, reach)) { for (let k = 0; k < 8; k++) this.fx.burst(new THREE.Vector3(b.x + (Math.random() - 0.5) * 4, 1, b.z + (Math.random() - 0.5) * 4), 14, 4, 0xff7a2a);
      if (this.vfx.flame) for (let k = 0; k < 5; k++) this.fx.flip(this.vfx.flame, new THREE.Vector3(b.x + (Math.random() - 0.5) * 4, 1.2, b.z + (Math.random() - 0.5) * 4), 2.4, 24, false, 0, this.scene, true);
      sfx.slam(); this.toast('THE THORNS BURN', b.name, 'fire clears what grew over the old ways'); }
  }
  /** The new places of the old village and the temple hill: shrines, inscriptions, captives going home, his garden. */
  private updateHillAndVillage(dt: number): void {
    const p = this.hero.position; this.nearShrine = null;
    for (const q of SHRINES) {
      const d = Math.hypot(p.x - q.x, p.z - q.z); if (d > 3.2 || Math.abs(p.y - this.walk.h(q.x, q.z)) > 2) continue;
      if (!q.awake) { q.awake = true; sfx.levelup(); this.fx.ring(new THREE.Vector3(q.x, p.y + 0.1, q.z), 0.4, 3, 0.6, 0x7af0ff); this.toast('SOUL SHRINE AWAKE', q.name + ': an old pilgrim waystone. It wakes for him alone', SHRINES.filter((s2) => s2.awake).length > 1 ? 'rest here; TRAVEL to any other awake shrine' : 'rest here; wake another to travel between them', 4); }
      this.nearShrine = q; if (this.state !== 'dead') { this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.2 * dt); this.mp = Math.min(this.maxMp, this.mp + this.maxMp * 0.2 * dt); }
    }
    document.getElementById('btn-travel')?.classList.toggle('hidden', !this.nearShrine || SHRINES.filter((s2) => s2.awake).length < 2 || !this.started);
    for (const q of STELES) if (!q.read && Math.hypot(p.x - q.x, p.z - q.z) < 2.2) { q.read = true; sfx.soul(); this.toast('INSCRIPTION', q.title, q.text, 7); }
    if (this.state !== 'dead') for (const s of touchedAt(p.x, p.z)) this.spotAnswered(s, 'touch');
    this.updateSideQuests(dt);
    { const fa = FERRY.a, fb = FERRY.b, fc = CAPTIVE_CAMP.ferry;                                // the ferry: once the Ferry-Woman is home, either landing carries him across
      if (fa && fb && fc !== undefined && this.freed.has(fc) && this.state !== 'dead') { const da = Math.hypot(p.x - fa.x, p.z - fa.z), db = Math.hypot(p.x - fb.x, p.z - fb.z);
        if (this.ferryReady && (da < 1.6 || db < 1.6)) { const to = da < 1.6 ? fb : fa; this.teleport(to.x, to.z, this.facing); sfx.splash(false); this.toast('THE FERRY', da < 1.6 ? 'Across the river to the Ghost Marsh' : 'Back across to the old village', 'the Ferry-Woman poles you over', 3); this.ferryReady = false; }
        else if (da > 4 && db > 4) this.ferryReady = true; } }
    this.captives.forEach((c, i) => {
      if (c.camp === CH1.mahninCamp || this.freed.has(c.camp)) return; const boon = Game.CAPTIVE_BOON[c.camp]; if (!boon) return;
      if (Math.hypot(p.x - c.x, p.z - c.z) > 3.4 || !(this.campPacks[c.camp] ?? []).every((m) => m.dead)) return;
      this.homeVillager(c.camp); this.fx.burst(new THREE.Vector3(c.x, 1, c.z), 20, 3, 0xffd8a0); sfx.soul();
      this.grantBoon(boon, 'CAPTIVE FREED', `${BOONS[boon].name} comes home to the old village, to the house the goblins took them from: ${BOONS[boon].text}`);
    });
    for (const v of this.villagers) {                                                     // at home: they turn to him, and the first time he comes by they wave
      const r = v.npc.root, d = Math.hypot(p.x - r.position.x, p.z - r.position.z); if (d > 45) continue; v.npc.update(dt);
      if (d < 10 && v.home !== 'Sit') { let dr = Math.atan2(p.x - r.position.x, p.z - r.position.z) - r.rotation.y; dr = Math.atan2(Math.sin(dr), Math.cos(dr)); r.rotation.y += dr * Math.min(1, dt * 3); }
      if (!v.waved && d < 6 && v.npc.loaded && v.home !== 'Sit') { v.waved = true; v.npc.play('Wave', 0.3, v.home); }
      if (d < 3.6 && this.talkT <= 0 && (this.saidAt.get(v.camp) ?? -99) < this.clock - 25) { this.saidAt.set(v.camp, this.clock); this.talkT = 5; this.talkTo = v; this.say(this.villagerLine(Game.CAPTIVE_BOON[v.camp])); }
    }
    this.clock += dt; if (this.talkT > 0) { this.talkT -= dt; this.placeBubble(); if (this.talkT <= 0) this.bubble?.classList.remove('on'); }
    for (const [camp, n] of this.caged) {                                                 // caged: they cower when he comes near
      const c = this.captives.find((q) => q.camp === camp); if (!c || this.freed.has(camp) || !n.loaded) continue; const d = Math.hypot(p.x - c.x, p.z - c.z); if (d > 45) continue;
      if (d < 9) { let dr = Math.atan2(p.x - c.x, p.z - c.z) - n.root.rotation.y; dr = Math.atan2(Math.sin(dr), Math.cos(dr)); n.root.rotation.y += dr * Math.min(1, dt * 3); }
      n.update(dt);
    }
    if (!this.gardenDone && Math.hypot(p.x - GARDEN.x, p.z - GARDEN.z) < GARDEN.r) { this.gardenDone = true; this.grantBoon('crucible', 'A MEMORY', 'He planted these herbs, to heal people. Five hundred years, and his crucible is still warm. +8% spell power'); }
  }
  /** The village talks: a freed villager has a line for him when he comes by (they never know who he is; it changes as the acts go by). */
  private ferryReady = true;
  private clock = 0; private talkT = 0; private talkTo: { npc: Npc } | null = null; private saidAt = new Map<number, number>(); private bubble: HTMLDivElement | null = null;
  private static readonly LINES: Record<string, [string, string, string]> = {
    weaver: ['They kept us in those cages so long I forgot the colours. Madder red… I remember it now.', 'Carts go north from the goblin camps, full of our people. They come back empty.', 'I’m weaving again. A cloth for someone. I can’t think who… it just feels owed.'],
    herbalist: ['Fever-leaf grows by water. My mother said a healer taught the valley that. Nobody remembers who.', 'The racks are full again. Take care, stranger. Even the river watches.', 'The old garden under the hill is laid out like mine. Like my mother’s. Someone taught us all.'],
    ferry: ['The goblins sold the boat-people first. We knew the river too well, they said.', 'I’ll get the old boat on the water again. The river roads are faster than any trail.', 'The water’s different lately. Calmer. As if something down there stopped pulling.'],
    lampboy: ['I lit them all! Ma Hnin says light keeps the dark away.', 'Do you think the lamps on the hill will ever be lit again?', 'When I grow up I’ll keep the temple lamps, like grandfather did. Whoever the temple was for.'],
  };
  private villagerLine(id: string): string { const s = this.shardCount(), L = Game.LINES[id]; return L ? L[!this.barrierUp || s >= 4 ? 2 : s >= 2 ? 1 : 0] : '…'; }
  private say(text: string): void {
    if (!this.bubble) { this.bubble = document.createElement('div'); this.bubble.id = 'say'; document.body.appendChild(this.bubble); }
    this.bubble.textContent = text; this.bubble.classList.add('on'); this.placeBubble();
  }
  private placeBubble(): void {
    if (!this.bubble || !this.talkTo) return; const v = this.talkTo.npc.root.position.clone().setY(this.talkTo.npc.root.position.y + 2.3).project(this.camera);
    this.bubble.style.left = `${(v.x * 0.5 + 0.5) * innerWidth}px`; this.bubble.style.top = `${(-v.y * 0.5 + 0.5) * innerHeight}px`;
  }
  /** A captive goes home: the cage empties and they stand in the old village (their boon is granted by the caller). */
  private homeVillager(camp: number): void {
    const c = this.captives.find((q) => q.camp === camp), boon = Game.CAPTIVE_BOON[camp]; if (!c || !boon || this.villagers.some((v) => v.camp === camp)) return;
    this.freed.add(camp); for (const o of c.objs) o.visible = false; const cg = this.caged.get(camp); if (cg) cg.root.visible = false;
    const own = VILLAGE_HOMES[boon], spot: [number, number] = own ? [own.x, own.z] : VILLAGE_SPOTS[this.villagers.length % VILLAGE_SPOTS.length], vc = Game.VILLAGER[boon], npc = new Npc(vc.asset, vc.h), k = this.villagers.length;
    npc.root.position.set(spot[0], this.walk.h(spot[0], spot[1]), spot[1]); if (own) npc.root.rotation.y = own.ry; RECOVER[boon]?.(); this.scene.add(npc.root); this.villagers.push({ npc, home: vc.home, waved: false, camp });   // home to their own house; the village shows it
    npc.load(import.meta.env.BASE_URL).then(() => npc.play(vc.home, 0)).catch(() => npc.root.add(this.villagerFigure(k)));   // the stand-in only if the model fails
  }
  /** A freed villager (a stand-in figure until the villager models arrive). */
  private villagerFigure(k: number): THREE.Group {
    const cols = [0xc8a070, 0x8a9ab0, 0xa07a9a, 0x9aa070, 0xb08a60]; const mat = new THREE.MeshStandardMaterial({ color: cols[k % cols.length], roughness: 0.85 }), skin = new THREE.MeshStandardMaterial({ color: 0xc89878, roughness: 0.8 });
    const g = new THREE.Group(); const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 0.85, 4, 10), mat); body.position.y = 0.75; g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 8), skin); head.position.y = 1.5; g.add(head); g.traverse((o) => { o.castShadow = true; }); return g;
  }
  /** Travel between awake Soul Shrines (the game pauses while the list is open). */
  openTravel(): void {
    if (!this.nearShrine) return; const here = this.nearShrine; let el = document.getElementById('travel'); el?.remove();
    el = document.createElement('div'); el.id = 'travel'; document.body.appendChild(el); this.paused = true;
    el.innerHTML = `<div class="tv-box"><div class="tv-title">SOUL SHRINES</div>${SHRINES.filter((q) => q.awake).map((q) => `<button data-sh="${q.id}" class="${q === here ? 'here' : ''}">${q.name}${q === here ? ' (here)' : ''}</button>`).join('')}<button class="tv-close">Stay</button></div>`;
    el.addEventListener('click', (ev) => {
      const t = ev.target as HTMLElement; const b = t.closest('[data-sh]') as HTMLElement | null; const q = b ? SHRINES.find((s2) => s2.id === b.dataset.sh) : null;
      if (q && q !== here) { this.teleport(q.x + 1.8, q.z - 1.8, this.facing); this.fx.ring(this.hero.position.clone().setY(this.hero.position.y + 0.1), 0.4, 3, 0.6, 0x7af0ff); sfx.magic(); this.toast('TRAVEL', q.name, 'the soul butterflies carry him'); }
      if (q || t.closest('.tv-close')) { el!.remove(); this.paused = false; this.lastTime = 0; this.input.clear(); }
    });
  }
  get cdMul(): number { return 1 - this.st.cdr; }
  get speedMul(): number { return this.st.speed; }
  get mpRegen(): number { return this.st.mpRegen; }
  levelCost(): number { return levelCost(this.level); }
  /** Recompute max health and mana; any gain is added to the current values too. */
  applyStats(): void {
    const oh = this.maxHp, om = this.maxMp, st = this.st;
    this.maxHp = Math.round(st.maxHp); this.maxMp = Math.round(st.maxMp);
    this.hp = Math.min(this.maxHp, this.hp + Math.max(0, this.maxHp - oh)); this.mp = Math.min(this.maxMp, this.mp + Math.max(0, this.maxMp - om));
  }
  private defFor(e: Foe): { armor: number; mr: number } { return defOf(e instanceof Boss ? 'guardian' : e instanceof Hydra ? 'naga' : e.kind); }
  /** Damage dealt to a foe. Physical: units x attack damage, crits, less the foe's armor. Magic: units x 60 x spell power, less its magic resist.
   *  Lifesteal (physical) and spell vamp (magic; ticks count half) heal him. */
  private dealt(base: number, e: Foe, type: 'phys' | 'magic' = 'phys', tick = false): { dmg: number; show: string; cls: string } {
    const st = this.st, d = this.defFor(e);
    let dmg = (type === 'phys' ? base * st.ad : base * SPELL_UNIT * (1 + st.sp)) * st.dmgMul;
    const crit = type === 'phys' && !this.noCrit && Math.random() < st.crit; if (crit) dmg *= st.critDmg;
    dmg = Math.max(1, Math.round(dmg * (type === 'phys' ? 1 - armorBlock(d.armor) : 1 - d.mr)));
    const vamp = (type === 'phys' ? st.lifesteal : st.spellVamp) * (tick ? 0.5 : 1);
    if (vamp > 0 && this.state !== 'dead' && this.hp < this.maxHp) { const h = Math.min(this.maxHp - this.hp, dmg * vamp); this.hp += h; this.healShown += h; }
    return { dmg, show: crit ? `${dmg}!` : String(dmg), cls: crit ? 'crit' : type === 'magic' ? 'magic' : '' };
  }
  /** The damage-number style for a hit. */
  private nk(dl: { cls: string }, big: boolean): string { return dl.cls === 'crit' ? 'crit' : `${dl.cls}${big ? ' big' : ''}`.trim(); }
  private healShown = 0; private healTick = 0;
  /** Spirit Elixir: 250 + 10% of max health, and it frees him from snares and slows. */
  private elixirHeal(): number { const h = Math.round(250 + 0.1 * this.maxHp); this.hp = Math.min(this.maxHp, this.hp + h); this.rootT = 0; this.slowT = 0; return h; }
  /** A Relic is found: kept, and worn at once if a slot is free. */
  private grantRelic(id: string): void {
    if (MAP !== 'ch1' || this.relics.includes(id) || !RELICS[id]) return; this.relics.push(id); const r = RELICS[id];
    const worn = this.equipped.length < 3; if (worn) this.equipped.push(id); this.applyStats();
    this.toast('RELIC', r.name, worn ? r.text : `${r.text}. Wear it at the altar`);
  }
  private statsHtml(): string {
    const rows = statsRows(this.st).map(([k, v]) => `<b>${k}</b><span>${v}</span>`).join('');
    const rel = this.relics.length ? this.relics.map((id) => { const r = RELICS[id]; return `<button class="st-rel ${this.equipped.includes(id) ? 'on' : ''}" data-relic="${id}"><span>${r.name}</span><small>${r.text}</small></button>`; }).join('')
      : '<div class="alt-desc">No Relics yet: bosses, elites and hidden chests carry them.</div>';
    return `<div class="st-grid">${rows}</div><div class="st-h">RELICS (${this.equipped.length} / 3 worn, tap to wear or remove)</div>${rel}`;
  }
  altar: Altar | null = null; private altarNear = false; private levelsGained = 0;
  private hpBars = new Map<unknown, HTMLDivElement>();
  openAltar(): void {
    if (!this.altar) this.altar = new Altar(import.meta.env.BASE_URL, {
      souls: () => this.souls?.count ?? 0, level: () => this.level, points: () => this.points, attr: (id) => this.attrs[id], levelCost: () => this.levelCost(),
      levelUp: () => { const c = this.levelCost(); if (this.level >= MAX_LEVEL || !this.souls?.spend(c)) return false; this.level++; this.points += 3; this.applyStats(); this.levelsGained++; if (this.souls) this.souls.level = this.level; sfx.levelup(); return true; },
      raise: (id) => { if (this.points <= 0) return false; this.points--; this.attrs[id]++; this.applyStats(); sfx.soul(); return true; },
      stats: () => this.statsHtml(),
      relic: (id) => { if (this.equipped.includes(id)) this.equipped = this.equipped.filter((x) => x !== id); else if (this.equipped.length < 3) this.equipped.push(id); this.applyStats(); sfx.soul(); },
      close: () => { this.lastTime = 0; this.input.clear(); if (this.levelsGained > 0) { this.celebrateLevel(); this.levelsGained = 0; } },
    });
    this.input.clear(); this.altar.open();
  }

  // ------------------------------------------------------------------ element mixing (see src/spells.ts)
  /** Elements learned (story: Fire at the start, the rest act by act; the arena has all five). */
  readonly elements: Record<ElementId, boolean> = { fire: true, water: true, air: true, earth: true, spirit: true };
  loadout: ElementId[] = loadLoadout();
  /** The elements circling him (2 at most, newest last), and the two invoked spells (slot 1 first). */
  held: ElementId[] = []; slots: Array<SpellId | null> = [null, null];
  private spellCd: Partial<Record<SpellId, number>> = {}; private invokeCd = 0; paused = false;
  private orbSprites: THREE.Sprite[] = []; private glowTexture: THREE.Texture | null = null; private soulTexture: THREE.Texture | null = null;
  private pendingSpell: (() => void) | null = null; private spellMode = false;
  private timers: Array<{ t: number; fn: () => void }> = [];
  private veil: { t: number; tick: number; objs: THREE.Sprite[] } | null = null;
  private brand: { e: Foe; t: number; tick: number; jumps: number; spr: THREE.Object3D | null } | null = null;
  private zones: Array<{ kind: 'cyclone' | 'mire'; x: number; z: number; r: number; t: number; tick: number; objs: THREE.Object3D[]; seen: Map<unknown, number> }> = [];
  private walls: Array<{ x: number; z: number; dx: number; dz: number; w: number; d: number; top: number; t: number; mesh: THREE.Group }> = [];
  private comets: Array<{ pos: THREE.Vector3; dir: THREE.Vector3; dist: number; hit: Set<unknown>; spr: THREE.Object3D | null }> = [];
  private swarm: Array<{ spr: THREE.Sprite; t: number; target: Foe | null }> = [];
  private galeT = 0; private galeHit = new Set<unknown>(); private ascentSlam = false;
  private orbCount(e: ElementId): number { return this.held.filter((o) => o === e).length; }
  setLoadout(l: ElementId[]): void { this.loadout = [...l]; this.held = this.held.filter((o) => l.includes(o)); this.elKey = ''; }
  private glowTex(): THREE.Texture {
    if (!this.glowTexture) { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d')!; const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); this.glowTexture = new THREE.CanvasTexture(c); }
    return this.glowTexture;
  }
  private sprite(col: number, size: number, additive = true, tex?: THREE.Texture): THREE.Sprite {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex ?? this.glowTex(), color: col, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, toneMapped: false }));
    s.scale.setScalar(size); this.scene.add(s); return s;
  }
  private dropSprite(s: THREE.Object3D): void { s.removeFromParent(); ((s as THREE.Sprite).material as THREE.Material)?.dispose?.(); }
  /** Tap one of the three element buttons: it joins the two circling him. */
  pressElement(i: number): void {
    const el = this.loadout[i]; if (!el) return;
    if (!this.elements[el]) { this.fx.damageNumber(this.hero.position.clone().setY(2.4), 'LOCKED', ''); return; }
    this.held.push(el); if (this.held.length > 2) this.held.shift(); sfx.soul();
  }
  /** INVOKE: the two circling elements become their spell, in slot 1 (slot 1 moves to slot 2). */
  invoke(): void {
    if (this.held.length < 2) { this.fx.damageNumber(this.hero.position.clone().setY(2.4), 'TWO ELEMENTS', ''); return; }
    if (this.invokeCd > 0) return; const s = spellFor(this.held[0], this.held[1]).id;
    if (this.slots[0] !== s) this.slots = this.slots[1] === s ? [s, this.slots[0]] : [s, this.slots[0]];
    this.invokeCd = 0.5; sfx.magic(); this.fx.ring(this.hero.position.clone().setY(0.1), 0.3, 1.8, 0.35, elementOf(this.held[0]).hex);
    this.fx.damageNumber(this.hero.position.clone().setY(2.6), spellById(s).name.toUpperCase(), '');
  }
  /** How much of a spell's cooldown is left (0..1) and in seconds. */
  spellCooldown(id: SpellId): { k: number; s: number } {
    const legacy = id === 'blast' ? 1 : id === 'seal' ? 2 : id === 'chain' ? 4 : 0;
    if (legacy) { const s = this.cooldown[legacy as 1 | 2 | 4]; return { k: Math.min(1, s / (SKILLS[legacy as 1 | 2 | 4].cooldown * this.cdMul)), s }; }
    const s = this.spellCd[id] ?? 0; return { k: Math.min(1, s / (spellById(id).cd * this.cdMul)), s };
  }
  private aimFoe(range: number): Foe | null { return (this.nearestEnemy(range, this.facing, Math.PI * 0.6) ?? this.nearestEnemy(range, null, 0)) as Foe | null; }
  private aimAt(dist: number): THREE.Vector3 {
    const f = this.aimFoe(dist + 3); if (f) { this.facing = Math.atan2(f.pos.x - this.hero.position.x, f.pos.z - this.hero.position.z); this.hero.rotation.y = this.facing; return new THREE.Vector3(f.pos.x, 0, f.pos.z); }
    return this.hero.position.clone().add(new THREE.Vector3(Math.sin(this.facing), 0, Math.cos(this.facing)).multiplyScalar(dist)).setY(0);
  }
  /** A short cast pose (the Skill1 or Seal clip); the spell lands at the clip's hit frame. */
  private castPose(kind: 1 | 2, fn: () => void): void {
    if (!this.actions.has(SKILLS[kind].clip)) { fn(); return; }
    this.combo.cancel(); this.state = 'skill'; this.skillId = kind; this.skillT = 0; this.skillFired = [false, false]; this.spellMode = true; this.pendingSpell = fn;
    this.play(SKILLS[kind].clip, 0.08, this.clipSpeed(SKILLS[kind].clip) * 1.25, true);
  }
  /** Cast the spell in slot k. */
  castSlot(k: number): void {
    const id = this.slots[k]; if (!id || this.state === 'dead') return;
    if (!(this.state === 'free' || this.state === 'attack')) return;
    if (this.spellCooldown(id).s > 0) return;
    const def = spellById(id);
    if (this.mp < def.mana) { this.fx.damageNumber(this.hero.position.clone().setY(2.4), 'NO MANA', ''); return; }
    if (MAP === 'ch1') this.elementsReach(id);
    if (id === 'blast') { this.startSkill(1, true); return; }
    if (id === 'seal') { this.startSkill(2, true); return; }
    if (id === 'chain') { this.startSkill(4, true); return; }
    if (id === 'brand' && !this.aimFoe(12)) { this.fx.damageNumber(this.hero.position.clone().setY(2.4), 'NO TARGET', ''); return; }
    if (id === 'ascent' && this.airborne) return;
    this.mp -= def.mana; this.spellCd[id] = def.cd * this.cdMul;
    const hp = this.hero.position, fwd = () => new THREE.Vector3(Math.sin(this.facing), 0, Math.cos(this.facing));
    switch (id) {
      case 'elixir': { const h = this.elixirHeal(); sfx.magic();
        if (this.hfx.heal) this.fx.flip(this.hfx.heal, new THREE.Vector3(0, 1.3, 0), 3.4, 20, false, 0, this.hero, true);
        this.fx.burst(hp.clone().setY(1.2), 12, 3, 0x7affb0); this.fx.ring(hp.clone().setY(0.1), 0.4, 2.6, 0.5, 0x7affb0); this.fx.damageNumber(hp.clone().setY(2.4), `+${h}`, 'heal big'); break; }
      case 'comet': { this.aimAt(16); sfx.magic(); this.castPose(1, () => {
        const dir = fwd(), pos = hp.clone().addScaledVector(dir, 0.9); pos.y = walk.h(pos.x, pos.z) + 1.25;
        let spr: THREE.Object3D | null = null; if (this.vfx.orb) { spr = this.fx.flip(this.vfx.orb, pos, 1.7, 30, true, 7); ((spr as THREE.Sprite).material as THREE.SpriteMaterial).color.setHex(0xff6a20); }
        this.comets.push({ pos, dir, dist: 0, hit: new Set(), spr }); sfx.dash(); }); break; }
      case 'magma': { const P = this.aimAt(7); this.castPose(2, () => {
        if (this.hfx.crack) { const m = this.fx.groundFlip(this.hfx.crack, P, 4.6, 26); (m.material as THREE.MeshBasicMaterial).color.setHex(0xff8040); }
        sfx.warn(); this.timers.push({ t: 0.55, fn: () => {
          this.hitArea(P, 2.7, 3, 1.6, 0xff6a20); this.fireAt(P, 3);
          for (let k = 0; k < 4; k++) if (this.vfx.flame) this.fx.flip(this.vfx.flame, P.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2.4, 1.0, (Math.random() - 0.5) * 2.4)), 2.6, 26, false, 0, this.scene, true);
          if (this.vfx.impact) { const s2 = this.fx.flip(this.vfx.impact, P.clone().setY(1.0), 5, 26); (s2.material as THREE.SpriteMaterial).color.setHex(0xff7030); }
        } }); }); break; }
      case 'veil': { sfx.dash(); if (this.veil) for (const o of this.veil.objs) this.dropSprite(o);
        this.veil = { t: 5, tick: 0, objs: Array.from({ length: 12 }, () => this.sprite(0xe8eef0, 2.4 + Math.random() * 1.4, false)) }; break; }
      case 'brand': { const f = this.aimFoe(12)!; this.facing = Math.atan2(f.pos.x - hp.x, f.pos.z - hp.z); this.castPose(1, () => this.setBrand(f, 0)); break; }
      case 'bulwark': { const d = fwd(); this.raiseWall(hp.x + d.x * 2.4, hp.z + d.z * 2.4, d.x, d.z); break; }
      case 'cyclone': { const P = this.aimAt(6); this.castPose(2, () => {
        const objs: THREE.Object3D[] = []; if (this.vfx.sigil) { const m = this.fx.groundFlip(this.vfx.sigil, P, 6.5, 18, true, 5); (m.material as THREE.MeshBasicMaterial).color.setHex(0xd8b878); objs.push(m); }
        if (this.hfx.wind) for (let k = 0; k < 3; k++) { const s2 = this.fx.flip(this.hfx.wind, P.clone().setY(0.8 + k * 0.9), 3.4 + k * 0.6, 26, true, 7 + k * 2); ((s2 as THREE.Sprite).material as THREE.SpriteMaterial).color.setHex(0xe0c890); objs.push(s2); }
        this.zones.push({ kind: 'cyclone', x: P.x, z: P.z, r: 5, t: 3.5, tick: 0, objs, seen: new Map() }); sfx.zap(); }); break; }
      case 'mire': { const P = this.aimAt(6); this.castPose(2, () => {
        const disc = new THREE.Mesh(new THREE.CircleGeometry(3.6, 28).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x3a2a18, roughness: 0.35, transparent: true, opacity: 0.85, depthWrite: false }));
        disc.position.set(P.x, walk.h(P.x, P.z) + 0.03, P.z); disc.renderOrder = 2; disc.userData.own = true; this.scene.add(disc);
        this.zones.push({ kind: 'mire', x: P.x, z: P.z, r: 3.6, t: 5, tick: 0, objs: [disc], seen: new Map() }); sfx.slam(); }); break; }
      case 'gale': { const mv = this.moveDir(); this.startDash(mv.length() > 0.2 ? mv : new THREE.Vector2(Math.sin(this.facing), Math.cos(this.facing))); this.galeT = 0.3; this.galeHit = new Set(); this.invuln = 0.45; this.windFx(4.6, 1.0); break; }
      case 'ascent': { this.startJump(); this.jumpV = 11.5; this.airJumps = 1; this.ascentSlam = true; sfx.magic();
        for (let k = 0; k < 8; k++) { const s2 = this.sprite(0x7af0ff, 0.5, true, this.soulTex()); const a = k / 8 * 6.28; s2.position.set(hp.x + Math.cos(a) * 0.8, hp.y + 0.5, hp.z + Math.sin(a) * 0.8);
          this.swarm.push({ spr: s2, t: -0.9, target: null }); } break; }
      case 'tide': { this.aimAt(8); this.castPose(2, () => {
        const sheet = this.vfx.ghostwave ?? this.hfx.wind; if (sheet) { const size = 9; const m = this.fx.planeFlip(sheet, new THREE.Vector3(hp.x, hp.y + 0.5, hp.z).addScaledVector(fwd(), size * 0.42), size, 22, this.facing - Math.PI / 2, 0.15); (m.material as THREE.MeshBasicMaterial).color.setHex(0x6ac8ff); }
        sfx.slam(); for (const e of this.enemies) {
          if (e.dead) continue; const dx = e.pos.x - hp.x, dz = e.pos.z - hp.z, d = Math.hypot(dx, dz); if (d - e.radius > 8.5) continue;
          if (Math.abs(wrap(Math.atan2(dx, dz) - this.facing)) > 1.0 + Math.asin(Math.min(1, e.radius / Math.max(d, e.radius)))) continue;
          const dl = this.dealt(2.5, e, 'magic'); e.hurt(dl.dmg, dx / Math.max(d, 0.01), dz / Math.max(d, 0.01), 3.4, true); this.fx.burst(e.pos.clone().setY(1), 10, 3, 0x9adfff);
          this.fx.damageNumber(new THREE.Vector3(e.pos.x, 1.9, e.pos.z), dl.show, this.nk(dl, false));
        } }); break; }
      case 'swarm': { this.castPose(1, () => { const foes = this.enemies.filter((e) => !e.dead && Math.hypot(e.pos.x - hp.x, e.pos.z - hp.z) < 14) as Foe[];
        foes.sort((a, b) => Math.hypot(a.pos.x - hp.x, a.pos.z - hp.z) - Math.hypot(b.pos.x - hp.x, b.pos.z - hp.z));
        for (let k = 0; k < 6; k++) { const s2 = this.sprite(0x8af4ff, 0.7, true, this.soulTex()); s2.position.set(hp.x + (Math.random() - 0.5), hp.y + 1.5, hp.z + (Math.random() - 0.5)); this.swarm.push({ spr: s2, t: 0, target: foes.length ? foes[k % foes.length] : null }); }
        sfx.magic(); }); break; }
    }
  }
  /** Remove everything spells left in the world (reset / revive). */
  private clearSpells(): void {
    if (this.veil) { for (const o of this.veil.objs) this.dropSprite(o); this.veil = null; }
    if (this.brand?.spr) this.fx.kill(this.brand.spr, 0.01); this.brand = null;
    for (const z of this.zones) for (const o of z.objs) { if (o.userData.own) o.removeFromParent(); else this.fx.kill(o, 0.01); } this.zones = [];
    for (const w of this.walls) w.mesh.removeFromParent(); this.walls = [];
    for (const c of this.comets) if (c.spr) this.fx.kill(c.spr, 0.01); this.comets = [];
    for (const b of this.swarm) this.dropSprite(b.spr); this.swarm = []; this.timers = []; this.spellCd = {}; this.pendingSpell = null; this.spellMode = false; this.ascentSlam = false; this.galeT = 0;
  }
  private soulTex(): THREE.Texture { if (!this.soulTexture) { this.soulTexture = new THREE.TextureLoader().load(import.meta.env.BASE_URL + 'assets/ui/soul.png'); this.soulTexture.colorSpace = THREE.SRGBColorSpace; } return this.soulTexture; }
  /** Damage around a point; quiet = a damage-over-time tick (no ring, shake or thud). */
  private hitArea(at: THREE.Vector3, radius: number, dmg: number, knock: number, color: number, quiet = false, only?: (e: Foe) => boolean): void {
    if (!quiet) { this.fx.ring(at.clone().setY(0.1), 0.3, radius, 0.35, color); this.fx.burst(at.clone().setY(1), 18, 4.5, color); this.fx.shake = Math.max(this.fx.shake, 0.45); sfx.slam(); }
    for (const e of this.enemies) {
      if (e.dead || (only && !only(e as Foe))) continue; const dx = e.pos.x - at.x, dz = e.pos.z - at.z, d = Math.hypot(dx, dz); if (d - e.radius > radius) continue;
      const nx = d > 0.01 ? dx / d : 0, nz = d > 0.01 ? dz / d : 1; const dl = this.dealt(dmg, e as Foe, 'magic', quiet); e.hurt(dl.dmg, nx, nz, knock, !quiet);
      if (!quiet) { this.hitStop = Math.max(this.hitStop, 0.05); sfx.hit(true); } else this.fx.burst(e.pos.clone().setY(1.1), 3, 1.5, color);
      this.fx.damageNumber(new THREE.Vector3(e.pos.x, e instanceof Boss ? BOSS_HEIGHT * 0.8 : 1.9, e.pos.z), dl.show, this.nk(dl, !quiet));
      if (e.dead) { sfx.die(); this.fx.burst(e.pos.clone().setY(1.2), 24, 4, 0x7fe3c8); }
    }
  }
  private setBrand(e: Foe, jumps: number): void {
    if (this.brand?.spr) this.fx.kill(this.brand.spr, 0.1);
    let spr: THREE.Object3D | null = null; if (this.vfx.flame) { spr = this.fx.flip(this.vfx.flame, e.pos.clone().setY(2.6), 1.6, 20, true, 0, this.scene, true); ((spr as THREE.Sprite).material as THREE.SpriteMaterial).color.setHex(0x9a7aff); }
    this.brand = { e, t: 6, tick: 0, jumps, spr }; sfx.zap();
  }
  private raiseWall(x: number, z: number, dx: number, dz: number): void {
    if (this.walls.length >= 2) { const old = this.walls.shift()!; old.mesh.removeFromParent(); }
    const g = new THREE.Group(); const mat = new THREE.MeshStandardMaterial({ color: 0x9a8a6a, roughness: 1, flatShading: true }); const W = 4.4, H = 1.7;
    for (let k = 0; k < 4; k++) { const b = new THREE.Mesh(new THREE.BoxGeometry(1.15, H + (Math.random() - 0.5) * 0.25, 0.9), mat); b.position.set(-W / 2 + 0.55 + k * 1.1, H / 2, (Math.random() - 0.5) * 0.12); b.rotation.set(0, (Math.random() - 0.5) * 0.15, (Math.random() - 0.5) * 0.08); b.castShadow = b.receiveShadow = true; g.add(b); }
    const base = walk.h(x, z); g.position.set(x, base - H, z); g.rotation.y = Math.atan2(dx, dz); this.scene.add(g);
    this.walls.push({ x, z, dx, dz, w: W, d: 0.9, top: base + H, t: 8, mesh: g }); sfx.slam(); this.fx.shake = Math.max(this.fx.shake, 0.35); this.fx.burst(new THREE.Vector3(x, 0.3, z), 20, 3, 0xb8a98a);
  }
  /** A stone wall at this point (for the ground rules), or null. */
  wallAt(x: number, z: number): { top: number } | null {
    for (const w of this.walls) { const rx = x - w.x, rz = z - w.z, across = rx * w.dx + rz * w.dz, along = -rx * w.dz + rz * w.dx; if (Math.abs(along) < w.w / 2 && Math.abs(across) < w.d / 2 + 0.05) return w; }
    return null;
  }
  /** Everything the spells leave behind: comets, the veil, the brand, cyclones and mires, walls, butterflies, delayed blasts, the circling orbs. */
  private updateSpells(dt: number): void {
    const hp = this.hero.position; this.invokeCd = Math.max(0, this.invokeCd - dt); this.galeT = Math.max(0, this.galeT - dt);
    for (const k of Object.keys(this.spellCd) as SpellId[]) this.spellCd[k] = Math.max(0, (this.spellCd[k] ?? 0) - dt);
    for (let i = this.timers.length - 1; i >= 0; i--) { const t = this.timers[i]; t.t -= dt; if (t.t <= 0) { this.timers.splice(i, 1); t.fn(); } }
    // the circling elements
    while (this.orbSprites.length < 2) this.orbSprites.push(this.sprite(0xffffff, 0.55));
    this.orbSprites.forEach((s, i) => { const el = this.held[i]; s.visible = !!el && this.started; if (!el) return; (s.material as THREE.SpriteMaterial).color.setHex(elementOf(el).hex);
      const a = this.simTime * 3 + i * Math.PI; s.position.set(hp.x + Math.cos(a) * 0.85, hp.y + 1.55 + Math.sin(this.simTime * 4 + i) * 0.08, hp.z + Math.sin(a) * 0.85); });
    for (let i = this.comets.length - 1; i >= 0; i--) {
      const c = this.comets[i], step = 22 * dt; c.dist += step; c.pos.addScaledVector(c.dir, step); c.pos.y = walk.h(c.pos.x, c.pos.z) + 1.25; if (c.spr) c.spr.position.copy(c.pos);
      this.fx.burst(c.pos.clone().setY(1.1), 2, 1.4, 0xff8a30); this.fireAt(c.pos, 1.4);
      for (const e of this.enemies) { if (e.dead || c.hit.has(e) || Math.hypot(e.pos.x - c.pos.x, e.pos.z - c.pos.z) > e.radius + 0.7) continue; c.hit.add(e);
        const dl = this.dealt(2.5, e, 'magic'); e.hurt(dl.dmg, c.dir.x, c.dir.z, 1.2, true); this.sparkFx(e.pos.clone().setY(1.2), true); this.fx.damageNumber(new THREE.Vector3(e.pos.x, 1.9, e.pos.z), dl.show, this.nk(dl, true)); sfx.hit(true); if (e.dead) sfx.die(); }
      if (c.dist > 16 || !walk.air(c.pos.x, c.pos.z, c.pos.y)) { if (this.vfx.impact) { const s2 = this.fx.flip(this.vfx.impact, c.pos.clone(), 3, 26); (s2.material as THREE.SpriteMaterial).color.setHex(0xff7030); } if (c.spr) this.fx.kill(c.spr, 0.06); this.comets.splice(i, 1); }
    }
    if (this.veil) {
      const v = this.veil; v.t -= dt; v.tick -= dt; const fade = Math.min(1, v.t / 0.6, (5 - v.t) / 0.3);
      v.objs.forEach((s, k) => { const a = this.simTime * 0.7 + k * 0.52, r = 1.6 + (k % 3) * 0.7; s.position.set(hp.x + Math.cos(a) * r, hp.y + 0.6 + (k % 4) * 0.45, hp.z + Math.sin(a) * r); (s.material as THREE.SpriteMaterial).opacity = 0.42 * fade; });
      if (v.tick <= 0) { v.tick = 0.5; this.hitArea(hp, 3.6, 0.4, 0, 0xffffff, true); }
      if (v.t <= 0) { for (const o of v.objs) this.dropSprite(o); this.veil = null; }
    }
    if (this.brand) {
      const b = this.brand; b.t -= dt; b.tick -= dt; if (b.spr) b.spr.position.set(b.e.pos.x, b.e.pos.y + 2.6, b.e.pos.z);
      if (!b.e.dead && b.tick <= 0) { b.tick = 0.5; this.hitArea(b.e.pos, 0.1, 0.35, 0, 0x9a7aff, true, (e) => e === b.e); }
      if (b.e.dead) { const at = b.e.pos.clone(); this.hitArea(at, 3, 2, 1.4, 0x9a7aff); this.fireAt(at, 3); if (this.vfx.impact) { const s2 = this.fx.flip(this.vfx.impact, at.clone().setY(1.2), 4.4, 26); (s2.material as THREE.SpriteMaterial).color.setHex(0xa080ff); }
        const next = b.jumps < 3 ? (this.enemies.filter((e) => !e.dead && Math.hypot(e.pos.x - at.x, e.pos.z - at.z) < 8) as Foe[]).sort((a, c) => Math.hypot(a.pos.x - at.x, a.pos.z - at.z) - Math.hypot(c.pos.x - at.x, c.pos.z - at.z))[0] : undefined;
        if (next) this.setBrand(next, b.jumps + 1); else { if (b.spr) this.fx.kill(b.spr, 0.1); this.brand = null; } }
      else if (b.t <= 0) { if (b.spr) this.fx.kill(b.spr, 0.2); this.brand = null; }
    }
    for (let i = this.zones.length - 1; i >= 0; i--) {
      const z = this.zones[i]; z.t -= dt; z.tick -= dt;
      for (const e of this.enemies) {
        if (e.dead || !(e instanceof Minion)) continue; const dx = z.x - e.pos.x, dz = z.z - e.pos.z, d = Math.hypot(dx, dz); if (d > z.r) continue;
        if (z.kind === 'cyclone' && d > 0.6) { const px = e.pos.x, pz = e.pos.z; e.pos.x += (dx / d) * 3.2 * dt; e.pos.z += (dz / d) * 3.2 * dt; settle(e.pos, px, pz, 0.25); }
        if (z.kind === 'mire') { const tIn = (z.seen.get(e) ?? 0) + dt; z.seen.set(e, tIn); if (tIn < 1.5) e.slowT = 0.2; else if (tIn < 1.5 + dt * 1.5) e.rootT = 1.6; }
      }
      if (z.kind === 'cyclone') { if (z.tick <= 0) { z.tick = 0.5; this.hitArea(new THREE.Vector3(z.x, 0, z.z), z.r * 0.6, 0.3, 0, 0xd8b878, true, (e) => e instanceof Minion); } this.fx.burst(new THREE.Vector3(z.x + (Math.random() - 0.5) * 4, 0.3, z.z + (Math.random() - 0.5) * 4), 1, 2, 0xc8b080); }
      else if (Math.random() < 0.3) this.fx.burst(new THREE.Vector3(z.x + (Math.random() - 0.5) * 5, 0.15, z.z + (Math.random() - 0.5) * 5), 1, 0.8, 0x5a4028);
      if (z.t <= 0) { for (const o of z.objs) { if (o.userData.own) o.removeFromParent(); else this.fx.kill(o, 0.3); } this.zones.splice(i, 1); }
    }
    for (let i = this.walls.length - 1; i >= 0; i--) {
      const w = this.walls[i]; w.t -= dt; const base = w.top - 1.7; const rise = Math.min(1, (8 - w.t) / 0.25), sink = Math.min(1, w.t / 0.4);
      w.mesh.position.y = base - 1.7 * (1 - Math.min(rise, sink)); if (w.t <= 0) { w.mesh.removeFromParent(); this.walls.splice(i, 1); }
    }
    for (let i = this.swarm.length - 1; i >= 0; i--) {
      const b = this.swarm[i]; b.t += dt; const s = b.spr; const flap = 0.55 + 0.45 * Math.abs(Math.sin((b.t + i) * 14)); s.scale.set(0.7 * flap, 0.48, 1);
      if (b.t < 0) { s.position.y += dt * 4; s.position.x += Math.sin(b.t * 9 + i) * dt; (s.material as THREE.SpriteMaterial).opacity = Math.min(1, -b.t * 2); if (b.t > -0.05) { this.dropSprite(s); this.swarm.splice(i, 1); } continue; }
      const tg = b.target && !b.target.dead ? b.target : null;
      if (tg) { const to = new THREE.Vector3(tg.pos.x, tg.pos.y + 1.2, tg.pos.z).sub(s.position); const L = to.length(); s.position.addScaledVector(to.normalize(), Math.min(L, 10 * dt));
        if (L < 0.6) { const dl = this.dealt(0.7, tg, 'magic'); tg.hurt(dl.dmg, 0, 1, 0.3, false); this.fx.burst(s.position.clone(), 8, 2, 0x8af4ff); this.fx.damageNumber(new THREE.Vector3(tg.pos.x, 1.9, tg.pos.z), dl.show, this.nk(dl, false)); if (tg.dead) sfx.die(); this.dropSprite(s); this.swarm.splice(i, 1); continue; } }
      else { s.position.y += dt * 1.5; (s.material as THREE.SpriteMaterial).opacity = Math.max(0, 1 - b.t / 1.5); }
      if (b.t > 3) { this.dropSprite(s); this.swarm.splice(i, 1); }
    }
  }
  /** Element buttons, INVOKE and the two spell slots. */
  private elKey = '';
  private updateSpellHud(): void {
    const key = `${this.loadout.join()}|${this.loadout.map((e) => this.elements[e] ? 1 : 0).join('')}|${this.held.join()}|${this.slots.join()}`;
    if (key !== this.elKey) {
      this.elKey = key;
      this.loadout.forEach((el, i) => { const b = document.getElementById('btn-el' + (i + 1)); if (!b) return; const d = elementOf(el); b.style.setProperty('--c', d.color); b.innerHTML = `<span>${d.glyph}</span>`;
        b.classList.toggle('locked', !this.elements[el]); b.classList.toggle('held', this.held.includes(el)); b.setAttribute('aria-label', d.name); });
      const inv = document.getElementById('btn-invoke'); if (inv) { (inv.querySelector('.orbs') as HTMLElement).textContent = this.held.map((o) => elementOf(o).glyph).join(''); inv.classList.toggle('ready', this.held.length === 2); }
      this.slots.forEach((id, k) => { const b = document.getElementById('btn-cast' + (k + 1)); if (!b) return; const lbl = b.querySelector('.lbl') as HTMLElement;
        b.classList.toggle('empty', !id); if (!id) { lbl.textContent = '—'; b.style.backgroundImage = ''; return; }
        const def = spellById(id), pair = (Object.keys(SPELLS).find((kk) => SPELLS[kk].id === id) ?? 'fire+fire').split('+') as ElementId[];
        lbl.textContent = def.name.toUpperCase();
        b.style.backgroundImage = def.icon ? `url(${import.meta.env.BASE_URL}assets/vfx/${def.icon}.jpg)` : `radial-gradient(circle at 35% 35%, ${elementOf(pair[0]).color}, transparent 60%), radial-gradient(circle at 70% 70%, ${elementOf(pair[1]).color}, #111 70%)`; });
    }
    this.slots.forEach((id, k) => { const b = document.getElementById('btn-cast' + (k + 1)); if (!b || !id) return; const c = this.spellCooldown(id);
      b.style.setProperty('--cd', String(c.k)); b.classList.toggle('cooling', c.k > 0); b.classList.toggle('nomana', this.mp < spellById(id).mana);
      const n = b.querySelector('.cdnum'); if (n) n.textContent = c.s > 0 ? String(Math.ceil(c.s)) : ''; });
  }
  /** Chests open when he reaches them; Lost Fragments are taken; goblin traps bite unless he jumps them. */
  private updatePickups(dt: number): void {
    const p = this.hero.position; this.rootT = Math.max(0, this.rootT - dt);
    for (const l of LOOT) {
      if (l.opened || Math.hypot(p.x - l.x, p.z - l.z) > 1.7 || Math.abs(p.y - (l.y ?? terrainH(l.x, l.z))) > 1.3) continue;
      l.opened = true; if (l.glow) l.glow.visible = false; this.souls?.release(new THREE.Vector3(l.x, l.y ?? terrainH(l.x, l.z), l.z), l.souls);
      sfx.levelup(); this.fx.burst(new THREE.Vector3(l.x, 1.0, l.z), 26, 3.5, 0xffd27a); this.toast('CHEST', `+${l.souls} souls`, l.name);
      const rid = /trap-setters/.test(l.name) ? 'eye' : /lookout/.test(l.name) ? 'bell' : ''; if (rid) this.timers.push({ t: 2.6, fn: () => this.grantRelic(rid) });
    }
    for (const f of FRAGMENTS) {
      if (f.taken || Math.hypot(p.x - f.x, p.z - f.z) > 1.4 || Math.abs(p.y - (f.y ?? terrainH(f.x, f.z))) > 1.8) continue;
      f.taken = true; if (f.obj) f.obj.visible = false; this.fragments++; sfx.soul(); sfx.magic();
      this.fx.ring(new THREE.Vector3(f.x, 0.1, f.z), 0.3, 2.4, 0.6, 0xfff0c0); this.toast('LOST FRAGMENT', `${this.fragments} / ${FRAGMENTS.length}`, f.text);
    }
    for (const t of TRAPS) {
      t.cd = Math.max(0, t.cd - dt); if (t.cd > 0 || this.airborne || Math.hypot(p.x - t.x, p.z - t.z) > t.r) continue;
      if (t.kind === 'spike') { t.cd = 1.2; this.fx.burst(new THREE.Vector3(t.x, 0.4, t.z), 12, 3, 0xc04030); this.tryHurtHero(t.x + 0.01, t.z + 0.01, atk('spike')); }
      else { t.cd = 3; this.rootT = 1.1 * (1 - this.st.statusRes); sfx.block(); this.fx.damageNumber(p.clone().setY(2.3), 'SNARED', ''); }
    }
  }
  /** The level-up moment: golden pillar, jingle, banner. */
  private celebrateLevel(): void {
    if (this.hfx.levelup) this.fx.flip(this.hfx.levelup, new THREE.Vector3(0, 1.5, 0), 4, 20, false, 0, this.hero, true);
    this.fx.ring(this.hero.position.clone().setY(0.1), 0.4, 3, 0.6, 0xffd27a); this.toast('LEVEL UP', `Level ${this.level}`, this.points > 0 ? `${this.points} attribute point${this.points > 1 ? 's' : ''} to spend at the altar` : 'stronger');
  }
  /** Skills earned so far (story only: the test arena has everything). Prologue: combo + Alchemy Blast. */
  readonly unlocked = { 2: true, 3: true, 4: true, elixir: true, heart: false };
  private elixirCd = 0; private kingDown = false;
  started = false;
  facing = Math.PI / 4;
  fps = 0;

  private model: THREE.Object3D | null = null;
  private mixer: THREE.AnimationMixer | null = null;
  private actions = new Map<string, THREE.AnimationAction>();
  private cur: THREE.AnimationAction | null = null;
  private vel = new THREE.Vector2();
  private hitSet = new Set<Foe>();
  private skillId: SkillId = 1;
  private sigil: THREE.Mesh | null = null;
  private skillT = 0;
  private skillFired = [false, false];
  private kickPhase = 0;
  readonly cooldown = { 1: 0, 2: 0, 3: 0, 4: 0 };
  private chainQueue: Array<{ at: number; from: THREE.Vector3; foe: Foe | null; to: THREE.Vector3; dmg: number }> = [];
  private orbs: Orb[] = [];
  private deadT = 0;
  /** Red afterimages for the basic combo: a pool of posed copies of the hero, dropped along the swing and faded out. */
  private ghosts: Array<{ root: THREE.Object3D; bones: THREE.Bone[]; mats: THREE.MeshBasicMaterial[]; t: number }> = [];
  private heroBones: THREE.Bone[] = [];
  private ghostNext = 0;
  private ghostTimer = 0;
  /** GPT-made flipbooks for the Alchemy Blast (art/source/vfx). Missing sheets fall back to the plain glow spheres. */
  private vfx: { orb?: FlipSheet; impact?: FlipSheet; sigil?: FlipSheet; wave?: FlipSheet; lightning?: FlipSheet; flame?: FlipSheet; ghostwave?: FlipSheet } = {};
  /** The owner's hit and skill sheets (slash arc, hit spark, slam crack, kick wind, heal, level-up, death smoke). */
  private hfx: Partial<Record<'slash' | 'spark' | 'crack' | 'wind' | 'heal' | 'levelup' | 'death', FlipSheet>> = {};
  private hitStop = 0;
  private dashT = 0;
  private dashDir = new THREE.Vector2();
  private hurtT = 0;
  private invuln = 0;
  private zoom = 1;
  private camDist = ZOOMS[1];
  private simTime = 0;
  /** Test mode: the loop stops advancing by itself and advance() steps the simulation deterministically. */
  manual = false;
  private camTarget = new THREE.Vector3();
  private lamps: ReturnType<typeof buildWorld>['lamps'] = [];
  private worldUpdate: ((dt: number) => void) | null = null;
  private worldProps: ((base: string) => Promise<void>) | null = null;
  /** Camera yaw: 45 degrees in the arena, 0 (looking north) in Chapter 1. Joystick up always means screen up. */
  private yaw = Math.PI / 4;
  readonly map = MAP;
  private spawn = new THREE.Vector3();
  private spawnFacing = Math.PI / 4;
  private sun!: THREE.DirectionalLight;
  private staff: THREE.SkinnedMesh | null = null;
  private tipIdx = 0;
  private baseIdx = 0;
  meta: Record<string, ClipMeta> = {};
  private lastTime = 0;
  private fpsAcc = 0; private fpsCount = 0;
  private comboLabelT = 0;
  private raycaster = new THREE.Raycaster();
  private ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private tmp = new THREE.Vector3();
  private heroMats: THREE.MeshStandardMaterial[] = [];
  debug = false;
  atmo: Atmosphere | null = null;
  private renderFrame(): void { if (this.atmo) this.atmo.render(); else this.renderer.render(this.scene, this.camera); }

  constructor(private canvas: HTMLCanvasElement, private input: Input) {
    const touch = input.touchMode;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !touch, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, touch ? 1.75 : 2));
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = touch ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;   // phones: the cheaper filter
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.05; this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.camera = new THREE.PerspectiveCamera(36, innerWidth / innerHeight, 0.1, 140);
    if (MAP === 'ch1') {
      STORY.freed = this.freed; STORY.downs = this.downs; STORY.shards = this.shardsTaken;                                     // the grown valley's places read the story from here
      const w = buildChapter1(this.scene, this.renderer); if (CAPTIVE_CAMP.ferry !== undefined) Game.CAPTIVE_BOON[CAPTIVE_CAMP.ferry] = 'ferry';
      this.sideRewards.captive = () => this.souls?.release(this.hero.position.clone(), 120); this.sideRewards.graves = () => this.souls?.release(this.hero.position.clone(), 150); this.sideRewards.orders = () => this.souls?.release(this.hero.position.clone(), 120); this.sideRewards.bound = () => this.souls?.release(this.hero.position.clone(), 150); this.sideRewards.records = () => this.souls?.release(this.hero.position.clone(), 160); this.sideRewards.garden = () => this.souls?.release(this.hero.position.clone(), 60); this.lamps = w.lamps; this.sun = w.sun; this.worldUpdate = w.update; this.worldProps = w.loadProps; this.worldOpenGate = w.openGate; this.captives = w.captives; this.setSealed = w.setSealed;
      walk.ok = walkableCh1; walk.h = heightCh1; walk.air = walkAirCh1; walk.top = topCh1; this.yaw = 0; this.spawn.copy(CH1.spawn); this.spawnFacing = CH1.spawnFacing;
    } else { const w = buildWorld(this.scene, this.renderer); this.lamps = w.lamps; this.sun = w.sun; }
    if (touch) this.sun.shadow.mapSize.set(1024, 1024);
    { // spell walls (Stone Bulwark) join the ground rules: they block, stop arrows and bolts, and can be stood on
      const bOk = walk.ok, bAir = walk.air, bTop = walk.top;
      walk.ok = (x, z) => bOk(x, z) && (this.walls.length === 0 || !this.wallAt(x, z));
      walk.air = (x, z, y) => { if (!bAir(x, z, y)) return false; if (!this.walls.length) return true; const w = this.wallAt(x, z); return !w || y > w.top + 0.05; };
      walk.top = (x, z, y) => { const t = bTop(x, z, y); if (!this.walls.length) return t; const w = this.wallAt(x, z); return w && w.top <= y + 0.05 ? Math.max(t, w.top) : t; };
    }                                    // phones: a smaller shadow map
    this.facing = this.spawnFacing; this.hero.position.copy(this.spawn);
    this.fx = new Fx(this.scene, this.camera);
    this.scene.add(this.hero);
    const foes: Array<['dummy' | 'sentry', number, number]> = MAP === 'ch1' ? CH1.foes.map(([k, p]) => [k, p.x, p.z] as ['dummy' | 'sentry', number, number]) : [['dummy', 3.5, 5.5], ['dummy', 7.5, 2.5], ['dummy', 1.5, 9.5], ['sentry', 8.5, 8.5]];
    for (const [k, x, z] of foes) { const e = new Enemy(k, x, z); this.enemies.push(e); this.scene.add(e.root); }
    this.boss = MAP === 'ch1' ? new Boss(CH1.boss.x, CH1.boss.z, CH1.bossFacing) : new Boss(-8, 8, Math.atan2(8, -8)); this.enemies.push(this.boss); this.scene.add(this.boss.root, ...this.boss.extras);
    if (MAP === 'ch1') { this.necro = new Necro(CH1.necro.x, CH1.necro.z, CH1.necro.facing); this.enemies.push(this.necro); this.scene.add(this.necro.root); }
    if (MAP === 'ch1') { this.hydra = new Hydra(CH1.hydra.x, CH1.hydra.z, CH1.hydra.facing); this.enemies.push(this.hydra); this.scene.add(this.hydra.root, ...this.hydra.extras); }
    if (MAP === 'ch1') for (const p of CH1.camps) {                                         // each camp's pack: ghouls round the fire, casters out at the edge
      const pack: Minion[] = []; let gi = 0, ci = 0; const ranged = (k: string) => k === 'caster' || k === 'ghost' || k === 'archer';
      const nm = p.members.filter((k) => !ranged(k)).length, nr = p.members.length - nm;
      p.members.forEach((k) => {
        const a = !ranged(k) ? p.tent + Math.PI + (gi++ - (nm - 1) / 2) * 0.9 : p.tent + Math.PI + (ci++ - (nr - 1) / 2) * 1.3 + Math.PI * 0.5, r = ranged(k) ? 5.6 : 3.1;
        const x = p.x + Math.sin(a) * r, z = p.z + Math.cos(a) * r;
        const m = new Minion(k, x, z, Math.atan2(p.x - x, p.z - z)); pack.push(m); this.minions.push(m); this.enemies.push(m); this.scene.add(m.root);
      });
      for (const m of pack) m.pack = pack; this.campPacks.push(pack);
    }
    if (MAP === 'ch1') { this.boss.stayDead = true; if (this.necro) this.necro.stayDead = true; }                     // story foes stay beaten (the quest is built on it)
    if (MAP === 'ch1') { const k = new Minion('king', CH1.undeadKing.x, CH1.undeadKing.z, CH1.undeadKing.facing); k.pack = [k]; k.stayDead = true; this.undeadKing = k; this.minions.push(k); this.enemies.push(k); this.scene.add(k.root); }
    if (MAP === 'ch1') { const a = new Minion('abbot', CH1.abbot.x, CH1.abbot.z, CH1.abbot.facing); a.pack = [a]; a.stayDead = true; this.abbot = a; this.minions.push(a); this.enemies.push(a); this.scene.add(a.root); }   // the Sunken Monastery's side boss
    if (MAP === 'ch1') for (const e of CH1.elites) {                                        // the shard holders lead their camps
      const c = CH1.camps[e.camp], pack = this.campPacks[e.camp]; const m = new Minion(e.kind, c.x + Math.sin(c.tent + Math.PI) * 4, c.z + Math.cos(c.tent + Math.PI) * 4, c.tent);
      m.stayDead = true; pack.push(m); m.pack = pack; this.elites.push(m); this.minions.push(m); this.enemies.push(m); this.scene.add(m.root);
    }
    { const q = new URLSearchParams(location.search).get('fx'); const on = q === '1' || (q !== '0' && !navigator.webdriver);   // tests run plain (software WebGL); ?fx=1 forces it on
      this.atmo = new Atmosphere(this.renderer, this.scene, this.camera, touch, MAP === 'ch1' ? { sun: this.sun, grassAt, heightAt: terrainH, zones: [
        { mood: 'temple', x: TX, z: 0, core: 52, out: 72 }, { mood: 'village', x: 0, z: 0, core: 18, out: 34 }, { mood: 'waste', x: CH1.necro.x, z: CH1.necro.z, core: 20, out: 36 }, { mood: 'marsh', x: growCh1(32, -62)[0], z: growCh1(32, -62)[1], core: 22, out: 44 }, { mood: 'marsh', x: growCh1(-138, -72)[0], z: growCh1(-138, -72)[1], core: 16, out: 34 },
        { mood: 'monastery', x: SITES.monastery.x, z: SITES.monastery.z, core: 26, out: 50 }, { mood: 'lair', x: CH1.lair.x, z: CH1.lair.z, core: 28, out: 48 }, { mood: 'garrison', x: growCh1(-125, 122)[0], z: growCh1(-125, 122)[1], core: 30, out: 56 },
        { mood: 'hunting', x: growCh1(-110, -100)[0], z: growCh1(-110, -100)[1], core: 30, out: 60 }] } : null, on); }
    this.resize(); window.addEventListener('resize', () => this.resize()); window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 150));
    this.combo.onStart = (s, i) => this.onComboStart(s, i);
    this.combo.onImpact = (s, i) => this.onComboImpact(s, i);
    this.combo.onEnd = () => { /* state returns to free in update() */ };
    if (touch) { this.zoom = 0; this.camDist = ZOOMS[0]; }
    this.snapCamera();
  }

  // ------------------------------------------------------------------ loading
  async load(onProgress: (p: number) => void): Promise<void> {
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(import.meta.env.BASE_URL + 'assets/zawgyi.glb', (e) => { if (e.total) onProgress(Math.min(0.85, (e.loaded / e.total) * 0.85)); });
    this.model = gltf.scene; this.model.scale.setScalar(HERO_SCALE); this.hero.add(this.model);
    this.model.traverse((o) => {
      const m = o as THREE.Mesh; if (!m.isMesh) return; m.castShadow = true; m.receiveShadow = false; m.frustumCulled = false;
      if (o.name === 'Staff') this.staff = m as THREE.SkinnedMesh;
      else { const mat = m.material as THREE.MeshStandardMaterial; if (mat && mat.isMeshStandardMaterial) { mat.metalness = 0; mat.roughness = 0.85; this.heroMats.push(mat); } }
    });
    await this.dressStaff(); onProgress(0.9);
    try { this.meta = await (await fetch(import.meta.env.BASE_URL + 'assets/clips.json')).json(); } catch { this.meta = {}; }
    this.applyMeta(); onProgress(0.95);
    this.mixer = new THREE.AnimationMixer(this.model);
    // The run clip was baked with the hips ~1 m ahead of the root, so the body drew inside walls and water the
    // collision point had stopped short of. Pull the run's hips back over the root (same ground spot as Idle).
    const hipsTrack = (c: THREE.AnimationClip) => c.tracks.find((t) => /Hips\.position$/.test(t.name));
    const idleHips = hipsTrack(gltf.animations.find((c) => /(^|[|:])Idle$/.test(c.name)) ?? gltf.animations[0]);
    for (const clip of gltf.animations) {
      if (!/(^|[|:])Run$/.test(clip.name) || !idleHips) continue;
      const t = hipsTrack(clip); if (!t) continue; const v = t.values; const n = v.length / 3;
      let mx = 0, mz = 0; for (let i = 0; i < n; i++) { mx += v[i * 3]; mz += v[i * 3 + 2]; }
      const dx = idleHips.values[0] - mx / n, dz = idleHips.values[2] - mz / n;
      for (let i = 0; i < n; i++) { v[i * 3] += dx; v[i * 3 + 2] += dz; }
      // the staff's grip bone is a sibling of the hips (not under the hand), so it moves by the same amount
      const grip = clip.tracks.find((tr) => /Staff_Grip\.position$/.test(tr.name));
      if (grip) for (let i = 0; i < grip.values.length; i += 3) { grip.values[i] += dx; grip.values[i + 2] += dz; }
    }
    for (const clip of gltf.animations) {
      const name = clip.name.replace(/^.*[|:]/, '');
      const a = this.mixer.clipAction(clip); a.setLoop(name === 'Idle' || name === 'Run' ? THREE.LoopRepeat : THREE.LoopOnce, Infinity); a.clampWhenFinished = true; this.actions.set(name, a);
    }
    if (!this.actions.has('Idle')) throw new Error('Animation "Idle" missing. Found: ' + [...this.actions.keys()].join(', '));
    this.play('Idle', 0); this.mixer.update(0); this.model.updateMatrixWorld(true);
    this.measureStaff();
    this.makeGhosts();
    try { const base = import.meta.env.BASE_URL + 'assets/vfx/'; const [orb, impact, sigil, wave, lightning, flame, ghostwave] = await Promise.all(['orb', 'impact', 'sigil', 'wave', 'lightning', 'flame', 'ghostwave'].map((n) => Fx.loadSheet(base + n + '.jpg', 4, 4))); this.vfx = { orb, impact, sigil, wave, lightning, flame, ghostwave }; this.boss.useWaveSheet(this.fx, wave); } catch (e) { console.warn('vfx sheets failed to load', e); }
    await Promise.all((['slash', 'spark', 'crack', 'wind', 'heal', 'levelup', 'death'] as const).map(async (n) => { try { this.hfx[n] = await Fx.loadSheet(import.meta.env.BASE_URL + 'assets/vfx/' + n + '.jpg', 4, 4); } catch { /* the plain sparks stay */ } }));
    try { await this.worldProps?.(import.meta.env.BASE_URL); } catch (e) { console.warn('map props failed to load', e); }
    try { await this.boss.load(import.meta.env.BASE_URL + 'assets/guardian.glb', import.meta.env.BASE_URL + 'assets/guardian.json'); } catch (e) { console.warn('boss failed to load', e); }
    if (this.necro) {
      this.necro.useFx(this.fx, { bolt: this.vfx.orb, boltHit: this.vfx.impact, circle: this.vfx.sigil, hands: this.vfx.impact });   // placeholders until his own sheets
      try { await this.necro.load(import.meta.env.BASE_URL + 'assets/necro.glb', import.meta.env.BASE_URL + 'assets/necro-clips.json'); } catch (e) { console.warn('necromancer failed to load', e); }
    }
    if (this.hydra) { this.hydra.useFx(this.fx, { flame: this.vfx.flame, lightning: this.vfx.lightning, impact: this.vfx.impact, wave: this.vfx.wave });
      try { await this.hydra.load(import.meta.env.BASE_URL + 'assets/dragon.glb', import.meta.env.BASE_URL + 'assets/dragon-clips.json');   /* the Burmese Naga dragon */ } catch (e) { console.warn('hydra failed to load', e); }
      if (this.hydra.src) this.swimmer = new NagaSwimmer(this.scene, this.hydra.src, (s) => { this.fx.shake = Math.max(this.fx.shake, s); }); }
    if (MAP === 'ch1') this.souls = new Souls(this.scene, import.meta.env.BASE_URL);   // the soul currency
    if (MAP === 'ch1' && this.mahninCage0) {                                              // Ma Hnin: weeping in the goblins' cage (her model replaces the stand-in)
      const cage = this.mahninCage0; const a = new Npc('mahnin', 1.55), b = new Npc('mahnin', 1.55);
      try {
        await Promise.all([a.load(import.meta.env.BASE_URL), b.load(import.meta.env.BASE_URL)]);
        for (const o of cage.objs) o.visible = false;
        a.root.position.set(cage.x, walk.h(cage.x, cage.z), cage.z); a.root.rotation.y = Math.random() * 6.28; this.scene.add(a.root); a.play('Cry', 0);
        this.mahninCage = a; this.mahninNpc = b;
      } catch (e) { console.warn('ma hnin failed to load', e); }
    }
    if (MAP === 'ch1') void Promise.all(this.captives.map(async (c) => {                 // the other captives (the villagers): cowering in their cages (loads in the background)
      const boon = Game.CAPTIVE_BOON[c.camp]; if (!boon) return; const vc = Game.VILLAGER[boon], n = new Npc(vc.asset, vc.h);
      try { await n.load(import.meta.env.BASE_URL); if (this.freed.has(c.camp)) return; for (const o of c.objs) o.visible = false; n.root.position.set(c.x, walk.h(c.x, c.z), c.z); n.root.rotation.y = Math.random() * 6.28; this.scene.add(n.root); n.play('Cower', 0); this.caged.set(c.camp, n); }
      catch (e) { console.warn('captive failed to load', vc.asset, e); }
    }));
    await Promise.all(this.minions.map(async (m) => { m.settleHome(); m.useFx(this.fx, this.vfx.orb, this.vfx.ghostwave); try { await m.load(import.meta.env.BASE_URL); } catch (e) { console.warn('minion failed to load', e); } }));
    this.hero.rotation.y = this.facing;
    // main menu: Zaw Gyi seated on the broken seal pillar (the 'Throne' clip), shown until Start
    if (USE_3D_MENU) try { this.menu = new MainMenu(cloneSkinned(this.model!), gltf.animations.find((c) => /Throne$/.test(c.name)), import.meta.env.BASE_URL); this.menu.bindDrag(this.renderer.domElement, () => !this.started); } catch (e) { console.warn('menu scene failed', e); }
    onProgress(1);
  }

  private async dressStaff(): Promise<void> {
    if (!this.staff) return;
    const tl = new THREE.TextureLoader(); const base = import.meta.env.BASE_URL + 'assets/staff/';
    const load = async (f: string, srgb: boolean) => { const t = await tl.loadAsync(base + f); t.flipY = false; t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = 4; return t; };
    const [map, normalMap, metalnessMap, roughnessMap] = await Promise.all([load('color.jpg', true), load('normal.jpg', false), load('metal.jpg', false), load('rough.jpg', false)]);
    this.staff.material = new THREE.MeshStandardMaterial({ map, normalMap, metalnessMap, roughnessMap, metalness: 1, roughness: 1, envMapIntensity: 1.2 });
  }

  /** Pick the tip vertex (far end from the grip, which sits at the staff's local origin) and a trail base 30% down from it. */
  private measureStaff(): void {
    if (!this.staff) return; const g = this.staff.geometry; const pos = g.getAttribute('position') as THREE.BufferAttribute; g.computeBoundingBox(); const bb = g.boundingBox!;
    const size = bb.getSize(new THREE.Vector3()); const ax = size.x > size.y && size.x > size.z ? 0 : size.y > size.z ? 1 : 2;
    const hi = ax === 0 ? bb.max.x : ax === 1 ? bb.max.y : bb.max.z, lo = ax === 0 ? bb.min.x : ax === 1 ? bb.min.y : bb.min.z;
    const tipSign = Math.abs(hi) > Math.abs(lo) ? 1 : -1; const tipVal = tipSign > 0 ? hi : lo; const len = hi - lo; const baseVal = tipVal - tipSign * len * 0.3;
    let bt = -1, bb2 = 1e9;
    for (let i = 0; i < pos.count; i++) {
      const v = ax === 0 ? pos.getX(i) : ax === 1 ? pos.getY(i) : pos.getZ(i);
      const dt = Math.abs(v - tipVal); if (dt < bt || bt < 0) { bt = dt; this.tipIdx = i; }
      const db = Math.abs(v - baseVal); if (db < bb2) { bb2 = db; this.baseIdx = i; }
    }
  }

  /** Clip timing measured in Blender drives the combo: when the swing lands, how long it takes, how fast the legs travel. */
  private applyMeta(): void {
    const m = this.meta;
    if (m.Run?.stanceSpeed) RUN_CLIP_SPEED = m.Run.stanceSpeed;
    COMBO_CONFIG.steps.forEach((st, i) => {
      const c = m[st.clip]; if (!c || c.hitTime === undefined) return; const sp = c.speed; const last = i === COMBO_CONFIG.steps.length - 1;
      st.duration = c.duration / sp; st.hitStart = Math.max(0.05, c.hitTime / sp - 0.03); st.hitEnd = st.hitStart + (st.shockwave ? 0.17 : 0.14);
      st.chainFrom = !last ? Math.min(st.hitEnd + 0.06, st.duration - 0.08) : 99;   // the window must open before a fast swing ends
      st.lungeStart = Math.max(0, st.hitStart - 0.2); st.lungeEnd = st.hitStart + 0.04;
    });
  }

  private clipSpeed(name: string): number { return this.meta[name]?.speed ?? 1; }

  // ------------------------------------------------------------------ helpers
  private play(name: string, fade = 0.12, timeScale = 1, restart = false): void {
    const next = this.actions.get(name); if (!next) return;
    if (this.cur === next && !restart) { next.timeScale = timeScale; return; }
    next.reset(); next.timeScale = timeScale; next.setEffectiveWeight(1); next.play();
    if (this.cur && this.cur !== next) { fade > 0 ? this.cur.crossFadeTo(next, fade, false) : this.cur.stop(); }
    this.cur = next;
  }

  /** Test hook: steer in a world direction (x, z) instead of reading the controls. */
  moveOverride: [number, number] | null = null;
  private moveDir(): THREE.Vector2 {
    if (this.moveOverride) { const [x, z] = this.moveOverride, l = Math.hypot(x, z) || 1; return new THREE.Vector2(x / l, z / l); }
    const m = this.input.poll(); const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    return new THREE.Vector2(s * m.y - c * m.x, c * m.y + s * m.x);                    // screen up = (sin yaw, cos yaw), screen right = (-cos yaw, sin yaw)
  }

  private aimPoint(): THREE.Vector3 | null {
    const p = this.input.pointer; if (!p || this.input.touchMode) return null;
    this.raycaster.setFromCamera(new THREE.Vector2(p.x, p.y), this.camera); const out = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(this.ground, out) ? out : null;
  }

  private nearestEnemy(maxDist: number, refAngle: number | null, maxDiff: number): Foe | null {
    let best: Foe | null = null, bd = 1e9;
    for (const e of this.enemies) {
      if (e.dead) continue; const dx = e.pos.x - this.hero.position.x, dz = e.pos.z - this.hero.position.z, d = Math.hypot(dx, dz);
      if (d > maxDist) continue; if (refAngle !== null && Math.abs(wrap(Math.atan2(dx, dz) - refAngle)) > maxDiff) continue;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  // ------------------------------------------------------------------ combo events
  private onComboStart(step: ComboStep, index: number): void {
    this.state = 'attack'; this.hitSet.clear(); this.comboLabelT = 0.7;
    const mv = this.moveDir(); const moving = mv.length() > 0.25; const moveAng = Math.atan2(mv.x, mv.y);
    let ang = this.facing;
    if (this.input.touchMode) {
      const t = this.nearestEnemy(5, moving ? moveAng : this.facing, Math.PI * 0.6) ?? this.nearestEnemy(2.2, null, 0);
      if (t) ang = Math.atan2(t.pos.x - this.hero.position.x, t.pos.z - this.hero.position.z); else if (moving) ang = moveAng;
    } else {
      const ap = this.aimPoint(); if (ap) ang = Math.atan2(ap.x - this.hero.position.x, ap.z - this.hero.position.z); else if (moving) ang = moveAng;
      const t = this.nearestEnemy(3.5, ang, Math.PI * 0.2); if (t) ang = Math.atan2(t.pos.x - this.hero.position.x, t.pos.z - this.hero.position.z);
    }
    this.facing = ang; this.hero.rotation.y = ang;
    this.play(step.clip, 0.08, this.clipSpeed(step.clip) * this.st.as, true); sfx.swing(index);
  }

  /** Staff slash arc around the hero (lying flat at chest height, opening toward where he faces). */
  private slashFx(size: number, mirror: boolean, tilt = 0): void {
    if (!this.hfx.slash) return; const h = this.hero.position;
    this.fx.brighten(this.fx.planeFlip(this.hfx.slash, new THREE.Vector3(h.x, h.y + 1.0, h.z), size, 34, this.facing + Math.PI, tilt, mirror), 1.5);
  }
  /** Kick wind: the gust starts at his foot and rushes forward. */
  private windFx(size: number, y = 0.8): void {
    if (!this.hfx.wind) return; const f = new THREE.Vector3(Math.sin(this.facing), 0, Math.cos(this.facing)), h = this.hero.position;
    this.fx.brighten(this.fx.planeFlip(this.hfx.wind, new THREE.Vector3(h.x, h.y + y, h.z).addScaledVector(f, size * 0.42), size, 32, this.facing - Math.PI / 2, 0.25), 1.6);
  }
  private sparkFx(at: THREE.Vector3, heavy: boolean): void { if (this.hfx.spark) this.fx.flip(this.hfx.spark, at, heavy ? 2.6 : 1.8, 44); }
  /** A foe falls: cursed smoke rising from where it stood. */
  private deathFx(e: Foe): void { if (!this.hfx.death) return; const s = e instanceof Minion ? 3 : 5; this.fx.flip(this.hfx.death, e.pos.clone().setY(s * 0.4), s, 24, false, 0, this.scene, true); }

  private onComboImpact(step: ComboStep, index: number): void {
    if (index === 0) this.slashFx(5.6, false); else if (index === 1) this.slashFx(5.8, true, 0.35); else if (index === 2) { this.windFx(4.2); this.slashFx(5.2, false, 0.1); }
    if (!step.shockwave) return;
    const p = this.hero.position.clone().addScaledVector(new THREE.Vector3(Math.sin(this.facing), 0, Math.cos(this.facing)), 1.9);
    if (this.hfx.crack) this.fx.groundFlip(this.hfx.crack, p, 5.2, 24); else this.fx.ring(p, 0.4, 2.9, 0.35, 0xffd27a); this.fx.burst(p.clone().setY(0.2), 22, 4.5, 0xd9c7a0); this.fx.shake = Math.max(this.fx.shake, 0.5); sfx.slam();
    void index;
  }

  private applyHits(step: ComboStep, index: number): void {
    const hp = this.hero.position;
    for (const e of this.enemies) {
      if (e.dead || this.hitSet.has(e)) continue;
      const dx = e.pos.x - hp.x, dz = e.pos.z - hp.z, d = Math.hypot(dx, dz);
      if (d - e.radius > step.reach) continue;
      const tol = Math.asin(Math.min(1, e.radius / Math.max(d, e.radius))); const diff = Math.abs(wrap(Math.atan2(dx, dz) - this.facing));
      if (diff - tol > THREE.MathUtils.degToRad(step.arc / 2)) continue;
      this.hitSet.add(e); const heavy = index === COMBO_CONFIG.steps.length - 1; const nx = dx / Math.max(d, 0.001), nz = dz / Math.max(d, 0.001);
      const dl = this.dealt(step.damage, e); e.hurt(dl.dmg, nx, nz, step.knockback, heavy);
      if (index === 1 && e instanceof Minion && !e.dead) e.stun(0.5);                         // the Rising Cut staggers: a half-second stun
      const at = new THREE.Vector3(e.pos.x - nx * (e.radius * 0.7), e instanceof Boss ? 1.8 : 1.2, e.pos.z - nz * (e.radius * 0.7));
      this.sparkFx(at, heavy); this.fx.burst(at, heavy ? 12 : 6, heavy ? 5 : 3.6); this.fx.damageNumber(at.clone().setY(e instanceof Boss ? BOSS_HEIGHT * 0.8 : 1.9), dl.show, this.nk(dl, heavy));
      this.fx.shake = Math.max(this.fx.shake, step.shake * 5); this.hitStop = Math.max(this.hitStop, step.hitStop); sfx.hit(heavy);
      if (e.dead) { sfx.die(); this.fx.burst(at, 24, 4, 0x7fe3c8); }
    }
  }

  // ------------------------------------------------------------------ hero damage
  private enemyStrike(e: Enemy): void {
    const dx = this.hero.position.x - e.pos.x, dz = this.hero.position.z - e.pos.z, d = Math.hypot(dx, dz);
    if (d > 2.6) return; if (Math.abs(wrap(Math.atan2(dx, dz) - e.facing)) > THREE.MathUtils.degToRad(65)) return;
    this.tryHurtHero(e.pos.x, e.pos.z, atk('dummy'));
  }

  /** An attack reaches the hero: dodged while rolling or flipping, ignored while blinking after a hit or dead. */
  private tryHurtHero(fromX: number, fromZ: number, hit: Atk): boolean {
    if (this.state === 'dead') return false;
    if ((this.state === 'dash' && this.dashT < 0.3) ) { this.fx.damageNumber(this.hero.position.clone().setY(2.2), 'DODGE', 'big'); return false; }
    if (this.invuln > 0) return false;
    this.hurtHero(fromX, fromZ, hit); return true;
  }

  private hurtHero(fromX: number, fromZ: number, hit: Atk): void {
    if (this.sigil) { this.fx.kill(this.sigil, 0.2); this.sigil = null; }      // a hit breaks the seal
    const st = this.st, loss = Math.max(1, Math.round(mitigate(hit, st) * (this.veil ? 0.5 : 1))); this.hp = Math.max(0, this.hp - loss); this.sinceHit = 0;
    if (hit.slow && hit.slowT) { this.slowK = Math.max(this.slowT > 0 ? this.slowK : 0, hit.slow * (1 - st.slowRes)); this.slowT = Math.max(this.slowT, hit.slowT); }
    if (hit.root) this.rootT = Math.max(this.rootT, hit.root * (1 - st.statusRes));
    this.pendingSpell = null; this.spellMode = false; this.invuln = 1.0; this.combo.cancel();
    const dx = this.hero.position.x - fromX, dz = this.hero.position.z - fromZ, d = Math.max(0.001, Math.hypot(dx, dz)); this.vel.set((dx / d) * 5, (dz / d) * 5);
    sfx.hurt(); this.fx.shake = 0.7; this.hitStop = 0.08; this.fx.damageNumber(this.hero.position.clone().setY(2.2), '-' + loss, hit.type === 'magic' ? 'hurt magic' : hit.type === 'pure' ? 'hurt pure' : 'hurt');
    if (this.hp <= 0) { this.state = 'dead'; this.deadT = 0; this.invuln = 0; this.play('Death', 0.08, this.clipSpeed('Death'), true); sfx.die(); return; }
    this.state = 'hurt'; this.hurtT = 0.35; this.play('Hit', 0.05, this.clipSpeed('Hit'), true);
  }

  private revive(): void {
    this.clearSpells();
    this.slowT = 0; this.slowK = 0; this.rootT = 0;
    this.hp = this.maxHp; this.mp = this.maxMp; this.hero.position.copy(this.spawn); this.vel.set(0, 0); this.state = 'free'; this.invuln = 1.2; this.play('Idle', 0.2);
    this.fx.damageNumber(this.hero.position.clone().setY(2.4), 'Revived', 'big'); this.fx.ring(this.hero.position.clone().setY(0.1), 0.3, 2.5, 0.5, 0x7fe3c8);
  }

  // ------------------------------------------------------------------ skills
  private startSkill(id: SkillId, force = false): void {
    if (!force && id === 3 && !this.unlocked[id]) { this.fx.damageNumber(this.hero.position.clone().setY(2.4), 'LOCKED', ''); return; }
    if (this.cooldown[id] > 0 || !this.actions.has(SKILLS[id].clip)) return;
    if (this.mp < SKILL_MANA[id]) { this.fx.damageNumber(this.hero.position.clone().setY(2.4), 'NO MANA', ''); return; }
    this.mp -= SKILL_MANA[id];
    this.combo.cancel(); this.state = 'skill'; this.skillId = id; this.skillT = 0; this.skillFired = [false, false]; this.kickPhase = 0; this.cooldown[id] = SKILLS[id].cooldown * this.cdMul;
    const mv = this.moveDir(); const t = this.nearestEnemy(id === 1 ? ORB_RANGE : id === 4 ? CHAIN_RANGE : 4, null, 0);
    if (t) this.facing = Math.atan2(t.pos.x - this.hero.position.x, t.pos.z - this.hero.position.z);
    else if (mv.length() > 0.25) this.facing = Math.atan2(mv.x, mv.y);
    else if (!this.input.touchMode) { const ap = this.aimPoint(); if (ap) this.facing = Math.atan2(ap.x - this.hero.position.x, ap.z - this.hero.position.z); }
    this.hero.rotation.y = this.facing; this.play(SKILLS[id].clip, 0.08, this.clipSpeed(SKILLS[id].clip), true);
    if (id === 1 || id === 4) sfx.magic(); else if (id === 2) { sfx.magic(); this.openSigil(); } else sfx.swing(1);
  }

  /** Golden Seal: the sigil sheet lies on the floor under him, grows out from his palm and spins. */
  private openSigil(): void {
    if (this.sigil) this.fx.kill(this.sigil, 0.05);
    this.sigil = this.vfx.sigil ? this.fx.groundFlip(this.vfx.sigil, this.hero.position, 0.5, 16, true, 1.4) : null;
    if (!this.sigil) this.fx.ring(this.hero.position.clone(), 0.5, SEAL_RADIUS, 0.9, 0xffd27a);
  }

  /** Pick the chain: nearest foe in front (or anywhere close), then each next-nearest unhit foe within jump range of the last. */
  private castChain(): void {
    const hp = this.hero.position; const fwd = new THREE.Vector3(Math.sin(this.facing), 0, Math.cos(this.facing));
    const tip = hp.clone().addScaledVector(fwd, 1.1).setY(1.0); const hit = new Set<Foe>();
    let from = tip; let cur: Foe | null = this.nearestEnemy(CHAIN_RANGE, this.facing, Math.PI * 0.45) ?? this.nearestEnemy(CHAIN_RANGE, null, 0);
    this.fx.burst(tip.clone(), 14, 3.5, 0x8fd8ff); sfx.zap();
    if (!cur) { this.chainQueue.push({ at: this.simTime, from, foe: null, to: hp.clone().addScaledVector(fwd, 6).setY(0.1), dmg: 0 }); return; }
    for (let i = 0; i < CHAIN_MAX && cur; i++) {
      const to = new THREE.Vector3(cur.pos.x, cur instanceof Boss ? BOSS_HEIGHT * 0.55 : 1.2, cur.pos.z);
      this.chainQueue.push({ at: this.simTime + i * CHAIN_STEP, from: from.clone(), foe: cur, to, dmg: i === 0 ? 3 : 2 });
      hit.add(cur); from = to; const last: Foe = cur; cur = null; let bd = CHAIN_JUMP;
      for (const e of this.enemies) { if (e.dead || hit.has(e)) continue; const d = Math.hypot(e.pos.x - last.pos.x, e.pos.z - last.pos.z) - e.radius; if (d < bd) { bd = d; cur = e; } }
    }
  }

  private updateChain(): void {
    for (let i = this.chainQueue.length - 1; i >= 0; i--) {
      const c = this.chainQueue[i]; if (this.simTime < c.at) continue; this.chainQueue.splice(i, 1);
      if (this.vfx.lightning) this.fx.beam(this.vfx.lightning, c.from, c.to, 30); else this.fx.ring(c.to.clone().setY(0.1), 0.2, 1.2, 0.25, 0x8fd8ff);
      this.fx.burst(c.to.clone(), 16, 4.5, 0x8fd8ff); this.fx.shake = Math.max(this.fx.shake, 0.3); sfx.zap();
      const e = c.foe; if (!e || e.dead) continue;
      const dx = e.pos.x - c.from.x, dz = e.pos.z - c.from.z, d = Math.max(0.001, Math.hypot(dx, dz));
      const dl = this.dealt(c.dmg, e, 'magic'); e.hurt(dl.dmg, dx / d, dz / d, 0.4, false); this.hitStop = Math.max(this.hitStop, 0.04); sfx.hit(false);
      this.fx.damageNumber(c.to.clone().setY(e instanceof Boss ? BOSS_HEIGHT * 0.8 : 1.9), dl.show, this.nk(dl, true));
      if (e.dead) { sfx.die(); this.fx.burst(c.to.clone(), 24, 4, 0x7fe3c8); }
    }
  }

  private sealErupt(final: boolean): void {
    const c = this.hero.position.clone();
    this.areaHit(c, SEAL_RADIUS, 2, final ? 1.6 : 0.6, 0xffd27a);
    if (this.sigil) this.fx.brighten(this.sigil, final ? 2.4 : 1.8);
    if (this.vfx.impact) {
      this.fx.flip(this.vfx.impact, c.clone().setY(0.9), final ? 5.5 : 4.2, 30);
      for (let i = 0; i < 6; i++) {                                       // bursts around the rim of the circle
        const a = (i / 6) * Math.PI * 2 + (final ? Math.PI / 6 : 0);
        this.fx.flip(this.vfx.impact, c.clone().add(new THREE.Vector3(Math.sin(a), 0, Math.cos(a)).multiplyScalar(SEAL_RADIUS * 0.75)).setY(0.7), 2.2, 34);
      }
    }
  }

  private updateSkill(dt: number): void {
    this.vel.set(0, 0); this.skillT += dt;
    const clip = this.skillId === 3 ? KICKS[this.kickPhase].clip : SKILLS[this.skillId].clip;
    const m = this.meta[clip]; const sp = m?.speed ?? 1; const t1 = (m?.hitTime ?? 0.4) / sp, end = (m?.duration ?? 1) / sp;
    const t2 = m?.hit2Time !== undefined ? m.hit2Time / sp : -1;
    if (this.skillId === 3 && this.skillT < t1) this.vel.set(Math.sin(this.facing), Math.cos(this.facing)).multiplyScalar(1.6);   // step into the kick
    if (this.skillId === 2 && this.sigil) this.sigil.scale.setScalar(Math.min(1, this.skillT / 0.45) * SEAL_RADIUS * 2.15);       // the circle spreads out
    if (!this.skillFired[0] && this.skillT >= t1) {
      this.skillFired[0] = true;
      if (this.pendingSpell) { const f = this.pendingSpell; this.pendingSpell = null; f(); } else if (this.skillId === 1) this.fireOrb(); else if (this.skillId === 2) this.sealErupt(false); else if (this.skillId === 4) this.castChain(); else this.kickHit(KICKS[this.kickPhase]);
    }
    if (t2 > 0 && !this.skillFired[1] && this.skillT >= t2) { this.skillFired[1] = true; if (this.skillId === 2 && !this.spellMode) this.sealErupt(true); }
    if (this.skillT < end - 0.04) return;
    if (this.skillId === 2 && this.sigil) { this.fx.kill(this.sigil, 0.45); this.sigil = null; }
    if (this.skillId === 3 && this.kickPhase === 0) {                 // flow straight into the spinning kick, re-aimed at whoever is closest
      this.kickPhase = 1; this.skillT = 0; this.skillFired[0] = false;
      const t = this.nearestEnemy(4, null, 0); if (t) { this.facing = Math.atan2(t.pos.x - this.hero.position.x, t.pos.z - this.hero.position.z); this.hero.rotation.y = this.facing; }
      this.play(KICKS[1].clip, 0.06, this.clipSpeed(KICKS[1].clip), true); sfx.swing(2); return;
    }
    this.state = 'free'; this.spellMode = false; this.play('Idle', 0.15);
  }

  /** A kick lands: every foe inside the cone in front of him. */
  private kickHit(k: (typeof KICKS)[number]): void {
    const hp = this.hero.position; let any = false;
    for (const e of this.enemies) {
      if (e.dead) continue; const dx = e.pos.x - hp.x, dz = e.pos.z - hp.z, d = Math.hypot(dx, dz);
      if (d - e.radius > k.reach) continue;
      const tol = Math.asin(Math.min(1, e.radius / Math.max(d, e.radius))); if (Math.abs(wrap(Math.atan2(dx, dz) - this.facing)) - tol > THREE.MathUtils.degToRad(k.arc / 2)) continue;
      const nx = dx / Math.max(d, 0.001), nz = dz / Math.max(d, 0.001); const dl = this.dealt(k.dmg, e); e.hurt(dl.dmg, nx, nz, k.knock, k.dmg >= 3); any = true;
      const at = new THREE.Vector3(e.pos.x - nx * e.radius * 0.7, e instanceof Boss ? 1.8 : 1.1, e.pos.z - nz * e.radius * 0.7);
      this.sparkFx(at, true); this.fx.burst(at, 10, 4.5, 0x9be7ff); this.fx.damageNumber(at.clone().setY(e instanceof Boss ? BOSS_HEIGHT * 0.8 : 1.9), dl.show, this.nk(dl, true));
      if (e.dead) { sfx.die(); this.fx.burst(at, 24, 4, 0x7fe3c8); }
    }
    const front = hp.clone().add(new THREE.Vector3(Math.sin(this.facing), 0, Math.cos(this.facing)).multiplyScalar(1.3)).setY(0.1);
    if (this.hfx.wind) this.windFx(k.dmg >= 3 ? 5 : 4.2, k.dmg >= 3 ? 0.9 : 1.1); else this.fx.ring(front, 0.2, k.reach * 0.8, 0.25, 0x9be7ff);
    if (any) { sfx.hit(true); this.hitStop = Math.max(this.hitStop, k.dmg >= 3 ? 0.1 : 0.06); this.fx.shake = Math.max(this.fx.shake, k.dmg >= 3 ? 0.55 : 0.35); }
  }

  private fireOrb(): void {
    const g = new THREE.Group(); let sprite: THREE.Sprite | undefined;
    const dir = new THREE.Vector3(Math.sin(this.facing), 0, Math.cos(this.facing));
    g.position.copy(this.hero.position).addScaledVector(dir, 0.9); g.position.y = walk.h(g.position.x, g.position.z) + 1.25; this.scene.add(g);
    if (this.vfx.orb) {
      sprite = this.fx.flip(this.vfx.orb, new THREE.Vector3(), 1.9, 22, true, 3.2, g);                       // swirling seal orb
      if (this.vfx.impact) this.fx.flip(this.vfx.impact, g.position.clone().setY(1.25), 1.6, 48);                      // small flash at the palm
    } else {
      g.add(new THREE.Mesh(new THREE.SphereGeometry(0.26, 14, 10), new THREE.MeshBasicMaterial({ color: 0xfff1b0, toneMapped: false })));
      g.add(new THREE.Mesh(new THREE.SphereGeometry(0.55, 14, 10), new THREE.MeshBasicMaterial({ color: 0xffb02e, transparent: true, opacity: 0.38, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })));
    }
    this.orbs.push({ mesh: g, dir, dist: 0, sprite }); this.fx.burst(g.position.clone().setY(1.25), 12, 3.5, 0xffd27a);
  }

  private updateOrbs(dt: number): void {
    for (let i = this.orbs.length - 1; i >= 0; i--) {
      const o = this.orbs[i]; const step = ORB_SPEED * dt; o.dist += step; o.mesh.position.addScaledVector(o.dir, step);
      o.mesh.position.y += (walk.h(o.mesh.position.x, o.mesh.position.z) + 1.25 - o.mesh.position.y) * Math.min(1, dt * 12);
      if (!o.sprite) o.mesh.scale.setScalar(1 + Math.sin(this.simTime * 30) * 0.08);
      if (Math.random() < 0.8) this.fx.burst(o.mesh.position.clone().setY(1.25), 1, 1.2, 0xffc861);
      const hitFoe = this.enemies.find((e) => !e.dead && Math.hypot(e.pos.x - o.mesh.position.x, e.pos.z - o.mesh.position.z) < e.radius + 0.45);
      if (hitFoe || o.dist > ORB_RANGE) {
        this.fireAt(o.mesh.position, ORB_BLAST + 1.2);
        if (hitFoe) this.areaHit(o.mesh.position, ORB_BLAST, 3, 0.9, 0xffd27a);
        else this.fx.burst(o.mesh.position.clone().setY(1.25), 10, 2.5, 0xffd27a);
        if (this.vfx.impact) this.fx.flip(this.vfx.impact, o.mesh.position.clone().setY(1.25), hitFoe ? 4.4 : 2.4, 26);   // seal explosion, then embers
        if (o.sprite) this.fx.kill(o.sprite, 0.06);
        this.scene.remove(o.mesh); o.mesh.traverse((c) => { const mm = c as THREE.Mesh; if (mm.isMesh) { mm.geometry.dispose(); (mm.material as THREE.Material).dispose(); } });
        this.orbs.splice(i, 1);
      }
    }
  }

  /** Damage every foe within `radius` of `at` (ground distance, measured to their edge). */
  private areaHit(at: THREE.Vector3, radius: number, dmg: number, knock: number, color: number): void {
    const c = at.clone().setY(0.1); this.fx.ring(c, 0.3, radius, 0.35, color); this.fx.burst(at.clone().setY(1), 18, 4.5, color); this.fx.shake = Math.max(this.fx.shake, 0.45); sfx.slam();
    for (const e of this.enemies) {
      if (e.dead) continue; const dx = e.pos.x - at.x, dz = e.pos.z - at.z, d = Math.hypot(dx, dz);
      if (d - e.radius > radius) continue;
      const nx = d > 0.01 ? dx / d : Math.sin(this.facing), nz = d > 0.01 ? dz / d : Math.cos(this.facing);
      const dl = this.dealt(dmg, e, 'magic'); e.hurt(dl.dmg, nx, nz, knock, true); this.hitStop = Math.max(this.hitStop, 0.06); sfx.hit(true);
      this.fx.damageNumber(new THREE.Vector3(e.pos.x, e instanceof Boss ? BOSS_HEIGHT * 0.8 : 1.9, e.pos.z), dl.show, this.nk(dl, true));
      if (e.dead) { sfx.die(); this.fx.burst(e.pos.clone().setY(1.2), 24, 4, 0x7fe3c8); }
    }
  }

  reset(): void {
    this.slowT = 0; this.slowK = 0; this.rootT = 0; this.sinceHit = 99;
    this.hp = this.maxHp; this.mp = this.maxMp; this.hero.position.copy(this.spawn); this.vel.set(0, 0); this.state = 'free'; this.combo.cancel(); this.invuln = 0; this.facing = this.spawnFacing; this.hero.rotation.y = this.facing;
    for (const e of this.enemies) e.respawn(); this.play('Idle', 0.1);
    this.clearSpells();
    this.cooldown[1] = 0; this.cooldown[2] = 0; this.cooldown[3] = 0; this.cooldown[4] = 0; this.chainQueue = []; if (this.sigil) { this.fx.kill(this.sigil, 0.01); this.sigil = null; } for (const o of this.orbs) { if (o.sprite) this.fx.kill(o.sprite, 0.01); this.scene.remove(o.mesh); } this.orbs = [];
  }

  // ------------------------------------------------------------------ save and continue (Chapter 1, in this browser's localStorage)
  static readonly SAVE_KEY = 'zg.save.ch1';
  /** Is there a saved Chapter 1 game to continue? */
  static hasSave(): boolean { try { return JSON.parse(localStorage.getItem(Game.SAVE_KEY) ?? 'null')?.v === 1; } catch { return false; } }
  static clearSave(): void { localStorage.removeItem(Game.SAVE_KEY); }
  private saveT = 0; private saveCheckT = 0; private saveSig = ''; private saveEl: HTMLDivElement | null = null;
  /** Everything that is progress (not where he stands): a change here is worth saving straight away. */
  private progress() {
    const idx = <T>(a: T[], f: (x: T) => boolean) => a.map((x, i) => (f(x) ? i : -1)).filter((i) => i >= 0);
    return { level: this.level, points: this.points, attrs: { ...this.attrs }, souls: Math.floor(this.souls?.count ?? 0), relics: [...this.relics], equipped: [...this.equipped], boons: [...this.boons],
      elements: { ...this.elements }, unlocked: { ...this.unlocked }, quest: this.quest.enabled, downs: [...this.downs], shards: [...this.shardsTaken], kingDown: this.kingDown,
      mahninFreed: this.mahninFreed, metMahnin: this.metMahnin, freed: [...this.freed], garden: this.gardenDone,
      shrines: SHRINES.filter((q) => q.awake).map((q) => q.id), steles: idx(STELES, (q) => q.read), brambles: idx(BRAMBLES, (b) => b.burnt), loot: idx(LOOT, (l) => l.opened), frags: idx(FRAGMENTS, (f) => f.taken),
      scenes: [...this.storySeen], barrierUp: this.barrierUp, gateOpened: this.gateOpened, chapterDone: this.chapterDone,
      spots: SPOTS.filter((s) => s.done).map((s) => s.id), side: [...this.sideDone] };
  }
  /** Write the save now (and flash a small "Saved"). */
  saveGame(quiet = false): void {
    if (MAP !== 'ch1' || !this.started || this.state === 'dead') return; const p = this.progress(); const h = this.hero.position;
    try { localStorage.setItem(Game.SAVE_KEY, JSON.stringify({ v: 1, grown: 1, at: Date.now(), ...p, pos: [+h.x.toFixed(2), +h.z.toFixed(2)], facing: +this.facing.toFixed(2), hp: Math.round(this.hp), mp: Math.round(this.mp) })); } catch { return; }
    this.saveSig = JSON.stringify(p); this.saveT = 0;
    if (!quiet) { if (!this.saveEl) { this.saveEl = document.createElement('div'); this.saveEl.id = 'saved'; this.saveEl.textContent = 'SAVED'; document.body.appendChild(this.saveEl); } this.saveEl.classList.remove('show'); void this.saveEl.offsetWidth; this.saveEl.classList.add('show'); }
  }
  /** Saves when progress changes (checked every 3 s) and every 20 s for where he stands. */
  private autosave(dt: number): void {
    this.saveT += dt; this.saveCheckT += dt; if (this.saveCheckT < 3) return; this.saveCheckT = 0;
    if (JSON.stringify(this.progress()) !== this.saveSig) this.saveGame(); else if (this.saveT > 20) this.saveGame(true);
  }
  /** Start from the save: progress, the world as he left it (beaten foes stay down, opened chests stay open), and where he stood. */
  continueGame(): boolean {
    let d: any = null; try { d = JSON.parse(localStorage.getItem(Game.SAVE_KEY) ?? 'null'); } catch { d = null; } if (MAP !== 'ch1' || d?.v !== 1) return false;
    for (const s of d.scenes ?? []) this.storySeen.add(s);
    this.start(); if (d.quest) this.enableQuest();
    this.level = d.level; this.points = d.points; Object.assign(this.attrs, d.attrs); this.relics = [...d.relics]; this.equipped = [...d.equipped]; this.boons = [...d.boons];
    Object.assign(this.elements, d.elements); this.elKey = ''; Object.assign(this.unlocked, d.unlocked); this.kingDown = !!d.kingDown;
    if (this.souls) { this.souls.count = d.souls; this.souls.level = this.level; }
    for (const s of d.shards) this.shardsTaken.add(s); for (const s of d.downs) this.downs.add(s);
    const elite = (k: string) => this.elites.find((m) => m.kind === k);
    const foes: Record<string, Foe | null | undefined> = { warden: this.boss, king: this.undeadKing, necro: this.necro, naga: this.hydra, abbot: this.abbot, chief: elite('chief'), commander: elite('commander'), banshee: elite('banshee') };
    for (const id of new Set<string>([...d.downs, ...d.shards])) {                           // beaten foes go down again, quietly: no souls, no relics (already counted)
      const e = foes[id]; if (!e || e.dead) continue; this.deadSeen.add(e); e.hurt(1e9, 0, 1, 0, false);
      if (!e.dead) { (e as { dead: boolean }).dead = true; e.root.visible = false; }
    }
    this.applyStats(); this.barrierUp = !!d.barrierUp; this.setSealed?.(this.barrierUp);
    if (d.gateOpened) { this.gateOpened = true; this.worldOpenGate?.(); } this.chapterDone = !!d.chapterDone;
    if (d.mahninFreed && !this.mahninFreed) { this.mahninFreed = true; const cage = this.mahninCage0; if (cage) for (const o of cage.objs) o.visible = false; if (this.mahninCage) this.mahninCage.root.visible = false; this.spawnMahnin(); }
    this.metMahnin = !!d.metMahnin; this.gardenDone = !!d.garden;
    for (const camp of d.freed) this.homeVillager(camp);
    for (const q of SHRINES) q.awake = d.shrines.includes(q.id); STELES.forEach((q, i) => { q.read = d.steles.includes(i); });
    BRAMBLES.forEach((b, i) => { if (d.brambles.includes(i) && !b.burnt) burnBrambles(b.x, b.z, 0); });
    LOOT.forEach((l, i) => { if (d.loot.includes(i)) { l.opened = true; if (l.glow) l.glow.visible = false; } });
    FRAGMENTS.forEach((f, i) => { if (d.frags.includes(i)) { f.taken = true; if (f.obj) f.obj.visible = false; } }); this.fragments = d.frags.length;
    restoreSpots(d.spots ?? []); for (const q of d.side ?? []) this.sideDone.add(q);
    const [px, pz] = d.grown ? [d.pos[0], d.pos[1]] : growCh1(d.pos[0], d.pos[1]);       // a save from before the valley grew
    this.teleport(px, pz, d.facing); this.hp = Math.min(this.maxHp, Math.max(1, d.hp)); this.mp = Math.min(this.maxMp, d.mp);
    this.saveSig = JSON.stringify(this.progress()); this.saveT = 0;
    return true;
  }

  // ------------------------------------------------------------------ frame
  start(): void { this.started = true; this.lastTime = 0; this.input.clear(); if (this.storyOn) this.enableQuest(); void this.playScene('prologue'); }

  /** Test hook: press attack / dash without a device. */
  pressAttack(): void { this.input.attackPressed = true; }
  pressDash(): void { this.input.dashPressed = true; }
  pressSkill(id: SkillId): void { if (id === 1) this.input.skill1Pressed = true; else if (id === 2) this.input.skill2Pressed = true; else if (id === 3) this.input.skill3Pressed = true; else this.input.skill4Pressed = true; }

  snapshot(): Record<string, unknown> {
    return { state: this.state, hp: this.hp, combo: { active: this.combo.active, index: this.combo.index, t: +this.combo.t.toFixed(3) }, pos: [+this.hero.position.x.toFixed(2), +this.hero.position.z.toFixed(2)], facing: +this.facing.toFixed(2),
      enemies: this.enemies.map((e) => ({ kind: e.kind, hp: e.hp, dead: e.dead, state: e.state })), fps: Math.round(this.fps), clip: [...this.actions.entries()].find(([, a]) => a === this.cur)?.[0] ?? null, started: this.started, cooldown: { ...this.cooldown }, orbs: this.orbs.length, mp: this.mp, maxMp: this.maxMp, elements: { ...this.elements }, loadout: [...this.loadout], held: [...this.held], slots: [...this.slots], walls: this.walls.length, fragments: this.fragments, chests: LOOT.filter((l) => l.opened).length, air: { on: this.airborne, y: +this.jumpY.toFixed(3), jumps: this.airJumps }, level: this.level, points: this.points, attrs: { ...this.attrs }, stats: this.st, boons: [...this.boons], villagers: this.villagers.length, shrines: SHRINES.filter((q) => q.awake).length, relics: [...this.relics], equipped: [...this.equipped], slow: this.slowT > 0 ? +this.slowK.toFixed(3) : 0, root: +this.rootT.toFixed(2),
      boss: { hp: this.boss.hp, state: this.boss.state, enraged: this.boss.enraged, loaded: this.boss.loaded, pos: [+this.boss.pos.x.toFixed(2), +this.boss.pos.z.toFixed(2)] },
      hydra: this.hydra ? { hp: this.hydra.hp, state: this.hydra.state, loaded: this.hydra.loaded, enraged: this.hydra.enraged, pos: [+this.hydra.pos.x.toFixed(2), +this.hydra.pos.z.toFixed(2)] } : null, chapterDone: this.chapterDone, souls: Math.floor(this.souls?.count ?? 0), quest: { on: this.quest.enabled, step: this.quest.state.step, shards: this.shardCount(), mahnin: this.mahninFreed, barrier: this.barrierUp, unlocked: { ...this.unlocked }, maxHp: this.maxHp },
      minions: this.minions.map((m) => ({ kind: m.kind, hp: m.hp, state: m.state, loaded: m.loaded, pos: [+m.pos.x.toFixed(2), +m.pos.z.toFixed(2)] })),
      necro: this.necro ? { hp: this.necro.hp, state: this.necro.state, loaded: this.necro.loaded, pos: [+this.necro.pos.x.toFixed(2), +this.necro.pos.z.toFixed(2)] } : null };
  }

  run(): void { this.renderer.setAnimationLoop((t) => this.frame(t)); }

  /** Test hooks. */
  setManual(on: boolean): void { this.manual = on; this.lastTime = 0; }
  advance(seconds: number, step = 1 / 60): void {
    let left = seconds; while (left > 1e-6) { const d = Math.min(step, left); this.tick(d); left -= d; } this.renderFrame();
  }
  teleport(x: number, z: number, facing?: number): void { this.airborne = false; this.jumpY = 0; this.flipT = -1; if (this.model) this.model.position.set(0, 0, 0); this.lastGround.set(x, z); if (this.model) this.model.rotation.x = 0; this.hero.position.set(x, walk.h(x, z), z); if (facing !== undefined) { this.facing = facing; this.hero.rotation.y = facing; } this.camTarget.copy(this.hero.position).setY(1.0); }
  zoomTo(i: number): void { this.zoom = i; this.camDist = ZOOMS[i]; }

  /** Frame cap: 60 by default (smooth, cooler, kinder to the battery on 120 Hz phones); 0 = as fast as the screen. */
  fpsCap = localStorage.getItem('zg.fps120') === '1' ? 0 : 60; private lastFrame = 0; private distHidden = new Set<THREE.Object3D>();
  private frame(now: number): void {
    if (this.fpsCap && this.lastFrame && now - this.lastFrame < 1000 / this.fpsCap - 2) return;                  // 120 Hz screen, 60 fps game: every other refresh
    this.lastFrame = now;
    if (!this.started && this.menu) { const d = Math.min(0.05, this.lastTime ? (now - this.lastTime) / 1000 : 0.016); this.lastTime = now; this.menu.render(this.renderer, d); return; }   // main menu backdrop
    if (this.bigmap?.isOpen) { this.bigmap.draw(); this.lastTime = now; return; }          // the world map is open: the game is paused
    if (this.altar?.isOpen || this.paused) { this.lastTime = now; return; }                              // the altar menu: paused
    if (this.dialogue.isOpen) { this.renderFrame(); this.lastTime = now; return; }   // a story scene: paused
    if (this.manual) { this.renderFrame(); return; }
    const rawDt = Math.min(0.05, this.lastTime ? (now - this.lastTime) / 1000 : 0.016); this.lastTime = now;
    this.fpsAcc += rawDt; this.fpsCount++; if (this.fpsAcc >= 0.5) { this.fps = this.fpsCount / this.fpsAcc; this.fpsAcc = 0; this.fpsCount = 0; this.adaptQuality(); }
    this.tick(rawDt); this.renderFrame();
  }

  /** If the device cannot hold 30 fps for two seconds, lower the render resolution, then turn shadows off. */
  private slowFrames = 0;
  private adaptQuality(): void {
    if (!this.started) return;
    // aim for a steady frame rate: below ~50 (of a 60 cap) for 2 s, drop the render resolution a step (never under 1.0); very slow: shadows off
    const want = this.fpsCap ? this.fpsCap * 0.84 : 50; this.slowFrames = this.fps < want ? this.slowFrames + 1 : 0;
    if (this.slowFrames < 4) return;
    this.slowFrames = 0;
    if (this.atmo?.degrade()) return;                                                    // shed bloom, then grass, then grading first
    const pr = this.renderer.getPixelRatio();
    if (pr > 1.0) { this.renderer.setPixelRatio(Math.max(1.0, pr - 0.15)); this.resize(); }
    else if (this.fps >= 28) return;
    else if (this.renderer.shadowMap.enabled) {
      this.renderer.shadowMap.enabled = false; this.sun.castShadow = false;
      this.scene.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.Material | undefined; if (m) m.needsUpdate = true; });
    }
  }

  private bossHooks = {
    hitHero: (x: number, z: number, heavy: boolean, a?: Atk) => this.tryHurtHero(x, z, a ?? { dmg: heavy ? 190 : 95, type: 'phys' }),
    ring: (p: THREE.Vector3, r0: number, r1: number, dur: number, color: number) => this.fx.ring(p, r0, r1, dur, color),
    burst: (p: THREE.Vector3, n: number, power: number, color: number) => this.fx.burst(p, n, power, color),
    shake: (a: number) => { this.fx.shake = Math.max(this.fx.shake, a); },
    sound: (n: 'slam' | 'warn' | 'roar' | 'die') => sfx[n](),
  };

  /** The Drowned Abbot: the Sunken Monastery's side boss (no shard; he carries the Drowned Prayer Beads). */
  abbot: Minion | null = null;
  private eliteBarWasOn = false;
  /** The four Curse Shard holders, in story order. */
  private holders(): Array<{ id: string; label: string; dead: boolean; x: number; z: number }> {
    const h = (id: string, label: string, m: { dead: boolean; pos: THREE.Vector3 } | null | undefined) => ({ id, label, dead: !!m?.dead || this.shardsTaken.has(id), x: m?.pos.x ?? 0, z: m?.pos.z ?? 0 });
    return [h('chief', 'the Goblin Chief (south, past the river bend)', this.elites.find((m) => m.kind === 'chief')), h('necro', 'the Necromancer (north)', this.necro),
      h('commander', 'the Undead Commander (north-east)', this.elites.find((m) => m.kind === 'commander')), h('banshee', 'the Weeping Maid (far south-east, at the Weeping Pool)', this.elites.find((m) => m.kind === 'banshee'))];
  }
  /** A shard is taken the first time its holder falls (they respawn, the shard stays taken). */
  private shardsTaken = new Set<string>();
  /** The Naga in the water: one scripted glimpse after each act (once each, saved with the scenes), then a rare pass every 1.5-2.5
   *  minutes whenever he is near water, until he faces it at the lair. Never in a fight. */
  private updateGlimpses(dt: number): void {
    const sw = this.swimmer; if (!sw) return; sw.update(dt, this.hero.position);
    if ((this.downs.has('naga') || this.hydra?.dead) && !this.storySeen.has('naga_leaves')) { this.storySeen.add('naga_leaves'); sw.leave('north'); }   // spared: it goes, down the north stream
    if (this.downs.has('naga') || this.hydra?.dead || this.hydra?.barActive) { sw.stop(); return; }
    if (sw.active || !this.storyOn || this.dialogue.isOpen) return;
    const fight = this.minions.some((m) => !m.dead && m.state !== 'idle' && m.state !== 'return' && m.pos.distanceTo(this.hero.position) < 18);
    if (fight) return;
    const done = (k: string) => this.downs.has(k) || this.shardsTaken.has(k), hx = this.hero.position.x, hz = this.hero.position.z;
    const STAGES: Array<[string, string, GlimpseKind, string]> = [
      ['king', 'glimpse1', 'shadow', 'Something long slid under the water.'], ['chief', 'glimpse2', 'coils', 'Coils broke the surface, and were gone.'],
      ['necro', 'glimpse3', 'eyes', 'Two red eyes, watching from the water.'], ['commander', 'glimpse4', 'roar', 'The Naga. It knows you are coming.'],
      ['banshee', 'glimpse5', 'rise', 'It rose, looked at you, and sank.']];
    // the newest act's glimpse waits for him by the water; one he missed (two acts with no water between) is passed over, never doubled up
    let top = -1; STAGES.forEach(([need], i) => { if (done(need)) top = i; });
    if (top >= 0 && !this.storySeen.has(STAGES[top][1])) {
      const [, key, kind, line] = STAGES[top];
      if (sw.glimpse(kind, hx, hz, 34)) { for (let i = 0; i <= top; i++) this.storySeen.add(STAGES[i][1]); this.fx.damageNumber(this.hero.position.clone().setY(2.6), line, 'big'); this.glimpseT = Math.max(this.glimpseT, 90); }
      return;
    }
    if (!done('king')) return;
    this.glimpseT -= dt; if (this.glimpseT > 0) return;
    this.glimpseT = sw.glimpse(Math.random() < 0.7 ? 'shadow' : 'coils', hx, hz, 22) ? 90 + Math.random() * 60 : 4;
  }
  /** Test hook: an element reaches (x, z) as if a spell landed there. */
  elementAt(el: El, x: number, z: number): number { const s = elementReached(el, x, z, 2); for (const q of s) this.spotAnswered(q, el); return s.length; }
  /** Test hook: start a glimpse of the given kind in the water nearest the hero. */
  glimpse(kind: GlimpseKind): boolean { return !!this.swimmer?.glimpse(kind, this.hero.position.x, this.hero.position.z, 40); }
  shardCount(): number { for (const h of this.holders()) if (h.dead) this.shardsTaken.add(h.id); return this.shardsTaken.size; }
  /** Story foes beaten (remembered, so the quest never goes backwards), and whether he has met Ma Hnin at her altar. */
  private downs = new Set<string>(); private metMahnin = false;
  /** The Naga glimpsed in the rivers and streams before the lair (src/swimmer.ts). */
  private swimmer: NagaSwimmer | null = null; private glimpseT = 100;
  /** Ma Hnin, freed: she waits on the Shrine terrace, looking around (a glowing stand-in if her model failed to load). */
  private spawnMahnin(): void {
    if (this.mahninNpc) { const n = this.mahninNpc; n.root.position.set(CH1.mahnin.x, walk.h(CH1.mahnin.x, CH1.mahnin.z), CH1.mahnin.z); this.scene.add(n.root); n.play('Idle', 0); this.mahninFig = n.root; return; }
    const g = new THREE.Group(); const mat = new THREE.MeshStandardMaterial({ color: 0xf4e4d8, roughness: 0.8, emissive: 0xffd8b0, emissiveIntensity: 0.35 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.9, 4, 10), mat); body.position.y = 0.75; g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 8), mat); head.position.y = 1.55; g.add(head);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xffd8a0, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending })); glow.position.y = 1.1; glow.scale.set(1.6, 2.4, 1); g.add(glow);
    g.position.set(CH1.mahnin.x, walk.h(CH1.mahnin.x, CH1.mahnin.z), CH1.mahnin.z); this.scene.add(g); this.mahninFig = g;
  }
  private mini = document.getElementById('minimap') as HTMLCanvasElement | null;
  /** The full-screen world map (Chapter 1 only): opened from the minimap or with M. */
  private setupBigMap(): void {
    if (MAP !== 'ch1' || this.bigmap) return;
    const labels: MapMarker[] = [...CH1.regions.map((r): MapMarker => ({ x: r.x, z: r.z, kind: 'label', text: r.name }))];
    this.bigmap = new BigMap({
      get canvas() { return ch1Map.canvas; }, toPx: (x, z) => ch1Map.toPx(x, z),
      hero: () => ({ x: this.hero.position.x, z: this.hero.position.z, facing: this.facing }),
      markers: () => [
        ...labels,
        ...CH1.camps.map((c, i): MapMarker => ({ x: c.x, z: c.z, kind: c.members.includes('archer') ? 'archers' : 'camp', dead: this.campPacks[i]?.every((m) => m.dead) })),
        ...(this.necro ? [{ x: this.necro.pos.x, z: this.necro.pos.z, kind: 'necro', text: 'Necromancer', dead: this.necro.dead } as MapMarker] : []),
        { x: this.boss.pos.x, z: this.boss.pos.z, kind: 'guardian', text: 'Temple Guardian', dead: this.boss.dead },
        ...(this.undeadKing ? [{ x: this.undeadKing.pos.x, z: this.undeadKing.pos.z, kind: 'guardian', text: 'Undead King', dead: this.undeadKing.dead } as MapMarker] : []),
        ...(this.hydra ? [{ x: this.hydra.pos.x, z: this.hydra.pos.z, kind: 'dragon', text: 'Naga Dragon', dead: this.hydra.dead } as MapMarker] : []),
        { x: CH1.treasure.x, z: CH1.treasure.z, kind: 'treasure' },
        ...(this.quest.enabled && this.quest.state.target ? [{ x: this.quest.state.target.x, z: this.quest.state.target.z, kind: 'quest', text: this.quest.state.text } as MapMarker] : []),
      ],
    }, (open) => { if (!open) this.lastTime = 0; this.input.endFrame(); });
    this.mini?.addEventListener('click', () => this.bigmap?.open());
    this.mini?.addEventListener('touchend', (e) => { e.preventDefault(); this.bigmap?.open(); });
  }
  private miniFrame = 0;
  /** Minimap (Chapter 1): ~80 m around the hero, north up; hero arrow, enemies as dots. */
  private drawMinimap(): void {
    const cv = this.mini, src = ch1Map.canvas; if (!cv || !src || MAP !== 'ch1') return;
    cv.classList.add('on'); this.setupBigMap(); if (this.miniFrame++ % 2) return;
    const g = cv.getContext('2d')!; const W = cv.width, SPAN = 160, k = W / SPAN;               // 160 cells = 80 m across
    const [hx, hy] = ch1Map.toPx(this.hero.position.x, this.hero.position.z);
    g.save(); g.clearRect(0, 0, W, W); g.beginPath(); g.arc(W / 2, W / 2, W / 2, 0, 7); g.clip();
    g.fillStyle = '#0e0e14'; g.fillRect(0, 0, W, W); g.imageSmoothingEnabled = false;
    g.drawImage(src, hx - SPAN / 2, hy - SPAN / 2, SPAN, SPAN, 0, 0, W, W);
    const dot = (x: number, z: number, r: number, col: string) => { const [px, py] = ch1Map.toPx(x, z); const sx = W / 2 + (px - hx) * k, sy = W / 2 + (py - hy) * k; g.fillStyle = col; g.beginPath(); g.arc(sx, sy, r, 0, 7); g.fill(); g.strokeStyle = '#000'; g.lineWidth = 1; g.stroke(); };
    for (const e of this.enemies) { if (e.dead) continue; dot(e.pos.x, e.pos.z, e instanceof Boss || e instanceof Hydra ? 6 : e instanceof Necro ? 4.5 : 3, e instanceof Hydra ? '#ff2050' : e instanceof Boss ? '#ff4a2a' : e instanceof Necro ? '#b04cff' : e instanceof Minion ? ({ ghoul: '#e0704a', sword: '#f0c040', lance: '#f0a020', caster: '#d090ff', ghost: '#bfe8ff', archer: '#8ad060' } as Record<string, string>)[e.kind] : '#d8d8d8'); }
    { const [px, py] = ch1Map.toPx(CH1.treasure.x, CH1.treasure.z); const sx = W / 2 + (px - hx) * k, sy = W / 2 + (py - hy) * k; g.fillStyle = '#ffd040'; g.font = 'bold 13px serif'; g.fillText('★', sx - 6, sy + 5); }
    const qt = this.quest.enabled ? this.quest.state.target : null;
    if (qt) {
      const [px, py] = ch1Map.toPx(qt.x, qt.z); let sx = (px - hx) * k, sy = (py - hy) * k; const d = Math.hypot(sx, sy), R = W / 2 - 9; if (d > R) { sx *= R / d; sy *= R / d; }
      const pulse = 5 + Math.sin(this.simTime * 5) * 1.2; g.fillStyle = '#ffe070'; g.strokeStyle = '#000'; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(W / 2 + sx, W / 2 + sy - pulse); g.lineTo(W / 2 + sx + pulse, W / 2 + sy); g.lineTo(W / 2 + sx, W / 2 + sy + pulse); g.lineTo(W / 2 + sx - pulse, W / 2 + sy); g.closePath(); g.fill(); g.stroke();
    }
    g.translate(W / 2, W / 2); g.rotate(-this.facing + Math.PI);                                   // facing 0 = north = up; +x is west (left)
    g.fillStyle = '#ffd36a'; g.strokeStyle = '#000'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(0, 7); g.lineTo(-5, -5); g.lineTo(0, -2); g.lineTo(5, -5); g.closePath(); g.fill(); g.stroke();
    g.restore();
  }

  private tick(rawDt: number): void {
    this.simTime += rawDt; const now = this.simTime * 1000;
    let dt = rawDt; if (this.hitStop > 0) { this.hitStop = Math.max(0, this.hitStop - rawDt); dt = rawDt * 0.04; }
    if (this.input.zoomPressed) { this.zoom = (this.zoom + 1) % ZOOMS.length; }
    if (this.input.resetPressed && this.started) this.reset();
    if (this.started) this.updateHero(dt, rawDt);
    this.mixer?.update(dt);
    if (this.model && this.state === 'free') { const br = Math.sin(this.simTime * 2.2) * 0.004; this.model.scale.set(HERO_SCALE * (1 - br * 0.5), HERO_SCALE * (1 + br), HERO_SCALE * (1 - br * 0.5)); }
    // elites (Undead King, shard holders) own the boss bar while they fight
    const necroOn = MAP === 'ch1' && this.necro && this.necro.loaded && !this.necro.dead && this.necro.state !== 'guard' && this.necro.state !== 'return' && Math.hypot(this.necro.pos.x - this.hero.position.x, this.necro.pos.z - this.hero.position.z) < 30;
    const elite: { hp: number; maxHp: number; title?: string } | undefined = MAP === 'ch1' ? ([this.undeadKing, this.abbot, ...this.elites].find((m) => m && m.loaded && !m.dead && m.state !== 'idle' && m.state !== 'return' && Math.hypot(m.pos.x - this.hero.position.x, m.pos.z - this.hero.position.z) < 30) ?? (necroOn ? { hp: this.necro!.hp, maxHp: this.necro!.maxHp, title: 'The Necromancer' } : undefined)) : undefined;
    Boss.yieldBar = !!this.hydra?.barActive || !!elite;
    if (elite && !this.hydra?.barActive) {
      const bar = document.getElementById('boss-bar'), fill = document.getElementById('boss-fill'), nm = document.querySelector('#boss-bar .name');
      bar?.classList.add('show'); bar?.classList.remove('enraged'); if (fill) fill.style.width = `${(100 * elite.hp) / elite.maxHp}%`; setBossHp(elite.hp, elite.maxHp); if (nm) nm.textContent = (elite.title ?? '').toUpperCase();
    } else if (!this.hydra?.barActive && Boss.yieldBar === false && this.eliteBarWasOn) document.getElementById('boss-bar')?.classList.remove('show');
    this.eliteBarWasOn = !!elite;
    if (this.started && !this.chapterDone) sfx.music(this.hydra?.barActive || elite || this.enemies.some((e) => (e instanceof Boss || e instanceof Necro) && !e.dead && (e as any).state !== 'idle' && (e as any).state !== 'dormant' && (e as any).state !== 'guard' && (e as any).state !== 'return' && e.pos.distanceTo(this.hero.position) < 25) ? 'boss' : 'explore');
    for (const e of this.enemies) {
      if (e instanceof Boss || e instanceof Necro || e instanceof Hydra) e.update(dt, this.hero.position, this.bossHooks);
      else if (e instanceof Minion) { const d = Math.hypot(e.pos.x - this.hero.position.x, e.pos.z - this.hero.position.z); e.update(dt, this.hero.position, this.bossHooks, d < 45, d < 60); }
      else e.update(dt, this.hero.position, this.camera, (en) => this.enemyStrike(en), () => sfx.warn());
    }
    // far-away bosses and story characters are skinned (never frustum-culled): hide them beyond 70 m so they cost nothing
    for (const o of [this.boss, this.necro, this.hydra, this.undeadKing, this.mahninCage, this.mahninNpc, ...this.caged.values(), ...this.villagers.map((v) => v.npc)]) {
      const root = (o as { root?: THREE.Object3D } | null)?.root; if (!root) continue;
      const far = Math.hypot(root.position.x - this.hero.position.x, root.position.z - this.hero.position.z) > 70;
      if (far && root.visible) { root.visible = false; this.distHidden.add(root); } else if (!far && this.distHidden.has(root)) { root.visible = true; this.distHidden.delete(root); }
    }
    ch1Focus.value.copy(this.hero.position);
    if (MAP === 'ch1') {                                                                     // story beats: each boss's fall changes what he knows
      if (this.boss.dead) void this.playScene('guardian');
      if (this.undeadKing?.dead) void this.playScene('king');
      if (this.necro?.dead) void this.playScene('necro');
      if (this.hydra?.dead) void this.playScene('naga');
      const holder = (k: string) => this.elites.find((m) => m.kind === k);
      if (holder('chief')?.dead) void this.playScene('goblin');
      if (holder('commander')?.dead) void this.playScene('commander');
      if (holder('banshee')?.dead) void this.playScene('maid');
      if (this.abbot?.dead) void this.playScene('abbot');                                      // the side boss: U Lar Ba's chief disciple
      const hx = this.hero.position.x, hz = this.hero.position.z;
      if (Math.hypot(hx - CH1.orders.x, hz - CH1.orders.z) < 3.2) void this.playScene('orders');
      // Ma Hnin: once the Goblin Chief falls, walk up to the cage to free her; she then waits on the Shrine terrace
      const cage = this.mahninCage0;
      if (!this.mahninFreed && cage && holder('chief')?.dead && Math.hypot(hx - cage.x, hz - cage.z) < 3.6) {
        this.mahninFreed = true; for (const o of cage.objs) o.visible = false; if (this.mahninCage) this.mahninCage.root.visible = false; this.fx.burst(new THREE.Vector3(cage.x, 1, cage.z), 20, 3, 0xffd8a0);
        this.spawnMahnin(); void this.playScene('mahnin');
      }
      if (this.mahninFig && Math.hypot(hx - CH1.mahnin.x, hz - CH1.mahnin.z) < 2.8) {
        if (!this.storySeen.has('mahnin_talk')) void this.playScene('mahnin_talk');                        // between the acts she has something to say about where he has been
        else for (const [k2, sc] of [['necro', 'mahnin_necro'], ['commander', 'mahnin_commander'], ['banshee', 'mahnin_maid']] as const) if (this.shardsTaken.has(k2) && !this.storySeen.has(sc)) { void this.playScene(sc); break; }
      }
      if (this.mahninCage && !this.mahninFreed && cage) {                                  // caged: she cowers when he comes near
        const d = Math.hypot(hx - cage.x, hz - cage.z); this.mahninCage.play(d < 9 ? 'Afraid' : 'Cry', 0.5);
        if (d < 9) { const want = Math.atan2(hx - cage.x, hz - cage.z); let dr = want - this.mahninCage.root.rotation.y; dr = Math.atan2(Math.sin(dr), Math.cos(dr)); this.mahninCage.root.rotation.y += dr * Math.min(1, dt * 3); }
        this.mahninCage.update(dt);
      }
      if (this.mahninFig) {
        const d = Math.hypot(hx - CH1.mahnin.x, hz - CH1.mahnin.z); this.altarNear = d < 4.5;
        if (d < 10) { const want = Math.atan2(hx - CH1.mahnin.x, hz - CH1.mahnin.z); let dr = want - this.mahninFig.rotation.y; dr = Math.atan2(Math.sin(dr), Math.cos(dr)); this.mahninFig.rotation.y += dr * Math.min(1, dt * 3); }
        if (this.mahninNpc) { if (d < 7 && !this.mahninWaved) { this.mahninWaved = true; this.mahninNpc.play('Wave', 0.3, 'Idle'); } if (d > 12) this.mahninWaved = false; this.mahninNpc.update(dt); }
        else { const glow = this.mahninFig.children[2] as THREE.Sprite | undefined; if (glow?.isSprite) glow.material.opacity = 0.45 + 0.15 * Math.sin(this.simTime * 2); }
      }
      this.checkUnlocks(); this.updateHillAndVillage(rawDt);
      // the barrier falls when he brings all four shards to the lair
      const shards = this.shardCount();
      if (this.barrierUp && shards >= 4 && Math.hypot(hx - CH1.lair.x, hz - CH1.lair.z) < CH1.barrierR + 4) {
        this.barrierUp = false; this.setSealed?.(false); this.fx.shake = 0.8; this.fx.ring(new THREE.Vector3(CH1.lair.x, 0.2, CH1.lair.z), 4, CH1.barrierR + 4, 1.2, 0xff4060); void this.playScene('barrier');
      }
      if (this.boss.dead) this.downs.add('warden'); if (this.undeadKing?.dead) this.downs.add('king'); if (this.hydra?.dead) this.downs.add('naga'); if (this.abbot?.dead) this.downs.add('abbot');
      this.updateGlimpses(rawDt);
      this.autosave(rawDt);
      if (this.mahninFreed && Math.hypot(hx - CH1.mahnin.x, hz - CH1.mahnin.z) < 4) this.metMahnin = true;
      this.quest.update({
        warden: { dead: this.downs.has('warden'), x: this.boss.pos.x, z: this.boss.pos.z },
        king: this.undeadKing ? { dead: this.downs.has('king'), x: this.undeadKing.pos.x, z: this.undeadKing.pos.z } : null,
        holders: this.holders(), cage: cage ? { x: cage.x, z: cage.z } : null, mahninFreed: this.mahninFreed, mahnin: { x: CH1.mahnin.x, z: CH1.mahnin.z }, metMahnin: this.metMahnin,
        lair: { x: CH1.lair.x + CH1.barrierR, z: CH1.lair.z }, barrierUp: this.barrierUp,
        naga: this.hydra ? { dead: this.downs.has('naga'), x: this.hydra.pos.x, z: this.hydra.pos.z } : null,
        gate: { x: CH1.treasure.x, z: CH1.treasure.z }, hero: { x: hx, z: hz },
      });
    }
    if (this.hydra?.dead && !this.gateOpened) { this.gateOpened = true; this.worldOpenGate?.(); this.fx.damageNumber(this.hero.position.clone().setY(2.6), 'THE GATE IS OPEN', 'big'); }
    if (this.gateOpened && !this.chapterDone && Math.hypot(this.hero.position.x - CH1.treasure.x, this.hero.position.z - CH1.treasure.z) < 4.0) {
      this.chapterDone = true; sfx.die(); void this.playScene('ending').then(() => this.playScene('epilogue')).then(() => document.getElementById('chapter-done')?.classList.add('show'));
    }                                               // canopies above the hero fade out
    for (const e of this.enemies) {                                                         // a foe falls: cursed smoke, and the souls it devoured fly to Zaw Gyi
      if (e.dead && !this.deadSeen.has(e)) { this.deadSeen.add(e); if (!(e instanceof Hydra)) this.deathFx(e); this.souls?.release(e.pos.clone(), this.soulValue(e) * this.st.soulMul); this.relicFrom(e); }
      else if (!e.dead && this.deadSeen.has(e)) this.deadSeen.delete(e);
    }
    if (this.souls) {
      this.souls.update(rawDt, this.hero.position); this.souls.show(this.started);
    }
    this.updateOrbs(dt); this.updateChain(); this.updateSpells(dt); this.worldUpdate?.(rawDt); this.atmo?.update(rawDt, this.hero.position);
    this.updateTrail(); this.updateGhosts(rawDt); this.fx.update(rawDt);
    for (const l of this.lamps) { const f = 0.85 + Math.sin(now * 0.011 + l.base) * 0.1 + Math.random() * 0.08; l.light.intensity = l.base * f; l.flame.scale.set(1, 0.9 + f * 0.3, 1); }
    this.updateCamera(rawDt); this.updateHud(); this.drawMinimap(); this.input.endFrame();
  }

  private updateHero(dt: number, rawDt: number): void {
    const hp = this.hero.position; const mv = this.moveDir(); const wantSpeed = Math.min(1, mv.length());
    this.invuln = Math.max(0, this.invuln - rawDt);
    if (this.model) this.model.visible = this.invuln <= 0 || Math.floor(this.invuln * 16) % 2 === 0;
    if (this.input.attackPressed && (this.state === 'free' || this.state === 'attack')) this.combo.press();
    if (this.input.dashPressed && (this.state === 'free' || this.state === 'attack')) this.startDash(mv);
    if (this.input.leapPressed && (this.state === 'free' || this.state === 'attack') && !this.airborne) this.startLeap(mv);
    this.leapCd = Math.max(0, this.leapCd - dt); { const lb = document.getElementById('btn-leap'); if (lb) { const on = this.leapCd > 0; lb.classList.toggle('cd', on); const t = on ? String(Math.ceil(this.leapCd)) : 'LEAP'; if (lb.textContent !== t) lb.textContent = t; } }
    if (this.input.jumpPressed && this.state === 'free') { if (!this.airborne) this.startJump(); else if (this.airJumps === 0) this.doubleJump(); }   // tap again in the air: double jump
    for (const id of [1, 2, 3, 4] as const) this.cooldown[id] = Math.max(0, this.cooldown[id] - rawDt);
    this.elixirCd = Math.max(0, this.elixirCd - rawDt);
    if (this.input.elementPressed >= 0) this.pressElement(this.input.elementPressed);
    if (this.input.invokePressed) this.invoke();
    if (this.input.castPressed >= 0) this.castSlot(this.input.castPressed);
    if (this.state !== 'dead') { const st = this.st; this.sinceHit += rawDt; this.mp = Math.min(this.maxMp, this.mp + st.mpRegen * rawDt); this.hp = Math.min(this.maxHp, this.hp + st.hpRegen * (this.sinceHit > 5 ? 4 : 1) * rawDt); }
    this.slowT = Math.max(0, this.slowT - rawDt); if (this.slowT <= 0) this.slowK = 0;
    this.healTick -= rawDt; if (this.healTick <= 0 && this.healShown >= 1) { this.healTick = 0.45; this.fx.damageNumber(this.hero.position.clone().setY(2.5), `+${Math.round(this.healShown)}`, 'heal'); this.healShown = 0; }
    if (this.input.altarPressed && this.altarNear && !this.altar?.isOpen) this.openAltar();
    if (MAP === 'ch1' && this.state !== 'dead') this.updatePickups(rawDt);
    if (this.input.elixirPressed && this.state !== 'dead') {                                  // Spirit Elixir: +40 health
      if (!this.unlocked.elixir) this.fx.damageNumber(this.hero.position.clone().setY(2.4), 'LOCKED', '');
      else if (this.elixirCd <= 0 && this.hp < this.maxHp) {
        const h = this.elixirHeal(); this.elixirCd = 30; sfx.magic();
        if (this.hfx.heal) this.fx.flip(this.hfx.heal, new THREE.Vector3(0, 1.3, 0), 3.4, 20, false, 0, this.hero, true);
        this.fx.burst(this.hero.position.clone().setY(1.2), 12, 3, 0x7affb0); this.fx.ring(this.hero.position.clone().setY(0.1), 0.4, 2.6, 0.5, 0x7affb0);
        this.fx.damageNumber(this.hero.position.clone().setY(2.4), `+${h}`, 'heal big');
      }
    }
    if (this.input.skill1Pressed && (this.state === 'free' || this.state === 'attack')) this.startSkill(1);
    else if (this.input.skill2Pressed && (this.state === 'free' || this.state === 'attack')) this.startSkill(2);
    else if (this.input.skill3Pressed && (this.state === 'free' || this.state === 'attack')) this.startSkill(3);
    else if (this.input.skill4Pressed && (this.state === 'free' || this.state === 'attack')) this.startSkill(4);
    if (this.state === 'free' || this.state === 'attack') this.combo.update(dt * this.st.as);
    if (this.state === 'attack' && !this.combo.active) this.state = 'free';

    switch (this.state) {
      case 'free': {
        const wet = MAP === 'ch1' && !this.airborne && inWaterCh1(this.hero.position.x, this.hero.position.z);
        const target = mv.clone().multiplyScalar(RUN_SPEED * wantSpeed * this.speedMul * (1 - this.slowK) * (this.rootT > 0 ? 0 : wet ? 0.62 : 1));
        if (wet && mv.length() > 0.3 && (this.splashT -= dt) <= 0) { this.splashT = 0.18; this.fx.burst(this.hero.position.clone().setY(0.25), 5, 1.6, 0xbfe6ff); } this.vel.lerp(target, Math.min(1, dt * 14));
        if (wantSpeed > 0.1) { const want = Math.atan2(mv.x, mv.y); this.facing += Math.max(-16 * dt, Math.min(16 * dt, wrap(want - this.facing))); }
        const sp = this.vel.length();
        if (sp > 0.6) this.play('Run', 0.14, THREE.MathUtils.clamp(sp / RUN_CLIP_SPEED, 0.5, 1.5));
        else this.play('Idle', 0.2, 1);
        break; }
      case 'attack': {
        const s = this.combo.step!; this.vel.set(0, 0);
        const k = this.combo.t; if (k >= s.lungeStart && k <= s.lungeEnd) this.vel.set(Math.sin(this.facing), Math.cos(this.facing)).multiplyScalar(s.lunge * this.st.as / (s.lungeEnd - s.lungeStart));
        if (this.combo.hitActive) this.applyHits(s, this.combo.index);
        break; }
      case 'dash': {
        this.dashT += dt; const v = Math.max(0, 32 * (1 - this.dashT / 0.28)) * (this.galeT > 0 ? 1.7 : 1); this.vel.copy(this.dashDir).multiplyScalar(v);
        if (this.galeT > 0) for (const e of this.enemies) { if (e.dead || this.galeHit.has(e) || Math.hypot(e.pos.x - this.hero.position.x, e.pos.z - this.hero.position.z) > e.radius + 1.1) continue; this.galeHit.add(e);
          const s2 = Math.sign(this.dashDir.x * (e.pos.z - this.hero.position.z) - this.dashDir.y * (e.pos.x - this.hero.position.x)) || 1; const dl = this.dealt(1, e); e.hurt(dl.dmg, -this.dashDir.y * s2, this.dashDir.x * s2, 2.4, true); this.fx.burst(e.pos.clone().setY(1), 10, 3, 0xdff4ff); this.fx.damageNumber(new THREE.Vector3(e.pos.x, 1.9, e.pos.z), dl.show, this.nk(dl, false)); }
        if (this.dashT >= 0.45) { this.state = 'free'; this.play('Idle', 0.15); }
        break; }
      case 'skill': this.updateSkill(dt); break;
      case 'leap': { this.vel.set(0, 0); this.leapT += dt; if (this.leapT >= 0.42) { this.state = 'free'; this.play('Idle', 0.15); } break; }
      case 'dead': { this.vel.set(0, 0); this.deadT += rawDt; if (this.deadT > 2.6) this.revive(); break; }
      case 'hurt': {
        this.hurtT -= dt; this.vel.multiplyScalar(Math.max(0, 1 - 8 * dt)); if (this.hurtT <= 0) { this.state = 'free'; this.play('Idle', 0.15); }
        break; }
    }
    const startX = hp.x, startZ = hp.z;
    hp.x += this.vel.x * dt; hp.z += this.vel.y * dt;
    for (const e of this.enemies) {                           // soft collision with enemies
      if (e.dead || ((e instanceof Boss || e instanceof Necro || e instanceof Minion || e instanceof Hydra) && !e.loaded)) continue; const dx = hp.x - e.pos.x, dz = hp.z - e.pos.z, d = Math.hypot(dx, dz), min = 0.45 + e.radius;
      if (d < min && d > 0.0001) { hp.x = e.pos.x + (dx / d) * min; hp.z = e.pos.z + (dz / d) * min; }
    }
    // anything lower than his feet can be crossed in the air, landed on and walked across; higher things block him
    const airY = this.jumpBase + this.jumpY, feet = hp.y, onTop = !this.airborne && feet > walk.h(startX, startZ) + 0.05;
    if (this.airborne) settle(hp, startX, startZ, 0, (x, z) => walk.air(x, z, airY));
    else settle(hp, startX, startZ, onTop ? 0 : 0.32, (x, z) => walk.air(x, z, feet + STEP_UP + 0.05));   // on foot: steps up anything under ~0.3 m; on a wall stump, a log or the dais he walks its top                                                         // stay on walkable ground (walls, water, props, the arena edge)
    if (this.airborne) {
      const floor = walk.top(hp.x, hp.z, airY);                                             // floor, or the top of whatever he is above
      this.jumpY += this.jumpV * dt; this.jumpV -= GRAVITY * dt;
      hp.y = Math.max(floor, this.jumpBase + this.jumpY); this.fallTop = Math.max(this.fallTop, hp.y);
      if (this.model && this.flipT >= 0) {                                                    // the double jump's front flip, turning round his waist
        this.flipT += dt; const k = Math.min(1, this.flipT / FLIP_TIME), a = Math.PI * 2 * (1 - (1 - k) * (1 - k)), c = 0.9;
        this.model.rotation.x = a; this.model.position.set(0, c - c * Math.cos(a), -c * Math.sin(a)); if (k >= 1) { this.flipT = -1; this.model.position.set(0, 0, 0); }
      } else if (this.model) this.model.rotation.x = 0.22 * Math.max(-1, Math.min(1, this.jumpV / JUMP_V));      // tuck forward going up, open out coming down
      if (this.jumpBase + this.jumpY <= floor + 0.001 && this.jumpV < 0) {
        this.airborne = false; this.jumpY = 0; this.flipT = -1; if (this.model) { this.model.rotation.x = 0; this.model.position.set(0, 0, 0); }
        hp.y = floor; this.fx.burst(hp.clone().setY(hp.y + 0.1 - walk.h(hp.x, hp.z)), 8, 2, 0xb8a98a);       // lands on the floor or on top of the obstacle
        const fall = this.fallTop - floor; this.fallTop = -1e9;
        if (fall > FALL_SAFE && this.state !== 'dead') {                                        // a long drop hurts: 6% of max health per metre past 3.5 m (never kills)
          const dmg = Math.min(this.hp - 1, Math.round(this.maxHp * 0.06 * (fall - FALL_SAFE))); if (dmg > 0) { this.hp -= dmg; this.fx.damageNumber(hp.clone().setY(hp.y + 2.2), '-' + dmg, 'hurt pure'); this.fx.shake = Math.max(this.fx.shake, 0.5); sfx.hurt(); }
        }
        if (this.ascentSlam) { this.ascentSlam = false; this.hitArea(hp.clone(), 2.8, 2, 1.6, 0x7af0ff); if (this.hfx.crack) this.fx.groundFlip(this.hfx.crack, hp.clone(), 4.2, 26); }
      }
    } else {
      let sup = walk.top(hp.x, hp.z, feet + STEP_UP);                                          // the floor (terrace, stairs) or the top he stands on
      if (sup < feet - LEDGE) {                                                                 // a cliff edge: on foot he stops at it (and slides along it)
        const sx = walk.top(hp.x, startZ, feet + STEP_UP), sz = walk.top(startX, hp.z, feet + STEP_UP);
        if (sx >= feet - LEDGE) { hp.z = startZ; sup = sx; } else if (sz >= feet - LEDGE) { hp.x = startX; sup = sz; } else { hp.x = startX; hp.z = startZ; sup = feet; }
      }
      if (sup < feet - 0.3) { this.airborne = true; this.jumpBase = feet; this.jumpY = 0; this.jumpV = -0.01; this.airJumps = 0; this.flipT = -1; this.fallTop = feet; }   // walked off an edge: fall
      else { hp.y = sup; this.lastGround.set(hp.x, hp.z); }
    }
    this.hero.rotation.y = this.facing;
  }

  /** Jump: about 1.1 m high, 0.6 s in the air; clears anything lower than ~0.9 m (3 ft). */
  private airborne = false; private jumpY = 0; private jumpV = 0; private jumpBase = 0; private lastGround = new THREE.Vector2();
  private hoverT = 0; private airJumps = 0; private flipT = -1;
  /** Second jump in mid-air: a fresh upward kick (a little weaker), a front flip and a burst of light under his feet. */
  private doubleJump(): void {
    this.airJumps = 1; this.hoverT = 0; this.jumpV = JUMP_V * 0.85; this.flipT = 0; sfx.swing(2); sfx.dash();
    const feet = this.hero.position.clone(); if (this.hfx.spark) this.fx.flip(this.hfx.spark, feet.clone().setY(feet.y + 0.1 - walk.h(feet.x, feet.z)), 1.8, 40, false, 0, this.scene, true);
    this.fx.burst(feet.clone().setY(feet.y + 0.1 - walk.h(feet.x, feet.z)), 12, 2.4, 0xffe2a0);
  }
  private startJump(): void { this.airJumps = 0; this.flipT = -1; this.hoverT = 0; this.airborne = true; this.jumpV = JUMP_V; this.jumpY = 0.001; this.jumpBase = this.hero.position.y; this.fallTop = this.jumpBase; sfx.dash(); }
  /** Highest point of the current fall (for fall damage). */
  private fallTop = -1e9;
  pressJump(): void { this.input.jumpPressed = true; }

  /** The Leap Strike: he vanishes and reappears behind an enemy within 10 m (the one he faces, ranged foes first), turns and strikes
   *  with the staff for 1.5x attack damage and a 0.3 s stun. 6 s cooldown. Made for the archers and casters that keep their distance. */
  private leapCd = 0; private leapT = 0;
  private startLeap(mv: THREE.Vector2): void {
    if (this.leapCd > 0) return; const hp = this.hero.position; const aim = mv.length() > 0.2 ? Math.atan2(mv.x, mv.y) : this.facing;
    let best: Foe | null = null, bs = 1e9;
    for (const e of this.enemies) {
      if (e.dead || ((e instanceof Boss || e instanceof Necro || e instanceof Minion || e instanceof Hydra) && !e.loaded) || e instanceof Hydra) continue;
      const dx = e.pos.x - hp.x, dz = e.pos.z - hp.z, d = Math.hypot(dx, dz); if (d > 10 || Math.abs(e.pos.y - hp.y) > 2.5) continue;
      const ranged = e instanceof Minion && (e.role === 'archer' || e.role === 'caster' || e.role === 'ghost');
      const sc = d + Math.abs(wrap(Math.atan2(dx, dz) - aim)) * 4 - (ranged ? 3 : 0); if (sc < bs) { bs = sc; best = e; }
    }
    if (!best) { this.fx.damageNumber(hp.clone().setY(hp.y + 2.3), 'NO TARGET', ''); return; }
    const e = best, d0 = Math.hypot(e.pos.x - hp.x, e.pos.z - hp.z) || 1, ux = (e.pos.x - hp.x) / d0, uz = (e.pos.z - hp.z) / d0, back = e.radius + 0.9;
    let dest: [number, number] | null = null;
    for (const a of [0, 0.7, -0.7, 1.4, -1.4, Math.PI]) {                                  // behind it if there is ground, else round its side
      const c = Math.cos(a), s = Math.sin(a), vx = ux * c - uz * s, vz = ux * s + uz * c, x = e.pos.x + vx * back, z = e.pos.z + vz * back;
      if (walk.ok(x, z) && Math.abs(walk.h(x, z) - e.pos.y) < 1.2) { dest = [x, z]; break; }
    }
    if (!dest) return;
    this.combo.cancel(); this.leapCd = 6 * this.cdMul; this.state = 'leap'; this.leapT = 0; this.invuln = Math.max(this.invuln, 0.35); this.airborne = false; this.jumpY = 0;
    this.fx.burst(hp.clone().setY(hp.y + 1), 14, 3, 0xb08cff); this.fx.ring(hp.clone().setY(hp.y + 0.1), 0.3, 1.6, 0.3, 0xb08cff);
    hp.set(dest[0], walk.h(dest[0], dest[1]), dest[1]); this.lastGround.set(dest[0], dest[1]);
    this.facing = Math.atan2(e.pos.x - hp.x, e.pos.z - hp.z); this.hero.rotation.y = this.facing; this.camTarget.lerp(hp.clone().setY(hp.y + 1), 0.6);
    this.play(this.actions.has('Attack2') ? 'Attack2' : 'Attack1', 0.04, 1.5, true); sfx.dash(); sfx.hit(true);
    const nx = (e.pos.x - hp.x) / back, nz = (e.pos.z - hp.z) / back, dl = this.dealt(1.5, e); e.hurt(dl.dmg, nx, nz, 1.2, true);
    if (e instanceof Minion && !e.dead) e.stun(0.3);
    const at = new THREE.Vector3(e.pos.x - nx * e.radius * 0.6, hp.y + 1.2, e.pos.z - nz * e.radius * 0.6);
    this.sparkFx(at, true); this.fx.burst(at, 16, 4.5, 0xb08cff); this.fx.damageNumber(at.clone().setY(hp.y + 1.9), dl.show, this.nk(dl, true)); this.hitStop = Math.max(this.hitStop, 0.06);
    if (e.dead) { sfx.die(); this.fx.burst(at, 24, 4, 0x7fe3c8); }
  }

  private startDash(mv: THREE.Vector2): void {
    this.combo.cancel(); this.state = 'dash'; this.dashT = 0; this.invuln = 0;
    this.dashDir = mv.length() > 0.2 ? mv.clone().normalize() : new THREE.Vector2(Math.sin(this.facing), Math.cos(this.facing));
    this.facing = Math.atan2(this.dashDir.x, this.dashDir.y); this.play(this.actions.has('Dash') ? 'Dash' : 'Run', 0.05, this.actions.has('Dash') ? this.clipSpeed('Dash') : 1.9, true); sfx.dash(); this.fx.burst(this.hero.position.clone().setY(0.1), 8, 2.5, 0xb8a98a);
  }

  private makeGhosts(): void {
    if (!this.model) return;
    this.model.traverse((o) => { if ((o as THREE.Bone).isBone) this.heroBones.push(o as THREE.Bone); });
    for (let k = 0; k < 7; k++) {
      const root = cloneSkinned(this.model); const bones: THREE.Bone[] = []; const mats: THREE.MeshBasicMaterial[] = [];
      root.traverse((o) => {
        if ((o as THREE.Bone).isBone) bones.push(o as THREE.Bone);
        const m = o as THREE.Mesh; if (!m.isMesh) return;
        const mat = new THREE.MeshBasicMaterial({ color: 0xc80a0a, transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
        m.material = mat; m.castShadow = false; m.frustumCulled = false; m.renderOrder = 4; mats.push(mat);
      });
      root.visible = false; this.scene.add(root); this.ghosts.push({ root, bones, mats, t: 99 });
    }
  }

  /** Freeze the hero's current pose into the next ghost in the pool. */
  private dropGhost(strength: number): void {
    if (!this.model || !this.ghosts.length) return;
    const g = this.ghosts[this.ghostNext]; this.ghostNext = (this.ghostNext + 1) % this.ghosts.length;
    for (let i = 0; i < g.bones.length && i < this.heroBones.length; i++) { const b = this.heroBones[i]; g.bones[i].position.copy(b.position); g.bones[i].quaternion.copy(b.quaternion); g.bones[i].scale.copy(b.scale); }
    g.root.position.copy(this.hero.position); g.root.rotation.set(0, this.hero.rotation.y, 0); g.root.scale.copy(this.model.scale);
    g.root.visible = true; g.t = 0; g.root.userData.k = strength;
  }

  private updateGhosts(dt: number): void {
    // drop afterimages while a basic-combo swing is moving fast (wind-up to just after the hit)
    if (this.state === 'attack' && this.combo.active) {
      const st = this.combo.step!; const t = this.combo.t;
      if (t > st.hitStart - 0.16 && t < st.hitEnd + 0.06) {
        this.ghostTimer -= dt;
        if (this.ghostTimer <= 0) { this.ghostTimer = 0.045; this.dropGhost(this.combo.index === COMBO_CONFIG.steps.length - 1 ? 1.25 : 1); }
      }
    } else this.ghostTimer = 0;
    for (const g of this.ghosts) {
      if (!g.root.visible) continue; g.t += dt; const life = 0.34, k = g.t / life;
      if (k >= 1) { g.root.visible = false; continue; }
      const a = (1 - k) * 0.42 * (g.root.userData.k ?? 1);
      for (const m of g.mats) { m.opacity = a; m.color.setRGB(0.95 - 0.35 * k, 0.04, 0.04); }        // bright crimson darkening as it fades
    }
  }

  private updateTrail(): void {
    if (!this.staff || !this.combo.active || this.state !== 'attack') return; const st = this.combo.step!;
    if (this.combo.t < st.hitStart - 0.12 || this.combo.t > st.hitEnd + 0.1) return;
    const tip = new THREE.Vector3(), base = new THREE.Vector3(); this.staff.getVertexPosition(this.tipIdx, tip); this.staff.getVertexPosition(this.baseIdx, base);
    this.fx.addTrailSample(this.staff.localToWorld(tip), this.staff.localToWorld(base));
  }

  private snapCamera(): void { this.camTarget.copy(this.hero.position).setY(this.hero.position.y + 1.0); this.placeCamera(0); }

  private updateCamera(dt: number): void {
    this.camDist += (ZOOMS[this.zoom] - this.camDist) * (1 - Math.exp(-6 * dt));
    this.camTarget.lerp(this.tmp.copy(this.hero.position).setY(this.hero.position.y + 1.0), 1 - Math.exp(-9 * dt));
    this.placeCamera(dt);
    this.sun.position.set(this.hero.position.x - 8, 16, this.hero.position.z - 6); this.sun.target.position.copy(this.hero.position); this.sun.target.updateMatrixWorld();
  }

  private placeCamera(_dt: number): void {
    const pitch = THREE.MathUtils.degToRad(55), yaw = this.yaw, d = this.camDist; const h = d * Math.cos(pitch);
    this.camera.position.set(this.camTarget.x - Math.sin(yaw) * h, this.camTarget.y + d * Math.sin(pitch), this.camTarget.z - Math.cos(yaw) * h);
    this.camera.lookAt(this.camTarget); const off = this.fx.shakeOffset(new THREE.Vector3()); this.camera.position.add(off);
  }

  private updateHud(): void {
    { const b = document.getElementById('btn-elixir'); if (b) { const k = this.elixirCd / 30; b.classList.toggle('locked', !this.unlocked.elixir); b.classList.toggle('hidden', MAP !== 'ch1');
        b.style.setProperty('--cd', String(k)); b.classList.toggle('cooling', k > 0); const n = b.querySelector('.cdnum'); if (n) n.textContent = k > 0 ? String(Math.ceil(this.elixirCd)) : ''; } }
    if (this.toastEl && this.toastT > 0) { this.toastT -= 1 / 60; if (this.toastT <= 0) this.toastEl.classList.remove('show'); }
    this.updateVitals(); this.updateHpBars(); this.updateSpellHud();
    document.getElementById('btn-altar')?.classList.toggle('hidden', !this.altarNear || !this.started);
    this.comboLabelT = Math.max(0, this.comboLabelT - 0.016);
    const label = document.getElementById('combo-name')!; label.textContent = this.combo.active ? this.combo.step!.name.toUpperCase() : this.comboLabelT > 0 ? '' : '';
    const stage = this.combo.active ? this.combo.index + 1 : this.combo.sinceEnd < COMBO_CONFIG.resetDelay && this.combo.index >= 0 && this.combo.index < COMBO_CONFIG.steps.length - 1 ? this.combo.index + 1 : 0;
    document.querySelectorAll('#pips i').forEach((el, i) => el.classList.toggle('on', i < stage));
    for (const id of [1, 2, 3, 4] as const) {
      const b = document.getElementById('btn-skill' + id); if (!b) continue; const k = Math.min(1, this.cooldown[id] / (SKILLS[id].cooldown * this.cdMul)); b.classList.toggle('locked', id !== 1 && !this.unlocked[id]);
      b.style.setProperty('--cd', String(k)); b.classList.toggle('cooling', k > 0); b.classList.toggle('nomana', this.mp < SKILL_MANA[id]); const n = b.querySelector('.cdnum'); if (n) n.textContent = k > 0 ? String(Math.ceil(this.cooldown[id])) : '';
    }
    if (this.debug) document.getElementById('debug')!.textContent = `fps ${Math.round(this.fps)}  state ${this.state}  combo ${this.combo.active ? this.combo.index + 1 : '-'} t ${this.combo.t.toFixed(2)}\n` + this.enemies.map((e) => `${e.kind} ${e.hp}/${e.maxHp} ${e.state}`).join(' | ');
  }

  private vit: { hp: HTMLElement; mp: HTMLElement; hpT: HTMLElement; mpT: HTMLElement; lv: HTMLElement; trail: HTMLElement } | null = null; private vitKey = ''; private hpTrail = 1;
  /** The health and mana frame (the owner's art): medallion with the level, a red health bar with a fading damage trail, a blue mana bar. */
  private updateVitals(): void {
    if (!this.vit) {
      const el = document.getElementById('health')!; const B = import.meta.env.BASE_URL;
      el.innerHTML = `<div class="v-med"><img src="${B}assets/ui/medallion.png" alt=""></div><div class="v-bar v-hp"><i class="trail"></i><i class="fill"></i><span></span></div><div class="v-bar v-mp"><i class="fill"></i><span></span></div><img class="v-frame" src="${B}assets/ui/bar_frame.png" alt=""><b class="v-lv">1</b>`;
      const q = (s: string) => el.querySelector(s) as HTMLElement;
      this.vit = { hp: q('.v-hp .fill'), mp: q('.v-mp .fill'), hpT: q('.v-hp span'), mpT: q('.v-mp span'), lv: q('.v-lv'), trail: q('.v-hp .trail') };
    }
    const v = this.vit, hk = this.hp / this.maxHp; this.hpTrail = this.hpTrail > hk ? Math.max(hk, this.hpTrail - 0.012) : hk;
    v.trail.style.width = `${this.hpTrail * 100}%`;
    const key = `${Math.ceil(this.hp)}|${this.maxHp}|${Math.floor(this.mp)}|${this.maxMp}|${this.level}`; if (key === this.vitKey) return; this.vitKey = key;
    v.hp.style.width = `${hk * 100}%`; v.mp.style.width = `${(this.mp / this.maxMp) * 100}%`;
    v.hpT.textContent = `${Math.ceil(this.hp)} / ${this.maxHp}`; v.mpT.textContent = `${Math.floor(this.mp)} / ${this.maxMp}`; v.lv.textContent = String(this.level);
  }
  /** Small health bars over hurt or nearby minions (elites and bosses use the big bar). */
  private updateHpBars(): void {
    const v = new THREE.Vector3(), seen = new Set<unknown>();
    for (const e of this.enemies) {
      if (!(e instanceof Minion) || e.title || e.dead || !e.loaded) continue;
      const d = Math.hypot(e.pos.x - this.hero.position.x, e.pos.z - this.hero.position.z); if (d > 20 || (e.hp >= e.maxHp && d > 9)) continue;
      v.set(e.pos.x, e.root.position.y + e.barHeight, e.pos.z).project(this.camera); if (v.z > 1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1) continue;
      let b = this.hpBars.get(e); if (!b) { b = document.createElement('div'); b.className = 'ehp'; b.innerHTML = '<i></i>'; document.body.appendChild(b); this.hpBars.set(e, b); }
      seen.add(e); b.style.left = `${(v.x * 0.5 + 0.5) * innerWidth}px`; b.style.top = `${(-v.y * 0.5 + 0.5) * innerHeight}px`; (b.firstChild as HTMLElement).style.width = `${(100 * e.hp) / e.maxHp}%`;
    }
    for (const [e, b] of this.hpBars) if (!seen.has(e)) { b.remove(); this.hpBars.delete(e); }
  }

  resize(): void {
    this.renderer.setSize(innerWidth, innerHeight, false); this.camera.aspect = innerWidth / innerHeight;
    // keep the framing on narrow screens: pull the camera back so the arena stays readable
    this.camera.fov = this.camera.aspect < 1.4 ? 44 : 36; this.camera.updateProjectionMatrix();
    this.atmo?.setSize();
  }
}
