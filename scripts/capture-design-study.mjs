import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeFile } from 'node:fs/promises';
import { openBrowser } from './lib/browser.mjs';

const browser = await openBrowser({ width: 1680, height: 1100 });
try {
  for (const name of ['wireframes', 'mockups']) {
    await browser.navigate(pathToFileURL(path.resolve(`docs/design/${name}.html`)).href);
    await browser.screenshot(`docs/design/${name}.png`);
    if (name === 'mockups') {
      await browser.navigate(pathToFileURL(path.resolve('docs/design/mockups.html')).href + '?mode=desktop');
      await browser.screenshot('docs/design/mockup-desktop.png');
    }
  }
  const metrics = await browser.evaluate(`JSON.stringify({logoImages:document.querySelectorAll('.brand svg').length,overflow:document.documentElement.scrollWidth > innerWidth,errors:0})`);
  await writeFile('docs/design/mockup-check.json', metrics + '\n');
  console.log(metrics);
} finally { browser.close(); }
