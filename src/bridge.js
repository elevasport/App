import {supabase,publicConfigurationError} from './client.js';
import {createRepository} from './repository.js';
const legacy=window.ElevaLegacy,gate=document.getElementById('authGate'),errorBox=document.getElementById('authError'),overlay=document.getElementById('saveOverlay');
const initialDefaults=legacy.getState(), repository=supabase?createRepository(supabase):null;
const bridge=window.ElevaBridge={mutation:false,dirty:false};
let session=null,loading=false,signingOut=false,passwordMode=location.hash.includes('type=invite')||location.hash.includes('type=recovery');
const originalToast=window.showToast;
const html=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
let lastToast='';
window.showToast=text=>{if(bridge.mutation)lastToast=text;else originalToast(text);};
const feedback=message=>{errorBox.textContent=message;};
const exitButton=document.createElement('button');exitButton.type='button';exitButton.className='auth-secondary session-signout';exitButton.textContent='Cerrar sesión';exitButton.hidden=true;document.getElementById('loginForm').append(exitButton);exitButton.addEventListener('click',()=>window.elevaSignOut());
async function edge(name,payload){
  const result=await supabase.functions.invoke(name,{body:payload});
  if(result.error){let message='No se pudo completar la operación.';try{const response=await result.error.context.json();message=response.error?.message||message;}catch{}throw new Error(message);}
  return result.data;
}
window.ElevaUsersUI.setDirectoryLoader(page=>edge('admin-users',{action:'list',page,per_page:100}));
if(supabase&&window.ElevaBranding){
  const brandingRow=row=>({settings:row.settings,logoPath:row.logo_path,logoUrl:row.logo_path?supabase.storage.from('eleva-branding').getPublicUrl(row.logo_path).data.publicUrl:null,version:row.updated_at});
  window.ElevaBranding.connect({
    async load(){const result=await supabase.from('app_branding').select('settings,logo_path,updated_at').eq('id',true).maybeSingle();if(result.error||!result.data)throw new Error('Identidad visual no configurada');return brandingRow(result.data);},
    async save(design,logo){
      if(!window.ElevaSessionUser?.active||window.ElevaSessionUser.role!=='admin')throw new Error('Solo el administrador puede guardar el diseño.');
      let path=design.logoPath,uploaded=null;
      try{
        if(logo){path='logos/'+crypto.randomUUID()+'.webp';const upload=await supabase.storage.from('eleva-branding').upload(path,logo,{contentType:'image/webp',upsert:false});if(upload.error)throw new Error('No se pudo subir el logo.');uploaded=path;}
        let query=supabase.from('app_branding').update({settings:design.settings,logo_path:path}).eq('id',true);
        if(design.version)query=query.eq('updated_at',design.version);
        const result=await query.select('settings,logo_path,updated_at').single();
        if(result.error||!result.data)throw new Error('No se confirmó el diseño. Puede haber cambiado desde otro administrador; vuelve a abrir Identidad visual.');
        return brandingRow(result.data);
      }catch(error){if(uploaded){try{await supabase.storage.from('eleva-branding').remove([uploaded]);}catch{}}throw error;}
    }
  });
}
document.getElementById('roleAvatar').setAttribute('aria-label','Abrir mi perfil');document.getElementById('roleAvatar').title='Mi cuenta';
async function refresh(){
  const {data,error}=await supabase.auth.getUser();
  if(error||!data.user)throw new Error('La sesión caducó. Inicia sesión nuevamente.');
  const state=await repository.load({...initialDefaults,userId:data.user.id});
  const user=state.settings.users.find(u=>u.id===data.user.id);
  window.ElevaSessionUser=user?{...user,email:data.user.email||''}:null;
  exitButton.hidden=false;
  if(!user?.active){gate.hidden=false;feedback('Tu cuenta está pendiente de activación por el administrador.');return false;}
  legacy.setState(state);legacy.render();
  if(document.getElementById('view-pending')?.classList.contains('active'))window.renderPendingView();
  gate.hidden=!passwordMode;return true;
}
const collectionRefreshButton=document.getElementById('refreshCollections');
if(supabase&&collectionRefreshButton)collectionRefreshButton.hidden=false;
window.elevaRefreshCollections=async()=>{
  if(!session||!window.ElevaSessionUser?.active)return;
  if(loading||bridge.mutation||signingOut||window.ElevaUsersUI?.isBusy()||window.ElevaBranding?.isBusy())return;
  if(document.querySelector('.backdrop.show'))return;
  loading=true;if(collectionRefreshButton){collectionRefreshButton.disabled=true;collectionRefreshButton.textContent='Actualizando…';}
  try{await refresh();}
  catch(error){window.ElevaFeedback?.error(error.message||'No se pudieron actualizar los cobros.');}
  finally{loading=false;if(collectionRefreshButton){collectionRefreshButton.disabled=false;collectionRefreshButton.textContent='Actualizar datos';}}
};
window.ElevaGroupedBilling?.connect({available:()=>repository?.billingGroupsAvailable===true,async prepare(input){
  if(!session||!window.ElevaSessionUser?.active||!window.hasPermission('issue_billing'))throw new Error('No tienes permiso para preparar comprobantes.');
  if(loading||bridge.mutation)throw new Error('Espera a que termine la actualización.');
  bridge.mutation=true;overlay.hidden=false;let committed=false;
  try{const id=await repository.prepareBilling(input);committed=true;await refresh();return id;}
  catch(error){if(committed){throw new Error('El comprobante se preparó, pero no se pudo recargar. Actualiza los datos antes de intentar otra operación.');}try{await refresh();}catch{}throw error;}
  finally{bridge.mutation=false;overlay.hidden=true;}
}});
window.ElevaBusinessCatalog?.connect({
  async load(){if(!session||!window.ElevaSessionUser?.active)throw new Error('Inicia sesión.');return repository.loadBusinessCatalog();},
  async save(catalog,version){return catalogMutation('manage_settings',()=>repository.saveBusinessCatalog(catalog,version),'La configuración se guardó, pero no se pudo recargar. Vuelve a abrirla antes de guardar otra vez.');},
  async reserve(input){return catalogMutation('manage_reservations',()=>repository.reserveBusiness(input),'La reserva se creó, pero no se pudo recargar. Actualiza los datos antes de crearla nuevamente.');}
});
window.ElevaCancellation?.connect({
  async refresh(){if(loading||bridge.mutation||signingOut)throw new Error('Espera a que termine la actualización.');loading=true;try{await refresh();}finally{loading=false;}},
  async decide(input){if(window.ElevaSessionUser?.role!=='admin')throw new Error('Solo el administrador define el destino del saldo.');return catalogMutation('manage_reservations',()=>repository.decideCancellation(input),'La decisión se guardó, pero no se pudo recargar. Cierra y vuelve a abrir la cuenta antes de continuar.');},
  async execute(input){return catalogMutation('register_payments',()=>repository.executeCancellationRefund(input),'La devolución se registró, pero no se pudo recargar. Cierra y vuelve a abrir la cuenta antes de continuar.');}
});
window.ElevaReservationForm?.connect({
  async reserve(input){return catalogMutation('manage_reservations',()=>repository.reserveBusiness(input),'La reserva se creó. Actualiza los datos antes de intentar crear otra.');},
  async details(id,input){return catalogMutation('manage_reservations',()=>repository.saveBusinessBookingDetails(id,input),'La reserva ya existe. Revisa su estado y vencimiento desde el detalle.');}
});
async function catalogMutation(permission,operation,committedMessage){
  if(!session||!window.ElevaSessionUser?.active||!window.hasPermission(permission))throw new Error('No tienes permiso para esta operación.');
  if(loading||bridge.mutation||signingOut)throw new Error('Espera a que termine la actualización.');
  bridge.mutation=true;overlay.hidden=false;let committed=false;
  try{const result=await operation();committed=true;await refresh();return result;}
  catch(error){if(committed){const failure=new Error(committedMessage);failure.committed=true;throw failure;}try{await refresh();}catch{}throw error;}
  finally{bridge.mutation=false;overlay.hidden=true;}
}
window.addEventListener('focus',()=>{if(document.getElementById('view-pending')?.classList.contains('active'))window.elevaRefreshCollections();});
async function mutation(name,original,args,context){
  if(!session||!window.ElevaSessionUser?.active){originalToast('Inicia sesión con una cuenta activa.');return;}
  if(loading){originalToast('Espera a que termine la actualización.');return;}
  if(window.ElevaDateUI&&!window.ElevaDateUI.validateCurrent())return;
  const before=legacy.getState(),openSheets=[...document.querySelectorAll('.backdrop.show')].map(x=>x.id);
  bridge.mutation=true;bridge.dirty=false;overlay.hidden=false;lastToast='';
  try{
    const result=await original.apply(context,args);
    const changed=bridge.dirty;
    if(changed){await repository.save(before,legacy.getState(),name);await refresh();}
    if(changed&&!['saveNewUserProfile','saveUserAccess','saveRoleLabel'].includes(name)){if(lastToast)originalToast(lastToast);else if(window.ElevaFeedback)window.ElevaFeedback.success('Cambios guardados correctamente.');else originalToast('Cambios guardados correctamente.');}
    else if(lastToast)originalToast(lastToast);
    return result;
  }catch(error){
    try{await refresh();}catch{legacy.setState(before);legacy.render();}
    openSheets.forEach(id=>window.openSheet(id));
    if(window.ElevaFeedback)window.ElevaFeedback.error(error.message||'No se pudo guardar.');else originalToast(error.message||'No se pudo guardar.');
  }finally{bridge.mutation=false;bridge.dirty=false;overlay.hidden=true;}
}
for(const name of new Set([...legacy.mutators,'togglePauseSeriesFromManager'])){
  const original=window[name];if(typeof original!=='function')continue;
  // Las llamadas internas conservan su retorno síncrono. Solo el evento de
  // usuario exterior abre la escritura; no hay colas ocultas de persistencia.
  window[name]=function(...args){if(name==='saveReservation'&&window.ElevaReservationForm?.handles())return window.ElevaReservationForm.save(...args);if(bridge.mutation)return original.apply(this,args);return mutation(name,original,args,this);};
}

// Storage usa la sesión del usuario y las políticas del bucket privado.
window.storeAttachmentFile=async file=>{
  if(!window.ElevaSessionUser?.active)throw new Error('Inicia sesión.');
  const id=crypto.randomUUID(),extension=({'image/jpeg':'jpg','image/png':'png','image/webp':'webp','application/pdf':'pdf'})[file.type];
  if(!extension||file.size<=0||file.size>15728640)throw new Error('El comprobante debe ser imagen o PDF de hasta 15 MB.');
  const path=`${window.ElevaSessionUser.id}/${id}.${extension}`;
  const upload=await supabase.storage.from('eleva-receipts').upload(path,file,{contentType:file.type,upsert:false});
  if(upload.error)throw new Error('No se pudo subir el comprobante.');
  await repository.check(supabase.from('attachments').insert({id,object_path:path,original_name:file.name||'Comprobante',mime_type:file.type,size_bytes:file.size,created_by:window.ElevaSessionUser.id}));
  return {id,name:file.name,type:file.type,size:file.size};
};
window.getAttachmentFile=async id=>{
  const attachment=await repository.check(supabase.from('attachments').select('*').eq('id',id).single());
  const file=await supabase.storage.from('eleva-receipts').download(attachment.object_path);
  if(file.error)throw new Error('No se pudo abrir el comprobante.');
  return {id,name:attachment.original_name,type:attachment.mime_type,blob:file.data};
};

// No convertir créditos en ingresos ficticios ni construir una caja parcial.
window.buildCashRecordsRaw=()=>{
  const state=legacy.getState(),records=state.movements.map(m=>({...m,virtual:false,sign:window.movementSign(m.type)}));
  for(const r of state.reservations)if(Number(r.refundedAmount)>0)records.push({id:`refund-${r.id}`,code:r.code,type:'refund',reservationId:r.id,clientId:r.clientId,amount:r.refundedAmount,method:'No especificado',accountId:r.refundAccountId||null,detail:r.outcomeNote||'Devolución',occurredAt:r.outcomeAt,sign:-1,virtual:true});
  return records;
};
window.treasuryBalances=()=>Object.fromEntries((repository?.tables.treasury_balances||[]).map(r=>[r.id,Number(r.balance)]));
const canonicalHistory=()=> (repository?.history||[]).map(r=>({type:['clients','quotes','followups'].includes(r.entity_table)?'commercial':['cash_movements','payment_allocations','credit_allocations','billing_documents'].includes(r.entity_table)?'financial':'operational',at:r.occurred_at,title:({INSERT:'Registro creado',UPDATE:'Registro actualizado',DELETE:'Configuración retirada'})[r.operation],meta:`${r.actor_name||'Usuario'} · ${r.record_id}`,icon:'H',entityType:r.entity_table,entityId:r.record_id}));
window.buildHistoryRecords=()=>[...canonicalHistory(),...legacy.getState().reservations.filter(r=>Number(r.refundedAmount)>0).map(r=>({type:'financial',at:r.outcomeAt,title:'Reembolso registrado · '+r.code,meta:legacy.format.money(r.refundedAmount)+' · '+window.treasuryAccountLabel(r.refundAccountId),icon:'R',entityType:'reservation',entityId:r.id}))];

window.renderSessionSheet=()=>{
  const user=window.ElevaSessionUser,host=document.getElementById('sessionCurrent'),list=document.getElementById('sessionUsers');
  if(host){const initials=user?.initials||String(user?.name||'Usuario').trim().split(/\s+/).slice(0,2).map(part=>part[0]).join('').toUpperCase();host.innerHTML=`<div class="account-identity"><div class="account-avatar" aria-hidden="true">${html(initials)}</div><div class="account-name">${html(user?.name||'Usuario')}</div><div class="account-email">${html(user?.email||'Correo no disponible')}</div><span class="account-role">${html(window.currentRole().name)}</span></div>`;window.ElevaAccessUI?.decorateCard(host);}
  if(list){list.innerHTML='<button type="button" onclick="elevaChangePassword()">Cambiar contraseña</button><button type="button" class="session-signout" onclick="elevaSignOut()"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4M14 8l4 4-4 4M8 12h10"/></svg>Cerrar sesión</button>';const title=list.closest('.form-card')?.querySelector('h3');if(title)title.textContent='Acceso y seguridad';}
  const heading=document.querySelector('#sessionSheet .sheet-head h2');if(heading)heading.textContent='Mi cuenta';
  const preview=document.getElementById('rolePreviewBlock');if(preview)preview.hidden=true;
};
function clearSessionUI(){
  window.ElevaAccessUI?.showLogin();
  window.ElevaFeedback?.dismiss();
  session=null;passwordMode=false;window.ElevaSessionUser=null;window.ElevaUsersUI.clearDirectory();legacy.setState(structuredClone(initialDefaults));legacy.render();
  document.querySelectorAll('.backdrop.show').forEach(sheet=>window.closeSheet(sheet.id));
  document.getElementById('masterDetailBody').replaceChildren();document.getElementById('sessionCurrent').replaceChildren();document.getElementById('sessionUsers').replaceChildren();
  gate.hidden=false;exitButton.hidden=true;
  document.getElementById('authEmail').disabled=false;document.getElementById('authEmail').parentElement.hidden=false;document.getElementById('authPassword').value='';document.getElementById('recoverPassword').hidden=false;document.getElementById('authSubmit').textContent='Iniciar sesión';
}
window.elevaSignOut=async()=>{
  if(signingOut||bridge.mutation||loading||window.ElevaReservationForm?.isBusy()||window.ElevaUsersUI.isBusy()||window.ElevaBranding?.isBusy()){originalToast('Espera a que termine la operación.');return;}
  signingOut=true;exitButton.disabled=true;document.querySelectorAll('.session-signout').forEach(button=>button.disabled=true);
  try{const result=await supabase.auth.signOut({scope:'local'});if(result.error)throw result.error;clearSessionUI();feedback('Sesión cerrada.');location.reload();}
  catch{originalToast('No se pudo cerrar sesión. Vuelve a intentarlo.');}
  finally{signingOut=false;exitButton.disabled=false;document.querySelectorAll('.session-signout').forEach(button=>button.disabled=false);}
};
window.elevaChangePassword=()=>{passwordMode=true;showPasswordForm();};
function showPasswordForm(){window.ElevaAccessUI?.showPasswordMode();gate.hidden=false;document.getElementById('authEmail').disabled=true;document.getElementById('authEmail').parentElement.hidden=true;document.getElementById('recoverPassword').hidden=true;document.getElementById('authSubmit').textContent='Guardar contraseña';document.getElementById('authPassword').value='';feedback('Define una contraseña de al menos 12 caracteres.');}

window.addUserMasterRow=()=>{
  window.ElevaUsersUI.openCreate({create:input=>edge('admin-users',input),refresh,feedback:originalToast});
};
window.submitBillingDocument=async documentId=>{try{await edge('billing-submit',{document_id:documentId});await refresh();}catch(error){originalToast(error.message);}};
const originalBillingSheet=window.openBillingSheet;
window.openBillingSheet=function(...args){const m=legacy.getState().movements.find(x=>String(x.id)===String(args[0]));if(m?.billingPaymentIds?.length>1&&window.ElevaGroupedBilling)return window.ElevaGroupedBilling.openDocument(m.id);const result=originalBillingSheet.apply(this,args);if(m?.billingDocumentId){const host=document.getElementById('billingStatusCard')||document.querySelector('#billingSheet .sheet');if(host&&!host.querySelector('[data-electronic-send]')){const button=document.createElement('button');button.type='button';button.className='secondary';button.textContent='Emisión electrónica pendiente de proveedor';button.dataset.electronicSend='';button.disabled=true;button.addEventListener('click',()=>window.submitBillingDocument(m.billingDocumentId));host.append(button);}}return result;};

document.getElementById('loginForm').addEventListener('submit',async event=>{
  event.preventDefault();if(!supabase)return;const button=document.getElementById('authSubmit');button.disabled=true;feedback('');
  try{
    if(passwordMode&&session){const password=document.getElementById('authPassword').value;if(password.length<12)throw new Error('Usa al menos 12 caracteres.');const result=await supabase.auth.updateUser({password});if(result.error)throw new Error('No se pudo actualizar la contraseña.');passwordMode=false;document.getElementById('authPassword').value='';await refresh();}
    else{const result=await supabase.auth.signInWithPassword({email:document.getElementById('authEmail').value.trim(),password:document.getElementById('authPassword').value});if(result.error)throw new Error('Correo o contraseña incorrectos.');window.ElevaAccessUI?.rememberSuccessfulLogin(document.getElementById('authEmail').value.trim());document.getElementById('authPassword').value='';session=result.data.session;await refresh();}
  }catch(error){feedback(error.message);}finally{button.disabled=false;}
});
document.getElementById('recoverPassword').addEventListener('click',()=>window.ElevaAccessUI.openRecovery());
window.ElevaAccessUI?.setRecoveryHandler(async email=>{
  if(!supabase)throw new Error('Servicio no configurado');
  const result=await supabase.auth.resetPasswordForEmail(email,{redirectTo:location.origin+location.pathname});
  if(result.error)throw result.error;return result.data;
});
if(!supabase){feedback(publicConfigurationError());document.getElementById('authSubmit').disabled=true;}
else{
  supabase.auth.onAuthStateChange((event,nextSession)=>{setTimeout(async()=>{
    session=nextSession;
    if(!session){clearSessionUI();return;}
    if(event==='PASSWORD_RECOVERY'){passwordMode=true;showPasswordForm();return;}
    if(bridge.mutation||loading||event==='TOKEN_REFRESHED')return;
    loading=true;try{await refresh();if(passwordMode)showPasswordForm();}catch(error){gate.hidden=false;feedback(error.message);}finally{loading=false;}
  },0);});
}
