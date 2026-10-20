import fs from 'node:fs';
import path from 'node:path';

export const DEFAULT_PUSH_PREFS=Object.freeze({dueSoon:true,overdue:false,incomePending:true,daysBefore:3});
export function validPushEndpoint(endpoint){
 try{
  const u=new URL(endpoint);
  if(u.protocol!=='https:'||u.port||u.username||u.password||u.hash||endpoint.length>1800)return false;
  const host=u.hostname.toLowerCase();
  return host==='fcm.googleapis.com'||host==='updates.push.services.mozilla.com'||
   host==='push.services.mozilla.com'||host.endsWith('.push.apple.com')||
   host.endsWith('.notify.windows.com')||host.endsWith('.wns.windows.com');
 }catch{return false;}
}
const isBase64Url=s=>typeof s==='string'&&/^[a-zA-Z0-9_-]+$/.test(s)&&s.length<300;
export function validatePushSubscription(input){
 if(!input||!validPushEndpoint(input.endpoint)||
   !isBase64Url(input.keys?.p256dh)||!isBase64Url(input.keys?.auth)||
   Buffer.from(input.keys.p256dh,'base64url').length!==65||
   Buffer.from(input.keys.auth,'base64url').length!==16)
   throw Object.assign(new Error('La suscripción push del navegador no es válida o el proveedor no está permitido.'),{status:400});
 return {endpoint:input.endpoint,expirationTime:null,
  keys:{p256dh:input.keys.p256dh,auth:input.keys.auth}};
}
export function createDeviceStore(dir=process.env.DATA_DIR||path.join(process.cwd(),'data')){
 const file=path.join(dir,'device-security.json');
 let loaded=false,state;
 function init(){
  if(loaded)return;loaded=true;
  state={version:1,passkeys:[],subscriptions:[],prefs:{...DEFAULT_PUSH_PREFS},sent:{},vapid:null};
  try{
   const saved=JSON.parse(fs.readFileSync(file,'utf8'));
   if(saved.version!==1||!Array.isArray(saved.passkeys)||!Array.isArray(saved.subscriptions))
    throw new Error('Versión de seguridad de dispositivos inválida');
   state={...state,...saved,prefs:{...DEFAULT_PUSH_PREFS,...saved.prefs},sent:saved.sent||{}};
  }catch(e){if(e.code!=='ENOENT')throw e;}
 }
 function save(){
  init();fs.mkdirSync(dir,{recursive:true,mode:0o700});
  const temp=file+'.'+process.pid+'.tmp';
  fs.writeFileSync(temp,JSON.stringify(state,null,2),{mode:0o600});
  fs.renameSync(temp,file);
 }
 function passkeys(){init();return state.passkeys.map(x=>({...x}));}
 function addPasskey(record){
  init();
  if(state.passkeys.some(x=>x.id===record.id))throw new Error('Esa passkey ya existe');
  if(state.passkeys.length>=10)throw new Error('Máximo 10 dispositivos registrados');
  state.passkeys.push(record);save();return record;
 }
 function updateCounter(id,counter){
  init();const entry=state.passkeys.find(x=>x.id===id);
  if(!entry)throw new Error('Dispositivo no encontrado');
  entry.counter=counter;entry.lastUsedAt=new Date().toISOString();save();
 }
 function removePasskey(id){
  init();const before=state.passkeys.length;state.passkeys=state.passkeys.filter(x=>x.id!==id);
  if(before===state.passkeys.length)throw new Error('Dispositivo no encontrado');
  save();
 }
 function prefs(){init();return {...state.prefs};}
 function updatePrefs(input){
  init();
  const patch={};for(const key of ['dueSoon','overdue','incomePending']){
   if(key in input){if(typeof input[key]!=='boolean')throw new Error('Preferencia de notificación inválida');patch[key]=input[key];}
  }
  if('daysBefore' in input){
   if(![0,1,3,7].includes(input.daysBefore))throw new Error('Días de anticipación inválidos');
   patch.daysBefore=input.daysBefore;
  }
  state.prefs={...state.prefs,...patch};save();return prefs();
 }
 function subscriptions(){init();return state.subscriptions.map(x=>({...x}));}
 function subscribe(input){
  init();const sub=validatePushSubscription(input);
  const old=state.subscriptions.find(x=>x.endpoint===sub.endpoint);
  if(old){old.keys=sub.keys;old.updatedAt=new Date().toISOString();}
  else{
   if(state.subscriptions.length>=12)throw new Error('Máximo 12 dispositivos con notificaciones');
   state.subscriptions.push({...sub,createdAt:new Date().toISOString()});
  }
  save();return state.subscriptions.length;
 }
 function unsubscribe(endpoint){
  init();if(typeof endpoint!=='string')throw new Error('Suscripción inválida');
  state.subscriptions=state.subscriptions.filter(x=>x.endpoint!==endpoint);
  save();return state.subscriptions.length;
 }
 function getVapid(generate){
  init();if(!state.vapid){state.vapid=generate();save();}
  return {...state.vapid};
 }
 function sentFor(key){init();return Boolean(state.sent[key]);}
 function markSent(key){
  init();state.sent[key]=new Date().toISOString();
  const cut=Date.now()-40*86400000;
  state.sent=Object.fromEntries(Object.entries(state.sent).filter(([,v])=>Date.parse(v)>cut));
  save();
 }
 return {passkeys,addPasskey,updateCounter,removePasskey,prefs,updatePrefs,subscriptions,subscribe,unsubscribe,
  getVapid,sentFor,markSent};
}
