import fs from 'node:fs';
import path from 'node:path';
import { uid, isoDay, money, monthOf, schedule, project } from './lib/engine.js';

const dataDir = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const dataFile = path.join(dataDir, 'gastosapp-v2.json');
fs.mkdirSync(dataDir, {recursive:true});
const defaults = () => ({
  version: 2,
  settings: {salary:0, currency:'ARS'},
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
  state = {...parsed, recurrences:Array.isArray(parsed.recurrences)?parsed.recurrences:[]};
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
      if(type!=='expense'||count!==1)throw new Error('Los gastos recurrentes deben ser gastos mensuales sin cuotas');
      const recurring={id:uid(),title,amount,category,accountId,notes,startDate:date,paidMonths:{}};
      if(data.isPaid===true) recurring.paidMonths[date.slice(0,7)]=true;
      s.recurrences.unshift(recurring);return {kind:'recurrence',data:recurring};
    }
    if(type==='expense' && (count>1 || a?.kind==='credit')) {
      if(count>1 && a?.kind!=='credit')throw new Error('Seleccioná una tarjeta de crédito para las cuotas');
      const purchase={id:uid(),title,amount,date,category,notes,accountId,
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
        count:p.installments.length,accountId:p.accountId})),
      recurrences:s.recurrences.map(r=>({id:r.id,title:r.title,amount:r.amount,startDate:r.startDate}))};
  },
  settings(data) {
    const s=get();
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