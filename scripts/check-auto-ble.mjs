import { openBrowser } from './lib/browser.mjs';
import { writeFile } from 'node:fs/promises';
const browser = await openBrowser({ width:390, height:844, port:9253, profile:'.private/auto-ble-browser' });
const checks=[];
try {
 await browser.call('Page.addScriptToEvaluateOnNewDocument',{source:`
 window.dairyosPhone=true;window.dairyosTest=true;window.fixtureBoards=2;window.connections=0;window.answers=0;window.writes=0;
 let subscription,link=0;const emit=(id,type,value)=>window.dairyosReceive?.({id,type,value});
 const frame=()=>{const v=new DataView(new ArrayBuffer(20));v.setUint8(0,1);v.setUint8(1,10);v.setUint32(6,42,true);v.setInt16(10,2700,true);v.setUint16(12,6400,true);return Array.from(new Uint8Array(v.buffer));};
 window.bleForeground=active=>emit(subscription,'ble',{kind:'lifecycle',active});
 window.dropBoard=()=>{link++;emit(subscription,'ble',{kind:'disconnected',phase:'idle',text:'TEST link loss'});};
 window.webkit={messageHandlers:{dairyos:{postMessage:({id,command})=>{
 if(command==='models')return setTimeout(()=>emit(id,'result',{}),0);
 if(command==='bleSubscribe'){subscription=id;return setTimeout(()=>emit(id,'ble',{kind:'status',phase:'idle',radio:'ready',text:'TEST radio ready'}),0);}
 if(command==='bleScan'){emit(id,'result',true);setTimeout(()=>{for(let i=0;i<window.fixtureBoards;i++)emit(subscription,'ble',{kind:'device',phase:'scanning',id:'board-'+i,name:'TEST Board '+i,rssi:-60});emit(subscription,'ble',{kind:'scanComplete',phase:'idle',text:'TEST scan finished'});},window.scanDelay??100);return;}
 if(command==='bleConnect'){window.connections++;emit(id,'result',true);if(window.failNextConnection){window.failNextConnection=false;setTimeout(()=>emit(subscription,'ble',{kind:'disconnected',phase:'idle',text:'TEST discovery timeout'}),100);return;}let generation=++link;setTimeout(()=>{emit(subscription,'ble',{kind:'connected',phase:'ready',text:'TEST connected'});emit(subscription,'ble',{kind:'telemetry',phase:'ready',bytes:frame()});const timer=setInterval(()=>{if(generation!==link)return clearInterval(timer);emit(subscription,'ble',{kind:'telemetry',phase:'ready',bytes:frame()});},500);},50);return;}
 if(command==='bleDisconnect'){window.dropBoard();emit(id,'result',true);return;}
 if(command==='answer')window.answers++;if(command==='bleWrite')window.writes++;emit(id,'result',true);
 }}}};
 `});
 const has=t=>`document.body.textContent.includes(${JSON.stringify(t)})`;
 const check=async(label,expr)=>{await browser.until(expr);checks.push(label);};
 const click=async label=>browser.evaluate(`document.querySelector('[aria-label='+JSON.stringify(${JSON.stringify(label)})+']').click()`);
 const advance=async()=>browser.evaluate(`(()=>{const original=Date.now;Date.now=()=>original()+40000;})()`);
 await browser.navigate('http://127.0.0.1:8786');
 await check('Multiple unknown boards require selection; no inference or writes',`${has('Board nearby · not connected')}&&window.connections===0&&window.answers===0&&window.writes===0`);
 await browser.evaluate('window.fixtureBoards=1');await advance();
 await check('Startup transport automatically discovers and connects without AI',`${has('Board connected')}&&window.connections===1&&window.answers===0&&window.writes===0`);
 await click('View board connection');await click('Disconnect');await browser.pause(2200);
 await check('Manual disconnect pauses automatic connection',`${has('Automatic connection paused.')}&&window.connections===1`);
 await click('Resume auto-connect');
 await check('Resume reconnects without AI',`${has('Board connected')}&&window.connections===2&&window.answers===0`);
 await browser.evaluate('window.dropBoard()');await advance();
 await check('Unexpected loss retries the remembered board without commands',`${has('Board connected')}&&window.connections===3&&window.writes===0&&window.answers===0`);
 await click('Disconnect');await browser.evaluate('window.fixtureBoards=0');await click('Resume auto-connect');
 await check('Absence is shown as not detected rather than a false range claim',has('Board not detected · off, out of range or not advertising'));
 await browser.evaluate('window.fixtureBoards=1;window.failNextConnection=true');await advance();
 await check('Native discovery failure ends the attempt without a false connection',`${has('TEST discovery timeout')}&&window.connections===4`);
 await advance();
 await check('A later automatic attempt recovers after discovery failure',`${has('Board connected')}&&window.connections===5&&window.answers===0&&window.writes===0`);
 await click('Disconnect');await browser.evaluate('window.scanDelay=800');await click('Resume auto-connect');
 await browser.evaluate('window.bleForeground(false);window.dropBoard()');await browser.pause(1400);
 await check('Background cancellation cannot turn scan completion into a new connection','window.connections===5&&window.answers===0&&window.writes===0');
 await browser.evaluate('window.scanDelay=100;window.bleForeground(true)');
 await check('Foreground resume starts automatic discovery again',`${has('Board connected')}&&window.connections===6&&window.answers===0&&window.writes===0`);
 if(browser.errors.length)throw new Error(browser.errors.join('\n'));
 await writeFile('.private/auto-ble-browser-results.json',JSON.stringify({scope:'Mock BLE transport; no AI inference or hardware actuation',checks},null,2));
 console.log(JSON.stringify({passed:checks.length}));
}finally{browser.close();}
