const b64urlToBytes=input=>{
 const raw=String(input).replace(/-/g,'+').replace(/_/g,'/');
 const decoded=atob(raw+'='.repeat((4-raw.length%4)%4));
 return Uint8Array.from(decoded,c=>c.charCodeAt(0));
};
const bytesToB64url=bytes=>{
 let s='';for(const byte of new Uint8Array(bytes))s+=String.fromCharCode(byte);
 return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
};
const creationOptions=options=>({
 ...options,challenge:b64urlToBytes(options.challenge),
 user:{...options.user,id:b64urlToBytes(options.user.id)},
 excludeCredentials:(options.excludeCredentials||[]).map(x=>({...x,id:b64urlToBytes(x.id)}))
});
const authenticationOptions=options=>({
 ...options,challenge:b64urlToBytes(options.challenge),
 allowCredentials:(options.allowCredentials||[]).map(x=>({...x,id:b64urlToBytes(x.id)}))
});
const registerJSON=result=>({
 id:result.id,rawId:bytesToB64url(result.rawId),type:result.type,
 response:{clientDataJSON:bytesToB64url(result.response.clientDataJSON),
  attestationObject:bytesToB64url(result.response.attestationObject),
  transports:result.response.getTransports?.()||[]},
 clientExtensionResults:result.getClientExtensionResults()
});
const authenticationJSON=result=>({
 id:result.id,rawId:bytesToB64url(result.rawId),type:result.type,
 response:{clientDataJSON:bytesToB64url(result.response.clientDataJSON),
  authenticatorData:bytesToB64url(result.response.authenticatorData),
  signature:bytesToB64url(result.response.signature),
  userHandle:result.response.userHandle?bytesToB64url(result.response.userHandle):undefined},
 clientExtensionResults:result.getClientExtensionResults()
});
export function setupPasskeyUI({request,afterLogin,notify}){
 const $=id=>document.getElementById(id);
 const panel=$('passkeyDevices'),status=$('passkeyStatus');
 const supported=Boolean(window.isSecureContext&&window.PublicKeyCredential&&navigator.credentials);
 let originMatches=false;
 const tell=(message,error=false)=>{status.textContent=message;status.dataset.kind=error?'error':'neutral';};
 async function capabilities(){
  try{
   const r=await request('/api/security/capabilities');
   originMatches=Boolean(r.passkeysOrigin&&r.passkeysOrigin===window.location.origin);
   $('passkeyLoginBtn').classList.toggle('hidden',!supported||!r.passkeysReady||!r.passkeysRegistered||!originMatches);
   if(!r.passkeysReady)tell('Biometría pendiente: configurá APP_ORIGIN con la URL pública HTTPS real en el servidor.');
   else if(!originMatches)tell('El dominio configurado no coincide con esta PWA. En el servidor: '+r.passkeysOrigin+
     ' (RP ID '+r.passkeysRpId+'). En este dispositivo: '+window.location.origin+
     '. Corregí APP_ORIGIN='+window.location.origin+' en /opt/apps/gastosapp/.env y recreá el contenedor web. No se puede registrar biometría hasta corregirlo.',true);
   else if(!supported)tell('Este navegador no admite passkeys o la conexión no es HTTPS.');
   else tell('Dominio validado: '+window.location.origin+'. Podés registrar Face ID, huella o PIN de tu dispositivo.');
  }catch{ originMatches=false;$('passkeyLoginBtn').classList.add('hidden'); }
 }
 async function refresh(){
  await capabilities();
  try{
   const data=await request('/api/passkeys');
   panel.replaceChildren();
   if(!data.devices.length){const p=document.createElement('p');p.textContent='Todavía no registraste dispositivos.';panel.append(p);}
   for(const item of data.devices){
    const row=document.createElement('div');row.className='security-device';
    const label=document.createElement('span');label.textContent=item.name+' · '+new Date(item.createdAt).toLocaleDateString('es-AR');
    const revoke=document.createElement('button');revoke.type='button';revoke.className='btn btn-quiet';
    revoke.textContent='Revocar';
    revoke.addEventListener('click',async()=>{
     const password=window.prompt('Confirmá tu contraseña actual para revocar este dispositivo:');
     if(!password)return;
     if(!window.confirm('¿Revocar esta passkey? No podrás usarla para ingresar.'))return;
     try{await request('/api/passkeys/'+encodeURIComponent(item.id),'DELETE',{password});
      tell('Dispositivo revocado.');await refresh();
     }catch(e){tell(e.message,true);}
    });
    row.append(label,revoke);panel.append(row);
   }
   $('passkeyRegisterBtn').disabled=!supported||!data.enabled||!originMatches;
  }catch(e){tell(e.message,true);}
 }
 async function register(){
  if(!supported){tell('Face ID/huella no disponibles en este navegador o sitio.',true);return;}
  if(!originMatches){tell('APP_ORIGIN no coincide con la dirección actual. Corregí el dominio indicado arriba antes de registrar una passkey.',true);return;}
  const btn=$('passkeyRegisterBtn');btn.disabled=true;
  try{
   tell('Abrí la verificación de tu dispositivo...');
   const start=await request('/api/passkeys/register/options','POST',{});
   const credential=await navigator.credentials.create({publicKey:creationOptions(start.options)});
   if(!credential)throw new Error('Registro cancelado.');
   const name=String($('passkeyDeviceName').value||'Mi dispositivo').trim().slice(0,60);
   await request('/api/passkeys/register/verify','POST',{
    requestId:start.requestId,name,response:registerJSON(credential)
   });
   tell('Passkey registrada correctamente. Podrás usarla en el próximo inicio de sesión.');
   await refresh();notify?.('Biometría activada para este dispositivo.');
  }catch(e){tell(e.name==='NotAllowedError'?'Cancelaste la verificación del dispositivo.':e.message,true);}
  finally{btn.disabled=false;}
 }
 async function login(){
  if(!originMatches){$('loginError').textContent='APP_ORIGIN no coincide con este dominio. Usá la contraseña y revisá Configuración.';return;}
  const btn=$('passkeyLoginBtn');btn.disabled=true;
  try{
   $('loginError').textContent='';
   const start=await request('/api/passkeys/login/options','POST',{});
   const credential=await navigator.credentials.get({publicKey:authenticationOptions(start.options)});
   if(!credential)throw new Error('Inicio cancelado.');
   await request('/api/passkeys/login/verify','POST',{
    requestId:start.requestId,response:authenticationJSON(credential)
   });
   await afterLogin();
  }catch(e){
   $('loginError').textContent=e.name==='NotAllowedError'?
    'Se canceló la verificación. Podés ingresar con contraseña.':e.message;
  }finally{btn.disabled=false;}
 }
 $('passkeyRegisterBtn').addEventListener('click',register);
 $('passkeyLoginBtn').addEventListener('click',login);
 return {refresh,capabilities};
}
