// Screenshot harness for SALTWORKS: serves game/ on :8080, loads each ?shot= URL in
// headless Chromium (SwiftShader), waits for window.__shotReady, captures PNG, then
// converts to JPEG q82 into screenshots/ and reports JS errors + mean brightness.
// Run: node shots.mjs  (from this directory; expects `node serve.ts` to be running
// on :8080, or start it first in another terminal)
import { chromium } from 'playwright-core';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const shots = JSON.parse(readFileSync('shots.json', 'utf8'));
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', (msg) => { if (msg.type() === 'error') console.log('[console]', msg.text()); });
page.on('pageerror', (err) => console.log('[pageerror]', String(err)));

for (const shot of shots) {
  const url = `http://localhost:8080/${shot.query}`;
  await page.goto(url, { waitUntil: 'load', timeout: 60000 });
  try {
    await page.waitForFunction(() => window.__shotReady === true, null, { timeout: 60000 });
  } catch {
    console.log(`${shot.name}: TIMEOUT waiting for __shotReady`);
    const errors = await page.evaluate(() => window.__errors || []);
    console.log('  errors:', JSON.stringify(errors));
    continue;
  }
  const errors = await page.evaluate(() => window.__errors || []);
  const png = `/tmp/saltworks-${shot.name}.png`;
  await page.screenshot({ path: png });
  console.log(`${shot.name}: captured | errors=${JSON.stringify(errors)}`);
}
await browser.close();

// PNG -> JPEG q82 (keeps each shot under the 256 KiB cap) + brightness check.
for (const shot of shots) {
  const png = `/tmp/saltworks-${shot.name}.png`;
  if (!existsSync(png)) {
    console.log(`${shot.name}: no PNG, skipped conversion`);
    continue;
  }
  const jpg = `screenshots/${shot.name}`;
  execFileSync('python3', ['-c', `
from PIL import Image
import os
im = Image.open('${png}').convert('RGB')
im.save('${jpg}', 'JPEG', quality=82)
px = list(im.resize((64, 36)).getdata())
mean = sum(sum(p) for p in px) / (len(px) * 3)
print('${shot.name}:', os.path.getsize('${jpg}'), 'bytes, mean brightness', round(mean, 1))
`]);
}
