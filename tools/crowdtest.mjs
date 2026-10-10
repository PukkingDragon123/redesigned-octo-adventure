// node tools/crowdtest.mjs [-v]
// Headless checks for the pumpkin contest's crowd and its cocoa round: every townsperson
// (src/game/crowdGen.js) is dressed and their voxel body parts build and mesh, the crowd is
// big and varied (kids, elders, hats, scarves, plaid, puffy vests...), the dressing is the
// same every time (seeded), the named villagers' outfits still build, the crowd's props
// (cane, stroller, dog, lid, cocoa carrier) mesh, and the cocoa round (src/game/cocoaRound.js)
// runs: freeze, cups for the regulars, the count, the finish, the save and old saves; and
// the into-town cutscene's shots (src/game/entryShots.js) all sit out in the open street.
import { makeCrowd, ROSTER } from '../src/game/crowdGen.js';
import { CocoaRound, ROUND_KEYS, NEED, PINNED } from '../src/game/cocoaRound.js';
import { CHARACTERS, buildHead, buildTorso, buildLimb, buildSkirt, VS } from '../src/voxel/models/characters.js';
import * as CM from '../src/voxel/models/contest.js';
import { CONTEST } from '../src/world/contest.js';
import { meshVox } from '../src/voxel/mesh.js';
import { ENTRY, inStreet, blocked, faceSpot, fixedShots, followShot, clearLine } from '../src/game/entryShots.js';

const verbose = process.argv.includes('-v');
let pass = 0, fail = 0;
const check = (name, ok, info = '') => {
  if (ok) pass++;
  else fail++;
  if (!ok || verbose) console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? `  ${info}` : ''}`);
};
const parts = (s) => {
  const out = [buildHead(s), buildTorso(s), ...['upperArm', 'forearm', 'thigh', 'shin'].map((p) => buildLimb(s, p))];
  if (s.skirt) out.push(buildSkirt(s));
  return out;
};
const meshes = (s) => {
  let verts = 0;
  for (const r of parts(s)) {
    const g = meshVox(r.vox, { size: VS, origin: r.origin, jitter: 0.035 });
    if (!(g.attributes.position.count > 0)) throw new Error('empty part');
    verts += g.attributes.position.count;
  }
  return verts;
};

// ---- the townsfolk
const crowd = makeCrowd();
check('the crowd is big: with the named regulars, 25-40 people at the contest', crowd.length + 9 >= 25 && crowd.length + 10 <= 40, `${crowd.length} townsfolk + 9-10 regulars`);
check('every roster part is cast', crowd.length === ROSTER.length);
let verts = 0, bad = 0;
const t0 = performance.now();
for (const m of crowd) {
  try { verts += meshes(m.spec); } catch (e) { bad++; console.log('  ', m.id, m.role, e.message); }
}
const ms = (performance.now() - t0) / crowd.length;
check('every townsperson builds and meshes', bad === 0, `${(verts / crowd.length) | 0} verts each, ${ms.toFixed(1)} ms each`);
check('the same crowd every time (seeded)', JSON.stringify(makeCrowd().map((m) => m.spec)) === JSON.stringify(crowd.map((m) => m.spec)));
check('ids are unique and stay clear of the named characters', new Set(crowd.map((m) => m.id)).size === crowd.length && crowd.every((m) => !CHARACTERS[m.id] || CHARACTERS[m.id].crowd));
const roles = new Set(crowd.map((m) => m.role));
for (const r of ['carve', 'chat', 'cider', 'admire', 'photo', 'tag', 'couple', 'dog', 'stroller', 'tagalong', 'elder']) check(`someone plays the part "${r}"`, roles.has(r));
const count = (f) => crowd.filter(f).length;
const S = crowd.map((m) => m.spec);
check('kids, elders and grown-ups of every build', count((m) => m.kid) >= 5 && count((m) => m.elder) >= 3 && new Set(S.map((s) => `${s.torso.w}x${s.leg.len}`)).size >= 12, `kids ${count((m) => m.kid)}, elders ${count((m) => m.elder)}`);
check('a range of skin tones', new Set(S.map((s) => s.skin)).size >= 6, `${new Set(S.map((s) => s.skin)).size}`);
check('hats: toques and more', S.filter((s) => s.hat?.type === 'toque').length >= 3 && new Set(S.map((s) => s.hat?.type).filter(Boolean)).size >= 5, [...new Set(S.map((s) => s.hat?.type))].join(','));
check('scarves, plaid jackets and puffy vests', S.some((s) => s.scarf) && S.some((s) => s.top.type === 'plaid') && S.some((s) => s.top.type === 'puffy'));
check('hair styles and colours vary', new Set(S.map((s) => s.hair.style)).size >= 6 && new Set(S.map((s) => s.hair.color)).size >= 6);
check('two canes, a couple, a dog walker and a stroller', count((m) => m.entry.cane) === 2 && count((m) => m.role === 'couple') === 2 && count((m) => m.role === 'dog') === 1 && count((m) => m.role === 'stroller') === 1);
check('everyone has a name', crowd.every((m) => m.name && m.spec.name));

// ---- the named villagers are untouched
for (const id of ['hank', 'gus', 'marie', 'agnes', 'pip', 'pop', 'birdie', 'ingrid', 'doug', 'lou', 'ollie', 'mo', 'grandma', 'reaper']) {
  try { meshes(CHARACTERS[id]); check(`named character ${id} still builds`, true); } catch (e) { check(`named character ${id} still builds`, false, e.message); }
}

// ---- the layout
const C = CONTEST.crowd;
check('a carving place for each townsfolk carver', count((m) => m.role === 'carve') <= C.carve.length);
check('six carving tables (two new ones for the townsfolk)', CONTEST.tables.length === 6);
check('chat circles and elder spots for the groups', C.chat.length >= 2 && C.elder.length >= 2 && C.cider.length >= 2);

// ---- the props
for (const [name, r] of [['cane', CM.cane()], ['stroller', CM.stroller({})], ['pumpkinLid', CM.pumpkinLid()], ['cocoaCarrier', CM.cocoaCarrier({ cups: 8 })], ['cocoaCarrier (1 cup)', CM.cocoaCarrier({ cups: 1 })], ['ciderCup', CM.ciderCup()]]) {
  const g = meshVox(r.vox, { size: r.size, origin: r.origin });
  check(`model ${name} builds`, g.attributes.position.count > 0, `${g.attributes.position.count} verts`);
}
const dog = CM.leashDog({});
check('the leash dog builds in pieces', ['body', 'tail', 'legs'].every((k) => meshVox(dog[k].vox, { size: dog[k].size, origin: dog[k].origin }).attributes.position.count > 0));

// ---- the cocoa round
const fresh = () => ({ day: 1, flags: { intro: true, cabin: true, bike: true } });
let st = fresh();
let R = new CocoaRound(() => st);
check('a new game: the freeze has yet to happen', R.needsStart() && !R.isActive() && !R.isDone());
check('the regulars and the host are pinned at the contest for the first ride in', PINNED.every((k) => R.pinned(k)) && !R.pinned('ollie') && R.pinned());
let p = R.start([]);
check('the freeze starts the round (and the village has met Hank)', R.isActive() && st.flags.village1 && st.flags.contestFreeze && p.count === 0 && p.need === NEED);
check('eight regulars to warm up', NEED === 8 && ROUND_KEYS.length === 8);
check('the objective counts them', R.objective() === `Offer cocoa to the frozen crowd: 0/${NEED}`, R.objective());
let r = R.give('marie');
check('a cup for Marie counts', r.fresh && r.count === 1 && !r.complete);
r = R.give('marie');
check('a second cup for Marie does not', !r.fresh && r.count === 1);
r = R.give('ollie');
check('a cup for someone who is not a regular does not count', !r.fresh && r.count === 1);
check('townsfolk cups are kept apart', R.giveCrowd() === 1 && R.progress().count === 1);
check('the crowd thaws as the regulars do', Math.abs(R.thawShare() - 1 / NEED) < 1e-9);
// the save mid-round
st = JSON.parse(JSON.stringify(st));
R = new CocoaRound(() => st);
check('a save mid-round picks up where it left off', R.isActive() && R.has('marie') && R.progress().count === 1 && R.objective().endsWith(`1/${NEED}`));
for (const k of ROUND_KEYS) r = R.give(k);
check('every regular served: complete', r.complete && r.count === NEED);
R.finish();
check('finishing ends the round', R.isDone() && !R.isActive() && !R.needsStart() && R.objective() === '' && st.flags.cocoaRound);
check('no more pinning once the round is over', !R.pinned('gus') && !R.pinned());
check('cups after the round change nothing', !R.give('kids').fresh && R.giveCrowd() === 0);
// an old save: the screaming first arrival happened
st = { flags: { village1: true, contestScream: true } };
R = new CocoaRound(() => st);
R.migrate();
check('an old save (the scream already happened) counts as a finished round', R.isDone() && !R.needsStart() && st.flags.cocoaRound && !R.pinned('gus'));
// a save from before the contest: met the village, never saw the contest
st = { flags: { village1: true } };
R = new CocoaRound(() => st);
R.migrate();
check('a save from before the contest gets the freeze and the round', R.needsStart());
R.start(['kids', 'pop']);
check('regulars who already like Hank count as served', R.progress().count === 2 && R.has('kids') && !R.has('marie'));
// a broken save record
st = { flags: { contestFreeze: true }, cocoaRound: 'junk' };
R = new CocoaRound(() => st);
check('a damaged round record is repaired', R.isActive() && R.progress().count === 0 && R.give('doug').count === 1);


// ---- the into-town cutscene's shots: out in the open street, nobody in the way
{
  const SP = CONTEST.spots;
  const people = [...Object.entries(SP).map(([k, q]) => ({ k, x: q.x, z: q.z })), ...CONTEST.crowd.carve.map((q) => ({ k: 'carver', x: q.x, z: q.z }))];
  const hank = ENTRY.stop;
  people.push({ k: 'bessie', x: hank.x, z: hank.z });
  const F = fixedShots(0);
  for (const [name, sh] of Object.entries(F)) {
    const ok = inStreet(sh.pos[0], sh.pos[2]) && !blocked(sh.pos[0], sh.pos[2], sh.pos[1]) && (!sh.to || inStreet(sh.to[0], sh.to[2]));
    check(`into town: the ${name} shot is out in the open street`, ok, sh.pos.join(','));
  }
  check('into town: nobody stands between the lens and Hank', ['reverse', 'hank'].every((k) => clearLine(F[k].pos[0], F[k].pos[2], hank.x, hank.z, people.filter((q) => q.k !== 'bessie'))));
  let roll = true;
  for (let k = 0; k <= 20; k++) {
    const x = ENTRY.start.x + ((ENTRY.stop.x - ENTRY.start.x) * k) / 20, z = ENTRY.start.z + ((ENTRY.stop.z - ENTRY.start.z) * k) / 20;
    const sh = followShot({ x, z }, 0);
    if (!inStreet(sh.pos[0], sh.pos[2])) roll = false;
  }
  check('into town: the lens follows Bessie in along the road', roll);
  check('into town: the street freezes before she stops', ENTRY.freezeX > ENTRY.start.x && ENTRY.freezeX < ENTRY.stop.x);
  for (const key of ['marie', 'agnes', 'josee', 'gus', 'kids', 'birdie', 'lou', 'ingrid', 'doug']) {
    const q = SP[key];
    const at = faceSpot({ x: q.x, y: 1.55, z: q.z }, hank, people.filter((o) => o.k !== key), { dist: 2.1, ground: 0 });
    check(`into town: a clear close-up of ${key}, from the street`, !!at && inStreet(at.x, at.z) && !blocked(at.x, at.z, at.y), at ? `${at.x.toFixed(1)},${at.z.toFixed(1)}` : 'none');
  }
}

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
