import test from 'node:test';
import assert from 'node:assert/strict';
import {createSpeechJobs} from '../lib/speech-jobs.js';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const wav=()=>{const b=Buffer.alloc(300);b.write('RIFF',0);return {bytes:b,mime:'audio/wav'};};
const meta={provider:'gemini',model:'gemini-3.8-flash-tts',voice:'Kore',text:'Hola'};
test('las voces se generan de forma asíncrona y el status solo contiene metadatos',async()=>{
 const jobs=createSpeechJobs();
 let resolve;
 const gate=new Promise(r=>resolve=r);
 const a=jobs.start('ownerA',meta,()=>gate);
 assert.equal(a.status,'working');
 assert.equal(jobs.status('ownerA',a.taskId).status,'working');
 resolve(wav());await tick();await tick();
 const status=jobs.status('ownerA',a.taskId);
 assert.equal(status.status,'done');
 assert.equal(status.data.mime,'audio/wav');
 assert.equal(status.data.bytes,300);
 assert.equal(status.data.audioUrl,'/api/chat/speech/task/'+a.taskId+'/audio');
 assert.equal(JSON.stringify(status).includes('RIFF'),false);
 assert.equal(jobs.audio('ownerA',a.taskId).bytes.length,300);
 assert.throws(()=>jobs.status('ownerB',a.taskId),/no pertenece/);
 assert.throws(()=>jobs.audio('ownerB',a.taskId),/no pertenece/);
});
test('la misma frase reutiliza WAV y no consume una segunda generación',async()=>{
 const jobs=createSpeechJobs();let count=0;
 const generate=async()=>{count++;return wav();};
 const a=jobs.start('ownerA',meta,generate);
 const b=jobs.start('ownerA',meta,generate);
 assert.equal(a.taskId,b.taskId);
 assert.equal(b.reused,true);
 await tick();await tick();
 const c=jobs.start('ownerA',meta,generate);
 assert.equal(c.taskId,a.taskId);
 assert.equal(count,1);
 assert.notEqual(jobs.start('ownerB',meta,generate).taskId,a.taskId);
});
test('429 por cuota diaria se conserva como error real y no entrega audio',async()=>{
 const jobs=createSpeechJobs();
 const task=jobs.start('owner',meta,async()=>{
  throw Object.assign(new Error('Gemini HTTP 429 · too_many_requests: limit 10 requests per day'),{
   status:502,upstreamStatus:429,providerCode:'too_many_requests',provider:'gemini',
   hint:'Esperá la renovación de cuota o activá facturación.'
  });
 });
 await tick();await tick();
 const value=jobs.status('owner',task.taskId);
 assert.equal(value.status,'failed');
 assert.equal(value.error.upstreamStatus,429);
 assert.equal(value.error.code,'too_many_requests');
 assert.match(value.error.error,/10 requests/);
 assert.throws(()=>jobs.audio('owner',task.taskId),/todavía no está disponible/);
});
test('nunca almacena un archivo WAV mayor al límite configurado',async()=>{
 const jobs=createSpeechJobs({maxBytes:200});
 const result=jobs.start('owner',meta,async()=>wav());
 await tick();await tick();
 assert.equal(jobs.status('owner',result.taskId).error.code,'invalid_speech_audio');
});
