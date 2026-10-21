import {setupPasskeyUI} from './passkeys-ui.js?v=22';
import {setupPushUI} from './push-ui.js?v=22';
import {sortMovements} from './movement-sort.js?v=20';
import {tableMarkup} from './movement-table.js?v=20';
import {setupLoanEditor,previousMonthsCount} from './loan-edit.js?v=20';
import {setupInstallments} from './installments.js?v=20';
import {setupExpress} from './express.js?v=20';
import {setupAIUsage} from './ai-usage.js?v=20';
import {providerFor,saveProvider} from './providers.js?v=20';
import { setupChat } from './chat.js?v=20';
import { setupAIDiagnostics } from './diagnostics.js?v=20';
const $ = id => document.getElementById(id);
const $$ = selector => [...document.querySelectorAll(selector)];
const fmt = n => new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:2}).format(Number(n||0));
const localDay = () => {const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');};
const escape = s => String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dateLabel = s => s ? s.slice(8,10)+'/'+s.slice(5,7)+'/'+s.slice(0,4) : '';
const iconFor = c => ({Comida:'◈',Servicios:'⌁',Hogar:'⌂',Transporte:'➤',Salud:'✚',Educación:'▤','Deudas y préstamos':'▧',Tecnología:'▣',Entretenimiento:'✦',Indumentaria:'✧',Extra:'↗',Sueldo:'↗',Ventas:'↗'})[c]||'◉';
const types = {dashboard:['Resumen','Tu dinero, más claro.','Una mirada simple a tus finanzas.'],movements:['Movimientos','Cada peso cuenta.','Buscá, controlá y administrá tus movimientos.'],cards:['Cuentas y tarjetas','Todos tus medios de pago.','Compras, tarjetas y vencimientos.'],reports:['Estadísticas','Conocé tus números.','Así se distribuye tu dinero.'],settings:['Configuración','A tu manera.','Ajustá la experiencia a tus necesidades.']};
const categories = ['Comida','Servicios','Hogar','Transporte','Salud','Educación','Tecnología','Entretenimiento','Indumentaria','Deudas y préstamos','Tarjetas','Otros','Extra','Sueldo','Ventas'];
let aiDiagnostics=null,aiUsagePanel=null,expressPanel=null,installmentsPanel=null,loanEditPanel=null,passkeyUI=null,pushUI=null;
const state = {month:localDay().slice(0,7),data:null,auth:false,aiEnabled:false,view:'dashboard',draft:null,editId:null,recurrenceEditId:null,accountEditId:null,recognizer:null,recorder:null,audioStream:null,audioChunks:[],deferredInstall:null,movementView:localStorage.getItem('gastosapp-movement-view')==='table'?'table':'list',sortKey:'date',sortDirection:'desc',selectedMovements:new Set()};
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
  if(view==='settings'&&state.auth){void aiDiagnostics?.load();void aiUsagePanel?.refresh();void passkeyUI?.refresh();void pushUI?.refresh();}
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
  $('incomeNote').textContent=fmt(d.incomeReceived||0)+' cobrado · '+fmt(d.incomePending||0)+' por cobrar';
  $('pendingNote').textContent=d.upcoming.length+' vencimiento(s) pendiente(s)';
  $('expenseNote').textContent=fmt(d.paid)+' ya pagados';
  $('budgetPercent').textContent=d.income>0?Math.round(d.expenses/d.income*100)+'%':'—';
  $('budgetBar').style.width=(d.income>0?Math.min(100,d.expenses/d.income*100):0)+'%';
  $('balanceCaption').textContent=d.balance>=0?'Resultado positivo':'Compromisos superiores a ingresos';
  $('reportBalance').textContent=fmt(d.balance);
  $('reportInsight').textContent=d.balance>=0?'Te queda presupuesto para este mes.':'Revisá gastos y cuotas pendientes.';
  $('salaryInput').value=d.settings.salary||0;
  $('expressAutoSetting').checked=d.settings.expressAutoConfirm===true;
  expressPanel?.settingsChanged(d.settings.expressAutoConfirm===true);
  $('recentList').innerHTML=rowsMarkup(d.rows.slice(0,7),false);
  renderMovements();
  $('upcomingList').innerHTML=upcomingMarkup(d.upcoming.slice(0,5));
  $('categoryChart').innerHTML=categoryMarkup(d.categories);
  $('reportCategories').innerHTML=categoryMarkup(d.categories);
  $('paidSplit').innerHTML='<div class="split-item"><span>✓ Ya pagado</span><strong>'+fmt(d.paid)+'</strong></div><div class="split-item"><span>◷ Por pagar</span><strong>'+fmt(d.pending)+'</strong></div><div class="split-item"><span>✓ Ya cobrado</span><strong>'+fmt(d.incomeReceived||0)+'</strong></div><div class="split-item"><span>◷ Por cobrar</span><strong>'+fmt(d.incomePending||0)+'</strong></div>';
  $('accountCards').innerHTML=d.accounts.map(a=>'<article class="account-card '+escape(a.kind)+'"><span class="account-icon">'+(a.kind==='credit'?'▣':a.kind==='cash'?'＄':'◈')+'</span><button data-edit-account="'+escape(a.id)+'" aria-label="Editar '+escape(a.name)+'">Editar</button><strong>'+escape(a.name)+'</strong><small>'+({credit:'Tarjeta de crédito',debit:'Débito',cash:'Efectivo',wallet:'Billetera virtual',transfer:'Transferencia',other:'Otro'}[a.kind]||a.kind)+(a.kind==='credit'?' · Cierre '+a.closingDay+' / Vto. '+a.dueDay:'')+'</small></article>').join('');
  $('purchasesList').innerHTML=d.purchases.length ? d.purchases.map(p=>
    '<div class="purchase-row installment-plan-row"><div><strong>'+escape(p.title)+'</strong><small>'+
    (p.financingType==='loan'?'Préstamo / '+escape(account(p.accountId)?.name||'Medio pendiente'):
      'Tarjeta / '+escape(account(p.accountId)?.name||'Sin medio'))+
    ' · '+p.paidCount+'/'+p.count+' cuotas pagadas'+
    (p.financingType==='loan'?' · '+fmt(p.installmentAmount)+' por cuota':'')+
    ' · Restan '+fmt(p.unpaidTotal)+
    (p.financingType==='loan'&&p.overdueCount>0?' · '+p.overdueCount+
      ' cuota(s) anterior(es) sin pago confirmado ('+fmt(p.overdueTotal)+')':'')+
    '</small></div><strong>'+fmt(p.amount)+'</strong>'+
    (p.financingType==='loan'?'<button type="button" class="btn btn-muted" data-loan-edit="'+
     escape(p.id)+'">Editar préstamo</button>':'')+
    '<button type="button" class="btn btn-primary" data-installment-plan="'+escape(p.id)+'">Ver cuotas y programar</button>'+
    '<button type="button" class="btn btn-muted" data-delete="'+escape(p.id)+'">Eliminar</button></div>'
  ).join(''):'<div class="empty">No hay préstamos ni compras financiadas registrados.</div>';
}
function filteredRows(){
  let data=state.data?.rows||[];
  const q=$('movementSearch').value.trim().toLocaleLowerCase('es-AR'),t=$('typeFilter').value;
  if(q)data=data.filter(x=>(x.title+' '+x.category+' '+(account(x.accountId)?.name||'')).toLocaleLowerCase('es-AR').includes(q));
  if(t==='pending')data=data.filter(x=>x.type==='expense'&&!x.isPaid);
  else if(t!=='all')data=data.filter(x=>x.type===t);
  return sortMovements(data,{key:state.sortKey,direction:state.sortDirection,getAccount:id=>account(id)?.name||''});
}
function renderMovements(){
 const rows=filteredRows();
 const visible=new Set(rows.map(r=>r.id));
 for(const id of state.selectedMovements)if(!visible.has(id))state.selectedMovements.delete(id);
 $('allMovements').innerHTML=state.movementView==='table'?tableMarkup(rows,{
   fmt,dateLabel,account,escape,selected:state.selectedMovements,sortKey:state.sortKey,sortDirection:state.sortDirection
 }):rowsMarkup(rows,true);
 $('allMovements').classList.toggle('movement-table-active',state.movementView==='table');
 $('movementListButton').setAttribute('aria-pressed',String(state.movementView==='list'));
 $('movementTableButton').setAttribute('aria-pressed',String(state.movementView==='table'));
 const chosen=state.selectedMovements.size;
 $('movementBulk').classList.toggle('hidden',state.movementView!=='table'||chosen===0);
 $('movementBulkCount').textContent=chosen+' movimiento'+(chosen===1?'':'s')+' seleccionado'+(chosen===1?'':'s');
 $('movementDirection').textContent=state.sortDirection==='asc'?'↑ Menor a mayor':'↓ Mayor a menor';
 $('movementSort').value=state.sortKey;
}
function rowsMarkup(rows,full){
  if(!rows.length)return '<div class="empty">No hay movimientos en este mes. <br>Probá registrar uno hablando con el asistente ✦</div>';
  return rows.map(t=>{
    const income=t.type==='income',id=t.isInstallment?t.installmentId:t.id,tag=t.isInstallment?' · Cuota '+t.number+'/'+t.total:'';
    const subtitle=(t.isInstallment?(t.plannedDate?'Programada '+dateLabel(t.plannedDate)+' · ':'')+
      'Vto. original '+dateLabel(t.originalDueDate||t.dueDate)+' · ':t.dueDate?'Vence '+dateLabel(t.dueDate)+' · ':'')+dateLabel(t.date)+' · '+escape(t.category)+' · '+escape(account(t.accountId)?.name||'Sin medio')+tag+(t.isRecurring?' · Fijo mensual':'');
    const status=t.isPaid?(income?'Cobrado':'Pagado'):(income?'Por cobrar':'Pendiente');
    return '<div class="tx-row"><span class="tx-icon '+(income?'income':'')+'">'+iconFor(t.category)+'</span><div class="tx-info"><strong>'+escape(t.title)+'</strong><small>'+subtitle+'</small></div><div class="tx-amount"><strong class="'+(income?'incoming':'')+'">'+(income?'+':'−')+fmt(t.amount)+'</strong><small>'+status+'</small></div>'+(full?'<div class="tx-ops">'+'<button class="action-mini" data-paid="'+escape(id)+'" data-next-paid="'+(!t.isPaid)+'" title="'+(t.isPaid?'Marcar pendiente':income?'Marcar cobrado':'Marcar pagado')+'">'+(t.isPaid?'↶':'✓')+'</button>'+(t.isInstallment&&t.financingType==='loan'?
'<button class="action-mini" data-loan-edit="'+escape(t.purchaseId)+'" title="Editar préstamo">✎</button>':
t.isRecurring?'<button class="action-mini" data-edit-recurrence="'+escape(t.recurrenceId)+'" title="Editar movimiento fijo">✎</button>':!t.isInstallment?'<button class="action-mini" data-edit="'+escape(t.id)+'" title="Editar">✎</button>':'')+'<button class="action-mini" data-delete="'+escape(t.isInstallment?t.purchaseId:t.isRecurring?t.recurrenceId:t.id)+'" title="'+(t.isInstallment?'Eliminar compra completa':'Eliminar')+'">✕</button></div>':'')+'</div>';
  }).join('');
}
function upcomingMarkup(rows) {
  if(!rows.length)return '<div class="empty">¡Todo al día! No tenés pagos pendientes en este mes.</div>';
  return rows.map(t=>'<div class="due-item"><div class="due-date"><strong>'+escape((t.paymentDate||t.plannedDate||t.dueDate||t.date).slice(8,10))+'</strong><small>'+escape((t.paymentDate||t.plannedDate||t.dueDate||t.date).slice(5,7))+'</small></div><div class="due-details"><strong>'+escape(t.title)+'</strong><small>'+escape(account(t.accountId)?.name||t.category)+(t.isInstallment?' · Cuota '+t.number+'/'+t.total+
 (t.plannedDate?' · Venc. original '+dateLabel(t.originalDueDate||t.dueDate):''):'')+'</small></div><span class="due-price">'+fmt(t.amount)+'</span></div>').join('');
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
function refreshNewLoanOverdue(){
 const loan=$('movementForm').elements.movementType.value==='expense'&&
    Number($('txInstallments').value)>1&&$('txFinancingType').value==='loan';
 const count=loan?previousMonthsCount($('txFirstDueDate').value,Number($('txInstallments').value),localDay()):0;
 $('txOverdueBox').classList.toggle('hidden',count===0);
 $('txOverdueChoice').required=count>0;
 if(count===0)$('txOverdueChoice').value='';
 $('txOverduePreview').textContent=count?
   'Detecté '+count+' cuota'+(count===1?'':'s')+' de meses anteriores, por '+
   fmt(count*Number($('txAmount').value||0))+
   '. Si todavía las debés y elegís incluirlas, se sumarán al pago previsto de este mes.':
   '';
}
function setTransactionMode(){
  const type=$('movementForm').elements.movementType.value, isIncome=type==='income';
  const a=account($('txAccount').value),count=Number($('txInstallments').value);
  if(isIncome){$('txInstallments').value='1';$('txDueDate').value='';}
  const many=!isIncome&&Number($('txInstallments').value)>1;
  const financing=$('txFinancingType').value;
  const loan=many&&financing==='loan';
  const card=!isIncome&&a?.kind==='credit'&&(!many||financing==='card');
  $('installmentsField').classList.toggle('hidden',isIncome);
  $('recurringField').classList.toggle('hidden',many);
  $('txRecurringLabel').textContent=isIncome?'Repetir todos los meses (ingreso fijo)':'Repetir todos los meses (gasto fijo)';
  $('recurringIncomeNote').classList.toggle('hidden',!isIncome||!$('txRecurring').checked);
  $('txFinanceFields').classList.toggle('hidden',!many);
  $('txFirstDueField').classList.toggle('hidden',!loan);
  $('txFirstDueDate').required=loan&&!state.editId;
  refreshNewLoanOverdue();
  $('dueDateField').classList.toggle('hidden',isIncome||many||card||$('txRecurring').checked);
  $('txPaidLabel').textContent=isIncome?'Ya recibido':'Ya pagado';
  $('installmentHint').classList.toggle('hidden',isIncome);
  $('txAmountLabel').textContent=loan?'Importe DE CADA CUOTA en pesos':'Importe TOTAL en pesos';
  if(many||card){
    $('txPaid').checked=false;$('txPaid').disabled=true;
    $('installmentHint').textContent=loan?
      'Préstamo con '+count+' cuotas de '+(Number($('txAmount').value)||0)+
      ' pesos cada una. Seleccioná el primer vencimiento. Luego podés programar varias cuotas para un mismo día.':
      'Las cuotas de tarjeta se calculan a partir del importe TOTAL y del cierre de la tarjeta.';
  }else{
    $('txPaid').disabled=false;
    $('installmentHint').textContent='Las cuotas pueden pagarse con débito, transferencia, efectivo o tarjeta. Elegí el tipo de financiación al seleccionar 2 o más.';
  }
}
function openMovement(item){
  state.editId=item?.id||null;state.recurrenceEditId=null;
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
  $('txFinancingType').value='loan';
  $('txFirstDueDate').value='';
  $('txOverdueChoice').value='';
  $('txRecurring').checked=false;
  $('txRecurring').disabled=Boolean(item);
  $('txPaid').checked=item?item.isPaid:false;
  $('txNotes').value=item?.notes||'';
  $$('.segmented input').forEach(x=>x.disabled=!!item);
  $('txInstallments').disabled=!!item;
  setTransactionMode();
  showDialog('movementDialog');
}
function openRecurrence(item){
 const recurrence=state.data?.recurrences.find(r=>r.id===item?.recurrenceId);
 if(!recurrence)return;
 openMovement({...recurrence,type:recurrence.type||'expense',date:recurrence.startDate,
   isPaid:Boolean(item.isPaid),dueDate:null,notes:recurrence.notes||''});
 state.editId=null;state.recurrenceEditId=recurrence.id;
 $('movementDialogTitle').textContent='Editar ingreso/gasto fijo mensual';
 toast('La edición de un fijo cambia el importe de todos los meses, también los anteriores.');
 $('txRecurring').checked=true;$('txRecurring').disabled=true;
 setTransactionMode();
}
async function saveMovement(e){
  e.preventDefault();
  const payload={type:$('movementForm').elements.movementType.value,amount:Number($('txAmount').value),
    title:$('txTitle').value,date:$('txDate').value,dueDate:$('txDueDate').value||null,category:$('txCategory').value,
    accountId:$('txAccount').value||null,installmentCount:Number($('txInstallments').value),
    financingType:Number($('txInstallments').value)>1?$('txFinancingType').value:null,
    firstDueDate:$('txFirstDueDate').value||null,
    overdueChoice:$('txOverdueChoice').required?$('txOverdueChoice').value:'review',
    isRecurring:$('txRecurring').checked,
    isPaid:$('txPaid').checked,notes:$('txNotes').value};
  try {
    if(state.recurrenceEditId)await request('/api/recurrences/'+state.recurrenceEditId,'PATCH',{
      type:payload.type,title:payload.title,amount:payload.amount,startDate:payload.date,
      category:payload.category,accountId:payload.accountId,notes:payload.notes
    });
    else if(state.editId)await request('/api/transactions/'+state.editId,'PATCH',payload);
    else await request('/api/transactions','POST',payload);
    state.recurrenceEditId=null;
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
    (d.installmentCount>1 && account(d.accountId)?.kind!=='credit'&&!d.firstDueDate&&!d.dueDate)||(d.installmentCount>1&&d.isRecurring)||questions.length>0;
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
    $('txFinancingType').value=draft.financingType||(account(draft.accountId)?.kind==='credit'?'card':'loan');
    $('txFirstDueDate').value=draft.firstDueDate||draft.dueDate||'';
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
  passkeyUI=setupPasskeyUI({
    request,notify:toast,
    afterLogin:async()=>{hideLogin();$('loginPassword').value='';$('loginError').textContent='';
      await refresh();toast('Ingresaste con passkey.');}
  });
  pushUI=setupPushUI({request,notify:toast});
  installmentsPanel=setupInstallments({
    request,refresh,getPlans:()=>state.data?.purchases||[],fmt,dateLabel,today:localDay
  });
  loanEditPanel=setupLoanEditor({
    request,refresh,getPlans:()=>state.data?.purchases||[],getAccounts:()=>state.data?.accounts||[],
    categories,fmt,today:localDay,onSaved:toast
  });
  aiDiagnostics=setupAIDiagnostics();
  aiUsagePanel=setupAIUsage({request});
  expressPanel=setupExpress({
    request,refresh,getAccounts:()=>state.data?.accounts||[],fmt,
    onSettingsSaved:value=>{$('expressAutoSetting').checked=value; if(state.data)state.data.settings.expressAutoConfirm=value;},
    onSaved:()=>toast('✓ Gasto guardado')
  });
  $('expressAutoSetting').addEventListener('change',async()=>{
    const input=$('expressAutoSetting'),value=input.checked;input.disabled=true;
    try{
      await request('/api/settings','PATCH',{expressAutoConfirm:value});
      if(state.data)state.data.settings.expressAutoConfirm=value;
      expressPanel?.settingsChanged(value);
      toast(value?'Autoconfirmación Express activada':'Autoconfirmación Express desactivada');
    }catch(error){input.checked=!value;toast(error.message);}
    finally{input.disabled=false;}
  });
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
  $('txAccount').addEventListener('change',()=>{
    if(Number($('txInstallments').value)>1)
      $('txFinancingType').value=account($('txAccount').value)?.kind==='credit'?'card':'loan';
    setTransactionMode();
  });
  $('txFirstDueDate').addEventListener('change',refreshNewLoanOverdue);
  $('txFirstDueDate').addEventListener('input',refreshNewLoanOverdue);
  $('txInstallments').addEventListener('change',()=>{
    $('txFinancingType').value=account($('txAccount').value)?.kind==='credit'?'card':'loan';
    setTransactionMode();
  });
  $('txFinancingType').addEventListener('change',setTransactionMode);
  $('txAmount').addEventListener('input',()=>{if(Number($('txInstallments').value)>1)setTransactionMode();});
  $('txRecurring').addEventListener('change',setTransactionMode);
  $('movementSearch').addEventListener('input',()=>{state.selectedMovements.clear();renderMovements();});
  $('typeFilter').addEventListener('change',()=>{state.selectedMovements.clear();renderMovements();});
  $('movementSort').addEventListener('change',e=>{state.sortKey=e.target.value;renderMovements();});
  $('movementDirection').addEventListener('click',()=>{state.sortDirection=state.sortDirection==='asc'?'desc':'asc';renderMovements();});
  for(const [id,view] of [['movementListButton','list'],['movementTableButton','table']])
    $(id).addEventListener('click',()=>{
      state.movementView=view;state.selectedMovements.clear();
      localStorage.setItem('gastosapp-movement-view',view);renderMovements();
    });
  $('allMovements').addEventListener('change',e=>{
    if(e.target.matches('#movementSelectAll')){
      if(e.target.checked)for(const row of filteredRows())state.selectedMovements.add(row.id);
      else state.selectedMovements.clear();
      renderMovements();
    }else if(e.target.matches('[data-select-movement]')){
      const id=e.target.dataset.selectMovement;
      if(e.target.checked)state.selectedMovements.add(id);else state.selectedMovements.delete(id);
      renderMovements();
    }
  });
  $('allMovements').addEventListener('click',e=>{
    const col=e.target.closest('[data-sort-column]');if(!col)return;
    const key=col.dataset.sortColumn;
    state.sortDirection=state.sortKey===key&&state.sortDirection==='asc'?'desc':'asc';
    state.sortKey=key;renderMovements();
  });
  for(const [id,paid] of [['movementBulkPaid',true],['movementBulkPending',false]])
    $(id).addEventListener('click',async()=>{
      const ids=[...state.selectedMovements];if(!ids.length)return;
      if(!confirm((paid?'Marcar pagados/cobrados':'Marcar pendientes')+' '+ids.length+' movimientos?'))return;
      $('movementBulkPaid').disabled=true;$('movementBulkPending').disabled=true;
      try{
        await request('/api/movements/status/batch','PATCH',{ids,isPaid:paid,month:state.month});
        state.selectedMovements.clear();await refresh();toast('Se actualizaron '+ids.length+' movimientos.');
      }catch(err){toast(err.message);}
      finally{$('movementBulkPaid').disabled=false;$('movementBulkPending').disabled=false;}
    });
  $('movementBulkClear').addEventListener('click',()=>{state.selectedMovements.clear();renderMovements();});
  $('monthFilter').addEventListener('change',async e=>{if(!e.target.value)return;state.month=e.target.value;state.selectedMovements.clear();try{await refresh();}catch(err){toast(err.message);}});
  $('newAccount').addEventListener('click',()=>openAccount());
  $('accountKind').addEventListener('change',()=>{$('creditFields').classList.toggle('hidden',$('accountKind').value!=='credit');});
  $('accountForm').addEventListener('submit',saveAccount);
  $('recordBtn').addEventListener('click',toggleVoice);
  $('interpretBtn').addEventListener('click',interpretText);
  $('salaryForm').addEventListener('submit',async e=>{e.preventDefault();try{await request('/api/settings','PATCH',{salary:Number($('salaryInput').value)});await refresh();toast('Sueldo actualizado');}catch(err){toast(err.message);}});
  $('exportBtn').addEventListener('click',async()=>{try{const data=await request('/api/export');const b=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});const u=URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download='gastosapp-'+localDay()+'.json';a.click();URL.revokeObjectURL(u);}catch(err){toast(err.message);}});
  $('logoutBtn').addEventListener('click',async()=>{await request('/api/logout','POST',{});showLogin();});
  $('loginForm').addEventListener('submit',async e=>{e.preventDefault();try{await request('/api/login','POST',{password:$('loginPassword').value});hideLogin();$('loginPassword').value='';$('loginError').textContent='';await refresh();void passkeyUI?.capabilities();}catch(err){$('loginError').textContent=err.message;}});
  $('themeToggle').addEventListener('click',()=>{const t=document.documentElement.dataset.theme==='light'?'dark':'light';document.documentElement.dataset.theme=t;localStorage.setItem('gastos-theme',t);$('themeToggle').textContent=t==='light'?'☀':'☾';});
  document.addEventListener('click',async e=>{
    const pay=e.target.closest('[data-paid]'),del=e.target.closest('[data-delete]'),edit=e.target.closest('[data-edit]'),
      editRecurrence=e.target.closest('[data-edit-recurrence]'),acc=e.target.closest('[data-edit-account]'),
      installments=e.target.closest('[data-installment-plan]'),
      loanEdit=e.target.closest('[data-loan-edit]');
    try{
      if(loanEdit){loanEditPanel.open(loanEdit.dataset.loanEdit);}
      else if(installments){installmentsPanel.open(installments.dataset.installmentPlan);}
      else if(pay){
        const row=state.data?.rows.find(r=>(r.isInstallment?r.installmentId:r.id)===pay.dataset.paid);
        if(row?.isInstallment){
          await request('/api/installments/batch','PATCH',{
            ids:[pay.dataset.paid],action:pay.dataset.nextPaid==='true'?'pay':'unpay',date:localDay()
          });
        }else await request('/api/paid/'+pay.dataset.paid,'PATCH',{isPaid:pay.dataset.nextPaid==='true'});
        await refresh();toast('Estado actualizado');
      }
      else if(del){
        const item=state.data?.rows.find(r=>r.id===del.dataset.delete||r.recurrenceId===del.dataset.delete||r.purchaseId===del.dataset.delete);
        const prompt=item?.isRecurring?'¿Eliminar el ingreso o gasto fijo de TODOS los meses, incluido el historial?':
          item?.isInstallment?'¿Eliminar el préstamo/compra completo, con todas sus cuotas?':'¿Eliminar este movimiento?';
        if(!confirm(prompt))return;
        await request('/api/transactions/'+del.dataset.delete,'DELETE');await refresh();toast('Movimiento eliminado');}
      else if(editRecurrence){const t=state.data.rows.find(x=>x.recurrenceId===editRecurrence.dataset.editRecurrence);
        if(t)openRecurrence(t);
      }
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
  void passkeyUI?.capabilities();
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