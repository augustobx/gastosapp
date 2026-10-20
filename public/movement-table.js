import {sortMovements} from './movement-sort.js?v=19';
const cols=[['date','Fecha'],['title','Nombre'],['type','Tipo'],['category','Categoría'],['account','Medio'],['amount','Monto'],['status','Estado']];
export function tableMarkup(rows,{fmt,dateLabel,account,escape,selected,sortKey,sortDirection}){
 if(!rows.length)return '<div class="empty">No hay movimientos que coincidan con el filtro.</div>';
 const sorted=sortMovements(rows,{key:sortKey,direction:sortDirection,getAccount:id=>account(id)?.name||'Sin medio'});
 const head=cols.map(([key,name])=>'<th scope="col"><button type="button" data-sort-column="'+key+
  '" class="movement-th" aria-label="Ordenar por '+name+'">'+name+
  (sortKey===key?(sortDirection==='asc'?' ↑':' ↓'):' ↕')+'</button></th>').join('');
 const body=sorted.map(t=>{
  const title=escape(t.title+(t.isInstallment?' · cuota '+t.number+'/'+t.total:''));
  const date=t.paymentDate||t.plannedDate||t.dueDate||t.date;
  const id=escape(t.id);
  const edit=t.isRecurring?'<button class="action-mini" data-edit-recurrence="'+escape(t.recurrenceId)+'" title="Editar fijo mensual">✎</button>':
   t.isInstallment&&t.financingType==='loan'?'<button class="action-mini" data-loan-edit="'+escape(t.purchaseId)+'" title="Editar préstamo">✎</button>':
   !t.isInstallment?'<button class="action-mini" data-edit="'+id+'" title="Editar">✎</button>':'';
  const status=t.isPaid?t.type==='income'?'Cobrado':'Pagado':t.type==='income'?'Por cobrar':'Por pagar';
  return '<tr><td class="movement-select-cell"><input type="checkbox" data-select-movement="'+id+'" aria-label="Seleccionar '+title+'" '+(selected.has(t.id)?'checked':'')+'></td>'+
   '<td>'+escape(dateLabel(date))+'</td><td><strong>'+title+'</strong>'+(t.isRecurring?'<small>Fijo mensual</small>':'')+'</td>'+
   '<td>'+(t.type==='income'?'Ingreso':'Gasto')+'</td><td>'+escape(t.category||'Otros')+'</td>'+
   '<td>'+escape(account(t.accountId)?.name||'Sin medio')+'</td>'+
   '<td class="'+(t.type==='income'?'incoming':'')+'">'+(t.type==='income'?'+':'−')+fmt(t.amount)+'</td>'+
   '<td><span class="movement-status '+(t.isPaid?'is-done':'is-pending')+'">'+status+'</span></td>'+
   '<td class="movement-actions-cell"><button class="action-mini" data-paid="'+id+'" data-next-paid="'+(!t.isPaid)+
   '" title="'+(t.isPaid?'Marcar pendiente':t.type==='income'?'Marcar cobrado':'Marcar pagado')+'">'+(t.isPaid?'↶':'✓')+'</button>'+
   edit+'<button class="action-mini" data-delete="'+escape(t.isInstallment?t.purchaseId:t.isRecurring?t.recurrenceId:t.id)+'" title="Eliminar">✕</button></td></tr>';
 }).join('');
 return '<div class="movement-table-scroll"><table class="movement-table"><thead><tr>'+
  '<th scope="col" class="movement-select-cell"><input id="movementSelectAll" type="checkbox" aria-label="Seleccionar todos los movimientos filtrados"></th>'+
  head+'<th scope="col">Acciones</th></tr></thead><tbody>'+body+'</tbody></table></div>';
}
