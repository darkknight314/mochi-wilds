import { CREATURES } from './creatures.js';
const limit = (n, a, b) => Math.max(a, Math.min(b, n));
const smooth = (t) => t * t * (3 - 2 * t);
const shortest = (a) => Math.atan2(Math.sin(a), Math.cos(a));
// The garden platform is an ellipse. Nothing may ever walk off it.
export const BOUNDS = { x: 1.05, z: 0.48 };
// A backgrounded tab hands back an enormous delta on resume. Clamp it so a
// creature resumes where it stood instead of teleporting across the garden.
export const MAX_DELTA = 0.25;
export function boundedTarget(x, z) {
  x = limit(Number.isFinite(x) ? x : 0, -BOUNDS.x, BOUNDS.x);
  z = limit(Number.isFinite(z) ? z : 0, -BOUNDS.z, BOUNDS.z);
  const radius = Math.hypot(x / BOUNDS.x, z / BOUNDS.z);
  if (radius > 1) {
    x /= radius;
    z /= radius;
  }
  return { x, z };
}
/**
 * Where a creature is allowed to be. The garden is a fixed ellipse; AR swaps in
 * a strategy backed by the real room (see `room-bounds.js`). The controller
 * only ever asks a strategy to clamp a point, suggest somewhere to go, and say
 * how high the ground is there — it never learns which kind it has.
 */
export const ELLIPSE_BOUNDS = {
  clamp: (x, z) => boundedTarget(x, z),
  heightAt: () => 0,
  // Skewed toward the front of the shallow platform, so trips more often end
  // heading toward the player than away from them.
  wanderTarget(random, profile) {
    const a = random();
    const b = random() ** 0.45;
    return {
      x: (a - 0.5) * 2 * BOUNDS.x * profile.reach,
      z: (b - 0.5) * 2 * BOUNDS.z * profile.reach,
    };
  },
};
// Speeds are metres per second, turn rates radians per second: every value here
// is a rate, never a per-frame increment, so 30fps and 120fps agree.
export const MOTION_PROFILES = {
  // scampers in bursts, then tries a short flying hop
  dragon: {
    speed: 0.52,
    turn: 5.5,
    stride: 10,
    pause: 1.3,
    tricks: 3,
    weave: 1,
    wobble: 0.05,
    reach: 0.95,
    hop: 1,
  },
  // tiptoes, drifts, lingers to flutter its wing cape
  mothkit: {
    speed: 0.31,
    turn: 3.6,
    stride: 7,
    pause: 2.1,
    tricks: 2,
    weave: 2,
    wobble: 0.09,
    reach: 0.7,
    hop: 0.55,
  },
  // waddles in short hops, belly-slides
  otter: {
    speed: 0.39,
    turn: 4.2,
    stride: 8.5,
    pause: 1.7,
    tricks: 3,
    weave: 1,
    wobble: 0.12,
    reach: 0.85,
    hop: 0.3,
  },
  // bounds across the meadow hunting for treasure
  imp: {
    speed: 0.6,
    turn: 6.5,
    stride: 11.5,
    pause: 1,
    tricks: 2,
    weave: 3,
    wobble: 0.06,
    reach: 1,
    hop: 0.8,
  },
  // weaves, somersaults, chases its own orbital tail
  ferret: {
    speed: 0.74,
    turn: 7.5,
    stride: 13,
    pause: 0.85,
    tricks: 4,
    weave: 4,
    wobble: 0.15,
    reach: 1,
    hop: 0.45,
  },
};
export const profileOf = (species) => MOTION_PROFILES[species] || MOTION_PROFILES.dragon;
// Time-based locomotion, independent of rendering. World placement belongs to the AR anchor.
export class WanderController {
  constructor(species, { roam = true, reducedMotion = false, bounds = ELLIPSE_BOUNDS } = {}) {
    this.species = Object.hasOwn(CREATURES, species) ? species : 'dragon';
    this.profile = profileOf(this.species);
    this.roam = roam;
    this.bounds = bounds || ELLIPSE_BOUNDS;
    this.reducedMotion = reducedMotion;
    this.time = 0;
    this.x = 0;
    this.z = 0;
    this.yaw = 0.2;
    this.heading = 0.2;
    this.yawFrom = 0.2;
    this.yawTo = 0.2;
    this.gait = 0;
    this.moving = 0;
    this.elapsed = 0;
    this.trip = 0;
    this.seed = [...this.species].reduce((n, c) => n + c.charCodeAt(0), 67);
    this.state = 'inspect';
    this.duration = 1.2;
    this.activity = 'Taking in the little world';
    this.from = { x: 0, z: 0 };
    this.target = { x: 0, z: 0 };
    // Ground height under the creature. Always 0 in the garden; in a real room
    // it steps up onto tables and drops back to the floor.
    this.y = 0;
    this.fromY = 0;
    this.targetY = 0;
    this.face = null;
    this.call = false;
    this.affectionCount = 0;
    this.variant = 0;
  }
  random() {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }
  get speed() {
    return this.profile.speed * (this.reducedMotion ? 0.62 : 1);
  }
  // Walk toward a point. Large heading changes pivot first, so the creature
  // turns to face where it is going instead of snapping or moon-walking.
  goTo(x, z, called = false, detail = null) {
    this.from = { x: this.x, z: this.z };
    this.target = this.bounds.clamp(x, z, detail?.surface);
    this.call = called;
    this.fromY = this.y;
    this.targetY = detail?.y ?? this.bounds.heightAt(this.target.x, this.target.z, detail?.surface);
    this.face = detail?.face ?? null;
    this.activity = called
      ? 'Coming to say hello'
      : (detail?.activity ?? CREATURES[this.species].motion);
    const previous = this.heading;
    this.heading = Math.atan2(this.target.x - this.from.x, this.target.z - this.from.z);
    // The pivot is decided from the committed heading, never from the smoothed
    // facing, so the schedule cannot drift with the frame rate.
    const angle = shortest(this.heading - previous);
    if (Math.abs(angle) > 0.6) {
      this.state = 'turn';
      this.elapsed = 0;
      this.duration = limit(Math.abs(angle) / this.profile.turn, 0.16, 1.1);
      this.yawFrom = this.yaw;
      this.yawTo = this.yaw + shortest(this.heading - this.yaw);
    } else this.beginWalk();
    return this;
  }
  beginWalk() {
    this.state = 'walk';
    this.elapsed = 0;
    const distance = Math.hypot(this.target.x - this.x, this.target.z - this.z);
    this.duration = Math.max(0.9, distance / this.speed);
  }
  // The camera looks down +Z, so a yaw near zero is eye contact. A resting
  // creature mostly looks at its person — that is where all the face is — but
  // still glances around the meadow often enough to feel alive.
  gaze(spread = 1.03, wander = 0.41) {
    // The wide branch is a real look away — it can end up side-on or behind.
    if (this.random() < wander) return (this.random() - 0.5) * 5.1;
    return (this.random() - 0.5) * 2 * spread;
  }
  // A pause to look around and inspect the little world.
  inspect(duration = this.profile.pause, activity = 'Found something interesting') {
    this.state = 'inspect';
    this.elapsed = 0;
    this.duration = duration;
    this.activity = activity;
    this.yawTo = this.gaze();
  }
  react() {
    this.variant = this.affectionCount++ % 3;
    this.state = 'cuddle';
    this.elapsed = 0;
    this.duration = 3.2;
    this.activity = 'That is the spot!';
    // Affection is always given face to face.
    this.yawTo = this.gaze(0.3, 0);
  }
  peekaboo() {
    this.state = 'peekaboo';
    this.elapsed = 0;
    this.duration = 3.4;
    this.activity = 'Where did I go? … Here I am!';
    this.yawTo = 0;
  }
  // The per-species signature move. Fires on its own and on demand.
  trick() {
    this.state = 'trick';
    this.elapsed = 0;
    this.duration = 3.6;
    this.activity = CREATURES[this.species].trick;
    // Show off to someone: mostly toward the player.
    this.yawTo = this.gaze(0.45, 0.08);
  }
  comeHere(x = 0, z = BOUNDS.z * 0.62) {
    return this.goTo(x, z, true);
  }
  wanderTarget() {
    return this.bounds.wanderTarget(() => this.random(), this.profile, {
      x: this.x,
      z: this.z,
      y: this.y,
    });
  }
  // One state transition. The leftover time is carried into the next state so
  // the schedule depends on elapsed seconds, never on where frames landed.
  advance() {
    const carry = this.elapsed - this.duration;
    if (this.state === 'turn') {
      // Land exactly on the committed facing and destination, so the next state
      // starts from the same place no matter where the last frame fell.
      this.yaw = this.yawTo;
      this.beginWalk();
    } else if (this.state === 'walk') {
      this.x = this.target.x;
      this.z = this.target.z;
      this.y = this.targetY;
      this.trip++;
      if (this.call) {
        this.call = false;
        this.react();
      } else this.inspect();
    } else if (!this.roam) {
      this.inspect(5, 'Just happy to be here with you');
      this.yawTo = this.gaze(0.2, 0);
    } else if (
      this.state === 'inspect' &&
      this.trip % this.profile.tricks === this.profile.tricks - 1
    )
      this.trick();
    else {
      const spot = this.wanderTarget();
      this.goTo(spot.x, spot.z, false, spot);
    }
    this.elapsed = carry;
  }
  update(dt) {
    dt = limit(Number.isFinite(dt) ? dt : 0, 0, MAX_DELTA);
    this.time += dt;
    this.elapsed += dt;
    let guard = 0;
    while (this.elapsed >= this.duration && guard++ < 16) this.advance();
    if (!(this.elapsed >= 0)) this.elapsed = 0;
    const phase = limit(this.duration > 0 ? this.elapsed / this.duration : 0, 0, 1);
    let moving = 0,
      targetYaw = this.yaw;
    if (this.state === 'turn') {
      // Closed form: the pivot reads the same at any frame rate.
      this.yaw = this.yawFrom + (this.yawTo - this.yawFrom) * smooth(phase);
      targetYaw = this.yaw;
      moving = 0.15 * smooth(phase);
    } else if (this.state === 'walk') {
      const u = smooth(phase);
      const dx = this.target.x - this.from.x,
        dz = this.target.z - this.from.z;
      const length = Math.hypot(dx, dz) || 1;
      // A species-flavoured weave across the straight line, faded in and out.
      const sway =
        Math.sin(phase * Math.PI * this.profile.weave) *
        this.profile.wobble *
        Math.sin(Math.PI * phase) *
        (this.reducedMotion ? 0.35 : 1);
      const spot = this.bounds.clamp(
        this.from.x + dx * u - (dz / length) * sway,
        this.from.z + dz * u + (dx / length) * sway,
        // Mid-step the creature may be between two real surfaces, so the
        // strategy is told where it set out from as well as where it is going.
        this.target.surface,
        this.from.surface,
      );
      this.x = spot.x;
      this.z = spot.z;
      this.y = this.fromY + (this.targetY - this.fromY) * u;
      const remaining = Math.hypot(this.target.x - this.x, this.target.z - this.z);
      // Facing is a function of position only, so it is frame-rate independent.
      targetYaw =
        remaining > 0.05
          ? Math.atan2(this.target.x - this.x, this.target.z - this.z)
          : this.heading;
      moving = Math.min(1, Math.sin(Math.PI * phase) * 1.4);
    } else if (this.state === 'inspect' && this.face)
      // The room asked for a specific facing — looking out over a real edge.
      targetYaw = Math.atan2(this.face.x, this.face.z);
    else targetYaw = this.yawTo; // resting, cuddling or showing off: hold the chosen gaze
    if (this.state !== 'turn') {
      // Exponential easing composes exactly across differently sized steps.
      const angle = shortest(targetYaw - this.yaw);
      this.yaw += angle * (1 - Math.exp(-dt * this.profile.turn));
    }
    this.moving = moving;
    this.gait += dt * this.profile.stride * (0.35 + moving);
    const energy = this.reducedMotion ? 0 : 1;
    const lift =
      this.state === 'trick'
        ? Math.sin(Math.PI * phase) ** 2 * this.profile.hop * 0.16 * energy
        : 0;
    return {
      time: this.time,
      x: this.x,
      z: this.z,
      y: this.y,
      yaw: this.yaw,
      moving,
      gait: this.gait,
      lift,
      speed: this.speed,
      energy,
      action: this.state,
      variant: this.variant,
      phase,
      target: this.target,
      activity: this.activity,
      reducedMotion: this.reducedMotion,
    };
  }
}
