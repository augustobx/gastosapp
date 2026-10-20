import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function freePort(){return new Promise((ok,fail)=>{const s=net.createServer();s.once('error',fail);s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>ok(p));});});}
test('Gemini HTTP: diagnósticos, chat y transcripción encolan con res válido y completan tareas',async t=>{
 const port=await freePort(),folder=fs.mkdtempSync(path.join(os.tmpdir(),'gastosapp-gemini-'));
 const child=spawn(process.execPath,['--import','./test/fixtures/gemini-fetch-stub.mjs','server.js'],{
  cwd:process.cwd(),env:{...process.env,PORT:String(port),NODE_ENV:'production',
   APP_PASSWORD:'test-password-long-enough',DATA_DIR:folder,GEMINI_API_KEY:'fake-test-key',OPENAI_API_KEY:''},
  stdio:['ignore','pipe','pipe']
 });
 let stderr='';child.stderr.on('data',v=>stderr+=String(v));
 t.after(()=>{child.kill();fs.rmSync(folder,{recursive:true,force:true});});
 const url='http://127.0.0.1:'+port;
 let ready=false;
 for(let i=0;i<70;i++){try{if((await fetch(url+'/api/health')).ok){ready=true;break;}}catch{}await wait(100)}
 assert.equal(ready,true,'Server startup: '+stderr);
 const login=await fetch(url+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({password:'test-password-long-enough'})});
 assert.equal(login.status,200);const cookie=login.headers.get('set-cookie')?.split(';')[0];assert.ok(cookie);
 const req=async(endpoint,{method='GET',body,headers={}}={})=>{
  const r=await fetch(url+endpoint,{method,headers:{Cookie:cookie,...headers,...(body&&!Buffer.isBuffer(body)?{'Content-Type':'application/json'}:{})},
   ...(body?{body:Buffer.isBuffer(body)?body:JSON.stringify(body)}:{})});
  return {status:r.status,json:await r.json()};
 };
 async function complete(r,name){
  assert.equal(r.status,202,name+': expected 202 instead of route runtime error');
  assert.equal(r.json.ok,true);assert.ok(r.json.data?.taskId);
  let final;
  for(let i=0;i<50;i++){
   const t=await req('/api/ai/tasks/'+encodeURIComponent(r.json.data.taskId));
   assert.equal(t.status,200);final=t.json.data;
   if(final.status!=='working')break;await wait(20);
  }
  assert.equal(final.status,'done',name+': '+JSON.stringify(final));
  return final.data;
 }
 for(const service of ['nlu','stt','tts']){
  const r=await req('/api/ai/diagnostics/'+service,{method:'POST',body:{provider:'gemini',voice:'Kore'}});
  const result=await complete(r,'diag '+service);assert.equal(result.httpStatus,200);
 }
 const chat=await req('/api/chat/turn',{method:'POST',body:{
  provider:'gemini',phase:'collect',items:[],text:'hola, quiero registrar gastos'}});
 assert.equal((await complete(chat,'chat')).action,'greet');
 const bytes=Buffer.alloc(1024);bytes.write('RIFF',0);
 const transcript=await req('/api/voice/transcribe',{method:'POST',body:bytes,
  headers:{'Content-Type':'audio/wav','X-AI-Provider':'gemini'}});
 assert.equal((await complete(transcript,'transcription')).text,'probando uno dos tres');
 assert.doesNotMatch(stderr,/res is not defined/);
});