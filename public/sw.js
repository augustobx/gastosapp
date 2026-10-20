// Solo assets estáticos. Nunca cachear datos financieros ni respuestas API.
const CACHE='gastosapp-v17';
const CORE=['/','/index.html','/app.css?v=17','/app.js?v=17','/chat.js?v=17','/diagnostics.js?v=17','/providers.js?v=17','/ai-tasks.js?v=17','/voice-errors.js?v=17','/speech-request.js?v=17','/ai-usage.js?v=17','/express.js?v=17','/express-parse.js?v=17','/installments.js?v=17','/manifest.json','/icons/icon.svg'];
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
