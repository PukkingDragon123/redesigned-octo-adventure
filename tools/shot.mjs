import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const url = process.argv[2];
const out = process.argv[3];
const wait = +(process.argv[4] || 4000);
const w = +(process.argv[5] || 1280), h = +(process.argv[6] || 720);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: w, height: h } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto(url);
try { await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 }); } catch (e) { logs.push('TIMEOUT waiting ready'); }
await page.waitForTimeout(wait);
try { await page.waitForFunction(() => window.__done === true || !location.search.includes('frames='), null, { timeout: 240000 }); } catch (e) { logs.push('TIMEOUT waiting done'); }
if (process.env.EVAL) { try { const r = await page.evaluate(process.env.EVAL); if (r !== undefined) logs.push('EVAL: ' + JSON.stringify(r)); } catch (e) { logs.push('EVAL ERR ' + e.message); } await page.waitForTimeout(+(process.env.WAIT2 || 1500)); }
const fps = await page.evaluate(() => window.__frames || 0);
await page.screenshot({ path: out, timeout: 120000 });
console.log('frames rendered:', fps);
console.log(logs.slice(0, 40).join('\n'));
await browser.close();
