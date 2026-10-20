import test from 'node:test';
import assert from 'node:assert/strict';
import {parseExpress} from '../public/express-parse.js';
const day='2026-10-20';
const accounts=[{id:'cash',name:'Efectivo',kind:'cash'},{id:'debit',name:'Débito',kind:'debit'},{id:'visa',name:'Visa',kind:'credit'}];
test('Express interpreta gasto único pagado en milisegundos y no usa Gemini',()=>{
 const r=parseExpress('Gasté 18 lucas en la farmacia con débito',accounts,day);
 assert.equal(r.draft.amount,18000);
 assert.equal(r.draft.title,'Farmacia');
 assert.equal(r.draft.category,'Salud');
 assert.equal(r.draft.accountId,'debit');
 assert.equal(r.draft.isPaid,true);
 assert.equal(r.autoEligible,true);
 assert.equal(r.requiresAdvanced,false);
});
test('importe único con pesos y supermercado reconoce importe y categoría',()=>{
 const r=parseExpress('Pagué $18.000 en el supermercado con efectivo',accounts,day);
 assert.equal(r.draft.amount,18000);
 assert.equal(r.draft.category,'Comida');
 assert.equal(r.draft.accountId,'cash');
 assert.equal(r.autoEligible,true);
});
test('no autoguarda cuotas, vencimientos, ingresos ni varios montos',()=>{
 for(const sentence of [
  'Gasté 150000 en 3 cuotas en farmacia con Visa',
  'Gasté 20 lucas en farmacia a fin de mes',
  'Gasté 18000 en farmacia y 25000 en supermercado',
  'Cobré 250000 de sueldo',
  'Tengo que pagar 980000 a Juana a fin de mes'
 ]){
  const r=parseExpress(sentence,accounts,day);
  assert.equal(r.autoEligible,false,sentence);
  assert.equal(r.requiresAdvanced,true,sentence);
 }
});
test('importe alto, concepto incompleto o medio no encontrado obliga confirmación',()=>{
 assert.equal(parseExpress('Gasté 1500000 en farmacia',accounts,day).autoEligible,false);
 assert.equal(parseExpress('Gasté 18 lucas',accounts,day).autoEligible,false);
 assert.equal(parseExpress('Gasté 18 lucas en farmacia con modo',accounts,day).autoEligible,false);
});
test('sin verbo de pago no se asume que el gasto ya esté pagado',()=>{
 const result=parseExpress('18 lucas en farmacia',accounts,day);
 assert.equal(result.autoEligible,false);
 assert.equal(result.draft.isPaid,false);
});
