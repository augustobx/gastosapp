import test from 'node:test';
import assert from 'node:assert/strict';
import { providerFailure,publicError,VOICES,makeSpeechBody,silentWav,diagnostics,networkDiagnostics } from '../lib/openai-health.js';

const mockResponse=(body,{status=200,contentType='application/json'}={})=>({
 status,ok:status>=200&&status<300,
 headers:{get(name){return name==='x-request-id'?'req-test-123':name==='content-type'?contentType:null;}},
 async json(){return body;},
 async arrayBuffer(){return new Uint8Array(400).buffer;}
});

test('convierte error real 429 de cuota/saldo a explicación accionable y oculta claves',()=>{
 const e=providerFailure(429,{error:{code:'insufficient_quota',message:'You exceeded your current quota. sk-superSecret123456789012345678'}},'req-123');
 const j=publicError(e);
 assert.equal(j.upstreamStatus,429);
 assert.equal(j.code,'insufficient_quota');
 assert.match(j.hint,/crédito|facturación/);
 assert.equal(j.requestId,'req-123');
 assert.ok(!JSON.stringify(j).includes('sk-superSecret'));
});
test('distingue clave inválida, modelo inaccesible, audio incorrecto y rate limit',()=>{
 for(const [status,code,match] of [[401,'invalid_api_key',/clave/],[404,'model_not_found',/modelo/],
  [400,'invalid_request_error',/audio/],[429,'rate_limit_exceeded',/solicitudes/]]){
  const message=status===400?'Invalid audio file format':'error';
  assert.match(providerFailure(status,{error:{code,message}}).hint,match);
 }
});
test('formato WAV diagnóstico válido a 16kHz, un canal y 16bit',()=>{
 const wav=silentWav(1.25);
 assert.equal(wav.toString('ascii',0,4),'RIFF');
 assert.equal(wav.toString('ascii',8,12),'WAVE');
 assert.equal(wav.readUInt32LE(24),16000);
 assert.equal(wav.readUInt16LE(22),1);
 assert.equal(wav.readUInt16LE(34),16);
 assert.ok(wav.length>35000);
});
test('acepta voces documentadas y rechaza inyecciones',()=>{
 assert.ok(VOICES.includes('marin'));assert.ok(VOICES.includes('cedar'));
 assert.equal(JSON.parse(makeSpeechBody({text:'Hola',voice:'cedar'})).voice,'cedar');
 assert.throws(()=>makeSpeechBody({text:'Hola',voice:'secret-extra'}),/Voz no admitida/);
});
test('diagnóstico nlu valida respuesta HTTP 200 real con modelo seleccionado',async()=>{
 const urls=[];const f=async(url,req)=>{urls.push(url);const body=JSON.parse(req.body);
  assert.equal(body.model,'gpt-4o-mini');return mockResponse({choices:[{message:{content:'{"ok":true}'}}]});
 };
 const x=await diagnostics('nlu',{key:'test',model:'gpt-4o-mini',fetcher:f});
 assert.equal(x.httpStatus,200);assert.equal(x.passed,true);assert.match(urls[0],/chat\/completions/);
});
test('diagnóstico stt envía WAV con multipart y acepta transcript vacío',async()=>{
 const f=async(url,req)=>{
  assert.match(url,/audio\/transcriptions/);
  assert.equal(req.body.get('model'),'gpt-4o-mini-transcribe');
  assert.equal(req.body.get('file').type,'audio/wav');
  return mockResponse({text:''});
 };
 const x=await diagnostics('stt',{key:'test',model:'gpt-4o-mini-transcribe',fetcher:f});
 assert.equal(x.httpStatus,200);
 assert.match(x.detail,/silencio/);
});
test('diagnóstico voz usa modelo, voice marin y valida audio',async()=>{
 const f=async(url,req)=>{
  assert.match(url,/audio\/speech/);
  const v=JSON.parse(req.body);
  assert.equal(v.voice,'marin');assert.equal(v.model,'gpt-4o-mini-tts');
  return mockResponse(null);
 };
 const x=await diagnostics('tts',{key:'test',model:'gpt-4o-mini-tts',voice:'marin',fetcher:f});
 assert.equal(x.httpStatus,200);assert.match(x.detail,/audio/);
});
test('diagnóstico informa al usuario código HTTP proveedor, no error genérico',async()=>{
 const f=async()=>mockResponse({error:{code:'insufficient_quota',message:'Billing hard limit reached'}},{status:429});
 await assert.rejects(()=>diagnostics('stt',{key:'test',model:'gpt-4o-mini-transcribe',fetcher:f}),
  e=>{assert.equal(e.upstreamStatus,429);assert.match(e.hint,/facturación|crédito/);return true;});
});

test('prueba de red usa GET /v1/models y acepta 200 sin generar audio',async()=>{
 const r=await networkDiagnostics({key:'dummy',fetcher:async(url,opts)=>{
  assert.equal(url,'https://api.openai.com/v1/models');
  assert.equal(opts.method,'GET');
  assert.equal(opts.headers.Authorization,'Bearer dummy');
  return mockResponse({data:[]});
 }});
 assert.equal(r.httpStatus,200);
 assert.match(r.detail,/API Key/);
});
test('diagnóstico de red diferencia 401 proveedor y caída de DNS',async()=>{
 await assert.rejects(()=>networkDiagnostics({key:'dummy',fetcher:async()=>mockResponse({
   error:{code:'invalid_api_key',message:'Incorrect API key'}
 },{status:401})}),e=>{assert.equal(e.upstreamStatus,401);assert.match(e.hint,/clave/);return true;});
 await assert.rejects(()=>networkDiagnostics({key:'dummy',fetcher:async()=>{const e=new TypeError('fetch failed');
   e.cause={code:'ENOTFOUND'};throw e;}}),e=>{assert.equal(e.code,'network_error');assert.match(e.message,/ENOTFOUND/);return true;});
});
