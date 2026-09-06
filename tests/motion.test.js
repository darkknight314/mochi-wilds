import test from 'node:test';
import assert from 'node:assert/strict';
import { CREATURES } from '../src/creatures.js';
import {
  WanderController,
  boundedTarget,
  BOUNDS,
  MAX_DELTA,
  MOTION_PROFILES,
} from '../src/motion.js';
const SPECIES = Object.keys(CREATURES);
const onPlatform = (s) => Math.hypot(s.x / BOUNDS.x, s.z / BOUNDS.z) <= 1 + 1e-9;
function run(species, seconds, dt, options) {
  const c = new WanderController(species, options);
  const steps = Math.round(seconds / dt);
  let last = c.update(0);
  for (let i = 0; i < steps; i++) last = c.update(dt);
  return { controller: c, state: last };
}
test('every approved creature has a distinct roaming controller and bounded destinations', () => {
  const signatures = [];
  for (const species of Object.keys(CREATURES)) {
    const c = new WanderController(species);
    c.goTo(2, -2);
    // 0.7s of frames: a single huge step would be clamped as a background pause.
    let state;
    for (let i = 0; i < 7; i++) state = c.update(0.1);
    assert.ok(state.x <= 1.05 && state.x >= -1.05);
    assert.ok(state.z <= 0.48 && state.z >= -0.48);
    assert.equal(state.action, 'walk');
    assert.equal(state.activity, CREATURES[species].motion);
    c.trick();
    state = c.update(0.4);
    assert.equal(state.action, 'trick');
    signatures.push(`${species}:${state.activity}`);
  }
  assert.equal(new Set(signatures).size, 5);
  const bounded = boundedTarget(5, 5);
  assert.ok(Math.hypot(bounded.x / 1.05, bounded.z / 0.48) <= 1.000001);
  assert.ok(bounded.x <= 1.05 && bounded.z <= 0.48);
});
test('reduced motion keeps a creature responsive but removes the energetic scale', () => {
  const c = new WanderController('dragon', { reducedMotion: true });
  c.trick();
  const a = c.update(0.4);
  assert.equal(a.reducedMotion, true);
  assert.equal(a.action, 'trick');
  assert.equal(a.energy, 0);
  assert.equal(a.lift, 0, 'no bouncing lift while reduced motion is on');
  // Still alive: it roams, reacts and keeps a walk cycle going.
  const { controller, state } = run('dragon', 40, 1 / 60, { reducedMotion: true });
  assert.ok(controller.trip > 0, 'a reduced-motion creature still roams');
  assert.ok(onPlatform(state));
  controller.react();
  assert.equal(controller.update(0.1).action, 'cuddle');
  const lively = run('dragon', 40, 1 / 60).controller;
  assert.ok(lively.speed > controller.speed, 'reduced motion moves more gently');
});
test('every species roams the whole platform and never steps off it', () => {
  for (const species of SPECIES) {
    const c = new WanderController(species);
    let far = 0;
    for (let i = 0; i < 30000; i++) {
      const s = c.update(1 / 60);
      assert.ok(Number.isFinite(s.x) && Number.isFinite(s.z), species);
      assert.ok(onPlatform(s), `${species} left the platform at ${s.x},${s.z}`);
      far = Math.max(far, Math.hypot(s.x, s.z));
    }
    assert.ok(c.trip > 20, `${species} should keep exploring (${c.trip} trips)`);
    assert.ok(far > 0.3, `${species} should cover ground, not idle in place`);
  }
});
test('hostile destinations, NaN and negative deltas can never push a creature off the garden', () => {
  const c = new WanderController('otter');
  for (const [x, z] of [
    [NaN, 4],
    [Infinity, -Infinity],
    [1e9, 1e9],
    [-40, 0],
    [0, 30],
  ]) {
    c.goTo(x, z);
    for (let i = 0; i < 400; i++) {
      const s = c.update(i % 7 === 0 ? NaN : -0.5);
      assert.ok(onPlatform(s));
    }
    for (let i = 0; i < 400; i++) assert.ok(onPlatform(c.update(1 / 60)));
  }
});
test('movement is frame-rate independent: 30fps and 240fps land in the same place', () => {
  for (const species of SPECIES) {
    const slow = run(species, 37, 1 / 30);
    const fast = run(species, 37, 1 / 240);
    assert.equal(slow.state.action, fast.state.action, species);
    assert.ok(Math.abs(slow.state.time - fast.state.time) < 1e-6, species);
    assert.ok(
      Math.hypot(slow.state.x - fast.state.x, slow.state.z - fast.state.z) < 1e-9,
      `${species} drifted between frame rates`,
    );
    assert.ok(Math.abs(slow.state.phase - fast.state.phase) < 1e-9, species);
    assert.equal(slow.controller.trip, fast.controller.trip, species);
    // Facing and stride are integrated, so they converge rather than matching
    // bit for bit: 0.1rad is about six degrees, a difference no one can see.
    assert.ok(Math.abs(slow.state.yaw - fast.state.yaw) < 0.1, species);
    assert.ok(Math.abs(slow.state.gait - fast.state.gait) / fast.state.gait < 1e-3, species);
  }
});
test('a long background pause is clamped instead of teleporting the creature', () => {
  for (const species of SPECIES) {
    const c = new WanderController(species);
    for (let i = 0; i < 600; i++) c.update(1 / 60);
    const before = { x: c.x, z: c.z, time: c.time };
    const s = c.update(600); // ten minutes hidden in the background
    assert.ok(Number.isFinite(s.x) && Number.isFinite(s.z) && Number.isFinite(s.yaw), species);
    assert.ok(onPlatform(s), species);
    assert.ok(Math.abs(s.time - before.time - MAX_DELTA) < 1e-9, 'delta is clamped');
    // A clamped step is one ordinary stride, not a dash across the garden.
    const jump = Math.hypot(s.x - before.x, s.z - before.z);
    assert.ok(jump <= 2 * MAX_DELTA * c.speed, `${species} jumped ${jump}`);
    assert.ok(jump < BOUNDS.x / 4, `${species} teleported ${jump}`);
    for (let i = 0; i < 300; i++) assert.ok(onPlatform(c.update(1 / 60)));
  }
});
test('each species has its own movement profile and signature move', () => {
  const profiles = new Map();
  for (const species of SPECIES) {
    const c = new WanderController(species);
    let distance = 0,
      tricks = 0,
      walking = 0,
      previous = { x: c.x, z: c.z };
    for (let i = 0; i < 12000; i++) {
      const s = c.update(1 / 60);
      distance += Math.hypot(s.x - previous.x, s.z - previous.z);
      previous = { x: s.x, z: s.z };
      if (s.action === 'trick') tricks++;
      if (s.action === 'walk') walking++;
      assert.ok(onPlatform(s));
    }
    assert.ok(tricks > 0, `${species} should perform ${CREATURES[species].trick} on its own`);
    assert.ok(walking > 0, species);
    profiles.set(species, { distance, tricks, speed: MOTION_PROFILES[species].speed });
  }
  const distances = [...profiles.values()].map((p) => Math.round(p.distance * 100));
  assert.equal(new Set(distances).size, SPECIES.length, 'each species travels differently');
  assert.equal(new Set(SPECIES.map((s) => MOTION_PROFILES[s].speed)).size, SPECIES.length);
  assert.ok(profiles.get('ferret').distance > profiles.get('mothkit').distance);
});
test('a tap on the ground calls the creature over, and it reacts on arrival', () => {
  const c = new WanderController('imp');
  c.goTo(0.9, -0.3, true);
  assert.equal(c.activity, 'Coming to say hello');
  assert.ok(['turn', 'walk'].includes(c.state), 'it turns to face the spot before walking');
  let arrived = false;
  for (let i = 0; i < 900 && !arrived; i++) {
    const s = c.update(1 / 60);
    if (s.action === 'cuddle') arrived = true;
  }
  assert.ok(arrived, 'the creature reacts when it gets there');
  assert.ok(
    Math.hypot(c.x - c.target.x, c.z - c.target.z) < 0.05,
    'and it actually arrived at the spot',
  );
});
test('a creature turns smoothly to face its destination instead of snapping', () => {
  const c = new WanderController('dragon');
  c.goTo(-1, 0.4);
  const heading = c.heading;
  const gap = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
  assert.ok(gap(c.yaw, heading) > 1, 'it starts out facing the wrong way');
  let previous = c.yaw,
    biggestStep = 0,
    facing = Infinity;
  for (let i = 0; i < 240; i++) {
    const s = c.update(1 / 60);
    biggestStep = Math.max(biggestStep, gap(s.yaw, previous));
    previous = s.yaw;
    // Once it is under way it should be looking where it is going.
    if (s.action === 'walk' && s.phase > 0.3 && s.phase < 0.7)
      facing = Math.min(facing, gap(s.yaw, heading));
  }
  assert.ok(biggestStep < 0.3, `turning must be gradual, saw ${biggestStep} rad in one frame`);
  assert.ok(facing < 0.3, `it should face its destination while walking, off by ${facing}`);
});
// The camera looks down world +Z at the origin and pet.rotation.y is the yaw
// this controller reports, so cos(yaw) > 0.5 is "the player can see its face".
test('creatures spend most of their time facing the player without locking front-ward', () => {
  for (const species of SPECIES) {
    const c = new WanderController(species);
    let face = 0,
      back = 0,
      profile = 0;
    const frames = 300 * 60;
    for (let i = 0; i < frames; i++) {
      const cosine = Math.cos(c.update(1 / 60).yaw);
      if (cosine > 0.5) face++;
      else if (cosine < -0.5) back++;
      else profile++;
    }
    const share = (n) => (100 * n) / frames;
    assert.ok(
      share(face) >= 45 && share(face) <= 75,
      `${species} faces the player ${share(face).toFixed(1)}% of the time`,
    );
    assert.ok(share(back) < 15, `${species} shows its back ${share(back).toFixed(1)}% of the time`);
    // Still a creature with a life of its own, not a shop mannequin.
    assert.ok(share(profile) > 20, `${species} never turns aside (${share(profile).toFixed(1)}%)`);
    assert.ok(share(back) > 2, `${species} should still wander off now and then`);
  }
});
test('the creature looks at the player for come-here arrivals and affection', () => {
  for (const species of SPECIES) {
    const c = new WanderController(species);
    c.goTo(-0.9, -0.4, true); // called over from behind, facing away
    for (let i = 0; i < 1200 && c.state !== 'cuddle'; i++) c.update(1 / 60);
    assert.equal(c.state, 'cuddle', species);
    let facing = -1;
    for (let i = 0; i < 90; i++) facing = Math.cos(c.update(1 / 60).yaw);
    assert.ok(facing > 0.85, `${species} should look up at its person, got ${facing}`);
    c.react();
    for (let i = 0; i < 90; i++) facing = Math.cos(c.update(1 / 60).yaw);
    assert.ok(facing > 0.85, `${species} should take affection face to face`);
  }
});
test('a resting creature pauses to look around, then sets off again', () => {
  const c = new WanderController('mothkit');
  const seen = new Set();
  for (let i = 0; i < 6000; i++) seen.add(c.update(1 / 60).action);
  assert.ok(seen.has('inspect'), 'it pauses to inspect the world');
  assert.ok(seen.has('walk'), 'and then keeps going');
  const still = new WanderController('mothkit', { roam: false });
  for (let i = 0; i < 3000; i++) still.update(1 / 60);
  assert.equal(still.state, 'inspect');
  assert.ok(Math.hypot(still.x, still.z) < 1e-9, 'a non-roaming creature stays put');
});
