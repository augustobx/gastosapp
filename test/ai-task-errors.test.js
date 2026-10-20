import test from 'node:test';
import assert from 'node:assert/strict';
import {waitTask,describeAiError,taskError} from '../public/ai-tasks.js';
import {makeJobs} from '../lib/ai-jobs.js';
import {googleError} from '../lib/gemini.js';
const tick=()=>new Promise(done=>setImmediate(done));
test('el error real Gemini HTTP 400 conserva código, motivo y solución desde servidor hasta el panel',async()=>{
 const jobs=makeJobs();
 const failure=googleError(400,{error:{status:'INVALID_ARGUMENT',message:'generationConfig.responseFormat.text.schema is invalid'}});
 const started=jobs.start('sesion-a',async()=>{throw failure;});
 await tick();
 await assert.rejects(
  ()=>waitTask(started,async()=>jobs.get('sesion-a',started.taskId),null,{attempts:2,intervalMs:0,delay:async()=>{}}),
  error=>{
   assert.equal(error.provider,'gemini');
   assert.equal(error.code,'INVALID_ARGUMENT');
   assert.equal(error.upstreamStatus,400);
   assert.match(error.message,/responseFormat/);
   const shown=describeAiError(error,'gemini');
   assert.match(shown,/Gemini HTTP 400/);
   assert.match(shown,/INVALID_ARGUMENT/);
   assert.match(shown,/responseFormat/);
   assert.ok(!shown.includes('Error sin detalle'));
   return true;
  }
 );
});
test('el panel muestra detalles de errores locales y de red, sin aparentar un HTTP que no recibió',()=>{
 const local=taskError({provider:'gastosapp',code:'gemini_network',error:'No se pudo resolver Google',hint:'Revisar DNS'});
 const message=describeAiError(local,'gemini');
 assert.match(message,/gemini_network/);
 assert.match(message,/No se pudo resolver Google/);
 assert.match(message,/Revisar DNS/);
 assert.match(describeAiError(new Error('Falló la red'),'gemini'),/Falló la red/);
});
test('un resultado exitoso en la cola vuelve con datos y no genera errores',async()=>{
 const jobs=makeJobs();const started=jobs.start('sesion',async()=>({httpStatus:200,passed:true}));
 await tick();
 const result=await waitTask(started,async()=>jobs.get('sesion',started.taskId),null,{attempts:2,intervalMs:0,delay:async()=>{}});
 assert.equal(result.httpStatus,200);
});
test('tarea con error sin mensaje tiene alternativa clara',async()=>{
 await assert.rejects(()=>waitTask({taskId:'abc'},async()=>({status:'failed',error:{provider:'gemini',code:'UNKNOWN'}}),null,{intervalMs:0,delay:async()=>{}}),
  error=>{assert.match(describeAiError(error),/no informó el motivo/);return true;});
});