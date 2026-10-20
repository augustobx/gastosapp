import test from 'node:test';
import assert from 'node:assert/strict';
import {voiceFailure,spokenExcerpt} from '../public/voice-errors.js';

test('Cloudflare 502 HTML se identifica con detalle, no como error genérico',async()=>{
 const response=new Response('<html><title>502 Bad Gateway</title><body>Cloudflare error</body></html>',{
  status:502,headers:{'Content-Type':'text/html; charset=utf-8'}
 });
 const e=await voiceFailure(response);
 assert.equal(e.httpStatus,502);
 assert.match(e.message,/Cloudflare \/ proxy HTTP 502/);
 assert.match(e.message,/502 Bad Gateway/);
 assert.match(e.message,/Content-Type/);
 assert.doesNotMatch(e.message,/Sin detalle del servidor/);
});
test('Gemini 503 JSON muestra proveedor, estado, código y solución',async()=>{
 const response=new Response(JSON.stringify({
  provider:'gemini',upstreamStatus:503,code:'UNAVAILABLE',
  error:'Gemini HTTP 503: High demand',hint:'Reintentá más tarde.'
 }),{status:502,headers:{'Content-Type':'application/json','X-GastosApp-Backend':'node'}});
 const e=await voiceFailure(response,'Prueba TTS');
 assert.equal(e.code,'UNAVAILABLE');
 assert.match(e.message,/Gemini HTTP 503/);
 assert.match(e.message,/High demand/);
 assert.match(e.message,/Reintentá más tarde/);
});
test('error interno JSON 502 no se confunde con proxy y muestra causa',async()=>{
 const r=new Response(JSON.stringify({error:'La síntesis superó su límite',code:'gemini_timeout'}),{
  status:502,headers:{'content-type':'application/json','x-gastosapp-backend':'node'}
 });
 const e=await voiceFailure(r);
 assert.match(e.message,/GastosApp HTTP 502/);
 assert.match(e.message,/gemini_timeout/);
 assert.match(e.message,/límite/);
});
test('respuesta HTML vacía se identifica como error de proxy',async()=>{
 const r=new Response('',{status:504,headers:{'content-type':'text/html'}});
 const e=await voiceFailure(r);assert.match(e.message,/proxy HTTP 504/);
 assert.match(e.message,/respuesta vacía/);
});
test('solo sintetizar respuesta corta, sin truncar cifra ni imprimir resumen completo',()=>{
 assert.equal(spokenExcerpt('Hola, ¿cómo andás?'),'Hola, ¿cómo andás?');
 const msg='Anoté tres movimientos. '+Array.from({length:35},()=> 'El gasto de 980000 pesos está pendiente.').join(' ');
 const output=spokenExcerpt(msg,200);
 assert.ok(output.length<280);
 assert.match(output,/pantalla/);
 assert.ok(output.startsWith('Anoté tres movimientos.'));
});
