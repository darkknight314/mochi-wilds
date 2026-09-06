import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SOUND_NAMES, renderSound } from '../src/sound-design.js';
import { CREATURES } from '../src/creatures.js';
import {
  SOUND_LIBRARY,
  VOICE_CUES,
  cueFor,
  cooldownFor,
  CueLimiter,
  MAX_VOICES,
} from '../src/audio.js';
test('all generated effects have headroom, soft boundaries, and playable PCM WAV files', async () => {
  for (const name of SOUND_NAMES) {
    const { samples, sampleRate } = renderSound(name);
    assert.ok(samples.length / sampleRate > 0.05 && samples.length / sampleRate < 2, name);
    assert.ok(samples.every(Number.isFinite), name);
    assert.ok(
      samples.some((s) => Math.abs(s) > 0.01),
      `${name} must be audible`,
    );
    assert.ok(
      samples.every((s) => Math.abs(s) <= 0.721),
      `${name} must have mixing headroom`,
    );
    assert.equal(samples[0], 0);
    assert.equal(samples.at(-1), 0);
    const wav = await readFile(new URL(`../public/assets/sounds/${name}.wav`, import.meta.url));
    assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
    assert.equal(wav.toString('ascii', 8, 12), 'WAVE');
    assert.equal(wav.readUInt32LE(24), sampleRate);
    assert.equal(wav.length, 44 + samples.length * 2);
  }
});
test('creature voices are distinct and unknown cues are rejected', () => {
  const fingerprints = SOUND_NAMES.filter((n) => n.endsWith('-hello')).map((n) =>
    Buffer.from(renderSound(n).samples.buffer).toString('base64'),
  );
  assert.equal(new Set(fingerprints).size, 5);
  assert.throws(() => renderSound('missing'));
});
test('the player ships exactly the effects the generator renders', () => {
  assert.deepEqual([...SOUND_LIBRARY].sort(), [...SOUND_NAMES].sort());
});
test('every species is wired to its own hello and happy voice', () => {
  const cues = [];
  for (const [species, creature] of Object.entries(CREATURES)) {
    assert.equal(cueFor(species, 'hello'), `${creature.voice}-hello`);
    assert.equal(cueFor(species, 'happy'), `${creature.voice}-happy`);
    assert.equal(cueFor({ species }, 'happy'), `${creature.voice}-happy`);
    assert.ok(SOUND_LIBRARY.includes(VOICE_CUES[species].hello));
    assert.ok(SOUND_LIBRARY.includes(VOICE_CUES[species].happy));
    cues.push(VOICE_CUES[species].hello, VOICE_CUES[species].happy);
  }
  assert.equal(new Set(cues).size, 10, 'no two creatures share a voice');
});
test('unknown species and cues are rejected instead of playing something random', () => {
  for (const bad of ['unicorn', '', null, undefined, 42, {}, '../../etc/passwd'])
    assert.equal(cueFor(bad, 'hello'), null);
  for (const kind of ['angry', '', 'constructor', 'toString'])
    assert.equal(cueFor('dragon', kind), null);
  const limiter = new CueLimiter();
  assert.equal(limiter.allow('dragon-yodel', 0), false);
  assert.equal(limiter.allow('../secret', 0), false);
  assert.equal(limiter.allow('', 0), false);
});
test('the rate limiter suppresses machine-gun taps but lets cues return', () => {
  const limiter = new CueLimiter();
  assert.equal(limiter.allow('dragon-happy', 0), true);
  // A flurry of rapid taps must not become a flurry of sounds.
  let played = 0;
  for (let ms = 10; ms <= 500; ms += 10) if (limiter.allow('dragon-happy', ms)) played++;
  assert.equal(played, 0, 'repeat plays inside the cooldown are suppressed');
  assert.equal(limiter.allow('dragon-happy', 700), true, 'and the cue returns after it expires');
  // Different cues are limited independently, but never all at the same instant.
  assert.equal(limiter.allow('tap', 700), false, 'no two sounds fire in the same instant');
  assert.equal(limiter.allow('tap', 780), true);
  assert.ok(cooldownFor('dragon-hello') > cooldownFor('dragon-happy'));
  assert.ok(cooldownFor('tap') < cooldownFor('hop'));
  assert.equal(cooldownFor('bloom'), cooldownFor('reward'));
  assert.ok(MAX_VOICES >= 2 && MAX_VOICES <= 8, 'concurrent voices stay capped');
  limiter.reset();
  assert.equal(limiter.allow('dragon-happy', 705), true, 'a fresh session starts clean');
});
