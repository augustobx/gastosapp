// Errores de síntesis reproducibles y seguros, sin ocultar respuestas HTML del proxy.
const clean = value => String(value || '').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim().slice(0,180);
export async function voiceFailure(response,operation='Voz natural'){
 const status=Number(response?.status||0);
 const type=String(response?.headers?.get('content-type')||'sin Content-Type');
 const backend=String(response?.headers?.get('x-gastosapp-backend')||'');
 const providerHeader=String(response?.headers?.get('x-gastosapp-tts-provider')||'');
 let text='';
 try{text=await response.text();}catch{}
 let body={};
 try{body=JSON.parse(text);}catch{}
 const provider=body.provider||providerHeader;
 const upstream=Number(body.upstreamStatus||0);
 const where=upstream?(provider==='gemini'?'Gemini':provider==='openai'?'OpenAI':'Proveedor')+' HTTP '+upstream:
   (!backend&&[502,503,504].includes(status)?'Cloudflare / proxy HTTP ':'GastosApp HTTP ')+status;
 const code=String(body.code||(backend?'server_non_json':'gateway_non_json'));
 const detail=String(body.error||body.message||(text?clean(text):'El servidor devolvió una respuesta vacía.'));
 const hint=body.hint||(!backend&&[502,503,504].includes(status)?
  'El proxy devolvió '+type+'. Revisá docker logs --tail 60 gastosapp-web y los registros de Nginx Proxy Manager.':
  'Abrí Configuración y probá la voz natural; revisá los logs de gastosapp-web.');
 const error=new Error(operation+': '+where+' · '+code+' · '+detail+
   (hint?' · SOLUCIÓN: '+hint:'')+
   (body.requestId?' · ID solicitud: '+body.requestId:''));
 error.code=code;error.httpStatus=status;error.provider=provider||null;
 return error;
}
export function spokenExcerpt(value,maxLength=200){
 const original=String(value||'').replace(/\s+/g,' ').trim();
 if(original.length<=maxLength)return original;
 const cut=original.slice(0,maxLength);
 const point=Math.max(cut.lastIndexOf('. '),cut.lastIndexOf('? '),cut.lastIndexOf('! '));
 return (point>=55?cut.slice(0,point+1):cut.slice(0,cut.lastIndexOf(' ')>55?cut.lastIndexOf(' '):maxLength)).trim()+
   ' El resto está escrito en la pantalla.';
}
