// Living forest: the residents (deer herds in the meadows, the moose by the
// marsh, the crows on the graveyard's dead tree, the beaver at its dam) plus
// everything that comes and goes around the rider (critters.js). All of them
// are voxel puppets, posed procedurally and drawn one instanced call per species.
import { RNG } from '../core/noise.js';
import * as L from '../world/layout.js';
import { Critters, mooseAI, perchCrowAI, beaverAI } from './critters.js';

export class Wildlife {
  constructor(game) {
    this.game = game;
    const C = (this.critters = new Critters(game));
    game.critters = C;
    const rng = new RNG(555);
    const stay = { resident: true, despawn: Infinity, maxDraw: 220 };
    // deer herds in meadows & clearings (a buck leads the bigger ones, a fawn tags along)
    const herds = [
      [L.POI.meadow1.x, L.POI.meadow1.z, 4],
      [L.POI.meadow2.x, L.POI.meadow2.z, 3],
      [-60, -200, 3],
      [150, -140, 2],
      [-230, 40, 2],
    ];
    for (const [hx, hz, n] of herds) {
      const herd = { x: hx, z: hz, alarm: 0, fleeYaw: 0 };
      for (let i = 0; i < n; i++) {
        const kind = i === 0 && n > 2 ? 'buck' : i === n - 1 && n > 2 ? 'fawn' : 'deer';
        C.place(kind, hx + rng.range(-8, 8), hz + rng.range(-8, 8), { ...stay, group: herd, yaw: rng.range(0, 6.28) });
      }
    }
    // a moose who likes the marsh by the pond (and sometimes the road)
    const m = C.add('moose', L.POI.pond.x - 14, L.POI.pond.z + 22, { ...stay, yaw: 1, ai: mooseAI, cat: 'moose' });
    m.collider = game.physics.addCircle({ x: m.x, z: m.z, r: 1.3, kind: 'moose' });
    // crows on the dead tree in the graveyard
    for (const p of game.world.ctx.perches) {
      const c = C.add('crow', p.x, p.z, { ...stay, y: p.y, ai: perchCrowAI, cat: 'perchCrow', maxDraw: 160, yaw: rng.range(0, 6.28) });
      c.perch = { x: p.x, y: p.y, z: p.z };
    }
    // a beaver near the dam
    const dam = game.world.ctx.beaverDam;
    if (dam) {
      const b = C.add('beaver', dam.x + 3, dam.z - 4, { ...stay, y: 0.02, ai: beaverAI, cat: 'beaver', maxDraw: 150 });
      b.dam = dam;
    }
  }

  // every creature about (residents and visitors): { kind, x, y, z, air, ... }
  get list() {
    return this.critters.list;
  }

  update(dt) {
    this.critters.update(dt);
  }
}
