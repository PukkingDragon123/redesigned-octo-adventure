// node tools/biketest.mjs [-v]
// Headless checks for Bessie: drives the real Bike class (src/game/bike.js) over a mock
// world with scripted inputs at 120 Hz physics / 60 Hz input, and checks the crank (spinning
// makes speed, nothing moves her by itself, she coasts when the spinning stops, back-pedal
// brake, alternating keys, no cadence cap), the gears (automatic and by hand) and top speeds,
// Hank's stamina, crashes cooling the cocoa, hills, wheelies and
// loop-outs, stoppies and endos, bunny-hop timing, ramp flips and spins, landings and bails,
// slides, foot dabs, kerbs, drifts and touch assists.
import { Bike } from '../src/game/bike.js';
import { PedalFeed } from '../src/core/pedal.js';
import { Orders } from '../src/game/orders.js';
import { Skills, SKILLS, MAX_TIERS } from '../src/game/skills.js';
import { newState } from '../src/game/state.js';
import { PhysicsWorld } from '../src/world/collide.js';
import { Walker } from '../src/game/walker.js';

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
    resolve(pos, r, hgt = 1.6, opt = null) {
      let hit = null;
      for (const o of solids) {
        const dx = pos.x - o.x, dz = pos.z - o.z, d = Math.hypot(dx, dz);
        if (pos.y + hgt < o.y0 || pos.y + (opt?.minTop ?? 0.25) > o.y1) continue;
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
    // (like the game: a frame's crank turn goes to its first physics step only)
    if (t >= nextFrame) { c = ctl(t, b); nextFrame += frame; } else if (c.turn) c = { ...c, turn: 0 };
    b.update(dt, c);
    for (const e of b.events) events.push({ t: +t.toFixed(3), ...e });
    if (log && Math.round(t * 120) % Math.round(log * 120) === 0) trace.push(`t=${t.toFixed(2)} v=${b.speed.toFixed(2)} y=${b.pos.y.toFixed(2)} z=${b.pos.z.toFixed(1)} wh=${b.wheelie.toFixed(2)} st=${b.stoppie.toFixed(2)} p=${b.pitch.toFixed(2)} gr=${b.grounded} pose=${b.pose} lean=${b.lean.toFixed(2)} gear=${b.gear} spin=${b.spinRate.toFixed(1)} st=${b.stamina.toFixed(2)} cr=${b.crash.toFixed(2)}`);
    t += dt;
  }
  return { b, events, trace };
}

// controls; `throttle: 1` (the old held pedal) now means turning the crank at an easy, steady SPIN
const SPIN = 11; // rad/s, ~1.75 turns a second
const C = ({ throttle = 0, ...o } = {}) => ({ pedal: throttle * SPIN, turn: 0, brake: 0, steer: 0, jump: false, drift: false, leanBack: 0, leanFwd: 0, assist: false, ...o });

const flat = world();
const results = [];
const check = (name, ok, info = '') => { results.push({ name, ok, info }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${info}`); };
const ev = (r, type) => r.events.filter((e) => e.type === type);
const verbose = process.argv.includes('-v');

// --- 1. the crank: spinning makes speed; nothing else does
{
  const r = run(flat, () => C({ throttle: 1 }), { T: 12 });
  const r4 = run(flat, () => C({ throttle: 1 }), { T: 4 });
  check('easy spin on the flat cruises 10-11 m/s in top gear', r.b.speed > 10 && r.b.speed < 11 && r.b.gear === 3, `v12=${r.b.speed.toFixed(2)} v4=${r4.b.speed.toFixed(2)} gear=${r.b.gear}`);
  check('pedal strokes emitted', ev(r, 'pedalStroke').length > 20, `${ev(r, 'pedalStroke').length}`);
  const slow = run(flat, () => C({ pedal: 7 }), { T: 10 }), fast = run(flat, () => C({ pedal: 15 }), { T: 10 });
  check('spinning faster goes faster (the gears want a quicker spin at speed)', fast.b.speed > slow.b.speed + 1.5 && slow.b.speed > 3, `spin7=${slow.b.speed.toFixed(2)} spin15=${fast.b.speed.toFixed(2)}`);
  // standing still with nobody touching anything: she doesn't budge, on the flat or a gentle slope
  for (const [name, w] of [['flat', flat], ['5% slope', world({ h: (x, z) => z * 0.05 + x * 0.02 })]]) {
    let moved = 0;
    const rest = run(w, (t, b) => { moved = Math.max(moved, Math.hypot(b.pos.x, b.pos.z)); return C(); }, { T: 10 });
    check(`no input on the ${name}: the bike stays put`, moved < 1e-6 && rest.b.speed < 1e-6 && Math.abs(rest.b.crank) < 1e-9 && !ev(rest, 'pedalStroke').length, `moved=${moved.toExponential(1)} v=${rest.b.speed}`);
  }
  // stop spinning: the pedals stop at once and she coasts down, never speeding up again
  let peak = 0, worst = 0, last = null, crankAt = 0, crankEnd = 0;
  const co = run(flat, (t, b) => {
    if (t < 10) peak = b.speed;
    else {
      if (last != null) worst = Math.max(worst, b.speed - last);
      last = b.speed;
      if (t < 10.6) crankAt = b.crank;
      crankEnd = b.crank;
    }
    return C({ throttle: t < 10 ? 1 : 0 });
  }, { T: 60 });
  const at14 = run(flat, (t) => C({ throttle: t < 10 ? 1 : 0 }), { T: 14 });
  check('stop spinning: the pedals stop and she coasts down to a halt', worst <= 1e-9 && at14.b.speed < peak - 1.4 && co.b.speed < 0.01 && Math.abs(crankEnd - crankAt) < 0.05, `peak=${peak.toFixed(2)} v14=${at14.b.speed.toFixed(2)} v60=${co.b.speed.toFixed(3)} speedup=${worst.toExponential(1)} crank drift=${(crankEnd - crankAt).toFixed(3)}`);
  const bp = run(flat, (t) => C({ pedal: t < 8 ? SPIN : -8 }), { T: 11 });
  check('back-pedalling is a coaster brake', bp.b.speed < 0.6, `v=${bp.b.speed.toFixed(2)}`);
}
// --- 2. hills: uphill slow, downhill coast fast
{
  const up = world({ h: (x, z) => z * 0.12 });
  const r = run(up, () => C({ throttle: 1 }), { T: 14 });
  check('uphill 12% at an easy spin: barely more than half the flat speed (< 6 m/s)', r.b.speed < 6 && r.b.speed > 2.5, `v=${r.b.speed.toFixed(2)}`);
  const down = world({ h: (x, z) => -z * 0.14 });
  const r2 = run(down, () => C({}), { T: 14, setup: (b) => b.vel.set(0, 0, 3) });
  check('downhill 14% coast > 12 m/s', r2.b.speed > 12, `v=${r2.b.speed.toFixed(2)}`);
  let fast = 0;
  const r3 = run(world({ h: (x, z) => -z * 0.08 }), (t, b) => { fast = Math.max(fast, b.speed); return C({ pedal: 22 }); }, { T: 12 });
  check('downhill 8% spinning flat out: faster still (> 19.5 m/s)', fast > 19.5, `peak=${fast.toFixed(2)} gear=${r3.b.gear}`);
}
// --- 3. keys: W and S are the two feet; each change of foot winds the crank half a turn
{
  const feed = (script, T = 3, fps = 60) => {
    const f = new PedalFeed();
    let out = 0, maxStep = 0;
    for (let i = 0; i < T * fps; i++) {
      script(f, i);
      const d = f.update(1 / fps);
      out += d;
      if (i > 0.6 * fps) maxStep = Math.max(maxStep, d);
    }
    return { f, out, maxStep };
  };
  const hold = feed((f, i) => { if (i === 0) f.stroke(1); });
  check('holding W turns the crank half a turn, then nothing (no auto pedal)', Math.abs(hold.out - Math.PI) < 1e-6, `turned=${hold.out.toFixed(3)}`);
  const same = feed((f, i) => { if (i % 15 === 0) f.stroke(1); });
  check('tapping the same key over and over does nothing more', Math.abs(same.out - Math.PI) < 1e-6, `turned=${same.out.toFixed(3)}`);
  const sOnly = feed((f) => f.stroke(-1));
  check('S on its own (from rest) is the brake, not a stroke', sOnly.out === 0, `turned=${sOnly.out}`);
  // alternating at 4 strokes a second: two turns a second, handed out smoothly
  const alt = feed((f, i) => { if (i % 15 === 0) f.stroke((i / 15) % 2 ? -1 : 1); }, 4);
  const rate = alt.out / 4;
  check('alternating W / S four times a second spins ~2 turns a second, smoothly', Math.abs(rate - 4 * Math.PI) < 1.5 && alt.maxStep < (4 * Math.PI / 60) * 2.2, `rate=${rate.toFixed(2)} rad/s maxStep=${alt.maxStep.toFixed(3)}`);
  // ...and through the real bike
  const f = new PedalFeed();
  let k = 0;
  const kb = run(flat, (t) => { if (t >= k * 0.24) { f.stroke(k % 2 ? -1 : 1); k++; } return C({ turn: f.update(1 / 60) }); }, { T: 12 });
  check('alternating keys ride Bessie up to speed', kb.b.speed > 6.5, `v=${kb.b.speed.toFixed(2)} gear=${kb.b.gear}`);
  const f2 = new PedalFeed();
  const kh = run(flat, (t) => { if (t < 1e-9) f2.stroke(1); return C({ turn: f2.update(1 / 60) }); }, { T: 8 });
  check('one key held: a nudge, then she coasts to a stop', kh.b.speed < 0.05 && kh.b.pos.z < 6.5, `v=${kh.b.speed.toFixed(3)} z=${kh.b.pos.z.toFixed(2)}`);
  // no cadence cap: frantic alternation (14 strokes a second) still winds faster, and Bessie's
  // crank keeps up with whatever it's given
  const fr = feed((f, i) => { if (i % 4 === 0) f.stroke((i / 4) % 2 ? -1 : 1); }, 4);
  check('frantic W / S (15 strokes a second) spins ~7 turns a second: no cap at the old 36 rad/s', fr.out / 4 > 42, `rate=${(fr.out / 4).toFixed(1)} rad/s`);
  const cr = run(flat, () => C({ pedal: 60 }), { T: 2 });
  check('the crank keeps up with a super-fast spin (60 rad/s)', cr.b.spinRate > 58, `spin=${cr.b.spinRate.toFixed(1)}`);
}
// --- 3a. top speed and the gears: a frantic spin flies; bottom gear spins up easily but tops
// out early, top gear is a slog to wind up but goes; shifting by hand, one gear a press
{
  let peak = 0;
  const fl = run(flat, (t, b) => { peak = Math.max(peak, b.speed); return C({ pedal: 22 }); }, { T: 14 });
  const ex = ev(fl, 'exhausted')[0];
  check('flat out (3.5 turns a second) on the flat: 18-20 m/s, then Hank is spent after 10-15 s', peak > 17.8 && peak < 21 && ex && ex.t > 10 && ex.t < 15, `peak=${peak.toFixed(2)} exhausted at ${ex?.t}s`);
  // presses at given times (each once, on the first frame at or after it)
  const presses = (list) => { const left = [...list]; return (t, b) => { while (left.length && t >= left[0][0] - 1e-9) b.queueShift(left.shift()[1]); }; };
  const man = (gear, ctl, T, setup) => run(flat, ctl, { T, setup: (b) => { b.autoGear = false; b.gear = gear; setup?.(b); } });
  const g1 = man(1, () => C({ pedal: 22 }), 8), g3 = man(3, () => C({ pedal: 22 }), 2), g1s = man(1, () => C({ pedal: 22 }), 2);
  check('manual bottom gear: frantic spinning tops out early (< 9.5 m/s)', g1.b.speed < 9.5 && g1.b.gear === 1, `v=${g1.b.speed.toFixed(2)}`);
  check('manual top gear: slow to wind up from a stop (2 s: well behind bottom gear)', g3.b.speed < g1s.b.speed * 0.65 && g3.b.gear === 3, `top gear=${g3.b.speed.toFixed(2)} bottom=${g1s.b.speed.toFixed(2)}`);
  // up through the box by hand: 1 -> 2 -> 3, then coasting she stays in 3 (no automatic box)
  const pu = presses([[2, 1], [4, 1], [6, 1]]);
  const hand = man(1, (t, b) => { pu(t, b); return C({ pedal: t < 10 ? 22 : 0 }); }, 14);
  const gears = ev(hand, 'gear');
  check('shifting by hand: one gear a press, a click each, never past top, no auto shifts', gears.length === 2 && gears.every((e) => e.manual && e.dir === 1) && ev(hand, 'gearStop').length === 1 && hand.b.gear === 3, `gears=${JSON.stringify(gears)} final=${hand.b.gear}`);
  let top3 = 0;
  const pf = presses([[2.2, 1], [4.4, 1]]);
  man(1, (t, b) => { pf(t, b); top3 = Math.max(top3, b.speed); return C({ pedal: 22 }); }, 12);
  check('shifting up by hand at the right moments flies (> 18 m/s)', top3 > 18, `peak=${top3.toFixed(2)}`);
  const pd = presses([[0.5, -1], [0.5, -1]]);
  const down = man(3, (t, b) => { pd(t, b); return C({ pedal: 11 }); }, 3);
  check('two quick presses down drop two gears (none lost between steps)', down.b.gear === 1 && ev(down, 'gear').filter((e) => e.dir === -1).length === 2, `gear=${down.b.gear}`);
  // automatic, a hand shift is left alone for a moment before the box takes over again
  const ph = presses([[8, -1]]), pb = presses([[8, -1]]);
  const held = run(flat, (t, b) => { ph(t, b); return C({ throttle: 1 }); }, { T: 9.5 });
  const back = run(flat, (t, b) => { pb(t, b); return C({ throttle: 1 }); }, { T: 13 });
  check('automatic: a hand shift holds for a moment, then the box picks again', held.b.gear === 2 && back.b.gear === 3, `held=${held.b.gear} later=${back.b.gear}`);
}
// --- 3b. Hank's wind: flat-out spinning tires him (slower, wobblier); coasting brings it back
{
  const r = run(flat, (t) => C({ pedal: t < 30 ? 18 : 0 }), { T: 46 });
  const ex = ev(r, 'exhausted')[0], rec = ev(r, 'recovered')[0];
  check('a hard spin drains stamina until Hank is spent', !!ex && ex.t > 15 && ex.t < 30 && ev(r, 'winded').length > 0, `exhausted at ${ex?.t}s`);
  check('coasting and resting bring his wind back', !!rec && rec.t > 30 && r.b.stamina > 0.6 && !r.b.exhausted, `recovered at ${rec?.t}s stamina=${r.b.stamina.toFixed(2)}`);
  const mad = run(flat, () => C({ pedal: 30 }), { T: 10 });
  check('cranking like mad (~5 turns a second) empties him in well under 10 s', ev(mad, 'exhausted')[0]?.t < 7, `exhausted at ${ev(mad, 'exhausted')[0]?.t}s`);
  const cruise = run(flat, () => C({ throttle: 1 }), { T: 60 });
  check('an easy spin can be kept up for a good minute', cruise.b.stamina > 0.3 && !ev(cruise, 'exhausted').length, `stamina after 60 s=${cruise.b.stamina.toFixed(2)}`);
  const fresh = run(flat, () => C({ pedal: 14 }), { T: 6 });
  const spent = run(flat, () => C({ pedal: 14 }), { T: 6, setup: (b) => { b.stamina = 0; b.exhausted = true; b.tired = 1; } });
  check('spent, the same spinning goes much slower', spent.b.speed < fresh.b.speed * 0.8, `fresh=${fresh.b.speed.toFixed(2)} spent=${spent.b.speed.toFixed(2)}`);
}
// --- 3c. a crash knocks the heat out of every cup in the crate (more the harder the crash)
{
  const mk = () => {
    const game = { time: 0, bike: { stats: { capacity: 3 } }, ui: { pop() {} }, state: {}, cargo: null };
    const O = new Orders(game);
    O.list = [{ id: 1, state: 'carried', quality: 90 }, { id: 2, state: 'carried', quality: 70 }, { id: 3, state: 'board', quality: 100 }];
    return O;
  };
  const hard = mk(), soft = mk();
  hard.crashCool(12, false);
  soft.crashCool(4, true);
  const [h1, h2, h3] = hard.list.map((o) => o.quality), [s1] = soft.list.map((o) => o.quality);
  check('crash cools every carried cup (a hard one more than a soft one), not the ones on the board', h1 <= 90 - 25 && h2 <= 70 - 25 && h3 === 100 && s1 < 90 - 8 && s1 > h1 && hard.list[0].chills === 1, `hard: ${h1.toFixed(0)}, ${h2.toFixed(0)} soft: ${s1.toFixed(0)}`);
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
// --- 10b. a low log across the road: hops the bike up and over, no crash
{
  const log = world({ solids: Array.from({ length: 13 }, (_, i) => ({ x: (i - 6) * 0.5, z: 30, r: 0.3, y0: -1, y1: 0.42, kind: 'log' })) });
  const r = run(log, () => C({ throttle: 1 }), { T: 9 });
  check("low log: bump over it, keep going", ev(r, "bump").some((e) => e.kind === "log") && !ev(r, "bail").length && r.b.pos.z > 32, `z=${r.b.pos.z.toFixed(1)} bumps=${JSON.stringify(ev(r, "bump"))} bonks=${JSON.stringify(ev(r, "bonk"))}`);
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
  const tiers = S.total();
  check('skills: tier-ups pay no money and pop nothing up', tiers > 0 && toasts.length === 0 && game.state.money === 0, `toasts=${toasts.length} money=${game.state.money}`);
  game.state = JSON.parse(JSON.stringify(game.state));
  check('skills: tiers survive a save/load', S.total() === tiers);
  game.state = { ...newState(), upgrades: { rack: true, motor: true } };
  delete game.state.skills;
  check('skills: an old save with upgrades and no skills loads clean', S.total() === 0 && S.list().length === 15);
}
// --- 14. no phasing: the real collision world (flat terrain) with a thin fence, a wall, a door
{
  const flatT = { heightAt: () => 0, normalAt: (x, z, o) => { o.x = 0; o.y = 1; o.z = 0; return o; }, surfaceAt: () => 'road' };
  const mk = () => new PhysicsWorld(flatT, null);
  // Hank runs at a fence on hiccupy frames (10 fps) and can't get through it
  {
    const ph = mk();
    ph.addBox({ x: 0, z: 4, yaw: 0.2, w: 60, l: 0.16, y0: -0.5, y1: 1.2, kind: 'fence' });
    const W = new Walker({ physics: ph });
    W.place(0, 0, 0, 0);
    // fence-local z (its own across axis): must stay on the near side, 0.08 + 0.28 off its middle
    let worst = -9;
    for (let i = 0; i < 40; i++) { W.update(0.1, { mx: 0, mz: 1, run: true }, 0); worst = Math.max(worst, W.pos.x * Math.sin(0.2) + (W.pos.z - 4) * Math.cos(0.2)); }
    check('walker at run speed on 10 fps frames stops at a thin fence', worst < -0.3, `across=${worst.toFixed(3)} at ${W.pos.x.toFixed(2)},${W.pos.z.toFixed(2)}`);
    // ...and slides along it when walking at it on a slant
    W.place(0, 0, 3, 0);
    for (let i = 0; i < 60; i++) W.update(1 / 60, { mx: 0.6, mz: 0.8, run: false }, 0);
    check('walker slides along a wall instead of sticking', W.pos.x < -0.4 || W.pos.x > 0.4, `x=${W.pos.x.toFixed(2)} z=${W.pos.z.toFixed(2)}`);
  }
  // a corner: no jitter, he settles into it and stays out of both walls
  {
    const ph = mk();
    // (camera looking down +z: stick right is world -x)
    ph.addBox({ x: -2, z: 0, w: 0.3, l: 6 });
    ph.addBox({ x: 0, z: 2, w: 6, l: 0.3 });
    const W = new Walker({ physics: ph });
    W.place(0, 0, 0, 0);
    let jit = 0, last = null;
    for (let i = 0; i < 120; i++) {
      W.update(1 / 60, { mx: 0.7, mz: 0.7, run: true }, 0);
      if (i > 90) { if (last) jit = Math.max(jit, Math.hypot(W.pos.x - last.x, W.pos.z - last.z)); last = W.pos.clone(); }
    }
    check('walker wedged in a corner sits still (no jitter)', jit < 0.002 && W.pos.x > -2 + 0.15 + 0.27 && W.pos.z < 2 - 0.15 - 0.27, `jitter=${jit.toFixed(4)} pos=${W.pos.x.toFixed(3)},${W.pos.z.toFixed(3)}`);
  }
  // Bessie flat out at a thin wall, even on long steps, stops on the near side; the front tyre doesn't poke through
  {
    for (const dt of [1 / 120, 1 / 30]) {
      const ph = mk();
      ph.addBox({ x: 0, z: 12, w: 10, l: 0.12, y0: -1, y1: 3, kind: 'fence' });
      const r = run(ph, () => C({ throttle: 1 }), { T: 3, dt, setup: (b) => b.vel.set(0, 0, 14) });
      const nose = r.b.pos.z + 0.46 + 0.28;
      check(`bike at 14 m/s can't tunnel a 12 cm wall (step ${Math.round(1 / dt)} Hz)`, r.b.pos.z < 12 && nose < 12.0 + 0.02, `z=${r.b.pos.z.toFixed(2)} nose=${nose.toFixed(2)} crash=${ev(r, 'crash').length}`);
    }
  }
  // a door added at runtime blocks; swinging it open (updateBox) and taking it away (removeBox) let him through
  {
    const ph = mk();
    ph.addBox({ x: -1.5, z: 3, w: 2, l: 0.3 });
    ph.addBox({ x: 1.5, z: 3, w: 2, l: 0.3 });
    const door = ph.addBox({ x: 0, z: 3, w: 1, l: 0.08, kind: 'door' });
    const W = new Walker({ physics: ph });
    W.place(0, 0, 0, 0);
    for (let i = 0; i < 90; i++) W.update(1 / 60, { mx: 0, mz: 1 }, 0);
    const shut = W.pos.z;
    // swing it open on its hinge at x = -0.5
    ph.updateBox(door, { x: -0.5 + Math.sin(Math.PI / 2) * 0.0, z: 3 + 0.5, yaw: Math.PI / 2 });
    for (let i = 0; i < 120; i++) W.update(1 / 60, { mx: 0, mz: 1 }, 0);
    const open = W.pos.z;
    W.place(0, 0, 0, 0);
    ph.updateBox(door, { x: 0, z: 3, yaw: 0 });
    for (let i = 0; i < 90; i++) W.update(1 / 60, { mx: 0, mz: 1 }, 0);
    const shutAgain = W.pos.z;
    ph.removeBox(door);
    for (let i = 0; i < 120; i++) W.update(1 / 60, { mx: 0, mz: 1 }, 0);
    check('runtime door: shut blocks, updateBox opens, removeBox clears', shut < 3 && open > 3.5 && shutAgain < 3 && W.pos.z > 3.5, `shut=${shut.toFixed(2)} open=${open.toFixed(2)} again=${shutAgain.toFixed(2)} removed=${W.pos.z.toFixed(2)}`);
  }
}
// --- 15. on foot: the push sets the pace (a phone thumb half way out walks briskly, all the way
// out jogs), sprinting is properly fast, and indoors he keeps to a walk
{
  const pace = (c, T = 3, phys = null) => {
    const W = new Walker({ physics: flat });
    W.place(0, 0, 0, 0);
    W.phys = phys;
    for (let i = 0; i < T * 60; i++) W.update(1 / 60, c, 0);
    return W;
  };
  const half = pace({ mx: 0, mz: 0.55 }), full = pace({ mx: 0, mz: 1 }), gentle = pace({ mx: 0, mz: 0.25 });
  check('on foot: a half push walks briskly, all the way out jogs, a gentle push ambles', half.speed > 3.2 && half.speed < 3.6 && full.speed > 4.8 && full.speed < 5.2 && gentle.speed < 2 && gentle.speed > 1, `gentle=${gentle.speed.toFixed(2)} half=${half.speed.toFixed(2)} full=${full.speed.toFixed(2)}`);
  const spr = pace({ mx: 0.4, mz: 0.6, run: true }), sprT = pace({ mx: 0, mz: 1, run: true }, 0.7);
  check('on foot: sprinting runs flat out (~8 m/s) and gets there quickly', spr.speed > 7.8 && spr.sprinting && sprT.speed > 7.5, `sprint=${spr.speed.toFixed(2)} after 0.7 s=${sprT.speed.toFixed(2)}`);
  const inside = pace({ mx: 0, mz: 1, run: true }, 3, flat);
  check("on foot: indoors he doesn't charge about", inside.speed <= 5.01 && pace({ mx: 0, mz: 1 }, 3, flat).speed <= 3.41, `sprint indoors=${inside.speed.toFixed(2)}`);
}
const fails = results.filter((r) => !r.ok);
console.log(`\n${results.length - fails.length}/${results.length} passed`);
process.exit(fails.length ? 1 : 0);
