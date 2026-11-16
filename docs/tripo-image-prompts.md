# Image prompts for Tripo (Chapter 1 models)

Each prompt makes one reference image for Tripo's image-to-3D. Generate the image, check it against the checklist, and give it to Tripo with the settings listed under the prompt.

## How to use
1. Paste the **style block** first, then the model's prompt.
2. For characters, generate a **front view** and a **side view** with the same prompt (add "front view" or "side view" at the end), and use Tripo's multi-view input. For props, one 3/4 view is enough.
3. **Checklist before sending to Tripo:**
   - one object only, whole object in frame, nothing cropped
   - plain light-grey background, soft even light, no hard cast shadows
   - no text, no logo, no ground plane or scenery
   - the silhouette reads clearly; thin parts (rails, thorns, fingers) are not too thin
4. **In Tripo:** set the face limit to the triangle count shown, enable the texture, and export as GLB. For characters, rig with Tripo's humanoid rig and add the listed clips.
5. Drop the GLB in Downloads and tell me its name; I'll fit it into the game.

## Image count: 32 images (41 with side views)

**Props: 23 images**

| # | Image | Prompt |
|---|---|---|
| 1 | Grand Stair | 1 |
| 2 | Guardian lion (one image; the game uses the model twice) | 2 |
| 3 | Cliff wall, straight | 3a |
| 4 | Cliff wall, corner | 3b |
| 5 | Boulders | 3c |
| 6 | Rock pillar | 4 |
| 7 | Stilt hut | 5 |
| 8 | Burned stilt hut | 5 |
| 9 | Village stupa | 6 |
| 10 | Faceless healer statue | 7 |
| 11 | Well | 8 |
| 12 | Stone lantern | 9 |
| 13 | Ox cart | 10 |
| 14 | Altar table | 11 |
| 15 | Soul Shrine | 12 |
| 16 | Inscription stone | 13 |
| 17 | Bramble, tall | 14 |
| 18 | Bramble, low and wide | 14 |
| 19 | Herb a | 15a |
| 20 | Herb b | 15b |
| 21 | Herb c | 15c |
| 22 | Crucible | 16 |
| 23 | Garden wall | 17 |

**Characters: 9 front views (images 24–32)**

| # | Image | Prompt |
|---|---|---|
| 24 | Old Weaver | 18 |
| 25 | Herb Woman | 19 |
| 26 | Lamp-Keeper's Boy | 20 |
| 27 | Undead King | 21 |
| 28 | Goblin Chief | 22 |
| 29 | Undead Commander | 23 |
| 30 | Weeping Maid | 24 |
| 31 | Drowned Monk | 25 |
| 32 | Drowned Abbot | 26 |

**Side views (optional, 9 more):**
- **How many:** one side view per character. They help Tripo get the depth right.
- **Most worth it for:** the Undead King, the Commander and the Drowned Abbot, whose capes, armour and robes are the hardest to guess from the front.

**Suggested order:**
1. **First batch (images 1–2, 7, 9–10, 15):** the Grand Stair, the guardian lion, the stilt hut, the village stupa, the faceless statue and the Soul Shrine. These are the biggest visual win.
2. **Second batch:** the elites and bosses (images 27–32).
3. **Then:** the rest.

## Status (15 Nov 2026)

**In the game (22):**
- **Props:** #1 Grand Stair, #2 lion, #3 cliff wall, #6 rock pillar (no longer used: the back path is now the Night Path stair), #7 stilt hut, #9 stupa, #10 faceless healer statue, #11 well, #13 ox cart, #14 altar, #15 Soul Shrine, #19 herb a, #23 garden wall.
- **Characters:** #24 Weaver, #25 Herb Woman, #26 Lamp-Keeper's Boy, #27 Undead King, #28 Goblin Chief, #29 Undead Commander, #30 Weeping Maid (rigged in Blender), #31 Drowned Monk, #32 Drowned Abbot.

**Still needed (10, all props):** #4 cliff corner, #5 boulders, #8 burned hut, #12 stone lantern, #16 inscription stone, #17–18 brambles, #20–21 herbs b and c, #22 crucible.

Each missing model keeps its stand-in until it arrives.

## Style block (paste first, every time)
> Stylized hand-painted fantasy game asset, top-down action RPG style, chunky readable shapes, slightly exaggerated proportions, soft painted textures with gentle colour variation, ancient Myanmar (Bagan era) Buddhist architecture and costume influences, weathered and overgrown by jungle, warm sandstone and moss palette. Single object, centred, full object visible, 3/4 view from slightly above, plain light grey background, soft even studio lighting, no cast shadow, no text, no scenery, no ground.

---

## The temple hill

### 1. The Grand Stair (top priority)
**Tripo:** about 5,000 triangles
> A wide ruined stone staircase of about 25 deep steps rising in one straight run, worn sandstone blocks with rounded broken edges, moss in the cracks and on the step edges, small ferns growing from the joints. Low carved parapet walls run along both sides, partly collapsed with fallen blocks. A small square landing at the top. The steps are visibly shallow and deep (pilgrim steps), each step a slightly different tone. Seen from the side and slightly above, so every step reads clearly.

### 2. Guardian lion (chinthe), make 2 copies
**Tripo:** about 2,500 triangles
> A seated Burmese guardian lion (chinthe) statue on a square stone plinth, upright chest, open mouth, curled mane in stylized flame-like locks, weathered smooth by centuries of rain, sandstone with green moss on its back and plinth, a crack across one leg. Facing forward, compact silhouette.

### 3. Cliff rock kit (generate each separately)
**Tripo:** walls 1,500 triangles each, boulders 400–800
- **a) Cliff wall, straight:**
  > A straight section of steep sandstone cliff face, about three times as wide as it is tall, layered horizontal rock strata, vertical cracks, moss and hanging vines on the top edge, flat back side.
- **b) Cliff wall, outside corner:**
  > A rounded outside corner of the same layered sandstone cliff, moss and vines on the top edge.
- **c) Boulders (a set of three):**
  > Three loose sandstone boulders of different sizes, rounded and chunky, moss patches on top.

### 4. Back-path rock pillar
**Tripo:** about 600 triangles
> A single natural rock pillar, tall and narrow with a flat top you could stand on, layered sandstone with cracks, a few roots and moss on the flat top, slight lean.

## The Old Village (the hub)

### 5. Stilt hut, then a burned version of the same hut
**Tripo:** 2,500 / 2,000 triangles
- **Stilt hut:**
  > A small Myanmar village hut raised on six wooden stilts about a metre high, woven bamboo walls, a steep thatched roof of dry palm leaves, a short wooden ladder of three steps up to a small doorway, a little veranda. Abandoned: thatch thinned and sagging, one wall panel torn, no people.
- **Burned version:**
  > The same stilt hut after a fire: charred black stilts, only stumps of the bamboo walls, the roof mostly gone with a few blackened rafters, ash on the floor.

### 6. The village shrine (a small stupa)
**Tripo:** about 2,000 triangles
> A small whitewashed Burmese stupa about four metres tall on a square stepped base, bell-shaped dome, a slim ringed spire with a small tarnished gold umbrella (hti) at the top. The whitewash has peeled off in patches showing brick beneath, moss on the steps, old offering niches empty.

### 7. The faceless healer statue (an important lore object)
**Tripo:** about 2,000 triangles
> A life-size weathered sandstone statue of a wandering alchemist-healer standing on a low square plinth. A deep hood over the head (no bare or shaved head), a long layered travelling cloak over a belted tunic, wide sleeves. The right hand holds a tall staff with a small round vessel at its top; the left hand is held out low, palm up, offering a small medicine gourd. Little herb pouches and a tiny mortar hang from the belt. The plinth's sides are carved with herbs, lotus buds and wave swirls. The FACE UNDER THE HOOD HAS BEEN DELIBERATELY CHISELLED AWAY: a rough flat scarred surface, chisel marks visible. Everything else is gently worn by rain. Moss at the base, a vine on the staff.
>
> Not a monk or a Buddha: no alms bowl, no robe draped over one shoulder, no bare shoulder, no shaved head, no meditation pose.

*Why this look:* the village's forgotten saint is Zaw Gyi himself. The hood and staff quietly echo the hero, so players who notice it get the hint without the statue giving anything away.

### 8. The village well
**Tripo:** about 1,000 triangles
> An old round village well with a low wall of stacked stones, a wooden crossbeam on two posts with a frayed rope and a wooden bucket, moss between the stones, one stone fallen out.

### 9. Stone lantern
**Tripo:** about 600 triangles
> A small Burmese stone lantern on a short square pillar, a pagoda-like little roof, an open lamp chamber, unlit and cold, moss on the roof, chipped corners.

### 10. Ox cart (abandoned)
**Tripo:** about 1,200 triangles
> A small wooden village ox cart with two large spoked wooden wheels, a plank bed with low side rails, no animal, one wheel slightly broken, weathered grey wood.

### 11. Ma Hnin's altar table
**Tripo:** about 800 triangles
> A low stone offering table with carved lotus petals along its edge, two small brass offering bowls on top, a single lotus flower in one bowl, a few fallen flower petals, simple and humble.

## Across the map

### 12. Soul Shrine
**Tripo:** about 1,400 triangles
> A slender ancient stone pillar shrine about two and a half metres tall on a square stepped base, carved butterfly wings around its upper part, and a pale cyan crystal hovering just above the top (shown slightly separated from the pillar). Weathered sandstone, moss on the base.

### 13. Inscription stone
**Tripo:** about 400 triangles
> An upright stone tablet (stele) about chest height with a rounded top, rows of old carved script across its face (abstract, not real letters), some lines scraped and chiselled away, moss on top, a slight lean.

### 14. Bramble thorn clump (make 2 versions)
**Tripo:** about 800 triangles
> A dense knot of dark woody bramble stems with long sharp thorns, twisting into a rough waist-high mound, a few small dark red berries, a few dry leaves. Make version two lower and wider. Chunky stems, not hair-thin.

## The Alchemist's Garden

### 15. Herb plants, three kinds (generate each separately)
**Tripo:** 200–400 triangles each
- **a)**
  > A leafy medicinal herb bush with broad soft green leaves.
- **b)**
  > A clump of tall purple-flowered herbs on thin stems.
- **c)**
  > A low spreading herb with small yellow flowers and round leaves.

All three are slightly wild and overgrown.

### 16. His old crucible
**Tripo:** about 800 triangles
> A heavy old iron alchemist's crucible on three short legs, round-bellied, rim worn smooth, faint warm orange glow from embers inside, soot and patina on the outside, one small alchemical sigil engraved on its side.

### 17. Low garden wall section
**Tripo:** about 500 triangles
> A short section of low dry-stone garden wall, knee-high, stacked flat stones, ivy and small herbs growing over it, one end crumbled.

## Villagers (rigged)
**For all three:** about 3,500 triangles, rigged. Clips: Idle, Walk, Wave, Cower, Sit.

**Character rules:**
- full body
- **A-pose**, arms slightly away from the body
- feet apart
- facing the camera
- plain light-grey background
- simple shapes readable from above
- traditional Myanmar village clothing, worn and patched

### 18. The Old Weaver
> An elderly village woman, small and slightly stooped, grey hair in a bun, a faded red longyi (wrap skirt) and a cream blouse, a shawl, a small cloth bundle tied at her waist, kind tired face.

### 19. The Herb Woman
> A middle-aged village woman, practical and strong, a green-brown longyi, rolled sleeves, a cloth satchel of herbs across her body, a wide woven bamboo hat hanging on her back.

### 20. The Lamp-Keeper's Boy
> A boy of about ten, thin, bare feet, a short indigo longyi and a loose shirt, carrying a small unlit oil lamp, curious wide eyes, messy hair.

## Elites and bosses (replacing the stand-ins)

**For every character in this section:**
- rigged
- A-pose
- front and side views
- the face, if any, is undead or monstrous, never a real person

### 21. The Undead King
**Tripo:** 8–10k triangles. Clips: Idle, Walk, Attack ×2, Hit, Death, Roar.
> A towering undead king, grave-pale skin stretched over bone, a tarnished golden crown sunk into the skull, a torn royal cape in faded crimson, ornate rusted ceremonial armour of an old Myanmar court, a heavy ceremonial sword, hollow glowing eyes. Imposing and tragic, not gory.

### 22. The Goblin Chief
**Tripo:** 7–8k triangles. Clips: Idle, Walk, Volley (shoot), Hit, Death.
> A big goblin chieftain hunter, wiry green-grey skin, a bone and feather headdress, a patchwork leather and fur coat, a large recurved hunting bow, a quiver of crude arrows, trophy charms of witch-silver coins on a cord, a cunning grin.

### 23. The Undead Commander
**Tripo:** 8–10k triangles. Clips: Idle, Run, Heavy Attack, Hit, Death.
> A broad-shouldered undead soldier commander in heavy rusted lamellar armour of an old Myanmar royal army, a tall crested helmet, a torn war banner on his back, a large two-handed blade, skeletal hands, cold blue eye-lights.

### 24. The Weeping Maid
**Tripo:** 7–8k triangles. Clips: Glide, Scream, Cry, Hit, Death.
> A tall ghostly maidservant spirit, translucent pale blue-white, a long old-fashioned court maid's dress dissolving into mist below the knees, long loose dark hair covering most of her face, hands raised to her face in grief, sorrowful rather than scary.

### 25. Drowned Monk (a minion)
**Tripo:** about 5k triangles. Clips: Idle, Walk, Attack, Hit, Death.
> A drowned undead monk, swollen grey-green skin, a waterlogged torn saffron robe darkened by river mud, weeds and small shells caught in it, a cracked alms bowl used as a weapon, dripping, hunched.

### 26. The Drowned Abbot (side-quest boss)
**Tripo:** 10–12k triangles. Clips: Idle, Walk, Attack ×2, Hit, Death, Roar.
> A huge drowned abbot, bloated and tall, a heavy waterlogged saffron and maroon robe trailing river weeds, a long string of rotted prayer beads, a broken ceremonial fan as a weapon, barnacles on his shoulders, mournful dead eyes. The leader of the Sunken Monastery.

---

### 27. The Naga (final boss, replacing the current dragon)
**Tripo:** up to 20k triangles, 2K texture. **No rig needed** (I re-rig it onto a 32-bone snake spine in Blender, like the current one). Clips are made in code.
> A huge Burmese naga serpent-dragon, the guardian of a river, laid out almost straight along the ground in a long side view with only a gentle wave in its body (not coiled, not knotted, the whole length visible). No legs. A long, thick serpent body tapering to a fine tail tip, covered in large overlapping jade-green scales with golden-bronze belly plates. The head is proud and dragon-like: a tall ornate golden crest rising from the crown like flame-shaped Burmese kanote ornaments, swept-back horns, fierce amber eyes, long fangs, mouth closed. A ridge of golden flame-shaped fins runs down the spine. Faint red rune markings glow between the scales along its body, like a curse binding it. River weeds and a few barnacles caught on its flanks.
>
> Not a Chinese dragon: no whiskers, no small legs, no pearl. One single creature, the full length visible, the head and tail both in frame.

*Why the pose:* a nearly straight body lets the rig follow its centre line cleanly; coils and knots tangle the skin. The red runes are what "breaks" in the finale when its control is freed.

## Character models still to redo (from earlier)
- **Zaw Gyi:** re-export the current model at 15–20k triangles (now 40k). **His face is never shown:** a black void under the hood.
- **Ghoul, caster and archer:** add Attack, Hit and Death clips to the existing models.
