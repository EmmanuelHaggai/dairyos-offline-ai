import { openBrowser } from './lib/browser.mjs';
import { writeFile } from 'node:fs/promises';
const browser = await openBrowser({ width: 390, height: 844, port: 9250, profile: '.private/ble-browser' });
const checks = [];
const click = async label => { await browser.evaluate(`(() => { const e=document.querySelector('[aria-label='+JSON.stringify(${JSON.stringify(label)})+']');if(!e)throw new Error('Missing '+${JSON.stringify(label)});if(e.getAttribute('aria-disabled')==='true')throw new Error('Disabled '+${JSON.stringify(label)});e.click()})()`); await browser.pause(150); };
const body = text => `document.body.textContent.includes(${JSON.stringify(text)})`;
const check = async (name, expression) => { await browser.until(expression); checks.push(name); };
try {
  await browser.navigate('http://127.0.0.1:8786'); await browser.until(body('Your farm, at hand.'));
  await click('Devices'); await check('Unconnected readings unknown', body('No sensor reading received'));
  await check('ON disabled without board', `document.querySelector('[aria-label="Turn bulb 1 on"]').getAttribute('aria-disabled')==='true'`);
  await click('Start BLE simulator'); await check('Simulation explicitly labeled', body('SIMULATION · no real hardware'));
  await check('Temperature and humidity rendered', `${body('25 °C')} && ${body('60%')}`);
  await check('Normally-ON bulb starts ON with relay OFF', `${body('Bulb 1 · ON')} && ${body('Normally ON · relay OFF turns this bulb ON')}`);
  await click('Turn bulb 1 off'); await check('Normally-ON OFF waits for review', `${body('Confirm Bulb 1 OFF for 10 seconds (relay ON)')} && ${body('Bulb 1 · ON')}`);
  await click('Cancel command'); await check('Cancel leaves bulb ON', body('Bulb 1 · ON'));
  await click('Turn bulb 1 off'); await click('Confirm bulb command'); await check('Normally-ON OFF energizes relay', `${body('Bulb 1 · OFF')} && ${body('SIMULATION: bulb 1 OFF (relay ON).')}`);
  await click('Turn bulb 1 on'); await click('Confirm bulb command'); await check('Normally-ON ON releases relay', `${body('Bulb 1 · ON')} && ${body('SIMULATION: bulb 1 ON (relay OFF).')}`);
  await click('Turn bulb 2 on'); await click('Confirm bulb command'); await check('Second output independently ON', `${body('Bulb 1 · ON')} && ${body('Bulb 2 · ON')}`);
  for (const width of [320, 390, 428, 768, 1280]) {
    await browser.viewport(width, width < 768 ? 926 : 1000); await browser.pause(100);
    const bad = await browser.evaluate(`({overflow:document.documentElement.scrollWidth>${width},small:[...document.querySelectorAll('[role=button],[role=tab],input')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&(r.width<43.5||r.height<43.5)}).map(e=>e.getAttribute('aria-label'))})`);
    if (bad.overflow || bad.small.length) throw new Error(JSON.stringify({width,...bad}));
    checks.push(`Devices fits ${width}px with 44px controls`);
    if (width === 390 || width === 1280) await browser.screenshot(`docs/design/screens/ble-devices-${width}.png`);
  }
  const lastUpdated = await browser.evaluate(`document.body.textContent.match(/Last updated ([^·]+)/)?.[1].trim()`);
  await click('Disconnect'); await check('Disconnect retains last values with original timestamp and stale status', `${body('25 °C')} && ${body('60%')} && !${body('stale; no valid sensor update for 5 minutes')} && ${body('Bulb 2 · last reported ON')}`);
  await check('Retained readings cannot enable controls', `document.querySelector('[aria-label="Turn bulb 1 on"]').getAttribute('aria-disabled')==='true'`);
  if (await browser.evaluate(`document.body.textContent.match(/Last updated ([^·]+)/)?.[1].trim()`) !== lastUpdated) throw new Error('Disconnect changed the original measurement timestamp');
  checks.push('Last-updated timestamp stays unchanged after disconnect');
  await browser.evaluate(`(() => {const originalNow=Date.now;Date.now=()=>originalNow()+300001;})()`);
  await check('Stale label appears only after five minutes without a valid sample', body('stale; no valid sensor update for 5 minutes'));
  await browser.viewport(390, 926); await browser.screenshot('docs/design/screens/ble-last-reading-390.png');
  if (browser.errors.length) throw new Error(browser.errors.join('\n'));
  await writeFile('docs/ble/ui-validation.json', JSON.stringify({checks, runtimeErrors: browser.errors, hardwareTested: false}, null, 2)+'\n');
  console.log('PASS '+checks.length+' BLE UI checks');
} finally { browser.close(); }
