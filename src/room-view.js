// The Three.js representation of a sensed room.
//
// A RoomModel is data; this turns it into the three things the scene needs:
//
//   - shadow catchers, so the creature casts a real shadow onto your real
//     table instead of floating with a shadow that lands nowhere
//   - occluders, so a real wall or table edge hides the creature when it goes
//     behind one (invisible geometry that still writes depth)
//   - lighting, so the key light matches the room's measured brightness,
//     colour cast, and — where the sensor reports one — direction
//
// Meshes are rebuilt only when the room's geometry actually changes, because
// plane polygons are re-reported constantly and rebuilding every frame would
// churn buffers on a phone.

import * as THREE from 'three';

// How much the measured room brightness is allowed to move the scene lighting.
// A pet that goes genuinely black in a dim room reads as broken rather than
// atmospheric, so the range is deliberately gentle.
export const LIGHT_RANGE = { min: 0.45, max: 1.35 };

const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

/** A polygon in the XZ plane becomes a flat, horizontal Three.js geometry. */
export function surfaceGeometry(surface) {
  const shape = new THREE.Shape(surface.polygon.map((p) => new THREE.Vector2(p.x, p.z)));
  const geometry = new THREE.ShapeGeometry(shape);
  // ShapeGeometry builds on XY; lay it flat and lift it to the surface height.
  geometry.rotateX(Math.PI / 2);
  geometry.translate(0, surface.y, 0);
  return geometry;
}

/**
 * The vertical sides of a raised surface, from its top down to the floor.
 *
 * A mapped table or a backpack on the floor is known only as a flat lid at a
 * height. Drawn as a lid alone it occludes nothing, and the creature walking
 * behind it is painted straight over it. Skirting it down to the floor turns it
 * into the solid object it actually is, so going behind it hides the creature —
 * which is the occlusion this device can give us without a depth sensor.
 *
 * Returns raw triangle positions so the geometry is testable without a GPU.
 */
export function skirtPositions(polygon, topY, bottomY) {
  const positions = [];
  if (!polygon || polygon.length < 3 || !(topY > bottomY)) return positions;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    // Two triangles per edge, wound both ways by rendering double-sided, so a
    // hull of either orientation still writes depth.
    positions.push(
      a.x,
      topY,
      a.z,
      b.x,
      topY,
      b.z,
      b.x,
      bottomY,
      b.z,
      a.x,
      topY,
      a.z,
      b.x,
      bottomY,
      b.z,
      a.x,
      bottomY,
      a.z,
    );
  }
  return positions;
}

/** How far above the lowest surface something must sit to be a solid object. */
export const RAISED = 0.06;

/** A signature that changes only when the geometry meaningfully changes. */
export function geometrySignature(room) {
  return room.surfaces
    .map((s) => `${s.id}:${s.y.toFixed(2)}:${s.polygon.length}:${s.area.toFixed(3)}`)
    .join('|');
}

export class RoomView {
  constructor(scene, { key = null } = {}) {
    this.scene = scene;
    this.key = key;
    this.signature = null;
    this.group = new THREE.Group();
    this.group.name = 'room';
    scene.add(this.group);
    this.shadowMaterial = new THREE.ShadowMaterial({ color: '#2a2233', opacity: 0.3 });
    // Invisible to the eye, but present in the depth buffer: this is what makes
    // the creature disappear behind a real object rather than floating over it.
    this.occluderMaterial = new THREE.MeshBasicMaterial({
      colorWrite: false,
      side: THREE.DoubleSide,
    });
    this.occluderMaterial.depthWrite = true;
    this.baseKeyIntensity = key?.intensity ?? 2.5;
    this.baseKeyColor = key ? key.color.clone() : new THREE.Color('#fff1e5');
  }
  /** Rebuild catcher and occluder meshes for this room, if it has changed. */
  sync(room) {
    const signature = geometrySignature(room);
    if (signature === this.signature) return false;
    this.signature = signature;
    this.clearMeshes();
    const walkable = room.walkable;
    // The lowest walkable surface is the floor everything else stands on.
    const floorY = walkable.length ? Math.min(...walkable.map((s) => s.y)) : 0;
    for (const surface of room.surfaces) {
      if (surface.polygon.length < 3) continue;
      const geometry = surfaceGeometry(surface);
      if (surface.walkable) {
        const catcher = new THREE.Mesh(geometry, this.shadowMaterial);
        catcher.receiveShadow = true;
        // Shadow catchers must not also occlude: a floor drawn into the depth
        // buffer at the creature's own feet would clip its legs away.
        catcher.renderOrder = -1;
        this.group.add(catcher);
        // Anything standing above the floor is a solid object, not a decal.
        if (surface.y - floorY > RAISED) {
          const positions = skirtPositions(surface.polygon, surface.y, floorY);
          if (positions.length) {
            const sides = new THREE.BufferGeometry();
            sides.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
            const skirt = new THREE.Mesh(sides, this.occluderMaterial);
            skirt.renderOrder = -2;
            this.group.add(skirt);
          }
        }
      } else {
        // Walls and ceilings are what the creature can genuinely hide behind.
        const occluder = new THREE.Mesh(geometry, this.occluderMaterial);
        occluder.renderOrder = -2;
        this.group.add(occluder);
      }
    }
    return true;
  }
  /**
   * Match the scene's key light to the measured room. Intensity is clamped so
   * a dim room dims the creature without losing it, and the colour cast is
   * applied at half strength so a warm lamp warms the pastel palette rather
   * than staining it.
   */
  applyLight(light) {
    if (!this.key || !light) return;
    const measured = clamp(light.intensity ?? 1, LIGHT_RANGE.min, LIGHT_RANGE.max);
    this.key.intensity = this.baseKeyIntensity * measured;
    const cast = light.color || { r: 1, g: 1, b: 1 };
    const tint = new THREE.Color(
      clamp(cast.r ?? 1, 0.5, 1.6),
      clamp(cast.g ?? 1, 0.5, 1.6),
      clamp(cast.b ?? 1, 0.5, 1.6),
    );
    this.key.color.copy(this.baseKeyColor).lerp(this.baseKeyColor.clone().multiply(tint), 0.5);
    if (light.direction) {
      // The sensor reports the direction light travels; the light sits opposite.
      const d = light.direction;
      const length = Math.hypot(d.x, d.y, d.z) || 1;
      this.key.position.set(
        (-d.x / length) * 5,
        Math.abs(d.y / length) * 5 + 1,
        (-d.z / length) * 5,
      );
    }
  }
  update(room) {
    this.sync(room);
    this.applyLight(room.light);
  }
  setVisible(visible) {
    this.group.visible = visible;
  }
  clearMeshes() {
    for (const child of [...this.group.children]) {
      child.geometry?.dispose();
      this.group.remove(child);
    }
  }
  dispose() {
    this.clearMeshes();
    this.scene.remove(this.group);
    this.shadowMaterial.dispose();
    this.occluderMaterial.dispose();
    if (this.key) {
      this.key.intensity = this.baseKeyIntensity;
      this.key.color.copy(this.baseKeyColor);
    }
  }
}
