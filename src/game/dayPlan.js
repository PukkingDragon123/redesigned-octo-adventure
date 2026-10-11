// The day at a glance: Nana's board -> deliver the cups while they're hot -> paid ->
// groceries at Mo's -> home to Nana -> bed. A tiny strip of six pictures under the pocket
// watch, the step Hank is on lit up, and one short line saying what to do next; the
// compass points at it (Game.compassMarkers). On the first day (once per save) Hank says a
// word as each step comes up, and that's all the teaching there is.
import { glyphURL, iconSmallURL } from '../art/icons.js';
import { POI, MO_SPOT } from '../world/layout.js';

export const STEPS = [
  { id: 'board', icon: () => glyphURL('pad') },
  { id: 'deliver', icon: () => glyphURL('cocoa') },
  { id: 'paid', icon: () => glyphURL('coin') },
  { id: 'shop', icon: () => iconSmallURL('basket') },
  { id: 'home', icon: () => glyphURL('home') },
  { id: 'bed', icon: () => glyphURL('moon') },
];

// Hank's word on the first day, as each step comes up
const GUIDE = {
  deliver: 'Cups cool as I ride! Slow down near a customer: they come to me.',
  paid: 'Paid! Hotter cups, bigger tips.',
  shop: "Nana's pantry is low. Mo's shop has ingredients.",
  home: "Evening already! Back to Nana's.",
  bed: 'Talk to Nana to call it a day.',
};

export const HOME_MARK = { x: POI.cabin.x + 8, z: POI.cabin.z };
const BASICS = ['milk_bottle', 'cocoa_powder'];

// is Nana's pantry running low (worth a trip to Mo's)?
export function pantryLow(st) {
  const P = st.pantry;
  if (!P) return false;
  if (BASICS.some((k) => (P[k] || 0) < 3)) return true;
  return Object.values(P).filter((n) => n < 1).length >= 5;
}

// where the day is at: { id, text, target: {x, z, icon} | null }
export function planStep(g) {
  const st = g.state, O = g.orders, hr = g.world.atmosphere.hour;
  const carried = O.carried().length, board = O.board().length;
  const s = st.stats;
  const bag = Object.keys(st.bag || {}).length > 0;
  if (bag) s.dayShop = true;
  if (carried) {
    const n = carried;
    return { id: 'deliver', text: n > 1 ? `Deliver ${n} cups while hot` : 'Deliver the cup while hot', target: null };
  }
  // just paid off the last cup: a moment for the coins
  if (g.time - (g.lastPaidT ?? -99) < 5 && s.dayDeliveries > 0) return { id: 'paid', text: `Paid! $${s.dayEarned || 0} today`, target: null };
  // (an order Nana can't brew, short of an ingredient, waits for a trip to Mo's)
  const open = board ? O.board().filter((o) => !O.missing(o).length).length : 0;
  if (open && hr < 17) return { id: 'board', text: "More orders at Nana's", target: { ...HOME_MARK, icon: 'home' } };
  if (bag) return { id: 'shop', text: 'Bring groceries home', target: { ...HOME_MARK, icon: 'home' } };
  if (!s.dayShop && hr < 19.5 && st.money >= 6 && (pantryLow(st) || board > open)) return { id: 'shop', text: "Buy ingredients at Mo's", target: { x: MO_SPOT.x, z: MO_SPOT.z, icon: 'basket' } };
  const p = g.playerPos;
  const nearHome = Math.hypot(p.x - HOME_MARK.x, p.z - HOME_MARK.z) < 16 || g.interior?.active;
  if (hr >= 17 && nearHome) return { id: 'bed', text: 'Talk to Nana: bedtime', target: { ...HOME_MARK, icon: 'home' } };
  if (hr >= 17) return { id: 'home', text: "Evening: home to Nana's", target: { ...HOME_MARK, icon: 'home' } };
  return { id: 'home', text: 'Free time! Home by dusk', target: null, free: true };
}

export class DayPlan {
  constructor(game) {
    this.g = game;
    this.step = null;
    this.el = null;
  }
  build() {}
  // per frame while riding: track the step (the compass reads it) and Hank's word on it
  update() {
    const g = this.g;
    const busy = !!g.contest?.objective?.() || !g.state?.flags?.bike;
    if (busy) return;
    const s = planStep(g);
    this.cur = s;
    if (this.step === s.id) return;
    this.step = s.id;
    this.guide(s);
  }
  guide(s) {
    const g = this.g, f = g.state.flags;
    const seen = (f.guide ||= {});
    if (g.state.day > 1 || seen[s.id] || !GUIDE[s.id] || s.free) return;
    seen[s.id] = true;
    g.ui.pop(GUIDE[s.id], { expr: s.id === 'paid' ? 'sparkle' : 'happy', ms: 4200 });
  }
}
