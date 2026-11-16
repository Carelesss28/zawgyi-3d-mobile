import './style.css';
import { Game } from './game';
import { LOOKS, LOOK_ID } from './look';
import { Input } from './input';
import { sfx } from './audio';
import { buildSpellsPanel } from './spells';
import { Intro } from './intro';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const params = new URLSearchParams(location.search);
const coarse = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
const forceTouch = params.get('touch') === '1';

async function boot(): Promise<void> {
  const canvas = $<HTMLCanvasElement>('view');
  const input = new Input(canvas);
  input.setTouchMode(false);
  input.touchMode = coarse || forceTouch;                  // decides renderer settings; the touch UI itself shows after Start
  $('help-touch').classList.toggle('hidden', !input.touchMode); $('help-desk').classList.toggle('hidden', input.touchMode);
  $<HTMLInputElement>('chk-touch').checked = forceTouch;
  input.bind();
  const game = new Game(canvas, input);
  game.debug = params.has('debug');
  $('debug').classList.toggle('hidden', !game.debug);
  (window as any).__zg = game;
  try {
    await game.load((p) => { $('bar-fill').style.width = Math.round(p * 100) + '%'; });
  } catch (err) {
    const el = $('load-error'); el.classList.remove('hidden'); el.textContent = 'Could not load the test.\n' + (err instanceof Error ? err.message + '\n' + (err.stack ?? '') : String(err));
    $('load-text').textContent = 'Loading failed.'; return;
  }
  game.run();
  sfx.setBase(import.meta.env.BASE_URL);
  // phones only allow sound after a tap: the first tap on the menu starts the menu music
  window.addEventListener('pointerdown', () => { sfx.unlock(); if ($('start').classList.contains('show')) sfx.music('menu'); }, { once: true });
  $('loading').classList.remove('show'); $('start').classList.add('show');
  $('chk-touch').addEventListener('change', (e) => { const on = (e.target as HTMLInputElement).checked; input.touchMode = on || coarse; $('help-touch').classList.toggle('hidden', !input.touchMode); $('help-desk').classList.toggle('hidden', input.touchMode); });
  document.getElementById('btn-travel')?.addEventListener('click', () => game.openTravel());
  window.addEventListener('keydown', (e) => { if (e.code === 'KeyG') game.openTravel(); });
  { const c = $('chk-glow') as HTMLInputElement | null; if (c) { c.checked = !!game.atmo?.glow; c.addEventListener('change', () => { game.atmo?.setGlow(c.checked); localStorage.setItem('zg.glow', c.checked ? '1' : '0'); }); } }
  { const sl = $('sel-look') as HTMLSelectElement; sl.innerHTML = LOOKS.map((l, i) => `<option value="${i}">${i}. ${l.name}</option>`).join(''); sl.value = String(LOOK_ID);
    sl.addEventListener('change', () => { localStorage.setItem('zg.look', sl.value); const u = new URL(location.href); u.searchParams.delete('look'); location.href = u.toString(); }); }
  { const c = $('chk-fps120') as HTMLInputElement; c.checked = game.fpsCap === 0; c.addEventListener('change', () => { game.fpsCap = c.checked ? 0 : 60; localStorage.setItem('zg.fps120', c.checked ? '1' : '0'); }); }
  { const sp = $('spells-panel'); buildSpellsPanel(sp, (l) => game.setLoadout(l), () => { game.paused = false; });
    const open = () => { sp.classList.remove('hidden'); if (game.started) game.paused = true; };
    $('btn-spells-menu').addEventListener('click', open); $('btn-spells').addEventListener('pointerdown', (e) => { e.preventDefault(); open(); }); }
  const ctl = $('mm-controls'); $('btn-controls').addEventListener('click', () => ctl.classList.toggle('hidden')); $('btn-controls-close').addEventListener('click', () => ctl.classList.add('hidden'));
  const intro = new Intro(import.meta.env.BASE_URL);
  $('btn-intro').addEventListener('click', () => { sfx.unlock(); void intro.play(); });
  let starting = false;
  // a saved Chapter 1 game: Continue picks it up; Start becomes New Game (and asks before it throws the save away)
  const saved = params.get('map') !== 'arena' && Game.hasSave();
  $('btn-resume').classList.toggle('hidden', !saved); if (saved) $('btn-start').textContent = 'New Game';
  $('btn-resume').addEventListener('click', () => {
    if (starting) return; starting = true; sfx.unlock(); $('start').classList.remove('show'); $('hud').classList.remove('hidden'); input.setTouchMode(input.touchMode); sfx.music('explore');
    if (!game.continueGame()) game.start();
    if (document.documentElement.requestFullscreen && coarse) document.documentElement.requestFullscreen().catch(() => { /* optional */ });
    canvas.focus();
  });
  $('btn-start').addEventListener('click', async () => {
    if (starting) return;
    if (saved && !navigator.webdriver && !confirm('Start a new game? Your saved progress will be replaced.')) return;
    starting = true; if (saved) Game.clearSave();
    // first time: the prologue plays before the game (not under automated tests); replay it from the menu any time
    if (!navigator.webdriver && params.get('map') !== 'arena' && !localStorage.getItem('zg.introSeen')) { sfx.unlock(); await intro.play(); localStorage.setItem('zg.introSeen', '1'); }
    sfx.unlock(); $('start').classList.remove('show'); $('hud').classList.remove('hidden'); input.setTouchMode(input.touchMode); sfx.music('explore'); game.start();
    if (document.documentElement.requestFullscreen && coarse) document.documentElement.requestFullscreen().catch(() => { /* optional */ });
    canvas.focus();
  });
  // pause-safe: drop held inputs when the tab is hidden
  document.addEventListener('visibilitychange', () => { if (document.hidden) { input.clear(); game.saveGame(true); } });
  window.addEventListener('pagehide', () => game.saveGame(true));
}

boot().catch((e) => { const el = $('load-error'); el.classList.remove('hidden'); el.textContent = String(e); });
