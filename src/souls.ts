import { ATTRS, type AttrId } from './stats';
import * as THREE from 'three';
import { sfx } from './audio';

/**
 * Souls (leikpya, butterfly-souls): every fallen creature frees the souls it devoured. Glowing butterflies rise from the body,
 * flutter, then fly to Zaw Gyi and are absorbed; each adds to the soul count, spent at Ma Hnin's altar to level up.
 */
interface Fly { s: THREE.Sprite; t: number; v: number; from: THREE.Vector3; up: THREE.Vector3; ph: number }

export class Souls {
  count = 0;
  private flies: Fly[] = [];
  private mat: THREE.SpriteMaterial;
  private el: HTMLDivElement;
  private shown = '';
  private bump = 0;
  /** Shown next to the soul count. */
  level = 1;

  constructor(private scene: THREE.Scene, base: string) {
    const tex = new THREE.TextureLoader().load(`${base}assets/ui/soul.png`); tex.colorSpace = THREE.SRGBColorSpace;
    this.mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    this.el = document.createElement('div'); this.el.id = 'souls';
    this.el.innerHTML = `<b class="lv">Lv 1</b><img src="${base}assets/ui/soul.png" alt=""><span>0</span>`;
    document.getElementById('hud')?.appendChild(this.el);
  }

  /** Release `value` souls at `at` (shown as up to 6 butterflies, each carrying a share). */
  release(at: THREE.Vector3, value: number): void {
    const n = Math.min(6, Math.max(1, Math.round(value / 3)));
    for (let i = 0; i < n; i++) {
      const s = new THREE.Sprite(this.mat.clone()); s.scale.set(0.5, 0.34, 1);
      const from = at.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.8, 1 + Math.random() * 0.4, (Math.random() - 0.5) * 0.8)); s.position.copy(from); this.scene.add(s);
      const a = Math.random() * 6.28; const up = new THREE.Vector3(Math.cos(a) * 1.2, 2 + Math.random() * 1.2, Math.sin(a) * 1.2);
      this.flies.push({ s, t: -i * 0.07, v: value / n, from, up, ph: Math.random() * 6 });
    }
  }

  update(dt: number, hero: THREE.Vector3): void {
    for (let i = this.flies.length - 1; i >= 0; i--) {
      const f = this.flies[i]; f.t += dt; if (f.t < 0) continue;
      const flap = 0.55 + 0.45 * Math.abs(Math.sin((f.t + f.ph) * 14)); f.s.scale.set(0.5 * flap, 0.34, 1);         // wings beat
      if (f.t < 0.7) { const k = f.t / 0.7; f.s.position.copy(f.from).addScaledVector(f.up, Math.sin(k * Math.PI / 2)); f.s.position.x += Math.sin(f.t * 6 + f.ph) * 0.15; }
      else {
        const tgt = hero.clone().setY(hero.y + 1.2); const d = tgt.clone().sub(f.s.position); const L = d.length();
        const sp = 4 + (f.t - 0.7) * 14; f.s.position.addScaledVector(d.normalize(), Math.min(L, sp * dt)); f.s.position.y += Math.sin(f.t * 9 + f.ph) * 0.02;
        if (L < 0.35) { this.count += f.v; this.bump = 0.25; sfx.soul(); f.s.removeFromParent(); (f.s.material as THREE.Material).dispose(); this.flies.splice(i, 1); }
      }
    }
    const key = `${this.level}|${Math.floor(this.count + 1e-6)}`;
    if (key !== this.shown) { this.shown = key; (this.el.querySelector('span') as HTMLSpanElement).textContent = String(Math.floor(this.count + 1e-6)); (this.el.querySelector('.lv') as HTMLElement).textContent = `Lv ${this.level}`; }
    this.bump = Math.max(0, this.bump - dt); this.el.style.transform = `scale(${1 + this.bump * 0.8})`;
  }

  spend(n: number): boolean { if (this.count < n) return false; this.count -= n; return true; }
  show(on: boolean): void { this.el.classList.toggle('on', on); }
}

export { ATTRS, type AttrId };

export interface AltarApi {
  souls: () => number; level: () => number; points: () => number; attr: (id: AttrId) => number; levelCost: () => number;
  levelUp: () => boolean; raise: (id: AttrId) => boolean; stats: () => string; relic: (id: string) => void; close: () => void;
}

/** Ma Hnin's altar: spend souls to level up (+3 attribute points each), then spend the points. */
export class Altar {
  isOpen = false; private statsOpen = false;
  private root: HTMLDivElement;
  constructor(private base: string, private api: AltarApi) {
    this.root = document.createElement('div'); this.root.id = 'altar'; document.body.appendChild(this.root);
    this.root.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      if (t.closest('.alt-lvl') && this.api.levelUp()) this.render();
      const r = t.closest('[data-raise]') as HTMLElement | null; if (r && this.api.raise(r.dataset.raise as AttrId)) this.render();
      const rl = t.closest('[data-relic]') as HTMLElement | null; if (rl) { this.api.relic(rl.dataset.relic!); this.render(); }
      if (t.closest('.alt-stbtn')) { this.statsOpen = !this.statsOpen; this.render(); }
      if (t.closest('.alt-close')) this.close();
    });
    window.addEventListener('keydown', (e) => { if (this.isOpen && (e.code === 'Escape' || e.code === 'KeyT')) { e.stopPropagation(); this.close(); } }, true);
  }
  open(): void { this.isOpen = true; this.root.classList.add('show'); this.render(); }
  close(): void { if (!this.isOpen) return; this.isOpen = false; this.root.classList.remove('show'); this.api.close(); }
  private render(): void {
    const s = Math.floor(this.api.souls()), cost = this.api.levelCost(), pts = this.api.points(), soul = `<img src="${this.base}assets/ui/soul.png" alt="">`;
    this.root.innerHTML = `<div class="alt-box">
      <div class="alt-head"><img src="${this.base}assets/portraits/mahnin.png" alt=""><div><div class="alt-title">The Altar</div><div class="alt-sub">“The freed souls want to help you.” — Ma Hnin</div></div></div>
      <div class="alt-top"><div class="alt-souls">${soul} ${s} souls</div><div class="alt-level">Level ${this.api.level()}</div></div>
      <button class="alt-lvl" ${s < cost ? 'disabled' : ''}>Level up &nbsp;${soul} ${cost} <small>(+3 points)</small></button>
      <div class="alt-pts">${pts > 0 ? `<b>${pts}</b> point${pts > 1 ? 's' : ''} to spend` : 'No points to spend'}</div>
      ${ATTRS.map((a) => `<div class="alt-row"><img class="alt-ic" src="${this.base}assets/ui/attr_${a.id}.jpg" alt=""><div class="alt-name">${a.name} <span class="alt-val">${this.api.attr(a.id)}</span><div class="alt-desc">${a.desc} per point</div></div>
          <button data-raise="${a.id}" ${pts > 0 ? '' : 'disabled'}>+</button></div>`).join('')}
      <button class="alt-stbtn">${this.statsOpen ? 'Hide stats ▴' : 'Stats &amp; Relics ▾'}</button>${this.statsOpen ? `<div class="alt-stats">${this.api.stats()}</div>` : ''}
      <button class="alt-close">Leave the altar</button></div>`;
  }
}
