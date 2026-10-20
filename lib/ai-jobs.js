import crypto from 'node:crypto';
import {publicError} from './openai-health.js';
export function makeJobs(){
 const jobs=new Map();
 const prune=()=>{const now=Date.now();for(const [id,j] of jobs){if(now-j.started>300000)jobs.delete(id)}};
 function start(owner,work){
  prune();
  if([...jobs.values()].filter(j=>j.state==='working').length>=8)throw Object.assign(new Error('Demasiadas tareas activas'),{status:429});
  const id=crypto.randomUUID(),job={owner,started:Date.now(),state:'working'};jobs.set(id,job);
  Promise.resolve().then(work).then(value=>{job.state='done';job.value=value}).catch(e=>{job.state='failed';job.error={...publicError(e),httpStatus:e.status||502}});
  return {taskId:id,status:'working'};
 }
 function get(owner,id){prune();const job=jobs.get(id);if(!job||job.owner!==owner)throw Object.assign(new Error('Tarea no encontrada'),{status:404});
  return {status:job.state,...(job.state==='done'?{data:job.value}:{}),...(job.state==='failed'?{error:job.error}:{})};
 }
 return {start,get};
}