// Cocoa orders: the morning board, carrying (cooling & sloshing), delivery and pay.
import { CUSTOMERS, POI } from '../world/layout.js';
import { RNG } from '../core/noise.js';
import { RECIPES, STARTER_PANTRY } from './quests.js';

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
      // ~3 minutes from piping hot to stone cold
      o.quality = Math.max(0, o.quality - (dt * 100) / 180);
    }
  }

  // bumps and crashes slosh the cocoa
  slosh(amount) {
    for (const o of this.carried()) o.quality = Math.max(0, o.quality - amount);
  }

  // returns the carried order for a customer spot, if any
  orderFor(spot) {
    return this.carried().find((o) => o.spot === spot);
  }

  deliver(o) {
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
