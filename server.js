import express from 'express';
import compression from 'compression';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { store } from './db.js';
import { interpret, isoDay, monthOf } from './lib/engine.js';
import { aiChatTurn } from './lib/ai-chat.js';
import { VOICES,callOpenAI,makeSpeechBody,publicError,diagnostics } from './lib/openai-health.js';

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
  catch(e){const detail=publicError(e);console.error('API',req.path,detail.code,detail.upstreamStatus||'',detail.error);
    if(!res.headersSent)res.status(e.status||400).json(detail);}};
app.get('/api/state',wrap(req=>store.snapshot(req.query.month||monthOf(isoDay(new Date())))));
app.patch('/api/settings',wrap(req=>store.settings(req.body)));
app.post('/api/accounts',wrap(req=>store.addAccount(req.body)));
app.patch('/api/accounts/:id',wrap(req=>store.editAccount(req.params.id,req.body)));
app.delete('/api/accounts/:id',wrap(req=>store.deleteAccount(req.params.id)));
app.post('/api/transactions',wrap(req=>store.add(req.body)));
app.post('/api/transactions/batch',wrap(req=>store.addBatch(req.body.transactions,req.body.requestId)));
app.patch('/api/transactions/:id',wrap(req=>store.editTransaction(req.params.id,req.body)));
app.patch('/api/paid/:id',wrap(req=>store.setPaid(req.params.id,req.body.isPaid)));
app.delete('/api/transactions/:id',wrap(req=>store.remove(req.params.id)));
app.get('/api/export',wrap(()=>store.export()));
// No se expone jamás la clave. Los tests reales a OpenAI consumen créditos mínimos.
app.get('/api/ai/config',wrap(()=>({
  configured:Boolean(process.env.OPENAI_API_KEY),
  nlu:process.env.OPENAI_NLU_MODEL||'gpt-4o-mini',
  stt:process.env.OPENAI_STT_MODEL||'gpt-4o-mini-transcribe',
  tts:process.env.OPENAI_TTS_MODEL||'gpt-4o-mini-tts',
  defaultVoice:process.env.OPENAI_TTS_VOICE||'marin',
  voices:VOICES
})));
app.post('/api/ai/diagnostics/:service',limited(4),wrap(async req=>{
  const type=String(req.params.service);
  const model=type==='nlu'?(process.env.OPENAI_NLU_MODEL||'gpt-4o-mini'):
    type==='stt'?(process.env.OPENAI_STT_MODEL||'gpt-4o-mini-transcribe'):
    (process.env.OPENAI_TTS_MODEL||'gpt-4o-mini-tts');
  const voice=VOICES.includes(req.body?.voice)?req.body.voice:(process.env.OPENAI_TTS_VOICE||'marin');
  return diagnostics(type,{key:process.env.OPENAI_API_KEY,model,voice});
}));

async function aiInterpret(text, accounts, draft) {
  if(!process.env.OPENAI_API_KEY)return draft;
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),16000);
  try{
    const prompt='Interpretá español rioplatense y lunfardo para registrar finanzas. Respondé SOLO JSON con campos type (income|expense),title,amount,date (YYYY-MM-DD),dueDate (YYYY-MM-DD o null),category,installmentCount,mentionedMethod,isPaid,isRecurring. date es la fecha de registro u operación, dueDate es el vencimiento o día en que se pagará. Frases como "a fin de mes", "lo pago el 25" son vencimientos futuros y NO significan pago realizado. "pago único" significa una sola cuota, no que esté pagado. "cargar a Juanma" significa gasto a nombre de Juanma. Nunca confundir fecha de registro con vencimiento. "lucas"=1000 pesos, "palos"=1000000 pesos, "gambas"=100 pesos. El reconocimiento de voz separa miles: "890 000" significa 890000 ARS y "1 200 000" significa 1200000 ARS. "Para cancelar el crédito" es un gasto de deuda/préstamo, NO pago con tarjeta de crédito ni medio de pago; no inventar tarjeta ni medio si no se menciona explícitamente. Categoría Deudas y préstamos. "Pago de crédito · Juanma" es un título apropiado cuando dice "a Juanma para cancelar el crédito"; "6 cuotas de 20 mil" es importe POR CUOTA, "120 mil en 6 cuotas" es monto TOTAL. No inventes datos. Fecha actual: '+isoDay(new Date())+'. Medios disponibles: '+accounts.map(a=>a.name).join(', ')+'.';
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
    if(Number.isFinite(Number(result.amount))&&Number(result.amount)>0){
      const aiAmount=Math.round(Number(result.amount)*100)/100;
      // No degradar miles reconocidos localmente por una interpretación dudosa de la IA.
      if(draft.amount === null || aiAmount === draft.amount) updated.amount=aiAmount;
      else if(/\b\d{1,3}(?:[ \u00a0\u202f]+\d{3})+\b/.test(text)){
        updated.questions.push('La IA propuso otro importe; se conservó el valor completo detectado en el dictado.');
      }else updated.amount=aiAmount;
    }
    if(/^\d{4}-\d{2}-\d{2}$/.test(result.date||''))updated.date=result.date;
    if(result.dueDate===null || /^\d{4}-\d{2}-\d{2}$/.test(result.dueDate||''))updated.dueDate=result.dueDate;
    if(typeof result.category==='string')updated.category=result.category.slice(0,60);
    if(Number.isInteger(result.installmentCount)&&result.installmentCount>=1&&result.installmentCount<=60)
      updated.installmentCount=result.installmentCount;
    if(typeof result.isPaid==='boolean')updated.isPaid=result.isPaid;
    if(typeof result.isRecurring==='boolean')updated.isRecurring=result.isRecurring;
    // El propósito de cancelar una deuda no es una instrucción de usar una tarjeta.
    if(/\b(?:cancelar|saldar|liquidar)\b.{0,55}\b(?:cr[eé]dito|pr[eé]stamo|deuda)\b/i.test(text) &&
      !/\b(?:con (?:la )?tarjeta|con (?:la )?visa|con (?:la )?master|con d[eé]bito|con mercado pago|con mp)\b/i.test(text)){
      updated.accountId=null;updated.mentionedMethod=null;
      updated.category='Deudas y préstamos';
    }
    if(updated.dueDate && !draft.isPaid && !/\b(ya pagu[eé]|lo pagu[eé]|ya est[aá] pagado)\b/i.test(text))
      updated.isPaid=false;
    if(updated.dueDate && /\b(a fin de mes|fin de mes|fin del mes|lo pago|voy a pagar|vence|vencimiento)\b/i.test(text) &&
       !/\b(ya pagu[eé]|ya est[aá] pagado|lo pagu[eé])\b/i.test(text))updated.isPaid=false;
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
app.post('/api/chat/turn',limited(20),wrap(async req=>{
  const accounts=store.snapshot().accounts;
  const items=Array.isArray(req.body?.items)?req.body.items:[];
  const phase=['collect','confirm','edit'].includes(req.body?.phase)?req.body.phase:'collect';
  return aiChatTurn({
    text:req.body?.text,items,accounts,phase,
    key:process.env.OPENAI_API_KEY,model:process.env.OPENAI_NLU_MODEL||'gpt-4o-mini'
  });
}));
app.post('/api/chat/speech',limited(16),async(req,res)=>{
  const phrase=String(req.body?.text||'').trim();
  if(!phrase||phrase.length>620)return res.status(400).json({error:'Texto de voz demasiado extenso (máximo 620 caracteres).',code:'invalid_text'});
  try{
    const chosen=VOICES.includes(req.body?.voice)?req.body.voice:(process.env.OPENAI_TTS_VOICE||'marin');
    const response=await callOpenAI('https://api.openai.com/v1/audio/speech',{
      key:process.env.OPENAI_API_KEY,
      body:makeSpeechBody({text:phrase,voice:chosen,model:process.env.OPENAI_TTS_MODEL||'gpt-4o-mini-tts'}),
      headers:{'Content-Type':'application/json'},timeoutMs:30000
    });
    const bytes=Buffer.from(await response.arrayBuffer());
    if(bytes.length<100)throw Object.assign(new Error('OpenAI devolvió audio vacío.'),{status:502,code:'empty_audio'});
    if(bytes.length>3_000_000)throw Object.assign(new Error('Audio generado demasiado grande.'),{status:502,code:'audio_too_large'});
    res.setHeader('Content-Type','audio/mpeg');res.setHeader('Cache-Control','private, no-store');res.send(bytes);
  }catch(e){const problem=publicError(e);console.error('TTS',problem.code,problem.upstreamStatus||'',problem.error);
    if(!res.headersSent)res.status(e.status||502).json(problem);}
});
app.post('/api/voice/transcribe',limited(10),
  express.raw({type:['audio/webm','audio/mp4','audio/mpeg','audio/ogg','audio/wav','audio/x-wav','application/octet-stream'],limit:'8mb'}),
  wrap(async req=>{
    if(!process.env.OPENAI_API_KEY)throw Object.assign(new Error('Falta OPENAI_API_KEY en el contenedor.'),{status:503,code:'missing_key',hint:'Configurar .env y recrear servicio.'});
    const blob=req.body;
    const type=String(req.headers['content-type']||'').split(';')[0].toLowerCase();
    if(!Buffer.isBuffer(blob))throw Object.assign(new Error('El servidor no recibió audio. El navegador envió un tipo MIME no compatible: '+(type||'sin tipo')),{status:415,code:'unsupported_audio',hint:'Probá otro navegador o cambiá el formato de grabación.'});
    if(blob.length<500)throw Object.assign(new Error('La grabación fue demasiado corta o vacía ('+blob.length+' bytes).'),{status:400,code:'empty_audio',hint:'Mantené el micrófono activo al menos un segundo, hablá, y luego detené la grabación.'});
    const ext=type==='audio/mp4'?'mp4':type==='audio/ogg'?'ogg':type==='audio/wav'||type==='audio/x-wav'?'wav':
      type==='audio/mpeg'?'mp3':'webm';
    const form=new FormData();
    form.set('file',new Blob([blob],{type:type||'audio/webm'}),'dictado.'+ext);
    form.set('model',process.env.OPENAI_STT_MODEL||'gpt-4o-mini-transcribe');
    form.set('language','es');
    form.set('prompt','Habla argentina sobre dinero, cuotas, sueldos, préstamos, nombres de personas y empresas. Mantener cifras completas: 980000, 160000, 300000; Juana, Personal, Mercado Pago.');
    const r=await callOpenAI('https://api.openai.com/v1/audio/transcriptions',{
      key:process.env.OPENAI_API_KEY,body:form,timeoutMs:35000
    });
    const result=await r.json();
    if(typeof result.text!=='string')throw Object.assign(new Error('OpenAI respondió HTTP 200 pero sin texto de transcripción.'),{status:502,code:'missing_transcript'});
    if(!result.text.trim())throw Object.assign(new Error('OpenAI respondió HTTP 200 pero no detectó palabras en la grabación.'),{status:422,code:'no_speech',hint:'Verificá que el micrófono correcto esté activo y hablá un poco más cerca.'});
    return {text:result.text,model:process.env.OPENAI_STT_MODEL||'gpt-4o-mini-transcribe',httpStatus:200};
  })
);

app.use(express.static(path.join(path.dirname(fileURLToPath(import.meta.url)),'public'),{maxAge:'15m'}));
app.get('*',(_req,res)=>res.sendFile(path.join(path.dirname(fileURLToPath(import.meta.url)),'public','index.html')));
app.use((err,_req,res,_next)=>res.status(err.status||500).json({error:err.type==='entity.too.large'?'Audio o solicitud demasiado grande':'Error al procesar solicitud'}));
app.listen(port,'0.0.0.0',()=>console.log('GastosApp v2 escuchando en puerto '+port));