# Zaw Gyi stats system: the calculation plan (proposal)

**Status:** built (Chapter 1, tier 1) in `src/stats.ts`. Naga attacks as built: beam 260 magic, ice shards 150 magic + slow, poison pool 60 magic per tick, lightning strikes 240 magic, seal ring 220 pure. Zaw Gyi starts at **777 health and 333 mana**.

## 0. What changes from today
- **Real numbers everywhere.** Today, damage is counted in "units", and one unit shows as 20 (`HP_UNIT`). That goes. Every hit, health bar and damage number becomes a real value.
- **The scale.** Old enemy health is multiplied by **60**, so the opening fights take the same number of staff hits as now.
- **Damage types.** Every hit is **Physical**, **Magic** or **Pure**. Armor reduces physical damage and Magic Resistance reduces magic. Pure ignores both.

## 1. Zaw Gyi's base stats

| Stat | Level 1 | Per level | Cap |
|---|---|---|---|
| Health | **777** | +25 | none |
| Mana | **333** | +8 | none |
| Attack Damage (AD) | 60 | +2 | none |
| Armor | 3 | +0.15 | none (diminishing) |
| Magic Resistance (MR) | 15% | none | 70% |
| Health regen | 2/s; ×4 (8/s) after 5 s without being hit | none | none |
| Mana regen | 12/s | none | none |
| Attack Speed | 100% | none | 175% |
| Crit Chance / Crit Damage | 5% / ×1.75 | none | 60% / none |
| Lifesteal / Spell Vamp | 0% / 0% | none | 35% / 25% |
| Cooldown Reduction | 0% | none | 40% |
| Slow Resistance | 0% | none | 60% |
| Status Resistance (snares, roots, stuns) | 0% | none | 50% |
| Spell Power | +0% | none | none |
| Move speed | as now | none | +40% |

Each level gives **3 points**. **The whole game runs to level 60** across 10 chapters, and **Chapter 1 ends at about level 6** (see section 8). A level costs **60 + 45 × (level − 1)** souls at the altar; later chapters' enemies drop more souls.

## 2. The four attributes (per point)

| Attribute | Gives |
|---|---|
| **Strength** | +2.5 AD, +10 health, +0.3 health/s, +0.25% lifesteal |
| **Vitality** | +40 health, +0.3 armor, +1% status resistance |
| **Intelligence** | +12 mana, +0.25 mana/s, +1.5% spell power, +0.4% MR |
| **Agility** | +1.5% attack speed, +0.5% move speed, −0.75% cooldowns, +0.4% crit, +0.15 armor |

## 3. The formulas

**Armor (diminishing):** reduction = 0.06·A / (1 + 0.06·A)

| Armor | 3 | 5 | 10 | 15 | 20 | 30 |
|---|---|---|---|---|---|---|
| Physical damage blocked | 15% | 23% | 37.5% | 47% | 55% | 64% |

**Magic Resistance:** the sources add up to the 70% cap. Damage taken = magic damage × (1 − MR).

**Damage Zaw Gyi deals:**
- **Physical (staff, kicks):**
  - AD × move multiplier
  - × crit (×1.75 when it crits)
  - × Fire-orb bonus
  - × (1 − enemy armor reduction, after Armor Penetration)
- **Spells:**
  - spell base
  - × (1 + Spell Power)
  - × (1 + Element Power; Mastery gives +20%)
  - × (1 − enemy MR + Magic Penetration)
- **Lifesteal:** heals that % of the physical damage dealt after armor, on every target hit. **Spell Vamp** does the same for spells; ticking zones count at half.

**Damage Zaw Gyi takes:**
- the hit's damage × (1 − armor or MR reduction; Pure skips this)
- × Earth orb × Scalding Veil (½)
- − Damage Block (from Relics; it never removes more than 50% of a hit)

**Slows and roots:**
- slow strength × (1 − Slow Resistance)
- root or stun time × (1 − Status Resistance)

**Cooldowns:** base × (1 − CDR). **Attack Speed** plays the combo animations faster.

## 4. Hero attack values

| Move | Damage | Type |
|---|---|---|
| Staff combo: Sweep / Rising Cut / Spin Kick / Slam | 1.0 / 1.0 / 1.0 / 2.0 × AD | Physical |
| Twin Kick (light / heavy) | 2.0 / 3.0 × AD | Physical |
| Gale Step and the dash hit | 1.0 × AD | Physical |

**Spells** (mana is the old cost × 3.33, rounded):

| Spell | Mana | Damage |
|---|---|---|
| Alchemy Blast (🔥🔥) | 65 | 180 area |
| Flame Comet (🌪🔥) | 80 | 150 to each foe in the line |
| Magma Rupture (🪨🔥) | 100 | 180 eruption |
| Scalding Veil (🔥💧) | 100 | 24 every 0.5 s; you take ½ damage |
| Soulfire Brand (🔥🦋) | 80 | 21 every 0.5 s, then a 120 burst that jumps |
| Stone Bulwark (🪨🪨) | 80 | a wall (no damage) |
| Sand Cyclone (🌪🪨) | 100 | 18 every 0.5 s, pulls foes in |
| Mire (🪨💧) | 100 | slow, then root |
| Golden Seal (🪨🦋) | 100 | 180 ring |
| Gale Step (🌪🌪) | 50 | 1.0 × AD, physical |
| Chain Lightning (🌪💧) | 80 | 180, then 120 per jump |
| Butterfly Ascent (🌪🦋) | 65 | 120 slam |
| Tide Wave (💧💧) | 80 | 150 + knockback |
| Spirit Elixir (🦋💧) | 80 | heals **250 + 10% max health**, clears snares |
| Soul Swarm (🦋🦋) | 100 | 42 per butterfly |

All spells are magic damage except Gale Step. Twin Kick costs 50.

## 5. Enemies (health × 60; each gets armor, MR and a damage type)

"Hits to down" means hits on a level-1 Zaw Gyi (777 health, 3 armor, 15% MR).

| Enemy | Health | Armor | MR | Attack | Hits to down |
|---|---|---|---|---|---|
| Ghoul | 300 | 0 | 0% | claw 95 phys | 10 |
| Sword warrior | 420 | 5 | 0% | slash 120 phys | 8 |
| Lance warrior | 420 | 6 | 0% | thrust 140 phys | 7 |
| Goblin archer | 240 | 1 | 0% | arrow 85 phys | 11 |
| Horned caster | 240 | 0 | 20% | bolt 110 magic | 9 |
| Female ghost | 240 | 0 | 35% | scream 100 magic, slow 25% for 1.5 s | 10 |
| **Temple Guardian** | 2400 | 12 | 20% | punch 220 phys; wave 150 magic | 4 / 6 |
| **Undead King** | 1800 | 10 | 10% | slash 180, heavy 280 phys | 5 / 3 |
| **Goblin Chief** | 1320 | 4 | 10% | volley of 3 × 100 phys | 3 volleys |
| **Necromancer** | 1080 | 2 | 30% | bolt 140 magic + slow 30% 2 s; grasp 240 magic + root 1 s | 7 / 4 |
| **Undead Commander** | 1560 | 14 | 10% | slash 190, heavy 290 phys | 5 / 3 |
| **Weeping Maid** | 1200 | 0 | 40% | scream 160 magic + slow 35% for 2 s | 6 |
| **Naga** | 9600 | 8 | 25% | beam 260 magic; spit 150 magic + slow 40%; pool 60 magic per 0.9 s; tail slam 300 phys; seal ring 220 **pure** | about 4–9 |
| Spike trap | none | none | none | 120 **pure** | |
| Snare | none | none | none | root 1.1 s (Status Resistance shortens it) | |

**Why it matters:**
- Ghosts and the Maid resist magic, so use the staff.
- Commanders and the Guardian have heavy armor, so use spells.
- Garrison soldiers hit physically, so armor helps there.
- The marsh slows, so Slow Resistance helps there.

## 6. Element orb passives (adjusted to the new stats)

| Orb | Today | New | With Mastery |
|---|---|---|---|
| 🔥 Fire | +6% damage | +6% damage | ×2 |
| 🪨 Earth | −8% damage taken | **+4 armor, +6% MR** | ×2 |
| 🌪 Air | +5% speed | **+5% move speed, +8% attack speed** | ×2 |
| 💧 Water | +2 mana/s | **+5 mana/s** | ×2 |
| 🦋 Spirit | +10% souls | **+10% souls, +4% spell vamp** | ×2 |

## 7. Relics (gear: 3 slots, from bosses, elites, chests and quests)

Relics come in **tiers by chapter**. The Chapter 1 Relics below are **tier 1**: in the game they give **half** the numbers shown. Later chapters drop stronger tiers.

| Relic | Stats | Where |
|---|---|---|
| Goblin Fang Ring | +8% lifesteal, +6 AD | Goblin Chief |
| Garrison Plate Charm | +6 armor, +15 damage block | Undead Commander |
| Drowned Prayer Beads | +15% MR, +3 mana/s | the Drowned Monastery |
| Necromancer's Finger Bone | +12% spell power, +6% spell vamp | Necromancer |
| Weeping Hairpin Thread | +25% slow resistance, +15% status resistance | the Weeping Maid |
| Crown Shard of the King | +80 health, +3 armor | Undead King |
| Hunter's Eye | +10% crit chance, +25% crit damage | the Snare Fields chest |
| Wind-Bell Anklet | +12% attack speed, +6% move speed | Crossroads Knoll |
| Temple Lotus Seal | +10% cooldown reduction, +40 mana | Temple Guardian |

## 8. The 10-chapter curve
**Hero:** a balanced build at the end of each chapter (points split evenly across the four attributes; no Relics).

| End of | Level | Health | Mana | AD | Armor (blocks) |
|---|---|---|---|---|---|
| start | 1 | 777 | 333 | 60 | 3 (15%) |
| **Chapter 1** | **6** | **1090** | **418** | **79** | **5.4 (24%)** |
| Chapter 2 | 12 | 1464 | 520 | 103 | 8.4 (33%) |
| Chapter 3 | 18 | 1839 | 622 | 126 | 11.3 (40%) |
| Chapter 5 | 30 | 2589 | 826 | 172 | 17.1 (51%) |
| Chapter 10 | 60 | 4464 | 1336 | 289 | 31.8 (66%) |

Chapter 1 gives only about a **+40% power gain**, so there is room for nine more chapters.

**Enemies scale by chapter tier:** health ×1.28 and damage ×1.3 per chapter. Ch1 is tier 1.

| Ghoul | Ch1 | Ch5 | Ch10 |
|---|---|---|---|
| Health | 300 | 805 | 2770 |
| Damage | 95 | 272 | 1010 |

**Checks against that chapter's enemies:**

| | Ch1 start | Ch1 end | Ch5 end | Ch10 end |
|---|---|---|---|---|
| Ghoul hits that down Zaw Gyi | 10 | 15 | 19 | 13 |
| Staff hits to kill a ghoul | 5 | 3.8 | 4.7 | 9.6 (about 7 with crits and Relics) |

- Each chapter starts hard and gets easier as you level. The next chapter's enemies then reset it.
- **The Naga** takes about 80–110 s at level 6.
- To tune after the Ch1 playtest: the middle chapters run a little tanky, which the damage step can fix.

## 9. Screens and display
- **Health and mana bars** show "777 / 777" and "333 / 333".
- **Damage numbers:** white for physical, blue for magic, purple for pure, big gold with "!" for crits, green for lifesteal heals.
- **The Stats screen** (a button on the Altar) lists every stat in section 1, with its sources.
- **Relic slots** sit on the same screen.

## 10. Build plan (when approved)
1. **`src/stats.ts`:** base stats, attributes, orbs and relics produce the final stats; plus the damage and mitigation functions (with unit tests).
2. **Enemy table:** health ×60, armor/MR, and per-attack damage and type. `hitHero` carries `{ amount, type, slow?, root? }`.
3. **Hero:** AD, crit, lifesteal, spell vamp, attack speed (animation speed), slow and status resistance, health regen.
4. **HUD:** real numbers and colours for damage types; the Stats screen.
5. **Relics:** drops and slots.
6. **Tests:** e2e thresholds change from units to real values.
