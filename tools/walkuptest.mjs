// node tools/walkuptest.mjs [-v]
// Headless checks for deliveries that come to Hank (src/game/walkup.js): a pretend street
// where Hank rides or walks up to a customer and slows down, and the customer (moving at
// a walking pace towards wherever the state machine sends them) comes over, takes the cup
// and is paid exactly once; riding off calls it off; a customer who can't get there waits
// and Hank can ride up to them; the shy one indoors comes out; the frightened one snatches;
// riding past at speed does nothing; the prompt still works; a cutscene cancels cleanly.
import { WalkUps, WU, standPoint, THANKS, thanksLine } from '../src/game/walkup.js';

const verbose = process.argv.includes('-v');
let pass = 0, fail = 0;
const check = (name, ok, info = '') => {
  if (ok) pass++;
  else fail++;
  if (!ok || verbose) console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? `  ${info}` : ''}`);
};
const hyp = Math.hypot;
const DT = 1 / 60;

// one pretend street: hank = { x, z, vx, vz, onFoot }, customers = [{ spot, x, z, avail, speed, door, blocked }]
function world({ hank, customers, script }) {
  const W = { t: 0, ev: [], pays: {}, hank: { y: 0, onFoot: false, free: true, scene: false, crashed: false, ...hank }, cust: {} };
  const orders = customers.map((c, i) => ({ id: i + 1, spot: c.spot, state: 'carried' }));
  for (const [i, c] of customers.entries()) W.cust[c.spot] = { ...c, home: { x: c.x, z: c.z }, o: orders[i], to: null, y: 0, speed: c.speed ?? 1.7 };
  const S = new WalkUps();
  W.S = S;
  W.orders = orders;
  W.run = (secs) => {
    for (let k = 0; k < secs / DT; k++) {
      W.t += DT;
      const H = W.hank;
      script?.(W, H);
      H.x += (H.vx || 0) * DT;
      H.z += (H.vz || 0) * DT;
      H.speed = hyp(H.vx || 0, H.vz || 0);
      const sp = H.speed || 1;
      if (H.speed > 0.05) { H.fx = (H.vx || 0) / sp; H.fz = (H.vz || 0) / sp; }
      H.fx ??= 0; H.fz ??= 1;
      const cands = [];
      for (const c of Object.values(W.cust)) {
        if (c.o.state !== 'carried' && !(S.job && S.job.o === c.o)) continue;
        cands.push({ o: c.o, spot: c.spot, x: c.x, z: c.z, y: 0, avail: S.job?.o === c.o ? 'job' : c.avail, door: c.door });
      }
      for (const e of S.update(DT, { hank: H, cands })) {
        W.ev.push({ t: W.t, type: e.type, spot: e.job.spot });
        const c = W.cust[e.job.spot];
        if (e.type === 'start' && c.avail === 'inside') { c.x = c.door.x; c.z = c.door.z; }
        if (e.type === 'target') c.to = { ...e.job.target };
        if (e.type === 'arrived' || e.type === 'fallback' || e.type === 'hand') c.to = null;
        if (e.type === 'pay' || e.type === 'snatch') { W.pays[c.o.id] = (W.pays[c.o.id] || 0) + 1; c.o.state = 'delivered'; }
        if (e.type === 'done' || e.type === 'cancel') c.to = c.home;
      }
      for (const c of Object.values(W.cust)) {
        if (!c.to || c.blocked) continue;
        const dx = c.to.x - c.x, dz = c.to.z - c.z, d = hyp(dx, dz);
        if (d < 0.05) continue;
        const s = Math.min(d, c.speed * DT);
        c.x += (dx / d) * s;
        c.z += (dz / d) * s;
      }
    }
    return W;
  };
  W.types = (spot) => W.ev.filter((e) => !spot || e.spot === spot).map((e) => e.type);
  W.first = (type, spot) => W.ev.find((e) => e.type === type && (!spot || e.spot === spot));
  return W;
}
// Hank rides along +z and brakes to a stop at stopZ
const brakeTo = (stopZ, v0 = 6, dec = 2.5) => (W, H) => {
  const rem = stopZ - H.z;
  const v = rem <= 0.02 ? 0 : Math.min(v0, Math.sqrt(2 * dec * rem));
  H.vz = v;
};

// ---- riding up and stopping
{
  const W = world({ hank: { x: 0, z: -30 }, customers: [{ spot: 'agnes', x: 5, z: 6, avail: 'walk' }], script: brakeTo(0) }).run(22);
  const st = W.first('start'), pay = W.first('pay'), done = W.first('done');
  check('riding up: they notice once Hank slows down nearby', !!st, `${W.types().join(',')}`);
  const H = W.hank;
  check('riding up: they walk over, take the cup and pay exactly once', !!pay && W.pays[1] === 1 && W.orders[0].state === 'delivered');
  check('riding up: thanks, then back to their day', !!done && done.t > pay.t + WU.THANKS_T * 0.9);
  const c = W.cust.agnes;
  check('riding up: they walk back home afterwards', hyp(c.x - c.home.x, c.z - c.home.z) < 0.3, `${c.x.toFixed(2)},${c.z.toFixed(2)}`);
  check('riding up: the hand-over is right after Bessie stops', pay.t < 13 &&  !W.types().includes('fallback') && !W.types().includes('cancel'), `pay at ${pay?.t.toFixed(1)}s`);
  check('nobody is left on the job', W.S.job === null);
  void H;
}
// where they stand: beside the crate on the bike, a step away on foot
{
  const h = { x: 0, z: 0, fx: 0, fz: 1, onFoot: false };
  const R = standPoint(h, { x: 3, z: 2 }), L = standPoint(h, { x: -3, z: 2 });
  const crate = { x: 0, z: -WU.CRATE_BACK };
  check('on the bike they come to the crate, on their own side', hyp(R.x - crate.x, R.z - crate.z) < WU.CRATE_SIDE + 0.01 && R.x > 0 && L.x < 0 && R.z < 0, `R ${R.x.toFixed(2)},${R.z.toFixed(2)}`);
  check('...clear of Bessie herself', hyp(R.x, R.z) > 0.8);
  const F = standPoint({ x: 0, z: 0, onFoot: true }, { x: 0, z: 5 });
  check('on foot they come to a step in front of him', Math.abs(F.z - WU.REACH_FOOT) < 1e-6 && Math.abs(F.x) < 1e-6);
}
// on foot
{
  const W = world({ hank: { x: -12, z: 0, onFoot: true }, customers: [{ spot: 'birdie', x: 0, z: 0, avail: 'walk' }], script: (W2, H) => { H.vx = H.x < -8 ? 1.4 : 0; } }).run(14);
  const c = W.cust.birdie, pay = W.first('pay');
  check('on foot: they come to him and take it', !!pay && W.pays[1] === 1);
  check('on foot: no fallback, no cancel', !W.types().includes('fallback') && !W.types().includes('cancel'), W.types().join(','));
  void c;
}
// riding past at speed
{
  const W = world({ hank: { x: 0, z: -40, vz: 7 }, customers: [{ spot: 'doug', x: 3, z: 0, avail: 'walk' }] }).run(10);
  check('riding past at speed: nothing happens', W.ev.length === 0, W.types().join(','));
}
// slowing down, then riding off
{
  const W = world({
    hank: { x: 0, z: -20 }, customers: [{ spot: 'marie', x: 6, z: 2, avail: 'walk' }],
    script: (W2, H) => { if (W2.t < 4) brakeTo(-4, 6)(W2, H); else H.vz = Math.min(8, (H.vz || 0) + 6 * DT); },
  }).run(9);
  check('slowing down nearby, then riding off: they set off, then give up', W.types().includes('start') && W.types().includes('cancel') && !W.types().includes('pay'), W.types().join(','));
  check('...and nothing is paid', !W.pays[1] && W.orders[0].state === 'carried');
  check('...and they go back home', hyp(W.cust.marie.x - 6, W.cust.marie.z - 2) < 0.3);
  check('...and wait a little before trying again', W.S.cool.marie > 0 || W.S.job === null);
}
// can't get there: wait, then Hank comes to them
{
  const W = world({
    hank: { x: 0, z: -20 }, customers: [{ spot: 'lou', x: 8, z: 0, avail: 'walk', blocked: true }],
    script: (W2, H) => { if (W2.t < 9) brakeTo(0)(W2, H); else { const dx = 8 - H.x, dz = 0 - H.z, d = hyp(dx, dz); const v = d > 1.6 ? 1.5 : 0; H.vx = (dx / d) * v; H.vz = (dz / d) * v; } },
  }).run(20);
  check("can't get to him: they wait where they are", W.types().includes('fallback'), W.types().join(','));
  check('...and Hank coming right up to them hands it over', W.pays[1] === 1 && W.types().indexOf('pay') > W.types().indexOf('fallback'));
}
// a wary one: slower, still comes
{
  const W = world({ hank: { x: 0, z: -20 }, customers: [{ spot: 'ingrid', x: -5, z: 3, avail: 'nervous', speed: 0.9 }], script: brakeTo(0) }).run(18);
  check('a wary customer edges over and still takes it', W.pays[1] === 1 && !W.types().includes('cancel'), W.types().join(','));
}
// indoors: comes out when Hank stops by the door
{
  const W = world({ hank: { x: 0, z: -20 }, customers: [{ spot: 'gus', x: 7, z: 4, avail: 'inside', door: { x: 4, z: 2 } }], script: brakeTo(0) }).run(16);
  check('indoors: out of the door and over to Hank once he stops', W.types()[0] === 'start' && W.pays[1] === 1, W.types().join(','));
}
// frightened, in hiding: snatches once Hank has stood still nearby a moment
{
  const W = world({ hank: { x: 0, z: -20 }, customers: [{ spot: 'agnes', x: 3, z: 3, avail: 'hiding' }], script: brakeTo(0) }).run(10);
  const sn = W.ev.filter((e) => e.type === 'snatch');
  check('frightened, in hiding: one snatch after Hank stands still a moment', sn.length === 1 && W.pays[1] === 1, W.types().join(','));
}
// two customers: the nearest first, then the other
{
  const W = world({ hank: { x: 0, z: -20 }, customers: [{ spot: 'pip', x: 9, z: 1, avail: 'walk' }, { spot: 'agnes', x: 3, z: 2, avail: 'walk' }], script: brakeTo(0) }).run(30);
  const p1 = W.ev.filter((e) => e.type === 'pay').map((e) => e.spot);
  check('two customers about: the nearer one first, then the other', p1.join() === 'agnes,pip' && W.pays[1] === 1 && W.pays[2] === 1, p1.join());
}
// the prompt still works (and never pays twice)
{
  const W = world({ hank: { x: 0, z: 0 }, customers: [{ spot: 'birdie', x: 1.5, z: 0, avail: 'stand' }] });
  const S = W.S, c = W.cust.birdie;
  const f = S.force(c.o, c, { ...W.hank, fx: 0, fz: 1 });
  check('the prompt: straight to the hand-over', f && f.fresh && f.job.phase === 'hand');
  W.run(4);
  check('the prompt: paid once', W.pays[1] === 1 && W.types().includes('done'), W.types().join(','));
  check('the prompt again: nothing more to hand over', S.force(c.o, c, W.hank) === null);
}
// a cutscene starts in the middle of it
{
  let mid = null;
  const W = world({ hank: { x: 0, z: -20 }, customers: [{ spot: 'doug', x: 6, z: 3, avail: 'walk' }], script: (W2, H) => { brakeTo(0)(W2, H); const t = W2.first('target'); if (t && W2.t > t.t + 0.4 && !H.scene) { H.scene = true; mid = W2.S.job?.phase; } } });
  W.run(12);
  check('a cutscene mid-walk: called off cleanly, nothing paid', mid === 'approach' && W.types().includes('cancel') && !W.pays[1] && W.S.job === null, `${mid} ${W.types().join(',')}`);
}
// can't be standing still in a menu forever: a menu holds the job, it carries on after
{
  const W = world({ hank: { x: 0, z: -20 }, customers: [{ spot: 'marie', x: 4, z: 2, avail: 'walk' }], script: (W2, H) => { brakeTo(0)(W2, H); H.free = !(W2.t > 9 && W2.t < 14); } }).run(25);
  check('a menu in the middle: it waits, then carries on', W.pays[1] === 1, W.types().join(','));
}
// the thank-you bubbles are short
const lines = Object.values(THANKS).flatMap((t) => [...t.hot, ...t.cold]);
check('thank-you bubbles are short (at most 30 characters)', lines.every((l) => l.length <= 30), lines.filter((l) => l.length > 30).join(' | '));
check('a hot cup gets a happy line, a cold one a chilly one', THANKS.gus.hot.includes(thanksLine('gus', 90, 0)) && THANKS.gus.cold.includes(thanksLine('gus', 20, 0.5)));

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
