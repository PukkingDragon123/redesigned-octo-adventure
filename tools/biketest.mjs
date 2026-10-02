// node tools/biketest.mjs [-v]
// Headless checks for Bessie: drives the real Bike class (src/game/bike.js) over a mock
// world with scripted inputs at 120 Hz physics / 60 Hz input, and checks speed and hills,
// rhythm pedalling, wheelies and loop-outs, stoppies and endos, bunny-hop timing, ramp
// flips and spins, landings and bails, slides, foot dabs, kerbs, drifts and touch assists.
import { Bike } from '../src/game/bike.js';
import { Skills, SKILLS, MAX_TIERS } from '../src/game/skills.js';
import { newState } from '../src/game/state.js';

// mock world: height fn, surface fn, optional ramp (kind 'ramp') and solids
function world({ h = () => 0, surface = () => 'road', ramp = null, solids = [] } = {}) {
  const eps = 0.5;
  return {
    groundAt(x, z, y = 1e9, stepUp = 0.75) {
      let hh = h(x, z);
      const hx = h(x + eps, z) - h(x - eps, z), hz = h(x, z + eps) - h(x, z - eps);
      const l = Math.hypot(hx, 2 * eps, hz);
      let nx = -hx / l, ny = (2 * eps) / l, nz = -hz / l;
      let plat = null;
      if (ramp && Math.abs(x - ramp.x) < ramp.w / 2 && z >= ramp.z0 && z <= ramp.z1) {
        const t = (z - ramp.z0) / (ramp.z1 - ramp.z0);
        const ph = ramp.y0 + (ramp.y1 - ramp.y0) * t;
        if (ph <= y + stepUp && ph > hh - 0.01) {
          hh = ph;
          plat = { kind: 'ramp' };
          const sl = (ramp.y1 - ramp.y0) / (ramp.z1 - ramp.z0);
          const nl = Math.hypot(sl, 1);
          nx = 0; ny = 1 / nl; nz = -sl / nl;
        }
      }
      return { h: hh, nx, ny, nz, surface: plat ? 'wood' : surface(x, z), platform: plat, water: false };
    },
    resolve(pos, r) {
      let hit = null;
      for (const o of solids) {
        const dx = pos.x - o.x, dz = pos.z - o.z, d = Math.hypot(dx, dz);
        if (pos.y + 1.6 < o.y0 || pos.y + 0.25 > o.y1) continue;
        if (d < r + o.r) {
          const depth = r + o.r - d;
          const nx = dx / (d || 1), nz = dz / (d || 1);
          pos.x += nx * depth; pos.z += nz * depth;
          hit = { nx, nz, depth, obj: o };
        }
      }
      return hit;
    },
  };
}

// run: ctl(t, bike) -> controls; returns log
function run(w, ctl, { T = 10, dt = 1 / 120, x = 0, z = 0, yaw = 0, setup, log = false, frame = 1 / 60 } = {}) {
  const b = new Bike(w);
  b.reset(x, z, yaw);
  setup?.(b);
  const events = [];
  let t = 0, c = null, nextFrame = 0;
  const trace = [];
  while (t < T) {
    if (t >= nextFrame) { c = ctl(t, b); nextFrame += frame; }
    b.update(dt, c);
    for (const e of b.events) events.push({ t: +t.toFixed(3), ...e });
    if (log && Math.round(t * 120) % Math.round(log * 120) === 0) trace.push(`t=${t.toFixed(2)} v=${b.speed.toFixed(2)} y=${b.pos.y.toFixed(2)} z=${b.pos.z.toFixed(1)} wh=${b.wheelie.toFixed(2)} st=${b.stoppie.toFixed(2)} p=${b.pitch.toFixed(2)} gr=${b.grounded} pose=${b.pose} lean=${b.lean.toFixed(2)} rh=${b.rhythm.toFixed(2)} cr=${b.crash.toFixed(2)}`);
    t += dt;
  }
  return { b, events, trace };
}

const C = (o = {}) => ({ throttle: 0, brake: 0, steer: 0, jump: false, drift: false, leanBack: 0, leanFwd: 0, assist: false, ...o });

const flat = world();
const results = [];
const check = (name, ok, info = '') => { results.push({ name, ok, info }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${info}`); };
const ev = (r, type) => r.events.filter((e) => e.type === type);
const verbose = process.argv.includes('-v');

// --- 1. pedalling on the flat: accelerates, tops out ~8 m/s
{
  const r = run(flat, () => C({ throttle: 1 }), { T: 12 });
  const r4 = run(flat, () => C({ throttle: 1 }), { T: 4 });
  check('flat hold-pedal top speed 7-8.6 m/s', r.b.speed > 7 && r.b.speed < 8.6, `v12=${r.b.speed.toFixed(2)} v4=${r4.b.speed.toFixed(2)}`);
  check('pedal strokes emitted', ev(r, 'pedalStroke').length > 20, `${ev(r, 'pedalStroke').length}`);
}
// --- 2. hills: uphill slow, downhill coast fast
{
  const up = world({ h: (x, z) => z * 0.12 });
  const r = run(up, () => C({ throttle: 1 }), { T: 14 });
  check('uphill 12% top speed < 5.5', r.b.speed < 5.5 && r.b.speed > 2.5, `v=${r.b.speed.toFixed(2)}`);
  const down = world({ h: (x, z) => -z * 0.14 });
  const r2 = run(down, () => C({}), { T: 14, setup: (b) => b.vel.set(0, 0, 3) });
  check('downhill 14% coast > 10 m/s', r2.b.speed > 10, `v=${r2.b.speed.toFixed(2)}`);
}
// --- 3. rhythm tapping beats holding; mashing slips
{
  const tap = (t) => C({ throttle: (t % 0.36) < 0.18 ? 1 : 0 });
  const r = run(flat, tap, { T: 14 });
  const h = run(flat, () => C({ throttle: 1 }), { T: 14 });
  check('rhythm tapping faster than holding', r.b.speed > h.b.speed + 0.4, `tap=${r.b.speed.toFixed(2)} hold=${h.b.speed.toFixed(2)} rhythm=${r.b.rhythm.toFixed(2)}`);
  const mash = (t) => C({ throttle: t < 2 ? 1 : (t % 0.1) < 0.05 ? 1 : 0 });
  const m = run(flat, mash, { T: 3, frame: 1 / 120 });
  check('mashing slips a foot', ev(m, 'pedalSlip').length > 0, `${ev(m, 'pedalSlip').length}`);
}
// --- 4. wheelie: holding lean back loops out; a feathering rider holds 12 s
{
  const r = run(flat, (t) => C({ throttle: 1, leanBack: t > 2 ? 1 : 0 }), { T: 6 });
  const bail = ev(r, 'bail')[0];
  check('holding leanBack loops out', bail?.why === 'loopout', `bail=${JSON.stringify(bail)}`);
  // feathering bot with a human-ish reaction delay
  const mk = (delay, lo = 0.5, hi = 0.68) => {
    const hist = [];
    return (t, b) => {
      hist.push({ t, th: b.wheelie, om: b.wheelieVel });
      const seen = hist.find((h) => h.t >= t - delay) || hist[0];
      const pred = seen.th + seen.om * 0.15;
      return C({ throttle: 1, leanBack: t > 2 && pred < lo ? 1 : 0, brake: pred > 0.9 ? 1 : 0 });
    };
  };
  for (const d of [0.1, 0.2]) {
    const w = run(flat, mk(d), { T: 18 });
    const ends = ev(w, 'wheelieEnd');
    const best = Math.max(0, ...ends.map((e) => e.time), w.b.wheelieT);
    check(`feathered wheelie (reaction ${d}s) holds >= 12 s`, best >= 12 && !ev(w, 'bail').length, `best=${best.toFixed(1)} bails=${ev(w, 'bail').length} v=${w.b.speed.toFixed(1)}`);
  }
  // just tapping once then releasing: front drops back
  const d = run(flat, (t) => C({ throttle: 1, leanBack: t > 2 && t < 2.25 ? 1 : 0 }), { T: 5 });
  const e = ev(d, 'wheelieEnd')[0];
  check('short pop drops the front again', e && !ev(d, 'bail').length, `${JSON.stringify(e)}`);
  // manual: coast + lean back at speed
  const man = mk(0.12);
  const mr = run(flat, (t, b) => { const c = man(t, b); return { ...c, throttle: t < 3 ? 1 : 0, leanBack: t > 3 ? c.leanBack : 0 }; }, { T: 9 });
  const me = ev(mr, 'wheelieEnd').filter((x) => x.manual);
  check('manual (no pedalling) works and bleeds speed', me.length > 0 || mr.b.wheelieT > 1, `manual=${JSON.stringify(me[0])} v=${mr.b.speed.toFixed(1)}`);
  if (verbose) console.log(run(flat, (t) => C({ throttle: 1, leanBack: t > 2 ? 1 : 0 }), { T: 4, log: 0.1 }).trace.join('\n'));
}
// --- 5. stoppie and endo
{
  const s = run(flat, (t) => C({ throttle: t < 3 ? 1 : 0, brake: t > 3 ? 1 : 0, leanFwd: t > 3 ? 1 : 0 }), { T: 6 });
  check('holding brake + leanFwd at speed goes over the bars', ev(s, 'bail')[0]?.why === 'endo', `${JSON.stringify(ev(s, 'bail')[0])}`);
  const fe = (t, b) => C({ throttle: t < 3 ? 1 : 0, brake: t > 3 ? 1 : 0, leanFwd: t > 3 && b.stoppie + b.stoppieVel * 0.15 < 0.55 ? 1 : 0, leanBack: b.stoppie > 0.95 ? 1 : 0 });
  const s2 = run(flat, fe, { T: 7 });
  const se = ev(s2, 'stoppieEnd')[0];
  check('feathered stoppie, no bail', se && se.time > 0.8 && !ev(s2, 'bail').length, `${JSON.stringify(se)} bails=${ev(s2, 'bail').length}`);
  let minV = 9;
  const nb = run(flat, (t, b) => { if (t > 3.5) minV = Math.min(minV, b.speed); return C({ throttle: t < 3 ? 1 : 0, brake: t > 3 ? 1 : 0 }); }, { T: 5 });
  check('plain braking stops without a stoppie', !ev(nb, 'stoppieStart').length && minV < 0.3, `minV=${minV.toFixed(2)}`);
  if (verbose) console.log(run(flat, (t) => C({ throttle: t < 3 ? 1 : 0, brake: t > 3 ? 1 : 0, leanFwd: t > 3 ? 1 : 0 }), { T: 5, log: 0.05 }).trace.slice(58).join('\n'));
  if (verbose) console.log(run(flat, fe, { T: 6, log: 0.1 }).trace.slice(28).join('\n'));
}
// --- 6. bunny hop: crouch timing
{
  const hop = (hold) => {
    const r = run(flat, (t) => C({ throttle: 1, jump: t > 3 && t < 3 + hold }), { T: 5.5 });
    const l = ev(r, 'land')[0];
    return { h: l?.height || 0, j: ev(r, 'jump')[0], l, r };
  };
  const tap = hop(0.03), good = hop(0.33), long = hop(1.2);
  check('timed crouch hops higher than a tap', good.h > tap.h * 1.4, `tap=${tap.h.toFixed(2)} timed=${good.h.toFixed(2)} long=${long.h.toFixed(2)} perfect=${good.j?.perfect}`);
  check('flat hop lands perfect', !!good.l?.perfect && !ev(good.r, 'bail').length, `${JSON.stringify(good.l)}`);
}
// --- 7. ramp: flips need the jump; level landings are clean, crooked ones bail
{
  const ramp = { x: 0, w: 3, z0: 20, z1: 26, y0: 0, y1: 2.2 };
  const rw = world({ ramp });
  const base = (t, b) => ({ throttle: b.pos.z < 26 ? 1 : 0, jump: b.pos.z > 24.6 && b.pos.z < 25.9 });
  const plain = run(rw, (t, b) => C(base(t, b)), { T: 10, z: -10, setup: (b) => b.vel.set(0, 0, 4) });
  const pl = ev(plain, 'land')[0];
  check('ramp jump lands without bail', pl && !ev(plain, 'bail').length, `${JSON.stringify(pl)}`);
  // backflip: hold lean back after the lip, release to level
  const flipBot = (dir) => (t, b) => {
    const c = C(base(t, b));
    if (!b.grounded && b.airTime > 0.05) {
      const target = dir * Math.PI * 2;
      const rem = target - b.airFlip;
      const want = Math.abs(rem) > 1.3 ? Math.sign(rem) : 0;
      if (want > 0) c.leanBack = 1; else if (want < 0) c.leanFwd = 1;
    }
    return c;
  };
  const bf = run(rw, flipBot(1), { T: 10, z: -10, setup: (b) => b.vel.set(0, 0, 4) });
  check('backflip off the ramp', ev(bf, 'flip').some((e) => e.dir === 'back'), `flips=${JSON.stringify(ev(bf, 'flip'))} land=${JSON.stringify(ev(bf, 'land')[0])} bail=${JSON.stringify(ev(bf, 'bail')[0])}`);
  const ff = run(rw, flipBot(-1), { T: 10, z: -10, setup: (b) => b.vel.set(0, 0, 4) });
  check('frontflip off the ramp', ev(ff, 'flip').some((e) => e.dir === 'front'), `flips=${JSON.stringify(ev(ff, 'flip'))} land=${JSON.stringify(ev(ff, 'land')[0])} bail=${JSON.stringify(ev(ff, 'bail')[0])}`);
  // half a flip and no correction: lands upside-down-ish -> bail
  const half = run(rw, (t, b) => ({ ...C(base(t, b)), leanBack: !b.grounded && b.airTime > 0.05 && b.airTime < 0.45 ? 1 : 0 }), { T: 10, z: -10, setup: (b) => b.vel.set(0, 0, 4) });
  check('over-rotated landing bails', ev(half, 'bail').length > 0, `${JSON.stringify(ev(half, 'bail')[0])} ${JSON.stringify(ev(half, 'land')[0])}`);
  // spin: hold D in the air
  const sp = run(rw, (t, b) => ({ ...C(base(t, b)), steer: !b.grounded && b.airTime > 0.05 && Math.abs(b.airSpin) < Math.PI * 2 - 1.1 ? 1 : 0 }), { T: 10, z: -10, setup: (b) => b.vel.set(0, 0, 4) });
  check('360 spin off the ramp', ev(sp, 'spin').some((e) => e.deg >= 360), `spins=${JSON.stringify(ev(sp, 'spin'))} land=${JSON.stringify(ev(sp, 'land')[0])} bail=${JSON.stringify(ev(sp, 'bail')[0])}`);
  const sp90 = run(rw, (t, b) => ({ ...C(base(t, b)), steer: !b.grounded && b.airTime > 0.05 && Math.abs(b.airSpin) < 0.6 ? 1 : 0 }), { T: 10, z: -10, setup: (b) => b.vel.set(0, 0, 4) });
  check('landing sideways (90 deg) bails', ev(sp90, 'bail').length > 0, `${JSON.stringify(ev(sp90, 'bail')[0])}`);
  // assists (touch): the same lazy 90 degree spin is forgiven more often
  if (verbose) console.log(run(rw, flipBot(1), { T: 6, z: -10, setup: (b) => b.vel.set(0, 0, 4), log: 0.1 }).trace.join('\n'));
}
// --- 8. cornering: too fast on grass slides out; on the road it just skids
{
  const grass = world({ surface: () => 'grass' });
  const g = run(grass, (t) => C({ throttle: 1, steer: t > 4 ? 1 : 0 }), { T: 7, setup: (b) => b.vel.set(0, 0, 9) });
  check('full lock at speed on grass: skid/slide', ev(g, 'skid').length > 0 || ev(g, 'bail').length > 0, `skid=${ev(g, 'skid').length} bail=${JSON.stringify(ev(g, 'bail')[0])}`);
  const road = run(flat, (t) => C({ throttle: 1, steer: t > 4 ? 1 : 0 }), { T: 7 });
  check('full lock on road: no bail', !ev(road, 'bail').length, `skid=${ev(road, 'skid').length}`);
}
// --- 9. low speed foot dab
{
  const r = run(flat, (t) => C({ throttle: t < 1 ? 1 : 0, brake: t > 1 && t < 2 ? 1 : 0 }), { T: 4 });
  check('stopping dabs a foot', ev(r, 'dab').length > 0 && r.b.pose === 'dab', `pose=${r.b.pose}`);
}
// --- 10. kerb bump
{
  const kerb = world({ h: (x, z) => (z > 30 ? 0.12 : 0) });
  const r = run(kerb, () => C({ throttle: 1 }), { T: 9 });
  check('kerb gives a bump', ev(r, 'bump').length > 0, `${JSON.stringify(ev(r, 'bump')[0])}`);
}
// --- 11. drift
{
  const r = run(flat, (t) => C({ throttle: 1, steer: t > 5 ? 1 : 0, drift: t > 5 && t < 6.8 }), { T: 8 });
  check('drift start/end + boost', ev(r, 'driftStart').length && ev(r, 'driftEnd').length, `${JSON.stringify(ev(r, 'driftEnd')[0])} boost=${ev(r, 'driftBoost').length}`);
}
// --- 12. touch assists: holding lean is a stable wheelie / stoppie; lazy landings forgiven
{
  const w = run(flat, (t) => C({ throttle: 1, leanBack: t > 2 ? 1 : 0, assist: true }), { T: 16 });
  check('assist: holding lean-back gives a long wheelie, no loop-out', !ev(w, 'bail').length && w.b.wheelieT > 10, `wheelieT=${w.b.wheelieT.toFixed(1)} th=${w.b.wheelie.toFixed(2)} bails=${ev(w, 'bail').length}`);
  const s = run(flat, (t) => C({ throttle: t < 3 ? 1 : 0, brake: t > 3 ? 1 : 0, leanFwd: t > 3 ? 1 : 0, assist: true }), { T: 6 });
  check('assist: holding brake + leanFwd stoppies without an endo', !ev(s, 'bail').length && ev(s, 'stoppieStart').length, `${JSON.stringify(ev(s, 'stoppieEnd')[0])}`);
  const ramp = { x: 0, w: 3, z0: 20, z1: 26, y0: 0, y1: 2.2 };
  const rw = world({ ramp });
  const base = (t, b) => ({ throttle: b.pos.z < 26 ? 1 : 0, jump: b.pos.z > 24.6 && b.pos.z < 25.9, assist: true });
  const sp = run(rw, (t, b) => ({ ...C(base(t, b)), steer: !b.grounded && b.airTime > 0.05 && Math.abs(b.airSpin) < 0.3 ? 1 : 0 }), { T: 10, z: -10, setup: (b) => b.vel.set(0, 0, 4) });
  check('assist: a small crooked landing is forgiven', !ev(sp, 'bail').length, `${JSON.stringify(ev(sp, 'land')[0])}`);
  const g = world({ surface: () => 'grass' });
  const gr = run(g, (t) => C({ throttle: 1, steer: t > 4 ? 1 : 0, assist: true }), { T: 8, setup: (b) => b.vel.set(0, 0, 9) });
  check('assist: no slide-out bails on grass', !ev(gr, 'bail').length, '');
}
// --- 13. Harold's riding notes: events -> bests -> tiers -> fanfare, saves
{
  const toasts = [];
  const pos = { x: 0, y: 0, z: 0, clone() { return { ...this }; } };
  const game = {
    state: newState(), mode: 'ride', onFoot: false,
    bike: { crash: 0, wheelieT: 0, wheeliePedalT: 0, stoppieT: 0, stoppieBrakeT: 0, drifting: false, driftTime: 0, rhythm: 0, grounded: true, pos },
    ui: { toast: (t) => toasts.push(t), tag() {} }, sound: { play() {} }, effects: { confetti() {} }, rider: { ch: { react() {} } }, story: { onMastery() {} }, save() {},
  };
  const S = new Skills(game);
  const tier = (id) => S.list().find((s) => s.id === id).tier;
  check('skills: 15 skills / 45 tiers with the contract fields', SKILLS.length === 15 && MAX_TIERS === 45 && ['id', 'name', 'icon', 'how', 'desc', 'tier', 'maxTier', 'goal', 'progress'].every((k) => k in S.list()[0]));
  S.event({ type: 'wheelieEnd', time: 5.5, manual: false });
  S.event({ type: 'land', hop: true, ramp: false, height: 0.9, airTime: 0.9, dist: 5 });
  S.event({ type: 'land', hop: true, ramp: true, height: 2.5, airTime: 1.5, dist: 9 });
  for (let i = 0; i < 5; i++) S.event({ type: 'land', flips: 1, airTime: 1.6 });
  S.event({ type: 'land', flips: 2, airTime: 2 });
  S.event({ type: 'combo', count: 7 });
  check('skills: wheelie 5.5 s -> II, hop 0.9 m -> II (ramp hops ignored), double backflip -> III, x7 -> III', tier('wheelie') === 2 && tier('bunnyhop') === 2 && tier('backflip') === 3 && tier('combo') === 3 && tier('longjump') === 1);
  game.bike.wheelieT = 12.5; game.bike.wheeliePedalT = 12;
  S.update(1 / 60);
  check('skills: a long wheelie unlocks its tier mid-wheelie', tier('wheelie') === 3);
  game.bike.wheelieT = 0;
  for (let i = 0; i < 60 * 40; i++) S.update(1 / 60);
  check('skills: one toast + tip per tier-up', toasts.length === S.total() && game.state.money > 0, `toasts=${toasts.length} money=${game.state.money}`);
  game.state = JSON.parse(JSON.stringify(game.state));
  check('skills: tiers survive a save/load', S.total() === toasts.length);
  game.state = { ...newState(), upgrades: { rack: true, motor: true } };
  delete game.state.skills;
  check('skills: an old save with upgrades and no skills loads clean', S.total() === 0 && S.list().length === 15);
}
const fails = results.filter((r) => !r.ok);
console.log(`\n${results.length - fails.length}/${results.length} passed`);
process.exit(fails.length ? 1 : 0);
