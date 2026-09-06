export const COLORS = {
  lilac: '#c9b2f1',
  peach: '#ffbdaa',
  mint: '#a7dfcd',
  sky: '#add8f5',
  butter: '#f2d78e',
};
export const CATALOG = [
  {
    id: 'halo',
    name: 'Stardust halo',
    description: 'A little orbit of everyday magic.',
    price: 1.99,
    kind: 'accessory',
    icon: 'sparkles',
    color: 'lavender',
  },
  {
    id: 'flower',
    name: 'Bloom crown',
    description: 'For your garden-variety daydreamer.',
    price: 1.99,
    kind: 'accessory',
    icon: 'flower',
    color: 'pink',
  },
  {
    id: 'prism',
    name: 'Prism heart',
    description: 'Earn 25% more care experience. Forever.',
    price: 2.99,
    kind: 'upgrade',
    icon: 'gem',
    color: 'mint',
  },
  {
    id: 'moon',
    name: 'Moonlight garden',
    description: 'A dreamy new look for your little world.',
    price: 3.99,
    kind: 'habitat',
    icon: 'moon',
    color: 'blue',
  },
];
// v1 saves stored an abstract `shape` only. v2 adds `species`; storage.migrate()
// upgrades v1 (and unversioned) saves in place without dropping any progress.
export const SAVE_VERSION = 2;
export const clamp = (n, min = 0, max = 100) => Math.min(max, Math.max(min, n));
export const dayKey = (time = Date.now()) => new Date(time).toISOString().slice(0, 10);
export function newPet(now = Date.now()) {
  return {
    version: SAVE_VERSION,
    birthday: now,
    name: 'Mochi',
    species: 'dragon',
    color: 'lilac',
    shape: 'cloud',
    accessory: 'none',
    habitat: 'day',
    created: false,
    health: 88,
    affection: 72,
    energy: 84,
    xp: 120,
    coins: 240,
    owned: [],
    receipts: [],
    lastCare: now,
    lastUpdated: now,
    lastAffection: 0,
    day: dayKey(now),
    daily: { affection: 0, meters: 0, play: 0, claimed: false },
    totalMeters: 0,
    memories: [],
    streak: 0,
    lastClaim: null,
  };
}
export function evolve(pet, now = Date.now()) {
  const p = structuredClone(pet);
  const elapsed = Math.max(0, now - p.lastUpdated) / 3600000;
  p.health = clamp(p.health - elapsed * 0.8);
  p.affection = clamp(p.affection - elapsed * 1.8);
  p.energy = clamp(p.energy - elapsed * 0.6);
  const neglected = Math.max(0, now - Math.max(p.lastUpdated, p.lastCare + 24 * 3600000)) / 3600000;
  p.xp = Math.max(0, p.xp - neglected * 2);
  p.lastUpdated = Math.max(p.lastUpdated, now);
  if (p.day !== dayKey(now)) {
    p.day = dayKey(now);
    p.daily = { affection: 0, meters: 0, play: 0, claimed: false };
  }
  return p;
}
export const level = (p) => 1 + Math.floor(Math.sqrt(p.xp / 100));
export function progress(p) {
  const l = level(p);
  return { level: l, value: p.xp - (l - 1) ** 2 * 100, max: (l * l - (l - 1) ** 2) * 100 };
}
function reward(p, xp) {
  p.xp += xp * (p.owned.includes('prism') ? 1.25 : 1);
}
export function care(pet, action, now = Date.now(), amount = 0) {
  const p = evolve(pet, now);
  if (action === 'affection') {
    if (now - p.lastAffection < 3000) return p;
    p.lastAffection = now;
    p.affection = clamp(p.affection + 9);
    p.health = clamp(p.health + 2);
    p.daily.affection++;
    reward(p, 8);
    p.lastCare = now;
  } else if (action === 'walk') {
    const meters = clamp(Number(amount) || 0, 0, 5000);
    if (meters < 1) return p;
    p.daily.meters += meters;
    p.totalMeters += meters;
    p.health = clamp(p.health + meters / 35);
    p.energy = clamp(p.energy + meters / 60);
    reward(p, meters / 8);
    p.coins += Math.floor(meters / 25);
    p.lastCare = now;
  } else if (action === 'play') {
    p.daily.play++;
    p.affection = clamp(p.affection + 6);
    p.energy = clamp(p.energy + 3);
    reward(p, 25);
    p.coins += 20;
    p.lastCare = now;
  } else if (action === 'claim') {
    if (p.daily.claimed || p.daily.affection < 3 || p.daily.meters < 300 || p.daily.play < 1)
      return p;
    p.daily.claimed = true;
    p.coins += 100;
    reward(p, 50);
    p.streak = p.lastClaim === dayKey(now - 86400000) ? p.streak + 1 : 1;
    p.lastClaim = dayKey(now);
  }
  return p;
}
export function purchase(pet, sku, now = Date.now()) {
  const item = CATALOG.find((i) => i.id === sku);
  if (!item) throw Error('Unknown item');
  if (pet.owned.includes(sku)) return pet;
  const p = structuredClone(pet);
  p.owned.push(sku);
  p.receipts.push({
    id: `sandbox-${sku}-${now}`,
    sku,
    at: now,
    provider: 'sandbox',
    amount: item.price,
  });
  if (item.kind === 'accessory') p.accessory = sku;
  if (item.kind === 'habitat') p.habitat = sku;
  return p;
}
export function distance(a, b) {
  const r = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * r,
    dLon = (b.longitude - a.longitude) * r;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.latitude * r) * Math.cos(b.latitude * r) * Math.sin(dLon / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
export function validSegment(a, b) {
  if (!a || !b || a.accuracy > 35 || b.accuracy > 35) return 0;
  const dt = (b.timestamp - a.timestamp) / 1000;
  if (dt <= 0 || dt > 90) return 0;
  const d = distance(a, b);
  return d >= 3 && d / dt <= 4.5 ? d : 0;
}
export const MOVES = {
  spark: { name: 'Spark', icon: 'zap', beats: 'bloom' },
  bloom: { name: 'Bloom', icon: 'flower', beats: 'bubble' },
  bubble: { name: 'Bubble', icon: 'circle', beats: 'spark' },
};
export function roundResult(a, b) {
  if (!MOVES[a] || !MOVES[b]) throw Error('Invalid move');
  return a === b ? 0 : MOVES[a].beats === b ? 1 : -1;
}
