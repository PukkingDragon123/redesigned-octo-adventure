// Dev tool: every food icon at 1x and Nx on cream paper.
// /tools/foodicons.html?scale=3&cols=8&only=cocoa,pie
import { FOOD_ICONS, FOOD_INFO, foodIcon } from '../src/art/foodsprites.js';

const P = new URLSearchParams(location.search);
const scale = +(P.get('scale') || 3);
const cols = +(P.get('cols') || 8);
let names = FOOD_ICONS;
if (P.get('only')) names = names.filter((n) => P.get('only').split(',').some((o) => n.includes(o)));
const grid = document.getElementById('grid');
grid.style.gridTemplateColumns = `repeat(${cols}, ${48 * scale + 52}px)`;

function draw(name, k) {
  const p = foodIcon(name);
  const cv = document.createElement('canvas');
  cv.width = 48 * k;
  cv.height = 48 * k;
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(p.toCanvas(), 0, 0, 48 * k, 48 * k);
  return cv;
}
for (const n of names) {
  const cell = document.createElement('div');
  cell.className = 'cell';
  const row = document.createElement('div');
  row.className = 'row';
  row.append(draw(n, scale), draw(n, 1));
  const info = FOOD_INFO[n] || {};
  const lbl = document.createElement('div');
  lbl.className = 'lbl';
  lbl.innerHTML = `${info.label || n} <b>$${info.price ?? '?'}</b>`;
  lbl.title = `${n} · ${info.kind || ''}`;
  cell.append(row, lbl);
  grid.append(cell);
}
window.__ready = window.__done = true;
