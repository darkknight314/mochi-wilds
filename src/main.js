import '@fontsource/dm-sans/latin-400.css';
import '@fontsource/dm-sans/latin-500.css';
import '@fontsource/dm-sans/latin-600.css';
import '@fontsource/dm-sans/latin-700.css';
import '@fontsource/manrope/latin-500.css';
import '@fontsource/manrope/latin-600.css';
import '@fontsource/manrope/latin-700.css';
import '@fontsource/manrope/latin-800.css';
import './style.css';
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import {
  COLORS,
  CATALOG,
  MOVES,
  care,
  evolve,
  level,
  progress,
  purchase,
  validSegment,
  roundResult,
} from './game.js';
import { load, save } from './storage.js';
import { icon, portrait } from './icons.js';
import { PetScene } from './pet.js';
import { audio } from './audio.js';
import { CREATURES, creatureOf, speciesOf, legacyShape } from './creatures.js';
const $ = (s, root = document) => root.querySelector(s);
const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
let pet = load(),
  page = 'home',
  scene = null,
  modalScene = null,
  walk = null,
  socket = null,
  room = null,
  selfId = null,
  practice = null,
  arStream = null,
  arScene = null,
  arActive = false,
  toastTimer,
  walkTimer;
const app = $('#app'),
  overlay = $('#overlay');
function persist() {
  if (!save(pet)) toast('Storage is full. Keep this session open to preserve progress.');
}
function toast(message) {
  $('#toast').textContent = message;
  $('#toast').classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('#toast').classList.remove('show'), 3300);
}
function chime(name = 'reward') {
  void audio.play(name);
}
const button = (label, action, cls = 'primary', ico = '') =>
  `<button class="${cls}" data-action="${action}">${ico ? icon(ico) : ''}${label}</button>`;
// Mini portraits are species-specific: pass the whole companion (or any object with a
// species/color) so avatars in the sidebar, arena and journal show the real creature.
const miniPet = (companion = pet, cls = '') => {
  const p = typeof companion === 'string' ? { color: companion } : companion || {};
  const species = speciesOf(p);
  const color = Object.hasOwn(COLORS, p.color) ? COLORS[p.color] : COLORS.lilac;
  return `<div class="mini-pet ${cls}" style="--pet:${color}" data-species="${species}">${portrait(species, color, CREATURES[species].name)}</div>`;
};
function nav() {
  return [
    ['home', 'home', 'My garden'],
    ['walk', 'compass', 'Explore'],
    ['friends', 'users', 'Play together'],
    ['shop', 'bag', 'Boutique'],
    ['journal', 'book', 'Memories'],
  ]
    .map(
      ([id, ic, label]) =>
        `<button class="nav-item ${page === id ? 'active' : ''}" data-page="${id}">${icon(ic)}<span>${label}</span>${page === id ? '<i></i>' : ''}</button>`,
    )
    .join('');
}
function render() {
  if (scene) scene.paused = true;
  pet = evolve(pet);
  persist();
  app.innerHTML = `<aside class="sidebar"><a href="#" class="brand" data-page="home"><img src="/assets/icon.svg" alt=""><span>mochi<span class="brand-wilds">W I L D S</span></span></a><div class="nav-label">YOUR LITTLE WORLD</div><nav>${nav()}</nav><div class="sidebar-bottom"><div class="season-art">${icon('flower')}<span>THE BLOOM SEASON</span><strong>A little more wonder.</strong><p>Make room for small adventures.</p></div><button class="profile" data-action="customize">${miniPet(pet)}<span><b>${esc(pet.name)} & you</b><small>Garden keeper · Level ${level(pet)}</small></span>${icon('settings')}</button></div></aside>
 <div class="main-wrap"><header class="topbar"><div class="breadcrumb">Your little world <span>/</span> <b>${{ home: 'My garden', walk: 'Explore', friends: 'Play together', shop: 'Boutique', journal: 'Memories' }[page]}</b></div><div class="top-actions"><span class="live-dot"></span><span class="local-label">Saved on this device</span><span class="coin-pill">${icon('sparkles')} ${Math.floor(pet.coins).toLocaleString()}</span><button class="icon-button sound-toggle" data-action="sound" aria-label="Sound settings" title="Sound settings">${icon('volume')}</button><button class="avatar" data-action="customize" aria-label="Customize pet">${miniPet(pet)}</button></div></header><main>${{ home: home, walk: explore, friends: friends, shop: shop, journal: journal }[page]()}</main><footer><span>A little friend. A bigger world.</span><span>Made for moments that matter ${icon('sparkles')}</span></footer></div><nav class="mobile-nav">${nav()}</nav>`;
  $('footer span:last-child').innerHTML =
    `<a href="/creatures.html">Meet all five in 3D ${icon('sparkles')}</a>`;
  const identity = $('.pet-identity span');
  if (identity)
    identity.innerHTML = `${esc(creatureOf(pet).name)} <i>•</i> ${esc(creatureOf(pet).trait)}`;
  if (page === 'home') mountPet();
  if (page === 'walk') updateWalk();
}
function heading(eyebrow, title, subtitle, extra = '') {
  return `<div class="page-heading"><div><p class="eyebrow">${eyebrow}</p><h1>${title}</h1><p class="subtitle">${subtitle}</p></div>${extra}</div>`;
}
function home() {
  const xp = progress(pet);
  const tasks = [
    {
      icon: 'heart',
      title: 'A little love',
      sub: 'Give your spirit 3 cuddles',
      done: pet.daily.affection >= 3,
      val: `${Math.min(3, pet.daily.affection)}/3`,
      action: 'affection',
      color: 'pink',
    },
    {
      icon: 'walk',
      title: 'Wander together',
      sub: 'Explore 300 meters outside',
      done: pet.daily.meters >= 300,
      val: `${Math.min(300, Math.floor(pet.daily.meters))}/300 m`,
      action: 'walk-page',
      color: 'mint',
    },
    {
      icon: 'sparkles',
      title: 'Make a little magic',
      sub: 'Play a game with a friend',
      done: pet.daily.play >= 1,
      val: `${Math.min(1, pet.daily.play)}/1`,
      action: 'friends-page',
      color: 'lavender',
    },
  ];
  const all = tasks.every((t) => t.done);
  return (
    heading(
      'HOME IS WHERE YOUR MOCHI IS',
      `Small friend, <em>big magic.</em>`,
      `A little care. A little adventure. A whole lot of love.`,
      `<div class="date-pill">${icon('sun')} ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} <span>·</span> Bloom season</div>`,
    ) +
    `
 <div class="garden-grid"><section class="habitat ${pet.habitat === 'moon' ? 'moonlight' : ''}"><div class="habitat-top"><span class="glass-pill"><i></i> ${pet.habitat === 'moon' ? 'Moonlight meadow' : 'Cloudberry meadow'}</span><button class="glass-icon" data-action="snapshot" aria-label="Save a memory">${icon('camera')}</button></div><div class="habitat-copy"><span class="tiny-tag">YOUR EVERYDAY KIND OF MAGIC</span><h2>Hey, ${esc(pet.name)}.</h2><p>${pet.health < 40 ? 'A fresh start is a cuddle away.' : 'The world is better with you in it.'}</p></div><div id="pet-stage" role="button" tabindex="0" aria-label="Give your spirit affection"></div><div class="pet-speech">${pet.affection < 35 ? 'A little time together?' : 'Oh! My favorite human.'}<span>✧</span></div><div class="habitat-bottom"><span class="habitat-hint">${icon('heart')} Tap your spirit to say hello</span>${button('Meet in your world', 'ar', 'ar-button', 'camera')}</div><div id="particles" aria-hidden="true"></div></section>
 <section class="pet-card"><div class="section-overline">YOUR ONE-OF-A-KIND SPIRIT<button class="icon-button" data-action="customize" aria-label="Edit spirit">${icon('edit')}</button></div><div class="pet-identity">${miniPet(pet)}<div><h2>${esc(pet.name)}</h2><span>${esc(creatureOf(pet).name)} <i>•</i> ${esc(creatureOf(pet).trait)}</span></div></div><div class="level-row"><b>${icon('sparkles')} Level ${xp.level}</b><span>${Math.floor(xp.value)} / ${xp.max} XP</span></div><div class="progress-track"><i style="width:${(xp.value / xp.max) * 100}%"></i></div><p class="level-caption">Growing a little more magical, every day.</p><div class="vitals">${stat('heart', 'Vitality', pet.health, 'pink')}${stat('sun', 'Energy', pet.energy, 'butter')}${stat('sparkles', 'Bond', pet.affection, 'lavender')}</div><div class="mood-note">${icon('leaf')} ${pet.health > 60 ? 'Feeling bright & full of wonder' : 'Ready for a little care'}</div>${button('Give a little love', 'affection', 'primary full', 'heart')}<div class="companion-play">${button('Peekaboo', 'peekaboo', 'secondary', 'sparkles')}${button('Say hello', 'pet-hello', 'secondary', 'volume')}</div><button class="text-button full" data-action="customize">Make them yours ${icon('arrow')}</button></section></div>
 <div class="lower-grid"><section class="daily-card"><div class="section-title"><div><span class="eyebrow">LITTLE RITUALS, BIG FEELINGS</span><h2>Your daily dose of happy</h2></div><span class="streak">${icon('zap')} ${pet.streak} day streak</span></div><div class="tasks">${tasks.map((t) => `<button class="task ${t.done ? 'done' : ''}" data-action="${t.action}"><span class="tile-icon ${t.color}">${icon(t.done ? 'check' : t.icon)}</span><span class="task-copy"><b>${t.title}</b><small>${t.sub}</small></span><span class="task-count">${t.done ? icon('check') : t.val}</span></button>`).join('')}</div><div class="daily-reward"><span>${icon('gift')} Complete your rituals <b>+100 stardust</b></span><button data-action="claim" ${!all || pet.daily.claimed ? 'disabled' : ''}>${pet.daily.claimed ? 'Collected' : all ? 'Collect reward' : 'A little each day'}</button></div></section><section class="adventure-card"><div class="adventure-symbol">${icon('compass')}</div><span class="eyebrow">BETTER, TOGETHER</span><h2>Five little wilds.<br>Endless possibilities.</h2><p>Pocket dragons, mothkits, puddle otters and friends, ready to meet their world.</p><button class="text-button" data-page="friends">Find your playmates ${icon('arrow')}</button><div class="friends-preview">${miniPet({ species: 'mothkit', color: 'peach' })}${miniPet({ species: 'imp', color: 'mint' })}${miniPet({ species: 'otter', color: 'sky' })}<span>A whole world of friends</span></div></section></div>`
  );
}
function stat(ic, label, value, color) {
  return `<div class="stat"><div><span>${icon(ic)} ${label}</span><b>${Math.round(value)}<small>/100</small></b></div><div class="stat-track ${color}"><i style="width:${value}%"></i></div></div>`;
}
function mountPet() {
  try {
    if (scene) {
      scene.attach($('#pet-stage'));
      scene.update(pet);
    } else
      scene = new PetScene($('#pet-stage'), pet, {
        onActivity: (activity) => {
          const speech = $('.pet-speech');
          if (speech) speech.firstChild.textContent = `${activity}. `;
        },
        onCue: (cue) => chime(cue),
      });
    scene.paused = !!$('.modal') || arActive;
    $('#pet-stage').addEventListener('click', (event) => {
      const hit = scene?.interact(event.clientX, event.clientY);
      if (hit === 'pet') affection();
    });
    $('#pet-stage').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        affection();
      }
    });
  } catch {
    $('#pet-stage').innerHTML = miniPet(pet, 'fallback-pet');
  }
}
function affection() {
  const previous = pet.xp;
  pet = care(pet, 'affection');
  persist();
  scene?.react();
  if (pet.xp === previous) {
    toast('Let that little cuddle sink in…');
    return;
  }
  chime('cuddle');
  navigator.vibrate?.(30);
  const particles = $('#particles');
  if (particles) {
    for (let i = 0; i < 8; i++) {
      const p = document.createElement('span');
      p.textContent = i % 2 ? '♥' : '✧';
      p.style.cssText = `left:${35 + Math.random() * 30}%;animation-delay:${i * 0.07}s;--drift:${(Math.random() - 0.5) * 160}px`;
      particles.append(p);
      setTimeout(() => p.remove(), 2000);
    }
  }
  toast(`A little love goes a long way. +${Math.round(pet.xp - previous)} XP`);
  refreshVitals();
}
function refreshVitals() {
  if (page !== 'home') return;
  const temp = document.createElement('div');
  temp.innerHTML = home();
  $('.pet-card').innerHTML = $('.pet-card', temp).innerHTML;
  $('.daily-card').innerHTML = $('.daily-card', temp).innerHTML;
  $('.coin-pill').innerHTML = `${icon('sparkles')} ${Math.floor(pet.coins)}`;
}
function explore() {
  return (
    heading(
      'TAKE THE SCENIC ROUTE',
      'Every walk, <em>a little wonder.</em>',
      'Fresh air for you. A little magic for your spirit.',
    ) +
    `<div class="explore-grid"><section class="walk-map"><div class="map-grid"></div><svg class="route-art" viewBox="0 0 600 450"><path d="M100 380C20 230 350 360 230 200S470 20 505 140"/><circle cx="100" cy="380" r="10"/><circle cx="505" cy="140" r="10"/></svg><span class="map-label label-a">DAYDREAM GROVE</span><span class="map-label label-b">THE LONG WAY HOME</span><div class="map-spirit">${miniPet(pet)}<span>${walk ? 'Adventure in progress' : 'Your next adventure starts here'}</span></div><div class="map-badge">${icon('leaf')} Illustrated route · your distance is tracked below</div></section><section class="panel"><span class="eyebrow">YOUR WALKING COMPANION</span><h2>Let's wander.</h2><p class="muted">Walk 300 meters to complete today’s ritual. Your spirit collects stardust with every step.</p><div class="distance-display"><strong id="walk-distance">${Math.floor(walk?.meters || 0)}</strong><span>meters together</span></div><div class="walk-meta"><span>${icon('sun')} <b id="walk-time">00:00</b></span><span>${icon('sparkles')} <b id="walk-xp">+0 XP</b></span></div><div class="progress-track"><i id="walk-progress" style="width:0%"></i></div><p id="walk-status" class="status-copy">${walk ? walk.status : 'GPS stays on this device. No route is uploaded.'}</p>${walk ? `${button('Finish adventure', 'finish-walk', 'primary full', 'flag')}${walk.demo ? button('Wander 100 m', 'demo-step', 'secondary full', 'walk') : ''}` : `${button('Start a real walk', 'start-walk', 'primary full', 'walk')}${button('Try a demo walk', 'demo-walk', 'secondary full', 'sparkles')}`}<p class="fine-print">${walk?.demo ? 'Demo mode · simulated distance, real game rewards.' : 'Location permission and a secure connection are required for GPS. Keep the app open while walking.'}</p></section></div><div class="info-banner">${icon('compass')}<div><b>The journey is the reward.</b><p>You’ve wandered ${Math.floor(pet.totalMeters).toLocaleString()} meters together. Your daily target is ${Math.floor(pet.daily.meters)} / 300 m.</p></div></div>`
  );
}
async function startWalk(demo = false) {
  if (walk) return;
  walk = {
    meters: 0,
    started: Date.now(),
    demo,
    status: demo ? 'Demo adventure · tap to explore' : 'Finding your location…',
    last: null,
    watch: null,
  };
  render();
  walkTimer = setInterval(updateWalk, 1000);
  if (demo) return;
  try {
    if (Capacitor.isNativePlatform()) {
      await Geolocation.requestPermissions();
      const current = walk;
      current.watch = await Geolocation.watchPosition(
        { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
        (pos, error) => {
          if (walk !== current) return;
          if (error) {
            current.status = 'Location unavailable. Try outside or use demo mode.';
            updateWalk();
          } else locationUpdate(pos);
        },
      );
      if (walk !== current) await Geolocation.clearWatch({ id: current.watch });
    } else {
      if (!navigator.geolocation) throw Error('GPS unavailable');
      walk.watch = navigator.geolocation.watchPosition(
        locationUpdate,
        () => {
          if (walk) {
            walk.status = 'Location unavailable. Check permissions or try demo mode.';
            updateWalk();
          }
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
      );
    }
  } catch {
    if (walk) {
      walk.status = 'GPS unavailable. Finish this walk and try demo mode.';
      updateWalk();
    }
  }
}
function locationUpdate(position) {
  if (!walk) return;
  const next = {
    ...{
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
    },
    timestamp: position.timestamp,
  };
  walk.meters = Math.min(5000, walk.meters + validSegment(walk.last, next));
  walk.last = next;
  walk.status =
    next.accuracy > 35
      ? 'Waiting for a more accurate GPS signal…'
      : `GPS connected · accuracy ±${Math.round(next.accuracy)} m`;
  updateWalk();
}
function updateWalk() {
  if (page !== 'walk' || !walk) return;
  const elapsed = Math.floor((Date.now() - walk.started) / 1000);
  $('#walk-distance').textContent = Math.floor(walk.meters);
  $('#walk-time').textContent =
    `${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`;
  $('#walk-xp').textContent =
    `+${Math.floor((walk.meters / 8) * (pet.owned.includes('prism') ? 1.25 : 1))} XP`;
  $('#walk-progress').style.width = `${Math.min(100, walk.meters / 3)}%`;
  $('#walk-status').textContent = walk.status;
}
async function finishWalk() {
  if (!walk) return;
  const finished = walk;
  walk = null;
  clearInterval(walkTimer);
  if (finished.watch !== null) {
    if (Capacitor.isNativePlatform()) await Geolocation.clearWatch({ id: finished.watch });
    else navigator.geolocation.clearWatch(finished.watch);
  }
  pet = care(pet, 'walk', Date.now(), finished.meters);
  if (finished.meters > 0)
    addMemory(
      `${finished.demo ? 'Demo wander' : 'A little adventure'} · ${Math.floor(finished.meters)} m`,
      'walk',
    );
  persist();
  render();
  chime();
  toast(`${Math.floor(finished.meters)} meters of memories. Adventure saved.`);
}
function friends() {
  return (
    heading(
      'A LITTLE FRIENDLY MAGIC',
      'Good company. <em>Great adventures.</em>',
      'Invite a friend’s spirit, or warm up with our practice daydreamer.',
    ) +
    `<div class="friends-grid"><section class="arena-panel"><div class="arena-top"><span class="glass-pill">${icon('sparkles')} ${room ? 'LIVE GARDEN' : practice ? 'PRACTICE GARDEN' : 'THE FRIENDSHIP GARDEN'}</span><span class="online-badge">${room ? 'Connected' : practice ? 'Solo play' : 'Ready to play'}</span></div><div id="arena-content">${arenaContent()}</div></section><section class="panel lobby"><span class="eyebrow">MORE FRIENDS, MORE WONDER</span><h2>Meet in the meadow.</h2><p class="muted">Two spirits. Three rounds. A little friendly competition.</p><label class="field-label" for="game-mode">PICK YOUR KIND OF PLAY</label><select id="game-mode" ${room || practice ? 'disabled' : ''}><option value="duel">Spell duel · outwit your friend</option><option value="play">Harmony · match your magic</option></select>${button('Create a friend room', 'create-room', 'primary full', 'users')}<div class="divider"><span>or join their garden</span></div><form id="join-form"><label class="sr-only" for="room-code">Room code</label><div class="join-field"><input id="room-code" placeholder="6-character code" maxlength="6" autocomplete="off" pattern="[A-Fa-f0-9]{6}" required><button class="primary" type="submit" aria-label="Join room">${icon('arrow')}</button></div></form><button class="secondary full" data-action="practice">Play with a practice spirit ${icon('sparkles')}</button><p class="fine-print">Friends need the same server. Practice works offline. Duels are whimsical games of magical strategy.</p>${button('Connection settings', 'connection', 'text-button full', 'settings')}</section></div><div class="rules-row">${Object.entries(
      MOVES,
    )
      .map(
        ([id, m]) =>
          `<div class="rule-card"><span class="tile-icon ${id === 'spark' ? 'butter' : id === 'bloom' ? 'pink' : 'blue'}">${icon(m.icon)}</span><div><b>${m.name}</b><p>Outshines ${MOVES[m.beats].name.toLowerCase()}</p></div></div>`,
      )
      .join('')}</div>`
  );
}
function arenaContent() {
  if (!room && !practice)
    return `<div class="arena-idle"><div class="spirit-pair">${miniPet(pet)}<span>✧</span>${miniPet({ species: 'ferret', color: 'peach' })}</div><h2>A spark of friendship.</h2><p>Great things happen when little worlds meet.</p><span class="arena-tag">3 rounds · all heart · zero ouch</span></div>`;
  const r = room || practice;
  const players = r.players;
  const mine = players.find((p) => p.id === selfId) || players[0];
  const other = players.find((p) => p !== mine);
  const finished = r.phase === 'finished';
  const last = r.history.at(-1);
  return `<div class="match-header"><span>${r.mode === 'play' ? 'HARMONY GAME' : 'SPELL DUEL'} · ROUND ${r.round}/3</span>${room ? `<button class="room-code" data-action="copy-room">${r.code} ${icon('copy')}</button>` : '<span class="practice-label">Practice spirit</span>'}</div><div class="versus"><div>${miniPet(mine.pet)}<b>${esc(mine.pet.name)}</b><small>${esc(creatureOf(mine.pet).name)}</small><span>${mine.score} ${r.mode === 'play' ? 'matches' : 'stars'}</span></div><strong>✧</strong><div>${other ? miniPet(other.pet) : miniPet({ species: 'ferret', color: 'peach' })}<b>${esc(other?.pet.name || 'Waiting for a friend…')}</b><small>${other ? esc(creatureOf(other.pet).name) : 'An empty seat in the meadow'}</small><span>${other ? `${other.score} ${r.mode === 'play' ? 'matches' : 'stars'}` : 'Share your room code'}</span></div></div>
 ${
   r.phase === 'waiting'
     ? '<p class="arena-message">Your garden is open. Send your friend the code above.</p>'
     : finished
       ? `<div class="match-result"><span>${icon('trophy')}</span><h2>${r.mode === 'play' ? `${mine.score} moments in harmony!` : mine.score === other.score ? 'A magical tie!' : mine.score > other.score ? 'Your spirit sparkled brightest!' : 'A lovely game, a new friend.'}</h2><p>Friendship is always a win. +25 XP · +20 stardust</p>${button('Play again', 'rematch', 'primary')}</div>`
       : r.phase === 'reveal'
         ? `<div class="reveal"><h3>${MOVES[last.moves[0]].name} meets ${MOVES[last.moves[1]].name}</h3><p>${r.mode === 'play' ? (last.moves[0] === last.moves[1] ? 'Perfect harmony!' : 'Different magic, same friendship.') : last.result === 0 ? 'A beautiful balance. It’s a tie!' : `${esc(players[last.result === 1 ? 0 : 1].pet.name)} wins the round!`}</p>${button('Next round', 'next-round', 'primary', 'arrow')}</div>`
         : `<p class="arena-message">${mine.ready ? 'Magic chosen. Waiting for your friend…' : r.mode === 'play' ? 'Choose the same spell to make harmony.' : 'What magic will you make?'}</p><div class="move-buttons">${Object.entries(
             MOVES,
           )
             .map(
               ([id, m]) =>
                 `<button data-move="${id}" ${mine.ready ? 'disabled' : ''} class="move ${id}">${icon(m.icon)}<b>${m.name}</b></button>`,
             )
             .join('')}</div>`
 }
 <button class="text-button leave-game" data-action="leave-game">Leave garden</button>`;
}
function updateArena() {
  if (page === 'friends' && $('#arena-content')) {
    $('#arena-content').innerHTML = arenaContent();
    $('.arena-top .glass-pill').innerHTML =
      icon('sparkles') +
      ' ' +
      (room ? 'LIVE GARDEN' : practice ? 'PRACTICE GARDEN' : 'THE FRIENDSHIP GARDEN');
    $('.online-badge').textContent = room ? 'Connected' : practice ? 'Solo play' : 'Ready to play';
    $('#game-mode').disabled = !!(room || practice);
    $('.coin-pill').innerHTML = icon('sparkles') + ' ' + Math.floor(pet.coins);
  }
}
function serverURL() {
  return localStorage.getItem('mochi-server') || import.meta.env.VITE_SERVER_URL || '';
}
function connect() {
  return new Promise((resolve, reject) => {
    if (socket?.readyState === WebSocket.OPEN) return resolve(socket);
    const base = serverURL() || location.origin;
    let url;
    try {
      url = new URL('/socket', base);
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    } catch {
      return reject(Error('Check your server address.'));
    }
    const ws = new WebSocket(url);
    socket = ws;
    const timeout = setTimeout(() => {
      ws.close();
      reject(
        Error('Could not reach the garden server. Try practice or check connection settings.'),
      );
    }, 7000);
    ws.onopen = () => {
      clearTimeout(timeout);
      resolve(ws);
    };
    ws.onerror = () => {
      clearTimeout(timeout);
      reject(Error('Garden server unavailable. Practice is ready to play.'));
    };
    ws.onclose = () => {
      clearTimeout(timeout);
      if (socket === ws) {
        socket = null;
        if (room) {
          room = null;
          updateArena();
          toast('Your friend garden disconnected. You can create a new room.');
        }
      }
    };
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === 'identity') selfId = msg.id;
      if (msg.type === 'room') {
        const wasFinished = room?.phase === 'finished';
        room = msg.room;
        if (room.phase === 'finished' && !wasFinished) gameReward();
        updateArena();
      }
      if (msg.type === 'error') toast(msg.message);
      if (msg.type === 'left') {
        room = null;
        updateArena();
        toast('Your friend left the garden. See you next time!');
      }
    };
  });
}
async function roomAction(type, code) {
  try {
    if (room || practice) leaveGame();
    const mode = $('#game-mode')?.value || 'duel';
    const ws = await connect();
    ws.send(
      JSON.stringify({
        type,
        code,
        mode,
        pet: { name: pet.name, color: pet.color, shape: pet.shape, species: speciesOf(pet) },
      }),
    );
    toast(type === 'create' ? 'Opening your friend garden…' : 'Finding your friend…');
  } catch (e) {
    toast(e.message);
  }
}
function practiceSpecies() {
  const others = Object.keys(CREATURES).filter((id) => id !== speciesOf(pet));
  return others[Math.floor(Math.random() * others.length)];
}
function startPractice(mode) {
  leaveGame();
  selfId = 'you';
  practice = {
    mode: mode || $('#game-mode')?.value || 'duel',
    round: 1,
    phase: 'choosing',
    history: [],
    players: [
      { id: 'you', pet: { ...pet }, score: 0, ready: false },
      {
        id: 'bot',
        // The practice partner is always a different creature to yours, so the arena
        // shows two distinct silhouettes instead of a mirrored default.
        pet: { name: 'Nimbus', color: 'peach', species: practiceSpecies() },
        score: 0,
        ready: false,
      },
    ],
  };
  updateArena();
}
function chooseMove(move) {
  if ((room || practice)?.phase === 'choosing') chime(move);
  if (room) {
    socket?.send(JSON.stringify({ type: 'move', move }));
    return;
  }
  if (!practice || practice.phase !== 'choosing') return;
  const b = Object.keys(MOVES)[Math.floor(Math.random() * 3)],
    r = roundResult(move, b);
  practice.history.push({ round: practice.round, moves: [move, b], result: r });
  if (practice.mode === 'play') {
    if (r === 0) practice.players.forEach((p) => p.score++);
  } else if (r !== 0) practice.players[r === 1 ? 0 : 1].score++;
  practice.phase = practice.round === 3 ? 'finished' : 'reveal';
  if (practice.phase === 'finished') gameReward();
  updateArena();
}
function gameReward() {
  pet = care(pet, 'play');
  addMemory('A spark of friendship', 'sparkles');
  persist();
  chime();
}
function leaveGame() {
  socket?.readyState === 1 && socket.send(JSON.stringify({ type: 'leave' }));
  room = null;
  practice = null;
  updateArena();
}
function shop() {
  return (
    heading(
      'SMALL TREASURES, BIG PERSONALITY',
      'A little extra <em>you.</em>',
      'Thoughtful little upgrades for your one-of-a-kind companion.',
      `<span class="sandbox-badge">${icon('gem')} Sandbox boutique · no real charges</span>`,
    ) +
    `<section class="shop-hero"><div><span class="eyebrow">THE EVERYDAY MAGIC COLLECTION</span><h2>For the wonderfully<br>one of a kind.</h2><p>A new glow. A fresh bloom. A little more wonder.</p><span class="collection-tag">4 little treasures to discover ${icon('sparkles')}</span></div><div class="shop-display">${miniPet(pet)}<span class="orbit orbit-one"></span><span class="orbit orbit-two"></span><i>✧</i></div></section><div class="shop-title"><h2>Make their world a little brighter</h2><button class="text-button" data-action="restore">Restore purchases ${icon('arrow')}</button></div><div class="product-grid">${CATALOG.map((item) => `<article class="product"><div class="product-art ${item.color}"><span class="product-tag">${item.kind === 'upgrade' ? 'PERMANENT BOOST' : item.kind === 'habitat' ? 'NEW HABITAT' : 'WEARABLE WONDER'}</span>${icon(item.icon)}<span class="product-spark">✧</span></div><div class="product-info"><h3>${item.name}</h3><p>${item.description}</p><button class="${pet.owned.includes(item.id) ? 'secondary' : 'primary'} full" data-buy="${item.id}">${pet.owned.includes(item.id) ? 'Owned · ' + (item.kind === 'upgrade' ? 'active' : 'equip') : `$${item.price.toFixed(2)} ${icon('plus')}`}</button></div></article>`).join('')}</div><p class="fine-print center">Demo purchases unlock instantly after confirmation. All receipts are sandbox receipts stored on this device.</p>`
  );
}
function buy(id) {
  const item = CATALOG.find((i) => i.id === id);
  if (!item) return;
  if (pet.owned.includes(id)) {
    if (item.kind === 'accessory') pet.accessory = id;
    if (item.kind === 'habitat') pet.habitat = id;
    persist();
    toast(
      item.kind === 'upgrade' ? 'Your Prism heart is already active.' : `${item.name} equipped.`,
    );
    return;
  }
  openModal(
    `<div class="purchase-icon ${item.color}">${icon(item.icon)}</div><span class="eyebrow">A LITTLE EXTRA MAGIC</span><h2>${item.name}</h2><p>${item.description}</p><div class="checkout-line"><span>Sandbox purchase</span><b>$${item.price.toFixed(2)}</b></div><div class="notice">This is a simulated in-app purchase. No payment details are collected and no money is charged.</div><button class="primary full" data-confirm-buy="${id}">Confirm sandbox purchase ${icon('gem')}</button><button class="text-button full" data-action="close-modal">Maybe later</button>`,
  );
}
function addMemory(title, type, image) {
  pet.memories.unshift({
    id:
      globalThis.crypto?.randomUUID?.() ||
      `memory-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    title,
    type,
    at: Date.now(),
    ...(image ? { image } : {}),
  });
  pet.memories = pet.memories.slice(0, 12);
}
function journal() {
  return (
    heading(
      'THE LITTLE THINGS ARE THE BIG THINGS',
      'A pocketful of <em>memories.</em>',
      'Your shared story, one small adventure at a time.',
    ) +
    `<div class="journal-stats"><div><b>${Math.max(1, Math.floor((Date.now() - pet.birthday) / 86400000) + 1)}</b><span>Days together</span></div><div><b>${Math.floor(pet.totalMeters)} m</b><span>Wandered together</span></div><div><b>Level ${level(pet)}</b><span>Growing with love</span></div></div>${pet.memories.length ? `<div class="memory-grid">${pet.memories.map((m) => `<article class="memory-card">${m.image ? `<img src="${m.image}" alt="${esc(m.title)}">` : `<div class="memory-illustration">${miniPet(pet)}${icon(m.type)}</div>`}<div><span class="eyebrow">${new Date(m.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span><h3>${esc(m.title)}</h3></div></article>`).join('')}</div>` : `<div class="empty-state">${icon('book')}<h2>Your story is just beginning.</h2><p>Take a walk, play a game, or snap a photo in your garden.</p>${button('Make a memory', 'home-page', 'primary', 'camera')}</div>`}`
  );
}
function openModal(content, wide = false) {
  if (scene) scene.paused = true;
  modalScene?.destroy();
  modalScene = null;
  overlay.innerHTML = `<div class="modal-backdrop"><section class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${wide ? 'Customize your spirit' : 'Mochi Wilds dialog'}"><button class="close-modal icon-button" data-action="close-modal" aria-label="Close dialog">${icon('close')}</button>${content}</section></div>`;
  overlay.dataset.previousFocus = document.activeElement?.id || '';
  requestAnimationFrame(() => $('.modal button, .modal input')?.focus());
}
function closeModal() {
  modalScene?.destroy();
  modalScene = null;
  overlay.innerHTML = '';
  if (scene) scene.paused = page !== 'home' || arActive;
}
function speciesCards(draft) {
  const selected = speciesOf(draft);
  const color = Object.hasOwn(COLORS, draft.color) ? COLORS[draft.color] : COLORS.lilac;
  return Object.entries(CREATURES)
    .map(
      ([id, c]) =>
        `<button type="button" class="species-option ${id === selected ? 'selected' : ''}" data-species="${id}" aria-pressed="${id === selected}"><span class="species-art" style="--pet:${color}">${portrait(id, color)}</span><b>${esc(c.name)}</b><small>${esc(c.trait)}</small></button>`,
    )
    .join('');
}
function customize() {
  const draft = { ...pet, species: speciesOf(pet) };
  openModal(
    `<div class="customize-grid"><div class="customize-preview"><span class="eyebrow">A LITTLE WILD LIKE NO OTHER</span><div id="custom-pet"></div><span class="preview-label" id="preview-label">${esc(creatureOf(draft).name)} · ${esc(creatureOf(draft).trait)}</span></div><form id="customize-form"><span class="eyebrow">${pet.created ? 'A LITTLE REINVENTION' : 'NICE TO MEET YOU, HUMAN'}</span><h2>${pet.created ? 'Made of you.' : 'Meet your little wonder.'}</h2><p class="muted">Five little wilds, each with a personality all its own. Pick one and watch them come alive.</p><label class="field-label" for="pet-name">WHAT SHOULD WE CALL THEM?</label><input id="pet-name" name="name" value="${esc(pet.name)}" maxlength="18" required placeholder="A magical little name"><label class="field-label">CHOOSE YOUR LITTLE WILD</label><div class="species-picker" role="group" aria-label="Choose your creature">${speciesCards(draft)}</div><label class="field-label">A LITTLE COLOR</label><div class="swatches">${Object.entries(
      COLORS,
    )
      .map(
        ([id, c]) =>
          `<button type="button" data-color="${id}" class="swatch ${pet.color === id ? 'selected' : ''}" style="--swatch:${c}" aria-label="${id}" aria-pressed="${pet.color === id}">${pet.color === id ? icon('check') : ''}</button>`,
      )
      .join(
        '',
      )}</div><label class="field-label" for="pet-accessory">FINISHING TOUCHES</label><select id="pet-accessory"><option value="none">Just their lovely self</option>${pet.owned
      .filter((id) => CATALOG.find((i) => i.id === id)?.kind === 'accessory')
      .map(
        (id) =>
          `<option value="${id}" ${pet.accessory === id ? 'selected' : ''}>${CATALOG.find((i) => i.id === id).name}</option>`,
      )
      .join(
        '',
      )}</select><button type="submit" class="primary full">${pet.created ? 'Save their new look' : 'Start our little adventure'} ${icon('arrow')}</button></form></div>`,
    true,
  );
  // A live, animated 3D preview of the chosen creature — the same renderer the garden
  // uses, so what you pick here is exactly what you get.
  const mountPreview = () => {
    try {
      modalScene = new PetScene($('#custom-pet'), draft, { garden: false });
      return true;
    } catch {
      $('#custom-pet').innerHTML = miniPet(draft);
      return false;
    }
  };
  mountPreview();
  const refreshPreview = () => {
    if (modalScene) modalScene.update(draft);
    else $('#custom-pet').innerHTML = miniPet(draft);
    $('#preview-label').textContent = `${creatureOf(draft).name} · ${creatureOf(draft).trait}`;
    $('.species-picker').innerHTML = speciesCards(draft);
  };
  $('.swatches').onclick = (e) => {
    const b = e.target.closest('[data-color]');
    if (!b) return;
    draft.color = b.dataset.color;
    $('.swatches')
      .querySelectorAll('button')
      .forEach((x) => {
        x.classList.toggle('selected', x === b);
        x.setAttribute('aria-pressed', x === b);
        x.innerHTML = x === b ? icon('check') : '';
      });
    refreshPreview();
  };
  $('.species-picker').onclick = (e) => {
    const b = e.target.closest('[data-species]');
    if (!b || b.dataset.species === draft.species) return;
    draft.species = b.dataset.species;
    // Keep the legacy silhouette field coherent for saves and older peers.
    draft.shape = legacyShape(draft.species);
    refreshPreview();
    chime(`${draft.species}-hello`);
  };
  $('#pet-accessory').onchange = (e) => {
    draft.accessory = e.target.value;
    refreshPreview();
  };
  $('#customize-form').onsubmit = (e) => {
    e.preventDefault();
    const name = $('#pet-name').value.trim();
    if (!name) {
      $('#pet-name').setCustomValidity('Give your little wild a name.');
      $('#pet-name').reportValidity();
      return;
    }
    const first = !pet.created;
    pet = {
      ...pet,
      name,
      color: draft.color,
      shape: draft.shape,
      species: speciesOf(draft),
      accessory: draft.accessory,
      created: true,
    };
    if (first) addMemory('The day we found each other', 'heart');
    persist();
    closeModal();
    render();
    chime(`${speciesOf(pet)}-hello`);
    toast(
      first
        ? `Welcome to the world, ${pet.name} the ${creatureOf(pet).name}.`
        : 'A lovely new look.',
    );
  };
  $('#pet-name').oninput = (e) => e.target.setCustomValidity('');
}
async function snapshot() {
  chime('snapshot');
  if (!scene) return;
  scene.renderer.render(scene.scene, scene.camera);
  const c = document.createElement('canvas');
  c.width = 720;
  c.height = 640;
  const ctx = c.getContext('2d');
  const bg = new Image();
  bg.src = '/assets/habitat.png';
  await bg.decode();
  ctx.drawImage(bg, 0, 0, 720, 640);
  ctx.drawImage(scene.renderer.domElement, 0, 0, 720, 600);
  ctx.fillStyle = '#423b55';
  ctx.font = '24px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`${pet.name} · Mochi Wilds`, 360, 610);
  addMemory('A moment in our little world', 'camera', c.toDataURL('image/jpeg', 0.7));
  persist();
  toast('A little moment, kept forever. Find it in Memories.');
}
// What this device actually granted. Kept separate from the room description
// because both used to write the same hint element and overwrite each other,
// which hid exactly the information needed to tell why AR looked flat.
let arCapabilities = { planes: null, depth: null, occluding: false };
// How many real points the hit-test mapper has collected, shown as progress.
let mappedProgress = 0;
// Say plainly what the app can currently see of the room. Vague reassurance
// here reads as a bug when the creature then refuses to leave one spot.
function describeRoom(room) {
  const status = $('#ar-status');
  const hint = $('#ar-hint');
  if (!status || !hint) return;
  if (!room) {
    // A capability-only refresh: keep whatever the room last said.
    hint.textContent = withCapabilities(hint.dataset.room || hint.textContent);
    return;
  }
  if (!room.known) {
    status.textContent = 'Looking for your room…';
    hint.dataset.room = 'Move slowly so your spirit can find somewhere to play.';
    hint.textContent = withCapabilities(hint.dataset.room);
    return;
  }
  const surfaces = room.walkable;
  const named = [...new Set(surfaces.map((s) => s.semantic).filter((s) => s !== 'unknown'))];
  status.textContent =
    surfaces.length > 1 ? `Found ${surfaces.length} surfaces` : 'Found somewhere to play';
  hint.dataset.room = named.length
    ? `${pet.name} can explore your ${named.join(' and ')}.`
    : `${pet.name} is exploring the space around you.`;
  hint.textContent = withCapabilities(hint.dataset.room);
}
// Append the honest limitation, if there is one. Silence when everything the
// device could give it, it gave.
function withCapabilities(text) {
  const notes = [];
  if (arCapabilities.occluding) notes.push('Real objects hide it — try your hand.');
  else if (arCapabilities.depth && arCapabilities.depthUsage)
    // Depth exists but not in the mode that occludes. Naming the mode is the
    // difference between "this phone cannot" and "we have not built that yet".
    notes.push(`Depth is ${arCapabilities.depthUsage}, so nothing hides it yet.`);
  else if (arCapabilities.depth === false)
    notes.push('No depth here, so it draws over real objects.');
  if (arCapabilities.planes === false)
    notes.push(
      mappedProgress > 0
        ? `Mapping your room from where you look — ${mappedProgress} spots so far.`
        : 'No surfaces shared, so look around to map your room.',
    );
  return [text, ...notes].join(' ');
}
async function startAR() {
  openModal(
    `<span class="eyebrow">A LITTLE MAGIC, IN YOUR WORLD</span><h2>Make room for wonder.</h2><p>Place ${esc(pet.name)} in the world around you.</p><div class="ar-choice">${icon('camera')}<p>On compatible Android browsers, spatial AR finds a surface. Other devices use a live camera with a movable 3D spirit.</p></div>${button('Open camera experience', 'launch-ar', 'primary full', 'camera')}<p class="fine-print">Camera frames stay on your device. You can also try the interactive preview without a camera.</p>${button('Try without a camera', 'preview-ar', 'text-button full')}`,
  );
}
async function launchAR(preview = false) {
  closeModal();
  arActive = true;
  arCapabilities = { planes: null, depth: null, occluding: false };
  mappedProgress = 0;
  if (scene) scene.paused = true;
  overlay.innerHTML = `<div class="ar-shell" id="ar-overlay"><video id="ar-video" autoplay playsinline muted></video><div class="ar-preview-bg"></div><div id="ar-stage"></div><div class="ar-controls"><button class="glass-icon" data-action="stop-ar" aria-label="Close AR">${icon('close')}</button><span class="glass-pill" id="ar-status">${preview ? 'Interactive preview' : 'Opening your camera…'}</span></div><div class="ar-bottom"><p id="ar-hint">Drag to place your spirit · use the slider to resize</p><label>Spirit size <input id="ar-size" type="range" min="0.4" max="1.6" value="1" step="0.05"></label>${button('Send some love', 'ar-love', 'ar-button', 'heart')}</div></div>`;
  try {
    arScene = new PetScene($('#ar-stage'), pet, { garden: false });
    // A development-only handle, so the end-to-end tests can inspect what the
    // app believes about the room. Stripped from production builds.
    if (import.meta.env?.DEV) globalThis.__arScene = arScene;
  } catch {
    toast('3D rendering is unavailable on this device.');
    stopAR();
    return;
  }
  if (!preview && (await navigator.xr?.isSessionSupported?.('immersive-ar').catch(() => false))) {
    try {
      $('.ar-shell').classList.add('spatial');
      await arScene.startXR(
        () => {
          if (arActive) stopAR();
        },
        {
          // Fires when the room first becomes known, and again if tracking is
          // lost — the caption is the only way the player can tell whether the
          // creature is exploring real furniture or just staying near them.
          onRoom: (room) => describeRoom(room),
          onFeatures: ({ planes, depth }) => {
            arCapabilities = { ...arCapabilities, planes, depth };
            describeRoom(null);
          },
          // Real depth occlusion is worth telling the player about, because it
          // is the one effect they can test themselves in a second.
          onOcclusion: (active) => {
            arCapabilities = { ...arCapabilities, occluding: active };
            describeRoom(null);
          },
        },
      );
      $('#ar-status').textContent = 'Spatial AR · scan a surface';
      $('#ar-hint').textContent =
        'Move your phone slowly, then tap the mint ring to place your spirit.';
      $('.ar-bottom label').hidden = true;
      return;
    } catch {
      $('.ar-shell')?.classList.remove('spatial');
      toast('Spatial AR unavailable. Opening camera mode.');
    }
  }
  if (!arActive) return;
  if (!preview) {
    try {
      arStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
      if (!arActive) {
        arStream.getTracks().forEach((t) => t.stop());
        arStream = null;
        return;
      }
      $('#ar-video').srcObject = arStream;
      $('.ar-preview-bg').hidden = true;
      $('#ar-status').textContent = 'Camera mode · manual placement';
    } catch {
      if (!arActive) return;
      $('#ar-status').textContent = 'Preview · camera unavailable';
      toast('Camera unavailable. You can still try the 3D preview.');
    }
  }
  if (!arActive) return;
  const stage = $('#ar-stage');
  if (!preview && arStream) {
    // Without WebXR the browser will not tell us where the floor is, so the
    // player does: one tap, and the creature gets a real patch of room to
    // explore instead of hovering in front of the lens.
    arScene.startCameraRoom($('#ar-video'), { onRoom: (room) => describeRoom(room) });
    $('#ar-hint').textContent = 'Tap where the floor is, and your spirit will explore that spot.';
    stage.addEventListener('click', (e) => {
      arScene.roomProvider?.placeGround?.(e.clientY / innerHeight);
      $('#ar-hint').textContent = 'Drag to move the view · use the slider to resize';
    });
  }
  stage.onpointerdown = (e) => {
    stage.setPointerCapture(e.pointerId);
  };
  stage.onpointermove = (e) => {
    if (e.buttons) {
      arScene.turn = (e.clientX / innerWidth - 0.5) * 2;
      stage.style.transform = `translate(${(e.clientX / innerWidth - 0.5) * 120}px,${(e.clientY / innerHeight - 0.5) * 100}px)`;
    }
  };
  $('#ar-size').oninput = (e) => {
    stage.style.scale = e.target.value;
  };
}
function stopAR() {
  refreshVitals();
  arActive = false;
  arStream?.getTracks().forEach((t) => t.stop());
  arStream = null;
  arScene?.destroy();
  arScene = null;
  if (import.meta.env?.DEV) globalThis.__arScene = null;
  overlay.innerHTML = '';
  if (scene) scene.paused = page !== 'home';
}
function connection() {
  openModal(
    `<span class="eyebrow">A BRIDGE BETWEEN GARDENS</span><h2>Garden connection</h2><p>On the web, your current server is used automatically. In the native app, enter the HTTPS address of your running Mochi server.</p><form id="connection-form"><label class="field-label" for="server-address">SERVER ADDRESS</label><input id="server-address" type="url" placeholder="https://your-mochi-server.example" value="${esc(serverURL())}"><button class="primary full">Save connection</button></form><p class="fine-print">Leave blank to use the current website. Use the same address on both devices.</p>`,
  );
  $('#connection-form').onsubmit = (e) => {
    e.preventDefault();
    const value = $('#server-address').value.trim();
    if (value && !/^https?:\/\//.test(value)) {
      toast('Use an http:// or https:// address.');
      return;
    }
    localStorage.setItem('mochi-server', value);
    leaveGame();
    socket?.close();
    socket = null;
    closeModal();
    toast('Garden connection saved.');
  };
}
function updateSoundControls() {
  const toggle = $('#sound-enabled');
  if (toggle) {
    toggle.textContent = audio.enabled ? 'Sounds on · tap to mute' : 'Sounds muted · tap to enable';
    toggle.setAttribute('aria-pressed', String(audio.enabled));
  }
  const preview = $('[data-action="preview-sound"]');
  if (preview) preview.disabled = !audio.enabled;
}
function soundSettings() {
  openModal(
    `<span class="eyebrow">A LITTLE MUSIC TO YOUR EARS</span><h2>Small sounds. Big feelings.</h2><p>Soft purrs, bubbly footsteps, and tiny celebrations.</p><button id="sound-enabled" class="secondary full" data-action="toggle-sound" aria-pressed="${audio.enabled}"></button><label class="field-label" for="sound-volume">VOLUME <output id="sound-volume-value">${Math.round(audio.volume * 100)}%</output></label><input id="sound-volume" type="range" min="0" max="100" value="${Math.round(audio.volume * 100)}" aria-label="Sound volume">${button('Hear a happy cuddle', 'preview-sound', 'primary full', 'volume')}<p class="fine-print">Your preference stays on this device. Sounds pause when the app is in the background.</p>`,
  );
  updateSoundControls();
  $('#sound-volume').oninput = (e) => {
    audio.setVolume(Number(e.target.value) / 100);
    $('#sound-volume-value').textContent = `${e.target.value}%`;
  };
}
const actions = {
  customize,
  affection,
  peekaboo: () => scene?.peekaboo(),
  'pet-hello': () => scene?.greet(),
  ar: startAR,
  'launch-ar': () => launchAR(),
  'preview-ar': () => launchAR(true),
  'stop-ar': stopAR,
  'ar-love': () => {
    arScene?.react();
    pet = care(pet, 'affection');
    persist();
    chime('cuddle');
    toast('A little love, wherever you are.');
  },
  'close-modal': closeModal,
  snapshot,
  sound: soundSettings,
  'toggle-sound': () => {
    audio.setEnabled(!audio.enabled);
    updateSoundControls();
    if (audio.enabled) chime('cuddle');
  },
  'preview-sound': () => chime('cuddle'),
  'walk-page': () => navigate('walk'),
  'friends-page': () => navigate('friends'),
  'home-page': () => navigate('home'),
  'start-walk': () => startWalk(),
  'demo-walk': () => startWalk(true),
  'demo-step': () => {
    if (walk?.demo) {
      walk.meters = Math.min(5000, walk.meters + 100);
      updateWalk();
      chime('hop');
    }
  },
  'finish-walk': finishWalk,
  claim: () => {
    const before = pet.coins;
    pet = care(pet, 'claim');
    persist();
    refreshVitals();
    if (pet.coins > before) {
      chime();
      toast('Rituals complete! +100 stardust and +50 XP.');
    }
  },
  'create-room': () => roomAction('create'),
  practice: () => startPractice(),
  'next-round': () => {
    if (room) socket?.send(JSON.stringify({ type: 'next' }));
    else if (practice?.phase === 'reveal') {
      practice.round++;
      practice.phase = 'choosing';
      updateArena();
    }
  },
  'leave-game': leaveGame,
  rematch: () => {
    const mode = (room || practice)?.mode;
    if (practice) startPractice(mode);
    else {
      leaveGame();
      toast('Create a fresh room for your next match.');
    }
  },
  'copy-room': async () => {
    try {
      await navigator.clipboard.writeText(room.code);
      toast('Room code copied. Send a little invitation!');
    } catch {
      toast(`Your room code: ${room.code}`);
    }
  },
  connection,
  restore: () => {
    const ids = pet.receipts
      .filter((r) => r.provider === 'sandbox' && CATALOG.some((i) => i.id === r.sku))
      .map((r) => r.sku);
    pet.owned = [...new Set([...pet.owned, ...ids])];
    persist();
    render();
    toast(
      ids.length
        ? `${ids.length} sandbox purchases restored from this device.`
        : 'No sandbox purchases to restore on this device.',
    );
  },
};
function navigate(id) {
  chime('tap');
  if (!['home', 'walk', 'friends', 'shop', 'journal'].includes(id)) return;
  page = id;
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
// Unlock once from a real user gesture; browsers block unsolicited audio.
document.addEventListener('pointerdown', () => void audio.unlock(), { capture: true });
document.addEventListener('keydown', () => void audio.unlock(), { capture: true });
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-page],[data-action],[data-buy],[data-move],[data-confirm-buy]');
  if (!b || b.disabled) return;
  if (b.dataset.page) {
    e.preventDefault();
    navigate(b.dataset.page);
  } else if (b.dataset.action) {
    Promise.resolve(actions[b.dataset.action]?.()).catch((err) => {
      console.error(err);
      toast('That little bit of magic did not work. Please try again.');
    });
  } else if (b.dataset.buy) buy(b.dataset.buy);
  else if (b.dataset.move) chooseMove(b.dataset.move);
  else if (b.dataset.confirmBuy) {
    pet = purchase(pet, b.dataset.confirmBuy);
    persist();
    closeModal();
    render();
    chime('purchase');
    toast('A little treasure, all yours. Sandbox purchase complete.');
  }
});
document.addEventListener('submit', (e) => {
  if (e.target.id === 'join-form') {
    e.preventDefault();
    roomAction('join', $('#room-code').value.trim().toUpperCase());
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (arActive) stopAR();
    else closeModal();
  }
  if (e.key === 'Tab' && $('.modal')) {
    const focusable = [...$('.modal').querySelectorAll('button:not([disabled]),input,select,a')];
    const first = focusable[0],
      last = focusable.at(-1);
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) audio.suspend();
  if (document.visibilityState === 'visible') {
    pet = evolve(pet);
    persist();
    refreshVitals();
  } else {
    persist();
    if (arActive) stopAR();
  }
});
window.addEventListener('beforeunload', () => {
  audio.stop();
  persist();
  arStream?.getTracks().forEach((t) => t.stop());
});
setInterval(() => {
  pet = evolve(pet);
  persist();
  refreshVitals();
}, 60000);
render();
if (!pet.created) setTimeout(customize, 550);
