import test from 'node:test';
import assert from 'node:assert/strict';
import { RoomModel, rectangleSurface, pointInPolygon } from '../src/room-model.js';
import { RoomBounds, UNSENSED_RADIUS } from '../src/room-bounds.js';
import { WanderController, profileOf, MAX_DELTA } from '../src/motion.js';

const floor = () =>
  rectangleSurface({
    id: 'floor',
    width: 2.4,
    depth: 2.4,
    y: 0,
    semantic: 'floor',
    confidence: 0.9,
  });
const table = () =>
  rectangleSurface({
    id: 'table',
    cx: 0.7,
    width: 0.9,
    depth: 0.7,
    y: 0.6,
    semantic: 'table',
    confidence: 0.9,
  });
const room = () =>
  new RoomModel({
    surfaces: [floor(), table()],
    light: { intensity: 1 },
    tracking: 'ok',
  });

test('before anything is sensed the creature is held near the anchor', () => {
  const bounds = new RoomBounds();
  const spot = bounds.clamp(10, 10);
  assert.ok(Math.hypot(spot.x, spot.z) <= UNSENSED_RADIUS + 1e-9);
  assert.equal(bounds.heightAt(10, 10), 0);
});

test('NaN input can never escape the bounds', () => {
  const bounds = new RoomBounds(room());
  const spot = bounds.clamp(NaN, undefined);
  assert.ok(Number.isFinite(spot.x) && Number.isFinite(spot.z));
});

test('a point off every surface is pulled onto the nearest one', () => {
  const bounds = new RoomBounds(room());
  const spot = bounds.clamp(8, 8);
  assert.ok(spot.surface, 'the clamped point should name the surface it landed on');
  assert.equal(pointInPolygon(spot.surface.polygon, spot.x, spot.z), true);
});

test('mid-step the creature may stand between the surface it left and its target', () => {
  const model = room();
  const bounds = new RoomBounds(model);
  const from = model.surfaceById('table');
  const to = model.surfaceById('floor');
  // A point on the floor but off the table is legal while stepping down.
  const spot = bounds.clamp(-1, 0, to, from);
  assert.equal(spot.x, -1);
  assert.equal(spot.z, 0);
});

test('height comes from the surface actually stood on', () => {
  const model = room();
  const bounds = new RoomBounds(model);
  assert.equal(bounds.heightAt(0.7, 0), 0.6, 'over the table');
  assert.equal(bounds.heightAt(-1, 0), 0, 'over the floor');
  assert.equal(bounds.heightAt(0, 0, model.surfaceById('table')), 0.6, 'told which surface');
});

test('a bigger hop lets a species climb higher and jump further', () => {
  const bouncy = new RoomBounds(room()).scaleTo(profileOf('dragon'));
  const grounded = new RoomBounds(room()).scaleTo(profileOf('otter'));
  assert.ok(bouncy.limits.rise > grounded.limits.rise);
  assert.ok(bouncy.limits.reach > grounded.limits.reach);
});

test('a room-bounded creature roams real surfaces and never walks through the air', () => {
  const model = room();
  const bounds = new RoomBounds(model).scaleTo(profileOf('ferret'));
  const controller = new WanderController('ferret', { bounds });
  let onTable = false;
  let onFloor = false;
  for (let i = 0; i < 4000; i++) {
    const state = controller.update(1 / 60);
    assert.ok(Number.isFinite(state.x) && Number.isFinite(state.z) && Number.isFinite(state.y));
    // Height is only ever a real surface height, or in between while stepping.
    assert.ok(state.y >= -1e-9 && state.y <= 0.6 + 1e-9, `height ${state.y} is not a real surface`);
    const surface = model.surfaceAt(state.x, state.z);
    assert.ok(surface, `(${state.x}, ${state.z}) is on no real surface`);
    if (state.y > 0.3) onTable = true;
    if (state.y < 0.05) onFloor = true;
  }
  assert.ok(onFloor, 'it should spend time on the floor');
  assert.ok(onTable, 'it should get up onto the table');
});

test('the creature stays inside the anchor disc while the room is still unknown', () => {
  const controller = new WanderController('imp', { bounds: new RoomBounds() });
  for (let i = 0; i < 2000; i++) {
    const state = controller.update(MAX_DELTA);
    assert.ok(
      Math.hypot(state.x, state.z) <= UNSENSED_RADIUS + 1e-6,
      `escaped the anchor disc at ${state.x}, ${state.z}`,
    );
  }
});

test('swapping in a newly sensed room changes where the creature may go', () => {
  const bounds = new RoomBounds();
  assert.ok(Math.hypot(bounds.clamp(9, 9).x, bounds.clamp(9, 9).z) <= UNSENSED_RADIUS + 1e-9);
  bounds.setRoom(room());
  const spot = bounds.clamp(1, 0);
  assert.equal(spot.surface.id, 'floor');
  assert.equal(spot.x, 1, 'a metre out is now legal, because the floor is known to be there');
});
