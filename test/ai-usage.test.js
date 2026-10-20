import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createUsageLedger,tokenUsage,errorCategory,paidEquivalentUsd} from '../lib/ai-usage.js';

const date=new Date('2026-10-20T15:00:00.000Z');
const now=()=>date;
test('Gemini retorna tokens reales de prompt, respuesta y razonamiento',()=>{
 const u=tokenUsage('gemini',{usageMetadata:{promptTokenCount:350,candidatesTokenCount:120,thoughtsTokenCount:80,cachedContentTokenCount:40}});
 assert.deepEqual(u,{input:350,output:200,thought:80,cached:40});
 assert.equal(paidEquivalentUsd('gemini-3.8-flash',u),(350*.75+200*3.75)/1e6);
});
test('Gemini Interactions TTS usa usage con input, output y tokens de audio',()=>{
 const u=tokenUsage('gemini',{usage:{total_input_tokens:36,total_output_tokens:800,total_thought_tokens:0,
  input_tokens_by_modality:[{modality:'text',tokens:36}],output_tokens_by_modality:[{modality:'audio',tokens:800}]}},'tts');
 assert.equal(u.input,36);assert.equal(u.output,800);assert.equal(u.audioOutput,800);
 assert.equal(paidEquivalentUsd('gemini-3.8-flash-tts',u),(36*.5+800*9)/1e6);
});
test('OpenAI usa prompt_tokens / completion_tokens, sin inventar TTS binario',()=>{
 const u=tokenUsage('openai',{usage:{prompt_tokens:130,completion_tokens:65,completion_tokens_details:{reasoning_tokens:9}}});
 assert.equal(u.input,130);assert.equal(u.output,65);assert.equal(u.thought,9);
 assert.equal(tokenUsage('openai',null,'tts'),null);
 assert.equal(tokenUsage('openai',{usage:{prompt_tokens:null,completion_tokens:10}}).input,null);
});
test('clasifica saldo agotado, cuota gratis, límites transitorios y disponibilidad',()=>{
 assert.equal(errorCategory('openai',429,'credit_balance_exhausted','You have no credits remaining').kind,'credits');
 assert.equal(errorCategory('gemini',429,'too_many_requests','limit: 10 requests per day on Free Tier').kind,'free_quota');
 assert.equal(errorCategory('gemini',503,'UNAVAILABLE','High demand').kind,'unavailable');
 assert.equal(errorCategory('gemini',429,'RESOURCE_EXHAUSTED','Rate limit exceeded').kind,'quota');
 assert.equal(errorCategory('openai',401,'invalid_api_key','').kind,'permissions');
});
test('historial persiste en disco, separa días y no guarda prompts ni claves',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gastosapp-meter-'));
 try{
  const first=createUsageLedger({dir,now});
  first.record({provider:'gemini',model:'gemini-3.5-flash-lite',service:'nlu',
   usage:{usageMetadata:{promptTokenCount:100,candidatesTokenCount:50,thoughtsTokenCount:20}}});
  first.record({provider:'gemini',model:'gemini-3.8-flash-tts',service:'tts',
   error:{status:502,upstreamStatus:429,providerCode:'too_many_requests',
   message:'Rate limit exceeded: limit 10 requests per day on Free Tier. Please retry in 16h13m59s'}});
  first.record({provider:'openai',model:'gpt-4o-mini-tts',service:'tts',usage:null});
  const second=createUsageLedger({dir,now});
  const data=second.report('today');
  assert.equal(data.summary.requests,3);
  assert.equal(data.summary.success,2);
  assert.equal(data.summary.failed,1);
  assert.equal(data.summary.input,100);assert.equal(data.summary.output,70);
  assert.equal(data.summary.metered,1);assert.equal(data.summary.unmetered,1);
  assert.equal(data.recentIssues[0].kind,'free_quota');
  assert.equal(data.recentIssues[0].retryAfter,'16h13m59s');
  const raw=fs.readFileSync(path.join(dir,'ai-usage.json'),'utf8');
  assert.equal(raw.includes('API_KEY'),false);
  assert.equal(raw.includes('Rate limit exceeded'),false);
  assert.equal(second.report('month').summary.requests,3);
  assert.equal(second.report('all').summary.requests,3);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('no afirma cobrar dinero cuando modelo no tiene tarifa ni metadatos',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gastosapp-meter-'));
 try{
  const meter=createUsageLedger({dir,now});
  meter.record({provider:'gemini',model:'modelo-nuevo',service:'nlu',
   usage:{usageMetadata:{promptTokenCount:120,candidatesTokenCount:30}}});
  meter.record({provider:'openai',model:'gpt-4o-mini-tts',service:'tts'});
  const data=meter.report('all');
  assert.equal(data.summary.estimatedUsd,0);
  assert.equal(data.summary.unpriced,1);
  assert.equal(data.summary.unmetered,1);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
