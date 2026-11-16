/**
 * Staff combo state machine. Pure logic: no rendering, no DOM, frame-rate independent.
 * Four hits: staff sweep, rising staff cut, spinning kick, overhead staff slam. The numbers below are defaults;
 * the game overwrites duration / hit window / chain window from the clip timing measured in Blender (clips.json).
 * Rules: input is buffered, each swing impacts once, the next hit may start only after chainFrom (no endless cancelling),
 * the last hit cannot chain, and the combo resets after resetDelay without input.
 */
export interface ComboStep {
  name: string;
  clip: string;
  duration: number;     // total clip time
  hitStart: number;     // first moment the swing can damage
  hitEnd: number;       // last moment
  chainFrom: number;    // earliest time the next hit can start
  damage: number;
  reach: number;        // metres from the hero's centre
  arc: number;          // degrees, full width of the swing
  knockback: number;    // metres of knock-back
  lunge: number;        // metres the hero steps forward during the swing
  lungeStart: number;
  lungeEnd: number;
  hitStop: number;      // seconds of impact freeze
  shake: number;        // camera shake strength
  shockwave: boolean;
}

export const COMBO_CONFIG = {
  bufferTime: 0.22,
  resetDelay: 0.45,
  steps: [
    { name: 'Sweep', clip: 'Attack1', duration: 0.45, hitStart: 0.19, hitEnd: 0.30, chainFrom: 0.34, damage: 1, reach: 2.5, arc: 130, knockback: 0.8, lunge: 0.7, lungeStart: 0.08, lungeEnd: 0.26, hitStop: 0.05, shake: 0.04, shockwave: false },
    { name: 'Rising Cut', clip: 'Attack2', duration: 0.45, hitStart: 0.19, hitEnd: 0.30, chainFrom: 0.34, damage: 1, reach: 2.6, arc: 140, knockback: 1.1, lunge: 0.7, lungeStart: 0.08, lungeEnd: 0.26, hitStop: 0.06, shake: 0.05, shockwave: false },
    { name: 'Spin Kick', clip: 'Kick2', duration: 0.66, hitStart: 0.38, hitEnd: 0.50, chainFrom: 0.56, damage: 1, reach: 2.6, arc: 160, knockback: 1.3, lunge: 0.6, lungeStart: 0.15, lungeEnd: 0.40, hitStop: 0.07, shake: 0.07, shockwave: false },
    { name: 'Slam', clip: 'Attack3', duration: 0.85, hitStart: 0.38, hitEnd: 0.50, chainFrom: 99, damage: 2, reach: 2.9, arc: 150, knockback: 2.4, lunge: 1.0, lungeStart: 0.20, lungeEnd: 0.42, hitStop: 0.11, shake: 0.12, shockwave: true },
  ] as ComboStep[],
};

export type ComboConfig = typeof COMBO_CONFIG;

export class Combo {
  readonly cfg: ComboConfig;
  index = -1;            // current step while attacking, last step afterwards
  t = 0;                 // time inside the current step
  active = false;
  impacted = false;
  sinceEnd = 99;
  private queued = 0;
  private lastIndex = -1;
  onStart?: (step: ComboStep, index: number) => void;
  onImpact?: (step: ComboStep, index: number) => void;
  onEnd?: (index: number) => void;

  constructor(cfg: ComboConfig = COMBO_CONFIG) { this.cfg = cfg; }

  get step(): ComboStep | null { return this.active ? this.cfg.steps[this.index] : null; }
  /** True while the swing can damage. */
  get hitActive(): boolean { const s = this.step; return !!s && this.t >= s.hitStart && this.t <= s.hitEnd; }
  /** Normalised lunge progress 0..1 for the current swing. */
  get lungeProgress(): number {
    const s = this.step; if (!s) return 0;
    return Math.max(0, Math.min(1, (this.t - s.lungeStart) / (s.lungeEnd - s.lungeStart)));
  }

  /** Player pressed attack. The press is remembered for bufferTime seconds. */
  press(): void { this.queued = this.cfg.bufferTime; }

  /** Abort the current swing (dash cancel, hurt). */
  cancel(): void {
    if (this.active) { this.active = false; this.sinceEnd = this.cfg.resetDelay + 1; this.lastIndex = -1; this.queued = 0; this.onEnd?.(this.index); }
  }

  update(dt: number): void {
    const hadQueue = this.queued > 0;
    if (!this.active) {
      this.sinceEnd += dt;
      if (hadQueue) {
        const next = this.lastIndex >= 0 && this.lastIndex < this.cfg.steps.length - 1 && this.sinceEnd < this.cfg.resetDelay ? this.lastIndex + 1 : 0;
        this.start(next);
      }
    } else {
      const s = this.cfg.steps[this.index];
      this.t += dt;
      if (!this.impacted && this.t >= s.hitStart) { this.impacted = true; this.onImpact?.(s, this.index); }
      if (hadQueue && this.index < this.cfg.steps.length - 1 && this.t >= s.chainFrom) {
        this.start(this.index + 1);
      } else if (this.t >= s.duration) {
        this.active = false; this.lastIndex = this.index; this.sinceEnd = 0; this.onEnd?.(this.index);
      }
    }
    // A press made while a non-final swing is playing is held until its chain window opens, so early taps are never lost.
    const holding = this.active && this.index < this.cfg.steps.length - 1;
    if (!holding) this.queued = Math.max(0, this.queued - dt);
  }

  private start(i: number): void {
    this.index = i; this.t = 0; this.active = true; this.impacted = false; this.queued = 0; this.lastIndex = i;
    this.onStart?.(this.cfg.steps[i], i);
  }
}
