import test from 'node:test';
import assert from 'node:assert/strict';
import {makeJobs} from '../lib/ai-jobs.js';
const pause=()=>new Promise(r=>setTimeout(r,10));
test('tarea devuelve estado sin esperar respuesta externa',async()=>{
 const store=makeJobs();const task=store.start('user1',async()=>{await pause();return {httpStatus:200,text:'listo'}});
 assert.equal(task.status,'working');
 assert.equal(store.get('user1',task.taskId).status,'working');
 await pause();await pause();
 assert.equal(store.get('user1',task.taskId).status,'done');
 assert.equal(store.get('user1',task.taskId).data.httpStatus,200);
 assert.throws(()=>store.get('user2',task.taskId),/Tarea no encontrada/);
});
test('tarea fallida conserva detalle útil',async()=>{
 const store=makeJobs();const task=store.start('u',async()=>{throw Object.assign(new Error('Servicio lento'),{status:504,code:'gemini_timeout'})});
 await pause();assert.equal(store.get('u',task.taskId).status,'failed');
 assert.equal(store.get('u',task.taskId).error.code,'gemini_timeout');
});
test('límite de tareas evita acumulación',async()=>{
 const store=makeJobs();const one=store.start('u',()=>new Promise(()=>{}));
 for(let i=1;i<8;i++)store.start('u',()=>new Promise(()=>{}));
 assert.throws(()=>store.start('u',()=>Promise.resolve(1)),/Demasiadas tareas/);
 assert.equal(store.get('u',one.taskId).status,'working');
});