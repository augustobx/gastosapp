import { isoDay } from './engine.js';

const categories = new Set(['Comida','Transporte','Servicios','Hogar','Salud','Educación','Entretenimiento','Tecnología','Indumentaria','Deudas y préstamos','Otros','Sueldo','Extra','Ventas']);
const actions = new Set(['add','edit','remove','review','confirm','greet','clarify','reset']);
const itemSchema = {
 type:'object', additionalProperties:false,
 properties:{
  type:{type:'string',enum:['expense','income']},
  title:{type:'string'}, amount:{type:'number'},
  date:{type:'string'}, dueDate:{type:['string','null']}, category:{type:'string'},
  accountId:{type:['string','null']}, installmentCount:{type:'integer'},
  isPaid:{type:'boolean'},isRecurring:{type:'boolean'},notes:{type:'string'}
 },
 required:['type','title','amount','date','dueDate','category','accountId','installmentCount','isPaid','isRecurring','notes']
};
export const responseFormat = {
 type:'json_schema',json_schema:{name:'gastos_chat_turn',strict:true,schema:{
 type:'object',additionalProperties:false,
 properties:{
  action:{type:'string',enum:[...actions]},
  reply:{type:'string'},
  items:{type:'array',items:itemSchema},
  index:{type:['integer','null']}
 },
 required:['action','reply','items','index']
 }}
};
export function localToday(){
 return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
}
export function chatSystemPrompt({accounts,today=localToday(),phase='collect',items=[]}){
 const [y,m]=today.split('-').map(Number);
 const end=new Date(y,m,0);
 const last=[end.getFullYear(),String(end.getMonth()+1).padStart(2,'0'),String(end.getDate()).padStart(2,'0')].join('-');
 const available=accounts.map(a=>({id:a.id,name:a.name,kind:a.kind}));
 const history=items.slice(0,25).map((i,j)=>({number:j+1,title:i.title,amount:i.amount,date:i.date,dueDate:i.dueDate,isPaid:i.isPaid,accountId:i.accountId,type:i.type}));
 return [
  'Sos el asistente de gastos de NanoLabs en Argentina. Entendés conversación espontánea argentina, incluso dictados desordenados, con varias compras/gastos en la misma intervención.',
  'Respondé SOLO en el JSON schema requerido. No inventes gastos, precios, fechas, cuentas ni pagos. Nada de consejos financieros. La fecha local es '+today+' y fin de ESTE mes es '+last+'.',
  'ESTADO conversacional: '+phase+'. Movimiento(s) todavía SIN GUARDAR: '+JSON.stringify(history)+'.',
  'Cuentas existentes (usar solo IDs explícitamente mencionados): '+JSON.stringify(available)+'.',
  'Acciones: add agrega UNO O VARIOS items del mensaje; edit reemplaza COMPLETO el item existente señalado por index (índice basado en 0) y lleva 1 item; remove quita item por index; review cuando dice "nada más", termina o quiere repasar; confirm ante afirmación explícita a la pregunta de confirmar; reset descarta toda la tanda cuando lo pide; greet para hablar sin movimientos; clarify para pedir un dato que realmente falta.',
  'IMPORTANTÍSIMO: si el usuario dice tres gastos en una misma frase, action=add e items=[tres objetos]. Detectá cortes por nombres y cantidades. Por ejemplo: "bueno primero 980000 a Juana pago único a fin de mes 160 000 a Personal también a fin de mes y 300 000 supermercado a fin de mes" genera tres items distintos (Juana 980000, Personal 160000, Supermercado 300000), todos gastos pendientes con vencimiento fin de mes y sin medio de pago.',
  '890 000 = 890000 pesos; 980000 = 980000; 160 000 = 160000; 15 lucas=15000; 3 gambas=300; 1 palo=1000000. "pago único" = installmentCount 1 y NO significa ya pagado. "tengo que pagar", "a fin de mes", "vence", "me falta pagar" => isPaid false. "pagué", "ya pagué", "me cobraron" => true salvo contradicción explícita.',
  'Fecha date=fecha de registro/compra, por defecto HOY, dueDate=vencimiento futuro si se expresa. Si dice "a fin de mes" poner dueDate '+last+'. "Crédito" como deuda a cancelar NO es un método de tarjeta de crédito. Si no dice medio de pago, accountId=null. Para cuotas >1, solo tarjeta de crédito explícita; si no la menciona usá clarify. "Personal" puede ser empresa de telefonía: categoría Servicios y título Personal.',
  'Si un mensaje corrige un movimiento existente, action=edit e index y item completo (copiá los valores no mencionados del historial). En "el segundo eran 170 mil, no 160" actualizá solo segundo. No corrijas arbitrariamente movimientos no identificables; usá clarify.',
  'Si el usuario no dijo importes suficientes para un movimiento, no crees un importe inventado: clarify y explicá qué falta. Si entendiste solo algunos de varios, priorizá no perder información y pedí aclaración antes de inventar.',
  'reply es una respuesta conversacional breve en español de Argentina, cálida y sin rigidez (máximo 240 caracteres). Si action=add, indicá cantidad agregada y preguntá si hay más. No repitas toda la lista en cada mensaje. Al revisar, la interfaz leerá y mostrará el resumen completo.',
  'Nunca decidas guardar tú mismo; solo la interfaz puede guardar luego de la confirmación explícita del usuario.'
 ].join('\n');
}
function validDay(value){
 if(typeof value!=='string'||! /^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const [y,m,d]=value.split('-').map(Number);const v=new Date(y,m-1,d);
 return v.getFullYear()===y && v.getMonth()===m-1 && v.getDate()===d;
}
function cleanItem(row,accounts,today){
 if(!row||typeof row!=='object')throw new Error('La IA propuso un movimiento inválido.');
 const amount=Number(row.amount),installmentCount=Number(row.installmentCount);
 const accountId=row.accountId || null;
 const account=accounts.find(a=>a.id===accountId);
 if(!Number.isFinite(amount)||amount<=0||amount>1e12)throw new Error('No se pudo confirmar uno de los importes. Decímelo otra vez.');
 if(!['expense','income'].includes(row.type))throw new Error('No se identificó el tipo de movimiento.');
 if(typeof row.title!=='string'||!row.title.trim()||row.title.length>140)throw new Error('Necesito confirmar el concepto de uno de los gastos.');
 if(!validDay(row.date))throw new Error('Fecha de registro inválida: revisá el movimiento.');
 if(row.dueDate!==null&&row.dueDate!==undefined&&!validDay(row.dueDate))throw new Error('No pude identificar el vencimiento.');
 if(!Number.isInteger(installmentCount)||installmentCount<1||installmentCount>60)throw new Error('Cantidad de cuotas no válida.');
 if(accountId&&!account)throw new Error('La IA eligió un medio no registrado. Revisalo.');
 if(installmentCount>1&&account?.kind!=='credit')throw new Error('Las cuotas necesitan una tarjeta de crédito explícita.');
 if(row.type==='income'&&(installmentCount!==1||row.dueDate||row.isRecurring))throw new Error('Ingreso con vencimiento o cuotas: revisá el detalle.');
 if(row.isRecurring&&(installmentCount!==1||account?.kind==='credit'))throw new Error('No se puede combinar gasto fijo y cuotas.');
 // Las fechas futuras NO son pagos realizados si no se indicó lo contrario.
 return {
  type:row.type,title:row.title.trim(),amount:Math.round(amount*100)/100,date:row.date||today,
  dueDate:row.dueDate||null,category:categories.has(row.category)?row.category:'Otros',
  accountId,installmentCount,isPaid:row.isPaid===true,isRecurring:row.isRecurring===true,
  notes:String(row.notes||'').slice(0,450),questions:[],confidence:'review'
 };
}
export function normalizeChatTurn(payload,{accounts,items,today=localToday()}){
 if(!payload||!actions.has(payload.action))throw new Error('La IA no pudo entender la intención. Probá reformularla.');
 const action=payload.action,index=payload.index;
 const reply=typeof payload.reply==='string'?payload.reply.trim().slice(0,240):'Te escucho.';
 const raw=Array.isArray(payload.items)?payload.items:[];
 if(raw.length>10)throw new Error('Son muchos movimientos juntos. Decímelos en dos partes.');
 if(action==='add'&&(!raw.length||items.length+raw.length>25))throw new Error('No se pueden agregar más de 25 movimientos.');
 if(action==='edit'&&(raw.length!==1||!Number.isInteger(index)||index<0||index>=items.length))throw new Error('No sé cuál movimiento corregir. Decime el número.');
 if(action==='remove'&&(!Number.isInteger(index)||index<0||index>=items.length))throw new Error('¿Cuál gasto querés quitar? Decime el número.');
 if(['confirm','review'].includes(action)&&items.length===0)return {action:'clarify',reply:'Todavía no tengo gastos anotados. Contame el primero.',items:[],index:null};
 return {
  action,reply:reply||'Bien, seguimos.',index:Number.isInteger(index)?index:null,
  items:(action==='add'||action==='edit')?raw.map(t=>cleanItem(t,accounts,today)):[]
 };
}
export async function aiChatTurn({text,accounts,items,phase,key,model,fetcher=fetch,today=localToday()}){
 if(!key)throw Object.assign(new Error('Configurá OPENAI_API_KEY para el chat inteligente.'),{status:503});
 if(typeof text!=='string'||!text.trim()||text.length>850)throw new Error('Decime algo de hasta 850 caracteres.');
 if(!Array.isArray(items)||items.length>25)throw new Error('Tanda demasiado larga.');
 const safeItems=items.map(x=>cleanItem(x,accounts,today));
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),24000);
 try{
  const response=await fetcher('https://api.openai.com/v1/chat/completions',{
   method:'POST',signal:controller.signal,
   headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},
   body:JSON.stringify({
    model:model||'gpt-4o-mini',temperature:0.15,max_tokens:1800,
    response_format:responseFormat,
    messages:[{role:'system',content:chatSystemPrompt({accounts,today,phase,items:safeItems})},
      {role:'user',content:text}]
   })
  });
  if(!response.ok)throw Object.assign(new Error(response.status===429?'Límite de OpenAI alcanzado. Intentá en un rato.':'No pude contactar el modelo de IA. Revisá la clave, el saldo y los permisos.'),{status:502});
  const data=await response.json();const content=data.choices?.[0]?.message?.content;
  if(typeof content!=='string')throw new Error('El modelo no devolvió una respuesta interpretable.');
  return normalizeChatTurn(JSON.parse(content),{accounts,items:safeItems,today});
 }catch(e){
  if(e.name==='AbortError')throw Object.assign(new Error('La IA tardó demasiado. Probá otra vez.'),{status:504});
  if(e instanceof SyntaxError)throw Object.assign(new Error('La IA devolvió un resultado incompleto. Repetí la frase.'),{status:502});
  throw e;
 }finally{clearTimeout(timer);}
}
