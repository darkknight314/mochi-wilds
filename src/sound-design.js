import { renderCreatureVoice } from './creature-voice.js';
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
  if (name.includes('-')) {
    const [species, kind] = name.split('-');
    return renderCreatureVoice(species, kind, sampleRate);
  }
  const events = [];
  const tone = (start, duration, from, to = from, gain = 0.3, wobble = 0, harmonic = 0.08) =>
    events.push({ start, duration, from, to, gain, wobble, harmonic });
  const noise = (start, duration, gain, flutter = 0) =>
    events.push({ start, duration, gain, flutter, noise: true });
  const bells = (notes, start = 0, step = 0.1, gain = 0.23) =>
    notes.forEach((f, i) => tone(start + i * step, 0.42, f, f, gain, 0, 0.2));
  switch (name) {
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
