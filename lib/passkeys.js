import crypto from 'node:crypto';
import {generateRegistrationOptions,verifyRegistrationResponse,
 generateAuthenticationOptions,verifyAuthenticationResponse} from '@simplewebauthn/server';

// Una sola cuenta local (misma cuenta que APP_PASSWORD); nunca se almacenan huellas ni rostros.
export function trustedAppOrigin(value){
 if(!value)return null;
 try{
  const origin=new URL(value);
  if(origin.username||origin.password||origin.search||origin.hash||origin.pathname!=='/'||
    !(origin.protocol==='https:'||(origin.protocol==='http:'&&origin.hostname==='localhost')))
    throw Error('Origen inseguro o con ruta');
  return {origin:origin.origin,rpID:origin.hostname};
 }catch{throw new Error('APP_ORIGIN debe ser la URL pública HTTPS de GastosApp, sin ruta (por ejemplo: https://tu-subdominio.ejemplo.com).');}
}
const invalid=(message,status=400)=>Object.assign(new Error(message),{status});
export function createPasskeyManager({store,appOrigin,clock=()=>Date.now()}){
 const config=trustedAppOrigin(appOrigin);
 const challenges=new Map();
 const expire=()=>{
  for(const [id,x] of challenges)if(x.until<clock())challenges.delete(id);
  if(challenges.size>60)for(const id of [...challenges.keys()].slice(0,challenges.size-60))challenges.delete(id);
 };
 const ensure=()=>{if(!config)throw invalid('Configurá APP_ORIGIN en .env para habilitar biometría.',503);};
 const start=(type,owner,options)=>{
  expire();const requestId=crypto.randomUUID();
  challenges.set(requestId,{type,owner,challenge:options.challenge,until:clock()+120000});
  return {requestId,options};
 };
 function use(type,owner,requestId){
  expire();if(typeof requestId!=='string')throw invalid('Solicitud inválida');
  const entry=challenges.get(requestId);challenges.delete(requestId);
  if(!entry||entry.type!==type||entry.owner!==owner)throw invalid('Solicitud biométrica vencida. Reintentá.');
  return entry.challenge;
 }
 async function registrationOptions(owner){
  ensure();const options=await generateRegistrationOptions({
   rpName:'GastosApp',rpID:config.rpID,userName:'Mi cuenta GastosApp',
   userID:new TextEncoder().encode('gastosapp-owner-1'),
   attestationType:'none',
   authenticatorSelection:{residentKey:'preferred',userVerification:'required'},
   excludeCredentials:store.passkeys().map(x=>({id:x.id,transports:x.transports}))
  });
  return start('register',owner,options);
 }
 async function registrationFinish(owner,{requestId,response,name}={}){
  ensure();const challenge=use('register',owner,requestId);
  const verified=await verifyRegistrationResponse({
   response,expectedChallenge:challenge,expectedOrigin:config.origin,
   expectedRPID:config.rpID,requireUserVerification:true
  });
  if(!verified.verified||!verified.registrationInfo?.credential)throw invalid('No se verificó el dispositivo');
  const {credential,credentialDeviceType,credentialBackedUp}=verified.registrationInfo;
  const record={id:credential.id,publicKey:Buffer.from(credential.publicKey).toString('base64url'),
   counter:credential.counter,transports:credential.transports||[],
   deviceType:credentialDeviceType,backedUp:credentialBackedUp,
   name:String(name||'Mi dispositivo').trim().slice(0,60)||'Mi dispositivo',
   createdAt:new Date().toISOString()};
  store.addPasskey(record);
  return {id:record.id,name:record.name};
 }
 async function authenticationOptions(){
  ensure();const keys=store.passkeys();if(!keys.length)throw invalid('Todavía no registraste un dispositivo biométrico',404);
  const options=await generateAuthenticationOptions({
   rpID:config.rpID,userVerification:'required',
   allowCredentials:keys.map(x=>({id:x.id,transports:x.transports}))
  });
  return start('login','public',options);
 }
 async function authenticationFinish({requestId,response}={}){
  ensure();const challenge=use('login','public',requestId);
  const saved=store.passkeys().find(x=>x.id===response?.id);
  if(!saved)throw invalid('Passkey no registrada en GastosApp');
  const result=await verifyAuthenticationResponse({
   response,expectedChallenge:challenge,expectedOrigin:config.origin,expectedRPID:config.rpID,
   requireUserVerification:true,
   credential:{id:saved.id,publicKey:Uint8Array.from(Buffer.from(saved.publicKey,'base64url')),
    counter:saved.counter,transports:saved.transports}
  });
  if(!result.verified)throw invalid('No se pudo verificar la firma biométrica');
  store.updateCounter(saved.id,result.authenticationInfo.newCounter);
  return {id:saved.id,name:saved.name};
 }
 return {ready:Boolean(config),publicOrigin:config?.origin||null,publicRpId:config?.rpID||null,registrationOptions,registrationFinish,authenticationOptions,
  authenticationFinish,list:()=>store.passkeys().map(x=>({id:x.id,name:x.name,createdAt:x.createdAt,lastUsedAt:x.lastUsedAt||null})),
  remove:id=>store.removePasskey(id)};
}
