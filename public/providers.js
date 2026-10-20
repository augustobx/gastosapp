// Elección de proveedor por función en este navegador. Las claves quedan en el servidor.
const storeKey='gastosapp-provider-';
export const providerFor=(service)=>{
  const value=localStorage.getItem(storeKey+service);
  return value==='gemini'||value==='openai'?value:(localStorage.getItem('gastosapp-provider-default')||'openai');
};
export const saveProvider=(service,provider)=>{
  if(['nlu','stt','tts'].includes(service)&&['gemini','openai'].includes(provider))
    localStorage.setItem(storeKey+service,provider);
};
export const voiceFor=(provider)=>localStorage.getItem('gastosapp-tts-voice:'+provider)
  ||(provider==='gemini'?'Kore':'marin');
export const saveVoice=(provider,voice)=>{
  if(['gemini','openai'].includes(provider)&&typeof voice==='string')
    localStorage.setItem('gastosapp-tts-voice:'+provider,voice);
};
