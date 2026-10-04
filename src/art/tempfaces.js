// Little hand-drawn pixel-art faces for how warm a cup still is: beaming with
// steam when it is piping hot, smiling, content, uneasy with a bead of sweat,
// and frozen blue with icicles once it has gone cold. 16x16 art pixels, drawn
// once to a canvas per mood and cached as a data URL.

// one grid, one palette per mood. o outline, Y face, y shade, h highlight,
// k features, w white, m mouth, t tongue, r/p blush, s steam, d sweat,
// i snow, f snowflake, I icicle, z shiver
const FACES = {
  piping: [
    '.....s..s..s....',
    '....s..s..s.....',
    '.....s..s..s....',
    '......oooo......',
    '....oohhYYoo....',
    '...ohhYYYYYYo...',
    '...ohYYYYYYyo...',
    '..ohYkYYYYkYyo..',
    '..oYkYkYYkYkyo..',
    '..orrYYYYYYrro..',
    '..oYYkwwwwkyyo..',
    '...oYkmttmkyo...',
    '...oyYkkkkyyo...',
    '....ooyyyyoo....',
    '......oooo......',
    '................',
  ],
  hot: [
    '........s.......',
    '.......s........',
    '........s.......',
    '......oooo......',
    '....oohhYYoo....',
    '...ohhYYYYYYo...',
    '...ohYYYYYYyo...',
    '..ohYwkYYwkYyo..',
    '..oYYkkYYkkYyo..',
    '..orrYYYYYYrro..',
    '..oYYkkkkkkyyo..',
    '...oYkmttmkyo...',
    '...oyYkkkkyyo...',
    '....ooyyyyoo....',
    '......oooo......',
    '................',
  ],
  warm: [
    '................',
    '................',
    '................',
    '......oooo......',
    '....oohhYYoo....',
    '...ohhYYYYYYo...',
    '...ohYYYYYYyo...',
    '..ohYkYYYYkYyo..',
    '..oYYkYYYYkYyo..',
    '..oppYYYYYYppo..',
    '..oYYkYYYYkyyo..',
    '...oYYkkkkyyo...',
    '...oyYYYYyyyo...',
    '....ooyyyyoo....',
    '......oooo......',
    '................',
  ],
  cool: [
    '................',
    '................',
    '................',
    '......oooo......',
    '....oohhYYoo..d.',
    '...ohhYYYYYYodw.',
    '...ohYYYYYYyodd.',
    '..ohkkkYYkkkyo..',
    '..oYYkkYYkkYyo..',
    '..oYYYYYYYYYyo..',
    '..oYYYYYYYYyyo..',
    '...oYkkkkkkyo...',
    '...oyYYYYyyyo...',
    '....ooyyyyoo....',
    '......oooo......',
    '................',
  ],
  cold: [
    '.............f..',
    '..f.........fff.',
    '.............f..',
    '......oooo......',
    '....ooiiiioo....',
    '...oiikYYkYYo...',
    '...okkYYYYkko...',
    '..ohYkYYYYkYyo..',
    'z.oYYkYYYYkYyo.z',
    'z.oYYYYYYYYYyo.z',
    '..oYYkYkYkYyyo..',
    '...oYYkYkYkyo...',
    '...oyYYYYyyyo...',
    '....ooyyyyoo....',
    '......oooo......',
    '......I..I......',
  ],
};

const SUNNY = { o: '#5a2a14', Y: '#ffcc3a', y: '#f0981e', h: '#fff2a8', k: '#3a1a0e', w: '#ffffff', m: '#9a2418', t: '#ff7a7a', r: '#ff7058', p: '#ffa878', s: '#e8784a' };
const PALETTES = {
  piping: SUNNY,
  hot: SUNNY,
  warm: SUNNY,
  cool: { ...SUNNY, Y: '#f4dc7c', y: '#d4ac4a', h: '#fff6cc', o: '#5a3a24', d: '#4aa0e8', w: '#ffffff' },
  cold: { o: '#24345a', Y: '#a8d8f4', y: '#6aa0d4', h: '#e8f8ff', k: '#1a2848', i: '#ffffff', f: '#5a9ce0', I: '#7ec8ec', z: '#5a8ac8' },
};

// which face a cup gets (q is the cup's 0..100 warmth, as cupTemp reads it)
export function tempMood(q) {
  const k = Math.max(0, Math.min(1, q / 100));
  return k > 0.8 ? 'piping' : k > 0.6 ? 'hot' : k > 0.35 ? 'warm' : k > 0.12 ? 'cool' : 'cold';
}

const urls = new Map();
export function tempFaceURL(mood) {
  if (urls.has(mood)) return urls.get(mood);
  const rows = FACES[mood] || FACES.warm, pal = PALETTES[mood] || SUNNY;
  const c = document.createElement('canvas');
  c.width = 16;
  c.height = 16;
  const g = c.getContext('2d');
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const col = pal[row[x]];
      if (!col) continue;
      g.fillStyle = col;
      g.fillRect(x, y, 1, 1);
    }
  });
  const u = c.toDataURL();
  urls.set(mood, u);
  return u;
}
