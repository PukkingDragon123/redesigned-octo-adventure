// node tools/gameshot.mjs "<query>" out.png [w h] -- loads the game, runs JS steps (STEPS env, ';;' separated, each followed by a wait), screenshots
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const [q, out, w = 1280, h = 720] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
const logs = [];
page.on('console', (m) => { if (!m.text().includes('[vite]')) logs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack?.split('\n').slice(0, 4).join('\n')}`));
await page.goto(`http://localhost:5173/${q}`);
try { await page.waitForFunction(() => window.__ready === true, null, { timeout: 300000 }); } catch { logs.push('TIMEOUT ready'); }
for (const step of (process.env.STEPS || '').split(';;').filter(Boolean)) {
  try { const r = await page.evaluate(step); if (r !== undefined) logs.push('=> ' + JSON.stringify(r).slice(0, 400)); } catch (e) { logs.push('STEP ERR ' + e.message); }
}
try { await page.waitForFunction(() => window.__done === true, null, { timeout: 300000 }); } catch { logs.push('TIMEOUT done'); }
await page.screenshot({ path: out });
console.log(logs.slice(0, 60).join('\n'));
await browser.close();
