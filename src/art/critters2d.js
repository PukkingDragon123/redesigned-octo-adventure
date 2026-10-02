// Hand-posed 2D wildlife sprites: deer, fawns, rabbits, foxes, squirrels,
// chipmunks, raccoons, songbirds, crows, geese, gulls, ducks, frogs, fish,
// butterflies, dragonflies, bats, owls and graveyard wisps. Each creature is
// sculpted from ellipsoids (sculpt2d.js), posed per animation frame and
// pixelled from up to five view angles into one sprite atlas.
//
// Frame names: `${kind}:${anim}:${view}:${i}`; views are 'side' (facing
// screen right), 'front3', 'front', 'back3', 'back' (see VIEWS). Each frame
// stores its pixels-per-metre in f.ppm so billboards size themselves.
import { Sculpt, ramp, renderSculpt, eye, dot, ik2, mixHex } from './sculpt2d.js';
import { Pix } from './pixel.js';

const TAU = Math.PI * 2;
const INK = 0x1e1418;

// camera elevation used when pixelling ground animals / flyers
export const VIEWS = {
  side: { yaw: 0 },
  front3: { yaw: -Math.PI / 4 },
  front: { yaw: -Math.PI / 2 },
  back3: { yaw: Math.PI / 4 },
  back: { yaw: Math.PI / 2 },
};
export const VIEW_ORDER = ['front', 'front3', 'side', 'back3', 'back'];

// ---------------------------------------------------------------- materials
const M = (hex, o = {}) => ({ ramp: o.ramp || ramp(hex, o), hi: o.hi ?? false, flat: o.flat ?? false, glow: o.glow ?? false, soft: o.soft ?? false, line: o.line });
const MATS = {
  // deer
  coat: M(0xa86c40, { ramp: [0x2a140e, 0x6c3e26, 0xa86c40, 0xcc905a, 0xe4b47c], hi: true }),
  coatDark: M(0x7a4a2c, { ramp: [0x22100c, 0x4e2c1c, 0x7a4a2c, 0x9a6240, 0xb07a52] }),
  fawn: M(0xbe6e36, { ramp: [0x2c120a, 0x7e3c1e, 0xbe6e36, 0xdc9050, 0xf0b070], hi: true }),
  white: M(0xece0cc, { ramp: [0x3a2c2a, 0xb4a490, 0xece0cc, 0xfaf2e2, 0xfffaf0] }),
  cream: M(0xe2c8a0, { ramp: [0x3a2618, 0xb0926a, 0xe2c8a0, 0xf2dcb8, 0xfaecd0] }),
  nose: M(0x2e2224, { ramp: [0x100a0c, 0x1c1416, 0x2e2224, 0x4a3a3c, 0x8a7a80], hi: true }),
  hoof: M(0x3a2a22, { ramp: [0x120a08, 0x22160f, 0x3a2a22, 0x54402f, 0x6a5440] }),
  ear: M(0xd89484, { ramp: [0x3a1a18, 0xa8645a, 0xd89484, 0xeab0a0, 0xf6c8b8] }),
  antler: M(0xd0bc92, { ramp: [0x3a2a18, 0x9a845e, 0xd0bc92, 0xe8dab4, 0xf6ecd0], hi: true }),
};

// a feet-at-origin sculpt with the shared material table
const sculpt = () => new Sculpt(MATS);

// ---------------------------------------------------------------- deer
// gait helpers: u = 0..1 leg phase. stance moves the foot back along the
// ground, swing lifts it forward.
function footPath(u, stride, lift, duty = 0.62) {
  u = ((u % 1) + 1) % 1;
  if (u < duty) {
    const k = u / duty;
    return [stride * (0.5 - k), 0];
  }
  const k = (u - duty) / (1 - duty);
  return [stride * (-0.5 + k), Math.sin(k * Math.PI) * lift];
}

// spec: proportions; pose: { gait, phase, head, tail, ears, look }
function deerSculpt(spec, pose) {
  const S = sculpt();
  const s = spec.size;
  const coat = spec.coat;
  const H = 0.84 * s; // body centre height
  let bob = 0, pitch = 0;
  const g = pose.gait;
  if (g === 'walk') bob = Math.sin(pose.phase * TAU * 2) * 0.012 * s;
  if (g === 'bound') {
    // airborne arc with the body rocking: gather -> leap -> land -> push
    const ph = pose.phase;
    bob = (Math.sin(ph * TAU) * 0.5 + 0.5) * 0.1 * s - 0.04 * s;
    pitch = Math.sin(ph * TAU + 0.6) * 0.16;
  }
  const B = [0, H + bob, 0];
  const rotB = [0, pitch, 0];
  const rot = (p) => {
    // rotate a body-local point by the body pitch around the body centre
    const c = Math.cos(pitch), si = Math.sin(pitch);
    return [B[0] + p[0] * c - p[1] * si, B[1] + p[0] * si + p[1] * c, p[2]];
  };
  // white belly underside / rump with spots for fawns
  const bodyMat = (h) => {
    if (h[1] < -0.55) return 'white';
    if (spec.spots) {
      const u = h[0] * 5.2, v = h[2] * 4.2 + (h[1] > 0 ? 0.5 : 0);
      if (h[1] > -0.05 && Math.abs(u - Math.round(u)) < 0.16 && Math.abs(v - Math.round(v)) < 0.18 && Math.abs(h[2]) > 0.18) return 'white';
    }
    return coat;
  };
  // barrel, chest, haunch
  S.ell(B, [0.46 * s, 0.23 * s, 0.215 * s], bodyMat, { rot: rotB, group: 1 });
  S.ell(rot([0.26 * s, 0.01 * s, 0]), [0.27 * s, 0.26 * s, 0.23 * s], bodyMat, { rot: rotB, group: 1 });
  S.ell(rot([-0.3 * s, 0.04 * s, 0]), [0.26 * s, 0.26 * s, 0.235 * s], (h) => (h[0] < -0.82 && h[1] < 0.25 && Math.abs(h[2]) < 0.5 ? 'white' : bodyMat(h)), { rot: rotB, group: 1 });
  // tail: down and brown, or flagged up showing white
  const tailUp = pose.tail ?? 0;
  const tb = rot([-0.52 * s, 0.14 * s, 0]);
  const tt = [tb[0] - 0.08 * s * (1 - tailUp) - 0.05 * s * tailUp, tb[1] - 0.14 * s * (1 - tailUp) + 0.16 * s * tailUp, 0];
  S.ell([(tb[0] + tt[0]) / 2, (tb[1] + tt[1]) / 2, 0], [0.07 * s, 0.11 * s, 0.06 * s], (h) => (tailUp > 0.5 ? (h[0] > 0.1 ? coat : 'white') : h[0] < -0.2 ? coat : 'white'), { rot: [0, Math.atan2(tt[1] - tb[1], tt[0] - tb[0]) - Math.PI / 2, 0] });
  // legs
  const legR = spec.legR * s;
  const shoulder = (side) => rot([0.3 * s, -0.08 * s, side * 0.1 * s]);
  const hip = (side) => rot([-0.32 * s, -0.04 * s, side * 0.1 * s]);
  const legs = [
    { front: true, side: -1, off: 0.25 },
    { front: true, side: 1, off: 0.75 },
    { front: false, side: -1, off: 0.0 },
    { front: false, side: 1, off: 0.5 },
  ];
  if (g === 'bound') { legs[0].off = 0.05; legs[1].off = 0.12; legs[2].off = 0.55; legs[3].off = 0.62; }
  for (const L of legs) {
    let fx = 0, fy = 0;
    if (g === 'walk') [fx, fy] = footPath(pose.phase + L.off, 0.34 * s, 0.1 * s);
    else if (g === 'bound') {
      // reach far forward / back; tuck when gathering
      const u = (pose.phase + L.off) % 1;
      fx = Math.cos(u * TAU) * 0.36 * s;
      fy = Math.max(0, Math.sin(u * TAU)) * 0.22 * s + 0.04 * s;
    } else if (pose.splay) fx = L.front ? 0.06 * s : -0.04 * s;
    const top = L.front ? shoulder(L.side) : hip(L.side);
    const foot = [top[0] + fx + (L.front ? 0.02 * s : 0.04 * s), fy, L.side * 0.09 * s];
    const near = L.side > 0;
    const legMat = near ? coat : spec.coatDark;
    if (L.front) {
      const knee = ik2(top, [foot[0], foot[1] + 0.05 * s, foot[2]], 0.36 * s, 0.38 * s, -1);
      S.tube([top, knee, [foot[0], foot[1] + 0.05 * s, foot[2]]], [legR * 1.25, legR * 0.8, legR * 0.7], legMat);
    } else {
      const hock = [foot[0] - 0.06 * s, foot[1] + 0.3 * s, foot[2]];
      const stifle = ik2(top, hock, 0.3 * s, 0.32 * s, 1);
      S.tube([top, stifle, hock, [foot[0], foot[1] + 0.05 * s, foot[2]]], [legR * 1.9, legR * 1.15, legR * 0.85, legR * 0.7], legMat);
    }
    S.ell([foot[0] + 0.012 * s, foot[1] + 0.03 * s, foot[2]], [0.04 * s, 0.035 * s, 0.03 * s], 'hoof');
  }
  // neck & head
  const headDown = pose.head === 'graze' ? 1 : 0;
  const alert = pose.head === 'alert' ? 1 : 0;
  const nb = rot([0.4 * s, 0.08 * s, 0]);
  const nt = headDown
    ? [nb[0] + 0.28 * s, 0.28 * s + (pose.chew ? 0.015 * s : 0), 0]
    : [nb[0] + (0.18 - alert * 0.04) * s, nb[1] + (0.32 + alert * 0.08) * s, 0];
  S.tube([nb, lerp(nb, nt, 0.5, [0.03 * s * (1 - headDown), 0]), nt], [0.13 * s, 0.1 * s, 0.085 * s], coat, { group: 2 });
  // white throat patch
  S.ell(lerp(nb, nt, 0.78, [0.06 * s * (1 - headDown), -0.02 * s]), [0.05 * s, 0.05 * s, 0.07 * s], 'white', { group: 2 });
  const look = pose.look ?? 0; // turn the head towards +z (towards the viewer in side view)
  const hp = headDown ? -1.25 : -0.38 + alert * 0.12;
  const hrot = [-look, hp, 0];
  const hc = [nt[0] + 0.08 * s * Math.cos(look), nt[1] + (headDown ? -0.04 : 0.02) * s, nt[2] + 0.08 * s * Math.sin(look)];
  const fwd = (d, up = 0, sd = 0) => {
    // point along the head's facing
    const c = Math.cos(hp), si = Math.sin(hp);
    const lx = d * c - up * si, ly = d * si + up * c;
    return [hc[0] + lx * Math.cos(look) - sd * Math.sin(look), hc[1] + ly, hc[2] + lx * Math.sin(look) + sd * Math.cos(look)];
  };
  S.ell(hc, [0.13 * s * spec.head, 0.095 * s * spec.head, 0.085 * s * spec.head], coat, { rot: hrot, group: 3 });
  S.ell(fwd(0.12 * s * spec.head, -0.015 * s), [0.085 * s * spec.head, 0.06 * s * spec.head, 0.06 * s * spec.head], (h) => (h[1] < -0.3 ? 'white' : coat), { rot: hrot, group: 3 });
  S.ell(fwd(0.2 * s * spec.head, -0.008 * s), [0.03 * s, 0.028 * s, 0.035 * s], 'nose', { rot: hrot, group: 3 });
  // eye ring + eye
  for (const sd of [-1, 1]) {
    S.decal(fwd(0.035 * s * spec.head, 0.03 * s, sd * 0.088 * s * spec.head), eye(spec.eye ?? 2, { ring: null }), { tol: 0.05 * s });
  }
  // ears: big leaf shapes
  const earUp = pose.ears ?? 0;
  for (const sd of [-1, 1]) {
    const eb = fwd(-0.05 * s, 0.06 * s, sd * 0.06 * s);
    const tilt = 0.6 - earUp * 0.4 + (pose.flick && sd > 0 ? 0.5 : 0);
    const ec = [eb[0] - 0.03 * s, eb[1] + 0.06 * s * spec.ear, eb[2] + sd * 0.07 * s * spec.ear];
    S.ell(ec, [0.035 * s * spec.ear, 0.09 * s * spec.ear, 0.045 * s * spec.ear], (h) => (h[2] * sd > 0.35 ? 'ear' : coat), { rot: [-look, 0.4, sd * tilt], group: 4 + (sd > 0 ? 1 : 0) });
  }
  if (spec.antlers) {
    for (const sd of [-1, 1]) {
      const a0 = fwd(0.0, 0.08 * s, sd * 0.04 * s);
      const a1 = [a0[0] - 0.08 * s, a0[1] + 0.12 * s, a0[2] + sd * 0.12 * s];
      const a2 = [a1[0] + 0.14 * s, a1[1] + 0.1 * s, a1[2] + sd * 0.04 * s];
      S.tube([a0, a1, a2], [0.02 * s, 0.018 * s, 0.012 * s], 'antler');
      for (let k = 1; k <= 2; k++) {
        const b = lerp(a1, a2, k / 2.6, [0, 0]);
        S.tube([b, [b[0] + 0.01 * s, b[1] + 0.09 * s, b[2]]], [0.014 * s, 0.01 * s], 'antler');
      }
    }
  }
  return S;
}
function lerp(a, b, t, off = [0, 0]) {
  return [a[0] + (b[0] - a[0]) * t + off[0], a[1] + (b[1] - a[1]) * t + off[1], a[2] + (b[2] - a[2]) * t];
}

const DOE = { size: 1, coat: 'coat', coatDark: 'coatDark', legR: 0.05, head: 1.15, ear: 1.15 };
const FAWN = { size: 0.62, coat: 'fawn', coatDark: 'coatDark', legR: 0.055, head: 1.3, ear: 1.25, spots: true, eye: 2 };
const BUCK = { size: 1.08, coat: 'coat', coatDark: 'coatDark', legR: 0.052, head: 1.1, ear: 1, antlers: true };

// ---------------------------------------------------------------- catalogue
// kind -> { ppm, pitch, anims: { anim: { n, views, pose(i, n) -> Sculpt } } }
const ALL5 = ['side', 'front3', 'front', 'back3', 'back'];
function deerKind(spec, ppm) {
  return {
    ppm, pitch: 0.28,
    anims: {
      idle: { n: 2, views: ALL5, pose: (i) => deerSculpt(spec, { gait: 'stand', head: 'idle', ears: 0.3, flick: i === 1, tail: 0 }) },
      alert: { n: 1, views: ALL5, pose: () => deerSculpt(spec, { gait: 'stand', head: 'alert', ears: 1, tail: 0.6, look: 0.7, splay: true }) },
      graze: { n: 2, views: ALL5, pose: (i) => deerSculpt(spec, { gait: 'stand', head: 'graze', chew: i === 1, ears: 0.2, tail: 0, splay: true }) },
      walk: { n: 4, views: ALL5, pose: (i, n) => deerSculpt(spec, { gait: 'walk', phase: i / n, head: 'idle', ears: 0.4, tail: 0 }) },
      run: { n: 4, views: ALL5, pose: (i, n) => deerSculpt(spec, { gait: 'bound', phase: i / n, head: 'alert', ears: 1, tail: 1 }) },
    },
  };
}
export const CRITTERS = {
  deer: deerKind(DOE, 48),
  fawn: deerKind(FAWN, 56),
  buck: deerKind(BUCK, 48),
};

// ---------------------------------------------------------------- atlas painting
// paints every frame into atlas (a SpriteAtlas); returns ms
export function paintCritters(atlas, kinds = Object.keys(CRITTERS)) {
  const t0 = performance.now();
  for (const kind of kinds) {
    const K = CRITTERS[kind];
    for (const [anim, A] of Object.entries(K.anims)) {
      for (let i = 0; i < A.n; i++) {
        const S = A.pose(i, A.n);
        for (const view of A.views) {
          const v = VIEWS[view];
          const r = renderSculpt(S, { yaw: v.yaw, pitch: A.pitch ?? K.pitch }, A.ppm ?? K.ppm, { contour: K.contour });
          const f = atlas.add(`${kind}:${anim}:${view}:${i}`, r.w, r.h, (pix, x, y) => blitFrame(pix, x, y, r), r.ax, r.ay);
          f.ppm = r.ppm;
        }
      }
    }
  }
  return performance.now() - t0;
}
function blitFrame(pix, x, y, r) {
  const d = pix.data;
  for (let j = 0; j < r.h; j++) for (let i = 0; i < r.w; i++) {
    const k = (j * r.w + i) * 4;
    if (!r.rgba[k + 3]) continue;
    const o = ((y + j) * pix.w + (x + i)) * 4;
    d[o] = r.rgba[k]; d[o + 1] = r.rgba[k + 1]; d[o + 2] = r.rgba[k + 2];
    d[o + 3] = r.glow[j * r.w + i] ? 160 : 255; // alpha 160 = glowing pixel
  }
}

export { Pix, mixHex, INK, dot };
