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
      case 'cauldron': {
        ch.react('gasp');
        g.sound.play('cauldron_bubble');
        g.effects.magic(s.x, g.walker.pos.y + 1.2, s.z, 24, [0.5, 1, 0.4]);
        g.quests?.event('cauldron');
        // the brew gives Hank a witch's hat for a while (poof!)
        if (!this.witchHat) {
          const r = g.world.voxel.model('witchhat-small', () => g.world.voxelProps.witchHat({}));
          const m = new THREE.Mesh(r.geometry, ch.mat);
          m.position.y = ch.P.headH - 0.06;
          m.rotation.z = 0.15;
          m.scale.setScalar(0.8);
          ch.headPiece.add(m);
          this.witchHat = m;
          g.sound.play('witch_cackle');
          g.wait(30).then(() => {
            ch.headPiece.remove(m);
            this.witchHat = null;
            g.effects.magic(g.playerPos.x, g.playerPos.y + 1.8, g.playerPos.z, 14, [0.7, 0.5, 1]);
          });
        }
        break;
      }
      case 'tv': {
        const S = g.state;
        const lines = ['Good evening, Maple Cove!', `Day ${S.day}: ${g.world.atmosphere.weatherTarget} skies.`];
        const news = g.quests?.noteLines?.() || [];
        g.mode = 'menu';
        (async () => {
          await g.ui.say(null, `*MCTV* — ${lines.join(' ')} ${news.length ? 'In town tonight: ' + news.join('; ') + '.' : 'Word is somebody always needs a hand: stop and chat!'}`, { name: '' });
          g.mode = 'ride';
        })();
        break;
      }
      case 'carve':
        g.openMenu(() => g.menus.carve((face) => {
          g.resumeFromMenu();
          if (!face) return;
          const slots = [[-167.6, 62.6], [-164.8, 62.4], [-168.6, 64.2], [-163.8, 64.4], [-166.2, 61.6]];
          this.carved = (this.carved || 0) % slots.length;
          const [x, z] = slots[this.carved++];
          const PRm = g.world.voxel;
          const r = PRm.model(`carved:${face}`, () => g.world.voxelProps.jackOLantern({ face, kind: 'medium', seed: 3, hollow: false }));
          const y = g.physics.groundAt(x, z, 100).h;
          g.world.physprops.add(r, x, y, z, { yaw: Math.PI / 2, kind: 'jack', hp: 3, mass: 1.2, lights: true, respawn: 0 });
          g.sound.play('lantern_whoomp');
          g.effects.magic(x, y + 0.5, z, 20, [1, 0.7, 0.3]);
          ch.react('yay');
          g.quests?.event('carve', face);
          g.ui.toast(`You carved a <b>${face}</b> jack-o'-lantern! It's glowing on the porch.`, 'pumpkin', 2600);
        }));
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
