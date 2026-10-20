import test from 'node:test';
import assert from 'node:assert/strict';
import {GEMINI_MODELS,GEMINI_VOICES,geminiChatTurn,geminiTranscribe,geminiSpeech,geminiNetwork,geminiDiagnostic,googleError,googleRequest,thinkingConfigFor,modelText} from '../lib/gemini.js';
import {silentWav} from '../lib/openai-health.js';
const now='2026-10-19';
const account=[{id:'visa',name:'Visa',kind:'credit'}];
const item=(title,amount)=>({type:'expense',title,amount,date:now,dueDate:'2026-10-31',category:'Otros',
 accountId:null,installmentCount:1,isPaid:false,isRecurring:false,notes:''});
const ok=(json)=>({ok:true,status:200,json:async()=>json,headers:{get:()=>null}});
const output=content=>({candidates:[{content:{parts:[{text:content}]}}]});
test('códigos de modelo Gemini 3.8 verificados para chat, audio y voz',()=>{
 assert.equal(GEMINI_MODELS.nlu,'gemini-3.8-flash');
 assert.equal(GEMINI_MODELS.stt,'gemini-3.8-flash');
 assert.equal(GEMINI_MODELS.tts,'gemini-3.8-flash-tts');
 assert.equal(GEMINI_MODELS.ttsLite,'gemini-3.8-flash-lite-tts');
 assert.ok(GEMINI_VOICES.includes('Kore'));
});
test('Gemini structured JSON permite separar tres gastos en una frase',async()=>{
 let req;
 const fetcher=async(url,opts)=>{
  req={url,opts};
  return ok(output(JSON.stringify({action:'add',reply:'Anoté tres gastos.',items:[
   item('Juana',980000),item('Personal',160000),item('Supermercado',300000)],index:null})));
 };
 const got=await geminiChatTurn({text:'980000 Juana 160000 Personal 300000 super, fin de mes',
  key:'TEST-KEY',accounts:account,items:[],phase:'collect',today:now,fetcher});
 assert.equal(got.items.length,3);
 assert.equal(got.items.reduce((n,x)=>n+x.amount,0),1440000);
 assert.ok(got.items.every(x=>x.dueDate==='2026-10-31'&&!x.isPaid&&!x.accountId));
 assert.match(req.url,/gemini-3\.8-flash:generateContent/);
 assert.equal(req.opts.headers['x-goog-api-key'],'TEST-KEY');
 const b=JSON.parse(req.opts.body);
 assert.equal(b.generationConfig.responseFormat.text.mimeType,'application/json');
 assert.equal(b.generationConfig.thinkingConfig.thinkingLevel,'low');
 assert.equal(b.generationConfig.responseFormat.text.schema.type,'object');
 assert.ok(!JSON.stringify(req).includes('Bearer TEST-KEY'));
});
test('Gemini STT usa audio inline con mimeType real y base64',async()=>{
 const pcm=silentWav(1.5);
 const mock=async(_url,opts)=>{
  const b=JSON.parse(opts.body),part=b.contents[0].parts[1].inlineData;
  assert.equal(part.mimeType,'audio/wav');
  assert.equal(b.generationConfig.thinkingConfig.thinkingLevel,'low');
  assert.deepEqual(Buffer.from(part.data,'base64'),pcm);
  return ok(output('980 mil a Juana y 160 mil a Personal'));
 };
 const result=await geminiTranscribe({bytes:pcm,mime:'audio/wav',key:'TEST-KEY',fetcher:mock});
 assert.equal(result.httpStatus,200);
 assert.match(result.text,/Juana/);
});
test('Gemini TTS Interactions devuelve WAV real y usa voz Kore',async()=>{
 const wav=silentWav(1.25);
 let sent;
 const fetcher=async(url,opts)=>{
  sent=JSON.parse(opts.body);
  assert.equal(url,'https://generativelanguage.googleapis.com/v1beta/interactions');
  return ok({steps:[{type:'model_output',content:[{type:'audio',data:wav.toString('base64')}]}]});
 };
 const result=await geminiSpeech({text:'Hola',key:'TEST-KEY',voice:'Kore',fetcher});
 assert.equal(sent.response_format.type,'audio');
 assert.equal(sent.generation_config.speech_config[0].voice,'Kore');
 assert.equal(sent.input[0].content[0].annotations[0].type,'speech_metadata');
 assert.equal(result.mime,'audio/wav');assert.deepEqual(result.bytes,wav);
});
test('Gemini network GET models sin generar contenido',async()=>{
 const f=async(url,opts)=>{assert.match(url,/\/models$/);assert.equal(opts.method,'GET');return ok({models:[]});};
 const r=await geminiNetwork({key:'TEST-KEY',fetcher:f});assert.equal(r.httpStatus,200);
});
test('Gemini diagnostics evalúa texto, audio y WAV',async()=>{
 const wav=silentWav();
 const f=async(url,opts)=>{
  if(url.endsWith('/interactions'))return ok({steps:[{type:'model_output',content:[{type:'audio',data:wav.toString('base64')}]}]});
  return ok(output('OK'));
 };
 for(const service of ['nlu','stt','tts']){
  const model=service==='tts'?GEMINI_MODELS.tts:GEMINI_MODELS.nlu;
  const result=await geminiDiagnostic(service,{key:'TEST-KEY',model,fetcher:f});
  assert.equal(result.httpStatus,200);assert.equal(result.passed,true);
 }
});
test('errores Gemini 429 claros; ausencia de key no filtra secretos',async()=>{
 const e=googleError(429,{error:{status:'RESOURCE_EXHAUSTED',message:'Rate limit hit'}});
 assert.equal(e.upstreamStatus,429);assert.match(e.hint,/cuota/);
 await assert.rejects(()=>geminiNetwork({key:''}),/GEMINI_API_KEY/);
 await assert.rejects(()=>geminiTranscribe({bytes:silentWav(),mime:'text/plain',key:'KEY'}),/formato/);
});

test('Gemini 3.8 usa low; 3.6 usa su nivel por defecto; 3.5 Flash-Lite usa minimal por defecto',()=>{
 assert.deepEqual(thinkingConfigFor('gemini-3.8-flash'),{thinkingConfig:{thinkingLevel:'low'}});
 assert.deepEqual(thinkingConfigFor('gemini-3.6-flash'),{});
 assert.deepEqual(thinkingConfigFor('gemini-3.5-flash-lite'),{});
});
test('el cliente REST reintenta 503 con backoff y jitter y luego obtiene HTTP 200',async()=>{
 let times=0;const pauses=[];
 const fetcher=async()=>{
  times++;
  if(times<3)return {ok:false,status:503,json:async()=>({
    error:{status:'UNAVAILABLE',message:'This model is currently experiencing high demand. Please try again later.'}
  })};
  return ok(output('OK'));
 };
 const result=await googleRequest('/models/gemini-3.8-flash:generateContent',{
  key:'KEY',body:{contents:[{parts:[{text:'Hola'}]}]},fetcher,
  sleep:async ms=>pauses.push(ms),random:()=>0,maxRetries:2
 });
 assert.equal(result.httpStatus,200);
 assert.equal(result.attempts,3);
 assert.deepEqual(pauses,[1000,2000]);
 assert.equal(times,3);
});
test('si los 503 persisten, informa código original y cantidad exacta de intentos',async()=>{
 let times=0;
 const fetcher=async()=>{times++;return {ok:false,status:503,json:async()=>({
  error:{status:'UNAVAILABLE',message:'High demand'}
 })};};
 await assert.rejects(()=>googleRequest('/models/gemini-3.8-flash:generateContent',{
  key:'KEY',body:{contents:[]},fetcher,sleep:async()=>{},random:()=>0
 }),e=>{
  assert.equal(e.upstreamStatus,503);
  assert.equal(e.providerCode,'UNAVAILABLE');
  assert.match(e.message,/3 veces/);
  assert.equal(times,3);return true;
 });
});
test('no reintenta credenciales, JSON inválido, cuota agotada ni errores de esquema',async()=>{
 for(const [status,message] of [
  [400,'Invalid schema'],[401,'API key not valid'],[403,'Permission denied'],
  [429,'Daily quota exceeded'],[404,'Model not found']
 ]){
  let requests=0;
  await assert.rejects(()=>googleRequest('/models/foo:generateContent',{
   key:'KEY',body:{contents:[]},fetcher:async()=>{
    requests++;return {ok:false,status,json:async()=>({error:{status:'ERROR',message}})};
   },sleep:async()=>{},maxRetries:2
  }));
  assert.equal(requests,1,'should not retry HTTP '+status);
 }
});
test('solo reintenta 429 si el proveedor informa límite temporal de velocidad',async()=>{
 let times=0;
 const r=await googleRequest('/models/foo:generateContent',{key:'KEY',body:{},
  fetcher:async()=>++times===1?{ok:false,status:429,json:async()=>({error:{status:'RESOURCE_EXHAUSTED',message:'Too many requests, rate limit exceeded'}})}:ok(output('OK')),
  sleep:async()=>{},maxRetries:2
 });
 assert.equal(times,2);assert.equal(r.httpStatus,200);
});
test('modelo alternativo documentado genera solicitudes sin thinkingLevel incompatible',async()=>{
 const samples=[];
 for(const model of ['gemini-3.5-flash-lite','gemini-3.6-flash']){
  await geminiChatTurn({text:'hola',accounts:account,items:[],phase:'collect',
   key:'KEY',model,today:now,fetcher:async(url,opts)=>{
    const config=JSON.parse(opts.body).generationConfig;
    assert.equal(config.thinkingConfig,undefined);
    assert.equal(config.responseFormat.text.mimeType,'application/json');
    samples.push(url);
    return ok(output(JSON.stringify({action:'greet',reply:'Dale',items:[],index:null})));
   }});
 }
 assert.ok(samples[0].includes('gemini-3.5-flash-lite'));
 assert.ok(samples[1].includes('gemini-3.6-flash'));
});
