// Reprogramar cuotas vencidas sin inventar pagos ni crear movimientos adicionales.
import {addMonths,money,isoDay} from './engine.js';
export const monthArgentina=(date=new Date())=>new Intl.DateTimeFormat('en-CA',{
 timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'
}).format(date).slice(0,7);
export function overdueInstallments(installments,month=monthArgentina()){
 return installments.filter(i=>!i.isPaid&&i.dueDate.slice(0,7)<month);
}
export function planOverdueToMonth(installments,month=monthArgentina()){
 if(!/^\d{4}-\d{2}$/.test(month))throw new Error('Mes de planificación inválido');
 const [year,m]=month.split('-').map(Number);
 const last=isoDay(new Date(year,m,0));
 let moved=0,total=0;
 for(const installment of installments){
  if(installment.isPaid||installment.dueDate.slice(0,7)>=month)continue;
  // Respeta pagos previamente programados para el mes actual o uno posterior.
  if(installment.plannedDate&&installment.plannedDate.slice(0,7)>=month)continue;
  installment.plannedDate=last;moved++;total=money(total+installment.amount);
 }
 return {moved,total,plannedDate:last};
}
export function validateOverdueChoice(choice){
 if(choice===undefined||choice===null||choice==='')return 'review';
 if(!['include','review'].includes(choice))throw new Error('Elegí cómo manejar las cuotas anteriores pendientes');
 return choice;
}
