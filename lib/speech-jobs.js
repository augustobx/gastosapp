import crypto from 'node:crypto';
import {publicError} from './openai-health.js';

// Datos temporales. No guardar audio ni frases financieras en disco.
// Las URLs requieren la misma cookie de sesión que creó la tarea.
export function createSpeechJobs({ttlMs=240000,maxActive=6,maxEntries=16,maxBytes=2500000}={}){
 const jobs=new Map();
 const sweep=()=>{
  const now=Date.now();
  for(const [id,job] of jobs)if(now-job.created>ttlMs)jobs.delete(id);
  if(jobs.size>maxEntries){
   const done=[...jobs.values()].filter(j=>j.status!=='working').sort((a,b)=>a.created-b.created);
   for(const job of done){if(jobs.size<=maxEntries)break;jobs.delete(job.id);}
  }
 };
 function ownerJob(owner,id){
  sweep();const job=jobs.get(id);
  if(!job||job.owner!==owner)throw Object.assign(new Error('La grabación expiró o no pertenece a esta sesión.'),{
   status:404,code:'speech_job_not_found'
  });
  return job;
 }
 function start(owner,{provider,model,voice,text},generate){
  sweep();
  const key=crypto.createHash('sha256').update(JSON.stringify([provider,model,voice,text])).digest('hex');
  // Reusar muestras idénticas durante unos minutos, sin volver a consumir cuota.
  const existing=[...jobs.values()].find(j=>j.owner===owner&&j.key===key&&(j.status==='working'||j.status==='done'));
  if(existing)return {taskId:existing.id,status:existing.status,reused:true};
  if([...jobs.values()].filter(j=>j.status==='working').length>=maxActive)
   throw Object.assign(new Error('Hay varias voces procesándose. Esperá antes de volver a probar.'),{
    status:429,code:'too_many_speech_tasks'
   });
  const id=crypto.randomUUID();
  const job={id,owner,key,created:Date.now(),status:'working',audio:null,mime:null,error:null};
  jobs.set(id,job);
  Promise.resolve().then(generate).then(result=>{
   if(!Buffer.isBuffer(result?.bytes)||result.bytes.length<100||result.bytes.length>maxBytes)
    throw Object.assign(new Error('La respuesta de voz está vacía o excede el tamaño permitido.'),{
     status:502,code:'invalid_speech_audio'
    });
   if(!['audio/wav','audio/mpeg'].includes(result.mime))
    throw Object.assign(new Error('El proveedor devolvió un formato de audio no admitido.'),{
     status:502,code:'unsupported_speech_mime'
    });
   job.audio=result.bytes;job.mime=result.mime;job.status='done';
   sweep();
  }).catch(error=>{
   job.error={...publicError(error),httpStatus:error.status||502};
   job.status='failed';job.audio=null;
  });
  return {taskId:id,status:'working',reused:false};
 }
 function status(owner,id){
  const job=ownerJob(owner,id);
  return {status:job.status,
   ...(job.status==='failed'?{error:job.error}:{}),
   ...(job.status==='done'?{data:{mime:job.mime,bytes:job.audio.length,audioUrl:'/api/chat/speech/task/'+id+'/audio'}}:{})};
 }
 function audio(owner,id){
  const job=ownerJob(owner,id);
  if(job.status!=='done')throw Object.assign(new Error('El audio todavía no está disponible.'),{
   status:409,code:'speech_not_ready'
  });
  return {mime:job.mime,bytes:job.audio};
 }
 return {start,status,audio};
}
