import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newPet,
  evolve,
  care,
  purchase,
  level,
  validSegment,
  roundResult,
  SAVE_VERSION,
} from '../src/game.js';
import { migrate } from '../src/storage.js';
import { CREATURES, speciesOf, legacyShape } from '../src/creatures.js';
const now = Date.UTC(2026, 8, 5, 12);
// A complete, realistic pre-species save: version 1, an abstract `shape`, no `species`.
const legacySave = (shape) => ({
  version: 1,
  birthday: Date.UTC(2026, 0, 2),
  name: 'Biscuit',
  color: 'butter',
  shape,
  accessory: 'halo',
  habitat: 'moon',
  created: true,
  health: 41.5,
  affection: 63,
  energy: 77,
  xp: 4321,
  coins: 987,
  owned: ['halo', 'prism', 'moon'],
  receipts: [{ id: 'sandbox-halo-1', sku: 'halo', at: 1000, provider: 'sandbox', amount: 1.99 }],
  lastCare: now - 3600000,
  lastUpdated: now - 3600000,
  lastAffection: now - 7200000,
  day: '2026-09-05',
  daily: { affection: 2, meters: 250.5, play: 1, claimed: false },
  totalMeters: 128000,
  memories: [{ id: 'm1', title: 'The day we found each other', type: 'heart', at: 1000 }],
  streak: 19,
  lastClaim: '2026-09-04',
});
test('neglect crosses the grace period once and remains deterministic', () => {
  const p = newPet(now);
  p.xp = 900;
  const after = evolve(p, now + 48 * 3600000);
  assert.equal(after.xp, 852);
  assert.ok(after.health < p.health);
  assert.equal(evolve(after, now + 48 * 3600000).xp, 852);
  assert.equal(p.health, 88);
  assert.ok(level(evolve(p, now + 200 * 3600000)) < level(p));
});
test('care cooldown, walk, and claim rewards cannot be claimed twice', () => {
  let p = care(newPet(now), 'affection', now);
  assert.equal(p.daily.affection, 1);
  p = care(p, 'affection', now + 1);
  assert.equal(p.daily.affection, 1);
  p = care(p, 'affection', now + 3000);
  p = care(p, 'affection', now + 6000);
  p = care(p, 'walk', now + 6000, 300);
  p = care(p, 'play', now + 6000);
  const coins = p.coins;
  p = care(p, 'claim', now + 6000);
  assert.equal(p.coins, coins + 100);
  assert.equal(care(p, 'claim', now + 6000).coins, p.coins);
  assert.equal(p.streak, 1);
});
test('new day resets rituals and refuses incomplete reward', () => {
  const p = newPet(now);
  p.daily.claimed = true;
  p.daily.meters = 300;
  const next = evolve(p, now + 86400000);
  assert.equal(next.daily.claimed, false);
  assert.equal(next.daily.meters, 0);
  assert.equal(care(next, 'claim', now + 86400000).coins, p.coins);
});
test('sandbox purchase is idempotent and boost affects subsequent care', () => {
  const p = purchase(newPet(now), 'prism', now);
  assert.equal(purchase(p, 'prism', now + 1).receipts.length, 1);
  assert.equal(care(p, 'affection', now).xp - p.xp, 10);
  assert.throws(() => purchase(p, 'not-real'));
});
test('walk rejects poor accuracy, GPS jumps, stale fixes, and clamps rewards', () => {
  const a = { latitude: 0, longitude: 0, accuracy: 5, timestamp: now };
  const b = { ...a, latitude: 0.0001, timestamp: now + 10000 };
  assert.ok(validSegment(a, b) > 10);
  assert.equal(validSegment(a, { ...b, accuracy: 60 }), 0);
  assert.equal(validSegment(a, { ...b, latitude: 1 }), 0);
  assert.equal(validSegment(a, { ...b, timestamp: now + 100000 }), 0);
  assert.equal(care(newPet(now), 'walk', now, -100).daily.meters, 0);
  assert.equal(care(newPet(now), 'walk', now, Infinity).daily.meters, 5000);
});
test('legacy cloud/star/drop saves migrate to the right species with no data loss', () => {
  for (const [shape, species] of Object.entries({
    cloud: 'dragon',
    star: 'mothkit',
    drop: 'otter',
  })) {
    const old = legacySave(shape);
    const p = migrate(old, now);
    assert.equal(p.species, species, `${shape} should become ${species}`);
    assert.equal(p.version, SAVE_VERSION);
    assert.equal(p.shape, shape, 'the legacy shape field is preserved, not deleted');
    // Every field of the old save survives the upgrade untouched.
    for (const key of [
      'name',
      'color',
      'accessory',
      'habitat',
      'created',
      'birthday',
      'health',
      'affection',
      'energy',
      'xp',
      'coins',
      'lastCare',
      'lastUpdated',
      'lastAffection',
      'day',
      'totalMeters',
      'streak',
      'lastClaim',
    ])
      assert.deepEqual(p[key], old[key], `${key} must survive migration`);
    assert.deepEqual(p.owned, old.owned);
    assert.deepEqual(p.receipts, old.receipts);
    assert.deepEqual(p.memories, old.memories);
    assert.deepEqual(p.daily, old.daily);
  }
});
test('a v1 save is never silently discarded for a brand new pet', () => {
  // The old loader rejected anything that was not exactly version 1 with all fields
  // present. Missing or unexpected fields must now degrade field-by-field instead.
  const partial = { version: 1, name: 'Sprout', shape: 'drop', xp: 700, coins: 55 };
  const p = migrate(partial, now);
  assert.equal(p.name, 'Sprout');
  assert.equal(p.xp, 700);
  assert.equal(p.coins, 55);
  assert.equal(p.species, 'otter');
  assert.equal(p.version, SAVE_VERSION);
  // A future/unknown version number is upgraded, not thrown away.
  const future = migrate({ ...legacySave('star'), version: 99 }, now);
  assert.equal(future.name, 'Biscuit');
  assert.equal(future.xp, 4321);
  assert.equal(future.species, 'mothkit');
  assert.equal(future.version, SAVE_VERSION);
  // An older wallet field name is still money in the bank.
  assert.equal(migrate({ version: 1, currency: 420 }, now).coins, 420);
});
test('an explicit species always wins over the legacy shape', () => {
  for (const species of Object.keys(CREATURES)) {
    const p = migrate({ ...legacySave('cloud'), species }, now);
    assert.equal(p.species, species);
    assert.equal(p.xp, 4321, 'progress is untouched by the species choice');
  }
});
test('unknown or hostile species values fall back safely without losing progress', () => {
  for (const bad of [
    'wyvern',
    '',
    null,
    42,
    { name: 'nope' },
    '__proto__',
    'constructor',
    'toString',
  ]) {
    const p = migrate({ ...legacySave('star'), species: bad }, now);
    assert.ok(Object.hasOwn(CREATURES, p.species), `${String(bad)} must not leak through`);
    // Falls back through the legacy shape rather than to an arbitrary default.
    assert.equal(p.species, 'mothkit');
    assert.equal(p.xp, 4321);
    assert.equal(p.coins, 987);
  }
  // No species and no recognisable shape lands on the roster default.
  const orphan = migrate({ version: 1, name: 'Ghost', shape: 'banana', xp: 12 }, now);
  assert.equal(orphan.species, 'dragon');
  assert.equal(orphan.xp, 12);
  assert.equal(orphan.shape, legacyShape('dragon'));
});
test('corrupt saves produce a fresh pet instead of throwing', () => {
  for (const junk of [null, undefined, 'not json', 42, [], [1, 2, 3], true]) {
    const p = migrate(junk, now);
    assert.deepEqual(p, newPet(now), `${JSON.stringify(junk)} should yield a fresh pet`);
  }
  // Nonsense values inside an otherwise readable object are individually repaired.
  const messy = migrate(
    {
      name: 42,
      color: 'ultraviolet',
      xp: NaN,
      coins: 'lots',
      health: Infinity,
      owned: 'halo',
      receipts: null,
      memories: 'none',
      daily: 'today',
      lastClaim: 7,
    },
    now,
  );
  assert.equal(messy.name, 'Mochi');
  assert.equal(messy.color, 'lilac');
  assert.ok(Number.isFinite(messy.xp));
  assert.ok(Number.isFinite(messy.coins));
  assert.equal(messy.health, newPet(now).health, 'a non-finite vital falls back to the default');
  assert.deepEqual(messy.owned, []);
  assert.deepEqual(messy.receipts, []);
  assert.deepEqual(messy.memories, []);
  assert.deepEqual(messy.daily, { affection: 0, meters: 0, play: 0, claimed: false });
  assert.equal(messy.lastClaim, null);
  assert.equal(speciesOf(messy), 'dragon');
});
test('a migrated legacy save keeps playing normally', () => {
  const p = evolve(migrate(legacySave('drop'), now), now);
  assert.equal(p.species, 'otter');
  assert.equal(p.xp, 4321);
  const played = care(p, 'play', now);
  assert.equal(played.coins, 987 + 20);
  assert.equal(played.daily.play, 2);
  assert.equal(purchase(played, 'halo', now).receipts.length, 1, 'owned items are not re-bought');
});
test('duels are cyclic and symmetric', () => {
  assert.equal(roundResult('spark', 'bloom'), 1);
  assert.equal(roundResult('bloom', 'spark'), -1);
  assert.equal(roundResult('bubble', 'spark'), 1);
  assert.equal(roundResult('bloom', 'bubble'), 1);
  assert.equal(roundResult('spark', 'spark'), 0);
  assert.throws(() => roundResult('invalid', 'spark'));
});
