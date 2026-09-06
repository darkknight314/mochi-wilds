import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyseFrame,
  estimateShift,
  CameraRoomProvider,
  GRID,
  SAMPLE_INTERVAL,
} from '../src/room-providers/camera-room.js';

const W = 32;
const H = 24;
// Build an RGBA frame from a function of pixel position.
function frame(shade) {
  const pixels = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const [r, g, b] = shade(x, y);
      const i = (y * W + x) * 4;
      pixels[i] = r;
      pixels[i + 1] = g;
      pixels[i + 2] = b;
      pixels[i + 3] = 255;
    }
  }
  return pixels;
}
const grey = (v) => () => [v, v, v];

test('a dark room and a bright room read as different intensities', () => {
  const dark = analyseFrame(frame(grey(20)), W, H);
  const bright = analyseFrame(frame(grey(230)), W, H);
  assert.ok(dark.intensity < 0.15, `dark room read ${dark.intensity}`);
  assert.ok(bright.intensity > 0.8, `bright room read ${bright.intensity}`);
});

test('a warm room reports a warm colour cast, independent of brightness', () => {
  const warm = analyseFrame(
    frame(() => [255, 180, 120]),
    W,
    H,
  );
  assert.ok(warm.color.r > warm.color.b, 'a tungsten-lit room should read red over blue');
  // The cast is normalised, so dimming the same light keeps the same colour.
  const dim = analyseFrame(
    frame(() => [128, 90, 60]),
    W,
    H,
  );
  assert.ok(Math.abs(warm.color.r - dim.color.r) < 0.05);
  assert.ok(dim.intensity < warm.intensity);
});

test('a black frame cannot produce a divide-by-zero colour', () => {
  const black = analyseFrame(frame(grey(0)), W, H);
  assert.ok(Number.isFinite(black.color.r) && Number.isFinite(black.intensity));
  assert.ok(black.intensity > 0);
});

test('panning the camera is detected as a shift in the matching direction', () => {
  // A vertical stripe, then the same stripe two cells to the right.
  const stripeAt = (cell) =>
    analyseFrame(
      frame((x) => (Math.floor((x / W) * GRID.x) === cell ? [255, 255, 255] : [10, 10, 10])),
      W,
      H,
    ).cells;
  const shift = estimateShift(stripeAt(6), stripeAt(8), GRID);
  assert.equal(shift.x, 2, 'the stripe moved two cells right');
  assert.equal(estimateShift(stripeAt(8), stripeAt(6), GRID).x, -2, 'and back again');
  assert.ok(shift.motion > 0, 'a moved stripe is real motion');
});

test('a featureless still frame reports no shift, rather than a phantom pan', () => {
  const still = analyseFrame(frame(grey(120)), W, H).cells;
  const shift = estimateShift(still, still, GRID);
  assert.deepEqual({ x: shift.x, y: shift.y }, { x: 0, y: 0 });
  assert.equal(shift.motion, 0);
});

test('a missing previous frame is not a shift', () => {
  assert.deepEqual(estimateShift(null, new Float32Array(GRID.x * GRID.y)), {
    x: 0,
    y: 0,
    motion: 0,
  });
});

test('the room is unknown until the player places the ground', () => {
  const provider = new CameraRoomProvider();
  assert.equal(provider.model().known, false);
  assert.equal(provider.model().tracking, 'lost');
  provider.placeGround(0.75);
  const model = provider.model();
  assert.equal(model.known, true);
  assert.equal(model.ground.semantic, 'floor');
});

test('tapping lower on screen reads as nearer, so the ground placed is smaller', () => {
  const near = new CameraRoomProvider().placeGround(0.95);
  const far = new CameraRoomProvider().placeGround(0.3);
  assert.ok(near.area < far.area, 'a nearer floor should cover less of the room');
});

test('violent camera motion downgrades tracking rather than lying about the room', () => {
  const provider = new CameraRoomProvider();
  provider.placeGround();
  assert.equal(provider.model().tracking, 'ok');
  provider.shift = { x: 0, y: 0, motion: 0.9 };
  assert.equal(provider.model().tracking, 'limited');
  // Behaviour sees the drop as reduced confidence.
  assert.ok(provider.model().confidence < 0.5);
});

test('sampling is throttled and survives a video that is not ready', () => {
  const provider = new CameraRoomProvider();
  let sampled = 0;
  provider.sample = () => (sampled++, null);
  provider.update(SAMPLE_INTERVAL / 2, null);
  assert.equal(sampled, 0, 'below the interval, no sampling');
  provider.update(SAMPLE_INTERVAL, null);
  assert.equal(sampled, 1);
  // A NaN delta must not wedge the throttle.
  provider.update(NaN, null);
  assert.equal(sampled, 1);
});
