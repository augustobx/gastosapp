import test from 'node:test';
import assert from 'node:assert/strict';
import {createPushService} from '../lib/push-service.js';
import {trustedAppOrigin} from '../lib/passkeys.js';

test('WebAuthn RP ID and expected origin are fixed by APP_ORIGIN, not by client Host headers',()=>{
 const a=trustedAppOrigin('https://gastos.ejemplo.com');
 assert.deepEqual(a,{origin:'https://gastos.ejemplo.com',rpID:'gastos.ejemplo.com'});
 assert.notEqual(a.origin,'https://ejemplo.com');
 assert.notEqual(a.rpID,'ejemplo.com');
});
test('cross-device push test sends to every subscription even outside reminder hours, without exposing endpoints',async()=>{
 const endpoints=['https://fcm.googleapis.com/a','https://web.push.apple.com/b'];
 const entries=endpoints.map(endpoint=>({endpoint,keys:{p256dh:'example',auth:'example'}}));
 const sent=[],removed=[];
 const store={
  subscriptions:()=>[...entries],
  getVapid:()=>({publicKey:'public-test',privateKey:'private-test'}),
  unsubscribe:ep=>{removed.push(ep);const i=entries.findIndex(e=>e.endpoint===ep);if(i>=0)entries.splice(i,1);}
 };
 const push={
  generateVAPIDKeys:()=>({publicKey:'public-test',privateKey:'private-test'}),
  setVapidDetails:()=>{},
  sendNotification:async(sub,payload)=>{
   sent.push({endpoint:sub.endpoint,payload:JSON.parse(payload)});
   if(sub.endpoint.endsWith('/b'))throw Object.assign(new Error('Subscription expired'),{statusCode:410});
   return {statusCode:201};
  }
 };
 const svc=createPushService({store,webpush:push,appOrigin:'https://gastos.ejemplo.com',
  clock:()=>new Date('2026-10-21T03:08:00Z'),financialState:()=>({})});
 const result=await svc.testAllNotifications();
 assert.deepEqual(result,{total:2,accepted:1,failed:1,expired:1});
 assert.equal(sent.length,2);
 assert.deepEqual(removed,[endpoints[1]]);
 for(const entry of sent){
  assert.match(entry.payload.title,/GastosApp/);
  assert.doesNotMatch(JSON.stringify(entry.payload),/200000|password|credit|api.?key/i);
 }
});
test('cross-device test rejects sending without a registered phone or desktop',async()=>{
 const svc=createPushService({store:{subscriptions:()=>[]},webpush:{},appOrigin:'https://gastos.ejemplo.com',
  financialState:()=>({})});
 await assert.rejects(()=>svc.testAllNotifications(),err=>err.status===409&&/Activá/.test(err.message));
});
