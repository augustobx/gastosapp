// Only loaded by the mock integration test child process, never in production.
const wav=Buffer.alloc(256);wav.write('RIFF',0);
const mocked=(json)=>({ok:true,status:200,headers:{get:()=>null},json:async()=>json});
globalThis.fetch=async (url,opts={})=>{
  if(!String(url).startsWith('https://generativelanguage.googleapis.com/'))throw new Error('Unexpected external URL');
  if(String(url).endsWith('/interactions'))return mocked({steps:[{type:'model_output',content:[{type:'audio',data:wav.toString('base64')}]}]});
  if(opts.method==='GET')return mocked({models:[]});
  const body=JSON.parse(opts.body||'{}');
  const hasAudio=JSON.stringify(body).includes('inlineData');
  const isChat=String(body.systemInstruction?.parts?.[0]?.text||'').includes('asistente de gastos');
  const text=isChat?JSON.stringify({action:'greet',reply:'Te escucho.',items:[],index:null}):hasAudio?'probando uno dos tres':'OK';
  return mocked({candidates:[{content:{parts:[{text}]}}]});
};