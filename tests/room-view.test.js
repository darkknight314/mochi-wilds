import test from 'node:test';
import assert from 'node:assert/strict';
import { skirtPositions, RAISED } from '../src/room-view.js';

const square = [
  { x: -0.5, z: -0.5 },
  { x: 0.5, z: -0.5 },
  { x: 0.5, z: 0.5 },
  { x: -0.5, z: 0.5 },
];

test('a raised surface is skirted down to the floor on every edge', () => {
  const positions = skirtPositions(square, 0.6, 0);
  // Two triangles per edge, three vertices each, three components each.
  assert.equal(positions.length, square.length * 2 * 3 * 3);
  const ys = [];
  for (let i = 1; i < positions.length; i += 3) ys.push(positions[i]);
  assert.ok(ys.every((y) => y === 0 || y === 0.6), 'every vertex is on the lid or the floor');
  assert.ok(ys.includes(0) && ys.includes(0.6), 'the skirt spans both');
});

test('the skirt covers the full height of the object', () => {
  const positions = skirtPositions(square, 0.2, -0.1);
  const ys = [];
  for (let i = 1; i < positions.length; i += 3) ys.push(positions[i]);
  assert.equal(Math.min(...ys), -0.1);
  assert.equal(Math.max(...ys), 0.2);
});

test('a surface already on the floor is not skirted', () => {
  assert.deepEqual(skirtPositions(square, 0, 0), []);
  assert.deepEqual(skirtPositions(square, -0.2, 0), [], 'nor one below the floor');
});

test('degenerate input produces no geometry rather than broken geometry', () => {
  assert.deepEqual(skirtPositions([], 1, 0), []);
  assert.deepEqual(skirtPositions([{ x: 0, z: 0 }, { x: 1, z: 0 }], 1, 0), []);
  assert.deepEqual(skirtPositions(null, 1, 0), []);
});

test('the raised threshold is small enough for a bag and above sensor noise', () => {
  assert.ok(RAISED > 0.02, 'a couple of centimetres of drift must not build walls');
  assert.ok(RAISED < 0.15, 'a backpack on the floor must still count as raised');
});
