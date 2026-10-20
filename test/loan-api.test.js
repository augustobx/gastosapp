import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {isoDay,monthOf} from '../lib/engine.js';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const availablePort=()=>new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',reject);
 s.listen(0,'127.0.0.1',()=>{const n=s.address().port;s.close(()=>resolve(n));});});
test('HTTP crédito 25 cuotas por débito: planificar dos juntas, pagar, desmarcar y no duplicar',async t=>{
 const port=await availablePort(),dir=fs.mkdtempSync(path.join(os.tmpdir(),'gastosapp-loan-'));
 const child=spawn(process.execPath,['server.js'],{cwd:process.cwd(),env:{
  ...process.env,PORT:String(port),NODE_ENV:'production',APP_PASSWORD:'test-loan-strong-password',
  OPENAI_API_KEY:'',GEMINI_API_KEY:'',DATA_DIR:dir
 },stdio:['ignore','pipe','pipe']});
 let err='';child.stderr.on('data',v=>err+=String(v));
 t.after(()=>{child.kill();fs.rmSync(dir,{recursive:true,force:true});});
 const base='http://127.0.0.1:'+port;
 let ready=false;for(let i=0;i<80;i++){try{if((await fetch(base+'/api/health')).ok){ready=true;break;}}catch{}await wait(100);}
 assert.ok(ready,err);
 const login=await fetch(base+'/api/login',{method:'POST',
  headers:{'Content-Type':'application/json'},body:JSON.stringify({password:'test-loan-strong-password'})});
 assert.equal(login.status,200);const cookie=login.headers.get('set-cookie')?.split(';')[0];
 async function req(url,method='GET',body,authenticated=true){
  const r=await fetch(base+url,{method,headers:{...(authenticated?{Cookie:cookie}:{}),
   ...(body!==undefined?{'Content-Type':'application/json'}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});
  return {status:r.status,body:await r.json()};
 }
 const now=new Date(),day=isoDay(now),month=monthOf(day);
 const previous=new Date(now.getFullYear(),now.getMonth(),0);
 const firstDue=isoDay(previous);
 const monthEnd=isoDay(new Date(now.getFullYear(),now.getMonth()+1,0));
 assert.equal((await req('/api/installments/batch','PATCH',{ids:['fake'],action:'plan',date:day},false)).status,401);
 const loan=await req('/api/transactions','POST',{
  type:'expense',title:'Crédito personal 25 cuotas',amount:125000,date:day,
  category:'Deudas y préstamos',accountId:'debit',installmentCount:25,
  financingType:'loan',firstDueDate:firstDue,isPaid:false
 });
 assert.equal(loan.status,200,JSON.stringify(loan.body));
 assert.equal(loan.body.data.kind,'loan');
 let snap=(await req('/api/state?month='+month)).body.data;
 const plan=snap.purchases.find(p=>p.financingType==='loan');
 assert.equal(plan.count,25);assert.equal(plan.amount,3125000);
 assert.equal(plan.installmentAmount,125000);
 assert.equal(plan.installments[0].dueDate,firstDue);
 assert.equal(plan.installments[1].dueDate,monthEnd);
 const ids=plan.installments.slice(0,2).map(i=>i.id);
 const invalid=await req('/api/installments/batch','PATCH',{ids:[ids[0],'inexistente'],action:'plan',date:monthEnd});
 assert.equal(invalid.status,400);
 const programmed=await req('/api/installments/batch','PATCH',{ids,action:'plan',date:monthEnd});
 assert.equal(programmed.status,200,JSON.stringify(programmed.body));
 assert.equal(programmed.body.data.total,250000);
 snap=(await req('/api/state?month='+month)).body.data;
 assert.equal(snap.pending,250000);
 assert.equal(snap.expenses,250000);
 assert.equal(snap.rows.filter(r=>r.purchaseId===plan.id).length,2);
 const oldMonth=(await req('/api/state?month='+monthOf(firstDue))).body.data;
 assert.equal(oldMonth.rows.filter(r=>r.purchaseId===plan.id).length,0);
 const invalidFuture=await req('/api/installments/batch','PATCH',{ids,action:'pay',date:'2099-12-31'});
 assert.equal(invalidFuture.status,400);
 const payment=await req('/api/installments/batch','PATCH',{ids,action:'pay',date:day});
 assert.equal(payment.status,200,JSON.stringify(payment.body));
 snap=(await req('/api/state?month='+month)).body.data;
 assert.equal(snap.paid,250000);assert.equal(snap.pending,0);assert.equal(snap.expenses,250000);
 assert.equal(snap.purchases.find(p=>p.id===plan.id).paidCount,2);
 assert.equal((await req('/api/installments/batch','PATCH',{ids,action:'pay',date:day})).status,400);
 const undo=await req('/api/installments/batch','PATCH',{ids:[ids[0]],action:'unpay'});
 assert.equal(undo.status,200);
 snap=(await req('/api/state?month='+month)).body.data;
 assert.equal(snap.pending,125000);assert.equal(snap.paid,125000);
 assert.equal(snap.purchases.find(p=>p.id===plan.id).paidCount,1);
 const invalidLoan=await req('/api/transactions','POST',{
  type:'expense',title:'No crear',amount:50000,installmentCount:25,
  accountId:'debit',financingType:'loan',date:day
 });
 assert.equal(invalidLoan.status,400);
 assert.ok(!((await req('/api/state?month='+month)).body.data.purchases.some(p=>p.title==='No crear')));
});
