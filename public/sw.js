// Solo assets estáticos. Nunca cachear datos financieros ni respuestas API.
const CACHE='gastosapp-v18';
const CORE=['/','/index.html','/app.css?v=18','/app.js?v=18','/chat.js?v=18','/diagnostics.js?v=18','/providers.js?v=18','/ai-tasks.js?v=18','/voice-errors.js?v=18','/speech-request.js?v=18','/ai-usage.js?v=18','/express.js?v=18','/express-parse.js?v=18','/installments.js?v=18','/loan-edit.js?v=18','/manifest.json','/icons/icon.svg'];
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
