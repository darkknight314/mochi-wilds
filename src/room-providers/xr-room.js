// Builds a RoomModel from real WebXR sensing.
//
// Every feature here is optional and requested as such: a browser that refuses
// plane detection still gives hit-test, and the provider falls back to a single
// synthesised floor around the placed anchor — which is exactly the behaviour
// the app had before this feature existed. Nothing throws when a feature is
// missing; the model just reports lower confidence and the behaviour layer
// keeps the creature closer to home.

import * as THREE from 'three';
import { RoomModel, Surface, Obstacle, rectangleSurface } from '../room-model.js';

export const OPTIONAL_FEATURES = [
  'plane-detection',
  'light-estimation',
  'depth-sensing',
  'anchors',
];

// `depth-sensing` is inert unless the session is created with this dictionary,
// which is why asking for the feature alone did nothing. With it, and in
// gpu-optimized mode, three.js draws the real world's depth into the depth
// buffer before the scene, so anything nearer than the creature — furniture,
// or a hand passed in front of the lens — hides it per pixel.
//
// The preference order matters: gpu-optimized is the mode three.js can use,
// and luminance-alpha is the format Android exposes for it.
export const DEPTH_SENSING_INIT = {
  usagePreference: ['gpu-optimized', 'cpu-optimized'],
  dataFormatPreference: ['luminance-alpha', 'float32'],
};

// Real plane extents drift by a few centimetres between frames. Re-reading
// every polygon each frame makes the creature's world jitter, so a plane's
// geometry is only re-read when the runtime bumps its `lastChangedTime`.
const semanticOf = (plane) => {
  const label = plane.semanticLabel || plane.orientation;
  if (label === 'floor' || label === 'ground') return 'floor';
  if (label === 'table' || label === 'desk') return 'table';
  if (label === 'seat' || label === 'couch' || label === 'chair') return 'seat';
  if (label === 'wall' || label === 'vertical') return 'wall';
  if (label === 'ceiling') return 'ceiling';
  return 'unknown';
};

export class XRRoomProvider {
  constructor() {
    this.source = 'xr';
    this.planes = new Map();
    this.planeCount = 0;
    this.origin = new THREE.Matrix4().identity();
    this.originInverse = new THREE.Matrix4().identity();
    this.light = { intensity: 1, color: { r: 1, g: 1, b: 1 }, direction: null };
    this.tracking = 'lost';
    this.fallbackFloor = null;
    this.lightProbe = null;
  }
  /**
   * The room frame is anchored where the player placed the creature, so all
   * surface coordinates are relative to that spot rather than to wherever the
   * session happened to start.
   */
  setOrigin(matrix) {
    this.origin.copy(matrix);
    this.originInverse.copy(matrix).invert();
    // Placing (or re-placing) invalidates every cached polygon, which was
    // expressed in the previous frame.
    this.planes.clear();
    return this;
  }
  /** Without plane detection, the placed spot still gives us a floor to use. */
  setFallbackFloor(size = 1.6) {
    this.fallbackFloor = rectangleSurface({
      id: 'placed-floor',
      width: size,
      depth: size,
      y: 0,
      semantic: 'floor',
      // Honest about what this is: a guess that the surface tapped extends a
      // little way in each direction.
      confidence: 0.45,
    });
    return this;
  }
  async requestLightProbe(session) {
    try {
      this.lightProbe = await session.requestLightProbe?.();
    } catch {
      this.lightProbe = null;
    }
    return this.lightProbe;
  }
  readLight(frame, referenceSpace) {
    if (!this.lightProbe || !frame.getLightEstimate) return;
    const estimate = frame.getLightEstimate(this.lightProbe);
    if (!estimate) return;
    const sh = estimate.sphericalHarmonicsCoefficients;
    if (sh && sh.length >= 3) {
      // The first SH band is ambient irradiance; 0.886 is its normalisation.
      const scale = 0.886;
      const r = Math.max(0, sh[0] * scale);
      const g = Math.max(0, sh[1] * scale);
      const b = Math.max(0, sh[2] * scale);
      const intensity = Math.max(0.05, (r + g + b) / 3);
      this.light = {
        intensity,
        color: { r: r / intensity, g: g / intensity, b: b / intensity },
        direction: this.light.direction,
      };
    }
    const main = estimate.primaryLightDirection;
    const power = estimate.primaryLightIntensity;
    if (main) {
      this.light.direction = { x: main.x, y: main.y, z: main.z };
      if (power) this.light.intensity = Math.max(0.05, (power.x + power.y + power.z) / 3);
    }
    if (referenceSpace) this.tracking = 'ok';
  }
  /** Convert one XRPlane's polygon into room-frame coordinates. */
  readPlane(plane, pose) {
    const matrix = new THREE.Matrix4()
      .fromArray(pose.transform.matrix)
      .premultiply(this.originInverse);
    const point = new THREE.Vector3();
    const polygon = (plane.polygon || []).map((p) => {
      point.set(p.x, p.y, p.z).applyMatrix4(matrix);
      return { x: point.x, z: point.z };
    });
    if (polygon.length < 3) return null;
    const normal = new THREE.Vector3(0, 1, 0).transformDirection(matrix);
    const height =
      polygon.reduce((sum, _, i) => {
        point.set(plane.polygon[i].x, plane.polygon[i].y, plane.polygon[i].z).applyMatrix4(matrix);
        return sum + point.y;
      }, 0) / polygon.length;
    return new Surface({
      id: `plane-${plane.__mochiId}`,
      polygon,
      y: height,
      semantic: semanticOf(plane),
      normal: { x: normal.x, y: normal.y, z: normal.z },
      // Detected geometry is trusted far more than anything we guessed.
      confidence: 0.9,
    });
  }
  /** Called once per XR frame. Returns the current RoomModel. */
  update(frame, referenceSpace) {
    if (!frame) return this.model();
    const viewerPose = referenceSpace ? frame.getViewerPose(referenceSpace) : null;
    this.tracking = viewerPose ? 'ok' : 'limited';
    this.readLight(frame, referenceSpace);
    const detected = frame.detectedPlanes;
    if (detected && referenceSpace) {
      // Drop planes the runtime has forgotten about.
      for (const key of [...this.planes.keys()]) {
        if (!detected.has(key)) this.planes.delete(key);
      }
      for (const plane of detected) {
        // A stable per-plane id, so a surface keeps its identity across frames
        // even as the runtime refines its polygon.
        if (plane.__mochiId === undefined) plane.__mochiId = ++this.planeCount;
        const cached = this.planes.get(plane);
        if (cached && cached.changed === plane.lastChangedTime) continue;
        const pose = frame.getPose(plane.planeSpace, referenceSpace);
        if (!pose) continue;
        const surface = this.readPlane(plane, pose);
        if (surface) this.planes.set(plane, { changed: plane.lastChangedTime, surface });
      }
    }
    return this.model();
  }
  model() {
    const surfaces = [...this.planes.values()].map((entry) => entry.surface);
    if (!surfaces.some((s) => s.walkable) && this.fallbackFloor) surfaces.push(this.fallbackFloor);
    return new RoomModel({
      surfaces,
      // Walls sensed nearby double as things to duck behind.
      obstacles: surfaces
        .filter((s) => s.semantic === 'wall')
        .map((s) => {
          const centre = s.centroid;
          return new Obstacle({ id: s.id, x: centre.x, z: centre.z, radius: 0.18, height: 0.5 });
        }),
      light: this.light,
      tracking: this.tracking,
      source: 'xr',
    });
  }
  dispose() {
    this.planes.clear();
    this.lightProbe = null;
  }
}
