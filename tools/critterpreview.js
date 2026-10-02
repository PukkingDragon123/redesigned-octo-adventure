// Contact sheet of the 2D wildlife sprites: /tools/critterpreview.html?kind=deer,fawn&scale=2&bg=6a8a4a&play
// Rows are animation frames, columns are views. ?atlas shows the packed atlas instead.
import { SpriteAtlas } from '../src/render/sprites.js';
import { paintCritters, CRITTERS, VIEW_ORDER } from '../src/art/critters2d.js';

const q = new URLSearchParams(location.search);
const kinds = (q.get('kind') || Object.keys(CRITTERS).join(',')).split(',').filter((k) => CRITTERS[k]);
const anims = q.get('anim')?.split(',');
const scale = +(q.get('scale') || 2);
if (q.get('bg')) document.body.style.background = '#' + q.get('bg');
const atlas = new SpriteAtlas(2048);
const ms = paintCritters(atlas, q.has('atlas') ? Object.keys(CRITTERS) : kinds);
const src = atlas.pix.toCanvas();
const cv = document.getElementById('c');
const ctx = cv.getContext('2d');
document.getElementById('lbl').textContent = `${atlas.frames.size} frames in ${ms.toFixed(0)}ms, atlas used to y=${atlas.shelfY + atlas.shelfH}`;
if (q.has('atlas')) {
  const used = atlas.shelfY + atlas.shelfH;
  cv.width = 2048 * scale; cv.height = used * scale;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(src, 0, 0, 2048, used, 0, 0, cv.width, cv.height);
  window.__done = true;
} else {
  const rows = [];
  for (const kind of kinds) {
    for (const [anim, A] of Object.entries(CRITTERS[kind].anims)) {
      if (anims && !anims.includes(anim)) continue;
      for (let i = 0; i < A.n; i++) rows.push({ kind, anim, i, A });
    }
  }
  let cellW = 0, cellH = 0;
  for (const f of atlas.frames.values()) { cellW = Math.max(cellW, f.w); cellH = Math.max(cellH, f.h); }
  const views = q.get('views')?.split(',') || VIEW_ORDER;
  const pad = 6;
  const play = q.has('play');
  const groups = play ? rows.filter((r) => r.i === 0) : rows;
  const tableW = (cellW * scale + pad) * views.length + 110;
  const perCol = Math.max(1, Math.floor((window.innerHeight - 20) / (cellH * scale + pad)));
  const nCols = Math.ceil(groups.length / perCol);
  cv.width = tableW * nCols;
  cv.height = Math.min(groups.length, perCol) * (cellH * scale + pad) + 20;
  const draw = (t) => {
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.imageSmoothingEnabled = false;
    groups.forEach((r, n) => {
      const col = Math.floor(n / perCol), row = n % perCol;
      const ox = col * tableW, oy = 18 + row * (cellH * scale + pad);
      const fi = play ? Math.floor(t * (r.anim === 'run' || r.anim.startsWith('fly') ? 10 : 5)) % r.A.n : r.i;
      ctx.fillStyle = '#fff';
      ctx.fillText(`${r.kind}:${r.anim}:${fi}`, ox + 2, oy + 12);
      views.forEach((v, k) => {
        const f = atlas.get(`${r.kind}:${r.anim}:${v}:${fi}`);
        if (!f) return;
        const cx = ox + 110 + k * (cellW * scale + pad) + (cellW * scale) / 2;
        const gy = oy + cellH * scale - 4 * scale;
        ctx.fillStyle = 'rgba(0,0,0,0.12)';
        ctx.fillRect(cx - (cellW * scale) / 2, oy, cellW * scale, cellH * scale);
        ctx.drawImage(src, f.x, f.y, f.w, f.h, cx - f.ax * scale, gy - f.ay * scale, f.w * scale, f.h * scale);
      });
    });
  };
  if (play) { const loop = (now) => { draw(now / 1000); requestAnimationFrame(loop); }; requestAnimationFrame(loop); }
  else draw(0);
  window.__done = true;
}
