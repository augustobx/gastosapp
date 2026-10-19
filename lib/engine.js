import crypto from 'node:crypto';

export const uid = () => crypto.randomUUID();
export const money = value => Math.round(Number(value) * 100) / 100;
export const isoDay = date => {
  const d = new Date(date);
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
};
export const monthOf = date => String(date || '').slice(0, 7);
export const addMonths = (day, count, preferredDay) => {
  const [y, m, d] = day.split('-').map(Number);
  const first = new Date(y, m - 1 + count, 1);
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  return [first.getFullYear(), String(first.getMonth() + 1).padStart(2, '0'), String(Math.min(preferredDay || d, last)).padStart(2, '0')].join('-');
};
export const schedule = ({ amount, count, date, account }) => {
  if (!Number.isInteger(count) || count < 1 || count > 60) throw new Error('Las cuotas deben estar entre 1 y 60');
  const totalCents = Math.round(Number(amount) * 100);
  if (!Number.isSafeInteger(totalCents) || totalCents < 1) throw new Error('Monto inválido');
  const base = Math.floor(totalCents / count);
  const remainder = totalCents % count;
  const day = Number(account?.dueDay) || 10;
  const closing = Number(account?.closingDay) || null;
  const purchaseDay = Number(date.slice(8, 10));
  const firstMonthOffset = closing && purchaseDay > closing ? 2 : 1;
  return Array.from({ length: count }, (_, i) => ({
    id: uid(), number: i + 1, total: count,
    amount: (base + (i < remainder ? 1 : 0)) / 100,
    dueDate: addMonths(date, firstMonthOffset + i, day),
    isPaid: false, paidAt: null
  }));
};

const categories = [
  ['Comida', /super|mercado|almacen|almac[eé]n|verduler|carnicer|comida|morfi|resto|delivery|pizza|hamburg|caf[eé]|almuer|cenar|desayun|birra|bar\b/i],
  ['Transporte', /nafta|combustible|uber|cabify|taxi|subte|colectivo|bondi|tren|peaje|estacionam|auto|moto/i],
  ['Servicios', /luz|agua|gas\b|internet|wifi|tel[eé]fono|celular plan|factura|impuesto|expensa/i],
  ['Hogar', /alquiler|casa|mueble|electrodom|heladera|lavarropa|televisor|tele\b|tv\b/i],
  ['Salud', /farmacia|remedio|medic|dentista|obra social|prepaga/i],
  ['Educación', /curso|universidad|colegio|escuela|libro|capacitaci/i],
  ['Entretenimiento', /cine|netflix|spotify|steam|juego|boliche|salida|vacaciones|viaje/i],
  ['Tecnología', /celu\b|celular\b|notebook|computadora|pc\b|iphone|monitor|tablet|auricular/i],
  ['Indumentaria', /ropa|zapatilla|campera|pantalon|pantal[oó]n|remera/i]
];
const strip = str => str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

export function interpret(input, accounts = [], now = new Date()) {
  const text = String(input || '').trim();
  if (!text || text.length > 450) throw new Error('Escribí una frase de hasta 450 caracteres');
  const s = strip(text);
  const income = /\b(me entraron|me entro|me ingresaron|me ingreso|me depositaron|me deposito|me transfirieron|me transfirio|cobre|me pagaron|me cayo|recibi|gane|me dieron|me devolvieron|vendi|ingreso|sueldo|aguinaldo|changa|laburo extra)\b/i.test(s) &&
    !/\b(pague|compre|gaste|salio|abone)\b/i.test(s);
  let date = isoDay(now);
  if (/\banteayer\b/.test(s)) date = isoDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 2));
  else if (/\bayer\b/.test(s)) date = isoDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  else if (/\bma[nñ]ana\b/.test(s)) date = isoDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
  const d = s.match(/\b(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{2,4}))?\b/);
  if (d) {
    const year = d[3] ? Number(d[3].length === 2 ? '20' + d[3] : d[3]) : now.getFullYear();
    const possible = new Date(year, Number(d[2]) - 1, Number(d[1]));
    if (possible.getDate() === Number(d[1]) && possible.getMonth() === Number(d[2]) - 1) date = isoDay(possible);
  }
  const installment = s.match(/\b(?:en|a)\s*(\d{1,2})\s*(?:cuotas?|pagos?)\b|\b(\d{1,2})\s*cuotas?\b/);
  const numberWords = {un:1,una:1,dos:2,tres:3,cuatro:4,cinco:5,seis:6,siete:7,ocho:8,nueve:9,diez:10,doce:12,dieciocho:18,veinticuatro:24,treinta:30};
  const installmentWord = s.match(/\b(?:en|a)\s*(un|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|doce|dieciocho|veinticuatro|treinta)\s+cuotas?\b/);
  const installmentCount = installment ? Number(installment[1] || installment[2]) : installmentWord ? numberWords[installmentWord[1]] : 1;
  const amountMatches = [...s.matchAll(/(?:\$|ars\s*)?\s*(\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s*(millones?|palos?|lucas?|mil|k\b|gambas?|mangos?|pesos?)?/g)]
    .map(m => {
      let n = m[1];
      if (/^\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?$/.test(n)) {
        n = n.replace(/[.,](?=\d{3}(?:[.,]|$))/g, '').replace(',', '.');
      } else n = n.replace(',', '.');
      const multiplier = /mill|palo/.test(m[2] || '') ? 1e6 : /luca|mil|^k$/.test(m[2] || '') ? 1000 : /gamba/.test(m[2] || '') ? 100 : 1;
      const value = Number(n) * multiplier;
      const end = m.index + m[0].length;
      const context = s.slice(end, end + 12);
      const isCuota = /^\s*(cuotas?|pagos?|meses?|dias?|semanas?)/.test(context);
      const isDate = m.index >= (d?.index ?? Infinity) && m.index < (d ? d.index + d[0].length : 0);
      return { value, score: (multiplier > 1 ? 100000000 : 0) + (/[$]/.test(m[0]) ? 50000000 : 0) + value - (isCuota || isDate ? 1000000000 : 0) };
    }).filter(x => Number.isFinite(x.value) && x.value > 0 && x.value < 1e13).sort((a,b) => b.score - a.score);
  const wordMatch = s.match(/\b(un|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|medio)\s+(palo|palos|luca|lucas|mil|gamba|gambas)\b/);
  if (wordMatch) {
    const num = { un:1, una:1, dos:2, tres:3, cuatro:4, cinco:5, seis:6, siete:7, ocho:8, nueve:9, diez:10, medio:.5 }[wordMatch[1]];
    amountMatches.push({ value: num * (/palo/.test(wordMatch[2]) ? 1e6 : /gamba/.test(wordMatch[2]) ? 100 : 1000), score: 120000000 });
    amountMatches.sort((a,b)=>b.score-a.score);
  }
  const amount = amountMatches[0]?.value ?? null;
  const mention = [
    ['mercado pago', /mercado pago|\bmp\b/], ['modo', /\bmodo\b/], ['debito', /\bdebito\b/], ['visa', /\bvisa\b/],
    ['mastercard', /master\s?card|\bmaster\b/], ['naranja', /\bnaranja\b/],
    ['uala', /\buala\b/], ['transferencia', /transferencia|transfer[ií]/],
    ['credito', /\bcredito\b|\btarjete[eé]\b/],
    ['efectivo', /efectivo|contado|cash\b|billetes/]
  ].find(([,regex]) => regex.test(s))?.[0];
  const account = accounts.find(a => strip(a.name).includes(mention || '\uffff') || (mention && strip(a.name) === mention))
    || accounts.find(a => mention && strip(a.kind) === mention)
    || null;
  const category = income
    ? (/sueldo|aguinaldo/.test(s) ? 'Sueldo' : /venta|vendi/.test(s) ? 'Ventas' : 'Extra')
    : categories.find(([,re])=>re.test(s))?.[0] || 'Otros';
  const cleaned = text.replace(/(?:\$|ARS\s*)?\d[\d.,]*/gi, ' ').replace(/\b(?:un|una|dos|tres|cuatro|cinco|medio)\s+(?:lucas?|palos?|mil)\b/gi, ' ').replace(/\b(?:lucas?|palos?|mil|gambas?|mangos?|pesos?|cuotas?|sin interés|sin interes|con interes)\b/gi, ' ')
    .replace(/\b(?:me|gast[eé]|patin[eé]|pagu[eé]|compr[eé]|abon[eé]|salio|sali[oó]|entraron|entr[oó]|ingresaron|cobr[eé]|depositaron|una|un|en|con|de|la|el|los|las|por|para|hoy|ayer|anteayer|transferencia|efectivo|d[eé]bito|cr[eé]dito|visa|mastercard|naranja|modo|mp)\b/gi, ' ')
    .replace(/\s+/g, ' ').trim().replace(/^[-,. ]+|[-,. ]+$/g, '');
  const title = cleaned ? cleaned[0].toUpperCase()+cleaned.slice(1,80) : (income ? 'Ingreso' : category === 'Otros' ? 'Gasto' : category);
  const pending = /\b(todavia no|a pagar|lo debo|debo|pendiente|no pague|sin pagar|vence|pago despues)\b/.test(s);
  const questions = [];
  if (amount === null) questions.push('No pude identificar el importe.');
  if (installmentCount > 1 && !mention) questions.push('¿Con qué tarjeta hiciste la compra?');
  if (installmentCount > 1 && account && account.kind !== 'credit') questions.push('Para las cuotas, elegí una tarjeta de crédito.');
  if (installmentCount > 1 && /(?:cada cuota|por cuota|cuotas? de)/.test(s)) questions.push('Confirmá si el importe es por cuota o el total de la compra.');
  if (mention && !account) questions.push('Elegí el medio de pago para guardar este movimiento.');
  if (installmentCount > 1 && /\b(todos los meses|cada mes|mensualmente|mensual|recurrente)\b/.test(s)) questions.push('Elegí si es una compra en cuotas o un gasto fijo mensual.');
  return {
    type: income ? 'income' : 'expense', title, amount, date, category,
    accountId: account?.id || null, mentionedMethod: mention || null,
    installmentCount: income ? 1 : installmentCount,
    isRecurring: !income && /\b(todos los meses|cada mes|mensualmente|mensual|recurrente)\b/.test(s),
    isPaid: income ? true : !pending,
    notes: text, questions, confidence: questions.length ? 'review' : 'high'
  };
}

export function project(state, month) {
  const recurringSalary = Number(state.settings.salary) || 0;
  const direct = state.transactions.filter(t => monthOf(t.date) === month);
  const installments = state.purchases.flatMap(p => p.installments.filter(i => monthOf(i.dueDate) === month)
    .map(i => ({ ...i, purchaseId:p.id, title:p.title, type:'expense', category:p.category,
      accountId:p.accountId, date:i.dueDate, isInstallment:true, installmentId:i.id, notes:p.notes })));
  const recurring = (state.recurrences || []).filter(r => month >= monthOf(r.startDate) && (!r.endMonth || month <= r.endMonth))
    .map(r => ({ id:r.id+':'+month, recurrenceId:r.id, title:r.title, amount:r.amount, category:r.category,
      accountId:r.accountId, date:month===monthOf(r.startDate)?r.startDate:addMonths(month+'-01',0,Number(r.startDate.slice(8,10))),
      type:'expense', isRecurring:true, isPaid:Boolean(r.paidMonths?.[month]), notes:r.notes }));
  const rows = [...direct.map(t => ({...t, isInstallment:false})), ...installments, ...recurring]
    .sort((a,b)=>b.date.localeCompare(a.date));
  const extraIncome = rows.filter(t=>t.type==='income').reduce((a,t)=>a+t.amount,0);
  const income = money(recurringSalary + extraIncome);
  const expenses = money(rows.filter(t=>t.type==='expense').reduce((a,t)=>a+t.amount,0));
  const pending = money(rows.filter(t=>t.type==='expense'&&!t.isPaid).reduce((a,t)=>a+t.amount,0));
  const paid = money(expenses - pending);
  const categories = Object.entries(rows.filter(t=>t.type==='expense').reduce((o,t)=>{o[t.category]=(o[t.category]||0)+t.amount;return o;},{}))
    .map(([name,value])=>({name,amount:money(value)})).sort((a,b)=>b.amount-a.amount);
  return {month,salary:recurringSalary,extraIncome:money(extraIncome),income,expenses,pending,paid,
    balance:money(income-expenses),available:money(income-paid),categories,rows,
    upcoming:rows.filter(x=>x.type==='expense'&&!x.isPaid).sort((a,b)=>a.date.localeCompare(b.date)),
    cardsDue:rows.filter(x=>x.isInstallment&&!x.isPaid).reduce((a,t)=>a+t.amount,0)};
}