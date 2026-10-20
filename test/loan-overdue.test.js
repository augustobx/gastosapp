import {previousMonthsCount} from '../public/loan-edit.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {loanSchedule,project} from '../lib/engine.js';
import {overdueInstallments,planOverdueToMonth,validateOverdueChoice} from '../lib/loan-overdue.js';

test('préstamo de septiembre mantiene septiembre fuera de octubre hasta que el usuario lo incluya',()=>{
 const items=loanSchedule({installmentAmount:200000,count:25,firstDueDate:'2026-09-01'});
 const plan={id:'loan',financingType:'loan',title:'Crédito',category:'Deudas y préstamos',accountId:'debit',installments:items};
 const state={settings:{salary:0},transactions:[],recurrences:[],purchases:[plan]};
 assert.equal(project(state,'2026-10').expenses,200000);
 const past=overdueInstallments(items,'2026-10');
 assert.equal(past.length,1);
 assert.equal(past[0].dueDate,'2026-09-01');
 const changed=planOverdueToMonth(items,'2026-10');
 assert.deepEqual(changed,{moved:1,total:200000,plannedDate:'2026-10-31'});
 const october=project(state,'2026-10');
 assert.equal(october.expenses,400000);
 assert.equal(october.pending,400000);
 assert.equal(october.loansDue,400000);
 assert.equal(october.rows.length,2);
 assert.ok(october.rows.some(r=>r.originalDueDate==='2026-09-01'));
 assert.equal(project(state,'2026-09').expenses,0);
 assert.equal(plan.installments.length,25);
 assert.equal(plan.installments.filter(i=>i.isPaid).length,0);
});
test('solo reprograma anteriores impagas, sin borrar fechas ni cambiar pagos confirmados',()=>{
 const items=loanSchedule({installmentAmount:200000,count:25,firstDueDate:'2026-07-01'});
 items[0].isPaid=true;items[0].paidDate='2026-07-04';
 items[1].plannedDate='2026-11-03';
 const dates=items.map(i=>i.dueDate),ids=items.map(i=>i.id);
 const result=planOverdueToMonth(items,'2026-10');
 assert.equal(result.moved,1);
 assert.equal(result.total,200000);
 assert.equal(items[1].plannedDate,'2026-11-03');
 assert.equal(items[2].plannedDate,'2026-10-31');
 assert.equal(items[0].paidDate,'2026-07-04');
 assert.deepEqual(items.map(i=>i.dueDate),dates);
 assert.deepEqual(items.map(i=>i.id),ids);
 assert.equal(planOverdueToMonth(items,'2026-10').moved,0);
});
test('cuotas no se marcan pagadas y no se deduplican creando registros nuevos',()=>{
 const items=loanSchedule({installmentAmount:200000,count:25,firstDueDate:'2026-09-01'});
 const first=items[0],id=first.id;
 planOverdueToMonth(items,'2026-10');
 assert.equal(items[0].id,id);
 assert.equal(items[0].isPaid,false);
 assert.equal(items[0].paidAt,null);
 assert.equal(items[0].dueDate,'2026-09-01');
});
test('solo acepta decisiones explícitas conocidas',()=>{
 assert.equal(validateOverdueChoice('include'),'include');
 assert.equal(validateOverdueChoice('review'),'review');
 assert.equal(validateOverdueChoice(undefined),'review');
 assert.throws(()=>validateOverdueChoice('mark_paid'),/Elegí cómo manejar/);
});

test('la interfaz detecta cuotas anteriores para fechas de inicio pasadas',()=>{
 assert.equal(previousMonthsCount('2026-09-01',25,'2026-10-20'),1);
 assert.equal(previousMonthsCount('2026-08-01',25,'2026-10-20'),2);
 assert.equal(previousMonthsCount('2026-10-01',25,'2026-10-20'),0);
 assert.equal(previousMonthsCount('2026-11-01',25,'2026-10-20'),0);
});
