// Little pixel emote bubbles that pop above a character's head and follow it.
import { Billboard } from '../render/sprites.js';

export class Emotes3D {
  constructor(game) {
    this.game = game;
    this.list = [];
  }
  show(ch, name, seconds = 2) {
    let e = this.list.find((x) => x.ch === ch);
    if (!e) {
      e = { ch, b: new Billboard(this.game.atlas, `emote:${name}`, { castShadow: false, lit: 0.3, upright: 0.5 }) };
      this.game.scene.add(e.b.mesh);
      this.list.push(e);
    } else e.b.setFrame(`emote:${name}`);
    e.t = seconds;
    e.pop = 0;
  }
  update(dt) {
    for (const e of this.list) {
      e.t -= dt;
      e.pop = Math.min(1, e.pop + dt * 6);
      const s = e.pop < 1 ? 1 + Math.sin(e.pop * Math.PI) * 0.45 : 1;
      e.b.setScale(s, s);
      const p = e.ch.headWorld(e.b.mesh.position);
      p.y += 0.35 + Math.sin(e.t * 3) * 0.04;
      e.b.mesh.visible = e.t > 0 && e.ch.visible && e.ch.root.parent != null;
    }
    const gone = this.list.filter((e) => e.t < -0.1 && !e.b.mesh.visible);
    for (const e of gone) this.game.scene.remove(e.b.mesh);
    if (gone.length) this.list = this.list.filter((e) => !gone.includes(e));
  }
}
