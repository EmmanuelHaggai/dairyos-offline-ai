// Operator-only, read-only UI validation with actual local inference.
(async () => {
 const report={startedAt:new Date().toISOString(),passed:false,checks:[]};
 const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const until=async (predicate,timeout=180000)=>{const end=Date.now()+timeout;while(!predicate()){if(Date.now()>end)throw new Error('UI response timed out.');await pause(100);}};
 const turns=()=>JSON.parse(localStorage.getItem('dairyos-phone-v1:turns')||'[]');
 const question='What is the temperature and humidity?';
 try{
  await pause(2500);document.querySelector('[role=tab][aria-label=Ask]')?.click();await pause(300);
  const before=turns().at(-1)?.id,field=document.querySelector('[aria-label="Farm question"]');
  field.focus();Object.getOwnPropertyDescriptor(Object.getPrototypeOf(field),'value').set.call(field,question);field.dispatchEvent(new Event('input',{bubbles:true}));await pause(200);
  document.getElementById('dairyos-chat-scroll').scrollTop=0;
  document.querySelector('[aria-label="Ask DairyOS"]').click();await pause(200);
  if(field.value!==''||document.activeElement===field)throw new Error('Composer did not clear and dismiss focus.');
  if(document.getElementById('dairyos-pending-request')?.textContent!==question)throw new Error('Submitted request is missing.');
  const progress=document.getElementById('dairyos-processing')?.getBoundingClientRect(),viewport=document.getElementById('dairyos-chat-scroll').getBoundingClientRect();
  if(!progress||progress.top<viewport.top-2||progress.bottom>viewport.bottom+2)throw new Error('Processing feedback is outside the viewport.');
  report.checks.push('Composer cleared and keyboard focus dismissed immediately.','Original request displayed in conversation.','Processing indicator visible above composer.');
  await until(()=>turns().at(-1)?.id!==before&&!document.getElementById('dairyos-processing'));
  const turn=turns().at(-1);
  if(turn.question!==question||!turn.answer?.trim())throw new Error('No matching reply.');
  await until(()=>{const reply=document.getElementById('dairyos-turn-'+turn.id)?.getBoundingClientRect(),area=document.getElementById('dairyos-chat-scroll').getBoundingClientRect();return reply&&reply.bottom<=area.bottom+2;},2000);
  report.checks.push('Completed reply automatically visible.');report.question=question;report.answer=turn.answer;report.passed=true;
 }catch(error){report.error=String(error);}
 report.completedAt=new Date().toISOString();window.webkit.messageHandlers.dairyos.postMessage({id:'chat-feedback-validation',command:'chatFeedbackValidation',value:report});
})();
