import express from 'express';
import compression from 'compression';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { store } from './db.js';
import { interpret, isoDay, monthOf } from './lib/engine.js';

const port=Number(process.env.PORT||3000);
const password=process.env.APP_PASSWORD||'';
if(process.env.NODE_ENV==='production' && password.length<12) {
  console.error('APP_PASSWORD debe contener al menos 12 caracteres en producción.');
  process.exit(1);
}
const app=express();
app.disable('x-powered-by');
app.set('trust proxy',1);
app.use(compression());
app.use(express.json({limit:'128kb'}));
const sessions=new Map();
const attempts=new Map();
const highCostAttempts=new Map();
function limited(maxPerMinute){return (req,res,next)=>{
  const key=rateKey(req)+':'+req.path,now=Date.now();
  let a=highCostAttempts.get(key);
  if(!a||a.until<now)a={count:0,until:now+60000};
  if(a.count>=maxPerMinute)return res.status(429).json({error:'Demasiadas solicitudes. Probá en un minuto.'});
  a.count++;highCostAttempts.set(key,a);next();
};}
const sha=x=>crypto.createHash('sha256').update(String(x)).digest();
const same=(a,b)=>crypto.timingSafeEqual(sha(a),sha(b));
const rateKey=req=>req.ip||'unknown';
function cookies(req){
  return Object.fromEntries(String(req.headers.cookie||'').split(';').map(x=>x.trim()).filter(x=>x.includes('=')).map(x=>{const p=x.indexOf('=');return [x.slice(0,p),x.slice(p+1)];}));
}
function setSessionCookie(req,res,token,age){
  const secure=req.secure?'; Secure':'';
  res.setHeader('Set-Cookie', 'gastos_session='+token+'; HttpOnly; SameSite=Lax; Path=/; Max-Age='+age+secure);
}
function auth(req){
  if(!password && process.env.NODE_ENV!=='production')return true;
  const token=cookies(req).gastos_session;
  if(!token)return false;
  const s=sessions.get(sha(token).toString('hex'));
  if(!s)return false;
  if(s<Date.now()){sessions.delete(sha(token).toString('hex'));return false;}
  return true;
}
function guardOrigin(req,res,next){
  if(['POST','PUT','PATCH','DELETE'].includes(req.method)){
    const origin=req.headers.origin;
    if(origin){
      try{
        const expected=req.get('x-forwarded-host')||req.get('host');
        if(new URL(origin).host!==expected) return res.status(403).json({error:'Origen no permitido'});
      }catch{return res.status(403).json({error:'Origen inválido'});}
    }
  }
  next();
}
app.use('/api',guardOrigin);
app.get('/api/health',(_req,res)=>res.json({status:'ok',app:'gastosapp-v2'}));
app.get('/api/session',(req,res)=>res.json({authenticated:auth(req),aiEnabled:Boolean(process.env.OPENAI_API_KEY)}));
app.post('/api/login',(req,res)=>{
  const ip=rateKey(req),now=Date.now(), record=attempts.get(ip)||{count:0,until:now+900000};
  if(record.until<now){record.count=0;record.until=now+900000;}
  if(record.count>=8)return res.status(429).json({error:'Demasiados intentos. Intentá más tarde.'});
  if((password && !same(req.body?.password||'',password)) || (!password && process.env.NODE_ENV==='production')){
    record.count++;attempts.set(ip,record);return res.status(401).json({error:'Contraseña incorrecta'});
  }
  attempts.delete(ip);
  const token=crypto.randomBytes(32).toString('hex');
  sessions.set(sha(token).toString('hex'),Date.now()+30*86400000);
  setSessionCookie(req,res,token,30*86400);
  res.json({ok:true});
});
app.post('/api/logout',(req,res)=>{
  const token=cookies(req).gastos_session;if(token)sessions.delete(sha(token).toString('hex'));
  setSessionCookie(req,res,'',0);res.json({ok:true});
});
app.use('/api',(req,res,next)=>auth(req)?next():res.status(401).json({error:'Sesión requerida'}));

const wrap=fn=>async(req,res)=>{try{const value=await fn(req,res);if(!res.headersSent)res.json({ok:true,data:value});}
  catch(e){console.error('API',req.path,e.message);if(!res.headersSent)res.status(e.status||400).json({error:e.message||'Error inesperado'});}};
app.get('/api/state',wrap(req=>store.snapshot(req.query.month||monthOf(isoDay(new Date())))));
app.patch('/api/settings',wrap(req=>store.settings(req.body)));
app.post('/api/accounts',wrap(req=>store.addAccount(req.body)));
app.patch('/api/accounts/:id',wrap(req=>store.editAccount(req.params.id,req.body)));
app.delete('/api/accounts/:id',wrap(req=>store.deleteAccount(req.params.id)));
app.post('/api/transactions',wrap(req=>store.add(req.body)));
app.patch('/api/transactions/:id',wrap(req=>store.editTransaction(req.params.id,req.body)));
app.patch('/api/paid/:id',wrap(req=>store.setPaid(req.params.id,req.body.isPaid)));
app.delete('/api/transactions/:id',wrap(req=>store.remove(req.params.id)));
app.get('/api/export',wrap(()=>store.export()));

async function aiInterpret(text, accounts, draft) {
  if(!process.env.OPENAI_API_KEY)return draft;
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),16000);
  try{
    const prompt='Interpretá español rioplatense y lunfardo para registrar finanzas. Respondé SOLO JSON con campos type (income|expense),title,amount,date (YYYY-MM-DD),category,installmentCount,mentionedMethod,isPaid,isRecurring. "lucas"=1000 pesos, "palos"=1000000 pesos, "gambas"=100 pesos; "6 cuotas de 20 mil" es importe POR CUOTA, "120 mil en 6 cuotas" es monto TOTAL. No inventes datos. Fecha actual: '+isoDay(new Date())+'. Medios disponibles: '+accounts.map(a=>a.name).join(', ')+'.';
    const response=await fetch('https://api.openai.com/v1/chat/completions',{
      method:'POST',signal:controller.signal,
      headers:{Authorization:'Bearer '+process.env.OPENAI_API_KEY,'Content-Type':'application/json'},
      body:JSON.stringify({model:process.env.OPENAI_NLU_MODEL||'gpt-4o-mini',temperature:0,
        response_format:{type:'json_object'},messages:[{role:'system',content:prompt},{role:'user',content:text}]})
    });
    if(!response.ok)throw new Error('No se pudo procesar con IA');
    const payload=await response.json();
    const result=JSON.parse(payload.choices?.[0]?.message?.content||'{}');
    const updated={...draft};
    if(['income','expense'].includes(result.type))updated.type=result.type;
    if(typeof result.title==='string'&&result.title.trim())updated.title=result.title.trim().slice(0,140);
    if(Number.isFinite(Number(result.amount))&&Number(result.amount)>0)updated.amount=Math.round(Number(result.amount)*100)/100;
    if(/^\d{4}-\d{2}-\d{2}$/.test(result.date||''))updated.date=result.date;
    if(typeof result.category==='string')updated.category=result.category.slice(0,60);
    if(Number.isInteger(result.installmentCount)&&result.installmentCount>=1&&result.installmentCount<=60)
      updated.installmentCount=result.installmentCount;
    if(typeof result.isPaid==='boolean')updated.isPaid=result.isPaid;
    if(typeof result.isRecurring==='boolean')updated.isRecurring=result.isRecurring;
    if(typeof result.mentionedMethod==='string'&&result.mentionedMethod.trim()){
      const matched=accounts.find(a=>a.name.toLowerCase().includes(result.mentionedMethod.toLowerCase())||
        result.mentionedMethod.toLowerCase().includes(a.name.toLowerCase()));
      if(matched){updated.accountId=matched.id;updated.mentionedMethod=result.mentionedMethod;}
    }
    if(updated.amount!==draft.amount || updated.type!==draft.type || updated.installmentCount!==draft.installmentCount)
      updated.questions=[...updated.questions,'Revisá los datos sugeridos por IA antes de confirmar.'];
    updated.confidence='review';
    return updated;
  }finally{clearTimeout(timeout);}
}
app.post('/api/interpret',limited(30),wrap(async req=>{
  const text=String(req.body.text||'');
  const {accounts}=store.snapshot();
  let draft=interpret(text,accounts);
  if(req.body.useAI===true && process.env.OPENAI_API_KEY){
    try{draft=await aiInterpret(text,accounts,draft);}
    catch(e){draft.questions.push('IA no disponible; se utilizó el análisis local.');}
  }
  return draft;
}));
app.post('/api/voice/transcribe',limited(10),express.raw({type:['audio/webm','audio/mp4','audio/mpeg','audio/ogg','audio/wav','application/octet-stream'],limit:'8mb'}),wrap(async req=>{
  if(!process.env.OPENAI_API_KEY)throw new Error('Configurá OPENAI_API_KEY para transcribir audio; también podés usar el dictado nativo del navegador.');
  if(!Buffer.isBuffer(req.body)||req.body.length<100)throw new Error('Audio vacío');
  const type=String(req.headers['content-type']||'audio/webm').split(';')[0];
  const ext=type.includes('mp4')?'mp4':type.includes('ogg')?'ogg':type.includes('wav')?'wav':type.includes('mpeg')?'mp3':'webm';
  const form=new FormData();
  form.set('file',new Blob([req.body],{type}), 'gasto.'+ext);
  form.set('model',process.env.OPENAI_STT_MODEL||'gpt-4o-mini-transcribe');
  form.set('language','es');
  form.set('prompt','Español de Argentina. Gastos, ingresos, tarjeta Visa, Mastercard, Mercado Pago, MP, cuotas, lucas, palos, guita, efectivo, transferencia.');
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),30000);
  try {
    const r=await fetch('https://api.openai.com/v1/audio/transcriptions',{method:'POST',
      headers:{Authorization:'Bearer '+process.env.OPENAI_API_KEY},body:form,signal:controller.signal});
    if(!r.ok)throw new Error('La transcripción no pudo completarse');
    const j=await r.json();return {text:String(j.text||'')};
  } finally{clearTimeout(timeout);}
}));

app.use(express.static(path.join(path.dirname(fileURLToPath(import.meta.url)),'public'),{maxAge:'15m'}));
app.get('*',(_req,res)=>res.sendFile(path.join(path.dirname(fileURLToPath(import.meta.url)),'public','index.html')));
app.use((err,_req,res,_next)=>res.status(err.status||500).json({error:err.type==='entity.too.large'?'Audio o solicitud demasiado grande':'Error al procesar solicitud'}));
app.listen(port,'0.0.0.0',()=>console.log('GastosApp v2 escuchando en puerto '+port));