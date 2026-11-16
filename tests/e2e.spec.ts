import { test, expect, Page } from '@playwright/test';

type Snap = {
  state: string; hp: number; combo: { active: boolean; index: number; t: number }; pos: [number, number];
  enemies: Array<{ kind: string; hp: number; dead: boolean; state: string }>; clip: string | null; started: boolean;
};
const snap = (page: Page) => page.evaluate(() => (window as any).__zg.snapshot() as Snap);
const adv = (page: Page, s: number) => page.evaluate((d) => (window as any).__zg.advance(d), s);
const attack = (page: Page) => page.evaluate(() => (window as any).__zg.pressAttack());
/** Advance the frozen game in 50 ms steps until `cond` holds (max `max` seconds). Returns the final snapshot. */
async function until(page: Page, cond: (s: Snap) => boolean, max = 3): Promise<Snap> {
  let s = await snap(page);
  for (let t = 0; t < max && !cond(s); t += 0.05) { await adv(page, 0.05); s = await snap(page); }
  return s;
}

async function boot(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/GL Driver|ReadPixels|AudioContext/.test(m.text())) errors.push(m.text()); });
  await page.goto('/?map=arena');
  await page.waitForSelector('#start.show', { timeout: 60_000 });
  await page.click('#btn-start');
  // freeze real time at once and park the sentry far away, so every test starts from the same state
  await page.evaluate(() => { const g = (window as any).__zg; g.setManual(true); g.noCrit = true; g.reset(); g.enemies[3].pos.set(-12, 0, -12); g.enemies[3].setState('idle'); g.teleport(3.5, 3.6, 0.35); g.advance(0.5); });
  return errors;
}

test('loads and starts without errors; the hero idles', async ({ page }) => {
  const errors = await boot(page);
  const s = await snap(page);
  expect(s.started).toBe(true); expect(s.clip).toBe('Idle'); expect(s.hp).toBe(777);
  expect(errors).toEqual([]);
});

test('four-hit combo: staff, staff, kick, slam hit once each for 60, 60, 60 and 120 damage (1, 1, 1, 2 x attack damage), in clip order', async ({ page }) => {
  await boot(page);
  const hp0 = (await snap(page)).enemies[0].hp;
  await attack(page);
  let s = await until(page, (x) => x.enemies[0].hp === hp0 - 60);
  expect(s.clip).toBe('Attack1'); expect(s.enemies[0].hp).toBe(hp0 - 60);
  await attack(page);                                   // held until the chain window opens
  s = await until(page, (x) => x.enemies[0].hp === hp0 - 120);
  expect(s.clip).toBe('Attack2'); expect(s.enemies[0].hp).toBe(hp0 - 120);
  await attack(page);
  s = await until(page, (x) => x.enemies[0].hp === hp0 - 180);
  expect(s.clip).toBe('Kick2'); expect(s.enemies[0].hp).toBe(hp0 - 180);
  await attack(page);
  s = await until(page, (x) => x.enemies[0].hp === hp0 - 300);
  expect(s.clip).toBe('Attack3'); expect(s.enemies[0].hp).toBe(hp0 - 300);
  s = await until(page, (x) => x.state === 'free' && x.clip === 'Idle', 4);
  expect(s.state).toBe('free'); expect(s.clip).toBe('Idle');
});

test('an enemy is hit only once per swing while the hit window is open', async ({ page }) => {
  await boot(page);
  const hp0 = (await snap(page)).enemies[0].hp;
  await attack(page);
  await until(page, (x) => x.state === 'free' && x.combo.index >= 0 && !x.combo.active, 3);
  await adv(page, 0.3);
  expect((await snap(page)).enemies[0].hp).toBe(hp0 - 60);
});

test('combo timing comes from the clips: impact lands inside each swing and the chain window is open before it ends', async ({ page }) => {
  await boot(page);
  const steps = await page.evaluate(() => (window as any).__zg.combo.cfg.steps.map((x: any) => ({ d: x.duration, hs: x.hitStart, he: x.hitEnd, ch: x.chainFrom })));
  expect(steps).toHaveLength(4);
  for (const st of steps) { expect(st.hs).toBeGreaterThan(0.05); expect(st.he).toBeGreaterThan(st.hs); expect(st.he).toBeLessThanOrEqual(st.d); expect(st.hs).toBeLessThan(1.0); }
  for (const st of steps.slice(0, 3)) expect(st.ch).toBeLessThan(st.d);
});

test('dash covers about 4.5 m and cancels the swing', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => { const g = (window as any).__zg; g.teleport(0, 0, 0); g.pressAttack(); g.advance(0.05); g.pressDash(); g.advance(0.01); });
  expect((await snap(page)).state).toBe('dash');
  await adv(page, 0.5);
  const s = await snap(page); const d = Math.hypot(s.pos[0], s.pos[1]);
  expect(d).toBeGreaterThan(3.5); expect(d).toBeLessThan(5.5); expect(s.state).toBe('free');
});

test('the sentry telegraphs and strikes the hero, and dashing through the strike dodges it', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => { const g = (window as any).__zg; g.enemies[3].pos.set(1.6, 0, 0); g.teleport(0, 0, 0); g.advance(0.05); });
  await adv(page, 1.4);
  { const h = (await snap(page)).hp; expect(h).toBeGreaterThan(690); expect(h).toBeLessThan(700); }   // 95 physical, less 15% from 3 armor = 81, plus a little regen
  // second try: dash at the moment of the strike
  await page.evaluate(() => { const g = (window as any).__zg; g.reset(); g.enemies[3].pos.set(1.6, 0, 0); g.teleport(0, 0, 0); g.advance(0.05); });
  await adv(page, 0.78);
  await page.evaluate(() => { const g = (window as any).__zg; g.pressDash(); g.advance(0.01); });
  await adv(page, 0.6);
  expect((await snap(page)).hp).toBe(777);
});

test('touch controls: the joystick moves the hero, a second finger attacks, buttons fit a phone screen', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage(); const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?map=arena');
  await page.waitForSelector('#start.show', { timeout: 60_000 });
  await page.tap('#btn-start'); await page.waitForTimeout(500);
  expect(await page.locator('#touch').isVisible()).toBe(true);
  for (const id of ['#btn-attack', '#btn-dash']) {
    const b = (await page.locator(id).boundingBox())!;
    expect(b.x + b.width).toBeLessThanOrEqual(844); expect(b.y + b.height).toBeLessThanOrEqual(390); expect(b.width).toBeGreaterThanOrEqual(60);
  }
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 110, y: 290, id: 1 }] }); await page.waitForTimeout(80);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 190, y: 240, id: 1 }] }); await page.waitForTimeout(1500);
  const moved = await snap(page);
  expect(Math.hypot(...moved.pos)).toBeGreaterThan(0.3); expect(moved.clip).toBe('Run');
  const r = (await page.locator('#btn-attack').boundingBox())!;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 190, y: 240, id: 1 }, { x: r.x + r.width / 2, y: r.y + r.height / 2, id: 2 }] });
  await expect.poll(async () => (await snap(page)).state, { timeout: 1500, intervals: [50] }).toBe('attack');   // real time: give a slow software renderer a few frames
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await ctx.close();
  expect(errors).toEqual([]);
});

test('skills: Alchemy Blast hits for 180 and goes on cooldown; Twin Kick lands a push kick then a spinning kick', async ({ page }) => {
  await boot(page);
  const hp0 = (await snap(page)).enemies[0].hp;
  await page.evaluate(() => (window as any).__zg.pressSkill(1));
  let s = await until(page, (x) => x.enemies[0].hp === hp0 - 180, 2);
  expect(s.enemies[0].hp).toBe(hp0 - 180); expect(s.clip).toBe('Skill1');
  expect((s as any).cooldown[1]).toBeGreaterThan(2);
  s = await until(page, (x) => x.state === 'free', 2);
  await page.evaluate(() => (window as any).__zg.pressSkill(1)); await adv(page, 0.05);
  expect((await snap(page)).state).toBe('free');                    // still cooling down
  // twin kick on the dummy in front: 2 then 3 damage, push kick then spinning kick
  await page.evaluate(() => { const g = (window as any).__zg; g.reset(); g.enemies[3].pos.set(-12, 0, -12); g.enemies[3].setState('idle'); g.teleport(3.5, 3.9, 0); g.advance(0.1); g.pressSkill(3); g.advance(0.02); });
  expect((await snap(page)).clip).toBe('Kick1');
  s = await until(page, (x) => x.enemies[0].hp === hp0 - 120, 2); expect(s.enemies[0].hp).toBe(hp0 - 120);
  s = await until(page, (x) => x.clip === 'Kick2', 2); expect(s.clip).toBe('Kick2');
  s = await until(page, (x) => x.state === 'free', 3);
  expect(s.enemies[0].hp).toBe(hp0 - 300);
  // chain lightning: 3 to the first dummy, then it jumps on for 2 more
  await page.evaluate(() => { const g = (window as any).__zg; g.reset(); g.enemies[3].pos.set(-12, 0, -12); g.enemies[3].setState('idle'); g.teleport(3.5, 3.6, 0); g.advance(0.1); g.pressSkill(4); g.advance(0.02); });
  expect((await snap(page)).clip).toBe('Chain');
  s = await until(page, (x) => x.state === 'free', 3);
  expect(s.enemies[0].hp).toBe(hp0 - 180);
  expect(s.enemies.slice(0, 3).reduce((n, e) => n + (600 - e.hp), 0)).toBeGreaterThanOrEqual(300);
  // golden seal: two eruptions of 2 around him
  await page.evaluate(() => { const g = (window as any).__zg; g.reset(); g.enemies[3].pos.set(-12, 0, -12); g.enemies[3].setState('idle'); g.teleport(3.5, 3.6, 0); g.advance(0.1); g.pressSkill(2); g.advance(0.02); });
  expect((await snap(page)).clip).toBe('Seal');
  s = await until(page, (x) => x.state === 'free', 3);
  expect(s.enemies[0].hp).toBe(hp0 - 240);
});

test("leap strike: V blinks him behind the enemy he faces, strikes it, and goes on cooldown; and the combo's second hit stuns", async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => {
    const g = (window as any).__zg; g.setManual(true); g.teleport(3.5, -1, 0); g.advance(0.2);
    const d = g.enemies.find((e: any) => Math.abs(e.pos.x - 3.5) < 0.1 && Math.abs(e.pos.z - 5.5) < 0.1); const hp0 = d.hp;
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyV' })); g.advance(0.05); window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyV' }));
    const out = { behind: g.hero.position.z > d.pos.z + 0.5, hurt: d.hp < hp0, cd: g.leapCd > 4 };
    g.advance(0.6); window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyV' })); g.advance(0.05); window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyV' }));
    return { ...out, stillCd: g.leapCd > 3 };
  });
  expect(r.behind).toBe(true); expect(r.hurt).toBe(true); expect(r.cd).toBe(true); expect(r.stillCd).toBe(true);
});

test('Temple Guardian boss: loads, wakes with a roar, bashes the hero for 2, enrages at half health and crumbles when beaten', async ({ page }) => {
  test.setTimeout(600_000);                                           // software WebGL stalls up to ~20 s compiling the boss effects the first time
  await boot(page);
  let s: any = await snap(page);
  expect(s.boss.loaded).toBe(true); expect(s.boss.state).toBe('dormant');
  await page.evaluate(() => { const g = (window as any).__zg; g.teleport(-5, 5.5, -0.8); g.advance(0.05); });
  s = await until(page, (x: any) => x.boss.state === 'roar', 1); expect(s.boss.state).toBe('roar');
  s = await until(page, (x: any) => x.hp < 777, 8);
  expect(s.hp).toBeGreaterThan(588); expect(s.hp).toBeLessThan(595);   // the shield bash: 220 physical, less 15% from armor = 186
  await page.evaluate(() => { const g = (window as any).__zg; g.reset(); g.boss.hp = 1260; g.boss.wakeNow(); g.teleport(-6.5, 6.5, 2.356); g.advance(0.05); g.boss.hurt(120, 1, 0, 0, false); g.advance(0.05); });
  s = await until(page, (x: any) => x.boss.enraged, 6); expect(s.boss.enraged).toBe(true);
  await page.evaluate(() => { const g = (window as any).__zg; g.boss.hurt(9999, 1, 0, 0, true); g.advance(0.05); });
  s = await snap(page); expect(s.boss.state).toBe('dead');
  s = await until(page, (x: any) => x.boss.state === 'dormant', 12); expect(s.boss.state).toBe('dormant');   // returns for another round
});

test('Chapter 1 map: walls block, the corridor leads north into the canal gallery, the Guardian waits in the lotus court', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.waitForSelector('#start.show', { timeout: 90_000 });
  await page.click('#btn-start');
  await page.evaluate(() => { const g = (window as any).__zg; g.setManual(true); g.reset(); g.advance(0.2); });
  let s: any = await snap(page);
  expect(s.boss.loaded).toBe(true); expect(s.boss.state).toBe('dormant');
  const start = s.pos;
  // west (screen left) runs into the Relief Chamber wall
  await page.keyboard.down('KeyA'); await adv(page, 4);
  // still running into the wall: the drawn body (hips) stays over the collision point, not a metre ahead inside the wall
  const off = await page.evaluate(() => {
    const g = (window as any).__zg; const b: Record<string, any> = {};
    g.model.traverse((o: any) => { for (const n of ['Hips', 'Staff_Grip', 'Right_Hand']) if (o.name.endsWith(n) && !b[n]) b[n] = o; });
    const w = (o: any) => o.getWorldPosition(o.position.clone()); const h = w(b.Hips), s = w(b.Staff_Grip), r = w(b.Right_Hand);
    return { hips: Math.hypot(h.x - g.hero.position.x, h.z - g.hero.position.z), grip: s.distanceTo(r) };
  });
  expect(off.hips).toBeLessThan(0.3);
  expect(off.grip).toBeLessThan(0.35);                                    // and the staff stays in his hand
  await page.keyboard.up('KeyA');
  const TX = await page.evaluate(() => (window as any).__zg.ch1.TX); const TY = 8;
  s = await snap(page); expect(s.pos[0]).toBeLessThan(TX + 29.6 * 1.4); expect(s.pos[0]).toBeGreaterThan(start[0]);
  // north through the corridor and into the gallery (from behind the seal pillar, which stands between the spawn and the doorway)
  await page.evaluate(() => { const g = (window as any).__zg; g.reset(); const P = g.ch1.CH1.sealPillar; g.teleport(P.x, P.z + 2.6, 0); g.advance(0.1); });
  await page.keyboard.down('KeyW'); await adv(page, 4); await page.keyboard.up('KeyW');
  s = await snap(page); expect(s.pos[1]).toBeGreaterThan(-4.5 * 1.4);    // past the chamber's north wall, into the gallery
  // south through the collapsed wall of the Relief Chamber and out onto the jungle floor
  await page.evaluate(() => { const g = (window as any).__zg; g.reset(); g.advance(0.1); });
  await page.keyboard.down('KeyS'); await adv(page, 4.5); await page.keyboard.up('KeyS');
  s = await snap(page); expect(s.pos[1]).toBeLessThan(-24 * 1.4);
  expect(await page.evaluate(() => (window as any).__zg.hero.position.y)).toBeLessThan(TY - 0.2);                 // out on the hill's plateau
  // the river (down the foot of the temple hill) is not walkable: running west at it from the village stops on the bank
  await page.evaluate(() => { const g = (window as any).__zg; g.teleport(26, 30, 0); g.advance(0.1); });
  await page.keyboard.down('KeyA'); await adv(page, 3); await page.keyboard.up('KeyA');
  s = await snap(page); expect(s.pos[0]).toBeLessThan(38); expect(await page.evaluate(() => { const g = (window as any).__zg; return g.walk.ok(g.hero.position.x + 1.2, g.hero.position.z); })).toBe(false);   // stopped at the water
  // the Grand Stair: from the Temple Bridge up onto the hill (8 m)
  await page.evaluate(() => { const g = (window as any).__zg; const S = g.ch1.stair; g.teleport(S.xBot - 2, (S.z0 + S.z1) / 2, -Math.PI / 2); g.advance(0.1); });
  // up and back down, he stays on the steps the whole way (the floor follows the ramp: no drop to the ground part-way)
  const offRamp = async (key: string) => {
    let worst = 0; await page.keyboard.down(key);
    for (let k = 0; k < 36; k++) {
      await adv(page, 0.25);
      const d = await page.evaluate(() => { const g = (window as any).__zg, S = g.ch1.stair, p = g.hero.position; if (p.x < S.xBot + 1 || p.x > S.xTop - 1) return 0; return Math.abs(p.y - (-0.3 + 8 * (p.x - S.xBot) / (S.xTop - S.xBot))); });
      worst = Math.max(worst, d);
    }
    await page.keyboard.up(key); return worst;
  };
  expect(await offRamp('KeyA')).toBeLessThan(0.5);
  expect(await page.evaluate(() => (window as any).__zg.hero.position.y)).toBeGreaterThan(TY - 0.4);
  expect(await offRamp('KeyD')).toBeLessThan(0.5);
  expect(await page.evaluate(() => (window as any).__zg.hero.position.y)).toBeLessThan(0.3);                  // back down at the foot
  // the side rails are walls: walking or jumping at them from mid-stair keeps him on the steps
  for (const key of ['KeyS', 'KeyW']) {
    await page.evaluate(() => { const g = (window as any).__zg; const S = g.ch1.stair; g.teleport(S.xBot + 15, (S.z0 + S.z1) / 2, 0); g.advance(0.1); });
    await page.keyboard.down(key); for (let k = 0; k < 6; k++) { await page.keyboard.press('Space'); await adv(page, 0.15); await page.keyboard.press('Space'); await adv(page, 0.5); } await page.keyboard.up(key); await adv(page, 1.5);
    const r = await page.evaluate(() => { const g = (window as any).__zg, S = g.ch1.stair, p = g.hero.position; return { z: p.z, z0: S.z0, z1: S.z1, y: p.y }; });
    expect(r.z).toBeGreaterThan(r.z0); expect(r.z).toBeLessThan(r.z1); expect(r.y).toBeGreaterThan(3);
  }
  // the ruined north stairs: down from the Shrine terrace to the jungle and back up
  await page.evaluate(() => { const g = (window as any).__zg; const [x, z] = g.ch1.T(18.6, 21); g.teleport(x, z, 0); g.advance(0.1); });
  await page.keyboard.down('KeyW'); await adv(page, 4); await page.keyboard.up('KeyW');
  s = await snap(page); expect(s.pos[1]).toBeGreaterThan(29 * 1.4);
  expect(await page.evaluate(() => (window as any).__zg.hero.position.y)).toBeLessThan(TY - 0.2);
  await page.keyboard.down('KeyS'); await adv(page, 4); await page.keyboard.up('KeyS');
  expect(await page.evaluate(() => (window as any).__zg.hero.position.y)).toBeGreaterThan(TY + 1.4);
  // the map is 4x bigger and open, but the fog at its edge is a stop
  await page.evaluate(() => { const g = (window as any).__zg; g.teleport(-272, 45, 0); g.advance(0.1); });                 // the east edge of the grown valley (fog from x = -284.5)
  await page.keyboard.down('KeyD'); await adv(page, 4); await page.keyboard.up('KeyD');
  s = await snap(page); expect(s.pos[0]).toBeLessThan(-281); expect(s.pos[0]).toBeGreaterThan(-287);
  // the Offering Hall sits on the raised terrace, and its ruined altar is solid
  await page.evaluate(() => { const g = (window as any).__zg; const [x, z] = g.ch1.T(-12, 11.5); g.teleport(x, z, 0); g.advance(0.1); });
  expect(await page.evaluate(() => (window as any).__zg.hero.position.y)).toBeGreaterThan(TY + 1.4);
  await page.keyboard.down('KeyW'); await adv(page, 2.5); await page.keyboard.up('KeyW');
  s = await snap(page); expect(s.pos[1]).toBeLessThan(14.0 * 1.4);       // stopped by the altar
  await adv(page, 0.3);
  expect(errors).toEqual([]);
});

test('Necromancer: guards his patch, wakes when the hero comes close, casts at him, gives up when he leaves, and can be beaten', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.waitForSelector('#start.show', { timeout: 90_000 });
  await page.click('#btn-start');
  const nec = () => page.evaluate(() => (window as any).__zg.snapshot().necro);
  await page.evaluate(() => { const g = (window as any).__zg; g.setManual(true); g.reset(); const N = g.ch1.CH1.necro; g.teleport(N.x, N.z - 14, 0); g.advance(0.3); });
  let n: any = await nec(); expect(n.loaded).toBe(true); expect(n.state).toBe('guard');                       // 14 m away: he waits
  await page.evaluate(() => { const g = (window as any).__zg; const N = g.ch1.CH1.necro; g.teleport(N.x, N.z - 8, 0); g.advance(0.3); });
  n = await nec(); expect(['chase', 'bolt', 'grasp', 'slash']).toContain(n.state);                         // 8 m: he comes for the hero
  const hp0 = (await snap(page)).hp; await adv(page, 6);
  expect((await snap(page)).hp).toBeLessThan(hp0);                                                       // standing still, a spell lands
  await page.evaluate(() => { const g = (window as any).__zg; g.reset(); const N = g.ch1.CH1.necro; g.teleport(N.x, N.z - 30, 0); g.advance(0.2); g.necro.hurt(60, 0, 1, 0, false); g.teleport(N.x, N.z - 36, 0); g.advance(3); });
  n = await nec(); expect(['return', 'guard', 'recover']).toContain(n.state);                                // hero far away: he heads home
  await page.evaluate(() => { const g = (window as any).__zg; g.necro.hurt(9999, 0, 1, 0, true); g.advance(0.1); });
  n = await nec(); expect(n.state).toBe('dead');
  expect(errors).toEqual([]);
});

test('jungle: a log blocks running but is cleared with a jump; minion camps load, their packs wake together and fight', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.waitForSelector('#start.show', { timeout: 90_000 });
  await page.click('#btn-start');
  await page.evaluate(() => { const g = (window as any).__zg; g.setManual(true); g.reset(); const [x, z] = g.ch1.W(-13.8, 40.5); g.teleport(x, z - 3, 0); g.advance(0.1); });
  const LZ = await page.evaluate(() => (window as any).__zg.ch1.W(-13.8, 40.5)[1]);
  await page.keyboard.down('KeyW'); await adv(page, 2); await page.keyboard.up('KeyW');
  let s: any = await snap(page); expect(s.pos[1]).toBeLessThan(LZ - 0.4);                               // the log stops him
  await page.evaluate(() => { const g = (window as any).__zg; const [x, z] = g.ch1.W(-13.8, 40.5); g.teleport(x, z - 2.5, 0); g.advance(0.1); });
  await page.keyboard.down('KeyW'); await page.evaluate(() => { const g = (window as any).__zg; g.advance(0.25); g.pressJump(); g.advance(1.4); }); await page.keyboard.up('KeyW');
  s = await snap(page); expect(s.pos[1]).toBeGreaterThan(LZ + 1.5);                                     // over it
  const ms: any[] = (await snap(page) as any).minions; expect(ms.length).toBeGreaterThanOrEqual(50); expect(ms.every((m) => m.loaded)).toBe(true);
  for (const k of ['ghoul', 'caster', 'sword', 'lance', 'ghost', 'archer']) expect(ms.some((m) => m.kind === k)).toBe(true);   // all six kinds are out there
  await page.evaluate(() => { const g = (window as any).__zg; const c = g.ch1.CH1.camps[0]; g.reset(); g.teleport(c.x, c.z + 10, 0); g.advance(0.1); });       // 10 m north of the first camp
  await adv(page, 0.5);
  const pack = ((await snap(page)) as any).minions.slice(0, 4); expect(pack.every((m: any) => m.state !== 'idle')).toBe(true);   // the whole pack wakes
  await adv(page, 5); expect((await snap(page)).hp).toBeLessThan(777);                                        // and hurts
  expect(errors).toEqual([]);
});

test('Hydra final boss: guards the gate at the east edge, wakes, its heads attack, and beating it opens the gate to the chapter treasure', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.waitForSelector('#start.show', { timeout: 90_000 });
  await page.click('#btn-start');
  const hy = () => page.evaluate(() => (window as any).__zg.snapshot().hydra);
  await page.evaluate(() => { const g = (window as any).__zg; g.setManual(true); g.reset(); g.teleport(...g.ch1.G(-120, -10), 0); g.advance(0.3); });
  let h: any = await hy(); expect(h.loaded).toBe(true); expect(h.state).toBe('dormant'); expect(h.pos[0]).toBeLessThan(-150);   // far right of the map
  await page.evaluate(() => { const g = (window as any).__zg; g.teleport(...g.ch1.G(-150, -3), 0); g.advance(0.2); });
  h = await hy(); expect(['roar', 'fight', 'strike']).toContain(h.state);
  const hp0 = (await snap(page)).hp; await adv(page, 8); expect((await snap(page)).hp).toBeLessThan(hp0);            // a head's element lands
  await page.evaluate(() => { const g = (window as any).__zg; g.reset(); g.hydra.wakeNow(); g.advance(0.1); g.hydra.hurt(99999, 1, 0, 0, true); g.advance(0.5); });
  h = await hy(); expect(h.state).toBe('dead');
  await page.evaluate(() => { const g = (window as any).__zg; g.teleport(...g.ch1.G(-183.5, -2), 0); g.advance(0.3); });
  expect(await page.evaluate(() => (window as any).__zg.snapshot().chapterDone)).toBe(true);
  expect(await page.evaluate(() => document.getElementById('chapter-done')!.classList.contains('show'))).toBe(true);
  expect(errors).toEqual([]);
});

test('map has no dead ends: every camp, boss and the treasure is reachable, trails are clear, and all three bridges can be crossed', async ({ page }) => {
  test.setTimeout(700_000);
  await page.goto('/');
  await page.waitForSelector('#start.show', { timeout: 90_000 });
  await page.click('#btn-start');
  await page.evaluate(() => { const g = (window as any).__zg; g.setManual(true); g.reset(); g.advance(0.3); });
  const r = await page.evaluate(() => {
    const q = (window as any).__zg, C = q.ch1.CH1, sp = q.hero.position; const can = q.ch1.reach(sp.x, sp.z); const miss: string[] = [];
    const W = q.ch1.W; const T: Array<[string, number, number, number]> = [['shrine terrace', ...q.ch1.T(18.6, 21), 1], ['hall terrace', ...q.ch1.T(-18, 20), 1], ['village plaza', 0, -3, 2], ['garden', q.ch1.garden.x, q.ch1.garden.z - 4, 2], ['boss court', C.boss.x, C.boss.z, 4], ['necromancer', C.necro.x, C.necro.z, 4], ['hydra lair', -150, -3, 2], ['treasure', C.treasure.x + 3, C.treasure.z, 1.5]];
    C.camps.forEach((c: any, i: number) => T.push(['camp ' + (i + 1), c.x, c.z, 7]));
    q.ch1.hills.forEach((h: any) => T.push(['top of ' + h.name, h.x, h.z, 3]));
    q.ch1.shrines.forEach((s: any) => T.push(['shrine ' + s.name, s.x + 1.8, s.z - 1.8, 1.5]));
    for (const b of q.ch1.map.bridges) T.push(['far side of a bridge', b.ax + b.dx * (b.len + 3), b.az + b.dz * (b.len + 3), 1.5]);
    for (const [n, x, z, rr] of T) if (!can(x, z, rr)) miss.push(n);
    const [lx, lz] = q.ch1.G(...W(-13.8, 40.5)); const inCamp = (p: any) => C.camps.some((c: any) => Math.hypot(p.x - c.x, p.z - c.z) < 8.5);   // camp clearings are open ground with props
    const blocked = q.ch1.map.paths.filter((p: any) => !inCamp(p) && !(Math.abs(p.z - lz) < 1.7 && Math.abs(p.x - lx) < 3.9) && !(q.walk.ok(p.x, p.z) && q.walk.ok(p.x + 0.3, p.z) && q.walk.ok(p.x - 0.3, p.z) && q.walk.ok(p.x, p.z + 0.3) && q.walk.ok(p.x, p.z - 0.3))).length;
    return { miss, blocked, bridges: q.ch1.map.bridges.length };
  });
  expect(r.miss).toEqual([]); expect(r.blocked).toBe(0); expect(r.bridges).toBe(8);                    // 3 over the river, 5 over the trenches (2 broken)
  const walkable = await page.evaluate(() => (window as any).__zg.ch1.map.bridges.map((b: any, i: number) => (b.broken ? -1 : i)).filter((i: number) => i >= 0));
  for (const i of walkable) {                                                                   // walk each bridge end to end; the deck lifts him over the water
    const w = await page.evaluate((i) => {
      const q = (window as any).__zg, b = q.ch1.map.bridges[i]; q.teleport(b.ax - b.dx * 2.5, b.az - b.dz * 2.5, Math.atan2(b.dx, b.dz)); q.advance(0.1);
      const goal = [b.ax + b.dx * (b.len + 3), b.az + b.dz * (b.len + 3)]; let maxY = -9, minY = 9;
      for (let k = 0; k < 140; k++) { const p = q.hero.position, dx = goal[0] - p.x, dz = goal[1] - p.z; if (Math.hypot(dx, dz) < 0.7) break; q.moveOverride = [dx, dz]; q.advance(0.05); maxY = Math.max(maxY, p.y); minY = Math.min(minY, p.y); }
      q.moveOverride = null; const p = q.hero.position; return { left: Math.hypot(goal[0] - p.x, goal[1] - p.z), maxY, minY, flat: !!b.flat };
    }, i);
    expect(w.left).toBeLessThan(1.0);
    if (w.flat) expect(w.minY).toBeGreaterThan(-0.45); else expect(w.maxY).toBeGreaterThan(0.2);   // (river bridges are all on the low ground)   // trench bridges: never drops into the trench; river bridges arch over the water
  }
});

test('world map: tapping the minimap opens the whole map, pauses the game, zooms, and M closes it', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('#start.show', { timeout: 90_000 });
  await page.click('#btn-start');
  await page.waitForSelector('#minimap.on', { timeout: 60_000 });
  await page.click('#minimap');
  await expect(page.locator('#bigmap')).toHaveClass(/show/);
  const p0 = (await snap(page)).pos; await page.keyboard.down('KeyW'); await page.waitForTimeout(600); await page.keyboard.up('KeyW');
  expect((await snap(page)).pos).toEqual(p0);                                     // paused underneath
  await page.click('#bigmap button[data-a="in"]');
  await page.keyboard.press('KeyM');
  await expect(page.locator('#bigmap')).not.toHaveClass(/show/);
});

test('story dialogue: a scene opens with portraits, pauses the game, types, advances on tap, and closes', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('#start.show', { timeout: 90_000 });
  await page.click('#btn-start');
  await page.waitForFunction(() => (window as any).__zg?.started, null, { timeout: 60_000 });
  await page.evaluate(() => { (window as any)._done = false; (window as any).__zg.playScene('king', true).then(() => { (window as any)._done = true; }); });
  await expect(page.locator('#dlg')).toHaveClass(/show/);
  await expect(page.locator('#dlg .nm')).toHaveText('The Undead King');
  const p0 = (await snap(page)).pos; await page.keyboard.down('KeyW'); await page.waitForTimeout(500); await page.keyboard.up('KeyW');
  expect((await snap(page)).pos).toEqual(p0);                                       // paused
  for (let i = 0; i < 20 && !(await page.evaluate(() => (window as any)._done)); i++) { await page.mouse.click(450, 300); await page.waitForTimeout(80); }
  expect(await page.evaluate(() => (window as any)._done)).toBe(true);
  await expect(page.locator('#dlg')).not.toHaveClass(/show/);
});

test('Chapter 1 quest: steps advance boss by boss, the shards fill, Ma Hnin is freed, and the lair barrier holds until all four shards', async ({ page }) => {
  test.setTimeout(400_000);
  await page.goto('/');
  await page.waitForSelector('#start.show', { timeout: 90_000 });
  await page.click('#btn-start');
  const q = () => page.evaluate(() => (window as any).__zg.snapshot().quest);
  await page.waitForFunction(() => (window as any).__zg?.elites?.every((m: any) => m.loaded), null, { timeout: 120_000 });
  await page.evaluate(() => { const z = (window as any).__zg; z.setManual(true); z.enableQuest(); z.advance(0.2); });
  expect((await q()).step).toBe('warden'); await expect(page.locator('#quest')).toHaveClass(/on/);
  let u = (await q()).unlocked; expect([u[2], u[3], u[4], u.elixir]).toEqual([false, false, false, false]);           // skills start locked
  await expect(page.locator('#btn-el2')).toHaveClass(/locked/);                                            // Air is not learned yet
  expect((await page.evaluate(() => (window as any).__zg.snapshot().elements))).toEqual({ fire: true, water: false, air: false, earth: false, spirit: false })
  const blocked = await page.evaluate(() => { const z = (window as any).__zg; z.teleport(...z.ch1.G(-139, -7.2), 0); z.advance(0.1); z.moveOverride = [-1, 0.25]; z.advance(4); z.moveOverride = null; return z.hero.position.x - (z.ch1.CH1.lair.x + z.ch1.CH1.barrierR); });
  expect(blocked).toBeGreaterThan(-0.1);                                                   // the barrier holds
  const kill = (expr: string) => page.evaluate(`(() => { const z = window.__zg; ${expr}.hurt(99999, 1, 0, 0, true); z.advance(0.2); })()`);
  await kill('z.boss'); expect((await q()).step).toBe('king');
  await kill('z.undeadKing'); expect((await q()).step).toBe('chief');
  await page.evaluate(() => (window as any).__zg.advance(30, 1 / 20));                     // story foes stay beaten: the quest never goes back
  expect((await q()).step).toBe('chief'); expect(await page.evaluate(() => { const z = (window as any).__zg; return z.boss.dead && z.undeadKing.dead; })).toBe(true);
  await kill("z.elites.find((m) => m.kind === 'chief')"); let s = await q(); expect(s.step).toBe('cage'); expect(s.shards).toBe(1);
  await page.evaluate(() => { const z = (window as any).__zg; const c = z.ch1.CH1.camps[z.ch1.CH1.mahninCamp]; z.teleport(c.x + Math.sin(c.tent - 2.3) * 5 + 2.5, c.z + Math.cos(c.tent - 2.3) * 5, 0); z.advance(0.3); });
  expect((await q()).mahnin).toBe(true); expect((await q()).step).toBe('mahnin');
  await page.evaluate(() => { const z = (window as any).__zg; const m = z.ch1.CH1.mahnin; z.teleport(m.x + 3.2, m.z, 0); z.advance(0.3); });   // within 4 m of her altar (outside her 2.8 m talk scene)
  expect((await q()).step).toBe('necro');
  await kill('z.necro'); expect((await q()).step).toBe('commander'); await kill("z.elites.find((m) => m.kind === 'commander')"); expect((await q()).step).toBe('banshee'); await kill("z.elites.find((m) => m.kind === 'banshee')");
  s = await q(); expect(s.shards).toBe(4); expect(s.step).toBe('barrier');
  u = s.unlocked; expect([u[2], u[3], u[4], u.elixir, u.heart]).toEqual([true, true, true, true, true]); expect(s.maxHp).toBe(917);   // every act's reward: +100 health from the Commander, +40 from the King's Crown Shard Relic
  { const z: any = await page.evaluate(() => (window as any).__zg.snapshot()); expect(z.relics.length).toBeGreaterThanOrEqual(6); expect(z.equipped.length).toBe(3); }
  expect((await page.evaluate(() => (window as any).__zg.snapshot().elements))).toEqual({ fire: true, water: true, air: true, earth: true, spirit: true });   // all five elements learned
  await page.evaluate(() => { const z = (window as any).__zg; z.teleport(...z.ch1.G(-141, -6.7), 0); z.advance(0.3); });
  s = await q(); expect(s.barrier).toBe(false); expect(s.step).toBe('naga');
  const pre = await page.evaluate(() => { const z = (window as any).__zg; return { x: z.hero.position.x, z: z.hero.position.z, hp: z.hp, st: z.state, lair: z.ch1.CH1.lair }; });
  const inside = await page.evaluate(() => { const z = (window as any).__zg; z.moveOverride = [-1, 0.25]; z.advance(3); z.moveOverride = null; return { x: z.hero.position.x, hp: z.hp, st: z.state, bR: z.ch1.CH1.lair.x + z.ch1.CH1.barrierR }; });
  expect(inside.x, JSON.stringify({ pre, inside })).toBeLessThan(inside.bR - 1);                 // and now it lets him through
});

test('main menu and prologue: the Prologue button plays the 12 illustrated panels, tapping advances, Skip returns to the menu', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('#start.show', { timeout: 90_000 });
  await expect(page.locator('#start .mm-logo')).toHaveText('ZAW GYI');
  await page.click('#btn-intro');
  await expect(page.locator('#intro')).toHaveClass(/show/);
  await expect(page.locator('#intro .ipg i')).toHaveCount(12);
  await page.mouse.click(450, 200); await page.mouse.click(450, 200);
  await expect(page.locator('#intro .ipg i.on')).toHaveCount(2);
  await page.click('#intro .iskip');
  await expect(page.locator('#intro')).not.toHaveClass(/show/, { timeout: 3000 });
  await expect(page.locator('#start')).toHaveClass(/show/);
});

test('soul butterflies: fallen foes release souls that fly to Zaw Gyi and fill the counter', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('#start.show', { timeout: 90_000 });
  await page.click('#btn-start');
  await page.waitForFunction(() => (window as any).__zg?.campPacks?.[0]?.every((m: any) => m.loaded), null, { timeout: 120_000 });
  await page.evaluate(() => { const q = (window as any).__zg; q.setManual(true); const c = q.ch1.CH1.camps[0]; q.teleport(c.x + 3, c.z + 3, 0); q.advance(0.2); for (const m of q.campPacks[0]) m.hurt(99999, 1, 0, 0, true); q.advance(3); });
  expect((await page.evaluate(() => (window as any).__zg.snapshot().souls))).toBeGreaterThan(10);
  await expect(page.locator('#souls')).toHaveClass(/on/);
});

test('health, mana and the altar: skills cost mana, souls buy levels, points raise attributes', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('#start.show', { timeout: 90_000 });
  await page.click('#btn-start');
  await page.evaluate(() => { const q = (window as any).__zg; q.setManual(true); q.advance(0.2); });
  let s = await page.evaluate(() => (window as any).__zg.snapshot());
  expect([s.hp, s.maxHp ?? s.quest.maxHp, s.mp, s.maxMp, s.level]).toEqual([777, 777, 333, 333, 1]);
  await expect(page.locator('#health .v-hp span')).toHaveText('777 / 777');
  expect(s.stats.ad).toBe(60); expect(s.stats.armor).toBe(3); expect(s.stats.mr).toBeCloseTo(0.15);
  // a skill spends mana, which then regenerates
  await page.evaluate(() => { const q = (window as any).__zg; q.pressSkill(1); q.advance(0.02); });
  s = await page.evaluate(() => (window as any).__zg.snapshot()); expect(s.mp).toBeLessThan(269); expect(s.mp).toBeGreaterThan(267);   // Alchemy Blast costs 65
  await page.evaluate(() => (window as any).__zg.advance(2)); s = await page.evaluate(() => (window as any).__zg.snapshot()); expect(s.mp).toBeGreaterThan(285);   // 12 mana / s
  // the altar: 100 souls buy level 2 (cost 60) and 3 points
  await page.evaluate(() => { const q = (window as any).__zg; q.souls.count = 100; q.openAltar(); });
  await expect(page.locator('#altar')).toHaveClass(/show/);
  await page.click('#altar .alt-lvl');
  await page.click('#altar [data-raise="vit"]'); await page.click('#altar [data-raise="int"]'); await page.click('#altar [data-raise="str"]');
  await expect(page.locator('#altar [data-raise="vit"]')).toBeDisabled();                   // no points left
  s = await page.evaluate(() => (window as any).__zg.snapshot());
  expect([s.level, s.points, s.souls, s.quest.maxHp, s.maxMp]).toEqual([2, 0, 40, 852, 353]);   // 777 + 25 (level) + 10 (str) + 40 (vit); 333 + 8 + 12
  await page.click('#altar .alt-stbtn'); await expect(page.locator('#altar .st-grid')).toContainText('Attack damage'); expect(s.attrs).toEqual({ str: 1, vit: 1, int: 1, agi: 0 });
  await page.click('#altar .alt-close'); await expect(page.locator('#altar')).not.toHaveClass(/show/);
  await page.evaluate(() => (window as any).__zg.advance(0.05)); await expect(page.locator('#health .v-lv')).toHaveText('2');
});

test('double jump: a second tap in the air jumps again higher, with a flip; a third tap does nothing', async ({ page }) => {
  await boot(page);
  const air = () => page.evaluate(() => (window as any).__zg.snapshot().air as { on: boolean; y: number; jumps: number });
  await page.evaluate(() => { const g = (window as any).__zg; g.pressJump(); g.advance(0.3); });
  let a = await air(); expect(a.on).toBe(true); expect(a.jumps).toBe(0);
  await page.evaluate(() => { const g = (window as any).__zg; g.pressJump(); g.advance(0.02); });
  a = await air(); expect(a.jumps).toBe(1);
  let top = a.y; for (let i = 0; i < 4; i++) { await adv(page, 0.03); top = Math.max(top, (await air()).y); }
  await page.evaluate(() => { const g = (window as any).__zg; g.pressJump(); g.advance(0.02); });     // a third tap, still in the air
  a = await air(); expect(a.on).toBe(true); expect(a.jumps).toBe(1);                                    // only one air jump
  for (let i = 0; i < 20; i++) { await adv(page, 0.03); top = Math.max(top, (await air()).y); }
  expect(top).toBeGreaterThan(1.7);                                                 // higher than a single jump's 1.33 m
  for (let i = 0; i < 60 && (await air()).on; i++) await adv(page, 0.05);
  a = await air(); expect(a.on).toBe(false); expect(a.y).toBe(0);
});

test('standing on things: he steps up the seal pillar dais, the tall pillar walls stop him even in a double jump, and he can land on a log and stand on it', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('#start.show', { timeout: 90_000 });
  await page.click('#btn-start');
  const st = () => page.evaluate(() => { const g = (window as any).__zg; return { y: g.hero.position.y as number, z: g.hero.position.z as number, air: g.snapshot().air.on as boolean }; });
  // the seal pillar stands in the starting room, north of where he wakes
  const P = await page.evaluate(() => { const g = (window as any).__zg; g.setManual(true); g.reset(); g.advance(0.1); return { p: g.ch1.CH1.sealPillar, s: g.ch1.CH1.spawn }; });
  expect(Math.abs(P.p.x - P.s.x)).toBeLessThan(1); expect(P.p.z - P.s.z).toBeGreaterThan(2); expect(P.p.z - P.s.z).toBeLessThan(4);
  // walking north: up both dais steps without a jump, then stopped by the broken front wall
  await page.evaluate(() => { const g = (window as any).__zg; const p = g.ch1.CH1.sealPillar; g.teleport(p.x, p.z - 3, 0); g.advance(0.1); });
  await page.keyboard.down('KeyW'); await adv(page, 1.5); await page.keyboard.up('KeyW');
  let s = await st(); expect(s.y).toBeCloseTo(8.6, 1);                       // the temple stands 8 m up on its hill expect(s.z).toBeLessThan(P.p.z - 0.5);
  // from the side, a double jump does not carry him through the 4 m pillar wall
  await page.evaluate(() => { const g = (window as any).__zg; const p = g.ch1.CH1.sealPillar; g.teleport(p.x + 3, p.z + 0.4, -Math.PI / 2); g.advance(0.1); });
  await page.keyboard.down('KeyD'); await page.evaluate(() => { const g = (window as any).__zg; g.pressJump(); g.advance(0.3); g.pressJump(); g.advance(1.4); }); await page.keyboard.up('KeyD');
  s = await page.evaluate(() => (window as any).__zg.hero.position.x); expect(s).toBeGreaterThan(P.p.x + 0.6);
  // the jungle log (z 40.5): jump onto it and stand there
  await page.evaluate(() => { const g = (window as any).__zg; const [x, z] = g.ch1.W(-13.8, 40.5); g.teleport(x, z - 1.3, 0); g.advance(0.1); });
  const LZ = await page.evaluate(() => (window as any).__zg.ch1.W(-13.8, 40.5)[1]);
  await page.keyboard.down('KeyW'); await page.evaluate(() => { const g = (window as any).__zg; g.advance(0.05); g.pressJump(); g.advance(0.42); }); await page.keyboard.up('KeyW');
  await adv(page, 0.8); const on = await st(); expect(on.air).toBe(false); expect(on.y).toBeGreaterThan(-0.1); expect(on.z).toBeGreaterThan(LZ - 0.5); expect(on.z).toBeLessThan(LZ + 0.7);
});

test('south-west fields: chests open for souls, Lost Fragments are collected, the monastery water slows him, spike pits hurt and snares hold', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('#start.show', { timeout: 90_000 });
  await page.click('#btn-start');
  await page.evaluate(() => { const q = (window as any).__zg; q.setManual(true); q.advance(0.2); });
  const r = await page.evaluate(() => {
    const q = (window as any).__zg, out: any = {};
    // a chest by the village well opens when he walks up to it, and its souls fly to him
    q.teleport(-10.6, -6.4, 0); q.advance(0.1); q.moveOverride = [0, 1]; q.advance(0.3); q.moveOverride = null; q.advance(3);
    out.chests = q.snapshot().chests; out.souls = q.snapshot().souls;
    // the Lost Fragment in the prayer hall (on the raised floor)
    q.teleport(...q.ch1.G(108.5, -88), 0); q.advance(0.1); out.fragments = q.snapshot().fragments;
    // wading: the same push covers less ground in the flooded court
    q.teleport(...q.ch1.G(135, -91.5), 0); q.advance(0.1); const z0 = q.hero.position.z; q.moveOverride = [0, -1]; q.advance(1); q.moveOverride = null; out.wade = +(z0 - q.hero.position.z).toFixed(2);
    q.teleport(0, 5, 0); q.advance(0.1); const z1 = q.hero.position.z; q.moveOverride = [0, -1]; q.advance(1); q.moveOverride = null; out.dry = +(z1 - q.hero.position.z).toFixed(2);   // open ground: across the village plaza
    // a spike pit bites (20); a snare holds him in place for a moment
    q.reset(); q.teleport(...q.ch1.G(20, -136.5), 0); q.advance(0.1); q.moveOverride = [0, -1]; q.advance(0.6); q.moveOverride = null; out.hp = q.hp;
    q.teleport(...q.ch1.G(24, -127), 0); q.advance(0.1); q.moveOverride = [0, -1]; q.advance(0.5); const zs = q.hero.position.z; q.advance(0.5); out.held = Math.abs(q.hero.position.z - zs) < 0.05; q.moveOverride = null;
    return out;
  });
  expect(r.chests).toBe(1); expect(r.souls).toBeGreaterThanOrEqual(40);
  expect(r.fragments).toBe(1);
  expect(r.wade).toBeLessThan(r.dry * 0.75);
  expect(r.hp).toBeGreaterThan(655); expect(r.hp).toBeLessThan(661); expect(r.held).toBe(true);   // a spike pit: 120 pure
});

test('element mixing: two elements circle him, INVOKE makes their spell (newest in slot 1), each spell casts with its own mana and cooldown', async ({ page }) => {
  await boot(page);
  const st = () => page.evaluate(() => { const s = (window as any).__zg.snapshot(); return { held: s.held, slots: s.slots, mp: s.mp, hp0: s.enemies[0].hp, walls: s.walls }; });
  await page.evaluate(() => { const g = (window as any).__zg; g.setLoadout(['fire', 'air', 'earth']); });
  // Fire + Air -> Flame Comet in slot 1
  await page.evaluate(() => { const g = (window as any).__zg; g.pressElement(0); g.pressElement(1); g.invoke(); g.advance(0.05); });
  let s = await st(); expect(s.held).toEqual(['fire', 'air']); expect(s.slots).toEqual(['comet', null]);
  // a third element pushes out the oldest: Air + Earth -> Sand Cyclone; the comet moves to slot 2
  await page.evaluate(() => { const g = (window as any).__zg; g.pressElement(2); g.advance(0.6); g.invoke(); g.advance(0.05); });
  s = await st(); expect(s.held).toEqual(['air', 'earth']); expect(s.slots).toEqual(['cyclone', 'comet']);
  // cast the comet (slot 2) at the dummy: it hits, mana is spent, and it goes on cooldown
  const hp0 = s.hp0, mp0 = s.mp;
  await page.evaluate(() => { const g = (window as any).__zg; g.castSlot(1); g.advance(1.2); });
  s = await st(); expect(s.hp0).toBeLessThan(hp0); expect(s.mp).toBeLessThan(mp0 - 15);
  const cd = await page.evaluate(() => (window as any).__zg.spellCooldown('comet').s); expect(cd).toBeGreaterThan(2);
  // Earth + Earth -> Stone Bulwark: a wall rises and blocks the way
  await page.evaluate(() => { const g = (window as any).__zg; g.pressElement(2); g.advance(0.6); g.invoke(); g.advance(0.05); g.castSlot(0); g.advance(0.4); });
  s = await st(); expect(s.slots[0]).toBe('bulwark'); expect(s.walls).toBe(1);
  const blocked = await page.evaluate(() => { const g = (window as any).__zg; const f = g.facing, x = g.hero.position.x + Math.sin(f) * 2.4, z = g.hero.position.z + Math.cos(f) * 2.4; return g.walk.ok(x, z); });
  expect(blocked).toBe(false);
});

test("camp respawn: a fallen camp unit stays down for 2 minutes, and never comes back while he is near; bosses stay down", async ({ page }) => {
  test.setTimeout(400_000);
  await page.goto('/'); await page.waitForSelector('#start.show', { timeout: 90_000 }); await page.click('#btn-start');
  await page.waitForFunction(() => (window as any).__zg?.minions?.every((m: any) => m.loaded), null, { timeout: 120_000 });
  const r = await page.evaluate(() => {
    const z = (window as any).__zg; z.setManual(true); z.advance(0.2);
    const pack = z.campPacks[0], m = pack.find((u: any) => !u.title), chief = z.elites.find((e: any) => e.kind === 'chief');
    for (const u of pack) u.hurt(1e9, 1, 0, 0, true); chief.hurt(1e9, 1, 0, 0, true);         // the whole camp (so nobody fights him while he waits)
    z.teleport(m.home.x + 8, m.home.z, 0); z.advance(60, 1 / 20); const at60 = m.dead;           // a minute on, standing by the camp
    z.advance(65, 1 / 20); const near125 = m.dead;                                                // past 2 minutes, but he is still near
    z.teleport(m.home.x + 60, m.home.z, 0); z.advance(1, 1 / 20); const away = m.dead;            // he walks away
    return { at60, near125, away, chief: chief.dead };
  });
  expect(r.at60).toBe(true); expect(r.near125).toBe(true); expect(r.away).toBe(false); expect(r.chief).toBe(true);
});

test('save and continue: progress is saved, and after a reload Continue brings it back (beaten bosses stay down, shrines stay awake)', async ({ page }) => {
  test.setTimeout(400_000);
  await page.goto('/'); await page.waitForSelector('#start.show', { timeout: 90_000 });
  await expect(page.locator('#btn-resume')).toHaveClass(/hidden/);                       // nothing saved yet
  await page.click('#btn-start');
  await page.waitForFunction(() => (window as any).__zg?.elites?.every((m: any) => m.loaded), null, { timeout: 120_000 });
  const before = await page.evaluate(() => {
    const z = (window as any).__zg; z.setManual(true); z.enableQuest(); z.advance(0.2);
    z.boss.hurt(99999, 1, 0, 0, true); z.advance(0.2); z.undeadKing.hurt(99999, 1, 0, 0, true); z.advance(0.2);
    const vil = z.ch1.shrines.find((s: any) => s.id === 'village'); z.teleport(vil.x + 1.5, vil.z - 1.5, 0); z.advance(0.3);
    z.level = 4; z.points = 2; z.teleport(-6, 12, 0); z.advance(0.1); z.saveGame();
    const s = z.snapshot(); return { step: s.quest.step, shrines: s.shrines, level: s.level, relics: s.relics.length };
  });
  expect(before.step).toBe('chief'); expect(before.shrines).toBe(1);
  await page.reload(); await page.waitForSelector('#start.show', { timeout: 90_000 });
  await expect(page.locator('#btn-resume')).not.toHaveClass(/hidden/); await expect(page.locator('#btn-start')).toHaveText('New Game');
  await page.click('#btn-resume');
  await page.waitForFunction(() => (window as any).__zg?.started, null, { timeout: 60_000 });
  const after = await page.evaluate(() => {
    const z = (window as any).__zg; z.setManual(true); z.advance(0.3); const s = z.snapshot();
    return { step: s.quest.step, shrines: s.shrines, level: s.level, points: s.points, relics: s.relics.length, wardenDown: z.boss.dead, kingDown: z.undeadKing.dead, near: Math.hypot(z.hero.position.x + 6, z.hero.position.z - 12) < 1.5 };
  });
  expect(after.step).toBe('chief'); expect(after.shrines).toBe(1); expect(after.level).toBe(4); expect(after.points).toBe(2); expect(after.relics).toBe(before.relics);
  expect(after.wardenDown).toBe(true); expect(after.kingDown).toBe(true); expect(after.near).toBe(true);
});

test('temple hill and old village: shrines wake and carry him between them, inscriptions read, fire burns brambles, freed captives go home with a boon, his garden remembers', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('#start.show', { timeout: 90_000 });
  await page.click('#btn-start');
  const r = await page.evaluate(() => {
    const q = (window as any).__zg, out: any = {}; q.setManual(true); q.reset(); q.advance(0.2);
    const sh = q.ch1.shrines; const vil = sh.find((s: any) => s.id === 'village'), hill = sh.find((s: any) => s.id === 'hill');
    q.teleport(vil.x + 1.5, vil.z - 1.5, 0); q.advance(0.2); q.teleport(hill.x + 1.5, hill.z - 1.5, 0); q.advance(0.2); out.awake = q.snapshot().shrines;
    q.openTravel(); const b = document.querySelector('#travel [data-sh="village"]') as HTMLElement; b.click(); q.advance(0.1);
    out.travelled = Math.hypot(q.hero.position.x - vil.x, q.hero.position.z - vil.z) < 4; out.unpaused = !q.paused;
    const st = q.ch1.steles[0]; q.teleport(st.x + 1.2, st.z - 1.2, 0); q.advance(0.1); out.read = st.read;
    const br = q.ch1.brambles[1]; out.blockedBefore = !q.walk.ok(br.x + br.r, br.z); q.fireAt({ x: br.x + br.r + 1, z: br.z }, 1.5); out.burnt = br.burnt; out.openAfter = q.walk.ok(br.x + br.r, br.z);
    // the Night Path: thorns at its foot until fire clears them, then steps all the way up the north cliff onto the hill
    const np = q.ch1.night.steps, nb = q.ch1.brambles[0]; q.teleport(np[0].x + 6, np[0].z, 0); q.advance(0.1);
    const walkTo = (tx: number, tz: number, secs: number) => { for (let t = 0; t < secs; t += 0.05) { const dx = tx - q.hero.position.x, dz = tz - q.hero.position.z; if (Math.hypot(dx, dz) < 0.35) break; q.moveOverride = [dx, dz]; q.advance(0.05); } q.moveOverride = null; };
    walkTo(np[2].x, np[2].z, 3); out.nightBlocked = q.hero.position.y < -0.1;
    q.fireAt({ x: nb.x + nb.r + 0.5, z: nb.z }, 1.5); out.nightBurnt = nb.burnt; q.teleport(np[0].x + 2.5, np[0].z, 0); q.advance(0.1);
    let low = 99; for (const st of np) { walkTo(st.x, st.z, 2.5); low = Math.min(low, q.hero.position.y - st.top); }
    out.nightTop = q.hero.position.y; out.nightLow = low;
    for (const m of q.campPacks[2]) m.hurt(99999, 1, 0, 0, true); q.advance(0.5);
    const cage = q.captives.find((c: any) => c.camp === 2); q.teleport(cage.x + 2, cage.z, 0); q.advance(0.2); out.boons = q.snapshot().boons; out.villagers = q.snapshot().villagers;
    const g = q.ch1.garden; q.teleport(g.x + 1.5, g.z - 1.5, 0); q.advance(0.2); out.garden = q.snapshot().boons.includes('crucible');
    return out;
  });
  expect(r.awake).toBe(2); expect(r.travelled).toBe(true); expect(r.unpaused).toBe(true); expect(r.read).toBe(true);
  expect(r.blockedBefore).toBe(true); expect(r.burnt).toBe(true); expect(r.openAfter).toBe(true);
  expect(r.nightBlocked).toBe(true); expect(r.nightBurnt).toBe(true); expect(r.nightTop).toBeGreaterThan(7.4); expect(r.nightLow).toBeGreaterThan(-0.4);   // he never drops off a step
  expect(r.boons).toContain('weaver'); expect(r.villagers).toBe(1); expect(r.garden).toBe(true);
});

test('streams: shallow water from the lair to the river; he wades (slower) but fords are dry going; the Naga swims past and is gone', async ({ page }) => {
  test.setTimeout(400_000);
  await page.goto('/'); await page.waitForSelector('#start.show', { timeout: 90_000 }); await page.click('#btn-start');
  await page.waitForFunction(() => (window as any).__zg?.minions?.every((m: any) => m.loaded), null, { timeout: 120_000 });
  const r = await page.evaluate(() => {
    const g = (window as any).__zg; g.setManual(true); g.advance(0.2); const c = g.ch1;
    // every stream: its water is walkable ground, mostly wading water, its bed below the jungle floor
    const out: Array<{ name: string; walk: number; wet: number; low: number }> = [];
    for (const s of c.streams) {
      let walk = 0, wet = 0, low = 0, n = 0;
      for (let i = 1; i < s.pts.length - 1; i++) { const [x, z] = s.pts[i]; n++; if (g.walk.ok(x, z)) walk++; if (c.inWater(x, z)) wet++; if (c.terrain(x, z) < -0.5) low++; }
      out.push({ name: s.name, walk: walk / n, wet: wet / n, low: low / n });
    }
    return out;
  });
  for (const s of r) { expect(s.walk).toBeGreaterThan(0.85); expect(s.wet).toBeGreaterThan(0.5); expect(s.low).toBeGreaterThan(0.5); }
  // wading is slower than dry ground
  const speed = async (x: number, z: number) => {
    await page.evaluate(([x, z]) => { const g = (window as any).__zg; g.teleport(x, z, 0); g.advance(0.3); }, [x, z]);
    const a = await page.evaluate(() => (window as any).__zg.hero.position.clone());
    await page.keyboard.down('KeyD'); await adv(page, 0.6); await page.keyboard.up('KeyD');
    return page.evaluate((a) => { const p = (window as any).__zg.hero.position; return Math.hypot(p.x - a.x, p.z - a.z); }, a);
  };
  const W0: [number, number] = await page.evaluate(() => (window as any).__zg.ch1.streams[0].pts[4]);                 // in the north stream, where it runs east-west
  const dz = await page.evaluate((W) => { const g = (window as any).__zg; for (let d = 6; d < 30; d += 0.5) { let ok = true; for (let x = W[0] - 6; x <= W[0] + 6; x += 0.5) if (!g.walk.ok(x, W[1] - d) || g.ch1.inWater(x, W[1] - d)) ok = false; if (ok) return d; } return -1; }, W0);
  expect(dz).toBeGreaterThan(0);
  const wet = await speed(W0[0], W0[1]), dry = await speed(W0[0], W0[1] - dz);
  expect(wet).toBeLessThan(dry * 0.8);
  // the Naga: a glimpse starts in the nearest water, and once it has swum past it is gone
  const started = await page.evaluate((W) => { const g = (window as any).__zg; g.teleport(W[0], W[1] - 4, 0); g.advance(0.2); return g.glimpse('coils'); }, W0);
  expect(started).toBe(true);
  for (let k = 0; k < 14 && await page.evaluate(() => (window as any).__zg.swimmer.active); k++) await adv(page, 1);
  expect(await page.evaluate(() => (window as any).__zg.swimmer.active)).toBe(false);
});

test('the grown valley: the village takes its people home to their own houses, the capture route’s side quest runs from a token to a homecoming, and fire opens the Chief’s nook', async ({ page }) => {
  test.setTimeout(400_000);
  await page.goto('/'); await page.waitForSelector('#start.show', { timeout: 90_000 }); await page.click('#btn-start');
  await page.waitForFunction(() => (window as any).__zg?.minions?.every((m: any) => m.loaded), null, { timeout: 120_000 });
  const r = await page.evaluate(() => {
    const q = (window as any).__zg, out: any = {}; q.setManual(true); q.reset(); q.advance(0.2); const sp = (id: string) => q.ch1.spots.find((s: any) => s.id === id);
    // the weaver goes home to her own house on Weavers' Lane
    for (const m of q.campPacks[2]) m.hurt(99999, 1, 0, 0, true); q.advance(0.5);
    const c2 = q.captives.find((c: any) => c.camp === 2); q.teleport(c2.x + 2, c2.z, 0); q.advance(0.3);
    const h = q.ch1.homes.weaver, v = q.villagers[0]; if (!v) return { err: 'no villager', boons: q.snapshot().boons, packDead: q.campPacks[2].map((m: any) => m.dead) }; out.weaverHome = !!h && Math.hypot(v.npc.root.position.x - h.x, v.npc.root.position.z - h.z) < 0.5;
    // A Captive's Return: the token in the pens opens it; free the caravan stop's prisoner; she goes home to the River Landing
    const tok = sp('pens_token'); q.teleport(tok.x, tok.z, 0); q.advance(0.6); out.open = tok.done;
    const ci = q.ch1.captiveCamp.ferry; for (const m of q.campPacks[ci]) m.hurt(99999, 1, 0, 0, true); q.advance(0.5);
    const cc = q.captives.find((c: any) => c.camp === ci); q.teleport(cc.x + 2, cc.z, 0); q.advance(0.3); out.boon = q.snapshot().boons.includes('ferry');
    const souls0 = q.snapshot().souls; const fh = sp('ferry_home'); q.teleport(fh.x, fh.z, 0); q.advance(1.0); out.done = q.sideDone.has('captive');
    q.advance(4); out.souls = q.snapshot().souls - souls0;
    // the Chief's nook: thorns block its mouth until fire reaches them
    // the Lotus Court's east gate is open: from inside the court he walks out through both arches onto the hill toward the Grand Stair
    q.teleport(q.ch1.TX - 27, -14.6, -Math.PI / 2); q.advance(0.1); q.moveOverride = [-1, 0]; q.advance(5); q.moveOverride = null; out.gateX = q.hero.position.x - q.ch1.TX;
    const th = sp('hoard_thorns'); out.blocked = !q.walk.ok(th.x, th.z); out.burnt = q.elementAt('fire', th.x, th.z) === 1; out.open2 = q.walk.ok(th.x, th.z);
    // Nameless Graves: the yard's heap opens it; the shuttle laid down, the lamp lit (fire), the jar filled (water)
    const yd = sp('yard_pile'); q.teleport(yd.x, yd.z, 0); q.advance(0.5); const g1 = sp('grave_shuttle'), g2 = sp('grave_lamp'), g3 = sp('grave_heron');
    q.teleport(g1.x, g1.z, 0); q.advance(0.5); q.elementAt('fire', g2.x, g2.z); q.elementAt('water', g3.x, g3.z); q.advance(0.8); out.graves = q.sideDone.has('graves');
    // the garrison: three orders in three hands; the drawbridge lies in the trench until the winch brings it down
    out.orders = q.ch1.steles.filter((s: any) => s.title.startsWith('Orders')).length;
    const db = q.ch1.CH1.regions.find((r: any) => r.name === 'DRAWBRIDGE'); out.deckBefore = q.walk.h(db.x, db.z);
    const w = sp('drawbridge'); q.teleport(w.x, w.z, 0); q.advance(0.5); out.deckAfter = q.walk.h(db.x, db.z);
    // the ferry: she is home, so the River Landing carries him to the marsh landing
    const fl = q.ch1.ferry; q.teleport(fl.a.x, fl.a.z, 0); q.advance(0.3); out.ferried = Math.hypot(q.hero.position.x - fl.b.x, q.hero.position.z - fl.b.z) < 2;
    // The Bound Dead: fire, air and spirit each free one
    const s1 = sp('spirit_rope'), s2 = sp('spirit_mist'), s3 = sp('spirit_hidden'); q.elementAt('fire', s1.x, s1.z); q.elementAt('air', s2.x, s2.z); q.elementAt('spirit', s3.x, s3.z); q.advance(0.8); out.bound = q.sideDone.has('bound');
    // The Drowned Records: three sluices drain the courts, then the hatch, the Abbot, the page
    for (const id of ['sluice_0', 'sluice_1', 'sluice_2']) { const s = sp(id); q.teleport(s.x, s.z, 0); q.advance(0.3); }
    for (let i = 0; i < 6; i++) q.advance(1); const h2 = sp('hatch'); q.teleport(h2.x, h2.z, 0); q.advance(0.5); out.hatch = h2.done;
    q.abbot.hurt(1e9, 1, 0, 0, true); q.advance(0.5); const pg = sp('page'); q.teleport(pg.x, pg.z, 0); q.advance(0.8); out.records = q.sideDone.has('records');
    // Fever-Leaf: the cistern, water, the bed
    const c1 = sp('garden_cistern'); q.teleport(c1.x, c1.z + 1.5, 0); q.advance(0.3); q.elementAt('water', c1.x, c1.z); const fb = sp('garden_fever'); q.teleport(fb.x, fb.z, 0); q.advance(0.8); out.garden = q.sideDone.has('garden');
    return out;
  });
  expect(r.err ?? '', JSON.stringify(r)).toBe(''); expect(r.weaverHome).toBe(true);
  expect(r.open).toBe(true); expect(r.boon).toBe(true); expect(r.done).toBe(true); expect(r.souls).toBeGreaterThanOrEqual(100);
  expect(r.blocked).toBe(true); expect(r.burnt).toBe(true); expect(r.open2).toBe(true); expect(r.gateX).toBeLessThan(-43);   // out past the gate, on the hilltop by the stair's head
  expect(r.graves).toBe(true); expect(r.orders).toBe(3); expect(r.deckBefore).toBeLessThan(-1.5); expect(r.deckAfter).toBeGreaterThan(-0.4);
  expect(r.ferried).toBe(true); expect(r.bound).toBe(true); expect(r.hatch).toBe(true); expect(r.records).toBe(true); expect(r.garden).toBe(true);
});
