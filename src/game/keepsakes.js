// Harold's lost keepsakes, glittering around the world: each one its pixel-art icon pressed
// into a little voxel model (voxel/extrude.js) that bobs and turns in the air.
import * as THREE from 'three';
import { extrudeSprite } from '../voxel/extrude.js';
import { meshVox } from '../voxel/mesh.js';
import { voxMesh, sharedVoxelMaterial } from '../render/voxelMaterial.js';
import { KEEPSAKES } from '../world/layout.js';
import { P } from '../render/particles.js';

export const KEEPSAKE_ICON = { cane: 'cane', spyglass: 'spyglass', pack: 'pack', clock: 'clock', coat: 'coat', medbag: 'medbag', suitcase: 'suitcase', keys: 'keys', books: 'books', map: 'map', lantern: 'lantern', bottles: 'bottles' };

export class Keepsakes {
  constructor(game) {
    this.game = game;
    this.items = [];
    for (const k of KEEPSAKES) {
      const r = extrudeSprite(game.atlas, `icon:${KEEPSAKE_ICON[k.id]}`, { depth: 3, size: 1.25 / 32 });
      const mesh = new THREE.Group();
      if (r) mesh.add(voxMesh(meshVox(r.vox, { size: r.size, origin: r.origin }), sharedVoxelMaterial()));
      const bb = { mesh };
      game.scene.add(mesh);
      const g = game.physics.groundAt(k.x, k.z, 50);
      this.items.push({ ...k, bb, y: g.h, t: Math.random() * 6, light: null });
    }
    this.sync();
  }

  sync() {
    const st = this.game.state;
    for (const it of this.items) {
      it.taken = !!(st && st.keepsakes[it.id]);
      it.bb.mesh.visible = !it.taken;
    }
  }

  update(dt) {
    const g = this.game;
    const p = g.playerPos;
    for (const it of this.items) {
      if (it.taken) continue;
      it.t += dt;
      const d = Math.hypot(it.x - p.x, it.z - p.z);
      // floating collectibles never photobomb a cutscene or the title
      it.bb.mesh.visible = d < 160 && g.mode !== 'cutscene' && g.mode !== 'title' && !g.currentScene;
      const bob = Math.sin(it.t * 2) * 0.12;
      it.bb.mesh.position.set(it.x, it.y + 0.9 + bob, it.z);
      it.bb.mesh.rotation.y = it.t * 1.6;
      if (d < 45 && Math.random() < dt * 6) {
        g.effects.ps.spawn({ x: it.x + (Math.random() - 0.5) * 0.8, y: it.y + 0.6 + Math.random() * 0.8, z: it.z + (Math.random() - 0.5) * 0.8, vy: 0.4, life: 1, size: 0.16, sprite: P.star, color: [1, 0.92, 0.6], emissive: 1, drag: 1 });
      }
      if (d < 2.4 && Math.abs(p.y - it.y) < 3 && g.mode === 'ride') this.collect(it);
    }
  }

  collect(it) {
    const g = this.game;
    it.taken = true;
    it.bb.mesh.visible = false;
    g.state.keepsakes[it.id] = 'found';
    g.effects.magic(it.x, it.y + 1, it.z, 26, [1, 0.9, 0.5]);
    g.effects.confetti(it.x, it.y + 1, it.z, 20);
    g.sound.play('collect');
    g.ui.pop(`Harold's *${it.name}*! For Nana.`, { expr: 'sparkle', ms: 2800, prio: 'high' });
    g.save();
  }

  nearest(p) {
    let best = null, bd = 1e9;
    for (const it of this.items) {
      if (it.taken) continue;
      const d = Math.hypot(it.x - p.x, it.z - p.z);
      if (d < bd) { bd = d; best = it; }
    }
    return best ? { it: best, d: bd } : null;
  }
}
