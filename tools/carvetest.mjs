// node tools/carvetest.mjs [-v]
// Headless checks for the pumpkin carving mini-game (src/game/carveScore.js): the judges'
// scoring (stencils win, empty and over-cut pumpkins don't, a cut across the face caves it
// in, bits ringed by a cut drop in), Gus's requests (spooky / funny / cute style bonuses, a
// likeness bonus for copying his design), the saved 32 x 32 bit mask round trip, and that the
// contest's voxel models (the carved pumpkin, Gus's megaphone, pennants, the rosette) build
// and mesh. Then the 3D pumpkin it's really carved in (src/game/carve3d.js, carveMesh.js):
// rays find the right voxel, a knife cut goes through the wall (and only there), the lid
// comes free round the stem, ringed bits drop in, each side projects back into the judges'
// mask, only dirty chunks are remeshed (and add up to the whole, wound the right way), and
// the exact pumpkin survives the save and glows on the table.
import * as C from '../src/game/carveScore.js';
import * as P3 from '../src/game/carve3d.js';
import * as MESH3 from '../src/game/carveMesh.js';
import * as CM from '../src/voxel/models/contest.js';
import { meshVox } from '../src/voxel/mesh.js';

const verbose = process.argv.includes('-v');
let pass = 0, fail = 0;
const check = (name, ok, info = '') => {
  if (ok) pass++;
  else fail++;
  if (!ok || verbose) console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? `  ${info}` : ''}`);
};
const { N } = C;
const mask = (f) => { const m = C.emptyMask(); f((x, y) => { if (C.inFace(x, y)) m[y * N + x] = 1; }); return m; };
const show = (m) => { for (let y = 0; y < N; y++) { let s = ''; for (let x = 0; x < N; x++) { const i = y * N + x; s += m[i] ? '#' : C.CARVABLE[i] ? '.' : C.BODY[i] ? 'o' : ' '; } console.log(s); } };

// ---- scoring
for (const k of C.STENCIL_NAMES) {
  const r = C.scoreCarving(C.STENCILS[k]);
  if (verbose) show(C.STENCILS[k]);
  check(`stencil "${k}" takes a ribbon`, r.ribbon === 'first' || r.ribbon === 'second', `score=${r.score} ribbon=${r.ribbon} eyes=${r.eyes} mouth=${r.mouth} sym=${r.sym.toFixed(2)} area=${r.area.toFixed(2)}`);
}
const empty = C.scoreCarving(C.emptyMask());
check('an uncarved pumpkin scores nothing', empty.score === 0 && empty.empty && empty.ribbon === 'part');
const full = mask((cut) => { for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) cut(x, y); });
const fr = C.scoreCarving(full);
check('carving the whole face collapses it', fr.collapse && fr.ribbon === 'part' && fr.score <= 12, `area=${fr.area.toFixed(2)}`);
const half = mask((cut) => { for (let x = 0; x < N; x++) cut(x, 16); });
check('a cut right across the face splits it', C.isSplit(half) && C.scoreCarving(half).collapse);
const grin = C.STENCILS.classic.slice();
check('a toothy grin is not a split', !C.isSplit(grin));
// one eye and a mouth: a lower score than the full classic face
const oneEye = mask((cut) => { for (let y = 9; y <= 12; y++) for (let x = 8; x <= 12; x++) cut(x, y); for (let x = 9; x <= 22; x++) for (let y = 22; y <= 23; y++) cut(x, y); });
const oe = C.scoreCarving(oneEye);
check('one eye scores lower than two', oe.eyes === 1 && oe.score < C.scoreCarving(C.STENCILS.classic).score, `score=${oe.score}`);
// a lopsided face loses on symmetry
const lop = mask((cut) => { for (let y = 8; y <= 10; y++) for (let x = 6; x <= 9; x++) cut(x, y); for (let y = 13; y <= 15; y++) for (let x = 19; x <= 23; x++) cut(x, y); for (let x = 7; x <= 18; x++) cut(x, 20 + (x >> 2)); });
const lr = C.scoreCarving(lop);
check('a lopsided face loses symmetry points', lr.parts.sym < 10, `sym=${lr.sym.toFixed(2)} pts=${lr.parts.sym}`);
// a ring cut round a bit: the middle drops in
const ring = mask((cut) => { for (let a = 0; a < 64; a++) cut(Math.round(16 + Math.cos((a / 64) * Math.PI * 2) * 4), Math.round(17 + Math.sin((a / 64) * Math.PI * 2) * 4)); });
const before = C.countCarved(ring);
const fell = C.dropLoose(ring);
check('a bit ringed by a cut drops in', fell > 20 && C.countCarved(ring) === before + fell, `fell=${fell}`);
check('nothing drops from an open face', C.dropLoose(C.STENCILS.happy.slice()) === 0);
check('scores stay within 0-100', [C.STENCILS.classic, full, half, oneEye, lop, ring].every((m) => { const s = C.scoreCarving(m).score; return s >= 0 && s <= 100; }));

// ---- teeth: notches left standing in a wide mouth (a smooth U smile has none)
check('the classic grin has teeth', C.scoreCarving(C.STENCILS.classic).teeth);
check('a smooth happy U has no teeth', !C.scoreCarving(C.STENCILS.happy).teeth);

// ---- Gus's requests: a spooky, funny or cute face earns a style bonus
const bonus = (m, t) => C.themeBonus(C.analyze(m), t).pts;
check('the classic toothy grin is spooky (more spooky than cute)', bonus(C.STENCILS.classic, 'spooky') >= 8 && bonus(C.STENCILS.classic, 'spooky') > bonus(C.STENCILS.classic, 'cute'), `spooky=${bonus(C.STENCILS.classic, 'spooky')} cute=${bonus(C.STENCILS.classic, 'cute')}`);
check('the round-eyed happy face is cute (more cute than spooky)', bonus(C.STENCILS.happy, 'cute') >= 6 && bonus(C.STENCILS.happy, 'cute') > bonus(C.STENCILS.happy, 'spooky'), `cute=${bonus(C.STENCILS.happy, 'cute')} spooky=${bonus(C.STENCILS.happy, 'spooky')}`);
// a wink and a big "O" mouth off to one side: funny
const silly = mask((cut) => {
  for (let y = 9; y <= 12; y++) for (let x = 8; x <= 11; x++) cut(x, y); // one eye
  for (let x = 20; x <= 23; x++) cut(x, 11); // ...and a wink
  for (let y = 19; y <= 24; y++) for (let x = 17; x <= 22; x++) if (Math.hypot(x + 0.5 - 20, y + 0.5 - 21.5) <= 3.1) cut(x, y); // an "O"
});
const sa = C.analyze(silly);
check('a winking face with a lopsided "O" mouth is funny', bonus(silly, 'funny') >= 6 && bonus(silly, 'funny') > bonus(silly, 'cute') && bonus(silly, 'funny') > bonus(silly, 'spooky'), `funny=${bonus(silly, 'funny')} cute=${bonus(silly, 'cute')} spooky=${bonus(silly, 'spooky')} wink=${sa.wink} O=${sa.mouthFill.toFixed(2)}x${sa.mouthH} off=${sa.mouthOff.toFixed(1)}`);
check('no style bonus for an empty or caved-in pumpkin', bonus(C.emptyMask(), 'spooky') === 0 && bonus(full, 'funny') === 0 && bonus(half, 'cute') === 0);
const themed = C.scoreCarving(C.STENCILS.classic, { theme: 'spooky' });
check('a request adds its bonus to the score (never past 100)', themed.request?.kind === 'theme' && themed.parts.theme > 0 && themed.score <= 100 && themed.score >= C.scoreCarving(C.STENCILS.classic).score, `score=${themed.score} bonus=${themed.parts.theme} (${themed.request?.why?.join(', ')})`);
check('no request, no bonus (and the same score as ever)', C.scoreCarving(C.STENCILS.cat).request === null && C.scoreCarving(C.STENCILS.cat).parts.theme === undefined);
// copying Gus's design: the closer the copy, the bigger the bonus
for (const k of C.DESIGN_NAMES) {
  const r = C.scoreCarving(C.DESIGNS[k]);
  check(`Gus's design "${k}" takes a ribbon`, r.ribbon === 'first' || r.ribbon === 'second', `score=${r.score}`);
}
const D = C.DESIGNS.walrus;
const halfCopy = D.slice();
for (let i = 0; i < N * N; i++) if (halfCopy[i] && (i % N) >= 16) halfCopy[i] = 0;
const exact = C.scoreCarving(D, { target: D }), part = C.scoreCarving(halfCopy, { target: D }), other = C.scoreCarving(C.STENCILS.happy, { target: D });
check('an exact copy of the design earns the full likeness bonus', exact.request?.kind === 'copy' && exact.parts.copy === 15 && Math.abs(exact.request.sim - 1) < 1e-9);
check('half a copy earns some', part.parts.copy > 0 && part.parts.copy < 15, `sim=${part.request.sim.toFixed(2)} pts=${part.parts.copy}`);
check('a different face earns none', other.parts.copy === 0, `sim=${other.request.sim.toFixed(2)}`);
check('likeness is symmetric and 1 for itself', Math.abs(C.likeness(D, halfCopy) - C.likeness(halfCopy, D)) < 1e-9 && C.likeness(D, D) === 1);

// ---- the save: 32 x 32 bits, base64
for (const [name, m] of [['classic', C.STENCILS.classic], ['ring', ring], ['empty', C.emptyMask()]]) {
  const s = C.encodeMask(m);
  const back = C.decodeMask(s);
  const json = JSON.parse(JSON.stringify({ carving: { mask: s } }));
  const back2 = C.decodeMask(json.carving.mask);
  check(`mask "${name}" survives the save`, s.length <= 172 && back && back2 && back.every((v, i) => v === (m[i] && C.CARVABLE[i] ? 1 : 0)) && back2.every((v, i) => v === back[i]), `${s.length} chars`);
}
check('a damaged saved mask is ignored', C.decodeMask('not base64!') === null && C.decodeMask('') === null && C.decodeMask(undefined) === null);

// ---- the voxel models
const build = (name, res) => {
  try {
    let n = 0;
    for (const v of res.vox.data) if (v) n++;
    const geo = meshVox(res.vox, { size: res.size, origin: res.origin, greedy: true });
    check(`model ${name} builds`, n > 0 && geo.attributes.position.count > 0, `${n} voxels, ${geo.attributes.position.count} verts`);
    return res;
  } catch (e) {
    check(`model ${name} builds`, false, e.message);
    return null;
  }
};
build('carvedPumpkin (plain)', CM.carvedPumpkin({}));
const carved = build('carvedPumpkin (classic face)', CM.carvedPumpkin({ mask: C.STENCILS.classic }));
build('carvedPumpkin (collapsed, every cell cut)', CM.carvedPumpkin({ mask: full }));
build('tinMegaphone', CM.tinMegaphone());
build('pennant', CM.pennant({ color: 0xe8b830 }));
build('prizeRosette', CM.prizeRosette({ color: 0x3a6ad0 }));
build('carvedPumpkin (Gus\'s walrus design)', CM.carvedPumpkin({ mask: C.DESIGNS.walrus }));
build('contestTable (one place)', CM.contestTable({ len: 1.8, places: 1, cloth: 'orange', seed: 5 }));
if (carved) {
  // the face shows through to the glowing inside: each cut cell's front is open or glows
  const v = carved.vox, EMIT = 1 << 24;
  let glow = 0, cells = 0;
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    if (!C.STENCILS.classic[r * N + c]) continue;
    cells++;
    const x = c + 2, y = 30 - r;
    let z = v.d - 1;
    while (z >= 0 && !v.get(x, y, z)) z--;
    if (z < 0 || v.get(x, y, z) & EMIT) glow++;
  }
  check('the carved face glows through', glow === cells, `${glow}/${cells}`);
}

// ---------------------------------------------------------------- the 3D pumpkin (src/game/carve3d.js)
const T3 = performance.now();
const fresh = P3.freshPumpkin();
const B3 = P3.shapeOf();
check('the voxel pumpkin is ~40^3 with a hollow, a stem and guts', P3.W === 36 && P3.H === 38 && P3.D === 36 && fresh.count() > 5000 && B3.CAV.some((v) => v) && fresh.count(P3.GUTS) > 300 && fresh.at(...B3.stem) === P3.K.STEM, `${fresh.count()} wall voxels, ${fresh.count(P3.GUTS)} guts`);
check('a fresh pumpkin holds together and shows no holes from any side', P3.looseParts(fresh).length === 0 && [0, 1, 2, 3].every((s) => C.countCarved(P3.projectMask(fresh, s)) === 0));
{
  // from the front its outline is the judges' grid: every face cell has wall behind it
  let ok = 0, n = 0;
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    if (!C.CARVABLE[r * N + c]) continue;
    n++;
    for (let z = P3.D - 1; z >= P3.Z0; z--) if (B3.ORIG[P3.idx(c + P3.P0, P3.TOP - r, z)] === 1) { ok++; break; }
  }
  check('one voxel is one cell of the face grid (front outline = carveScore.BODY)', ok === n, `${ok}/${n}`);
}

// ---- rays: the DDA walk finds the first voxel a fine march would
{
  const hit = P3.raycast(fresh, P3.X0 + 0.3, P3.Y0 + 0.2, 80, 0, 0, -1);
  check('a ray at the front hits the skin, facing out', hit && hit.n[2] === 1 && (hit.k & P3.KIND) === P3.K.SKIN && hit.z > P3.Z0 + P3.RZ - 3, hit && `z=${hit.z} t=${hit.t.toFixed(2)}`);
  check('a ray past the pumpkin hits nothing', P3.raycast(fresh, -5, P3.Y0, 80, 0, 0, -1) === null && P3.raycast(fresh, P3.X0, 200, P3.Z0 + 30, 0, -1, 0) === null);
  const top = P3.raycast(fresh, B3.stem[0] + 0.5, 60, B3.stem[2] + 0.5, 0, -1, 0);
  check('a ray from above hits the stem', top && (top.k & P3.KIND) === P3.K.STEM);
  let agree = 0;
  let seed = 7;
  const rand = () => ((seed = (seed * 1103515245 + 12345) >>> 0) >>> 8) / 16777216;
  for (let k = 0; k < 200; k++) {
    const o = [P3.X0 + (rand() - 0.5) * 70, P3.Y0 + (rand() - 0.5) * 70, P3.Z0 + (rand() - 0.5) * 70];
    const tgt = [P3.X0 + (rand() - 0.5) * 24, P3.Y0 + (rand() - 0.5) * 20, P3.Z0 + (rand() - 0.5) * 24];
    const d = tgt.map((v, i) => v - o[i]), l = Math.hypot(...d);
    const dn = d.map((v) => v / l);
    const h = P3.raycast(fresh, ...o, ...dn);
    let ref = null;
    for (let t = 0; t < 140; t += 0.002) {
      const x = Math.floor(o[0] + dn[0] * t), y = Math.floor(o[1] + dn[1] * t), z = Math.floor(o[2] + dn[2] * t);
      if (fresh.at(x, y, z)) { ref = [x, y, z]; break; }
    }
    if ((!h && !ref) || (h && ref && h.x === ref[0] && h.y === ref[1] && h.z === ref[2])) agree++;
  }
  check('the DDA ray agrees with a fine march (200 random rays)', agree >= 199, `${agree}/200`);
}

// ---- cutting: straight in, through the wall
{
  const p = P3.freshPumpkin();
  const hit = P3.raycast(p, P3.X0 + 0.5, P3.Y0 + 0.5, 80, 0, 0, -1);
  const at = [P3.X0 + 0.5, P3.Y0 + 0.5, 80 - hit.t];
  const rec = [], out = [];
  const n = P3.cut(p, ...at, 'knife', rec, out);
  const col = (x, y) => { let z = P3.D - 1; const gone = []; for (; z >= P3.Z0; z--) { const i = P3.idx(x, y, z); if (B3.CAV[i]) break; if (B3.ORIG[i] === 1) gone.push(!p.kind[i]); } return gone; };
  const thru = col(P3.X0, P3.Y0);
  check('a knife cut takes the wall out right through to the hollow', n >= 3 && thru.length >= 3 && thru.every(Boolean), `${n} voxels, column ${thru.map((g) => (g ? '.' : '#')).join('')}`);
  check('...only near the line of the cut (a thin knife)', out.every((i) => { const x = i % P3.W, y = ((i - x) / P3.W) % P3.H; return Math.hypot(x + 0.5 - at[0], y + 0.5 - at[1]) < 1.3; }) && rec.length === n * 3);
  const m = P3.projectMask(p, 0);
  const cell = (P3.TOP - P3.Y0) * N + (P3.X0 - P3.P0);
  check('...and the judges see a hole there', m[cell] === 1 && C.countCarved(m) <= 3, `cells=${C.countCarved(m)}`);
  const g = P3.freshPumpkin(), gr = [];
  P3.cut(g, ...at, 'gouge', gr);
  check('the gouge takes a bigger bite', gr.length / 3 > n * 2.5, `${gr.length / 3} vs ${n}`);
  // a shallow scratch (not through) is no hole
  const s = P3.freshPumpkin();
  P3.capsule(s, at[0], at[1], at[2] + 1, at[0] + 4, at[1], at[2] - 0.6, 0.8, P3.CUTS);
  check('a scratch that doesn\'t go through is no hole', C.countCarved(P3.projectMask(s, 0)) === 0);
  // seen through a hole, the far wall inside is not "on the wall" (the knife doesn't cut it)
  const big = P3.freshPumpkin();
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) P3.cut(big, at[0] + dx, at[1] + dy, at[2], 'gouge');
  const o = [P3.X0 + 0.5, P3.Y0 + 0.5, 80], d = [0, 0, -1];
  const far = P3.raycast(big, ...o, ...d);
  check('through a hole, the far wall isn\'t cut', far && far.z < P3.Z0 && !P3.onWall(far, ...o, ...d) && P3.onWall(hit, ...o, ...d));
  // undo puts back exactly what was there
  const u = P3.freshPumpkin(), ur = [];
  P3.cut(u, ...at, 'gouge', ur);
  P3.cut(u, at[0] + 3, at[1] - 2, at[2], 'knife', ur);
  u.undo(ur);
  check('undo restores the voxels exactly', u.kind.every((v, i) => v === fresh.kind[i]) && u.col.every((v, i) => v === fresh.col[i]));
}

// ---- the lid: cut round the stem, it comes free; set back on, it holds
{
  const p = P3.freshPumpkin();
  check('the lid isn\'t free before the ring is cut', !P3.lidFree(p));
  P3.cutLidRing(p);
  const parts = P3.looseParts(p);
  check('a cut right round the marker ring frees the lid (with the stem)', P3.lidFree(p) && parts.length === 1 && parts[0].stem && parts[0].n > 100 && parts[0].n < 600, parts.map((q) => `${q.n}${q.stem ? ' stem' : ''}`).join(', '));
  const lid = P3.takeLid(p, parts[0]);
  check('lifted off, the lid leaves an opening onto the guts', P3.raycast(p, P3.X0 + 0.5, 60, P3.Z0 + 0.5, 0, -1, 0)?.k && P3.GUTS[P3.raycast(p, P3.X0 + 0.5, 60, P3.Z0 + 0.5, 0, -1, 0).k]);
  const g0 = p.guts(), w0 = p.count(), sr = [];
  P3.scoop(p, P3.X0, P3.raycast(p, P3.X0 + 0.5, 60, P3.Z0 + 0.5, 0, -1, 0).y + 0.5, P3.Z0, 2.6, sr);
  check('a scoop takes guts and seeds only', sr.length > 0 && p.guts() === g0 - sr.length / 3 && p.count() === w0);
  P3.putLid(p, lid);
  check('the lid set back on holds (nothing loose, no holes in the face)', P3.looseParts(p).length === 0 && C.countCarved(P3.projectMask(p, 0)) === 0 && P3.lidPart(p)?.n === parts[0].n);
}

// ---- a ring cut on the face: the middle drops in, like the flat game's dropLoose
{
  const p = P3.freshPumpkin();
  for (let a = 0; a < 80; a++) {
    const x = P3.X0 + Math.cos((a / 80) * Math.PI * 2) * 4, y = P3.Y0 + 3 + Math.sin((a / 80) * Math.PI * 2) * 4;
    const h = P3.raycast(p, x, y, 80, 0, 0, -1);
    if (h && P3.onWall(h, x, y, 80, 0, 0, -1)) P3.cut(p, x, y, 80 - h.t, 'knife');
  }
  const parts = P3.looseParts(p);
  const before = C.countCarved(P3.projectMask(p, 0));
  for (const q of parts) for (const i of q.cells) p.remove(i);
  const after = C.countCarved(P3.projectMask(p, 0));
  check('a bit ringed by cuts comes loose and drops in', parts.length === 1 && !parts[0].stem && after > before + 15, `loose=${parts.map((q) => q.n)} holes ${before} -> ${after}`);
}

// ---- the judges' view: each side seen straight on as the old 32 x 32 mask
// cut a mask straight through side s (the way fromMask cuts the front)
const carveSide = (mask, s) => {
  const p = P3.freshPumpkin();
  const [fx, fz, rx, rz] = P3.SIDES[s];
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    if (!mask[r * N + c] || !C.CARVABLE[r * N + c]) continue;
    const u = c + 0.5 - C.CX, y = P3.TOP - r;
    for (let k = 17; k >= 0; k--) {
      const i = P3.idx(Math.floor(P3.X0 + rx * u + fx * (k + 0.5)), y, Math.floor(P3.Z0 + rz * u + fz * (k + 0.5)));
      if (B3.CAV[i]) break;
      if (P3.CUTS[p.kind[i]]) p.remove(i);
    }
  }
  return p;
};
for (const [name, m] of [['classic', C.STENCILS.classic], ['cat', C.STENCILS.cat], ['walrus', C.DESIGNS.walrus]]) {
  for (const s of [0, 1, 2, 3]) {
    const p = carveSide(m, s);
    const masks = [0, 1, 2, 3].map((t) => P3.projectMask(p, t));
    const same = masks[s].every((v, i) => !C.CARVABLE[i] || v === m[i]);
    // (the side opposite sees nothing; the ones beside it only a corner cell or few, at a slant)
    const others = C.countCarved(masks[(s + 2) & 3]) === 0 && [1, 3].every((t) => C.countCarved(masks[(s + t) & 3]) <= C.countCarved(m) * 0.1);
    if (s === 0 || name === 'classic') check(`"${name}" cut through side ${s} projects back exactly (seen from the others: a slanting corner at most)`, same && others, `${C.countCarved(masks[s])}/${C.countCarved(m)}, sides ${[0, 1, 2, 3].map((t) => C.countCarved(masks[t])).join(' ')}`);
    if (s === 1 && name === 'cat') {
      const J = P3.judge(p);
      check('the judges score the carved side, whichever it is', J.side === 1 && J.res.score === C.scoreCarving(m).score, `side=${J.side} score=${J.res.score}`);
    }
  }
}
{
  const J = P3.judge(P3.fromMask(C.STENCILS.classic), { theme: 'spooky' });
  check('an old save\'s mask cut into the voxel pumpkin scores just the same', J.side === 0 && J.res.score === C.scoreCarving(C.STENCILS.classic, { theme: 'spooky' }).score && J.mask.every((v, i) => !C.CARVABLE[i] || v === C.STENCILS.classic[i]));
  const half = P3.fromMask(mask((cut) => { for (let x = 0; x < N; x++) cut(x, 16); }));
  check('a cut clean across a side caves it in', P3.judge(half).res.collapse);
}

// ---- remeshing: chunks add up to the whole, only dirty chunks are rebuilt
{
  const faces = (p, air) => { let f = 0, gl = 0; for (let c = 0; c < MESH3.CHUNKS; c++) { const r = MESH3.meshChunk(p, c, air); f += r.geo?.userData.faces || 0; gl += r.glow?.userData.faces || 0; } return [f, gl]; };
  const p = P3.freshPumpkin();
  check('the chunk meshes have every exposed face (fresh)', faces(p)[0] === MESH3.countFaces(p), `${faces(p)[0]} / ${MESH3.countFaces(p)}`);
  // carve with dirty-chunk tracking, rebuilding only those; compare with a full rebuild
  const dirty = new Set();
  p.onChange = (x, y, z) => MESH3.dirtyAround(x, y, z, dirty);
  const cache = [];
  for (let c = 0; c < MESH3.CHUNKS; c++) cache[c] = MESH3.meshChunk(p, c).geo?.userData.faces || 0;
  for (let k = 0; k < 30; k++) { const h = P3.raycast(p, P3.X0 - 6 + k * 0.4, P3.Y0 + 2 - (k % 7), 80, 0, 0, -1); if (h) P3.cut(p, P3.X0 - 6 + k * 0.4, P3.Y0 + 2 - (k % 7), 80 - h.t, 'gouge'); }
  for (const c of dirty) cache[c] = MESH3.meshChunk(p, c).geo?.userData.faces || 0;
  const inc = cache.reduce((a, b) => a + b, 0);
  check('rebuilding only the dirty chunks matches a full rebuild', inc === faces(p)[0] && inc === MESH3.countFaces(p) && dirty.size < MESH3.CHUNKS / 2, `${inc} faces, ${dirty.size}/${MESH3.CHUNKS} chunks rebuilt`);
  // every triangle winds to face the way its normal points (seen from outside)
  let bad = 0, tris = 0;
  for (let c = 0; c < MESH3.CHUNKS; c++) {
    const geo = MESH3.meshChunk(p, c).geo;
    if (!geo) continue;
    const P = geo.attributes.position.array, Nn = geo.attributes.normal.array, I = geo.index.array;
    for (let t = 0; t < I.length; t += 3) {
      const [a, b, d] = [I[t], I[t + 1], I[t + 2]];
      const e1 = [0, 1, 2].map((k) => P[b * 3 + k] - P[a * 3 + k]), e2 = [0, 1, 2].map((k) => P[d * 3 + k] - P[a * 3 + k]);
      const cr = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      if (cr[0] * Nn[a * 3] + cr[1] * Nn[a * 3 + 1] + cr[2] * Nn[a * 3 + 2] <= 0) bad++;
      tris++;
    }
  }
  check('every triangle faces out along its normal', bad === 0 && tris > 1000, `${bad} bad of ${tris}`);
  const air = P3.insideAir(p);
  const [f2, g2] = faces(p, air);
  check('lit, the faces into the hollow and the cuts glow (and the rest don\'t change)', g2 > 500 && f2 + g2 === MESH3.countFaces(p), `${g2} glowing of ${f2 + g2}`);
}

// ---- the save: the exact pumpkin, run-length; and the jack-o'-lantern on the table
{
  const p = P3.fromMask(C.STENCILS.cat);
  P3.scoop(p, P3.X0, 6, P3.Z0, 3);
  for (let k = 0; k < 12; k++) { const h = P3.raycast(p, P3.X0 + 15, P3.Y0 + 6 - k, P3.Z0 - 3 + k * 0.5, -1, 0, 0); if (h) P3.cut(p, P3.X0 + 15 - h.t, P3.Y0 + 6 - k, P3.Z0 - 3 + k * 0.5, 'knife'); }
  const s = P3.encodeCarve(p);
  const json = JSON.parse(JSON.stringify({ carving: { vox: s } }));
  const back = P3.decodeCarve(json.carving.vox);
  check('the carved voxel pumpkin survives the save exactly', back && back.kind.every((v, i) => v === 0 ? p.kind[i] === 0 : p.kind[i] !== 0) && back.col.every((v, i) => (v === 0) === (p.col[i] === 0)) && s.length < 4000, `${s.length} chars`);
  check('a fresh pumpkin saves in a few bytes', P3.encodeCarve(P3.freshPumpkin()).length < 16);
  check('a damaged or foreign save is ignored', P3.decodeCarve('1:not base64!') === null && P3.decodeCarve('9:AAAA') === null && P3.decodeCarve('') === null && P3.decodeCarve(undefined) === null && P3.decodeCarve('1:' + Buffer.from([200, 200, 200, 3]).toString('base64')) === null);
  const lit = build('displayVox (the cat face, lit)', P3.displayVox(back));
  const EMIT = 1 << 24;
  if (lit) {
    let glow = 0, cells = 0;
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      if (!C.STENCILS.cat[r * N + c] || !C.CARVABLE[r * N + c]) continue;
      cells++;
      const x = c + P3.P0, y = P3.TOP - r;
      let z = P3.D - 1;
      while (z >= 0 && !lit.vox.get(x, y, z)) z--;
      if (z < 0 || lit.vox.get(x, y, z) & EMIT) glow++;
    }
    check('on the table, the saved face glows through', glow === cells, `${glow}/${cells}`);
  }
  const plain = build('displayVox (fresh, unlit)', P3.displayVox(P3.freshPumpkin(), { lit: false, candle: false }));
  check('an uncarved one doesn\'t glow', plain && !plain.vox.data.some((v) => v & EMIT));
}
for (const tool of ['knife', 'gouge', 'scoop', 'candle', 'open']) build(`bonyHand (${tool})`, CM.bonyHand({ tool }));
if (verbose) console.log(`(3D checks in ${(performance.now() - T3).toFixed(0)} ms)`);

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
