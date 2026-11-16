# Chapter 1 — Lotus Temple and the Withered Jungle

> **Story superseded (13 Nov 2026).** The storyline in this file (missing master, seal fragments, guardian finale) is replaced by the owner's lore in [AGENTS.md](AGENTS.md) and [docs/ch1-script.md](docs/ch1-script.md): Zaw Gyi was sealed for 500 years by the king and the Nine Witches, the princess cracked the seal, and Chapter 1's boss is the mind-controlled Naga.
>
> The roster and model status below are also out of date. The female ghost, sword and lance warriors, goblin archer and Naga dragon all exist now, and the chest is integrated.
>
> Use this file only for its 3D-asset production and integration notes.

Updated: 13 November 2026. Working story, building and asset reference for the expanded browser 3D map.

## Scope and current baseline

The apprentice Zawgyi follows his missing master's trail through the ruined Lotus Temple. A necromancer has turned the surrounding jungle into a feeding ground for his servants. Restoring the temple's protective seal reveals the next stage of the master's journey.

Keep the existing five temple spaces: Relief Chamber (start), Canal Gallery, Shrine of the Jade Altar, Offering Hall, and Lotus Courtyard (guardian encounter and east exit). Expand around them rather than replacing the temple with an unrelated setting. The necromancer and his curse are original fantasy additions.

The current `src/chapter1.ts` bounds are approximately 424 × 347 metres versus the earlier 106 × 87 metres: four times the width and length, approximately sixteen times the ground area. These are bounding dimensions, not a measure of reachable floor. Content below is a proposed design pass, not a claim that quests, gates or rewards are implemented.

Existing code already places the necromancer near (-9, 60), a dead-tree clearing around him, and four jungle minion packs. Preserve these as initial encounter anchors; tune final paths and density through playtesting.

## Main story and region plan

| Region | Story beat and objective | Buildings and landmarks | Encounters and reward |
| --- | --- | --- | --- |
| 1. Relief Chamber and jungle threshold | Discover the master's damaged field notes; learn that the temple seal has failed. Establish a safe return point. | Existing relief chamber; small abandoned timber shelter; wayside rest shrine | One introductory melee enemy beyond safety. Notes point toward the canal. Basic supplies. |
| 2. River trail and ruined crossing | Follow traces of the master's passage; find a route across the stream. Optional detour retrieves a lost satchel. | Broken footbridge, stepping stones, riverbank camp, reused archway | Small melee packs; introduce a ranged caster separately. Satchel rewards crafting supplies; hidden chest on a short side loop. |
| 3. Jade Shrine and Offering Hall | Recover two seal fragments from the existing temple rooms. Their inscriptions identify the source of the corruption. | Existing shrine and hall; readable jade altar, offering pedestals and inscription tablets | Mixed melee/caster encounter after individual introductions. Two fragments become quest inventory items. |
| 4. Forgotten memorial grove | Free trapped spirits and recover the final seal fragment. Optional spirit request reveals a buried cache. | Three ruined spirit markers, one larger memorial, a small open shrine shelter | Ghost encounter proposed here; confirm its model and behavior first. Reward: third fragment and optional cache. Avoid presenting invented markers as authentic historical funerary design. |
| 5. Withered clearing | Find the reaper maintaining the curse. Disable three curse anchors, then defeat him to release the temple seal. | Existing dead-tree clearing; ritual altar, three reusable obelisks, bones and cracked ground | Reaper is the regional miniboss. Melee servants screen his ranged attacks. Reward: curse lifted and return shortcut unlocked. |
| 6. Lotus Courtyard and east passage | Fit the fragments into the temple seal. The guardian tests the apprentice before allowing passage toward the master's next trail. | Existing lotus floor, guardian pillars and braziers; restored seal pedestal; east exit gate | Existing guardian remains the Chapter 1 final encounter. Chapter reward chest and clue leading to Chapter 2. |

Route: Relief Chamber → river loop → Shrine / Offering Hall → memorial grove → withered clearing → temple shortcut → Lotus Courtyard → east exit.

The grove and river detours provide exploration; keep the main objective legible with landmarks and short journal entries. Do not require searching the entire expanded boundary. Distant forest can provide scenery and future routes.

## Enemy roster and verified model status

| Player-facing role | Project asset / evidence | Placement and remaining work |
| --- | --- | --- |
| Reaper / necromancer | `public/assets/necro.glb`; source `art/source/necro/necro.glb` and separate `scythe.glb`. Build script includes walk, slash, cast and death. | Withered clearing miniboss. Existing model can be reused; no new character generation required. Weapon remains a separate source asset, attached during preparation. |
| Skeleton goblin / melee ghoul | Intended roster name supplied by the user. Current melee implementation uses `ghoul.glb`; build source documents a run clip. Exact visual-name correspondence still needs a rendered check. | River patrols and clearing guards. Proper idle, attack, hit and death clips remain animation needs; current attack/death are code-driven. |
| Horned caster | `public/assets/caster.glb`; source `art/source/minions/caster.fbx` and `caster.jpg`. Build script documents a spell cast. | Ranged support for jungle packs. Existing asset, with missing locomotion/hit/death clips to improve. |
| Ghost | Requested roster member; no distinct ghost enemy asset or loader confirmed in the active project. The hero's code uses “ghost” for afterimages, which does not establish an enemy model. | Memorial grove. Identify the downloaded model before generating a replacement; then prepare idle/hover, attack, hit and defeat animations plus enemy behavior. |
| Temple Guardian | `public/assets/guardian.glb` | Existing courtyard boss. Preserve as the chapter finale. |

Do not treat download UUID names or animation names alone as proof of a character's identity.

## 3D models already available — reuse first

| Asset | Location / status | Use in expanded map |
| --- | --- | --- |
| Ancient tree, banyan, palm | Source models in `art/source/props`; optimized models in `public/assets` | Forest canopy, riverbanks and navigation landmarks. Vary placement and scale. |
| Stone archway | Source `archway.glb`; runtime asset available | Temple thresholds and trail landmarks. |
| Ornamental brazier | Source `brazier.glb`; runtime asset available | Courtyard, shrines and safe-point visual marker. |
| Rock pillar | Source `rock_pillar.glb`; runtime asset available | Rock formations and path framing. |
| Premium treasure chest | `art/source/props/chest.glb` exists; runtime chest integration not confirmed | Main reward and optional secret caches. Inspect whether lid is separate before animation. |
| Reaper, scythe, melee ghoul, caster, guardian, hero | Existing source / runtime assets | Current combat roster and player. |
| Temple floors, gates, stairs, walls, altars, dead trees and vegetation | Existing procedural geometry in `src/chapter1.ts` | Retain as working geometry; replace selectively where visual quality benefits. |

## Additional 3D model production list

P1 = generate first for playable landmarks and objectives. P2 = visual enrichment. Quantities are reusable source assets, not number of placed instances.

| Priority | Model or small kit | Source asset count | Purpose and preparation |
| --- | --- | --- | --- |
| P1 | Ruined temple construction kit | 1 kit | Straight wall, broken wall, pillar, doorway, floor tile and stair module. Reuse throughout the temple and new side ruins. Match existing architecture and passage widths. |
| P1 | Abandoned timber shelter kit | 1 kit | Roof, posts, platform and damaged wall; create starting shelter and river camp from the same parts. Keep roof removable for camera visibility. |
| P1 | Broken footbridge kit | 1 kit | Deck segment, support and broken end. Assemble a crossing with readable edges; author collision separately. |
| P1 | Seal-fragment pickup | 1 | One reusable jade fragment with three color/rune variants; make a separate pickup mesh rather than baking it into the altar. |
| P1 | Rest shrine / checkpoint pedestal | 1 | Recognizable safe-point object reused at start, river route and pre-boss return. |
| P1 | Ritual altar | 1 | Main landmark in the reaper clearing; solid, readable shape with open combat space around it. |
| P1 | Curse obelisk | 1 | Reuse three times; intact and broken states can share a source model. Distinct from rest shrines. |
| P1 | Spirit-marker / memorial kit | 1 kit | Small marker variants plus one larger memorial for the grove; consistent original fantasy motifs. |
| P1 | Dead twisted tree | 1 | Hero-quality replacement for the clearing's procedural trees. Reuse with rotation and scale variation. |
| P1 | Reward pickup kit | 1 kit | Coin stack, small gold pouch and material bundle. Reuse with existing chest; keep separate from environment meshes. |
| P2 | Camp prop kit | 1 kit | Crates, barrel, bedroll and extinguished campfire for storytelling at abandoned sites. |
| P2 | Lore prop kit | 1 kit | Master's satchel, journal and carved tablet; visually mark optional discoveries. |
| P2 | Ruin debris kit | 1 kit | Broken pillar, rubble cluster, fallen statue fragment; reuse outside combat lanes. |
| P2 | River rock and root kit | 1 kit | Three rock shapes and two exposed roots to vary banks and stepping-stone detours. |
| P2 | Low vegetation kit | 1 kit | Fern, grass clump and broadleaf bush; replace selected procedural vegetation if needed. |
| P2 | Pumpkin cluster | 1 optional | Small local accent around the reaper if retaining his Halloween styling; avoid spreading pumpkins across the whole jungle. |

No additional enemy species are required for the first expansion pass. Resolve the ghost download and improve existing animations before adding more character models.

## First placement pass

- Six readable regions, using the existing temple rooms as the central landmark.
- Three curse anchors and three seal fragments along the main route.
- Two optional tasks: lost satchel and trapped spirit; four optional chests plus one chapter reward chest.
- Three safe points: start, river approach and pre-courtyard return. Avoid placing enemies inside their recovery areas.
- Eight to twelve encounter pockets as an initial tuning target, including the existing four jungle packs; this is total planned coverage, not twelve extra simultaneous packs.
- One reaper miniboss and the existing guardian finale, separated by a shortcut and a recovery opportunity.
- Alternate combat, discovery and quiet travel. Use loops and views toward landmarks rather than filling every metre with enemies.

## Tripo and integration requirements

Generate each modular prop or character as its own clean reference on a plain background. Character references should have empty hands and separated limbs; generate weapons separately. Keep the whole object visible. Multi-part kits should be generated as separate usable pieces rather than one fused scene.

For interactive assets, separate moving parts: chest lid/base, gate leaves/frame and breakable obelisk pieces. Confirm pivots, scale, collision and walkable openings after import. Glowing eyes, curse particles, spell effects and spirit transparency require material/effect work; they are not extra scenery meshes.

Use the existing mobile preparation workflow as the starting point: the minion build targets about 5,000 triangles per character. Final budgets depend on simultaneous visible enemies, texture memory and device testing. Reuse materials and instances; activate distant encounters only when needed.

## Completion checks for this reference

This update records proposed story progression and an asset inventory. Quest logic, shrine interaction, ghost identity/behavior, chest animation, new landmark placement and final device performance remain to be implemented or verified. No gameplay source was changed by this document update.
