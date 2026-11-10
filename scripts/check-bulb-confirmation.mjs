import { openBrowser } from './lib/browser.mjs';
import { writeFile } from 'node:fs/promises';
const browser = await openBrowser({ width: 390, height: 844, port: 9251, profile: '.private/confirmation-transport-browser' });
const checks = [];
try {
  await browser.call('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.dairyosPhone=true; window.testWrites=0; window.testOutcome='timeout';
    let subscription, sequence=0, flags=10, uptime=0;
    const emit=(id,type,value)=>window.dairyosReceive?.({id,type,value});
    const frame=()=>{const b=new DataView(new ArrayBuffer(20));b.setUint8(0,1);b.setUint8(1,flags);b.setUint32(2,sequence,true);b.setUint32(6,42,true);b.setInt16(10,2760,true);b.setUint16(12,6400,true);b.setUint32(14,++uptime,true);return Array.from(new Uint8Array(b.buffer));};
    window.webkit={messageHandlers:{dairyos:{postMessage:({id,command,value})=>{
      if(command==='models')return setTimeout(()=>emit(id,'result',{text:null,vision:null,projection:null}),0);
      if(command==='bleSubscribe'){subscription=id;setTimeout(()=>emit(id,'ble',{kind:'status',phase:'idle',text:'Bluetooth ready. TEST TRANSPORT — NO HARDWARE.'}),0);return;}
      if(command==='bleScan'){emit(id,'result',true);setTimeout(()=>emit(subscription,'ble',{kind:'device',phase:'idle',id:'test-board',name:'TEST TRANSPORT',rssi:-50}),20);return;}
      if(command==='bleConnect'){emit(id,'result',true);setTimeout(()=>{emit(subscription,'ble',{kind:'connected',phase:'ready',text:'TEST TRANSPORT — NO HARDWARE.'});emit(subscription,'ble',{kind:'telemetry',phase:'ready',bytes:frame()});setInterval(()=>emit(subscription,'ble',{kind:'telemetry',phase:'ready',bytes:frame()}),500);},20);return;}
      if(command==='bleWrite'){window.testWrites++;if(window.testOutcome==='error')return setTimeout(()=>emit(id,'error','TEST: radio write failed'),20);emit(id,'result',true);if(window.testOutcome==='success')setTimeout(()=>{const d=new DataView(Uint8Array.from(value.bytes).buffer);sequence=d.getUint32(2,true);flags=value.bytes[1]===1?11:10;emit(subscription,'ble',{kind:'telemetry',phase:'ready',bytes:frame()});},200);return;}
      emit(id,'result',true);
    }}}};
  ` });
  await browser.navigate('http://127.0.0.1:8786');
  const click = async label => { await browser.evaluate(`document.querySelector('[aria-label=${JSON.stringify(label)}]').click()`); await browser.pause(150); };
  const body = text => `document.body.textContent.includes(${JSON.stringify(text)})`;
  const check = async (name, expression) => { await browser.until(expression); checks.push(name); };
  await browser.until(body('Your farm, at hand.')); await click('Devices'); await click('Scan for boards');
  await browser.until(`!!document.querySelector('[aria-label="Connect TEST TRANSPORT (-50 dBm)"]')`);
  await click('Connect TEST TRANSPORT (-50 dBm)'); await browser.until(body('Bulb 1 · ON'));
  await click('Turn bulb 1 off'); await click('Cancel command');
  await check('Cancel sends zero transport writes', 'window.testWrites===0');
  await click('Turn bulb 1 off'); await click('Confirm bulb command');
  await check('Pending command stays in dialog', `${body('Waiting for confirmation from the board')} && !!document.querySelector('#bulb-confirmation-dialog')`);
  await check('ACK timeout stays visible as failure', `${body('No board acknowledgment. Output state unknown')} && !!document.querySelector('[aria-label="Close confirmation"]')`);
  await check('Timeout never claims board confirmation', `!${body('Last command confirmed by the board')}`);
  await click('Close confirmation'); await browser.evaluate(`window.testOutcome='error'`);
  await click('Turn bulb 1 off'); await click('Confirm bulb command');
  await check('Write error shown in dialog', `${body('TEST: radio write failed')} && !!document.querySelector('#bulb-confirmation-dialog')`);
  await click('Close confirmation'); await browser.evaluate(`window.testOutcome='success';window.testWrites=0`);
  await click('Turn bulb 1 off');
  await browser.evaluate(`(()=>{const e=document.querySelector('[aria-label="Confirm bulb command"]');e.click();e.click();})()`);
  await check('Double confirm sends exactly one write', 'window.testWrites===1');
  await check('Successful board ACK closes dialog', `!document.querySelector('#bulb-confirmation-dialog') && ${body('Bulb 1: board reports OFF (relay ON).')}`);
  if (browser.errors.length) throw new Error(browser.errors.join('\n'));
  await writeFile('docs/ble/confirmation-validation.json',JSON.stringify({checks,runtimeErrors:browser.errors,transport:'explicit mock; no hardware writes'},null,2)+'\n');
  console.log('PASS '+checks.length+' confirmation failure/duplicate-write checks');
} finally { browser.close(); }
