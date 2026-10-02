// Hand-posed 2D wildlife sprites: deer, fawns, rabbits, foxes, squirrels,
// chipmunks, raccoons, songbirds, crows, geese, gulls, ducks, frogs, fish,
// butterflies, dragonflies, bats, owls and graveyard wisps. Each creature is
// sculpted from ellipsoids (sculpt2d.js), posed per animation frame and
// pixelled from up to five view angles into one sprite atlas.
//
// Frame names: `${kind}:${anim}:${view}:${i}`; views are 'side' (facing
// screen right), 'front3', 'front', 'back3', 'back' (see VIEWS). Each frame
// stores its pixels-per-metre in f.ppm so billboards size themselves.
import { Sculpt, ramp, renderSculpt, eye, dot, ik2, mixHex, rotX, rotY, mat3mul, mat3vec } from './sculpt2d.js';
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
  // small mammals
  bunny: M(0x8e7058, { ramp: [0x241812, 0x5e4636, 0x8e7058, 0xae9070, 0xc8ac8a], hi: true }),
  bunnyDark: M(0x6a5240, { ramp: [0x1e140e, 0x46342a, 0x6a5240, 0x846a54, 0x9a8068] }),
  pink: M(0xe8a0a0, { ramp: [0x4a1a22, 0xc07078, 0xe8a0a0, 0xf6c0bc, 0xffd8d0] }),
  fox: M(0xd8662a, { ramp: [0x2e100a, 0x9a3a18, 0xd8662a, 0xf08c40, 0xfab060], hi: true }),
  foxDark: M(0xa84a20, { ramp: [0x260c08, 0x742c14, 0xa84a20, 0xc86230, 0xd87a40] }),
  sock: M(0x2e2222, { ramp: [0x0e0a0a, 0x1e1616, 0x2e2222, 0x463636, 0x5a4a48] }),
  squirrel: M(0xb85a2a, { ramp: [0x2a0e08, 0x7e3618, 0xb85a2a, 0xd47a3e, 0xe89a58], hi: true }),
  chip: M(0xa8744a, { ramp: [0x26140c, 0x6e4628, 0xa8744a, 0xc89464, 0xdcb07e], hi: true }),
  stripe: M(0x3a2620, { ramp: [0x120a08, 0x2a1a16, 0x3a2620, 0x52382e, 0x6a4a3c] }),
  coon: M(0x8a8482, { ramp: [0x1e1a1e, 0x5a5458, 0x8a8482, 0xaaa49e, 0xc4beb6], hi: true }),
  coonDark: M(0x4a4446, { ramp: [0x121012, 0x2e2a2c, 0x4a4446, 0x625c5c, 0x7a7472] }),
  mask: M(0x262024, { ramp: [0x0c0a0c, 0x1a1618, 0x262024, 0x3a3236, 0x524a4c] }),
  // birds
  robinBack: M(0x6e5e54, { ramp: [0x1e1614, 0x4a3e38, 0x6e5e54, 0x8a7a6c, 0xa29282] }),
  robinBreast: M(0xe0682a, { ramp: [0x3a120a, 0xa83e1a, 0xe0682a, 0xf28a44, 0xfaa860], hi: true }),
  birdHead: M(0x342e32, { ramp: [0x0e0a0e, 0x221e22, 0x342e32, 0x4a4248, 0x625a60], hi: true }),
  beak: M(0xe8b030, { ramp: [0x3a2408, 0xb07a18, 0xe8b030, 0xf6cc58, 0xffe080] }),
  beakDark: M(0x2e2a2c, { ramp: [0x0e0c0c, 0x1c1a1a, 0x2e2a2c, 0x46403e, 0x5e5654] }),
  grey: M(0x8e8e94, { ramp: [0x1e1e26, 0x5e5e68, 0x8e8e94, 0xaeaeb2, 0xc8c8ca] }),
  cream2: M(0xe8dcc4, { ramp: [0x3a3026, 0xbcac90, 0xe8dcc4, 0xf6ecd8, 0xfff8ec] }),
  black: M(0x2a262e, { ramp: [0x0c0a10, 0x1a1820, 0x2a262e, 0x3e3a48, 0x5a5670], hi: true }),
  jay: M(0x4a7ad0, { ramp: [0x101a3a, 0x2e4c96, 0x4a7ad0, 0x6e9ae4, 0x9ac0f2], hi: true }),
  jayDark: M(0x2e4c96, { ramp: [0x0a1028, 0x1e3068, 0x2e4c96, 0x4266b0, 0x5a80c8] }),
  sparrow: M(0x8a6440, { ramp: [0x22160c, 0x5c3e24, 0x8a6440, 0xa8825a, 0xc09e74], hi: true }),
  rufous: M(0x9a4a2a, { ramp: [0x2a0e08, 0x6a2c16, 0x9a4a2a, 0xb4663e, 0xc88050] }),
  crow: M(0x2a2832, { ramp: [0x0a0a10, 0x1a1a22, 0x2a2832, 0x3e4058, 0x5a6488], hi: true }),
  goose: M(0x8a7660, { ramp: [0x221a14, 0x5e4e3e, 0x8a7660, 0xa8947c, 0xc0ae96] }),
  gooseDark: M(0x5e4e40, { ramp: [0x16100c, 0x3e3228, 0x5e4e40, 0x766452, 0x8c7a66] }),
  white2: M(0xf0f0ec, { ramp: [0x2e3440, 0xbcc4cc, 0xf0f0ec, 0xfafaf6, 0xffffff] }),
  gullWing: M(0xa8b2bc, { ramp: [0x1e2430, 0x76808e, 0xa8b2bc, 0xc4ccd4, 0xdce2e8] }),
  orange: M(0xf08a28, { ramp: [0x3a1a06, 0xb05a14, 0xf08a28, 0xf8aa48, 0xffc870] }),
  drake: M(0x1e7a46, { ramp: [0x06180e, 0x125232, 0x1e7a46, 0x2e9a5a, 0x5ac888], hi: true }),
  chestnut: M(0x7a3a2a, { ramp: [0x1e0c08, 0x52221a, 0x7a3a2a, 0x96503a, 0xaa6448] }),
  duckGrey: M(0xa49c94, { ramp: [0x26221e, 0x726a62, 0xa49c94, 0xbcb4ac, 0xd0c8c0] }),
  hen: M(0x9a7248, { ramp: [0x241608, 0x684a2c, 0x9a7248, 0xb48e60, 0xc8a878] }),
  speculum: M(0x3a5ac8, { ramp: [0x0a1238, 0x243a8a, 0x3a5ac8, 0x5a7ae0, 0x8aa0f0], hi: true }),
  // water & bugs
  frog: M(0x5a9a3a, { ramp: [0x0e200a, 0x346a22, 0x5a9a3a, 0x7cba50, 0xa6d878], hi: true }),
  frogDark: M(0x2e5a24, { ramp: [0x081408, 0x1c3a16, 0x2e5a24, 0x407230, 0x528a3e] }),
  frogBelly: M(0xe8e0a0, { ramp: [0x2e2a10, 0xb4ac6a, 0xe8e0a0, 0xf6f0c0, 0xfffadc] }),
  trout: M(0xc8a090, { ramp: [0x2a1a1e, 0x8a6a66, 0xc8a090, 0xe2c0b0, 0xf6e0d4], hi: true }),
  troutBack: M(0x5a7066, { ramp: [0x0e1614, 0x3a4c46, 0x5a7066, 0x768e80, 0x92aa9a], hi: true }),
  troutRed: M(0xd85a5a, { ramp: [0x3a1018, 0xa03a40, 0xd85a5a, 0xec7a72, 0xf89a8a] }),
  monarch: M(0xee8a22, { ramp: [0x3a1606, 0xc0601a, 0xee8a22, 0xf8a840, 0xffc260] }),
  sulphur: M(0xf2d850, { ramp: [0x3a3008, 0xc8a82a, 0xf2d850, 0xfae878, 0xfff6a8] }),
  dragon: M(0x2a9ab8, { ramp: [0x081e2a, 0x1a6a86, 0x2a9ab8, 0x48bcd4, 0x7ae0ec], hi: true }),
  wingGlass: M(0xd8ecf2, { ramp: [0x5a7a8a, 0xa8c8d4, 0xd8ecf2, 0xeef8fa, 0xffffff], soft: true }),
  bat: M(0x4a3a40, { ramp: [0x0e080c, 0x2a1e24, 0x4a3a40, 0x625058, 0x7a666e] }),
  batWing: M(0x3a2c36, { ramp: [0x0a060a, 0x22181e, 0x3a2c36, 0x504048, 0x64525a], soft: true }),
  owl: M(0x8a6a4a, { ramp: [0x1e140c, 0x5a4230, 0x8a6a4a, 0xa88660, 0xc0a07a], hi: true }),
  owlDark: M(0x5a4232, { ramp: [0x140c08, 0x3a2a1e, 0x5a4232, 0x705440, 0x86664e] }),
  owlFace: M(0xc8843e, { ramp: [0x2e1608, 0x925a24, 0xc8843e, 0xdea05a, 0xecba78] }),
  ghost: M(0xd8fff2, { ramp: [0x3a6a7a, 0x9ad8d0, 0xd8fff2, 0xf0fffa, 0xffffff], glow: true, soft: true }),
  ghostBlue: M(0xa8e0ff, { ramp: [0x2a4a8a, 0x6aa8e0, 0xa8e0ff, 0xd0f0ff, 0xf0faff], glow: true, soft: true }),
  ripple: M(0xd8eef4, { ramp: [0x5a8a9a, 0xa8d0dc, 0xd8eef4, 0xeef8fa, 0xffffff], flat: true }),
  can: M(0x6e7a74, { ramp: [0x161c1c, 0x46504c, 0x6e7a74, 0x8e9a92, 0xb0bab2], hi: true }),
  canDark: M(0x4e5854, { ramp: [0x0e1212, 0x343c3a, 0x4e5854, 0x64706a, 0x7a8680] }),
  peel: M(0xe8c840, { ramp: [0x3a2e08, 0xb09424, 0xe8c840, 0xf6e070, 0xfff0a0] }),
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

// ---------------------------------------------------------------- shared rig helpers
// rotate a point about a pivot in the x/y plane (pitch: +a raises +x)
function pivot(c, a) {
  const co = Math.cos(a), si = Math.sin(a);
  return (p) => [c[0] + p[0] * co - p[1] * si, c[1] + p[0] * si + p[1] * co, c[2] + p[2]];
}
// a two-bone leg from top to foot; mat may be fn(u) along the leg
function leg2(S, top, foot, l1, l2, bend, r0, r1, r2, mat) {
  const knee = ik2(top, foot, l1, l2, bend);
  S.tube([top, knee, foot], [r0, r1, r2], typeof mat === 'function' ? (h, p, u) => mat(u) : mat);
  return knee;
}
const flapAngles = [1.0, 0.35, -0.55, -0.1];

// ---------------------------------------------------------------- rabbit
function rabbitSculpt(pose) {
  const S = sculpt();
  const g = pose.gait, i = pose.i ?? 0;
  let pitch = 0.32, by = 0.12, hx = 0.13, hy = 0.215, earBack = 0.25, fp = [0.1, 0], hp = [-0.03, 0], hpitch = 0, stretch = 1;
  if (g === 'alert') { pitch = 1.05; by = 0.15; hx = 0.06; hy = 0.31; earBack = -0.05; fp = [0.09, 0.12]; }
  if (g === 'nibble') { pitch = 0.08; by = 0.11; hx = 0.18; hy = 0.1 + (i ? 0.008 : 0); earBack = 0.7; fp = [0.12, 0]; }
  if (g === 'hop') {
    [pitch, by, hx, hy, earBack, fp, hp, hpitch, stretch] = [
      [0.12, 0.1, 0.13, 0.18, 0.55, [0.09, 0], [-0.02, 0], 0, 0.95],
      [0.5, 0.15, 0.14, 0.25, 0.75, [0.19, 0.09], [-0.2, 0.02], -0.8, 1.12],
      [0.0, 0.15, 0.18, 0.2, 0.9, [0.22, 0.06], [-0.22, 0.09], -0.4, 1.15],
      [-0.3, 0.12, 0.17, 0.16, 0.6, [0.16, 0.0], [0.02, 0.1], 0.3, 1.0],
    ][i];
  }
  const B = [0, by, 0];
  const R = pivot(B, pitch);
  const coat = (h) => (h[1] < -0.55 ? 'white' : 'bunny');
  S.ell(B, [0.13 * stretch, 0.1, 0.095], coat, { rot: [0, pitch, 0], group: 1 });
  S.ell(R([-0.06, -0.015, 0]), [0.1, 0.095, 0.1], coat, { group: 1 });
  S.ell(R([0.07, 0.01, 0]), [0.075, 0.08, 0.075], coat, { group: 1 });
  S.ell(R([-0.15, 0.03, 0]), 0.042, 'white', { group: 1 });
  // legs
  for (const sd of [-1, 1]) {
    const sh = R([0.07, -0.05, sd * 0.035]);
    S.tube([sh, [fp[0], fp[1] + 0.012, sd * 0.035]], [0.022, 0.017], sd > 0 ? 'bunny' : 'bunnyDark');
    S.ell([fp[0] + 0.01, fp[1] + 0.01, sd * 0.035], [0.022, 0.012, 0.014], sd > 0 ? 'bunny' : 'bunnyDark');
    const heel = [hp[0], hp[1] + 0.02, sd * 0.055];
    S.ell([heel[0] + 0.035 * Math.cos(hpitch), heel[1] + 0.035 * Math.sin(hpitch), heel[2]], [0.065, 0.022, 0.026], sd > 0 ? 'bunny' : 'bunnyDark', { rot: [0, hpitch, 0] });
  }
  // head
  const H = [hx, hy, 0];
  S.ell(H, [0.07, 0.062, 0.058], (h) => (h[1] < -0.45 && h[0] > -0.1 ? 'cream' : 'bunny'), { rot: [0, -0.1, 0], group: 2 });
  S.ell([hx + 0.045, hy - 0.022, 0], [0.04, 0.035, 0.042], (h) => (h[1] < 0 ? 'white' : 'cream'), { group: 2 });
  S.decal([hx + 0.086, hy - 0.012, 0], (put, x, y) => { put(x, y, 0xd87080); put(x, y + 1, 0x8a3a48); }, { tol: 0.03 });
  for (const sd of [-1, 1]) {
    S.decal([hx + 0.03, hy + 0.015, sd * 0.05], eye(2), { tol: 0.03 });
    // long ears
    const eb = [hx - 0.02, hy + 0.05, sd * 0.025];
    const a = earBack * 1.15;
    const ec = [eb[0] - Math.sin(a) * 0.075, eb[1] + Math.cos(a) * 0.075, sd * 0.032];
    S.ell(ec, [0.016, 0.085, 0.026], (h) => (h[0] > 0.35 && Math.abs(h[1]) < 0.85 ? 'pink' : 'bunny'), { rot: [0, a, sd * 0.12], group: 3 + (sd > 0 ? 1 : 0) });
  }
  return S;
}

// ---------------------------------------------------------------- generic four-legged body (fox, raccoon)
// q: { H, len, bh, bw, chestX, hindX, legs:[fl1, fl2, hl1, hl2, hl3], legR, coat, far, sock(u) }
function quadBody(S, q, pose) {
  const g = pose.gait, ph = pose.phase ?? 0;
  let bob = 0, pitch = q.pitch ?? 0;
  if (g === 'walk') bob = Math.sin(ph * TAU * 2) * 0.008;
  if (g === 'run') { bob = (Math.sin(ph * TAU) * 0.5 + 0.5) * 0.05; pitch += Math.sin(ph * TAU + 0.6) * 0.14; }
  if (pose.pitch !== undefined) pitch = pose.pitch;
  const B = [0, q.H + bob + (pose.lift ?? 0), 0];
  const R = pivot(B, pitch);
  const coat = q.bodyMat || q.coat;
  S.ell(B, [q.len, q.bh, q.bw], coat, { rot: [0, pitch, 0], group: 1 });
  S.ell(R([q.chestX, 0.01, 0]), [q.len * 0.55, q.bh * 1.15, q.bw * 1.05], coat, { rot: [0, pitch, 0], group: 1 });
  S.ell(R([q.hindX, 0.015, 0]), [q.len * 0.52, q.bh * 1.1, q.bw * 1.05], coat, { rot: [0, pitch, 0], group: 1 });
  const [fl1, fl2, hl1, hl2, hl3] = q.legs;
  const legs = g === 'run' ? [[1, -1, 0.05], [1, 1, 0.12], [0, -1, 0.55], [0, 1, 0.62]] : [[1, -1, 0], [1, 1, 0.5], [0, -1, 0.5], [0, 1, 0]];
  for (const [front, sd, off] of legs) {
    let fx = 0, fy = 0;
    if (g === 'walk') [fx, fy] = footPath(ph + off, q.stride, q.stride * 0.3, 0.55);
    else if (g === 'run') { const u = (ph + off) % 1; fx = Math.cos(u * TAU) * q.stride * 1.2; fy = Math.max(0, Math.sin(u * TAU)) * q.stride * 0.6 + 0.01; }
    if (pose.feet) [fx, fy] = pose.feet(front, sd, fx, fy);
    const top = R([front ? q.chestX + 0.01 : q.hindX - 0.01, -q.bh * 0.5, sd * q.bw * 0.55]);
    const near = sd > 0;
    const mat = (u) => (q.sock && u > q.sock ? 'sock' : near ? q.coat : q.far);
    const foot = [top[0] + fx + (front ? 0.01 : 0.02), fy + q.legR * 0.8, sd * q.bw * 0.5];
    if (front && !pose.tuckFront) leg2(S, top, foot, fl1, fl2, -1, q.legR * 1.3, q.legR, q.legR * 0.85, mat);
    else if (front) leg2(S, top, [top[0] + 0.06, top[1] - 0.06, foot[2]], fl1, fl2, 1, q.legR * 1.3, q.legR, q.legR * 0.85, mat);
    else {
      const hock = [foot[0] - hl3 * 0.35, foot[1] + hl3 * 0.9, foot[2]];
      const st = ik2(top, hock, hl1, hl2, 1);
      S.tube([top, st, hock, foot], [q.legR * 1.8, q.legR * 1.1, q.legR * 0.9, q.legR * 0.8], (h, p, u) => mat(u));
    }
    S.ell([foot[0] + q.legR * 0.4, foot[1] - q.legR * 0.3, foot[2]], [q.legR * 1.25, q.legR * 0.8, q.legR], q.paw || 'sock');
  }
  return { B, R, pitch };
}

// ---------------------------------------------------------------- fox
function foxSculpt(pose) {
  const S = sculpt();
  const q = {
    H: 0.3, len: 0.21, bh: 0.095, bw: 0.09, chestX: 0.15, hindX: -0.15, legs: [0.13, 0.14, 0.12, 0.12, 0.1], legR: 0.026,
    coat: 'fox', far: 'foxDark', sock: 0.45, stride: 0.2,
    bodyMat: (h) => (h[1] < -0.5 && h[0] > -0.2 ? 'white' : 'fox'),
  };
  let headLift = 0, tailUp = pose.tailUp ?? 0.1, look = pose.look ?? 0, hp = -0.15;
  if (pose.gait === 'sit') {
    pose.pitch = 0.75; pose.lift = -0.05;
    pose.feet = (front, sd) => (front ? [0.04, 0] : [0.12, 0]);
    headLift = 0.06; tailUp = -0.4;
  }
  if (pose.gait === 'pounce') {
    if (pose.i === 0) { pose.pitch = 0.7; pose.lift = 0.06; pose.tuckFront = true; pose.feet = (front, sd) => (front ? [0, 0] : [-0.1, 0]); tailUp = 0.6; hp = 0.1; }
    else { pose.pitch = -0.85; pose.lift = 0.02; pose.feet = (front, sd) => (front ? [0.12, 0] : [-0.22, 0.2]); tailUp = 1.0; hp = -0.9; }
  }
  if (pose.gait === 'run') tailUp = 0.25;
  const { R } = quadBody(S, q, pose);
  // neck and head
  const nb = R([0.2, 0.04, 0]);
  const hd = pose.gait === 'pounce' && pose.i === 1 ? R([0.36, -0.03, 0]) : R([0.27, 0.12 + headLift, 0]);
  const hc = pose.gait === 'pounce' ? hd : [hd[0], Math.max(hd[1], 0.38 + headLift), 0];
  S.tube([nb, hc], [0.075, 0.055], (h) => (h[1] < -0.3 ? 'white' : 'fox'), { group: 2 });
  foxHead(S, hc, hp, look);
  // big bushy tail with a white tip
  const tb = R([-0.24, 0.04, 0]);
  const a = -0.5 + tailUp * 0.9;
  const t1 = [tb[0] - 0.14 * Math.cos(a), tb[1] + 0.14 * Math.sin(a), 0];
  const t2 = [t1[0] - 0.15 * Math.cos(a - 0.2), t1[1] + 0.15 * Math.sin(a - 0.2), 0];
  S.tube([tb, t1, t2], [0.035, 0.075, 0.062], (h, p, u) => (u > 0.88 ? 'white' : 'fox'), { group: 6 });
  return S;
}
function foxHead(S, c, hp, look) {
  const F = (d, up = 0, sd = 0) => {
    const co = Math.cos(hp), si = Math.sin(hp);
    const lx = d * co - up * si, ly = d * si + up * co;
    return [c[0] + lx * Math.cos(look) - sd * Math.sin(look), c[1] + ly, c[2] + lx * Math.sin(look) + sd * Math.cos(look)];
  };
  S.ell(c, [0.085, 0.072, 0.078], (h) => (h[1] < -0.3 && h[0] > -0.3 ? 'white' : 'fox'), { rot: [-look, hp, 0], group: 3 });
  S.tube([F(0.05, -0.012), F(0.15, -0.03)], [0.045, 0.017], (h) => (h[1] < -0.25 ? 'white' : 'fox'), { group: 3 });
  S.ell(F(0.155, -0.03), 0.019, 'nose', { group: 3 });
  for (const sd of [-1, 1]) {
    S.decal(F(0.055, 0.03, sd * 0.052), eye(2), { tol: 0.03 });
    S.ell(F(-0.02, 0.09, sd * 0.052), [0.016, 0.078, 0.05], (h) => (h[0] > 0.2 ? (Math.abs(h[2]) < 0.6 && h[1] < 0.6 ? 'cream' : 'fox') : h[1] > 0.3 ? 'sock' : 'fox'), { rot: [-look, 0.1, sd * 0.28], group: 4 + (sd > 0 ? 1 : 0) });
  }
}

// ---------------------------------------------------------------- raccoon
function raccoonSculpt(pose) {
  const S = sculpt();
  const q = {
    H: 0.22, len: 0.2, bh: 0.125, bw: 0.125, chestX: 0.12, hindX: -0.12, legs: [0.09, 0.1, 0.085, 0.08, 0.07], legR: 0.03,
    coat: 'coon', far: 'coonDark', sock: 0.55, stride: 0.14, pitch: -0.12, paw: 'mask',
  };
  let hc, hp = -0.12;
  if (pose.gait === 'rear') {
    pose.pitch = 0.85; pose.lift = 0.04;
    pose.feet = (front, sd) => (front ? [0.12 + (pose.i && sd > 0 ? 0.03 : 0), 0.26 + (pose.i && sd < 0 ? 0.04 : 0)] : [0.1, 0]);
    pose.tuckFront = false;
    const { R } = quadBody(S, q, pose);
    hc = R([0.27, -0.02, 0]);
    hp = -0.75;
    S.tube([R([0.19, 0.0, 0]), hc], [0.09, 0.07], 'coon', { group: 2 });
    coonTail(S, R([-0.2, -0.04, 0]), -1.6);
  } else {
    const { R } = quadBody(S, q, pose);
    hc = R([0.3, 0.13, 0]);
    S.tube([R([0.18, 0.05, 0]), hc], [0.09, 0.07], 'coon', { group: 2 });
    coonTail(S, R([-0.22, 0.03, 0]), pose.gait === 'run' ? -0.1 : -0.45);
  }
  const look = pose.look ?? 0;
  const F = (d, up = 0, sd = 0) => {
    const co = Math.cos(hp), si = Math.sin(hp);
    const lx = d * co - up * si, ly = d * si + up * co;
    return [hc[0] + lx * Math.cos(look) - sd * Math.sin(look), hc[1] + ly, hc[2] + lx * Math.sin(look) + sd * Math.cos(look)];
  };
  S.ell(hc, [0.09, 0.078, 0.088], (h) => (h[0] > -0.25 && Math.abs(h[1] - 0.1) < 0.3 ? 'mask' : h[0] > 0.1 && h[1] >= 0.4 && h[1] < 0.62 ? 'white2' : h[1] < -0.32 && h[0] > 0.15 ? 'white2' : 'coon'), { rot: [-look, hp, 0], group: 3 });
  S.tube([F(0.06, -0.02), F(0.13, -0.03)], [0.038, 0.018], (h) => (h[1] > 0.45 ? 'coon' : 'white2'), { group: 3 });
  S.ell(F(0.135, -0.028), 0.016, 'nose', { group: 3 });
  for (const sd of [-1, 1]) {
    S.decal(F(0.07, 0.012, sd * 0.05), eye(2, { glint: 0xfff6e8 }), { tol: 0.03 });
    S.ell(F(-0.03, 0.075, sd * 0.06), [0.02, 0.038, 0.034], (h) => (h[1] > 0.45 || h[0] > 0.6 ? 'white2' : 'coonDark'), { rot: [-look, 0, sd * 0.3], group: 4 + (sd > 0 ? 1 : 0) });
  }
  return S;
}
function coonTail(S, tb, a) {
  const t1 = [tb[0] - 0.13 * Math.cos(a), tb[1] + 0.13 * Math.sin(a), 0];
  const t2 = [t1[0] - 0.13 * Math.cos(a + 0.35), t1[1] + 0.13 * Math.sin(a + 0.35), 0];
  S.tube([tb, t1, t2], [0.045, 0.06, 0.04], (h, p, u) => (u > 0.9 || Math.floor(u * 7) % 2 ? 'mask' : 'coon'), { group: 6 });
}

// ---------------------------------------------------------------- squirrel & chipmunk
function rodentSculpt(sp, pose) {
  const S = sculpt();
  const s = sp.s, g = pose.gait, i = pose.i ?? 0;
  let pitch = 0.6, by = 0.075, hx = 0.075, hy = 0.135, fp = [0.08, 0.0], hpz = 0, tail;
  const coat = (h) => (h[1] < -0.45 ? 'cream' : sp.stripes && h[1] > -0.1 && stripeAt(h[2]) ? stripeAt(h[2]) : sp.coat);
  if (g === 'eat') { pitch = 1.15; by = 0.085; hx = 0.05; hy = 0.17; fp = [0.075, 0.12 + (i ? 0.008 : 0)]; }
  if (g === 'run') {
    [pitch, by, hx, hy, fp, hpz] = [
      [0.15, 0.06, 0.1, 0.1, [0.08, 0], -0.02],
      [0.4, 0.09, 0.11, 0.15, [0.15, 0.05], -0.14],
      [0.0, 0.09, 0.13, 0.12, [0.17, 0.03], -0.15],
      [-0.3, 0.07, 0.12, 0.08, [0.12, 0], 0.05],
    ][i];
  }
  const B = [0, by, 0].map((v) => v * s);
  const R = pivot(B, pitch);
  S.ell(B, [0.085 * s, 0.06 * s, 0.055 * s], coat, { rot: [0, pitch, 0], group: 1 });
  S.ell(R([-0.04 * s, -0.01 * s, 0]), [0.06 * s, 0.058 * s, 0.06 * s], coat, { group: 1 });
  for (const sd of [-1, 1]) {
    const sh = R([0.05 * s, -0.03 * s, sd * 0.025 * s]);
    S.tube([sh, [fp[0] * s, (fp[1] + 0.008) * s, sd * 0.025 * s]], [0.013 * s, 0.01 * s], sp.coat);
    const hf = [(hpz + 0.0) * s, 0.012 * s, sd * 0.035 * s];
    S.tube([R([-0.04 * s, -0.02 * s, sd * 0.03 * s]), [hf[0] - 0.01 * s, hf[1] + 0.006 * s, hf[2]]], [0.03 * s, 0.014 * s], sd > 0 ? sp.coat : sp.dark);
    S.ell(hf, [0.04 * s, 0.013 * s, 0.018 * s], sd > 0 ? sp.coat : sp.dark, { rot: [0, g === 'run' ? hpz * 4 : 0, 0] });
  }
  if (g === 'eat') S.ell([(fp[0] + 0.01) * s, (fp[1] + 0.015) * s, 0], 0.018 * s, 'chestnut');
  // head
  const H = [hx * s, hy * s, 0];
  S.ell(H, [0.048 * s, 0.042 * s, 0.042 * s], (h) => (h[1] < -0.35 && h[0] > -0.2 ? 'cream' : sp.coat), { group: 2 });
  S.ell([(hx + 0.035) * s, (hy - 0.012) * s, 0], [0.025 * s, 0.022 * s, (g === 'eat' && sp.cheeks ? 0.038 : 0.026) * s], (h) => (h[1] < 0 ? 'cream' : sp.coat), { group: 2 });
  S.decal([(hx + 0.06) * s, (hy - 0.008) * s, 0], dot(0x2a1a1e), { tol: 0.02 });
  for (const sd of [-1, 1]) {
    S.decal([(hx + 0.022) * s, (hy + 0.012) * s, sd * 0.038 * s], eye(2, { ring: sp.ring }), { tol: 0.02 });
    if (sp.stripes) S.decal([(hx + 0.0) * s, (hy + 0.0) * s, sd * 0.043 * s], (put, x, y) => { put(x - 2, y, 0x3a2620); put(x - 3, y, 0x3a2620); put(x - 2, y + 3, 0xf2dcb8); put(x - 3, y + 3, 0xf2dcb8); }, { tol: 0.03 });
    S.ell([(hx - 0.02) * s, (hy + 0.04) * s, sd * 0.022 * s], [0.01 * s, (sp.tufts ? 0.026 : 0.018) * s, 0.014 * s], (h) => (h[1] > 0.5 && sp.tufts ? sp.dark : sp.coat), { rot: [0, 0.2, sd * 0.25], group: 3 });
  }
  // tail
  const tb = R([-0.08 * s, 0.01 * s, 0]);
  if (g === 'run') tail = [[-0.06, 0.04], [-0.14, 0.09], [-0.22, 0.11], [-0.27, 0.15]];
  else tail = sp.tail;
  const pts = [tb, ...tail.map(([x, y]) => [tb[0] + x * s, tb[1] + y * s + (pose.flick ? 0.01 * s : 0), 0])];
  S.tube(pts, sp.tailR.map((r) => r * s), (h, p, u) => (u > 0.35 && h[2] < 0.3 ? sp.dark : sp.coat), { group: 6 });
  return S;
}
function stripeAt(z) {
  const a = Math.abs(z);
  if (a < 0.09) return 'stripe';
  if (a > 0.16 && a < 0.27) return 'cream';
  if (a > 0.3 && a < 0.42) return 'stripe';
  return null;
}
const SQUIRREL = { s: 1.15, coat: 'squirrel', dark: 'foxDark', tufts: true, ring: 0xf2dcb8, tail: [[-0.04, 0.07], [-0.07, 0.16], [-0.04, 0.24], [0.02, 0.26]], tailR: [0.022, 0.045, 0.058, 0.058, 0.04] };
const CHIPMUNK = { s: 1.0, coat: 'chip', dark: 'stripe', stripes: true, cheeks: true, ring: 0xf2dcb8, tail: [[-0.04, 0.05], [-0.07, 0.12], [-0.07, 0.19], [-0.05, 0.23]], tailR: [0.016, 0.022, 0.026, 0.024, 0.016] };

// ---------------------------------------------------------------- birds
// sp: { s, back, belly, head:fn|name, beak, wing, tip, tail, legs, crest, big }
function birdSculpt(sp, pose) {
  const S = sculpt();
  const s = sp.s, m = pose.mode, i = pose.i ?? 0;
  const fly = m === 'fly' || m === 'glide';
  let pitch = fly ? -0.05 : 0.45, by = fly ? 0.0 : 0.07, look = pose.look ?? 0;
  const hx = 0.062, hy = 0.112;
  if (m === 'peck') pitch = -0.35;
  if (m === 'hop') { pitch = i ? 0.2 : 0.55; by = i ? 0.085 : 0.06; }
  const B = [0, by * s, 0];
  const R = pivot(B, pitch);
  const body = (h) => (h[1] < -0.25 || (h[0] > 0.45 && h[1] < 0.35) ? sp.belly : sp.back);
  S.ell(B, [0.078 * s * (sp.long || 1), 0.052 * s, 0.05 * s], body, { rot: [0, pitch, 0], group: 1 });
  // tail
  S.ell(R([-0.095 * s * (sp.long || 1), 0.005 * s, 0]), [0.06 * s * (sp.tailLen || 1), 0.009 * s, (fly ? 0.035 : 0.026) * s], (h) => (sp.tailTip && h[0] < -0.6 ? sp.tailTip : sp.tail), { rot: [0, fly ? 0 : pitch + 0.1, 0], group: 2 });
  // head (neck for geese)
  let H;
  if (sp.neck) {
    const nb = R([0.07 * s * (sp.long || 1), 0.02 * s, 0]);
    H = fly ? [nb[0] + 0.13 * s, nb[1] + 0.015 * s, 0] : [nb[0] + 0.05 * s, nb[1] + 0.13 * s, 0];
    if (m === 'peck') H = [nb[0] + 0.1 * s, 0.03 * s, 0];
    const nr = sp.neckR || [0.03, 0.022, 0.02];
    S.tube([nb, [(nb[0] + H[0]) / 2 + 0.01 * s, (nb[1] + H[1]) / 2, 0], H], nr.map((r) => r * s), sp.neckMat || sp.head, { group: 3 });
  } else if (m === 'peck') H = [0.085 * s, (0.035 + (i ? 0.01 : 0)) * s, 0];
  else if (fly) H = [0.078 * s * (sp.long || 1), 0.024 * s, 0];
  else H = [hx * s, (hy + by - 0.07) * s, 0];
  const hr = 0.042 * s * (sp.headK || 1);
  const headMat = typeof sp.head === 'function' ? sp.head : () => sp.head;
  S.ell(H, [hr * 1.05, hr, hr * 0.95], headMat, { rot: [-look, 0, 0], group: 3 });
  if (sp.crest) S.ell([H[0] - hr * 0.6, H[1] + hr * 0.8, 0], [hr * 0.55, hr * 0.5, hr * 0.4], typeof sp.head === 'function' ? sp.crest : sp.head, { rot: [0, 0.9, 0], group: 3 });
  const bd = m === 'peck' ? -0.5 : 0;
  const bx = Math.cos(look), bz = Math.sin(look);
  const b0 = [H[0] + hr * 0.85 * bx, H[1] - hr * 0.1, H[2] + hr * 0.85 * bz];
  const bl = (sp.beakLen || 0.03) * s;
  const b1 = [b0[0] + bl * Math.cos(bd) * bx, b0[1] + bl * Math.sin(bd) - 0.002 * s, b0[2] + bl * Math.cos(bd) * bz];
  if (sp.flatBill) S.ell([(b0[0] + b1[0]) / 2, (b0[1] + b1[1]) / 2, (b0[2] + b1[2]) / 2], [bl * 0.55, hr * 0.2, hr * 0.38], sp.beak, { rot: [-look, bd, 0], group: 3 });
  else S.tube([b0, b1], [hr * 0.3, hr * 0.06], sp.beak, { group: 3 });
  if (sp.beakSpot) S.decal(b1, (put, x, y) => put(x - 1, y + 1, 0xd83a2a), { tol: 0.02 });
  for (const sd of [-1, 1]) {
    const lx = hr * 0.42, lz = sd * hr * 0.82;
    S.decal([H[0] + lx * bx - lz * bz, H[1] + hr * 0.22, H[2] + lx * bz + lz * bx], eye(2, { ring: sp.eyeRing }), { tol: hr * 0.5 });
  }
  // wings
  if (fly) {
    const a = m === 'glide' ? 0.12 : (sp.flaps || flapAngles)[i];
    const span = (sp.span || 0.085) * s;
    for (const sd of [-1, 1]) {
      const sh = R([0.012 * s, 0.025 * s, sd * 0.035 * s]);
      const wc = [sh[0] - 0.01 * s, sh[1] + Math.sin(a) * span, sh[2] + sd * Math.cos(a) * span];
      S.ell(wc, [0.048 * s * (sp.chord || 1), 0.011 * s, span], (h) => (h[2] * sd > 0.62 || (sp.trail && h[0] < -0.55) ? sp.tip : sp.wingBar && Math.abs(h[0] + 0.1) < 0.1 && h[2] * sd > 0.2 ? sp.wingBar : sp.wing), { rot: [0, 0.3, -sd * a], group: 7 + (sd > 0 ? 1 : 0) });
      if (sp.fingers) for (let k = 0; k < 3; k++) {
        const d = span * (1.9 + 0.05 * k);
        S.ell([wc[0] + 0.02 * s - k * 0.02 * s, sh[1] + Math.sin(a) * d, sh[2] + sd * Math.cos(a) * d], [0.009 * s, 0.005 * s, 0.03 * s], sp.tip, { rot: [0, 0, -sd * a], group: 7 + (sd > 0 ? 1 : 0) });
      }
    }
  } else {
    for (const sd of [-1, 1]) {
      S.ell(R([-0.012 * s, 0.012 * s, sd * 0.042 * s]), [0.068 * s * (sp.long || 1), 0.034 * s, 0.012 * s], (h) => (h[0] < -0.45 ? sp.tip : sp.wingBar && Math.abs(h[0] - 0.05) < 0.12 ? sp.wingBar : sp.wing), { rot: [0, pitch - 0.1, 0], group: 4 + (sd > 0 ? 1 : 0) });
      if (m !== 'swim') S.tube([R([0.0, -0.035 * s, sd * 0.016 * s]), [0.01 * s, 0.002 * s, sd * 0.016 * s]], [0.006 * s, 0.005 * s], sp.legs || 'beakDark');
    }
  }
  return S;
}

// ducks sit on the water (clipped at y = 0) with a ripple ring
function duckSculpt(sp, pose) {
  const S = sculpt();
  const s = sp.s, m = pose.mode, i = pose.i ?? 0;
  if (m === 'fly') return birdSculpt({ ...sp, neck: false, long: 1.25, span: 0.11, chord: 1.1 }, { mode: 'fly', i });
  const dab = m === 'dabble';
  const pitch = dab ? -1.05 : 0.04 + (i ? 0.03 : 0);
  const B = [0, 0.035 * s, 0];
  const R = pivot(B, pitch);
  const body = (h) => (sp.chest && h[0] > 0.55 ? sp.chest : h[1] < -0.3 ? sp.belly : sp.back);
  S.ell(B, [0.17 * s, 0.075 * s, 0.085 * s], body, { rot: [0, pitch, 0], group: 1 });
  S.ell(R([-0.15 * s, 0.03 * s, 0]), [0.05 * s, 0.035 * s, 0.04 * s], sp.tail, { rot: [0, pitch + 0.5, 0], group: 1 });
  if (sp.curl) S.ell(R([-0.16 * s, 0.07 * s, 0]), [0.012 * s, 0.02 * s, 0.01 * s], 'black', { group: 1 });
  for (const sd of [-1, 1]) S.ell(R([-0.02 * s, 0.035 * s, sd * 0.07 * s]), [0.12 * s, 0.035 * s, 0.022 * s], (h) => (h[0] < -0.2 && h[0] > -0.55 && h[1] > -0.2 ? 'speculum' : h[0] < -0.6 ? sp.tip : sp.wing), { rot: [0, pitch + 0.05, 0], group: 2 });
  const nb = R([0.12 * s, 0.05 * s, 0]);
  const H = dab ? [nb[0] + 0.05 * s, nb[1] - 0.06 * s, 0] : [nb[0] + 0.035 * s, nb[1] + 0.085 * s + (i ? -0.005 * s : 0), 0];
  S.tube([nb, H], [0.045 * s, 0.035 * s], (h, p, u) => (sp.ring && u > 0.25 && u < 0.4 ? 'white2' : u > 0.4 ? sp.head : sp.chest || sp.back), { group: 3 });
  const hr = 0.05 * s;
  S.ell(H, [hr * 1.1, hr, hr * 0.9], sp.head, { group: 3 });
  const b0 = [H[0] + hr * 0.95, H[1] - hr * 0.2, 0];
  S.ell([b0[0] + 0.022 * s, b0[1] - 0.004 * s, 0], [0.032 * s, 0.01 * s, 0.02 * s], sp.beak, { rot: [0, dab ? -0.6 : -0.12, 0], group: 3 });
  for (const sd of [-1, 1]) S.decal([H[0] + hr * 0.35, H[1] + hr * 0.25, sd * hr * 0.85], eye(2), { tol: hr * 0.5 });
  // ripple ring on the water
  S.ell([0.0, 0.002, 0], [0.24 * s, 0.003, 0.15 * s], (h) => (Math.hypot(h[0], h[2]) > 0.8 && (Math.atan2(h[2], h[0]) * 3 + i) % 2 > 0.6 ? 'ripple' : null), { line: false, group: 9 });
  return S;
}

// ---------------------------------------------------------------- frog
function frogSculpt(pose) {
  const S = sculpt();
  const g = pose.gait, i = pose.i ?? 0;
  let pitch = 0.32, by = 0.036, legExt = 0, armF = 0;
  if (g === 'leap') { [pitch, by, legExt, armF] = [[0.55, 0.05, 0.5, 0], [0.0, 0.05, 1, 0.6], [-0.2, 0.04, 0.3, 0.3]][i]; }
  const B = [0, by, 0];
  const R = pivot(B, pitch);
  const skin = (h) => (h[1] < -0.35 ? 'frogBelly' : h[1] > 0.1 && spotAt(h) ? 'frogDark' : 'frog');
  S.ell(B, [0.058, 0.032, 0.048], skin, { rot: [0, pitch, 0], group: 1 });
  S.ell(R([0.045, 0.012, 0]), [0.042, 0.026, 0.046], skin, { rot: [0, pitch - 0.25, 0], group: 1 });
  if (g === 'sit') S.ell(R([0.06, -0.012, 0]), i ? 0.026 : 0.017, 'frogBelly', { group: 1 });
  for (const sd of [-1, 1]) {
    const e = R([0.05, 0.036, sd * 0.024]);
    S.ell(e, 0.017, 'frog', { group: 2 + (sd > 0 ? 1 : 0) });
    S.decal([e[0] + 0.008, e[1] + 0.004, e[2] + sd * 0.012], (put, x, y) => { put(x, y, 0xe8b830); put(x + 1, y, 0x1a1014); put(x + 1, y + 1, 0x1a1014); put(x, y + 1, 0xc89020); put(x, y - 1, 0xfff6e8); }, { tol: 0.015 });
    // front legs
    const sh = R([0.04, -0.01, sd * 0.032]);
    S.tube([sh, [sh[0] + 0.02 + armF * 0.03, 0.006 + armF * 0.01, sd * 0.042]], [0.009, 0.007], 'frog');
    // hind legs: thigh, shin, long foot
    const hip = R([-0.04, -0.005, sd * 0.04]);
    const foot = [hip[0] - 0.03 - legExt * 0.09, 0.008 + legExt * 0.03, sd * 0.055];
    const knee = [hip[0] + 0.035 - legExt * 0.05, 0.03 + legExt * 0.01, sd * 0.06];
    S.tube([hip, knee, foot], [0.017, 0.012, 0.009], (h) => (h[1] > 0.4 ? 'frogDark' : 'frog'), { group: 4 + (sd > 0 ? 1 : 0) });
    S.ell([foot[0] - 0.012 - legExt * 0.01, foot[1] - 0.002, foot[2]], [0.024, 0.005, 0.012], 'frogDark', { rot: [0, legExt * 0.4, 0] });
  }
  S.decal(R([0.085, -0.004, 0]), (put, x, y) => { put(x, y, 0x1e3a14); put(x - 1, y, 0x1e3a14); put(x - 2, y - 1, 0x1e3a14); }, { tol: 0.02 });
  return S;
}
function spotAt(h) {
  const u = h[0] * 3.1 + 7, v = h[2] * 3.1 + 3;
  const fu = u - Math.floor(u), fv = v - Math.floor(v);
  return (fu - 0.5) ** 2 + (fv - 0.5) ** 2 < 0.06;
}

// ---------------------------------------------------------------- fish (a jumping trout)
function fishSculpt(pose) {
  const S = sculpt();
  const bend = pose.bend ?? 0;
  const yAt = (x) => bend * (x * x - 0.02) * 2.2;
  const slope = (x) => Math.atan(bend * x * 4.4);
  const mat = (h) => (h[1] > 0.35 ? (spotAt([h[0] * 2, 0, h[2] * 2]) ? 'black' : 'troutBack') : h[1] > -0.12 && h[1] < 0.22 ? 'troutRed' : h[1] < -0.3 ? 'white2' : 'trout');
  for (const [x, r] of [[0.12, [0.09, 0.05, 0.034]], [0.02, [0.11, 0.055, 0.036]], [-0.09, [0.08, 0.042, 0.03]], [-0.17, [0.045, 0.026, 0.02]]]) {
    S.ell([x, yAt(x), 0], r, mat, { rot: [0, slope(x), 0], group: 1 });
  }
  // forked tail fin & dorsal fin
  const tx = -0.23, ty = yAt(-0.23), ta = slope(-0.23);
  S.ell([tx, ty + 0.03, 0], [0.042, 0.024, 0.006], 'troutBack', { rot: [0, ta + 0.75, 0], group: 2 });
  S.ell([tx, ty - 0.03, 0], [0.042, 0.024, 0.006], 'troutBack', { rot: [0, ta - 0.75, 0], group: 2 });
  S.ell([0.0, yAt(0) + 0.055, 0], [0.04, 0.022, 0.005], 'troutBack', { rot: [0, -0.4, 0], group: 3 });
  for (const sd of [-1, 1]) S.decal([0.17, yAt(0.17) + 0.012, sd * 0.03], eye(2), { tol: 0.03 });
  return S;
}

// ---------------------------------------------------------------- bugs
function butterflySculpt(sp, a) {
  const S = sculpt();
  S.tube([[-0.024, 0, 0], [0.014, 0.002, 0]], [0.0055, 0.006], 'black', { group: 1 });
  S.ell([0.02, 0.003, 0], 0.0065, 'black', { group: 1 });
  for (const sd of [-1, 1]) {
    S.tube([[0.024, 0.006, sd * 0.003], [0.04, 0.02, sd * 0.014]], [0.0015, 0.0015], 'black', { group: 1, line: false });
    S.ell([0.041, 0.021, sd * 0.015], 0.0028, 'black', { group: 1 });
    for (const [ox, w, len, yaw0, fore] of [[0.008, 0.026, 0.034, 0.32, true], [-0.008, 0.022, 0.027, -0.5, false]]) {
      const W = wingAt([ox, 0.002, sd * 0.004], len, yaw0, a, sd);
      S.ell(W.c, [w, 0.0015, len], (h) => wingPat(sp, h, sd, fore), { B: W.B, group: 2 + (sd > 0 ? 1 : 0) });
    }
  }
  return S;
}
function wingBasis(yaw, roll) {
  return mat3mul(rotX(roll), rotY(yaw));
}
// a flat wing hinged at root, swept by yaw0 and raised by a: { c, B }
function wingAt(root, len, yaw0, a, sd) {
  const B = wingBasis(-sd * yaw0, -sd * a);
  const ax = mat3vec(B, [0, 0, sd]);
  return { c: [root[0] + ax[0] * len, root[1] + ax[1] * len, root[2] + ax[2] * len], B };
}
function wingPat(sp, h, sd, fore) {
  const r = Math.hypot(h[0], h[2]);
  if (sp.plain) return r > 0.86 ? 'black' : sp.color;
  if (r > 0.8) return (Math.floor((Math.atan2(h[2] * sd, h[0]) + 4) * 4.5) % 2) && r < 0.93 ? 'white2' : 'black';
  const ang = Math.atan2(h[0], h[2] * sd);
  if (Math.abs(Math.sin(ang * 4.2)) < 0.14 && r > 0.25) return 'black';
  if (fore && h[0] > 0.55) return 'black';
  return sp.color;
}

function dragonflySculpt(a) {
  const S = sculpt();
  const pts = [[-0.075, 0.004, 0], [-0.04, 0.001, 0], [0.0, 0, 0]];
  S.tube(pts, [0.0045, 0.005, 0.006], (h, p, u) => (Math.floor(u * 8) % 2 ? 'dragon' : 'black'), { group: 1 });
  S.ell([0.012, 0.002, 0], [0.012, 0.009, 0.009], 'dragon', { group: 1 });
  for (const sd of [-1, 1]) S.ell([0.027, 0.005, sd * 0.006], 0.0075, 'drake', { group: 2 });
  for (const sd of [-1, 1]) {
    for (const [ox, k, yaw0] of [[0.016, 1, 0.12], [0.003, 0.92, -0.2]]) {
      const W = wingAt([ox, 0.008, sd * 0.004], 0.045 * k, yaw0, a, sd);
      S.ell(W.c, [0.008, 0.001, 0.045 * k], 'wingGlass', { B: W.B, group: 3, line: false });
    }
  }
  return S;
}

function batSculpt(a) {
  const S = sculpt();
  S.ell([0, 0, 0], [0.04, 0.03, 0.03], 'bat', { group: 1 });
  S.ell([0.04, 0.006, 0], 0.026, 'bat', { group: 1 });
  for (const sd of [-1, 1]) {
    S.tube([[0.038, 0.022, sd * 0.012], [0.034, 0.058, sd * 0.024]], [0.012, 0.002], (h) => (h[0] > 0.3 ? 'pink' : 'bat'), { group: 2 + (sd > 0 ? 1 : 0) });
    S.decal([0.058, 0.012, sd * 0.012], (put, x, y) => { put(x, y, 0xf0c040, true); }, { tol: 0.02 });
    const span = 0.1;
    S.ell([-0.008, Math.sin(a) * span, sd * Math.cos(a) * span], [0.05, 0.004, span], (h) => {
      if (h[0] < -0.45 + 0.4 * Math.abs(Math.sin(h[2] * 7.8))) return null;
      return Math.abs(Math.sin(Math.atan2(h[2] * sd, h[0] + 0.9) * 5)) < 0.14 ? 'bat' : 'batWing';
    }, { rot: [0, 0, -sd * a], group: 4 + (sd > 0 ? 1 : 0) });
  }
  S.decal([0.066, -0.006, 0], (put, x, y) => { put(x, y, 0xfff6e8); put(x - 2, y, 0xfff6e8); }, { tol: 0.02 });
  return S;
}

// ---------------------------------------------------------------- owl
function owlSculpt(pose) {
  const S = sculpt();
  const look = pose.look ?? 0;
  if (pose.fly !== undefined) {
    return birdSculpt({ s: 3.4, back: 'owl', belly: 'cream2', head: (h) => (h[0] > 0.55 ? 'owlFace' : 'owl'), beak: 'beakDark', wing: 'owl', tip: 'owlDark', tail: 'owlDark', headK: 0.78, beakLen: 0.012, span: 0.1, chord: 1.4, trail: true }, { mode: 'fly', i: pose.fly });
  }
  const belly = (h) => (h[0] > 0.3 ? (Math.floor(h[1] * 12 + 20) % 4 === 0 ? 'owl' : 'cream2') : spotAt([h[0] * 3, 0, h[1] * 3]) ? 'owlDark' : 'owl');
  S.ell([0, 0.19, 0], [0.12, 0.17, 0.12], belly, { group: 1 });
  for (const sd of [-1, 1]) S.ell([-0.02, 0.2, sd * 0.1], [0.1, 0.14, 0.03], (h) => (spotAt([h[0] * 2.5, 0, h[1] * 2.5]) ? 'cream2' : 'owlDark'), { group: 2 });
  S.ell([-0.08, 0.06, 0], [0.06, 0.02, 0.06], 'owlDark', { rot: [0, 0.6, 0], group: 1 });
  const H = [0.01, 0.39, 0];
  const F = (d, up = 0, sd = 0) => [H[0] + d * Math.cos(look) - sd * Math.sin(look), H[1] + up, H[2] + d * Math.sin(look) + sd * Math.cos(look)];
  S.ell(H, [0.11, 0.1, 0.12], 'owl', { rot: [-look, 0, 0], group: 3 });
  S.ell(F(0.092, -0.01), [0.032, 0.085, 0.105], (h) => (Math.hypot(h[1], h[2]) > 0.82 ? 'owlDark' : 'owlFace'), { rot: [-look, 0, 0], group: 3 });
  S.tube([F(0.1, -0.005), F(0.115, -0.04)], [0.012, 0.004], 'beakDark', { group: 3 });
  for (const sd of [-1, 1]) {
    S.tube([F(0.01, 0.07, sd * 0.06), F(-0.015, 0.155, sd * 0.09)], [0.025, 0.005], 'owlDark', { group: 4 });
    S.decal(F(0.122, 0.018, sd * 0.045), pose.blink
      ? (put, x, y) => { put(x - 1, y + 1, 0x3a2418); put(x, y + 1, 0x3a2418); put(x + 1, y + 1, 0x3a2418); }
      : (put, x, y) => {
        for (let j = -2; j <= 2; j++) for (let k = -2; k <= 2; k++) if (Math.abs(j) + Math.abs(k) < 4) put(x + k, y + j, Math.abs(j) === 2 || Math.abs(k) === 2 ? 0x3a2010 : 0xffd830, true);
        put(x, y, 0x140c10); put(x, y + 1, 0x140c10); put(x + 1, y, 0x140c10); put(x + 1, y + 1, 0x140c10);
        put(x - 1, y - 1, 0xfffbe8, true);
      }, { tol: 0.04 });
  }
  // talons on the branch
  for (const sd of [-1, 1]) S.ell([0.04, 0.012, sd * 0.04], [0.025, 0.012, 0.018], 'beak');
  return S;
}

// ---------------------------------------------------------------- wisp (a shy little ghost)
function ghostSculpt(i, mat = 'ghost') {
  const S = sculpt();
  const sw = Math.sin((i / 4) * TAU);
  S.ell([0, 0.42, 0], [0.16, 0.17, 0.15], mat, { group: 1 });
  S.tube([[0, 0.4, 0], [0.02 + sw * 0.02, 0.26, 0], [-0.03 - sw * 0.03, 0.13, 0], [0.04 + sw * 0.05, 0.02, 0]], [0.158, 0.12, 0.07, 0.02], mat, { group: 1 });
  for (const sd of [-1, 1]) S.ell([0.03, 0.33 + (sd > 0 ? sw : -sw) * 0.015, sd * 0.15], [0.05, 0.03, 0.045], mat, { rot: [0, 0.4, 0], group: 2 + (sd > 0 ? 1 : 0) });
  for (const sd of [-1, 1]) {
    S.decal([0.14, 0.45, sd * 0.055], (put, x, y) => { put(x, y, 0x1e1a2a); put(x + 1, y, 0x1e1a2a); put(x, y + 1, 0x1e1a2a); put(x + 1, y + 1, 0x1e1a2a); put(x, y + 2, 0x1e1a2a); put(x + 1, y + 2, 0x1e1a2a); put(x, y, 0xffffff); }, { tol: 0.06 });
    S.decal([0.13, 0.4, sd * 0.09], (put, x, y) => { put(x, y, 0xf8a0c0, true); put(x + 1, y, 0xf8a0c0, true); }, { tol: 0.06 });
  }
  S.decal([0.15, 0.39, 0], (put, x, y) => { put(x, y, 0x1e1a2a); put(x, y + 1, 0x3a2a4a); }, { tol: 0.06 });
  return S;
}

// ---------------------------------------------------------------- the bin the raccoon raids
function binSculpt() {
  const S = sculpt();
  S.tube([[0, 0.02, 0], [0, 0.52, 0]], [0.19, 0.21], (h, p, u) => (Math.floor(u * 7) % 2 ? 'canDark' : 'can'), { group: 1 });
  S.ell([0.02, 0.555, 0], [0.235, 0.04, 0.235], 'can', { rot: [0, 0.12, 0], group: 2 });
  S.tube([[-0.04, 0.6, 0], [0.08, 0.61, 0]], [0.015, 0.015], 'canDark', { group: 2 });
  S.ell([0.2, 0.55, 0.08], [0.06, 0.018, 0.03], 'peel', { rot: [0.3, -0.6, 0], group: 3 });
  return S;
}

// ---------------------------------------------------------------- catalogue
// kind -> { ppm, pitch, anims: { anim: { n, views, pose(i, n) -> Sculpt, pitch?, ppm?, clipY? } } }
const ALL5 = ['side', 'front3', 'front', 'back3', 'back'];
const SIDE3 = ['side', 'front3', 'back3'];
const anim = (n, pose, o = {}) => ({ n, pose, views: ALL5, ...o });
function deerKind(spec, ppm) {
  return {
    ppm, pitch: 0.28,
    anims: {
      idle: anim(2, (i) => deerSculpt(spec, { gait: 'stand', head: 'idle', ears: 0.3, flick: i === 1, tail: 0 })),
      alert: anim(1, () => deerSculpt(spec, { gait: 'stand', head: 'alert', ears: 1, tail: 0.6, look: 0.7, splay: true })),
      graze: anim(2, (i) => deerSculpt(spec, { gait: 'stand', head: 'graze', chew: i === 1, ears: 0.2, tail: 0, splay: true })),
      walk: anim(4, (i, n) => deerSculpt(spec, { gait: 'walk', phase: i / n, head: 'idle', ears: 0.4, tail: 0 })),
      run: anim(4, (i, n) => deerSculpt(spec, { gait: 'bound', phase: i / n, head: 'alert', ears: 1, tail: 1 })),
    },
  };
}
const ROBIN = { s: 1.15, back: 'robinBack', belly: 'robinBreast', head: 'birdHead', beak: 'beak', wing: 'robinBack', tip: 'birdHead', tail: 'birdHead' };
const CHICKADEE = { s: 1.0, back: 'grey', belly: 'cream2', head: (h) => (h[1] > 0.2 || (h[1] < -0.3 && h[0] > -0.1) ? 'black' : 'white2'), beak: 'beakDark', wing: 'grey', tip: 'birdHead', tail: 'grey', headK: 1.15, wingBar: 'white2' };
const BLUEJAY = { s: 1.3, back: 'jay', belly: 'white2', head: (h) => (h[1] < -0.15 && h[0] > 0 ? (h[1] < -0.6 ? 'black' : 'white2') : 'jay'), crest: () => 'jay', beak: 'beakDark', wing: 'jay', tip: 'jayDark', tail: 'jay', tailTip: 'white2', wingBar: 'black' };
const SPARROW = { s: 0.95, back: 'sparrow', belly: 'cream2', head: (h) => (h[1] > 0.3 ? 'rufous' : h[1] < -0.3 ? 'cream2' : 'grey'), beak: 'beakDark', wing: 'sparrow', tip: 'rufous', tail: 'sparrow', wingBar: 'cream2' };
const CROW = { s: 2.6, back: 'crow', belly: 'crow', head: 'crow', beak: 'black', wing: 'crow', tip: 'black', tail: 'crow', fingers: true, beakLen: 0.028, span: 0.09 };
const GOOSE = { s: 4.4, back: 'goose', belly: 'cream2', head: (h) => (Math.abs(h[2]) > 0.3 && h[1] < 0.25 && h[0] < 0.55 ? 'white2' : 'black'), neck: true, neckMat: 'black', neckR: [0.016, 0.012, 0.011], beak: 'black', wing: 'goose', tip: 'gooseDark', tail: 'black', long: 1.25, span: 0.105, chord: 1.1, flaps: [0.6, 0.15, -0.45, -0.1], beakLen: 0.01, headK: 0.42 };
const GULL = { s: 3.0, back: 'gullWing', belly: 'white2', head: 'white2', beak: 'beak', beakSpot: true, wing: 'gullWing', tip: 'black', tail: 'white2', legs: 'pink', span: 0.11, long: 1.15, flaps: [0.7, 0.2, -0.4, 0.0], beakLen: 0.02, headK: 0.8 };
const DRAKE = { s: 1, flyS: 2.1, back: 'duckGrey', belly: 'duckGrey', chest: 'chestnut', head: 'drake', ring: true, beak: 'beak', wing: 'duckGrey', tip: 'gooseDark', tail: 'white2', curl: true, flatBill: true };
const HEN = { s: 0.95, flyS: 2.0, back: 'hen', belly: 'hen', head: 'hen', beak: 'orange', wing: 'hen', tip: 'gooseDark', tail: 'hen', flatBill: true };
function songbird(sp, ppm = 104) {
  return {
    ppm, pitch: 0.3,
    anims: {
      idle: anim(2, (i) => birdSculpt(sp, { mode: 'perch', look: i ? 0.6 : 0 })),
      peck: anim(2, (i) => birdSculpt(sp, { mode: 'peck', i })),
      hop: anim(2, (i) => birdSculpt(sp, { mode: 'hop', i })),
      fly: anim(4, (i) => birdSculpt(sp, { mode: 'fly', i }), { pitch: 0.1 }),
    },
  };
}
function duckKind(sp) {
  const fsp = { ...sp, s: sp.flyS, long: 1.25, span: 0.11, chord: 1.1 };
  return {
    ppm: 64, pitch: 0.3,
    anims: {
      swim: anim(2, (i) => duckSculpt(sp, { mode: 'swim', i }), { clipY: 0 }),
      dabble: anim(2, (i) => duckSculpt(sp, { mode: 'dabble', i }), { clipY: 0 }),
      fly: anim(4, (i) => birdSculpt(fsp, { mode: 'fly', i }), { pitch: -0.15 }),
    },
  };
}
export const CRITTERS = {
  deer: deerKind(DOE, 48),
  fawn: deerKind(FAWN, 56),
  buck: deerKind(BUCK, 48),
  rabbit: {
    ppm: 76, pitch: 0.3,
    anims: {
      idle: anim(2, (i) => rabbitSculpt({ gait: 'sit', i })),
      nibble: anim(2, (i) => rabbitSculpt({ gait: 'nibble', i })),
      alert: anim(1, () => rabbitSculpt({ gait: 'alert' })),
      hop: anim(4, (i) => rabbitSculpt({ gait: 'hop', i })),
    },
  },
  fox: {
    ppm: 64, pitch: 0.28,
    anims: {
      idle: anim(2, (i) => foxSculpt({ gait: 'stand', look: i ? 0.6 : 0 })),
      sit: anim(1, () => foxSculpt({ gait: 'sit', look: 0.5 })),
      walk: anim(4, (i, n) => foxSculpt({ gait: 'walk', phase: i / n })),
      run: anim(4, (i, n) => foxSculpt({ gait: 'run', phase: i / n })),
      pounce: anim(2, (i) => foxSculpt({ gait: 'pounce', i })),
    },
  },
  raccoon: {
    ppm: 64, pitch: 0.28,
    anims: {
      idle: anim(2, (i) => raccoonSculpt({ gait: 'stand', look: i ? 0.6 : 0 })),
      walk: anim(4, (i, n) => raccoonSculpt({ gait: 'walk', phase: i / n })),
      run: anim(4, (i, n) => raccoonSculpt({ gait: 'run', phase: i / n })),
      rummage: anim(2, (i) => raccoonSculpt({ gait: 'rear', i })),
    },
  },
  squirrel: {
    ppm: 88, pitch: 0.3,
    anims: {
      idle: anim(2, (i) => rodentSculpt(SQUIRREL, { gait: 'sit', flick: i === 1 })),
      eat: anim(2, (i) => rodentSculpt(SQUIRREL, { gait: 'eat', i })),
      run: anim(4, (i) => rodentSculpt(SQUIRREL, { gait: 'run', i })),
    },
  },
  chipmunk: {
    ppm: 96, pitch: 0.3,
    anims: {
      idle: anim(2, (i) => rodentSculpt(CHIPMUNK, { gait: 'sit', flick: i === 1 })),
      eat: anim(2, (i) => rodentSculpt(CHIPMUNK, { gait: 'eat', i })),
      run: anim(4, (i) => rodentSculpt(CHIPMUNK, { gait: 'run', i })),
    },
  },
  robin: songbird(ROBIN),
  chickadee: songbird(CHICKADEE),
  bluejay: songbird(BLUEJAY),
  sparrow: songbird(SPARROW),
  crow: {
    ppm: 64, pitch: 0.3,
    anims: {
      idle: anim(2, (i) => birdSculpt(CROW, { mode: 'perch', look: i ? 0.7 : 0 })),
      hop: anim(2, (i) => birdSculpt(CROW, { mode: 'hop', i })),
      fly: anim(4, (i) => birdSculpt(CROW, { mode: 'fly', i }), { pitch: -0.1 }),
      glide: anim(1, () => birdSculpt(CROW, { mode: 'glide' }), { pitch: -0.1 }),
    },
  },
  goose: {
    ppm: 44, pitch: -0.35,
    anims: {
      fly: anim(4, (i) => birdSculpt(GOOSE, { mode: 'fly', i })),
    },
  },
  gull: {
    ppm: 56, pitch: -0.2,
    anims: {
      fly: anim(4, (i) => birdSculpt(GULL, { mode: 'fly', i })),
      glide: anim(1, () => birdSculpt(GULL, { mode: 'glide' })),
      idle: anim(2, (i) => birdSculpt(GULL, { mode: 'perch', look: i ? 0.6 : 0 }), { pitch: 0.3 }),
    },
  },
  mallard: duckKind(DRAKE),
  duckHen: duckKind(HEN),
  frog: {
    ppm: 128, pitch: 0.35,
    anims: {
      idle: anim(2, (i) => frogSculpt({ gait: 'sit', i })),
      leap: anim(3, (i) => frogSculpt({ gait: 'leap', i })),
    },
  },
  trout: {
    ppm: 72, pitch: 0.1,
    anims: { jump: anim(3, (i) => fishSculpt({ bend: (i - 1) * 0.9 }), { views: ['side'] }) },
  },
  monarch: {
    ppm: 176, pitch: 0.75,
    anims: { fly: anim(4, (i) => butterflySculpt({ color: 'monarch' }, [0.25, 0.9, 1.45, 0.9][i]), { views: SIDE3 }) },
  },
  sulphur: {
    ppm: 176, pitch: 0.75,
    anims: { fly: anim(4, (i) => butterflySculpt({ color: 'sulphur', plain: true }, [0.25, 0.9, 1.45, 0.9][i]), { views: SIDE3 }) },
  },
  dragonfly: {
    ppm: 150, pitch: 0.6,
    anims: { fly: anim(2, (i) => dragonflySculpt(i ? -0.2 : 0.35), { views: SIDE3 }) },
  },
  bat: {
    ppm: 100, pitch: -0.25,
    anims: { fly: anim(4, (i) => batSculpt([0.9, 0.2, -0.6, -0.1][i])) },
  },
  owl: {
    ppm: 84, pitch: 0.2,
    anims: {
      idle: anim(2, (i) => owlSculpt({ blink: i === 1 })),
      look: anim(1, () => owlSculpt({ look: 1.3 })),
      fly: anim(4, (i) => owlSculpt({ fly: i }), { pitch: -0.1 }),
    },
  },
  wisp: {
    ppm: 64, pitch: 0.15,
    anims: { float: anim(4, (i) => ghostSculpt(i), { views: ['front', 'front3', 'side'] }) },
  },
  wispBlue: {
    ppm: 56, pitch: 0.15,
    anims: { float: anim(4, (i) => ghostSculpt(i, 'ghostBlue'), { views: ['front', 'front3', 'side'] }) },
  },
  bin: {
    ppm: 56, pitch: 0.3,
    anims: { idle: anim(1, () => binSculpt(), { views: ['side'] }) },
  },
};

// ---------------------------------------------------------------- atlas painting
// paints frames into atlas (a SpriteAtlas). As a generator it yields after each
// creature kind so the work can be spread over frames; paintCritters() runs it all.
export function* paintCrittersGen(atlas, kinds = Object.keys(CRITTERS)) {
  for (const kind of kinds) {
    const K = CRITTERS[kind];
    for (const [name, A] of Object.entries(K.anims)) {
      for (let i = 0; i < A.n; i++) {
        const S = A.pose(i, A.n);
        for (const view of A.views) {
          const v = VIEWS[view];
          const r = renderSculpt(S, { yaw: v.yaw, pitch: A.pitch ?? K.pitch }, A.ppm ?? K.ppm, { contour: K.contour, clipY: A.clipY });
          const f = atlas.add(`${kind}:${name}:${view}:${i}`, r.w, r.h, (pix, x, y) => blitFrame(pix, x, y, r), r.ax, r.ay);
          f.ppm = r.ppm;
        }
      }
    }
    yield kind;
  }
}
export function paintCritters(atlas, kinds) {
  const t0 = performance.now();
  for (const k of paintCrittersGen(atlas, kinds)) void k;
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
