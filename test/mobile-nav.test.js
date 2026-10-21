import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('barra móvil incluye Configuración y conserva todas las funciones',()=>{
 const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const mobile=html.match(/<nav class="mobile-nav"[^>]*>([\s\S]*?)<\/nav>/)?.[1];
 assert.ok(mobile,'barra inferior no encontrada');
 for(const view of ['dashboard','movements','cards','reports','settings']){
  assert.match(mobile,new RegExp('data-view="'+view+'"'),view+' debe ser accesible en móvil');
 }
 assert.match(mobile,/assistant-open/);
 assert.match(mobile,/data-view="settings"[^>]*aria-label="Configuración"/);
 assert.equal((mobile.match(/data-view=/g)||[]).length,5);
 const settings=html.match(/<section class="view" id="view-settings"/);
 assert.ok(settings,'destino de Configuración no existe');
});
test('barra móvil tiene seis columnas y botones táctiles adecuados',()=>{
 const css=fs.readFileSync(new URL('../public/app.css',import.meta.url),'utf8');
 assert.match(css,/\.mobile-nav\s*\{grid-template-columns:repeat\(6,minmax\(0,1fr\)\)/);
 assert.match(css,/\.mobile-nav button\s*\{[^}]*min-height:44px/);
 const sw=fs.readFileSync(new URL('../public/sw.js',import.meta.url),'utf8');
 assert.match(sw,/gastosapp-v21/);
 assert.match(sw,/\/app\.css\?v=21/);
});
