import test from 'node:test';
import assert from 'node:assert/strict';
import {loanSchedule,project} from '../lib/engine.js';

test('préstamo 25 cuotas independientes mantiene importe por cuota y fin de mes',()=>{
 const rows=loanSchedule({installmentAmount:125000,count:25,firstDueDate:'2026-09-30'});
 assert.equal(rows.length,25);
 assert.equal(rows.reduce((n,r)=>n+r.amount,0),3125000);
 assert.equal(rows[0].dueDate,'2026-09-30');
 assert.equal(rows[1].dueDate,'2026-10-31');
 assert.equal(rows[2].dueDate,'2026-11-30');
 assert.equal(rows[24].dueDate,'2028-09-30');
 assert.ok(rows.every(row=>!row.isPaid));
});
test('dos cuotas con vencimientos en meses distintos programadas juntas suman ambas solo en el mes de pago',()=>{
 const installments=loanSchedule({installmentAmount:85000,count:25,firstDueDate:'2026-09-30'});
 installments[0].plannedDate='2026-10-31';
 installments[1].plannedDate='2026-10-31';
 const state={settings:{salary:400000},transactions:[],recurrences:[],purchases:[
  {id:'loan',financingType:'loan',title:'Préstamo Banco',category:'Deudas y préstamos',accountId:'debit',installments}
 ]};
 const september=project(state,'2026-09'),october=project(state,'2026-10');
 assert.equal(september.expenses,0);
 assert.equal(october.expenses,170000);
 assert.equal(october.pending,170000);
 assert.equal(october.loansDue,170000);
 assert.equal(october.cardsDue,0);
 assert.deepEqual(october.rows.map(x=>x.number).sort((a,b)=>a-b),[1,2]);
 assert.equal(october.rows[0].originalDueDate==='2026-09-30'||october.rows[1].originalDueDate==='2026-09-30',true);
 installments[0].isPaid=true;installments[0].paidDate='2026-10-20';
 const partial=project(state,'2026-10');
 assert.equal(partial.paid,85000);assert.equal(partial.pending,85000);
 installments[1].isPaid=true;installments[1].paidDate='2026-10-20';
 const paid=project(state,'2026-10');
 assert.equal(paid.paid,170000);
 assert.equal(paid.pending,0);
 assert.equal(project(state,'2026-09').expenses,0);
});
test('compras con tarjeta antiguas sin financingType siguen mostrándose como tarjeta',()=>{
 const state={settings:{salary:0},transactions:[],recurrences:[],purchases:[{
  id:'old',title:'Celular',category:'Tecnología',accountId:'visa',
  installments:[{id:'one',number:1,total:2,amount:20000,dueDate:'2026-10-10',isPaid:false}]
 }]};
 const r=project(state,'2026-10');
 assert.equal(r.cardsDue,20000);assert.equal(r.loansDue,0);
 assert.equal(r.rows[0].financingType,'card');
});
