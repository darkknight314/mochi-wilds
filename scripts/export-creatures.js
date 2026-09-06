import { mkdir, writeFile } from 'node:fs/promises';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { createCreature, creatureClips, disposeCreature } from '../src/creature-model.js';
import { CREATURES } from '../src/creatures.js';

// GLTFExporter only needs these Blob reads in Node; no browser or GPU needed.
globalThis.FileReader ??= class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((result) => {
      this.result = result;
      this.onloadend?.();
    });
  }
  readAsDataURL(blob) {
    blob.arrayBuffer().then((result) => {
      this.result = `data:${blob.type};base64,${Buffer.from(result).toString('base64')}`;
      this.onloadend?.();
    });
  }
};
const output = new URL('../public/assets/models/', import.meta.url);
await mkdir(output, { recursive: true });
for (const [species, c] of Object.entries(CREATURES)) {
  const model = createCreature({ species, color: c.color });
  const clips = creatureClips(model);
  const data = await new GLTFExporter().parseAsync(model, { binary: true, animations: clips });
  await writeFile(new URL(`${species}.glb`, output), Buffer.from(data));
  disposeCreature(model);
  console.log(
    `${c.name}: ${(data.byteLength / 1024).toFixed(0)} KB, ${clips.length} animation clips`,
  );
}
