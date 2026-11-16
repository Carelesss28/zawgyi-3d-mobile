/**
 * Ground and tree "looks": five candidate art directions for the jungle floor, the grass and the trees, plus the original (0).
 * Pick one with ?look=N or the Controls menu (saved as zg.look; the page reloads, because the textures are built at load).
 */
type RGB = [number, number, number];
export interface Look {
  name: string; desc: string;
  /** The ground texture: shaded and sunlit grass, dry patches, blade strokes (dark, bright, pale), and specks (fallen leaves, pebbles). */
  ground: { dark: RGB; light: RGB; dry: RGB; dryAmt: number; blades: [RGB, RGB, RGB]; bladeW: number; bladeL: number; bladeN: number; specks: { n: number; cols: RGB[]; size: number } };
  /** The ground shader: big light/shadow patches (low, high), moss tint, bare-earth colour and amount. */
  shade: { low: RGB; high: RGB; moss: RGB; dirt: RGB; dirtAmt: number };
  /** Grass clumps: root, tip, sun-bleached tip (hex). */
  grass: [number, number, number];
  /** Trees: the leaf colour (linear, the shader brightens it by the texel's light), the bark multiplier, the leaf-card tint. */
  tree: { leaf: RGB; bark: RGB; card: number; barkTint?: RGB };
  /** Grass clumps: density and height multipliers (1 = as before). */
  grassMul?: number; grassH?: number;
}

export const LOOKS: Look[] = [
  { name: 'Original', desc: 'the current yellow-green jungle',
    ground: { dark: [67, 90, 37], light: [134, 162, 78], dry: [174, 172, 141], dryAmt: 0.55, blades: [[38, 52, 18], [150, 176, 86], [185, 180, 140]], bladeW: 1, bladeL: 4, bladeN: 5200, specks: { n: 0, cols: [], size: 2 } },
    shade: { low: [0.74, 0.86, 0.66], high: [1.12, 1.07, 0.84], moss: [0.62, 0.8, 0.48], dirt: [0.2, 0.15, 0.085], dirtAmt: 0.6 },
    grass: [0x4a6a26, 0xb4cc64, 0xd2c878], tree: { leaf: [0.075, 0.13, 0.022], bark: [0.62, 0.58, 0.5], card: 0x9fb090 } },
  { name: 'Monsoon Emerald', desc: 'wet, deep green jungle: a soft, even emerald field, dark loam, a few fallen leaves, dark brown trunks',
    ground: { dark: [30, 58, 30], light: [70, 118, 54], dry: [80, 74, 50], dryAmt: 0.22, blades: [[16, 34, 14], [70, 122, 56], [104, 126, 78]], bladeW: 1, bladeL: 3, bladeN: 9500, specks: { n: 500, cols: [[96, 64, 34], [120, 84, 42], [66, 50, 30]], size: 2 } },
    shade: { low: [0.8, 0.9, 0.82], high: [1.04, 1.08, 0.98], moss: [0.6, 0.86, 0.62], dirt: [0.14, 0.1, 0.065], dirtAmt: 0.45 },
    grass: [0x22401c, 0x5a9844, 0x7ea65a], grassMul: 1.4, grassH: 0.8,
    tree: { leaf: [0.04, 0.11, 0.035], bark: [0.48, 0.44, 0.4], card: 0x7aa070, barkTint: [0.15, 0.095, 0.055] } },
  { name: 'Dry Zone (Bagan)', desc: 'central Myanmar in the dry season: olive-ochre grass, red laterite earth, dusty leaves',
    ground: { dark: [96, 98, 50], light: [172, 162, 94], dry: [168, 104, 66], dryAmt: 0.6, blades: [[74, 66, 30], [198, 182, 112], [214, 194, 150]], bladeW: 1, bladeL: 4, bladeN: 4800, specks: { n: 900, cols: [[150, 110, 80], [196, 176, 140], [120, 96, 70], [210, 200, 180]], size: 2 } },
    shade: { low: [0.84, 0.8, 0.7], high: [1.14, 1.04, 0.84], moss: [0.82, 0.86, 0.6], dirt: [0.44, 0.22, 0.12], dirtAmt: 0.62 },
    grass: [0x6a6430, 0xc8b46a, 0xdcc48c], tree: { leaf: [0.1, 0.12, 0.045], bark: [0.7, 0.6, 0.5], card: 0xb2b282 } },
  { name: 'Storybook', desc: 'soft hand-painted look: fresh greens, cool teal shadows, broad brush strokes',
    ground: { dark: [70, 118, 74], light: [150, 196, 112], dry: [200, 192, 140], dryAmt: 0.4, blades: [[46, 92, 70], [178, 214, 122], [232, 222, 172]], bladeW: 3, bladeL: 9, bladeN: 2600, specks: { n: 300, cols: [[236, 226, 176], [190, 226, 150]], size: 4 } },
    shade: { low: [0.78, 0.92, 0.98], high: [1.12, 1.08, 0.88], moss: [0.72, 0.96, 0.86], dirt: [0.5, 0.38, 0.25], dirtAmt: 0.42 },
    grass: [0x3d7a5a, 0xbfe08a, 0xf0e2a2], tree: { leaf: [0.09, 0.21, 0.075], bark: [0.72, 0.62, 0.56], card: 0xb8d8a0 } },
  { name: 'Cursed Twilight', desc: 'the Sealed Zone drained of life: grey-green, ashen violet earth, dim canopy',
    ground: { dark: [42, 54, 46], light: [100, 118, 96], dry: [112, 104, 116], dryAmt: 0.55, blades: [[28, 36, 32], [112, 132, 108], [146, 136, 156]], bladeW: 1, bladeL: 4, bladeN: 5000, specks: { n: 700, cols: [[90, 86, 92], [120, 116, 110], [60, 58, 62]], size: 2 } },
    shade: { low: [0.68, 0.74, 0.86], high: [1.0, 1.02, 0.96], moss: [0.6, 0.76, 0.72], dirt: [0.15, 0.12, 0.16], dirtAmt: 0.6 },
    grass: [0x2a3a34, 0x7a9478, 0x9c94aa], tree: { leaf: [0.045, 0.075, 0.06], bark: [0.42, 0.42, 0.47], card: 0x7c8e84 } },
  { name: 'Golden Ruins', desc: 'late-afternoon jungle: warm greens with golden light, sunlit straw, amber leaves',
    ground: { dark: [56, 86, 34], light: [152, 170, 72], dry: [204, 178, 112], dryAmt: 0.5, blades: [[40, 60, 20], [196, 204, 94], [234, 212, 132]], bladeW: 1, bladeL: 5, bladeN: 5600, specks: { n: 1000, cols: [[214, 168, 70], [190, 120, 50], [230, 200, 110], [160, 110, 50]], size: 3 } },
    shade: { low: [0.76, 0.86, 0.6], high: [1.2, 1.1, 0.76], moss: [0.64, 0.86, 0.44], dirt: [0.32, 0.22, 0.12], dirtAmt: 0.5 },
    grass: [0x48622a, 0xd2d272, 0xf2d48a], tree: { leaf: [0.1, 0.15, 0.03], bark: [0.68, 0.57, 0.44], card: 0xc4c48a } },
  { name: 'Radiant', desc: 'MOBA "Radiant" palette: rich saturated greens, bright yellow-green highlights, cool shadows, warm ochre earth, vivid canopies',
    ground: { dark: [46, 92, 34], light: [128, 176, 58], dry: [182, 150, 82], dryAmt: 0.5, blades: [[26, 60, 22], [170, 210, 70], [224, 214, 120]], bladeW: 2, bladeL: 6, bladeN: 4400, specks: { n: 500, cols: [[214, 196, 96], [150, 196, 80], [190, 150, 80]], size: 3 } },
    shade: { low: [0.72, 0.86, 0.92], high: [1.18, 1.12, 0.8], moss: [0.58, 0.92, 0.5], dirt: [0.4, 0.26, 0.12], dirtAmt: 0.55 },
    grass: [0x2e5a1e, 0x9ed24a, 0xe2d878], tree: { leaf: [0.05, 0.17, 0.025], bark: [0.66, 0.5, 0.36], card: 0x9ccc6a } },
  { name: 'Dire', desc: 'MOBA "Dire" palette: scorched olive-brown ground, rust-red earth, ash, dark crimson-brown canopies',
    ground: { dark: [44, 40, 32], light: [100, 90, 62], dry: [124, 70, 48], dryAmt: 0.6, blades: [[30, 26, 20], [104, 96, 64], [150, 134, 120]], bladeW: 1, bladeL: 4, bladeN: 4600, specks: { n: 1100, cols: [[130, 120, 112], [90, 50, 38], [160, 84, 50], [60, 54, 50]], size: 2 } },
    shade: { low: [0.7, 0.68, 0.74], high: [1.08, 0.98, 0.88], moss: [0.74, 0.72, 0.6], dirt: [0.26, 0.11, 0.07], dirtAmt: 0.62 },
    grass: [0x2e2a20, 0x6e6a44, 0x9a8a76], tree: { leaf: [0.1, 0.035, 0.03], bark: [0.38, 0.34, 0.34], card: 0x8a6458 } },
];

function pick(): number {
  try {
    const q = new URLSearchParams(location.search).get('look'); if (q !== null) { const n = Number(q); if (n >= 0 && n < LOOKS.length) return n; }
    const s = Number(localStorage.getItem('zg.look') ?? '1'); return s >= 0 && s < LOOKS.length ? s : 1;   // default: Monsoon Emerald
  } catch { return 1; }
}
export const LOOK_ID = pick();
export const LOOK = LOOKS[LOOK_ID];
export const glsl = (c: RGB) => `vec3(${c.map((v) => v.toFixed(3)).join(', ')})`;
