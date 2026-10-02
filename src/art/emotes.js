// Little speech-bubble emotes that pop above characters' heads.
import { shade } from './pixel.js';

export const EMOTES = ['alert', 'question', 'heart', 'dots', 'zzz', 'note', 'anger', 'sweat', 'star', 'coin', 'cocoa', 'skull', 'cold', 'gun'];

const INK = 0x2a1a1e;
const BUBBLE = 0xfff8ec;

function bubble(p, x, y) {
  // rounded bubble 14x12 with a tail
  p.rect(x + 2, y + 1, 12, 10, BUBBLE);
  p.rect(x + 1, y + 2, 14, 8, BUBBLE);
  p.rect(x + 7, y + 11, 2, 1, BUBBLE);
  p.set(x + 8, y + 12, BUBBLE);
  // outline
  p.hline(x + 2, x + 13, y, INK);
  p.hline(x + 2, x + 6, y + 11, INK);
  p.hline(x + 9, x + 13, y + 11, INK);
  p.vline(x, y + 2, y + 9, INK);
  p.vline(x + 15, y + 2, y + 9, INK);
  p.set(x + 1, y + 1, INK);
  p.set(x + 14, y + 1, INK);
  p.set(x + 1, y + 10, INK);
  p.set(x + 14, y + 10, INK);
  p.set(x + 7, y + 12, INK);
  p.set(x + 9, y + 12, INK);
  p.set(x + 8, y + 13, INK);
  p.hline(x + 2, x + 13, y + 10, shade(BUBBLE, -0.12));
}

export function drawEmote(p, x, y, e) {
  bubble(p, x, y);
  const cx = x + 8, cy = y + 6;
  switch (e) {
    case 'alert':
      p.rect(cx - 1, cy - 4, 2, 6, 0xd8301e);
      p.rect(cx - 1, cy + 3, 2, 2, 0xd8301e);
      break;
    case 'question':
      p.hline(cx - 2, cx + 1, cy - 4, 0x2a5ab0);
      p.set(cx - 3, cy - 3, 0x2a5ab0);
      p.vline(cx + 2, cy - 3, cy - 1, 0x2a5ab0);
      p.set(cx + 1, cy, 0x2a5ab0);
      p.vline(cx, cy, cy + 1, 0x2a5ab0);
      p.set(cx, cy + 3, 0x2a5ab0);
      break;
    case 'heart':
      p.rect(cx - 4, cy - 3, 3, 3, 0xe03050);
      p.rect(cx + 1, cy - 3, 3, 3, 0xe03050);
      p.rect(cx - 4, cy - 1, 8, 2, 0xe03050);
      p.rect(cx - 3, cy + 1, 6, 1, 0xe03050);
      p.rect(cx - 2, cy + 2, 4, 1, 0xe03050);
      p.rect(cx - 1, cy + 3, 2, 1, 0xe03050);
      p.set(cx - 3, cy - 2, 0xff90a0);
      break;
    case 'dots':
      for (let i = -1; i <= 1; i++) p.rect(cx + i * 3 - 1, cy, 2, 2, INK);
      break;
    case 'zzz':
      p.hline(cx - 4, cx - 1, cy - 3, 0x5a6ab0);
      p.set(cx - 2, cy - 2, 0x5a6ab0);
      p.hline(cx - 4, cx - 1, cy - 1, 0x5a6ab0);
      p.hline(cx, cx + 3, cy + 1, 0x5a6ab0);
      p.set(cx + 2, cy + 2, 0x5a6ab0);
      p.set(cx + 1, cy + 3, 0x5a6ab0);
      p.hline(cx, cx + 3, cy + 4, 0x5a6ab0);
      break;
    case 'note':
      p.vline(cx + 1, cy - 4, cy + 2, INK);
      p.rect(cx - 2, cy + 1, 3, 3, INK);
      p.hline(cx + 1, cx + 3, cy - 4, INK);
      p.set(cx + 3, cy - 3, INK);
      break;
    case 'anger':
      for (const [dx, dy] of [[-3, -3], [2, -3], [-3, 2], [2, 2]]) {
        p.rect(cx + dx, cy + dy, 2, 1, 0xd8301e);
        p.rect(cx + dx + (dx < 0 ? 1 : 0), cy + dy + (dy < 0 ? 1 : -1), 1, 1, 0xd8301e);
      }
      break;
    case 'sweat':
      p.set(cx, cy - 3, 0x5ab0e0);
      p.rect(cx - 1, cy - 2, 3, 2, 0x5ab0e0);
      p.rect(cx - 2, cy, 5, 3, 0x5ab0e0);
      p.rect(cx - 1, cy + 3, 3, 1, 0x5ab0e0);
      p.set(cx - 1, cy, 0xc0e8ff);
      break;
    case 'star':
      p.rect(cx - 1, cy - 4, 2, 9, 0xf2c443);
      p.rect(cx - 4, cy - 1, 8, 2, 0xf2c443);
      p.rect(cx - 2, cy - 2, 4, 4, 0xf2c443);
      p.set(cx, cy - 1, 0xfff4b0);
      break;
    case 'coin':
      p.circle(cx, cy, 4, 0xe8a820);
      p.circle(cx, cy, 3, 0xf6d050);
      p.vline(cx, cy - 2, cy + 2, 0xb07818);
      break;
    case 'cocoa':
      p.rect(cx - 3, cy - 1, 6, 5, 0xf4ecdc);
      p.hline(cx - 3, cx + 2, cy - 1, 0x6a3a1e);
      p.rect(cx + 3, cy, 2, 3, 0xf4ecdc);
      p.set(cx + 3, cy + 1, BUBBLE);
      p.set(cx - 2, cy - 3, 0xd8d0c8);
      p.set(cx, cy - 4, 0xd8d0c8);
      p.set(cx + 1, cy - 3, 0xd8d0c8);
      break;
    case 'skull':
      p.rect(cx - 3, cy - 3, 6, 5, 0xf0eadc);
      p.rect(cx - 2, cy + 2, 4, 2, 0xf0eadc);
      p.rect(cx - 2, cy - 1, 2, 2, INK);
      p.rect(cx + 1, cy - 1, 2, 2, INK);
      p.set(cx, cy + 2, INK);
      break;
    case 'cold':
      for (const [dx, dy] of [[0, -4], [0, 3], [-3, -2], [3, -2], [-3, 2], [3, 2]]) p.set(cx + dx, cy + dy, 0x8ad0f0);
      p.vline(cx, cy - 3, cy + 2, 0x5aa8e0);
      p.line(cx - 3, cy - 2, cx + 3, cy + 2, 0x5aa8e0);
      p.line(cx - 3, cy + 2, cx + 3, cy - 2, 0x5aa8e0);
      break;
    case 'gun':
      p.hline(cx - 4, cx + 4, cy - 1, INK);
      p.rect(cx - 5, cy - 1, 3, 3, 0x6a3a1e);
      p.hline(cx - 4, cx + 4, cy - 2, 0x5a5a64);
      break;
  }
}
