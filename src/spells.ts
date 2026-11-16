/**
 * Element mixing (a zawgyi's alchemy): five elements, the player brings three into play (the loadout, chosen on the Spells
 * screen). Tapping an element sets it circling Zaw Gyi (two at most; a new one pushes out the oldest). Each circling element
 * gives a small passive boost. INVOKE turns the two circling elements into their spell and puts it in slot 1 (the old slot 1
 * moves to slot 2). Spells are cast from the two slots; each has its own mana cost and cooldown.
 */
export type ElementId = 'fire' | 'water' | 'air' | 'earth' | 'spirit';
export const ELEMENTS: Array<{ id: ElementId; name: string; pali: string; glyph: string; color: string; hex: number; passive: string; learned: string }> = [
  { id: 'fire', name: 'Fire', pali: 'Tejo', glyph: '🔥', color: '#ff7a2a', hex: 0xff7a2a, passive: '+6% damage', learned: 'from the start' },
  { id: 'earth', name: 'Earth', pali: 'Pathavī', glyph: '🪨', color: '#c9a25a', hex: 0xc9a25a, passive: '+4 armor, +6% magic resist', learned: 'Act I: the Undead King' },
  { id: 'air', name: 'Air', pali: 'Vāyo', glyph: '🌪', color: '#bfe8ff', hex: 0xbfe8ff, passive: '+5% move speed, +8% attack speed', learned: 'Act II: the Goblin Chief' },
  { id: 'water', name: 'Water', pali: 'Āpo', glyph: '💧', color: '#4aa8ff', hex: 0x4aa8ff, passive: '+5 mana / s', learned: 'Act III: the Necromancer' },
  { id: 'spirit', name: 'Spirit', pali: 'Leikpya', glyph: '🦋', color: '#7af0ff', hex: 0x7af0ff, passive: '+10% souls, +4% spell vamp', learned: 'Act V: the Weeping Maid' },
];
export const elementOf = (id: ElementId) => ELEMENTS.find((e) => e.id === id)!;

export type SpellId = 'blast' | 'comet' | 'magma' | 'veil' | 'brand' | 'bulwark' | 'cyclone' | 'mire' | 'seal' | 'gale' | 'chain' | 'ascent' | 'tide' | 'elixir' | 'swarm';
export interface SpellDef { id: SpellId; name: string; mana: number; cd: number; desc: string; icon?: string }
const S = (id: SpellId, name: string, mana: number, cd: number, desc: string, icon?: string): SpellDef => ({ id, name, mana, cd, desc, icon });
/** Every pair of elements (order doesn't matter) makes one spell. */
export const SPELLS: Record<string, SpellDef> = {
  'fire+fire': S('blast', 'Alchemy Blast', 65, 4, 'an exploding golden orb', 'icon_blast'),
  'air+fire': S('comet', 'Flame Comet', 80, 5, 'a fast flaming ball that burns through a line of foes'),
  'earth+fire': S('magma', 'Magma Rupture', 100, 8, 'the ground cracks open, then erupts'),
  'fire+water': S('veil', 'Scalding Veil', 100, 12, 'a steam cloud: foes inside burn, you take half damage'),
  'fire+spirit': S('brand', 'Soulfire Brand', 80, 9, 'brands a foe; when it dies it explodes and the brand jumps'),
  'earth+earth': S('bulwark', 'Stone Bulwark', 80, 12, 'a stone wall that stops arrows and bolts (you can stand on it)'),
  'air+earth': S('cyclone', 'Sand Cyclone', 100, 10, 'a whirl that drags foes together'),
  'earth+water': S('mire', 'Mire', 100, 10, 'turns the ground to bog: foes slow, then stick'),
  'earth+spirit': S('seal', 'Golden Seal', 100, 7, 'the sealing circle erupts around you', 'icon_seal'),
  'air+air': S('gale', 'Gale Step', 50, 5, 'a wind dash through foes, knocking them aside', 'icon_dash'),
  'air+water': S('chain', 'Chain Lightning', 80, 6, 'a storm bolt that leaps between foes', 'icon_chain'),
  'air+spirit': S('ascent', 'Butterfly Ascent', 65, 7, 'a leap on butterfly wings, a slam on landing', 'icon_jump'),
  'water+water': S('tide', 'Tide Wave', 80, 8, 'a wave that throws foes back'),
  'spirit+water': S('elixir', 'Spirit Elixir', 80, 20, 'heals 250 + 10% of max health, frees you from snares and slows', 'icon_elixir'),
  'spirit+spirit': S('swarm', 'Soul Swarm', 100, 9, 'soul butterflies that hunt the nearest foes'),
};
export const comboKey = (a: ElementId, b: ElementId) => [a, b].sort().join('+');
export const spellFor = (a: ElementId, b: ElementId): SpellDef => SPELLS[comboKey(a, b)];
export const spellById = (id: SpellId): SpellDef => Object.values(SPELLS).find((s) => s.id === id)!;

/** The three elements on screen (saved). */
export function loadLoadout(): ElementId[] {
  try { const v = JSON.parse(localStorage.getItem('zg.loadout') ?? 'null'); if (Array.isArray(v) && v.length === 3 && v.every((x) => ELEMENTS.some((e) => e.id === x)) && new Set(v).size === 3) return v; } catch { /* default */ }
  return ['fire', 'air', 'water'];
}
export function saveLoadout(l: ElementId[]): void { localStorage.setItem('zg.loadout', JSON.stringify(l)); }

/** The Spells screen (main menu): pick three of the five, see the six spells they make. */
export function buildSpellsPanel(root: HTMLElement, onChange: (l: ElementId[]) => void, onClose: () => void = () => undefined): void {
  let pick = loadLoadout();
  const render = () => {
    const six: SpellDef[] = []; for (let i = 0; i < 3; i++) for (let j = i; j < 3; j++) six.push(spellFor(pick[i], pick[j]));
    root.innerHTML = `<div class="sp-title">Elements <small>choose 3 to bring</small></div>
      <div class="sp-els">${ELEMENTS.map((e) => `<button class="sp-el ${pick.includes(e.id) ? 'on' : ''}" data-el="${e.id}" style="--c:${e.color}"><b>${e.glyph}</b><span>${e.name}</span><i>${e.pali}</i><em>${e.passive}</em><u>${e.learned}</u></button>`).join('')}</div>
      <div class="sp-title">Your six spells</div>
      <div class="sp-list">${six.map((s) => { const k = Object.keys(SPELLS).find((kk) => SPELLS[kk] === s)!.split('+') as ElementId[];
        return `<div class="sp-sp"><span class="sp-k">${elementOf(k[0]).glyph}+${elementOf(k[1]).glyph}</span><b>${s.name}</b><small>${s.desc}</small></div>`; }).join('')}</div>
      <div class="sp-help">In play: tap two elements (they circle you), then <b>INVOKE</b> to put their spell in a slot. Cast from the two slots. Keys: 1 2 3, R, Q E.</div>
      <button class="sp-close">Done</button>`;
  };
  root.addEventListener('click', (ev) => {
    const t = ev.target as HTMLElement; const b = t.closest('[data-el]') as HTMLElement | null;
    if (b) { const id = b.dataset.el as ElementId; if (pick.includes(id)) { if (pick.length > 1) pick = pick.filter((x) => x !== id); } else { pick = [...pick, id].slice(-3); }
      if (pick.length === 3) { saveLoadout(pick); onChange(pick); } render(); }
    if (t.closest('.sp-close')) { if (pick.length < 3) { pick = loadLoadout(); render(); } root.classList.add('hidden'); onClose(); }
  });
  render();
}
