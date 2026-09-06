import { mkdir, writeFile } from 'node:fs/promises';
import { SOUND_NAMES, renderSound } from '../src/sound-design.js';
const destination = new URL('../public/assets/sounds/', import.meta.url);
await mkdir(destination, { recursive: true });
for (const name of SOUND_NAMES) {
  const { samples, sampleRate } = renderSound(name);
  const wav = Buffer.alloc(44 + samples.length * 2);
  wav.write('RIFF');
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((s, i) => wav.writeInt16LE(Math.round(s * 32767), 44 + i * 2));
  await writeFile(new URL(`${name}.wav`, destination), wav);
}
console.log(`Generated ${SOUND_NAMES.length} original WAV sound effects.`);
