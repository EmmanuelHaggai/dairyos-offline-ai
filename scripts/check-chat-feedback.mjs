import { openBrowser } from './lib/browser.mjs';
import { writeFile } from 'node:fs/promises';
const browser = await openBrowser({width:390,height:844,port:9254,profile:'.private/chat-feedback-browser'});
const checks=[];
try {
 await browser.call('Page.addScriptToEvaluateOnNewDocument',{source:`
 window.dairyosPhone=true;window.dairyosTest=true;window.requests=[];
 const history=Array.from({length:18},(_,i)=>({id:i+1,question:'Previous fixture request '+i,answer:('Previous fixture answer. ').repeat(30),createdAt:'2026-11-02T00:00:00Z',references:[],photo:false,elapsedMs:1,status:'complete'}));
 localStorage.setItem('dairyos-phone-test-v1:turns',JSON.stringify(history));localStorage.setItem('dairyos-phone-test-v1:sequence','1000');
 const emit=(id,type,value)=>window.dairyosReceive?.({id,type,value});
 window.finishIntent=()=>emit(window.intentId,'result',{text:'{"intent":"none"}',origin:'model',references:[],elapsedMs:1});
 window.streamReply=text=>{emit(window.replyId,'status','Writing guidance on this iPhone…');emit(window.replyId,'text',text);};
 window.finishReply=text=>emit(window.replyId,'result',{text,origin:'model',references:[],elapsedMs:2000,stopped:false,limited:false});
 window.failIntent=()=>emit(window.intentId,'error','Fixture inference failed. No command sent.');
 window.webkit={messageHandlers:{dairyos:{postMessage:({id,command,value})=>{
 if(command==='models')return setTimeout(()=>emit(id,'result',{text:{name:'Fixture model',bytes:2075618016}}),0);
 if(command==='bleSubscribe')return setTimeout(()=>emit(id,'ble',{kind:'status',radio:'unavailable',text:'UI FIXTURE — no hardware'}),0);
 if(command==='answer'){window.requests.push(value);if(value.mode==='intent')window.intentId=id;else window.replyId=id;return;}
 if(command==='interactionBusy'&&value.active)return setTimeout(()=>emit(id,'result',true),500);
 emit(id,'result',true);
 }}}};
 `});
 const check=async(name,expr)=>{await browser.until(expr);checks.push(name);};
 const fill=async text=>browser.evaluate(`(()=>{const e=document.querySelector('[aria-label="Farm question"]');e.focus();Object.getOwnPropertyDescriptor(Object.getPrototypeOf(e),'value').set.call(e,${JSON.stringify(text)});e.dispatchEvent(new Event('input',{bubbles:true}));document.getElementById('dairyos-chat-scroll').scrollTop=0;})()`);
 const click=()=>browser.evaluate(`document.querySelector('[aria-label="Ask DairyOS"]').click()`);
 const inView=id=>`(()=>{const a=document.getElementById(${JSON.stringify(id)}).getBoundingClientRect(),v=document.getElementById('dairyos-chat-scroll').getBoundingClientRect(),c=document.getElementById('dairyos-composer').getBoundingClientRect();return a.top>=v.top-2&&a.bottom<=Math.min(v.bottom,c.top)+2;})()`;
 await browser.navigate('http://127.0.0.1:8786');await browser.until(`!!document.querySelector('[aria-label="Farm question"]')&&!document.querySelector('[aria-label="Farm question"]').disabled`);
 await fill('Explain careful observation.');await browser.pause(80);await click();
 await check('Composer clears immediately and blurs before inference begins',`document.querySelector('[aria-label="Farm question"]').value===''&&document.activeElement!==document.querySelector('[aria-label="Farm question"]')&&!!document.getElementById('dairyos-processing')`);
 await check('Submitted request remains visible in the conversation',`document.getElementById('dairyos-pending-request')?.textContent==='Explain careful observation.'`);
 await check('Processing card scrolls into view despite long history',inView('dairyos-processing'));
 await browser.until('window.requests.length===1');await check('Original request survives immediate composer clearing',`window.requests[0].question==='Explain careful observation.'`);
 await browser.pause(1100);await check('Elapsed-time feedback remains active',`/Working on this iPhone · [1-9]/.test(document.getElementById('dairyos-processing').textContent)`);
 await browser.screenshot('.private/chat-feedback-loading.png');
 await browser.evaluate('window.finishIntent()');await browser.until('!!window.replyId');
 const stream='A visible reply is being generated.\n'.repeat(35)+'LATEST_VISIBLE_REPLY_END';
 await browser.evaluate(`window.streamReply(${JSON.stringify(stream)})`);
 await check('Streaming reply follows the latest generated text',`(()=>{const e=document.getElementById('dairyos-streaming-reply'),v=document.getElementById('dairyos-chat-scroll').getBoundingClientRect();return e?.textContent.endsWith('LATEST_VISIBLE_REPLY_END')&&e.getBoundingClientRect().bottom<=v.bottom+2;})()`);
 await browser.viewport(320,560);await browser.pause(250);
 await check('Reply remains visible after narrow/keyboard-sized viewport changes',`(()=>{const e=document.getElementById('dairyos-streaming-reply'),v=document.getElementById('dairyos-chat-scroll').getBoundingClientRect();return e.getBoundingClientRect().bottom<=v.bottom+2;})()`);
 await browser.screenshot('.private/chat-feedback-streaming.png');
 const point=await browser.evaluate(`(()=>{const r=document.getElementById('dairyos-chat-scroll').getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+Math.min(r.height/2,60)};})()`);
 await browser.call('Input.dispatchMouseEvent',{type:'mouseWheel',...point,deltaX:0,deltaY:-100000});await browser.pause(300);
 await browser.evaluate(`window.streamReply(${JSON.stringify(stream+'\nADDITIONAL_REPLY_END')})`);await browser.pause(250);
 await check('Reading older messages pauses automatic following',`document.getElementById('dairyos-chat-scroll').scrollTop<5`);
 await browser.evaluate(`(()=>{const n=document.getElementById('dairyos-chat-scroll');n.scrollTop=n.scrollHeight;n.dispatchEvent(new Event('scroll'));})()`);await browser.pause(200);
 await browser.evaluate(`window.finishReply('Completed fixture reply.')`);
 await check('Completion removes pending UI without duplicating the sent message',`!document.getElementById('dairyos-processing')&&!document.getElementById('dairyos-pending-request')&&JSON.parse(localStorage.getItem('dairyos-phone-test-v1:turns')).filter(t=>t.question==='Explain careful observation.').length===1&&(()=>{const turns=JSON.parse(localStorage.getItem('dairyos-phone-test-v1:turns')),r=document.getElementById('dairyos-turn-'+turns.at(-1).id)?.getBoundingClientRect(),v=document.getElementById('dairyos-chat-scroll').getBoundingClientRect();return r&&r.bottom<=v.bottom+2;})()`);
 await fill('Explain another observation.');await browser.pause(80);await click();await browser.until('window.requests.length===3');await browser.evaluate('window.failIntent()');
 await check('Failure preserves the submitted request and shows its error beside it',`!!document.getElementById('dairyos-pending-request')&&!document.getElementById('dairyos-processing')&&document.body.textContent.includes('Fixture inference failed.')`);
 await browser.viewport(390,844);await browser.pause(200);await browser.screenshot('.private/chat-feedback-error.png');
 if(browser.errors.length)throw new Error(browser.errors.join('\n'));
 await writeFile('.private/chat-feedback-results.json',JSON.stringify({scope:'Responsive UI fixtures; no real AI or hardware',checks},null,2));console.log(JSON.stringify({passed:checks.length}));
}catch(error){console.log(await browser.evaluate(`JSON.stringify({input:document.querySelector('[aria-label="Farm question"]')?.value,focused:document.activeElement?.getAttribute('aria-label'),pending:!!document.getElementById('dairyos-pending-request'),processing:!!document.getElementById('dairyos-processing'),requests:window.requests.map(r=>({mode:r.mode,question:r.question})),body:document.body.textContent.slice(-1500)})`));await browser.screenshot('.private/chat-feedback-failure.png');throw error;}finally{browser.close();}
