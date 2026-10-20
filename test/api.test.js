import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';

const freePort=()=>new Promise((resolve,reject)=>{
 const server=net.createServer();
 server.once('error',reject);
 server.listen(0,'127.0.0.1',()=>{const port=server.address().port;server.close(()=>resolve(port));});
});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
test('HTTP: protección, medios, cuotas, recurrentes y confirmación de pago',async t=>{
 const port=await freePort();
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'gastosapp-test-'));
 const app=spawn(process.execPath,['server.js'],{cwd:process.cwd(),
   env:{...process.env,PORT:String(port),NODE_ENV:'production',APP_PASSWORD:'test-secret-long-password',
     DATA_DIR:tmp,OPENAI_API_KEY:'',GEMINI_API_KEY:''},stdio:['ignore','pipe','pipe']});
 let err='';app.stderr.on('data',b=>{err+=String(b)});
 t.after(()=>{app.kill();fs.rmSync(tmp,{force:true,recursive:true});});
 const base='http://127.0.0.1:'+port;
 let up=false;
 for(let i=0;i<70;i++){
   if(app.exitCode!==null)break;
   try{const r=await fetch(base+'/api/health');if(r.ok){up=true;break;}}catch{}
   await wait(100);
 }
 assert.equal(up,true,'Servidor no inició: '+err);
 const get=async(url,method='GET',body,cookie='')=>{
   const r=await fetch(base+url,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),
     ...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined});
   return {code:r.status,cookie:r.headers.get('set-cookie'),json:await r.json()};
 };
 assert.equal((await get('/api/state')).code,401);
 assert.equal((await get('/api/ai/usage')).code,401);
 assert.equal((await get('/api/login','POST',{password:'mala'})).code,401);
 const login=await get('/api/login','POST',{password:'test-secret-long-password'});
 assert.equal(login.code,200);
 const cookie=login.cookie.split(';')[0];
 const usageReport=await get('/api/ai/usage?period=today','GET',null,cookie);
 assert.equal(usageReport.code,200);
 assert.equal(usageReport.json.data.summary.requests,0);
 assert.equal(usageReport.json.data.pricingMode,'paid_equivalent_not_actual_bill');
 assert.deepEqual(usageReport.json.data.models,[]);
 const aiWithoutKey=await get('/api/chat/turn','POST',{text:'Cargar un gasto',items:[],phase:'collect'},cookie);
 assert.equal(aiWithoutKey.code,503);
 const network=await get('/api/ai/network','GET',null,cookie);
 assert.equal(network.code,503);
 assert.equal(network.json.code,'missing_key');
  const aiConfig=await get('/api/ai/config','GET',null,cookie);
 assert.equal(aiConfig.code,200);
 assert.equal(aiConfig.json.data.configured,false);
 assert.equal(aiConfig.json.data.providers.gemini.configured,false);
 assert.equal(aiConfig.json.data.providers.gemini.nlu,'gemini-3.8-flash');
 assert.equal(aiConfig.json.data.providers.gemini.stt,'gemini-3.8-flash');
 assert.equal(aiConfig.json.data.providers.gemini.tts,'gemini-3.8-flash-tts');
 assert.equal(aiConfig.json.data.stt,'gpt-4o-mini-transcribe');
 assert.ok(Array.isArray(aiConfig.json.data.voices));
 const probe=await get('/api/ai/diagnostics/stt','POST',{},cookie);
 assert.equal(probe.code,503);
 assert.equal(probe.json.code,'missing_key');
 const geminiProbe=await get('/api/ai/diagnostics/tts','POST',{provider:'gemini',voice:'Kore'},cookie);
 assert.equal(geminiProbe.code,503);
 assert.equal(geminiProbe.json.code,'missing_gemini_key');
 const geminiNetwork=await get('/api/ai/network?provider=gemini','GET',null,cookie);
 assert.equal(geminiNetwork.code,503);
 const geminiTurn=await get('/api/chat/turn','POST',{text:'gasto 15 mil',provider:'gemini',items:[]},cookie);
 assert.equal(geminiTurn.code,503);
 const geminiSpeech=await get('/api/chat/speech','POST',{text:'Hola',provider:'gemini',voice:'Kore'},cookie);
 assert.equal(geminiSpeech.code,503);
 const speechWithoutKey=await get('/api/chat/speech','POST',{text:'Hola, ¿cómo va?'},cookie);
 assert.equal(speechWithoutKey.code,503);
 const initial=(await get('/api/state?month=2026-11','GET',null,cookie)).json.data;
 assert.equal(initial.accounts.some(a=>a.id==='visa'),true);
 let added=await get('/api/transactions','POST',{
   type:'expense',title:'Celular',amount:120000,date:'2026-10-19',
   category:'Tecnología',accountId:'visa',installmentCount:6
 },cookie);
 assert.equal(added.code,200);assert.equal(added.json.data.kind,'purchase');
 let nov=(await get('/api/state?month=2026-11','GET',null,cookie)).json.data;
 assert.equal(nov.expenses,20000);assert.equal(nov.pending,20000);
 const id=nov.rows[0].installmentId;
 assert.equal((await get('/api/paid/'+id,'PATCH',{isPaid:true},cookie)).code,200);
 nov=(await get('/api/state?month=2026-11','GET',null,cookie)).json.data;
 assert.equal(nov.pending,0);assert.equal(nov.paid,20000);assert.equal(nov.expenses,20000);
 const recur=await get('/api/transactions','POST',{type:'expense',title:'Internet',amount:15000,
  category:'Servicios',date:'2026-10-19',accountId:'transfer',isRecurring:true},cookie);
 assert.equal(recur.json.data.kind,'recurrence');
 const dec=(await get('/api/state?month=2026-12','GET',null,cookie)).json.data;
 assert.equal(dec.expenses,35000);assert.equal(dec.pending,35000);
 const voice=await get('/api/interpret','POST',{text:'Me patiné 20 lucas con Visa en 2 cuotas'},cookie);
 assert.equal(voice.json.data.amount,20000);
 assert.equal(voice.json.data.installmentCount,2);
 const parsed=await get('/api/interpret','POST',{text:'Cargar a Juanma 890000 a fin de mes pago único'},cookie);
 assert.equal(parsed.code,200);assert.equal(parsed.json.data.title,'Juanma');
 assert.equal(parsed.json.data.amount,890000);assert.equal(parsed.json.data.isPaid,false);
 assert.equal(parsed.json.data.installmentCount,1);
 const expectedEndOfMonth=new Date(new Date().getFullYear(),new Date().getMonth()+1,0);
 const end=expectedEndOfMonth.getFullYear()+'-'+String(expectedEndOfMonth.getMonth()+1).padStart(2,'0')+'-'+String(expectedEndOfMonth.getDate()).padStart(2,'0');
 assert.equal(parsed.json.data.dueDate,end);
 const spaced=await get('/api/interpret','POST',{text:'890 000 a juanma para cancelar el crédito a fin de mes'},cookie);
 assert.equal(spaced.code,200);
 assert.equal(spaced.json.data.amount,890000);
 assert.equal(spaced.json.data.title,'Pago de crédito · Juanma');
 assert.equal(spaced.json.data.category,'Deudas y préstamos');
 assert.equal(spaced.json.data.isPaid,false);
 assert.equal(spaced.json.data.accountId,null);
 assert.equal(spaced.json.data.mentionedMethod,null);
 assert.equal(spaced.json.data.dueDate,end);
 assert.deepEqual(spaced.json.data.questions,[]);
 const savedDebt=await get('/api/transactions','POST',spaced.json.data,cookie);
 assert.equal(savedDebt.code,200);
 assert.equal(savedDebt.json.data.data.amount,890000);
 assert.equal(savedDebt.json.data.data.accountId,null);
 assert.equal(savedDebt.json.data.data.isPaid,false);
 const scheduled=await get('/api/transactions','POST',parsed.json.data,cookie);
 assert.equal(scheduled.code,200);assert.equal(scheduled.json.data.data.dueDate,end);
 assert.equal(scheduled.json.data.data.isPaid,false);
 const scheduledMonth=end.slice(0,7);
 const projected=(await get('/api/state?month='+scheduledMonth,'GET',null,cookie)).json.data;
 assert.ok(projected.rows.some(row=>row.title==='Juanma'&&row.dueDate===end&&!row.isPaid));
 const updated=await get('/api/transactions/'+scheduled.json.data.data.id,'PATCH',{dueDate:'2026-12-29'},cookie);
 assert.equal(updated.code,200);
 const shifted=(await get('/api/state?month=2026-12','GET',null,cookie)).json.data;
 assert.ok(shifted.rows.some(row=>row.title==='Juanma'&&row.dueDate==='2026-12-29'));

 // Chat: guardar toda la tanda de forma atómica y permitir reintentos sin duplicados.
 const batch={requestId:'chat-suite-test-001',transactions:[
   {type:'expense',title:'Juanma chat',amount:890000,date:'2026-10-19',
     dueDate:'2026-10-31',isPaid:false,category:'Deudas y préstamos'},
   {type:'expense',title:'Super chat',amount:15000,date:'2026-10-19',
     isPaid:true,accountId:'mp',category:'Comida'}
 ]};
 const committed=await get('/api/transactions/batch','POST',batch,cookie);
 assert.equal(committed.code,200);assert.equal(committed.json.data.count,2);
 assert.equal(committed.json.data.alreadySaved,false);
 const again=await get('/api/transactions/batch','POST',batch,cookie);
 assert.equal(again.code,200);assert.equal(again.json.data.alreadySaved,true);
 const october=(await get('/api/state?month=2026-10','GET',null,cookie)).json.data;
 assert.equal(october.rows.filter(x=>x.title==='Juanma chat').length,1);
 assert.equal(october.rows.filter(x=>x.title==='Super chat').length,1);
 const invalid={requestId:'chat-suite-test-002',transactions:[
   {type:'expense',title:'Este no debe aparecer',amount:220,date:'2026-10-19',isPaid:false},
   {type:'expense',title:'Compra invalida',amount:1500,date:'2026-10-19',
     installmentCount:3,accountId:'mp'}
 ]};
 const rejected=await get('/api/transactions/batch','POST',invalid,cookie);
 assert.equal(rejected.code,400);
 const after=(await get('/api/state?month=2026-10','GET',null,cookie)).json.data;
 assert.equal(after.rows.filter(x=>x.title==='Este no debe aparecer').length,0);
});
