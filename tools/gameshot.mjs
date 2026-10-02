// node tools/gameshot.mjs "<query>" out.png [w h] -- loads the game, runs JS steps (STEPS env, ';;' separated, each followed by a wait), screenshots
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const [q, out, w = 1280, h = 720] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const mobile = !!process.env.MOBILE;
const page = await browser.newPage({ viewport: { width: +w, height: +h }, hasTouch: mobile, isMobile: mobile, deviceScaleFactor: mobile ? 2 : 1 });
const logs = [];
page.on('console', (m) => { if (!m.text().includes('[vite]')) logs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack?.split('\n').slice(0, 4).join('\n')}`));
await page.goto(q.startsWith("file:") || q.startsWith("http") ? q : `http://localhost:${process.env.PORT || 5173}/${q}`);
try { await page.waitForFunction(() => window.__ready === true, null, { timeout: 300000 }); } catch { logs.push('TIMEOUT ready'); }
for (const step of (process.env.STEPS || '').split(';;').filter(Boolean)) {
  try { const r = await page.evaluate(step); if (r !== undefined) logs.push('=> ' + JSON.stringify(r).slice(0, 400)); } catch (e) { logs.push('STEP ERR ' + e.message); }
}
// SHOTS="120:a.png,240:b.png" grabs extra screenshots as the frame counter passes those marks
for (const spec of (process.env.SHOTS || '').split(',').filter(Boolean)) {
  const [n, file] = spec.split(':');
  try { await page.waitForFunction((k) => (window.__frames || 0) >= k, +n, { timeout: 600000, polling: 200 }); await page.screenshot({ path: file, timeout: 180000 }); } catch (e) { logs.push('SHOT ERR ' + e.message); }
}
try { await page.waitForFunction(() => window.__done === true, null, { timeout: 600000 }); } catch { logs.push('TIMEOUT done'); }
await page.screenshot({ path: out, timeout: 180000 });
console.log(logs.slice(0, 60).join('\n'));
await browser.close();
