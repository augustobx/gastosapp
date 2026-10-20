// Diagnóstico visible por modelo: nunca pedir ni mostrar la clave API.
export function setupAIDiagnostics(){
 const $=id=>document.getElementById(id);
 const label={nlu:'Nlu',stt:'Stt',tts:'Tts'};
 const names={nlu:'Interpretación',stt:'Transcripción',tts:'Voz natural'};
 let config=null,playerUrl=null,busy=false;
 const voiceKey='gastosapp-tts-voice';
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
  const data=await response.json().catch(()=>({error:'Respuesta no JSON de GastosApp.',code:'invalid_json'}));
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
   $('aiModelNlu').textContent=config.nlu;
   $('aiModelStt').textContent=config.stt;
   $('aiModelTts').textContent=config.tts;
   const saved=localStorage.getItem(voiceKey);
   $('aiVoiceSelect').value=config.voices?.includes(saved)?saved:config.defaultVoice||'marin';
   if(config.configured){
     $('aiConnectionState').textContent='API configurada · sin verificar modelos';
     note('La clave está configurada en el servidor. Probá cada modelo para confirmar permisos, crédito y conectividad.');
   }else{
     $('aiConnectionState').textContent='Sin API Key';
     note('La API Key no llegó al contenedor. Revisá OPENAI_API_KEY en /opt/apps/gastosapp/.env y recreá solo web. Nunca la pegues en el chat.','error');
   }
   for(const id of ['aiTestNlu','aiTestStt','aiTestTts','aiTestAll','aiPreviewVoice'])$(id).disabled=!config.configured;
  }catch(error){
   $('aiConnectionState').textContent='No se pudo consultar';
   note('No pudimos leer la configuración: '+(error.error||error.message||'Error inesperado')+
     '. Iniciá sesión o revisá los logs de GastosApp.','error');
  }
 }
 async function testOne(service){
  if(busy)return false;
  busy=true;const suffix=label[service],btn=$('aiTest'+suffix);
  btn.disabled=true;setState(service,'testing','Enviando petición real a OpenAI...');
  try{
   const result=await call('/api/ai/diagnostics/'+service,{voice:$('aiVoiceSelect').value});
   setState(service,'ok',result.detail+' Modelo: '+result.model+' · '+result.latencyMs+' ms');
   return true;
  }catch(error){
   const upstream=error.upstreamStatus?('OpenAI HTTP '+error.upstreamStatus):('GastosApp HTTP '+(error.httpStatus||'sin respuesta'));
   const detail=upstream+' · '+(error.code||'error_desconocido')+' · '+(error.error||'Error sin detalle')+
     (error.hint?' · SOLUCIÓN: '+error.hint:'')+
     (error.requestId?' · OpenAI request ID: '+error.requestId:'');
   setState(service,'fail',detail);
   note('Falló '+names[service]+'. '+detail,'error');
   return false;
  }finally{busy=false;btn.disabled=false;}
 }
 async function testAll(){
  $('aiTestAll').disabled=true;note('Ejecutando pruebas reales, una por vez. Pueden consumir créditos...');
  const list=[];
  for(const service of ['nlu','stt','tts'])list.push(await testOne(service));
  const passed=list.filter(Boolean).length;
  $('aiConnectionState').textContent=passed+'/3 modelos HTTP 200';
  note(passed===3?'Los tres modelos respondieron correctamente. Probá ahora tu micrófono y escuchá la voz.':
    passed+' de 3 modelos respondieron HTTP 200. Revisá debajo el error específico de cada modelo.',passed===3?'ok':'error');
  $('aiTestAll').disabled=false;
 }
 function chooseVoice(){
  localStorage.setItem(voiceKey,$('aiVoiceSelect').value);
  voiceNote('Voz «'+$('aiVoiceSelect').value+'» elegida. Para comprobarla, tocá «Escuchar voz real». La selección también se usa en el chat.','ok');
 }
 async function previewVoice(){
  const btn=$('aiPreviewVoice');btn.disabled=true;
  voiceNote('Solicitando voz «'+$('aiVoiceSelect').value+'» al modelo. Esperá unos segundos.','neutral');
  if(playerUrl){URL.revokeObjectURL(playerUrl);playerUrl=null;}
  try{
   const r=await fetch('/api/chat/speech',{method:'POST',credentials:'same-origin',
    headers:{'Content-Type':'application/json'},body:JSON.stringify({text:'Hola, ¿cómo andás? Soy tu asistente de GastosApp. Contame tus gastos y los organizamos juntos.',voice:$('aiVoiceSelect').value})});
   if(!r.ok){
    const error=await r.json().catch(()=>({error:'Respuesta no válida'}));
    voiceNote((error.upstreamStatus?'OpenAI HTTP '+error.upstreamStatus:'GastosApp HTTP '+r.status)+
      ' · '+(error.code||'error')+': '+error.error+(error.hint?' · '+error.hint:''),'error');return;
   }
   const blob=await r.blob();playerUrl=URL.createObjectURL(blob);
   const player=$('aiVoicePlayer');player.src=playerUrl;player.classList.remove('hidden');
   voiceNote('OpenAI HTTP 200: audio generado correctamente con voz '+$('aiVoiceSelect').value+'. Si no se reproduce automáticamente, tocá ▶ en el reproductor.','ok');
   try{await player.play();}catch{/* El usuario puede reproducir con controles nativos */}
  }catch(e){voiceNote('No se pudo descargar/reproducir la muestra: '+e.message+'. Revisá HTTPS, red y permisos de reproducción.');}
  finally{btn.disabled=false;}
 }
 for(const service of ['nlu','stt','tts'])$('aiTest'+label[service]).addEventListener('click',async()=>{
  const success=await testOne(service);$('aiConnectionState').textContent=success?names[service]+': HTTP 200':'Ver detalle del fallo';
 });
 $('aiRefreshSettings').addEventListener('click',load);
 $('aiTestAll').addEventListener('click',testAll);
 $('aiVoiceSelect').addEventListener('change',chooseVoice);
 $('aiPreviewVoice').addEventListener('click',previewVoice);
 return {load};
}
