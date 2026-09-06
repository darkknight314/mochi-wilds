export const CREATURES = {
  dragon: {
    name: 'Pocket Dragon',
    color: 'peach',
    trait: 'Little wings. Big ambitions.',
    motion: 'Scampering',
    trick: 'Trying a flying hop',
    voice: 'dragon',
  },
  mothkit: {
    name: 'Mothkit',
    color: 'lilac',
    trait: 'A daydream in a wing cape.',
    motion: 'Following the fireflies',
    trick: 'Fluttering its wing cape',
    voice: 'mothkit',
  },
  otter: {
    name: 'Puddle Otter',
    color: 'sky',
    trait: 'A puddle with a personality.',
    motion: 'Waddling along',
    trick: 'Doing a jelly belly-slide',
    voice: 'otter',
  },
  imp: {
    name: 'Bloom Imp',
    color: 'mint',
    trait: 'A tiny, leafy mischief-maker.',
    motion: 'Hunting for treasures',
    trick: 'Sneezing a shower of petals',
    voice: 'imp',
  },
  ferret: {
    name: 'Comet Ferret',
    color: 'lilac',
    trait: 'A little streak of starlight.',
    motion: 'Weaving through the meadow',
    trick: 'Chasing its orbital tail',
    voice: 'ferret',
  },
};
export const SPECIES = Object.keys(CREATURES);
export const DEFAULT_SPECIES = 'dragon';
// Old saves (and old clients) only knew three abstract silhouettes. Each one maps
// onto a member of the roster so no existing companion is ever lost or reset.
const LEGACY_SHAPES = { cloud: 'dragon', star: 'mothkit', drop: 'otter' };
// The reverse map keeps the legacy `shape` field coherent for saves and for any
// client or server still reading it. Species without an original silhouette reuse
// the closest one.
const SHAPE_FOR_SPECIES = {
  dragon: 'cloud',
  mothkit: 'star',
  otter: 'drop',
  imp: 'cloud',
  ferret: 'star',
};
export const isSpecies = (value) =>
  typeof value === 'string' && Object.hasOwn(CREATURES, value) && value !== '__proto__';
export function speciesOf(pet = {}) {
  if (!pet || typeof pet !== 'object') return DEFAULT_SPECIES;
  if (isSpecies(pet.species)) return pet.species;
  // Preserve old saves and their progression; map the old silhouettes into the roster.
  if (typeof pet.shape === 'string' && Object.hasOwn(LEGACY_SHAPES, pet.shape))
    return LEGACY_SHAPES[pet.shape];
  return DEFAULT_SPECIES;
}
export const legacyShape = (species) =>
  Object.hasOwn(SHAPE_FOR_SPECIES, species) ? SHAPE_FOR_SPECIES[species] : 'cloud';
export const creatureOf = (pet) => CREATURES[speciesOf(pet)];
