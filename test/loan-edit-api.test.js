import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const port=()=>new Promise((resolve,reject)=>{
 const server=net.createServer();server.once('error',reject);
 server.listen(0,'127.0.0.1',()=>{const p=server.address().port;server.close(()=>resolve(p));});
});
function monthFromArgentina(){
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
 const obj=Object.fromEntries(parts.map(p=>[p.type,p.value]));
 return {year:Number(obj.year),month:Number(obj.month),day:Number(obj.day)};
}
test('editar préstamo existente arrastra cuotas de septiembre a octubre solo a pedido, sin duplicar pagos',async t=>{
 const work=mkdtempSync(path.join(os.tmpdir(),'gastosapp-edit-loan-'));
 const selected=await port();
 const child=spawn(process.execPath,['server.js'],{
  cwd:process.cwd(),env:{...process.env,PORT:String(selected),NODE_ENV:'production',
   APP_PASSWORD:'test-edit-loan-very-long',OPENAI_API_KEY:'',GEMINI_API_KEY:'',DATA_DIR:work},
  stdio:['ignore','pipe','pipe']
 });
 let stderr='';child.stderr.on('data',v=>stderr+=String(v));
 t.after(()=>{child.kill();rmSync(work,{force:true,recursive:true});});
 const base='http://127.0.0.1:'+selected;
 let up=false;for(let i=0;i<80;i++){try{if((await fetch(base+'/api/health')).ok){up=true;break;}}catch{}await pause(100);}
 assert.equal(up,true,stderr);
 const logged=await fetch(base+'/api/login',{method:'POST',
  headers:{'Content-Type':'application/json'},body:JSON.stringify({password:'test-edit-loan-very-long'})});
 assert.equal(logged.status,200);
 const cookie=logged.headers.get('set-cookie').split(';')[0];
 const request=async(url,method='GET',body,authenticated=true)=>{
  const r=await fetch(base+url,{method,headers:{
   ...(authenticated?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json'}:{})
  },...(body?{body:JSON.stringify(body)}:{})});
  return {status:r.status,json:await r.json()};
 };
 const {year,month,day}=monthFromArgentina();
 const current=year+'-'+String(month).padStart(2,'0');
 const previousDate=new Date(year,month-2,1);
 const lastMonth=previousDate.getFullYear()+'-'+String(previousDate.getMonth()+1).padStart(2,'0');
 const firstDue=lastMonth+'-01',today=current+'-'+String(day).padStart(2,'0');
 const payload={type:'expense',title:'Crédito personal',amount:200000,date:today,
  category:'Deudas y préstamos',accountId:'debit',installmentCount:25,
  financingType:'loan',firstDueDate:firstDue,overdueChoice:'review'};
 const initial=await request('/api/transactions','POST',payload);
 assert.equal(initial.status,200,JSON.stringify(initial));
 const id=initial.json.data.data.id;
 let currentData=(await request('/api/state?month='+current)).json.data;
 let plan=currentData.purchases.find(p=>p.id===id);
 assert.equal(plan.paidCount,0);assert.equal(plan.overdueCount,1);
 assert.equal(currentData.rows.filter(r=>r.purchaseId===id).reduce((n,r)=>n+r.amount,0),200000);
 const originals=plan.installments.map(x=>({id:x.id,dueDate:x.dueDate}));
 const edit={title:'Préstamo Banco',installmentAmount:200000,count:25,
  firstDueDate:firstDue,accountId:'debit',category:'Deudas y préstamos',
  notes:'Se deben dos cuotas en el mes actual',overdueChoice:'include'};
 const unauthorized=await request('/api/loans/'+id,'PATCH',edit,false);
 assert.equal(unauthorized.status,401);
 const changed=await request('/api/loans/'+id,'PATCH',edit);
 assert.equal(changed.status,200,JSON.stringify(changed));
 assert.equal(changed.json.data.overdueMoved,1);
 assert.equal(changed.json.data.overdueMovedTotal,200000);
 currentData=(await request('/api/state?month='+current)).json.data;
 plan=currentData.purchases.find(p=>p.id===id);
 assert.equal(plan.title,'Préstamo Banco');
 assert.equal(plan.notes,'Se deben dos cuotas en el mes actual');
 assert.equal(currentData.rows.filter(r=>r.purchaseId===id).length,2);
 assert.equal(currentData.rows.filter(r=>r.purchaseId===id).reduce((n,r)=>n+r.amount,0),400000);
 assert.equal(currentData.rows.filter(r=>r.purchaseId===id&& !r.isPaid).length,2);
 assert.equal((await request('/api/state?month='+lastMonth)).json.data.rows.filter(r=>r.purchaseId===id).length,0);
 assert.deepEqual(plan.installments.map(x=>({id:x.id,dueDate:x.dueDate})),originals);
 assert.equal(plan.installments[0].plannedDate?.slice(0,7),current);
 assert.equal(plan.installments[0].isPaid,false);
 const again=await request('/api/loans/'+id,'PATCH',edit);
 assert.equal(again.status,200);assert.equal(again.json.data.overdueMoved,0);
 assert.equal((await request('/api/state?month='+current)).json.data.rows.filter(r=>r.purchaseId===id).length,2);
 // Al editar cuotas impagas puede cambiar el importe y se preservan IDs existentes.
 const adjust=await request('/api/loans/'+id,'PATCH',{...edit,installmentAmount:210000,count:26});
 assert.equal(adjust.status,200);assert.equal(adjust.json.data.amount,5460000);
 plan=(await request('/api/state?month='+current)).json.data.purchases.find(p=>p.id===id);
 assert.equal(plan.installments.length,26);
 assert.equal(plan.installments[0].id,originals[0].id);
 assert.equal(plan.installments[1].id,originals[1].id);
 assert.equal(plan.installments[0].amount,210000);
 // Una cuota realmente abonada bloquea la modificación retroactiva de importes/cantidad.
 const paid=await request('/api/installments/batch','PATCH',{
  ids:[originals[0].id],action:'pay',date:today
 });
 assert.equal(paid.status,200);
 const forbidden=await request('/api/loans/'+id,'PATCH',{...edit,installmentAmount:220000,count:26});
 assert.equal(forbidden.status,400);
 const textOnly=await request('/api/loans/'+id,'PATCH',{
  title:'Crédito corregido',category:'Otros',accountId:'transfer',notes:'Medio actualizado',
  overdueChoice:'review'
 });
 assert.equal(textOnly.status,200,JSON.stringify(textOnly));
 const later=(await request('/api/state?month='+current)).json.data;
 const updated=later.purchases.find(p=>p.id===id);
 assert.equal(updated.title,'Crédito corregido');assert.equal(updated.accountId,'transfer');
 assert.equal(updated.paidCount,1);
 assert.equal(updated.installments[0].paidDate,today);
 // El usuario puede declarar las cuotas anteriores pendientes desde el alta.
 const second=await request('/api/transactions','POST',{
  ...payload,title:'Préstamo creado con deuda previa',overdueChoice:'include'
 });
 assert.equal(second.status,200,JSON.stringify(second));
 const secondId=second.json.data.data.id;
 const snap=(await request('/api/state?month='+current)).json.data;
 assert.equal(snap.rows.filter(r=>r.purchaseId===secondId).length,2);
 assert.equal(snap.rows.filter(r=>r.purchaseId===secondId).reduce((n,r)=>n+r.amount,0),400000);
 assert.ok(!stderr.includes('res is not defined'));
});
