// Villagers of Maple Cove (and Nana at home): idle personalities, reactions.
import * as THREE from 'three';
import { Actor } from './actor.js';
import { CUSTOMERS, BUILDINGS, POI } from '../world/layout.js';

const IDLE = { agnes: 'knit', pip: 'hockey', pop: 'hockey', birdie: 'idle', gus: 'idle', marie: 'idle', doug: 'idle', ingrid: 'idle', lou: 'idle', ollie: 'idle', grandma: 'idle' };

export function charForSpot(spot) {
  return spot === 'kids' ? 'pip' : spot === 'lou_lh' ? 'ollie' : spot;
}

export class Villagers {
  constructor(game) {
    this.game = game;
    this.actors = {};
    for (const [spot, c] of Object.entries(CUSTOMERS)) {
      const char = charForSpot(spot);
      const house = BUILDINGS.find((b) => b.id === c.house);
      const yaw = house ? house.facing || 0 : 0;
      const a = new Actor(game, char, { x: c.x, z: c.z, yaw });
      a.spot = spot;
      a.homeYaw = yaw;
      a.homePos = a.pos.clone();
      a.play(IDLE[char] || 'idle');
      this.actors[spot] = a;
    }
    // Pop plays hockey with Pip
    const kids = CUSTOMERS.kids;
    const pop = new Actor(game, 'pop', { x: kids.x + 2.5, z: kids.z + 3, yaw: -2.5 });
    pop.play('hockey');
    pop.homePos = pop.pos.clone();
    pop.homeYaw = -2.5;
    this.actors.pop = pop;
    // Doug walks a little beat along the street
    this.actors.doug.patrol = [new THREE.Vector3(150, 0, 60), new THREE.Vector3(186, 0, 60)];
    this.actors.doug.patrolIdx = 0;
    // Nana lives on the porch
    const nana = new Actor(game, 'grandma', { x: -169.5, z: 66.5, yaw: Math.PI / 2 });
    nana.homePos = nana.pos.clone();
    nana.homeYaw = Math.PI / 2;
    this.actors.grandma = nana;
    this.scaredOfHank = true;
    this.waveCooldown = {};
  }

  get(id) {
    return this.actors[id];
  }

  setVisible(id, v) {
    if (this.actors[id]) this.actors[id].visible = v;
  }

  update(dt) {
    const g = this.game;
    const p = g.bike.pos;
    const hour = g.world.atmosphere.hour;
    const night = hour > 21 || hour < 6.5;
    for (const [id, a] of Object.entries(this.actors)) {
      if (a.scripted) {
        a.update(dt, g.camera.position);
        continue;
      }
      const d = Math.hypot(a.pos.x - p.x, a.pos.z - p.z);
      if (d > 140) {
        a.mesh.visible = false;
        if (a.emote) a.emote.mesh.visible = false;
        continue;
      }
      // go indoors late at night (Nana stays up for Hank)
      a.visible = !night || id === 'grandma' || id === 'doug';
      // patrols
      if (a.patrol && !a.path && d > 6) {
        a.patrolWait = (a.patrolWait || 0) - dt;
        if (a.patrolWait <= 0) {
          a.patrolIdx = (a.patrolIdx + 1) % a.patrol.length;
          a.walkTo([a.patrol[a.patrolIdx]], 1.1).then(() => (a.patrolWait = 5 + Math.random() * 5));
        }
      }
      // turn to look at Hank when he's close and slow
      if (d < 9 && !a.path) {
        a.faceTowards(p.x, p.z);
        if (!this.scaredOfHank && g.bike.speed < 3 && !(this.waveCooldown[id] > 0) && d < 6) {
          this.waveCooldown[id] = 25;
          a.play('wave', 'happy');
          setTimeout(() => a.anim === 'wave' && a.play(IDLE[a.char] || 'idle', 'neutral'), 1600);
        }
      } else if (!a.path && a.homeYaw !== undefined) a.face(a.homeYaw);
      this.waveCooldown[id] = (this.waveCooldown[id] || 0) - dt;
      a.update(dt, g.camera.position);
    }
  }

  // Everyone in earshot reacts to Hank's bell/horn
  onBell() {
    const p = this.game.bike.pos;
    for (const a of Object.values(this.actors)) {
      const d = Math.hypot(a.pos.x - p.x, a.pos.z - p.z);
      if (d < 22 && !a.scripted && a.visible) {
        a.faceTowards(p.x, p.z);
        a.showEmote(this.scaredOfHank ? 'alert' : Math.random() < 0.5 ? 'note' : 'heart', 1.6);
        a.jump(2.2);
      }
    }
  }
}
