/**
 * Chapter 1 quest tracker: the current objective (top left), the Curse Shard count, and a target the minimap and the
 * world map point at. The game feeds it the world state every frame; it works out which step the player is on.
 *
 * The acts in story order (docs/ch1-script.md), because each one's scene builds on the last: the Stone Warden → the Undead King
 * (Act I, in the temple) → the Goblin Chief, the cage, Ma Hnin at her altar in the old village (Act II) → the Necromancer (III) →
 * the Undead Commander (IV) → the Weeping Maid (V) → set the shards at the Naga's lair → the Naga → the gate.
 * A shard holder beaten early still counts: the tracker skips ahead to the next act not yet done. Every defeat the game reports
 * is remembered (story foes stay dead), so the quest never goes backwards.
 */
export interface QuestWorld {
  warden: { dead: boolean; x: number; z: number };
  king: { dead: boolean; x: number; z: number } | null;
  holders: Array<{ id: string; label: string; dead: boolean; x: number; z: number }>;   // the four shard holders, in act order
  cage: { x: number; z: number } | null; mahninFreed: boolean; mahnin: { x: number; z: number }; metMahnin: boolean;
  lair: { x: number; z: number }; barrierUp: boolean;
  naga: { dead: boolean; x: number; z: number } | null;
  gate: { x: number; z: number };
  hero: { x: number; z: number };
}
export interface QuestState { title: string; text: string; target: { x: number; z: number } | null; shards: number; step: string }

/** Each shard holder's act: its title and where to go (the map runs west to east: the temple hill, the village, the lair). */
const ACTS: Record<string, { title: string; text: string }> = {
  chief: { title: 'Act II · The Hunters\' Price', text: 'Down the Grand Stair, then south past the river\'s bend to the goblins who emptied the village. Defeat the Goblin Chief.' },
  necro: { title: 'Act III · The Dead Who Serve', text: 'North to the Bone Wastes. Defeat the Necromancer.' },
  commander: { title: 'Act IV · The Garrison', text: 'North-east to the Undead Garrison\'s front camp. Defeat its Commander.' },
  banshee: { title: 'Act V · The Weeping Maid', text: 'Far to the south-east, just before the Naga\'s lair: find the Weeping Maid at the Weeping Pool.' },
};

export class QuestTracker {
  enabled = false;
  state: QuestState = { title: '', text: '', target: null, shards: 0, step: '' };
  private el: HTMLDivElement;
  private shown = '';

  constructor() {
    this.el = document.createElement('div'); this.el.id = 'quest';
    this.el.innerHTML = '<div class="q-ch">CHAPTER 1 · THE SEALED ZONE</div><div class="q-act"></div><div class="q-tx"></div><div class="q-sh"></div><div class="q-side"><b></b><span></span></div>';
    document.body.appendChild(this.el);
  }

  private sideShown = '';
  /** The side quest nearest him (title and step), under the main objective; empty hides it. */
  setSide(title: string, text: string): void {
    const k = title + '|' + text; if (k === this.sideShown) return; this.sideShown = k;
    const el = this.el.querySelector('.q-side') as HTMLDivElement; el.classList.toggle('on', !!title);
    (el.querySelector('b') as HTMLElement).textContent = title; (el.querySelector('span') as HTMLElement).textContent = text;
  }
  update(w: QuestWorld): void {
    if (!this.enabled) { this.el.classList.remove('on'); return; }
    this.el.classList.add('on');
    const shards = w.holders.filter((h) => h.dead).length, down = (id: string) => !!w.holders.find((h) => h.id === id)?.dead;
    const next = w.holders.find((h) => !h.dead);
    let s: QuestState;
    if (!w.warden.dead) s = { step: 'warden', title: 'Act I · The Stone Warden', text: 'Defeat the Stone Warden in the Lotus Court.', target: w.warden, shards };
    else if (w.king && !w.king.dead) s = { step: 'king', title: 'Act I · The King in Chains', text: 'Confront the Undead King on the Offering Hall terrace.', target: w.king, shards };
    else if (down('chief') && !w.mahninFreed && w.cage) s = { step: 'cage', title: 'Act II · The Hunters\' Price', text: 'Free the captive from the goblins\' cage.', target: w.cage, shards };
    else if (down('chief') && w.mahninFreed && !w.metMahnin && !down('necro') && !down('commander') && !down('banshee'))
      s = { step: 'mahnin', title: 'Act II · The Hunters\' Price', text: 'Ma Hnin went ahead to the old village. Meet her at her altar.', target: w.mahnin, shards };
    else if (next) s = { step: next.id, title: ACTS[next.id].title, text: ACTS[next.id].text, target: next, shards };
    else if (w.barrierUp) s = { step: 'barrier', title: 'Finale · Keeper of the Seal', text: 'Take the four shards east to the barrier round the Naga\'s lair.', target: w.lair, shards };
    else if (w.naga && !w.naga.dead) s = { step: 'naga', title: 'Finale · Keeper of the Seal', text: 'Face the keeper of the seal.', target: w.naga, shards };
    else s = { step: 'gate', title: 'The Gate', text: 'Walk through the gate. You are free.', target: w.gate, shards };
    this.state = s;
    const key = s.step + s.text + s.shards;
    if (key !== this.shown) {
      this.shown = key;
      (this.el.querySelector('.q-act') as HTMLDivElement).textContent = s.title;
      (this.el.querySelector('.q-tx') as HTMLDivElement).textContent = s.text;
      (this.el.querySelector('.q-sh') as HTMLDivElement).innerHTML = [0, 1, 2, 3].map((i) => `<i class="${i < s.shards ? 'got' : ''}"></i>`).join('') + '<span>Curse Shards</span>';
      this.el.classList.remove('pulse'); void this.el.offsetWidth; this.el.classList.add('pulse');
    }
  }
}
