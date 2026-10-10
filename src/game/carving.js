// The pumpkin carving contest entry at Hank's table on the contest's west end (once Gus
// has invited him, once a day). The carving itself happens right there in the street, in
// 3D: src/game/carveStage.js (Gus's request, cutting the lid round the stem and scooping
// out the guts, then carving a real voxel pumpkin against the clock, the candle lit at the
// end while the street goes "ooooh"). This file is the table and the judging: Gus and
// Dr. Ingrid come round, lean in and have their say (src/game/carveScore.js does the
// judging on the best side of the pumpkin seen straight on: eyes, mouth, nose, symmetry,
// how much is cut, style, Gus's request; cut it in half and it caves in), Gus announces
// the ribbon through his megaphone, the street cheers and the ribbon lands in a flurry of
// leaves.
//
// The carving is kept in the save (state.carving: the exact pumpkin as a run-length list
// of the voxels cut away (src/game/carve3d.js encodeCarve), which side faces the street,
// the judges' 32 x 32 mask of that side, the day, the score and ribbon, the ribbons won so
// far) and stands on Hank's table as that very voxel pumpkin, glowing from inside, with
// its prize rosette beside it. (Older saves with only the mask get a pumpkin cut straight
// through from it.)
// Test entry point: ?scene=carve (Story.carve).
import * as THREE from 'three';
import { el, kRibbon } from '../ui/kit.js';
import * as CS from './carveScore.js';
import * as C3 from './carve3d.js';
import * as CM from '../voxel/models/contest.js';
import { meshVox } from '../voxel/mesh.js';
import { voxMesh, sharedVoxelMaterial } from '../render/voxelMaterial.js';
import { CONTEST } from '../world/contest.js';
import { leaves } from '../ui/leaves.js';
import { CarveStage, TIME, REQUESTS } from './carveStage.js';
import '../ui/carving.css';

export { TIME, REQUESTS };
const { RIBBONS } = CS;
const PI = Math.PI;
const hyp = Math.hypot;
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const pickOf = (arr) => arr[Math.floor(Math.random() * arr.length)];

// ---------------------------------------------------------------- Hank's table, the judging
export class Carving {
  constructor(g, contest) {
    this.g = g;
    this.contest = contest;
    this.group = null;
    this.key = null;
    this.busy = false;
  }
  get st() {
    return this.g.state;
  }
  spot() {
    return this.g.world.voxel?.contestHank || null;
  }
  hasCarving() {
    return !!this.st?.carving?.mask;
  }
  doneToday() {
    const c = this.st?.carving;
    return !!c && c.day === this.st.day;
  }

  // the prompt at Hank's table
  action(p, slow) {
    const g = this.g, T = this.spot();
    if (!T || !slow || this.busy || !this.st?.flags?.village1 || g.interior?.active) return null;
    // (not while the contest is frozen at the sight of him: Gus invites him once it thaws)
    if (this.contest.round?.isActive() || this.contest.inviting) return null;
    if (hyp(p.x - T.x, p.z - T.z) > 2.3 || Math.abs(p.y - T.y) > 2.5) return null;
    if (this.doneToday()) return { text: 'Admire my pumpkin', fn: () => this.admire() };
    return { text: 'Carve a pumpkin', fn: () => this.start() };
  }
  admire() {
    const c = this.st.carving;
    const r = RIBBONS[c.ribbon] || RIBBONS.part;
    const won = Object.entries(c.ribbons || {}).filter(([, n]) => n).map(([k, n]) => `${n} x ${RIBBONS[k].name}`).join(', ');
    this.g.ui.pop(c.collapsed
      ? `My pumpkin... is resting. *${r.name}* though! One go a day: back tomorrow. (So far: ${won}.)`
      : `Look at it glow! *${r.name}*, ${c.score} points. One go a day: back tomorrow! (So far: ${won}.)`, { expr: c.collapsed ? 'sheepish' : 'sparkle', ms: 5000 });
  }

  // ------------------------------------------------------------ playing
  async start({ intro = true, invited = false } = {}) {
    const g = this.g;
    if (this.busy) return;
    this.busy = true;
    try {
      if (intro && !this.st.flags.carveIntro) await this.intro();
      g.ui.prompt(null);
      // what Gus would like to see today (the first time, something to impress him with)
      const suggest = invited ? pickOf(['spooky', 'funny', 'cute', 'copy']) : pickOf(['spooky', 'funny', 'cute', 'copy', 'copy', 'free']);
      const stage = (this.current = new CarveStage(g, this, { suggest })); // (tests poke at it)
      let out = null;
      await g.story.scene(async (S) => { out = await stage.run(S); });
      this.current = null;
      if (!out) return;
      // (the judges' view: the best side of it, seen straight on)
      const J = out.judged, res = J.res;
      const st = this.st;
      const c = (st.carving = st.carving || {});
      c.day = st.day;
      c.mask = CS.encodeMask(J.mask);
      c.vox = C3.encodeCarve(out.p);
      c.side = J.side;
      c.score = res.score;
      c.ribbon = res.ribbon;
      c.collapsed = !!res.collapse;
      c.ribbons = c.ribbons || {};
      c.ribbons[res.ribbon] = (c.ribbons[res.ribbon] || 0) + 1;
      c.best = Math.max(c.best || 0, res.score);
      c.entries = (c.entries || 0) + 1;
      c.request = out.request || null;
      this.sync(true);
      g.save();
      await this.judgeScene(res);
      g.save();
    } finally {
      this.busy = false;
    }
  }

  // story scenes take a villager over for a while (back to their day afterwards)
  borrow(S, keys) {
    const out = {};
    for (const k of keys) {
      const a = this.g.villagers?.get(k);
      if (!a) continue;
      a.scripted = true;
      a.path = null;
      a.onArrive = null;
      a.lookAt(null);
      a.brain?.setShown?.(true);
      out[k] = a;
    }
    S.temp.push({ remove: () => { for (const a of Object.values(out)) { a.scripted = false; a.path = null; a.lookAt(null); a.play('idle', 'neutral'); } } });
    return out;
  }
  place(a, x, z, yaw) {
    const y = this.g.physics.groundAt(x, z, (this.spot()?.y ?? 0) + 1).h;
    a.pos.set(x, y, z);
    a.yaw = a.targetYaw = yaw;
  }
  // Hank stands behind his table for these scenes (the rider is hidden meanwhile)
  hankAt(S) {
    const g = this.g, T = CONTEST.hank.stand;
    g.rider.visible = false;
    S.temp.push({ remove: () => { g.rider.visible = true; } });
    const H = S.actor('hank', T.x, T.z, T.yaw, 'idle');
    return H;
  }

  // the first time: Gus's verdict on a skeleton entering a carving contest
  async intro() {
    const g = this.g;
    this.st.flags.carveIntro = true;
    await g.story.scene(async (S) => {
      const T = CONTEST.hank, y = (this.spot()?.y ?? 0.8) - 0.8;
      const H = this.hankAt(S);
      const { gus } = this.borrow(S, ['gus']);
      if (gus) { this.place(gus, T.x + 0.5, T.z - 1.35, 0.15); gus.play('hostWalk', 'neutral'); }
      await S.cam(V(T.x - 2.8, y + 1.7, T.z - 4.2), V(T.x, y + 0.9, T.z - 0.4), 0, 46);
      H.play('wave', 'happy');
      await S.say('hank', 'Mind if I have a go? I used to whittle. Mostly canoe paddles.', { actor: H, expr: 'happy' });
      H.play('idle', 'happy');
      if (gus) {
        gus.play('inspect', 'neutral');
        gus.showEmote('question', 2);
        await S.say('gus', 'A skeleton... carving a face?', { actor: gus, expr: 'surprised' });
        gus.react('shake');
        await S.say('gus', 'Well, it IS a fair contest.', { actor: gus, expr: 'smug' });
        gus.faceTowards(CONTEST.x, CONTEST.z);
        gus.play('announce', 'laugh');
        S.sfx('megaphone', { volume: 0.6 });
        await S.cam(V(gus.pos.x + 2.6, y + 1.65, gus.pos.z - 0.6), V(gus.pos.x, y + 1.45, gus.pos.z + 0.15), 0.6, 44);
        await S.say('gus', 'FOLKS! WE GOT A LATE ENTRY!', { actor: gus, expr: 'laugh' });
        this.contest.cheer(1, { force: true });
        await S.wait(1.2);
        gus.face(0.15);
        gus.play('hostWalk', 'neutral');
        await S.cam(V(T.x - 2.8, y + 1.7, T.z - 4.2), V(T.x, y + 0.9, T.z - 0.4), 0.6, 46);
        await S.say('gus', `One pumpkin a day, ${TIME} seconds on the clock. Go on, bones. Impress me.`, { actor: gus, expr: 'neutral' });
      }
    });
  }

  // what the judges make of it
  verdict(r) {
    if (r.empty) return { gus: 'Did you... start?', ingrid: 'A pristine, untouched specimen. Very... minimalist.', hank: "It's called *Pumpkin*. It's about restraint." };
    if (r.collapse) return { gus: "...And it's soup.", ingrid: 'Time of death: just now.', hank: "It's a *modern* piece. It's about... gravity." };
    const gus = !r.eyes ? "It can't see, son. The poor thing can't SEE."
      : r.wink ? 'A wink! Cheeky. I like it.'
      : r.eyes === 1 ? "One eye. A pirate pumpkin! Birdie'll love it."
      : !r.mouth ? "No mouth? How's it gonna eat its candy?"
      : r.teeth ? 'Look at them CHOPPERS! Ha!'
      : r.area > 0.32 ? "More hole than pumpkin. But it holds. Barely."
      : r.area < 0.06 ? "Delicate. Real... delicate. You gotta squint."
      : r.sym < 0.4 ? 'Lopsided. Like my barn. I like my barn.'
      : r.ribbon === 'first' ? "Now THAT there is a real jack-o'-lantern."
      : 'Hmph. Good clean cuts.';
    const ingrid = r.sym >= 0.8 ? 'Bilateral symmetry! Like a healthy ribcage.'
      : r.nose ? 'And a nose! Anatomically ambitious.'
      : r.sym < 0.4 ? 'Asymmetrical. Expressive. Possibly a medical condition.'
      : 'Steady hands, for someone with no tendons.';
    const hank = { first: "FIRST PRIZE?! Nana's putting this on the fridge!", second: 'Second prize! The silver medal of squash!', third: 'Third! A *bronze* bone! I\'ll take it!', part: "Honourable mention! Honour! For me!" }[r.ribbon];
    return { gus, ingrid, hank, request: this.requestLine(r) };
  }
  // and what Gus makes of it, against what he asked for
  requestLine(r) {
    const q = r.request;
    if (!q || r.empty || r.collapse) return null;
    if (q.kind === 'copy') {
      return q.sim >= 0.75 ? "Line for line! Ya copied it better than I drew it." : q.sim >= 0.45 ? 'Close enough to my design. Close enough.' : "...That's not my design. That's not ANYBODY's design.";
    }
    const L = {
      spooky: ["I asked for spooky... and now I'm sleepin' with the lights on.", 'Spooky-ish. I\'ll allow it.', "That's not spooky. That's a pumpkin with a head cold."],
      funny: ['HA! HAHA! ...Ahem. I did not laugh. Write that down.', 'Heh. Mildly amusing.', "Funny? I've seen funnier tax forms."],
      cute: ["Aww. Look at its little face. ...Don't tell anybody I said 'aww'.", 'Cute enough. For a pumpkin.', "Cute? It looks like it owes me money."],
    }[q.theme];
    return L ? L[q.pts >= 7 ? 0 : q.pts >= 3 ? 1 : 2] : null;
  }

  async judgeScene(r) {
    const g = this.g;
    const T = CONTEST.hank;
    const P = this.spot();
    if (!P) return;
    const y = P.y - 0.8;
    const say = this.verdict(r);
    const R = RIBBONS[r.ribbon] || RIBBONS.part;
    await g.story.scene(async (S) => {
      const H = this.hankAt(S);
      const { gus, ingrid } = this.borrow(S, ['gus', 'ingrid']);
      if (gus) { this.place(gus, T.x + 3.8, T.z - 2.4, -PI / 2); gus.play('hostWalk', 'neutral'); }
      if (ingrid) { this.place(ingrid, T.x - 3.2, T.z - 2.2, PI / 2); ingrid.play('clipboard', 'neutral'); }
      const pumpkin = this.pumpkin;
      if (this.rosette) this.rosette.visible = false; // (pinned on when Gus announces it)
      S.temp.push({ remove: () => { if (this.rosette) this.rosette.visible = true; } });
      if (r.collapse && pumpkin) pumpkin.scale.set(1, 1, 1);
      // Hank presents his work
      await S.cam(V(T.x - 3.4, y + 2.0, T.z - 4.4), V(T.x, y + 0.95, T.z - 0.3), 0, 46);
      H.play('present', 'proud');
      await S.say('hank', r.collapse ? 'Ta-daaa! Behold my...' : 'Ta-daaa! Behold!', { actor: H, expr: 'proud' });
      if (r.collapse && pumpkin) {
        // ...it caves in
        S.sfx('tree_creak', { volume: 0.5, pitch: 1.5 });
        await S.wait(0.5);
        S.sfx('pumpkin_smash', { volume: 0.7 });
        g.effects.poof?.(P.x, P.y + 0.2, P.z, { scale: 0.6, count: 6, color: [1, 0.6, 0.25] });
        await S.anim(0.35, (k) => pumpkin.scale.set(1 + k * 0.18, 1 - k * 0.5, 1 + k * 0.18));
        H.play('idle', 'shock');
        H.showEmote('sweat', 2);
        await S.wait(0.6);
      }
      // the judges come round for a close look
      const GJ = [T.x + 0.45, T.z - 1.2], IJ = [T.x - 0.55, T.z - 1.25];
      if (gus) gus.walkTo([GJ], 1.6, 'hostWalk');
      if (ingrid) ingrid.walkTo([IJ], 1.5, 'walk');
      await S.wait(2.6);
      if (gus) { gus.path = null; this.place(gus, GJ[0], GJ[1], 0); gus.play('inspect', 'neutral'); gus.showEmote('note', 1.6); S.sfx('hum_hmm', { volume: 0.5 }); }
      if (ingrid) { ingrid.path = null; this.place(ingrid, IJ[0], IJ[1], 0); ingrid.play('judge', 'neutral'); S.sfx('pencil_scribble', { volume: 0.5 }); }
      H.play('idle', r.collapse ? 'sheepish' : 'worried');
      // from behind Hank, the judges leaning in over the pumpkin
      await S.cam(V(T.x + 1.0, y + 1.75, T.z + 1.7), V(T.x - 0.1, y + 1.15, T.z - 1.0), 0.8, 44);
      await S.wait(1.4);
      if (gus) {
        await S.faceShot(gus, { dist: 2.2, side: 0.9, dur: 0.5 });
        if (!r.collapse && !r.empty) gus.play('hostPoint', 'happy');
        await S.say('gus', say.gus, { actor: gus, expr: r.collapse || r.empty ? 'sheepish' : 'smug' });
        if (say.request) {
          gus.play('inspect', 'neutral');
          await S.say('gus', say.request, { actor: gus, expr: (r.request?.pts || 0) >= 7 ? 'laugh' : (r.request?.pts || 0) >= 3 ? 'smug' : 'grumpy' });
        }
      }
      if (ingrid) {
        await S.faceShot(ingrid, { dist: 2.2, side: -0.8, dur: 0.5 });
        await S.say('ingrid', say.ingrid, { actor: ingrid, expr: r.collapse ? 'sad' : 'surprised' });
      }
      // Gus turns to the street, megaphone up (his face, from the street side)
      if (gus) {
        gus.faceTowards(CONTEST.x, CONTEST.z);
        gus.play('announce', 'happy');
        await S.cam(V(gus.pos.x + 2.6, y + 1.65, gus.pos.z - 0.6), V(gus.pos.x, y + 1.45, gus.pos.z + 0.15), 0.6, 42);
        S.sfx('megaphone', { volume: 0.7 });
        await S.say('gus', `FOLKS! The skeleton's pumpkin takes...`, { actor: gus, expr: 'happy' });
        await S.wait(0.4);
        await S.say('gus', r.ribbon === 'part' ? (r.collapse ? 'HONOURABLE MENTION! For... ambition!' : 'HONOURABLE MENTION!') : `${R.name.toUpperCase()}!`, { actor: gus, expr: 'laugh' });
      }
      // the street goes wild (looking down the street from behind Hank's table)
      await S.cam(V(T.x - 3.6, y + 2.4, T.z - 1.6), V(T.x + 9, y + 1.0, T.z - 3.6), 0, 52);
      const cheered = this.contest.cheer(r.ribbon === 'first' || r.ribbon === 'second' ? 2 : 1, { force: true });
      if (!cheered) S.sfx('applause', { volume: 0.6 });
      if (ingrid) ingrid.react('clap');
      S.sfx(r.ribbon === 'part' ? 'quest_done' : 'upgrade', { volume: 0.7 });
      this.award(r);
      if (this.rosette) this.rosette.visible = true;
      if (r.ribbon !== 'part') g.effects.confetti(P.x, P.y + 1.2, P.z - 0.4, r.ribbon === 'first' ? 60 : 36);
      H.play(r.ribbon === 'part' ? 'shrug' : 'cheer', r.ribbon === 'part' ? 'sheepish' : 'laugh');
      if (r.ribbon !== 'part') H.react('yay');
      await S.wait(1.6);
      // Hank, over the judges' heads
      await S.cam(V(T.x - 0.3, y + 2.5, T.z - 2.7), V(T.x, y + 1.3, T.z + 1.1), 0.6, 44);
      await S.wait(0.4);
      await S.say('hank', say.hank, { actor: H, expr: r.ribbon === 'part' ? 'sheepish' : 'sparkle' });
      await S.wait(0.6);
    });
  }
  // the ribbon, pinned on the screen for a moment
  award(r) {
    const g = this.g;
    const R = RIBBONS[r.ribbon] || RIBBONS.part;
    const box = el('div', 'carve-award');
    const rib = kRibbon(R.name, R.kit);
    box.appendChild(rib);
    box.appendChild(el('div', 'k-plate k-parchment carve-score', `${r.score} points`));
    const q = r.request;
    if (q?.pts) box.appendChild(el('div', 'k-plate k-dark carve-bonus', q.kind === 'copy' ? `+${q.pts} likeness to Gus's design` : `+${q.pts} for ${CS.THEMES[q.theme]?.name || q.theme}`));
    g.ui.root.appendChild(box);
    // the ribbon lands in a flurry of leaves
    requestAnimationFrame(() => leaves.burstFrom(rib, r.ribbon === 'part' ? 6 : 14));
    g.wait(4.2).then(() => box.remove());
  }

  // ------------------------------------------------------------ the pumpkin on the table
  // (re)build when the saved carving changes; shown only when the contest is in view
  keyOf(c) {
    return c?.mask || c?.vox ? `${c.vox || ''}|${c.mask}|${c.side || 0}|${c.ribbon}|${c.collapsed ? 1 : 0}` : 'plain';
  }
  sync(force = false) {
    const T = this.spot();
    if (!T) return;
    const c = this.st?.carving;
    const key = this.keyOf(c);
    if (key === this.key && !force) return;
    this.key = key;
    if (this.group) {
      this.g.scene.remove(this.group);
      this.group.traverse((o) => o.geometry?.dispose());
    }
    const mask = c?.mask ? CS.decodeMask(c.mask) : null;
    const grp = (this.group = new THREE.Group());
    grp.position.set(T.x, T.y, T.z);
    grp.rotation.y = T.yaw;
    // the very pumpkin Hank carved, its best side to the street (an old save: cut from the
    // mask; none yet: a fresh one waiting, just as the carving starts with)
    const p = c?.vox ? C3.decodeCarve(c.vox) : null;
    const res = p ? C3.displayVox(p) : mask ? CM.carvedPumpkin({ mask }) : C3.displayVox(C3.freshPumpkin(), { lit: false, candle: false });
    const m = voxMesh(meshVox(res.vox, { size: res.size, origin: res.origin, greedy: true }), sharedVoxelMaterial());
    if (p) m.rotation.y = -((c.side || 0) * PI) / 2;
    if (c?.collapsed) m.scale.set(1.18, 0.5, 1.18);
    grp.add(m);
    this.pumpkin = m;
    this.rosette = null;
    if (mask && c.ribbon) {
      const rr = CM.prizeRosette({ color: (RIBBONS[c.ribbon] || RIBBONS.part).color });
      const rm = (this.rosette = voxMesh(meshVox(rr.vox, { size: rr.size, origin: rr.origin }), sharedVoxelMaterial(), { cast: false }));
      rm.position.set(0.5, 0.005, 0.2);
      rm.rotation.y = 0.4;
      grp.add(rm);
    }
    this.g.scene.add(grp);
    if (T.light) T.light.on = !!mask && !c.collapsed;
  }
  update(dt, near) {
    // (built in idle time, so riding into the contest never hitches)
    if (near && !this.pending) {
      if (this.keyOf(this.st?.carving) !== this.key) {
        this.pending = true;
        const idle = window.requestIdleCallback || ((f) => setTimeout(f, 30));
        idle(() => { this.pending = false; this.sync(); }, { timeout: 1200 });
      }
    }
    // (hidden while the carving stage stands in its place)
    if (this.group) this.group.visible = near && !this.hidden;
  }

  // (test entry point: ?scene=carve) Hank at his table at mid-morning, the crowd friendly
  async debug() {
    const g = this.g, st = this.st, T = CONTEST.hank.stand;
    st.flags.village1 = true;
    st.flags.contestScream = true;
    st.flags.carveIntro = !g.params?.has('intro');
    if (st.carving) st.carving.day = -1;
    g.world.atmosphere.hour = 10.5;
    for (const b of g.villagers.brains) g.villagers.force(b.char, 50, true);
    g.villagers.syncState();
    g.parkBike(T.x - 1.9, T.z + 0.3, -PI / 2);
    g.chase.snap(g.bike);
    await g.wait(0.4);
    if (g.mode === 'cutscene') g.mode = 'ride';
    await this.start();
  }
}

