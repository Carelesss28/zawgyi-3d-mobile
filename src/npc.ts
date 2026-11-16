import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

/** A story character (not an enemy): a model, its clips, and a crossfading `play`. Loads once per asset, clones per use. */
const cache = new Map<string, Promise<{ scene: THREE.Object3D; clips: THREE.AnimationClip[]; meta: Record<string, { speed: number; loop?: boolean }>; height: number }>>();

export class Npc {
  readonly root = new THREE.Group();
  loaded = false;
  private mixer: THREE.AnimationMixer | null = null;
  private actions = new Map<string, THREE.AnimationAction>();
  private cur: THREE.AnimationAction | null = null;
  private meta: Record<string, { speed: number; loop?: boolean }> = {};
  /** Clip currently playing (for tests and logic). */
  clip = '';

  constructor(private asset: string, private height: number) {}

  async load(base: string): Promise<void> {
    let p = cache.get(this.asset);
    if (!p) {
      p = Promise.all([new GLTFLoader().loadAsync(`${base}assets/${this.asset}.glb`), fetch(`${base}assets/${this.asset}-clips.json`).then((r) => r.json())])
        .then(([g, m]) => ({ scene: g.scene, clips: g.animations, meta: m.clips, height: m.height }));
      cache.set(this.asset, p);
    }
    const a = await p; this.meta = a.meta;
    const model = SkeletonUtils.clone(a.scene); model.scale.setScalar(this.height / a.height); this.root.add(model);
    model.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.frustumCulled = false; const mat = m.material as THREE.MeshStandardMaterial; if (mat?.isMeshStandardMaterial) { mat.metalness = 0; mat.roughness = 0.85; } } });
    this.mixer = new THREE.AnimationMixer(model);
    for (const c of a.clips) { const n = c.name.replace(/^.*[|:]/, ''); const ac = this.mixer.clipAction(c); ac.setLoop(this.meta[n]?.loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity); ac.clampWhenFinished = true; this.actions.set(n, ac); }
    this.loaded = true;
  }

  /** Crossfade to a clip; a non-looping clip can hand over to `then` when it finishes. */
  play(name: string, fade = 0.35, then?: string): void {
    const next = this.actions.get(name); if (!next || (this.cur === next && next.isRunning())) return;
    next.reset(); next.timeScale = this.meta[name]?.speed ?? 1; next.setEffectiveWeight(1); next.play();
    if (this.cur && this.cur !== next) this.cur.crossFadeTo(next, fade, false);
    this.cur = next; this.clip = name;
    if (then && this.mixer) { const m = this.mixer; const done = (e: { action: THREE.AnimationAction }) => { if (e.action === next) { m.removeEventListener('finished', done); this.play(then, fade); } }; m.addEventListener('finished', done); }
  }

  update(dt: number): void { this.mixer?.update(dt); }
}
