// Operator-only semantic duration checks: local inference, zero GPIO writes.
(async()=>{
 const report={startedAt:new Date().toISOString(),passed:false,results:[]};
 const pending=new Map();let serial=0;const receiver=window.dairyosReceive;
 window.dairyosReceive=message=>{const item=pending.get(message.id);if(item&&(message.type==='result'||message.type==='error')){pending.delete(message.id);clearTimeout(item.timer);if(message.type==='error')item.reject(new Error(String(message.value)));else item.resolve(message.value);}else receiver?.(message);};
 const request=(command,value={})=>new Promise((resolve,reject)=>{const id='duration-'+(++serial);const timer=setTimeout(()=>{pending.delete(id);reject(new Error('Local inference timed out'));},180000);pending.set(id,{resolve,reject,timer});window.webkit.messageHandlers.dairyos.postMessage({id,command,value});});
 const context=[{question:'Turn bulb 1 off for 5 seconds',answer:'The board confirmed Bulb 1 OFF for 5 seconds.',status:'complete'}];
 try{
  await new Promise(r=>setTimeout(r,2500));
  for(const [question,target,state,seconds,turns] of [
   ['Turn bulb 1 off',1,'OFF',0,[]],
   ['Turn it back on',1,'ON',0,context],
   ['Please illuminate the second bulb',2,'ON',0,[]],
   ['Turn bulb 1 off for 5 seconds',1,'OFF',5,[]]
  ]){
   const result=await request('answer',{mode:'intent',question,turns,records:[],references:[]});const intent=JSON.parse(result.text);
   const passed=!result.stopped&&!result.limited&&intent.intent==='command'&&intent.target===target&&intent.state===state&&intent.seconds===seconds;
   report.results.push({question,intent,verification:result.verification,passed,elapsedMs:result.elapsedMs});
   await request('durationValidation',report);
   await new Promise(resolve=>setTimeout(resolve,2000));
   if(!passed)throw new Error('Duration interpretation did not match the request.');
  }
  report.passed=true;
 }catch(error){report.error=String(error);}
 report.completedAt=new Date().toISOString();await request('durationValidation',report);
})();
