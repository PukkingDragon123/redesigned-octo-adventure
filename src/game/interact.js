// Things Hank can poke at around town: kick pumpkins and the bowling ball, sit on
// benches, watch Nana's TV, knock on (and barge through) front doors, and knock over the 2D
// street clutter (bins, fences, crates, signs, the fish stall...: see deco2d.js).
import { input } from '../core/input.js';
import { Deco2D } from './deco2d.js';

export class Interactables {
  constructor(game) {
    this.game = game;
    this.W = game.world;
    this.props = game.world.physprops;
    if (this.props) this.props.game = game;
    this.spots = game.world.voxel?.spots || [];
    this.sitting = null;
    this.deco = new Deco2D(game);
    game.world.interactables = this;
    if (this.props) {
      this.props.onSmash = (p) => {
        game.state.stats.smashed = (game.state.stats.smashed || 0) + 1;
        game.quests?.event('smash', p);
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
    if (pr) return { text: KICK_TEXT[pr.kind] || 'Kick it', key: 'F', fn: () => this.kickNow(), passive: true };
    const dk = this.deco.nearest(p, 1.0);
    if (dk) return { text: dk.text, key: 'F', fn: () => this.kickNow(), passive: true };
    const door = this.W.doors?.nearest(p);
    if (door) return { text: 'Knock on the door', fn: () => this.W.doors.knock(door, g), passive: true };
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
      if (this.deco.kick(pos, yaw, 1) && !hit) g.chase.shake(0.2);
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
    // the 2D street clutter: knocked over by the bike and by Hank, tidied away while nobody looks
    this.deco.update(dt);
    // the front doors: swung open by Hank and Bessie, pulled shut by their springs
    this.W.doors?.update(dt, g);
  }
}

const KICK_TEXT = { pin: 'Kick the pin', ball: 'Kick the ball', pumpkin: 'Kick the pumpkin' };
