import test from 'node:test';
import assert from 'node:assert/strict';
import {project,interpret} from '../lib/engine.js';
import {sortMovements} from '../public/movement-sort.js';

test('ingresos fijos mensuales se proyectan una vez sin confundir cobrado con pendiente',()=>{
 const rec={id:'salary-new',type:'income',title:'Alquiler recibido',amount:200000,
  category:'Extra',accountId:'transfer',notes:'',startDate:'2026-09-20',paidMonths:{'2026-09':true}};
 const data={settings:{salary:0},transactions:[],purchases:[],recurrences:[rec]};
 const august=project(data,'2026-08'),september=project(data,'2026-09'),october=project(data,'2026-10');
 assert.equal(august.income,0);
 assert.equal(september.income,200000);assert.equal(september.incomeReceived,200000);assert.equal(september.incomePending,0);
 assert.equal(october.income,200000);assert.equal(october.incomeReceived,0);assert.equal(october.incomePending,200000);
 assert.equal(october.rows[0].isRecurring,true);
 assert.equal(october.rows[0].type,'income');
 assert.equal(october.rows[0].id,'salary-new:2026-10');
 rec.paidMonths['2026-10']=true;
 assert.equal(project(data,'2026-10').incomeReceived,200000);
 assert.equal(project(data,'2026-10').rows.length,1);
});
test('sueldo base anterior + ingreso recurrente se proyectan ambos de forma explícita',()=>{
 const data={settings:{salary:100000},transactions:[],purchases:[],recurrences:[{
   id:'other',type:'income',title:'Alquiler',amount:200000,startDate:'2026-10-01',category:'Extra',paidMonths:{}
 }]};
 const result=project(data,'2026-10');
 assert.equal(result.income,300000);
 assert.equal(result.fixedIncome,300000);
 assert.equal(result.incomeReceived,100000);
 assert.equal(result.incomePending,200000);
});
test('gastos recurrentes legados sin tipo siguen siendo gastos',()=>{
 const data={settings:{salary:0},transactions:[],purchases:[],recurrences:[{
   id:'legacy',title:'Internet',amount:30000,startDate:'2026-09-01',category:'Servicios',paidMonths:{}
 }]};
 const result=project(data,'2026-10');
 assert.equal(result.income,0);assert.equal(result.expenses,30000);
 assert.equal(result.rows[0].type,'expense');
});
test('dictado puede interpretar un ingreso mensual sin cuotas',()=>{
 const result=interpret('Cobré 200 mil de alquiler todos los meses',[],new Date(2026,9,20));
 assert.equal(result.type,'income');
 assert.equal(result.isRecurring,true);
 assert.equal(result.amount,200000);
});
test('tabla y lista ordenan por nombre, importe, fecha, categoría y estado sin alterar datos',()=>{
 const original=[
  {id:'b',title:'Super',amount:200,category:'Comida',date:'2026-10-17',accountId:'visa',isPaid:false},
  {id:'a',title:'Farmacia',amount:500,category:'Salud',date:'2026-10-20',accountId:'cash',isPaid:true},
  {id:'c',title:'Agua',amount:150,category:'Servicios',date:'2026-10-19',accountId:'mp',isPaid:false}
 ];
 const sort=(key,direction)=>sortMovements(original,{key,direction,getAccount:id=>({visa:'Visa',cash:'Efectivo',mp:'Mercado Pago'})[id]});
 assert.deepEqual(sort('amount','asc').map(x=>x.id),['c','b','a']);
 assert.deepEqual(sort('title','asc').map(x=>x.id),['c','a','b']);
 assert.deepEqual(sort('date','desc').map(x=>x.id),['a','c','b']);
 assert.deepEqual(sort('status','desc').map(x=>x.id),['a','b','c']);
 assert.deepEqual(sort('account','asc').map(x=>x.id),['a','c','b']);
 assert.deepEqual(original.map(x=>x.id),['b','a','c']);
});
