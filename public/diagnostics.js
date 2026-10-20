import {getNaturalVoice} from './speech-request.js?v=14';
import {voiceFailure} from './voice-errors.js?v=14';
import {waitTask,describeAiError} from './ai-tasks.js?v=14';
import {providerFor,saveProvider,voiceFor,saveVoice} from './providers.js?v=14';
// Diagnóstico visible por modelo: nunca pedir ni mostrar la clave API.
export function setupAIDiagnostics(){
 const $=id=>document.getElementById(id);
 const label={nlu:'Nlu',stt:'Stt',tts:'Tts'};
 const names={nlu:'Interpretación',stt:'Transcripción',tts:'Voz natural'};
 let config=null,playerUrl=null,busy=false;
 const services=['nlu','stt','tts'];
 const available=p=>Boolean(config?.providers?.[p]?.configured);
 const providerInfo=s=>config?.providers?.[providerFor(s)]||{};
 const providerLabel=p=>p==='gemini'?'Gemini':'OpenAI';
 function setProvidersUI(){
   for(const service of services){
     const suffix=label[service],select=$('aiProvider'+suffix);
     for(const opt of select.options)opt.disabled=!available(opt.value);
     const stored=providerFor(service);
     const picked=available(stored)?stored:(available('gemini')?'gemini':'openai');
     saveProvider(service,picked);select.value=picked;
     $('aiModel'+suffix).textContent=providerInfo(service)[service]||'Sin modelo';
     setState(service,'idle','Sin probar con '+providerLabel(picked)+'.');
     $('aiTest'+suffix).disabled=!available(picked);
   }
   const network=$('aiNetworkProvider');
   for(const opt of network.options)opt.disabled=!available(opt.value);
   network.value=available(providerFor('nlu'))?providerFor('nlu'):(available('gemini')?'gemini':'openai');
   fillVoices();
 }
 function fillVoices(){
   const provider=providerFor('tts'),info=providerInfo('tts');
   const select=$('aiVoiceSelect'),chosen=voiceFor(provider);
   select.innerHTML=(info.voices||[]).map(v=>'<option value="'+v+'">'+v+' · '+providerLabel(provider)+'</option>').join('');
   select.value=(info.voices||[]).includes(chosen)?chosen:info.defaultVoice||'';
   if(!select.value&&select.options.length)select.selectedIndex=0;
 }
 for(const service of services){
   $('aiProvider'+label[service]).addEventListener('change',event=>{
     if(!available(event.target.value))return;
     saveProvider(service,event.target.value);
     $('aiModel'+label[service]).textContent=providerInfo(service)[service]||'Sin modelo';
     setState(service,'idle','Proveedor: '+providerLabel(event.target.value)+' · Sin probar');
     if(service==='tts')fillVoices();
   });
 }
 function note(text,kind='neutral'){
  const el=$('aiConfigMessage');el.textContent=text;el.dataset.kind=kind;
 }
 function voiceNote(text,kind='error'){
  const el=$('aiVoiceMessage');el.textContent=text;el.dataset.kind=kind;el.classList.remove('hidden');
 }
 async function call(url,body){
  let response;
  try{response=await fetch(url,{method:body?'POST':'GET',credentials:'same-origin',
    headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});}
  catch(e){throw {error:'Sin conexión con GastosApp: '+e.message,code:'network_error',
    hint:'Comprobá que GastosApp esté levantada, que el dominio tenga HTTPS y que el contenedor tenga salida a Internet.'};}
  const type=String(response.headers.get('content-type')||'desconocido');
  const backend=response.headers.get('x-gastosapp-backend');
  const raw=await response.text();
  let data;
  try{data=JSON.parse(raw);}catch{
    const gateway=response.status===502||response.status===503||response.status===504;
    const outside=!backend;
    const cause=gateway&&outside?'gateway_non_json':'unexpected_non_json';
    const rawText=raw.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim().slice(0,150);
    throw {
      httpStatus:response.status,code:cause,
      error:'HTTP '+response.status+' recibido en formato '+type+'. '+(gateway&&outside?
       'El proxy o un intermediario respondió en lugar de la API Node de GastosApp.':
       'La respuesta no cumple el contrato JSON de GastosApp.')+
       (rawText?' Resumen: '+rawText:' Respuesta vacía.'),
      hint:gateway&&outside?
       'Revisá docker compose ps, los logs de gastosapp-web y los errores de Nginx Proxy Manager. Probá el mismo endpoint dentro del contenedor para localizar el salto que falla.':
       'Verificá que el servidor tenga la versión actual, que /api llegue a Express y revisá los logs de aplicación.'
    };
  }
  if(!response.ok)throw {...data,httpStatus:response.status};
  return data.data;
 }
 function setState(service,kind,detail){
  const suffix=label[service],state=$('aiState'+suffix),info=$('aiDetail'+suffix);
  state.dataset.state=kind;state.textContent=kind==='ok'?'HTTP 200 ✓':kind==='testing'?'Probando...':
    kind==='fail'?'Falló':'Sin probar';
  info.textContent=detail;
 }
 async function load(){
  try{
   config=await call('/api/ai/config');
   localStorage.setItem('gastosapp-provider-default',config.defaultProvider||'openai');
   setProvidersUI();
   const configured=services.filter(t=>available(providerFor(t))).length;
   $('aiConnectionState').textContent=config.configured?
     'Claves configuradas · '+configured+'/3 funciones listas':'Sin claves';
   note(config.configured?'Proveedores en el servidor: '+['gemini','openai']
     .filter(available).map(providerLabel).join(', ')+'. Probá cada función para comprobar cuotas y permisos.':
     'No hay claves en el contenedor. Configurá GEMINI_API_KEY u OPENAI_API_KEY en .env.','neutral');
   $('aiTestAll').disabled=!configured;
   $('aiTestNetwork').disabled=!config.configured;
   $('aiPreviewVoice').disabled=!available(providerFor('tts'));
   $('aiTestMicrophone').disabled=!available(providerFor('stt'));
  }catch(error){
   $('aiConnectionState').textContent='No se pudo consultar';
   note('No pudimos leer la configuración: '+(error.error||error.message||'Error inesperado')+
     '. Iniciá sesión o revisá los logs de GastosApp.','error');
  }
 }
 async function testOne(service){
  if(busy)return false;
  busy=true;const suffix=label[service],btn=$('aiTest'+suffix);
  btn.disabled=true;setState(service,'testing','Enviando petición real a '+providerLabel(providerFor(service))+'...');
  try{
   const provider=providerFor(service);
   const initial=await call('/api/ai/diagnostics/'+service,{provider,voice:$('aiVoiceSelect').value});
   const result=await waitTask(initial,call,message=>setState(service,'testing',message));
   setState(service,'ok',providerLabel(providerFor(service))+' HTTP '+result.httpStatus+' · '+result.detail+' Modelo: '+result.model+' · '+result.latencyMs+' ms');
   return true;
  }catch(error){
   const detail=describeAiError(error,providerFor(service));
   setState(service,'fail',detail);
   note('Falló '+names[service]+' ('+providerLabel(providerFor(service))+'). '+detail,'error');
   return false;
  }finally{busy=false;btn.disabled=false;}
 }
 async function testAll(){
  $('aiTestAll').disabled=true;note('Ejecutando pruebas reales, una por vez. Pueden consumir créditos...');
  const list=[];
  for(const service of ['nlu','stt','tts'])list.push(await testOne(service));
  const passed=list.filter(Boolean).length;
  $('aiConnectionState').textContent=passed+'/3 funciones HTTP 200';
  note(passed===3?'Los tres modelos respondieron correctamente. Probá ahora tu micrófono y escuchá la voz.':
    passed+' de 3 modelos respondieron HTTP 200. Revisá debajo el error específico de cada modelo.',passed===3?'ok':'error');
  $('aiTestAll').disabled=false;
 }
 async function testNetwork(){
  const btn=$('aiTestNetwork'),label=$('aiNetworkResult');
  btn.disabled=true;label.dataset.kind='neutral';label.textContent='Consultando OpenAI desde el contenedor (GET /v1/models). No genera audio ni texto.';
  try{
   const provider=$('aiNetworkProvider').value;
   const result=await call('/api/ai/network?provider='+encodeURIComponent(provider));
   label.dataset.kind='ok';
   label.textContent='HTTP '+result.httpStatus+' · '+result.detail+' Tiempo: '+result.latencyMs+' ms.';
  }catch(error){
   label.dataset.kind='error';
   label.textContent=describeAiError(error,$('aiNetworkProvider').value);
  }finally{btn.disabled=false;}
 }
 $('aiTestNetwork').addEventListener('click',()=>void testNetwork());
 function chooseVoice(){
  saveVoice(providerFor('tts'),$('aiVoiceSelect').value);
  voiceNote('Voz «'+$('aiVoiceSelect').value+'» elegida. Para comprobarla, tocá «Escuchar voz real». La selección también se usa en el chat.','ok');
 }
 async function previewVoice(){
  const btn=$('aiPreviewVoice');btn.disabled=true;
  voiceNote('Generando una muestra. No cierres la pantalla hasta escucharla.','neutral');
  if(playerUrl){URL.revokeObjectURL(playerUrl);playerUrl=null;}
  try{
   const provider=providerFor('tts'),voice=$('aiVoiceSelect').value;
   const result=await getNaturalVoice({
    text:'Hola, ¿cómo andás? Soy tu asistente de GastosApp. Contame tus gastos y los organizamos juntos.',
    voice,provider,onProgress:message=>voiceNote(message,'neutral')
   });
   playerUrl=URL.createObjectURL(result.blob);
   const player=$('aiVoicePlayer');player.src=playerUrl;player.classList.remove('hidden');
   voiceNote(providerLabel(provider)+' · WAV/MP3 generado correctamente'+
    (result.reused?' (muestra reutilizada sin nueva generación)':'')+
    '. Si no se reproduce automáticamente, tocá ▶.','ok');
   try{await player.play();}catch{/* El usuario puede reproducir con controles nativos */}
  }catch(e){voiceNote(e.message||'No se pudo generar o descargar la voz.','error');}
  finally{btn.disabled=false;}
 }
 for(const service of ['nlu','stt','tts'])$('aiTest'+label[service]).addEventListener('click',async()=>{
  const success=await testOne(service);$('aiConnectionState').textContent=success?names[service]+': HTTP 200':'Ver detalle del fallo';
 });
 $('aiRefreshSettings').addEventListener('click',load);
 $('aiTestAll').addEventListener('click',testAll);
 let microphoneRecorder=null,microphoneStream=null,microphoneTimer=null;
 function micMessage(message,kind='neutral'){
  const el=$('aiMicResult');el.textContent=message;el.dataset.kind=kind;
 }
 async function microphoneTest(){
  if(microphoneRecorder?.state==='recording'){
   microphoneRecorder.stop();return;
  }
  if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){
   micMessage('Este navegador no permite grabar con MediaRecorder. Probá HTTPS desde Chrome/Edge actualizado.','error');return;
  }
  micMessage('Solicitando permiso para el micrófono...');
  try{
   const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true}});
   microphoneStream=stream;
   const mime=['audio/webm;codecs=opus','audio/mp4','audio/webm','audio/ogg;codecs=opus']
     .find(t=>MediaRecorder.isTypeSupported?.(t));
   const rec=new MediaRecorder(stream,mime?{mimeType:mime}:undefined);
   microphoneRecorder=rec;
   const chunks=[];const started=Date.now();
   rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
   rec.onstop=async()=>{
    if(microphoneTimer)clearTimeout(microphoneTimer);
    stream.getTracks().forEach(t=>t.stop());microphoneStream=null;microphoneRecorder=null;
    $('aiTestMicrophone').textContent='🎙 Probar micrófono';
    const ms=Date.now()-started,blob=new Blob(chunks,{type:rec.mimeType||'audio/webm'});
    if(ms<850||blob.size<500){
     micMessage('Grabación demasiado corta: '+ms+' ms, '+blob.size+' bytes. Hablá 3–5 segundos y volvé a tocar Detener.','error');return;
    }
    micMessage('Grabación lista: '+(ms/1000).toFixed(1)+' s, '+(blob.size/1024).toFixed(0)+
     ' KB, '+blob.type+'. Enviando al modelo de transcripción...');
    try{
     const response=await fetch('/api/voice/transcribe',{method:'POST',credentials:'same-origin',
      headers:{'Content-Type':blob.type,'X-AI-Provider':providerFor('stt')},body:blob});
     const result=await response.json().catch(()=>({error:'Respuesta no JSON'}));
     if(!response.ok){
      micMessage((result.upstreamStatus?'OpenAI HTTP '+result.upstreamStatus:'GastosApp HTTP '+response.status)+
       ' · '+(result.code||'error')+': '+(result.error||'Error sin detalle')+
       (result.hint?' · SOLUCIÓN: '+result.hint:''),'error');
      return;
     }
     const finished=await waitTask(result.data,call,message=>micMessage(message));
     micMessage('Transcripción exitosa · HTTP '+(finished.httpStatus||response.status)+' · '+finished.model+
      ' · TEXTO: «'+finished.text+'». Si el texto no coincide con tu dictado, el micrófono o el reconocimiento requieren ajustes.','ok');
    }catch(e){micMessage('No pude llegar al servidor desde este navegador: '+e.message+'. Revisá Internet, HTTPS y servidor.','error');}
   };
   rec.onerror=e=>micMessage('Error al grabar: '+(e.error?.message||'El micrófono dejó de responder.'),'error');
   rec.start();
   microphoneTimer=setTimeout(()=>{if(rec.state==='recording')rec.stop();},15000);
   $('aiTestMicrophone').textContent='■ Detener grabación';
   micMessage('Grabando con '+(rec.mimeType||'formato automático')+
     '. Decí «probando uno dos tres» y tocá Detener. Se detiene automáticamente a los 15 s.');
  }catch(e){
   micMessage(e.name==='NotAllowedError'?'Permiso de micrófono denegado. Habilitalo desde el candado del navegador.':
    e.name==='NotFoundError'?'No hay micrófono disponible. Revisá conexiones y permisos.':
    'Error al iniciar micrófono: '+e.message,'error');
  }
 }
 $('aiTestMicrophone').addEventListener('click',()=>void microphoneTest());
 $('aiVoiceSelect').addEventListener('change',chooseVoice);
 $('aiPreviewVoice').addEventListener('click',previewVoice);
 return {load};
}
