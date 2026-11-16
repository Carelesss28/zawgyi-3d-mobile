/**
 * Full-screen world map (GTA-style): tap the minimap (or press M) to open it; the game pauses underneath.
 * Shows the whole Chapter 1 map with the hero, every camp, the bosses and the treasure; drag to pan, wheel / pinch / +/- to zoom.
 */
export interface MapMarker { x: number; z: number; kind: 'camp' | 'archers' | 'necro' | 'guardian' | 'dragon' | 'treasure' | 'label' | 'quest'; text?: string; dead?: boolean }
export interface MapSource {
  canvas: HTMLCanvasElement | null;
  toPx: (x: number, z: number) => [number, number];
  hero: () => { x: number; z: number; facing: number };
  markers: () => MapMarker[];
}

export class BigMap {
  isOpen = false;
  private root: HTMLDivElement;
  private cv: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private zoom = 1;               // screen pixels per map pixel, relative to "fit"
  private cx = 0; private cy = 0; // map pixel at the screen centre
  private pts = new Map<number, { x: number; y: number }>();
  private pinch0 = 0; private zoom0 = 1;

  constructor(private src: MapSource, private onToggle: (open: boolean) => void) {
    this.root = document.createElement('div'); this.root.id = 'bigmap';
    this.root.innerHTML = `<canvas></canvas><div class="bm-title">CHAPTER 1 — THE RUINED TEMPLE</div>
      <div class="bm-ui"><button data-a="in" aria-label="Zoom in">+</button><button data-a="out" aria-label="Zoom out">−</button><button data-a="fit" aria-label="Whole map">⤢</button><button data-a="close" aria-label="Close map">✕</button></div>
      <div class="bm-legend"><span><i class="me"></i>You</span><span><i class="camp"></i>Camp</span><span><i class="arch"></i>Archer camp</span><span><i class="boss"></i>Boss</span><span><b>★</b>Treasure</span></div>`;
    document.body.appendChild(this.root);
    this.cv = this.root.querySelector('canvas')!; this.g = this.cv.getContext('2d')!;
    this.root.querySelector('.bm-ui')!.addEventListener('click', (e) => {
      const a = (e.target as HTMLElement).dataset.a; if (a === 'in') this.zoomBy(1.6); if (a === 'out') this.zoomBy(1 / 1.6); if (a === 'fit') this.fit(); if (a === 'close') this.close();
    });
    this.cv.addEventListener('pointerdown', (e) => { this.cv.setPointerCapture(e.pointerId); this.pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (this.pts.size === 2) { this.pinch0 = this.spread(); this.zoom0 = this.zoom; } });
    this.cv.addEventListener('pointermove', (e) => {
      const p = this.pts.get(e.pointerId); if (!p) return;
      if (this.pts.size === 1) { const s = this.scale(); this.cx -= (e.clientX - p.x) / s; this.cy -= (e.clientY - p.y) / s; }
      p.x = e.clientX; p.y = e.clientY;
      if (this.pts.size === 2 && this.pinch0 > 0) { this.zoom = Math.max(0.8, Math.min(8, this.zoom0 * this.spread() / this.pinch0)); }
    });
    const up = (e: PointerEvent) => { this.pts.delete(e.pointerId); this.pinch0 = 0; };
    this.cv.addEventListener('pointerup', up); this.cv.addEventListener('pointercancel', up);
    this.cv.addEventListener('wheel', (e) => { e.preventDefault(); this.zoomBy(e.deltaY < 0 ? 1.2 : 1 / 1.2); }, { passive: false });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyM') { this.isOpen ? this.close() : this.open(); e.preventDefault(); }
      else if (e.code === 'Escape' && this.isOpen) this.close();
    });
  }

  open(): void {
    if (this.isOpen || !this.src.canvas) return;
    this.isOpen = true; this.root.classList.add('show'); this.fit(); const h = this.src.hero(); const [px, py] = this.src.toPx(h.x, h.z);
    this.cx = px; this.cy = py; this.zoom = 1; this.onToggle(true); this.draw();
  }
  close(): void { if (!this.isOpen) return; this.isOpen = false; this.root.classList.remove('show'); this.pts.clear(); this.onToggle(false); }
  private fit(): void { const c = this.src.canvas; if (!c) return; this.cx = c.width / 2; this.cy = c.height / 2; this.zoom = 1; }
  private zoomBy(k: number): void { this.zoom = Math.max(0.8, Math.min(8, this.zoom * k)); }
  private spread(): number { const a = [...this.pts.values()]; return a.length < 2 ? 0 : Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y); }
  private scale(): number { const c = this.src.canvas!; const W = this.cv.clientWidth, H = this.cv.clientHeight; return Math.min(W / c.width, H / c.height) * 0.94 * this.zoom; }

  /** Redraw (called every frame while open). */
  draw(): void {
    const c = this.src.canvas; if (!this.isOpen || !c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1), W = this.cv.clientWidth, H = this.cv.clientHeight;
    if (this.cv.width !== Math.round(W * dpr) || this.cv.height !== Math.round(H * dpr)) { this.cv.width = Math.round(W * dpr); this.cv.height = Math.round(H * dpr); }
    const g = this.g; g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    const s = this.scale(); const sx = (px: number) => W / 2 + (px - this.cx) * s, sy = (py: number) => H / 2 + (py - this.cy) * s;
    g.imageSmoothingEnabled = s < 2; g.globalAlpha = 1;
    g.drawImage(c, sx(0), sy(0), c.width * s, c.height * s);
    g.strokeStyle = 'rgba(227,179,65,.6)'; g.lineWidth = 2; g.strokeRect(sx(0), sy(0), c.width * s, c.height * s);
    const R = Math.max(5, Math.min(12, 4 * s));
    for (const m of this.src.markers()) {
      const [px, py] = this.src.toPx(m.x, m.z); const x = sx(px), y = sy(py);
      if (m.kind === 'label') { g.font = `bold ${Math.round(11 + 2 * Math.min(3, this.zoom))}px Georgia, serif`; g.textAlign = 'center'; g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,.8)'; g.strokeText(m.text!, x, y); g.fillStyle = '#f4e3b0'; g.fillText(m.text!, x, y); continue; }
      if (m.kind === 'quest') {                                                    // the current objective: a pulsing gold diamond
        const p = R * 1.5 * (1 + 0.15 * Math.sin(performance.now() / 160)); g.fillStyle = '#ffe070'; g.strokeStyle = '#000'; g.lineWidth = 2;
        g.beginPath(); g.moveTo(x, y - p); g.lineTo(x + p, y); g.lineTo(x, y + p); g.lineTo(x - p, y); g.closePath(); g.fill(); g.stroke(); continue;
      }
      if (m.kind === 'treasure') { g.font = `bold ${Math.round(R * 2.4)}px serif`; g.textAlign = 'center'; g.fillStyle = '#ffd040'; g.strokeStyle = '#000'; g.lineWidth = 2; g.strokeText('★', x, y + R * 0.8); g.fillText('★', x, y + R * 0.8); continue; }
      const col = { camp: '#d8443a', archers: '#7ac050', necro: '#b04cff', guardian: '#ff7a2a', dragon: '#ff2050' }[m.kind];
      const r = m.kind === 'dragon' ? R * 1.6 : m.kind === 'camp' || m.kind === 'archers' ? R : R * 1.25;
      g.globalAlpha = m.dead ? 0.35 : 1; g.fillStyle = col; g.strokeStyle = '#000'; g.lineWidth = 2; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); g.stroke();
      g.fillStyle = '#fff'; g.font = `bold ${Math.round(r * 1.25)}px serif`; g.textAlign = 'center'; g.fillText(m.kind === 'camp' || m.kind === 'archers' ? '☠' : m.kind === 'dragon' ? '龍' : '♛', x, y + r * 0.45); g.globalAlpha = 1;
      if (m.text) { g.font = '11px Georgia, serif'; g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,.8)'; g.strokeText(m.text, x, y + r + 12); g.fillStyle = '#f0e6c8'; g.fillText(m.text, x, y + r + 12); }
    }
    // the hero: a gold arrow, pulsing
    const h = this.src.hero(); const [hx, hy] = this.src.toPx(h.x, h.z); const x = sx(hx), y = sy(hy); const pulse = 1 + 0.15 * Math.sin(performance.now() / 180);
    g.save(); g.translate(x, y); g.rotate(-h.facing + Math.PI); g.scale(pulse, pulse);
    g.fillStyle = '#ffd36a'; g.strokeStyle = '#000'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, 13); g.lineTo(-9, -9); g.lineTo(0, -4); g.lineTo(9, -9); g.closePath(); g.fill(); g.stroke(); g.restore();
  }
}
