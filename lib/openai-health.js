// Todos los errores de proveedores se traducen a información útil y sin secretos.
export const VOICES=['marin','cedar','coral','nova','alloy','sage','shimmer','verse','ash','ballad','echo'];
const advice=(status,code,message)=>{
 const s=String(message||'').toLowerCase(),c=String(code||'').toLowerCase();
 if(status===401||c==='invalid_api_key')return 'La clave no es válida o fue revocada. Generá otra API Key en platform.openai.com/api-keys y reemplazala en .env.';
 if(status===403)return 'El proyecto no tiene permiso para este modelo. Revisá permisos y verificación de la organización.';
 if(status===404||c==='model_not_found')return 'El modelo no existe o no está habilitado en este proyecto. Revisá el nombre OPENAI_*_MODEL en .env.';
 if(status===429){
  if(c.includes('quota')||s.includes('quota')||s.includes('billing')||s.includes('credit')||s.includes('budget'))
   return 'Sin crédito, límite de gasto alcanzado o facturación pendiente. Revisá Billing y Usage en platform.openai.com.';
  return 'OpenAI aplicó un límite de solicitudes o tokens. Esperá unos segundos y volvé a probar.';
 }
 if(status===400){
  if(s.includes('audio')||s.includes('format')||s.includes('file')||s.includes('duration'))
   return 'OpenAI rechazó el audio. Verificá el formato y que haya sonido; probá otra grabación o cambiá de navegador.';
  if(s.includes('voice'))return 'La voz elegida no es compatible con el modelo. Probá marin o cedar.';
  return 'OpenAI rechazó la solicitud. Revisá el modelo y el detalle técnico mostrado abajo.';
 }
 if(status===413)return 'El audio supera el tamaño permitido. Grabá un mensaje más corto.';
 if(status>=500)return 'Error temporal de OpenAI. Reintentá más tarde.';
 return 'Revisá conectividad del servidor, permisos del proyecto y saldo. Ejecutá los tests en Configuración.';
};
export function providerFailure(status,body={},requestId=null){
 const err=body&&typeof body==='object'&&body.error&&typeof body.error==='object'?body.error:{};
 const code=String(err.code||err.type||'openai_error').slice(0,72);
 const detail=String(err.message||'OpenAI devolvió un error sin detalle.').replace(/sk-[a-zA-Z0-9_-]+/g,'[CLAVE OCULTA]').slice(0,280);
 const e=new Error('OpenAI HTTP '+status+' · '+code+': '+detail);
 e.status=502;e.upstreamStatus=status;e.providerCode=code;e.hint=advice(status,code,detail);
 e.requestId=requestId||null;
 return e;
}
export function publicError(error){
 if(error.upstreamStatus)return {error:error.message,upstreamStatus:error.upstreamStatus,
  code:error.providerCode||'openai_error',hint:error.hint,requestId:error.requestId||undefined};
 if(error.name==='AbortError')return {error:'Tiempo de espera agotado al contactar OpenAI.',code:'timeout',
  hint:'Revisá la conexión del servidor e intentá nuevamente.'};
 if(error.name==='TypeError'&&/fetch|network/i.test(error.message))return {error:'El servidor no pudo conectarse a api.openai.com.',code:'network_error',
  hint:'Comprobá conectividad y DNS desde Docker.'};
 return {error:String(error.message||'Error desconocido').slice(0,240),code:error.code||'app_error',
  hint:error.hint||'Revisá las pruebas de modelos en Configuración.'};
}
export async function callOpenAI(url,{key,body,headers={},timeoutMs=25000,fetcher=fetch}){
 if(!key)throw Object.assign(new Error('OPENAI_API_KEY no configurada en el contenedor.'),{status:503,code:'missing_key',hint:'Completá OPENAI_API_KEY en .env y recreá únicamente GastosApp.'});
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
 try{
  let res;
  try{
   res=await fetcher(url,{method:'POST',headers:{Authorization:'Bearer '+key,...headers},body,signal:controller.signal});
  }catch(e){
   if(e.name==='AbortError')throw Object.assign(e,{status:504});
   throw Object.assign(new Error('No se puede conectar a OpenAI desde Docker: '+e.message),{status:502,code:'network_error',hint:'Comprobá la conexión a api.openai.com desde el contenedor.'});
  }
  if(!res.ok){
   let data={};
   try{data=await res.json();}catch{}
   throw providerFailure(res.status,data,res.headers?.get?.('x-request-id'));
  }
  return res;
 }finally{clearTimeout(timer);}
}
export function silentWav(seconds=1.25,sampleRate=16000){
 const n=Math.floor(seconds*sampleRate),header=Buffer.alloc(44),pcm=Buffer.alloc(n*2);
 header.write('RIFF',0);header.writeUInt32LE(36+pcm.length,4);header.write('WAVE',8);
 header.write('fmt ',12);header.writeUInt32LE(16,16);header.writeUInt16LE(1,20);
 header.writeUInt16LE(1,22);header.writeUInt32LE(sampleRate,24);
 header.writeUInt32LE(sampleRate*2,28);header.writeUInt16LE(2,32);header.writeUInt16LE(16,34);
 header.write('data',36);header.writeUInt32LE(pcm.length,40);
 return Buffer.concat([header,pcm]);
}
export function makeSpeechBody({text,voice='marin',model='gpt-4o-mini-tts'}){
 if(!VOICES.includes(voice))throw Object.assign(new Error('Voz no admitida: '+voice),{status:400,code:'invalid_voice'});
 return JSON.stringify({
  model,voice,input:String(text).slice(0,620),response_format:'mp3',
  instructions:'Hablá en español de Argentina con voz humana natural, como si charlaras con alguien de confianza. Tono cálido, espontáneo, articulación clara, ritmo tranquilo pero ágil, pequeñas pausas donde corresponda. Sin entonación de locutor, sin sonar como un robot. Pronunciá bien cifras y fechas. No agregues ni cambies palabras.'
 });
}
export async function diagnostics(service,{key,model,voice='marin',fetcher=fetch}){
 if(!['nlu','stt','tts'].includes(service))throw Object.assign(new Error('Prueba desconocida.'),{status:404});
 const start=Date.now();let response,detail='';
 if(service==='nlu'){
  response=await callOpenAI('https://api.openai.com/v1/chat/completions',{
   key,fetcher,body:JSON.stringify({model,max_tokens:30,response_format:{type:'json_object'},
    messages:[{role:'system',content:'Respondé únicamente un objeto JSON válido.'},{role:'user',content:'Devolvé {"ok":true}'}]}),
   headers:{'Content-Type':'application/json'},timeoutMs:25000});
  const j=await response.json();
  if(!j.choices?.[0]?.message?.content)throw Object.assign(new Error('El modelo respondió HTTP 200 pero no produjo texto.'),{status:502,code:'empty_response'});
  detail='Modelo de interpretación respondió correctamente.';
 }else if(service==='stt'){
  const wav=silentWav();const form=new FormData();
  form.set('file',new Blob([wav],{type:'audio/wav'}),'prueba.wav');
  form.set('model',model);form.set('language','es');
  response=await callOpenAI('https://api.openai.com/v1/audio/transcriptions',{key,fetcher,body:form,timeoutMs:30000});
  const j=await response.json();
  if(typeof j.text!=='string')throw Object.assign(new Error('HTTP 200 sin campo de transcripción; verificar el modelo.'),{status:502,code:'missing_transcript'});
  detail='Transcripción respondió 200 usando 1,25 segundos de silencio de prueba. No debe devolver palabras.';
 }else{
  response=await callOpenAI('https://api.openai.com/v1/audio/speech',{
   key,fetcher,body:makeSpeechBody({text:'Hola, soy GastosApp. Estoy lista para ayudarte.',voice,model}),
   headers:{'Content-Type':'application/json'},timeoutMs:30000
  });
  const audio=Buffer.from(await response.arrayBuffer());
  if(audio.length<100)throw Object.assign(new Error('Audio recibido demasiado corto o vacío.'),{status:502,code:'empty_audio'});
  detail='Voz natural generó '+Math.ceil(audio.length/1024)+' KB de audio. Probá «Escuchar voz» para evaluar cómo suena.';
 }
 return {service,model,httpStatus:response.status,passed:true,latencyMs:Date.now()-start,detail};
}
