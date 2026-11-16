/**
 * The stats system (plan: docs/stats-plan.md). Real numbers everywhere: Zaw Gyi starts at 777 health and 333 mana.
 * Hits are Physical (armor), Magic (magic resistance) or Pure (ignores both). Level cap 60 over ten chapters; Chapter 1 ends near 6.
 */
import type { ElementId } from './spells';

export type DmgType = 'phys' | 'magic' | 'pure';
/** One enemy attack: damage, its type, and an optional slow (fraction, seconds) or root (seconds). */
export interface Atk { dmg: number; type: DmgType; slow?: number; slowT?: number; root?: number }
/** Old enemy health was in units; real health is units x 60, so a level-1 staff hit (60 AD) still takes one unit. */
export const HP_SCALE = 60;
/** Spell damage per old unit, before Spell Power. */
export const SPELL_UNIT = 60;
/** Chapter 1 is tier 1; each chapter after multiplies enemy health by 1.28 and damage by 1.3. */
export const tierHp = (ch: number) => Math.pow(1.28, ch - 1), tierDmg = (ch: number) => Math.pow(1.3, ch - 1);

/** Physical damage blocked by armor (diminishing): 5 = 23%, 10 = 37.5%, 20 = 55%. */
export const armorBlock = (a: number) => (0.06 * a) / (1 + 0.06 * Math.abs(a));

/** Each foe's defences, by kind. */
export const DEF: Record<string, { armor: number; mr: number }> = {
  ghoul: { armor: 0, mr: 0 }, sword: { armor: 5, mr: 0 }, lance: { armor: 6, mr: 0 }, archer: { armor: 1, mr: 0 }, caster: { armor: 0, mr: 0.2 }, ghost: { armor: 0, mr: 0.35 },
  guardian: { armor: 12, mr: 0.2 }, king: { armor: 10, mr: 0.1 }, chief: { armor: 4, mr: 0.1 }, necro: { armor: 2, mr: 0.3 }, commander: { armor: 14, mr: 0.1 }, banshee: { armor: 0, mr: 0.4 },
  naga: { armor: 8, mr: 0.25 }, monk: { armor: 3, mr: 0.15 }, abbot: { armor: 6, mr: 0.25 },
};
export const defOf = (kind: string) => DEF[kind] ?? { armor: 0, mr: 0 };

/** Every enemy attack (Chapter 1, tier 1). */
export const ATK = {
  ghoul: { dmg: 95, type: 'phys' }, monk: { dmg: 115, type: 'phys' }, abbot: { dmg: 200, type: 'phys' }, sword: { dmg: 120, type: 'phys' }, lance: { dmg: 140, type: 'phys' }, archer: { dmg: 85, type: 'phys' },
  caster: { dmg: 110, type: 'magic' }, ghost: { dmg: 100, type: 'magic', slow: 0.25, slowT: 1.5 },
  king: { dmg: 180, type: 'phys' }, chief: { dmg: 100, type: 'phys' }, commander: { dmg: 190, type: 'phys' }, banshee: { dmg: 160, type: 'magic', slow: 0.35, slowT: 2 },
  necroSlash: { dmg: 150, type: 'phys' }, necroBolt: { dmg: 140, type: 'magic', slow: 0.3, slowT: 2 }, necroGrasp: { dmg: 240, type: 'magic', root: 1 },
  guardianPunch: { dmg: 220, type: 'phys' }, guardianWave: { dmg: 150, type: 'magic' },
  nagaBreath: { dmg: 260, type: 'magic' }, nagaShard: { dmg: 150, type: 'magic', slow: 0.4, slowT: 2 }, nagaPool: { dmg: 60, type: 'magic' },
  nagaStrike: { dmg: 240, type: 'magic' }, nagaRing: { dmg: 220, type: 'pure' },
  dummy: { dmg: 95, type: 'phys' }, spike: { dmg: 120, type: 'pure' },
} satisfies Record<string, Atk>;
export type AtkId = keyof typeof ATK;
export const atk = (id: AtkId): Atk => ATK[id] as Atk;

export type AttrId = 'str' | 'vit' | 'int' | 'agi';
/** The four attributes, and what one point gives. */
export const ATTRS: ReadonlyArray<{ id: AttrId; name: string; desc: string }> = [
  { id: 'str', name: 'Strength', desc: '+2.5 attack damage, +10 health, +0.3 health/s, +0.25% lifesteal' },
  { id: 'vit', name: 'Vitality', desc: '+40 health, +0.3 armor, +1% status resistance' },
  { id: 'int', name: 'Intelligence', desc: '+12 mana, +0.25 mana/s, +1.5% spell power, +0.4% magic resist' },
  { id: 'agi', name: 'Agility', desc: '+1.5% attack speed, +0.5% move speed, −0.75% cooldowns, +0.4% crit, +0.15 armor' },
];

export interface HeroStats {
  maxHp: number; maxMp: number; ad: number; armor: number; mr: number; hpRegen: number; mpRegen: number; as: number; crit: number; critDmg: number;
  lifesteal: number; spellVamp: number; cdr: number; slowRes: number; statusRes: number; sp: number; speed: number; block: number; dmgMul: number; soulMul: number;
}
type Bonus = Partial<Omit<HeroStats, 'dmgMul' | 'soulMul' | 'critDmg'>> & { critDmg?: number };

/** Relics: three slots. Chapter 1 drops tier 1 (half the listed numbers are already applied here). */
export const RELICS: Record<string, { name: string; from: string; bonus: Bonus; text: string }> = {
  fang: { name: 'Goblin Fang Ring', from: 'the Goblin Chief', bonus: { lifesteal: 0.04, ad: 3 }, text: '+4% lifesteal, +3 attack damage' },
  plate: { name: 'Garrison Plate Charm', from: 'the Undead Commander', bonus: { armor: 3, block: 8 }, text: '+3 armor, blocks 8 per hit' },
  beads: { name: 'Drowned Prayer Beads', from: 'the Drowned Abbot', bonus: { mr: 0.075, mpRegen: 1.5 }, text: '+7.5% magic resist, +1.5 mana/s' },
  finger: { name: "Necromancer's Finger Bone", from: 'the Necromancer', bonus: { sp: 0.06, spellVamp: 0.03 }, text: '+6% spell power, +3% spell vamp' },
  thread: { name: 'Weeping Hairpin Thread', from: 'the Weeping Maid', bonus: { slowRes: 0.125, statusRes: 0.075 }, text: '+12.5% slow resist, +7.5% status resist' },
  crown: { name: 'Crown Shard of the King', from: 'the Undead King', bonus: { maxHp: 40, armor: 1.5 }, text: '+40 health, +1.5 armor' },
  eye: { name: "Hunter's Eye", from: "the trap-setters' chest", bonus: { crit: 0.05, critDmg: 0.125 }, text: '+5% crit chance, +12.5% crit damage' },
  bell: { name: 'Wind-Bell Anklet', from: "the lookout's cache", bonus: { as: 0.06, speed: 0.03 }, text: '+6% attack speed, +3% move speed' },
  lotus: { name: 'Temple Lotus Seal', from: 'the Temple Guardian', bonus: { cdr: 0.05, maxMp: 20 }, text: '−5% cooldowns, +20 mana' },
};
export type RelicId = keyof typeof RELICS;

/** Boons: what freed villagers (and his own garden) give him for good, outside the Relic slots. */
export const BOONS: Record<string, { name: string; bonus: Bonus; text: string }> = {
  weaver: { name: 'The Old Weaver', bonus: { maxHp: 60 }, text: '+60 max health (she mends his robes)' },
  herbalist: { name: 'The Herb Woman', bonus: { hpRegen: 2 }, text: '+2 health / s (her poultices)' },
  lampboy: { name: "The Lamp-Keeper's Boy", bonus: { mpRegen: 3 }, text: '+3 mana / s (he lights the village lamps again)' },
  ferry: { name: 'The Ferry-Woman', bonus: { speed: 0.04 }, text: '+4% move speed (she knows the river roads)' },
  crucible: { name: 'His Old Crucible', bonus: { sp: 0.08 }, text: '+8% spell power' },
};

/** Souls for the next level: 60 + 45 x (level - 1). */
export const levelCost = (level: number) => 60 + 45 * (level - 1);
export const MAX_LEVEL = 60;

/** Everything about Zaw Gyi from level, attributes, the circling elements, Relics and story rewards. */
export function heroStats(level: number, a: Record<AttrId, number>, held: ElementId[], relics: string[], heart: boolean, boons: string[] = []): HeroStats {
  const n = (e: ElementId) => held.filter((h) => h === e).length, L = level - 1;
  const s: HeroStats = {
    maxHp: 777 + 25 * L + 10 * a.str + 40 * a.vit + (heart ? 100 : 0),
    maxMp: 333 + 8 * L + 12 * a.int,
    ad: 60 + 2 * L + 2.5 * a.str,
    armor: 3 + 0.15 * L + 0.3 * a.vit + 0.15 * a.agi + 4 * n('earth'),
    mr: 0.15 + 0.004 * a.int + 0.06 * n('earth'),
    hpRegen: 2 + 0.3 * a.str,
    mpRegen: 12 + 0.25 * a.int + 5 * n('water'),
    as: 1 + 0.015 * a.agi + 0.08 * n('air'),
    crit: 0.05 + 0.004 * a.agi, critDmg: 1.75,
    lifesteal: 0.0025 * a.str, spellVamp: 0.04 * n('spirit'),
    cdr: 0.0075 * a.agi, slowRes: 0, statusRes: 0.01 * a.vit,
    sp: 0.015 * a.int, speed: 1 + 0.005 * a.agi + 0.05 * n('air'), block: 0,
    dmgMul: 1 + 0.06 * n('fire'), soulMul: 1 + 0.1 * n('spirit'),
  };
  for (const id of [...relics, ...boons]) { const b = (RELICS[id] ?? BOONS[id])?.bonus; if (!b) continue; for (const k of Object.keys(b) as Array<keyof Bonus>) (s as unknown as Record<string, number>)[k] += b[k] ?? 0; }
  s.mr = Math.min(0.7, s.mr); s.as = Math.min(1.75, s.as); s.crit = Math.min(0.6, s.crit); s.lifesteal = Math.min(0.35, s.lifesteal); s.spellVamp = Math.min(0.25, s.spellVamp);
  s.cdr = Math.min(0.4, s.cdr); s.slowRes = Math.min(0.6, s.slowRes); s.statusRes = Math.min(0.5, s.statusRes); s.speed = Math.min(1.4, s.speed);
  return s;
}

/** Damage Zaw Gyi takes from one hit (before the Veil and invulnerability). */
export function mitigate(hit: Atk, st: HeroStats): number {
  const raw = hit.dmg; let d = raw;
  if (hit.type === 'phys') d *= 1 - armorBlock(st.armor); else if (hit.type === 'magic') d *= 1 - st.mr;
  if (st.block > 0 && hit.type !== 'pure') d -= Math.min(st.block, d * 0.5);
  return Math.max(1, d);
}

/** The Stats screen rows. */
export function statsRows(s: HeroStats): Array<[string, string]> {
  const pc = (v: number) => `${(v * 100).toFixed(v < 0.1 && v > 0 ? 1 : 0)}%`;
  return [
    ['Health', `${Math.round(s.maxHp)}  (+${s.hpRegen.toFixed(1)}/s, ×4 out of combat)`], ['Mana', `${Math.round(s.maxMp)}  (+${s.mpRegen.toFixed(1)}/s)`],
    ['Attack damage', s.ad.toFixed(1)], ['Spell power', `+${pc(s.sp)}`],
    ['Armor', `${s.armor.toFixed(1)}  (blocks ${pc(armorBlock(s.armor))} physical)`], ['Magic resist', pc(s.mr)],
    ['Attack speed', pc(s.as)], ['Crit', `${pc(s.crit)} for ×${s.critDmg.toFixed(2)}`],
    ['Lifesteal', pc(s.lifesteal)], ['Spell vamp', pc(s.spellVamp)],
    ['Cooldowns', `−${pc(s.cdr)}`], ['Move speed', pc(s.speed)],
    ['Slow resist', pc(s.slowRes)], ['Status resist', pc(s.statusRes)],
    ...(s.block > 0 ? [['Damage block', String(s.block)] as [string, string]] : []),
  ];
}
