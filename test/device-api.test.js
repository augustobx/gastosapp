import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const port=()=>new Promise((resolve,reject)=>{
 const server=net.createServer();server.once('error',reject);
 server.listen(0,'127.0.0.1',()=>{const n=server.address().port;server.close(()=>resolve(n));});
});
test('HTTP biometría: solo registro autorizado y firma válida; push opt-in y preferencias protegidas',async t=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'gastos-devices-test-')),p=await port();
 const app=spawn(process.execPath,['server.js'],{cwd:process.cwd(),env:{
  ...process.env,PORT:String(p),NODE_ENV:'production',DATA_DIR:tmp,
  APP_PASSWORD:'test-passkey-strong-password',APP_ORIGIN:'https://gastos.ejemplo.com',
  GEMINI_API_KEY:'',OPENAI_API_KEY:''
 },stdio:['ignore','pipe','pipe']});
 let stderr='';app.stderr.on('data',d=>stderr+=String(d));
 t.after(()=>{app.kill();fs.rmSync(tmp,{recursive:true,force:true});});
 const base='http://127.0.0.1:'+p;
 let up=false;for(let i=0;i<80;i++){try{if((await fetch(base+'/api/health')).ok){up=true;break;}}catch{}await sleep(100);}
 assert.equal(up,true,'Servidor no inició '+stderr);
 let cookie='';
 const req=async(url,method='GET',body,auth=false)=>{
  const r=await fetch(base+url,{method,headers:{
   ...(auth?{Cookie:cookie}:{}),...(body!==undefined?{'Content-Type':'application/json'}:{})
  },...(body!==undefined?{body:JSON.stringify(body)}:{})});
  return {status:r.status,json:await r.json(),cookie:r.headers.get('set-cookie')};
 };
 const caps=await req('/api/security/capabilities');
 assert.equal(caps.status,200);
 assert.equal(caps.json.data.passkeysReady,true);
 assert.equal(caps.json.data.passkeysRegistered,false);
 assert.equal(caps.json.data.pushReady,true);
 const premature=await req('/api/passkeys/register/options','POST',{});
 assert.equal(premature.status,401);
 assert.equal((await req('/api/passkeys/login/options','POST',{})).status,404);
 const login=await req('/api/login','POST',{password:'test-passkey-strong-password'});
 assert.equal(login.status,200);
 cookie=login.cookie.split(';')[0];
 const opts=await req('/api/passkeys/register/options','POST',{},true);
 assert.equal(opts.status,200,JSON.stringify(opts));
 assert.ok(opts.json.data.options.challenge);
 const fake=await req('/api/passkeys/register/verify','POST',{
  requestId:opts.json.data.requestId,response:{id:'forged',type:'public-key'}
 },true);
 assert.ok(fake.status>=400);
 assert.equal((await req('/api/passkeys', 'GET',undefined,true)).json.data.devices.length,0);
 const tryAgain=await req('/api/passkeys/register/verify','POST',{
  requestId:opts.json.data.requestId,response:{id:'forged',type:'public-key'}
 },true);
 assert.ok(tryAgain.status>=400,'un mismo challenge no debe valer dos veces');
 const pushConfig=await req('/api/push/config','GET',undefined,true);
 assert.equal(pushConfig.status,200,JSON.stringify(pushConfig));
 assert.equal(pushConfig.json.data.enabled,true);
 assert.match(pushConfig.json.data.publicKey,/^[a-zA-Z0-9_-]+$/);
 assert.equal((await req('/api/push/preferences','PATCH',{overdue:true,daysBefore:7})).status,401);
 const prefs=await req('/api/push/preferences','PATCH',{overdue:true,daysBefore:7},true);
 assert.equal(prefs.status,200);assert.equal(prefs.json.data.daysBefore,7);
 const subscription={
  endpoint:'https://fcm.googleapis.com/fcm/send/test',
  keys:{p256dh:Buffer.concat([Buffer.from([4]),Buffer.alloc(64,1)]).toString('base64url'),
   auth:Buffer.alloc(16,2).toString('base64url')}
 };
 const bad=await req('/api/push/subscribe','POST',{
  subscription:{...subscription,endpoint:'https://127.0.0.1/private'}
 },true);
 assert.ok(bad.status>=400);
 const subscribed=await req('/api/push/subscribe','POST',{subscription},true);
 assert.equal(subscribed.status,200,JSON.stringify(subscribed));
 assert.equal(subscribed.json.data.count,1);
 assert.ok(fs.existsSync(path.join(tmp,'device-security.json')));
 const unsubscribed=await req('/api/push/unsubscribe','POST',{endpoint:subscription.endpoint},true);
 assert.equal(unsubscribed.status,200);
 assert.equal(unsubscribed.json.data.count,0);
 assert.equal((await req('/api/passkeys','GET',undefined,true)).json.data.devices.length,0);
});
