import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';

const port=()=>new Promise((resolve,reject)=>{
 const server=net.createServer();server.once('error',reject);
 server.listen(0,'127.0.0.1',()=>{const p=server.address().port;server.close(()=>resolve(p));});
});
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
test('API: ingreso fijo, edición, cobro por mes y selección múltiple atómica',async t=>{
 const selected=await port(),dir=fs.mkdtempSync(path.join(os.tmpdir(),'gastosapp-fixed-income-'));
 const server=spawn(process.execPath,['server.js'],{cwd:process.cwd(),env:{
  ...process.env,PORT:String(selected),NODE_ENV:'production',
  APP_PASSWORD:'test-strong-fixed-income',OPENAI_API_KEY:'',GEMINI_API_KEY:'',DATA_DIR:dir
 },stdio:['ignore','pipe','pipe']});
 let stderr='';server.stderr.on('data',d=>stderr+=String(d));
 t.after(()=>{server.kill();fs.rmSync(dir,{recursive:true,force:true});});
 const base='http://127.0.0.1:'+selected;
 let started=false;
 for(let i=0;i<80;i++){try{if((await fetch(base+'/api/health')).ok){started=true;break;}}catch{}await wait(100);}
 assert.equal(started,true,'No inició: '+stderr);
 const login=await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({password:'test-strong-fixed-income'})});
 assert.equal(login.status,200);
 const cookie=login.headers.get('set-cookie')?.split(';')[0];
 async function req(url,method='GET',payload,authenticated=true){
  const response=await fetch(base+url,{method,headers:{
   ...(authenticated?{Cookie:cookie}:{}),...(payload!==undefined?{'Content-Type':'application/json'}:{})
  },...(payload!==undefined?{body:JSON.stringify(payload)}:{})});
  return {status:response.status,data:await response.json()};
 }
 const created=await req('/api/transactions','POST',{
  type:'income',title:'Alquiler recibido',amount:200000,date:'2026-09-01',
  category:'Extra',accountId:'transfer',isRecurring:true,isPaid:false
 });
 assert.equal(created.status,200,JSON.stringify(created));
 assert.equal(created.data.data.kind,'recurrence');
 assert.equal(created.data.data.data.type,'income');
 const recId=created.data.data.data.id;
 let oct=(await req('/api/state?month=2026-10')).data.data;
 assert.equal(oct.income,200000);assert.equal(oct.incomePending,200000);
 assert.equal(oct.incomeReceived,0);
 assert.equal(oct.rows.length,1);
 const recurringId=recId+':2026-10';
 assert.equal(oct.rows[0].id,recurringId);
 const modified=await req('/api/recurrences/'+recId,'PATCH',{title:'Alquiler mensual',amount:210000});
 assert.equal(modified.status,200,JSON.stringify(modified));
 oct=(await req('/api/state?month=2026-10')).data.data;
 assert.equal(oct.income,210000);
 assert.equal(oct.rows.length,1,'no duplicar el ingreso');
 assert.equal(oct.rows[0].title,'Alquiler mensual');
 const denied=await req('/api/movements/status/batch','PATCH',{
  month:'2026-10',ids:[recurringId],isPaid:true
 },false);
 assert.equal(denied.status,401);
 const bad=await req('/api/movements/status/batch','PATCH',{
  month:'2026-10',ids:[recurringId,'not-existing'],isPaid:true
 });
 assert.ok(bad.status>=400);
 oct=(await req('/api/state?month=2026-10')).data.data;
 assert.equal(oct.incomeReceived,0,'ninguna modificación parcial');
 const normal=await req('/api/transactions','POST',{
  type:'income',title:'Ingreso eventual',amount:15000,date:'2026-10-08',
  category:'Extra',accountId:'cash',isPaid:false
 });
 assert.equal(normal.status,200);
 const normalId=normal.data.data.data.id;
 const changed=await req('/api/movements/status/batch','PATCH',{
  month:'2026-10',ids:[recurringId,normalId],isPaid:true
 });
 assert.equal(changed.status,200,JSON.stringify(changed));
 assert.equal(changed.data.data.count,2);
 oct=(await req('/api/state?month=2026-10')).data.data;
 assert.equal(oct.income,225000);
 assert.equal(oct.incomeReceived,225000);
 assert.equal(oct.incomePending,0);
 const september=(await req('/api/state?month=2026-09')).data.data;
 assert.equal(september.incomeReceived,0,'cobrar octubre no marca septiembre');
 assert.equal(september.incomePending,210000);
 const undone=await req('/api/movements/status/batch','PATCH',{
  month:'2026-10',ids:[recurringId],isPaid:false
 });
 assert.equal(undone.status,200);
 oct=(await req('/api/state?month=2026-10')).data.data;
 assert.equal(oct.incomeReceived,15000);
 assert.equal(oct.incomePending,210000);
 // Mantener compatibilidad con gastos fijos anteriores.
 const expense=await req('/api/transactions','POST',{
  type:'expense',title:'Internet mensual',amount:30000,date:'2026-09-01',
  category:'Servicios',isRecurring:true,isPaid:false
 });
 assert.equal(expense.status,200);
 const nov=(await req('/api/state?month=2026-11')).data.data;
 assert.equal(nov.expenses,30000);
 assert.equal(nov.income,210000);
 assert.equal(nov.rows.filter(r=>r.isRecurring).length,2);
 // No permitir convertir un ingreso a gasto mediante edición.
 const swap=await req('/api/recurrences/'+recId,'PATCH',{type:'expense'});
 assert.ok(swap.status>=400);
 assert.equal(stderr.includes('res is not defined'),false);
});
