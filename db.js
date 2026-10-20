import fs from 'node:fs';
import path from 'node:path';
import { uid, isoDay, money, monthOf, schedule, loanSchedule, project } from './lib/engine.js';
import {monthArgentina,overdueInstallments,planOverdueToMonth,validateOverdueChoice} from './lib/loan-overdue.js';

const dataDir = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const dataFile = path.join(dataDir, 'gastosapp-v2.json');
fs.mkdirSync(dataDir, {recursive:true});
const defaults = () => ({
  version: 2,
  settings: {salary:0, currency:'ARS', expressAutoConfirm:false},
  accounts: [
    {id:'cash', name:'Efectivo', kind:'cash'},
    {id:'transfer', name:'Transferencia', kind:'transfer'},
    {id:'mp', name:'Mercado Pago', kind:'wallet'},
    {id:'debit', name:'Débito', kind:'debit'},
    {id:'visa', name:'Visa', kind:'credit', closingDay:25, dueDay:10},
    {id:'master', name:'Mastercard', kind:'credit', closingDay:25, dueDay:10}
  ],
  transactions:[],
  purchases:[],
  recurrences:[]
});
let state;
function get() {
  if (state) return state;
  if (!fs.existsSync(dataFile)) { state = defaults(); persist(); return state; }
  const parsed = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  if (parsed.version !== 2 || !Array.isArray(parsed.transactions) || !Array.isArray(parsed.purchases)) {
    throw new Error('Esquema incompatible. Revisar respaldo antes de continuar.');
  }
  state = {...parsed, settings:{...parsed.settings,expressAutoConfirm:parsed.settings?.expressAutoConfirm===true}, recurrences:Array.isArray(parsed.recurrences)?parsed.recurrences:[]};
  return state;
}
function persist() {
  const temp = dataFile+'.'+process.pid+'.tmp';
  fs.writeFileSync(temp, JSON.stringify(state, null, 2), {mode:0o600});
  fs.renameSync(temp, dataFile);
}
const finiteAmount = value => {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0 || n > 1e12) throw new Error('Ingresá un importe positivo válido');
  return money(n);
};
const dateField = value => {
  const v = String(value || isoDay(new Date()));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error('Fecha inválida');
  const [y,m,d] = v.split('-').map(Number);
  const valid = new Date(y,m-1,d);
  if (valid.getFullYear()!==y || valid.getMonth()+1!==m || valid.getDate()!==d) throw new Error('Fecha inválida');
  return v;
};
const titleField = value => {
  const v = String(value||'').trim();
  if (!v || v.length > 140) throw new Error('Concepto requerido (hasta 140 caracteres)');
  return v;
};
const validateAccount = (s,id) => {
  if (!id) return null;
  if (!s.accounts.some(x=>x.id===id)) throw new Error('Medio de pago no encontrado');
  return id;
};
const clampText = value=>String(value||'').slice(0,450);
const categoryField = value=>String(value||'Otros').slice(0,60);
const kindEnum = ['cash','debit','credit','wallet','transfer','other'];
function insertTransaction(s,data) {
    const type=String(data.type||'expense');
    if(!['expense','income'].includes(type))throw new Error('Tipo de movimiento inválido');
    const amount=finiteAmount(data.amount);
    const date=dateField(data.date);
    const dueDate=data.dueDate ? dateField(data.dueDate) : null;
    const title=titleField(data.title);
    const accountId=validateAccount(s,data.accountId);
    const category=categoryField(data.category);
    const notes=clampText(data.notes);
    const count=Number(data.installmentCount||1);
    if(!Number.isInteger(count)||count<1||count>60)throw new Error('Cuotas inválidas');
    if(type==='income' && count!==1)throw new Error('Los ingresos no admiten cuotas');
    if(type==='income' && dueDate)throw new Error('El vencimiento corresponde a un gasto');
    const a=s.accounts.find(a=>a.id===accountId);
    if(data.isRecurring===true){
      if(count!==1||dueDate)throw new Error('Los movimientos fijos mensuales no admiten cuotas ni vencimiento separado');
      const recurring={id:uid(),type,title,amount,category,accountId,notes,startDate:date,paidMonths:{}};
      if(data.isPaid===true) recurring.paidMonths[date.slice(0,7)]=true;
      s.recurrences.unshift(recurring);return {kind:'recurrence',data:recurring};
    }
    if(type==='expense' && (count>1 || a?.kind==='credit')){
      const financingType=data.financingType==='loan'?'loan':data.financingType==='card'?'card':
        (a?.kind==='credit'?'card':'loan');
      if(financingType==='card'&&a?.kind!=='credit')
        throw new Error('Para una compra con tarjeta, elegí una tarjeta de crédito. Para un préstamo por débito o transferencia, seleccioná "Préstamo / financiación".');
      if(financingType==='loan'&&count<2)throw new Error('El préstamo debe tener al menos dos cuotas');
      if(financingType==='loan'){
        const firstDueDate=dateField(data.firstDueDate||data.dueDate||'');
        if(!data.firstDueDate&&!data.dueDate)throw new Error('Indicá la fecha de vencimiento de la primera cuota del préstamo');
        const installments=loanSchedule({installmentAmount:amount,count,firstDueDate});
        const overdueChoice=validateOverdueChoice(data.overdueChoice);
        if(overdueChoice==='include')planOverdueToMonth(installments);
        const total=money(amount*count);
        if(!Number.isSafeInteger(Math.round(total*100)))throw new Error('El total financiado es demasiado grande');
        const plan={id:uid(),financingType:'loan',title,amount:total,installmentAmount:amount,
          firstDueDate,date,category,notes,accountId,installments,
          createdAt:new Date().toISOString()};
        s.purchases.unshift(plan);return {kind:'loan',data:plan};
      }
      const purchase={id:uid(),financingType:'card',title,amount,date,category,notes,accountId,
        installments:schedule({amount,count,date,account:a}),createdAt:new Date().toISOString()};
      s.purchases.unshift(purchase);return {kind:'purchase',data:purchase};
    }
    const paid = typeof data.isPaid==='boolean' ? data.isPaid : (type==='income' || !dueDate || dueDate <= date);
    const t={id:uid(),type,title,amount,date,dueDate,category,accountId,notes,
      isPaid:paid,paidAt:paid?new Date().toISOString():null,
      createdAt:new Date().toISOString()};
    s.transactions.unshift(t);return {kind:'transaction',data:t};
}

export const store = {
  snapshot(month=monthOf(isoDay(new Date()))) {
    const s=get();
    if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('Mes inválido');
    return {version:s.version, settings:s.settings, accounts:s.accounts, ...project(s,month),
      purchases:s.purchases.map(p=>({id:p.id,title:p.title,amount:p.amount,date:p.date,
        count:p.installments.length,accountId:p.accountId,category:p.category,notes:p.notes||'',
        financingType:p.financingType||'card',installmentAmount:p.installmentAmount||
          (p.installments.length?p.installments[0].amount:0),
        firstDueDate:p.firstDueDate||p.installments[0]?.dueDate||null,
        overdueCount:overdueInstallments(p.installments).length,
        overdueTotal:money(overdueInstallments(p.installments).reduce((n,i)=>n+i.amount,0)),
        paidCount:p.installments.filter(i=>i.isPaid).length,
        unpaidTotal:money(p.installments.filter(i=>!i.isPaid).reduce((t,i)=>t+i.amount,0)),
        installments:p.installments.map(i=>({id:i.id,number:i.number,total:i.total,amount:i.amount,
          dueDate:i.dueDate,plannedDate:i.plannedDate||null,paidDate:i.paidDate||null,
          isPaid:i.isPaid===true,paidAt:i.paidAt||null}))})),
      recurrences:s.recurrences.map(r=>({id:r.id,type:r.type||'expense',title:r.title,amount:r.amount,startDate:r.startDate,category:r.category,accountId:r.accountId,notes:r.notes||'',endMonth:r.endMonth||null}))};
  },
  settings(data) {
    const s=get();
    if(data.expressAutoConfirm!==undefined){
      if(typeof data.expressAutoConfirm!=='boolean')throw new Error('Configuración de autoconfirmación inválida');
      s.settings.expressAutoConfirm=data.expressAutoConfirm;
    }
    if (data.salary !== undefined) {
      const n=Number(data.salary);
      if (!Number.isFinite(n)||n<0||n>1e12) throw new Error('Sueldo inválido');
      s.settings.salary=money(n);
    }
    persist();return s.settings;
  },
  addAccount(data) {
    const s=get();
    const name=titleField(data.name);
    const kind=String(data.kind||'other');
    if (!kindEnum.includes(kind)) throw new Error('Tipo de medio de pago inválido');
    if (s.accounts.some(a=>a.name.toLowerCase()===name.toLowerCase())) throw new Error('Ese medio ya existe');
    const a={id:uid(),name,kind};
    if(kind==='credit') {
      for(const key of ['closingDay','dueDay']){
        const day=Number(data[key]);
        if(!Number.isInteger(day)||day<1||day>28)throw new Error('Elegí días entre 1 y 28');
        a[key]=day;
      }
    }
    s.accounts.push(a);persist();return a;
  },
  editAccount(id,data) {
    const s=get(),a=s.accounts.find(x=>x.id===id);
    if(!a)throw new Error('Medio no encontrado');
    if(data.name!==undefined)a.name=titleField(data.name);
    if(data.kind!==undefined) {
      if(!kindEnum.includes(data.kind))throw new Error('Tipo inválido');
      if(a.kind==='credit' && data.kind!=='credit' && s.purchases.some(p=>p.accountId===id))
        throw new Error('Hay cuotas ligadas a esta tarjeta');
      a.kind=data.kind;
    }
    if(a.kind==='credit'){
      for(const key of ['closingDay','dueDay'])if(data[key]!==undefined){
        const v=Number(data[key]);if(!Number.isInteger(v)||v<1||v>28)throw new Error('Día inválido');
        a[key]=v;
      }
      a.closingDay??=25;a.dueDay??=10;
    }
    persist();return a;
  },
  deleteAccount(id) {
    const s=get();
    if(s.transactions.some(t=>t.accountId===id)||s.purchases.some(p=>p.accountId===id)||s.recurrences.some(r=>r.accountId===id))
      throw new Error('Este medio tiene movimientos asociados');
    const i=s.accounts.findIndex(a=>a.id===id);
    if(i===-1)throw new Error('Medio no encontrado');
    s.accounts.splice(i,1);persist();return true;
  },
  add(data) {
    const result=insertTransaction(get(),data);
    persist();
    return result;
  },
  // Guarda una tanda completa o ninguna; reintentar la misma solicitud no la duplica.
  addBatch(transactions, requestId) {
    if(!Array.isArray(transactions)||transactions.length<1||transactions.length>25)
      throw new Error('La tanda debe contener entre 1 y 25 movimientos');
    if(typeof requestId!=='string'||!/^[-a-zA-Z0-9_]{8,100}$/.test(requestId))
      throw new Error('Identificador de tanda inválido');
    const previous=get();
    const prior=previous.processedBatches?.find(x=>x.id===requestId);
    if(prior)return {count:prior.count,alreadySaved:true};
    const working=structuredClone(previous);
    const inserted=transactions.map(data=>insertTransaction(working,data));
    working.processedBatches??=[];
    working.processedBatches.push({id:requestId,count:inserted.length});
    working.processedBatches=working.processedBatches.slice(-200);
    state=working;
    try{persist();}catch(error){state=previous;throw error;}
    return {count:inserted.length,alreadySaved:false};
  },
  editTransaction(id,data) {
    const s=get();const t=s.transactions.find(x=>x.id===id);
    if(!t)throw new Error('Movimiento no encontrado');
    if(data.amount!==undefined)t.amount=finiteAmount(data.amount);
    if(data.title!==undefined)t.title=titleField(data.title);
    if(data.date!==undefined)t.date=dateField(data.date);
    if(data.dueDate!==undefined){
      if(t.type==='income' && data.dueDate)throw new Error('Los ingresos no tienen vencimiento');
      t.dueDate=data.dueDate ? dateField(data.dueDate) : null;
    }
    if(data.category!==undefined)t.category=categoryField(data.category);
    if(data.notes!==undefined)t.notes=clampText(data.notes);
    if(data.accountId!==undefined){
      const target=validateAccount(s,data.accountId);
      if(s.accounts.some(a=>a.id===target&&a.kind==='credit'))throw new Error('Para cambiar a crédito, eliminá y registrá una compra financiada');
      t.accountId=target;
    }
    if(data.isPaid!==undefined) {t.isPaid=Boolean(data.isPaid);t.paidAt=t.isPaid?new Date().toISOString():null;}
    persist();return t;
  },
  // Editar el plan mensual sin borrar historial de recibos/pagos por mes.
  editRecurrence(id,data){
    const prior=get(),copy=structuredClone(prior),rec=copy.recurrences.find(x=>x.id===id);
    if(!rec)throw new Error('Movimiento mensual fijo no encontrado');
    if(data.type!==undefined&&data.type!==(rec.type||'expense'))throw new Error('No se puede cambiar el tipo de un movimiento fijo');
    if(data.title!==undefined)rec.title=titleField(data.title);
    if(data.amount!==undefined)rec.amount=finiteAmount(data.amount);
    if(data.category!==undefined)rec.category=categoryField(data.category);
    if(data.accountId!==undefined)rec.accountId=validateAccount(copy,data.accountId);
    if(data.notes!==undefined)rec.notes=clampText(data.notes);
    if(data.startDate!==undefined)rec.startDate=dateField(data.startDate);
    state=copy;try{persist();}catch(e){state=prior;throw e;}
    return {id:rec.id,type:rec.type||'expense',title:rec.title,amount:rec.amount,startDate:rec.startDate};
  },
  // Cambio atómico del estado pagado/cobrado de varios movimientos visibles del mes.
  updateMovementStatuses({ids,isPaid,month}){
    if(!Array.isArray(ids)||ids.length<1||ids.length>100||
      ids.some(id=>typeof id!=='string'||id.length>128)||new Set(ids).size!==ids.length)
      throw new Error('Seleccioná entre 1 y 100 movimientos diferentes');
    if(typeof isPaid!=='boolean')throw new Error('El estado debe ser verdadero o falso');
    if(typeof month!=='string'||!/^\d{4}-\d{2}$/.test(month))
      throw new Error('Mes de movimientos inválido');
    const previous=get(),working=structuredClone(previous);
    const visible=project(working,month).rows;
    const picked=ids.map(id=>{
      const row=visible.find(r=>r.id===id);
      if(!row)throw new Error('Movimiento no encontrado en el mes seleccionado');
      if(row.isInstallment)return {kind:'installment',value:working.purchases.flatMap(p=>p.installments).find(i=>i.id===row.installmentId)};
      if(row.isRecurring)return {kind:'recurrence',value:working.recurrences.find(r=>r.id===row.recurrenceId)};
      return {kind:'transaction',value:working.transactions.find(t=>t.id===id)};
    });
    if(picked.some(p=>!p.value))throw new Error('Uno de los movimientos no existe');
    for(const p of picked){
      if(p.kind==='recurrence'){
        p.value.paidMonths??={};p.value.paidMonths[month]=isPaid;
      }else if(p.kind==='installment'){
        if(p.value.isPaid===isPaid)continue;
        p.value.isPaid=isPaid;p.value.paidAt=isPaid?new Date().toISOString():null;
        p.value.paidDate=isPaid?isoDay(new Date()):null;
      }else{
        p.value.isPaid=isPaid;p.value.paidAt=isPaid?new Date().toISOString():null;
      }
    }
    state=working;try{persist();}catch(error){state=previous;throw error;}
    return {count:ids.length,isPaid,month};
  },
  // Editar un préstamo existente conservando el ID del plan y de cada cuota.
  // Ningún cambio histórico destructivo de un pago confirmado se permite.
  updateLoan(id,input){
    const previous=get(),working=structuredClone(previous);
    const loan=working.purchases.find(p=>p.id===id);
    if(!loan)throw new Error('Préstamo no encontrado');
    if(loan.financingType!=='loan')throw new Error('Este plan es una compra con tarjeta, no un préstamo');
    const title=input?.title!==undefined?titleField(input.title):loan.title;
    const count=input?.count!==undefined?Number(input.count):loan.installments.length;
    if(!Number.isInteger(count)||count<2||count>60)throw new Error('Cantidad de cuotas inválida (2 a 60)');
    const amount=input?.installmentAmount!==undefined?finiteAmount(input.installmentAmount):
      finiteAmount(loan.installmentAmount||loan.installments[0]?.amount);
    if(input?.firstDueDate!==undefined&&!input.firstDueDate)
      throw new Error('Indicá el primer vencimiento del préstamo.');
    const firstDueDate=input?.firstDueDate!==undefined?dateField(input.firstDueDate):
      dateField(loan.firstDueDate||loan.installments[0].dueDate);
    const accountId=input?.accountId!==undefined?validateAccount(working,input.accountId):
      loan.accountId;
    const category=input?.category!==undefined?categoryField(input.category):loan.category;
    const notes=input?.notes!==undefined?clampText(input.notes):loan.notes;
    const scheduleChanged=count!==loan.installments.length||
      amount!==loan.installments[0].amount||
      firstDueDate!==loan.installments[0].dueDate;
    if(scheduleChanged&&loan.installments.some(i=>i.isPaid))
      throw new Error('Hay cuotas pagadas. Podés editar concepto, medio y categoría, pero no cambiar importes, cantidad o primer vencimiento de pagos ya realizados.');
    if(count<loan.installments.length&&loan.installments.slice(count).some(i=>i.isPaid||i.plannedDate))
      throw new Error('No se pueden eliminar cuotas pagadas o que ya tienen fecha programada.');
    const future=loanSchedule({installmentAmount:amount,count,firstDueDate});
    loan.installments=future.map((item,i)=>{
      const prior=loan.installments[i];if(!prior)return item;
      return {...item,id:prior.id,isPaid:Boolean(prior.isPaid),paidAt:prior.paidAt||null,
        paidDate:prior.paidDate||null,plannedDate:prior.plannedDate||null};
    });
    loan.title=title;loan.installmentAmount=amount;loan.amount=money(amount*count);
    if(!Number.isSafeInteger(Math.round(loan.amount*100)))
      throw new Error('El total financiado es demasiado grande');
    loan.firstDueDate=firstDueDate;loan.accountId=accountId;loan.category=category;loan.notes=notes;
    const overdueChoice=validateOverdueChoice(input?.overdueChoice);
    const overdueResult=overdueChoice==='include'?planOverdueToMonth(loan.installments):null;
    state=working;try{persist();}catch(error){state=previous;throw error;}
    return {id:loan.id,title:loan.title,amount:loan.amount,installmentAmount:amount,count,
      overdueMoved:overdueResult?.moved||0,overdueMovedTotal:overdueResult?.total||0};
  },
  // Programar o liquidar varias cuotas atómicamente, sin crear gastos extra.
  updateInstallments({ids,action,date}){
    if(!Array.isArray(ids)||ids.length===0||ids.length>60||
       ids.some(id=>typeof id!=='string')||new Set(ids).size!==ids.length)
      throw new Error('Seleccioná entre 1 y 60 cuotas diferentes');
    if(!['plan','pay','unpay'].includes(action))throw new Error('Acción de cuotas inválida');
    const effectiveDate=action==='unpay'?null:dateField(date);
    if(action==='pay'&&effectiveDate>isoDay(new Date()))
      throw new Error('No se puede marcar como pagado algo que todavía no ocurrió. Usá Programar para una fecha futura.');
    const previous=get(),working=structuredClone(previous);
    const items=ids.map(id=>{
      for(const plan of working.purchases){
        const installment=plan.installments.find(i=>i.id===id);
        if(installment)return {plan,installment};
      }
      throw new Error('Una de las cuotas seleccionadas no existe');
    });
    if(action==='plan'&&items.some(({installment})=>installment.isPaid))
      throw new Error('No se puede reprogramar una cuota ya pagada; primero desmarcala');
    if(action==='pay'&&items.some(({installment})=>installment.isPaid))
      throw new Error('Una cuota ya está pagada; revisá la selección');
    if(action==='unpay'&&items.some(({installment})=>!installment.isPaid))
      throw new Error('Seleccioná únicamente cuotas que estén pagadas');
    let total=0;
    for(const {installment} of items){
      total=money(total+installment.amount);
      if(action==='plan')installment.plannedDate=effectiveDate;
      else if(action==='pay'){
        installment.isPaid=true;installment.paidAt=new Date().toISOString();
        installment.paidDate=effectiveDate;
      }else{installment.isPaid=false;installment.paidAt=null;installment.paidDate=null;}
    }
    state=working;
    try{persist();}catch(error){state=previous;throw error;}
    return {count:items.length,total,date:effectiveDate,action};
  },
  setPaid(id,isPaid) {
    const s=get();let item=s.transactions.find(t=>t.id===id);
    if(!item)item=s.purchases.flatMap(p=>p.installments).find(i=>i.id===id);
    if(!item && id.includes(':')){
      const [recurrenceId,month]=id.split(':');
      const rec=s.recurrences.find(r=>r.id===recurrenceId);
      if(rec&&/^\d{4}-\d{2}$/.test(month)){
        if(typeof isPaid!=='boolean')throw new Error('Estado inválido');
        rec.paidMonths??={};rec.paidMonths[month]=isPaid;
        persist();return {id,isPaid};
      }
    }
    if(!item)throw new Error('Movimiento no encontrado');
    if(typeof isPaid!=='boolean')throw new Error('Estado inválido');
    item.isPaid=isPaid;item.paidAt=isPaid?new Date().toISOString():null;
    persist();return item;
  },
  remove(id) {
    const s=get();
    let i=s.transactions.findIndex(x=>x.id===id);
    if(i>=0){s.transactions.splice(i,1);persist();return true;}
    i=s.purchases.findIndex(x=>x.id===id);
    if(i>=0){s.purchases.splice(i,1);persist();return true;}
    i=s.recurrences.findIndex(x=>x.id===id);
    if(i>=0){s.recurrences.splice(i,1);persist();return true;}
    throw new Error('Movimiento no encontrado');
  },
  export() { return get(); }
};