const paths = {
  home: 'M3 10 12 3l9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z',
  heart:
    'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z',
  compass: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm4-16-2 8-8 2 2-8Z',
  sparkles: 'm12 3 2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4ZM20 2v4m-2-2h4',
  users:
    'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm8-7a4 4 0 0 1 0 8m5 9v-2a4 4 0 0 0-3-3.9',
  bag: 'M5 7h14l2 14H3ZM8 7V5a4 4 0 0 1 8 0v2',
  camera: 'M14.5 4h-5L7 7H3v13h18V7h-4Zm-2.5 6a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z',
  arrow: 'M5 12h14m-5-5 5 5-5 5',
  chevron: 'm9 5 7 7-7 7',
  close: 'm6 6 12 12M6 18 18 6',
  leaf: 'M20 3C3 1 0 14 7 18s17 1 13-15ZM5 21 16 10',
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-6v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1',
  moon: 'M21 13a9 9 0 1 1-10-10 7 7 0 0 0 10 10Z',
  zap: 'm13 2-9 12h7l-1 8 10-12h-7Z',
  check: 'm5 12 4 4L19 6',
  gem: 'm3 8 4-5h10l4 5-9 13ZM3 8h18M7 3l5 18 5-18',
  flower:
    'M12 9C3-3 0 12 9 12c-12 9 3 12 3 3 9 12 12-3 3-3 12-9-3-12-3-3Zm0 1a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z',
  circle: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z',
  walk: 'M13 4a1 1 0 1 0 0-2 1 1 0 0 0 0 2ZM7 21l4-7m5 7-3-7 1-7m-7 6 2-5 5-1 3 5h4',
  trophy: 'M8 3h8v6a4 4 0 0 1-8 0ZM8 5H4v3a4 4 0 0 0 4 4m8-7h4v3a4 4 0 0 1-4 4m-4 1v6m-4 2h8',
  settings:
    'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1Z',
  edit: 'm16 3 5 5-12 12-6 1 1-6ZM14 5l5 5',
  gift: 'M3 8h18v4H3Zm2 4v9h14v-9M12 8v13m0-13C0 8 7-3 12 8c5-11 12 0 0 0',
  volume: 'M11 4 5 9H2v6h3l6 5Zm4 4a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14',
  flag: 'M4 22V3c5-4 10 4 16 0v11c-6 4-11-4-16 0',
  book: 'M12 5C9 2 5 2 2 3v16c3-1 7-1 10 2 3-3 7-3 10-2V3c-3-1-7-1-10 2Zm0 0v16',
  copy: 'M9 9h12v12H9ZM5 15H3V3h12v2',
  wifi: 'M2 8a16 16 0 0 1 20 0M5 12a11 11 0 0 1 14 0m-11 4a6 6 0 0 1 8 0m-4 4h.01',
  pin: 'M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Zm-8-3a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z',
};
export const icon = (name, cls = '') =>
  `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name] || paths.sparkles}"/></svg>`;

// Mini portraits. Each species keeps its own silhouette — floppy ears and wings for
// the dragon, a wing cape and antennae for the mothkit, a jelly body for the otter,
// leaf ears for the imp, a long body and a tail ring for the ferret — so an avatar
// stays recognisable at 24px. Only the coat takes the player's colour; the signature
// accents stay on the pastel palette so silhouettes never blur together.
const PALETTE = {
  cream: '#fff1dd',
  pink: '#ecabc5',
  dusty: '#e6a7bd',
  mint: '#a4e5d0',
  leaf: '#8fd3b6',
  lilac: '#c9b2f1',
  gold: '#f4cf7a',
  ink: '#3b294b',
};
const eyes = (x1, x2, y, r = 1.9) =>
  `<circle cx="${x1}" cy="${y}" r="${r}" fill="${PALETTE.ink}"/><circle cx="${x2}" cy="${y}" r="${r}" fill="${PALETTE.ink}"/>`;
const shine = (cx, cy, rx = 3.4, ry = 2.3, a = -25) =>
  `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" transform="rotate(${a} ${cx} ${cy})" fill="#ffffff" opacity=".55"/>`;
const portraits = {
  dragon: (c) => `
    <path d="M18 18C13 6 3 2 3 2 0 11 4 19 13 22Z" fill="${PALETTE.mint}" opacity=".95"/>
    <path d="M30 18C35 6 45 2 45 2c3 9-1 17-10 20Z" fill="${PALETTE.mint}" opacity=".95"/>
    <path d="M13 20C4 22 1 33 6 41c6 2 10-4 9-12Z" fill="${c}"/>
    <path d="M35 20c9 2 12 13 7 21-6 2-10-4-9-12Z" fill="${c}"/>
    <path d="M18 13l2.4-6 2.4 6Zm7 0l2.4-6 2.4 6Z" fill="${PALETTE.lilac}"/>
    <ellipse cx="24" cy="27" rx="11.8" ry="11" fill="${c}"/>
    ${shine(17.5, 21)}
    <circle cx="42" cy="42" r="3.4" fill="${PALETTE.pink}"/>
    <ellipse cx="24" cy="32.5" rx="5" ry="3.4" fill="${PALETTE.cream}"/>
    ${eyes(19.5, 28.5, 26)}`,
  mothkit: (c) => `
    <path d="M23 32C10 38 1 31 3 19 5 9 15 10 23 21Z" fill="${PALETTE.dusty}" opacity=".92"/>
    <path d="M25 32c13 6 22-1 20-13-2-10-12-9-20 2Z" fill="${PALETTE.dusty}" opacity=".92"/>
    <path d="M20 15C17 8 12 5 7 7" stroke="${PALETTE.lilac}" stroke-width="2.1" fill="none" stroke-linecap="round"/>
    <path d="M28 15c3-7 8-10 13-8" stroke="${PALETTE.lilac}" stroke-width="2.1" fill="none" stroke-linecap="round"/>
    <circle cx="6" cy="7" r="2.3" fill="${PALETTE.pink}"/>
    <circle cx="42" cy="7" r="2.3" fill="${PALETTE.pink}"/>
    <ellipse cx="24" cy="28" rx="11" ry="10.4" fill="${c}"/>
    ${shine(18, 22)}
    <circle cx="15.5" cy="31" r="1.3" fill="${PALETTE.gold}"/>
    <circle cx="32.5" cy="31" r="1.3" fill="${PALETTE.gold}"/>
    <ellipse cx="24" cy="32.5" rx="4.2" ry="2.9" fill="${PALETTE.cream}"/>
    ${eyes(19.5, 28.5, 27)}`,
  otter: (c) => `
    <circle cx="14" cy="13" r="5.6" fill="${c}" opacity=".85"/>
    <circle cx="34" cy="13" r="5.6" fill="${c}" opacity=".85"/>
    <path d="M39 44c7-1 8-8 4-12" stroke="${c}" stroke-width="4.6" stroke-linecap="round" fill="none" opacity=".8"/>
    <ellipse cx="24" cy="27" rx="14" ry="15" fill="${c}" opacity=".78"/>
    <path d="M17 31c0-8 12-9 12-1 0 5-7 5-7 0" stroke="${PALETTE.pink}" stroke-width="2.4" fill="none" stroke-linecap="round" opacity=".85"/>
    <path d="M28 20c5 1 6 6 3 8" stroke="${PALETTE.mint}" stroke-width="2.2" fill="none" stroke-linecap="round" opacity=".9"/>
    ${shine(17, 18, 4, 2.6)}
    ${eyes(19, 29, 26, 1.8)}
    <path d="M22.5 31h3" stroke="${PALETTE.ink}" stroke-width="1.6" stroke-linecap="round"/>`,
  imp: (c) => `
    <path d="M19 21C10 19 2 11 3 2c10 0 17 9 16 19Z" fill="${c}"/>
    <path d="M29 21c9-2 17-10 16-19-10 0-17 9-16 19Z" fill="${c}"/>
    <path d="M17 19 6 5" stroke="${PALETTE.leaf}" stroke-width="1.5" stroke-linecap="round" opacity=".8"/>
    <path d="M31 19 42 5" stroke="${PALETTE.leaf}" stroke-width="1.5" stroke-linecap="round" opacity=".8"/>
    <path d="M40 44c5-1 6-5 4-8" stroke="${c}" stroke-width="3.6" stroke-linecap="round" fill="none"/>
    <g fill="${PALETTE.pink}"><circle cx="43" cy="34" r="2.1"/><circle cx="39.5" cy="32" r="2.1"/><circle cx="45.4" cy="32" r="2.1"/><circle cx="42.7" cy="29.5" r="2.1"/></g>
    <ellipse cx="24" cy="30" rx="11.6" ry="10.8" fill="${c}"/>
    ${shine(17.5, 24)}
    <ellipse cx="10" cy="41" rx="4.4" ry="3.4" fill="${PALETTE.lilac}"/>
    <ellipse cx="24" cy="34" rx="4.4" ry="3" fill="${PALETTE.cream}"/>
    ${eyes(19.5, 28.5, 28)}`,
  ferret: (c) => `
    <path d="M39 36c7-2 8-9 4-13" stroke="${c}" stroke-width="4.4" stroke-linecap="round" fill="none"/>
    <ellipse cx="41.6" cy="21" rx="6.2" ry="2.7" transform="rotate(-16 41.6 21)" fill="none" stroke="${PALETTE.gold}" stroke-width="2.1"/>
    <ellipse cx="27" cy="32" rx="16" ry="8.2" transform="rotate(-15 27 32)" fill="${c}"/>
    <circle cx="10.5" cy="15" r="4.2" fill="${c}"/>
    <circle cx="21" cy="12" r="4.2" fill="${c}"/>
    <ellipse cx="15" cy="21" rx="9.6" ry="8.8" fill="${c}"/>
    ${shine(10, 16, 3, 2)}
    <g fill="${PALETTE.gold}"><circle cx="26" cy="27" r="1.4"/><circle cx="32" cy="30" r="1.2"/><circle cx="21" cy="31" r="1.2"/></g>
    <ellipse cx="15" cy="25.5" rx="4.6" ry="3.4" fill="${PALETTE.cream}"/>
    ${eyes(11, 19.5, 20, 1.7)}
    <circle cx="15" cy="24.5" r="1.3" fill="${PALETTE.pink}"/>`,
};
export const SPECIES_PORTRAITS = Object.keys(portraits);
export const portrait = (species, color = '#c9b2f1', label = '') =>
  `<svg class="portrait" viewBox="0 0 48 48" ${label ? `role="img" aria-label="${label}"` : 'aria-hidden="true"'} xmlns="http://www.w3.org/2000/svg">${(Object.hasOwn(portraits, species) ? portraits[species] : portraits.dragon)(color)}</svg>`;
