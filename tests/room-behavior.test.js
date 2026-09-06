import test from 'node:test';
import assert from 'node:assert/strict';
import { RoomModel, Obstacle, rectangleSurface, pointInPolygon } from '../src/room-model.js';
import {
  chooseIntent,
  edgeLookout,
  extentOf,
  labelOf,
  EXPLORE_CONFIDENCE,
  DIM_ROOM,
  PEER_MARGIN,
} from '../src/room-behavior.js';

// A deterministic stand-in for the controller's seeded generator.
const sequence = (...values) => {
  let i = 0;
  return () => values[i++ % values.length];
};
const floor = (confidence = 0.9) =>
  rectangleSurface({ id: 'floor', width: 3, depth: 3, y: 0, semantic: 'floor', confidence });
const table = () =>
  rectangleSurface({
    id: 'table',
    cx: 0.8,
    width: 1,
    depth: 0.8,
    y: 0.74,
    semantic: 'table',
    confidence: 0.9,
  });
const at = (x, z, y = 0) => ({ x, z, y });

test('an unknown room keeps the creature at the anchor', () => {
  const intent = chooseIntent(new RoomModel({}), at(0, 0), sequence(0.5));
  assert.equal(intent.kind, 'settle');
  assert.equal(intent.x, 0);
  assert.equal(intent.z, 0);
});

test('a barely-sensed room is not explored', () => {
  const shaky = new RoomModel({ surfaces: [floor(0.2)], tracking: 'ok' });
  assert.ok(shaky.confidence < EXPLORE_CONFIDENCE);
  const intent = chooseIntent(shaky, at(1, 1), sequence(0.01));
  assert.equal(intent.kind, 'settle');
  // It draws back toward the anchor rather than striking out.
  assert.ok(Math.abs(intent.x) < 1 && Math.abs(intent.z) < 1);
});

test('a dark room settles the creature instead of sending it exploring', () => {
  const room = new RoomModel({
    surfaces: [floor()],
    light: { intensity: DIM_ROOM - 0.1 },
    tracking: 'ok',
  });
  const intent = chooseIntent(room, at(0.5, 0.5), sequence(0.1));
  assert.equal(intent.kind, 'settle');
  assert.match(intent.activity, /dark/);
});

test('a bright room does send it exploring', () => {
  const room = new RoomModel({ surfaces: [floor()], light: { intensity: 1 }, tracking: 'ok' });
  const intent = chooseIntent(room, at(0.5, 0.5), sequence(0.9, 0.5));
  assert.notEqual(intent.kind, 'settle');
});

test('every intent lands on a real walkable surface at that surface height', () => {
  const room = new RoomModel({
    surfaces: [floor(), table()],
    obstacles: [new Obstacle({ id: 'mug', x: 0.6, z: 0.1, radius: 0.07, height: 0.11 })],
    light: { intensity: 1 },
    tracking: 'ok',
  });
  const kinds = new Set();
  for (let i = 0; i < 200; i++) {
    // Sweep the whole decision space rather than trusting one lucky roll.
    const random = sequence((i % 20) / 20, ((i * 7) % 13) / 13, ((i * 3) % 11) / 11);
    const start = i % 2 ? at(0.8, 0, 0.74) : at(-0.5, 0.5);
    const intent = chooseIntent(room, start, random);
    kinds.add(intent.kind);
    if (intent.kind === 'settle' && !intent.surface) continue;
    assert.ok(intent.surface, `${intent.kind} should name a surface`);
    assert.equal(intent.y, intent.surface.y, 'height must match the surface stood on');
    assert.ok(
      pointInPolygon(intent.surface.polygon, intent.x, intent.z),
      `${intent.kind} target (${intent.x}, ${intent.z}) fell off ${intent.surface.id}`,
    );
  }
  // The room affords all four moves, and the sweep should find them.
  for (const kind of ['wander', 'edge', 'hop', 'peek'])
    assert.ok(kinds.has(kind), `expected the sweep to produce a "${kind}" intent`);
});

test('a creature on the table can hop down, and the caption says so', () => {
  const room = new RoomModel({
    surfaces: [floor(), table()],
    light: { intensity: 1 },
    tracking: 'ok',
  });
  const intent = chooseIntent(room, at(0.8, 0, 0.74), sequence(0.3, 0));
  assert.equal(intent.kind, 'hop');
  assert.equal(intent.surface.id, 'floor');
  assert.equal(intent.y, 0);
  assert.match(intent.activity, /down/);
});

test('an edge lookout stands at the rim and faces outward', () => {
  const surface = table();
  const look = edgeLookout(surface, at(0.8, 0), sequence(0.1, 0.5));
  assert.ok(look, 'a table is big enough to have an edge worth looking over');
  assert.equal(pointInPolygon(surface.polygon, look.spot.x, look.spot.z), true);
  // Facing points away from the surface centre, which is what "looking over" means.
  const centre = surface.centroid;
  const toCentre = { x: centre.x - look.spot.x, z: centre.z - look.spot.z };
  assert.ok(toCentre.x * look.outward.x + toCentre.z * look.outward.z <= 1e-9);
});

test('a surface too small to stand near an edge has no lookout', () => {
  const tiny = rectangleSurface({ id: 'coaster', width: PEER_MARGIN, depth: PEER_MARGIN });
  assert.equal(edgeLookout(tiny, at(0, 0), sequence(0.5)), null);
});

test('extent and label describe a surface for the UI', () => {
  assert.deepEqual(extentOf(table()), { x: 0.5, z: 0.4 });
  assert.equal(labelOf(table()), 'table');
  assert.equal(labelOf(null), 'room');
  assert.equal(labelOf(rectangleSurface({ semantic: 'unknown' })), 'room');
});
