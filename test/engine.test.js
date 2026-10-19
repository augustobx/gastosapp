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
