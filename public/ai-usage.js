// Panel local: contadores agregados de GastosApp, sin acceso a saldos externos.
export function setupAIUsage({request}){
 const $=id=>document.getElementById(id);
 const number=n=>new Intl.NumberFormat('es-AR',{maximumFractionDigits:0}).format(n||0);
 const usd=n=>new Intl.NumberFormat('en-US',{minimumFractionDigits:4,maximumFractionDigits:6}).format(n||0);
 const label={nlu:'Conversación',stt:'Transcripción',tts:'Voz',unknown:'Otros'};
 const select=$('aiUsagePeriod');
 const button=$('aiUsageRefresh');
 const summary=$('aiUsageSummary'),table=$('aiUsageModels'),issues=$('aiUsageIssues'),note=$('aiUsageStatus');
 const value=(title,numberText,extra='')=>{
  const box=document.createElement('div');box.className='ai-usage-stat';
  const h=document.createElement('small');h.textContent=title;
  const v=document.createElement('strong');v.textContent=numberText;
  const p=document.createElement('span');p.textContent=extra;
  box.append(h,v,p);return box;
 };
 async function refresh(){
  if(button.disabled)return;
  button.disabled=true;note.textContent='Consultando contadores del servidor...';
  try{
   const r=await request('/api/ai/usage?period='+encodeURIComponent(select.value));
   const s=r.summary||{};
   summary.replaceChildren(
    value('Tokens de entrada',number(s.input),'Informados por los proveedores'),
    value('Tokens de salida',number(s.output),'Incluye razonamiento si se reporta'),
    value('Equivalente a tarifa paga','US$ '+usd(s.estimatedUsd),'Estimado parcial, no factura real'),
    value('Solicitudes',number(s.requests),number(s.success)+' OK · '+number(s.failed)+' fallidas')
   );
   const caption=document.createElement('p');
   caption.className='ai-fineprint';
   caption.textContent='Medición desde '+(r.since?new Date(r.since).toLocaleDateString('es-AR'):'la activación')+
    '. '+number(s.metered)+' respuestas con tokens reportados y '+number(s.unmetered)+
    ' sin tokens reportados; '+number(s.unpriced)+' sin tarifa estimable. El total en USD es parcial, calculado con tarifa estándar de pago y NO representa saldo disponible, cargos reales ni consumo de otras aplicaciones. Una clave en el nivel gratuito puede tener costo real US$0.';
   summary.append(caption);
   table.replaceChildren();
   const grid=document.createElement('table');
   grid.className='ai-usage-table';
   const header=document.createElement('thead'),heading=document.createElement('tr');
   for(const name of ['Proveedor / Modelo','Función','OK / Errores','IN','OUT','USD estimado']){
    const th=document.createElement('th');th.textContent=name;heading.append(th);
   }
   header.append(heading);grid.append(header);
   const body=document.createElement('tbody');
   for(const row of r.models||[]){
    const tr=document.createElement('tr');
    const cells=[(row.provider==='gemini'?'Gemini':'OpenAI')+' · '+row.model,
     label[row.service]||row.service,number(row.success)+' / '+number(row.failed),
     row.metered?number(row.input):'—',row.metered?number(row.output):'—',
     row.metered&&!row.unpriced?'$'+usd(row.estimatedUsd):row.metered?'Parcial $'+usd(row.estimatedUsd):'—'];
    for(const val of cells){const td=document.createElement('td');td.textContent=val;tr.append(td);}
    body.append(tr);
   }
   if(!body.children.length){const tr=document.createElement('tr');const td=document.createElement('td');td.colSpan=6;td.textContent='Todavía no hay consumo registrado en este período.';tr.append(td);body.append(tr);}
   grid.append(body);table.append(grid);
   issues.replaceChildren();
   const errors=r.recentIssues||[];
   if(!errors.length){const p=document.createElement('p');p.textContent='No hay alertas de uso registradas desde que se activó el contador.';issues.append(p);}
   for(const row of errors){
    const el=document.createElement('article');
    el.className='ai-usage-issue';
    const heading=document.createElement('strong');heading.textContent=row.title+' · '+(row.provider==='gemini'?'Gemini':'OpenAI');
    const detail=document.createElement('p');
    detail.textContent=[row.model,row.service,'HTTP '+row.status,row.code,
     row.retryAfter?'Reintentar en '+row.retryAfter:null].filter(Boolean).join(' · ');
    const advice=document.createElement('small');advice.textContent=row.advice+' (Última incidencia; puede haberse recuperado)';
    el.append(heading,detail,advice);issues.append(el);
   }
   note.textContent='Actualizado. El contador es local a GastosApp; no consulta el saldo ni la facturación global de las plataformas.';
  }catch(e){note.textContent='No se pudo consultar el uso: '+e.message;}
  finally{button.disabled=false;}
 }
 button.addEventListener('click',refresh);
 select.addEventListener('change',refresh);
 return {refresh};
}
