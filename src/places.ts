/**
 * The grown valley's places that answer him (docs: the owner's 1.4x expansion plan). Two parts:
 *  - Spots: something in the world that reacts when he walks up to it ('touch') or when an element reaches it (any spell of that
 *    element landing or cast within reach: Fire relights lamps and burns, Water fills channels, Earth raises a step or dams a channel,
 *    Air blows mist away and turns wind vanes, Spirit shows hidden soul trails and wakes waystones).
 *  - Side quests: short chains of steps over spots and world events; the objective line shows the one nearest him.
 * The world (chapter1 / ch1places) registers spots and quests while it is built; game.ts feeds in his position and the elements he
 * uses, shows the objective, and hands out rewards. Saved: which spots are done.
 */
export type El = 'fire' | 'water' | 'air' | 'earth' | 'spirit';
export interface Spot {
  id: string; name: string; x: number; z: number; r: number;
  /** what wakes it: walking up ('touch') or an element */
  on: 'touch' | El;
  done: boolean;
  /** only answers once this holds (e.g. an earlier step is done) */
  when?: () => boolean;
  /** what happens in the world (lights, water, a door) when it is done; also run when a save is loaded */
  act?: () => void;
  /** a line shown when it answers */
  say?: string;
}
export const SPOTS: Spot[] = [];
export function addSpot(s: Omit<Spot, 'done'>): Spot { const q: Spot = { ...s, done: false }; SPOTS.push(q); return q; }
export const spotDone = (id: string): boolean => !!SPOTS.find((s) => s.id === id)?.done;
function finish(s: Spot): void { s.done = true; s.act?.(); }
/** An element reached (x, z) (a spell landed there, or was cast there): spots of that element within reach answer. */
export function elementReached(el: El, x: number, z: number, reach: number): Spot[] {
  const out: Spot[] = [];
  for (const s of SPOTS) if (!s.done && s.on === el && Math.hypot(x - s.x, z - s.z) < s.r + reach && (!s.when || s.when())) { finish(s); out.push(s); }
  return out;
}
/** He is standing at (x, z): touch spots there answer. */
export function touchedAt(x: number, z: number): Spot[] {
  const out: Spot[] = [];
  for (const s of SPOTS) if (!s.done && s.on === 'touch' && Math.hypot(x - s.x, z - s.z) < s.r && (!s.when || s.when())) { finish(s); out.push(s); }
  return out;
}
/** Restore from a save: these spots were done (their world changes come back too). */
export function restoreSpots(ids: string[]): void { for (const s of SPOTS) if (ids.includes(s.id) && !s.done) finish(s); }

export interface Step { text: string; done: () => boolean; at?: () => [number, number] }
export interface SideQuest {
  id: string; title: string; region: string;
  /** shown once the quest is open (found its first clue); until then it waits unseen */
  open: () => boolean;
  steps: Step[];
  reward: string;
}
export const SIDE_QUESTS: SideQuest[] = [];
export function addQuest(q: SideQuest): SideQuest { SIDE_QUESTS.push(q); return q; }
/** The step a quest is on (steps.length when it is finished). */
export function questStep(q: SideQuest): number { let i = 0; while (i < q.steps.length && q.steps[i].done()) i++; return i; }

/** The story so far, as the places need it (game.ts shares its own sets here): camps whose captives are home, foes beaten for good. */
export const STORY = { freed: new Set<number>(), downs: new Set<string>(), shards: new Set<string>() };
