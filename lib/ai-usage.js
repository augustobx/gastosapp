import fs from 'node:fs';
import path from 'node:path';
// USD por millón de tokens, tarifa estándar de pago publicada 20/10/2026.
// NO es la factura ni el saldo del proveedor. Revisar vigencias en 2027.
const pricing={
 'gemini-3.8-flash':{input:0.75,output:3.75,validUntil:'2026-12-31'},
 'gemini-3.6-flash':{input:0.75,output:3.75,validUntil:'2026-12-31'},
 'gemini-3.5-flash-lite':{input:0.30,output:2.50},
 'gemini-3.8-flash-tts':{input:0.50,output:9,validUntil:'2026-12-31'},
 'gemini-3.8-flash-lite-tts':{input:0.50,output:6,validUntil:'2026-12-31'},
 'gpt-4o-mini':{input:0.15,output:0.60},
 'gpt-4o-mini-transcribe':{input:1.25,output:5},
 'gpt-4o-mini-tts':{input:0.60,output:12}
};
const asCount=value=>value===null||value===undefined||value===''?null:Number.isSafeInteger(Number(value))&&Number(value)>=0?Number(value):null;
const count=(o,k)=>asCount(o?.[k]);
const modality=(rows,name)=>Array.isArray(rows)?rows.filter(x=>x.modality===name).reduce((n,x)=>n+(asCount(x.tokens)||0),0):null;
export function tokenUsage(provider,json,service='nlu'){
 if(!json)return null;
 if(provider==='openai'){
  const u=json.usage;
  if(!u)return null;
  return {input:count(u,'prompt_tokens')??count(u,'input_tokens'),
   output:count(u,'completion_tokens')??count(u,'output_tokens'),
   thought:count(u.completion_tokens_details,'reasoning_tokens')||0,
   cached:count(u.prompt_tokens_details,'cached_tokens')||0};
 }
 const u=json.usageMetadata||json.usage;
 if(!u)return null;
 if('total_input_tokens' in u||'total_output_tokens' in u){
  return {input:count(u,'total_input_tokens'),output:count(u,'total_output_tokens'),
   thought:count(u,'total_thought_tokens')||0,cached:count(u,'total_cached_tokens')||0,
   audioOutput:modality(u.output_tokens_by_modality,'audio')};
 }
 return {input:count(u,'promptTokenCount'),output:(count(u,'candidatesTokenCount')??0)+(count(u,'thoughtsTokenCount')||0),
  thought:count(u,'thoughtsTokenCount')||0,cached:count(u,'cachedContentTokenCount')||0};
}
export function errorCategory(provider,status,code='',message=''){
 const c=String(code).toLowerCase(),m=String(message).toLowerCase();
 if((status===429||status===402)&&(/credit_balance_exhausted|insufficient_quota|insufficient_funds|no credits|no credit|balance|billing|payment required|budget/.test(c+' '+m)))
  return {kind:'credits',title:'Sin créditos o límite de facturación',advice:provider==='openai'?
    'Revisá saldo, Billing y límites de gasto en OpenAI Platform.':
    'Revisá facturación, presupuesto y cuota en Google AI Studio.'};
 if(status===429&&/free tier|requests per day|daily limit|per day|daily quota/.test(c+' '+m))
  return {kind:'free_quota',title:'Cuota gratuita diaria agotada',
   advice:'Esperá la renovación de la cuota gratuita o habilitá facturación si necesitás más uso.'};
 if(status===429&&/quota|exhausted|resource_exhausted/.test(c+' '+m))
  return {kind:'quota',title:'Cuota del proveedor agotada',advice:'Revisá cuotas, límites y facturación del proyecto.'};
 if(status===429)return {kind:'rate_limit',title:'Límite temporal de solicitudes',advice:'Reducí la frecuencia y esperá antes de intentar otra vez.'};
 if(status===503||c==='unavailable')return {kind:'unavailable',title:'Modelo temporalmente saturado',
  advice:'El proveedor informa demanda elevada. Reintentá más tarde.'};
 if(status===401||status===403)return {kind:'permissions',title:'Clave o permiso de API',advice:'Revisá la clave y permisos del proyecto.'};
 if(status>=500)return {kind:'service',title:'Falla temporal del proveedor',advice:'Reintentá más tarde o revisá el estado del servicio.'};
 return {kind:'other',title:'Error de la solicitud',advice:'Revisá los diagnósticos por modelo.'};
}
export function paidEquivalentUsd(model,usage){
 const rate=pricing[model];if(!rate||!usage||usage.input===null||usage.output===null)return null;
 // Los tokens en caché se valorizan a tarifa de entrada normal: estimación conservadora.
 return (usage.input*rate.input+usage.output*rate.output)/1e6;
}
const dayAR=date=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Argentina/Buenos_Aires',
 year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
const safeModel=s=>String(s||'desconocido').replace(/[^a-zA-Z0-9._-]/g,'').slice(0,90);
export function createUsageLedger({dir=process.env.DATA_DIR||path.join(process.cwd(),'data'),now=()=>new Date()}={}){
 const filename=path.join(dir,'ai-usage.json');let loaded=false,state;
 const init=()=>{
  if(loaded)return;loaded=true;state={version:1,startedAt:now().toISOString(),rows:{},recentIssues:[]};
  try{const old=JSON.parse(fs.readFileSync(filename,'utf8'));if(old.version===1&&old.rows&&typeof old.rows==='object')state=old;}
  catch(e){if(e.code!=='ENOENT')console.error('Uso IA: no se pudo leer el historial',e.code||e.message);}
 };
 const save=()=>{
  try{
   fs.mkdirSync(dir,{recursive:true,mode:0o700});
   const tmp=filename+'.'+process.pid+'.tmp';
   fs.writeFileSync(tmp,JSON.stringify(state),{mode:0o600});
   fs.renameSync(tmp,filename);
  }catch(e){console.error('Uso IA: error al guardar contadores',e.code||e.message);}
 };
 function record({provider,service,model,usage=null,error=null}){
  init();
  if(!['gemini','openai'].includes(provider))return;
  const date=dayAR(now()),safe=tokenUsage(provider,usage,service);
  const cleanModel=safeModel(model);
  const key=[date,provider,cleanModel,service].join('|');
  const row=state.rows[key]||{day:date,provider,model:cleanModel,service,requests:0,success:0,
   failed:0,metered:0,unmetered:0,unpriced:0,input:0,output:0,thought:0,cached:0,estimatedUsd:0};
  row.requests++;
  if(error){
   row.failed++;
   const status=Number(error.upstreamStatus||error.status||0),code=String(error.providerCode||error.code||'');
   const classification=errorCategory(provider,status,code,error.message);
   const retry=String(error.message||'').match(/(?:retry in|try again in|reintenta en)\s*([\dhms ]{1,32})/i)?.[1]?.trim();
   state.recentIssues.unshift({date:now().toISOString(),provider,model:cleanModel,service,
    status,code:code.slice(0,60),...classification,...(retry?{retryAfter:retry}:{})});
   state.recentIssues=state.recentIssues.slice(0,25);
  }else{
   row.success++;
   if(safe&&safe.input!==null&&safe.output!==null){
    row.metered++;row.input+=safe.input;row.output+=safe.output;
    row.thought+=safe.thought||0;row.cached+=safe.cached||0;
    const usd=paidEquivalentUsd(cleanModel,safe);
    if(usd!==null)row.estimatedUsd+=usd;else row.unpriced++;
   }else row.unmetered++;
  }
  state.rows[key]=row;save();
 }
 function report(period='month'){
  init();
  const today=dayAR(now()),cut=period==='today'?today:period==='all'?'':today.slice(0,7);
  const rows=Object.values(state.rows).filter(r=>period==='all'||(period==='today'?r.day===cut:r.day.startsWith(cut)))
    .sort((a,b)=>b.day.localeCompare(a.day)||a.provider.localeCompare(b.provider)||a.model.localeCompare(b.model));
  const summary=rows.reduce((x,r)=>{for(const k of ['requests','success','failed','metered','unmetered','unpriced','input','output','thought','estimatedUsd'])x[k]+=r[k]||0;return x;},
   {requests:0,success:0,failed:0,metered:0,unmetered:0,unpriced:0,input:0,output:0,thought:0,estimatedUsd:0});
  const totals={};
  for(const row of rows){
   const k=[row.provider,row.model,row.service].join('|'),prev=totals[k]||
    {provider:row.provider,model:row.model,service:row.service,requests:0,success:0,failed:0,metered:0,unmetered:0,input:0,output:0,thought:0,estimatedUsd:0};
   for(const field of ['requests','success','failed','metered','unmetered','input','output','thought','estimatedUsd'])prev[field]+=row[field]||0;
   totals[k]=prev;
  }
  return {since:state.startedAt,period,summary,models:Object.values(totals).sort((a,b)=>b.requests-a.requests),
   recentIssues:state.recentIssues.slice(0,8),pricingMode:'paid_equivalent_not_actual_bill',
   priceAsOf:'2026-10-20',currency:'USD'};
 }
 return {record,report};
}
export const usageLedger=createUsageLedger();
