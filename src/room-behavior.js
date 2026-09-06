// What the creature wants to do with a real room.
//
// This is the play layer. It reads a RoomModel — however it was sensed — and
// picks the creature's next intent: cross the floor, walk out to a table edge
// and look over it, hop down to the floor, duck behind a real mug and peek
// back out, or turn toward the brightest part of the room. It emits plain
// intents; the WanderController still owns all locomotion and timing.
//
// Pure: no Three.js, no browser APIs. The only randomness comes from the
// controller's own seeded generator, passed in, so behaviour is reproducible.

import { clampToSurface, nearestEdge, EDGE_MARGIN } from './room-model.js';

// How close the creature is willing to stand to a real edge when it is
// deliberately peering over one. Closer than the normal margin — that is the
// whole point of the move — but never past the rim.
export const PEER_MARGIN = EDGE_MARGIN * 0.55;
// Below this room confidence the creature stops exploring and stays near its
// anchor, because the geometry underneath it is a guess.
export const EXPLORE_CONFIDENCE = 0.35;
// A room lit below this stops the creature bouncing around and settles it.
export const DIM_ROOM = 0.35;

const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

/**
 * One decision about where to go next and why.
 * `kind` is what the creature is doing; `x`/`z`/`y` are where in the room
 * frame; `activity` is the caption the UI already shows.
 */
function intent(kind, { x = 0, z = 0, y = 0, surface = null, activity, face = null }) {
  return { kind, x, z, y, surface, activity, face };
}

/**
 * Choose the next thing to do in this room.
 *
 * @param room     a RoomModel
 * @param position where the creature is now, `{ x, z, y, surfaceId }`
 * @param random   () => [0,1), the controller's seeded generator
 * @param options  `{ reach, rise, drop }` hop limits for this species
 */
export function chooseIntent(room, position, random, options = {}) {
  const anchor = { x: 0, z: 0, y: 0 };
  if (!room || !room.known) {
    return intent('settle', { ...anchor, activity: 'Staying close to you' });
  }
  const confidence = room.confidence;
  const here = room.surfaceAt(position.x, position.z) || room.ground;
  if (!here) return intent('settle', { ...anchor, activity: 'Staying close to you' });

  // A room we barely understand is not a room to go exploring in.
  if (confidence < EXPLORE_CONFIDENCE) {
    const spot = clampToSurface(here, position.x * 0.5, position.z * 0.5);
    return intent('settle', {
      ...spot,
      y: here.y,
      surface: here,
      activity: 'Finding its footing',
    });
  }

  // A dark room is for settling down in, not for bounding around.
  if (room.light.intensity < DIM_ROOM && random() < 0.6) {
    const spot = clampToSurface(here, position.x, position.z);
    return intent('settle', {
      ...spot,
      y: here.y,
      surface: here,
      activity: 'Curling up in the quiet dark',
    });
  }

  const roll = random();
  const cover = room.coverNear(position.x, position.z, 0.7);
  const hops = room.hopTargets(here, options);

  // Hide behind something real, then pop back out.
  if (cover.length && roll < 0.18) {
    const behind = cover[0];
    // Stand on the far side of the obstacle from the anchor (where the viewer
    // is), so the creature is genuinely occluded rather than beside it.
    const dx = behind.x - anchor.x;
    const dz = behind.z - anchor.z;
    const length = Math.hypot(dx, dz) || 1;
    const reach = behind.radius + 0.12;
    const spot = clampToSurface(
      here,
      behind.x + (dx / length) * reach,
      behind.z + (dz / length) * reach,
    );
    return intent('peek', {
      ...spot,
      y: here.y,
      surface: here,
      activity: 'Hiding behind something of yours',
    });
  }

  // Hop to a neighbouring real surface — off the table, onto the stool.
  if (hops.length && roll < 0.42) {
    const hop = hops[Math.floor(random() * hops.length) % hops.length];
    const landing = clampToSurface(hop.surface, position.x, position.z);
    const down = hop.surface.y < here.y;
    return intent('hop', {
      ...landing,
      y: hop.surface.y,
      surface: hop.surface,
      activity: down ? 'Hopping down to explore' : `Climbing up onto your ${labelOf(hop.surface)}`,
    });
  }

  // Walk out to a real edge and look over it.
  if (roll < 0.68) {
    const edge = edgeLookout(here, position, random);
    if (edge) {
      return intent('edge', {
        ...edge.spot,
        y: here.y,
        surface: here,
        face: edge.outward,
        activity: `Peering over the edge of your ${labelOf(here)}`,
      });
    }
  }

  // Otherwise: a plain wander somewhere else on this surface.
  const spread = clamp(confidence, 0.3, 1);
  const centre = here.centroid;
  const spot = clampToSurface(
    here,
    centre.x + (random() - 0.5) * 2 * spread * extentOf(here).x,
    centre.z + (random() - 0.5) * 2 * spread * extentOf(here).z,
  );
  return intent('wander', {
    ...spot,
    y: here.y,
    surface: here,
    activity: `Exploring your ${labelOf(here)}`,
  });
}

/** Half-extents of a surface's bounding box, used to scale a wander. */
export function extentOf(surface) {
  if (!surface.polygon.length) return { x: 0, z: 0 };
  const xs = surface.polygon.map((p) => p.x);
  const zs = surface.polygon.map((p) => p.z);
  return { x: (Math.max(...xs) - Math.min(...xs)) / 2, z: (Math.max(...zs) - Math.min(...zs)) / 2 };
}

/**
 * Pick a spot right at a real edge, and the direction to look out over it.
 * Returns null for a surface too small to have a meaningful edge walk.
 */
export function edgeLookout(surface, position, random) {
  const extent = extentOf(surface);
  if (Math.min(extent.x, extent.z) < PEER_MARGIN * 2) return null;
  const polygon = surface.polygon;
  if (polygon.length < 3) return null;
  // Aim at a random point along the boundary, then settle just inside it.
  const index = Math.floor(random() * polygon.length) % polygon.length;
  const a = polygon[index];
  const b = polygon[(index + 1) % polygon.length];
  const t = 0.25 + random() * 0.5;
  const aim = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
  const spot = clampToSurface(surface, aim.x, aim.z, PEER_MARGIN);
  const edge = nearestEdge(polygon, spot.x, spot.z);
  return { spot, outward: { x: -edge.inward.x, z: -edge.inward.z } };
}

/** How the UI refers to a surface in an activity caption. */
export function labelOf(surface) {
  if (!surface) return 'room';
  return (
    { floor: 'floor', table: 'table', seat: 'seat', wall: 'wall', ceiling: 'ceiling' }[
      surface.semantic
    ] || 'room'
  );
}
