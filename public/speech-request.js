import {voiceFailure} from './voice-errors.js?v=14';
import {taskError,describeAiError} from './ai-tasks.js?v=14';
const delay=(ms,signal)=>new Promise((resolve,reject)=>{
 if(signal?.aborted)return reject(Object.assign(new Error('Cancelado'),{name:'AbortError'}));
 const timer=setTimeout(()=>{signal?.removeEventListener('abort',cancel);resolve();},ms);
 const cancel=()=>{clearTimeout(timer);reject(Object.assign(new Error('Cancelado'),{name:'AbortError'}));};
 signal?.addEventListener('abort',cancel,{once:true});
});
export async function getNaturalVoice({
 text,voice,provider,signal,onProgress=()=>{},fetcher=fetch,sleep=delay,intervalMs=1200,attempts=75
}){
 const post=await fetcher('/api/chat/speech/queue',{
  method:'POST',credentials:'same-origin',
  headers:{'Content-Type':'application/json'},
  body:JSON.stringify({text,voice,provider}),signal
 });
 if(!post.ok)throw await voiceFailure(post,'Voz natural');
 let initial;try{initial=(await post.json()).data;}catch{
  throw new Error('GastosApp devolvió un inicio de tarea sin JSON válido.');
 }
 const taskId=initial?.taskId;
 if(!/^[0-9a-f-]{36}$/i.test(String(taskId||'')))
  throw new Error('GastosApp no devolvió un identificador válido de voz.');
 const base='/api/chat/speech/task/'+encodeURIComponent(taskId);
 for(let attempt=0;attempt<attempts;attempt++){
  await sleep(intervalMs,signal);
  const r=await fetcher(base,{credentials:'same-origin',signal});
  if(!r.ok)throw await voiceFailure(r,'Estado de voz');
  let status;try{status=(await r.json()).data;}catch{
   throw new Error('El servidor devolvió un estado de voz inválido.');
  }
  if(status?.status==='failed'){
   const e=taskError(status.error);
   e.message=describeAiError(e,provider);
   throw e;
  }
  if(status?.status==='done'){
   const path=status.data?.audioUrl;
   if(path!==base+'/audio')throw new Error('URL de audio inválida en la tarea completada.');
   const audio=await fetcher(path,{credentials:'same-origin',signal});
   if(!audio.ok)throw await voiceFailure(audio,'Descarga de audio');
   const mime=String(audio.headers.get('content-type')||'').split(';')[0].toLowerCase();
   if(!['audio/wav','audio/mpeg'].includes(mime))
    throw new Error('El servidor devolvió '+(mime||'sin Content-Type')+' en lugar de WAV o MP3.');
   const blob=await audio.blob();
   if(blob.size<100)throw new Error('La voz se generó pero el audio llegó vacío.');
   return {blob,mime,reused:Boolean(initial.reused)};
  }
  if(status?.status!=='working')throw new Error('Estado de síntesis no reconocido.');
  if(attempt===5)onProgress('Gemini está generando la voz. Seguimos esperando sin cortar la conexión.');
  if(attempt===24)onProgress('La voz está tardando más de lo habitual; todavía no es necesario reintentar.');
 }
 throw new Error('La voz no terminó antes del tiempo máximo. No vuelvas a solicitarla reiteradamente.');
}
