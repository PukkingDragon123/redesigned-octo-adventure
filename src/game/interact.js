// Things Hank can poke at around town: kick pumpkins, sit on benches, bonk the
// giant skeleton bobblehead, stir the witch's cauldron... plus the trick hoops.
import * as THREE from 'three';
import { input } from '../core/input.js';

export class Interactables {
  constructor(game) {
    this.game = game;
    this.W = game.world;
    this.props = game.world.physprops;
    if (this.props) this.props.game = game;
    this.spots = game.world.voxel?.spots || [];
    this.hoops = game.world.voxel?.hoops || [];
    this.sitting = null;
    this.bobble = 0;
    game.world.interactables = this;
    if (this.props) {
      this.props.onSmash = (p) => {
        game.state.stats.smashed = (game.state.stats.smashed || 0) + 1;
        game.quests?.event('smash', p);
        if (p.kind === 'jack' && Math.random() < 0.6) game.effects?.coins(p.pivot.position.x, p.pivot.position.y + 0.4, p.pivot.position.z, 4);
      };
    }
  }

  // the prompt shown when nothing more important is around
  nearestAction(g) {
    const p = g.playerPos;
    if (this.sitting) return { text: 'Stand up', fn: () => this.standUp() };
    if (!g.onFoot) return null;
    let best = null, bd = 1e9;
    for (const s of this.spots) {
      const d = Math.hypot(p.x - s.x, p.z - s.z);
      if (d < s.r && d < bd) { bd = d; best = s; }
    }
    if (best) return { text: best.text, fn: () => this.use(best) };
    const pr = this.props?.nearest(p, 1.3);
    if (pr) return { text: pr.kind === 'pin' ? 'Kick the pin' : 'Kick the pumpkin', key: 'F', fn: () => this.kickNow(), passive: true };
    return null;
  }

  kickNow() {
    const W = this.game.walker;
    const ch = this.game.rider.ch;
    ch.play('kick');
    ch.animT = 0;
    this.kick(W.pos, W.yaw);
  }

  kick(pos, yaw) {
    const g = this.game;
    g.sound.play('kick');
    // the boot lands a beat after the wind-up
    g.wait(0.2).then(() => {
      const hit = this.props?.kick(pos, yaw, 1);
      if (hit) {
        g.chase.shake(0.25);
        g.quests?.event('kick', hit);
      }
    });
  }

  use(s) {
    const g = this.game;
    const ch = g.rider.ch;
    switch (s.action) {
      case 'sit':
        this.sitting = s;
        g.walker.place(s.x, s.y + 0.05, s.z, s.yaw);
        ch.play('sit');
        g.sound.play('footstep_wood');
        break;
      case 'bobble':
        this.bobble = 1;
        ch.play('point');
        ch.react('laugh');
        g.sound.play('bone_rattle');
        g.sound.play('boing');
        g.quests?.event('bobble');
        break;
      case 'cauldron':
        ch.react('gasp');
        g.sound.play('cauldron_bubble');
        g.effects.magic(s.x, g.walker.pos.y + 1.2, s.z, 24, [0.5, 1, 0.4]);
        g.quests?.event('cauldron');
        break;
      default:
        g.quests?.event('spot', s);
    }
  }

  standUp() {
    this.sitting = null;
    this.game.rider.ch.play('idle');
    this.game.rider.ch.jump(2);
  }

  update(dt) {
    const g = this.game;
    if (this.sitting) {
      // any movement gets Hank back on his feet
      if (Math.abs(input.steer()) + input.throttle() + input.brake() > 0.2) this.standUp();
      else { g.walker.vel.set(0, 0, 0); }
    }
    // physics props get pushed by Hank and the bike
    if (this.props) {
      const actors = [];
      if (g.onFoot) actors.push({ pos: g.walker.pos, vel: g.walker.vel, r: 0.3 });
      else if (g.bike.crash <= 0) actors.push({ pos: g.bike.pos, vel: g.bike.vel, r: 0.45, bike: true });
      this.props.update(dt, actors);
    }
    // bobblehead wobble decays (purely cosmetic for now)
    this.bobble = Math.max(0, this.bobble - dt * 0.5);
    // trick hoops: riding through one at speed is a trick shot
    if (!g.onFoot && this.hoops.length) {
      const b = g.bike;
      for (const h of this.hoops) {
        const dx = b.pos.x - h.x, dz = b.pos.z - h.z;
        if (dx * dx + dz * dz > 25) { h.inside = false; continue; }
        // hoop plane: local z axis is the hoop normal
        const along = dx * Math.sin(h.yaw) + dz * Math.cos(h.yaw);
        const side = Math.sign(along);
        const lateral = Math.abs(dx * Math.cos(h.yaw) - dz * Math.sin(h.yaw));
        if (h.lastSide && side !== h.lastSide && lateral < 1.4 && b.pos.y - h.y < 3.2) {
          g.tricks?.hoop(h);
        }
        h.lastSide = side;
      }
    }
  }
}
