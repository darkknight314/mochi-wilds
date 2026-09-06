import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SurfaceMapper,
  convexHull,
  growHull,
  MIN_SAMPLES,
  MIN_SPACING,
  MAX_SAMPLES,
} from '../src/room-providers/hit-test-map.js';
import { pointInPolygon, polygonArea } from '../src/room-model.js';

// Sweep a ray across a surface the way a player panning a phone would.
const sweep = (mapper, y, count = 12, spread = 0.5) => {
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    mapper.add(Math.cos(a) * spread, y, Math.sin(a) * spread);
  }
};

test('a convex hull wraps its points and ignores interior ones', () => {
  const hull = convexHull([
    { x: 0, z: 0 },
    { x: 1, z: 0 },
    { x: 1, z: 1 },
    { x: 0, z: 1 },
    { x: 0.5, z: 0.5 },
  ]);
  assert.equal(hull.length, 4, 'the interior point is not on the hull');
  assert.ok(Math.abs(polygonArea(hull) - 1) < 1e-9);
});

test('too few points to wrap are returned as they are', () => {
  assert.equal(convexHull([{ x: 0, z: 0 }]).length, 1);
  assert.equal(convexHull([]).length, 0);
});

test('growing a hull enlarges it around its centre', () => {
  const hull = convexHull([
    { x: -1, z: -1 },
    { x: 1, z: -1 },
    { x: 1, z: 1 },
    { x: -1, z: 1 },
  ]);
  const grown = growHull(hull, 0.2);
  assert.ok(polygonArea(grown) > polygonArea(hull));
  assert.equal(growHull(hull, 0).length, hull.length);
});

test('nothing is mapped until there is real evidence', () => {
  const mapper = new SurfaceMapper();
  for (let i = 0; i < MIN_SAMPLES - 1; i++) mapper.add(i * 0.2, 0, 0);
  assert.deepEqual(mapper.surfaces(), []);
});

test('sweeping one real surface produces one walkable floor', () => {
  const mapper = new SurfaceMapper();
  sweep(mapper, 0);
  const surfaces = mapper.surfaces();
  assert.equal(surfaces.length, 1);
  assert.equal(surfaces[0].semantic, 'floor');
  assert.equal(surfaces[0].walkable, true);
  assert.ok(pointInPolygon(surfaces[0].polygon, 0, 0), 'the swept area is walkable');
});

test('a floor and a table above it become two surfaces, climbable apart', () => {
  const mapper = new SurfaceMapper();
  sweep(mapper, 0, 14, 1.2);
  sweep(mapper, 0.62, 12, 0.35);
  const surfaces = mapper.surfaces();
  assert.equal(surfaces.length, 2);
  assert.deepEqual(
    surfaces.map((s) => s.semantic),
    ['floor', 'table'],
  );
  assert.ok(Math.abs(surfaces[1].y - 0.62) < 0.02, 'the table keeps its real height');
});

test('a slightly uneven floor stays one surface, not a staircase', () => {
  const mapper = new SurfaceMapper();
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    // Sensor noise of a couple of centimetres.
    mapper.add(Math.cos(a), 0.02 * Math.sin(i), Math.sin(a));
  }
  assert.equal(mapper.surfaces().length, 1);
});

test('duplicate and invalid samples are rejected', () => {
  const mapper = new SurfaceMapper();
  assert.equal(mapper.add(0, 0, 0), true);
  assert.equal(mapper.add(0, 0, 0), false, 'the same spot again adds nothing');
  assert.equal(mapper.add(MIN_SPACING / 2, 0, 0), false, 'too close to be new');
  assert.equal(mapper.add(NaN, 0, 0), false);
  assert.equal(mapper.add(0, undefined, 0), false);
  assert.equal(mapper.progress, 1);
});

test('a long session cannot grow without bound', () => {
  const mapper = new SurfaceMapper();
  for (let i = 0; i < MAX_SAMPLES + 50; i++) mapper.add(i * 0.5, 0, (i % 7) * 0.5);
  assert.ok(mapper.progress <= MAX_SAMPLES);
});

test('confidence grows with evidence but never matches a detected plane', () => {
  const sparse = new SurfaceMapper();
  sweep(sparse, 0, MIN_SAMPLES, 0.4);
  const dense = new SurfaceMapper();
  sweep(dense, 0, 40, 0.9);
  assert.ok(dense.surfaces()[0].confidence > sparse.surfaces()[0].confidence);
  assert.ok(dense.surfaces()[0].confidence <= 0.8, 'stays below real plane confidence of 0.9');
});

test('reset forgets the room', () => {
  const mapper = new SurfaceMapper();
  sweep(mapper, 0);
  mapper.reset();
  assert.equal(mapper.progress, 0);
  assert.deepEqual(mapper.surfaces(), []);
});
