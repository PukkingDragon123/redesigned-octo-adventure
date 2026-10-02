// Kit / icon / bubble preview without the 3D game: /tools/uipreview.html?page=kit
import '../src/ui/base.css';
import '../src/ui/kit.css';
import * as K from '../src/ui/kit.js';
import { iconURL, glyphURL, ALL_ICON_NAMES, GLYPH_NAMES } from '../src/art/icons.js';

const q = new URLSearchParams(location.search);
if (q.get('bg')) document.getElementById('bg').style.backgroundImage = `url(${q.get('bg')})`;
const t0 = performance.now();
K.installKit({ offset: +(q.get('ui') || 0) });
K.kitReady();
console.log(`kit installed in ${(performance.now() - t0).toFixed(1)} ms`);
const root = document.getElementById('ui');
const page = q.get('page') || 'kit';
const { el } = K;
const box = (style = '') => { const d = el('div'); d.style.cssText = `display:flex;flex-wrap:wrap;gap:calc(var(--u)*6);align-items:flex-start;padding:calc(var(--u)*6);${style}`; root.appendChild(d); return d; };

if (page === 'kit') {
  const a = box();
  const p1 = K.kPanel('leather');
  p1.innerHTML = '<div class="k-h">Harold\'s Garage</div>Leather panel with gold<br>filigree corners.';
  const p2 = K.kPanel('parchment');
  p2.innerHTML = '<div class="k-h">Nana\'s list</div>Parchment page inside<br>the same frame. 0123456789 $';
  const p3 = K.kPanel('dark');
  p3.innerHTML = '<div class="k-h">Dark</div>For captions & HUD.';
  a.append(p1, p2, p3);
  const b = box();
  b.append(K.kButton("Let's ride!"), Object.assign(K.kButton('Hover'), { className: 'k-btn sel' }), Object.assign(K.kButton('Pressed'), { className: 'k-btn down' }), K.kButton('Disabled', null, { disabled: true }), K.kButton('Quit', null, { face: 'red' }), K.kButton('Go', null, { face: 'green', small: 'two lines' }));
  const c = box();
  c.append(K.kSlot(iconURL('lantern')), K.kSlot(iconURL('clock'), { state: 'sel' }), K.kSlot('', { state: 'empty' }), K.kSlot(iconURL('keys'), { state: 'locked' }), K.kSlot(glyphURL('star'), { cls: 'small' }), K.kSlot(glyphURL('heart'), { cls: 'small sel' }));
  const tabs = K.kTabs(['Moves', 'Tricks', 'Notes'], null, 0);
  const tp = K.kPanel('leather');
  tp.style.width = 'calc(var(--u)*140)';
  tp.innerHTML = 'Tabs sit on top of a panel.';
  const tw = el('div');
  tw.append(tabs, tp);
  c.append(tw);
  const d = box();
  const list = K.kList('dark');
  list.style.cssText = 'width:calc(var(--u)*110);height:calc(var(--u)*60)';
  list.innerHTML = Array.from({ length: 9 }, (_, i) => `<div class="k-row"><img class="k-g" src="${glyphURL(i % 2 ? 'boxOn' : 'box')}">Line ${i + 1}</div>`).join('');
  d.append(list);
  const bars = el('div', 'k-stack');
  bars.style.width = 'calc(var(--u)*90)';
  bars.append(K.kBar(0.7, 'gold'), K.kBar(0.45, 'grow'), K.kBar(0.9, 'heat'), K.kBar(0.2, 'blue'));
  d.append(bars);
  const ctr = el('div', 'k-stack');
  ctr.append(K.kToggle(false), K.kToggle(true), K.kSlider(0.6, 0, 1, 0.05), K.kClose());
  d.append(ctr);
  const tip = K.kTip('A tooltip');
  tip.style.marginTop = 'calc(var(--u)*4)';
  d.append(tip, K.kCount('x3'), K.kRibbon('The Skill Book'), K.kRibbon('Day 3', 'green'));
  const keys = el('div', 'k-row k-text');
  keys.innerHTML = `${K.kKey('E')} ${K.kKey('Esc')} ${K.kKey('Space')} <span class="k-shadow" style="color:#fff4dc">Talk</span>`;
  d.append(keys);
  const e = box();
  const { book, left, right } = K.kBook();
  left.innerHTML = '<div class="k-h">Left page</div>Books are two pages<br>with a spine.';
  right.innerHTML = '<div class="k-h">Right page</div>The quick brown fox<br>jumps over the lazy dog.';
  const cover = K.kPanel('leather');
  cover.style.width = 'calc(var(--u)*240)';
  cover.append(book);
  e.append(cover);
  const n = el('div', 'k-paper k-text', 'A paper note with a deckled edge.');
  const nn = el('div', 'k-news k-text', 'THE MAPLE COVE GAZETTE');
  e.append(n, nn);
}

if (page === 'icons') {
  const a = box();
  for (const n of ALL_ICON_NAMES) { const s = K.kSlot(iconURL(n)); s.title = n; a.appendChild(s); }
  const b = box();
  for (const n of GLYPH_NAMES) { const s = K.kSlot(glyphURL(n), { cls: 'small' }); s.title = n; b.appendChild(s); }
}

if (page === 'bubbles' || page === 'hud') {
  try {
    const m = await import(`./uipreview-${page}.js`);
    m.default(root, K);
  } catch (e) {
    console.error('preview failed', e?.message, e?.stack);
  }
}
window.__ready = true;
window.__done = true;
