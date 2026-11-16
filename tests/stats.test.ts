// Run with: node --test tests/stats.test.ts   (the numbers in docs/stats-plan.md)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { heroStats, armorBlock, mitigate, levelCost, ATK } from '../src/stats.ts';

const none = { str: 0, vit: 0, int: 0, agi: 0 };

test('level 1: 777 health, 333 mana, 60 attack damage, 3 armor, 15% magic resist', () => {
  const s = heroStats(1, none, [], [], false);
  assert.equal(s.maxHp, 777); assert.equal(s.maxMp, 333); assert.equal(s.ad, 60); assert.equal(s.armor, 3); assert.equal(s.mr, 0.15);
  assert.equal(s.mpRegen, 12); assert.equal(s.crit, 0.05); assert.equal(s.as, 1);
});

test('armor has diminishing returns: 5 = 23%, 10 = 37.5%, 20 = 55%', () => {
  assert.ok(Math.abs(armorBlock(5) - 0.2308) < 0.001); assert.ok(Math.abs(armorBlock(10) - 0.375) < 1e-9); assert.ok(Math.abs(armorBlock(20) - 0.5455) < 0.001);
});

test('end of Chapter 1 (level 6, 4/4/4/3): about +40% power, not double', () => {
  const s = heroStats(6, { str: 4, vit: 4, int: 4, agi: 3 }, [], [], false);
  assert.equal(s.maxHp, 1102); assert.equal(s.ad, 80); assert.equal(s.maxMp, 421);
  assert.ok(s.maxHp / 777 < 1.5 && s.ad / 60 < 1.4);
});

test('a ghoul claw hits a level-1 hero for 81; a spike pit (pure) for the full 120; slows and caps hold', () => {
  const s = heroStats(1, none, [], [], false);
  assert.equal(Math.round(mitigate(ATK.ghoul as never, s)), 81);
  assert.equal(mitigate(ATK.spike as never, s), 120);
  const big = heroStats(60, { str: 0, vit: 0, int: 200, agi: 200 }, ['earth', 'earth'], [], false);
  assert.equal(big.mr, 0.7); assert.equal(big.cdr, 0.4); assert.equal(big.crit, 0.6);
});

test('circling elements and Relics change stats; levels cost 60 + 45 per level', () => {
  const s = heroStats(1, none, ['earth', 'air'], ['fang', 'plate'], true);
  assert.equal(s.armor, 3 + 4 + 3); assert.equal(s.as, 1.08); assert.equal(s.lifesteal, 0.04); assert.equal(s.block, 8); assert.equal(s.maxHp, 877);
  assert.equal(levelCost(1), 60); assert.equal(levelCost(5), 240);
});
