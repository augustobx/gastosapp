import test from 'node:test';
import assert from 'node:assert/strict';
import { schedule, interpret, project } from '../lib/engine.js';

const visa={id:'visa',name:'Visa',kind:'credit',closingDay:25,dueDay:10};
const mp={id:'mp',name:'Mercado Pago',kind:'wallet'};
test('cuotas distribuyen centavos sin perder dinero',()=>{
 const rows=schedule({amount:100,count:3,date:'2026-10-19',account:visa});
 assert.deepEqual(rows.map(i=>i.amount),[33.34,33.33,33.33]);
 assert.deepEqual(rows.map(i=>i.dueDate),['2026-11-10','2026-12-10','2027-01-10']);
});
test('compra posterior al cierre arranca dos meses después',()=>{
 const rows=schedule({amount:120000,count:6,date:'2026-10-27',account:visa});
 assert.equal(rows[0].dueDate,'2026-12-10');
 assert.equal(rows.reduce((a,b)=>a+b.amount,0),120000);
});
test('comprende gasto rioplatense y cuotas Visa',()=>{
 const r=interpret('Me patiné 120 lucas en un celu, con la Visa en 6 cuotas sin interés',[visa,mp],new Date(2026,9,19));
 assert.equal(r.type,'expense');assert.equal(r.amount,120000);
 assert.equal(r.category,'Tecnología');assert.equal(r.installmentCount,6);
 assert.equal(r.accountId,'visa');assert.deepEqual(r.questions,[]);
});
test('reconoce ingreso de changa',()=>{
 const r=interpret('Me entraron 80 mil de una changa',[visa,mp],new Date(2026,9,19));
 assert.equal(r.type,'income');assert.equal(r.amount,80000);
});
test('entiende Mercado Pago y fecha ayer',()=>{
 const r=interpret('Ayer me gasté 15 lucas en el súper con MP',[visa,mp],new Date(2026,9,19));
 assert.equal(r.amount,15000);assert.equal(r.date,'2026-10-18');
 assert.equal(r.accountId,'mp');assert.equal(r.category,'Comida');
});
test('requiere revisar cuotas sin tarjeta',()=>{
 const r=interpret('Compré una tele por 600 mil en 12 cuotas',[],new Date(2026,9,19));
 assert.equal(r.amount,600000);assert.equal(r.installmentCount,12);
 assert.ok(r.questions.length>0);
});
test('no duplica compras financiadas',()=>{
 const rows=schedule({amount:120000,count:6,date:'2026-10-19',account:visa});
 const s={settings:{salary:200000},transactions:[],purchases:[{id:'purchase',title:'Celular',category:'Tecnología',accountId:'visa',installments:rows}]};
 const nov=project(s,'2026-11');
 assert.equal(nov.expenses,20000);assert.equal(nov.balance,180000);
 assert.equal(nov.rows.length,1);assert.equal(nov.pending,20000);
});
test('marcar cuota pagada no suma segundo gasto',()=>{
 const rows=schedule({amount:100000,count:2,date:'2026-10-19',account:visa});
 rows[0].isPaid=true;
 const s={settings:{salary:0},transactions:[],purchases:[{id:'purchase',title:'Compra',category:'Otros',installments:rows}]};
 const nov=project(s,'2026-11');assert.equal(nov.expenses,50000);
 assert.equal(nov.pending,0);assert.equal(nov.paid,50000);
});
test('entiende ingreso depositado sin otras palabras clave',()=>{
 const r=interpret('Me depositaron 50 mil por transferencia',[{id:'transfer',name:'Transferencia',kind:'transfer'}],new Date(2026,9,19));
 assert.equal(r.type,'income');assert.equal(r.amount,50000);assert.equal(r.accountId,'transfer');
});
test('interpreta gambas y cuotas nombradas con palabras',()=>{
 const cafe=interpret('Me gasté 3 gambas en un café',[],new Date(2026,9,19));
 assert.equal(cafe.amount,300);
 const tele=interpret('Compré una tele en seis cuotas de 20 lucas',[],new Date(2026,9,19));
 assert.equal(tele.installmentCount,6);assert.equal(tele.amount,20000);
 assert.ok(tele.questions.length>0);
});
test('gastos recurrentes generan vencimientos separados',()=>{
 const state={settings:{salary:100000},transactions:[],purchases:[],recurrences:[{id:'internet',title:'Internet',amount:30000,
  category:'Servicios',startDate:'2026-10-19',paidMonths:{'2026-10':true}}]};
 const oct=project(state,'2026-10'),nov=project(state,'2026-11');
 assert.equal(oct.paid,30000);assert.equal(oct.pending,0);
 assert.equal(nov.pending,30000);assert.equal(nov.rows[0].id,'internet:2026-11');
});

test('Visa débito es débito, no compra de crédito',()=>{
 const r=interpret('Compré ropa por 25 lucas con Visa débito',[
   {id:'visa',name:'Visa',kind:'credit'},{id:'debit',name:'Débito',kind:'debit'}
 ],new Date(2026,9,19));
 assert.equal(r.accountId,'debit');assert.equal(r.installmentCount,1);
});
test('cuotas sobre billetera se marcan para revisión',()=>{
 const r=interpret('Compré 100 lucas en 3 cuotas con MP',[mp],new Date(2026,9,19));
 assert.equal(r.installmentCount,3);assert.ok(r.questions.length>0);
});

test('dictado Juanma: fin de mes, único, pendiente y fecha de registro distinta',()=>{
 const r=interpret('Cargar a Juanma 890000 a fin de mes pago único',[],new Date(2026,9,19));
 assert.equal(r.type,'expense');
 assert.equal(r.title,'Juanma');
 assert.equal(r.amount,890000);
 assert.equal(r.date,'2026-10-19');
 assert.equal(r.dueDate,'2026-10-31');
 assert.equal(r.isPaid,false);
 assert.equal(r.installmentCount,1);
});
test('fin del mes que viene calcula último día exacto',()=>{
 const r=interpret('Anotar alquiler 900000 para fin del mes que viene',[],new Date(2026,9,19));
 assert.equal(r.dueDate,'2026-11-30');
 assert.equal(r.isPaid,false);
});
test('gasto ya pagado conserva estado y compra sin fecha de vencimiento',()=>{
 const r=interpret('Pagué 15 lucas de nafta hoy con débito',[],new Date(2026,9,19));
 assert.equal(r.amount,15000);assert.equal(r.isPaid,true);assert.equal(r.dueDate,null);
});
test('gasto con vencimiento en otro mes impacta al mes de vencimiento',()=>{
 const s={settings:{salary:0},purchases:[],recurrences:[],transactions:[{
   id:'t',type:'expense',title:'Juanma',amount:890000,date:'2026-10-19',dueDate:'2026-11-30',category:'Otros',isPaid:false
 }]};
 const oct=project(s,'2026-10'),nov=project(s,'2026-11');
 assert.equal(oct.expenses,0);assert.equal(nov.expenses,890000);
 assert.equal(nov.pending,890000);assert.equal(nov.upcoming[0].dueDate,'2026-11-30');
});

test('transcripción: 890 000 a Juanma para cancelar el crédito a fin de mes',()=>{
  const accounts=[{id:'visa',name:'Visa',kind:'credit'},{id:'master',name:'Mastercard',kind:'credit'}];
  const r=interpret('890 000 a juanma para cancelar el crédito a fin de mes',accounts,new Date(2026,9,19));
  assert.equal(r.type,'expense');
  assert.equal(r.amount,890000);
  assert.equal(r.title,'Pago de crédito · Juanma');
  assert.equal(r.category,'Deudas y préstamos');
  assert.equal(r.date,'2026-10-19');
  assert.equal(r.dueDate,'2026-10-31');
  assert.equal(r.isPaid,false);
  assert.equal(r.installmentCount,1);
  assert.equal(r.accountId,null);
  assert.deepEqual(r.questions,[]);
});
test('variantes numéricas rioplatenses: miles con espacios y puntuación',()=>{
  const cases={
    '890 000':890000,
    '1 200 000':1200000,
    '890.000':890000,
    '890,000':890000,
    '890 mil':890000,
    '890000':890000,
    '1 200 000 a Juanma':1200000
  };
  for(const [text,amount] of Object.entries(cases)){
    const parsed=interpret(text,[],new Date(2026,9,19));
    assert.equal(parsed.amount,amount);
  }
});
test('crédito como deuda no equivale a comprar con tarjeta de crédito',()=>{
  const accounts=[{id:'visa',name:'Visa',kind:'credit'},{id:'debit',name:'Débito',kind:'debit'}];
  const loan=interpret('Pagué 890 000 para cancelar el crédito con débito',accounts,new Date(2026,9,19));
  assert.equal(loan.amount,890000);
  assert.equal(loan.category,'Deudas y préstamos');
  assert.equal(loan.accountId,'debit');
  assert.equal(loan.isPaid,true);
  const card=interpret('Compré ropa por 120000 con Visa en 3 cuotas',accounts,new Date(2026,9,19));
  assert.equal(card.accountId,'visa');
  assert.equal(card.category,'Indumentaria');
  assert.equal(card.installmentCount,3);
});
test('no fusionar cantidad de cuotas con importes separados',()=>{
  const parsed=interpret('3 cuotas de 20 mil en la Visa por un celular',
    [{id:'visa',name:'Visa',kind:'credit'}],new Date(2026,9,19));
  assert.equal(parsed.amount,20000);
  assert.equal(parsed.installmentCount,3);
  assert.ok(parsed.questions.length>0);
});

test('tengo que pagar a Juanma 890,000 a fin de este mes',()=>{
 const phrase='tengo que pagar a juanma 890,000 para cancelar el crédito a fin de este mes';
 const r=interpret(phrase,[],new Date(2026,9,19));
 assert.equal(r.title,'Pago de crédito · Juanma');
 assert.equal(r.amount,890000);
 assert.equal(r.date,'2026-10-19');
 assert.equal(r.dueDate,'2026-10-31');
 assert.equal(r.isPaid,false);
 assert.equal(r.accountId,null);
});
test('el vencimiento de fin de mes no modifica la fecha de registro',()=>{
 const d=interpret('Registrar 30000 de alquiler a fin de este mes',[],new Date(2026,9,8));
 assert.equal(d.date,'2026-10-08');
 assert.equal(d.dueDate,'2026-10-31');
 assert.equal(d.isPaid,false);
});
