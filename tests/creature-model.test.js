import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  createCreature,
  poseCreature,
  creatureClips,
  disposeCreature,
} from '../src/creature-model.js';
import { CREATURES } from '../src/creatures.js';

const SPECIES = Object.keys(CREATURES);

/** The skull ellipsoid, which every species names, is the reference for
 * proportion and accessory checks. */
function skullOf(root) {
  const skull = root.rig.head.getObjectByName('skull');
  assert.ok(skull, `${root.rig.species} must have a named skull mesh`);
  return skull;
}

/** Torso volume from the torso's own meshes only — the head, legs and tail
 * joints hang off it and would swallow the measurement. */
function bodyBox(root) {
  const box = new THREE.Box3();
  for (const child of root.rig.torso.children) if (child.isMesh) box.expandByObject(child);
  return box.getSize(new THREE.Vector3());
}

function meshCount(root) {
  let n = 0;
  root.traverse((o) => {
    if (o.isMesh) n++;
  });
  return n;
}

test('every species builds an articulated rig with no errors', () => {
  for (const species of SPECIES) {
    const root = createCreature({ species, color: 'lilac' });
    assert.equal(root.userData.species, species);
    assert.ok(root.rig.torso && root.rig.head, `${species} needs a torso and head joint`);
    assert.equal(root.rig.legs.length, 4, `${species} needs four paws`);
    assert.ok(root.rig.tail.length > 0, `${species} needs an articulated tail`);
    assert.equal(root.rig.eyes.length, 2, `${species} needs two eyes`);
    assert.ok(root.rig.mouth, `${species} needs a mouth joint`);
    assert.ok(
      meshCount(root) > 40,
      `${species} should be built from real geometry, not a placeholder`,
    );
    poseCreature(root, 1.3, { moving: 1, action: 'walk', phase: 0.4 });
    disposeCreature(root);
  }
});

test('each species carries its own signature features', () => {
  const of = (species) => createCreature({ species, color: 'lilac' });
  const dragon = of('dragon'),
    mothkit = of('mothkit'),
    otter = of('otter'),
    imp = of('imp'),
    ferret = of('ferret');

  // Wings belong to the dragon and the mothkit only.
  assert.equal(dragon.rig.wings.length, 2, 'dragon needs two wings');
  assert.equal(mothkit.rig.wings.length, 2, 'mothkit needs its wing cape');
  for (const [name, root] of [
    ['otter', otter],
    ['imp', imp],
    ['ferret', ferret],
  ])
    assert.equal(root.rig.wings.length, 0, `${name} must not have wings`);

  // Antennae are the mothkit's alone.
  assert.equal(mothkit.rig.antennae.length, 2, 'mothkit needs curved antennae');
  for (const root of [dragon, otter, imp, ferret]) assert.equal(root.rig.antennae.length, 0);

  // The otter is the only one with a liquid tail fin, and it rides the tip.
  assert.equal(otter.rig.fins.length, 1, 'otter needs its liquid tail fin');
  assert.equal(otter.rig.fins[0].parent, otter.rig.tail.at(-1), 'the fin rides the tail tip');
  for (const root of [dragon, mothkit, imp, ferret]) assert.equal(root.rig.fins.length, 0);

  // Ferret orbit ring: a real torus that encircles the tail.
  assert.ok(ferret.rig.ring, 'ferret needs an orbital ring');
  assert.equal(ferret.rig.ring.geometry.type, 'TorusGeometry');
  assert.ok(
    ferret.rig.tail.includes(ferret.rig.ring.parent),
    'the orbit ring must be parented to a tail joint',
  );
  for (const root of [dragon, mothkit, otter, imp]) assert.equal(root.rig.ring, undefined);

  // Leaf ears retain visible veins and a padded surface through the redesign.
  assert.equal(imp.rig.ears.length, 2);
  for (const ear of imp.rig.ears) {
    const pad = ear.children.find((c) => c.isMesh && c.geometry.attributes.color);
    const veins = ear.children.filter((c) => c.isMesh && c.geometry.type === 'TubeGeometry');
    assert.ok(pad && veins.length >= 3, 'each imp ear needs a soft pad and branching veins');
    pad.geometry.computeBoundingBox();
    assert.ok(
      pad.geometry.boundingBox.max.z - pad.geometry.boundingBox.min.z > 0.12,
      'the ear has volume',
    );
  }

  // Flowering tails: a glowing bud on the dragon, a bloom on the imp.
  assert.ok(dragon.rig.glows.length > 0, 'dragon needs its glowing tail bud');
  assert.ok(
    dragon.rig.joints.some((j) => j.name === 'tail_bud'),
    'dragon tail must end in a bud joint',
  );
  assert.ok(
    imp.rig.joints.some((j) => j.name === 'tail_blossom'),
    'imp tail must end in a blossom joint',
  );
});

// Distinctness and cuteness are reviewed in rendered close-ups. Bounding-box
// ratios cannot distinguish a dragon's wings from an imp's leafy ears.
test('continuous tails bend with their skeleton and have normalized skin weights', () => {
  for (const species of SPECIES) {
    const root = createCreature({ species, color: 'lilac' });
    const tail = root.getObjectByName('soft_tail');
    assert.ok(tail.isSkinnedMesh);
    const weights = tail.geometry.attributes.skinWeight;
    for (let i = 0; i < weights.count; i++) {
      assert.ok(
        Math.abs(weights.getX(i) + weights.getY(i) + weights.getZ(i) + weights.getW(i) - 1) < 1e-6,
      );
    }
    root.updateMatrixWorld(true);
    tail.skeleton.update();
    const samples = [];
    for (let i = 0; i < weights.count; i += 20)
      samples.push([i, tail.getVertexPosition(i, new THREE.Vector3())]);
    poseCreature(root, 1.7, { action: 'cuddle', phase: 0.5 });
    root.updateMatrixWorld(true);
    tail.skeleton.update();
    let displacement = 0;
    for (const [i, before] of samples) {
      const after = tail.getVertexPosition(i, new THREE.Vector3());
      assert.ok(after.toArray().every(Number.isFinite));
      displacement = Math.max(displacement, before.distanceTo(after));
    }
    assert.ok(displacement > 0.01, `${species} tail must actually bend`);
    disposeCreature(root);
  }
});

test('every head is oversized relative to its body — the cute-proportion rule', () => {
  for (const species of SPECIES) {
    const root = createCreature({ species, color: 'lilac' });
    const skull = skullOf(root);
    const body = bodyBox(root);
    const headMax = 2 * Math.max(skull.scale.x, skull.scale.y, skull.scale.z);
    // Girth = the two slimmest body axes, so a long species (the ferret) is not
    // rewarded for merely being long.
    const dims = [body.x, body.y, body.z].sort((a, b) => a - b);
    const girth = (dims[0] + dims[1]) / 2;
    const ratio = headMax / girth;
    assert.ok(
      ratio >= 1.0,
      `${species} head is too small for its body (head/girth ${ratio.toFixed(2)})`,
    );
    assert.ok(ratio <= 2.6, `${species} head is comically oversized (${ratio.toFixed(2)})`);
  }
});

test('eyes are large, close-set, glossy and symmetrical on every species', () => {
  for (const species of SPECIES) {
    const root = createCreature({ species, color: 'lilac' });
    const skull = skullOf(root);
    const [left, right] = root.rig.eyes;
    const sclera = left.children.find((c) => c.isMesh);
    const eyeWidth = 2 * sclera.scale.x * left.scale.x;
    const eyeHeight = 2 * sclera.scale.y * left.scale.y;

    // Mirrored placement — no lopsided faces.
    assert.ok(
      Math.abs(left.position.x + right.position.x) < 1e-9,
      `${species} eyes are not mirrored`,
    );
    assert.ok(Math.abs(left.position.y - right.position.y) < 1e-9);
    assert.ok(eyeHeight > eyeWidth, `${species} eyes should be taller than wide`);

    // Big: each eye spans a serious share of the face.
    const share = eyeWidth / (2 * skull.scale.x);
    assert.ok(share >= 0.26, `${species} eyes are too small (${share.toFixed(3)} of face width)`);
    assert.ok(share <= 0.5, `${species} eyes swamp the face (${share.toFixed(3)})`);

    // Close-set: centres less than ~1.7 eye-widths apart.
    const separation = Math.abs(left.position.x - right.position.x) / eyeWidth;
    assert.ok(
      separation >= 0.9 && separation <= 1.7,
      `${species} eyes are not in the cute separation range (${separation.toFixed(2)} eye-widths)`,
    );

    // Catchlights: at least two bright specks so the eye reads glossy.
    const sparkles = left.children.filter((c) => c.isMesh && c.scale.x < 0.06);
    assert.ok(sparkles.length >= 2, `${species} eyes need catchlights`);
  }
});

test('poseCreature stays finite for every species, action and phase', () => {
  for (const species of SPECIES) {
    const root = createCreature({ species, color: 'lilac' });
    for (const action of ['inspect', 'walk', 'trick', 'cuddle', 'peekaboo'])
      for (let step = 0; step <= 12; step++) {
        const phase = step / 12,
          time = phase * 5.3;
        for (const moving of [0, 0.5, 1])
          for (const reducedMotion of [false, true]) {
            poseCreature(root, time, { moving, action, phase, reducedMotion });
            root.updateMatrixWorld(true);
            root.traverse((o) => {
              for (const v of o.matrixWorld.elements)
                assert.ok(
                  Number.isFinite(v),
                  `${species}/${action} phase ${phase} produced a non-finite transform on ${o.name || o.type}`,
                );
              assert.ok(
                Number.isFinite(o.scale.x) && o.scale.x !== 0,
                `${species}/${action} collapsed a scale`,
              );
            });
          }
      }
  }
});

test('signature animation clips are generated for every species without throwing', () => {
  for (const species of SPECIES) {
    const root = createCreature({ species, color: 'lilac' });
    const clips = creatureClips(root);
    assert.deepEqual(
      clips.map((c) => c.name),
      ['Idle', 'Walk', 'Signature', 'Affection'],
    );
    for (const clip of clips) {
      assert.ok(clip.tracks.length > 0, `${species} ${clip.name} has tracks`);
      for (const track of clip.tracks)
        assert.ok(
          track.values.every((v) => Number.isFinite(v)),
          `${species} ${clip.name} baked a non-finite value into ${track.name}`,
        );
    }
  }
});

test('affection varies its lean, settles, and respects reduced motion', () => {
  for (const species of SPECIES) {
    const root = createCreature({ species, color: 'peach' });
    poseCreature(root, 1.6, { action: 'cuddle', phase: 0.5, variant: 0 });
    const left = root.rig.head.rotation.z;
    poseCreature(root, 1.6, { action: 'cuddle', phase: 0.5, variant: 1 });
    const right = root.rig.head.rotation.z;
    assert.ok(left - right > 0.35, `${species} responds with different nuzzles`);
    poseCreature(root, 1.6, { action: 'cuddle', phase: 0.5, reducedMotion: true });
    assert.ok(Math.abs(root.rig.head.rotation.z) < Math.abs(left) * 0.3);
    poseCreature(root, 3.2, { action: 'cuddle', phase: 1 });
    assert.ok(Math.abs(root.rig.head.rotation.z) < 0.001, `${species} settles after affection`);
    disposeCreature(root);
  }
});

test('the halo clears every skull instead of cutting through it', () => {
  for (const species of SPECIES) {
    const root = createCreature({ species, color: 'lilac', accessory: 'halo' });
    const halo = root.rig.halo;
    assert.ok(halo, `${species} should accept a halo accessory`);
    const skull = skullOf(root);
    const { x: sx, y: sy, z: sz } = skull.scale;
    const ringRadius = halo.geometry.parameters.radius,
      tubeRadius = halo.geometry.parameters.tube;

    // Height of the skull surface under the ring, measured where the skull is
    // widest — the worst case for a ring that lives inside its footprint.
    const ratio = Math.min(1, ringRadius / Math.max(sx, sz));
    const surfaceY = sy * Math.sqrt(1 - ratio * ratio);
    const clearance = halo.position.y - tubeRadius - surfaceY;
    assert.ok(
      clearance > 0.02,
      `${species} halo intersects the skull (clearance ${clearance.toFixed(3)})`,
    );
    // Still a halo, not a hoop the size of the whole pet.
    assert.ok(ringRadius > sx * 0.5 && ringRadius < sx * 1.2, `${species} halo is mis-scaled`);
  }
});

test('the bloom crown rests on the skull surface on every species', () => {
  for (const species of SPECIES) {
    const root = createCreature({ species, color: 'lilac', accessory: 'flower' });
    const skull = skullOf(root);
    const { x: sx, y: sy, z: sz } = skull.scale;
    const blooms = root.rig.joints.filter((j) => j.name.startsWith('crown_bloom_'));
    assert.equal(blooms.length, 5, `${species} should wear five blooms`);
    for (const bloom of blooms) {
      const { x, y, z } = bloom.position;
      // 1 is exactly on the skull surface; below buries the bloom, well above
      // leaves it floating.
      const surface = (x / sx) ** 2 + (y / sy) ** 2 + (z / sz) ** 2;
      assert.ok(
        surface >= 1.0 && surface <= 1.2,
        `${species} ${bloom.name} is not seated on the skull (${surface.toFixed(3)})`,
      );
      assert.ok(y > 0, `${species} ${bloom.name} should sit on the upper skull`);
      assert.ok(bloom.children.length > 0, `${species} ${bloom.name} has no petals`);
    }
  }
});

test('accessories never break construction or posing', () => {
  for (const species of SPECIES)
    for (const accessory of ['halo', 'flower']) {
      const root = createCreature({ species, color: 'lilac', accessory });
      poseCreature(root, 2.2, { moving: 1, action: 'trick', phase: 0.7 });
      root.updateMatrixWorld(true);
      root.traverse((o) => {
        for (const v of o.matrixWorld.elements) assert.ok(Number.isFinite(v));
      });
      disposeCreature(root);
    }
});
