// Dev tool: every face texture drawn flat and upscaled, characters x expressions.
// /tools/facesheet.html?only=grandma,marie&exprs=neutral,happy&scale=4&blink=1&talk=2&crowd=6&look=1,0
import { CHARACTERS, buildHead } from '../src/voxel/models/characters.js';
import { FaceTex, EXPRESSIONS, hexRGB } from '../src/voxel/faces.js';
import { dressTownsperson, ROSTER } from '../src/game/crowdGen.js';

const P = new URLSearchParams(location.search);
const scale = +(P.get('scale') || 4);
const specs = (P.get('only') ? P.get('only').split(',') : Object.keys(CHARACTERS)).map((id) => [id, CHARACTERS[id]]);
for (let i = 0; i < +(P.get('crowd') || 0); i++) specs.push([`crowd${i}`, dressTownsperson(ROSTER[i % ROSTER.length], i + 1)]);
const exprs = P.get('exprs') ? P.get('exprs').split(',') : EXPRESSIONS;
const look = (P.get('look') || '0,0').split(',').map(Number);
const cells = specs.map(([id, spec]) => {
  const head = buildHead(spec);
  return { id, spec, rect: head.face };
});
const cw = Math.max(...cells.map((c) => (c.rect.x1 - c.rect.x0) * 5)) + 4;
const ch = Math.max(...cells.map((c) => (c.rect.y1 - c.rect.y0) * 5)) + 4;
const cv = document.getElementById('c');
const top = 14, left = 70;
cv.width = (left + exprs.length * cw * scale);
cv.height = top + cells.length * ch * scale;
const g = cv.getContext('2d');
g.imageSmoothingEnabled = false;
g.fillStyle = '#eee';
exprs.forEach((e, i) => g.fillText(e, left + i * cw * scale + 2, 10));
cells.forEach((c, j) => {
  g.fillStyle = '#eee';
  g.fillText(c.id, 2, top + j * ch * scale + 12);
  exprs.forEach((e, i) => {
    const f = new FaceTex(c.spec, c.rect);
    f.update({ expr: e, blink: +(P.get('blink') || 0), talk: +(P.get('talk') || 0) / 3, look, t: +(P.get('t') || 0) });
    const img = g.createImageData(f.W, f.H);
    const sk = hexRGB(c.spec.skin);
    for (let y = 0; y < f.H; y++) for (let x = 0; x < f.W; x++) {
      const si = ((f.H - 1 - y) * f.W + x) * 4, di = (y * f.W + x) * 4;
      const a = f.data[si + 3];
      const glow = a > 0 && a < 192;
      img.data[di] = a ? f.data[si] : glow ? 0 : sk[0];
      img.data[di + 1] = a ? f.data[si + 1] : sk[1];
      img.data[di + 2] = a ? f.data[si + 2] : sk[2];
      if (!a && f.skull) { img.data[di] = sk[0]; }
      img.data[di + 3] = 255;
    }
    const tmp = document.createElement('canvas');
    tmp.width = f.W; tmp.height = f.H;
    tmp.getContext('2d').putImageData(img, 0, 0);
    g.drawImage(tmp, left + i * cw * scale, top + j * ch * scale, f.W * scale, f.H * scale);
  });
});
window.__ready = window.__done = true;
