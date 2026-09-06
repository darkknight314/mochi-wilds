// Live creature gallery. One shared WebGL renderer paints five scissored viewports,
// so the page never opens more than a single GL context (phones cap out around 8-16).
const statusEl = document.getElementById('lab-status');
const galleryEl = document.getElementById('gallery');

const ORDER = ['dragon', 'mothkit', 'otter', 'imp', 'ferret'];
const TINT = {
  dragon: '#f4d8cb',
  mothkit: '#e8dcf2',
  otter: '#d3ebf4',
  imp: '#dcead0',
  ferret: '#e2dcf5',
};
const STATES = {
  idle: { label: 'Idle', action: 'inspect', moving: 0 },
  walk: { label: 'Scamper', action: 'walk', moving: 1 },
  trick: { label: 'Signature', action: 'trick', moving: 0, duration: 3.6 },
  cuddle: { label: 'Affection', action: 'cuddle', moving: 0, duration: 2.4 },
};
const DEFAULT_VIEW = { yaw: 0.58, pitch: 0.16, zoom: 1 };

// This file is served straight out of /public, so Vite never rewrites its imports.
// Read the transformed model module to discover the exact three.js URL it is using and
// reuse it, which keeps a single three instance alive for renderer + geometry.
async function loadThree() {
  try {
    const source = await (await fetch('/src/creature-model.js')).text();
    const url = source.match(/from\s*["']([^"']*three[^"']*)["']/)?.[1];
    if (url) return await import(url);
  } catch {
    /* fall through to the static path below */
  }
  return await import('/node_modules/three/build/three.module.js');
}

// The roster is a plain data module, so the voice auditions can come up before —
// and independently of — anything WebGL.
const { CREATURES } = await import('/src/creatures.js');

/* ---------- one shared player for auditions and animation cues ---------- */
// Both paths run through this single element, so a voice audition and a signature
// move can never talk over each other.
const audio = new Audio();
audio.preload = 'auto';
audio.volume = 0.45;
const audioStatus = document.getElementById('audio-status');
let playingButton = null;

function stopSound(message) {
  audio.pause();
  audio.currentTime = 0;
  playingButton?.classList.remove('playing');
  playingButton = null;
  if (message) audioStatus.textContent = message;
}

async function playSound(name, { button = null, label = '' } = {}) {
  stopSound();
  playingButton = button;
  button?.classList.add('playing');
  audio.src = `/assets/sounds/${name}.wav`;
  if (label) audioStatus.textContent = `Playing: ${label}`;
  try {
    await audio.play();
    return true;
  } catch (error) {
    if (error.name !== 'AbortError') {
      button?.classList.remove('playing');
      if (label) audioStatus.textContent = 'Could not play the sound. Tap to try again.';
    }
    return false;
  }
}
audio.onended = () => {
  playingButton?.classList.remove('playing');
  playingButton = null;
  if (audioStatus.textContent.startsWith('Playing:'))
    audioStatus.textContent = 'Ready for another little voice.';
};
audio.onerror = () => {
  playingButton?.classList.remove('playing');
  playingButton = null;
  audioStatus.textContent = 'Sound unavailable. Please reload and try again.';
};

/* ---------- voice auditions ---------- */
const VOICE_NOTES = {
  dragon: 'Warm, wobbly squeaks and excited little hiccups.',
  mothkit: 'A tiny vibrating purr with soft, papery wing flutters.',
  otter: 'Bubbly greetings, liquid plips, and squishy giggles.',
  imp: 'Playful chirrup-chirrups and a tiny leafy sneeze.',
  ferret: 'Sliding star whistles and a twinkly, delighted trill.',
};
const HAPPY_LABEL = {
  dragon: '♡ Happy squeaks',
  mothkit: '♡ Purr & flutter',
  otter: '♡ Bubble giggle',
  imp: '♡ Petal sneeze',
  ferret: '♡ Comet trill',
};
const FOLEY = [
  ['cuddle', '♡ Cuddle'],
  ['hop', '▷ Tiny hop'],
  ['spark', '✧ Spark'],
  ['bloom', '❀ Bloom'],
  ['bubble', '○ Bubble'],
  ['reward', '☆ Reward'],
  ['purchase', '◇ New treasure'],
  ['snapshot', '▣ Snapshot'],
  ['tap', '· Button tap'],
];
const rosterEl = document.getElementById('roster');
const ORDER_KEYS = ['dragon', 'mothkit', 'otter', 'imp', 'ferret'];
rosterEl.innerHTML = ORDER_KEYS.map(
  (species, i) => `
  <article style="--accent: ${TINT[species]}">
    <span class="number">0${i + 1}</span>
    <h3>${CREATURES[species].name}</h3>
    <p>${VOICE_NOTES[species]}</p>
    <div>
      <button data-sound="${species}-hello" type="button">▷ Say hello</button
      ><button data-sound="${species}-happy" type="button">${HAPPY_LABEL[species]}</button>
    </div>
  </article>`,
).join('');
document.getElementById('foley-buttons').innerHTML = FOLEY.map(
  ([name, label]) => `<button data-sound="${name}" type="button">${label}</button>`,
).join('');

document.querySelectorAll('[data-sound]').forEach((button) => {
  button.onclick = () => {
    const who = button.closest('article')?.querySelector('h3')?.textContent || 'Everyday magic';
    playSound(button.dataset.sound, { button, label: `${who} · ${button.textContent}` });
  };
});
const volume = document.getElementById('volume');
volume.oninput = () => {
  audio.volume = Number(volume.value) / 100;
  document.getElementById('volume-value').textContent = `${volume.value}%`;
};
document.getElementById('stop').onclick = () => stopSound('Sound stopped.');
document.addEventListener('visibilitychange', () => {
  if (document.hidden) stopSound();
});

/* ---------- 3D gallery ---------- */
const [THREE, model] = await Promise.all([loadThree(), import('/src/creature-model.js')]).catch(
  (error) => {
    statusEl.textContent = 'Could not load the 3D models. Is the dev server running?';
    throw error;
  },
);
const { createCreature, poseCreature } = model;

const canvas = document.getElementById('stage-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
renderer.setClearColor(0x000000, 0);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

const systemReduced = matchMedia('(prefers-reduced-motion: reduce)');

const app = {
  paused: false,
  speed: 1,
  sound: false,
  reduced: systemReduced.matches,
};

// A soft round contact shadow: cheaper and gentler than five shadow maps a frame.
function shadowTexture() {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(104, 84, 118, 0.42)');
  g.addColorStop(0.55, 'rgba(104, 84, 118, 0.16)');
  g.addColorStop(1, 'rgba(104, 84, 118, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
const shadowMap = shadowTexture();

function buildScene(species) {
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#fff4e5', '#aba0be', 2.1));
  const key = new THREE.DirectionalLight('#ffeddc', 3.1);
  key.position.set(-3, 6, 5);
  scene.add(key);
  const rim = new THREE.DirectionalLight('#e0d5ff', 1.7);
  rim.position.set(4, 3, -3);
  scene.add(rim);
  const creature = createCreature({ species, color: CREATURES[species].color });
  scene.add(creature);
  // Frame each creature from its own resting bounds: the ferret is long and low,
  // the dragon is tall and winged, so one fixed camera distance suits neither.
  const box = new THREE.Box3().setFromObject(creature);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const ball = box.getBoundingSphere(new THREE.Sphere());
  const puddle = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: shadowMap, transparent: true, depthWrite: false }),
  );
  puddle.rotation.x = -Math.PI / 2;
  puddle.position.y = 0.006;
  puddle.scale.setScalar(Math.max(1.7, ball.radius * 2.4));
  scene.add(puddle);
  return {
    scene,
    creature,
    puddle,
    focus: center.y,
    radius: ball.radius,
    // Half-extents the framing has to clear: height, and the widest span it can
    // present while the viewer spins it around the vertical axis.
    half: { y: size.y / 2, x: Math.max(size.x, size.z) / 2 },
  };
}

function card(species, index) {
  const info = CREATURES[species];
  const article = document.createElement('article');
  article.className = 'creature';
  article.style.setProperty('--accent', TINT[species]);
  article.innerHTML = `
    <span class="number">0${index + 1}</span>
    <h2>${info.name}</h2>
    <p class="trait">${info.trait}</p>
    <div class="stage" data-species="${species}" tabindex="0" role="img"
      aria-label="Live 3D model of ${info.name}. Drag to rotate.">
      <span class="hint">drag to rotate</span>
    </div>
    <p class="now"><span class="dot"></span><span class="now-text">${info.motion}</span></p>
    <div class="acts" role="group" aria-label="${info.name} animations">
      <button data-state="idle" type="button">Idle</button
      ><button data-state="walk" type="button">Scamper</button
      ><button data-state="trick" type="button" class="wide">✦ ${info.trick}</button
      ><button data-state="cuddle" type="button">♡ Affection</button
      ><button data-view="reset" type="button">⟲ View</button>
    </div>`;
  return article;
}

const views = ORDER.map((species, index) => {
  const el = card(species, index);
  galleryEl.append(el);
  const built = buildScene(species);
  const view = {
    species,
    info: CREATURES[species],
    el,
    stage: el.querySelector('.stage'),
    nowText: el.querySelector('.now-text'),
    ...built,
    camera: new THREE.PerspectiveCamera(30, 1, 0.05, 60),
    orbit: { ...DEFAULT_VIEW },
    target: { ...DEFAULT_VIEW },
    time: index * 0.9, // stagger the blinks so the row never feels like clones
    state: 'idle',
    moving: 0,
    oneShot: null,
    drift: 0,
  };
  el.querySelectorAll('[data-state]').forEach((button) => {
    button.onclick = () => play(view, button.dataset.state);
  });
  el.querySelector('[data-view]').onclick = () => resetView(view);
  bindDrag(view);
  return view;
});

function play(view, name) {
  const state = STATES[name];
  if (!state) return;
  if (state.duration) {
    view.oneShot = { name, elapsed: 0, duration: state.duration };
    cue(view, name === 'trick' ? `${view.info.voice}-happy` : 'cuddle');
  } else {
    view.state = name;
    view.oneShot = null;
    if (name === 'walk') cue(view, 'hop');
  }
  syncButtons(view);
  const line = { trick: view.info.trick, cuddle: 'That is the spot!' }[name];
  say(`${view.info.name} · ${line || (name === 'walk' ? view.info.motion : 'Taking it all in')}`);
}

function syncButtons(view) {
  const active = view.oneShot?.name || view.state;
  view.el.querySelectorAll('[data-state]').forEach((b) => {
    b.classList.toggle('on', b.dataset.state === active);
    b.setAttribute('aria-pressed', String(b.dataset.state === active));
  });
  view.nowText.textContent =
    { trick: view.info.trick, cuddle: 'Getting all the affection', walk: view.info.motion }[
      active
    ] || 'Taking in the little world';
}

function resetView(view) {
  view.target = { ...DEFAULT_VIEW };
  say(`${view.info.name} · view reset`);
}

function say(text) {
  statusEl.textContent = text;
}

// Animation cues borrow the audition player rather than opening a second one, and
// stay silent unless the viewer has asked for voices.
function cue(view, name) {
  if (!app.sound) return;
  playSound(name, { label: `${view.info.name} · animation cue` });
}

function bindDrag(view) {
  const stage = view.stage;
  let pointer = null;
  stage.addEventListener('pointerdown', (event) => {
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
    stage.setPointerCapture(event.pointerId);
    stage.classList.add('dragging');
  });
  stage.addEventListener('pointermove', (event) => {
    if (!pointer || pointer.id !== event.pointerId) return;
    view.target.yaw -= (event.clientX - pointer.x) * 0.011;
    view.target.pitch = Math.max(
      -0.45,
      Math.min(1.05, view.target.pitch + (event.clientY - pointer.y) * 0.007),
    );
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    stage.classList.add('touched');
  });
  const end = (event) => {
    if (pointer && pointer.id === event.pointerId) {
      stage.releasePointerCapture?.(event.pointerId);
      pointer = null;
      stage.classList.remove('dragging');
    }
  };
  stage.addEventListener('pointerup', end);
  stage.addEventListener('pointercancel', end);
  stage.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault();
      view.target.zoom = Math.max(0.62, Math.min(1.8, view.target.zoom + event.deltaY * 0.0015));
    },
    { passive: false },
  );
  stage.addEventListener('keydown', (event) => {
    const step = { ArrowLeft: -0.25, ArrowRight: 0.25 }[event.key];
    if (step === undefined) return;
    event.preventDefault();
    view.target.yaw += step;
  });
}

/* ---------- global controls ---------- */
const playPause = document.getElementById('playpause');
playPause.onclick = () => {
  app.paused = !app.paused;
  playPause.textContent = app.paused ? '▶ Play all' : '❚❚ Pause all';
  playPause.setAttribute('aria-pressed', String(app.paused));
  say(app.paused ? 'Everyone is holding still.' : 'And they are off again.');
};
const speed = document.getElementById('speed');
const speedValue = document.getElementById('speed-value');
speed.oninput = () => {
  app.speed = Number(speed.value) / 100;
  speedValue.textContent = `${app.speed.toFixed(1)}×`;
};
document.querySelectorAll('[data-all]').forEach((button) => {
  button.onclick = () => {
    const name = button.dataset.all;
    if (name === 'reset') {
      views.forEach(resetView);
      say('All five viewports reset.');
      return;
    }
    views.forEach((view) => play(view, name));
    say(`Everyone: ${STATES[name].label.toLowerCase()}.`);
  };
});
const soundToggle = document.getElementById('sound');
soundToggle.onchange = () => {
  app.sound = soundToggle.checked;
  say(app.sound ? 'Voices on — try a signature move.' : 'Voices off.');
};
const motionToggle = document.getElementById('motion');
motionToggle.checked = !app.reduced;
motionToggle.onchange = () => {
  app.reduced = !motionToggle.checked;
  say(app.reduced ? 'Calm motion.' : 'Full motion.');
};
systemReduced.addEventListener?.('change', (event) => {
  app.reduced = event.matches;
  motionToggle.checked = !app.reduced;
});

/* ---------- render loop ---------- */
function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
}
addEventListener('resize', resize);
resize();

let last = null;
let ready = false;
renderer.setAnimationLoop((now) => {
  const dt = last === null ? 0 : Math.min(0.06, (now - last) / 1000);
  last = now;
  if (document.hidden) return;
  const step = app.paused ? 0 : dt * app.speed;

  renderer.setScissorTest(false);
  renderer.clear();
  renderer.setScissorTest(true);

  for (const view of views) {
    const rect = view.stage.getBoundingClientRect();
    advance(view, step);
    if (rect.bottom < -80 || rect.top > innerHeight + 80 || !rect.width || !rect.height) continue;
    const bottom = innerHeight - rect.bottom;
    renderer.setViewport(rect.left, bottom, rect.width, rect.height);
    renderer.setScissor(rect.left, bottom, rect.width, rect.height);
    view.camera.aspect = rect.width / rect.height;
    // Fit the resting bounding sphere to whichever of the two field angles is tighter.
    const vFov = (view.camera.fov * Math.PI) / 180;
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * view.camera.aspect);
    const o = view.orbit;
    const margin = 1.1;
    const radius =
      (Math.max(
        (view.half.y * margin) / Math.tan(vFov / 2),
        (view.half.x * margin) / Math.tan(hFov / 2),
      ) +
        view.half.x) *
      o.zoom;
    view.camera.position.set(
      Math.sin(o.yaw) * Math.cos(o.pitch) * radius,
      view.focus + Math.sin(o.pitch) * radius,
      Math.cos(o.yaw) * Math.cos(o.pitch) * radius,
    );
    view.camera.lookAt(0, view.focus, 0);
    view.camera.updateProjectionMatrix();
    renderer.render(view.scene, view.camera);
  }
  if (!ready) {
    ready = true;
    document.body.classList.add('live');
    say('All five are awake. Drag a viewport, or send everyone into a signature move.');
  }
});

function advance(view, step) {
  view.time += step;
  const one = view.oneShot;
  if (one) {
    one.elapsed += step;
    if (one.elapsed >= one.duration) {
      view.oneShot = null;
      syncButtons(view);
    }
  }
  const wants = view.state === 'walk' && !view.oneShot ? 1 : 0;
  view.moving += (wants - view.moving) * Math.min(1, step * 3.4);
  const action =
    view.oneShot?.name === 'trick' ? 'trick' : view.oneShot ? 'cuddle' : STATES[view.state].action;
  poseCreature(view.creature, view.time, {
    moving: view.moving,
    action,
    phase: one ? one.elapsed / one.duration : (view.time % 3) / 3,
    reducedMotion: app.reduced,
  });
  // A little side-to-side drift while scampering, so the walk cycle reads as travel.
  view.drift += step * view.moving * 0.85;
  const sway = Math.sin(view.drift) * view.radius * 0.22 * view.moving;
  view.creature.position.x = sway;
  view.creature.rotation.y = Math.cos(view.drift) * 0.5 * view.moving;
  view.puddle.position.x = sway;
  view.puddle.material.opacity = 1 - view.moving * 0.25;

  const o = view.orbit;
  const t = Math.min(1, (step || 0.016) * 6);
  o.yaw += (view.target.yaw - o.yaw) * t;
  o.pitch += (view.target.pitch - o.pitch) * t;
  o.zoom += (view.target.zoom - o.zoom) * t;
}

views.forEach(syncButtons);
// Handy from the console (and for automated checks): inspect or drive the gallery.
globalThis.creatureLab = { app, views, renderer, play, resetView };
document.addEventListener('visibilitychange', () => {
  last = null;
});
