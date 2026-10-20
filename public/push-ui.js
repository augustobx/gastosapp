const toBytes=s=>{
 const raw=s.replace(/-/g,'+').replace(/_/g,'/'),
 bytes=atob(raw+'='.repeat((4-raw.length%4)%4));
 return Uint8Array.from(bytes,c=>c.charCodeAt(0));
};
export function setupPushUI({request,notify}){
 const $=id=>document.getElementById(id);
 const enabled=Boolean(window.isSecureContext&&'serviceWorker' in navigator&&
  'PushManager' in window&&'Notification' in window);
 const say=(message,error=false)=>{$('pushStatus').textContent=message;$('pushStatus').dataset.kind=error?'error':'neutral';};
 const prefs=()=>({dueSoon:$('pushDueSoon').checked,overdue:$('pushOverdue').checked,
  incomePending:$('pushIncome').checked,daysBefore:Number($('pushDaysBefore').value)});
 let config=null;
 async function subscription(){
  const reg=await navigator.serviceWorker.ready;
  return {reg,sub:await reg.pushManager.getSubscription()};
 }
 async function refresh(){
  if(!enabled){say('Este navegador no soporta notificaciones push o el sitio no usa HTTPS.');return;}
  try{
   config=await request('/api/push/config');
   const p=config.prefs;
   $('pushDueSoon').checked=p.dueSoon;
   $('pushOverdue').checked=p.overdue;
   $('pushIncome').checked=p.incomePending;
   $('pushDaysBefore').value=String(p.daysBefore);
   $('pushEnableBtn').disabled=!config.enabled;
   $('pushTestBtn').disabled=!config.enabled;
   if(!config.enabled){say('Pendiente: configurá APP_ORIGIN con la URL pública del sitio.');return;}
   const {sub}=await subscription();
   $('pushEnableBtn').classList.toggle('hidden',Boolean(sub));
   $('pushDisableBtn').classList.toggle('hidden',!sub);
   $('pushTestBtn').disabled=!sub;
   say(sub?'Notificaciones activas en este dispositivo.':'Notificaciones desactivadas en este dispositivo. Podés activarlas cuando quieras.');
  }catch(e){say('No pude comprobar las notificaciones: '+e.message,true);}
 }
 async function activate(){
  const button=$('pushEnableBtn');button.disabled=true;
  try{
   if(!enabled)throw new Error('Web Push no disponible.');
   if(!config?.enabled)throw new Error('Primero configurá APP_ORIGIN en el servidor.');
   if(Notification.permission==='denied')throw new Error('El navegador bloqueó las notificaciones. Habilitalas desde los permisos del sitio.');
   const permission=await Notification.requestPermission();
   if(permission!=='granted')throw new Error('No otorgaste permiso de notificaciones.');
   const {reg,sub}=await subscription();
   const active=sub||await reg.pushManager.subscribe({
    userVisibleOnly:true,applicationServerKey:toBytes(config.publicKey)
   });
   await request('/api/push/subscribe','POST',{subscription:active.toJSON()});
   say('Suscripción activada. Probá enviar una notificación.');
   await refresh();
  }catch(e){say(e.message,true);}
  finally{button.disabled=false;}
 }
 async function deactivate(){
  try{
   const {sub}=await subscription();
   if(sub){
    await request('/api/push/unsubscribe','POST',{endpoint:sub.endpoint});
    await sub.unsubscribe();
   }
   say('Desactivaste las notificaciones en este dispositivo.');
   await refresh();
  }catch(e){say(e.message,true);}
 }
 async function test(){
  const btn=$('pushTestBtn');btn.disabled=true;
  try{
   const {sub}=await subscription();
   if(!sub)throw new Error('Primero activá las notificaciones en este dispositivo.');
   await request('/api/push/test','POST',{endpoint:sub.endpoint});
   say('El proveedor push aceptó la notificación de prueba. Verificá si aparece en tu dispositivo.');
  }catch(e){say(e.message,true);}
  finally{btn.disabled=false;}
 }
 async function savePrefs(){
  const btn=$('pushSavePrefs');btn.disabled=true;
  try{
   await request('/api/push/preferences','PATCH',prefs());
   say('Preferencias guardadas. Se aplican a tus dispositivos registrados.');
   notify?.('Recordatorios configurados');
  }catch(e){say(e.message,true);}
  finally{btn.disabled=false;}
 }
 $('pushEnableBtn').addEventListener('click',activate);
 $('pushDisableBtn').addEventListener('click',deactivate);
 $('pushTestBtn').addEventListener('click',test);
 $('pushSavePrefs').addEventListener('click',savePrefs);
 return {refresh};
}
