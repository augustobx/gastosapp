import {getNaturalVoice} from './speech-request.js?v=15';
import {voiceFailure,spokenExcerpt} from './voice-errors.js?v=15';
import {waitTask} from './ai-tasks.js?v=15';
import {providerFor,voiceFor} from './providers.js?v=15';
// Asistente conversacional: IA optativa para comprensión, voz y transcripción.
// Ningún movimiento se guarda hasta confirmar toda la tanda.
export function setupChat({request,refresh,getAccounts,fmt,dateLabel,hasAI,openQuick,openDiagnostics}){
 const $=id=>document.getElementById(id);
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const norm=x=>String(x||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[!?.,;:]+/g,' ').trim().replace(/\s+/g,' ');
 const cats=['Comida','Servicios','Hogar','Transporte','Salud','Educación','Tecnología','Entretenimiento','Indumentaria','Deudas y préstamos','Otros','Extra','Sueldo','Ventas'];
 const dlg=$('chatDialog'),messages=$('chatMessages'),review=$('chatReview'),editor=$('chatEditor');
 const chat={items:[],pending:null,editIndex:null,returnPhase:'collect',phase:'collect',busy:false,
   closed:true,speaker:null,voiceAbort:null,voiceUrl:null,voiceSeq:0,lastSpoken:'',ttsSuspended:false,unresolved:null,recognizer:null,recorder:null,stream:null,chunks:[],key:null,recordStarted:0};
 const account=id=>getAccounts().find(a=>a.id===id);
 const welcome='Dale, decime el primer gasto o ingreso. Cuando termines, decí "nada más". Después los repasamos juntos.';
 const key=()=>Date.now().toString(36)+'-'+(crypto.randomUUID?.()||Math.random().toString(36).slice(2));
 function bubble(who,value){
   const el=document.createElement('div');el.className='chat-bubble '+who;el.textContent=value;
   messages.append(el);messages.scrollTop=messages.scrollHeight;
 }
 function status(value){$('chatStatus').textContent=value;}
 function clearAlert(){if(chat.ttsSuspended)return;$('chatAlert').textContent='';$('chatAlert').classList.add('hidden');$('chatOpenDiagnostics').classList.add('hidden');}
 function alertIssue(message){
   $('chatAlert').textContent=message;$('chatAlert').classList.remove('hidden');$('chatOpenDiagnostics').classList.remove('hidden');status('Hay un problema con el audio. Revisá el aviso.');
 }
 async function audioProblem(response,operation){return (await voiceFailure(response,operation)).message;}
 function stopVoice(){
   chat.voiceSeq++;
   chat.voiceAbort?.abort();chat.voiceAbort=null;
   if(chat.speaker?.pause){chat.speaker.pause();chat.speaker.src='';}
   if('speechSynthesis' in window)window.speechSynthesis.cancel();
   if(chat.voiceUrl)URL.revokeObjectURL(chat.voiceUrl);
   chat.voiceUrl=null;chat.speaker=null;
 }
 function listenAfterSpeech(seq){
   if(seq!==chat.voiceSeq||chat.closed||chat.busy||!$('chatHandsFree').checked||chat.phase==='edit'||chat.phase==='saved')return;
   startMic();
 }
 function browserVoice(message,seq){
   if(!('speechSynthesis' in window)||seq!==chat.voiceSeq)return alertIssue('Este navegador no dispone de voz integrada. Podés leer el mensaje en pantalla.');
   const utterance=new SpeechSynthesisUtterance(message);utterance.lang='es-AR';utterance.rate=1.02;
   const voices=window.speechSynthesis.getVoices();
   utterance.voice=voices.find(v=>v.lang.toLowerCase()==='es-ar')||
      voices.find(v=>v.lang.toLowerCase().startsWith('es'))||null;
   chat.speaker=utterance;
   utterance.onend=()=>{if(chat.speaker===utterance){chat.speaker=null;listenAfterSpeech(seq);}};
   try{window.speechSynthesis.speak(utterance);}catch(e){alertIssue('No se pudo usar la voz del navegador: '+e.message);}
 }
 function voiceText(message){return spokenExcerpt(message,200);}
 function preferredVoice(){return voiceFor(providerFor('tts'));}
 function say(message,{bubbleOnly=false,skipVoice=false}={}){
   if(!bubbleOnly)bubble('assistant',message);
   chat.lastSpoken=message;
   stopVoice();
   if(skipVoice||!$('chatSpeak').checked)return;
   const seq=chat.voiceSeq;
   if(!hasAI()||!$('chatNaturalVoice').checked){
     browserVoice(message,seq);return;
   }
   if(chat.ttsSuspended){status('Voz natural pausada por error anterior. Podés seguir escribiendo o volver a intentar manualmente.');return;}
   const abort=new AbortController();chat.voiceAbort=abort;
   void(async()=>{
     try{
       status('Generando voz natural con '+providerFor('tts')+' ('+preferredVoice()+')...');
       const generated=await getNaturalVoice({
         text:voiceText(message),voice:preferredVoice(),provider:providerFor('tts'),
         signal:abort.signal,onProgress:status
       });
       const audioBlob=generated.blob;
       const type=generated.mime;
       if(abort.signal.aborted||seq!==chat.voiceSeq||chat.closed)return;
       const url=URL.createObjectURL(audioBlob);chat.voiceUrl=url;
       const audio=new Audio(url);chat.speaker=audio;
       audio.onended=()=>{if(chat.speaker===audio){chat.speaker=null;
         URL.revokeObjectURL(url);chat.voiceUrl=null;listenAfterSpeech(seq);}};
       audio.onerror=()=>{if(seq===chat.voiceSeq){
         chat.ttsSuspended=true;
         alertIssue('No pude reproducir el audio '+type+'. Probá el reproductor de Configuración. La voz quedó pausada hasta que elijas reintentar.');}};
       try{await audio.play();chat.ttsSuspended=false;clearAlert();status('Voz natural en reproducción.');}
       catch(e){
         if(e.name==='NotAllowedError')alertIssue('El navegador bloqueó la reproducción automática. Tocá «Volver a escuchar» para iniciar el audio con una acción tuya. No usé la voz robótica.');
         else alertIssue('No pude reproducir el MP3: '+e.message+'. Probá el reproductor de muestra en Configuración.');
       }
     }catch(error){
       if(error.name==='AbortError'||seq!==chat.voiceSeq||chat.closed)return;
       chat.ttsSuspended=true;
       alertIssue(error.message+' · Se pausó la voz para evitar intentos repetidos. Tocá «Volver a escuchar» para reintentar, o probá la voz desde Configuración → OpenAI y Google Gemini.');
     }finally{if(chat.voiceAbort===abort)chat.voiceAbort=null;}
   })();
 }
 function stopMic(){
   if(chat.recognizer){const rec=chat.recognizer;chat.recognizer=null;rec.onend=null;rec.abort();}
   if(chat.recorder?.state==='recording'){chat.recorder.onstop=null;chat.recorder.stop();}
   chat.stream?.getTracks().forEach(t=>t.stop());chat.stream=null;chat.recorder=null;
   $('chatMic').classList.remove('recording');
 }
 function reset(){
   stopMic();stopVoice();
   chat.items=[];chat.pending=null;chat.unresolved=null;chat.editIndex=null;chat.phase='collect';chat.busy=false;chat.key=key();
   messages.replaceChildren();review.classList.add('hidden');editor.classList.add('hidden');clearAlert();
   $('chatInput').value='';status('Podés hablar o escribir.');say(welcome,{skipVoice:true});
 }
 function close(){chat.closed=true;stopMic();stopVoice();if(dlg.open)dlg.close();}
 function open(){
   if(!dlg.open)dlg.showModal();
   chat.closed=false;
   const enabled=hasAI();
   $('chatAIOption').classList.toggle('hidden',!enabled);
   $('chatNaturalOption').classList.toggle('hidden',!enabled);
   $('chatBetterSTTOption').classList.toggle('hidden',!enabled);
   $('chatAI').checked=enabled;
   if(!chat.items.length||chat.phase==='saved')reset();
 }
 function describe(t,i){
   return (i+1)+': '+(t.type==='income'?'Ingreso':'Gasto')+', '+t.title+', '+fmt(t.amount)
     +(t.dueDate?', vence '+dateLabel(t.dueDate):', registrado '+dateLabel(t.date))
     +(t.type==='expense'?(t.isPaid?', pagado':', pendiente'):'')
     +(t.installmentCount>1?', '+t.installmentCount+' cuotas':'')+'.';
 }
 function renderReview(){
   if(!chat.items.length){review.classList.add('hidden');return;}
   review.classList.remove('hidden');
   const expense=chat.items.filter(x=>x.type==='expense').reduce((n,x)=>n+x.amount,0);
   const income=chat.items.filter(x=>x.type==='income').reduce((n,x)=>n+x.amount,0);
   review.innerHTML='<strong class="chat-review-head">Tanda sin guardar ('+chat.items.length+')</strong>'+
     '<small>Gastos: '+esc(fmt(expense))+' · Ingresos: '+esc(fmt(income))+'</small>'+
     chat.items.map((t,i)=>'<div class="chat-review-item"><span>'+ (i+1) +'.</span>'+
      '<div><strong>'+esc(t.title)+'</strong><small>'+esc(fmt(t.amount))+' · '+
       esc(t.dueDate?'Vence '+dateLabel(t.dueDate):'Fecha '+dateLabel(t.date))+
       ' · '+(t.isPaid?'Pagado':'Pendiente')+'</small></div>'+
       '<button type="button" data-chat-edit="'+i+'">Editar</button>'+
       '<button type="button" data-chat-remove="'+i+'" title="Quitar movimiento">✕</button></div>').join('')+
     '<div class="chat-review-actions"><button type="button" class="btn btn-muted" id="chatMore">+ Otro</button>'+
     '<button type="button" class="btn btn-primary" id="chatSaveAll">✓ Guardar tanda</button></div>';
 }
 function summarize(){
   if(!chat.items.length){say('Todavía no anoté ningún movimiento. ¿Cuál agregamos?');return;}
   chat.phase='confirm';renderReview();
   const lines=chat.items.map(describe).join(' ');
   say('Anoté '+chat.items.length+' movimiento'+(chat.items.length===1?'':'s')+'. '+lines+
     ' ¿Está todo bien? Decime "sí, guardar" o tocá Editar.');
   status('Esperando confirmación. Nada fue guardado todavía.');
 }
 function edit(index=null,candidate=null,returnPhase='confirm'){
   const d=candidate||chat.items[index];if(!d)return;
   chat.editIndex=index;chat.pending=candidate;chat.returnPhase=returnPhase;chat.phase='edit';
   editor.classList.remove('hidden');review.classList.add('hidden');
   $('chatEditTitle').value=d.title||'';$('chatEditAmount').value=d.amount||'';
   $('chatEditDate').value=d.date||'';$('chatEditDue').value=d.dueDate||'';
   $('chatEditType').value=d.type||'expense';
   $('chatEditCategory').innerHTML=cats.map(c=>'<option value="'+esc(c)+'">'+esc(c)+'</option>').join('');
   $('chatEditCategory').value=cats.includes(d.category)?d.category:'Otros';
   $('chatEditAccount').innerHTML='<option value="">Sin especificar</option>'+getAccounts().map(a=>
     '<option value="'+esc(a.id)+'">'+esc(a.name)+'</option>').join('');
   $('chatEditAccount').value=d.accountId||'';
   $('chatEditCount').value=d.installmentCount||1;
   $('chatEditPaid').checked=Boolean(d.isPaid);$('chatEditRecurring').checked=Boolean(d.isRecurring);
   $('chatEditNotes').value=d.notes||'';
   status('Corregí los campos y aplicá los cambios; aún no se guarda nada.');
   editor.scrollIntoView({block:'nearest',behavior:'smooth'});
 }
 function applyEdit(event){
   event.preventDefault();
   const type=$('chatEditType').value,amount=Number($('chatEditAmount').value),
     count=Number($('chatEditCount').value),date=$('chatEditDate').value,
     dueDate=$('chatEditDue').value||null,id=$('chatEditAccount').value||null;
   const a=account(id),recurring=$('chatEditRecurring').checked;
   if(!date||!$('chatEditTitle').value.trim()||!(amount>0&&Number.isFinite(amount)))return say('Revisá el importe, la fecha y el concepto.');
   if(!Number.isInteger(count)||count<1||count>60)return say('Elegí entre una y sesenta cuotas.');
   if(type==='expense'&&count>1&&a?.kind!=='credit')return say('Las cuotas requieren una tarjeta de crédito.');
   if(type==='income'&&(dueDate||recurring||count>1))return say('Los ingresos no admiten vencimientos, cuotas ni gastos fijos.');
   if(recurring&&(count>1||a?.kind==='credit'))return say('El gasto fijo no se puede combinar con una compra financiada.');
   const before=chat.pending||chat.items[chat.editIndex]||{};
   const d={...before,type,title:$('chatEditTitle').value.trim(),amount:Math.round(amount*100)/100,
     date,dueDate:type==='income'?null:dueDate,category:$('chatEditCategory').value,
     accountId:id,installmentCount:count,isRecurring:recurring,isPaid:$('chatEditPaid').checked,
     notes:$('chatEditNotes').value,questions:[]};
   if(chat.editIndex===null)chat.items.push(d);else chat.items[chat.editIndex]=d;
   chat.pending=null;chat.editIndex=null;chat.phase=chat.returnPhase;editor.classList.add('hidden');
   renderReview();say(chat.phase==='confirm'?'Corregido. ¿Está todo bien para guardar?':'Corregido, sin guardar. ¿Qué otro movimiento agregamos?');
 }
 const intro=/^(?:hola|buenas|tengo que cargar (?:algunos |unos )?(?:gastos|movimientos)|necesito cargar (?:algunos |unos )?(?:gastos|movimientos)|quiero (?:cargar|anotar|registrar) (?:algunos |unos )?(?:gastos|movimientos))$/;
 const done=/^(?:nada mas|listo|termine|ya esta|es todo|eso es todo|eso seria todo|no tengo mas|no hay mas|terminamos)$/;
 const yes=/^(?:si|si guardar|si guardalos|si estan bien|estan bien|correcto|confirmo|confirmar|guardar|guardalos|guarda todo|dale guardalos|perfecto|ok)$/;
 const no=/^(?:no|espera|corregir|hay un error|no estan bien)$/;
 const more=/^(?:otro|otro gasto|otro ingreso|agregar otro|uno mas|un gasto mas|quiero agregar otro)$/;
 async function saveBatch(){
   if(chat.busy||chat.phase!=='confirm'||!chat.items.length)return;
   chat.busy=true;status('Guardando...');
   try{
     const transactions=chat.items.map(t=>({type:t.type,title:t.title,amount:t.amount,date:t.date,
       dueDate:t.dueDate||null,category:t.category,accountId:t.accountId||null,
       installmentCount:t.installmentCount||1,isRecurring:Boolean(t.isRecurring),isPaid:Boolean(t.isPaid),notes:t.notes||''}));
     const result=await request('/api/transactions/batch','POST',{transactions,requestId:chat.key});
     chat.phase='saved';review.classList.add('hidden');editor.classList.add('hidden');
     say('Listo, guardé '+result.count+' movimiento'+(result.count===1?'':'s')+'. Si querés, empezamos otra tanda.');
     await refresh();status('Tanda guardada.');
   }catch(e){say('No pude guardar: '+e.message+'. La tanda continúa pendiente de confirmación.');status('No se guardó la tanda.');}
   finally{chat.busy=false;}
 }
 async function processAIMessage(text){
   chat.busy=true;status('La IA está interpretando lo que dijiste...');
   try{
     const query=chat.unresolved?'Mensaje anterior pendiente: '+chat.unresolved+'. Aclaración: '+text:text;
     const pending=await request('/api/chat/turn','POST',{text:query,phase:chat.phase,items:chat.items,provider:providerFor('nlu')});
     const r=await waitTask(pending,u=>request(u),status);
     const action=r.action;
     if(action==='add'){
       chat.unresolved=null;chat.items.push(...r.items);chat.phase='collect';renderReview();
       say((r.reply||'Listo.')+' Quedaron '+chat.items.length+' movimientos sin guardar. ¿Hay algo más?');
     }else if(action==='edit'){
       chat.unresolved=null;chat.items[r.index]=r.items[0];chat.phase='collect';renderReview();
       say((r.reply||'Corregido.')+' ¿Querés agregar algo o repasamos todo?');
     }else if(action==='remove'){
       chat.unresolved=null;chat.items.splice(r.index,1);chat.phase='collect';renderReview();
       say(r.reply||'Listo, quité ese movimiento.');
     }else if(action==='review'){
       chat.unresolved=null;summarize();
     }else if(action==='confirm'){
       const affirmative=/\b(si|guard[a-z]*|confirm[a-z]*|correcto|dale|perfecto|estan bien|todo bien)\b/.test(norm(text));
       if(chat.phase==='confirm'&&affirmative){
         // La confirmación explícita es obligatoria aunque el modelo diga "confirm".
         chat.busy=false;await saveBatch();return;
       }
       if(chat.items.length)summarize();
       else say('Todavía no hay gastos. Contame qué querés anotar.');
     }else if(action==='reset'){
       chat.items=[];chat.unresolved=null;chat.key=key();chat.phase='collect';renderReview();
       say('Descarté la tanda sin registrar nada. '+r.reply);
     }else if(action==='clarify'){
       chat.unresolved=text;say(r.reply||'Me falta un dato. ¿Me lo aclarás?');
     }else{
       say(r.reply||'Te escucho, contame los gastos como te salgan.');
     }
   }catch(error){
     // Nunca transformar una falla de IA en un registro local incorrecto.
     status('No se pudo interpretar. Podés reintentar, no se guardó nada.');
     say('No pude interpretar esa frase: '+error.message+' Podés repetirla; no guardé nada.');
   }finally{chat.busy=false;}
 }
 async function processMessage(raw){
   const text=String(raw||'').trim();if(!text||chat.busy)return;
   clearAlert();
   stopVoice();bubble('user',text);$('chatInput').value='';
   const cmd=norm(text);
   if(chat.phase==='saved'){
     chat.phase='collect';chat.items=[];chat.key=key();review.classList.add('hidden');
     if(intro.test(cmd)||more.test(cmd))return say(welcome);
   }
   if(chat.phase==='edit')return say('Terminá de completar el formulario de edición para continuar.');
   if(hasAI()&&$('chatAI').checked)return processAIMessage(text);
   if(chat.phase==='confirm'){
     if(yes.test(cmd))return saveBatch();
     if(no.test(cmd))return say('Claro. Tocá Editar junto al movimiento que quieras corregir.');
     if(more.test(cmd)){chat.phase='collect';return say('Te escucho. Decime el siguiente movimiento.');}
     return say('Para guardar decí "sí, guardar". También podés Editar o agregar otro.');
   }
   if(done.test(cmd))return summarize();
   if(intro.test(cmd))return say(welcome);
   if(more.test(cmd))return say('Sí, decime el siguiente.');
   if(cmd==='cancelar tanda'||cmd==='borrar todos los gastos'){
     chat.items=[];chat.phase='collect';renderReview();return say('Descarté la tanda. No se guardó ningún gasto.');
   }
   if(chat.items.length>=25)return say('Llegamos a veinticinco movimientos. Decí "nada más" para repasarlos.');
   chat.busy=true;status('Interpretando...');
   try{
     const phrase=(chat.pending?.notes?chat.pending.notes+' ':'')+text;
     const d=await request('/api/interpret','POST',{text:phrase,useAI:$('chatAI').checked&&hasAI(),provider:providerFor('nlu')});
     if(d.questions?.length||!(d.amount>0)||(d.installmentCount>1&&account(d.accountId)?.kind!=='credit')){
       say('Necesito revisar algunos datos. '+(d.questions||[]).join(' ')+'. Completalos en el formulario.');
       edit(null,d,'collect');
     }else{
       chat.pending=null;chat.items.push(d);renderReview();
       say('Anotado, pero todavía sin guardar: '+describe(d,chat.items.length-1)+' ¿Otro? Cuando termines decí "nada más".');
     }
   }catch(e){say('No pude interpretar ese movimiento: '+e.message+'. Podés repetirlo.');}
   finally{chat.busy=false;status(chat.phase==='edit'?'Completá la edición.':'Decí "nada más" para terminar la tanda.');}
 }
 function startMic(){
   if(chat.closed||chat.busy||chat.phase==='saved'||chat.phase==='edit'||chat.recognizer||chat.recorder)return;
   stopVoice();
   const Speech=window.SpeechRecognition||window.webkitSpeechRecognition;
   if(Speech && !(hasAI()&&$('chatBetterSTT').checked&&!$('chatHandsFree').checked)){
     const rec=new Speech();chat.recognizer=rec;rec.lang='es-AR';rec.continuous=false;rec.interimResults=true;
     let result='';
     rec.onresult=e=>{result=Array.from(e.results).map(r=>r[0].transcript).join(' ').trim();$('chatInput').value=result;};
     rec.onerror=e=>status('Error de voz: '+e.error+'. También podés escribir.');
     rec.onend=()=>{
       if(chat.recognizer!==rec)return;
       chat.recognizer=null;$('chatMic').classList.remove('recording');
       if(!chat.closed&&result)void processMessage(result);
       else if(!chat.closed)status('No escuché palabras. Tocá el micrófono para reintentar.');
     };
     try{rec.start();$('chatMic').classList.add('recording');status('Te escucho...');}
     catch(e){chat.recognizer=null;status('No se pudo activar el micrófono: '+e.message);}
     return;
   }
   if(!hasAI()||!window.MediaRecorder||!navigator.mediaDevices?.getUserMedia){
     status('El navegador no tiene dictado nativo. Podés escribir o configurar la transcripción por API.');
     return;
   }
   void navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}}).then(stream=>{
     if(chat.closed){stream.getTracks().forEach(t=>t.stop());return;}
     chat.stream=stream;chat.chunks=[];
     const options=['audio/webm;codecs=opus','audio/mp4','audio/webm','audio/ogg;codecs=opus']
       .find(t=>MediaRecorder.isTypeSupported?.(t));
     let rec;
     try{rec=new MediaRecorder(stream,options?{mimeType:options}:undefined);}
     catch(e){stream.getTracks().forEach(t=>t.stop());chat.stream=null;throw e;}
     chat.recorder=rec;chat.recordStarted=Date.now();
     rec.ondataavailable=e=>{if(e.data.size)chat.chunks.push(e.data);};
     rec.onerror=e=>{alertIssue('Falló la grabación en el navegador: '+(e.error?.message||'Error del dispositivo de audio')+'. Revisá el micrófono y permisos.');};
     rec.onstop=async()=>{
       $('chatMic').classList.remove('recording');stream.getTracks().forEach(t=>t.stop());
       chat.stream=null;chat.recorder=null;
       if(chat.closed)return;
       const elapsed=Date.now()-chat.recordStarted;
       const blob=new Blob(chat.chunks,{type:rec.mimeType||options||'audio/webm'});
       const rawType=blob.type||'audio/webm';
       if(elapsed<850||blob.size<500){
         alertIssue('La grabación duró '+(elapsed/1000).toFixed(1)+' s y produjo '+blob.size+
           ' bytes. Mantené el micrófono activo al menos un segundo; tocá otra vez para detener después de hablar.');
         return;
       }
       status('Enviando '+(blob.size/1024).toFixed(0)+' KB ('+rawType+') al modelo de transcripción...');
       try{
         const resp=await fetch('/api/voice/transcribe',{method:'POST',credentials:'same-origin',
           headers:{'Content-Type':rawType,'X-AI-Provider':providerFor('stt')},body:blob});
         if(!resp.ok)throw new Error(await audioProblem(resp,'Transcripción'));
         const original=await resp.json();
         const data={data:await waitTask(original.data,u=>request(u),status)};
         if(!data.data?.text)throw new Error('La API respondió sin texto. Revisá el micrófono y volvé a grabar.');
         clearAlert();status('Transcripción HTTP '+(data.data.httpStatus||resp.status)+
           ' · '+data.data.model+' · '+data.data.text);
         if(!chat.closed)await processMessage(data.data.text);
       }catch(e){
         alertIssue(e.message+' · Podés escribir el movimiento o ir a Configuración → Probar transcripción para identificar la causa.');
       }
     };
     rec.start();$('chatMic').classList.add('recording');
     clearAlert();status('Grabando... hablá normalmente y tocá el micrófono otra vez para detener ('+(rec.mimeType||'formato automático')+').');
   }).catch(e=>alertIssue(
     e.name==='NotAllowedError'?'No hay permiso de micrófono. Habilitalo para este sitio desde el candado del navegador.':
     e.name==='NotFoundError'?'No encontré ningún micrófono disponible. Conectá uno y recargá la página.':
     'No se pudo iniciar la grabación: '+e.message));

 }
 document.querySelectorAll('.assistant-open').forEach(el=>el.addEventListener('click',open));
 document.querySelectorAll('#chatDialog .close-dialog').forEach(el=>el.addEventListener('click',close));
 dlg.addEventListener('close',()=>{chat.closed=true;stopMic();stopVoice();});
 $('chatSend').addEventListener('click',()=>void processMessage($('chatInput').value));
 $('chatInput').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();void processMessage($('chatInput').value);}});
 $('chatMic').addEventListener('click',()=>{
   if(chat.recognizer){chat.recognizer.stop();return;}
   if(chat.recorder?.state==='recording'){chat.recorder.stop();return;}
   startMic();
 });
 $('chatQuick').addEventListener('click',()=>{close();openQuick();});
 $('chatEditForm').addEventListener('submit',applyEdit);
 $('chatEditCancel').addEventListener('click',()=>{
   editor.classList.add('hidden');chat.pending=null;chat.editIndex=null;chat.phase=chat.returnPhase;
   renderReview();say('Cancelé la edición. No se guardó nada.');
 });
 review.addEventListener('click',e=>{
   const editButton=e.target.closest('[data-chat-edit]'),remove=e.target.closest('[data-chat-remove]');
   if(editButton)return edit(Number(editButton.dataset.chatEdit),null,'confirm');
   if(remove){
     chat.items.splice(Number(remove.dataset.chatRemove),1);
     if(!chat.items.length){chat.phase='collect';renderReview();say('Quité el último. Decime un movimiento nuevo.');}
     else{renderReview();say('Lo quité de la tanda. Revisá antes de guardar.');}
     return;
   }
   if(e.target.closest('#chatMore')){chat.phase='collect';say('Dale, decime el siguiente.');}
   if(e.target.closest('#chatSaveAll')){if(chat.phase==='confirm')void saveBatch();else summarize();}
 });
 $('chatOpenDiagnostics').addEventListener('click',()=>{close();openDiagnostics();});
 $('chatReplayVoice').addEventListener('click',()=>{
   if(!chat.lastSpoken)return alertIssue('Todavía no hay ningún mensaje para reproducir.');
   const wasSuspended=chat.ttsSuspended;
   chat.ttsSuspended=false;clearAlert();
   if(!wasSuspended&&chat.speaker instanceof HTMLAudioElement && chat.speaker.src){
     void chat.speaker.play().then(()=>{clearAlert();status('Reproduciendo voz natural.');})
       .catch(e=>alertIssue('No se pudo reproducir el audio: '+e.message));
   }else say(chat.lastSpoken,{bubbleOnly:true});
 });
 $('chatSpeak').addEventListener('change',()=>{if(!$('chatSpeak').checked)stopVoice();else{chat.ttsSuspended=false;clearAlert();}});
 $('chatNaturalVoice').addEventListener('change',()=>{stopVoice();chat.ttsSuspended=false;clearAlert();});
 $('chatHandsFree').addEventListener('change',()=>{
   if($('chatHandsFree').checked&&!(window.SpeechRecognition||window.webkitSpeechRecognition)){
     $('chatHandsFree').checked=false;
     status('El modo manos libres requiere reconocimiento nativo; podés usar el micrófono manual.');
   }
 });
}