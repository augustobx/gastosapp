// Asistente conversacional sin servicios de diálogo pagos.
// Ningún movimiento se guarda hasta confirmar toda la tanda.
export function setupChat({request,refresh,getAccounts,fmt,dateLabel,hasAI,openQuick}){
 const $=id=>document.getElementById(id);
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const norm=x=>String(x||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[!?.,;:]+/g,' ').trim().replace(/\s+/g,' ');
 const cats=['Comida','Servicios','Hogar','Transporte','Salud','Educación','Tecnología','Entretenimiento','Indumentaria','Deudas y préstamos','Otros','Extra','Sueldo','Ventas'];
 const dlg=$('chatDialog'),messages=$('chatMessages'),review=$('chatReview'),editor=$('chatEditor');
 const chat={items:[],pending:null,editIndex:null,returnPhase:'collect',phase:'collect',busy:false,
   closed:true,speaker:null,recognizer:null,recorder:null,stream:null,chunks:[],key:null};
 const account=id=>getAccounts().find(a=>a.id===id);
 const welcome='Dale, decime el primer gasto o ingreso. Cuando termines, decí "nada más". Después los repasamos juntos.';
 const key=()=>Date.now().toString(36)+'-'+(crypto.randomUUID?.()||Math.random().toString(36).slice(2));
 function bubble(who,value){
   const el=document.createElement('div');el.className='chat-bubble '+who;el.textContent=value;
   messages.append(el);messages.scrollTop=messages.scrollHeight;
 }
 function status(value){$('chatStatus').textContent=value;}
 function stopVoice(){if('speechSynthesis' in window)window.speechSynthesis.cancel();chat.speaker=null;}
 function say(value){
   bubble('assistant',value);
   if(!$('chatSpeak').checked||!window.speechSynthesis)return;
   stopVoice();
   const u=new SpeechSynthesisUtterance(value);u.lang='es-AR';u.rate=1.03;
   const voices=window.speechSynthesis.getVoices();
   u.voice=voices.find(v=>v.lang.toLowerCase()==='es-ar')||voices.find(v=>v.lang.toLowerCase().startsWith('es'))||null;
   chat.speaker=u;
   u.onend=()=>{if(chat.speaker!==u)return;chat.speaker=null;
     if(!chat.closed&&!chat.busy&&$('chatHandsFree').checked&&chat.phase!=='edit'&&chat.phase!=='saved')startMic();
   };
   u.onerror=()=>{if(chat.speaker===u)chat.speaker=null;};
   try{window.speechSynthesis.speak(u);}catch{}
 }
 function stopMic(){
   if(chat.recognizer){const rec=chat.recognizer;chat.recognizer=null;rec.onend=null;rec.abort();}
   if(chat.recorder?.state==='recording'){chat.recorder.onstop=null;chat.recorder.stop();}
   chat.stream?.getTracks().forEach(t=>t.stop());chat.stream=null;chat.recorder=null;
   $('chatMic').classList.remove('recording');
 }
 function reset(){
   stopMic();stopVoice();
   chat.items=[];chat.pending=null;chat.editIndex=null;chat.phase='collect';chat.busy=false;chat.key=key();
   messages.replaceChildren();review.classList.add('hidden');editor.classList.add('hidden');
   $('chatInput').value='';status('Podés hablar o escribir.');say(welcome);
 }
 function close(){chat.closed=true;stopMic();stopVoice();if(dlg.open)dlg.close();}
 function open(){
   if(!dlg.open)dlg.showModal();
   chat.closed=false;
   $('chatAIOption').classList.toggle('hidden',!hasAI());
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
 async function processMessage(raw){
   const text=String(raw||'').trim();if(!text||chat.busy)return;
   stopVoice();bubble('user',text);$('chatInput').value='';
   const cmd=norm(text);
   if(chat.phase==='saved'){
     chat.phase='collect';chat.items=[];chat.key=key();review.classList.add('hidden');
     if(intro.test(cmd)||more.test(cmd))return say(welcome);
   }
   if(chat.phase==='edit')return say('Terminá de completar el formulario de edición para continuar.');
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
     const d=await request('/api/interpret','POST',{text:phrase,useAI:$('chatAI').checked&&hasAI()});
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
   if(Speech){
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
   void navigator.mediaDevices.getUserMedia({audio:true}).then(stream=>{
     if(chat.closed){stream.getTracks().forEach(t=>t.stop());return;}
     chat.stream=stream;chat.chunks=[];const rec=new MediaRecorder(stream);chat.recorder=rec;
     rec.ondataavailable=e=>{if(e.data.size)chat.chunks.push(e.data);};
     rec.onstop=async()=>{
       $('chatMic').classList.remove('recording');stream.getTracks().forEach(t=>t.stop());
       chat.stream=null;if(chat.closed){chat.recorder=null;return;}
       status('Transcribiendo...');
       try{
         const blob=new Blob(chat.chunks,{type:rec.mimeType||'audio/webm'});
         const resp=await fetch('/api/voice/transcribe',{method:'POST',credentials:'same-origin',headers:{'Content-Type':blob.type},body:blob});
         const data=await resp.json();if(!resp.ok)throw new Error(data.error||'Error de transcripción');
         if(data.data?.text&&!chat.closed)await processMessage(data.data.text);
       }catch(e){status('No pude transcribir: '+e.message);}
       finally{chat.recorder=null;}
     };
     rec.start();$('chatMic').classList.add('recording');status('Grabando... tocá para detener.');
   }).catch(e=>status('Micrófono no disponible: '+e.message));
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
 $('chatSpeak').addEventListener('change',()=>{if(!$('chatSpeak').checked)stopVoice();});
 $('chatHandsFree').addEventListener('change',()=>{
   if($('chatHandsFree').checked&&!(window.SpeechRecognition||window.webkitSpeechRecognition)){
     $('chatHandsFree').checked=false;
     status('El modo manos libres requiere reconocimiento nativo; podés usar el micrófono manual.');
   }
 });
}