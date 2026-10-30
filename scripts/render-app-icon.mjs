import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { openBrowser } from './lib/browser.mjs';

const mark = await readFile('assets/brand/dairyos-mark-v2.svg', 'utf8');
const page = path.resolve('.private/dairyos-app-icon.html');
await writeFile(page, `<!doctype html><html><head><meta charset="utf-8"><style>*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#12372A}svg{display:block;width:100%;height:100%}</style></head><body>${mark}</body></html>`);
const folder = 'native/iphone/Assets.xcassets/AppIcon.appiconset';
await mkdir(folder, { recursive: true });
const browser = await openBrowser({ width: 1024, height: 1024, port: 9245, profile: '.private/icon-browser' });
const entries = [[20, 2], [20, 3], [29, 2], [29, 3], [40, 2], [40, 3], [60, 2], [60, 3]];
try {
  await browser.navigate(pathToFileURL(page).href);
  for (const size of [...new Set(entries.map(([points, scale]) => points * scale)), 1024]) {
    await browser.call('Emulation.setDeviceMetricsOverride', { width: size, height: size, deviceScaleFactor: 1, mobile: false });
    await browser.screenshot(size === 1024 ? 'assets/brand/app-icon-1024.png' : `${folder}/icon-${size}.png`);
    if (size === 1024) await browser.screenshot(`${folder}/icon-1024.png`);
  }
  await writeFile(`${folder}/Contents.json`, JSON.stringify({ images: [...entries.map(([points, scale]) => ({ idiom: 'iphone', size: `${points}x${points}`, scale: `${scale}x`, filename: `icon-${points * scale}.png` })), { idiom: 'ios-marketing', size: '1024x1024', scale: '1x', filename: 'icon-1024.png' }], info: { author: 'xcode', version: 1 } }, null, 2) + '\n');
  await writeFile('native/iphone/Assets.xcassets/Contents.json', JSON.stringify({ info: { author: 'xcode', version: 1 } }, null, 2) + '\n');
  console.log('Rendered the official DairyOS mark into opaque iPhone app icons.');
} finally { browser.close(); }
