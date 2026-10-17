// Hank's own bony hands for the first-person views (the book, the compass): real
// bone shapes (each one a turned profile, thick at the knuckles and narrow along the
// shaft), five metacarpals, fourteen phalanges, a cluster of wrist bones, the radius
// and the ulna, and the cuff of his cream knitted sweater with its teal and red bands.
// Every finger joint is its own group, so a pose is just a set of joint angles.
//
// Local frame (a right hand): the wrist at the origin, the fingers along +Y, the palm
// facing +Z, the thumb out to +X. A left hand is the same hand mirrored.
import * as THREE from 'three';

export const BONE_MAT = new THREE.MeshStandardMaterial({ color: 0xece0c2, roughness: 0.58, metalness: 0 });
const BONE_D = new THREE.MeshStandardMaterial({ color: 0xd6c6a0, roughness: 0.66, metalness: 0 });

// a bone: a lathe profile with bulging ends (condyles) and a waisted shaft
const GEO = new Map();
function boneGeo(r, len, tip = false) {
  const k = `${r.toFixed(4)}|${len.toFixed(4)}|${tip}`;
  if (GEO.has(k)) return GEO.get(k);
  const pts = [];
  const n = 12;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    // ends swell (the far end of a fingertip tapers to a rounded tuft instead)
    const a = Math.exp(-((t / 0.16) ** 2)), b = Math.exp(-(((1 - t) / 0.16) ** 2));
    let w = r * (0.74 + 0.42 * a + (tip ? 0.18 : 0.42) * b);
    if (i === 0 || i === n) w *= 0.55;
    pts.push(new THREE.Vector2(w, t * len));
  }
  // round the caps
  pts.unshift(new THREE.Vector2(0.0001, -r * 0.35));
  pts.push(new THREE.Vector2(0.0001, len + r * (tip ? 0.5 : 0.35)));
  const g = new THREE.LatheGeometry(pts, 10);
  g.computeVertexNormals();
  GEO.set(k, g);
  return g;
}
const SPH = new THREE.SphereGeometry(1, 10, 8);

// the sweater cuff: cream knit with a teal band and a red stripe
let KNIT = null;
function knitTexture() {
  if (KNIT) return KNIT;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 128;
  const g = c.getContext('2d');
  for (let y = 0; y < 128; y++) {
    const band = y >= 18 && y < 30 ? '#2f6e6a' : y >= 36 && y < 42 ? '#c8361f' : null;
    for (let x = 0; x < 64; x += 4) {
      // little V stitches
      const base = band || ((x / 4 + Math.floor(y / 4)) % 2 ? '#e6d8b8' : '#dccaa4');
      g.fillStyle = base;
      g.fillRect(x, y, 4, 1);
      if (y % 4 === 3) { g.fillStyle = 'rgba(80,60,40,0.18)'; g.fillRect(x + 1, y, 2, 1); }
    }
  }
  KNIT = new THREE.CanvasTexture(c);
  KNIT.colorSpace = THREE.SRGBColorSpace;
  KNIT.wrapS = KNIT.wrapT = THREE.RepeatWrapping;
  KNIT.repeat.set(3, 1);
  return KNIT;
}

// finger layout: base x on the carpals, fan angle, metacarpal length, phalanx lengths, radius
const FINGERS = [
  { x: 0.021, fan: -0.13, mc: 0.066, ph: [0.041, 0.025, 0.019], r: 0.0056 }, // index
  { x: 0.007, fan: -0.03, mc: 0.064, ph: [0.046, 0.029, 0.02], r: 0.0058 }, // middle
  { x: -0.008, fan: 0.06, mc: 0.059, ph: [0.043, 0.027, 0.019], r: 0.0054 }, // ring
  { x: -0.021, fan: 0.16, mc: 0.054, ph: [0.034, 0.02, 0.017], r: 0.005 }, // pinky
];

export class BonyHand {
  constructor({ left = false, cuff = true } = {}) {
    this.root = new THREE.Group();
    // a left hand is the right one mirrored (the renderer flips the winding for us)
    this.flip = new THREE.Group();
    if (left) this.flip.scale.x = -1;
    this.root.add(this.flip);
    const H = (this.hand = new THREE.Group());
    this.flip.add(H);
    const mesh = (geo, mat = BONE_MAT) => {
      const m = new THREE.Mesh(geo, mat);
      return m;
    };
    // the wrist bones: two rows of little pebbles
    const carp = [[-0.016, 0.006, 0.0062], [-0.005, 0.005, 0.0068], [0.007, 0.005, 0.0066], [0.018, 0.007, 0.0058],
      [-0.019, 0.018, 0.0058], [-0.007, 0.019, 0.0064], [0.006, 0.019, 0.0066], [0.019, 0.02, 0.006]];
    carp.forEach(([x, y, r], i) => {
      const m = mesh(SPH, i % 2 ? BONE_D : BONE_MAT);
      m.position.set(x, y, (i % 3) * 0.0015);
      m.scale.set(r * 1.15, r, r * 0.9);
      H.add(m);
    });
    // fingers
    this.fingers = FINGERS.map((f) => {
      const base = new THREE.Group();
      base.position.set(f.x, 0.024, 0);
      base.rotation.z = f.fan;
      H.add(base);
      base.add(mesh(boneGeo(f.r * 1.02, f.mc)));
      const joints = [];
      let parent = base, len = f.mc;
      f.ph.forEach((L, k) => {
        const j = new THREE.Group();
        j.position.y = len + f.r * 0.25;
        parent.add(j);
        j.add(mesh(boneGeo(f.r * (1 - k * 0.14), L, k === 2)));
        joints.push(j);
        parent = j;
        len = L;
      });
      return { base, joints };
    });
    // the thumb: a metacarpal swung out and turned to face the fingers, then two phalanges
    const tb = new THREE.Group();
    tb.position.set(0.021, 0.017, 0.006);
    tb.rotation.set(0.3, -0.5, -0.55);
    H.add(tb);
    tb.add(mesh(boneGeo(0.0062, 0.042)));
    const t1 = new THREE.Group();
    t1.position.y = 0.044;
    tb.add(t1);
    t1.add(mesh(boneGeo(0.0058, 0.031)));
    const t2 = new THREE.Group();
    t2.position.y = 0.032;
    t1.add(t2);
    t2.add(mesh(boneGeo(0.0052, 0.024, true)));
    this.thumb = { base: tb, joints: [t1, t2] };
    // the forearm: radius and ulna running back from the wrist, in a group of its own
    // so the wrist can bend
    const fa = (this.forearm = new THREE.Group());
    H.add(fa);
    const rad = mesh(boneGeo(0.0075, 0.24));
    rad.rotation.z = Math.PI;
    rad.position.set(0.011, -0.004, 0);
    fa.add(rad);
    const uln = mesh(boneGeo(0.0068, 0.25), BONE_D);
    uln.rotation.z = Math.PI;
    uln.position.set(-0.012, -0.002, -0.002);
    fa.add(uln);
    if (cuff) {
      const knit = new THREE.MeshStandardMaterial({ map: knitTexture(), roughness: 0.95, side: THREE.DoubleSide });
      const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.042, 0.26, 18, 1, true), knit);
      sleeve.position.y = -0.21;
      fa.add(sleeve);
      // the rolled-back cuff
      const roll = new THREE.Mesh(new THREE.TorusGeometry(0.036, 0.0075, 8, 20), knit);
      roll.rotation.x = Math.PI / 2;
      roll.position.y = -0.082;
      fa.add(roll);
    }
    this.pose({});
  }

  // curl: per finger [base, mid, tip] angles (radians, + bends towards the palm);
  // spread: extra fan; thumb: [base rx, ry, rz, j1, j2]; wrist: [rx, rz] for the forearm
  pose({ curl = [0.15, 0.2, 0.2, 0.25], spread = 0, thumb = null, wrist = null } = {}) {
    this.fingers.forEach((f, i) => {
      const c = Array.isArray(curl[i]) ? curl[i] : [curl[i], curl[i] * 1.1, curl[i] * 0.8];
      f.joints.forEach((j, k) => (j.rotation.x = c[k] || 0));
      f.base.rotation.z = FINGERS[i].fan * (1 + spread);
    });
    if (thumb) {
      const t = this.thumb;
      t.base.rotation.set(thumb[0], thumb[1], thumb[2]);
      t.joints[0].rotation.x = thumb[3] || 0;
      t.joints[1].rotation.x = thumb[4] || 0;
    }
    if (wrist) {
      this.forearm.rotation.x = wrist[0] || 0;
      this.forearm.rotation.z = wrist[1] || 0;
    }
    return this;
  }
}
