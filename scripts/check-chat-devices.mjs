import { openBrowser } from './lib/browser.mjs';
import { writeFile } from 'node:fs/promises';
const browser = await openBrowser({ width: 390, height: 844, port: 9252, profile: '.private/chat-device-browser' });
const checks=[];
try {
  await browser.call('Page.addScriptToEvaluateOnNewDocument', {source:`
    for (const key of Object.keys(localStorage)) if(key.startsWith('dairyos-phone-test-v1:')) localStorage.removeItem(key);
    window.dairyosPhone=true;window.dairyosTest=true;window.testWrites=[];window.testAnswerCalls=0;window.testPlans=[];
    let sub,seq=0,flags=10,uptime=0,link=0;
    const emit=(id,type,value)=>window.dairyosReceive?.({id,type,value});
    const frame=()=>{const d=new DataView(new ArrayBuffer(20));d.setUint8(0,2);d.setUint8(1,flags);d.setUint32(2,seq,true);d.setUint32(6,42,true);d.setInt16(10,2760,true);d.setUint16(12,6400,true);d.setUint32(14,++uptime,true);return Array.from(new Uint8Array(d.buffer));};
    window.webkit={messageHandlers:{dairyos:{postMessage:({id,command,value})=>{
      if(command==='models')return setTimeout(()=>emit(id,'result',{text:null,vision:null,projection:null}),0);
      if(command==='bleSubscribe'){sub=id;setTimeout(()=>emit(id,'ble',{kind:'status',radio:'ready',phase:'idle',text:'Bluetooth ready. TEST TRANSPORT — NO HARDWARE.'}),0);return;}
      if(command==='bleScan'){emit(id,'result',true);setTimeout(()=>emit(sub,'ble',{kind:'device',phase:'idle',id:'test-board',name:'TEST TRANSPORT',rssi:-50}),20);return;}
      if(command==='bleConnect'){emit(id,'result',true);const generation=++link;setTimeout(()=>{emit(sub,'ble',{kind:'connected',phase:'ready',text:'TEST TRANSPORT — NO HARDWARE.'});emit(sub,'ble',{kind:'telemetry',phase:'ready',bytes:frame()});const timer=setInterval(()=>{if(link!==generation)return clearInterval(timer);emit(sub,'ble',{kind:'telemetry',phase:'ready',bytes:frame()});},500);},20);return;}
      if(command==='bleWrite'){window.testWrites.push(value.bytes);emit(id,'result',true);if(window.testSuppressACK)return;setTimeout(()=>{const d=new DataView(Uint8Array.from(value.bytes).buffer);seq=d.getUint32(2,true);const bit=value.bytes[12]===1?1:16;flags=value.bytes[1]!==0?flags|bit:flags&~bit;emit(sub,'ble',{kind:'telemetry',phase:'ready',bytes:frame()});},120);return;}
      if(command==='bleDisconnect'){link++;emit(id,'result',true);emit(sub,'ble',{kind:'disconnected',phase:'idle',text:'TEST disconnected'});return;}
      if(command==='answer'){window.testAnswerCalls++;emit(id,'result',{text:JSON.stringify(window.testPlans.shift()),origin:'model',references:[],elapsedMs:1});return;}
      emit(id,'result',true);
    }}}};
  `});
  const body=t=>`document.body.textContent.includes(${JSON.stringify(t)})`;
  const click=async label=>{await browser.evaluate(`(()=>{const e=document.querySelector('[aria-label='+JSON.stringify(${JSON.stringify(label)})+']');if(!e||e.getAttribute('aria-disabled')==='true')throw new Error('Unavailable '+${JSON.stringify(label)});e.click();})()`);await browser.pause(160);};
  const check=async(name,expression)=>{await browser.until(expression);checks.push(name);};
  const ask=async text=>{await browser.evaluate(`(()=>{const e=document.querySelector('[aria-label="Farm question"]');Object.getOwnPropertyDescriptor(Object.getPrototypeOf(e),'value').set.call(e,${JSON.stringify(text)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);await browser.pause(80);await browser.until(`document.querySelector('[aria-label=\"Ask DairyOS\"]')?.getAttribute('aria-disabled')!=='true'`);await click('Ask DairyOS');};
  // Model responses are explicit fixtures. This tests integration, not language intelligence.
  const plan = async (intent, target=0, state='unknown') => browser.evaluate(`window.testPlans.push(${JSON.stringify({intent,target,state,seconds:0,metric:'both',clarification:'Which bulb?'})})`);
  await browser.navigate('http://127.0.0.1:8786'); await browser.until(body('Your farm, at hand.'));
  await plan('sensors'); await ask('Fixture request A');
  await check('Model plan triggers automatic scan, connection and measured sensor reply', `${body('Temperature: 27.6 °C.')}&&window.testAnswerCalls===1`);
  await plan('command',1,'OFF'); await ask('Fixture direct OFF request');
  await check('AI command sends directly and saves only the matching board receipt', `${body('The board confirmed Bulb 1 OFF until changed')}&&window.testWrites.length===1&&!document.querySelector('[aria-label="Confirm bulb command"]')`);
  await plan('command',1,'ON'); await ask('Fixture direct ON request');
  await check('AI ON command needs no extra click', `${body('The board confirmed Bulb 1 ON until changed (relay OFF).')}&&window.testWrites.length===2`);
  await plan('clarify'); await plan('command',1,'ON'); await ask('Fixture context request');
  await check('Model-resolved conversation sends directly after context interpretation', `window.testAnswerCalls===5&&window.testWrites.length===3&&${body('The board confirmed Bulb 1 ON until changed (relay OFF).')}`);
  await plan('clarify'); await plan('clarify'); await ask('Fixture ambiguous request');
  await check('Unresolved requests ask for clarification without writing', `${body('Which bulb?')}&&window.testWrites.length===3`);
  await browser.evaluate(`window.testPlans.push({intent:'command',target:9,state:'ON',seconds:10,metric:'both',clarification:''})`); await ask('Fixture invalid output');
  await check('Invalid capability output sends nothing', `${body('invalid intent')}&&window.testWrites.length===3`);
  await browser.evaluate('window.testSuppressACK=true');await plan('command',2,'ON');await ask('Fixture missing acknowledgment');
  await check('Missing ACK records uncertainty without an automatic resend', `${body('I could not confirm the bulb command.')}&&window.testWrites.length===4`);
  await click('Devices');await click('Turn bulb 1 off');
  await check('Manual Devices controls retain their separate review dialog',body('Turn Bulb 1 OFF?'));
  await click('Cancel command');await check('Manual cancellation sends no extra write','window.testWrites.length===4');
  await click('Ask'); await browser.evaluate('window.testSuppressACK=false'); await plan('command',1,'ON');
  await browser.evaluate(`(()=>{const e=document.querySelector('[aria-label="Farm question"]');Object.getOwnPropertyDescriptor(Object.getPrototypeOf(e),'value').set.call(e,'Fixture double submit');e.dispatchEvent(new Event('input',{bubbles:true}));})()`);await browser.pause(80);
  await browser.evaluate(`(()=>{const button=document.querySelector('[aria-label="Ask DairyOS"]');button.click();button.click();})()`);
  await check('Rapid duplicate submission sends exactly one command', 'window.testWrites.length===5&&window.testAnswerCalls===10');
  if(browser.errors.length)throw new Error(browser.errors.join('\n'));
  await writeFile('.private/chat-integration-results.json',JSON.stringify({scope:'Mock model and BLE transport; integration only',checks},null,2));
  console.log(JSON.stringify({passed:checks.length,scope:'Mock model and BLE integration only'}));
} finally { browser.close(); }
