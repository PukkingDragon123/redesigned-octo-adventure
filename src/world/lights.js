// Assigns the 8 shader point lights to the most relevant lamps/fires each frame.
import { G } from '../render/shaderlib.js';

export class LightPool {
  constructor(lights) {
    this.lights = lights; // { pos, color:[r,g,b], radius, kind, always }
    this.extra = []; // dynamic lights (bike headlamp, lanterns in cutscenes)
    this.flicker = 0;
  }
  addDynamic(l) {
    this.extra.push(l);
    return l;
  }
  removeDynamic(l) {
    this.extra = this.extra.filter((e) => e !== l);
  }
  update(dt, focus, night) {
    this.flicker += dt;
    const cand = [];
    const dusk = Math.min(1, Math.max(0, night * 1.6));
    for (const l of this.lights) {
      if (l.on === false) continue;
      let k = 0;
      if (l.kind === 'fire') k = 0.55 + dusk * 0.6;
      else if (l.kind === 'window') k = dusk * 0.9;
      else if (l.kind === 'beacon') k = dusk * 1.4;
      else k = dusk * 1.1; // street/lamp
      if (l.always) k = Math.max(k, 0.6);
      if (k <= 0.01) continue;
      const dx = l.pos.x - focus.x, dz = l.pos.z - focus.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > 70 * 70) continue;
      cand.push({ l, k, score: d2 / (l.radius * l.radius) });
    }
    for (const l of this.extra) if (l.on !== false) cand.push({ l, k: l.intensity ?? 1, score: -1 });
    cand.sort((a, b) => a.score - b.score);
    const P = G.uPL.value, C = G.uPLc.value;
    for (let i = 0; i < 8; i++) {
      const c = cand[i];
      if (!c) {
        P[i].set(0, -999, 0, 1);
        C[i].set(0, 0, 0);
        continue;
      }
      const l = c.l;
      let k = c.k;
      if (l.kind === 'fire') k *= 0.8 + 0.2 * Math.sin(this.flicker * 13 + i) * Math.sin(this.flicker * 7.3);
      P[i].set(l.pos.x, l.pos.y, l.pos.z, l.radius);
      C[i].set(l.color[0] * k, l.color[1] * k, l.color[2] * k);
    }
  }
}
