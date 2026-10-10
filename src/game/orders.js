// Cocoa orders: the morning board, carrying (cooling & sloshing), delivery and pay.
import { CUSTOMERS, POI } from '../world/layout.js';
import { RNG } from '../core/noise.js';
import { RECIPES, STARTER_PANTRY } from './quests.js';
import { tempMood, tempFaceURL } from '../art/tempfaces.js';

export const COCOAS = [
  { id: 'classic', label: 'Classic Cocoa', price: 8, color: 0x6a3a1e },
  { id: 'maple', label: 'Maple Marshmallow', price: 10, color: 0x8a5228 },
  { id: 'cinnamon', label: 'Cinnamon Fire', price: 11, color: 0x7a2e18 },
  { id: 'mint', label: 'Peppermint Swirl', price: 10, color: 0x5a3a2a },
  { id: 'pumpkin', label: 'Pumpkin Spice', price: 12, color: 0xb0602a },
  { id: 'mocha', label: 'Lumberjack Mocha', price: 13, color: 0x3a2214 },
];

const NOTES = {
  gus: ['Extra hot. And no talking.', 'Don\'t tell anyone I like the marshmallows.', 'Strong enough to wake the dead. ...Oh.'],
  marie: ['For the café! Our machine is broken... again.', 'A taste of home, s\'il vous plaît!', 'Two pumps of maple, merci!'],
  birdie: ['Warm hands for cold nets.', 'Bring it to the boardwalk, sailor!', 'The fish are biting. So am I.'],
  agnes: ['For my knitting circle (it is just me and the cats).', 'Hot, please. My tea went cold in 1986.', 'With a doily if you have one.'],
  doug: ['For the station. Strictly official business.', 'Patrol fuel. Thank you, citizen.', 'Is it legal to be this delicious?'],
  ingrid: ['Prescription: one (1) cocoa.', 'Doctor\'s orders. My own.', 'Still can\'t find your pulse. Bring cocoa anyway.'],
  kids: ['MARSHMALLOWS!!!!', 'For the hockey team! (2 players)', 'Mom says one cup each.'],
  lou: ['For the boys at the mill.', 'Hank! Buddy! You owe me five bucks.', 'Big mug. Bigger please.'],
  lou_lh: ['Keeps the lighthouse warm.', 'Long walk out here, sonny. Worth it?', 'The gulls want some too.'],
};

let NEXT_ID = 1;

// temperature for a cup (quality 0..100): degrees and a hot red-orange -> cold blue colour
export function cupTemp(q) {
  const k = Math.max(0, Math.min(1, q / 100));
  const stops = [[0.0, [70, 130, 220]], [0.35, [120, 190, 230]], [0.6, [240, 200, 80]], [0.8, [245, 140, 50]], [1.0, [225, 60, 35]]];
  let i = 1;
  while (i < stops.length - 1 && k > stops[i][0]) i++;
  const [a, ca] = stops[i - 1], [b, cb] = stops[i];
  const t = Math.max(0, Math.min(1, (k - a) / (b - a || 1)));
  const c = ca.map((v, j) => Math.round(v + (cb[j] - v) * t));
  return { k, deg: Math.round(20 + k * 60), color: `rgb(${c[0]},${c[1]},${c[2]})`, word: k > 0.8 ? 'Piping hot' : k > 0.6 ? 'Hot' : k > 0.35 ? 'Warm' : k > 0.12 ? 'Cooling' : 'Cold' };
}

// a little thermometer + temperature bar (HTML string) used by the HUD list and the order book
export function tempBarHTML(q, cls = '') {
  const T = cupTemp(q);
  const pct = Math.round(T.k * 100);
  const big = cls.includes('big');
  // sized in art pixels (--u) like the rest of the pixel UI: the 16px face at 1:1, a 1-pixel ink border
  return `<span class="tbar ${cls}" title="${T.word} (${T.deg}\u00b0C)" style="display:inline-flex;align-items:center;gap:calc(var(--u) * 2);flex:1;min-width:calc(var(--u) * ${big ? 60 : 20})">` +
    `<img class="tbar-face" src="${tempFaceURL(tempMood(q))}" alt="${T.word}" style="width:calc(var(--u) * 16);height:calc(var(--u) * 16);image-rendering:pixelated;flex:none">` +
    `<span class="tbar-track" style="position:relative;flex:1;height:calc(var(--u) * ${big ? 6 : 4});background:#e8e0d0;border:var(--u) solid #3a2a1e;overflow:hidden">` +
    `<span class="tbar-fill" style="position:absolute;left:0;top:0;bottom:0;width:${pct}%;background:linear-gradient(90deg,#4682dc,${T.color})"></span></span></span>`;
}

export class Orders {
  constructor(game) {
    this.game = game;
    this.list = []; // all of today's orders (board + carried + delivered)
  }

  get state() {
    return this.game.state;
  }

  // Build the morning board
  makeBoard(day, forced = null) {
    const rng = new RNG(1000 + day * 77);
    const n = forced ? forced.length : Math.min(7, 2 + Math.floor(day * 0.75));
    const ids = forced || shuffle(Object.keys(CUSTOMERS), rng).slice(0, n);
    // deal cocoas from a shuffled deck so a board never reads "mocha, mocha, mocha"
    const deck = shuffle(COCOAS, rng);
    this.list = ids.map((cid, i) => {
      const c = CUSTOMERS[cid];
      const dist = Math.hypot(c.x - POI.cabin.x, c.z - POI.cabin.z);
      const cocoa = cid === 'gus' && day === 1 ? COCOAS[0] : cid === 'marie' && day === 1 ? COCOAS[1] : deck[i % deck.length];
      const distBonus = Math.round(dist / 60);
      const rush = day > 2 && rng.chance(0.2);
      return {
        id: NEXT_ID++, customer: cid === 'kids' ? 'pip' : cid === 'lou_lh' ? 'ollie' : cid, spot: cid, cocoa: cocoa.id, label: cocoa.label, color: cocoa.color,
        price: cocoa.price + distBonus + (rush ? 6 : 0), rush, note: rng.pick(NOTES[cid] || ['Thank you!']),
        quality: 100, state: 'board', pickedAt: 0, bumps: 0,
      };
    });
    this.state.orders = this.list;
    return this.list;
  }

  restore(list) {
    this.list = list || [];
    for (const o of this.list) NEXT_ID = Math.max(NEXT_ID, o.id + 1);
  }

  board() {
    return this.list.filter((o) => o.state === 'board');
  }
  carried() {
    return this.list.filter((o) => o.state === 'carried');
  }
  pending() {
    return this.list.filter((o) => o.state === 'board' || o.state === 'carried');
  }

  // Bessie's crate holds three cups
  capacity() {
    return this.game.bike.stats.capacity || 3;
  }

  // which of Nana's ingredients this cup still needs (empty = can brew)
  missing(o) {
    const st = this.state;
    if (!st.pantry) return [];
    return (RECIPES[o.cocoa] || []).filter((k) => !(st.pantry[k] > 0));
  }
  pack(o) {
    if (o.state !== 'board') return false;
    if (this.carried().length >= this.capacity()) return false;
    const miss = this.missing(o);
    if (miss.length) { this.lastMissing = miss; return false; }
    if (this.state.pantry) for (const k of RECIPES[o.cocoa] || []) this.state.pantry[k]--;
    o.state = 'carried';
    o.loaded = false; // still on Nana's tray until Hank packs it into Bessie's crate (Cargo.load)
    o.quality = 100;
    o.pickedAt = this.game.world.atmosphere.hour;
    this.syncCups();
    return true;
  }
  unpack(o) {
    if (o.state !== 'carried') return;
    if (this.state.pantry) for (const k of RECIPES[o.cocoa] || []) this.state.pantry[k] = (this.state.pantry[k] || 0) + 1;
    o.state = 'board';
    this.syncCups();
  }

  update(dt) {
    for (const o of this.carried()) {
      // ~9 minutes from piping hot to stone cold: orders can wait a good while
      o.quality = Math.max(0, o.quality - (dt * 100) / 540);
    }
  }

  // bumps and crashes slosh the cocoa
  slosh(amount) {
    for (const o of this.carried()) o.quality = Math.max(0, o.quality - amount);
  }

  // A crash: the cups fly out of the crate (Nana's lids stay on, but the cocoa sloshes about)
  // and land out in the cold: every cup loses a chunk of its heat, more the harder the crash.
  // Returns the most any cup lost; the HUD's thermometer face drops (o.chills ticks up).
  crashCool(impact = 5, soft = false) {
    const spill = soft ? 6 : 10;
    const chill = Math.min(22, Math.max(6, 4 + (impact || 0) * 1.5)) * (soft ? 0.75 : 1);
    let lost = 0;
    for (const o of this.carried()) {
      const before = o.quality;
      o.quality = Math.max(0, before - spill - chill);
      o.chills = (o.chills || 0) + 1;
      lost = Math.max(lost, before - o.quality);
    }
    // (no comment from Hank: the cups tumbling out and the thermometer face say it)
    return lost;
  }

  // returns the carried order for a customer spot, if any
  orderFor(spot) {
    return this.carried().find((o) => o.spot === spot);
  }

  // (an order only ever pays once, however it gets handed over)
  deliver(o) {
    if (o.state === 'delivered') return { pay: 0, tip: 0, quality: o.quality, again: true };
    o.state = 'delivered';
    const q = o.quality / 100;
    let pay = Math.round(o.price * (0.55 + 0.45 * q));
    let tip = 0;
    if (q > 0.6) tip += Math.round(o.price * 0.5 * ((q - 0.6) / 0.4));
    if (o.rush) tip += 3;
    const st = this.state;
    st.money += pay + tip;
    st.earned += pay + tip;
    st.stats.deliveries++;
    st.stats.tips += tip;
    st.stats.dayEarned += pay + tip;
    st.stats.dayTips += tip;
    st.stats.dayDeliveries++;
    // the warmest cup of the day (for the evening receipt)
    if (!st.stats.dayWarm || o.quality > st.stats.dayWarm.q) st.stats.dayWarm = { q: Math.round(o.quality), who: o.customer };
    // the last cup of a round paid: the day plan shows the coins for a moment
    if (!this.carried().length) this.game.lastPaidT = this.game.time;
    this.syncCups();
    return { pay, tip, quality: o.quality };
  }

  // the cups themselves ride in Bessie's crate (see cargo.js)
  syncCups() {
    this.game.cargo?.sync();
  }
}

function shuffle(a, rng) {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
