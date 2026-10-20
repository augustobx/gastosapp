// Cliente REST Gemini API, sin SDK, basado en documentación oficial de Google AI:
// https://ai.google.dev/api/generate-content
// https://ai.google.dev/gemini-api/docs/generate-content/audio
// https://ai.google.dev/gemini-api/docs/speech-generation
// Gemini 3.8 Flash: texto JSON y audio de entrada (generateContent).
// Gemini 3.8 Flash TTS: respuesta WAV vía Interactions API.
import {chatSystemPrompt,normalizeChatTurn,responseFormat,localToday} from './ai-chat.js';
import {silentWav} from './openai-health.js';

export const GEMINI_MODELS=Object.freeze({
  nlu:'gemini-3.8-flash',
  stt:'gemini-3.8-flash',
  tts:'gemini-3.8-flash-tts',
  ttsLite:'gemini-3.8-flash-lite-tts'
});
export const GEMINI_VOICES=['Kore','Puck','Aoede','Leda','Callirrhoe','Zephyr','Charon','Fenrir','Orus','Algieba'];
const base='https://generativelanguage.googleapis.com/v1beta';
export function googleError(status,body={}){
 const err=body.error||{};
 const code=String(err.status||err.code||'gemini_error').slice(0,90);
 const message=String(err.message||'Google devolvió un error sin detalle.').replace(/AIza[a-zA-Z0-9_-]+/g,'[CLAVE OCULTA]').slice(0,270);
 const hint=status===400?'Revisá el formato de audio o la compatibilidad del modelo.':
 status===401||status===403?'Revisá la clave Gemini, permisos de proyecto y restricciones en Google AI Studio.':
 status===404?'Modelo Gemini no disponible para esta clave o región. Revisá los modelos visibles en Google AI Studio.':
 status===429?'Límite de solicitudes/cuota Gemini alcanzado. Consultá cuotas y facturación en AI Studio.':
 status>=500?'Error temporal del servicio Google. Reintentá.':
 'Revisá los permisos, la clave y el estado del servicio Gemini.';
 return Object.assign(new Error('Gemini HTTP '+status+' · '+code+': '+message),{
  status:502,upstreamStatus:status,providerCode:code,hint,provider:'gemini'
 });
}
export async function googleRequest(endpoint,{key,body,method='POST',timeoutMs=30000,fetcher=fetch}={}){
 if(!key)throw Object.assign(new Error('GEMINI_API_KEY no configurada en el servidor.'),{
  status:503,code:'missing_gemini_key',hint:'Generá tu clave en aistudio.google.com/apikey, agregala a .env y recreá GastosApp.'
 });
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
 try{
  let r;try{
   r=await fetcher(base+endpoint,{method,headers:{
    'x-goog-api-key':key,...(body?{'Content-Type':'application/json'}:{})},
    ...(body?{body:JSON.stringify(body)}:{}),signal:controller.signal});
  }catch(e){
   if(e.name==='AbortError')throw Object.assign(new Error('Gemini agotó el tiempo de espera.'),{status:504,code:'gemini_timeout'});
   throw Object.assign(new Error('No fue posible conectar a Google Gemini: '+(e.cause?.code||e.message)),{
    status:502,code:'gemini_network',hint:'Revisá DNS/TLS y salida HTTPS desde Docker hacia generativelanguage.googleapis.com.'
   });
  }
  let json;try{json=await r.json();}catch{
   throw Object.assign(new Error('Gemini devolvió HTTP '+r.status+' pero no JSON válido.'),{status:502,code:'gemini_invalid_json'});
  }
  if(!r.ok)throw googleError(r.status,json);
  return {json,httpStatus:r.status};
 }finally{clearTimeout(timer);}
}
export function modelText(json){
 const parts=json?.candidates?.[0]?.content?.parts||[];
 const text=parts.filter(p=>typeof p.text==='string').map(p=>p.text).join('\n').trim();
 if(!text)throw Object.assign(new Error('Gemini respondió sin texto. Revisá filtros y disponibilidad del modelo.'),{
  status:502,code:'gemini_empty_text'});
 return text;
}
export async function geminiChatTurn({text,accounts,items,phase,key,model=GEMINI_MODELS.nlu,today=localToday(),fetcher=fetch}){
 if(typeof text!=='string'||!text.trim()||text.length>850)throw new Error('Decime hasta 850 caracteres.');
 if(!Array.isArray(items)||items.length>25)throw new Error('Tanda demasiado grande.');
 const {json}=await googleRequest('/models/'+encodeURIComponent(model)+':generateContent',{
  key,fetcher,body:{
   systemInstruction:{parts:[{text:chatSystemPrompt({accounts,items,phase,today})}]},
   contents:[{role:'user',parts:[{text}]}],
   generationConfig:{
    temperature:0.15,maxOutputTokens:2200,
    responseFormat:{text:{mimeType:'APPLICATION_JSON',schema:responseFormat.json_schema.schema}}
   }
  },timeoutMs:35000
 });
 let parsed;
 try{parsed=JSON.parse(modelText(json));}catch{
  throw Object.assign(new Error('Gemini no devolvió una respuesta JSON interpretable.'),{status:502,code:'gemini_bad_json'});
 }
 return normalizeChatTurn(parsed,{accounts,items,today});
}
export async function geminiTranscribe({bytes,mime,key,model=GEMINI_MODELS.stt,fetcher=fetch}){
 if(!Buffer.isBuffer(bytes)||bytes.length<500||bytes.length>8_000_000)throw new Error('Audio vacío o muy grande.');
 const cleanMime=String(mime||'audio/webm').split(';')[0].toLowerCase();
 const supported=['audio/wav','audio/webm','audio/mp4','audio/ogg','audio/mpeg','audio/mp3','audio/aac','audio/flac','audio/x-wav'];
 if(!supported.includes(cleanMime))throw Object.assign(new Error('Gemini no admite este formato: '+cleanMime),{status:415,code:'unsupported_audio'});
 const {json}=await googleRequest('/models/'+encodeURIComponent(model)+':generateContent',{
  key,fetcher,body:{
   contents:[{role:'user',parts:[
    {text:'Transcribí literalmente este audio hablado en español argentino. Devolvé solamente las palabras escuchadas, sin comentarios ni reformulación. Preservá los nombres propios y la cantidad exacta de ceros de los importes en pesos. Si no hay voz, respondé con una cadena vacía.'},
    {inlineData:{mimeType:cleanMime==='audio/x-wav'?'audio/wav':cleanMime,data:bytes.toString('base64')}}
   ]}],
   generationConfig:{temperature:0,maxOutputTokens:1200}
  },timeoutMs:35000
 });
 return {text:modelText(json).trim(),model,httpStatus:200};
}
export async function geminiSpeech({text,voice='Kore',key,model=GEMINI_MODELS.tts,fetcher=fetch}){
 if(!GEMINI_VOICES.includes(voice))throw Object.assign(new Error('Voz Gemini no habilitada.'),{status:400});
 const {json}=await googleRequest('/interactions',{
  key,fetcher,timeoutMs:40000,
  body:{model,input:[{type:'user_input',content:[{
   type:'text',text:String(text).slice(0,620),
   annotations:[{type:'speech_metadata',style:'Hablar en español de Argentina, de manera cercana y cálida, con ritmo conversacional, natural y sin sonar como locutor.'}]
  }]}],
  response_format:{type:'audio'},
  generation_config:{speech_config:[{voice}]}}
 });
 const chunks=(json.steps||[]).filter(s=>s.type==='model_output').flatMap(s=>s.content||[]).filter(c=>c.type==='audio'&&typeof c.data==='string');
 const part=chunks.at(-1);
 if(!part)throw Object.assign(new Error('Gemini TTS respondió sin audio. Revisá el modelo y la cuota.'),{status:502,code:'gemini_empty_audio'});
 const wav=Buffer.from(part.data,'base64');
 if(wav.length<100||wav.toString('ascii',0,4)!=='RIFF')throw Object.assign(new Error('Gemini devolvió audio sin encabezado WAV válido.'),{status:502,code:'gemini_invalid_wav'});
 return {bytes:wav,mime:'audio/wav',model,httpStatus:200};
}
export async function geminiNetwork({key,fetcher=fetch}){
 const start=Date.now();const {httpStatus}=await googleRequest('/models',{key,method:'GET',fetcher,timeoutMs:12000});
 return {provider:'gemini',httpStatus,detail:'El servidor conectó con Gemini y aceptó la clave. No garantiza cuota de generación.',latencyMs:Date.now()-start};
}
export async function geminiDiagnostic(service,{key,model,voice='Kore',fetcher=fetch}){
 const start=Date.now();
 if(service==='nlu'){
  const result=await googleRequest('/models/'+encodeURIComponent(model)+':generateContent',{
   key,fetcher,body:{contents:[{parts:[{text:'Respondé solamente OK.'}]}],generationConfig:{maxOutputTokens:25}},timeoutMs:30000});
  modelText(result.json);
  return {provider:'gemini',service,model,httpStatus:result.httpStatus,passed:true,latencyMs:Date.now()-start,detail:'Modelo Gemini de conversación respondió.'};
 }
 if(service==='stt'){
  const bytes=silentWav();
  const result=await googleRequest('/models/'+encodeURIComponent(model)+':generateContent',{
   key,fetcher,body:{contents:[{parts:[{text:'¿Hay voz en este audio? Respondé OK si podés procesar el formato.'},
    {inlineData:{mimeType:'audio/wav',data:bytes.toString('base64')}}]}],
    generationConfig:{maxOutputTokens:40}},timeoutMs:30000});
  modelText(result.json);
  return {provider:'gemini',service,model,httpStatus:result.httpStatus,passed:true,latencyMs:Date.now()-start,
   detail:'Audio WAV de prueba aceptado por Gemini (silencio sintético). No sustituye la prueba de micrófono.'};
 }
 if(service==='tts'){
  await geminiSpeech({text:'Hola, soy GastosApp. ¿Cómo andás?',voice,key,model,fetcher});
  return {provider:'gemini',service,model,httpStatus:200,passed:true,latencyMs:Date.now()-start,detail:'Gemini generó audio WAV válido.'};
 }
 throw Object.assign(new Error('Servicio Gemini inválido.'),{status:404});
}
