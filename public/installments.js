// Cuotas de préstamos y tarjetas: selección múltiple, planificación y cancelación.
export function setupInstallments({request,refresh,getPlans,fmt,dateLabel,today}){
 const $=id=>document.getElementById(id);
 const dlg=$('installmentDialog');
 let planId=null,busy=false;
 const selected=new Set();
 const source=()=>getPlans().find(p=>p.id===planId);
 const message=(text,error=false)=>{
  $('installmentStatus').textContent=text;
  $('installmentStatus').dataset.kind=error?'error':'success';
 };
 function selectUI(){
  const plan=source(),rows=plan?.installments||[];
  const chosen=rows.filter(i=>selected.has(i.id));
  const unpaid=chosen.filter(i=>!i.isPaid),paid=chosen.filter(i=>i.isPaid);
  const total=chosen.reduce((n,i)=>n+i.amount,0);
  $('installmentSelection').textContent=chosen.length?
   chosen.length+' cuota'+(chosen.length===1?'':'s')+' · Total: '+fmt(total):
   'Seleccioná una o más cuotas';
  $('installmentPlan').disabled=busy||!chosen.length||Boolean(paid.length);
  $('installmentPay').disabled=busy||!chosen.length||Boolean(paid.length);
  $('installmentUnpay').disabled=busy||!chosen.length||Boolean(unpaid.length);
 }
 function render(){
  const plan=source();if(!plan){close();return;}
  $('installmentDialogTitle').textContent=plan.title;
  $('installmentDialogInfo').textContent=
   (plan.financingType==='loan'?'Préstamo / cuotas independientes':'Compra en tarjeta de crédito')+
   ' · '+plan.count+' cuotas · '+plan.paidCount+' pagadas · Pendiente: '+fmt(plan.unpaidTotal)+
   '. El vencimiento original se conserva aunque programes varias juntas.';
  const list=$('installmentRows');list.replaceChildren();
  for(const i of plan.installments){
   const label=document.createElement('label');label.className='installment-line'+(i.isPaid?' is-paid':'');
   const check=document.createElement('input');check.type='checkbox';check.value=i.id;check.checked=selected.has(i.id);
   check.disabled=busy;
   check.addEventListener('change',()=>{if(check.checked)selected.add(i.id);else selected.delete(i.id);selectUI();});
   const info=document.createElement('span');info.className='installment-line-info';
   const title=document.createElement('strong');
   title.textContent='Cuota '+i.number+'/'+i.total+' · '+fmt(i.amount);
   const due=document.createElement('small');due.textContent='Vencimiento original: '+dateLabel(i.dueDate);
   info.append(title,due);
   const state=document.createElement('span');state.className='installment-line-status';
   state.textContent=i.isPaid?'✓ Pagada '+(i.paidDate?dateLabel(i.paidDate):''):
    i.plannedDate?'Programada '+dateLabel(i.plannedDate):'Pendiente';
   label.append(check,info,state);list.append(label);
  }
  selectUI();
 }
 function close(){if(!busy&&dlg.open)dlg.close();selected.clear();}
 function open(id){
  planId=id;selected.clear();message('');
  $('installmentPayDate').value=today().slice(0,8)+String(new Date(
   Number(today().slice(0,4)),Number(today().slice(5,7)),0
  ).getDate()).padStart(2,'0');
  if(!dlg.open)dlg.showModal();render();
 }
 async function apply(action){
  if(busy)return;
  const plan=source(),ids=[...selected];
  if(!plan||!ids.length)return;
  const date=$('installmentPayDate').value;
  if(action!=='unpay'&&!/^\d{4}-\d{2}-\d{2}$/.test(date)){
   message('Elegí una fecha válida para programar o marcar el pago.',true);return;
  }
  if(action==='pay'&&date>today()){
   message('Esa fecha es futura. Usá Programar seleccionadas; marcá pagadas cuando efectivamente se debiten.',true);
   return;
  }
  if(action==='unpay'&&!window.confirm('¿Desmarcar el pago de las cuotas seleccionadas?'))return;
  busy=true;selectUI();message('Actualizando '+ids.length+' cuota(s)...');
  try{
   const result=await request('/api/installments/batch','PATCH',{ids,action,date});
   await refresh();selected.clear();render();
   message(action==='plan'?
    'Programaste '+result.count+' cuota(s) por '+fmt(result.total)+' para '+dateLabel(date)+
    '. El resumen de ese mes mostrará el total.':
    action==='pay'?'Registraste el pago de '+result.count+' cuota(s): '+fmt(result.total)+'.':
    'Desmarcaste '+result.count+' pago(s).');
  }catch(e){message(e.message||'No se pudieron actualizar las cuotas.',true);}
  finally{busy=false;selectUI();}
 }
 $('installmentPlan').addEventListener('click',()=>void apply('plan'));
 $('installmentPay').addEventListener('click',()=>void apply('pay'));
 $('installmentUnpay').addEventListener('click',()=>void apply('unpay'));
 $('installmentSelectPending').addEventListener('click',()=>{
  if(!source())return;
  selected.clear();for(const i of source().installments)if(!i.isPaid)selected.add(i.id);
  render();
 });
 $('installmentClear').addEventListener('click',()=>{selected.clear();render();});
 for(const button of dlg.querySelectorAll('.installment-close'))button.addEventListener('click',close);
 dlg.addEventListener('close',()=>{selected.clear();planId=null;});
 return {open};
}
