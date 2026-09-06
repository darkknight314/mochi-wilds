import * as THREE from 'three';
import { TessellateModifier } from 'three/examples/jsm/modifiers/TessellateModifier.js';
import { COLORS } from './game.js';
import { speciesOf } from './creatures.js';
const TAU = Math.PI * 2;

// Every creature is real, articulated geometry. Named joints are shared by the
// live procedural animator and the exported GLB animation clips.
export function createCreature(pet) {
  const species = speciesOf(pet),
    root = new THREE.Group();
  root.name = `mochi_${species}`;
  root.userData = { species, assetVersion: 3 };
  const rig = {
    species,
    joints: [],
    legs: [],
    ears: [],
    wings: [],
    tail: [],
    eyes: [],
    lids: [],
    antennae: [],
    fins: [],
    glows: [],
    mouth: null,
  };
  root.rig = rig;
  const baseColor = new THREE.Color(COLORS[pet.color] || COLORS.lilac);
  const material = (color, extra = {}) =>
    new THREE.MeshPhysicalMaterial({ color, roughness: 0.68, metalness: 0, ...extra });
  const skin = material(baseColor, {
    roughness: species === 'otter' ? 0.18 : 0.88,
    clearcoat: species === 'otter' ? 1 : 0.035,
    clearcoatRoughness: 0.3,
    ...(species === 'otter'
      ? {
          // Real refraction, not just alpha: the swirl inside has to be visible
          // through the shell for the jelly read to land.
          transparent: true,
          opacity: 0.82,
          transmission: 0.52,
          thickness: 1.1,
          ior: 1.34,
          attenuationDistance: 1.1,
          attenuationColor: new THREE.Color('#8fd0f2'),
          depthWrite: false,
        }
      : {}),
    sheen: species === 'otter' ? 0 : 1,
    sheenColor: baseColor.clone().lerp(new THREE.Color('#fff3ec'), 0.25),
    sheenRoughness: 0.75,
  });
  skin.name = 'coat';
  const cream = material('#fff1dd'),
    pink = material('#ecabc5'),
    dark = material('#3b294b', { roughness: 0.23, clearcoat: 0.8 }),
    white = material('#fffcf2', { roughness: 0.4 });
  const accent = material(new THREE.Color('#bfa4e7').lerp(baseColor, 0.2));
  accent.name = 'accent';
  // Brows are a hair darker than the coat so they read as expression, not as
  // pale lozenges floating above the eyes.
  const brow2 = material(baseColor.clone().lerp(new THREE.Color('#6b5480'), 0.34), {
    roughness: 0.6,
    sheen: 0.4,
    sheenColor: 0xfff0dc,
  });
  // Belly patches read as a lighter shade of the coat, not a stark white bib.
  const pale = material(new THREE.Color('#fff4e6').lerp(baseColor, 0.34), {
    roughness: 0.62,
    sheen: 0.6,
    sheenColor: 0xfff0dc,
  });
  const mint = material('#a4e5d0', { roughness: 0.3, clearcoat: 0.4 });
  const gold = material('#f4cf7a', {
    metalness: 0.22,
    roughness: 0.3,
    emissive: '#deac4d',
    emissiveIntensity: 0.25,
  });
  const glow = material('#ffecd2', {
    emissive: '#ffddac',
    emissiveIntensity: 0.55,
    roughness: 0.35,
  });
  const sphere = new THREE.SphereGeometry(1, 32, 24);
  function ell(parent, x, y, z, sx, sy, sz, mat = skin) {
    const m = new THREE.Mesh(sphere, mat);
    m.position.set(x, y, z);
    m.scale.set(sx, sy, sz);
    m.castShadow = mat !== skin || species !== 'otter';
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  function joint(name, parent, x = 0, y = 0, z = 0, bone = false) {
    const g = bone ? new THREE.Bone() : new THREE.Group();
    g.name = name;
    g.position.set(x, y, z);
    parent.add(g);
    rig.joints.push(g);
    return g;
  }
  function tube(parent, points, radius, mat) {
    const geometry = new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p))),
      24,
      radius,
      7,
      false,
    );
    const m = new THREE.Mesh(geometry, mat);
    m.castShadow = true;
    parent.add(m);
    return m;
  }
  function leaf(
    parent,
    { length = 0.6, width = 0.25, mat = skin, inner = true, veins = false } = {},
  ) {
    // A padded, curved ear with a rounded tip. The pink inset is painted into
    // the surface, so it cannot float above the ear or turn into a second plate.
    const geometry = new THREE.SphereGeometry(1, 36, 28);
    const positions = geometry.attributes.position;
    const colors = [];
    const inside = veins ? new THREE.Color('#b7c99d') : new THREE.Color('#e895ae');
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i),
        y = positions.getY(i),
        z = positions.getZ(i);
      const u = (y + 1) / 2;
      const padding = Math.sin(Math.PI * u);
      positions.setXYZ(
        i,
        x * width * (0.93 - 0.26 * u),
        u * length,
        z * (0.075 + width * 0.2) * (0.8 + padding * 0.2) - u * u * length * 0.15,
      );
      const mask = inner
        ? Math.max(0, Math.min(1, (z - 0.48) * 5)) *
          Math.max(0, Math.min(1, (u - 0.13) * 8)) *
          Math.max(0, Math.min(1, (0.91 - u) * 10))
        : 0;
      const c = mat.color.clone().lerp(inside, mask * 0.84);
      colors.push(c.r, c.g, c.b);
    }
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    const earMaterial = mat.clone();
    earMaterial.color.set('white');
    earMaterial.vertexColors = true;
    const m = new THREE.Mesh(geometry, earMaterial);
    m.castShadow = true;
    parent.add(m);
    if (veins) {
      const onSurface = (x, u) => [
        x,
        length * u,
        Math.sqrt(Math.max(0, 1 - (2 * u - 1) ** 2 - (x / (width * (0.93 - 0.26 * u))) ** 2)) *
          (0.075 + width * 0.2) *
          (0.8 + Math.sin(Math.PI * u) * 0.2) -
          u * u * length * 0.15 +
          0.004,
      ];
      const veinMaterial = material('#9ba67e', { roughness: 0.95 });
      tube(
        parent,
        [onSurface(0, 0.15), onSurface(0, 0.45), onSurface(0, 0.84)],
        0.006,
        veinMaterial,
      );
      for (const sign of [-1, 1])
        for (const t of [0.28, 0.45, 0.61])
          tube(
            parent,
            [
              onSurface(0, t),
              onSurface(sign * width * 0.24, t + 0.07),
              onSurface(sign * width * 0.42, t + 0.15),
            ],
            0.004,
            veinMaterial,
          );
    }
  }
  function face(
    head,
    { width = 0.23, eyeY = 0.035, front = 0.35, eyeSize = 1, muzzle = 0.1, iris = '#8e74af' } = {},
  ) {
    const skull = head.children.find((m) => m.name === 'skull');
    const { x: sx, y: sy, z: sz } = skull.scale;
    // One continuous cheek and muzzle surface; no stacked spheres on the face.
    for (const child of [...head.children]) {
      if (
        child.isMesh &&
        child !== skull &&
        Math.abs(child.position.x) < 0.001 &&
        child.position.y < 0 &&
        child.position.z > 0.1
      )
        head.remove(child);
    }
    const geometry = new THREE.SphereGeometry(1, 64, 48);
    const positions = geometry.attributes.position;
    const colors = [];
    const coat = skull.material.color.clone();
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i),
        y = positions.getY(i),
        z = positions.getZ(i);
      const lowerCheek = Math.exp(-((y + 0.3) ** 2) / 0.16);
      positions.setXYZ(
        i,
        x * (1 + 0.075 * lowerCheek),
        y,
        z + Math.max(0, z) * 0.055 * Math.exp(-(x * x) / 0.13 - (y + 0.35) ** 2 / 0.13),
      );
      const muzzleMask = Math.exp(-(x * x) / 0.11 - (y + 0.42) ** 2 / 0.08) * Math.max(0, z);
      const cheekMask =
        Math.exp(-((Math.abs(x) - 0.7) ** 2) / 0.035 - (y + 0.34) ** 2 / 0.024) * Math.max(0, z);
      const forehead = Math.exp(-(x * x) / 0.22 - (y - 0.53) ** 2 / 0.23) * Math.max(0, z);
      const c = coat.clone().lerp(new THREE.Color('#fff0dd'), muzzleMask * 0.65 + forehead * 0.12);
      c.lerp(new THREE.Color('#ef819e'), cheekMask * 0.93);
      colors.push(c.r, c.g, c.b);
    }
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    skull.geometry = geometry;
    skull.material = skull.material.clone();
    skull.material.color.set('white');
    skull.material.vertexColors = true;
    const surfaceZ = (x, y) => sz * Math.sqrt(Math.max(0.05, 1 - (x / sx) ** 2 - (y / sy) ** 2));
    eyeY = -0.025;
    const eyeMaterial = material('white', {
      vertexColors: true,
      roughness: 0.14,
      clearcoat: 1,
      clearcoatRoughness: 0.07,
      envMapIntensity: 1.5,
    });
    const eyeGeometry = new THREE.SphereGeometry(1, 40, 32);
    const eyeColors = [];
    const irisColor = new THREE.Color(iris).lerp(new THREE.Color('#976776'), 0.4);
    for (let i = 0; i < eyeGeometry.attributes.position.count; i++) {
      const y = eyeGeometry.attributes.position.getY(i);
      const c = new THREE.Color('#251e30').lerp(irisColor, Math.max(0, -y) * 0.68);
      eyeColors.push(c.r, c.g, c.b);
    }
    eyeGeometry.setAttribute('color', new THREE.Float32BufferAttribute(eyeColors, 3));
    const shine = new THREE.MeshBasicMaterial({ color: '#fffdf8' });
    for (const sign of [-1, 1]) {
      const eye = joint(
        `eye_${sign < 0 ? 'l' : 'r'}`,
        head,
        sign * width,
        eyeY,
        surfaceZ(width, eyeY) - 0.006,
      );
      eye.rotation.y = sign * 0.26;
      eye.rotation.z = -sign * 0.07;
      eye.scale.setScalar(eyeSize);
      rig.eyes.push(eye);
      const bead = new THREE.Mesh(eyeGeometry, eyeMaterial);
      bead.scale.set(0.16, 0.181, 0.055);
      eye.add(bead);
      ell(eye, -0.041, 0.065, 0.049, 0.027, 0.035, 0.009, shine);
      ell(eye, 0.048, -0.037, 0.051, 0.011, 0.014, 0.006, shine);
      // A little crescent smile in the eyes when a cuddle lands. Both open
      // and closed expressions use joints, so exported animations retain it.
      const lid = joint(`lid_${sign < 0 ? 'l' : 'r'}`, head, ...eye.position.toArray());
      lid.rotation.copy(eye.rotation);
      tube(
        lid,
        [
          [-0.125, -0.01, 0.02],
          [-0.065, 0.044, 0.034],
          [0, 0.06, 0.038],
          [0.065, 0.044, 0.034],
          [0.125, -0.01, 0.02],
        ],
        0.014,
        dark,
      );
      rig.lids.push(lid);
      const brow = ell(
        head,
        sign * width,
        eyeY + 0.23,
        surfaceZ(width, eyeY + 0.23) + 0.008,
        0.044,
        0.012,
        0.013,
        brow2,
      );
      brow.rotation.z = sign * 0.12;
    }
    const mz = surfaceZ(0, eyeY - 0.16) + 0.026;
    muzzle = 0.018;
    const nose = ell(head, 0, eyeY - 0.155, mz, 0.034, 0.021, 0.024, dark);
    nose.rotation.z = 0.03;
    // A tiny "w" smile rather than a gaping dark oval.
    tube(
      head,
      [
        [-0.044, eyeY - 0.195, mz - 0.006],
        [-0.024, eyeY - 0.214, mz - 0.006],
        [0, eyeY - 0.199, mz],
      ],
      0.006,
      dark,
    );
    tube(
      head,
      [
        [0, eyeY - 0.199, mz],
        [0.024, eyeY - 0.214, mz - 0.006],
        [0.044, eyeY - 0.195, mz - 0.006],
      ],
      0.006,
      dark,
    );
    const mouth = joint('happy_mouth', head, 0, eyeY - 0.225, mz - 0.014);
    ell(mouth, 0, 0, 0, 0.041, 0.025, 0.011, dark);
    ell(mouth, 0, -0.012, 0.009, 0.026, 0.011, 0.007, pink);
    rig.mouth = mouth;
  }
  // Short, rounded limbs ending in an oversized soft paw — no visible ankle.
  function paws(parent, positions, size = 0.13, pawMat = null, single = false) {
    const foot = pawMat || (species === 'imp' || species === 'ferret' ? accent : skin);
    positions.forEach(([x, y, z], i) => {
      const leg = joint(`leg_${i}`, parent, x, y, z);
      rig.legs.push(leg);
      if (!single) ell(leg, 0, -0.055, 0, size * 0.86, 0.105, size * 0.95, skin);
      ell(
        leg,
        0,
        single ? -0.1 : -0.135,
        0.028,
        size * 1.06,
        single ? 0.15 : 0.088,
        size * 1.16,
        foot,
      );
      ell(leg, 0, -0.16, size * 0.42, size * 0.62, 0.05, size * 0.5, pink);
      for (let j = -1; j <= 1; j++)
        ell(leg, j * size * 0.38, -0.211, size * 0.56, 0.025, 0.008, 0.025, pink);
    });
  }
  function flower(parent, size = 0.17) {
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * TAU;
      const m = ell(
        parent,
        Math.cos(angle) * size * 0.66,
        Math.sin(angle) * size * 0.66,
        0,
        size * 0.49,
        size * 0.32,
        0.046,
        pink,
      );
      m.rotation.z = angle;
    }
    ell(parent, 0, 0, 0.057, size * 0.29, size * 0.29, 0.035, gold);
  }
  function segmentedTail(
    parent,
    {
      length = 1.1,
      radius = 0.13,
      segments = 7,
      bud = false,
      flowerTip = false,
      ring = false,
      curl = 0,
      plush = false,
      ringAt = 0.45,
      ringRadius = 0.3,
      tailMat = skin,
    } = {},
  ) {
    let previous = parent;
    const step = length / segments;
    const bones = [];
    for (let i = 0; i < segments; i++) {
      const j = joint(`tail_${i}`, previous, 0, 0, i === 0 ? 0 : -step, true);
      rig.tail.push(j);
      bones.push(j);
      // Curl builds up along the tail so it sweeps instead of hanging straight.
      if (curl) j.rotation.x = curl * (0.35 + i / segments);
      previous = j;
    }
    // One smooth surface follows the tail skeleton. Skinning blends the bend
    // between joints, eliminating the bead seams of overlapping spheres.
    parent.updateWorldMatrix(true, true);
    const points = bones.map((bone) =>
      parent.worldToLocal(bone.getWorldPosition(new THREE.Vector3())),
    );
    points.push(parent.worldToLocal(previous.localToWorld(new THREE.Vector3(0, 0, -step))));
    const path = new THREE.CatmullRomCurve3(points);
    const rings = segments * 8;
    const sides = 24;
    const geometry = new THREE.TubeGeometry(path, rings, 1, sides, false);
    const positions = geometry.attributes.position;
    const indices = [];
    const weights = [];
    for (let i = 0; i <= rings; i++) {
      const t = i / rings;
      const center = path.getPointAt(t);
      const taper = plush ? 0.9 + Math.sin(t * Math.PI) * 0.4 : 1 - t * 0.64;
      const tip = t > 0.87 ? Math.sqrt(Math.max(0.0004, 1 - ((t - 0.87) / 0.13) ** 2)) : 1;
      const r = radius * taper * tip;
      const b = Math.min(segments - 1, t * segments);
      const lo = Math.floor(b),
        hi = Math.min(segments - 1, lo + 1),
        mix = b - lo;
      for (let j = 0; j <= sides; j++) {
        const v = i * (sides + 1) + j;
        positions.setXYZ(
          v,
          center.x + (positions.getX(v) - center.x) * r,
          center.y + (positions.getY(v) - center.y) * r,
          center.z + (positions.getZ(v) - center.z) * r,
        );
        indices.push(lo, hi, 0, 0);
        weights.push(1 - mix, mix, 0, 0);
      }
    }
    geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(indices, 4));
    geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
    geometry.computeVertexNormals();
    const tailMesh = new THREE.SkinnedMesh(geometry, tailMat);
    tailMesh.name = 'soft_tail';
    tailMesh.castShadow = species !== 'otter';
    tailMesh.receiveShadow = true;
    // The bounding volume changes as the tail curls; it must not disappear at
    // the edge of the viewport based on its bind-pose bounds.
    tailMesh.frustumCulled = false;
    parent.add(tailMesh);
    parent.updateWorldMatrix(true, true);
    tailMesh.bind(new THREE.Skeleton(bones));
    if (bud) {
      const b = joint('tail_bud', previous, 0, 0, -0.13);
      b.rotation.x = -0.5;
      for (let i = 0; i < 4; i++) {
        const l = joint(`bud_leaf_${i}`, b, 0, 0, 0);
        l.rotation.set(0.35, (i / 4) * TAU, 0);
        leaf(l, { length: 0.28, width: 0.11, mat: mint, inner: false });
      }
      ell(b, 0, 0.15, 0.005, 0.088, 0.14, 0.088, glow);
      ell(b, 0, 0.26, 0.005, 0.045, 0.05, 0.045, pink);
      rig.glows.push(b);
    }
    if (flowerTip) {
      const b = joint('tail_blossom', previous, 0, 0.03, -0.16);
      b.rotation.x = -0.7;
      flower(b, 0.36);
      rig.glows.push(b);
    }
    if (ring) {
      // The golden orbit encircles the tail rather than lying flat on the floor.
      const host = rig.tail[Math.min(rig.tail.length - 1, Math.round(segments * ringAt))];
      const r = new THREE.Mesh(new THREE.TorusGeometry(ringRadius, 0.034, 12, 64), gold);
      r.name = 'orbit_ring';
      r.rotation.set(0.95, 0.18, 0);
      r.position.z = -step * 0.3;
      host.add(r);
      rig.ring = r;
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * TAU + 0.4;
        const spark = ell(
          host,
          Math.cos(a) * ringRadius,
          Math.sin(a) * ringRadius,
          -step * 0.3,
          0.03,
          0.03,
          0.03,
          glow,
        );
        rig.glows.push(spark);
      }
    }
  }
  function dragonWings(torso) {
    for (const sign of [-1, 1]) {
      const wing = joint(`wing_${sign < 0 ? 'l' : 'r'}`, torso, sign * 0.24, 0.16, -0.3);
      wing.rotation.x = -0.32;
      wing.scale.setScalar(0.92);
      rig.wings.push(wing);
      wing.userData.side = sign;
      const s = new THREE.Shape();
      s.moveTo(0, 0);
      s.bezierCurveTo(sign * 0.22, 0.45, sign * 0.65, 0.58, sign * 0.83, 0.2);
      s.quadraticCurveTo(sign * 0.61, 0.28, sign * 0.55, -0.06);
      s.quadraticCurveTo(sign * 0.39, 0.12, sign * 0.27, -0.16);
      s.quadraticCurveTo(sign * 0.13, 0.02, 0, 0);
      const geom = new THREE.ExtrudeGeometry(s, {
        depth: 0.016,
        bevelEnabled: true,
        bevelSize: 0.016,
        bevelThickness: 0.016,
        bevelSegments: 2,
        curveSegments: 12,
      });
      const membrane = material('#b4ecd9', {
        transparent: true,
        opacity: 0.75,
        roughness: 0.3,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geom, membrane);
      wing.add(mesh);
      for (const [x, y] of [
        [0.83, 0.2],
        [0.55, -0.06],
        [0.27, -0.16],
      ])
        tube(
          wing,
          [
            [0, 0, 0.025],
            [sign * x * 0.5, 0.26, 0.025],
            [sign * x, y, 0.025],
          ],
          0.014,
          mint,
        );
    }
  }
  function mothWings(torso) {
    // The cape is a curved shell, not a flat panel. Every wing vertex is wrapped
    // around a vertical cylinder that stands just outside the torso, so the
    // wings sweep from the shoulders round to the sides and read as a cape from
    // the front and the 3/4 as well as from behind.
    const WRAP = 0.62;
    const bendAngle = (x) => x / WRAP;
    const bend = (x, y, z) => {
      const a = bendAngle(x),
        d = WRAP - z;
      return [Math.sin(a) * d, y, WRAP - Math.cos(a) * d];
    };
    const bendGeometry = (geometry) => {
      const pos = geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const [x, y, z] = bend(pos.getX(i), pos.getY(i), pos.getZ(i));
        pos.setXYZ(i, x, y, z);
      }
      pos.needsUpdate = true;
      geometry.computeVertexNormals();
      geometry.computeBoundingSphere();
      return geometry;
    };
    // Extruded caps are triangulated from the outline alone, so bending them
    // straight away creases along a handful of long thin triangles. Tessellate
    // first, then wrap, then re-smooth the normals.
    const tessellate = new TessellateModifier(0.075, 6);
    const draped = (shape, depth) =>
      bendGeometry(
        tessellate.modify(
          new THREE.ExtrudeGeometry(shape, {
            depth,
            bevelEnabled: true,
            bevelSize: depth,
            bevelThickness: depth * 0.6,
            bevelSegments: 4,
            curveSegments: 48,
            steps: 2,
          }),
        ),
      );

    for (const sign of [-1, 1]) {
      // Anchored behind the shoulder so the shell wraps forward around the ribs.
      const wing = joint(`wing_${sign < 0 ? 'l' : 'r'}`, torso, 0, 0.36, -0.2);
      wing.rotation.set(-0.06, 0, 0);
      wing.scale.set(sign * 1.08, 1.08, 1.08);
      wing.userData.side = sign;
      rig.wings.push(wing);
      const dusty = material('#dea6c7', {
        sheen: 1,
        sheenColor: 0xffe4c2,
        roughness: 0.72,
        side: THREE.DoubleSide,
      });
      // Forewing: a soft shoulder lobe with a gently scalloped trailing edge.
      const shape = new THREE.Shape();
      shape.moveTo(0, 0.08);
      shape.bezierCurveTo(0.3, 0.32, 0.8, 0.2, 0.9, -0.2);
      shape.bezierCurveTo(0.92, -0.4, 0.78, -0.5, 0.68, -0.5);
      shape.bezierCurveTo(0.76, -0.44, 0.7, -0.58, 0.52, -0.6);
      shape.bezierCurveTo(0.6, -0.54, 0.52, -0.66, 0.34, -0.66);
      shape.bezierCurveTo(0.42, -0.6, 0.32, -0.7, 0.16, -0.66);
      shape.bezierCurveTo(0.08, -0.5, 0.03, -0.34, 0.02, -0.18);
      shape.quadraticCurveTo(0, -0.04, 0, 0.08);
      const m = new THREE.Mesh(draped(shape, 0.035), dusty);
      m.castShadow = true;
      wing.add(m);
      // Hindwing: a smaller lobe hanging below and slightly behind.
      const hind = new THREE.Shape();
      hind.moveTo(0.05, -0.3);
      hind.bezierCurveTo(0.34, -0.36, 0.6, -0.56, 0.5, -0.88);
      hind.bezierCurveTo(0.46, -0.98, 0.36, -1.0, 0.3, -0.94);
      hind.bezierCurveTo(0.34, -0.86, 0.24, -0.98, 0.14, -0.92);
      hind.bezierCurveTo(0.06, -0.76, 0.05, -0.5, 0.05, -0.3);
      const hm = new THREE.Mesh(draped(hind, 0.03), dusty);
      hm.position.z = -0.03;
      hm.castShadow = true;
      wing.add(hm);

      // Surface detail follows the same wrap so it stays on the cape.
      const on = (x, y, lift) => bend(x, y, lift);
      for (let k = 0; k < 4; k++)
        tube(
          wing,
          [
            on(0.05, 0.02, -0.012),
            on(0.24 + k * 0.11, -0.14 - k * 0.03, -0.014),
            on(0.3 + k * 0.14, -0.4 - k * 0.04, -0.012),
          ],
          0.009,
          cream,
        );
      const eyespot = (lift, rx, ry, mat) => {
        const [x, y, z] = on(0.58, -0.28, lift);
        const e = ell(wing, x, y, z, rx, ry, 0.018, mat);
        e.rotation.y = bendAngle(0.58);
        e.rotation.z = 0.2;
        return e;
      };
      eyespot(-0.018, 0.12, 0.19, accent);
      eyespot(-0.036, 0.07, 0.11, cream);
      eyespot(-0.05, 0.036, 0.058, accent);
      for (let i = 0; i < 10; i++) {
        const a = i * 0.66;
        const px = 0.4 + Math.sin(a) * 0.28;
        const [x, y, z] = on(px, -0.3 + Math.cos(a) * 0.3, -0.016);
        const f = ell(wing, x, y, z, 0.019, 0.026, 0.008, glow);
        f.rotation.y = bendAngle(px);
      }
    }
  }
  let torso, head, skull;
  if (species === 'dragon') {
    // Pocket Dragon: apple-round body, oversized head, ears that flop outward
    // like sails, and a tail that curls up to show off its glowing bud.
    torso = joint('torso', root, 0, 0.6, 0);
    ell(torso, 0, 0, 0, 0.42, 0.4, 0.4);
    ell(torso, 0, -0.06, 0.358, 0.24, 0.23, 0.045, pale);
    head = joint('head', torso, 0, 0.58, 0.05);
    skull = ell(head, 0, 0, 0, 0.6, 0.52, 0.47);
    skull.name = 'skull';
    ell(head, 0, -0.17, 0.27, 0.36, 0.25, 0.26);
    face(head, { width: 0.235, front: 0.4, eyeSize: 1.06, muzzle: 0.12, iris: '#3f8f8d' });
    for (const sign of [-1, 1]) {
      const ear = joint(`ear_${sign < 0 ? 'l' : 'r'}`, head, sign * 0.43, 0.11, -0.05);
      ear.rotation.z = -sign * 1.22;
      ear.rotation.y = -sign * 0.42;
      ear.rotation.x = -0.28;
      rig.ears.push(ear);
      leaf(ear, { length: 0.75, width: 0.31 });
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.062, 0.17, 18), accent);
      horn.position.set(sign * 0.17, 0.5, -0.02);
      horn.rotation.z = -sign * 0.26;
      head.add(horn);
    }
    for (let i = 0; i < 5; i++)
      ell(head, (i - 2) * 0.07, 0.44 + Math.cos(i * 0.9) * 0.025, 0.2, 0.03, 0.038, 0.026, accent);
    paws(
      torso,
      [
        [-0.26, -0.29, 0.22],
        [0.26, -0.29, 0.22],
        [-0.31, -0.26, -0.19],
        [0.31, -0.26, -0.19],
      ],
      0.15,
    );
    dragonWings(torso);
    // A dorsal ridge of little lilac scales — the detail that keeps this
    // silhouette a dragon and not a fennec.
    for (let i = 0; i < 4; i++)
      ell(torso, 0, 0.34 - i * 0.06, -0.14 - i * 0.09, 0.032, 0.055, 0.036, accent);
    // The tail sweeps out and forward along the hip so its glowing bud is
    // actually readable from the front and the 3/4 view.
    const tailRoot = joint('tail_base', torso, 0, -0.2, -0.3);
    tailRoot.rotation.x = 0.28;
    tailRoot.rotation.y = 2.5;
    segmentedTail(tailRoot, { length: 1.2, radius: 0.14, segments: 8, bud: true, curl: 0.07 });
  } else if (species === 'mothkit') {
    const fluff = material(new THREE.Color('#fff1df').lerp(baseColor, 0.24), {
      sheen: 1,
      sheenRoughness: 0.8,
      sheenColor: 0xfff0dc,
    });
    fluff.name = 'soft_coat';
    // Mothkit: a small plush pear of a body almost swallowed by the wing cape,
    // with a very large soft head sitting straight on top of it.
    torso = joint('torso', root, 0, 0.56, 0);
    ell(torso, 0, 0, 0, 0.33, 0.37, 0.3, fluff);
    ell(torso, 0, -0.05, 0.278, 0.23, 0.23, 0.036, pale);
    head = joint('head', torso, 0, 0.54, 0.045);
    skull = ell(head, 0, 0, 0, 0.56, 0.5, 0.42, fluff);
    skull.name = 'skull';
    ell(head, 0, -0.19, 0.28, 0.3, 0.2, 0.19, fluff);
    face(head, { width: 0.215, front: 0.375, eyeSize: 1.04, muzzle: 0.1, iris: '#8b6fb2' });
    for (const sign of [-1, 1]) {
      const ear = joint(`ear_${sign < 0 ? 'l' : 'r'}`, head, sign * 0.4, 0.24, -0.05);
      ear.rotation.z = -sign * 0.74;
      ear.rotation.y = -sign * 0.24;
      rig.ears.push(ear);
      leaf(ear, { length: 0.4, width: 0.3, mat: fluff });
      // Antennae start low on the FOREHEAD, well inside and in front of the ear
      // roots, then arc up and out past the ear line so they read as their own
      // silhouette rather than as part of the ears.
      const ant = joint(`antenna_${sign < 0 ? 'l' : 'r'}`, head, sign * 0.12, 0.26, 0.29);
      rig.antennae.push(ant);
      const stalk = [
        [0, 0, 0],
        [sign * 0.05, 0.24, -0.06],
        [sign * 0.19, 0.46, -0.1],
        [sign * 0.36, 0.62, -0.11],
        [sign * 0.5, 0.68, -0.1],
      ];
      tube(ant, stalk, 0.011, accent);
      // Feathery plume: little angled barbs along the last third of the stalk.
      for (let i = 0; i < 5; i++) {
        const t = i / 4;
        const bx = sign * (0.22 + t * 0.3),
          by = 0.48 + t * 0.2,
          bz = -0.1;
        for (const flip of [-1, 1]) {
          const barb = ell(
            ant,
            bx + sign * 0.015,
            by,
            bz + flip * 0.035,
            0.052 - i * 0.004,
            0.014,
            0.02,
            pink,
          );
          barb.rotation.z = sign * (0.9 - t * 0.5);
          barb.rotation.x = flip * 0.4;
        }
      }
      const tip = ell(ant, sign * 0.53, 0.69, -0.1, 0.07, 0.03, 0.032, pink);
      tip.rotation.z = sign * 0.2;
      for (let i = 0; i < 3; i++) {
        const tuft = ell(
          head,
          sign * (0.44 + i * 0.012),
          -0.14 + i * 0.1,
          -0.02,
          0.09,
          0.055,
          0.115,
          fluff,
        );
        tuft.rotation.z = sign * (0.24 + i * 0.12);
      }
      for (let i = 0; i < 4; i++)
        ell(head, sign * (0.1 + i * 0.06), 0.29 - i * 0.06, 0.345, 0.018, 0.022, 0.009, glow);
    }
    mothWings(torso);
    paws(
      torso,
      [
        [-0.17, -0.3, 0.06],
        [0.17, -0.3, 0.06],
        [-0.24, -0.05, 0.2],
        [0.24, -0.05, 0.2],
      ],
      0.11,
    );
    const tailRoot = joint('tail_base', torso, 0, -0.18, -0.24);
    segmentedTail(tailRoot, { length: 0.45, radius: 0.1, segments: 4, curl: 0.16 });
  } else if (species === 'otter') {
    // Puddle Otter: a teardrop of jelly. No fur seams, no whiskers, no belly
    // patch — just a glassy blob with swirls suspended inside it and a tail
    // that pours away into a liquid curl.
    const swirl = material('#f3a8c8', {
      roughness: 0.2,
      clearcoat: 0.7,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
    });
    const swirl2 = material('#8fe4cd', {
      roughness: 0.2,
      clearcoat: 0.7,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });
    torso = joint('torso', root, 0, 0.55, 0);
    // A single lathed teardrop. Two overlapping spheres each drew their own
    // outline through the glass and the body read as a pile of bubbles.
    const profile = [
      [0.001, -0.42],
      [0.15, -0.41],
      [0.26, -0.35],
      [0.33, -0.22],
      [0.365, -0.04],
      [0.355, 0.14],
      [0.3, 0.28],
      [0.18, 0.38],
      [0.001, 0.42],
    ].map(([x, y]) => new THREE.Vector2(x, y));
    const hull = new THREE.Mesh(new THREE.LatheGeometry(profile, 48), skin);
    hull.scale.z = 0.92;
    hull.receiveShadow = true;
    torso.add(hull);
    head = joint('head', torso, 0, 0.56, 0.04);
    // Skull only: the extra muzzle bump added a second glass silhouette across
    // the face for no read.
    skull = ell(head, 0, 0, 0, 0.5, 0.44, 0.42);
    skull.name = 'skull';
    face(head, { width: 0.2, front: 0.37, eyeSize: 1.02, iris: '#3f8ed0', muzzle: 0.11 });
    for (const sign of [-1, 1]) {
      const ear = joint(`ear_${sign < 0 ? 'l' : 'r'}`, head, sign * 0.36, 0.29, -0.03);
      rig.ears.push(ear);
      ell(ear, 0, 0, 0, 0.125, 0.135, 0.07);
      ell(ear, 0, 0, 0.05, 0.072, 0.08, 0.024, pink);
    }
    paws(
      torso,
      [
        [-0.21, -0.3, 0.14],
        [0.21, -0.3, 0.14],
        [-0.26, -0.16, -0.15],
        [0.26, -0.16, -0.15],
      ],
      0.115,
      null,
      true,
    );
    // Interior colour reads as soft clouds suspended in the jelly, not as
    // organs or a candy-cane noodle.
    for (const [mat, x, y, z, r] of [
      [swirl, 0.03, -0.13, 0.01, 0.12],
      [swirl2, -0.06, 0.03, -0.02, 0.1],
      [swirl, -0.04, 0.15, 0.03, 0.075],
      [swirl2, 0.07, -0.02, -0.05, 0.07],
    ])
      ell(torso, x, y, z, r, r * 0.72, r * 0.92, mat);
    for (let i = 0; i < 6; i++) {
      const bubble = ell(
        torso,
        0.2 * Math.sin(i * 1.9),
        i * 0.1 - 0.24,
        0.24,
        0.028,
        0.028,
        0.028,
        glow,
      );
      rig.glows.push(bubble);
    }
    const tailRoot = joint('tail_base', torso, 0, -0.2, -0.28);
    tailRoot.rotation.x = 0.35;
    segmentedTail(tailRoot, { length: 0.92, radius: 0.185, segments: 5, curl: 0.42 });
    const fin = joint('liquid_fin', rig.tail.at(-1), 0, 0, -0.1);
    fin.rotation.x = -1.45;
    fin.rotation.z = 0.2;
    leaf(fin, { length: 0.3, width: 0.21, mat: skin, inner: false });
    rig.fins.push(fin);
    // The tail trails off into detached droplets rather than stopping dead.
    const tip = rig.tail.at(-1);
    for (let i = 0; i < 3; i++) {
      const r = 0.07 - i * 0.018;
      const drop = ell(
        tip,
        0.02 + i * 0.03,
        0.06 + i * 0.05,
        -0.34 - i * 0.17,
        r,
        r * 1.3,
        r,
        skin,
      );
      rig.glows.push(drop);
    }
  } else if (species === 'imp') {
    // Bloom Imp: low crouching plush body, head tipped up, and enormous
    // sideways leaf ears that carry the whole silhouette.
    torso = joint('torso', root, 0, 0.44, -0.12);
    ell(torso, 0, 0, 0, 0.36, 0.31, 0.44);
    ell(torso, 0, -0.07, 0.21, 0.26, 0.21, 0.23, pale);
    head = joint('head', torso, 0, 0.35, 0.36);
    head.rotation.x = -0.1;
    skull = ell(head, 0, 0, 0, 0.5, 0.44, 0.4);
    skull.name = 'skull';
    ell(head, 0, -0.17, 0.26, 0.28, 0.19, 0.19);
    face(head, { width: 0.2, front: 0.35, eyeSize: 1.02, muzzle: 0.1, iris: '#8e5eb0' });
    for (const sign of [-1, 1]) {
      const ear = joint(`ear_${sign < 0 ? 'l' : 'r'}`, head, sign * 0.3, 0.2, -0.07);
      ear.rotation.z = -sign * 0.92;
      ear.rotation.y = -sign * 0.3;
      ear.rotation.x = -0.2;
      rig.ears.push(ear);
      leaf(ear, { length: 0.92, width: 0.33, veins: true });
      for (let i = 0; i < 4; i++)
        ell(head, sign * (0.13 + i * 0.055), 0.3 - i * 0.07, 0.3, 0.023, 0.015, 0.012, cream);
    }
    paws(
      torso,
      [
        [-0.26, -0.2, 0.26],
        [0.26, -0.2, 0.26],
        [-0.26, -0.2, -0.29],
        [0.26, -0.2, -0.29],
      ],
      0.135,
    );
    const tailRoot = joint('tail_base', torso, 0, 0.1, -0.38);
    tailRoot.rotation.x = 1.42;
    segmentedTail(tailRoot, {
      length: 1.0,
      radius: 0.07,
      segments: 8,
      flowerTip: true,
      curl: -0.055,
    });
    for (let i = 0; i < 6; i++) {
      const tuft = joint(`back_leaf_${i}`, torso, (i % 2 ? 1 : -1) * 0.12, 0.26, -0.15 + i * 0.04);
      tuft.rotation.z = (i % 2 ? 1 : -1) * 0.6;
      leaf(tuft, { length: 0.2, width: 0.068, mat: mint, inner: false });
    }
  } else {
    // Comet Ferret: a long ribbon of a body reared up in an S-curve, tiny
    // tucked legs and a huge plush tail with a golden orbit around it.
    // Comet Ferret: an upright ribbon of a body that leans forward at the
    // shoulders and swings back at the hips, so the silhouette is a tall S
    // rather than another seated quadruped.
    torso = joint('torso', root, 0, 0.88, 0.04);
    // One continuous swept tube rather than stacked spheres — stacked spheres
    // crease at every junction and the ferret reads as a caterpillar.
    const spine = [
      [0, 0.3, 0.2],
      [0, 0.08, 0.11],
      [0, -0.16, 0.0],
      [0, -0.4, -0.16],
      [0, -0.6, -0.42],
    ];
    tube(torso, spine, 0.245, skin);
    ell(torso, 0, 0.28, 0.19, 0.27, 0.27, 0.27);
    ell(torso, 0, -0.58, -0.4, 0.26, 0.26, 0.27);
    ell(torso, 0, 0.12, 0.3, 0.15, 0.25, 0.1, pale);
    head = joint('head', torso, 0, 0.63, 0.28);
    head.rotation.x = 0.08;
    skull = ell(head, 0, 0, 0, 0.44, 0.41, 0.4);
    skull.name = 'skull';
    ell(head, 0, -0.16, 0.28, 0.25, 0.17, 0.18, cream);
    face(head, { width: 0.19, front: 0.37, eyeSize: 0.96, iris: '#6f4fa8', muzzle: 0.1 });
    for (const sign of [-1, 1]) {
      const ear = joint(`ear_${sign < 0 ? 'l' : 'r'}`, head, sign * 0.29, 0.29, -0.04);
      ear.rotation.z = -sign * 0.26;
      rig.ears.push(ear);
      ell(ear, 0, 0, 0, 0.14, 0.15, 0.085);
      ell(ear, 0, 0.005, 0.06, 0.083, 0.09, 0.026, pink);
    }
    // Tiny tucked legs: the front pair folded up on the chest, the back pair
    // barely peeking out from under the hips.
    paws(
      torso,
      [
        [-0.17, 0.1, 0.36],
        [0.17, 0.1, 0.36],
        [-0.2, -0.72, -0.42],
        [0.2, -0.72, -0.42],
      ],
      0.098,
    );
    const tailRoot = joint('tail_base', torso, 0, -0.66, -0.6);
    tailRoot.rotation.x = 0.18;
    segmentedTail(tailRoot, {
      length: 1.35,
      radius: 0.17,
      segments: 8,
      plush: true,
      curl: 0.22,
      ring: true,
      ringAt: 0.72,
      ringRadius: 0.46,
    });
    for (let i = 0; i < 16; i++) {
      const a = i * 2.4;
      const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.026 + (i % 3) * 0.009), glow);
      star.position.set(Math.cos(a) * 0.24, 0.3 - i * 0.06, 0.16 + Math.sin(a) * 0.22 - i * 0.03);
      star.scale.set(0.7, 1.5, 0.6);
      torso.add(star);
      rig.glows.push(star);
    }
  }
  rig.torso = torso;
  rig.head = head;
  // Accessories are sized and placed from the skull ellipsoid rather than from
  // fixed constants, so they clear (halo) or rest on (crown) every head.
  const sx = skull.scale.x,
    sy = skull.scale.y,
    sz = skull.scale.z;
  if (pet.accessory === 'halo') {
    const halo = new THREE.Mesh(new THREE.TorusGeometry(sx * 0.72, sx * 0.05, 12, 64), gold);
    halo.name = 'stardust_halo';
    halo.rotation.x = Math.PI / 2;
    halo.position.y = sy + 0.09;
    head.add(halo);
    rig.halo = halo;
  }
  if (pet.accessory === 'flower') {
    const forward = new THREE.Vector3(0, 0, 1);
    for (let i = 0; i < 5; i++) {
      // Walk a ring of polar coordinates across the top-front of the skull and
      // seat each bloom on the surface, facing along the local normal.
      const phi = (i / 4 - 0.5) * 1.5,
        theta = 0.78;
      const x = sx * Math.sin(theta) * Math.sin(phi),
        y = sy * Math.cos(theta),
        z = sz * Math.sin(theta) * Math.cos(phi);
      const b = joint(`crown_bloom_${i}`, head, x * 1.02, y * 1.02, z * 1.02);
      b.quaternion.setFromUnitVectors(
        forward,
        new THREE.Vector3(x / (sx * sx), y / (sy * sy), z / (sz * sz)).normalize(),
      );
      flower(b, sx * 0.17);
    }
  }
  for (const j of rig.joints) {
    j.userData.restPosition = j.position.toArray();
    j.userData.restRotation = j.rotation.toArray();
    j.userData.restScale = j.scale.toArray();
  }
  poseCreature(root, 0, { moving: 0, action: 'inspect', phase: 0 });
  return root;
}

export function poseCreature(
  root,
  time,
  { moving = 0, action = 'inspect', phase = 0, reducedMotion = false } = {},
) {
  const r = root.rig;
  if (!r) return;
  for (const j of r.joints) {
    j.position.fromArray(j.userData.restPosition);
    j.rotation.fromArray(j.userData.restRotation);
    j.scale.fromArray(j.userData.restScale);
  }
  const quiet = reducedMotion ? 0.2 : 1,
    walk = moving * quiet,
    cycle = time * (r.species === 'ferret' ? 12 : 10),
    happy = action === 'cuddle' ? Math.sin(Math.PI * Math.min(1, phase)) : 0,
    trick = action === 'trick' ? Math.sin(Math.PI * Math.min(1, phase)) : 0;
  const breathing = Math.sin(time * 2) * 0.012 * quiet;
  r.torso.scale.y = 1 + breathing;
  r.torso.position.y += Math.abs(Math.sin(cycle)) * walk * 0.065;
  r.torso.rotation.z = Math.sin(cycle * 0.5) * walk * 0.055;
  r.head.rotation.y = Math.sin(time * 1.25) * 0.1 * quiet;
  r.head.rotation.z = Math.sin(time * 1.6) * 0.035 * quiet + happy * 0.17;
  r.head.rotation.x = action === 'inspect' ? Math.sin(time * 0.9) * 0.06 * quiet : 0;
  if (r.mouth) {
    r.mouth.scale.y = 0.22 + happy * 0.9 + trick * 0.3;
    r.mouth.rotation.z = Math.sin(time * 1.7) * 0.035;
  }
  r.legs.forEach((leg, i) => {
    const offset = i === 0 || i === 3 ? 0 : Math.PI;
    leg.rotation.x += Math.sin(cycle + offset) * walk * 0.65;
    leg.position.y += Math.max(0, Math.cos(cycle + offset)) * walk * 0.055;
  });
  r.ears.forEach((ear, i) => {
    ear.rotation.z += Math.sin(time * 2.3 + i) * 0.055 * quiet;
    ear.rotation.x += Math.sin(cycle) * walk * 0.07 + happy * 0.14;
  });
  r.antennae.forEach((a, i) => (a.rotation.z += Math.sin(time * 2 + i) * 0.075 * quiet));
  const blink = time % 4.7 > 4.51 ? Math.max(0.08, Math.abs(((time % 4.7) - 4.6) / 0.09)) : 1;
  const smile = THREE.MathUtils.smoothstep(happy, 0.45, 0.8);
  r.eyes.forEach((eye) => {
    eye.scale.multiplyScalar(1 - smile * 0.99);
    eye.scale.y *= Math.min(1, blink);
    eye.position.z -= smile * 0.08;
  });
  r.lids.forEach((lid) => {
    lid.scale.setScalar(0.001 + smile * 0.999);
    lid.position.z -= (1 - smile) * 0.08;
  });
  r.tail.forEach((tail, i) => {
    const wave = Math.sin(time * 3 - i * 0.48) * 0.09 * quiet;
    tail.rotation.y += 0.045 + wave + Math.sin(cycle * 0.55 - i * 0.4) * walk * 0.055;
    tail.rotation.x += r.species === 'imp' ? 0.22 : r.species === 'ferret' ? -0.035 : 0.025;
    if (r.species === 'otter') tail.rotation.x += Math.sin(time * 3.2 - i * 0.5) * 0.08 * quiet;
    tail.rotation.y += happy * Math.sin(time * 13 - i * 0.3) * 0.07;
  });
  r.wings.forEach((wing) => {
    // Additive so each species keeps the swept rest pose it was modelled with.
    const side = wing.userData.side;
    wing.rotation.y += side * (0.2 + Math.sin(time * 2) * 0.07 * quiet);
    wing.rotation.z += side * Math.sin(cycle) * walk * 0.06;
  });
  if (r.halo) r.halo.rotation.z = Math.sin(time) * 0.09;
  if (r.ring) {
    r.ring.rotation.x = 0.95 + Math.sin(time * 1.3) * 0.18;
    r.ring.rotation.y = time * 0.4;
  }
  // Each species has a distinct full-body signature instead of a shared bounce.
  if (r.species === 'dragon') {
    r.wings.forEach((w) => {
      w.rotation.y += w.userData.side * Math.sin(time * 22) * trick * 0.85;
    });
    r.torso.position.y += trick * (0.26 + Math.abs(Math.sin(time * 9)) * 0.13);
    r.legs.forEach((leg, i) => {
      if (i > 1) leg.rotation.z += (i === 2 ? 1 : -1) * (happy * 0.7 + trick * 0.4);
    });
  } else if (r.species === 'mothkit') {
    r.wings.forEach((w) => {
      w.rotation.y += w.userData.side * (Math.sin(time * 17) * trick * 0.6 - happy * 0.38);
      w.rotation.z -= w.userData.side * trick * 0.23;
    });
    r.torso.position.y += trick * 0.28;
    r.head.rotation.z += trick * 0.1;
  } else if (r.species === 'otter') {
    const slide = trick;
    r.torso.scale.set(1 + slide * 0.18, 1 - slide * 0.24, 1 + slide * 0.15);
    r.torso.rotation.x = -slide * 0.65;
    r.torso.position.y -= slide * 0.1;
    r.head.rotation.x += slide * 0.38;
    r.legs.forEach((leg, i) => {
      leg.rotation.z += (i % 2 ? 1 : -1) * slide * 0.55;
    });
  } else if (r.species === 'imp') {
    r.torso.position.y += Math.abs(Math.sin(cycle * 0.65)) * walk * 0.1;
    const sneeze = trick * Math.sin(phase * Math.PI * 6);
    r.head.rotation.x += sneeze * 0.2;
    r.ears.forEach((ear) => (ear.rotation.x += sneeze * 0.26));
    r.tail.forEach((tail, i) => (tail.rotation.z += Math.sin(time * 8 - i) * trick * 0.065));
  } else {
    r.torso.rotation.y += Math.sin(time * 4) * walk * 0.15;
    r.tail.forEach((tail, i) => {
      tail.rotation.y += trick * 0.27 + Math.sin(cycle * 0.65 - i * 0.6) * walk * 0.09;
    });
    r.torso.rotation.y += trick * 1.05;
    r.head.rotation.y -= trick * 0.65;
  }
  r.torso.position.y += happy * Math.abs(Math.sin(time * 7)) * 0.075 * quiet;
}

export function creatureClips(root) {
  const result = [];
  for (const [name, duration, moving, action] of [
    ['Idle', 4.7, 0, 'inspect'],
    ['Walk', 2, 1, 'walk'],
    ['Signature', 3.6, 0, 'trick'],
    ['Affection', 2.4, 0, 'cuddle'],
  ]) {
    const frames = Math.ceil(duration * 24),
      times = [],
      tracks = [],
      values = new Map();
    for (const j of root.rig.joints) values.set(j.name, { p: [], q: [], s: [] });
    for (let frame = 0; frame <= frames; frame++) {
      const t = (frame / frames) * duration;
      times.push(t);
      poseCreature(root, t, { moving, action, phase: t / duration });
      for (const j of root.rig.joints) {
        const v = values.get(j.name);
        v.p.push(...j.position.toArray());
        v.q.push(...j.quaternion.toArray());
        v.s.push(...j.scale.toArray());
      }
    }
    for (const [name, v] of values) {
      tracks.push(
        new THREE.VectorKeyframeTrack(`${name}.position`, times, v.p),
        new THREE.QuaternionKeyframeTrack(`${name}.quaternion`, times, v.q),
        new THREE.VectorKeyframeTrack(`${name}.scale`, times, v.s),
      );
    }
    result.push(new THREE.AnimationClip(name, duration, tracks));
  }
  poseCreature(root, 0);
  return result;
}
export function disposeCreature(group) {
  const geometries = new Set(),
    materials = new Set();
  group.traverse((o) => {
    if (o.skeleton) o.skeleton.dispose();
    if (o.geometry) geometries.add(o.geometry);
    if (o.material)
      (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => materials.add(m));
  });
  geometries.forEach((g) => g.dispose());
  materials.forEach((m) => m.dispose());
}
