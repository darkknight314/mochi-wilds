import '@fontsource/dm-sans/latin-400.css';
import '@fontsource/dm-sans/latin-500.css';
import '@fontsource/manrope/latin-600.css';
import './creature-studio.css';
import { CREATURES } from './creatures.js';
import { PetScene } from './pet.js';
import { audio } from './audio.js';

const views = new Map();
document.getElementById('studio').innerHTML =
  `<header><a href="/">← Back to our garden</a><span>MOCHI WILDS</span><button id="mute" aria-pressed="${!audio.enabled}">${audio.enabled ? 'Sound on' : 'Sound off'}</button></header><div class="intro"><span>FIVE LITTLE REASONS TO SMILE</span><h1>Very small. <em>Very lovable.</em></h1><p>They lean into your hand. Hide behind tiny paws. Make happy little noises.<br>Move your pointer, give them a cuddle, and stay a little while.</p></div><div class="creature-grid">${Object.entries(
    CREATURES,
  )
    .map(
      ([id, c], i) =>
        `<article class="creature-card ${id}"><div class="card-heading"><span>0${i + 1}</span><h2>${c.name}</h2></div><div class="model-view" id="view-${id}" aria-label="Animated 3D ${c.name}" tabindex="0"></div><p class="creature-caption">${c.trait}</p><div class="creature-actions"><button data-pet="${id}" data-action="cuddle">♡ Cuddle me</button><button data-pet="${id}" data-action="peekaboo">☁ Peekaboo</button><button data-pet="${id}" data-action="trick">✧ Little trick</button><button data-pet="${id}" data-action="hello">♫ Say hello</button></div><label class="turn-control">Turn me around<input aria-label="Rotate ${c.name}" data-turn="${id}" type="range" min="-180" max="180" value="0"></label><a class="model-download" href="/assets/models/${id}.glb" download>Take home the 3D model ↗</a></article>`,
    )
    .join(
      '',
    )}</div><footer>Little companions, made to be loved. <a href="/">Start your adventure →</a></footer>`;
for (const [id, c] of Object.entries(CREATURES)) {
  const stage = document.getElementById(`view-${id}`);
  const view = new PetScene(
    stage,
    { species: id, color: c.color },
    {
      garden: false,
      roam: false,
      closeUp: true,
      onCue: (cue) => {
        // Pointer/keyboard capture creates the context before this callback.
        // Let play() finish resuming it so the very first hello isn't lost.
        if (audio.context) void audio.play(cue);
      },
    },
  );
  view.turn = 0.1;
  views.set(id, view);
  stage.addEventListener('click', () => {
    view.react();
  });
  stage.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      view.react();
    }
  });
}
document.addEventListener('pointerdown', () => void audio.unlock(), { capture: true });
document.addEventListener('keydown', () => void audio.unlock(), { capture: true });
document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-pet]');
  if (!button) return;
  const scene = views.get(button.dataset.pet);
  scene.paused = false;
  if (button.dataset.action === 'cuddle') scene.react();
  else if (button.dataset.action === 'peekaboo') scene.peekaboo();
  else if (button.dataset.action === 'hello') scene.greet();
  else scene.trick();
});
document.querySelectorAll('[data-turn]').forEach(
  (input) =>
    (input.oninput = () => {
      views.get(input.dataset.turn).turn = (Number(input.value) * Math.PI) / 180;
    }),
);
document.getElementById('mute').onclick = (event) => {
  audio.setEnabled(!audio.enabled);
  event.currentTarget.textContent = audio.enabled ? 'Sound on' : 'Sound off';
  event.currentTarget.setAttribute('aria-pressed', String(!audio.enabled));
};
document.addEventListener('visibilitychange', () => {
  if (document.hidden) audio.suspend();
});
window.addEventListener('pagehide', () => {
  views.forEach((view) => view.destroy());
  audio.stop();
});
// Read-only diagnostics also make visual checks reproducible in the browser suite.
window.creatureStudio = { views };
