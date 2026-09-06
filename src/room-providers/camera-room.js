// Builds a RoomModel from camera frames alone — no WebXR.
//
// This is the tier that runs on a laptop webcam and on iOS Safari. It cannot
// see real geometry, so it is honest about that: it reports lower confidence,
// and the behaviour layer responds by keeping the creature closer to home.
// What it *can* sense is real and worth having:
//
//   - ambient light: the real brightness and colour cast of the room, which
//     lights the creature and decides whether it bounds around or curls up
//   - camera motion: sparse frame differencing across a grid, so panning the
//     phone shifts the creature's world instead of dragging it along
//   - a ground plane the player places with one tap, sized by where on screen
//     they tapped — lower on screen reads as nearer, so the plane is smaller
//
// The frame analysis is pure and separately testable; only `sample()` touches
// a canvas.

import { RoomModel, rectangleSurface } from '../room-model.js';

// The analysis grid. Small on purpose: this runs every few frames on a phone,
// and 16x12 luminance cells is plenty to estimate light and coarse motion.
export const GRID = { x: 16, y: 12 };
// Analyse a few times a second, not every frame.
export const SAMPLE_INTERVAL = 0.2;
// Cells changing by less than this are noise, not motion.
const MOTION_FLOOR = 0.035;

const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

/**
 * Reduce raw RGBA pixels to a grid of luminance cells plus an average colour.
 * Pure, so it is tested directly with synthetic frames.
 */
export function analyseFrame(pixels, width, height, grid = GRID) {
  const cells = new Float32Array(grid.x * grid.y);
  const counts = new Uint32Array(grid.x * grid.y);
  let r = 0;
  let g = 0;
  let b = 0;
  let total = 0;
  for (let y = 0; y < height; y++) {
    const row = Math.min(grid.y - 1, Math.floor((y / height) * grid.y));
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const pr = pixels[i] / 255;
      const pg = pixels[i + 1] / 255;
      const pb = pixels[i + 2] / 255;
      // Rec. 709 luma: matches how bright the room actually looks.
      const luma = 0.2126 * pr + 0.7152 * pg + 0.0722 * pb;
      const cell = row * grid.x + Math.min(grid.x - 1, Math.floor((x / width) * grid.x));
      cells[cell] += luma;
      counts[cell]++;
      r += pr;
      g += pg;
      b += pb;
      total++;
    }
  }
  for (let i = 0; i < cells.length; i++) if (counts[i]) cells[i] /= counts[i];
  const count = total || 1;
  const intensity = Math.max(0.02, (0.2126 * r + 0.7152 * g + 0.0722 * b) / count);
  return {
    cells,
    intensity,
    // Normalised so colour is a cast, independent of brightness.
    color: { r: r / count / intensity, g: g / count / intensity, b: b / count / intensity },
  };
}

/**
 * Compare two luminance grids and estimate how the camera moved, in grid
 * cells. Positive x means the scene moved right, i.e. the camera panned left.
 * Returns `motion` in 0..1 for how much of the frame changed at all.
 */
export function estimateShift(previous, current, grid = GRID, range = 2) {
  if (!previous || !current) return { x: 0, y: 0, motion: 0 };
  const errorAt = (dx, dy) => {
    let error = 0;
    let samples = 0;
    for (let y = range; y < grid.y - range; y++) {
      for (let x = range; x < grid.x - range; x++) {
        error += Math.abs(previous[y * grid.x + x] - current[(y + dy) * grid.x + (x + dx)]);
        samples++;
      }
    }
    return samples ? error / samples : Infinity;
  };
  // Seeded with "the camera did not move", and only ever replaced by a
  // strictly better match. Without this, a featureless surface — a blank wall,
  // a dark room — ties at every offset and reports a pan that never happened.
  let best = { x: 0, y: 0, error: errorAt(0, 0) };
  for (let dy = -range; dy <= range; dy++) {
    for (let dx = -range; dx <= range; dx++) {
      if (!dx && !dy) continue;
      const error = errorAt(dx, dy);
      if (error < best.error) best = { x: dx, y: dy, error };
    }
  }
  let changed = 0;
  for (let i = 0; i < current.length; i++) {
    if (Math.abs(current[i] - previous[i]) > MOTION_FLOOR) changed++;
  }
  return { x: best.x, y: best.y, motion: current.length ? changed / current.length : 0 };
}

export class CameraRoomProvider {
  constructor({ grid = GRID } = {}) {
    this.source = 'camera';
    this.grid = grid;
    this.canvas = null;
    this.context = null;
    this.previous = null;
    this.light = { intensity: 1, color: { r: 1, g: 1, b: 1 }, direction: null };
    this.shift = { x: 0, y: 0, motion: 0 };
    // Where the player said the ground is, and how big we guess it to be.
    this.ground = null;
    this.since = 0;
    this.tracking = 'lost';
  }
  /**
   * The player taps the video to say "the floor is there". Screen position is
   * the only depth cue available without sensors: a tap low in the frame is
   * near the viewer, so the plane is placed close and kept small.
   */
  placeGround(normalisedY = 0.75) {
    const nearness = clamp(normalisedY, 0.1, 1);
    const size = 0.8 + (1 - nearness) * 2.4;
    this.ground = rectangleSurface({
      id: 'placed-ground',
      width: size,
      depth: size * 0.75,
      y: 0,
      semantic: 'floor',
      // A tap is a real statement about the room, but an imprecise one.
      confidence: 0.5,
    });
    this.tracking = 'limited';
    return this.ground;
  }
  /** Grab and analyse one video frame. Safe to call before the video is ready. */
  sample(video) {
    if (!video || !video.videoWidth || !video.videoHeight) return null;
    if (!this.canvas) {
      this.canvas = document.createElement('canvas');
      this.canvas.width = 64;
      this.canvas.height = 48;
      this.context = this.canvas.getContext('2d', { willReadFrequently: true });
    }
    if (!this.context) return null;
    const { width, height } = this.canvas;
    this.context.drawImage(video, 0, 0, width, height);
    let frame;
    try {
      frame = this.context.getImageData(0, 0, width, height);
    } catch {
      // A tainted canvas (a cross-origin stream) simply means no light sensing.
      return null;
    }
    const analysis = analyseFrame(frame.data, width, height, this.grid);
    this.shift = estimateShift(this.previous, analysis.cells, this.grid);
    this.previous = analysis.cells;
    this.light = { intensity: analysis.intensity, color: analysis.color, direction: null };
    return analysis;
  }
  /**
   * Called each frame with the elapsed seconds and the video element.
   * Sampling is throttled; the returned model is always current.
   */
  update(dt, video) {
    this.since += Number.isFinite(dt) ? dt : 0;
    if (this.since >= SAMPLE_INTERVAL) {
      this.since = 0;
      this.sample(video);
    }
    return this.model();
  }
  model() {
    const surfaces = this.ground ? [this.ground] : [];
    return new RoomModel({
      surfaces,
      obstacles: [],
      light: this.light,
      // Heavy frame-to-frame change means the camera is moving and the guessed
      // ground is momentarily untrustworthy.
      tracking: this.ground ? (this.shift.motion > 0.55 ? 'limited' : 'ok') : 'lost',
      source: 'camera',
    });
  }
  dispose() {
    this.previous = null;
    this.canvas = null;
    this.context = null;
  }
}
