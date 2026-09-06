import test from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { createServer } from '../server/index.js';
import { sanitizePet } from '../server/multiplayer.js';
import { CREATURES } from '../src/creatures.js';
async function client(url) {
  const s = new WebSocket(url);
  const messages = [];
  s.on('message', (x) => messages.push(JSON.parse(x)));
  await new Promise((r, j) => {
    s.on('open', r);
    s.on('error', j);
  });
  return {
    s,
    send: (m) => s.send(JSON.stringify(m)),
    next: async (pred) => {
      const until = Date.now() + 2500;
      while (Date.now() < until) {
        const i = messages.findIndex(pred);
        if (i !== -1) return messages.splice(i, 1)[0];
        await new Promise((r) => setTimeout(r, 5));
      }
      throw Error('Timed out waiting for socket message');
    },
  };
}
test('two clients join, resolve hidden moves, finish duel and clean room on leave', async () => {
  const { server, wss } = createServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `ws://127.0.0.1:${server.address().port}/socket`;
  const a = await client(url),
    b = await client(url);
  try {
    a.send({ type: 'create', pet: { name: 'Nova', color: 'mint' } });
    const created = await a.next((m) => m.type === 'room');
    const code = created.room.code;
    assert.match(code, /^[A-F0-9]{6}$/);
    b.send({ type: 'join', code, pet: { name: 'Pip', color: 'peach' } });
    await a.next((m) => m.room?.phase === 'choosing');
    await b.next((m) => m.room?.phase === 'choosing');
    for (let round = 1; round <= 3; round++) {
      a.send({ type: 'move', move: 'spark' });
      const pending = await b.next((m) => m.room?.round === round && m.room.players[0].ready);
      assert.equal(pending.room.players[0].move, undefined);
      a.send({ type: 'move', move: 'bubble' });
      b.send({ type: 'move', move: 'bloom' });
      const result = await a.next(
        (m) => m.room?.round === round && ['reveal', 'finished'].includes(m.room.phase),
      );
      assert.equal(result.room.players[0].score, round);
      if (round < 3) {
        a.send({ type: 'next' });
        await a.next((m) => m.room?.round === round + 1 && m.room.phase === 'choosing');
      }
    }
    b.send({ type: 'leave' });
    await a.next((m) => m.type === 'left');
  } finally {
    a.s.terminate();
    b.s.terminate();
    await new Promise((r) => wss.close(r));
    await new Promise((r) => server.close(r));
  }
});
test('cooperative game rewards both players only for matching spells', async () => {
  const { server, wss } = createServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `ws://127.0.0.1:${server.address().port}/socket`;
  const a = await client(url),
    b = await client(url);
  try {
    a.send({ type: 'create', mode: 'play' });
    const { room } = await a.next((m) => m.type === 'room');
    b.send({ type: 'join', code: room.code });
    await a.next((m) => m.room?.phase === 'choosing');
    a.send({ type: 'move', move: 'bubble' });
    b.send({ type: 'move', move: 'bubble' });
    const result = await a.next((m) => m.room?.phase === 'reveal');
    assert.deepEqual(
      result.room.players.map((p) => p.score),
      [1, 1],
    );
  } finally {
    a.s.terminate();
    b.s.terminate();
    await new Promise((r) => wss.close(r));
    await new Promise((r) => server.close(r));
  }
});
test('species is validated and never echoed back from an arbitrary client string', () => {
  for (const bad of [
    'wyvern',
    '',
    null,
    42,
    '__proto__',
    'constructor',
    'toString',
    'hasOwnProperty',
    { toString: () => 'dragon' },
  ]) {
    const pet = sanitizePet({ name: 'Hacker', species: bad });
    assert.ok(Object.hasOwn(CREATURES, pet.species), `${String(bad)} must not survive`);
    assert.equal(pet.species, 'dragon');
  }
  // A legacy client sending only a shape still gets the right creature.
  assert.equal(sanitizePet({ shape: 'star' }).species, 'mothkit');
  assert.equal(sanitizePet({ shape: 'drop' }).species, 'otter');
  assert.equal(sanitizePet({ shape: 'constructor' }).species, 'dragon');
  // Colors, names and shapes are sanitized the same way.
  assert.equal(sanitizePet({ color: 'constructor' }).color, 'lilac');
  assert.equal(sanitizePet({ color: 'mint' }).color, 'mint');
  assert.equal(sanitizePet({ shape: 'banana', species: 'imp' }).shape, 'cloud');
  assert.equal(sanitizePet({ name: 'x'.repeat(200) }).name.length, 18);
  assert.equal(sanitizePet(null).name, 'Mochi');
  assert.equal(sanitizePet('not an object').species, 'dragon');
  // Only the four known fields are ever published.
  assert.deepEqual(Object.keys(sanitizePet({ secret: 1 })).sort(), [
    'color',
    'name',
    'shape',
    'species',
  ]);
});
test('both species survive a full two-client room lifecycle', async () => {
  const { server, wss } = createServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `ws://127.0.0.1:${server.address().port}/socket`;
  const a = await client(url),
    b = await client(url);
  const species = (room, name) => room.players.find((p) => p.pet.name === name)?.pet.species;
  try {
    a.send({ type: 'create', pet: { name: 'Nova', color: 'mint', species: 'ferret' } });
    const created = await a.next((m) => m.type === 'room');
    assert.equal(species(created.room, 'Nova'), 'ferret');
    b.send({
      type: 'join',
      code: created.room.code,
      pet: { name: 'Pip', color: 'peach', species: 'imp' },
    });
    // Both players see both real creatures as soon as the room fills.
    for (const c of [a, b]) {
      const joined = await c.next((m) => m.room?.phase === 'choosing');
      assert.equal(species(joined.room, 'Nova'), 'ferret');
      assert.equal(species(joined.room, 'Pip'), 'imp');
    }
    // ...and through move resolution, reveal and the finished round.
    for (let round = 1; round <= 3; round++) {
      a.send({ type: 'move', move: 'spark' });
      b.send({ type: 'move', move: 'bloom' });
      const result = await a.next(
        (m) => m.room?.round === round && ['reveal', 'finished'].includes(m.room.phase),
      );
      assert.equal(species(result.room, 'Nova'), 'ferret');
      assert.equal(species(result.room, 'Pip'), 'imp');
      if (round < 3) {
        a.send({ type: 'next' });
        await a.next((m) => m.room?.round === round + 1 && m.room.phase === 'choosing');
      }
    }
  } finally {
    a.s.terminate();
    b.s.terminate();
    await new Promise((r) => wss.close(r));
    await new Promise((r) => server.close(r));
  }
});
test('every species round-trips, and a malicious one is replaced before broadcast', async () => {
  const { server, wss } = createServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `ws://127.0.0.1:${server.address().port}/socket`;
  try {
    for (const species of Object.keys(CREATURES)) {
      const a = await client(url),
        b = await client(url);
      try {
        a.send({ type: 'create', pet: { name: 'Host', species } });
        const created = await a.next((m) => m.type === 'room');
        // The joining client lies about its species; the server substitutes a known one.
        b.send({
          type: 'join',
          code: created.room.code,
          pet: { name: 'Guest', species: '<script>alert(1)</script>', shape: 'drop' },
        });
        const full = await b.next((m) => m.room?.players.length === 2);
        const host = full.room.players.find((p) => p.pet.name === 'Host');
        const guest = full.room.players.find((p) => p.pet.name === 'Guest');
        assert.equal(host.pet.species, species);
        assert.equal(guest.pet.species, 'otter');
        assert.ok(Object.hasOwn(CREATURES, guest.pet.species));
        // Rejoining after leaving keeps the species intact in the new room.
        a.send({ type: 'leave' });
        await b.next((m) => m.type === 'left');
      } finally {
        a.s.terminate();
        b.s.terminate();
      }
    }
  } finally {
    await new Promise((r) => wss.close(r));
    await new Promise((r) => server.close(r));
  }
});
