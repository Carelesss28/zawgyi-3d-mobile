/**
 * The Chapter 1 prologue: 12 illustrated panels (art/source/intro → public/assets/intro/intro_NN.jpg), each with a slow
 * pan/zoom, a crossfade, and narration typed under it. Tap to go on, Skip to end. Names stay generic ("the king",
 * "the princess") until the owner's names are chosen.
 */
const PANELS: Array<{ text: string; pan: [number, number, number, number] }> = [   // pan: from x%, y% to x%, y% (zoom 1.0 → 1.12)
  { text: 'Long ago, a kingdom of gold stood beside the great river, in an age of peace.', pan: [40, 50, 60, 45] },
  { text: 'Its hope was Zaw Gyi — a young alchemist who healed the sick and drove back the dark. The people loved him more than their king.', pan: [45, 55, 40, 50] },
  { text: 'His master, the old wizard who had guided the kingdom, grew tired of the court\'s schemes — and walked away, never to return.', pan: [50, 60, 50, 45] },
  { text: 'Then came the whispers. Nine witches, at the king\'s ear: "A man the people worship is a crown waiting to be taken."', pan: [60, 45, 50, 50] },
  { text: 'At a great feast, the king raised a golden cup to the saint of his people.', pan: [70, 45, 50, 50] },
  { text: 'The wine was poisoned.', pan: [40, 60, 50, 55] },
  { text: 'In the old jungle temple, the Nine sealed him inside a pillar of stone — and erased him from every memory in the land.', pan: [50, 40, 50, 55] },
  { text: 'But one heart had not forgotten. The princess came alone, in secret, and pressed her royal blood to the seal.', pan: [55, 45, 65, 50] },
  { text: 'The seal cracked. The curse took her for it — she turned to stone, still reaching for him.', pan: [40, 55, 45, 45] },
  { text: 'The land forgot its saint, and bowed instead to nine new ones.', pan: [30, 50, 70, 50] },
  { text: 'Five hundred years passed. The jungle swallowed the temple whole.', pan: [50, 60, 50, 40] },
  { text: 'And the crack she made… finally broke.', pan: [50, 45, 50, 55] },
];

export class Intro {
  isOpen = false;
  private root: HTMLDivElement; private a: HTMLDivElement; private b: HTMLDivElement; private tx: HTMLDivElement;
  private i = 0; private front = true; private timer = 0; private typer = 0; private full = ''; private shown = 0; private done: (() => void) | null = null;

  constructor(private base: string) {
    this.root = document.createElement('div'); this.root.id = 'intro';
    this.root.innerHTML = '<div class="ip"></div><div class="ip"></div><div class="ishade"></div><div class="itx"></div><button class="iskip">SKIP ›</button><div class="ipg"></div>';
    document.body.appendChild(this.root);
    [this.a, this.b] = Array.from(this.root.querySelectorAll('.ip')) as HTMLDivElement[]; this.tx = this.root.querySelector('.itx')!;
    this.root.querySelector('.iskip')!.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.finish(); });
    this.root.addEventListener('pointerdown', () => this.next());
    window.addEventListener('keydown', (e) => { if (!this.isOpen) return; e.stopPropagation(); if (e.code === 'Escape') this.finish(); else if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); this.next(); } }, true);
    for (let k = 1; k <= PANELS.length; k++) { const im = new Image(); im.src = this.url(k - 1); }        // preload
  }
  private url(i: number): string { return `${this.base}assets/intro/intro_${String(i + 1).padStart(2, '0')}.jpg`; }

  play(): Promise<void> {
    this.isOpen = true; this.i = -1; this.root.classList.remove('fadeout'); this.root.classList.add('show');
    this.root.querySelector('.ipg')!.innerHTML = PANELS.map(() => '<i></i>').join('');
    this.next(true);
    return new Promise((res) => { this.done = res; });
  }

  /** Finish the typing, else move to the next panel. */
  private next(force = false): void {
    if (!this.isOpen) return;
    if (!force && this.shown < this.full.length) { clearInterval(this.typer); this.shown = this.full.length; this.tx.textContent = this.full; return; }
    this.i++; if (this.i >= PANELS.length) { this.finish(); return; }
    const p = PANELS[this.i], el = this.front ? this.a : this.b, old = this.front ? this.b : this.a; this.front = !this.front;
    el.style.zIndex = '1'; old.style.zIndex = '0';                                                    // the newest panel always fades in on top
    el.style.backgroundImage = `url(${this.url(this.i)})`;
    el.style.transition = 'none'; el.style.opacity = '0'; el.style.transform = 'scale(1.0)'; el.style.backgroundPosition = `${p.pan[0]}% ${p.pan[1]}%`; void el.offsetWidth;
    el.style.transition = 'opacity 1.4s ease, transform 9s linear, background-position 9s linear';
    el.style.transform = 'scale(1.12)'; el.style.backgroundPosition = `${p.pan[2]}% ${p.pan[3]}%`; el.style.opacity = '1'; old.style.opacity = '0';
    this.root.querySelectorAll('.ipg i').forEach((d, k) => d.classList.toggle('on', k <= this.i));
    this.full = p.text; this.shown = 0; this.tx.textContent = ''; this.tx.classList.toggle('last', this.i === PANELS.length - 1);
    clearInterval(this.typer); this.typer = window.setInterval(() => { this.shown = Math.min(this.full.length, this.shown + 1); this.tx.textContent = this.full.slice(0, this.shown); if (this.shown >= this.full.length) clearInterval(this.typer); }, 32);
    clearTimeout(this.timer); this.timer = window.setTimeout(() => this.next(true), 2600 + p.text.length * 55);        // auto-advance
  }

  private finish(): void {
    if (!this.isOpen) return; this.isOpen = false; clearTimeout(this.timer); clearInterval(this.typer);
    this.root.classList.add('fadeout'); setTimeout(() => { if (this.isOpen) return; this.root.classList.remove('show', 'fadeout'); this.a.style.opacity = this.b.style.opacity = '0'; }, 700);
    const d = this.done; this.done = null; d?.();
  }
}
