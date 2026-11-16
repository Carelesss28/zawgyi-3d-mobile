// Run with: node --test tests/combo.test.ts   (Node 24 strips the types itself)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Combo, COMBO_CONFIG } from '../src/combo.ts';

const DT = 1 / 60;
function run(c: Combo, seconds: number, onTick?: (t: number) => void) {
  let t = 0;
  while (t < seconds) { onTick?.(t); c.update(DT); t += DT; }
}

test('one press plays one swing, impacts once, then ends', () => {
  const c = new Combo(); const log: string[] = [];
  c.onStart = (_s, i) => log.push('start' + i); c.onImpact = (_s, i) => log.push('hit' + i); c.onEnd = (i) => log.push('end' + i);
  c.press(); run(c, 1.2);
  assert.deepEqual(log, ['start0', 'hit0', 'end0']);
});

test('buffered presses chain 1 -> 2 -> 3 -> 4 and the last cannot chain', () => {
  const c = new Combo(); const log: string[] = [];
  c.onStart = (_s, i) => log.push('start' + i); c.onImpact = (_s, i) => log.push('hit' + i);
  for (let i = 0; i < 360; i++) { if (i % 12 === 0) c.press(); c.update(DT); }  // button mashing, a press every 0.2 s for 6 s
  const starts = log.filter((l) => l.startsWith('start'));
  assert.deepEqual(starts.slice(0, 5), ['start0', 'start1', 'start2', 'start3', 'start0']);   // the last does not chain, but the next press starts a fresh combo
  // every start is followed by exactly one hit before the next start
  let expectHit = false;
  for (const l of log) { if (l.startsWith('start')) { assert.equal(expectHit, false, 'start before the previous swing hit'); expectHit = true; } else { assert.equal(expectHit, true); expectHit = false; } }
});

test('no cancelling: a second press before chainFrom does not start the next swing early', () => {
  const c = new Combo(); let s1At = -1; let time = 0;
  c.onStart = (_s, i) => { if (i === 1) s1At = time; };
  c.press();
  while (time < 1) { if (Math.abs(time - 0.05) < DT / 2) c.press(); c.update(DT); time += DT; }
  assert.ok(s1At >= COMBO_CONFIG.steps[0].chainFrom - DT, `second swing started at ${s1At.toFixed(3)} before chainFrom`);
});

test('the combo resets after resetDelay without input', () => {
  const c = new Combo(); const starts: number[] = []; c.onStart = (_s, i) => starts.push(i);
  c.press(); run(c, 0.46 + COMBO_CONFIG.resetDelay + 0.2);   // swing 1 ends, window passes
  c.press(); run(c, 0.2);
  assert.deepEqual(starts, [0, 0]);
});

test('input inside resetDelay continues the combo', () => {
  const c = new Combo(); const starts: number[] = []; c.onStart = (_s, i) => starts.push(i);
  c.press(); run(c, 0.45 + 0.2);                              // swing ends; 0.2 s into the window
  c.press(); run(c, 0.1);
  assert.deepEqual(starts, [0, 1]);
});

test('result is the same at 30, 60 and 144 fps', () => {
  const impactTimes = (fps: number) => {
    const c = new Combo(); const out: number[] = []; let t = 0; let nextPress = 0; c.onImpact = () => out.push(t);
    for (let i = 0; i < fps * 3; i++) { if (t >= nextPress - 1e-9) { c.press(); nextPress += 0.2; } t += 1 / fps; c.update(1 / fps); }
    return out.slice(0, 3);
  };
  const a = impactTimes(30), b = impactTimes(60), d = impactTimes(144);
  assert.equal(a.length, 3); assert.equal(b.length, 3); assert.equal(d.length, 3);
  for (let i = 0; i < 3; i++) { assert.ok(Math.abs(a[i] - d[i]) < 0.12 && Math.abs(b[i] - d[i]) < 0.06, `impact ${i}: 30fps ${a[i].toFixed(3)} 60fps ${b[i].toFixed(3)} 144fps ${d[i].toFixed(3)}`); }
});

test('cancel (dash) ends the swing and resets the chain', () => {
  const c = new Combo(); const starts: number[] = []; c.onStart = (_s, i) => starts.push(i);
  c.press(); run(c, 0.1); c.cancel(); c.press(); run(c, 0.1);
  assert.deepEqual(starts, [0, 0]);
});
