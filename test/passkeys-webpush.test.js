import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createDeviceStore,validPushEndpoint,validatePushSubscription} from '../lib/device-store.js';
import {detectReminders} from '../lib/push-service.js';
import {trustedAppOrigin,createPasskeyManager} from '../lib/passkeys.js';
import {loanSchedule} from '../lib/engine.js';
const sample={
 endpoint:'https://fcm.googleapis.com/fcm/send/example',
 keys:{p256dh:Buffer.concat([Buffer.from([4]),Buffer.alloc(64,1)]).toString('base64url'),
  auth:Buffer.alloc(16,1).toString('base64url')}
};
test('la clave biométrica requiere origen HTTPS exacto y challenge de un solo uso',async()=>{
 assert.equal(trustedAppOrigin('https://gastos.ejemplo.com').rpID,'gastos.ejemplo.com');
 assert.equal(trustedAppOrigin('http://localhost:3000').rpID,'localhost');
 assert.equal(trustedAppOrigin(''),null);
 assert.throws(()=>trustedAppOrigin('http://gastos.ejemplo.com'),/APP_ORIGIN/);
 assert.throws(()=>trustedAppOrigin('https://gastos.ejemplo.com/ruta'),/APP_ORIGIN/);
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'passkey-test-'));
 try{
  const store=createDeviceStore(folder);
  const manager=createPasskeyManager({store,appOrigin:'https://gastos.ejemplo.com'});
  const result=await manager.registrationOptions('session-a');
  assert.match(result.options.challenge,/^[A-Za-z0-9_-]+$/);
  assert.equal(result.options.rp.id,'gastos.ejemplo.com');
  await assert.rejects(()=>manager.registrationFinish('session-b',{
   requestId:result.requestId,response:{} 
  }),/vencida/);
  await assert.rejects(()=>manager.registrationFinish('session-a',{
   requestId:result.requestId,response:{}
  }),/vencida/);
  assert.deepEqual(manager.list(),[]);
  await assert.rejects(()=>manager.authenticationOptions(),/Todavía no registraste/);
 }finally{fs.rmSync(folder,{recursive:true,force:true});}
});
test('suscripción Web Push valida URLs sin SSRF y se puede revocar',()=>{
 assert.equal(validPushEndpoint('https://fcm.googleapis.com/fcm/send/test'),true);
 for(const url of ['http://127.0.0.1','https://127.0.0.1/a',
  'https://fcm.googleapis.com.evil.org/x','https://localhost/test']){
  assert.equal(validPushEndpoint(url),false,url);
 }
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'push-test-'));
 try{
  const first=createDeviceStore(dir);
  assert.throws(()=>validatePushSubscription({endpoint:'https://127.0.0.1/secret',keys:sample.keys}));
  assert.equal(first.subscribe(sample),1);
  assert.equal(first.subscribe(sample),1);
  first.updatePrefs({dueSoon:true,daysBefore:1,incomePending:false});
  first.markSent('2026-10-20:dueSoon:a');
  const next=createDeviceStore(dir);
  assert.equal(next.subscriptions().length,1);
  assert.equal(next.prefs().daysBefore,1);
  assert.equal(next.sentFor('2026-10-20:dueSoon:a'),true);
  assert.equal(next.unsubscribe(sample.endpoint),0);
  assert.equal(createDeviceStore(dir).subscriptions().length,0);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('recordatorios respetan permisos, fechas de cuotas, pagos e ingresos fijos sin exponer importes',()=>{
 const installments=loanSchedule({installmentAmount:200000,count:25,firstDueDate:'2026-09-20'});
 installments[0].plannedDate='2026-10-21';
 const state={settings:{salary:0},transactions:[],recurrences:[
  {id:'r1',type:'income',title:'Alquiler',amount:500000,startDate:'2026-10-01',paidMonths:{},category:'Extra'}
 ],purchases:[{id:'l1',title:'Préstamo',category:'Deudas y préstamos',accountId:'debit',financingType:'loan',installments}]};
 const prefs={dueSoon:true,overdue:false,incomePending:true,daysBefore:3};
 const alerts=detectReminders(state,prefs,'2026-10-20');
 assert.ok(alerts.some(x=>x.kind==='dueSoon'));
 assert.ok(alerts.some(x=>x.kind==='incomePending'));
 assert.ok(!alerts.some(x=>x.kind==='overdue'));
 assert.ok(alerts.every(x=>!x.body.includes('200000')&&!x.body.includes('Alquiler')&&!x.body.includes('Préstamo')));
 installments[0].isPaid=true;installments[0].paidDate='2026-10-20';
 state.recurrences[0].paidMonths['2026-10']=true;
 const next=detectReminders(state,{...prefs,dueSoon:false},'2026-10-20');
 assert.equal(next.length,0);
});
