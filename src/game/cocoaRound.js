// The cocoa round's rules and save state, with no DOM or three.js (tools/crowdtest.mjs
// checks them). The first time Hank rides into the pumpkin carving contest everyone
// freezes and stares; Hank hands out cups from the carrier Nana sent along, and each
// one who takes a cup thaws. Once the eight contest regulars have a cup, Gus invites him
// to carve (contest.js runs the scene side of it).
//
// Flags (state.flags):
//   village1       the village has met Hank (set when the freeze begins)
//   contestFreeze  the crowd froze at the sight of him: the cocoa round is on
//   cocoaRound     every regular has had a cup: the round is over
//   carveIntro     Gus has invited him to carve (the table at the west end is his)
//   contestScream  (old saves: the screaming first arrival already happened; counts as a
//                  finished round)
// Progress: state.cocoaRound = { given: [brain keys], crowd: townsfolk given a cup }.
export const ROUND_KEYS = ['kids', 'pop', 'marie', 'agnes', 'birdie', 'ingrid', 'doug', 'josee'];
export const NEED = ROUND_KEYS.length;
// who else stays at the contest while the round is on (the host)
export const PINNED = [...ROUND_KEYS, 'gus'];

export class CocoaRound {
  constructor(getState) {
    this.get = typeof getState === 'function' ? getState : () => getState;
  }
  get st() {
    return this.get();
  }
  get flags() {
    const st = this.st;
    return st ? st.flags || (st.flags = {}) : {};
  }
  get rec() {
    const st = this.st;
    if (!st) return { given: [], crowd: 0 };
    const r = st.cocoaRound;
    if (!r || !Array.isArray(r.given)) st.cocoaRound = { given: [], crowd: 0 };
    return st.cocoaRound;
  }
  // saves from before the cocoa round: the old screaming arrival counts as a finished round
  migrate() {
    const f = this.flags;
    if (f.contestScream && !f.cocoaRound) {
      f.contestFreeze = true;
      f.cocoaRound = true;
    }
  }
  // the freeze hasn't happened yet (a new game, or a save from before the contest)
  needsStart() {
    const f = this.flags;
    return !f.contestFreeze && !f.cocoaRound && !f.contestScream;
  }
  isActive() {
    const f = this.flags;
    return !!f.contestFreeze && !f.cocoaRound && !f.contestScream;
  }
  isDone() {
    const f = this.flags;
    return !!f.cocoaRound || !!f.contestScream;
  }
  // the regulars, the host and the crowd are all out at the contest (whatever the hour)
  // until the round is over, so Hank's first ride in always finds it packed
  pinned(key) {
    if (!this.isActive() && !this.needsStart()) return false;
    return key == null || PINNED.includes(key);
  }
  // the crowd freezes: the round begins. already: regulars who know Hank well enough
  // already (an old save) just wave; they count as served
  start(already = []) {
    const f = this.flags;
    f.village1 = true;
    f.contestFreeze = true;
    this.st.cocoaRound = { given: ROUND_KEYS.filter((k) => already.includes(k)), crowd: 0 };
    return this.progress();
  }
  has(key) {
    return this.rec.given.includes(key);
  }
  isKey(key) {
    return ROUND_KEYS.includes(key);
  }
  // a regular takes a cup: { count, need, complete, fresh }
  give(key) {
    if (!this.isActive()) return { ...this.progress(), fresh: false };
    const r = this.rec;
    let fresh = false;
    if (this.isKey(key) && !r.given.includes(key)) {
      r.given.push(key);
      fresh = true;
    }
    return { ...this.progress(), fresh };
  }
  giveCrowd() {
    if (!this.isActive()) return 0;
    return ++this.rec.crowd;
  }
  progress() {
    const count = this.rec.given.filter((k) => ROUND_KEYS.includes(k)).length;
    return { count, need: NEED, complete: count >= NEED };
  }
  // how much of the townsfolk crowd should have thawed by now (0..1)
  thawShare() {
    if (this.isDone()) return 1;
    if (!this.isActive()) return 0;
    const { count } = this.progress();
    return Math.min(1, count / NEED);
  }
  // the round is over (Gus comes over next)
  finish() {
    const f = this.flags;
    f.cocoaRound = true;
    f.contestFreeze = true;
    f.village1 = true;
  }
  // the line on Hank's clipboard
  objective() {
    if (!this.isActive()) return '';
    const { count, need } = this.progress();
    return count >= need ? 'Everyone has cocoa! Here comes Gus...' : `Offer cocoa to the frozen crowd: ${count}/${need}`;
  }
}
