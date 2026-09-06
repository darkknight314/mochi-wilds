import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RoomModel,
  Surface,
  Obstacle,
  rectangleSurface,
  polygonArea,
  polygonCentroid,
  pointInPolygon,
  nearestEdge,
  clampToSurface,
  gapBetween,
  EDGE_MARGIN,
  MIN_SURFACE_AREA,
} from '../src/room-model.js';

const floor = () =>
  rectangleSurface({ id: 'floor', width: 3, depth: 3, y: 0, semantic: 'floor', confidence: 0.9 });
const table = () =>
  rectangleSurface({
    id: 'table',
    cx: 0.9,
    cz: 0,
    width: 0.8,
    depth: 0.6,
    y: 0.74,
    semantic: 'table',
    confidence: 0.8,
  });

test('polygon helpers measure a known rectangle exactly', () => {
  const surface = rectangleSurface({ cx: 1, cz: 2, width: 2, depth: 4 });
  assert.equal(polygonArea(surface.polygon), 8);
  const centre = polygonCentroid(surface.polygon);
  assert.ok(Math.abs(centre.x - 1) < 1e-9 && Math.abs(centre.z - 2) < 1e-9);
  assert.equal(pointInPolygon(surface.polygon, 1, 2), true);
  assert.equal(pointInPolygon(surface.polygon, 3, 2), false);
});

test('a degenerate polygon has no area and contains nothing', () => {
  assert.equal(
    polygonArea([
      { x: 0, z: 0 },
      { x: 1, z: 1 },
    ]),
    0,
  );
  assert.equal(pointInPolygon([{ x: 0, z: 0 }], 0, 0), false);
  const centre = polygonCentroid([
    { x: 0, z: 0 },
    { x: 2, z: 0 },
  ]);
  assert.equal(centre.x, 1);
});

test('nearest edge finds the boundary and points back inward', () => {
  const surface = rectangleSurface({ width: 2, depth: 2 });
  const edge = nearestEdge(surface.polygon, 0.9, 0);
  assert.ok(Math.abs(edge.distance - 0.1) < 1e-9);
  assert.ok(edge.inward.x < 0, 'inward normal should point back toward the centre');
});

test('clampToSurface keeps a standing spot inside the real edge', () => {
  const surface = table();
  // Far outside the table: pulled onto it, a margin in from the rim.
  const outside = clampToSurface(surface, 5, 5);
  assert.equal(pointInPolygon(surface.polygon, outside.x, outside.z), true);
  assert.ok(nearestEdge(surface.polygon, outside.x, outside.z).distance >= EDGE_MARGIN - 1e-9);
  // Comfortably inside: left exactly where it was.
  const inside = clampToSurface(surface, 0.9, 0);
  assert.deepEqual(inside, { x: 0.9, z: 0 });
});

test('walls and ceilings are never walkable, whatever their label says', () => {
  const wall = rectangleSurface({ id: 'wall', width: 2, depth: 2, semantic: 'wall' });
  const upright = new Surface({
    id: 'upright',
    polygon: rectangleSurface({ width: 2, depth: 2 }).polygon,
    semantic: 'floor',
    normal: { x: 0, y: 0.1, z: 0.99 },
  });
  assert.equal(wall.walkable, false);
  assert.equal(upright.walkable, false, 'a sideways normal beats an optimistic label');
  assert.equal(floor().walkable, true);
});

test('sensor-noise slivers are dropped when the room is built', () => {
  const sliver = rectangleSurface({ id: 'sliver', width: 0.01, depth: 0.01 });
  assert.ok(sliver.area < MIN_SURFACE_AREA);
  const room = new RoomModel({ surfaces: [floor(), sliver], tracking: 'ok' });
  assert.deepEqual(
    room.surfaces.map((s) => s.id),
    ['floor'],
  );
});

test('an empty or lost room reports itself unknown with zero confidence', () => {
  assert.equal(new RoomModel({}).known, false);
  assert.equal(new RoomModel({}).confidence, 0);
  const lost = new RoomModel({ surfaces: [floor()], tracking: 'lost' });
  assert.equal(lost.known, false);
  assert.equal(lost.confidence, 0);
});

test('limited tracking halves confidence so behaviour stays cautious', () => {
  const ok = new RoomModel({ surfaces: [floor()], tracking: 'ok' });
  const limited = new RoomModel({ surfaces: [floor()], tracking: 'limited' });
  assert.ok(Math.abs(ok.confidence - 0.9) < 1e-9);
  assert.ok(Math.abs(limited.confidence - 0.45) < 1e-9);
});

test('the ground is the biggest walkable surface, with floors preferred', () => {
  const room = new RoomModel({ surfaces: [floor(), table()], tracking: 'ok' });
  assert.equal(room.ground.id, 'floor');
  assert.equal(room.walkable.length, 2);
});

test('surfaceAt returns the highest surface standing over a point', () => {
  const room = new RoomModel({ surfaces: [floor(), table()], tracking: 'ok' });
  // The table overlaps the floor here, and the creature stands on the table.
  assert.equal(room.surfaceAt(0.9, 0).id, 'table');
  assert.equal(room.surfaceAt(-1.2, 0).id, 'floor');
  assert.equal(room.surfaceAt(9, 9), null);
});

test('hop targets are reachable neighbours, nearest gap first', () => {
  const room = new RoomModel({ surfaces: [floor(), table()], tracking: 'ok' });
  const hops = room.hopTargets(room.surfaceById('table'));
  assert.equal(hops.length, 1);
  assert.equal(hops[0].surface.id, 'floor');
  assert.equal(hops[0].gap, 0, 'the table overhangs the floor, so the gap is zero');
  // A shelf far above is out of hopping range even though it is close by.
  const shelf = rectangleSurface({ id: 'shelf', cx: 0.9, width: 0.5, depth: 0.4, y: 2.1 });
  const tall = new RoomModel({ surfaces: [floor(), table(), shelf], tracking: 'ok' });
  assert.equal(
    tall.hopTargets(tall.surfaceById('table')).some((h) => h.surface.id === 'shelf'),
    false,
  );
});

test('gapBetween measures the real distance between separated surfaces', () => {
  const a = rectangleSurface({ cx: 0, width: 1, depth: 1 });
  const b = rectangleSurface({ cx: 2, width: 1, depth: 1 });
  assert.ok(Math.abs(gapBetween(a, b) - 1) < 1e-9);
});

test('cover is found only near an actual obstacle', () => {
  const room = new RoomModel({
    surfaces: [floor()],
    obstacles: [new Obstacle({ id: 'mug', x: 0.5, z: 0, radius: 0.08, height: 0.12 })],
    tracking: 'ok',
  });
  assert.equal(room.coverNear(0.6, 0).length, 1);
  assert.equal(room.coverNear(-1.4, 0).length, 0);
});
