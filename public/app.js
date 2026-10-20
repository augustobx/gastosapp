import {setupAIUsage} from './ai-usage.js?v=15';
import {providerFor,saveProvider} from './providers.js?v=15';
import { setupChat } from './chat.js?v=15';
import { setupAIDiagnostics } from './diagnostics.js?v=15';
const $ = id => document.getElementById(id);
const $$ = selector => [...document.querySelectorAll(selector)];
const fmt = n => new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:2}).format(Number(n||0));
const localDay = () => {const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');};
const escape = s => String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dateLabel = s => s ? s.slice(8,10)+'/'+s.slice(5,7)+'/'+s.slice(0,4) : '';
const iconFor = c => ({Comida:'◈',Servicios:'⌁',Hogar:'⌂',Transporte:'➤',Salud:'✚',Educación:'▤','Deudas y préstamos':'▧',Tecnología:'▣',Entretenimiento:'✦',Indumentaria:'✧',Extra:'↗',Sueldo:'↗',Ventas:'↗'})[c]||'◉';
const types = {dashboard:['Resumen','Tu dinero, más claro.','Una mirada simple a tus finanzas.'],movements:['Movimientos','Cada peso cuenta.','Buscá, controlá y administrá tus movimientos.'],cards:['Cuentas y tarjetas','Todos tus medios de pago.','Compras, tarjetas y vencimientos.'],reports:['Estadísticas','Conocé tus números.','Así se distribuye tu dinero.'],settings:['Configuración','A tu manera.','Ajustá la experiencia a tus necesidades.']};
const categories = ['Comida','Servicios','Hogar','Transporte','Salud','Educación','Tecnología','Entretenimiento','Indumentaria','Deudas y préstamos','Tarjetas','Otros','Extra','Sueldo','Ventas'];
let aiDiagnostics=null,aiUsagePanel=null;
const state = {month:localDay().slice(0,7),data:null,auth:false,aiEnabled:false,view:'dashboard',draft:null,editId:null,accountEditId:null,recognizer:null,recorder:null,audioStream:null,audioChunks:[],deferredInstall:null};
function toast(message){const t=$('toast');t.textContent=message;t.classList.add('visible');clearTimeout(toast.timer);toast.timer=setTimeout(()=>t.classList.remove('visible'),4200);}
async function request(url, method='GET',body) {
  const options={method,credentials:'same-origin',headers:{}};
  if(body!==undefined){options.headers['Content-Type']='application/json';options.body=JSON.stringify(body);}
  let response;
  try{response=await fetch(url,options);}catch{throw new Error('No hay conexión con el servidor');}
  let j={};try{j=await response.json();}catch{}
  if(response.status===401){showLogin();throw new Error('Volvé a iniciar sesión');}
  if(!response.ok){
    const detail=(j.upstreamStatus?'OpenAI HTTP '+j.upstreamStatus+' · ':'')+
      (j.error||'La operación no pudo completarse')+
      (j.hint?' · SOLUCIÓN: '+j.hint:'');
    const error=new Error(detail);
    error.code=j.code||'http_'+response.status;
    error.status=response.status;
    throw error;
  }
  return j.data!==undefined?j.data:j;
}
function showLogin(){state.auth=false;$('loginScreen').classList.remove('hidden');}
function hideLogin(){state.auth=true;$('loginScreen').classList.add('hidden');}
function go(view){
  state.view=view;
  $$('.view').forEach(x=>x.classList.toggle('active',x.id==='view-'+view));
  $$('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
  const meta=types[view];$('breadcrumb').textContent=meta[0];$('pageTitle').textContent=meta[1];$('pageSubtitle').textContent=meta[2];
  window.scrollTo({top:0,behavior:'smooth'});
  if(view==='settings'&&state.auth){void aiDiagnostics?.load();void aiUsagePanel?.refresh();}
}
const account = id => state.data?.accounts.find(a=>a.id===id);
function populateAccounts(selected){
  const list=state.data?.accounts||[];
  $('txAccount').innerHTML='<option value="">Sin especificar</option>'+list.map(a=>'<option value="'+escape(a.id)+'">'+escape(a.name)+'</option>').join('');
  if(selected!==undefined)$('txAccount').value=selected||'';
}
function render(){
  const d=state.data;if(!d)return;
  $('kpiBalance').textContent=fmt(d.balance);$('kpiIncome').textContent=fmt(d.income);
  $('kpiExpense').textContent=fmt(d.expenses);$('kpiPending').textContent=fmt(d.pending);
  $('incomeNote').textContent=fmt(d.salary)+' sueldo + '+fmt(d.extraIncome)+' extra';
  $('pendingNote').textContent=d.upcoming.length+' vencimiento(s) pendiente(s)';
  $('expenseNote').textContent=fmt(d.paid)+' ya pagados';
  $('budgetPercent').textContent=d.income>0?Math.round(d.expenses/d.income*100)+'%':'—';
  $('budgetBar').style.width=(d.income>0?Math.min(100,d.expenses/d.income*100):0)+'%';
  $('balanceCaption').textContent=d.balance>=0?'Resultado positivo':'Compromisos superiores a ingresos';
  $('reportBalance').textContent=fmt(d.balance);
  $('reportInsight').textContent=d.balance>=0?'Te queda presupuesto para este mes.':'Revisá gastos y cuotas pendientes.';
  $('salaryInput').value=d.settings.salary||0;
  $('recentList').innerHTML=rowsMarkup(d.rows.slice(0,7),false);
  $('allMovements').innerHTML=rowsMarkup(filteredRows(),true);
  $('upcomingList').innerHTML=upcomingMarkup(d.upcoming.slice(0,5));
  $('categoryChart').innerHTML=categoryMarkup(d.categories);
  $('reportCategories').innerHTML=categoryMarkup(d.categories);
  $('paidSplit').innerHTML='<div class="split-item"><span>✓ Ya pagado</span><strong>'+fmt(d.paid)+'</strong></div><div class="split-item"><span>◷ Por pagar</span><strong>'+fmt(d.pending)+'</strong></div><div class="split-item"><span>Ingreso mensual estimado</span><strong>'+fmt(d.income)+'</strong></div>';
  $('accountCards').innerHTML=d.accounts.map(a=>'<article class="account-card '+escape(a.kind)+'"><span class="account-icon">'+(a.kind==='credit'?'▣':a.kind==='cash'?'＄':'◈')+'</span><button data-edit-account="'+escape(a.id)+'" aria-label="Editar '+escape(a.name)+'">Editar</button><strong>'+escape(a.name)+'</strong><small>'+({credit:'Tarjeta de crédito',debit:'Débito',cash:'Efectivo',wallet:'Billetera virtual',transfer:'Transferencia',other:'Otro'}[a.kind]||a.kind)+(a.kind==='credit'?' · Cierre '+a.closingDay+' / Vto. '+a.dueDay:'')+'</small></article>').join('');
  $('purchasesList').innerHTML=d.purchases.length ? d.purchases.map(p=>'<div class="purchase-row"><div><strong>'+escape(p.title)+'</strong><small>'+dateLabel(p.date)+' · '+p.count+' cuota(s) · '+escape(account(p.accountId)?.name||'Tarjeta')+'</small></div><strong>'+fmt(p.amount)+'</strong><button class="btn btn-muted" data-delete="'+escape(p.id)+'">Eliminar</button></div>').join(''):'<div class="empty">Todavía no registraste compras financiadas.</div>';
}
function filteredRows(){
  let data=state.data?.rows||[];
  const q=$('movementSearch').value.trim().toLocaleLowerCase('es-AR'),t=$('typeFilter').value;
  if(q)data=data.filter(x=>(x.title+' '+x.category+' '+(account(x.accountId)?.name||'')).toLocaleLowerCase('es-AR').includes(q));
  if(t==='pending')data=data.filter(x=>x.type==='expense'&&!x.isPaid);
  else if(t!=='all')data=data.filter(x=>x.type===t);
  return data;
}
function rowsMarkup(rows,full){
  if(!rows.length)return '<div class="empty">No hay movimientos en este mes. <br>Probá registrar uno hablando con el asistente ✦</div>';
  return rows.map(t=>{
    const income=t.type==='income',id=t.isInstallment?t.installmentId:t.id,tag=t.isInstallment?' · Cuota '+t.number+'/'+t.total:'';
    const subtitle=(t.dueDate?'Vence '+dateLabel(t.dueDate)+' · ':'')+dateLabel(t.date)+' · '+escape(t.category)+' · '+escape(account(t.accountId)?.name||'Sin medio')+tag+(t.isRecurring?' · Fijo mensual':'');
    const status=income?'Ingreso':t.isPaid?'Pagado':'Pendiente';
    return '<div class="tx-row"><span class="tx-icon '+(income?'income':'')+'">'+iconFor(t.category)+'</span><div class="tx-info"><strong>'+escape(t.title)+'</strong><small>'+subtitle+'</small></div><div class="tx-amount"><strong class="'+(income?'incoming':'')+'">'+(income?'+':'−')+fmt(t.amount)+'</strong><small>'+status+'</small></div>'+(full?'<div class="tx-ops">'+(!income?'<button class="action-mini" data-paid="'+escape(id)+'" data-next-paid="'+(!t.isPaid)+'" title="'+(t.isPaid?'Marcar pendiente':'Marcar pagado')+'">'+(t.isPaid?'↶':'✓')+'</button>':'')+(!t.isInstallment&&!t.isRecurring?'<button class="action-mini" data-edit="'+escape(t.id)+'" title="Editar">✎</button>':'')+'<button class="action-mini" data-delete="'+escape(t.isInstallment?t.purchaseId:t.isRecurring?t.recurrenceId:t.id)+'" title="'+(t.isInstallment?'Eliminar compra completa':'Eliminar')+'">✕</button></div>':'')+'</div>';
  }).join('');
}
function upcomingMarkup(rows) {
  if(!rows.length)return '<div class="empty">¡Todo al día! No tenés pagos pendientes en este mes.</div>';
  return rows.map(t=>'<div class="due-item"><div class="due-date"><strong>'+escape((t.dueDate||t.date).slice(8,10))+'</strong><small>'+escape((t.dueDate||t.date).slice(5,7))+'</small></div><div class="due-details"><strong>'+escape(t.title)+'</strong><small>'+escape(account(t.accountId)?.name||t.category)+(t.isInstallment?' · Cuota '+t.number+'/'+t.total:'')+'</small></div><span class="due-price">'+fmt(t.amount)+'</span></div>').join('');
}
function categoryMarkup(cats) {
  if(!cats.length)return '<div class="empty">Todavía no hay gastos para analizar.</div>';
  const max=Math.max(...cats.map(x=>x.amount),1);
  return cats.slice(0,8).map(x=>'<div class="chart-item"><div class="chart-label"><span>'+escape(x.name)+'</span><strong>'+fmt(x.amount)+'</strong></div><div class="chart-track"><div class="chart-fill" style="width:'+Math.min(100,x.amount/max*100)+'%"></div></div></div>').join('');
}
async function refresh() {
  state.data=await request('/api/state?month='+encodeURIComponent(state.month));
  render();populateAccounts($('txAccount').value);
}
function showDialog(id){const dlg=$(id);if(!dlg.open)dlg.showModal();}
function closeDialogs(){$$('dialog[open]').forEach(x=>x.close());}
function setTransactionMode(){
  const type=$('movementForm').elements.movementType.value;
  const isIncome=type==='income';
  $('installmentsField').classList.toggle('hidden',isIncome);
  $('recurringField').classList.toggle('hidden',isIncome);
  const a=account($('txAccount').value);
  const isCredit=!isIncome&&a?.kind==='credit';
  $('dueDateField').classList.toggle('hidden',isIncome||isCredit||$('txRecurring').checked);
  $('txPaidLabel').textContent=isIncome?'Ya recibido':'Ya pagado';
  $('installmentHint').classList.toggle('hidden',isIncome);
  if(isIncome){$('txInstallments').value='1';$('txRecurring').checked=false;$('txDueDate').value='';}
  if(isCredit)$('txDueDate').value='';
  if(!isIncome&&a?.kind==='credit'){
    $('txPaid').checked=false;$('txPaid').disabled=true;
    $('installmentHint').textContent='Las compras con crédito generan vencimientos independientes según el cierre de la tarjeta.';
  }else{
    $('txPaid').disabled=false;
    $('installmentHint').textContent='Para compras en cuotas, elegí una tarjeta de crédito.';
  }
}
function openMovement(item){
  state.editId=item?.id||null;
  $('movementForm').reset();
  $('movementDialogTitle').textContent=item?'Editar movimiento':'Nuevo movimiento';
  $('movementForm').elements.movementType.value=item?.type||'expense';
  $('txAmount').value=item?.amount||'';
  $('txTitle').value=item?.title||'';
  $('txDate').value=item?.date||localDay();
  $('txDueDate').value=item?.dueDate||'';
  $('txCategory').value=item?.category||'Otros';
  populateAccounts(item?.accountId||'');
  $('txAccount').value=item?.accountId||'';
  $('txInstallments').value='1';
  $('txRecurring').checked=false;
  $('txPaid').checked=item?item.isPaid:false;
  $('txNotes').value=item?.notes||'';
  $$('.segmented input').forEach(x=>x.disabled=!!item);
  $('txInstallments').disabled=!!item;
  setTransactionMode();
  showDialog('movementDialog');
}
async function saveMovement(e){
  e.preventDefault();
  const payload={type:$('movementForm').elements.movementType.value,amount:Number($('txAmount').value),
    title:$('txTitle').value,date:$('txDate').value,dueDate:$('txDueDate').value||null,category:$('txCategory').value,
    accountId:$('txAccount').value||null,installmentCount:Number($('txInstallments').value),
    isRecurring:$('txRecurring').checked,
    isPaid:$('txPaid').checked,notes:$('txNotes').value};
  try {
    if(state.editId)await request('/api/transactions/'+state.editId,'PATCH',payload);
    else await request('/api/transactions','POST',payload);
    closeDialogs();await refresh();toast('Movimiento guardado correctamente');
  }catch(err){toast(err.message);}
}
function openAccount(item){
  state.accountEditId=item?.id||null;
  $('accountForm').reset();
  $('accountDialogTitle').textContent=item?'Editar medio de pago':'Nuevo medio de pago';
  $('accountName').value=item?.name||'';
  $('accountKind').value=item?.kind||'credit';
  $('accountClosing').value=item?.closingDay||25;$('accountDue').value=item?.dueDay||10;
  $('creditFields').classList.toggle('hidden',$('accountKind').value!=='credit');
  showDialog('accountDialog');
}
async function saveAccount(e){
  e.preventDefault();
  const payload={name:$('accountName').value,kind:$('accountKind').value,
    closingDay:Number($('accountClosing').value),dueDay:Number($('accountDue').value)};
  try{
    if(state.accountEditId)await request('/api/accounts/'+state.accountEditId,'PATCH',payload);
    else await request('/api/accounts','POST',payload);
    closeDialogs();await refresh();toast('Medio de pago guardado');
  }catch(err){toast(err.message);}
}
function preview(){
  const d=state.draft;if(!d)return;
  const method=account(d.accountId)?.name||d.mentionedMethod||'Sin especificar';
  const questions=d.questions||[];
  const blocked=d.amount===null||!Number.isFinite(Number(d.amount))||Number(d.amount)<=0||
    (d.installmentCount>1 && account(d.accountId)?.kind!=='credit')||(d.installmentCount>1&&d.isRecurring)||questions.length>0;
  const entries=[
    ['Tipo',d.type==='income'?'Ingreso':'Gasto'],['Importe',d.amount?fmt(d.amount):'Sin identificar'],
    ['Concepto',d.title],['Registrado',dateLabel(d.date)],
    ['Vencimiento',d.dueDate?dateLabel(d.dueDate):'Sin vencimiento'],
    ['Estado',d.isPaid?'Ya pagado':'Pendiente de pago'],['Categoría',d.category],
    ['Medio',method],['Pago',d.isRecurring?'Gasto fijo mensual':d.installmentCount>1?d.installmentCount+' cuotas':(d.type==='income'?'Ingreso único':'Pago único')]
  ];
  $('assistantPreview').innerHTML='<h3>✦ Esto entendí</h3><div class="preview-grid">'+entries.map(x=>'<div class="preview-item"><small>'+escape(x[0])+'</small><strong>'+escape(x[1])+'</strong></div>').join('')+'</div>'+
    (questions.length?'<div class="preview-note">'+questions.map(q=>'⚠ '+escape(q)).join('<br>')+'</div>':'')+
    '<div class="preview-actions"><button class="btn btn-muted" id="previewEdit">Revisar / editar</button><button class="btn btn-primary" id="previewSave" '+(blocked?'disabled title="Revisá la información faltante"':'')+'>Confirmar y guardar</button></div>';
  $('assistantPreview').classList.remove('hidden');
  $('previewEdit').addEventListener('click',()=>{
    const draft=state.draft;
    closeDialogs();openMovement();
    $('movementForm').elements.movementType.value=draft.type;
    $('txAmount').value=draft.amount||'';$('txTitle').value=draft.title||'';
    $('txDate').value=draft.date||localDay();
    $('txDueDate').value=draft.dueDate||'';
    $('txCategory').value=categories.includes(draft.category)?draft.category:'Otros';
    $('txAccount').value=draft.accountId||'';
    $('txInstallments').value=String(draft.installmentCount||1);
    $('txRecurring').checked=Boolean(draft.isRecurring);
    $('txPaid').checked=draft.isPaid;$('txNotes').value=draft.notes||'';
    setTransactionMode();
  });
  $('previewSave').addEventListener('click',async()=>{
    $('previewSave').disabled=true;
    try{
      const payload={...state.draft};
      delete payload.questions;delete payload.confidence;delete payload.mentionedMethod;
      await request('/api/transactions','POST',payload);
      state.draft=null;closeDialogs();$('assistantText').value='';$('assistantPreview').classList.add('hidden');
      await refresh();toast('Movimiento registrado ✦');
    }catch(err){toast(err.message);$('previewSave').disabled=false;}
  });
}
async function interpretText(){
  const text=$('assistantText').value.trim();
  if(!text)return toast('Contame qué pasó para interpretarlo');
  $('interpretBtn').disabled=true;$('interpretBtn').textContent='Interpretando...';
  try{state.draft=await request('/api/interpret','POST',{text,useAI:$('useAI').checked,provider:providerFor('nlu')});preview();}
  catch(err){toast(err.message);}
  finally{$('interpretBtn').disabled=false;$('interpretBtn').textContent='Interpretar movimiento →';}
}
async function toggleVoice(){
  if(state.recognizer){state.recognizer.stop();return;}
  if(state.recorder?.state==='recording'){state.recorder.stop();return;}
  const NativeSpeech=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(NativeSpeech){
    const rec=new NativeSpeech();state.recognizer=rec;rec.lang='es-AR';rec.interimResults=true;rec.continuous=false;
    let heardSpeech=false;
    $('recordBtn').classList.add('recording');$('recordStatus').textContent='Escuchando... hablá ahora';
    rec.onresult=e=>{heardSpeech=true;$('assistantText').value=Array.from(e.results).map(x=>x[0].transcript).join(' ');};
    rec.onerror=e=>toast('Dictado no disponible: '+e.error);
    rec.onend=async()=>{state.recognizer=null;$('recordBtn').classList.remove('recording');
      $('recordStatus').textContent='Analizando lo que dijiste...';
      if(heardSpeech && $('assistantText').value.trim())await interpretText();
      $('recordStatus').textContent='Revisá la propuesta antes de guardarla';
    };
    try{rec.start();}catch(err){rec.onend();toast(err.message);}
    return;
  }
  if(!state.aiEnabled){toast('Este navegador no permite dictado nativo. Configurá la API de transcripción o escribí el movimiento.');return;}
  if(!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder){toast('No se puede acceder al micrófono en este navegador');return;}
  try{
    const stream=await navigator.mediaDevices.getUserMedia({audio:true});state.audioStream=stream;state.audioChunks=[];
    const m=new MediaRecorder(stream);state.recorder=m;
    m.ondataavailable=e=>{if(e.data.size)state.audioChunks.push(e.data);};
    m.onstop=async()=>{
      $('recordBtn').classList.remove('recording');$('recordStatus').textContent='Transcribiendo audio...';
      stream.getTracks().forEach(t=>t.stop());
      try{
        const blob=new Blob(state.audioChunks,{type:m.mimeType||'audio/webm'});
        const r=await fetch('/api/voice/transcribe',{method:'POST',credentials:'same-origin',headers:{'Content-Type':blob.type},body:blob});
        const j=await r.json();
        if(!r.ok)throw new Error(j.error||'No se pudo transcribir');
        $('assistantText').value=j.data.text;
        $('recordStatus').textContent='Analizando lo que dijiste...';
        if($('assistantText').value.trim())await interpretText();
        $('recordStatus').textContent='Revisá la propuesta antes de guardarla';
      }catch(err){toast(err.message);$('recordStatus').textContent='Probá escribirlo manualmente';}
      state.recorder=null;state.audioStream=null;
    };
    m.start();$('recordBtn').classList.add('recording');$('recordStatus').textContent='Grabando... tocá otra vez para detener';
  }catch(err){toast('No se pudo acceder al micrófono: '+err.message);}
}
function events(){
  aiDiagnostics=setupAIDiagnostics();
  aiUsagePanel=setupAIUsage({request});
  setupChat({
    request,refresh,getAccounts:()=>state.data?.accounts||[],fmt,dateLabel,hasAI:()=>state.aiEnabled,
    openQuick:()=>{$('assistantPreview').classList.add('hidden');state.draft=null;showDialog('assistantDialog');},
    openDiagnostics:()=>go('settings')
  });
  $$('[data-view]').forEach(b=>b.addEventListener('click',()=>go(b.dataset.view)));
  $$('[data-go]').forEach(b=>b.addEventListener('click',()=>go(b.dataset.go)));
  // El asistente principal se abre como conversación; el modo de un gasto queda como alternativa.
  $$(['.open-movement','#newTransactionBtn','#mobileTopAdd']).forEach(b=>b.addEventListener('click',()=>openMovement()));
  $$('.close-dialog').forEach(b=>b.addEventListener('click',closeDialogs));
  $$('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d)d.close();}));
  $('movementForm').addEventListener('submit',saveMovement);
  $$('.segmented input').forEach(b=>b.addEventListener('change',setTransactionMode));
  $('txAccount').addEventListener('change',setTransactionMode);
  $('txRecurring').addEventListener('change',setTransactionMode);
  $('movementSearch').addEventListener('input',()=>{$('allMovements').innerHTML=rowsMarkup(filteredRows(),true);});
  $('typeFilter').addEventListener('change',()=>{$('allMovements').innerHTML=rowsMarkup(filteredRows(),true);});
  $('monthFilter').addEventListener('change',async e=>{if(!e.target.value)return;state.month=e.target.value;try{await refresh();}catch(err){toast(err.message);}});
  $('newAccount').addEventListener('click',()=>openAccount());
  $('accountKind').addEventListener('change',()=>{$('creditFields').classList.toggle('hidden',$('accountKind').value!=='credit');});
  $('accountForm').addEventListener('submit',saveAccount);
  $('recordBtn').addEventListener('click',toggleVoice);
  $('interpretBtn').addEventListener('click',interpretText);
  $('salaryForm').addEventListener('submit',async e=>{e.preventDefault();try{await request('/api/settings','PATCH',{salary:Number($('salaryInput').value)});await refresh();toast('Sueldo actualizado');}catch(err){toast(err.message);}});
  $('exportBtn').addEventListener('click',async()=>{try{const data=await request('/api/export');const b=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});const u=URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download='gastosapp-'+localDay()+'.json';a.click();URL.revokeObjectURL(u);}catch(err){toast(err.message);}});
  $('logoutBtn').addEventListener('click',async()=>{await request('/api/logout','POST',{});showLogin();});
  $('loginForm').addEventListener('submit',async e=>{e.preventDefault();try{await request('/api/login','POST',{password:$('loginPassword').value});hideLogin();$('loginPassword').value='';$('loginError').textContent='';await refresh();}catch(err){$('loginError').textContent=err.message;}});
  $('themeToggle').addEventListener('click',()=>{const t=document.documentElement.dataset.theme==='light'?'dark':'light';document.documentElement.dataset.theme=t;localStorage.setItem('gastos-theme',t);$('themeToggle').textContent=t==='light'?'☀':'☾';});
  document.addEventListener('click',async e=>{
    const pay=e.target.closest('[data-paid]'),del=e.target.closest('[data-delete]'),edit=e.target.closest('[data-edit]'),acc=e.target.closest('[data-edit-account]');
    try{
      if(pay){await request('/api/paid/'+pay.dataset.paid,'PATCH',{isPaid:pay.dataset.nextPaid==='true'});await refresh();toast('Estado actualizado');}
      else if(del){if(!confirm('¿Eliminar este movimiento? Si es una compra financiada se eliminarán todas sus cuotas.'))return;
        await request('/api/transactions/'+del.dataset.delete,'DELETE');await refresh();toast('Movimiento eliminado');}
      else if(edit){const t=state.data.rows.find(x=>x.id===edit.dataset.edit&&!x.isInstallment);if(t)openMovement(t);}
      else if(acc){openAccount(state.data.accounts.find(a=>a.id===acc.dataset.editAccount));}
    }catch(err){toast(err.message);}
  });
  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();state.deferredInstall=e;$('installBtn').classList.remove('hidden');});
  $('installBtn').addEventListener('click',()=>{state.deferredInstall?.prompt();});
}
async function init(){
  document.documentElement.dataset.theme=localStorage.getItem('gastos-theme')||'dark';
  $('themeToggle').textContent=document.documentElement.dataset.theme==='light'?'☀':'☾';
  $('monthFilter').value=state.month;
  $('txCategory').innerHTML=categories.map(c=>'<option value="'+c+'">'+c+'</option>').join('');
  $('txInstallments').innerHTML=Array.from({length:60},(_,i)=>'<option value="'+(i+1)+'">'+(i===0?'Pago único':(i+1)+' cuotas')+'</option>').join('');
  events();
  if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});
  try{
    const s=await request('/api/session');state.aiEnabled=s.aiEnabled;
    $('aiOption').classList.toggle('hidden',!s.aiEnabled);
    if(s.authenticated){
      hideLogin();await refresh();
      try{
        const config=await request('/api/ai/config');
        localStorage.setItem('gastosapp-provider-default',config.defaultProvider||'openai');
        for(const service of ['nlu','stt','tts']){
          const current=providerFor(service);
          if(!config.providers?.[current]?.configured)
            saveProvider(service,config.defaultProvider||'openai');
        }
      }catch{/* Las finanzas funcionan incluso si los proveedores están desconectados. */}
    }else showLogin();
  }catch(err){toast(err.message);showLogin();}
}
init();