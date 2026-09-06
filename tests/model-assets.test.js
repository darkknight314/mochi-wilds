import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { AnimationMixer } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CREATURES } from '../src/creatures.js';
import { disposeCreature } from '../src/creature-model.js';

test('every downloadable GLB loads with a working skeleton and four playable animations', async () => {
  for (const species of Object.keys(CREATURES)) {
    const data = await readFile(new URL(`../public/assets/models/${species}.glb`, import.meta.url));
    const gltf = await new GLTFLoader().parseAsync(
      data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
      '',
    );
    const root = gltf.scene.getObjectByName(`mochi_${species}`);
    assert.equal(root.userData.assetVersion, 3);
    const tail = root.getObjectByName('soft_tail');
    assert.ok(tail?.isSkinnedMesh && tail.skeleton.bones.length >= 4);
    assert.deepEqual(
      gltf.animations.map((clip) => clip.name),
      ['Idle', 'Walk', 'Signature', 'Affection'],
    );
    const mixer = new AnimationMixer(gltf.scene);
    for (const clip of gltf.animations) {
      mixer.stopAllAction();
      mixer.clipAction(clip).play();
      mixer.setTime(clip.duration * 0.4);
      gltf.scene.updateMatrixWorld(true);
      gltf.scene.traverse((object) =>
        assert.ok(object.matrixWorld.elements.every(Number.isFinite)),
      );
    }
    mixer.stopAllAction();
    mixer.uncacheRoot(gltf.scene);
    disposeCreature(gltf.scene);
  }
});
