import { newPet, evolve, clamp, COLORS, CATALOG, SAVE_VERSION } from './game.js';
import { speciesOf, legacyShape } from './creatures.js';
const KEY = 'mochi-wilds-v1';
const ACCESSORIES = CATALOG.filter((i) => i.kind === 'accessory').map((i) => i.id);
const HABITATS = ['day', ...CATALOG.filter((i) => i.kind === 'habitat').map((i) => i.id)];
const num = (value, fallback, min = -Infinity, max = Infinity) =>
  Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
const has = (object, key) => !!object && typeof object === 'object' && Object.hasOwn(object, key);
const pick = (value, allowed, fallback) =>
  typeof value === 'string' && allowed.includes(value) ? value : fallback;

// Migration is additive and never destructive: an unreadable field falls back to the
// fresh-pet default while every readable field is carried across untouched. A save is
// only ever replaced wholesale when it is not an object at all (corrupt / unparseable).
export function migrate(raw, now = Date.now()) {
  const base = newPet(now);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base;
  const p = { ...base };
  p.version = SAVE_VERSION;
  if (typeof raw.name === 'string' && raw.name.trim()) p.name = raw.name.slice(0, 40);
  p.color = has(COLORS, raw.color) ? raw.color : base.color;
  // `species` is the source of truth; a legacy save derives it from its old shape.
  p.species = speciesOf(raw);
  // The legacy `shape` field stays populated so older saves and older peers keep working.
  p.shape = pick(raw.shape, ['cloud', 'star', 'drop'], legacyShape(p.species));
  p.accessory = pick(raw.accessory, ['none', ...ACCESSORIES], 'none');
  p.habitat = pick(raw.habitat, HABITATS, 'day');
  p.created = typeof raw.created === 'boolean' ? raw.created : Boolean(raw.name);
  p.birthday = num(raw.birthday, base.birthday, 0);
  p.health = clamp(num(raw.health, base.health));
  p.affection = clamp(num(raw.affection, base.affection));
  p.energy = clamp(num(raw.energy, base.energy));
  p.xp = num(raw.xp, base.xp, 0);
  // Older builds called the wallet `currency`; both spellings are honoured.
  p.coins = num(Number.isFinite(raw.coins) ? raw.coins : raw.currency, base.coins, 0);
  p.totalMeters = num(raw.totalMeters, 0, 0);
  p.streak = Math.floor(num(raw.streak, 0, 0));
  p.lastUpdated = num(raw.lastUpdated, now, 0);
  p.lastCare = num(raw.lastCare, p.lastUpdated, 0);
  p.lastAffection = num(raw.lastAffection, 0, 0);
  p.lastClaim = typeof raw.lastClaim === 'string' ? raw.lastClaim : null;
  p.day = typeof raw.day === 'string' ? raw.day : base.day;
  p.owned = Array.isArray(raw.owned)
    ? [...new Set(raw.owned.filter((id) => typeof id === 'string'))]
    : [];
  p.receipts = Array.isArray(raw.receipts)
    ? raw.receipts.filter((r) => r && typeof r === 'object' && typeof r.sku === 'string')
    : [];
  p.memories = Array.isArray(raw.memories)
    ? raw.memories.filter((m) => m && typeof m === 'object' && typeof m.title === 'string')
    : [];
  const daily = raw.daily && typeof raw.daily === 'object' ? raw.daily : {};
  p.daily = {
    affection: num(daily.affection, 0, 0),
    meters: num(daily.meters, 0, 0),
    play: num(daily.play, 0, 0),
    claimed: daily.claimed === true,
  };
  return p;
}
export function load(now = Date.now()) {
  let raw = null;
  try {
    raw = JSON.parse(localStorage.getItem(KEY));
  } catch {
    raw = null;
  }
  try {
    return evolve(migrate(raw, now), now);
  } catch {
    return newPet(now);
  }
}
export function save(p) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
    return true;
  } catch {
    return false;
  }
}
export function identity() {
  let id = localStorage.getItem('mochi-identity');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('mochi-identity', id);
  }
  return id;
}
