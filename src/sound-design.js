// Original procedural foley. Shared by the asset generator and signal tests.
// Times are seconds; frequencies are Hz. Gentle envelopes avoid clicks.
export const SOUND_NAMES = [
  'dragon-hello',
  'dragon-happy',
  'mothkit-hello',
  'mothkit-happy',
  'otter-hello',
  'otter-happy',
  'imp-hello',
  'imp-happy',
  'ferret-hello',
  'ferret-happy',
  'cuddle',
  'hop',
  'spark',
  'bloom',
  'bubble',
  'reward',
  'purchase',
  'snapshot',
  'tap',
];
export function renderSound(name, sampleRate = 22050) {
  if (!SOUND_NAMES.includes(name)) throw new Error(`Unknown sound: ${name}`);
  const events = [];
  // Tiny vowel colours turn the creature calls into soft voices. Their pitch
  // gestures stay different, while a moving formant adds a little "woo / ee".
  const voice = {
    dragon: [720, 1250, 0.18],
    mothkit: [440, 900, 0.12],
    otter: [600, 1100, 0.14],
    imp: [1250, 1800, 0.16],
    ferret: [900, 1550, 0.13],
  }[name.split('-')[0]];
  const tone = (start, duration, from, to = from, gain = 0.3, wobble = 0, harmonic = 0.08) =>
    events.push({ start, duration, from, to, gain, wobble, harmonic });
  const noise = (start, duration, gain, flutter = 0) =>
    events.push({ start, duration, gain, flutter, noise: true });
  const bells = (notes, start = 0, step = 0.1, gain = 0.23) =>
    notes.forEach((f, i) => tone(start + i * step, 0.42, f, f, gain, 0, 0.2));
  switch (name) {
    case 'dragon-hello':
      tone(0, 0.2, 430, 870, 0.42, 20, 0.2);
      tone(0.24, 0.24, 660, 460, 0.3, 13, 0.12);
      break;
    case 'dragon-happy':
      [0, 0.16, 0.33].forEach((t, i) => tone(t, 0.17, 520 + i * 90, 1000 + i * 90, 0.28, 35, 0.15));
      tone(0.5, 0.23, 1000, 580, 0.25, 18);
      break;
    case 'mothkit-hello':
      tone(0, 0.65, 185, 220, 0.4, 24, 0.22);
      tone(0.15, 0.3, 620, 800, 0.12, 12);
      noise(0.1, 0.55, 0.04, 25);
      break;
    case 'mothkit-happy':
      tone(0, 0.85, 170, 200, 0.35, 28, 0.28);
      [0.05, 0.25, 0.45].forEach((t) => noise(t, 0.19, 0.08, 32));
      bells([880, 1174], 0.22, 0.15, 0.09);
      break;
    case 'otter-hello':
      [0, 0.14, 0.32].forEach((t, i) => tone(t, 0.14, 750 + i * 120, 180 + i * 70, 0.36));
      tone(0.5, 0.22, 420, 840, 0.2, 16);
      break;
    case 'otter-happy':
      [0, 0.12, 0.25, 0.4, 0.56].forEach((t, i) => tone(t, 0.18, 420 + i * 140, 140 + i * 35, 0.3));
      noise(0.02, 0.55, 0.035, 12);
      break;
    case 'imp-hello':
      tone(0, 0.12, 750, 1150, 0.28, 22, 0.2);
      tone(0.17, 0.13, 900, 1300, 0.25, 30, 0.16);
      tone(0.38, 0.17, 1100, 620, 0.22, 15);
      noise(0.37, 0.14, 0.04, 0);
      break;
    case 'imp-happy':
      [0, 0.14, 0.3, 0.48].forEach((t, i) =>
        tone(t, 0.13, 680 + i * 90, 1080 + i * 75, 0.26, 35, 0.22),
      );
      noise(0.6, 0.17, 0.07, 35);
      break;
    case 'ferret-hello':
      tone(0, 0.3, 480, 1180, 0.3, 14);
      tone(0.34, 0.28, 1180, 740, 0.22, 22);
      bells([1480], 0.5, 0.1, 0.06);
      break;
    case 'ferret-happy':
      tone(0, 0.4, 450, 1450, 0.25, 25);
      bells([988, 1174, 1480, 1976], 0.25, 0.11, 0.12);
      break;
    case 'cuddle':
      tone(0, 0.55, 190, 240, 0.35, 23, 0.17);
      tone(0.06, 0.21, 520, 850, 0.2, 20);
      tone(0.3, 0.24, 780, 480, 0.2, 14);
      break;
    case 'hop':
      tone(0, 0.12, 320, 720, 0.22);
      tone(0.08, 0.12, 250, 120, 0.15);
      break;
    case 'spark':
      tone(0, 0.2, 450, 1450, 0.17, 30, 0.15);
      bells([1174, 1568], 0.07, 0.07, 0.16);
      break;
    case 'bloom':
      bells([523, 659, 880], 0, 0.1, 0.2);
      noise(0.1, 0.3, 0.025, 18);
      break;
    case 'bubble':
      [0, 0.1, 0.21].forEach((t, i) => tone(t, 0.14, 850 + i * 170, 160 + i * 100, 0.28));
      break;
    case 'reward':
      bells([523, 659, 784, 1047], 0, 0.12, 0.23);
      bells([1318, 1568], 0.47, 0.13, 0.12);
      break;
    case 'purchase':
      bells([659, 988, 1318, 1568], 0, 0.095, 0.22);
      tone(0.42, 0.4, 1047, 1047, 0.13);
      break;
    case 'snapshot':
      noise(0, 0.025, 0.14);
      tone(0.035, 0.12, 1200, 780, 0.1);
      break;
    case 'tap':
      tone(0, 0.065, 700, 420, 0.12);
      break;
  }
  const duration = Math.max(...events.map((e) => e.start + e.duration)) + 0.06;
  const samples = new Float32Array(Math.ceil(sampleRate * duration));
  let seed = 18361,
    smoothed = 0;
  for (const e of events) {
    let phase = 0;
    const start = Math.floor(e.start * sampleRate),
      count = Math.floor(e.duration * sampleRate);
    for (let i = 0; i < count; i++) {
      const t = i / sampleRate,
        u = i / count;
      const envelope = Math.sin(Math.PI * u) ** 1.5 * Math.min(1, t / 0.012);
      let signal;
      if (e.noise) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        smoothed = smoothed * 0.74 + ((seed / 4294967296) * 2 - 1) * 0.26;
        signal = smoothed * (e.flutter ? 0.5 + 0.5 * Math.sin(t * e.flutter * Math.PI * 2) : 1);
      } else {
        const f = e.from * (e.to / e.from) ** u;
        phase += (Math.PI * 2 * (f + Math.sin(t * 2 * Math.PI * 8) * e.wobble)) / sampleRate;
        signal = Math.sin(phase) + e.harmonic * Math.sin(phase * 2);
        if (voice) {
          const formant = voice[0] + (voice[1] - voice[0]) * Math.sin(u * Math.PI);
          for (let h = 2; h <= 5; h++) {
            const presence = Math.exp(-(((f * h - formant) / 650) ** 2));
            signal += (Math.sin(phase * h) * presence * voice[2]) / Math.sqrt(h);
          }
          // A slight breath pulse keeps repeated chirps from sounding like an
          // alert sequence, without adding harsh high-frequency noise.
          signal *= 0.92 + 0.08 * Math.sin(t * Math.PI * 2 * 5);
        }
        // Low voices have a soft purring amplitude modulation.
        if (e.from < 250) signal *= 0.65 + 0.35 * Math.sin(t * Math.PI * 2 * 26);
      }
      samples[start + i] += signal * envelope * e.gain;
    }
  }
  // Leave headroom for overlapping game cues. Never normalize quiet foley upwards.
  const peak = samples.reduce((max, s) => Math.max(max, Math.abs(s)), 0);
  if (peak > 0.72) for (let i = 0; i < samples.length; i++) samples[i] *= 0.72 / peak;
  return { samples, sampleRate };
}
