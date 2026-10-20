// Analizador instantáneo para un SOLO gasto cotidiano.
// Conservador a propósito: si hay dudas, no autoriza autoguardado.
const fold=value=>String(value??'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
const todayAR=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const rules=[
 ['Salud',/\bfarmacia\b|\bmedicamentos?\b|\bremedios?\b|\bdentista\b/],
 ['Comida',/\bsuper(mercado)?\b|\bcarrefour\b|\bdia\b|\bkiosco\b|\balmacen\b|\bverduleria\b|\bcarniceria\b|\brestaurante\b|\bhamburguesa\b|\bpizzeria\b|\bcafe\b|\bpanaderia\b|\bcomida\b/],
 ['Transporte',/\bnafta\b|\bcombustible\b|\bypf\b|\bshell\b|\baxion\b|\buber\b|\bpeaje\b|\btaxi\b|\bcolectivo\b|\bsubte\b|\bremis\b/],
 ['Servicios',/\binternet\b|\bluz\b|\bgas\b|\btelefono\b|\bpersonal\b|\bmovistar\b|\bclaro\b|\bexpensas\b/],
 ['Hogar',/\balquiler\b|\bmuebles?\b|\blimpieza\b/],
 ['Tecnología',/\bnotebook\b|\bcomputadora\b|\bauriculares\b|\bcelular\b|\bmonitor\b/],
 ['Indumentaria',/\bzapatillas\b|\bropa\b|\bremera\b|\bcampera\b/],
 ['Entretenimiento',/\bcine\b|\bnetflix\b|\bspotify\b|\bsteam\b/]
];
const amountRE=/(?:\$|ars\s*)?(\d{1,3}(?:[.,]\d{3})+|\d{1,9})(?:\s*(lucas?|mil|pesos?|palo(?:s)?|millones?|mangos?|k\b))?/gi;
const accountMatchers=[
 {kind:'debit',re:/\b(?:con|por|en)\s+(?:tarjeta\s+de\s+)?debito\b/},
 {kind:'cash',re:/\b(?:en|con)\s+efectivo\b|\bal contado\b/},
 {kind:'transfer',re:/\b(?:por|con|en)\s+transferencia\b|\btransferi\b/},
 {kind:'wallet',re:/\bmercado pago\b|\b(?:con|por)\s+mp\b|\b(?:con|por)\s+modo\b/},
 {kind:'credit',re:/\b(?:con|por|en)\s+(?:tarjeta\s+de\s+)?credito\b|\b(?:con|por)\s+(?:visa|mastercard|master|naranja)\b/}
];
const complexRE=/\b(?:cuotas?|venc(?:e|imiento)|fin de mes|mensual|mensualmente|recurrente|todos los meses|deuda|prestamo|credito|pendiente|no pague|todavia no|voy a pagar|tengo que pagar|futuro|mañana|ayer|anteayer|el \d{1,2} de)\b/;
const multipleRE=/\b(?:ademas|tambien|otro gasto|otra compra|dos gastos|tres gastos|varios gastos|dos compras|tres compras)\b/;
const spentRE=/\b(?:gaste|pague|compre|abone|me cobraron|me debitaron|me salio|salio|se debito)\b/;
const incomeRE=/\b(?:cobre|me ingresaron|me pagaron|me depositaron|vendi|me transfirieron|ingreso|sueldo|me entro)\b/;
const UNKNOWN_MAX=1000000;
const withoutMarker=str=>str.replace(/\s+/g,' ').trim().replace(/^[,.:\s-]+|[,.:\s-]+$/g,'');
export function parseExpress(phrase,accounts=[],day=todayAR()){
 const original=String(phrase??'').trim();
 const issues=[];
 if(original.length<4||original.length>240)issues.push('Decí un gasto breve, de hasta 240 caracteres.');
 const cleaned=fold(original);
 const amounts=[...cleaned.matchAll(amountRE)].map(m=>{
  const raw=m[1],unit=fold(m[2]||'');
  const num=/^\d{1,3}(?:[.,]\d{3})+$/.test(raw)?Number(raw.replace(/[.,]/g,'')):Number(raw);
  return {raw:m[0],index:m.index,amount:num*(/\blucas?\b|\bmil\b|\bk\b/.test(unit)?1000:/\bpalo|\bmillon/.test(unit)?1000000:1)};
 });
 if(amounts.length!==1)issues.push(amounts.length?'Se detectaron varios números: revisá los movimientos.':'No pude identificar un importe.');
 const amount=amounts.length===1?amounts[0].amount:null;
 if(amount!==null&&(!Number.isSafeInteger(Math.round(amount*100))||amount<=0||amount>1e9))
  issues.push('El importe es demasiado grande o inválido.');
 const complex=complexRE.test(cleaned);
 const multiple=multipleRE.test(cleaned)||/\s+(?:y|mas)\s+.*\d/.test(cleaned);
 const income=incomeRE.test(cleaned);
 if(complex)issues.push('Esta frase menciona cuotas, fechas o compromisos. Revisala antes de guardar.');
 if(multiple)issues.push('Parece haber más de un movimiento.');
 if(income)issues.push('Para ingresos usá el asistente o el formulario.');
 if(!spentRE.test(cleaned))issues.push('Para autoguardar, indicá que ya pagaste o gastaste.');
 const method=accountMatchers.find(m=>m.re.test(cleaned));
 let account=null;
 if(method){
  account=accounts.find(a=>a.kind===method.kind) || null;
  if(method.kind==='credit'){
   issues.push('Las tarjetas de crédito requieren revisión del movimiento.');
   const word=cleaned.match(/\bvisa\b|\bmaster(?:card)?\b|\bnaranja\b/)?.[0];
   if(word)account=accounts.find(a=>fold(a.name).includes(word))||account;
  }
  if(!account)issues.push('No encontré el medio de pago mencionado.');
 }
 let body=cleaned;
 if(amounts.length===1){
  const i=amounts[0].index;body=body.slice(0,i)+' '+body.slice(i+amounts[0].raw.length);
 }
 body=body.replace(/\b(?:gaste|pague|compre|abone|me cobraron|me debitaron|me salio|salio|se debito|pesos|peso|lucas|luca|mil|me|el|la|los|las|un|una|unos|unas|de|del|por|en|con|al|a|que|fueron|total|aproximadamente)\b/g,' ');
 body=body.replace(/\b(?:tarjeta|debito|credito|efectivo|contado|transferencia|transferi|mercado pago|mp|modo|visa|mastercard|master|naranja)\b/g,' ');
 const title=withoutMarker(body.replace(/[¿?¡!.,;:]+/g,' ')).slice(0,80);
 if(title.length<2)issues.push('No pude identificar el comercio o concepto.');
 if(amount!==null&&amount>UNKNOWN_MAX)issues.push('Importe alto: confirmá el valor manualmente.');
 const category=rules.find(([_,re])=>re.test(cleaned))?.[0]||'Otros';
 const draft={type:'expense',title:title?title[0].toUpperCase()+title.slice(1):'Gasto',
  amount,date:day,dueDate:null,category,accountId:account?.id||null,installmentCount:1,
  isPaid:spentRE.test(cleaned),isRecurring:false,notes:''};
 return {draft,autoEligible:issues.length===0,requiresAdvanced:complex||multiple||income,issues,mode:'local',source:original};
}
