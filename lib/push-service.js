import crypto from 'node:crypto';
import {project,addMonths} from './engine.js';
const dt=date=>new Intl.DateTimeFormat('en-CA',{
 timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'
}).format(date);
export const todayAR=(date=new Date())=>dt(date);
const diff=(a,b)=>Math.round((Date.parse(a+'T12:00:00Z')-Date.parse(b+'T12:00:00Z'))/86400000);
const addMonth=(month,offset)=>addMonths(month+'-01',offset,1).slice(0,7);
export function detectReminders(data,prefs,date=todayAR()){
 const month=date.slice(0,7);
 const months=[addMonth(month,-2),addMonth(month,-1),month,addMonth(month,1)];
 const unique=new Map();
 for(const m of months){
  const p=project(data,m);
  for(const r of p.rows)if(!r.isPaid&&r.type==='expense'){
   const at=r.paidDate||r.plannedDate||r.dueDate||r.date;
   unique.set(r.id,{...r,at});
  }
 }
 const rows=[...unique.values()];
 const dueSoon=rows.filter(r=>{const d=diff(r.at,date);return d>=0&&d<=prefs.daysBefore;}).length;
 const overdue=rows.filter(r=>diff(r.at,date)<0).length;
 const incomes=project(data,month).rows.filter(r=>
   r.type==='income'&&r.isRecurring&&!r.isPaid&&diff(r.date,date)<=0).length;
 const alerts=[];
 if(prefs.dueSoon&&dueSoon)alerts.push({kind:'dueSoon',count:dueSoon,day:date,
   title:'GastosApp · Próximos pagos',
   body:'Tenés pagos próximos. Abrí GastosApp para revisar tus vencimientos.'});
 if(prefs.overdue&&overdue)alerts.push({kind:'overdue',count:overdue,day:date,
   title:'GastosApp · Pagos pendientes',
   body:'Hay pagos atrasados que requieren revisión en GastosApp.'});
 if(prefs.incomePending&&incomes)alerts.push({kind:'incomePending',count:incomes,day:date,
   title:'GastosApp · Ingresos por cobrar',
   body:'Tenés ingresos fijos pendientes de confirmar este mes.'});
 return alerts;
}
const idHash=endpoint=>crypto.createHash('sha256').update(endpoint).digest('hex').slice(0,22);
export function createPushService({store,webpush,appOrigin,clock=()=>new Date(),financialState}){
 const configured=Boolean(appOrigin);
 function keys(){
  if(!configured)throw Object.assign(new Error('Configurá APP_ORIGIN para habilitar Web Push.'),{status:503});
  const vapid=store.getVapid(()=>webpush.generateVAPIDKeys());
  webpush.setVapidDetails(appOrigin,vapid.publicKey,vapid.privateKey);
  return vapid;
 }
 async function send(subscription,payload){
  keys();
  try{
   await webpush.sendNotification(subscription,JSON.stringify({
    title:payload.title,body:payload.body,url:'/?view=dashboard'
   }),{TTL:86400,urgency:'normal'});
  }catch(e){
   if([404,410].includes(e.statusCode))store.unsubscribe(subscription.endpoint);
   throw e;
  }
 }
 async function testNotification(endpoint){
  const entry=store.subscriptions().find(s=>s.endpoint===endpoint);
  if(!entry)throw Object.assign(new Error('Este dispositivo no está suscripto.'),{status:404});
  await send(entry,{title:'GastosApp · Notificaciones activas',
   body:'Prueba recibida. Tus recordatorios están listos.'});
  return {accepted:true};
 }
 async function testAllNotifications(){
  const subs=store.subscriptions();
  if(!subs.length)throw Object.assign(new Error('No hay dispositivos suscritos. Activá las notificaciones en cada dispositivo.'),{status:409});
  let accepted=0,failed=0,expired=0;
  for(const sub of subs){
   try{
    await send(sub,{title:'GastosApp · Prueba multidispositivo',
      body:'Esta es una prueba de notificaciones para tus dispositivos.'});
    accepted++;
   }catch(e){
    failed++;
    if([404,410].includes(e.statusCode))expired++;
    console.warn('Web Push test',e.statusCode||e.code||'send_failed');
   }
  }
  return {total:subs.length,accepted,failed,expired};
 }
 async function runReminders(){
  if(!configured||!store.subscriptions().length)return {sent:0};
  const now=clock(),parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{
   timeZone:'America/Argentina/Buenos_Aires',hour:'2-digit',hourCycle:'h23',
   year:'numeric',month:'2-digit',day:'2-digit'
  }).formatToParts(now).map(p=>[p.type,p.value]));
  const hour=Number(parts.hour);
  if(hour<9||hour>=21)return {sent:0};
  const day=parts.year+'-'+parts.month+'-'+parts.day;
  const alerts=detectReminders(financialState(),store.prefs(),day);
  let sent=0;
  for(const subscription of store.subscriptions()){
   for(const alert of alerts){
    const key=day+':'+alert.kind+':'+idHash(subscription.endpoint);
    if(store.sentFor(key))continue;
    try{
     await send(subscription,alert);
     store.markSent(key);sent++;
    }catch(e){console.error('Web Push',e.statusCode||e.code||'send_failed');}
   }
  }
  return {sent};
 }
 return {ready:configured,keys,send,testNotification,testAllNotifications,runReminders};
}
