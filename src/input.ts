/** Unified input: keyboard + mouse on desktop, floating joystick + buttons on touch. Multi-touch safe (pointer events). */
export class Input {
  /** Movement in screen space: x right, y up, each -1..1 (already length-limited to 1). */
  move = { x: 0, y: 0 };
  /** Mouse position in normalised device coordinates (desktop aim). */
  pointer: { x: number; y: number } | null = null;
  touchMode = false;
  attackPressed = false;
  dashPressed = false;
  /** The Leap Strike: blink behind an enemy and strike (V, or the LEAP button). */
  leapPressed = false;
  jumpPressed = false;
  skill1Pressed = false;
  skill2Pressed = false;
  skill3Pressed = false;
  skill4Pressed = false;
  elixirPressed = false;
  altarPressed = false;
  /** Element mixing: which of the 3 element buttons (-1 none), invoke, which spell slot to cast (-1 none). */
  elementPressed = -1; invokePressed = false; castPressed = -1;
  zoomPressed = false;
  resetPressed = false;

  private keys = new Set<string>();
  private stickId = -1;
  private stickOrigin = { x: 0, y: 0 };
  private listeners: Array<() => void> = [];
  private canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) { this.canvas = canvas; }

  setTouchMode(on: boolean): void {
    this.touchMode = on;
    document.getElementById('touch')!.classList.toggle('hidden', !on);
  }

  bind(): void {
    const on = <K extends keyof WindowEventMap>(t: Window | HTMLElement | Document, type: K | string, fn: (e: any) => void, opts?: AddEventListenerOptions) => {
      t.addEventListener(type as string, fn, opts); this.listeners.push(() => t.removeEventListener(type as string, fn, opts));
    };
    // keyboard
    on(window, 'keydown', (e: KeyboardEvent) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') { this.dashPressed = true; e.preventDefault(); }
      if (e.code === 'Space') { this.jumpPressed = true; e.preventDefault(); }
      if (e.code === 'KeyV') this.leapPressed = true;
      if (e.code === 'KeyJ') this.attackPressed = true;
      if (e.code === 'KeyK') this.skill1Pressed = true;
      if (e.code === 'KeyL') this.skill2Pressed = true;
      if (e.code === 'Digit1') this.elementPressed = 0; if (e.code === 'Digit2') this.elementPressed = 1; if (e.code === 'Digit3') this.elementPressed = 2;
      if (e.code === 'KeyQ') this.castPressed = 0; if (e.code === 'KeyE') this.castPressed = 1;
      if (e.code === 'KeyF') this.skill3Pressed = true;
      if (e.code === 'KeyU') this.skill4Pressed = true;
      if (e.code === 'KeyT') this.altarPressed = true;
      if (e.code === 'KeyZ') this.zoomPressed = true;
      if (e.code === 'KeyR') this.invokePressed = true;
      if (e.code === 'KeyP') this.resetPressed = true;
      if (e.code.startsWith('Arrow')) e.preventDefault();
    });
    on(window, 'keyup', (e: KeyboardEvent) => this.keys.delete(e.code));
    on(window, 'blur', () => this.clear());
    on(document, 'visibilitychange', () => { if (document.hidden) this.clear(); });
    // mouse
    on(this.canvas, 'pointermove', (e: PointerEvent) => { if (e.pointerType === 'mouse') this.pointer = { x: (e.clientX / innerWidth) * 2 - 1, y: -(e.clientY / innerHeight) * 2 + 1 }; });
    on(this.canvas, 'pointerdown', (e: PointerEvent) => { if (e.pointerType === 'mouse' && e.button === 0) { this.attackPressed = true; this.canvas.focus(); } });
    on(this.canvas, 'contextmenu', (e: Event) => e.preventDefault());
    // touch joystick (left half)
    const zone = document.getElementById('zone-left')!, stick = document.getElementById('stick')!, knob = document.getElementById('knob')!;
    const R = 52;
    on(zone, 'pointerdown', (e: PointerEvent) => {
      if (this.stickId !== -1) return;
      this.stickId = e.pointerId; zone.setPointerCapture(e.pointerId);
      this.stickOrigin = { x: e.clientX, y: e.clientY };
      stick.style.left = e.clientX + 'px'; stick.style.top = e.clientY + 'px'; stick.classList.add('on'); knob.style.transform = 'translate(0,0)';
    });
    on(zone, 'pointermove', (e: PointerEvent) => {
      if (e.pointerId !== this.stickId) return;
      let dx = e.clientX - this.stickOrigin.x, dy = e.clientY - this.stickOrigin.y; const len = Math.hypot(dx, dy);
      if (len > R) { dx = (dx / len) * R; dy = (dy / len) * R; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      const m = Math.min(1, Math.hypot(dx, dy) / R); const dead = 0.18;
      const mag = m < dead ? 0 : (m - dead) / (1 - dead);
      this.move = len > 0 ? { x: (dx / Math.max(1e-6, Math.hypot(dx, dy))) * mag, y: (-dy / Math.max(1e-6, Math.hypot(dx, dy))) * mag } : { x: 0, y: 0 };
    });
    const end = (e: PointerEvent) => { if (e.pointerId !== this.stickId) return; this.stickId = -1; this.move = { x: 0, y: 0 }; stick.classList.remove('on'); };
    on(zone, 'pointerup', end); on(zone, 'pointercancel', end); on(zone, 'lostpointercapture', end);
    // buttons
    const button = (id: string, fn: () => void) => {
      const b = document.getElementById(id)!;
      on(b, 'pointerdown', (e: PointerEvent) => { e.preventDefault(); b.classList.add('active'); fn(); });
      const up = () => b.classList.remove('active'); on(b, 'pointerup', up); on(b, 'pointercancel', up); on(b, 'pointerleave', up);
    };
    button('btn-attack', () => { this.attackPressed = true; });
    button('btn-dash', () => { this.dashPressed = true; });
    button('btn-leap', () => { this.leapPressed = true; });
    button('btn-jump', () => { this.jumpPressed = true; });
    button('btn-skill3', () => { this.skill3Pressed = true; });
    button('btn-el1', () => { this.elementPressed = 0; }); button('btn-el2', () => { this.elementPressed = 1; }); button('btn-el3', () => { this.elementPressed = 2; });
    button('btn-invoke', () => { this.invokePressed = true; }); button('btn-cast1', () => { this.castPressed = 0; }); button('btn-cast2', () => { this.castPressed = 1; });
    button('btn-altar', () => { this.altarPressed = true; });
    button('btn-zoom', () => { this.zoomPressed = true; });
    button('btn-reset', () => { this.resetPressed = true; });
  }

  /** Call once per frame: merges keyboard into move and returns it. */
  poll(): { x: number; y: number } {
    if (!this.touchMode || this.stickId === -1) {
      let x = 0, y = 0;
      if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
      if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
      if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y += 1;
      if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y -= 1;
      const l = Math.hypot(x, y); if (l > 0) { x /= Math.max(1, l); y /= Math.max(1, l); }
      if (x !== 0 || y !== 0) this.move = { x, y }; else if (this.stickId === -1) this.move = { x: 0, y: 0 };
    }
    return this.move;
  }

  endFrame(): void { this.attackPressed = false; this.dashPressed = false; this.leapPressed = false; this.jumpPressed = false; this.skill1Pressed = false; this.skill2Pressed = false; this.skill3Pressed = false; this.skill4Pressed = false; this.elixirPressed = false; this.altarPressed = false; this.elementPressed = -1; this.invokePressed = false; this.castPressed = -1; this.zoomPressed = false; this.resetPressed = false; }

  clear(): void {
    this.keys.clear(); this.move = { x: 0, y: 0 }; this.stickId = -1;
    document.getElementById('stick')?.classList.remove('on');
    document.querySelectorAll('.btn.active').forEach((b) => b.classList.remove('active'));
  }

  destroy(): void { this.listeners.forEach((off) => off()); this.listeners = []; }
}
