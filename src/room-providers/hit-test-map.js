// Builds real surfaces out of hit-test samples.
//
// Plane detection is not in stable Chrome — it sits behind a flag — so on most
// Android phones the room reports no surfaces at all, and the creature is left
// on a synthesised square of floor. Hit-testing, though, works everywhere AR
// works: it is what places the reticle.
//
// So the room is mapped the slow, honest way. Every frame the viewer-space hit
// test returns one real point on a real surface; sweeping the phone around
// sweeps that ray across the room. Collect those points, cluster them by
// height, and the clusters *are* the surfaces: the floor, the table, the seat.
// A convex hull around each cluster is the polygon the creature walks on.
//
// Pure geometry, no Three.js, no browser APIs.

import { Surface } from '../room-model.js';

// Points within this height of each other belong to the same surface. Roughly
// the thickness of a cushion: tight enough to keep a table off the floor, loose
// enough that a slightly tilted sensor does not split one surface in two.
export const HEIGHT_TOLERANCE = 0.08;
// A cluster needs this many samples before it is a surface rather than noise.
export const MIN_SAMPLES = 5;
// Samples closer together than this add nothing but cost.
export const MIN_SPACING = 0.04;
// Stop growing without bound during a long session.
export const MAX_SAMPLES = 400;

/** Convex hull of XZ points, monotone chain. Returns points in order. */
export function convexHull(points) {
  if (points.length < 3) return [...points];
  const sorted = [...points].sort((a, b) => a.x - b.x || a.z - b.z);
  const cross = (o, a, b) => (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x);
  const half = (input) => {
    const out = [];
    for (const p of input) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], p) <= 0) out.pop();
      out.push(p);
    }
    out.pop();
    return out;
  };
  const hull = [...half(sorted), ...half([...sorted].reverse())];
  return hull.length >= 3 ? hull : [...points];
}

/** Push a hull outward from its centre, so a sparsely sampled surface is still
 *  worth standing on rather than a sliver through the middle of a real table. */
export function growHull(hull, margin) {
  if (!hull.length || !margin) return hull;
  const cx = hull.reduce((n, p) => n + p.x, 0) / hull.length;
  const cz = hull.reduce((n, p) => n + p.z, 0) / hull.length;
  return hull.map((p) => {
    const dx = p.x - cx;
    const dz = p.z - cz;
    const length = Math.hypot(dx, dz) || 1;
    return { x: p.x + (dx / length) * margin, z: p.z + (dz / length) * margin };
  });
}

export class SurfaceMapper {
  constructor({ tolerance = HEIGHT_TOLERANCE, margin = 0.12 } = {}) {
    this.tolerance = tolerance;
    this.margin = margin;
    this.samples = [];
    this.dirty = true;
  }
  /** Record one real point on a real surface. Returns whether it was kept. */
  add(x, y, z) {
    if (![x, y, z].every(Number.isFinite)) return false;
    for (const s of this.samples) {
      // Near-duplicate: same spot on the same surface, already known.
      if (
        Math.abs(s.y - y) < this.tolerance &&
        Math.hypot(s.x - x, s.z - z) < MIN_SPACING
      ) {
        return false;
      }
    }
    this.samples.push({ x, y, z });
    if (this.samples.length > MAX_SAMPLES) this.samples.shift();
    this.dirty = true;
    return true;
  }
  /** Group samples into horizontal bands. */
  clusters() {
    const byHeight = [...this.samples].sort((a, b) => a.y - b.y);
    const groups = [];
    for (const sample of byHeight) {
      const current = groups[groups.length - 1];
      // Compared against the band's running mean, so a long gentle slope does
      // not chain one cluster across an entire staircase.
      if (current && Math.abs(sample.y - current.mean) <= this.tolerance) {
        current.points.push(sample);
        current.sum += sample.y;
        current.mean = current.sum / current.points.length;
      } else {
        groups.push({ points: [sample], sum: sample.y, mean: sample.y });
      }
    }
    return groups.filter((g) => g.points.length >= MIN_SAMPLES);
  }
  /**
   * The surfaces mapped so far. The lowest band is the floor; anything above it
   * is something to climb onto, which is the distinction the behaviour layer
   * actually cares about.
   */
  surfaces() {
    const groups = this.clusters();
    if (!groups.length) return [];
    const floorHeight = groups[0].mean;
    return groups.map((group, index) => {
      const hull = growHull(convexHull(group.points), this.margin);
      return new Surface({
        id: `mapped-${index}`,
        polygon: hull,
        y: group.mean,
        semantic: group.mean - floorHeight < this.tolerance ? 'floor' : 'table',
        // Confidence grows with evidence and never pretends to match a real
        // detected plane, so behaviour stays appropriately cautious early on.
        confidence: Math.min(0.8, 0.3 + group.points.length * 0.03),
        normal: { x: 0, y: 1, z: 0 },
      });
    });
  }
  get progress() {
    return this.samples.length;
  }
  reset() {
    this.samples = [];
    this.dirty = true;
  }
}
