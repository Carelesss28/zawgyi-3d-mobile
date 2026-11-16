/**
 * Visual-novel dialogue: letterbox bars, a character portrait on each side (the speaker lit, the listener dimmed), and a
 * parchment text box with the speaker's name. Tap / click / Space / Enter: finish the line, then go to the next one.
 *
 * Portraits load from assets/portraits/<id>.png (2D art drops in under the same names; the current files are stand-ins
 * rendered from the 3D models). A missing image shows a hooded silhouette placeholder instead.
 */
export interface Line { who: string; side: 'left' | 'right'; text: string; name?: string; bg?: string }
export interface Speaker { name: string; img: string; filter?: string; memory?: boolean }

/** Speakers in the story. `img` is the portrait file under assets/portraits/; `filter` is a CSS stand-in tint. */
export const SPEAKERS: Record<string, Speaker> = {
  zawgyi: { name: 'Zaw Gyi', img: 'zawgyi_dark' },                                       // Dark Zaw Gyi in Chapter 1 (2D art)
  king: { name: 'The Undead King', img: 'king' },
  guardian: { name: 'Stone Warden', img: 'guardian' },
  mahnin: { name: 'Ma Hnin', img: 'mahnin' },
  necro: { name: 'The Necromancer', img: 'necro' },
  goblin: { name: 'Goblin Chief', img: 'goblin' },
  commander: { name: 'Undead Commander', img: 'commander' },
  maid: { name: 'The Weeping Maid', img: 'maid' },
  naga: { name: 'The Naga', img: 'naga' },
  abbot: { name: 'The Drowned Abbot', img: 'abbot' },
  fakeking: { name: 'The King', img: 'fakeking' },
  memory: { name: '', img: '' },
  // the ending memory: two children on the temple wall (her face stays obscured, her name unspoken)
  child_zawgyi: { name: '— memory —', img: 'child_zawgyi', memory: true },
  child_princess: { name: '— memory —', img: 'child_princess', memory: true },
};

export class Dialogue {
  isOpen = false;
  private root: HTMLDivElement;
  private img: Record<'left' | 'right', HTMLDivElement>;
  private nameEl: HTMLDivElement; private textEl: HTMLDivElement; private nextEl: HTMLDivElement;
  private lines: Line[] = []; private i = 0; private shown = 0; private full = ''; private timer = 0; private done: (() => void) | null = null;

  constructor(private base: string) {
    this.root = document.createElement('div'); this.root.id = 'dlg';
    this.root.innerHTML = `<div class="bgimg"></div><div class="bar top"></div><div class="bar bottom"></div>
      <div class="por left"><div class="ph"></div><img alt=""></div><div class="por right"><div class="ph"></div><img alt=""></div>
      <div class="box"><div class="nm"></div><div class="tx"></div><div class="nx">▼</div></div>`;
    document.body.appendChild(this.root);
    this.img = { left: this.root.querySelector('.por.left')!, right: this.root.querySelector('.por.right')! };
    this.nameEl = this.root.querySelector('.nm')!; this.textEl = this.root.querySelector('.tx')!; this.nextEl = this.root.querySelector('.nx')!;
    for (const side of ['left', 'right'] as const) {
      const im = this.img[side].querySelector('img')!; im.addEventListener('error', () => { im.style.display = 'none'; this.img[side].classList.add('missing'); });
    }
    this.root.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); this.advance(); });
    window.addEventListener('keydown', (e) => { if (this.isOpen && (e.code === 'Space' || e.code === 'Enter')) { e.preventDefault(); e.stopPropagation(); this.advance(); } }, true);
  }

  /** Play a scene; resolves when the last line is dismissed. The game pauses while it is open. */
  play(lines: Line[]): Promise<void> {
    this.lines = lines; this.i = 0; this.isOpen = true; this.root.classList.add('show');
    for (const side of ['left', 'right'] as const) {                                   // each side keeps the first speaker it gets
      const l = lines.find((x) => x.side === side); this.setPortrait(side, l ? SPEAKERS[l.who] : undefined);
    }
    this.show();
    return new Promise((res) => { this.done = res; });
  }
  private setPortrait(side: 'left' | 'right', sp: Speaker | undefined): void {
    const box = this.img[side], im = box.querySelector('img')!;
    box.classList.toggle('empty', !sp || !sp.img); box.classList.remove('missing'); box.dataset.who = sp?.name ?? '';
    if (sp && sp.img) { im.style.display = ''; im.src = `${this.base}assets/portraits/${sp.img}.png`; im.style.filter = sp.filter ?? ''; }
    (box.querySelector('.ph') as HTMLDivElement).textContent = sp?.name ? sp.name[0] : '';
  }
  private show(): void {
    const l = this.lines[this.i]; const sp = SPEAKERS[l.who];
    if (sp && sp.img && this.img[l.side].dataset.who !== sp.name) this.setPortrait(l.side, sp);
    this.img.left.classList.toggle('lit', l.side === 'left'); this.img.right.classList.toggle('lit', l.side === 'right');
    this.root.classList.toggle('memory', (l.who === 'memory' || !!sp?.memory) && !l.bg); this.root.classList.toggle('narrate', l.who === 'memory');
    const bgEl = this.root.querySelector('.bgimg') as HTMLDivElement; this.root.classList.toggle('backdrop', !!l.bg);   // a still backdrop (assets/story/<bg>.jpg; a dark placeholder until the art exists)
    if (l.bg) bgEl.style.backgroundImage = `url(${this.base}assets/story/${l.bg}.jpg), radial-gradient(ellipse at 50% 35%, #4a2a18, #120806 75%)`;
    this.nameEl.textContent = l.name ?? sp?.name ?? ''; this.full = l.text; this.shown = 0; this.textEl.textContent = ''; this.nextEl.style.visibility = 'hidden';
    clearInterval(this.timer);
    this.timer = window.setInterval(() => {
      this.shown = Math.min(this.full.length, this.shown + 2); this.textEl.textContent = this.full.slice(0, this.shown);
      if (this.shown >= this.full.length) { clearInterval(this.timer); this.nextEl.style.visibility = 'visible'; }
    }, 30);
  }
  /** Finish the typing, or move on. */
  advance(): void {
    if (!this.isOpen) return;
    if (this.shown < this.full.length) { clearInterval(this.timer); this.shown = this.full.length; this.textEl.textContent = this.full; this.nextEl.style.visibility = 'visible'; return; }
    this.i++;
    if (this.i < this.lines.length) { this.show(); return; }
    this.isOpen = false; this.root.classList.remove('show'); clearInterval(this.timer); const d = this.done; this.done = null; d?.();
  }
}
