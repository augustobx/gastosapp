// Solo assets estáticos. Nunca cachear datos financieros ni respuestas API.
const CACHE='gastosapp-v20';
const CORE=['/','/index.html','/app.css?v=20','/app.js?v=20','/chat.js?v=20','/diagnostics.js?v=20','/providers.js?v=20','/ai-tasks.js?v=20','/voice-errors.js?v=20','/speech-request.js?v=20','/ai-usage.js?v=20','/express.js?v=20','/express-parse.js?v=20','/installments.js?v=20','/loan-edit.js?v=20','/movement-sort.js?v=20','/movement-table.js?v=20','/passkeys-ui.js?v=20','/push-ui.js?v=20','/manifest.json','/icons/icon.svg'];
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)));
  self.skipWaiting();
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin || url.pathname.startsWith('/api/'))return;
  if(url.pathname==='/' || url.pathname==='/index.html'){
    event.respondWith(fetch(event.request,{cache:'no-store'}).catch(()=>caches.match('/index.html')));
    return;
  }
  event.respondWith(fetch(event.request).then(r=>{
    if(r.ok){const copy=r.clone();caches.open(CACHE).then(c=>c.put(event.request,copy)).catch(()=>{});}
    return r;
  }).catch(()=>caches.match(event.request)));
});

// Las notificaciones pueden llegar con la aplicación cerrada.
// Nunca mostrar importes, nombres de comercios ni claves en pantalla bloqueada.
self.addEventListener('push',event=>{
 event.waitUntil((async()=>{
  let data={};
  try{data=event.data?.json()||{};}catch{}
  const title=typeof data.title==='string'&&data.title.startsWith('GastosApp')?
    data.title.slice(0,90):'GastosApp · Recordatorio';
  const body=typeof data.body==='string'?data.body.slice(0,160):
    'Tenés un recordatorio disponible en GastosApp.';
  await self.registration.showNotification(title,{
   body,icon:'/icons/icon.svg',badge:'/icons/icon.svg',
   tag:'gastosapp-reminder',renotify:false,requireInteraction:false,
   data:{url:'/'}
  });
 })());
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 event.waitUntil((async()=>{
  const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  const existing=windows.find(c=>new URL(c.url).origin===self.location.origin);
  if(existing){await existing.focus();return;}
  await self.clients.openWindow('/');
 })());
});
