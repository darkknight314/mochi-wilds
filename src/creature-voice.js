// Original little creature performances. A breathy harmonic source passes
// through moving vowel resonances; syllables have pauses and an expressive
// pitch arch, rather than a sequence of straight electronic frequency sweeps.
const CHARACTERS = {
  dragon: { pitch: 390, vowel: [820, 1450], breath: 0.035, purr: 0.07, rhythm: [0.22, 0.38, 0.24] },
  mothkit: { pitch: 310, vowel: [540, 1150], breath: 0.065, purr: 0.2, rhythm: [0.39, 0.3] },
  otter: { pitch: 455, vowel: [650, 1300], breath: 0.025, purr: 0.04, rhythm: [0.16, 0.2, 0.37] },
  imp: { pitch: 520, vowel: [1050, 1900], breath: 0.055, purr: 0.03, rhythm: [0.13, 0.18, 0.3] },
  ferret: { pitch: 430, vowel: [730, 1700], breath: 0.04, purr: 0.09, rhythm: [0.24, 0.18, 0.34] },
};
export function renderCreatureVoice(species, kind, sampleRate) {
  const character = CHARACTERS[species];
  if (!character || !['hello', 'happy'].includes(kind)) throw new Error('Unknown creature voice');
  const happy = kind === 'happy';
  const syllables = [];
  let cursor = 0.025;
  const rhythm = happy ? [...character.rhythm, 0.25] : character.rhythm;
  rhythm.forEach((length, i) => {
    syllables.push({
      start: cursor,
      length,
      pitch: character.pitch * (1 + (i % 3) * 0.085 + (happy ? 0.1 : 0)),
    });
    cursor += length + (happy ? 0.045 : 0.095);
  });
  const samples = new Float32Array(Math.ceil((cursor + 0.1) * sampleRate));
  let seed = 71 + character.pitch,
    breath = 0;
  syllables.forEach(({ start, length, pitch }, index) => {
    let phase = 0,
      filtered = 0;
    for (let i = 0; i < Math.floor(length * sampleRate); i++) {
      const t = i / sampleRate,
        u = t / length;
      const arch = Math.sin(Math.PI * u);
      const ending = index === syllables.length - 1;
      const frequency =
        pitch *
        (0.91 + arch * (happy ? 0.24 : 0.18) + (ending ? -0.12 : 0.07) * u) *
        (1 + 0.009 * Math.sin(t * 39 + index) + 0.004 * Math.sin(t * 93));
      phase += (Math.PI * 2 * frequency) / sampleRate;
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      breath = breath * 0.78 + ((seed / 4294967296) * 2 - 1) * 0.22;
      const formant1 = character.vowel[0] * (0.7 + arch * 0.45);
      const formant2 = character.vowel[1] * (1.08 - u * 0.2);
      let signal = 0;
      for (let h = 1; h <= 12 && frequency * h < sampleRate * 0.45; h++) {
        const f = frequency * h;
        const resonance =
          0.22 +
          1.5 * Math.exp(-(((f - formant1) / 290) ** 2)) +
          0.55 * Math.exp(-(((f - formant2) / 420) ** 2));
        signal += (Math.sin(phase * h) * resonance) / h ** 1.55;
      }
      const attack = Math.min(1, t / 0.028);
      const release = Math.min(1, (length - t) / 0.07);
      const envelope = attack * release * arch ** 0.6;
      signal *= 1 - character.purr + character.purr * Math.sin(t * 2 * Math.PI * 24);
      signal += breath * character.breath * (1 + (1 - arch) * 2);
      // A gentle low-pass rounds off the high harmonics, especially on phones.
      filtered += (signal - filtered) * 0.56;
      samples[Math.floor(start * sampleRate) + i] +=
        Math.tanh(filtered * 1.2) * envelope * (ending ? 0.39 : 0.46);
    }
  });
  return { samples, sampleRate };
}
