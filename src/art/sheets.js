// Paints every sprite frame the game needs into one atlas.
import { CHARACTERS, poseFrame, drawRider, drawPart, FOOT_FRAME, RIDE_FRAME } from './characters.js';
import { drawEmote, EMOTES } from './emotes.js';
import { paintAnimals } from './animals.js';

const COMMON = {
  idle: [2, ['front', 'side', 'back']],
  walk: [4, ['front', 'side', 'back']],
  talk: [2, ['front', 'side']],
  wave: [2, ['front', 'side']],
  scared: [2, ['front', 'side', 'back']],
  cheer: [2, ['front']],
  hold: [1, ['front', 'side', 'back']],
  sip: [2, ['front', 'side']],
  offer: [1, ['front', 'side']],
  point: [1, ['front', 'side']],
  shrug: [1, ['front']],
};
const EXTRA = {
  hank: { crawl: [2, ['front']], shiver: [2, ['front', 'side']], sit: [1, ['front', 'side']], eat: [3, ['front', 'side']], handsup: [2, ['front', 'side']] },
  hankBuried: { crawl: [2, ['front']], shiver: [2, ['front', 'side', 'back']], handsup: [2, ['front', 'side']], 'walk+shiver': [4, ['front', 'side', 'back']] },
  grandma: { lantern: [2, ['front', 'side', 'back']], 'walk+lantern': [4, ['front', 'side', 'back']], hug: [1, ['front']], 'walk+hold': [4, ['front', 'side', 'back']] },
  reaper: { float: [2, ['front', 'side', 'back']], facepalm: [1, ['front', 'side']], clipboard: [1, ['front', 'side']], scythe: [1, ['front', 'side']] },
  gus: { aim: [2, ['front', 'side']], gun: [2, ['front', 'side']] },
  agnes: { knit: [2, ['front']] },
  pip: { hockey: [2, ['front', 'side']] },
  pop: { hockey: [2, ['front', 'side']] },
};
const MAIN = new Set(['hank', 'hankBuried', 'grandma', 'reaper', 'gus']);
const EXPR_MAIN = ['happy', 'sad', 'scared', 'surprised', 'angry', 'sheepish', 'laugh', 'blink', 'shock'];
const EXPR_MINOR = ['happy', 'scared', 'surprised', 'sad', 'blink'];
export const RIDE_POSES = { pedal: 8, stand: 4, coast: 1, brake: 1, air: 1, glide: 1, drift: 1, idle: 1, crash: 1 };

export function frameName(char, anim, view, frame, expr) {
  return expr && expr !== 'neutral' ? `${char}:${anim}:${view}:${frame}:${expr}` : `${char}:${anim}:${view}:${frame}`;
}

export function buildSheets(atlas) {
  const F = FOOT_FRAME, R = RIDE_FRAME;
  const t0 = performance.now();
  for (const [id, spec] of Object.entries(CHARACTERS)) {
    const anims = { ...COMMON, ...(EXTRA[id] || {}) };
    for (const [anim, [n, views]] of Object.entries(anims)) {
      for (const view of views) {
        for (let f = 0; f < n; f++) {
          atlas.add(frameName(id, anim, view, f), F.w, F.h, (p, x, y) => poseFrame(p, x, y, spec, anim, view, f, anim === 'talk' ? 'talk' : 'neutral'), F.w / 2, 45);
        }
      }
    }
    // expressions on idle + talk
    const exprs = MAIN.has(id) ? EXPR_MAIN : EXPR_MINOR;
    for (const expr of exprs) {
      for (const anim of ['idle', 'talk']) {
        for (const view of ['front', 'side']) {
          for (let f = 0; f < 2; f++) {
            atlas.add(frameName(id, anim, view, f, expr), F.w, F.h, (p, x, y) => poseFrame(p, x, y, spec, anim, view, f, anim === 'talk' && f === 1 ? exprTalk(expr) : expr), F.w / 2, 45);
          }
        }
      }
    }
  }
  // riding frames for Hank (both outfits)
  for (const id of ['hank', 'hankBuried']) {
    const spec = CHARACTERS[id];
    for (const [pose, n] of Object.entries(RIDE_POSES)) {
      for (const view of ['back', 'side', 'front']) {
        for (let f = 0; f < n; f++) {
          const p0 = pose === 'idle' || pose === 'coast' || pose === 'crash' ? 'pedal' : pose;
          atlas.add(`${id}:ride:${pose}:${view}:${f}`, R.w, R.h, (p, x, y) => drawRider(p, x, y, spec, view, p0, n > 1 ? f / n : pose === 'coast' ? 0.25 : 0, pose === 'air' ? 'happy' : 'neutral'), R.hipX, R.hipY);
        }
      }
    }
    for (const part of ['head', 'torso', 'arm', 'leg', 'hat']) {
      atlas.add(`${id}:part:${part}`, 24, 24, (p, x, y) => drawPart(p, x, y, spec, part), 12, 12);
    }
  }
  for (const e of EMOTES) atlas.add(`emote:${e}`, 16, 16, (p, x, y) => drawEmote(p, x, y, e), 8, 16);
  paintAnimals(atlas);
  return performance.now() - t0;
}

function exprTalk(expr) {
  // the open-mouth version of an expression for talking
  if (expr === 'happy' || expr === 'laugh') return 'laugh';
  if (expr === 'scared' || expr === 'shock') return 'shock';
  if (expr === 'surprised') return 'surprised';
  return 'talk';
}
