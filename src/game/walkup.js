// Deliveries come to Hank. Ride (or walk) up near a customer with their order and slow
// down, and they notice, wave, come over (out of the house if they're in), take the cup
// themselves (out of Bessie's crate, or from Hank's hand when he's on foot), say thanks in
// a little bubble, pay, and stroll back to whatever they were doing. No button, no talk
// box. If they can't get to him (a wall, a fence, a river), they wait where they are,
// facing him: riding or walking right up to them hands it over, and the old prompt is
// there as well. The frightened snatch it and run; the terrified indoors still want it
// left on the step (a prompt).
//
// This is the deciding half, with no three.js (tools/crowdtest.mjs runs it against a
// pretend street): WalkUps.update(dt, ctx) looks at Hank and the customers and returns
// events for npcs.js to act out:
//   start    the customer noticed: turn, wave (come out of the door)
//   target   walk to job.target (the spot beside the crate, or a step from Hank)
//   arrived  there: stop and face Hank
//   hand     the hand-over begins (reach out; the cup leaves the crate / Hank's hand)
//   pay      the cup changes hands: deliver the order (once, ever, per job)
//   done     thanks said: back to their day
//   cancel   Hank went off: back to their day (a short cooldown before they try again)
//   fallback can't reach him: stand and wait, facing him (prompt allowed)
//   snatch   a frightened one, in hiding, edges in for it (npcBrain.snatch does the rest)
export const WU = {
  NOTICE: 13, // Hank within this of them (or of their door)...
  SLOW: 2.6, // ...and slower than this (m/s): they notice
  STILL: 0.8, // "stopped", for the shy ones
  KEEP: 18, // further than this: they give up
  FAST: 5.2, // riding off faster than this: they give up
  REACH_FOOT: 0.95, // where they stand: a step in front of Hank on foot,
  CRATE_BACK: 0.45, // beside Bessie's crate when he's riding (the crate is behind the saddle)
  CRATE_SIDE: 0.85,
  ARRIVE: 0.45, // close enough to the spot
  NEAR: 2.3, // waiting where they are: Hank this close hands it over
  HAND_SPEED: 1.2, // Hank about stopped
  NOTICE_T: 0.65, // the wave before they set off
  HAND_T: 1.3, // reaching, taking...
  PAY_AT: 0.85, // ...the moment it changes hands
  THANKS_T: 1.5, // a sip and a thank-you before they head back
  STUCK_T: 2.4, // no closer for this long: they can't get there
  COOL: 6, // after giving up, before trying again
  WAIT_T: 25, // waiting where they are, at most
  SNATCH_R: 7.5, // the frightened: Hank stopped this close for SNATCH_T
  SNATCH_T: 1.2,
  DOOR: 10, // indoors: Hank stopped this close to the door
};

const hyp = Math.hypot;

// where the customer stands to take the cup
export function standPoint(h, c) {
  if (h.onFoot) {
    const dx = c.x - h.x, dz = c.z - h.z, d = hyp(dx, dz) || 1;
    return { x: h.x + (dx / d) * WU.REACH_FOOT, z: h.z + (dz / d) * WU.REACH_FOOT, face: { x: h.x, z: h.z } };
  }
  // beside the crate, on whichever side of Bessie they're coming from
  const fx = h.fx ?? 0, fz = h.fz ?? 1;
  // (h.crate: where the crate really is, when the caller knows)
  const bx = h.crate ? h.crate.x : h.x - fx * WU.CRATE_BACK, bz = h.crate ? h.crate.z : h.z - fz * WU.CRATE_BACK;
  const s = (c.x - h.x) * fz - (c.z - h.z) * fx >= 0 ? 1 : -1; // + = on her right
  return { x: bx + fz * WU.CRATE_SIDE * s, z: bz - fx * WU.CRATE_SIDE * s, face: { x: bx, z: bz } };
}

export class WalkUps {
  constructor() {
    this.job = null;
    this.cool = {}; // spot -> seconds before they'll try again
    this.still = {}; // spot -> how long Hank has stood still near a frightened one
    this.paid = new Set(); // order ids paid through here (never twice)
  }
  // is this order being handed over right now?
  busyWith(o) {
    return !!this.job && this.job.o === o;
  }
  // can this order still be handed over by the prompt (nothing under way for it)?
  waiting(o) {
    return !this.job || this.job.o !== o || this.job.phase === 'fallback';
  }
  // the prompt was pressed: straight to the hand-over, where they stand. Returns the job
  // and whether it is a new one (the caller acts out 'start' for a new one, then 'hand')
  force(o, c, h, kind = 'walk') {
    if (this.paid.has(o.id) || o.state !== 'carried') return null;
    if (this.job && this.job.o !== o) return null;
    if (this.job && ['hand', 'thanks'].includes(this.job.phase)) return null;
    const fresh = !this.job;
    const j = this.job || this.newJob(o, c, kind);
    this.job = j;
    j.phase = 'hand';
    j.t = 0;
    j.target = standPoint(h, c);
    return { job: j, fresh };
  }
  newJob(o, c, kind) {
    return { o, spot: o.spot, kind, phase: 'notice', t: 0, total: 0, target: null, sent: null, best: Infinity, stuckT: 0, paidOut: false, from: { x: c.x, z: c.z } };
  }

  // ctx.hank: { x, z, y, speed, onFoot, fx, fz, free, scene, crashed }
  // ctx.cands: [{ o, spot, x, z, y, avail, door? }] for every carried order whose customer
  //   is about. avail: 'walk' | 'nervous' (wary) | 'inside' (indoors, will come out) |
  //   'hiding' (frightened, in cover) | 'stand' (can't walk: waits for Hank) | 'no'
  //   (busy: frozen, scripted, running...). The job's own customer is reported even while
  //   busy with it (avail 'job').
  update(dt, ctx) {
    const ev = [];
    const H = ctx.hank;
    for (const k of Object.keys(this.cool)) if ((this.cool[k] -= dt) <= 0) delete this.cool[k];
    const j = this.job;
    if (j) {
      const c = ctx.cands.find((q) => q.o === j.o);
      // a cutscene took over, or the customer is gone (or the order went some other way):
      // drop it (once paid, that's just the end of the thank-you)
      if (H.scene || !c || (!j.paidOut && j.o.state !== 'carried')) {
        ev.push({ type: j.paidOut ? 'done' : 'cancel', job: j });
        this.job = null;
        if (!j.paidOut) this.cool[j.spot] = WU.COOL;
        return ev;
      }
      // (a menu or a chat: hold everything where it is)
      if (!H.free) return ev;
      this.step(dt, j, c, H, ev);
      return ev;
    }
    if (!H.free || H.crashed) return ev;
    // who notices Hank first: the nearest
    let best = null, bd = Infinity;
    for (const c of ctx.cands) {
      if (this.cool[c.spot] || this.paid.has(c.o.id)) continue;
      const d = hyp(c.x - H.x, c.z - H.z);
      if (Math.abs((c.y ?? H.y) - H.y) > 3) continue;
      let kind = null;
      if ((c.avail === 'walk' || c.avail === 'nervous' || c.avail === 'stand') && d < WU.NOTICE && H.speed < WU.SLOW) kind = c.avail;
      else if (c.avail === 'inside' && c.door && hyp(c.door.x - H.x, c.door.z - H.z) < WU.DOOR && H.speed < WU.STILL) kind = 'door';
      else if (c.avail === 'hiding') {
        const st = d < WU.SNATCH_R && H.speed < WU.STILL ? (this.still[c.spot] || 0) + dt : 0;
        this.still[c.spot] = st;
        if (st >= WU.SNATCH_T) kind = 'snatch';
      }
      if (kind && d < bd) { bd = d; best = { c, kind }; }
    }
    if (!best) return ev;
    const { c, kind } = best;
    if (kind === 'snatch') {
      this.still[c.spot] = 0;
      this.paid.add(c.o.id);
      ev.push({ type: 'snatch', job: { o: c.o, spot: c.spot, kind } });
      return ev;
    }
    const nj = this.newJob(c.o, c, kind);
    this.job = nj;
    ev.push({ type: 'start', job: nj });
    if (kind === 'stand') { nj.phase = 'fallback'; ev.push({ type: 'fallback', job: nj }); }
    return ev;
  }

  step(dt, j, c, H, ev) {
    j.t += dt;
    j.total += dt;
    const dH = hyp(c.x - H.x, c.z - H.z);
    const early = j.phase === 'notice' || j.phase === 'approach' || j.phase === 'wait' || j.phase === 'fallback';
    // Hank went off: never mind
    if (early && (dH > WU.KEEP || (H.speed > WU.FAST && dH > 3) || H.crashed || (j.phase === 'fallback' && j.t > WU.WAIT_T))) {
      ev.push({ type: 'cancel', job: j });
      this.cool[j.spot] = WU.COOL;
      this.job = null;
      return;
    }
    switch (j.phase) {
      case 'notice':
        if (j.t >= WU.NOTICE_T) this.go(j, c, H, ev);
        return;
      case 'approach': {
        const T = standPoint(H, c);
        const moved = hyp(T.x - j.sent.x, T.z - j.sent.z);
        if (moved > 0.6 || (moved > 0.2 && j.t > 0.5)) this.send(j, T, ev);
        const d = hyp(c.x - j.target.x, c.z - j.target.z);
        if (d < WU.ARRIVE) { j.phase = 'wait'; j.t = 0; ev.push({ type: 'arrived', job: j }); return; }
        // no closer for a while (or far too long at it): they can't get there
        if (d < j.best - 0.1) { j.best = d; j.stuckT = 0; } else j.stuckT += dt;
        const slow = j.kind === 'nervous' ? 0.8 : 1.4;
        if (j.stuckT > WU.STUCK_T || j.t > 4 + hyp(j.from.x - H.x, j.from.z - H.z) / slow * 1.6) {
          j.phase = 'fallback';
          j.t = 0;
          ev.push({ type: 'fallback', job: j });
        }
        return;
      }
      case 'wait': {
        const T = standPoint(H, c);
        if (hyp(c.x - T.x, c.z - T.z) > 1.2) { j.phase = 'approach'; j.t = 0; j.best = Infinity; j.stuckT = 0; this.send(j, T, ev); return; }
        if (H.speed < WU.HAND_SPEED) this.hand(j, H, c, ev);
        return;
      }
      case 'fallback':
        // waiting where they stand: Hank right there and about stopped hands it over
        if (dH < WU.NEAR && H.speed < WU.HAND_SPEED) this.hand(j, H, c, ev);
        return;
      case 'hand':
        if (!j.paidOut && j.t >= WU.PAY_AT) {
          j.paidOut = true;
          this.paid.add(j.o.id);
          ev.push({ type: 'pay', job: j });
        }
        if (j.t >= WU.HAND_T) { j.phase = 'thanks'; j.t = 0; }
        return;
      case 'thanks':
        if (j.t >= WU.THANKS_T) { ev.push({ type: 'done', job: j }); this.job = null; }
        return;
    }
  }
  go(j, c, H, ev) {
    j.phase = 'approach';
    j.t = 0;
    j.best = Infinity;
    j.stuckT = 0;
    const T = standPoint(H, c);
    // already right beside him: no walk needed
    if (hyp(c.x - T.x, c.z - T.z) < WU.ARRIVE) { j.target = T; j.sent = T; j.phase = 'wait'; ev.push({ type: 'arrived', job: j }); return; }
    this.send(j, T, ev);
  }
  send(j, T, ev) {
    j.target = T;
    j.sent = { x: T.x, z: T.z };
    ev.push({ type: 'target', job: j });
  }
  hand(j, H, c, ev) {
    j.phase = 'hand';
    j.t = 0;
    j.target = standPoint(H, c);
    ev.push({ type: 'hand', job: j });
  }
}

// a short thank-you for the bubble (hot or not)
export const THANKS = {
  gus: { hot: ['Hmph. Hot. ...Thanks, kid.', 'Not bad, bones.'], cold: ['Lukewarm. Hmph.'] },
  marie: { hot: ['Magnifique! Still steaming!', 'Merci, mon squelette!'], cold: ['A little tiède... merci.'] },
  birdie: { hot: ["Hot as a ship's boiler!", 'Fair winds, Hank!'], cold: ['Bit nippy, sailor!'] },
  agnes: { hot: ['Oh, lovely! Thank you, dear.', 'The cats thank you!'], cold: ['Room temperature. Lovely.'] },
  doug: { hot: ['Excellent. Carry on, citizen.', 'Noted in my report.'], cold: ['I could ticket you for this.'] },
  ingrid: { hot: ['Still no pulse. Lovely cocoa.', 'Excellent. Thank you.'], cold: ['Cold. Fascinating.'] },
  pip: { hot: ['SKELETON COCOA!!!', 'BEST. DAY. EVER!'], cold: ["Cold but you're a SKELETON!"] },
  lou: { hot: ['Hank, buddy! Legend!', 'Boys! Cocoa!'], cold: ['Lukewarm! Still drinking it!'] },
  ollie: { hot: ['Warm as a lighthouse lamp.', 'Thank ye, lad.'], cold: ['Cold as the Atlantic, lad.'] },
};
export function thanksLine(customer, quality, rnd = Math.random()) {
  const L = THANKS[customer] || { hot: ['Thank you, Hank!', 'Lovely!'], cold: ['Brr... thanks.'] };
  const pool = quality > 55 ? L.hot : L.cold;
  return pool[Math.floor(rnd * pool.length) % pool.length];
}
