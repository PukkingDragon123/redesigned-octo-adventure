// Village pets: Agnes's cat Duchess on the front step and Gus's dog Biscuit by
// the cabin. While their people are scared of Hank, the cat arches up, hisses
// and bolts under the porch and the dog barks its head off; once the village
// warms to him, the cat comes to wind round his shins and the dog bounces about.
// Both are posed voxel puppets (voxel/models/animals.js) drawn by the wildlife
// (critters.js); this only decides where they go and what they're up to.
import * as THREE from 'three';
import { frontOf } from '../world/layout.js';

const hyp = Math.hypot;
const rand = (a, b) => a + Math.random() * (b - a);

const PETS = [
  { id: 'duchess', name: 'Duchess', kind: 'cat', owner: 'agnes', at: () => frontOf('agnes', 0.9, -2.6), yaw: Math.PI, species: 'duchess' },
  { id: 'biscuit', name: 'Biscuit', kind: 'dog', owner: 'gus', at: () => frontOf('gus', 1.8, -1.2), yaw: 0.25, species: 'biscuit' },
];

export class Pets {
  constructor(V) {
    this.V = V;
    this.g = V.game;
    this.list = PETS.map((P) => {
      // root carries the pet's place and heading for the logic; the puppet copies it
      const root = new THREE.Object3D();
      const h = P.at();
      root.position.set(h.x, this.g.physics.groundAt(h.x, h.z).h, h.z);
      root.rotation.y = P.yaw;
      const critter = this.g.critters?.add(P.species, h.x, h.z, { resident: true, despawn: Infinity, maxDraw: 90, cat: 'pet', yaw: P.yaw, anim: 'sit' }) || null;
      if (critter) critter.pet = P.id;
      return { P, root, critter, home: { x: h.x, z: h.z, yaw: P.yaw }, state: 'sit', t: rand(2, 6), to: null, yaw: P.yaw, ph: 0, cool: 0, tag: new THREE.Vector3() };
    });
  }
  update(dt, X) {
    const g = this.g;
    for (const p of this.list) {
      const R = p.root;
      const d = hyp(R.position.x - X.p.x, R.position.z - X.p.z);
      R.visible = d < 90 && p.state !== 'gone';
      if (p.critter) p.critter.hidden = !R.visible;
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
      const c = p.critter;
      if (c) {
        c.x = R.position.x; c.y = R.position.y; c.z = R.position.z; c.yaw = R.rotation.y;
        c.anim = p.state === 'angry' ? 'angry' : p.state === 'friend' ? 'friend' : p.state === 'sit' ? 'sit' : speed > 3 ? 'run' : 'walk';
      }
      p.tag.set(R.position.x, R.position.y + 0.8, R.position.z);
    }
  }
}
