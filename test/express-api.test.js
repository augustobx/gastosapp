import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';

const port=()=>new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',reject);
 s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

test('Express autoguardado opt-in, idempotente, validado en servidor y sin llamadas IA',async t=>{
 const selected=await port(),dir=fs.mkdtempSync(path.join(os.tmpdir(),'gastosapp-express-'));
 const child=spawn(process.execPath,['server.js'],{cwd:process.cwd(),env:{
   ...process.env,PORT:String(selected),NODE_ENV:'production',APP_PASSWORD:'test-express-long-password',
   OPENAI_API_KEY:'',GEMINI_API_KEY:'',DATA_DIR:dir
 },stdio:['ignore','pipe','pipe']});
 let errors='';child.stderr.on('data',data=>errors+=String(data));
 t.after(()=>{child.kill();fs.rmSync(dir,{force:true,recursive:true});});
 const base='http://127.0.0.1:'+selected;
 let started=false;
 for(let i=0;i<80;i++){try{if((await fetch(base+'/api/health')).ok){started=true;break;}}catch{}await sleep(100);}
 assert.equal(started,true,'No inició servidor: '+errors);
 const login=await fetch(base+'/api/login',{method:'POST',
  headers:{'Content-Type':'application/json'},body:JSON.stringify({password:'test-express-long-password'})});
 assert.equal(login.status,200);
 const cookie=login.headers.get('set-cookie')?.split(';')[0];
 const request=async (url,body,cookieHeader=cookie)=>{
  const r=await fetch(base+url,{method:'POST',headers:{
   'Content-Type':'application/json',...(cookieHeader?{Cookie:cookieHeader}:{})
  },body:JSON.stringify(body)});
  return {status:r.status,data:await r.json()};
 };
 const tx={type:'expense',title:'Farmacia',amount:18000,date:'2026-10-20',
  dueDate:null,category:'Salud',accountId:'debit',installmentCount:1,
  isPaid:true,isRecurring:false,notes:''};
 const phrase='Gasté 18 lucas en la farmacia con débito';
 const first={phrase,transaction:tx,auto:true,requestId:'express-unique-test-0001'};
 assert.equal((await request('/api/express/save',first)).status,409);
 assert.equal((await request('/api/express/save',first,null)).status,401);
 const settings=await request('/api/settings',{expressAutoConfirm:true});
 assert.equal(settings.status,200);assert.equal(settings.data.data.expressAutoConfirm,true);
 const tampered=await request('/api/express/save',{...first,transaction:{...tx,amount:99999999}});
 assert.equal(tampered.status,200);
 const saved=JSON.parse(fs.readFileSync(path.join(dir,'gastosapp-v2.json'),'utf8'));
 assert.equal(saved.transactions.length,1);
 assert.equal(saved.transactions[0].amount,18000,'servidor debe ignorar importe falsificado en auto');
 const repeat=await request('/api/express/save',first);
 assert.equal(repeat.status,200);
 assert.equal(repeat.data.data.alreadySaved,true);
 assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'gastosapp-v2.json'),'utf8')).transactions.length,1);
 const multi=await request('/api/express/save',{
  phrase:'Gasté 18 lucas en farmacia y 25 lucas en supermercado',auto:true,transaction:tx,
  requestId:'express-unique-test-0002'});
 assert.equal(multi.status,422);
 const installments=await request('/api/express/save',{
  phrase:'Gasté 100000 en 3 cuotas con visa',auto:false,transaction:tx,
  requestId:'express-unique-test-0003'});
 assert.equal(installments.status,422);
 const disabled=await request('/api/settings',{expressAutoConfirm:false});
 assert.equal(disabled.status,200);
 const other=await request('/api/express/save',{...first,requestId:'express-unique-test-0004'});
 assert.equal(other.status,409);
 assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'gastosapp-v2.json'),'utf8')).transactions.length,1);
 assert.equal(errors.includes('res is not defined'),false);
});
