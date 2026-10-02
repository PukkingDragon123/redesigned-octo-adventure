// Wildlife & the cat: Poutine (orange tabby), deer, moose, Canada geese, crows,
// songbirds, red squirrels, beavers and leaping salmon.
import { Pix, shade } from './pixel.js';
import { shadeRegion, offsetPix, limb } from './characters.js';

const INK = 0x1e1418;

function frame(atlas, name, w, h, ax, ay, fn) {
  atlas.add(name, w, h, (p, x, y) => {
    const q = new Pix(w + 8, h + 8);
    const P = offsetPix(q, 4, 4);
    fn(P);
    shadeRegion(q, 0, 0, q.w, q.h);
    p.blit(q, x, y, false, 4, 4, w, h);
  }, ax, ay);
}

// ---------------------------------------------------------------- Poutine the cat
const CAT = { fur: 0xe08a3a, dark: 0xb05e22, light: 0xf6b46a, white: 0xf8f0e4, eye: 0x6ad050, nose: 0xe07080 };

function catHead(P, x, y, { view = 'side', mouth = false, eyes = 'open' } = {}) {
  const C = CAT;
  if (view === 'side') {
    P.ellipse(x, y, 3.6, 3.1, C.fur);
    P.poly([[x - 3, y - 2], [x - 2, y - 6], [x, y - 2]], C.fur); // back ear
    P.poly([[x, y - 2], [x + 1.5, y - 6], [x + 3, y - 1.5]], C.fur); // front ear (notched)
    P.set(x + 1, y - 4, C.nose);
    P.data[P.idx(x + 2, y - 5) + 3] = 0;
    P.rect(x + 2, y, 3, 2, C.white); // muzzle
    P.set(x + 4, y, C.nose);
    if (eyes === 'open') { P.set(x + 2, y - 1, C.eye); P.set(x + 2, y - 2, INK); }
    else P.hline(x + 1, x + 2, y - 1, INK);
    if (mouth) { P.rect(x + 3, y + 1, 2, 2, INK); P.set(x + 3, y + 2, C.nose); }
    // stripes
    P.set(x - 1, y - 3, C.dark);
    P.set(x - 2, y - 2, C.dark);
  } else {
    P.ellipse(x, y, 4.2, 3.4, C.fur);
    P.poly([[x - 4, y - 1], [x - 3.5, y - 6], [x - 1, y - 3]], C.fur);
    P.poly([[x + 1, y - 3], [x + 3.5, y - 6], [x + 4, y - 1]], C.fur);
    P.set(x - 3, y - 4, C.nose);
    P.data[P.idx(x + 3, y - 5) + 3] = 0; // notched ear
    P.rect(x - 2, y + 1, 4, 2, C.white);
    P.set(x - 1, y, C.nose);
    P.set(x, y, C.nose);
    if (eyes === 'open') {
      P.rect(x - 3, y - 1, 2, 2, C.eye); P.set(x - 2, y - 1, INK);
      P.rect(x + 1, y - 1, 2, 2, C.eye); P.set(x + 1, y - 1, INK);
    } else if (eyes === 'happy') {
      P.hline(x - 3, x - 2, y - 1, INK); P.set(x - 3, y, INK);
      P.hline(x + 1, x + 2, y - 1, INK); P.set(x + 2, y, INK);
    } else {
      P.hline(x - 3, x - 2, y, INK);
      P.hline(x + 1, x + 2, y, INK);
    }
    if (mouth) { P.rect(x - 1, y + 2, 2, 2, INK); P.set(x - 1, y + 3, C.nose); }
    P.set(x - 1, y - 3, C.dark);
    P.set(x + 1, y - 3, C.dark);
    P.set(x, y - 2, C.dark);
  }
}

function catBody(P, t, pose) {
  const C = CAT;
  // side view, facing right, frame 24x18, ground y=17
  const g = 17;
  if (pose === 'walk' || pose === 'idle' || pose === 'meow' || pose === 'scared') {
    const arch = pose === 'scared' ? 3 : 0;
    const by = g - 7 - arch;
    P.ellipse(11, by, 7, 3.4 + arch * 0.5, C.fur);
    if (pose === 'scared') for (let i = 5; i < 18; i += 2) P.set(i, by - 4 - arch * 0.4, C.light);
    for (let i = 7; i <= 15; i += 3) P.vline(i, by - 3, by - 1, C.dark);
    P.ellipse(13, by + 1.5, 4, 1.8, C.white);
    // legs
    const st = pose === 'walk' ? [2, -1, -2, 1][t % 4] : 0;
    const legs = [[6 + st, 0], [8 - st, 1], [14 - st, 0], [16 + st, 1]];
    for (const [lx, far] of legs) {
      const c = far ? C.dark : C.fur;
      limb(P, lx, by + 2, lx + (pose === 'scared' ? (lx < 11 ? -1 : 1) : 0), g - 1, 2, c);
      P.rect(lx - 1 + (pose === 'scared' ? (lx < 11 ? -1 : 1) : 0), g - 1, 2, 1, far ? shade(C.white, -0.3) : C.white);
    }
    // tail
    const tw = pose === 'scared' ? 0 : Math.sin(t * 1.6) * 2;
    if (pose === 'scared') { limb(P, 4, by - 1, 2, by - 8, 3, C.fur); P.rect(1, by - 10, 3, 3, C.fur); }
    else { limb(P, 4, by - 1, 1, by - 4, 2, C.fur); limb(P, 1, by - 4, 2 + tw, by - 9, 2, C.fur); P.set(2 + tw, by - 10, C.dark); }
    catHead(P, 19, by - 3 - arch, { view: 'side', mouth: pose === 'meow' || pose === 'scared' });
  } else if (pose === 'sit') {
    P.ellipse(10, g - 5, 4.5, 4.6, C.fur);
    P.ellipse(12, g - 5, 2.6, 3.4, C.white);
    for (let i = 7; i <= 9; i++) P.set(i, g - 8 + (i % 2), C.dark);
    P.rect(12, g - 2, 3, 2, C.white);
    P.rect(7, g - 2, 3, 2, C.fur);
    const tw = [0, 1, 2, 1][t % 4];
    limb(P, 6, g - 1, 2, g - 2, 2, C.fur);
    limb(P, 2, g - 2, 1 + tw, g - 6, 2, C.fur);
    catHead(P, 12, g - 12, { view: 'side', mouth: false, eyes: t % 4 === 3 ? 'closed' : 'open' });
  } else if (pose === 'sleep') {
    P.ellipse(12, g - 3.5, 8, 3.6 + (t % 2) * 0.4, C.fur);
    for (let i = 7; i <= 17; i += 3) P.vline(i, g - 7, g - 5, C.dark);
    P.ellipse(16, g - 4, 3.6, 3, C.fur);
    P.hline(15, 17, g - 4, INK);
    P.poly([[14, g - 6], [15, g - 9], [17, g - 6]], C.fur);
    P.poly([[17, g - 6], [19, g - 9], [19.5, g - 5]], C.fur);
    limb(P, 4, g - 2, 9, g - 1, 2, C.dark);
  }
}

function paintCat(atlas) {
  for (let t = 0; t < 4; t++) frame(atlas, `cat:walk:side:${t}`, 24, 18, 12, 17, (P) => catBody(P, t, 'walk'));
  for (let t = 0; t < 4; t++) frame(atlas, `cat:sit:side:${t}`, 24, 18, 11, 17, (P) => catBody(P, t, 'sit'));
  for (let t = 0; t < 2; t++) frame(atlas, `cat:sleep:side:${t}`, 24, 18, 12, 17, (P) => catBody(P, t, 'sleep'));
  frame(atlas, 'cat:meow:side:0', 24, 18, 12, 17, (P) => catBody(P, 0, 'meow'));
  frame(atlas, 'cat:scared:side:0', 24, 20, 12, 19, (P) => catBody(P, 0, 'scared'));
  frame(atlas, 'cat:idle:side:0', 24, 18, 12, 17, (P) => catBody(P, 0, 'idle'));
  // front view: sitting, and peeking out of the bike basket
  for (const [k, eyes, mouth] of [[0, 'open', false], [1, 'closed', false], [2, 'happy', false], [3, 'open', true]]) {
    frame(atlas, `cat:sit:front:${k}`, 16, 18, 8, 17, (P) => {
      P.ellipse(8, 12, 4.6, 4.4, CAT.fur);
      P.ellipse(8, 12.5, 2.6, 3.4, CAT.white);
      P.rect(5, 15, 2, 2, CAT.white);
      P.rect(9, 15, 2, 2, CAT.white);
      limb(P, 12, 16, 14, 11, 2, CAT.fur);
      catHead(P, 8, 5, { view: 'front', eyes, mouth });
    });
    frame(atlas, `cat:basket:front:${k}`, 16, 12, 8, 11, (P) => {
      catHead(P, 8, 5, { view: 'front', eyes, mouth });
      P.rect(3, 9, 3, 2, CAT.white);
      P.rect(10, 9, 3, 2, CAT.white);
    });
  }
  frame(atlas, 'cat:basket:back:0', 16, 12, 8, 11, (P) => {
    P.ellipse(8, 6, 4.2, 3.6, CAT.fur);
    P.poly([[4, 5], [4.5, 0], [7, 3]], CAT.fur);
    P.poly([[9, 3], [11.5, 0], [12, 5]], CAT.fur);
    P.set(8, 3, CAT.dark); P.set(7, 5, CAT.dark); P.set(9, 5, CAT.dark);
    P.rect(3, 9, 10, 2, CAT.fur);
  });
}

// ---------------------------------------------------------------- deer & moose
function deer(P, t, pose, buck) {
  const body = 0xa8743e, dark = 0x7a5028, belly = 0xe8d8b8, g = 39;
  const by = g - 16;
  P.ellipse(22, by, 11, 5.6, body);
  P.ellipse(23, by + 3, 8, 2.2, belly);
  // legs
  const run = pose === 'run';
  const st = pose === 'walk' ? [3, 0, -3, 0][t % 4] : run ? (t % 2 ? 6 : -4) : 0;
  const legs = [[13 + st, 1], [16 - st, 0], [28 - st, 1], [31 + st, 0]];
  for (const [lx, far] of legs) {
    const c = far ? dark : body;
    const fx = run ? lx + (lx < 22 ? -3 : 3) * (t % 2 ? 1 : -0.3) : lx;
    const fy = run ? g - 3 - (t % 2 ? 4 : 0) : g - 1;
    limb(P, lx, by + 3, (lx + fx) / 2, by + 9, 2, c);
    limb(P, (lx + fx) / 2, by + 9, fx, fy, 1, c);
    P.set(fx, fy, INK);
  }
  // white tail flag
  P.rect(10, by - 3, 3, 3, 0xf8f4ee);
  P.set(10, by - 3, body);
  // neck & head
  const graze = pose === 'graze';
  const hx = graze ? 34 : 35, hy = graze ? g - 6 : by - 11;
  limb(P, 30, by - 2, hx - 1, hy + 2, 4, body);
  P.ellipse(hx, hy, 3.2, 2.6, body);
  P.rect(hx + 2, hy, 3, 2, body);
  P.set(hx + 4, hy, INK);
  P.set(hx + 1, hy - 1, INK);
  P.poly([[hx - 2, hy - 1], [hx - 4, hy - 6], [hx - 1, hy - 2]], dark);
  P.poly([[hx, hy - 2], [hx + 0.5, hy - 7], [hx + 2, hy - 2]], body);
  if (t % 3 === 2 && !graze) P.poly([[hx, hy - 2], [hx + 2, hy - 6], [hx + 2, hy - 2]], body);
  P.rect(hx + 1, hy + 1, 3, 1, belly);
  if (buck) {
    const ac = 0xd8c8a0;
    limb(P, hx - 1, hy - 3, hx - 4, hy - 10, 1, ac);
    limb(P, hx - 3, hy - 7, hx - 7, hy - 9, 1, ac);
    limb(P, hx - 4, hy - 10, hx - 2, hy - 13, 1, ac);
    limb(P, hx + 1, hy - 3, hx + 3, hy - 10, 1, ac);
    limb(P, hx + 2, hy - 7, hx + 6, hy - 9, 1, ac);
  }
}

function moose(P, t, pose) {
  const body = 0x4a3020, dark = 0x2e1c12, leg = 0x8a7060, g = 55;
  const by = g - 24;
  P.ellipse(30, by, 15, 8.5, body);
  P.ellipse(38, by - 5, 7, 6, body); // shoulder hump
  const st = pose === 'walk' ? [3, 0, -3, 0][t % 4] : 0;
  for (const [lx, far] of [[19 + st, 1], [23 - st, 0], [38 - st, 1], [42 + st, 0]]) {
    const c = far ? shade(leg, -0.3) : leg;
    limb(P, lx, by + 5, lx, g - 1, 3, c);
    P.rect(lx - 1, g - 1, 3, 1, INK);
  }
  limb(P, 43, by - 4, 49, by + 2, 6, body);
  // long droopy face
  P.ellipse(51, by + 4, 4, 3.4, body);
  P.rect(52, by + 4, 6, 4, shade(body, 0.12));
  P.set(57, by + 5, INK);
  P.set(51, by + 2, INK);
  // bell (dewlap)
  limb(P, 50, by + 7, 50, by + 12, 2, dark);
  // palmate antlers
  const ac = 0xc8b48a;
  P.ellipse(44, by - 8, 6, 2.6, ac);
  P.ellipse(56, by - 7, 5, 2.4, ac);
  for (let i = 0; i < 4; i++) { P.set(39 + i * 2, by - 11, ac); P.set(53 + i * 2, by - 10, ac); }
  limb(P, 48, by - 2, 46, by - 6, 2, ac);
  limb(P, 52, by - 2, 54, by - 5, 2, ac);
  P.poly([[48, by], [46, by - 3], [49, by - 1]], body); // ear
  if (t % 3 === 1) P.set(46, by - 4, body);
}

// ---------------------------------------------------------------- birds & small critters
function goose(P, t, pose) {
  const body = 0x8a7a68, dark = 0x2a2420, white = 0xf4f0e8;
  if (pose === 'fly') {
    P.ellipse(10, 8, 6, 2.6, body);
    P.rect(4, 7, 3, 2, white);
    limb(P, 15, 7, 19, 6, 2, dark);
    P.rect(18, 5, 2, 2, dark);
    P.set(19, 6, white);
    const up = t % 2 === 0;
    P.poly(up ? [[7, 7], [12, 0], [14, 7]] : [[7, 9], [12, 14], [14, 9]], shade(body, -0.15));
  } else {
    P.ellipse(9, 9, 6, 3.4, body);
    P.rect(3, 8, 3, 2, white);
    limb(P, 13, 7, 15, 1 + (t % 2), 2, dark);
    P.rect(14, 0 + (t % 2), 3, 2, dark);
    P.set(15, 2 + (t % 2), white);
    P.set(17, 1 + (t % 2), 0x3a3030);
    limb(P, 8, 12, 8, 14, 1, 0x3a3030);
    limb(P, 11, 12, 11, 14, 1, 0x3a3030);
  }
}
function crow(P, t, pose) {
  const c = 0x24202e;
  if (pose === 'fly') {
    P.ellipse(7, 5, 4.5, 1.8, c);
    P.rect(11, 4, 2, 2, c);
    P.set(13, 5, 0x5a5a60);
    P.poly(t % 2 ? [[4, 4], [8, 0], [10, 4]] : [[4, 6], [8, 9], [10, 6]], shade(c, 0.1));
  } else {
    P.ellipse(6, 6, 3.4, 2.6, c);
    P.rect(8, 2 + (t % 2), 3, 3, c);
    P.set(11, 3 + (t % 2), 0x5a5a60);
    P.set(9, 3 + (t % 2), 0xf0f0f0);
    P.rect(1, 6, 3, 1, c);
    P.vline(5, 8, 9, 0x3a3030);
    P.vline(7, 8, 9, 0x3a3030);
  }
}
function songbird(P, t, pose, kind) {
  const body = kind === 'robin' ? 0x5a4a44 : 0x8a8a90;
  const breast = kind === 'robin' ? 0xe0702a : 0xf0e8e0;
  if (pose === 'fly') {
    P.ellipse(4, 3, 2.6, 1.4, body);
    P.set(6, 3, breast);
    P.poly(t % 2 ? [[2, 3], [4, 0], [5, 3]] : [[2, 3], [4, 6], [5, 3]], shade(body, 0.1));
  } else {
    P.ellipse(4, 4, 2.4, 2, body);
    P.rect(4, 4, 2, 2, breast);
    P.rect(5, 1 + (t % 2), 2, 2, kind === 'robin' ? 0x2a2420 : INK);
    if (kind !== 'robin') P.set(5, 2 + (t % 2), 0xf8f8f8);
    P.set(7, 2 + (t % 2), 0xe0a020);
    P.rect(0, 4, 2, 1, body);
  }
}
function squirrel(P, t, pose) {
  const c = 0xb85a28, l = 0xf0d8b8;
  if (pose === 'run') {
    P.ellipse(6, 6, 3.6, 2, c);
    P.ellipse(9, 4, 2, 1.8, c);
    P.set(10, 3, INK);
    P.set(9, 2, c);
    limb(P, 2, 5, 0, 1 + (t % 2), 2, c);
    P.set(0, 0 + (t % 2), shade(c, 0.2));
    limb(P, 4, 7, 3 + (t % 2) * 2, 8, 1, c);
    limb(P, 8, 7, 9 - (t % 2) * 2, 8, 1, c);
  } else {
    P.ellipse(6, 6, 2.4, 3, c);
    P.ellipse(6.5, 6.5, 1.4, 2.2, l);
    P.ellipse(7, 2.5, 2, 1.8, c);
    P.set(8, 2, INK);
    P.set(6, 0, c);
    limb(P, 3, 8, 1, 3, 2, c);
    limb(P, 1, 3, 2, 0 + (t % 2), 2, c);
    P.set(8, 4 + (t % 2), 0x6a3a1e); // acorn
  }
}
function beaver(P, t) {
  const c = 0x6a4228;
  P.ellipse(8, 6, 6, 3.4, c);
  P.ellipse(14, 5, 2.6, 2.4, c);
  P.set(15, 4, INK);
  P.rect(15, 6, 2, 1, 0xf0e0a0);
  P.ellipse(2, 7, 2.6, 1.4, 0x3a2a24);
  if (t % 2) P.set(16, 5, shade(c, 0.2));
}
function salmon(P, t) {
  const c = 0xc86a5a, b = 0x5a7a8a;
  P.ellipse(6, 3, 5, 1.8, c);
  P.hline(2, 9, 2, b);
  P.set(10, 2, INK);
  P.poly([[1, 3], [-1, 0 + t], [-1, 6 - t]], c);
}

export function paintAnimals(atlas) {
  paintCat(atlas);
  for (const buck of [false, true]) {
    const id = buck ? 'buck' : 'deer';
    for (let t = 0; t < 3; t++) frame(atlas, `${id}:idle:side:${t}`, 48, 40, 24, 39, (P) => deer(P, t, 'idle', buck));
    for (let t = 0; t < 2; t++) frame(atlas, `${id}:graze:side:${t}`, 48, 40, 24, 39, (P) => deer(P, t, 'graze', buck));
    for (let t = 0; t < 4; t++) frame(atlas, `${id}:walk:side:${t}`, 48, 40, 24, 39, (P) => deer(P, t, 'walk', buck));
    for (let t = 0; t < 2; t++) frame(atlas, `${id}:run:side:${t}`, 48, 40, 24, 39, (P) => deer(P, t, 'run', buck));
  }
  for (let t = 0; t < 3; t++) frame(atlas, `moose:idle:side:${t}`, 64, 56, 32, 55, (P) => moose(P, t, 'idle'));
  for (let t = 0; t < 4; t++) frame(atlas, `moose:walk:side:${t}`, 64, 56, 32, 55, (P) => moose(P, t, 'walk'));
  for (let t = 0; t < 2; t++) frame(atlas, `goose:fly:side:${t}`, 22, 16, 11, 8, (P) => goose(P, t, 'fly'));
  for (let t = 0; t < 2; t++) frame(atlas, `goose:walk:side:${t}`, 20, 16, 10, 15, (P) => goose(P, t, 'walk'));
  for (let t = 0; t < 2; t++) frame(atlas, `crow:fly:side:${t}`, 14, 10, 7, 5, (P) => crow(P, t, 'fly'));
  for (let t = 0; t < 2; t++) frame(atlas, `crow:idle:side:${t}`, 14, 10, 7, 9, (P) => crow(P, t, 'idle'));
  for (const kind of ['robin', 'chickadee']) {
    for (let t = 0; t < 2; t++) frame(atlas, `${kind}:fly:side:${t}`, 8, 7, 4, 3, (P) => songbird(P, t, 'fly', kind));
    for (let t = 0; t < 2; t++) frame(atlas, `${kind}:idle:side:${t}`, 8, 7, 4, 6, (P) => songbird(P, t, 'idle', kind));
  }
  for (let t = 0; t < 2; t++) frame(atlas, `squirrel:run:side:${t}`, 12, 10, 6, 9, (P) => squirrel(P, t, 'run'));
  for (let t = 0; t < 2; t++) frame(atlas, `squirrel:idle:side:${t}`, 12, 10, 6, 9, (P) => squirrel(P, t, 'idle'));
  for (let t = 0; t < 2; t++) frame(atlas, `beaver:swim:side:${t}`, 18, 10, 9, 8, (P) => beaver(P, t));
  for (let t = 0; t < 2; t++) frame(atlas, `salmon:jump:side:${t}`, 12, 7, 6, 3, (P) => salmon(P, t));
}
