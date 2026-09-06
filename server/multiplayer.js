import { randomBytes } from 'node:crypto';
import { roundResult, MOVES, COLORS } from '../src/game.js';
import { speciesOf, isSpecies, legacyShape } from '../src/creatures.js';
const LEGACY_SHAPES = ['cloud', 'star', 'drop'];
// Nothing a client sends is ever echoed back unchecked: an unknown species falls back
// to the legacy shape mapping, and anything still unrecognised becomes the roster
// default. `isSpecies` is an own-property check, so 'constructor' / '__proto__' are
// rejected like any other unknown string.
export function sanitizePet(raw) {
  const pet = raw && typeof raw === 'object' ? raw : {};
  const shape =
    typeof pet.shape === 'string' && LEGACY_SHAPES.includes(pet.shape) ? pet.shape : null;
  const species = isSpecies(pet.species) ? pet.species : speciesOf({ shape });
  return {
    name: String(typeof pet.name === 'string' && pet.name.trim() ? pet.name : 'Mochi').slice(0, 18),
    color: typeof pet.color === 'string' && Object.hasOwn(COLORS, pet.color) ? pet.color : 'lilac',
    shape: shape || legacyShape(species),
    species,
  };
}
export function attachMultiplayer(wss) {
  const rooms = new Map();
  const send = (s, v) => {
    if (s.readyState === 1) s.send(JSON.stringify(v));
  };
  const publicState = (r) => ({
    code: r.code,
    mode: r.mode,
    // Explicit field list: only sanitized pet data reaches the other player, and
    // `species` is always present so both clients can render the real creature.
    players: r.players.map((p) => ({
      id: p.id,
      pet: { name: p.pet.name, color: p.pet.color, shape: p.pet.shape, species: p.pet.species },
      score: p.score,
      ready: !!p.move,
    })),
    round: r.round,
    phase: r.phase,
    history: r.history,
  });
  const broadcast = (r) =>
    r.players.forEach((p) => send(p.socket, { type: 'room', room: publicState(r) }));
  function leave(s) {
    const r = rooms.get(s.room);
    if (!r) return;
    r.players = r.players.filter((p) => p.socket !== s);
    r.players.forEach((p) => {
      send(p.socket, { type: 'left' });
      p.socket.room = null;
    });
    rooms.delete(r.code);
    s.room = null;
  }
  wss.on('connection', (s) => {
    s.alive = true;
    s.on('pong', () => (s.alive = true));
    let messages = 0;
    const limiter = setInterval(() => (messages = 0), 1000);
    limiter.unref();
    s.on('message', (raw) => {
      try {
        if (++messages > 20) return send(s, { type: 'error', message: 'Slow down a little.' });
        const m = JSON.parse(raw);
        if (m.type === 'leave') {
          leave(s);
          return;
        }
        if (m.type === 'create' || m.type === 'join') {
          leave(s);
          let r;
          if (m.type === 'create') {
            let code;
            do {
              code = randomBytes(3).toString('hex').toUpperCase();
            } while (rooms.has(code));
            r = {
              code,
              mode: m.mode === 'play' ? 'play' : 'duel',
              players: [],
              round: 1,
              phase: 'waiting',
              history: [],
              created: Date.now(),
            };
            rooms.set(code, r);
          } else {
            r = rooms.get(String(m.code).toUpperCase());
            if (!r || r.players.length >= 2)
              return send(s, { type: 'error', message: 'That garden is missing or already full.' });
          }
          const pet = sanitizePet(m.pet);
          const id = randomBytes(8).toString('hex');
          r.players.push({ id, pet, score: 0, move: null, socket: s });
          s.room = r.code;
          send(s, { type: 'identity', id });
          if (r.players.length === 2) r.phase = 'choosing';
          broadcast(r);
          return;
        }
        const r = rooms.get(s.room);
        if (!r) return;
        if (m.type === 'move' && r.phase === 'choosing' && MOVES[m.move]) {
          const player = r.players.find((p) => p.socket === s);
          if (!player || player.move) return;
          player.move = m.move;
          if (r.players.every((p) => p.move)) {
            const [a, b] = r.players;
            const result = roundResult(a.move, b.move);
            if (r.mode === 'play') {
              if (a.move === b.move) {
                a.score++;
                b.score++;
              }
            } else {
              if (result === 1) a.score++;
              if (result === -1) b.score++;
            }
            r.history.push({ round: r.round, moves: [a.move, b.move], result });
            r.phase = r.round >= 3 ? 'finished' : 'reveal';
          }
          broadcast(r);
        } else if (m.type === 'next' && r.phase === 'reveal') {
          r.round++;
          r.phase = 'choosing';
          r.players.forEach((p) => (p.move = null));
          broadcast(r);
        }
      } catch {
        send(s, { type: 'error', message: 'Could not read that action.' });
      }
    });
    s.on('close', () => {
      clearInterval(limiter);
      leave(s);
    });
    s.on('error', () => {});
  });
  const timer = setInterval(() => {
    for (const s of wss.clients) {
      if (!s.alive) s.terminate();
      else {
        s.alive = false;
        s.ping();
      }
    }
    for (const [code, r] of rooms)
      if (Date.now() - r.created > 3600000) {
        r.players.forEach((p) => {
          send(p.socket, { type: 'error', message: 'Room expired. Create a new garden.' });
          p.socket.close();
        });
        rooms.delete(code);
      }
  }, 30000);
  timer.unref();
  wss.on('close', () => clearInterval(timer));
  return { rooms };
}
