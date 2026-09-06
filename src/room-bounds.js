// The bridge between a sensed room and the roaming controller.
//
// `WanderController` asks its bounds strategy three things: clamp this point,
// suggest somewhere to go, and how high is the ground there. RoomBounds answers
// all three from a live RoomModel, delegating the "where should it go and why"
// question to `room-behavior.js`.
//
// The room is swapped in on every sensed frame, so this object is long-lived
// while the model it reads is not. Pure: no Three.js, no browser APIs.

import { UNKNOWN_ROOM, clampToSurface, pointInPolygon } from './room-model.js';
import { chooseIntent } from './room-behavior.js';

// When nothing has been sensed, the creature is kept inside a small disc
// around the placement anchor — roughly the footprint the garden gives it.
export const UNSENSED_RADIUS = 0.45;

function clampToDisc(x, z, radius) {
  const length = Math.hypot(x, z);
  if (!Number.isFinite(length) || length <= radius) {
    return { x: Number.isFinite(x) ? x : 0, z: Number.isFinite(z) ? z : 0 };
  }
  return { x: (x / length) * radius, z: (z / length) * radius };
}

export class RoomBounds {
  constructor(room = UNKNOWN_ROOM, { reach = 0.55, rise = 0.5, drop = 1 } = {}) {
    this.room = room;
    this.limits = { reach, rise, drop };
  }
  setRoom(room) {
    this.room = room || UNKNOWN_ROOM;
    return this;
  }
  /**
   * Species with a stronger hop climb higher and jump further.
   *
   * These limits are in real metres, and they are deliberately generous for a
   * creature this size: a palm-sized spirit that could only manage its own
   * body height would never make it onto a table, which is the move the whole
   * feature exists for. Every species can reach normal table and seat height
   * (~0.4-0.75m); none can reach a high shelf.
   */
  scaleTo(profile) {
    const hop = profile?.hop ?? 0.5;
    this.limits = { reach: 0.4 + 0.35 * hop, rise: 0.5 + 0.45 * hop, drop: 1.2 };
    return this;
  }
  /**
   * Keep a point somewhere the creature can actually stand.
   *
   * Mid-step it may legitimately be between the surface it left and the one it
   * is heading for — stepping off a table — so both are accepted, and the
   * point is only pulled back when it is on neither.
   */
  clamp(x, z, toSurface = null, fromSurface = null) {
    x = Number.isFinite(x) ? x : 0;
    z = Number.isFinite(z) ? z : 0;
    const room = this.room;
    if (!room.known) return clampToDisc(x, z, UNSENSED_RADIUS);
    const candidates = [toSurface, fromSurface].filter(Boolean);
    const allowed = candidates.length ? candidates : room.walkable;
    for (const surface of allowed) {
      if (pointInPolygon(surface.polygon, x, z)) return { x, z, surface };
    }
    // On no known surface: pull onto the nearest allowed one.
    let best = null;
    for (const surface of allowed) {
      const spot = clampToSurface(surface, x, z);
      const distance = Math.hypot(spot.x - x, spot.z - z);
      if (!best || distance < best.distance) best = { ...spot, surface, distance };
    }
    if (!best) return clampToDisc(x, z, UNSENSED_RADIUS);
    return { x: best.x, z: best.z, surface: best.surface };
  }
  heightAt(x, z, surface = null) {
    if (surface) return surface.y;
    if (!this.room.known) return 0;
    return this.room.surfaceAt(x, z)?.y ?? this.room.ground?.y ?? 0;
  }
  /**
   * Somewhere to go next, with the caption and facing that go with it.
   * The shape returned is what `WanderController.goTo` takes as its detail.
   */
  wanderTarget(random, profile, position = { x: 0, z: 0, y: 0 }) {
    const intent = chooseIntent(this.room, position, random, this.limits);
    return {
      x: intent.x,
      z: intent.z,
      y: intent.y,
      surface: intent.surface,
      face: intent.face,
      activity: intent.activity,
      kind: intent.kind,
    };
  }
}
