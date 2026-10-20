import test from 'node:test';
import assert from 'node:assert/strict';
import { chatSystemPrompt,normalizeChatTurn,aiChatTurn,responseFormat } from '../lib/ai-chat.js';

const date='2026-10-19';
const accounts=[
 {id:'cash',name:'Efectivo',kind:'cash'},
 {id:'visa',name:'Visa',kind:'credit'},
 {id:'mp',name:'Mercado Pago',kind:'wallet'}
];
const expense=(title,amount,dueDate='2026-10-31',more={})=>({
 type:'expense',title,amount,date,dueDate,category:'Otros',accountId:null,
 installmentCount:1,isPaid:false,isRecurring:false,notes:'',...more
});
const args={accounts,items:[],today:date};

test('el prompt instruye separar tres gastos, respetar los miles y no inventar medio de pago',()=>{
 const p=chatSystemPrompt({accounts,today:date,phase:'collect',items:[]});
 assert.match(p,/tres items distintos/);
 assert.match(p,/160 000/);
 assert.match(p,/2026-10-31/);
 assert.match(p,/accountId=null/);
});
test('acepta tres gastos diferentes de una sola frase y mantiene cada vencimiento',()=>{
 const raw={action:'add',reply:'Anoté los tres, ¿algo más?',index:null,items:[
  expense('Juana',980000),expense('Personal',160000,'2026-10-31',{category:'Servicios'}),
  expense('Supermercado',300000,'2026-10-31',{category:'Comida'})
 ]};
 const result=normalizeChatTurn(raw,args);
 assert.equal(result.action,'add');
 assert.equal(result.items.length,3);
 assert.deepEqual(result.items.map(x=>x.amount),[980000,160000,300000]);
 assert.equal(result.items.reduce((a,b)=>a+b.amount,0),1440000);
 assert.ok(result.items.every(x=>x.isPaid===false&&x.dueDate==='2026-10-31'&&x.accountId===null));
});
test('edita sólo el segundo gasto cuando usuario corrige monto',()=>{
 const existing=[expense('Juana',980000),expense('Personal',160000),expense('Supermercado',300000)];
 const r=normalizeChatTurn({action:'edit',reply:'Corregí Personal.',index:1,
  items:[expense('Personal',170000)]},{accounts,items:existing,today:date});
 assert.equal(r.index,1);assert.equal(r.items[0].amount,170000);
 assert.equal(existing[0].amount,980000);
});
test('rechaza selección de tarjeta ficticia y cuotas sin tarjeta',()=>{
 assert.throws(()=>normalizeChatTurn({action:'add',reply:'',index:null,
  items:[expense('Algo',120000,null,{accountId:'fantasma'})]},args),/medio/);
 assert.throws(()=>normalizeChatTurn({action:'add',reply:'',index:null,
  items:[expense('Algo',120000,null,{installmentCount:3})]},args),/cuotas/);
});
test('descarta importes no válidos, acciones desconocidas, fechas imposibles y cantidades excesivas',()=>{
 for(const bad of [0,-500,NaN,Infinity]){
  assert.throws(()=>normalizeChatTurn({action:'add',reply:'',index:null,items:[expense('Algo',bad)]},args));
 }
 assert.throws(()=>normalizeChatTurn({action:'delete_all',reply:'',index:null,items:[]},args));
 assert.throws(()=>normalizeChatTurn({action:'add',reply:'',index:null,
  items:[expense('Algo',12,'2026-02-30')]},args));
 assert.throws(()=>normalizeChatTurn({action:'add',reply:'',index:null,
  items:Array.from({length:11},(_,i)=>expense('Gasto '+i,100))},args));
});
test('no confirma una tanda vacía',()=>{
 const r=normalizeChatTurn({action:'confirm',reply:'Guardar',index:null,items:[]},args);
 assert.equal(r.action,'clarify');
});
test('la solicitud de IA usa schema estricto y evita guardar por su cuenta',async()=>{
 let request;
 const mock=async(_url,options)=>{
  request=options;
  return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({action:'add',
    reply:'Bien, anoté tres gastos. ¿Alguno más?',index:null,
    items:[expense('Juana',980000),expense('Personal',160000),expense('Supermercado',300000)]
  })}}]})};
 };
 const result=await aiChatTurn({text:'980000 Juana 160000 Personal y 300000 supermercado fin de mes',
  accounts,items:[],phase:'collect',key:'test-key',today:date,fetcher:mock});
 assert.equal(result.items.length,3);
 assert.equal(responseFormat.json_schema.strict,true);
 const data=JSON.parse(request.body);
 assert.equal(data.response_format.type,'json_schema');
 assert.ok(data.messages[0].content.includes('Juana'));
 assert.equal(result.action,'add');
});
test('si falla OpenAI no inventa registros ni cae silenciosamente al parser de un solo gasto',async()=>{
 await assert.rejects(()=>aiChatTurn({text:'algo',accounts,items:[],phase:'collect',key:'',today:date}),/OPENAI_API_KEY/);
 await assert.rejects(()=>aiChatTurn({text:'algo',accounts,items:[],phase:'collect',key:'test',
  fetcher:async()=>({ok:false,status:429}),today:date}),/OpenAI HTTP 429/);
});
