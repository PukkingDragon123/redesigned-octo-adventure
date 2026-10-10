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
const INDEX = Object.fromEntries(STEPS.map((s, i) => [s.id, i]));

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

// ---------------------------------------------------------------- the strip
const CSS = `
.dp-strip { position: absolute; left: calc(var(--u) * 3 + var(--safe-l, 0px)); top: calc(var(--u) * 45 + var(--safe-t, 0px));
  display: flex; flex-direction: column; gap: calc(var(--u) * 1); padding: calc(var(--u) * 3) calc(var(--u) * 4); pointer-events: none;
  transition: opacity 0.3s steps(3); }
.dp-strip.off { opacity: 0; }
.dp-icons { display: flex; gap: calc(var(--u) * 2); align-items: center; }
.dp-icons img { width: calc(var(--u) * 16); height: calc(var(--u) * 16); image-rendering: pixelated; opacity: 0.32; position: relative; }
.dp-icons img.done { opacity: 0.55; filter: grayscale(0.6); }
.dp-icons img.next { opacity: 0.6; }
.dp-icons img.now { opacity: 1; animation: dp-bob 0.9s steps(2) infinite; }
.dp-icons i { width: calc(var(--u) * 2); height: calc(var(--u) * 1); background: currentColor; opacity: 0.35; }
@keyframes dp-bob { 0% { top: 0; } 50% { top: calc(var(--u) * -1); } }
.dp-txt { white-space: nowrap; color: var(--k-gold, #f0c860); }
#hud.fast .dp-txt { display: none; }
.dp-strip.flash .dp-txt { animation: dp-flash 0.6s steps(2) 3; }
@keyframes dp-flash { 50% { color: #fff8e0; } }
`;

export class DayPlan {
  constructor(game) {
    this.g = game;
    this.step = null;
    this.el = null;
  }
  build() {
    const ui = this.g.ui;
    if (this.el || !ui?.hud) return;
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    const el = document.createElement('div');
    el.className = 'dp-strip k-plate k-dark off';
    const icons = document.createElement('div');
    icons.className = 'dp-icons';
    this.imgs = STEPS.map((s, i) => {
      if (i) icons.appendChild(document.createElement('i'));
      const im = document.createElement('img');
      im.src = s.icon();
      im.alt = s.id;
      icons.appendChild(im);
      return im;
    });
    const txt = document.createElement('div');
    txt.className = 'dp-txt';
    el.append(icons, txt);
    ui.hud.appendChild(el);
    this.el = el;
    this.txt = txt;
  }
  // per frame while riding: the step, the strip, and (first day) Hank's word on it
  update() {
    const g = this.g;
    if (!this.el) this.build();
    if (!this.el) return;
    // the contest's cocoa round (and Nana's cabin) have their own objective lines
    const busy = !!g.contest?.objective?.() || !g.state?.flags?.bike;
    this.el.classList.toggle('off', busy);
    if (busy) return;
    const s = planStep(g);
    this.cur = s;
    const key = `${s.id}|${s.text}`;
    if (key === this.key) return;
    const changed = this.step !== s.id;
    this.key = key;
    this.step = s.id;
    const at = INDEX[s.id];
    this.imgs.forEach((im, i) => { im.className = i < at ? 'done' : i === at ? 'now' : i === at + 1 ? 'next' : ''; });
    this.txt.textContent = s.text;
    if (changed) {
      this.el.classList.remove('flash');
      void this.el.offsetWidth;
      this.el.classList.add('flash');
      this.guide(s);
    }
  }
  guide(s) {
    const g = this.g, f = g.state.flags;
    const seen = (f.guide ||= {});
    if (g.state.day > 1 || seen[s.id] || !GUIDE[s.id] || s.free) return;
    seen[s.id] = true;
    g.ui.pop(GUIDE[s.id], { expr: s.id === 'paid' ? 'sparkle' : 'happy', ms: 4200 });
  }
}
