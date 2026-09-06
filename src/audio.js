import { CREATURES } from './creatures.js';
const KEY = 'mochi-audio-v1';
// Kept in step with SOUND_NAMES in sound-design.js (a test asserts they match).
// Declared here so the app bundle never has to ship the offline synthesiser.
export const SOUND_LIBRARY = [
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
export const VOICE_KINDS = ['hello', 'happy'];
// hello: greeting, first appearance, species selection.
// happy: affection, tap reactions, successful interactions.
export const VOICE_CUES = Object.fromEntries(
  Object.entries(CREATURES).map(([species, creature]) => [
    species,
    Object.fromEntries(VOICE_KINDS.map((kind) => [kind, `${creature.voice}-${kind}`])),
  ]),
);
export function cueFor(species, kind = 'hello') {
  const name = typeof species === 'string' ? species : species?.species;
  if (typeof name !== 'string' || !Object.hasOwn(VOICE_CUES, name)) return null;
  if (!VOICE_KINDS.includes(kind)) return null;
  return VOICE_CUES[name][kind];
}
// Cooldowns are milliseconds. A greeting should never machine-gun; a footstep
// may repeat quickly. Everything else shares a comfortable default.
export const CUE_COOLDOWNS = { hello: 1400, happy: 600, tap: 120, hop: 380, snapshot: 500 };
export const DEFAULT_COOLDOWN = 220;
export const MAX_VOICES = 4;
export function cooldownFor(name = '') {
  const kind = name.includes('-') ? name.slice(name.indexOf('-') + 1) : name;
  return CUE_COOLDOWNS[kind] ?? CUE_COOLDOWNS[name] ?? DEFAULT_COOLDOWN;
}
// Pure, testable rate limiter: one cooldown per cue plus a floor between any
// two sounds, so a flurry of taps stays a flurry of taps and not a wall of noise.
export class CueLimiter {
  constructor({ floor = 45 } = {}) {
    this.floor = floor;
    this.last = new Map();
    this.lastAny = -Infinity;
  }
  allow(name, now = 0) {
    if (!SOUND_LIBRARY.includes(name)) return false;
    if (now - this.lastAny < this.floor) return false;
    if (now - (this.last.get(name) ?? -Infinity) < cooldownFor(name)) return false;
    this.last.set(name, now);
    this.lastAny = now;
    return true;
  }
  reset() {
    this.last.clear();
    this.lastAny = -Infinity;
  }
}
export class SoundEngine {
  constructor() {
    let stored;
    try {
      stored = JSON.parse(localStorage.getItem(KEY));
    } catch {}
    this.enabled = stored?.enabled !== false;
    this.volume =
      typeof stored?.volume === 'number' && Number.isFinite(stored.volume)
        ? Math.min(1, Math.max(0, stored.volume))
        : 0.45;
    this.context = null;
    this.buffers = new Map();
    this.voices = new Set();
    this.limiter = new CueLimiter();
    this.generation = 0;
  }
  persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify({ enabled: this.enabled, volume: this.volume }));
    } catch {}
  }
  async unlock() {
    if (!this.enabled || document.hidden) return false;
    try {
      if (!this.context) {
        const Context = window.AudioContext || window.webkitAudioContext;
        if (!Context) return false;
        this.context = new Context();
        this.master = this.context.createGain();
        this.master.gain.value = this.volume;
        this.master.connect(this.context.destination);
      }
      if (this.context.state === 'suspended') await this.context.resume();
      return this.context.state === 'running';
    } catch {
      return false;
    }
  }
  async buffer(name) {
    if (!/^[a-z-]+$/.test(name)) throw new Error('Invalid sound name');
    if (!this.buffers.has(name)) {
      const pending = fetch(`/assets/sounds/${name}.wav`)
        .then((r) => {
          if (!r.ok) throw new Error('Sound unavailable');
          return r.arrayBuffer();
        })
        .then((data) => this.context.decodeAudioData(data));
      this.buffers.set(name, pending);
      pending.catch(() => this.buffers.delete(name));
    }
    return this.buffers.get(name);
  }
  async play(name = 'reward', { pitch = 1 } = {}) {
    const generation = this.generation;
    if (!this.enabled || !SOUND_LIBRARY.includes(name)) return false;
    if (!(await this.unlock())) return false;
    if (!this.limiter.allow(name, performance.now())) return false;
    try {
      const buffer = await this.buffer(name);
      if (!this.enabled || document.hidden || generation !== this.generation) return false;
      while (this.voices.size >= MAX_VOICES) {
        const oldest = this.voices.values().next().value;
        oldest.stop();
        this.voices.delete(oldest);
      }
      const voice = this.context.createBufferSource();
      voice.buffer = buffer;
      voice.playbackRate.value = Math.min(1.2, Math.max(0.8, pitch));
      voice.connect(this.master);
      this.voices.add(voice);
      voice.onended = () => {
        this.voices.delete(voice);
        voice.disconnect();
      };
      voice.start();
      return true;
    } catch {
      return false;
    }
  }
  // Play a creature's own voice. Unknown species or cue kinds are ignored.
  playVoice(species, kind = 'hello', options) {
    const cue = cueFor(species, kind);
    return cue ? this.play(cue, options) : Promise.resolve(false);
  }
  setVolume(value) {
    if (!Number.isFinite(value)) return;
    this.volume = Math.min(1, Math.max(0, value));
    if (this.master) this.master.gain.setTargetAtTime(this.volume, this.context.currentTime, 0.025);
    this.persist();
  }
  setEnabled(value) {
    this.enabled = !!value;
    if (!this.enabled) this.stop();
    this.persist();
  }
  stop() {
    this.generation++;
    for (const voice of this.voices) {
      try {
        voice.stop();
      } catch {}
    }
    this.voices.clear();
    this.limiter.reset();
  }
  suspend() {
    this.stop();
    this.context?.suspend().catch(() => {});
  }
  // Coming back from the background: the context resumes on its own, and the
  // limiter starts clean so the first cue after a return is always heard.
  resume() {
    this.limiter.reset();
    if (!this.enabled) return Promise.resolve(false);
    return this.unlock();
  }
  // Silence in the background: browser tab visibility and the Capacitor /
  // Cordova native app lifecycle both route here.
  bindLifecycle(target = globalThis) {
    if (this.bound || !target?.document?.addEventListener) return () => {};
    this.bound = true;
    const off = [];
    const onVisibility = () => {
      if (target.document.hidden) this.suspend();
      else void this.resume();
    };
    target.document.addEventListener('visibilitychange', onVisibility);
    off.push(() => target.document.removeEventListener('visibilitychange', onVisibility));
    const pause = () => this.suspend();
    const resume = () => void this.resume();
    target.document.addEventListener('pause', pause);
    target.document.addEventListener('resume', resume);
    off.push(() => {
      target.document.removeEventListener('pause', pause);
      target.document.removeEventListener('resume', resume);
    });
    const app = target.Capacitor?.Plugins?.App;
    const handle = app?.addListener?.('appStateChange', ({ isActive }) =>
      isActive ? void this.resume() : this.suspend(),
    );
    Promise.resolve(handle)
      .then((h) => off.push(() => h?.remove?.()))
      .catch(() => {});
    return () => {
      this.bound = false;
      off.forEach((fn) => fn());
    };
  }
}
export const audio = new SoundEngine();
audio.bindLifecycle();
