// The contest crowd's townsfolk, dressed from a seed (no DOM, no three.js: node checks
// them with tools/crowdtest.mjs). Each one is a character spec in the same format as the
// named villagers (src/voxel/models/characters.js), assembled from the village's parts:
// body build (kid, slim, average, stocky, tall, elderly), a skin tone, a hair style and
// colour, a hat (toques, ball caps, earmuffs, berets, flat caps...), a scarf, a top (plaid
// jackets, puffy vests, hoodies, fleeces, cardigans, Nordic sweaters, raincoats) and
// trousers or a skirt, plus a part to play at the contest (src/game/crowd.js): carving at
// a table, chatting in a little group, sipping cider, taking photos, admiring the
// entries, kids playing tag, a couple holding hands, a dog walker, a parent with a
// stroller (and a kid in tow), and two elders with canes.
import { SKIN_TONES } from '../voxel/models/characters.js';

// a small seeded random number generator (mulberry32)
export function rng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { next, range: (lo, hi) => lo + next() * (hi - lo), int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)), pick: (arr) => arr[Math.floor(next() * arr.length)], chance: (p) => next() < p };
}

const S = SKIN_TONES;
const SKINS = [S.fair, S.rosy, S.tan, S.brown, S.deep, S.pale, S.olive, S.golden, S.umber, S.mahogany];
const HAIR = { black: 0x1e1418, dark: 0x3a2418, brown: 0x6a3a1e, auburn: 0xa0401c, ginger: 0xc8641e, blonde: 0xe8c068, sandy: 0xb8925a, grey: 0x9a9894, white: 0xeae6ee, silver: 0xc8c4c8 };
const YOUNG_HAIR = ['black', 'dark', 'brown', 'auburn', 'ginger', 'blonde', 'sandy'];
// autumn knitwear and outdoor colours
const KNIT = [0xc8361f, 0x2f6e3a, 0x2a5aa8, 0xe8a02a, 0x7a3a8a, 0xd86a8a, 0x1e7a7a, 0xf2e6cc, 0x8a2a2a, 0x4a4a5a, 0xe86a1e];
const JACKET = [0xc8261e, 0x2f6e3a, 0x2a4a8a, 0x8a5a2a, 0x5a2a4a, 0x3a5a3a, 0xb8441e, 0x6a6a72];
const VEST = [0x2a3a5a, 0xc8361f, 0x3a6a3a, 0x1e1e26, 0xe8a02a, 0x5a2a6a, 0x2a7a8a];
const SHIRT = [0xf0e6d0, 0x9ab8d8, 0xc8a8d8, 0xd8c8a8, 0x8ab88a, 0xe8d8c8];
const PANTS = [0x2a3a5a, 0x34507e, 0x3a3a46, 0x5a4a32, 0x22222a, 0x4a3a2a, 0x6a5a4a];
const SHOES = [0x3a2618, 0x1e1418, 0x5a3420, 0x2a2a30, 0x6a4a3a, 0xf6f0e6];
const SKIRT = [0x6a4a8a, 0x8a2a3a, 0x2a4a3a, 0x5a3a52, 0x3a3a5a, 0xa8541e];

// body builds (voxel units, like the named villagers)
const BUILDS = {
  kid: (r) => ({ head: { w: 11, h: 10, d: 10 }, torso: { w: r.int(8, 10), h: 7, d: 6, belly: 0 }, arm: { len: 7, t: 2 }, leg: { len: r.int(6, 8), t: 3 } }),
  toddler: () => ({ head: { w: 10, h: 10, d: 10 }, torso: { w: 8, h: 6, d: 6, belly: 1 }, arm: { len: 6, t: 2 }, leg: { len: 5, t: 3 } }),
  slim: (r) => ({ head: { w: 10, h: 11, d: 10 }, torso: { w: r.int(8, 10), h: r.int(11, 13), d: 6 }, arm: { len: r.int(12, 14), t: r.pick([2, 3]) }, leg: { len: r.int(14, 17), t: 3 } }),
  average: (r) => ({ head: { w: r.int(10, 12), h: 11, d: r.int(10, 11) }, torso: { w: r.int(11, 13), h: r.int(11, 13), d: r.int(7, 8), belly: r.int(0, 1) }, arm: { len: r.int(11, 13), t: 3 }, leg: { len: r.int(12, 15), t: 3 } }),
  stocky: (r) => ({ head: { w: 12, h: 11, d: 11 }, torso: { w: r.int(14, 16), h: r.int(10, 12), d: r.int(9, 10), belly: r.int(1, 3) }, arm: { len: r.int(10, 12), t: 4 }, leg: { len: r.int(8, 11), t: 4 } }),
  tall: (r) => ({ head: { w: r.int(10, 11), h: 11, d: 10 }, torso: { w: r.int(11, 13), h: r.int(13, 14), d: 7 }, arm: { len: r.int(13, 15), t: 3 }, leg: { len: r.int(16, 18), t: 3 } }),
  elder: (r) => ({ head: { w: r.int(11, 12), h: 11, d: 11, chub: r.pick([0, 0.6]) }, torso: { w: r.int(12, 14), h: r.int(9, 11), d: r.int(8, 10), belly: r.int(1, 2) }, arm: { len: r.int(9, 11), t: 3 }, leg: { len: r.int(6, 10), t: 3 } }),
};

// who is in the crowd: a part each (see crowd.js), and what kind of body they have
// (gender only steers hair, beards and skirts a little; plenty of mixing either way)
export const ROSTER = [
  // carving at the tables' spare places and the two new tables at the east end
  { role: 'carve', build: 'average', slot: 0 },
  { role: 'carve', build: 'stocky', slot: 1, beard: true },
  { role: 'carve', build: 'tall', slot: 2 },
  { role: 'carve', build: 'elder', slot: 3 },
  { role: 'carve', build: 'kid', slot: 4, kid: true },
  { role: 'carve', build: 'kid', slot: 5, kid: true },
  // two little groups chatting, laughing, pointing at the pumpkins
  { role: 'chat', build: 'average', group: 0 },
  { role: 'chat', build: 'slim', group: 0 },
  { role: 'chat', build: 'stocky', group: 0, beard: true },
  { role: 'chat', build: 'tall', group: 1 },
  { role: 'chat', build: 'elder', group: 1 },
  { role: 'chat', build: 'average', group: 1 },
  // hot cider by the judges' table
  { role: 'cider', build: 'average', slot: 0 },
  { role: 'cider', build: 'slim', slot: 1 },
  // wandering from table to table for a look (pointing, a hum, a nod)
  { role: 'admire', build: 'average' },
  { role: 'admire', build: 'tall' },
  { role: 'admire', build: 'stocky' },
  // the photographer
  { role: 'photo', build: 'slim' },
  // three kids playing tag on the sidewalk (through the leaf piles)
  { role: 'tag', build: 'kid', kid: true },
  { role: 'tag', build: 'kid', kid: true },
  { role: 'tag', build: 'kid', kid: true },
  // a couple out for a stroll, holding hands
  { role: 'couple', build: 'tall', lead: true },
  { role: 'couple', build: 'average' },
  // someone walking their dog on a leash
  { role: 'dog', build: 'slim' },
  // a parent pushing a stroller with a baby in it, a kid tagging along behind
  { role: 'stroller', build: 'average' },
  { role: 'tagalong', build: 'toddler', kid: true },
  // two elders with canes, taking it all in
  { role: 'elder', build: 'elder', cane: true, slot: 0 },
  { role: 'elder', build: 'elder', cane: true, slot: 1 },
];

const NAMES = ['Earl', 'Maureen', 'Gaston', 'Dot', 'Reggie', 'Lise', 'Ferg', 'Yvette', 'Clem', 'Bev', 'Normand', 'Shirley', 'Kwame', 'Anik', 'Wade', 'Priya', 'Hector', 'Lorna', 'Mei', 'Gord', 'Solange', 'Rory', 'Tess', 'Omar', 'Babette', 'Lyle', 'June', 'Aurelio'];
const KID_NAMES = ['Tucker', 'Zoe', 'Remi', 'Ava', 'Leo', 'Mila', 'Felix', 'Nora', 'Jojo'];

// one townsperson's spec: the body, then clothes that suit their part
export function dressTownsperson(entry, seed) {
  const r = rng(seed * 7919 + 13);
  const kid = !!entry.kid;
  const elder = entry.build === 'elder';
  const fem = r.chance(0.5);
  const body = BUILDS[entry.build](r);
  const skin = r.pick(SKINS);
  const spec = { name: '', skin, ...body, eyes: kid ? 'bean' : r.pick(fem ? ['lash', 'bean', 'round'] : ['bean', 'tiny', 'round']), crowd: true };
  if (kid || r.chance(0.35)) spec.blush = true;
  // hair
  const hc = elder ? HAIR[r.pick(['grey', 'white', 'silver'])] : HAIR[r.pick(YOUNG_HAIR)];
  const styles = kid ? ['short', 'messy', 'pony', 'curly', 'bob'] : elder ? (fem ? ['bun', 'curly', 'short'] : ['bald', 'short', 'curly']) : fem ? ['long', 'bob', 'pony', 'braid', 'curly', 'bun'] : ['short', 'messy', 'curly', 'bald', 'long'];
  spec.hair = { style: r.pick(styles), color: hc };
  if (!kid && !fem && (entry.beard || r.chance(0.3))) spec.beard = { style: 'full', color: elder ? HAIR.white : hc };
  else if (!kid && !fem && r.chance(0.25)) spec.mustache = hc;
  if (elder || r.chance(kid ? 0.08 : 0.2)) spec.glasses = r.pick(['round', 'square', 'cateye']);
  if (!kid && r.chance(0.3)) spec.brows = 'bushy';
  // a hat (most people, it's October)
  const hatRoll = r.next();
  const knit = r.pick(KNIT);
  if (kid) spec.hat = hatRoll < 0.55 ? { type: 'toque', color: knit, band: r.pick(KNIT), pom: r.pick(KNIT) } : hatRoll < 0.75 ? { type: 'earmuffs', color: r.pick([0xd86a8a, 0xf2e6cc, 0x2a5aa8, 0xe8a02a]) } : hatRoll < 0.9 ? { type: 'cap', color: r.pick(JACKET) } : null;
  else if (elder) spec.hat = hatRoll < 0.4 ? { type: 'flatcap', color: r.pick([0x6a5a4a, 0x4a4a52, 0x5a4a32]) } : hatRoll < 0.65 ? { type: 'beret', color: r.pick([0x8a1e2a, 0x2a3a5a, 0x3a5a3a]) } : hatRoll < 0.85 ? { type: 'toque', color: knit, band: r.pick(KNIT), pom: 0xf6f0e6 } : null;
  else spec.hat = hatRoll < 0.38 ? { type: 'toque', color: knit, band: r.pick(KNIT), pom: r.pick(KNIT) } : hatRoll < 0.5 ? { type: 'cap', color: r.pick(JACKET) } : hatRoll < 0.6 ? { type: 'earmuffs', color: r.pick([0xd86a8a, 0xf2e6cc, 0x1e1e26, 0xc8361f]) } : hatRoll < 0.68 ? { type: 'headband', color: knit } : hatRoll < 0.76 ? { type: 'trapper', color: r.pick([0x6a4a2e, 0x2a3a5a]), fur: 0xd8c8a8 } : hatRoll < 0.84 ? { type: 'beret', color: r.pick([0x8a1e2a, 0x1e1e26, 0x2a5a3a]) } : null;
  if (!spec.hat) delete spec.hat;
  // (a toque or earmuffs over long hair: tidy it into a bob so the hat sits right)
  if (spec.hat && spec.hair.style === 'bald' && spec.hat.type !== 'cap') spec.hair.style = 'short';
  // the top
  const topRoll = r.next();
  if (topRoll < 0.26) spec.top = { type: 'plaid', color: r.pick(JACKET), accent: 0x1e1418 };
  else if (topRoll < 0.46) {
    const under = r.pick([...SHIRT, ...JACKET]);
    spec.top = { type: 'puffy', color: r.pick(VEST), accent: 0xc8ccd2, under, underPlaid: JACKET.includes(under) };
  } else if (topRoll < 0.58) spec.top = { type: 'hoodie', color: r.pick([...KNIT, 0x6a6a72]), accent: 0xf2ece0 };
  else if (topRoll < 0.68) spec.top = { type: 'fleece', color: r.pick([0x2f6e3a, 0x2a4a8a, 0x8a2a3a, 0x4a4a5a, 0xe8a02a]), accent: 0x1e1e26 };
  else if (topRoll < 0.8) spec.top = { type: elder ? 'cardigan' : 'nordic', color: r.pick(KNIT), accent: r.pick([0xf2e6cc, 0xf6f0e6, 0x2a2a3a]) };
  else if (topRoll < 0.9) spec.top = { type: 'raincoat', color: r.pick([0xf2c430, 0xc8361f, 0x2a5aa8, 0x2f6e3a]), accent: 0x8a6a2a };
  else spec.top = { type: 'coat', color: r.pick([0x5a3a2a, 0x2a2a3a, 0x8a6a4a, 0x3a4a5a]), accent: 0xf2c443 };
  if (kid && r.chance(0.4)) spec.top = { type: 'jersey', color: r.pick([0xc8261e, 0x2a5aa8, 0x2f6e3a, 0xf2c430]), accent: 0xf6f0e6 };
  // legs (or a skirt) and shoes
  if (fem && !kid && r.chance(elder ? 0.6 : 0.25)) spec.skirt = { color: r.pick(SKIRT), len: Math.max(4, Math.min(8, spec.leg.len - 4)) };
  else spec.legs = { color: r.pick(PANTS) };
  if (spec.skirt) { spec.legs = { color: 0x3a2a2a }; }
  spec.shoes = r.pick(SHOES);
  if (r.chance(0.35)) spec.boots = true;
  // a scarf (no long cloth ends: the townsfolk's scarves are the knotted ring)
  if (r.chance(kid ? 0.35 : 0.45) && spec.top.type !== 'hoodie') {
    const sc = r.pick(KNIT);
    spec.scarf = { color: sc, stripe: r.chance(0.5) ? r.pick(KNIT) : sc, short: true };
  }
  spec.voice = kid ? 'pip' : elder ? (fem ? 'agnes' : 'ollie') : fem ? r.pick(['marie', 'ingrid', 'josee']) : r.pick(['doug', 'lou', 'birdie']);
  return { spec, fem };
}

// personalities: how they stand, walk and fidget
function personaFor(entry, r) {
  if (entry.kid) return { idle: 'loose', walk: 'skip', bounce: r.range(1.4, 1.7), gest: 1.4, fidgets: ['look', 'hop', 'spin', 'tap'] };
  if (entry.build === 'elder') return { idle: r.pick(['clasp', 'behind']), walk: 'slow', bounce: 0.7, gest: 0.8, fidgets: ['look', 'glasses', 'scratch'] };
  return { idle: r.pick(['loose', 'cross', 'hips', 'clasp', 'behind']), walk: r.pick(['normal', 'normal', 'bouncy', 'strut', 'lumber', 'waddle']), bounce: r.range(0.8, 1.25), gest: r.range(0.8, 1.4), fidgets: r.pick([['look', 'scratch', 'tap'], ['look', 'hair', 'watch'], ['look', 'stretch', 'hum'], ['look', 'glasses', 'tap']]) };
}

// the whole crowd: [{ id, i, name, role, kid, spec, persona, entry }]
export function makeCrowd(seed = 1031) {
  const out = [];
  let kidN = 0, adultN = 0;
  const nr = rng(seed);
  const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(nr.next() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const names = shuffle(NAMES), kidNames = shuffle(KID_NAMES);
  ROSTER.forEach((entry, i) => {
    const s = seed + i * 101;
    const { spec, fem } = dressTownsperson(entry, s);
    const r = rng(s + 5);
    const name = entry.kid ? kidNames[kidN++ % kidNames.length] : names[adultN++ % names.length];
    spec.name = name;
    out.push({ id: `townsfolk${i}`, i, name, fem, role: entry.role, kid: !!entry.kid, elder: entry.build === 'elder', entry, spec, persona: personaFor(entry, r) });
  });
  return out;
}
