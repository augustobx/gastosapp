import {parseExpress} from './express-parse.js?v=16';

export function setupExpress({request,refresh,getAccounts,fmt,onSettingsSaved,onSaved}){
 const $=id=>document.getElementById(id);
 const dlg=$('expressDialog'),input=$('expressInput'),mic=$('expressMic');
 const status=$('expressStatus'),review=$('expressReview'),alert=$('expressAlert');
 const btn=$('expressParse'),saveBtn=$('expressSave'),again=$('expressAgain');
 const auto=$('expressAutoConfirm');
 let recognizer=null,draft=null,original='',issues=[],eligible=false,requiresAdvanced=false,recognitionConfidence=null,requestId=null,busy=false,seq=0;
 const makeId=()=>crypto.randomUUID?.()||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
 const feedback=(message,kind='neutral')=>{status.textContent=message;status.dataset.kind=kind;};
 const warning=message=>{alert.textContent=message;alert.classList.toggle('hidden',!message);};
 function stopListening(){
  if(recognizer){const r=recognizer;recognizer=null;r.onend=null;r.onresult=null;r.onerror=null;try{r.abort();}catch{}}
  mic.classList.remove('recording');
 }
 function showReview(){
  if(!draft)return;
  review.classList.remove('hidden');saveBtn.disabled=requiresAdvanced;
  $('expressAmount').value=draft.amount??'';
  $('expressTitle').value=draft.title||'';
  $('expressCategory').value=draft.category||'Otros';
  const choices=getAccounts();
  $('expressAccount').replaceChildren(new Option('Sin especificar',''));
  for(const a of choices)$('expressAccount').add(new Option(a.name,a.id));
  $('expressAccount').value=draft.accountId||'';
  $('expressPaid').checked=draft.isPaid===true;
  $('expressSource').textContent='Escuché: '+original;
  $('expressReviewHint').textContent=requiresAdvanced?'La frase requiere el asistente IA para no omitir cuotas, vencimientos o movimientos múltiples.':issues.length?
   'Revisá antes de guardar: '+issues.join(' ') :
   'Reconocido localmente, sin consultar Gemini. Tocá Guardar para confirmar.';
  $('expressReviewHint').dataset.kind=issues.length?'warning':'success';
 }
 async function save({automatic=false}={}){
  if(busy||!draft||requiresAdvanced)return;
  if(automatic&&(!eligible||!auto.checked))return;
  let data;
  if(automatic)data=draft;
  else{
   const amount=Number($('expressAmount').value);
   const title=$('expressTitle').value.trim();
   if(!Number.isFinite(amount)||amount<=0||amount>1e12){warning('Corregí el importe antes de guardar.');return;}
   if(!title){warning('Completá el concepto del movimiento.');return;}
   data={...draft,amount,title,category:$('expressCategory').value,
    accountId:$('expressAccount').value||null,isPaid:$('expressPaid').checked};
  }
  busy=true;saveBtn.disabled=true;btn.disabled=true;
  warning('');feedback('Guardando movimiento...','neutral');
  try{
   const result=await request('/api/express/save','POST',{
    phrase:original,transaction:data,auto:automatic,requestId
   });
   feedback(result.alreadySaved?'Ya estaba registrado. No lo dupliqué.':'✓ Movimiento guardado: '+fmt(data.amount)+' · '+data.title,'success');
   review.classList.add('hidden');draft=null;requestId=null;again.classList.remove('hidden');
   await refresh();
   onSaved?.(result);
  }catch(e){
   warning(e.message||'No se pudo guardar. Revisá el movimiento.');
   feedback('No se guardó o no se pudo confirmar. Reintentá con el mismo botón.','error');
   saveBtn.disabled=false;
  }finally{busy=false;btn.disabled=false;}
 }
 async function parse(text,{confidence=null}={}){
  if(busy)return;
  original=String(text||'').trim();input.value=original;
  const result=parseExpress(original,getAccounts());
  draft=result.draft;issues=[...result.issues];eligible=result.autoEligible;requiresAdvanced=result.requiresAdvanced;
  requestId=makeId();recognitionConfidence=confidence;
  if(confidence!==null&&confidence<0.75){
   issues.push('Reconocimiento de voz de baja confianza. Confirmá manualmente.');
   eligible=false;
  }
  showReview();warning('');
  if(!Number.isFinite(draft.amount)||draft.amount<=0||requiresAdvanced){saveBtn.disabled=true;}
  if(auto.checked&&eligible){
   feedback('Gasto claro; autoconfirmación habilitada.','success');
   await save({automatic:true});
  }else{
   feedback(issues.length?'Revisá los datos; no guardé nada.':'Movimiento listo para guardar.','neutral');
  }
 }
 function reset(){
  seq++;stopListening();busy=false;draft=null;original='';requestId=null;issues=[];requiresAdvanced=false;recognitionConfidence=null;
  review.classList.add('hidden');again.classList.add('hidden');warning('');
  input.value='';saveBtn.disabled=true;btn.disabled=false;
  feedback('Tocá el micrófono y decí, por ejemplo: «Gasté 18 lucas en la farmacia con débito».');
 }
 function open(){
  if(!dlg.open)dlg.showModal();
  reset();
  // Un toque para abrir y comenzar a escuchar (solo si el navegador lo permite).
  if(window.SpeechRecognition||window.webkitSpeechRecognition)micStart();
  else input.focus();
 }
 function close(){seq++;stopListening();if(dlg.open)dlg.close();}
 function micStart(){
  if(busy)return;
  if(recognizer){stopListening();return;}
  const Speech=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!Speech){
   warning('Tu navegador no ofrece dictado nativo rápido. Podés escribir el gasto o abrir el asistente IA para usar transcripción por API.');
   input.focus();return;
  }
  const localSeq=++seq;const r=new Speech();recognizer=r;r.lang='es-AR';r.continuous=false;r.interimResults=true;
  let recognized='',score=null,finalSeen=false;
  r.onresult=e=>{
   const pieces=[...e.results].map(item=>item[0]?.transcript||'');
   recognized=pieces.join(' ').trim();
   for(const result of e.results){if(result.isFinal){finalSeen=true;const c=result[0]?.confidence;if(Number.isFinite(c)&&c>0)score=c;}}
   input.value=recognized;
   feedback('Escuchando... '+recognized,'neutral');
  };
  r.onerror=e=>{if(localSeq===seq)warning('No se completó el dictado: '+e.error+'. Podés escribir o reintentar.');};
  r.onend=()=>{
   if(recognizer!==r||localSeq!==seq)return;
   recognizer=null;mic.classList.remove('recording');
   if(recognized&&finalSeen)void parse(recognized,{confidence:score});
   else if(recognized){input.value=recognized;feedback('Texto detectado, pero sin resultado final. Tocá Interpretar para revisar.');}
   else feedback('No escuché palabras. Tocá el micrófono para volver a intentar.');
  };
  try{r.start();mic.classList.add('recording');warning('');feedback('Te escucho...');}
  catch(e){recognizer=null;mic.classList.remove('recording');warning('No se pudo activar el micrófono: '+e.message);}
 }
 function openAI(){
  const text=input.value.trim();
  close();
  const chatButton=document.querySelector('.assistant-chat-open');
  chatButton?.click();
  if(text){$('chatInput').value=text;$('chatInput').focus();}
 }
 document.querySelectorAll('.assistant-open').forEach(el=>el.addEventListener('click',open));
 dlg.querySelectorAll('.express-close').forEach(el=>el.addEventListener('click',close));
 dlg.addEventListener('close',()=>{seq++;stopListening();});
 mic.addEventListener('click',micStart);
 btn.addEventListener('click',()=>{stopListening();void parse(input.value);});
 input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();stopListening();void parse(input.value);}});
 saveBtn.addEventListener('click',()=>void save());
 for(const id of ['expressAmount','expressTitle'])$(id).addEventListener('input',()=>{
  if(!busy&&draft&&!requiresAdvanced)saveBtn.disabled=!(Number($('expressAmount').value)>0&&$('expressTitle').value.trim());
 });
 again.addEventListener('click',reset);
 $('expressToAI').addEventListener('click',openAI);
 auto.addEventListener('change',async()=>{
  const value=auto.checked;
  auto.disabled=true;
  try{await request('/api/settings','PATCH',{expressAutoConfirm:value});onSettingsSaved?.(value);
   feedback(value?'Autoconfirmación activada para gastos simples seguros.':'Autoconfirmación desactivada.');
  }catch(e){auto.checked=!value;warning(e.message);}
  finally{auto.disabled=false;}
 });
 function settingsChanged(value){auto.checked=value===true;}
 return {open,settingsChanged};
}
