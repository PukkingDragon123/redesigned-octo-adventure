// Cocoa orders: the morning board, carrying (cooling & sloshing), delivery and pay.
import * as THREE from 'three';
import { CUSTOMERS, POI } from '../world/layout.js';
import { RNG } from '../core/noise.js';
import { Builder } from '../render/builder.js';
import { propMesh } from '../render/propMaterial.js';

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
    this.cupMeshes = [];
  }

  get state() {
    return this.game.state;
  }

  // Build the morning board
  makeBoard(day, forced = null) {
    const rng = new RNG(1000 + day * 77);
    const n = forced ? forced.length : Math.min(7, 2 + Math.floor(day * 0.75));
    const ids = forced || shuffle(Object.keys(CUSTOMERS), rng).slice(0, n);
    this.list = ids.map((cid) => {
      const c = CUSTOMERS[cid];
      const dist = Math.hypot(c.x - POI.cabin.x, c.z - POI.cabin.z);
      const cocoa = cid === 'gus' && day === 1 ? COCOAS[0] : cid === 'marie' && day === 1 ? COCOAS[1] : rng.pick(COCOAS);
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

  capacity() {
    return this.game.bike.stats.capacity;
  }

  pack(o) {
    if (o.state !== 'board') return false;
    if (this.carried().length >= this.capacity()) return false;
    o.state = 'carried';
    o.quality = 100;
    o.pickedAt = this.game.world.atmosphere.hour;
    this.syncCups();
    return true;
  }
  unpack(o) {
    if (o.state !== 'carried') return;
    o.state = 'board';
    this.syncCups();
  }

  update(dt) {
    const th = this.game.bike.stats.thermos;
    for (const o of this.carried()) {
      // ~3 minutes from piping hot to stone cold (6 with the thermos)
      o.quality = Math.max(0, o.quality - (dt * 100) / (180 * th));
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

  // cups in the basket / crate as tiny 3D mugs
  syncCups() {
    const g = this.game;
    for (const m of this.cupMeshes) m.parent?.remove(m);
    this.cupMeshes = [];
    g.effects.cups = [];
    const carried = this.carried();
    const model = g.bikeModel;
    carried.forEach((o, i) => {
      const B = new Builder();
      B.tube([0, 0, 0], [0, 0.11, 0], 0.045, 0.05, { color: 0xf4ecdc }, 7);
      B.tube([0, 0.105, 0], [0, 0.112, 0], 0.042, 0.042, { color: o.color }, 7);
      B.geom(new THREE.TorusGeometry(0.03, 0.01, 3, 6), [0.055, 0.055, 0], null, [1, 1, 1], { color: 0xf4ecdc });
      const m = propMesh(B.build(), g.world.propMat, { cast: false });
      let parent, x, z;
      if (model.isMotor) {
        parent = model.mBasketAnchor;
        x = (i % 3) * 0.12 - 0.12;
        z = Math.floor(i / 3) * 0.14 - 0.1;
      } else if (i < 2) {
        parent = model.basketAnchor;
        x = i === 0 ? -0.08 : 0.08;
        z = 0.02;
      } else {
        parent = model.rearAnchor;
        x = ((i - 2) % 2) * 0.14 - 0.07;
        z = Math.floor((i - 2) / 2) * 0.13 - 0.07;
      }
      m.position.set(x, 0, z);
      parent.add(m);
      this.cupMeshes.push(m);
      g.effects.cups.push(m);
    });
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
