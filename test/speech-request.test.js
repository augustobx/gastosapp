import test from 'node:test';
import assert from 'node:assert/strict';
import {getNaturalVoice} from '../public/speech-request.js';
const id='11111111-2222-4333-8444-555555555555';
const json=(data,status=200)=>new Response(JSON.stringify({ok:true,data}),{
 status,headers:{'Content-Type':'application/json'}
});
test('la PWA espera la síntesis, consulta progreso y descarga WAV en otra solicitud',async()=>{
 let probes=0;const calls=[];
 const fetcher=async(url,opts={})=>{
  calls.push({url,method:opts.method||'GET'});
  if(url.endsWith('/queue'))return json({taskId:id,status:'working'},202);
  if(url.endsWith('/audio'))return new Response(Buffer.alloc(300),{status:200,headers:{'Content-Type':'audio/wav'}});
  if(url.includes('/task/'))return json(++probes===1?{status:'working'}:
   {status:'done',data:{mime:'audio/wav',bytes:300,audioUrl:'/api/chat/speech/task/'+id+'/audio'}});
  throw Error('Unexpected fetch: '+url);
 };
 const result=await getNaturalVoice({text:'Hola',voice:'Kore',provider:'gemini',
  fetcher,sleep:async()=>{},attempts:3,intervalMs:0});
 assert.equal(result.blob.size,300);
 assert.equal(result.mime,'audio/wav');
 assert.equal(probes,2);
 assert.equal(calls.filter(x=>x.method==='POST').length,1);
});
test('la cuota agotada se informa desde la tarea y no se solicita audio',async()=>{
 let calls=0;
 const fetcher=async(url)=>{
  calls++;
  if(url.endsWith('/queue'))return json({taskId:id},202);
  return json({status:'failed',error:{provider:'gemini',upstreamStatus:429,code:'too_many_requests',
   error:'Rate limit exceeded for model gemini-3.8-flash-tts (limit: 10 requests per day on Free Tier)',
   hint:'Esperá el reinicio de cuota.'}});
 };
 await assert.rejects(()=>getNaturalVoice({text:'Hola',voice:'Kore',provider:'gemini',
  fetcher,sleep:async()=>{},intervalMs:0}),e=>{
  assert.match(e.message,/Gemini HTTP 429/);
  assert.match(e.message,/Free Tier/);
  assert.match(e.message,/reinicio/);
  return true;
 });
 assert.equal(calls,2);
});
test('no acepta links remotos para descargar audio',async()=>{
 const fetcher=async(url)=>url.endsWith('/queue')?
  json({taskId:id},202):json({status:'done',data:{audioUrl:'https://example.com/steal'}});
 await assert.rejects(()=>getNaturalVoice({text:'Hola',voice:'Kore',provider:'gemini',fetcher,
  sleep:async()=>{},intervalMs:0}),/URL de audio inválida/);
});
