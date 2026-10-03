// Village pets: Agnes's cat Duchess on the front step and Gus's dog Biscuit by
// the cabin. While their people are scared of Hank, the cat arches up, hisses
// and bolts under the porch and the dog barks its head off; once the village
// warms to him, the cat comes to wind round his shins and the dog bounces about.
import * as THREE from 'three';
import { Vox, tone } from '../voxel/vox.js';
import { meshVox } from '../voxel/mesh.js';
import { voxMesh, sharedVoxelMaterial } from '../render/voxelMaterial.js';
import { catVox } from './quests.js';
import { frontOf } from '../world/layout.js';

const hyp = Math.hypot;
const rand = (a, b) => a + Math.random() * (b - a);

function dogVox() {
  const v = new Vox(9, 11, 16);
  const c = 0xc8904a, d = tone(c, -0.18), b = 0xf2e2c4;
  v.ellipsoid(4, 4.2, 7, 2.8, 2.4, 4.6, (x, y, z) => (y < 3 && Math.abs(x - 4) < 1.3 ? b : (x + z) % 5 === 0 ? d : c)); // body
  for (const [x, z] of [[2, 4], [6, 4], [2, 10], [6, 10]]) v.fill(x, 0, z, x, 2, z, x === 2 && z === 4 ? b : d); // legs
  v.ellipsoid(4, 7, 12.5, 2.4, 2.2, 2.3, c); // head
  v.fill(3, 5, 14, 5, 6, 15, b); v.set(4, 6, 15, 0x1e1418); // muzzle & nose
  v.set(3, 8, 14, 0x1e1418); v.set(5, 8, 14, 0x1e1418); // eyes
  v.fill(1, 6, 11, 1, 9, 12, d); v.fill(7, 6, 11, 7, 9, 12, d); // floppy ears
  v.fill(3, 5, 9, 5, 5, 10, 0xc8302a); v.set(4, 4, 10, 0xf2c443); // collar & tag
  v.line(4, 5, 2, 4, 8, 0, c); // tail up
  return { vox: v, size: 0.045, origin: [4.5, 0, 8] };
}

const PETS = [
  { id: 'duchess', name: 'Duchess', kind: 'cat', owner: 'agnes', at: () => frontOf('agnes', 0.9, -2.6), yaw: Math.PI, build: () => catVox(0xf0ece4, 0xfff8f0, 0x6ab8e8) },
  { id: 'biscuit', name: 'Biscuit', kind: 'dog', owner: 'gus', at: () => frontOf('gus', 1.8, -1.2), yaw: 0.25, build: dogVox },
];

export class Pets {
  constructor(V) {
    this.V = V;
    this.g = V.game;
    this.list = PETS.map((P) => {
      const r = P.build();
      const body = voxMesh(meshVox(r.vox, { size: r.size, origin: r.origin, jitter: 0.03 }), sharedVoxelMaterial());
      body.castShadow = true;
      const root = new THREE.Group();
      root.add(body);
      const h = P.at();
      root.position.set(h.x, 0, h.z);
      root.rotation.y = P.yaw;
      this.g.scene.add(root);
      return { P, root, body, home: { x: h.x, z: h.z, yaw: P.yaw }, state: 'sit', t: rand(2, 6), to: null, yaw: P.yaw, ph: 0, cool: 0, tag: new THREE.Vector3() };
    });
  }
  update(dt, X) {
    const g = this.g;
    for (const p of this.list) {
      const R = p.root;
      const d = hyp(R.position.x - X.p.x, R.position.z - X.p.z);
      R.visible = d < 90 && p.state !== 'gone';
      if (d > 90) continue;
      p.t -= dt;
      p.cool -= dt;
      p.ph += dt;
      const mood = this.V.moodOf(p.P.owner);
      const hostile = mood === 'terrified' || mood === 'wary';
      const near = X.live && d < (hostile ? 7 : 5) && p.state !== 'gone';
      const face = (x, z) => { p.yaw = Math.atan2(x - R.position.x, z - R.position.z); };
      // decide
      if (near && hostile && p.state !== 'flee' && p.state !== 'angry') {
        p.state = 'angry';
        p.t = p.P.kind === 'cat' ? 1.4 : 4;
        p.cool = 0;
        if (p.P.kind === 'cat') { this.V.sfx('cat_hiss', R.position, 0.9); g.ui?.tag(`pet:${p.P.id}`, 'HSSSSS!', p.tag, 1300); }
      } else if (near && !hostile && p.state !== 'friend' && p.cool <= 0) {
        p.state = 'friend';
        p.t = 5;
        this.V.sfx(p.P.kind === 'cat' ? 'purr' : 'bark', R.position, 0.5);
        g.effects?.hearts(R.position.x, R.position.y + 0.5, R.position.z, 2);
      }
      // act
      let speed = 0;
      if (p.state === 'sit') {
        if (p.t < 0) { p.state = 'wander'; const a = rand(0, 6.28), r = rand(0.4, 1.5); p.to = { x: p.home.x + Math.cos(a) * r, z: p.home.z + Math.sin(a) * r }; p.t = 5; }
      } else if (p.state === 'wander' || p.state === 'flee' || p.state === 'back') {
        const dx = p.to.x - R.position.x, dz = p.to.z - R.position.z, dd = hyp(dx, dz);
        speed = p.state === 'flee' ? 5 : p.state === 'back' ? 1.2 : 0.6;
        if (dd < 0.1 || p.t < 0) {
          if (p.state === 'flee') { p.state = 'gone'; p.t = rand(14, 22); }
          else { p.state = 'sit'; p.t = rand(4, 9); p.yaw = p.home.yaw; }
          speed = 0;
        } else {
          const s = Math.min(dd, speed * dt);
          R.position.x += (dx / dd) * s; R.position.z += (dz / dd) * s;
          face(p.to.x, p.to.z);
        }
      } else if (p.state === 'angry') {
        face(X.p.x, X.p.z);
        if (p.P.kind === 'dog' && p.cool <= 0) {
          p.cool = rand(1.1, 1.6);
          this.V.sfx('bark', R.position, 0.8);
          g.ui?.tag(`pet:${p.P.id}`, 'WOOF! WOOF!', p.tag, 900);
        }
        if (p.t < 0 || !near) {
          if (p.P.kind === 'cat') {
            // bolt away from Hank and under the porch
            const dx = R.position.x - X.p.x, dz = R.position.z - X.p.z, dd = hyp(dx, dz) || 1;
            p.to = { x: p.home.x + (dx / dd) * 5, z: p.home.z + (dz / dd) * 5 };
            p.state = 'flee';
            p.t = 3;
          } else { p.state = near ? 'angry' : 'back'; p.t = 4; p.to = p.home; }
        }
      } else if (p.state === 'friend') {
        // wind round his shins / bounce about
        const a = p.ph * 1.6;
        p.to = { x: X.p.x + Math.cos(a) * 0.7, z: X.p.z + Math.sin(a) * 0.7 };
        const dx = p.to.x - R.position.x, dz = p.to.z - R.position.z, dd = hyp(dx, dz);
        if (dd > 0.05) { const s = Math.min(dd, 2.2 * dt); R.position.x += (dx / dd) * s; R.position.z += (dz / dd) * s; face(p.to.x, p.to.z); speed = 1.5; }
        if (p.t < 0 || d > 9) { p.state = 'back'; p.to = p.home; p.t = 8; p.cool = 25; }
      } else if (p.state === 'gone' && p.t < 0) {
        R.position.set(p.home.x, R.position.y, p.home.z);
        p.state = 'sit'; p.t = 5; p.yaw = p.home.yaw;
      }
      // pose
      R.position.y = g.physics.groundAt(R.position.x, R.position.z, R.position.y + 1).h;
      R.rotation.y += Math.atan2(Math.sin(p.yaw - R.rotation.y), Math.cos(p.yaw - R.rotation.y)) * Math.min(1, dt * 10);
      const B = p.body;
      const arch = p.state === 'angry' && p.P.kind === 'cat' ? 1 : 0;
      B.scale.set(1 - arch * 0.12, 1 + arch * 0.25 + (speed ? 0 : Math.sin(p.ph * 2) * 0.015), 1 - arch * 0.1);
      B.position.y = speed ? Math.abs(Math.sin(p.ph * (speed > 3 ? 22 : 12))) * 0.04 : p.state === 'angry' && p.P.kind === 'dog' ? Math.abs(Math.sin(p.ph * 9)) * 0.06 : 0;
      B.rotation.z = p.state === 'friend' && p.P.kind === 'dog' ? Math.sin(p.ph * 14) * 0.12 : arch ? Math.sin(p.ph * 40) * 0.03 : 0;
      p.tag.set(R.position.x, R.position.y + 0.8, R.position.z);
    }
  }
}
