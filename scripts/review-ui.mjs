import { openBrowser } from './lib/browser.mjs';
import { mkdir, writeFile } from 'node:fs/promises';

const output = 'docs/design/screens';
await mkdir(output, { recursive: true });
const browser = await openBrowser({ width: 428, height: 926, port: 9244, profile: '.private/ui-review-browser' });
const results = { screenWidths: [], smallTargets: [], overflows: [], runtimeErrors: [], contrast: { checked: 0, failures: [] }, duplicateIds: [], screenshots: [] };
const click = async (role, label) => {
  await browser.evaluate(`(() => {const el=[...document.querySelectorAll('[role="${role}"]')].find(el=>el.getAttribute('aria-label')===${JSON.stringify(label)}||el.textContent.trim()===${JSON.stringify(label)});if(!el)throw new Error('Missing '+${JSON.stringify(label)});el.click()})()`);
  await browser.pause(120);
};
const fill = async (label, text) => browser.evaluate(`(() => {const el=document.querySelector('[aria-label="${label}"]');if(!el)throw new Error('Missing input');Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el),'value').set.call(el,${JSON.stringify(text)});el.dispatchEvent(new Event('input',{bubbles:true}));})()`);
const screenshot = async name => { const file = `${output}/${name}.png`; await browser.screenshot(file); results.screenshots.push(file); };
const assess = async (width, tab) => {
  const measured = await browser.evaluate(`(() => {
    const root=document.getElementById('dairyos-app');
    const controls=[...root.querySelectorAll('[role=button],[role=tab],input,textarea')].filter(el=>!el.closest('svg'));
    const small=controls.filter(el=>{const r=el.getBoundingClientRect();return r.width>0&&r.height>0&&(r.width<43.5||r.height<43.5)}).map(el=>({label:el.getAttribute('aria-label')||el.textContent.trim(),width:Math.round(el.getBoundingClientRect().width),height:Math.round(el.getBoundingClientRect().height)}));
    const rgb=value=>(value.match(/[0-9.]+/g)||[]).slice(0,3).map(Number);
    const lum=value=>rgb(value).map(c=>{c/=255;return c<=.04045?c/12.92:Math.pow((c+.055)/1.055,2.4)}).reduce((s,c,i)=>s+c*[.2126,.7152,.0722][i],0);
    const contrast=[];let checked=0;
    for(const el of root.querySelectorAll('*')){
      if(el.children.length||!el.textContent.trim()||el.closest('svg')||!el.getBoundingClientRect().height)continue;
      let bg='rgb(244,247,243)',disabled=false;
      for(let node=el;node;node=node.parentElement){const style=getComputedStyle(node);if(Number(style.opacity)<1||node.getAttribute('aria-disabled')==='true')disabled=true;const color=style.backgroundColor;if(color!=='transparent'&&!color.endsWith(', 0)')){bg=color;break;}}
      if(disabled)continue;
      const style=getComputedStyle(el),a=lum(style.color),b=lum(bg),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
      const minimum=Number.parseFloat(style.fontSize)>=24||(Number.parseFloat(style.fontSize)>=18.66&&Number(style.fontWeight)>=700)?3:4.5;
      checked++;if(ratio<minimum)contrast.push({text:el.textContent.trim().slice(0,70),ratio:Number(ratio.toFixed(2)),minimum,foreground:style.color,background:bg});
    }
    const seen=new Set(),duplicates=[];for(const el of document.querySelectorAll('[id]')){if(seen.has(el.id))duplicates.push(el.id);seen.add(el.id)}
    return {overflow:document.documentElement.scrollWidth>${width},small,logo:!!root.querySelector('[aria-label="DairyOS"] svg'),contrast,checked,duplicates};
  })()`);
  if (measured.overflow) results.overflows.push({ width, tab });
  if (!measured.logo) throw new Error('Official logo missing');
  results.smallTargets.push(...measured.small.map(target => ({ width, tab, ...target })));
  results.contrast.checked += measured.checked;
  results.contrast.failures.push(...measured.contrast.map(failure=>({width,tab,...failure})));
  results.duplicateIds.push(...measured.duplicates.map(id=>({width,tab,id})));
};

try {
  await browser.navigate('http://127.0.0.1:8786');
  await browser.until(`document.body.textContent.includes('Your farm, at hand.')`);
  await browser.evaluate(`localStorage.clear()`); await browser.call('Page.reload');
  await browser.until(`document.body.textContent.includes('Your farm, at hand.')`); await browser.pause(400);
  await screenshot('ask-empty-428');
  for (const width of [320, 390, 428, 768, 1280]) {
    await browser.viewport(width, width < 768 ? 926 : 1000);
    for (const tab of ['Ask', 'Records', 'Library', 'Setup']) {
      await click('tab', tab); await assess(width, tab);
      if ([428, 1280].includes(width)) await screenshot(`${tab.toLowerCase()}-${width}`);
    }
    results.screenWidths.push(width);
  }
  await browser.viewport(428, 926);
  await click('tab', 'Records'); await click('button', 'Add record');
  await screenshot('record-form-428'); await assess(428, 'Record form');
  const date = new Date(); const today = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  await fill('Record date', today); await fill('Animal or group name', 'Design test cow'); await fill('Record quantity', '12.5'); await click('button', 'Save local record');
  await browser.until(`document.body.textContent.includes('12.5 L')`);
  await click('button', 'Close form'); await screenshot('records-populated-428');
  await click('tab', 'Ask'); await fill('Farm question', 'Milk today'); await click('button', 'Ask DairyOS');
  await browser.until(`document.body.textContent.includes('12.5 litres')`);
  await screenshot('conversation-428'); await assess(428, 'Conversation');
  await click('tab', 'Library'); await click('button', 'Crops'); await click('button', 'Inspecting a crop problem before treatment');
  await screenshot('library-expanded-428'); await assess(428, 'Expanded guide');
  await browser.viewport(1280, 1000); await click('tab', 'Ask'); await screenshot('conversation-1280');
  results.runtimeErrors = browser.errors;
  await writeFile('docs/design/ui-review.json', JSON.stringify(results, null, 2) + '\n');
  console.log(JSON.stringify(results, null, 2));
  if (results.overflows.length || results.smallTargets.length || results.contrast.failures.length || results.duplicateIds.length || browser.errors.length) process.exitCode = 1;
} finally { browser.close(); }
