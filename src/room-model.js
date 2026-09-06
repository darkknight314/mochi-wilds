// A room the creature can play in, described independently of how it was sensed.
//
// Two providers build one of these: `room-providers/xr-room.js` from real
// WebXR plane detection, and `room-providers/camera-room.js` from camera
// frames alone. Everything downstream — the behaviour layer, the wander
// controller's bounds — consumes only this shape, so the play behaviour is
// written once and never learns which browser it got.
//
// No Three.js, no browser APIs, no mutation of inputs: this file is pure
// geometry so it can be unit tested under `node --test`.

// Metres. A surface smaller than this is sensor noise, not somewhere to stand.
export const MIN_SURFACE_AREA = 0.06;
// How far inside a surface edge a standing position is kept, so a creature
// looking over the edge of a real table still has its feet on the table.
export const EDGE_MARGIN = 0.09;

export const SEMANTICS = ['floor', 'table', 'seat', 'wall', 'ceiling', 'unknown'];

const finite = (n, fallback = 0) => (Number.isFinite(n) ? n : fallback);
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

/**
 * One walkable (or blocking) plane, as a convex polygon on a horizontal slice.
 * Polygons are stored in the room frame: x/z are metres across the floor, `y`
 * is the height of the plane above the anchor origin.
 */
export class Surface {
  constructor({ id, polygon, y = 0, semantic = 'unknown', confidence = 0.5, normal } = {}) {
    this.id = id ?? `surface-${Math.round(finite(y) * 1000)}`;
    this.polygon = (polygon || []).map((p) => ({ x: finite(p.x), z: finite(p.z) }));
    this.y = finite(y);
    this.semantic = SEMANTICS.includes(semantic) ? semantic : 'unknown';
    this.confidence = clamp(finite(confidence, 0.5), 0, 1);
    this.normal = normal || { x: 0, y: 1, z: 0 };
  }
  get walkable() {
    // Walls and ceilings are things to path around and peek behind, never to
    // stand on. An upward normal is required regardless of the label, because
    // plane semantics from the sensor are advisory.
    return this.normal.y > 0.7 && this.semantic !== 'wall' && this.semantic !== 'ceiling';
  }
  get area() {
    return polygonArea(this.polygon);
  }
  get centroid() {
    return polygonCentroid(this.polygon);
  }
}

/** Shoelace area of a polygon, always positive. */
export function polygonArea(polygon) {
  if (!polygon || polygon.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    sum += a.x * b.z - b.x * a.z;
  }
  return Math.abs(sum) / 2;
}

export function polygonCentroid(polygon) {
  if (!polygon || !polygon.length) return { x: 0, z: 0 };
  if (polygon.length < 3) {
    const sx = polygon.reduce((n, p) => n + p.x, 0);
    const sz = polygon.reduce((n, p) => n + p.z, 0);
    return { x: sx / polygon.length, z: sz / polygon.length };
  }
  let area = 0;
  let cx = 0;
  let cz = 0;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    const cross = a.x * b.z - b.x * a.z;
    area += cross;
    cx += (a.x + b.x) * cross;
    cz += (a.z + b.z) * cross;
  }
  // A degenerate (zero-area) ring has no centroid; fall back to the mean vertex.
  if (Math.abs(area) < 1e-9) {
    const sx = polygon.reduce((n, p) => n + p.x, 0);
    const sz = polygon.reduce((n, p) => n + p.z, 0);
    return { x: sx / polygon.length, z: sz / polygon.length };
  }
  return { x: cx / (3 * area), z: cz / (3 * area) };
}

/** Even-odd containment. Works for the concave rings WebXR sometimes reports. */
export function pointInPolygon(polygon, x, z) {
  if (!polygon || polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    const straddles = a.z > z !== b.z > z;
    if (straddles && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z || 1e-9) + a.x) inside = !inside;
  }
  return inside;
}

function distanceToSegment(px, pz, a, b) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const lengthSq = dx * dx + dz * dz;
  const t = lengthSq ? clamp(((px - a.x) * dx + (pz - a.z) * dz) / lengthSq, 0, 1) : 0;
  const x = a.x + dx * t;
  const z = a.z + dz * t;
  return { distance: Math.hypot(px - x, pz - z), x, z };
}

/**
 * Nearest point on the polygon boundary, how far the query point is from it,
 * and that edge's inward perpendicular. The perpendicular (rather than a
 * direction toward the centroid) is what makes stepping inside converge at a
 * corner, where moving diagonally satisfies neither adjoining edge.
 */
export function nearestEdge(polygon, x, z) {
  let best = { distance: Infinity, x, z, inward: { x: 0, z: 0 } };
  if (!polygon || polygon.length < 2) return best;
  const centre = polygonCentroid(polygon);
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    const hit = distanceToSegment(x, z, a, b);
    if (hit.distance >= best.distance) continue;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const length = Math.hypot(dx, dz) || 1;
    let inward = { x: -dz / length, z: dx / length };
    // Orient the perpendicular toward the interior.
    if ((centre.x - hit.x) * inward.x + (centre.z - hit.z) * inward.z < 0)
      inward = { x: -inward.x, z: -inward.z };
    best = { ...hit, inward };
  }
  return best;
}

/**
 * Pull a point onto a surface, keeping it EDGE_MARGIN inside the boundary.
 * A creature standing exactly on a detected edge looks like it is floating,
 * because real plane extents are optimistic by a few centimetres.
 */
export function clampToSurface(surface, x, z, margin = EDGE_MARGIN) {
  const polygon = surface.polygon;
  if (!polygon || polygon.length < 3) return { x: finite(x), z: finite(z) };
  let point = { x: finite(x), z: finite(z) };
  // Each pass satisfies the closest edge exactly; a corner needs a few passes
  // because fixing one edge can leave the adjoining one still too close. A
  // surface thinner than twice the margin can never satisfy it, so the loop is
  // bounded and falls back to the centroid.
  for (let i = 0; i < 8; i++) {
    const inside = pointInPolygon(polygon, point.x, point.z);
    const edge = nearestEdge(polygon, point.x, point.z);
    if (inside && edge.distance >= margin - 1e-9) return point;
    const push = inside ? margin - edge.distance : margin;
    const base = inside ? point : edge;
    point = { x: base.x + edge.inward.x * push, z: base.z + edge.inward.z * push };
  }
  return polygonCentroid(polygon);
}

/** An axis-aligned volume the creature paths around and hides behind. */
export class Obstacle {
  constructor({ id, x = 0, z = 0, radius = 0.2, height = 0.3 } = {}) {
    this.id = id ?? 'obstacle';
    this.x = finite(x);
    this.z = finite(z);
    this.radius = Math.max(0.02, finite(radius, 0.2));
    this.height = Math.max(0.02, finite(height, 0.3));
  }
}

export const DEFAULT_LIGHT = { intensity: 1, color: { r: 1, g: 1, b: 1 }, direction: null };

/**
 * The whole sensed room. `tracking` is 'ok' | 'limited' | 'lost'; behaviour
 * shrinks the creature's world when tracking or confidence is poor rather than
 * sending it walking through furniture it cannot actually see.
 */
export class RoomModel {
  constructor({ surfaces = [], obstacles = [], light, tracking = 'lost', source = 'none' } = {}) {
    this.surfaces = surfaces.filter((s) => s.area >= MIN_SURFACE_AREA);
    this.obstacles = obstacles;
    this.light = { ...DEFAULT_LIGHT, ...(light || {}) };
    this.tracking = tracking;
    this.source = source;
  }
  get known() {
    return this.tracking !== 'lost' && this.walkable.length > 0;
  }
  get walkable() {
    return this.surfaces.filter((s) => s.walkable);
  }
  /** Overall trust in the geometry, used to scale how adventurous behaviour gets. */
  get confidence() {
    const walkable = this.walkable;
    if (!walkable.length || this.tracking === 'lost') return 0;
    const mean = walkable.reduce((n, s) => n + s.confidence, 0) / walkable.length;
    return this.tracking === 'limited' ? mean * 0.5 : mean;
  }
  /** The largest walkable surface — where the creature lives by default. */
  get ground() {
    let best = null;
    for (const surface of this.walkable) {
      const score = surface.area * (surface.semantic === 'floor' ? 1.3 : 1);
      if (!best || score > best.score) best = { surface, score };
    }
    return best?.surface || null;
  }
  surfaceById(id) {
    return this.surfaces.find((s) => s.id === id) || null;
  }
  /** The walkable surface a point sits on, preferring the highest one under it. */
  surfaceAt(x, z) {
    let best = null;
    for (const surface of this.walkable) {
      if (!pointInPolygon(surface.polygon, x, z)) continue;
      if (!best || surface.y > best.y) best = surface;
    }
    return best;
  }
  /**
   * Surfaces the creature could hop onto from `surface`: close enough
   * horizontally and within a hop's height, ordered nearest first. Climbing up
   * and dropping down are not the same move — a creature that can only clamber
   * onto a low stool will still happily jump off a table — so the two limits
   * are separate.
   */
  hopTargets(surface, { reach = 0.55, rise = 0.5, drop = 1 } = {}) {
    if (!surface) return [];
    const from = surface.centroid;
    return this.walkable
      .filter((other) => {
        if (other.id === surface.id) return false;
        const change = other.y - surface.y;
        return change >= 0 ? change <= rise : -change <= drop;
      })
      .map((other) => {
        const to = other.centroid;
        const gap = gapBetween(surface, other);
        return { surface: other, gap, distance: Math.hypot(to.x - from.x, to.z - from.z) };
      })
      .filter((hop) => hop.gap <= reach)
      .sort((a, b) => a.gap - b.gap);
  }
  /** True when something in the room stands between the creature and the viewer. */
  coverNear(x, z, radius = 0.6) {
    return this.obstacles.filter((o) => Math.hypot(o.x - x, o.z - z) <= radius + o.radius);
  }
}

/** Smallest horizontal gap between two surface boundaries (0 when they overlap). */
export function gapBetween(a, b) {
  if (!a.polygon.length || !b.polygon.length) return Infinity;
  let best = Infinity;
  for (const p of a.polygon) {
    if (pointInPolygon(b.polygon, p.x, p.z)) return 0;
    best = Math.min(best, nearestEdge(b.polygon, p.x, p.z).distance);
  }
  for (const p of b.polygon) {
    if (pointInPolygon(a.polygon, p.x, p.z)) return 0;
    best = Math.min(best, nearestEdge(a.polygon, p.x, p.z).distance);
  }
  return best;
}

/** A rectangle helper, used by the camera provider and by tests. */
export function rectangleSurface({ id, cx = 0, cz = 0, width = 1, depth = 1, ...rest }) {
  const hw = width / 2;
  const hd = depth / 2;
  return new Surface({
    id,
    polygon: [
      { x: cx - hw, z: cz - hd },
      { x: cx + hw, z: cz - hd },
      { x: cx + hw, z: cz + hd },
      { x: cx - hw, z: cz + hd },
    ],
    ...rest,
  });
}

/** The empty room: what every provider reports before it has sensed anything. */
export const UNKNOWN_ROOM = new RoomModel({});
