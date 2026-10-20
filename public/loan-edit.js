// Edición conservadora de préstamos con reconocimiento explícito de cuotas atrasadas.
export function previousMonthsCount(firstDueDate,count,currentDate){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(String(firstDueDate||'')))return 0;
 const n=Number(count);
 if(!Number.isInteger(n)||n<=0)return 0;
 const current=String(currentDate).slice(0,7);
 const first=String(firstDueDate).slice(0,7);
 if(!/^\d{4}-\d{2}$/.test(current))return 0;
 const [y,m]=first.split('-').map(Number),[yy,mm]=current.split('-').map(Number);
 return Math.max(0,Math.min(n,(yy-y)*12+mm-m));
}
export function setupLoanEditor({request,refresh,getPlans,getAccounts,categories,fmt,today,onSaved}){
 const $=id=>document.getElementById(id),dialog=$('loanEditDialog');
 const form=$('loanEditForm'),feedback=$('loanEditFeedback');
 let loanId=null,busy=false;
 const current=()=>getPlans().find(x=>x.id===loanId);
 const writeFeedback=(message,isError=false)=>{feedback.textContent=message;feedback.dataset.kind=isError?'error':'neutral';};
 function overdueFields(){
  const p=current(),count=Number($('loanEditCount').value),first=$('loanEditFirstDue').value;
  const totalPast=previousMonthsCount(first,count,today());
  const pending=p&&p.firstDueDate===first&&p.count===count?
   p.installments.filter(i=>!i.isPaid&&i.dueDate.slice(0,7)<today().slice(0,7)).length:totalPast;
  const show=pending>0;
  $('loanEditOverdueBox').classList.toggle('hidden',!show);
  $('loanEditOverdueChoice').required=show;
  if(!show)$('loanEditOverdueChoice').value='';
  $('loanEditOverduePreview').textContent=show?
   'Detecté '+pending+' cuota'+(pending===1?'':'s')+' anterior'+(pending===1?'':'es')+
   ' sin pago confirmado (total '+fmt(Number($('loanEditAmount').value||0)*pending)+'). '+
   'Si todavía las debés, las programamos para fin de este mes, junto con la cuota actual si corresponde.':
   'No se detectan cuotas vencidas pendientes.';
 }
 function open(id){
  const p=getPlans().find(x=>x.id===id);
  if(!p||p.financingType!=='loan')return;
  loanId=id;busy=false;form.reset();writeFeedback('');
  $('loanEditTitle').value=p.title;
  $('loanEditAmount').value=p.installmentAmount;
  $('loanEditCount').value=p.count;
  $('loanEditFirstDue').value=p.firstDueDate||p.installments[0]?.dueDate||'';
  $('loanEditNotes').value=p.notes||'';
  const accounts=$('loanEditAccount');
  accounts.replaceChildren(new Option('Sin medio asignado',''));
  for(const account of getAccounts())accounts.add(new Option(account.name,account.id));
  accounts.value=p.accountId||'';
  const select=$('loanEditCategory');
  select.replaceChildren(...categories.map(c=>new Option(c,c)));
  if(!categories.includes(p.category))select.add(new Option(p.category,p.category));
  select.value=p.category;
  const hasPaid=p.paidCount>0;
  for(const id of ['loanEditAmount','loanEditCount','loanEditFirstDue'])$(id).disabled=hasPaid;
  if(hasPaid)writeFeedback('Este préstamo tiene cuotas pagadas: podés modificar concepto, medio, categoría y notas sin alterar los pagos históricos.');
  $('loanEditOverdueChoice').value='';
  overdueFields();
  if(!dialog.open)dialog.showModal();
 }
 function close(){if(busy)return;if(dialog.open)dialog.close();}
 async function save(event){
  event.preventDefault();if(busy||!loanId)return;
  const mode=$('loanEditOverdueChoice').required?$('loanEditOverdueChoice').value:'review';
  if(!['include','review'].includes(mode)){writeFeedback('Indicá si debés cuotas anteriores antes de guardar.',true);return;}
  const payload={
   title:$('loanEditTitle').value.trim(),
   installmentAmount:Number($('loanEditAmount').value),
   count:Number($('loanEditCount').value),
   firstDueDate:$('loanEditFirstDue').value,
   accountId:$('loanEditAccount').value||null,
   category:$('loanEditCategory').value,
   notes:$('loanEditNotes').value,
   overdueChoice:mode
  };
  busy=true;$('loanEditSubmit').disabled=true;writeFeedback('Guardando cambios...');
  try{
   const result=await request('/api/loans/'+encodeURIComponent(loanId),'PATCH',payload);
   await refresh();
   onSaved?.('Préstamo actualizado'+
    (result.overdueMoved?' · '+result.overdueMoved+' cuota(s) atrasada(s) reprogramada(s) para este mes':''));
   dialog.close();
  }catch(e){writeFeedback(e.message||'No se pudo editar el préstamo.',true);}
  finally{busy=false;$('loanEditSubmit').disabled=false;}
 }
 for(const id of ['loanEditFirstDue','loanEditCount','loanEditAmount'])
  $(id).addEventListener('input',overdueFields);
 form.addEventListener('submit',save);
 for(const button of dialog.querySelectorAll('.loan-edit-close'))button.addEventListener('click',close);
 dialog.addEventListener('close',()=>{loanId=null;});
 return {open};
}
