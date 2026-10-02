// Garage upgrades: each changes bike stats and shows up as a real part on the bike.
import { BASE_STATS } from './bike.js';

export const UPGRADES = [
  { id: 'rack', name: 'Cargo Rack', icon: 'rack', price: 35, desc: 'A crate strapped behind the saddle. Carry 4 cocoas at once.', apply: (s) => { s.capacity = Math.max(s.capacity, 4); } },
  { id: 'gears7', name: '7-Speed Gears', icon: 'gears', price: 55, desc: "Harold's old derailleur, freshly oiled. Faster on the flats, comfier up hills.", apply: (s) => { s.gears = Math.max(s.gears, 7); s.topSpeed = Math.max(s.topSpeed, 11); s.power = Math.max(s.power, 4.8); } },
  { id: 'tires', name: 'Knobby Tires', icon: 'tires', price: 40, desc: 'Chunky tread for grass, dirt and leaf piles. Drifts stay under control.', apply: (s) => { s.grip = Math.max(s.grip, 1.35); } },
  { id: 'lamp', name: 'Headlamp', icon: 'lamp', price: 30, desc: 'A brass lamp for after sunset. Deer are very impressed.', apply: (s) => { s.light = true; } },
  { id: 'thermos', name: 'Thermos Box', icon: 'thermos', price: 50, desc: 'Wool-lined and toasty. Cocoa stays hot twice as long.', apply: (s) => { s.thermos = Math.max(s.thermos, 2); } },
  { id: 'horn', name: 'Moose-Horn Bell', icon: 'horn', price: 20, desc: 'HOOONK. Villagers wave. Moose... respond.', apply: (s) => { s.bellType = 'horn_moose'; } },
  { id: 'springs', name: 'Bouncy Springs', icon: 'springs', price: 65, desc: 'Higher hops and softer landings. Bones stay attached more often.', apply: (s) => { s.suspension = 1; s.jump = Math.max(s.jump, 5.3); } },
  { id: 'cola', name: 'Maple-Cola Boosters', icon: 'cola', price: 85, desc: 'Two bottles of fizzy rocket fuel. Press F (or Q) to boost. Refills at home.', apply: (s) => { s.boostCharges = Math.max(s.boostCharges, 2); } },
  { id: 'glider', name: 'Quilt Glider', icon: 'glider', price: 110, desc: "Nana's patchwork quilt, now aerodynamic. Hold JUMP in the air to glide.", apply: (s) => { s.glider = true; } },
  { id: 'sled', name: 'Toboggan Trailer', icon: 'basket', price: 95, req: 'rack', desc: 'Two more cup holders and a little sled. Carry 6 cocoas.', apply: (s) => { s.capacity = Math.max(s.capacity, 6); } },
  { id: 'cola2', name: 'Extra Fizz', icon: 'cola', price: 100, req: 'cola', desc: 'Four boosters per trip. Not recommended by any doctor, including Dr. Ingrid.', apply: (s) => { s.boostCharges = Math.max(s.boostCharges, 4); } },
  { id: 'gears21', name: '21-Speed Gears', icon: 'gears', price: 130, req: 'gears7', desc: 'Racing cassette. Hank has never been this fast. Alive or otherwise.', apply: (s) => { s.gears = Math.max(s.gears, 21); s.topSpeed = Math.max(s.topSpeed, 13.2); s.power = Math.max(s.power, 5.3); } },
  { id: 'motor', name: "Harold's Motorbike", icon: 'motorbike', price: 380, req: 'gears21', desc: 'The 1958 beauty, restored at last. With a sidecar for Poutine and the cocoa.', apply: (s) => { s.motor = true; s.topSpeed = 22; s.power = 8.5; s.capacity = Math.max(s.capacity, 6); s.grip = Math.max(s.grip, 1.25); s.jump = Math.max(s.jump, 4.6); s.light = true; } },
];

export function computeStats(owned) {
  const s = { ...BASE_STATS };
  for (const u of UPGRADES) if (owned[u.id]) u.apply(s);
  return s;
}

export function canBuy(u, state) {
  if (state.upgrades[u.id]) return { ok: false, why: 'Owned' };
  if (u.req && !state.upgrades[u.req]) return { ok: false, why: `Needs ${UPGRADES.find((x) => x.id === u.req).name}` };
  if (state.money < u.price) return { ok: false, why: 'Not enough money' };
  return { ok: true };
}
