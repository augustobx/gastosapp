// Ordenamientos para la vista de Movimientos; no mutan el historial original.
export const sortKeys=['date','title','amount','type','category','account','status'];
const when=row=>row.paymentDate||row.plannedDate||row.dueDate||row.date||'';
export function sortMovements(rows,{key='date',direction='desc',getAccount=()=>''}={}){
 if(!sortKeys.includes(key))key='date';
 const sign=direction==='asc'?1:-1;
 const collator=new Intl.Collator('es-AR',{numeric:true,sensitivity:'base'});
 const val=row=>{
  switch(key){
   case 'date':return when(row);
   case 'title':return row.title||'';
   case 'amount':return Number(row.amount)||0;
   case 'type':return row.type||'';
   case 'category':return row.category||'';
   case 'account':return getAccount(row.accountId)||'';
   case 'status':return row.isPaid?'1':'0';
  }
 };
 return [...rows].sort((a,b)=>{
  const x=val(a),y=val(b);
  const cmp=typeof x==='number'&&typeof y==='number'?x-y:collator.compare(String(x),String(y));
  return cmp*sign||collator.compare(String(a.id||''),String(b.id||''));
 });
}
