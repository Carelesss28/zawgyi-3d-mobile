# AGENTS.md — Zaw Gyi (mobile 3D action RPG, browser)

Read this first. It covers the **story the whole game is built around**, what is already in the game, and how to work in this repo. All character and place names are **placeholders** the owner may rename later; keep them consistent until then.

- **Canonical lore and Chapter 1 script:** [docs/ch1-script.md](docs/ch1-script.md). If anything conflicts with it, it wins.
- **Chapter 1 map and quest plan (image):** [docs/ch1-quest-plan.png](docs/ch1-quest-plan.png), drawn by [art/draw_quest_plan.py](art/draw_quest_plan.py).
- **Superseded:** the *story* in `CHAPTER_01_STORY_BUILDING_REFERENCE.md` (missing master, seal fragments, guardian finale) is replaced by the lore below. Its 3D-asset production notes are still useful.

---

## 1. The lore (the reason for every fight)

**The golden age.** The **Old Wizard**, the king's most trusted advisor, led the kingdom into a golden age. His apprentice and heir was **Zaw Gyi**, a righteous alchemist (*zawgyi*) who healed, protected and gave the people hope. The people came to love Zaw Gyi more than their king.

**The Old Wizard left.** Tired of the court's scheming, he gave up his post and walked away. *Where he went, whether he lives, and what he remembers are a deliberate mystery. Do not explain them.*

**The whisper.** The **Council of Nine Witches**, the Old Wizard's rivals at court, told the king a man the people worship is a crown waiting to be taken.

**The sealing.** The king and the witches drugged Zaw Gyi and **sealed him alive** in the old jungle temple.
- **Why seal, not kill:** sealing **erases him from every memory in the land.** The people forgot their saint and came to remember the **witches** as their saints.

**The princess.** Zaw Gyi's childhood friend, who loved him, overheard her father and the witches plotting. She went to the temple **alone and in secret**.
- **The crack:** all she could do was press her **royal blood** into the ritual (royal blood made the seal), which **cracked it**.
- **The cost:** she **turned to stone** while watching him being sealed.
- **Her memory survived:** she was already stone when the erasure happened. The world forgot her too.
- **The witness:** her **trusted maid** saw her slip away, followed, and saw it happen. The erasure later wiped why she was grieving.

**The witches take the throne.** Right after the sealing they **killed the king** and bound his corpse to the temple as Zaw Gyi's jailer.
- **The fake king:** their **leader (Witch 1)** took the king's form and has ruled as the king ever since.
- **The statue:** they carried the princess's statue to the **palace**. They want her royal blood and hope she will change back.

**How they last.** Each witch has a land assigned to her and **drains its life force** to stay young. That's why the land is dying and evil creatures roam everywhere.

**500 years later**, the princess's crack finally spreads and **the seal breaks**. Zaw Gyi wakes, angry, in dark robes (**Dark Zaw Gyi**). This is his **revenge arc**.

**The present-day ally.** **Ma Hnin**, a chosen girl from a hidden village, has dreamed of a stranger's resurrection without knowing who he is. She becomes his first ally.

### Ten chapters

| Chapter | Boss | Notes |
|---|---|---|
| **1** | **the Naga dragon**, mind-controlled by the seal and guarding his prison | **The Sealed Zone**: the jungle prison around the temple. **No witch.** |
| 2 | **Witch 9** | |
| 3 | **Witch 8** | |
| 4–9 | **Witches 7 → 2** | Ch 5: the **princess realisation + costume change** (Dark Zaw Gyi to true Zaw Gyi) |
| 10 | **Witch 1**, the leader, the fake king | the palace, where the princess's statue waits: the rescue |

- **Princess memory pieces:** Zaw Gyi earns **one per chapter**; her face sharpens chapter by chapter.
- **Mini-boss for later:** a royal captain who helped the sealing; the chapter is not decided.

### Consistency rules (no plot holes)

1. **Nobody in the present remembers Zaw Gyi**, except in dreams (Ma Hnin) or as feelings the curse left behind (the Banshee maid).
2. **Nobody remembers the princess**, except the witches.
3. **Chapter 1 never names the princess.** The first hint is the Necromancer's line in Act III: *"Even she forgot you… oh wait. She didn't."*
4. **Zaw Gyi remembers the betrayal** (the feast, the king, hooded women chanting), **not the princess's sacrifice**.
5. **No witch appears in Chapter 1** except as hooded figures in memories, and the fake king in the epilogue shot.
6. **The undead king in the temple is the real king.** The king on the throne is Witch 1.
7. **The costume change does not happen in Chapter 1.** He plays as Dark Zaw Gyi throughout.
8. **The Naga is spared, not killed:** Zaw Gyi *chooses* mercy when its control breaks. It's an ally for a later chapter.
9. **The hill temple was his own:** the saint the pilgrims carried the sick to was Zaw Gyi. The Nine sealed him in his own temple. His herb garden lies under the hill.
10. **The Nine's servants chiselled away** his name and face (the Grand Stair, the healer statue, the monastery records) right after the sealing, so nothing written would outlast the forgetting.
11. **The curse makes eyes slide off him:** people read the stair's inscription and feel only "an old saint, whoever he was". That is why nobody worked it out in 500 years.
12. **The village emptied slowly:** the lamps went out when nobody could say whose temple it was; then the witches' draining killed the fields, the river rose, and the goblins raided (the burnt south quarter).
13. **Ma Hnin stays** in the old village because her dreams led her there first, and he will need its altar.
14. **The freed captives were taken from this village:** they come home to their own houses, by the only light left (Ma Hnin's altar).
15. **The river monastery:** the hill temple's brothers kept its records there (the scraped records chest is theirs). When the curse made them forget, they drifted away, and **U Lar Ba's followers** (the man-eating monk of Myanmar ghost lore) moved in: they took travellers off the river road and ate them. The river rose (when the Naga was bound) and drowned them; the **Drowned Monks** still walk their alms round under the water, still hungry. The **Drowned Abbot** is U Lar Ba's chief disciple; U Lar Ba himself escaped the flood (*"he went where the water could not follow"*) and is unseen in Chapter 1: a hook for a later chapter. The brothers hid one page from the chisels under the Abbot's seat. Ma Hnin warns of the monastery after her rescue.
16. **The princess climbed by night up the Night Path** (the narrow steps on the hill's north cliff), and her maid followed her that way. The red silk thread on its thorns is the maid's.
17. **Soul Shrines are old pilgrim waystones the saint blessed:** they answer only to his soul.

---

## 2. Chapter 1, *The Sealed Zone*: target design

**Design rule: every major encounter changes what Zaw Gyi understands.** The chapter answers *"Can I escape?"* and opens *"Who saved me?"*

**Each region has a job in the prison:**

| Region | Job |
|---|---|
| Goblin Hunting Grounds | **capture** people |
| Bone Wastes | the Necromancer **raises the captives** |
| Undead Garrison | **patrols the roads out** |
| Ghost Marsh | **holds trapped spirits** |
| Naga's Lair | **guards the gate** |

**Ma Hnin** knows the present and he remembers fragments of the past. Their short talks show what changed; she prays to the "Nine Saints", the witches. She reads the land for him as well as running the altar.

| Step | Region | Boss | Beat | What he learns |
|---|---|---|---|---|
| Prologue | Relief Chamber | none (playable awakening) | broken seal, short flashes: a cup, a smile, nine hooded shapes | betrayal, no context yet |
| I-a | Lotus Court | **Temple Guardian** | its core shows the seal was cracked **from outside** | someone came (he denies it) |
| I-b | Offering Hall terrace | **Undead King** | *"They promised me forever… They took my face."* | **the first emotional turning point:** revenge feels empty, and who took his face? |
| II | Goblin Hunting Grounds | **Goblin Chief** | free **Ma Hnin**; she tells him it's been 500 years | time |
| III | Bone Wastes | **Necromancer** | *"Even she forgot you… oh wait. She didn't."* | erasure was deliberate; "she?" |
| IV | Undead Garrison | **undead commander** | gate orders: *"None leaves the valley. By order of the Nine."* | a name for the Nine |
| V | Ghost Marsh | **Banshee maid** | a quiet scene after the fight: *"I can't remember her face."* | unease, nothing explained |
| Finale | Naga's Lair | **Naga** | the control visibly breaks; **Zaw Gyi chooses to spare it** | mercy, his one small act of it |
| Ending + epilogue | gate, palace | | the childhood stars memory as the reward for escaping; the fake king and a covered statue | "Who saved me?" |

- **Act order (approved by the owner, 13 Nov 2026; don't change without asking):** Stone Warden → Undead King → the 4 Curse Shards (Acts II–V, any order; recommended II, III, IV, V; each boss drops one) → the lair barrier → the Naga → the gate.
- **Chapter 1 princess memory piece** (the reward at the gate): two children on the temple wall at dusk. *"Promise you'll show me the stars from the very top."* Her face is blurred and her name is never spoken.
- **Other regions:** **Jungle Crossroads** (middle: roaming mixed packs) and **Sunken Monastery** (far south: hidden memory fragments).
- **Progress:**
  - **Soul butterflies** (*leikpya*) drop from kills; Ma Hnin at the **altar** (Shrine terrace) turns them into **levels** (+3 attribute points each).
  - **Elements are freed one per act** (the seal tore his alchemy apart and gave each element to a jailer): Prologue 🔥 Fire; I-b 🪨 Earth; II 🌪 Air (+ Twin Kick); III 💧 Water; IV +100 max health; V 🦋 Spirit.
  - **Hidden extras:** 5 chests of souls and 6 memory fragments.

---

## 3. What's in the game right now

**Live:** https://zawgyi-3d-test.vercel.app (Chapter 1 map). `/?map=arena` is the small test arena used by most tests.

**Implemented:**
- **Hit effects (the owner's 4×4 sheets in `public/assets/vfx/`):** slash arcs on the staff hits, wind on kicks, a ground crack on the slam, sparks on every hit, a heal pillar, a level-up pillar and death smoke (`hfx` in game.ts; `Fx.planeFlip` lays a sheet flat around the hero).
- **The hero:** the staff fighter's 4-hit combo, 4 skills (Alchemy Blast, Golden Seal, Twin Kick, Chain Lightning), dash, jump (clears obstacles under about 0.9 m) and a **double jump** (tap again in the air: a front flip, about 2 m high; with the standing rules above), red afterimages on the combo, and touch controls with a joystick.
  - **the combo's 2nd hit (Rising Cut) stuns** minions and elites for 0.5 s (elites 60% as long; the Warden, Necromancer and Naga are immune).
  - **Leap Strike** (V, or the LEAP button above DASH; 6 s cooldown): blinks behind an enemy within 10 m (the one he faces, archers/casters/ghosts first), strikes for 1.5x attack damage and stuns 0.3 s.
  - **ledges:** on foot he never walks or dashes off a drop deeper than 2 m (`LEDGE`; he slides along the edge: take the stairs). A jump can still carry him off; falls deeper than 3.5 m (`FALL_SAFE`) cost 6% max health per metre past that (never lethal).
- **Standing on things** (`walk.top` / `topCh1`, hero movement in game.ts): every obstacle has a top height (`topY` in chapter1.ts; 99 = too tall). On foot he steps up anything under `STEP_UP` (0.32 m); in the air he crosses anything lower than his feet, lands on it and can walk across its top; walking off an edge makes him fall (he can still use his air jump). Walls (99), canals, the river, the map edge and the lair barrier block at any height.
- **The seal pillar** (`buildSealPillar`, `CH1.sealPillar`): the blue crystal pillar the Nine sealed him in (intro panels 7-12), burst open at the front with the princess's red crack down its back, on a two-step dais in the **Relief Chamber**. He wakes standing just south of it (`CH1.spawn`, facing out). The dais steps and the fallen block can be stood on.
- **Layout** (plan: [docs/ch1-relayout-plan.png](docs/ch1-relayout-plan.png)): the journey runs west to east.
  - **the temple hill (far west):** the temple is shifted `TX` (177 m) west and stands on a plateau `TY` (8 m) high (`PLATEAU`, `plateauH` in chapter1.ts). It is built inside a group raised TY with its heights computed as if on the ground (`TYH` is 0 while it builds), then its collision tops are lifted. Cliffs all round; the **Grand Stair** (`STAIR`, a 30 m ramp of steps) runs east down to the **Temple Bridge**. A hidden **back path** up the north cliff: four rock pillars, each a double jump above the last, behind brambles.
  - **the Old Village (the hub, map centre, about 75 m across):** abandoned when nobody could remember whose temple it was. A crossroads village: `VILLAGE_LANES` join the plaza to every trail that ends round it (Temple Bridge, marsh road, crossroads and hunting-ground trails, both north trails), plus lanes to a washing place on the river and to the fields. About 30 stilt houses stand along the lanes (ladders toward the lane, some in a second row, infill between lanes), the south quarter burnt where the goblins came in; yards with jars, woodpiles, bamboo fences and palms; an old banyan above the plaza; vegetable plots on the edge. Plaza, the village shrine (a small stupa and a robed statue with its face scraped off), the well, **Ma Hnin's altar** (she waits here after her rescue), a Soul Shrine and an inscription. Freed captives come home here (`VILLAGE_SPOTS`).
  - **round the hub:** Bone Wastes north, Garrison north-east, Hunting Grounds south-east, the **Ghost Marsh** south-west round the river's bend (the Weeping Maid's camp is now the Weeping Pool, far south-east before the lair), the Sunken Monastery south of the river, Crossroads east, the Naga's lair far east.
  - **the river** runs down the east foot of the hill, then west along its south side. Three bridges: the Temple Bridge, the monastery bridge, the north bridge.
  - **mechanics:** **Soul Shrines** (`SHRINES`: wake by touching, heal while near, TRAVEL button or G between awake shrines); **inscriptions** (`STELES`, read by walking up); **brambles** (`BRAMBLES`, `burnBrambles`: any fire spell exploding beside them clears them; one guards the foot of the **Night Path** (`NIGHT_PATH`: 27 narrow 0.3 m steps up the hill's north cliff, a parapet, a niche with a lotus, the maid's red thread, an inscription at the top), one his herb chest); **captives** in the cages of camps 2, 16 and 17 go home to the village when their camp is cleared and he walks up, each giving a **boon** (`BOONS` in stats.ts: the Old Weaver +60 health, the Herb Woman +2 health/s, the Lamp-Keeper's Boy +3 mana/s); the **Alchemist's Garden** (`GARDEN`, north-west under the hill) gives a memory and **His Old Crucible** (+8% spell power).
- **Terrain** (`src/chapter1.ts`; plan image [docs/ch1-terrain-plan.png](docs/ch1-terrain-plan.png)):
  - **the temple is 1.4x** (`PX = 0.07`). Anchors written in old world metres go through `warpCh1` (1.4x inside 48 m, easing to no change at 140 m), so the far map and the lair stay put. Trail points near a camp move with the camp (`W2`). Tests use `__zg.ch1.W(x, z)` for old coordinates.
  - **hills** (`HILLS`): Goblin Lookout (camp G1, +4 m), Hunters' Ridge (G3, +3 m), Garrison Hill (U3 and the Commander, +4.2 m), Barrow Mound (B2, +3 m), Crossroads Knoll (+3.5 m, a chest on top). Flat tops, sandstone cliffs, 1:4 ramps that follow the trails, and a half-height shelf at the back for a double-jump climb.
  - **trenches** (`TRENCHES`): the Garrison Trench (7 m wide, 3 m deep, log palisade, stakes) and Naga's Scar (8 m, 4 m, rock walls). Ramps at both ends, flat timber bridges wherever a trail crosses, and one broken bridge on each (a 2.4 m gap to jump).
  - **how it works:** `terrainH(x, z)` is the jungle ground height; any ground cell with a neighbour more than 0.32 m lower becomes a ledge (grid 5, `topY` = its height), so the standing rules decide what can be climbed. Minions keep to ramps. The ground mesh is 16 m tiles, detailed only where the terrain moves, grouped in 48 m blocks so it culls.
- **The south-west fields** (`SITES`, `POOLS`, `TRAPS`, `LOOT`, `FRAGMENTS` in chapter1.ts; plan [docs/ch1-fill-plan.png](docs/ch1-fill-plan.png); quests to come in [docs/ch1-quest-expansion.md](docs/ch1-quest-expansion.md)):
  - **Sunken Monastery** (118, -112): flooded courts you wade through (slower), a leaning stupa, a raised prayer hall with columns and a monk statue, a ring of ruined monks' cells, 3 sluice stones (for a later quest), the records chest, 2 drowned-monk camps.
  - **Empty Village** (50, -84): 6 stilt huts (3 burned, smoking), open cages, a well, a cart, broken fences, a goblin camp. Reached by the trail from the south river bridge.
  - **Snare Fields** (22, -136): 8 spike pits (−20 health) and 6 snares (hold you 1.1 s); jump over them. A watchtower climbed by crates (1.2 m, 2.4 m, deck at 3.6 m) with a chest on top; an archer camp.
  - **5 opening chests** (souls fly to you) and **6 Lost Fragments** (lines of the childhood memory, shown in a banner): 3 at the monastery, 1 in a village hut, 1 on the Crossroads Knoll, 1 at the bottom of the Naga's Scar.
- **Atmosphere** (`src/atmosphere.ts`, created in game.ts; off under automated tests, `?fx=1` forces it on, `?fx=0` off):
  - **glow and grading:** an EffectComposer with bloom (fires, spells, souls), colour grading (tint, saturation, contrast, cool shadows / warm light) and a soft vignette. The menu's Controls has a "Glow and colour" checkbox (`zg.glow`).
  - **region moods** (`MOODS`, zones passed from game.ts): sun colour and strength, sky fill, fog, grading and which particles drift, blended as he walks: golden temple, cold green wasteland, teal marsh, misty monastery, red lair, steel garrison, warm hunting grounds, plain jungle between.
  - **cloud shadows:** every lit material gets drifting cloud shade on its direct sunlight (`cloudify`, added to new materials every 2 s).
  - **near the hero:** swaying grass clumps and wildflowers (instanced, 8 m chunks, only where `grassAt` in chapter1.ts allows: open jungle ground off trails, pools, camps, the wasteland and the lair), fireflies, golden dust, spirit wisps, lair embers, falling leaves or ash, butterflies.
  - **ground and water (chapter1.ts):** the ground shader breaks up the texture tiling and adds lush and dry patches, moss and bare earth; trails have crisper edges and grit; the monastery pools have their own still-water shader (shoreline foam, ripple rings, glints).
  - **slow devices:** `adaptQuality` asks `atmo.degrade()` first: bloom off, then less grass, then no grading, before it lowers the resolution.
- **Performance:** 60 fps cap by default (`fpsCap`; a "120 fps mode" checkbox in the menu's Controls panel), props beyond ~50 m and trees beyond ~85 m are hidden, bosses and story characters beyond 70 m are hidden, phones use a 1024 PCF shadow map, and quality drops resolution in steps if it can't hold ~50 fps.
- **The map:** the ruined temple (5 rooms, terraces, ruined stairs, wall breaches), a **jungle valley** about 594 × 487 m (grown 1.4x each way, see *The grown valley*) with a fog wall at the edge, a river with **3 timber bridges**, trails, the wasteland, bamboo, mossy logs and rock pillars, in Dota-like daylight.
- **Enemies:**
  - **bosses:** Temple Guardian (lotus court), Necromancer (wasteland), **Naga dragon** (far-east lair, 5 elemental strikes, 32-bone serpent spine)
  - **minions:** ghoul, sword warrior, lance warrior, horned caster, female ghost (sound-wave scream), goblin archer
  - **camps:** **14 camps arranged by lore region** (`CH1.camps[].region`): Goblin Hunting Grounds (3, archers and ghouls; G2 has the cage for Ma Hnin), Bone Wastes (3), Undead Garrison (3), Ghost Marsh (3, west bank), Jungle Crossroads (2). Each has a campfire, a shelter and an evil prop (ritual circle, cauldron, totems, cage, graves), and trails lead to all of them.
  - **the Undead King** (`Minion` kind `king`, his own Tripo model `king.glb`) waits on the Offering Hall terrace (`CH1.undeadKing`).
- **The ending:** the gate and treasure behind the Naga. Killing it, then reaching the treasure, shows the "Chapter 1 Complete" screen.
- **Souls** (`src/souls.ts`, `Souls`): the currency. Every fallen foe releases soul butterflies (the owner's art: `art/source/ui/soul_butterfly.png` → `public/assets/ui/soul.png`) that rise, flutter, then fly to Zaw Gyi; the counter sits under the health bar. Values (`soulValue` in game.ts): small minions 3–5, elites 30–35, bosses 35–120.
- **Stats** (`src/stats.ts`; plan and numbers in [docs/stats-plan.md](docs/stats-plan.md); unit tests `tests/stats.test.ts`). Real numbers everywhere, no hidden units:
  - **Zaw Gyi at level 1:** 777 health, 333 mana (12/s), 60 attack damage, 3 armor, 15% magic resist, 2 health/s (×4 after 5 s unhurt), 5% crit for ×1.75. Each level: +25 health, +8 mana, +2 attack damage, +0.15 armor.
  - **damage types:** every hit is Physical (armor: blocked = 0.06A / (1 + 0.06A)), Magic (magic resist, cap 70%) or Pure. Staff, kicks and Gale Step are physical (units × attack damage, can crit, lifesteal); spells are magic (units × 60 × spell power, spell vamp). Damage numbers: white physical, blue magic, gold "!" crits, green heals.
  - **enemies:** health is the old units × 60 (`HP_SCALE`). Every foe has armor and magic resist (`DEF`) and every attack has its own damage, type and slow/root (`ATK`, passed through `hitHero(x, z, heavy, atk)`). Ghosts resist magic, soldiers have armor. Chapter tiers: health ×1.28 and damage ×1.3 per chapter (`tierHp`, `tierDmg`).
  - **levels:** at Ma Hnin's altar (stand within 4.5 m of her on the Shrine terrace; ALTAR button or T). Cost 60 + 45 × (level − 1) souls, 3 points each, cap 60 over the whole game (Chapter 1 ends near level 6).
  - **attributes per point:** Strength +2.5 attack damage, +10 health, +0.3 health/s, +0.25% lifesteal; Vitality +40 health, +0.3 armor, +1% status resist; Intelligence +12 mana, +0.25 mana/s, +1.5% spell power, +0.4% magic resist; Agility +1.5% attack speed, +0.5% move speed, −0.75% cooldowns, +0.4% crit, +0.15 armor.
  - **Relics** (`RELICS`, tier 1 in Chapter 1): 9, from the Temple Guardian, Undead King, Goblin Chief, Necromancer, Commander, Weeping Maid and three chests (monastery records, trap-setters, the Knoll lookout). Three worn at once; the altar's "Stats & Relics" panel lists every stat and swaps Relics.
  - **mana costs** (old × 3.33): spells 50–100 (`SPELLS` in spells.ts); Spirit Elixir heals 250 + 10% of max health.
  - **enemy health bars:** small bars over hurt or nearby minions; elites and bosses use the big boss bar.
- **Story dialogue** (`src/dialogue.ts`, scenes in `src/story.ts`): visual-novel style. It shows letterbox bars, portraits left and right with the speaker lit, a parchment name box, and sepia memory flashbacks. It plays once at the prologue, after the Guardian, Undead King, Necromancer and Naga fall, and as the ending memory before the completion screen. **Portraits:**
  - **the owner's 2D anime art** (sources in `art/source/portraits/`, resized into `public/assets/portraits/<id>.png`): `zawgyi_dark`, `mahnin`, `king`, `necro`, `maid`, `fakeking`, plus `child_zawgyi` and `child_princess` (her face obscured) for the ending memory
  - **facing:** the art faces inward. Zaw Gyi faces right; partners face left, so it isn't mirrored.
  - **stand-ins:** `goblin`, `commander` and `naga` are still renders of the 3D models (`art/render_portraits.py`), and `guardian` has no portrait (a silhouette).
  - **Chapter 1 Zaw Gyi** has a black void under his hood, so never draw his face. Scenes are off under automated tests (`navigator.webdriver`); tests call `__zg.playScene(id, true)`.
- **Prologue** (`src/intro.ts`): **12 illustrated panels** (sources in `art/source/intro/intro_NN.png`, web copies in `public/assets/intro/*.jpg`) with pan and zoom, crossfades and typed narration (generic: "the king", "the princess"; names are pending). It plays automatically on the first Start (`localStorage zg.introSeen`; not under automated tests), and the menu's **Prologue** button replays it. Tap advances; Skip or Esc ends it.
- **Main menu** (the `#start` overlay): the owner's painted key art (`art/source/menu/menu_bg.png` → `public/assets/menu/menu_bg.jpg`) fills the screen with a slow drift; the title and menu (Start, Prologue, Controls) sit on the **right** over the storm sky. The earlier 3D menu scene (`src/menu.ts`, Throne clip, turntable) is kept but switched off (`USE_3D_MENU` in `src/game.ts`).
- **Sound** (`src/audio.ts`): layered procedural WebAudio sfx (swing, hit, slam, soul chime, level-up…) and music that switches between `menu`, `explore` and `boss` (boss when an awake boss/elite is within ~25 m). Drop real files into `public/assets/audio/` (`music_menu|music_explore|music_boss`, or any sfx name, mp3/ogg/wav) and they replace the synth automatically.
- **The HUD:** a minimap, plus a **GTA-style world map** (tap the minimap or press M; the game pauses while it's open) labelled with the lore regions (`CH1.regions`).

- **Quality pass (no Tripo):** camps have trampled-earth clearings with ragged edges, stitched-hide tents (smoother teepees, sagging lean-tos), plank crates with iron straps, stave barrels with rusty hoops, and fire rings of the **Unity mossy rock** (`art/unity_rock_to_glb.py` → `public/assets/p_mossrock.glb`, 102 triangles, vertex-coloured). The village plaza is ruined cobbles like the lanes. Snare pits are soft dark holes half hidden by leaves; the watchtower is cross-braced with a ladder. River banks are brown wet mud with reeds and mossy rocks; the Ghost Marsh has reeds, wet patches and drifting mist; charred rocks ring the lair. Temple rubble uses the aged stone; the Grand Stair and lions are toned to it (`DESAT`/`TINT` in the prop loader); the wall pillars' gold caps cut away with them. New painters use their own random stream (`keepTex` keeps the old painter running blind), so the world's layout never moves. The Naga resets to its post (and its bar hides) when he goes more than 70 m from its lair.
- **The temple is aged** (`agedBlockDraw`, `agedFlagDraw`, `agedPatches` in chapter1.ts): chipped and cracked blocks, a few fallen out, moss in the joints and at the foot, rain streaks and lichen on the walls; uneven, cracked, split flags with moss and weeds in the joints and roots across the floors; large moss, damp and dirt patches so the tiling never shows; mossy wall caps; hanging vines on both faces of the standing walls (one instanced draw). The aged painters use their own random stream; the old painters still run on a no-op canvas so the world's layout is unchanged.
- **Ground and tree looks** (`src/look.ts`): six art directions for the jungle floor texture, the ground shading, the grass clumps and the tree colouring: 0 Original, 1 Monsoon Emerald, 2 Dry Zone (Bagan), 3 Storybook, 4 Cursed Twilight, 5 Golden Ruins. Chosen with `?look=N` or Controls → "Ground and trees" (saved as `zg.look`; the page reloads). The ground texture draws from its own random stream, so the world's layout is the same in every look. Comparison: `docs/look-candidates.jpg`.
- **Save and continue** (Chapter 1; `localStorage` key `zg.save.ch1`, `Game.saveGame` / `continueGame` / `progress()` in game.ts): saves level, points, attributes, souls, relics, boons, elements, skills, beaten story foes and shards, Ma Hnin and freed villagers, shrines, inscriptions, brambles, chests, fragments, scenes seen, the barrier and gate, and where he stands with his health and mana. **Autosave:** whenever progress changes (checked every 3 s; a small SAVED note), every 20 s for his position, and when the tab is hidden or closed. The menu shows **Continue** (`#btn-resume`) when a save exists, and Start becomes **New Game** (asks before replacing the save). Beaten foes are put down again quietly on load (no souls, no relics twice).
- **The grown valley (1.4 × 1.4 expansion, owner's plan of 16 Nov 2026)**:
  - **relayout:** `growCh1` / `growPt` / `RIGID` in chapter1.ts. The map is about 594 × 487 m (`B` ±296.5 × ±243.5). The old village (within 45 m) is unchanged; land eases outward to 1.4x at 175 m. Camps, the monastery, the snare fields, the Weeping Pool and the lair move whole (`RIGID`). The temple hill moved with `TX` (177), and its rough rim is drawn relative to TX, so it keeps its shape. Raw positions written for the old valley go through `growCh1` (test hook `__zg.ch1.G`). Old saves have their position grown on load. Hill ramps are 6 m wide and level to just past the rim.
  - **how new places are built** (`src/ch1places.ts`, called at the END of buildChapter1 with a `Kit` of the builder's helpers):
    - each place clears its footprint first (`clearArea`: scattered clutter and its colliders go) and records it in `PLACE_CLEAR`, which `nearCamp` reads, so the trees, logs and bamboo that load later keep out;
    - new trails come from `addTrail`, each with its own random stream;
    - `track` / `untrack` open thorns and gates; `addBridge` lays a bridge at runtime;
    - the shared `seed` is restored afterwards, so nothing else in the world moves.
  - **spots and side quests** (`src/places.ts`): a spot answers when he walks up ('touch') or when an element reaches it. Every cast sends its elements 5 m ahead and to his feet (`elementsReach` in game.ts). Side quests are chains of steps; the nearest open one shows under the objective (`.q-side`). Saved as `spots` and `side`. Test hook `__zg.elementAt(el, x, z)`.
  - **the old village, a hub that changes:**
    - districts: Weavers' Lane (loom, awnings), the Herb Yards (drying racks, beds, work table), the River Landing (washing steps, boat, plank trading deck, a lamp on the jetty), the Burned Quarter (broken fences, belongings, drag marks to the marsh road);
    - freed villagers go home to their own houses (`VILLAGE_HOMES`) and the village shows it (`RECOVER`): the weaver's cloth drying, fresh herbs on the racks, the plaza lanterns relit by the boy, the Ferry-Woman's boat righted;
    - villagers have lines that change as the acts go by (`Game.LINES`, a `#say` bubble). They never know who he is.
  - **goblin capture route** (`buildGoblinRoute`): the holding pens (a ferry token in the open cage), the caravan stop (a new camp 19 with a prisoner, carts, crates stamped with the Nine's seal), the capture road with drag marks, and the Chief's hoard behind thorns that fire burns. Side quest **A Captive's Return**: the token, free the Ferry-Woman (boon: +4% speed), find her at the River Landing (+120 souls). Once she is home, **the ferry** carries him between the River Landing and the Ghost Marsh's landing (`FERRY`).
  - **Bone Wastes** (`buildBoneWastes`): the receiving yard (the same carts and sealed crates), the Nameless Graves, the raising ground (binding posts, raising pits, a ritual ring that pulses until the Necromancer falls) and the brothers' burial shelter with its inscription. Side quest **Nameless Graves**: lay the shuttle, light the child's lamp (fire), fill the ferryman's jar (water) (+150 souls, a memory).
  - **Undead Garrison** (`buildGarrison`): the outer checkpoint (stakes facing the valley, a rotted barrier pole, banners), barracks and supply yard, a command platform on Garrison Hill, the closed road north-east barricaded against the valley, and the same order cut in three hands. Side quest **None Leaves**: read the three orders, then lower the drawbridge over the trench from inside, a permanent way in (+120 souls).
  - **Ghost Marsh** (`buildMarsh`): the lantern causeway (fire lights it to the river), the half-sunk ferry landing, offering lamps in the trees. Side quest **The Bound Dead**: free three spirits by fire (a rope), air (a knot of mist) and spirit (one no eye has seen) (+150 souls).
  - **Sunken Monastery** (`buildMonastery`): three sluice wheels drain the courts by a third each (wading eases; `POOLS[].drain`); a raised gallery with the flood marks ("the night the great serpent was bound"); a hatch in the drained main court opens on the brothers' records store; the page under the Drowned Abbot's seat. Side quest **The Drowned Records** (+160 souls). The prayer hall's statue is now the hooded travelling alchemist.
  - **Alchemist's Garden** (`buildGarden`): his cistern and dry channel, a fever-leaf bed, the damaged work shelter, one surviving patch. Side quest **Fever-Leaf**: water in the cistern brings the bed back, and he remembers the dose (+60 souls).
  - **temple** (`buildTemple`): the Pilgrims' Rest by the stair's head; the Healing Court on the north side (he straightens a bench's headrest before he knows why); the Nine's prison works laid over the Relief Chamber (seal conduits to the pillar, iron anchors, a bricked door, an inscription); the Outer Gallery along the east rim to an overlook (a chest); lamp niches up the Grand Stair (fire relights them); pilgrim waystones along the road from the Temple Bridge.
  - **Naga's approach** (`buildNagaApproach`): shed scales, a ruined hut with flood lines, two reliefs of the serpent sheltering people under its hood, and six binding pillars round the lair with pulsing runes and chains. When it is spared the runes go dark, the chains drop, and the swimming Naga leaves down the north stream (`NagaSwimmer.leave`).
  - **Ma Hnin between the acts** (story.ts `mahnin_necro`, `mahnin_commander`, `mahnin_maid`): short talks at her altar that join up what he found.
  - **statues:** the village shrine and the monastery hall use the hooded travelling alchemist (`p_healer_statue`; the stand-ins are hooded). No damaged Buddha imagery.
  - **test:** "the grown valley" runs every side quest.
- **Streams** (`STREAMS`, `streamAt`, `cutStreams` in chapter1.ts): three shallow channels from just inside the lair's barrier to the river: **north** (round the end of Naga's Scar, under the garrison, south of the Bone Wastes, into the river), **pool** (lair → the Weeping Pool) and **south** (the Weeping Pool → the south fields → the river at the marsh bend). He wades them (slower, splashing); where a trail crosses there is a **ford** (a shallow paved bed, clear water, stepping stones, full speed). They are cut **after** the world is placed: the ground tiles and trails are re-heighted, then anything scattered that landed in a bed (instanced trees, rocks, ferns, logs) is cleared with its collider (`clearBeds`, run again after the prop models load). Nothing else draws from the shared random stream, so the layout never moves. Mud banks, reeds and stones line them; the minimap shows them. Test: `streams:`.
- **The Naga in the water** (`src/swimmer.ts`, `NagaSwimmer`; story logic `updateGlimpses` in game.ts): a clone of the boss model (shared geometry) swims the river and the streams (`WATERWAYS`). Under the surface the jungle floor hides it, so a dark shape slides along the water with a wake of foam rings and spray; when it breaks the surface there is a crash of spray and a splash sound (`sfx.splash`). **Five glimpses, once each** (saved with the scenes as `glimpse1..5`): after the King a shadow slides past; after the Chief its coils break the surface; after the Necromancer two red eyes watch from the water; after the Commander it surfaces and roars (camera shake); after the Weeping Maid it rises, looks at him and sinks. Then a rare pass every 1.5-2.5 minutes whenever he is within ~22 m of water, never in a fight, and never again once he faces it at the lair. Ma Hnin warns about it in her talk. Test hook: `__zg.glimpse(kind)`.
- **The Grand Stair's side rails are walls** (`solidLine` along both sides): no stepping or jumping off its sides; on and off at the foot and the top only.
- **The Naga model** (`art/build_naga_glb.py` → `public/assets/dragon.glb` + `dragon-clips.json`): the owner's ornate Burmese naga (`art/source/boss/naga/naga.glb`, reference `naga_reference.png`), cut to 20k triangles, 2K texture. No rig came with it: its centre line is found by walking the mesh surface from the tail tip (texture seams bridged), then the old dragon's 32-segment spine, skin and clips (Idle, Move, Roar, Strike0-4, Death). The old model is kept as `art/source/boss/dragon/dragon_game_old.glb`.
- **The Unity dead tree** (`art/unity_tree_to_glb.py` converts the Unity project's CourtyardTree, read-only, to `public/assets/p_deadtree.glb`): it replaces the wasteland's charcoal stick-trees and rings the Naga's lair, the Weeping Pool and the Ghost Marsh (tinted, half mirrored). The other Unity trees (merged JungleArc level meshes) aren't usable; see `docs/unity-trees.jpg`.
- **Quest system** (`src/quest.ts`, wired in `src/game.ts`; on when the story is on, `__zg.enableQuest()` in tests):
  - **steps, in story order** (each act's scene builds on the last): Act I Stone Warden → Undead King (in the temple) → Act II Goblin Chief (south-east) → free the captive → meet Ma Hnin at her altar in the old village → Act III Necromancer (north) → Act IV Undead Commander (north-east) → Act V the Weeping Maid (across the river) → the lair barrier → the Naga → the gate. An objective at the top left (act title and where to go) plus a gold target on the minimap and world map. A holder beaten early still counts; the tracker skips to the next act not done.
  - **camp respawns:** a fallen camp unit returns after 2 minutes (`RESPAWN_S` in minion.ts), and never while he is within 25 m of its camp; bosses and elites never return.
  - **temple walls are 3.75 m** (`WALL_H`, 3x the old 1.25 m): crumbled stretches only lose their top and stay above a double jump, so the gates, stairs and breaches are the only ways out; walls, caps and pillars are cut away between the camera and the hero (`focusCut`).
  - **story foes stay beaten:** in Chapter 1 the Warden, the King, the Necromancer, the four shard holders and the Drowned Abbot never respawn (`stayDead`), and the game remembers every defeat (`downs`, `shardsTaken`), so the quest never goes backwards. Camp minions still come back.
  - **the Drowned Abbot** (`abbot`, `CH1.abbot`, the flooded court below the monastery's prayer hall): a side boss with a boss bar; he drops the Drowned Prayer Beads relic.
  - **shard holders, placed by act** (each further from the temple than the last, measured from the Grand Stair's foot): **Goblin Chief** (`chief`, camp 16 south of the river bend, ~90 m, with Ma Hnin's cage: `CH1.mahninCamp`), **Necromancer** (Bone Wastes, ~115 m), **Undead Commander** (`commander`, the garrison's front camp 6, ~185 m), **the Weeping Maid** (`banshee`, camp 18 at the **Weeping Pool**, far south-east just before the lair, ~200 m), then the lair. Placed via `CH1.elites`; elites show a boss bar. Captive villagers: camp 2 the Weaver, camp 1 the Herb Woman, camp 17 the Boy.
  - **every camp has a trail**, and every trail is an **old paved road gone to ruin** (broken flagstones, half sunk, gaps of earth) with a leaning waymarker where it meets the camp.
  - **Ma Hnin:** after the Chief falls, walking to the cage frees her, and she waits on the Shrine terrace (`CH1.mahnin`). **Her model** (`public/assets/mahnin.glb`, built by `art/build_minion_glb.py -- mahnin`, story NPC class `src/npc.ts`) has Idle, Cry, Afraid, Wave, Sit and Walk. In the cage she cries, then cowers (Afraid) when he comes near; on the terrace she looks around and waves as he approaches.
  - **the garrison's carved orders:** a slab at `CH1.orders` that triggers a scene.
  - **the lair barrier:** a red wall at `CH1.barrierR`, impassable via `lairSeal`, that falls when the hero brings 4 shards.
- **Element mixing** (`src/spells.ts`, wired in game.ts): 5 elements; the player brings **3** (the Spells screen in the menu or the SPELLS button in play; saved as `zg.loadout`). Tapping an element sets it circling him (2 at most; passives: Fire +6% damage, Earth −8% damage taken, Air +5% speed, Water +2 mana/s, Spirit +10% souls). **INVOKE** (R) turns the two into one of **15 spells** in slot 1 (old slot 1 to slot 2); cast with Q / E or the two spell buttons. Each spell has its own mana and cooldown. Spells: Alchemy Blast, Flame Comet, Magma Rupture, Scalding Veil, Soulfire Brand, Stone Bulwark (a real wall: blocks, stops bolts, standable), Sand Cyclone, Mire, Golden Seal, Gale Step, Chain Lightning, Butterfly Ascent, Tide Wave, Spirit Elixir, Soul Swarm. Keys 1 2 3 pick elements; P is reset now.
- **Element unlocks per act** (story only; `elements` in game.ts; the arena has all five; the old skill-unlock list below is kept for reference):
  - **Start:** combo and Alchemy Blast
  - **Undead King:** Golden Seal
  - **Goblin Chief:** Twin Kick
  - **Necromancer:** Chain Lightning
  - **Commander:** +100 max health
  - **Weeping Maid:** **Spirit Elixir**, a new skill: H / the ELIXIR button heals 40 health, 30 s cooldown

  Locked buttons are greyed with a lock, and a banner (`toast`) announces each reward. The test arena keeps everything unlocked.
- **Scenes** (in `src/story.ts`): prologue, guardian, king, goblin, mahnin, mahnin_talk, orders, necro, commander, maid (the quiet fade), barrier, naga (he spares it), ending (the stars memory), and **epilogue** (the fake king; backdrop `public/assets/story/throne.jpg`, the owner's art (source in `art/source/story/`)).

**Not built yet:**
- gear/equipment drops, hold-to-attack, a loot feed and a waypoint pin with distance (ideas from the Soul Huntress reference)
- saving progress

---

## 4. Code map

| Path | What it is |
|---|---|
| `src/game.ts` | game loop, hero, combat, skills, camera, HUD, minimap, test hooks (`window.__zg`) |
| `src/chapter1.ts` | the Chapter 1 world: walkable grid, temple, river and bridges, trails, camps (`CH1.camps`), lair, trees and props, fog. `CH1` holds all placement anchors. |
| `src/minion.ts` | camp minions: ghoul, sword, lance, caster, ghost, archer, monk (Sunken Monastery), plus the elites `king`, `chief`, `commander`, `banshee` (each on its own Tripo model: `king.glb`, `chief.glb`, `commander.glb`, `maid.glb`) |
| `src/necro.ts`, `src/boss.ts`, `src/hydra.ts` | Necromancer, Temple Guardian, final boss class (now loads `dragon.glb`) |
| `src/bigmap.ts` | the full-screen world map |
| `src/fx.ts`, `src/combo.ts`, `src/input.ts`, `src/world.ts` | effects and flipbooks; combo timing; input; ground rules (`walk`, `settle`) |
| `art/build_*_glb.py` | Blender (5.2, headless) build scripts that make every `public/assets/*.glb` from `art/source/` |
| `art/prep_prop.py`, `art/fbx_to_glb.py`, `art/strip_base.py` | prop preparation helpers (`TRIS=n` decimates; props go to `public/assets/p_*.glb`) |
| `art/author_npc_clips.py` | Chapter 1 characters from `art/source/ch1_chars/<name>_tripo.glb`: renames Tripo's clips, authors the missing ones (key poses + IK), rigs the Weeping Maid (Tripo couldn't), decimates villagers and monks, exports `public/assets/<name>.glb` + `-clips.json` |
| prop swaps (`swaps` in `chapter1.ts`) | every stand-in prop registers its Tripo model; when `p_*.glb` loads the stand-in hides and the model takes its place (colliders stay). Missing models simply keep their stand-ins. |
| `tests/e2e.spec.ts` | Playwright end-to-end tests (22), including a map audit that every camp, hilltop, boss and the treasure is reachable, no trail is blocked, and every bridge (3 river, 3 trench) can be crossed |
| `shots/*.mjs` | screenshot and check scripts (expect `vite preview` on port 4174) |

## 5. Working rules

**Commands:**
- **build:** `npm run build`
- **unit tests:** `npm run test:unit`
- **end-to-end tests:** `npx playwright test`
- **deploy:** `npx --yes vercel@latest deploy --prod --yes --name zawgyi-3d-test`

**Tests run on software WebGL (swiftshader) and are slow.** The project sits in OneDrive, which slows the machine further. Some tests have long timeouts on purpose. Rerun a single timed-out test before assuming a regression.

**Blender:**
- **path:** `"C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b -P <script> -- <args>`
- **file paths:** pass absolute Windows paths for textures.

**Mobile budgets:**
- **minions:** about 5,000 triangles
- **props:** 1,500–3,500 triangles
- **instancing:** instance and chunk repeated props so off-screen chunks are culled
- **shadows:** keep shadow casters near the hero

**Don't:**
- edit the owner's **Unity project** (`../unity/`) or other agents' Unity work
- extract or use assets from the Dota 2 APK; use the owner's Tripo models, procedural geometry, or CC0
- spread the **old story** (missing master, seal fragments, guardian finale): it's superseded

**3D models:** the owner makes models in **Tripo** and drops them in `Downloads`. Unzip each into its own empty folder and inspect before use. If a model is needed, ask for it by name with a short description.
