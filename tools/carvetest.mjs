// node tools/carvetest.mjs [-v]
// Headless checks for the pumpkin carving mini-game (src/game/carveScore.js): the judges'
// scoring (stencils win, empty and over-cut pumpkins don't, a cut across the face caves it
// in, bits ringed by a cut drop in), Gus's requests (spooky / funny / cute style bonuses, a
// likeness bonus for copying his design), the saved 32 x 32 bit mask round trip, and that the
// contest's voxel models (the carved pumpkin, Gus's megaphone, pennants, the rosette) build
// and mesh.
import * as C from '../src/game/carveScore.js';
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

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
