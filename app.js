
const nowISO = () => new Date().toISOString();
const localDateValue = (d=new Date()) => {
  const x = new Date(d.getTime() - d.getTimezoneOffset()*60000);
  return x.toISOString().slice(0,10);
};
const localTimeValue = (d=new Date()) => `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
const fmtDateTime = iso => {
  if(!iso) return '—';
  const d=new Date(iso);
  return d.toLocaleString('es-PE',{day:'2-digit',month:'2-digit',year:'numeric',hour:'numeric',minute:'2-digit'});
};
const fmtScheduled = (date,time) => {
  if(!date) return 'Sin fecha';
  const [y,m,d]=date.split('-');
  return `${d}/${m}/${y}${time?' · '+time:''}`;
};
const money=n=>'S/ '+Number(n||0).toLocaleString('es-PE',{maximumFractionDigits:0});
const escapeHtml = s => String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const initials = name => String(name||'CL').trim().split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase();

let clients = JSON.parse(localStorage.getItem('eleva_clients_v3') || 'null') || [];
let quotes = JSON.parse(localStorage.getItem('eleva_quotes_v3') || 'null') || [];
let followups = JSON.parse(localStorage.getItem('eleva_followups_v3') || 'null') || [];
let reservations = JSON.parse(localStorage.getItem('eleva_reservations_v5') || 'null') || [];
let movements = JSON.parse(localStorage.getItem('eleva_movements_v1') || 'null') || [];
let recurringSeries = JSON.parse(localStorage.getItem('eleva_recurring_series_v1') || 'null') || [];
let recurringDraftBlocks=[];
let recurringDraftSeq=0;
let settings = JSON.parse(localStorage.getItem('eleva_settings_v5') || 'null') || {
  fut6:50,fut9:120,exclusive:2000,guarantee:300,extraHour:180,discount:200,
  conditions:'Público general: ingreso 30 min antes y cierre 30 min después. La garantía se devuelve después del evento. No incluye instalación de estrado ni permisos del mismo. El organizador deberá contratar personal de seguridad y primeros auxilios cuando corresponda.'
};
const defaultExclusivePackage=()=>({
  name:'Alquiler exclusivo',
  description:'Uso del complejo para el evento deportivo',
  groups:[
    {key:'sports',title:'Zona deportiva',items:['3 canchas de FUT 6 o 1 cancha de FUT 9 · 2,205 m²','Zona de descanso con mesas, sillas y pérgolas alrededor de las canchas','Iluminación de canchas desde las 6:30 p. m.','Opción de vóley']},
    {key:'other',title:'Otras zonas',items:['Estacionamiento interno','Zona de parrilla y área multiusos','Zona de servicio / recojo de alimentos','Baños para hombres y mujeres con jabón y papel higiénico durante el turno']},
    {key:'services',title:'Servicios del establecimiento',items:['Portería / seguridad','Encargado de turno para coordinación, orden y limpieza']}
  ]
});
const defaultPaymentInfo=()=>({bank:'BCP',account:'5607336628026',cci:'00257000733662802608',yape:'932270350',holder:'ASOCIACION ELEVA SPORTS',whatsapp:'932270350',rulesUrl:'https://linktr.ee/elevasportperu'});
const defaultMessageTemplates=()=>({
  reservationConfirmation:'Hola {cliente}. Te compartimos la confirmación de tu reserva en Eleva Sport.\n\n{codigo}\n{fecha}\n{horario}\n{detalle}\nTotal: {total}\nAdelanto: {pagado}\nSaldo: {saldo}\n\nEleva Sport - Trujillo'
});
function ensureMessageTemplates(){
  const def=defaultMessageTemplates();
  if(!settings.messageTemplates||typeof settings.messageTemplates!=='object')settings.messageTemplates=cloneData(def);
  else Object.keys(def).forEach(k=>{if(typeof settings.messageTemplates[k]!=='string'||!settings.messageTemplates[k].trim())settings.messageTemplates[k]=def[k]});
}
const defaultPaymentMethods=()=>[
  {id:'pm_cash',name:'Efectivo',active:true},
  {id:'pm_transfer',name:'Transferencia',active:true}
];
function ensurePaymentMethods(){
  if(!Array.isArray(settings.paymentMethods)||!settings.paymentMethods.length){settings.paymentMethods=defaultPaymentMethods();return}
  const seen=new Set();settings.paymentMethods=settings.paymentMethods.map((m,i)=>({id:String(m&&m.id||`pm_${i+1}`),name:String(m&&m.name||'').trim(),active:m&&m.active!==false})).filter(m=>m.name&&!seen.has(m.id)&&(seen.add(m.id),true));
  if(!settings.paymentMethods.length)settings.paymentMethods=defaultPaymentMethods()
}
function activePaymentMethods(){ensurePaymentMethods();return settings.paymentMethods.filter(m=>m.active&&m.name)}
function fillPaymentMethodSelect(select,preferred=''){
  if(!select)return;const arr=activePaymentMethods();select.innerHTML=arr.map(m=>`<option value="${escapeHtml(m.name)}">${escapeHtml(m.name)}</option>`).join('');
  if(preferred&&arr.some(m=>m.name===preferred))select.value=preferred;
  else if(arr.some(m=>m.name==='Efectivo'))select.value='Efectivo';
}
function updatePaymentMethodsMasterBadge(){
  const arr=activePaymentMethods(),badge=document.getElementById('paymentMethodsMasterBadge'),txt=document.getElementById('paymentMethodsMasterText');
  if(badge)badge.textContent=`${arr.length} activo${arr.length===1?'':'s'}`;
  if(txt)txt.textContent=arr.length?arr.map(m=>m.name).join(' · '):'Sin métodos activos'
}
function cloneData(v){return JSON.parse(JSON.stringify(v))}
function ensureQuoteSettings(){
  if(!settings.exclusivePackage||!Array.isArray(settings.exclusivePackage.groups))settings.exclusivePackage=defaultExclusivePackage();
  else{
    const d=defaultExclusivePackage();settings.exclusivePackage.name=settings.exclusivePackage.name||d.name;settings.exclusivePackage.description=settings.exclusivePackage.description||d.description;
    d.groups.forEach(g=>{let current=settings.exclusivePackage.groups.find(x=>x.key===g.key||x.title===g.title);if(!current){settings.exclusivePackage.groups.push(cloneData(g));return}current.key=current.key||g.key;current.title=current.title||g.title;if(!Array.isArray(current.items))current.items=cloneData(g.items)})
  }
  settings.paymentInfo={...defaultPaymentInfo(),...(settings.paymentInfo||{})};
}
ensureQuoteSettings();
ensureMessageTemplates();
ensurePaymentMethods();
const defaultOperatingSchedule=()=>({0:{active:true,open:'08:00',close:'00:00'},1:{active:true,open:'08:00',close:'00:00'},2:{active:true,open:'08:00',close:'00:00'},3:{active:true,open:'08:00',close:'00:00'},4:{active:true,open:'08:00',close:'00:00'},5:{active:true,open:'08:00',close:'00:00'},6:{active:true,open:'08:00',close:'00:00'}});
function ensureOperatingSchedule(){
  if(!settings.schedule||typeof settings.schedule!=='object')settings.schedule=defaultOperatingSchedule();
  const def=defaultOperatingSchedule();for(let i=0;i<7;i++){if(!settings.schedule[i])settings.schedule[i]=def[i];settings.schedule[i].active=settings.schedule[i].active!==false;settings.schedule[i].open=settings.schedule[i].open||'08:00';settings.schedule[i].close=settings.schedule[i].close||'00:00'}
}
ensureOperatingSchedule();

let selectedClient=null, afterClientCreate=false, quoteMode='exclusive', editingClientId=null, reservationRateManual=false, editingReservationId=null, shareReservationId=null, reservationFilter='upcoming', reservationWorkspace='agenda', reservationFocusDate=localDateValue(), reservationCourtFocus='Cancha 1', courtBookingMode='single';
let quotePackageDraft=cloneData(settings.exclusivePackage);
let quoteFilter='all', followFilter='pending', homeReservationFilter='all', homePeriod='month', homeCustomStart='', homeCustomEnd='', openQuoteId=null, openFollowId=null, preselectQuoteId=null, openReservationId=null, reservationKind=null, preselectReservationQuoteId=null, calendarQuickSlot=null;
let homeAnchorDate=localDateValue();
let quoteConversionContext=null;
let calendarCursor=new Date(), calendarSelectedDate=localDateValue(), calendarView='day', reservationDatePickerMode=false;
let cashFilter='all', movementFormType='expense';
let paymentMethodsDraft=[];
let pendingPaymentAttachment=null,pendingMovementAttachment=null,attachmentViewerUrl=null;
const ATTACHMENT_DB_NAME='eleva_attachments_v1',ATTACHMENT_STORE='files';

function persist(){
  localStorage.setItem('eleva_clients_v3',JSON.stringify(clients));
  localStorage.setItem('eleva_quotes_v3',JSON.stringify(quotes));
  localStorage.setItem('eleva_followups_v3',JSON.stringify(followups));
  localStorage.setItem('eleva_reservations_v5',JSON.stringify(reservations));
  localStorage.setItem('eleva_movements_v1',JSON.stringify(movements));
  localStorage.setItem('eleva_recurring_series_v1',JSON.stringify(recurringSeries));
  localStorage.setItem('eleva_settings_v5',JSON.stringify(settings));
}
function openAttachmentDb(){
  return new Promise((resolve,reject)=>{const req=indexedDB.open(ATTACHMENT_DB_NAME,1);req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains(ATTACHMENT_STORE))db.createObjectStore(ATTACHMENT_STORE,{keyPath:'id'})};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error||new Error('No se pudo abrir el almacenamiento de comprobantes'))})
}
async function storeAttachmentFile(file){
  if(!file)return null;if(!String(file.type||'').startsWith('image/'))throw new Error('El comprobante debe ser una imagen');if(file.size>15*1024*1024)throw new Error('La imagen supera 15 MB');
  const id=`att_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,record={id,name:file.name||'comprobante',type:file.type||'image/jpeg',size:file.size||0,createdAt:nowISO(),blob:file.slice(0,file.size,file.type||'image/jpeg')};
  const db=await openAttachmentDb();await new Promise((resolve,reject)=>{const tx=db.transaction(ATTACHMENT_STORE,'readwrite');tx.objectStore(ATTACHMENT_STORE).put(record);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error||new Error('No se pudo guardar el comprobante'));tx.onabort=()=>reject(tx.error||new Error('No se pudo guardar el comprobante'))});db.close();return {id:record.id,name:record.name,type:record.type,size:record.size}
}
async function getAttachmentFile(id){
  if(!id)return null;const db=await openAttachmentDb();const record=await new Promise((resolve,reject)=>{const tx=db.transaction(ATTACHMENT_STORE,'readonly'),req=tx.objectStore(ATTACHMENT_STORE).get(id);req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>reject(req.error||new Error('No se pudo leer el comprobante'))});db.close();return record
}
function attachmentState(context){return context==='payment'?pendingPaymentAttachment:pendingMovementAttachment}
function setAttachmentState(context,value){if(context==='payment')pendingPaymentAttachment=value;else pendingMovementAttachment=value}
function attachmentElements(context){return {name:document.getElementById(context==='payment'?'paymentAttachmentName':'movementAttachmentName'),preview:document.getElementById(context==='payment'?'paymentAttachmentPreview':'movementAttachmentPreview'),camera:document.getElementById(context==='payment'?'paymentCameraInput':'movementCameraInput'),file:document.getElementById(context==='payment'?'paymentFileInput':'movementFileInput')}}
function resetPendingAttachment(context){const current=attachmentState(context);if(current&&current.url)URL.revokeObjectURL(current.url);setAttachmentState(context,null);const e=attachmentElements(context);if(e.name)e.name.textContent='Sin foto';if(e.preview){e.preview.innerHTML='';e.preview.classList.add('hidden')}if(e.camera)e.camera.value='';if(e.file)e.file.value=''}
function handleAttachmentSelection(context,input){
  const file=input&&input.files&&input.files[0];if(!file)return;if(!String(file.type||'').startsWith('image/')){showToast('Selecciona una imagen');input.value='';return}if(file.size>15*1024*1024){showToast('La foto supera 15 MB');input.value='';return}
  const previous=attachmentState(context);if(previous&&previous.url)URL.revokeObjectURL(previous.url);const url=URL.createObjectURL(file);setAttachmentState(context,{file,url});const e=attachmentElements(context);if(e.name)e.name.textContent=file.name||'Foto seleccionada';if(e.preview){e.preview.classList.remove('hidden');e.preview.innerHTML=`<img src="${url}" alt="Comprobante seleccionado"><div><b>${escapeHtml(file.name||'Foto')}</b><span>${Math.max(1,Math.round(file.size/1024))} KB</span></div><button type="button" class="attachment-clear" onclick="resetPendingAttachment('${context}')">Quitar</button>`}
}
async function persistPendingAttachment(context){const state=attachmentState(context);if(!state||!state.file)return null;return await storeAttachmentFile(state.file)}
async function openMovementAttachment(id){
  const m=movements.find(x=>String(x.id)===String(id));if(!m||!m.attachmentId){showToast('Este movimiento no tiene comprobante');return}
  try{const rec=await getAttachmentFile(m.attachmentId);if(!rec||!rec.blob){showToast('No se encontró el comprobante');return}if(attachmentViewerUrl)URL.revokeObjectURL(attachmentViewerUrl);attachmentViewerUrl=URL.createObjectURL(rec.blob);attachmentViewerImage.src=attachmentViewerUrl;attachmentViewerTitle.textContent=m.type==='payment'?'Comprobante de cobro':'Comprobante';attachmentViewerMeta.textContent=`${m.code||''}${m.method?' · '+m.method:''}${m.attachmentName?' · '+m.attachmentName:''}`;openSheet('attachmentViewerSheet')}catch(e){showToast('No se pudo abrir el comprobante')}
}
function closeAttachmentViewer(){closeSheet('attachmentViewerSheet');if(attachmentViewerUrl){URL.revokeObjectURL(attachmentViewerUrl);attachmentViewerUrl=null}attachmentViewerImage.removeAttribute('src')}

function cleanupLegacyDemoDataV14(){
  if(localStorage.getItem('eleva_demo_cleanup_v14')==='1')return;
  quotes=quotes.filter(q=>{
    const demo27=String(q.id)==='27'&&q.code==='EV-0027'&&Number(q.clientId)===2&&q.eventType==='Integración'&&Number(q.total)===1180;
    const demo28=String(q.id)==='28'&&q.code==='EV-0028'&&Number(q.clientId)===1&&q.eventType==='Cumpleaños'&&Number(q.total)===420;
    return !(demo27||demo28)
  });
  followups=followups.filter(f=>!(String(f.id)==='101'&&Number(f.clientId)===1&&f.note==='Llamar para confirmar el horario'));
  const clientStillUsed=id=>quotes.some(q=>Number(q.clientId)===id)||followups.some(f=>Number(f.clientId)===id)||reservations.some(r=>Number(r.clientId)===id);
  clients=clients.filter(c=>{
    const juanDemo=Number(c.id)===1&&c.name==='Juan Pérez'&&c.phone==='999 111 222';
    const mocheDemo=Number(c.id)===2&&c.name==='Empresa Moche'&&c.phone==='944 222 333';
    if(juanDemo&&!clientStillUsed(1))return false;
    if(mocheDemo&&!clientStillUsed(2))return false;
    return true
  });
  persist();
  localStorage.setItem('eleva_demo_cleanup_v14','1')
}

function showToast(msg){const t=document.getElementById('toast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2300)}
function updateMobileVisualViewport(){
  const vv=window.visualViewport;
  const h=vv?vv.height:window.innerHeight;
  const top=vv?vv.offsetTop:0;
  document.documentElement.style.setProperty('--vv-height',`${Math.round(h)}px`);
  document.documentElement.style.setProperty('--vv-top',`${Math.round(top)}px`)
}
updateMobileVisualViewport();

let modalLockedScrollY=0;

function lockPageForModal(){
  if(document.querySelectorAll('.backdrop.show').length>1)return;
  modalLockedScrollY=window.scrollY||window.pageYOffset||0;
  document.body.style.position='fixed';
  document.body.style.top=`-${modalLockedScrollY}px`;
  document.body.style.left='0';
  document.body.style.right='0';
  document.body.style.width='100%';
  document.body.style.overflow='hidden'
}

function unlockPageAfterModal(){
  if(document.querySelector('.backdrop.show'))return;
  const y=modalLockedScrollY||0;
  document.body.style.position='';
  document.body.style.top='';
  document.body.style.left='';
  document.body.style.right='';
  document.body.style.width='';
  document.body.style.overflow='';
  window.scrollTo(0,y)
}

function openSheet(id){
  updateMobileVisualViewport();
  const overlay=document.getElementById(id);if(!overlay)return;
  overlay.classList.add('show');
  lockPageForModal();
  requestAnimationFrame(()=>{
    const sheet=overlay.querySelector('.sheet');
    if(sheet)sheet.scrollTop=0
  })
}

function closeSheet(id){
  const overlay=document.getElementById(id);if(overlay)overlay.classList.remove('show');
  unlockPageAfterModal()
}

function keepFocusedFieldVisible(el){
  if(!el)return;
  const sheet=el.closest('.sheet');
  if(!sheet)return;
  setTimeout(()=>{
    const er=el.getBoundingClientRect();
    const sr=sheet.getBoundingClientRect();
    const vv=window.visualViewport;
    const visibleBottom=vv?(vv.offsetTop+vv.height):window.innerHeight;
    const topLimit=Math.max(sr.top+86,(vv?vv.offsetTop:0)+86);
    const bottomLimit=Math.min(sr.bottom,visibleBottom)-28;

    if(er.bottom>bottomLimit){
      sheet.scrollTop += (er.bottom-bottomLimit)+22
    }else if(er.top<topLimit){
      sheet.scrollTop -= (topLimit-er.top)+18
    }
  },220)
}

document.addEventListener('focusin',e=>{
  if(e.target.matches('.sheet input,.sheet textarea,.sheet select')){
    keepFocusedFieldVisible(e.target)
  }
});

if(window.visualViewport){
  const syncModalViewport=()=>{
    updateMobileVisualViewport();
    const active=document.activeElement;
    if(active&&active.matches('.sheet input,.sheet textarea,.sheet select')){
      keepFocusedFieldVisible(active)
    }
  };
  window.visualViewport.addEventListener('resize',syncModalViewport);
  window.visualViewport.addEventListener('scroll',syncModalViewport)
}
window.addEventListener('orientationchange',()=>setTimeout(updateMobileVisualViewport,120));
function go(name){
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.querySelectorAll('.nav > button').forEach(b=>b.classList.remove('active'));
  document.getElementById('view-'+name).classList.add('active');
  const n=document.getElementById('nav-'+name);if(n)n.classList.add('active');
  if(name==='home')renderHome(); if(name==='quotes')renderQuotes(); if(name==='follow')renderFollowups(); if(name==='reservations')renderReservationWorkspace();
  window.scrollTo({top:0,behavior:'smooth'});
}
function clientById(id){return clients.find(c=>String(c.id)===String(id))}
function quoteById(id){return quotes.find(q=>String(q.id)===String(id))}
function reservationById(id){return reservations.find(r=>String(r.id)===String(id))}
function nextQuoteCode(){
  const max=Math.max(0,...quotes.map(q=>Number(String(q.code||'').replace(/\D/g,''))||0));
  return 'EV-'+String(max+1).padStart(4,'0');
}
function nextReservationCode(){
  const max=Math.max(0,...reservations.map(r=>Number(String(r.code||'').replace(/\D/g,''))||0));
  return 'RS-'+String(max+1).padStart(4,'0');
}
function nextRecurringSeriesCode(){const max=Math.max(0,...recurringSeries.map(x=>Number(String(x.code||'').replace(/\D/g,''))||0));return 'SR-'+String(max+1).padStart(4,'0')}
function nextMovementCode(){const max=Math.max(0,...movements.map(m=>Number(String(m.code||'').replace(/\D/g,''))||0));return 'MOV-'+String(max+1).padStart(4,'0')}
function openActions(){openSheet('actionSheet')}

function openNewClient(fromQuote){
  afterClientCreate=!!fromQuote;editingClientId=null;
  if(document.getElementById('selectClientSheet').classList.contains('show'))closeSheet('selectClientSheet');
  ['cName','cPhone','cCompany','cDoc','cEmail','cNotes','cRateFut6','cRateFut9'].forEach(id=>{const el=document.getElementById(id);if(el)el.value=''});
  if(document.getElementById('clientFormTitle'))clientFormTitle.textContent='Nuevo cliente';
  if(document.getElementById('clientSaveBtn'))clientSaveBtn.textContent='Crear cliente';
  openSheet('clientSheet');
}
function openEditClient(id){
  const c=clientById(id);if(!c)return;editingClientId=c.id;afterClientCreate=false;
  cName.value=c.name||'';cPhone.value=c.phone||'';cCompany.value=c.company||'';cDoc.value=c.doc||'';cEmail.value=c.email||'';cNotes.value=c.notes||'';
  cRateFut6.value=c.specialFut6??'';cRateFut9.value=c.specialFut9??'';
  clientFormTitle.textContent='Editar cliente';clientSaveBtn.textContent='Guardar cambios';openSheet('clientSheet')
}
function saveClient(){
  const name=document.getElementById('cName').value.trim();
  if(!name){showToast('El nombre es obligatorio');document.getElementById('cName').focus();return}
  const specialFut6=cRateFut6.value===''?null:Number(cRateFut6.value);
  const specialFut9=cRateFut9.value===''?null:Number(cRateFut9.value);
  if(editingClientId){
    const c=clientById(editingClientId);if(!c)return;
    Object.assign(c,{name,phone:cPhone.value.trim(),company:cCompany.value.trim(),doc:cDoc.value.trim(),email:cEmail.value.trim(),notes:cNotes.value.trim(),specialFut6,specialFut9,updatedAt:nowISO()});
    persist();editingClientId=null;closeSheet('clientSheet');renderDirectory();renderClientOptions();if(openClientProfileId)renderClientProfile();showToast('Cliente actualizado');return
  }
  const c={id:Date.now(),name,phone:cPhone.value.trim(),company:cCompany.value.trim(),doc:cDoc.value.trim(),email:cEmail.value.trim(),notes:cNotes.value.trim(),specialFut6,specialFut9,createdAt:nowISO()};
  clients.unshift(c);persist();selectedClient=c;closeSheet('clientSheet');showToast('Cliente creado');
  if(afterClientCreate){afterClientCreate=false;openQuoteFor(c)}
}

function startQuote(){renderClientOptions();openSheet('selectClientSheet')}
function renderClientOptions(){
  const q=(document.getElementById('clientSearch')?.value||'').toLowerCase();
  const arr=clients.filter(c=>(c.name+' '+(c.phone||'')+' '+(c.company||'')).toLowerCase().includes(q));
  clientOptions.innerHTML=arr.length?arr.map(c=>`<button class="client-option" onclick="chooseClient(${c.id})"><div class="initials">${initials(c.name)}</div><div style="min-width:0;flex:1"><div style="font-weight:900">${escapeHtml(c.name)}</div><div class="lead-meta">${escapeHtml(c.phone||c.company||'Sin datos adicionales')}</div></div><div style="font-size:20px;color:#93a0aa">›</div></button>`).join(''):'<div class="empty">No encontramos clientes.</div>';
}
function chooseClient(id){const c=clientById(id);if(!c)return;selectedClient=c;closeSheet('selectClientSheet');openQuoteFor(c)}
function openQuoteFor(c){
  selectedClient=c;qInitials.textContent=initials(c.name);qClientName.textContent=c.name;qClientMeta.textContent=c.phone||c.company||'Sin teléfono';
  packagePrice.value=settings.exclusive; courtType.options[0].value=settings.fut6; courtType.options[1].value=settings.fut9; courtRate.value=quoteMode==='court'?(courtType.selectedIndex===1?settings.fut9:settings.fut6):settings.fut6;
  guarantee.value=settings.guarantee; discount.value=settings.discount; extraHour.value=settings.extraHour;
  quotePackageDraft=cloneData(settings.exclusivePackage);renderQuotePackagePreview();
  
reservations.forEach(r=>{
  if(!r.reservationKind)r.reservationKind=r.space==='Local exclusivo'?'exclusive':'court';
  if(r.reservationKind==='court'&&!r.courtType)r.courtType=(r.space==='FUT 9'?'FUT 9':'FUT 6');
  if(r.reservationKind==='court'&&r.courtType==='FUT 6'&&!r.physicalCourt)r.physicalCourt=(String(r.space||'').startsWith('Cancha ')?r.space:'Cancha 1');
  if(r.status==='confirmed'||r.status==='hold'||r.status==='cancelled'){}else r.status='confirmed';
});
persist();

date.value=localDateValue(); calcHours(); recalcQuote(); openSheet('quoteSheet');
}
function normalizePackageItems(text){return String(text||'').split(/\n+/).map(x=>x.trim()).filter(Boolean)}
function packageGroup(pkg,key,title){return (pkg?.groups||[]).find(g=>g.key===key)||{key,title,items:[]}}
function packagePreviewHtml(pkg){
  if(!pkg)return '';
  return `<div class="pkg-name">${escapeHtml(pkg.name||'Alquiler exclusivo')}</div><div class="pkg-desc">${escapeHtml(pkg.description||'')}</div>`+(pkg.groups||[]).map(g=>`<div class="pkg-group"><b>${escapeHtml(g.title)}</b>${(g.items||[]).map(x=>`<div class="pkg-item">${escapeHtml(x)}</div>`).join('')}</div>`).join('')
}
function renderQuotePackagePreview(){const e=document.getElementById('qPackagePreview');if(e)e.innerHTML=packagePreviewHtml(quotePackageDraft)}
function openQuotePackageEditor(){
  quotePackageDraft=quotePackageDraft||cloneData(settings.exclusivePackage);const s=packageGroup(quotePackageDraft,'sports','Zona deportiva'),o=packageGroup(quotePackageDraft,'other','Otras zonas'),v=packageGroup(quotePackageDraft,'services','Servicios del establecimiento');
  qPkgName.value=quotePackageDraft.name||'';qPkgDescription.value=quotePackageDraft.description||'';qPkgSports.value=(s.items||[]).join('\n');qPkgOther.value=(o.items||[]).join('\n');qPkgServices.value=(v.items||[]).join('\n');openSheet('quotePackageSheet')
}
function saveQuotePackageDraft(){
  quotePackageDraft={name:qPkgName.value.trim()||'Alquiler exclusivo',description:qPkgDescription.value.trim(),groups:[{key:'sports',title:'Zona deportiva',items:normalizePackageItems(qPkgSports.value)},{key:'other',title:'Otras zonas',items:normalizePackageItems(qPkgOther.value)},{key:'services',title:'Servicios del establecimiento',items:normalizePackageItems(qPkgServices.value)}]};renderQuotePackagePreview();closeSheet('quotePackageSheet');showToast('Contenido actualizado para esta cotización')
}

function setMode(mode){
  quoteMode=mode;modeExclusive.classList.toggle('active',mode==='exclusive');modeCourt.classList.toggle('active',mode==='court');
  exclusiveBlock.classList.toggle('hidden',mode!=='exclusive');courtBlock.classList.toggle('hidden',mode!=='court');recalcQuote()
}
function calcHours(){
  const s=startTime.value,e=endTime.value;if(!s||!e)return;
  const [sh,sm]=s.split(':').map(Number),[eh,em]=e.split(':').map(Number);
  let mins=(eh*60+em)-(sh*60+sm);if(mins<0)mins+=1440;
  const h=mins/60;totalHours.value=Number.isInteger(h)?h:h.toFixed(1);recalcQuote()
}
function syncCourtRate(){courtRate.value=courtType.value;recalcQuote()}
function recalcQuote(){
  const hours=Number(totalHours.value||0);
  const rent=quoteMode==='exclusive'?Number(packagePrice.value||0):Number(courtRate.value||0)*hours;
  const g=Number(guarantee.value||0),d=Number(discount.value||0),regular=rent+g,single=Math.max(0,regular-d);
  sumRent.textContent=money(rent);sumGuarantee.textContent=money(g);sumDiscount.textContent='− '+money(d);if(document.getElementById('sumRegular'))sumRegular.textContent=money(regular);sumTotal.textContent=money(single)
}
function generateQuote(){
  if(!selectedClient){showToast('Selecciona un cliente');return}
  const id=Date.now(), code=nextQuoteCode(), hours=Number(totalHours.value||0);
  const rent=quoteMode==='exclusive'?Number(packagePrice.value||0):Number(courtRate.value||0)*hours;
  const g=Number(guarantee.value||0),d=Number(discount.value||0),regularTotal=rent+g,singlePaymentTotal=Math.max(0,regularTotal-d);
  quotes.unshift({id,code,clientId:selectedClient.id,eventType:eventType.value,people:Number(people.value||0),eventDate:date.value,startTime:startTime.value,endTime:endTime.value,hours,mode:quoteMode,rent,guarantee:g,discount:d,discountConditional:true,extraHour:Number(extraHour.value||0),regularTotal,singlePaymentTotal,total:regularTotal,packageSnapshot:quoteMode==='exclusive'?cloneData(quotePackageDraft):null,status:'pending',createdAt:nowISO()});
  persist();closeSheet('quoteSheet');go('quotes');showToast('Cotización '+code+' creada')
}

function setQuoteFilter(f,el){quoteFilter=f;document.querySelectorAll('[data-quote-filter]').forEach(x=>x.classList.remove('active'));el.classList.add('active');renderQuotes()}
function renderQuotes(){
  const s=(quoteSearch?.value||'').toLowerCase();
  let arr=quotes.filter(q=>quoteFilter==='all'||q.status===quoteFilter);
  arr=arr.filter(q=>{const c=clientById(q.clientId);return ((q.code||'')+' '+(c?.name||'')).toLowerCase().includes(s)});
  quoteList.innerHTML=arr.length?arr.map(q=>{
    const c=clientById(q.clientId)||{name:'Cliente'};
    const badge=q.status==='reserved'?'<div class="badge b-green">Reservado</div>':'<div class="badge b-yellow">Por confirmar</div>';
    return `<div class="card">
      <div class="lead"><div class="initials">EV</div><div class="lead-main"><div class="lead-name">${escapeHtml(q.code)} · ${escapeHtml(c.name)}</div><div class="lead-meta">${escapeHtml(q.eventType)} · ${fmtScheduled(q.eventDate,q.startTime)}</div><div class="created">Creado: ${fmtDateTime(q.createdAt)}</div></div><div class="lead-right"><div class="money">${money(q.regularTotal??q.total)}</div>${badge}</div></div>
      <div class="actions"><button class="btn primary-small" onclick="openQuoteDetail('${q.id}')">Ver detalle</button><button class="btn" onclick="openQuotePdf('${q.id}')">Ver PDF</button><button class="btn" onclick="quickFollowup('${q.id}')">Seguimiento</button>${q.status!=='reserved'?`<button class="btn green-small" onclick="reserveQuote('${q.id}')">Reservar</button>`:''}</div>
    </div>`;
  }).join(''):'<div class="empty">No hay cotizaciones en este filtro.</div>';
  renderHome();
}
function openQuoteDetail(id){
  const q=quoteById(id);if(!q)return;openQuoteId=q.id;const c=clientById(q.clientId)||{name:'Cliente'};
  qdTitle.textContent=q.code+' · '+c.name;
  const reserveAction=document.getElementById('quoteReserveAction');if(reserveAction)reserveAction.classList.toggle('hidden',q.status==='reserved');
  quoteDetailBody.innerHTML=`
    <div class="detail-row"><span>Estado</span><b>${q.status==='reserved'?'Reservado':'Por confirmar'}</b></div>
    <div class="detail-row"><span>Evento</span><b>${escapeHtml(q.eventType)}</b></div>
    <div class="detail-row"><span>Fecha y hora</span><b>${fmtScheduled(q.eventDate,q.startTime)} – ${escapeHtml(q.endTime||'')}</b></div>
    <div class="detail-row"><span>Modalidad</span><b>${q.mode==='exclusive'?'Local exclusivo':'Por cancha'}</b></div>
    <div class="detail-row"><span>Alquiler</span><b>${money(q.rent)}</b></div>
    ${Number(q.guarantee||0)?`<div class="detail-row"><span>Garantía reembolsable</span><b>${money(q.guarantee)}</b></div>`:''}
    ${Number(q.discount||0)?`<div class="detail-row"><span>Descuento pago único</span><b>− ${money(q.discount)}</b></div>`:''}
    <div class="detail-row"><span>Creado</span><b>${fmtDateTime(q.createdAt)}</b></div>`;
  openSheet('quoteDetailSheet')
}

let pdfQuoteId=null;
function quoteDateLabel(iso){
  const d=new Date(iso||Date.now());
  return d.toLocaleDateString('es-PE',{day:'2-digit',month:'2-digit',year:'numeric'});
}
function quoteIncludes(q){
  if(q.mode==='exclusive')return cloneData((q.packageSnapshot||settings.exclusivePackage).groups||[]);
  return [{key:'court',title:'Incluye',items:['Uso de la cancha seleccionada durante el horario cotizado.','Chalecos y pelota de fútbol según disponibilidad.','Uso de servicios generales del establecimiento.']}]
}
function buildQuotePdfHtml(q,c){
  ensureQuoteSettings();
  const logo=document.querySelector('.brand-logo')?.src||'';
  const pkg=q.mode==='exclusive'?(q.packageSnapshot||settings.exclusivePackage):{name:'Alquiler por cancha',description:'Uso de la cancha durante el horario cotizado',groups:quoteIncludes(q)};
  const groups=(pkg.groups||[]).map(g=>`<div class="q24-group"><div class="q24-group-title">${escapeHtml(g.title)}</div>${(g.items||[]).map(x=>`<div class="q24-item">${escapeHtml(x)}</div>`).join('')}</div>`).join('');
  const status=q.status==='reserved'?'<span class="q24-status reserved">RESERVADO</span>':'<span class="q24-status">POR CONFIRMAR</span>';
  const phone=c.phone||'Sin teléfono registrado',extraHour=Number(q.extraHour??settings.extraHour??180),discount=Number(q.discount||0),guarantee=Number(q.guarantee||0),pay=settings.paymentInfo||defaultPaymentInfo(),rules=pay.rulesUrl||'https://linktr.ee/elevasportperu';
  const officialRules='https://linktr.ee/elevasportperu';
  const qr='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAXIAAAFyAQAAAADAX2ykAAACWUlEQVR4nO2bQY7bMAxFPysDWco3mKPYNytyM+soOcAA9jKAjd+FxMSeQdMO4HGt4mthJNZbEGA+SZGKEV9Z6ceXcEC8ePHixYsX/zveympgZo3vTQ2Ayff6A+0RvzPfkSRHgOQ9+9J6LGY9AkmSW/677RG/Mz89FDpdyGu7GFJb9taaPqv94v+Otz7OsJ+3BujG8PnwdHb7xW9X8/FFat8bpDbMhjiDmI61R/y+vPs3Elj7cjEmAwiUx0H2iN+Xx7p4QmCOyuuH73UkOZzNfvGvV9bvSqGpheV3qQ0owj7OHvH78kW/HelajQ85x9mhWBDpt1Z+MuP1bc6f/DgcyMF3D7ZH/O689dOl9DKSWTn/5iSs/katfI7PHBCIjjPIMbCE5m2kVnyukff8OwYPyO5aDpHMn8jZfwdns1/8H5b7F3hmXQDlUfIvIP3WyRdd8hGaH57e9CeD6ueaeeunC5He7oaUi+gGvLaAH43uqp/r5L1/lc+6oSTcAUDOxN1T3dJvhfy6v5EL5pVXy0xY9XO9vOff3MsIZcg/YO34kpjl34r5OMP6eDeztnxFykP+xayPyr+V8tv5UZGuR+pnf0P956r5Z7q1HkBpQo+LrQcPB9ojfl/+eX/Sa6kZSNYgX6JMun9VOd95rUzeLuQwXbbltPJvpfymP+mjhTxu2M5/df79L3gOCMwFc3F3Ebb1/8Qe8d/F89oulsvpZJrvV8p/uj+5qpURaN3NQMR3585mv/jXq/gtZX0GGOIIdINfuUtv8+YK3tnsF/96mf7fLV68ePHixR/O/wJKtcFrY3WnsQAAAABJRU5ErkJggg==';
  const showQr=qr&&rules===officialRules;
  return `<div class="q24-page">
    <div class="q24-header">
      <div class="q24-brand">${logo?`<img src="${logo}" alt="Eleva Sport">`:''}<div class="q24-company">ASOCIACIÓN ELEVA SPORT</div><div class="q24-orgmeta">R.U.C. 20615099539 · Trujillo, La Libertad</div></div>
      <div class="q24-quote-meta"><div class="q24-eyebrow">Cotización</div><div class="q24-title">${q.mode==='exclusive'?'Evento deportivo':'Alquiler de cancha'}</div><div class="q24-code">${escapeHtml(q.code)}</div>${status}</div>
    </div>
    <div class="q24-content">
      <div class="q24-client-row"><div><div class="q24-label">Cliente</div><div class="q24-client-name">${escapeHtml(c.name)}</div><div class="q24-client-contact">${escapeHtml(phone)}</div></div><div class="q24-emission"><div class="q24-label">Fecha de emisión</div><div class="q24-emission-date">${quoteDateLabel(q.createdAt)}</div></div></div>
      <div class="q24-summary">
        <div><div class="q24-label">${q.mode==='exclusive'?'Evento':'Formato'}</div><div class="value">${escapeHtml(q.mode==='exclusive'?(q.eventType||'Evento'):(q.courtType||'Cancha'))}</div>${q.people?`<div class="sub">${Number(q.people)} asistentes</div>`:''}</div>
        <div><div class="q24-label">Fecha</div><div class="value">${escapeHtml(fmtScheduled(q.eventDate,''))}</div></div>
        <div><div class="q24-label">Horario</div><div class="value">${escapeHtml(q.startTime||'—')} - ${escapeHtml(q.endTime||'—')}</div></div>
        <div><div class="q24-label">Duración</div><div class="value">${escapeHtml(q.hours||'—')} h</div></div>
      </div>
      <div class="q24-section-title">Propuesta económica</div>
      <div class="q24-price-card">
        <div class="q24-price-head"><div><div class="concept">${escapeHtml(pkg.name||'Alquiler exclusivo')}</div><div class="desc">${escapeHtml(pkg.description||'')}</div></div><div class="amount">${money(q.rent)}</div></div>
        <div class="q24-includes"><div class="q24-includes-title">Local incluye</div>${groups}</div>
        <div class="q24-calc">
          ${guarantee?`<div class="q24-calc-row guarantee"><span>Garantía reembolsable</span><b>${money(guarantee)}</b></div>`:''}
          ${discount?`<div class="q24-calc-row discount"><span>Descuento por pago único anticipado<div class="q24-discount-note">Aplica únicamente si el importe completo se cancela en una sola operación anticipada. Si se paga 50% y el 50% restante después, no aplica el descuento.</div></span><b>-${money(discount)}</b></div>`:''}
        </div>
      </div>
      <div class="q24-payment"><div class="q24-payment-head"><div class="q24-payment-title">Datos para el pago</div><div class="q24-payment-help">Reserva sujeta a confirmación</div></div><div class="q24-payment-grid"><div><div class="q24-pay-label">Banco ${escapeHtml(pay.bank||'BCP')}</div><div class="q24-pay-main">Cuenta: ${escapeHtml(pay.account||'')}</div><div class="q24-pay-sub">CCI: ${escapeHtml(pay.cci||'')}</div></div><div><div class="q24-pay-label">Yape</div><div class="q24-pay-main">${escapeHtml(pay.yape||'')}</div><div class="q24-pay-name">Titular: ${escapeHtml(pay.holder||'')}</div></div></div><div class="q24-payment-confirm">Una vez realizado el pago, enviar el comprobante al WhatsApp ${escapeHtml(pay.whatsapp||pay.yape||'')} para confirmar la reserva.</div></div>
      <div class="q24-note-box"><div class="q24-note-title">A tener en cuenta</div><div class="q24-note">Precio no incluye IGV.</div><div class="q24-note">Hora adicional: ${money(extraHour)} por hora.</div><div class="q24-note">Ingreso de público hasta 30 minutos antes y cierre 30 minutos después.</div><div class="q24-note">La garantía se devuelve después del evento, previa revisión de las instalaciones.</div><div class="q24-note">No incluye instalación de estrado ni permisos.</div><div class="q24-note">Seguridad y primeros auxilios adicionales corresponden al organizador cuando aplique.</div></div>
      <div class="q24-rules ${showQr?'':'no-qr'}"><div><div class="q24-rules-title">Reglamento interno del establecimiento</div><div class="q24-rules-copy">La reserva implica la aceptación del reglamento. Consultar en:<br><a href="${escapeHtml(rules)}" target="_blank">${escapeHtml(rules)}</a></div></div>${showQr?`<img src="${qr}" alt="QR reglamento">`:''}</div>
    </div>
    <div class="q24-footer"><div><strong>Eleva Sport - Trujillo</strong><br>Contacto: ${escapeHtml(pay.whatsapp||'932 270 350')}</div><div class="q24-foot-right">Documento generado desde Ventas Eleva Sport<br>Creado: ${escapeHtml(fmtDateTime(q.createdAt))}</div></div>
  </div>`
}
const ELEVA_APP_TITLE='Eleva Sport · Ventas de eventos';
function quoteExportName(q){
  return `Eleva Sport - ${q?.code||'Cotización'}`;
}
function openQuotePdf(id){
  const q=quoteById(id);if(!q){showToast('No encontramos la cotización');return}
  const c=clientById(q.clientId)||{name:'Cliente',phone:''};
  pdfQuoteId=q.id;
  pdfToolbarTitle.textContent=q.code+' · '+c.name;
  pdfPaper.innerHTML=buildQuotePdfHtml(q,c);
  document.title=quoteExportName(q);
  pdfPreviewOverlay.classList.add('show');
  document.body.style.overflow='hidden';
}
function closeQuotePdf(){
  pdfPreviewOverlay.classList.remove('show');
  document.body.style.overflow='';
  document.title=ELEVA_APP_TITLE;
}
function printQuotePdf(){
  if(!pdfQuoteId)return;
  const q=quoteById(pdfQuoteId);
  if(q)document.title=quoteExportName(q);
  window.print();
}
function shareQuoteWhatsApp(){
  const q=quoteById(pdfQuoteId);if(!q)return;
  const c=clientById(q.clientId)||{name:'Cliente'};
  const msg=`Hola ${c.name}, te compartimos la cotización ${q.code} de Eleva Sport. Evento: ${q.eventType}. Fecha: ${fmtScheduled(q.eventDate,q.startTime)}. Puedes revisar el alquiler, garantía y descuento por pago único en el documento.`;
  window.open('https://wa.me/?text='+encodeURIComponent(msg),'_blank');
}

function quoteTotalsForConversion(q){
  const computed=Number(q.rent||0)+Number(q.guarantee||0);
  const regular=Number(q.regularTotal!==undefined?q.regularTotal:(computed>0?computed:Number(q.total||0)));
  const single=Number(q.singlePaymentTotal!==undefined?q.singlePaymentTotal:Math.max(0,regular-Number(q.discount||0)));
  return {regular,single,discount:Math.max(0,regular-single)}
}
function reserveQuote(id){
  const q=quoteById(id);if(!q)return;if(q.status==='reserved'){showToast('Esta cotización ya está vinculada a una reserva');return}
  const c=clientById(q.clientId)||{name:'Cliente'},t=quoteTotalsForConversion(q);
  quoteConversionContext={quoteId:q.id,mode:null};
  const sum=document.getElementById('quoteConfirmSummary');if(sum)sum.innerHTML=`<b>${escapeHtml(q.code)} · ${escapeHtml(c.name)}</b><br>${escapeHtml(q.eventType)} · ${fmtScheduled(q.eventDate,q.startTime)}<br>Alquiler ${money(q.rent)}${Number(q.guarantee||0)?` · Garantía ${money(q.guarantee)}`:''}${t.discount?` · Descuento posible ${money(t.discount)}`:''}`;
  const a=document.getElementById('quoteConfirmSingleAmount'),b=document.getElementById('quoteConfirmRegularAmount');if(a)a.textContent=money(t.single);if(b)b.textContent=money(t.regular);
  openSheet('quoteConfirmSheet')
}
function reserveOpenQuote(){if(openQuoteId){closeSheet('quoteDetailSheet');reserveQuote(openQuoteId)}}
function chooseQuoteConfirmation(mode){
  const ctx=quoteConversionContext,q=ctx?quoteById(ctx.quoteId):null;if(!q)return;
  quoteConversionContext={quoteId:q.id,mode};
  closeSheet('quoteConfirmSheet');
  editingReservationId=null;if(document.getElementById('reservationSaveBtn'))reservationSaveBtn.textContent='Crear reserva';
  preselectReservationQuoteId=q.id;reservationKind=q.mode==='exclusive'?'exclusive':'court';
  prepareReservationForm(reservationKind);openSheet('reservationSheet')
}
function quickFollowup(id){preselectQuoteId=id;openNewFollowup()}
function createFollowupFromOpenQuote(){preselectQuoteId=openQuoteId;closeSheet('quoteDetailSheet');openNewFollowup()}

function openNewFollowup(){
  populateFollowForm();
  fDate.value=localDateValue();fTime.value=localTimeValue();
  fNote.value='';
  if(preselectQuoteId){
    const q=quoteById(preselectQuoteId);
    if(q){fClient.value=String(q.clientId);populateQuoteOptions(q.clientId);fQuote.value=String(q.id)}
  }
  openSheet('followSheet')
}
function populateFollowForm(){
  fClient.innerHTML=clients.map(c=>`<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
  fClient.onchange=()=>populateQuoteOptions(fClient.value);
  populateQuoteOptions(fClient.value)
}
function populateQuoteOptions(clientId){
  const arr=quotes.filter(q=>String(q.clientId)===String(clientId));
  fQuote.innerHTML='<option value="">Sin cotización</option>'+arr.map(q=>`<option value="${q.id}">${q.code} · ${q.eventType}</option>`).join('')
}
function saveFollowup(){
  const clientId=fClient.value,note=fNote.value.trim();
  if(!clientId){showToast('Selecciona un cliente');return}
  if(!note){showToast('Indica qué seguimiento realizar');fNote.focus();return}
  followups.unshift({id:Date.now(),clientId:Number(clientId),quoteId:fQuote.value?Number(fQuote.value):null,note,scheduledDate:fDate.value,scheduledTime:fTime.value,status:'pending',createdAt:nowISO()});
  preselectQuoteId=null;persist();closeSheet('followSheet');go('follow');showToast('Seguimiento creado')
}
function setFollowFilter(f,el){followFilter=f;document.querySelectorAll('[data-follow-filter]').forEach(x=>x.classList.remove('active'));el.classList.add('active');renderFollowups()}
function renderFollowups(){
  const s=(followSearch?.value||'').toLowerCase();
  let arr=followups.filter(f=>followFilter==='all'||f.status===followFilter);
  arr=arr.filter(f=>{const c=clientById(f.clientId);return ((c?.name||'')+' '+f.note).toLowerCase().includes(s)});
  followList.innerHTML=arr.length?arr.map(f=>{
    const c=clientById(f.clientId)||{name:'Cliente'},q=f.quoteId?quoteById(f.quoteId):null;
    return `<div class="card">
      <div class="lead"><div class="initials">${initials(c.name)}</div><div class="lead-main"><div class="lead-name">${escapeHtml(c.name)}</div><div class="lead-meta">${escapeHtml(f.note)}${q?' · '+escapeHtml(q.code):''}</div><div class="created">Programado: ${fmtScheduled(f.scheduledDate,f.scheduledTime)}<br>Creado: ${fmtDateTime(f.createdAt)}</div></div><div class="lead-right"><div class="badge ${f.status==='done'?'b-green':'b-blue'}">${f.status==='done'?'Realizado':'Pendiente'}</div></div></div>
      <div class="actions"><button class="btn primary-small" onclick="openFollowDetail('${f.id}')">Ver</button>${f.status!=='done'?`<button class="btn green-small" onclick="completeFollowup('${f.id}')">Marcar realizado</button>`:''}${q?`<button class="btn" onclick="openQuoteDetail('${q.id}')">Ver cotización</button>`:''}</div>
    </div>`;
  }).join(''):'<div class="empty">No hay seguimientos en este filtro.</div>';
  renderHome()
}
function openFollowDetail(id){
  const f=followups.find(x=>String(x.id)===String(id));if(!f)return;openFollowId=f.id;
  const c=clientById(f.clientId)||{name:'Cliente'},q=f.quoteId?quoteById(f.quoteId):null;
  followDetailBody.innerHTML=`
    <div class="detail-row"><span>Cliente</span><b>${escapeHtml(c.name)}</b></div>
    <div class="detail-row"><span>Acción</span><b>${escapeHtml(f.note)}</b></div>
    <div class="detail-row"><span>Programado</span><b>${fmtScheduled(f.scheduledDate,f.scheduledTime)}</b></div>
    <div class="detail-row"><span>Cotización</span><b>${q?escapeHtml(q.code):'—'}</b></div>
    <div class="detail-row"><span>Estado</span><b>${f.status==='done'?'Realizado':'Pendiente'}</b></div>
    <div class="detail-row"><span>Creado</span><b>${fmtDateTime(f.createdAt)}</b></div>`;
  openSheet('followDetailSheet')
}
function completeFollowup(id){
  const f=followups.find(x=>String(x.id)===String(id));if(!f)return;f.status='done';f.completedAt=nowISO();persist();renderFollowups();showToast('Seguimiento realizado')
}
function completeOpenFollowup(){if(openFollowId){completeFollowup(openFollowId);closeSheet('followDetailSheet')}}
function reprogramOpenFollowup(){
  const f=followups.find(x=>String(x.id)===String(openFollowId));if(!f)return;
  closeSheet('followDetailSheet');preselectQuoteId=f.quoteId||null;populateFollowForm();fClient.value=String(f.clientId);populateQuoteOptions(f.clientId);if(f.quoteId)fQuote.value=String(f.quoteId);fNote.value=f.note;fDate.value=f.scheduledDate;fTime.value=f.scheduledTime;openSheet('followSheet')
}


function reservationClientSearchMeta(c){
  const count=reservations.filter(r=>String(r.clientId)===String(c.id)).length;
  return [c.phone,c.company,count?`${count} reserva${count===1?'':'s'}`:'Sin reservas'].filter(Boolean).join(' · ')
}
function renderReservationClientSearchResults(query=''){
  const host=document.getElementById('rClientSearchResults');if(!host)return;
  const q=String(query||'').trim().toLowerCase();
  const arr=clients.filter(c=>!q||`${c.name||''} ${c.phone||''} ${c.company||''}`.toLowerCase().includes(q)).slice(0,30);
  host.innerHTML=arr.length?arr.map(c=>`<button type="button" class="res-client-option" onmousedown="event.preventDefault()" onclick="selectReservationClient('${c.id}')"><div class="initials">${initials(c.name)}</div><div><b>${escapeHtml(c.name)}</b><span>${escapeHtml(reservationClientSearchMeta(c))}</span></div></button>`).join(''):'<div class="empty" style="padding:16px 10px">No se encontraron clientes.</div>';
  host.classList.remove('hidden')
}
function hideReservationClientSearchResults(){document.getElementById('rClientSearchResults')?.classList.add('hidden')}
function syncReservationClientSearch(){const c=clientById(rClient?.value);const input=document.getElementById('rClientSearch');if(input)input.value=c?.name||''}
function selectReservationClient(id){
  const c=clientById(id);if(!c)return;rClient.value=String(c.id);syncReservationClientSearch();hideReservationClientSearchResults();onReservationClientChange()
}
function setCourtBookingMode(mode){
  if(reservationKind!=='court')return;
  if(editingReservationId&&mode==='recurring'){showToast('La edición actual modifica solo esta reserva');return}
  if(rQuote?.value&&mode==='recurring'){showToast('Las series recurrentes se crean como reserva directa');return}
  courtBookingMode=mode==='recurring'?'recurring':'single';
  document.querySelectorAll('[data-booking-mode]').forEach(b=>b.classList.toggle('active',b.dataset.bookingMode===courtBookingMode));
  document.getElementById('rRecurringBlock')?.classList.toggle('hidden',courtBookingMode!=='recurring');
  document.getElementById('rSingleCourtConfig')?.classList.toggle('hidden',courtBookingMode==='recurring');
  document.getElementById('rDateScheduleCard')?.classList.toggle('hidden',courtBookingMode==='recurring');
  document.getElementById('rPaymentCard')?.classList.toggle('hidden',courtBookingMode==='recurring');
  if(document.getElementById('reservationSaveBtn'))reservationSaveBtn.textContent=courtBookingMode==='recurring'?'Crear serie recurrente':(editingReservationId?'Guardar cambios':'Crear reserva');
  if(courtBookingMode==='recurring'){
    rQuote.value='';
    const start=document.getElementById('rRecurringStartDate'),end=document.getElementById('rRecurringEndDate');
    if(start&&!start.value)start.value=rDate.value||localDateValue();
    if(end&&!end.value){const d=new Date((start?.value||localDateValue())+'T12:00:00');d.setMonth(d.getMonth()+1);end.value=localDateValue(d)}
    if(!recurringDraftBlocks.length)resetRecurringScheduleBlocks();
    updateRecurringBillingUI();renderRecurringScheduleBlocks();updateRecurringSeriesPreview();
  }else{
    document.getElementById('rDateScheduleCard')?.classList.remove('hidden');
    checkReservationConflictUI();
  }
}
function updateRecurringBillingUI(){const monthly=document.getElementById('rRecurringBilling')?.value==='monthly';document.getElementById('rRecurringMonthlyAmountField')?.classList.toggle('hidden',!monthly)}
function recurringDefaultStartTime(){return rStart?.value||'19:00'}
function makeRecurringScheduleBlock(seed={}){
  const type=seed.courtType||'FUT 6',info=clientCourtRate(rClient?.value,type),qty=type==='FUT 9'?1:Number(seed.courtQty||1);
  let courts=type==='FUT 9'?['Cancha 1','Cancha 2','Cancha 3']:(Array.isArray(seed.physicalCourts)&&seed.physicalCourts.length?[...seed.physicalCourts]:['Cancha 1']);
  if(type==='FUT 6'){
    courts=courts.filter(x=>['Cancha 1','Cancha 2','Cancha 3'].includes(x)).slice(0,qty);
    ['Cancha 1','Cancha 2','Cancha 3'].forEach(x=>{if(courts.length<qty&&!courts.includes(x))courts.push(x)});
  }
  return {id:seed.id||(++recurringDraftSeq),weekdays:Array.isArray(seed.weekdays)?[...seed.weekdays]:[],courtType:type,courtQty:qty,physicalCourts:courts,startTime:seed.startTime||recurringDefaultStartTime(),durationMinutes:Number(seed.durationMinutes||60),courtRate:seed.courtRate!==undefined?Number(seed.courtRate):Number(info.rate||0),rateSource:seed.rateSource||(info.special?'client_special':'general'),rateManual:!!seed.rateManual}
}
function resetRecurringScheduleBlocks(){const ds=document.getElementById('rRecurringStartDate')?.value||rDate?.value||localDateValue();const d=new Date(ds+'T12:00:00');recurringDraftBlocks=[makeRecurringScheduleBlock({weekdays:[d.getDay()]})]}
function recurringBlockById(id){return recurringDraftBlocks.find(x=>String(x.id)===String(id))}
function recurringBlockEndTime(b){return addMinutesToTime(b.startTime,Number(b.durationMinutes||60))}
function recurringBlockHours(b){return Number(b.durationMinutes||0)/60}
function recurringBlockQty(b){return b.courtType==='FUT 9'?1:Number(b.courtQty||1)}
function recurringBlockResources(b){return b.courtType==='FUT 9'?['Cancha 1','Cancha 2','Cancha 3']:[...(b.physicalCourts||[])]}
function recurringBlockTotal(b){return Number(b.courtRate||0)*recurringBlockHours(b)*recurringBlockQty(b)}
function recurringStartOptions(selected){let out='';for(let mins=6*60;mins<=22*60;mins+=30){const t=`${String(Math.floor(mins/60)).padStart(2,'0')}:${String(mins%60).padStart(2,'0')}`;out+=`<option value="${t}" ${t===selected?'selected':''}>${t}</option>`}return out}
function recurringDurationOptions(selected){return [[60,'1 hora'],[90,'1 hora 30 min'],[120,'2 horas'],[150,'2 horas 30 min'],[180,'3 horas']].map(([v,l])=>`<option value="${v}" ${Number(selected)===v?'selected':''}>${l}</option>`).join('')}
function recurringDaysLabel(days){const m={0:'Dom',1:'Lun',2:'Mar',3:'Mié',4:'Jue',5:'Vie',6:'Sáb'};return (days||[]).slice().sort((a,b)=>a-b).map(x=>m[x]).join(' · ')||'Sin días'}
function renderRecurringScheduleBlocks(){
  const host=document.getElementById('rRecurringSchedules');if(!host)return;
  if(!recurringDraftBlocks.length)resetRecurringScheduleBlocks();
  host.innerHTML=recurringDraftBlocks.map((b,i)=>{
    const isFut9=b.courtType==='FUT 9',qty=recurringBlockQty(b),courts=recurringBlockResources(b),hours=recurringBlockHours(b),total=recurringBlockTotal(b),source=b.rateManual?'Tarifa manual':(b.rateSource==='client_special'?'Tarifa especial del cliente':'Tarifa general');
    const dayNames=[[1,'Lun'],[2,'Mar'],[3,'Mié'],[4,'Jue'],[5,'Vie'],[6,'Sáb'],[0,'Dom']];
    return `<div class="recurring-schedule-card">
      <div class="recurring-schedule-head"><div><b>Horario ${i+1}</b><span>${escapeHtml(recurringDaysLabel(b.weekdays))} · ${escapeHtml(b.startTime)}–${escapeHtml(recurringBlockEndTime(b))}</span></div>${recurringDraftBlocks.length>1?`<button type="button" class="recurring-remove" onclick="removeRecurringScheduleBlock(${b.id})">Eliminar</button>`:''}</div>
      <div class="field"><label>Días fijos</label><div class="weekday-grid">${dayNames.map(([v,l])=>`<label class="weekday-check"><input type="checkbox" ${b.weekdays.includes(v)?'checked':''} onchange="toggleRecurringScheduleDay(${b.id},${v},this.checked)"><span>${l}</span></label>`).join('')}</div></div>
      <div class="grid2">
        <div class="field"><label>Formato</label><select onchange="updateRecurringScheduleField(${b.id},'courtType',this.value)"><option ${b.courtType==='FUT 6'?'selected':''}>FUT 6</option><option ${b.courtType==='FUT 9'?'selected':''}>FUT 9</option></select></div>
        <div class="field"><label>${isFut9?'Tarifa FUT 9 / hora':'Tarifa por cancha / hora'}</label><input type="number" min="0" value="${Number(b.courtRate||0)}" oninput="updateRecurringScheduleField(${b.id},'courtRate',this.value,true)"></div>
      </div>
      <div class="rate-source ${b.rateSource==='client_special'&&!b.rateManual?'special':''}"><span class="dotrate"></span><span>${source}</span></div>
      ${!isFut9?`<div class="recurring-courts"><div class="field"><label>Cantidad de canchas</label><select onchange="updateRecurringScheduleField(${b.id},'courtQty',this.value)"><option value="1" ${qty===1?'selected':''}>1 cancha</option><option value="2" ${qty===2?'selected':''}>2 canchas</option><option value="3" ${qty===3?'selected':''}>3 canchas</option></select></div><div class="field"><label>Canchas físicas</label><div class="court-select-grid">${['Cancha 1','Cancha 2','Cancha 3'].map(c=>`<label class="court-check"><input type="checkbox" ${courts.includes(c)?'checked':''} onchange="toggleRecurringScheduleCourt(${b.id},'${c}',this.checked)"><span>${c}</span></label>`).join('')}</div></div></div>`:`<div class="resource-help"><b>FUT 9:</b> bloquea automáticamente Cancha 1 + Cancha 2 + Cancha 3.</div>`}
      <div class="grid2"><div class="field"><label>Hora inicio</label><select onchange="updateRecurringScheduleField(${b.id},'startTime',this.value)">${recurringStartOptions(b.startTime)}</select></div><div class="field"><label>Duración</label><select onchange="updateRecurringScheduleField(${b.id},'durationMinutes',this.value)">${recurringDurationOptions(b.durationMinutes)}</select></div></div>
      <div class="recurring-block-calc"><b>${escapeHtml(recurringDaysLabel(b.weekdays))}</b> · ${escapeHtml(b.startTime)}–${escapeHtml(recurringBlockEndTime(b))}<br>${isFut9?'FUT 9':`${qty} cancha${qty===1?'':'s'} · ${escapeHtml(courts.join(' + '))}`} · ${Number.isInteger(hours)?hours:hours.toFixed(1)} h · <b>${money(total)} por fecha</b></div>
    </div>`
  }).join('')
}
function addRecurringScheduleBlock(){
  const previous=recurringDraftBlocks[recurringDraftBlocks.length-1];
  recurringDraftBlocks.push(makeRecurringScheduleBlock({startTime:previous?.startTime||recurringDefaultStartTime(),durationMinutes:previous?.durationMinutes||60}));
  renderRecurringScheduleBlocks();updateRecurringSeriesPreview()
}
function removeRecurringScheduleBlock(id){if(recurringDraftBlocks.length<=1)return;recurringDraftBlocks=recurringDraftBlocks.filter(x=>String(x.id)!==String(id));renderRecurringScheduleBlocks();updateRecurringSeriesPreview()}
function toggleRecurringScheduleDay(id,day,checked){const b=recurringBlockById(id);if(!b)return;if(checked&&!b.weekdays.includes(day))b.weekdays.push(day);if(!checked)b.weekdays=b.weekdays.filter(x=>x!==day);renderRecurringScheduleBlocks();updateRecurringSeriesPreview()}
function syncRecurringBlockCourts(b){
  if(b.courtType==='FUT 9'){b.courtQty=1;b.physicalCourts=['Cancha 1','Cancha 2','Cancha 3'];return}
  b.courtQty=Math.min(3,Math.max(1,Number(b.courtQty||1)));let courts=(b.physicalCourts||[]).filter(x=>['Cancha 1','Cancha 2','Cancha 3'].includes(x)).slice(0,b.courtQty);
  ['Cancha 1','Cancha 2','Cancha 3'].forEach(x=>{if(courts.length<b.courtQty&&!courts.includes(x))courts.push(x)});b.physicalCourts=courts
}
function updateRecurringScheduleField(id,field,value,manual=false){
  const b=recurringBlockById(id);if(!b)return;
  if(field==='courtType'){
    b.courtType=value==='FUT 9'?'FUT 9':'FUT 6';b.courtQty=b.courtType==='FUT 9'?1:Math.min(3,Math.max(1,Number(b.courtQty||1)));syncRecurringBlockCourts(b);
    const info=clientCourtRate(rClient.value,b.courtType);b.courtRate=Number(info.rate||0);b.rateSource=info.special?'client_special':'general';b.rateManual=false;
  }else if(field==='courtQty'){b.courtQty=Number(value||1);syncRecurringBlockCourts(b)}
  else if(field==='durationMinutes')b.durationMinutes=Number(value||60);
  else if(field==='courtRate'){b.courtRate=Math.max(0,Number(value||0));if(manual){b.rateManual=true;b.rateSource='manual'}}
  else b[field]=value;
  renderRecurringScheduleBlocks();updateRecurringSeriesPreview()
}
function toggleRecurringScheduleCourt(id,court,checked){
  const b=recurringBlockById(id);if(!b||b.courtType!=='FUT 6')return;let courts=[...(b.physicalCourts||[])];
  if(checked&&!courts.includes(court)){if(courts.length>=Number(b.courtQty||1)){showToast(`Selecciona solo ${b.courtQty} cancha${Number(b.courtQty)>1?'s':''}`);renderRecurringScheduleBlocks();return}courts.push(court)}
  if(!checked)courts=courts.filter(x=>x!==court);b.physicalCourts=courts;renderRecurringScheduleBlocks();updateRecurringSeriesPreview()
}
function refreshRecurringBlockRatesFromClient(){
  recurringDraftBlocks.forEach(b=>{if(b.rateManual)return;const info=clientCourtRate(rClient.value,b.courtType);b.courtRate=Number(info.rate||0);b.rateSource=info.special?'client_special':'general'});renderRecurringScheduleBlocks();updateRecurringSeriesPreview()
}
function recurringDatesForDays(days){
  const a=document.getElementById('rRecurringStartDate')?.value,b=document.getElementById('rRecurringEndDate')?.value;if(!a||!b||!days?.length||a>b)return [];
  const freq=document.getElementById('rRecurringFrequency')?.value||'weekly',start=new Date(a+'T12:00:00'),end=new Date(b+'T12:00:00'),out=[];
  for(let d=new Date(start);d<=end;d.setDate(d.getDate()+1)){
    if(!days.includes(d.getDay()))continue;
    if(freq==='biweekly'){const diff=Math.floor((d-start)/86400000);if(Math.floor(diff/7)%2!==0)continue}
    out.push(localDateValue(d))
  }
  return out
}
function recurringSeriesInstances(){
  const out=[];recurringDraftBlocks.forEach((b,index)=>{recurringDatesForDays(b.weekdays).forEach(date=>out.push({date,block:b,blockIndex:index}))});
  return out.sort((a,b)=>(a.date+a.block.startTime).localeCompare(b.date+b.block.startTime))
}
function recurringCandidate(instance){const b=instance.block,courts=recurringBlockResources(b);return {reservationKind:'court',eventDate:instance.date,startTime:b.startTime,endTime:recurringBlockEndTime(b),courtType:b.courtType,physicalCourts:courts,space:b.courtType==='FUT 9'?'FUT 9':(courts.length===1?courts[0]:`${courts.length} canchas FUT 6`)}}
function recurringSeriesConflicts(instances){
  const conflicts=[];
  instances.forEach((inst,i)=>{
    const candidate=recurringCandidate(inst),existing=findReservationConflict(candidate,null);if(existing){conflicts.push({type:'existing',instance:inst,conflict:existing});return}
    for(let j=0;j<i;j++){
      const other=instances[j];if(other.date!==inst.date)continue;const a=recurringCandidate(other),b=candidate;if(!intervalsOverlap(a.startTime,a.endTime,b.startTime,b.endTime))continue;
      if(reservationResources(a).some(x=>reservationResources(b).includes(x))){conflicts.push({type:'internal',instance:inst,other});break}
    }
  });return conflicts
}
function validateRecurringBlocks(show=true){
  if(!recurringDraftBlocks.length){if(show)showToast('Agrega al menos un horario');return false}
  for(let i=0;i<recurringDraftBlocks.length;i++){
    const b=recurringDraftBlocks[i],n=i+1;if(!b.weekdays.length){if(show)showToast(`Selecciona días en Horario ${n}`);return false}
    if(!b.startTime||!b.durationMinutes){if(show)showToast(`Revisa la hora de Horario ${n}`);return false}
    if(b.courtType==='FUT 6'&&recurringBlockResources(b).length!==Number(b.courtQty||1)){if(show)showToast(`Selecciona ${b.courtQty} cancha${Number(b.courtQty)>1?'s':''} en Horario ${n}`);return false}
    if(Number(b.courtRate||0)<0){if(show)showToast(`Revisa la tarifa de Horario ${n}`);return false}
  }return true
}
function updateRecurringSeriesPreview(){
  if(courtBookingMode!=='recurring')return;const host=document.getElementById('rRecurringPreview');if(!host)return;
  const a=document.getElementById('rRecurringStartDate')?.value,b=document.getElementById('rRecurringEndDate')?.value;if(!a||!b||a>b){host.className='recurring-preview error';host.innerHTML='Selecciona un rango Desde/Hasta válido.';return}
  if(!validateRecurringBlocks(false)){host.className='recurring-preview';host.innerHTML='Completa días, canchas y horario de cada bloque.';return}
  const instances=recurringSeriesInstances();if(!instances.length){host.className='recurring-preview';host.innerHTML='No hay fechas para generar con esta configuración.';return}
  const conflicts=recurringSeriesConflicts(instances),billing=document.getElementById('rRecurringBilling')?.value||'per_reservation';
  let financial='';if(billing==='monthly'){const amt=Number(document.getElementById('rRecurringMonthlyAmount')?.value||0);financial=amt?` · ${money(amt)} / mes`:' · falta monto mensual'}else financial=` · ${money(instances.reduce((sum,x)=>sum+recurringBlockTotal(x.block),0))} estimado`;
  host.className='recurring-preview'+(conflicts.length?' error':'');host.innerHTML=`<b>${recurringDraftBlocks.length} horario${recurringDraftBlocks.length===1?'':'s'} · ${instances.length} reserva${instances.length===1?'':'s'}</b>${financial}<br>${conflicts.length?`${conflicts.length} cruce${conflicts.length===1?'':'s'} detectado${conflicts.length===1?'':'s'}. Corrige los bloques antes de crear la serie.`:'Todas las fechas y recursos están disponibles.'}`
}
function recurringMonthlyInstanceTotals(instances,amount){
  const groups={};instances.forEach((x,i)=>{const k=x.date.slice(0,7);(groups[k]||(groups[k]=[])).push(i)});const totals=new Array(instances.length).fill(0),cents=Math.round(Number(amount||0)*100);
  Object.values(groups).forEach(indexes=>{const base=Math.floor(cents/indexes.length),rest=cents-base*indexes.length;indexes.forEach((idx,j)=>totals[idx]=(base+(j<rest?1:0))/100)});return totals
}
function createRecurringSeries(){
  const cid=rClient.value;if(!cid){showToast('Selecciona un cliente');return false}
  const a=document.getElementById('rRecurringStartDate')?.value,b=document.getElementById('rRecurringEndDate')?.value;if(!a||!b||a>b){showToast('Revisa el rango Desde/Hasta');return false}
  if(!validateRecurringBlocks(true))return false;
  const instances=recurringSeriesInstances();if(!instances.length){showToast('No hay fechas para generar');return false}if(instances.length>1000){showToast('La serie genera demasiadas reservas');return false}
  const conflicts=recurringSeriesConflicts(instances);if(conflicts.length){updateRecurringSeriesPreview();showToast(`${conflicts.length} cruce${conflicts.length===1?'':'s'} por resolver`);return false}
  const billing=document.getElementById('rRecurringBilling')?.value||'per_reservation',monthlyAmount=Number(document.getElementById('rRecurringMonthlyAmount')?.value||0);if(billing==='monthly'&&!monthlyAmount){showToast('Ingresa el monto mensual');return false}
  const seriesId=Date.now(),seriesCode=nextRecurringSeriesCode(),status=rStatus.value||'confirmed',monthlyTotals=billing==='monthly'?recurringMonthlyInstanceTotals(instances,monthlyAmount):[];
  const blocks=recurringDraftBlocks.map((x,i)=>({...x,blockIndex:i+1,physicalCourts:[...recurringBlockResources(x)],endTime:recurringBlockEndTime(x),hours:recurringBlockHours(x)}));
  const first=blocks[0];
  const series={id:seriesId,code:seriesCode,clientId:Number(cid),startDate:a,endDate:b,frequency:rRecurringFrequency.value,billing,monthlyAmount:billing==='monthly'?monthlyAmount:null,status,notes:rNotes.value.trim(),blocks,createdAt:nowISO(),courtType:first?.courtType,courtQty:first?.courtQty,physicalCourts:first?.physicalCourts,courtRate:first?.courtRate,startTime:first?.startTime,endTime:first?.endTime,weekdays:first?.weekdays};
  recurringSeries.unshift(series);
  const startCodeNum=Math.max(0,...reservations.map(r=>Number(String(r.code||'').replace(/\D/g,''))||0))+1,created=[];
  instances.forEach((inst,i)=>{const block=inst.block,qty=recurringBlockQty(block),courts=recurringBlockResources(block),hours=recurringBlockHours(block),total=billing==='monthly'?monthlyTotals[i]:recurringBlockTotal(block),space=block.courtType==='FUT 9'?'FUT 9':(qty===1?courts[0]:`${qty} canchas FUT 6`);created.push({id:seriesId+i+1,code:'RS-'+String(startCodeNum+i).padStart(4,'0'),clientId:Number(cid),quoteId:null,reservationKind:'court',eventType:'Alquiler de cancha',people:null,eventDate:inst.date,startTime:block.startTime,endTime:recurringBlockEndTime(block),space,courtType:block.courtType,courtQty:qty,physicalCourt:courts.length===1?courts[0]:null,physicalCourts:[...courts],courtRate:Number(block.courtRate||0),rateSource:block.rateManual?'manual':block.rateSource,hours,total,advance:0,balance:total,notes:rNotes.value.trim(),status,seriesId,seriesCode,seriesBlockId:block.id,seriesBlockIndex:inst.blockIndex+1,recurringBilling:billing,monthlyAmount:billing==='monthly'?monthlyAmount:null,createdAt:nowISO()})});
  reservations.unshift(...created);persist();closeSheet('reservationSheet');renderReservations();renderCalendar();renderHome();renderReservationWorkspace();go('reservations');showToast(`${seriesCode} creada · ${blocks.length} horarios · ${created.length} reservas`);return true
}

function openNewReservation(){
  if(!clients.length){showToast('Primero crea un cliente');openNewClient(false);return}
  quoteConversionContext=null;
  editingReservationId=null;
  if(document.getElementById('reservationSaveBtn'))reservationSaveBtn.textContent='Crear reserva';
  reservationKind=null;
  openSheet('reservationTypeSheet')
}
function chooseReservationType(kind){
  reservationKind=kind;
  closeSheet('reservationTypeSheet');
  prepareReservationForm(kind);
  openSheet('reservationSheet')
}
function prepareReservationForm(kind){
  if(!clients.length){showToast('Primero crea un cliente');return}
  rClient.innerHTML=clients.map(c=>`<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
  rClient.value=String(clients[0].id);syncReservationClientSearch();
  courtBookingMode='single';document.querySelectorAll('[data-booking-mode]').forEach(b=>b.classList.toggle('active',b.dataset.bookingMode==='single'));document.getElementById('rRecurringBlock')?.classList.add('hidden');document.getElementById('rSingleCourtConfig')?.classList.remove('hidden');document.getElementById('rDateScheduleCard')?.classList.remove('hidden');document.getElementById('rPaymentCard')?.classList.remove('hidden');recurringDraftBlocks=[];
  rDate.value=calendarQuickSlot?.date||localDateValue();
  if(document.getElementById('rRecurringStartDate'))rRecurringStartDate.value=rDate.value;if(document.getElementById('rRecurringEndDate')){const rd=new Date(rDate.value+'T12:00:00');rd.setMonth(rd.getMonth()+1);rRecurringEndDate.value=localDateValue(rd)}
  if(document.getElementById('rRecurringFrequency'))rRecurringFrequency.value='weekly';if(document.getElementById('rRecurringBilling'))rRecurringBilling.value='per_reservation';if(document.getElementById('rRecurringMonthlyAmount'))rRecurringMonthlyAmount.value='';updateRecurringBillingUI();
  buildHalfHourOptions();
  const initialStart=calendarQuickSlot?.time||'11:00';
  if(document.getElementById('rStartSelect'))rStartSelect.value=initialStart;
  if(document.getElementById('rDurationSelect'))rDurationSelect.value='60';
  if(document.getElementById('rStartExclusive'))rStartExclusive.value=initialStart;
  if(document.getElementById('rEndExclusive'))rEndExclusive.value=addMinutesToTime(initialStart,120);
  rStart.value=initialStart;rEnd.value=addMinutesToTime(initialStart,60);
  rAdvance.value=0;rNotes.value='';rStatus.value='confirmed';const planInfo=document.getElementById('rQuotePaymentPlanInfo');if(planInfo){planInfo.classList.add('hidden');planInfo.innerHTML=''};
  rEventType.value='Campeonato';rPeople.value=20;
  rCourtType.value='FUT 6';reservationRateManual=false;
  rCourtQty.value='1';
  [rCourtSel1,rCourtSel2,rCourtSel3].forEach(x=>x.checked=false);
  const quickCourt=calendarQuickSlot?.court||'Cancha 1';
  const quickEl=[rCourtSel1,rCourtSel2,rCourtSel3].find(x=>x.value===quickCourt);if(quickEl)quickEl.checked=true;
  applyReservationClientRate();
  reservationFormTitle.textContent=editingReservationId?(kind==='exclusive'?'Editar evento exclusivo':'Editar reserva de cancha'):(kind==='exclusive'?'Reserva de evento exclusivo':'Reserva de cancha');
  reservationKindChip.textContent=kind==='exclusive'?'Evento exclusivo':'Alquiler de cancha';
  rExclusiveBlock.classList.toggle('hidden',kind!=='exclusive');
  rCourtBlock.classList.toggle('hidden',kind!=='court');
  rTotal.value=kind==='exclusive'?Number(settings.exclusive||0):0;
  populateReservationQuotes();
  if(preselectReservationQuoteId){
    rQuote.value=String(preselectReservationQuoteId);
    loadReservationQuote();
    preselectReservationQuoteId=null;
  }
  updateCourtSelectionUI();
  applyReservationClientRate();
  syncReservationScheduleUI();
  updateReservationDuration();
  if(kind==='court')recalcReservationCourtTotal(); else recalcReservationBalance();
  checkReservationConflictUI();
  calendarQuickSlot=null;
}
function populateReservationQuotes(){
  const cid=rClient.value;
  const arr=quotes.filter(q=>String(q.clientId)===String(cid) && (reservationKind?((reservationKind==='exclusive'&&q.mode==='exclusive')||(reservationKind==='court'&&q.mode!=='exclusive')):true));
  rQuote.innerHTML='<option value="">Reserva directa / sin cotización</option>'+arr.map(q=>`<option value="${q.id}">${q.code} · ${q.eventType} · ${money(q.regularTotal??q.total)}</option>`).join('')
}
function loadReservationQuote(){
  const q=quoteById(rQuote.value);if(!q)return;if(courtBookingMode==='recurring')setCourtBookingMode('single');
  const inferred=q.mode==='exclusive'?'exclusive':'court';
  if(reservationKind!==inferred){
    reservationKind=inferred;
    reservationFormTitle.textContent=inferred==='exclusive'?'Reserva de evento exclusivo':'Reserva de cancha';
    reservationKindChip.textContent=inferred==='exclusive'?'Evento exclusivo':'Alquiler de cancha';
    rExclusiveBlock.classList.toggle('hidden',inferred!=='exclusive');rCourtBlock.classList.toggle('hidden',inferred!=='court');
  }
  rEventType.value=[...rEventType.options].some(o=>o.value===q.eventType)?q.eventType:'Otro';
  rPeople.value=Number(q.people||20);
  if(inferred==='court'){
    const ct=q.courtType||'FUT 6';rCourtType.value=ct;updateCourtSelectionUI();applyReservationClientRate();
  }
  rDate.value=q.eventDate||localDateValue();rStart.value=q.startTime||'11:00';rEnd.value=q.endTime||'13:00';
  if(inferred==='court')setCourtScheduleFromTimes(rStart.value,rEnd.value);else{if(document.getElementById('rStartExclusive'))rStartExclusive.value=rStart.value;if(document.getElementById('rEndExclusive'))rEndExclusive.value=rEnd.value;syncExclusiveSchedule()}
  const conversion=(quoteConversionContext&&String(quoteConversionContext.quoteId)===String(q.id))?quoteConversionContext.mode:null,t=quoteTotalsForConversion(q);
  rTotal.value=conversion==='single'?t.single:t.regular;rAdvance.value=0;
  const planInfo=document.getElementById('rQuotePaymentPlanInfo');
  if(planInfo){
    planInfo.classList.toggle('hidden',!conversion);
    if(conversion==='single')planInfo.innerHTML=`<b>Pago único anticipado</b><br>Se cobrará ${money(t.single)} en una sola operación para aplicar el descuento de ${money(t.discount)}. La reserva queda como pre-reserva hasta registrar ese cobro.`;
    else if(conversion==='installments')planInfo.innerHTML=`<b>Pago en partes / adelanto</b><br>Total regular ${money(t.regular)}. No aplica descuento. Después de crear la reserva se abrirá el cobro con 50% precargado como referencia.`;
    else if(conversion==='hold')planInfo.innerHTML=`<b>Pre-reserva sin pago</b><br>Total regular ${money(t.regular)}. El horario quedará bloqueado y el cobro podrá registrarse posteriormente.`;
  }
  if(conversion)rStatus.value='hold';
  updatePhysicalCourtField();updateReservationDuration();recalcReservationBalance();checkReservationConflictUI()
}


function buildHalfHourOptions(){
  const sel=document.getElementById('rStartSelect');if(!sel)return;
  let out='';
  for(let mins=6*60;mins<=22*60;mins+=30){
    const t=`${String(Math.floor(mins/60)).padStart(2,'0')}:${String(mins%60).padStart(2,'0')}`;
    out+=`<option value="${t}">${t}</option>`
  }
  sel.innerHTML=out
}
function syncReservationScheduleUI(){
  const isCourt=reservationKind==='court';
  const courtBlock=document.getElementById('rCourtScheduleBlock'),exclusiveBlock=document.getElementById('rExclusiveScheduleBlock');
  if(courtBlock)courtBlock.classList.toggle('hidden',!isCourt);
  if(exclusiveBlock)exclusiveBlock.classList.toggle('hidden',isCourt);
  if(isCourt)syncCourtScheduleFromSelectors();else syncExclusiveSchedule()
}
function syncCourtScheduleFromSelectors(){
  const start=document.getElementById('rStartSelect')?.value||'11:00';
  const mins=Number(document.getElementById('rDurationSelect')?.value||60);
  const end=addMinutesToTime(start,mins);
  rStart.value=start;rEnd.value=end;
  const endDisplay=document.getElementById('rEndDisplay');if(endDisplay)endDisplay.textContent=end;
  recalcReservationCourtTotal();checkReservationConflictUI();if(courtBookingMode==='recurring')updateRecurringSeriesPreview()
}
function syncExclusiveSchedule(){
  const s=document.getElementById('rStartExclusive')?.value||'11:00';
  const e=document.getElementById('rEndExclusive')?.value||'13:00';
  rStart.value=s;rEnd.value=e;updateReservationDuration();recalcReservationBalance();checkReservationConflictUI()
}
function setCourtScheduleFromTimes(start,end){
  const startSel=document.getElementById('rStartSelect'),durSel=document.getElementById('rDurationSelect');
  if(startSel&&[...startSel.options].some(o=>o.value===start))startSel.value=start;
  const diff=Math.max(60,timeToMinutes(end)-timeToMinutes(start));
  const allowed=[60,90,120,150,180];const nearest=allowed.reduce((a,b)=>Math.abs(b-diff)<Math.abs(a-diff)?b:a,60);
  if(durSel)durSel.value=String(nearest);syncCourtScheduleFromSelectors()
}

function addMinutesToTime(time,mins){
  const [h,m]=String(time||'00:00').split(':').map(Number);
  let total=h*60+m+mins; total=(total+1440)%1440;
  return `${String(Math.floor(total/60)).padStart(2,'0')}:${String(total%60).padStart(2,'0')}`
}
function timeToMinutes(t){
  const [h,m]=String(t||'00:00').split(':').map(Number);return h*60+m
}
function clientCourtRate(clientId,type){
  const c=clientById(clientId);
  if(type==='FUT 9'){
    const special=c&&c.specialFut9!==null&&c.specialFut9!==undefined&&c.specialFut9!==''?Number(c.specialFut9):null;
    return {rate:special!==null?special:Number(settings.fut9||0),special:special!==null,client:c}
  }
  const special=c&&c.specialFut6!==null&&c.specialFut6!==undefined&&c.specialFut6!==''?Number(c.specialFut6):null;
  return {rate:special!==null?special:Number(settings.fut6||0),special:special!==null,client:c}
}
function applyReservationClientRate(){
  if(reservationKind!=='court')return;
  const info=clientCourtRate(rClient.value,rCourtType.value);reservationRateManual=false;rCourtRate.value=info.rate;
  const label=document.querySelector('#rRateSource span:last-child');
  rRateSource.classList.toggle('special',info.special);
  if(label)label.textContent=info.special?`Tarifa especial de ${info.client?.name||'cliente'}`:'Tarifa general';
  rCourtRateLabel.textContent=rCourtType.value==='FUT 9'?'Tarifa FUT 9 / hora':'Tarifa por cancha / hora';
  recalcReservationCourtTotal()
}
function markManualRate(){
  reservationRateManual=true;rRateSource.classList.remove('special');
  const label=document.querySelector('#rRateSource span:last-child');if(label)label.textContent='Tarifa modificada para esta reserva'
}
function onReservationClientChange(){syncReservationClientSearch();populateReservationQuotes();if(!rQuote.value)applyReservationClientRate();if(courtBookingMode==='recurring')refreshRecurringBlockRatesFromClient()}
function onReservationCourtTypeChange(){
  reservationRateManual=false;updateCourtSelectionUI();applyReservationClientRate();checkReservationConflictUI();if(courtBookingMode==='recurring')updateRecurringSeriesPreview()
}
function selectedPhysicalCourts(){
  if(rCourtType.value==='FUT 9')return ['Cancha 1','Cancha 2','Cancha 3'];
  return [rCourtSel1,rCourtSel2,rCourtSel3].filter(x=>x.checked).map(x=>x.value)
}
function syncCourtQtySelection(preferred=null){
  if(rCourtType.value!=='FUT 6')return;
  const qty=Number(rCourtQty.value||1),boxes=[rCourtSel1,rCourtSel2,rCourtSel3];
  let selected=boxes.filter(x=>x.checked);
  if(preferred){boxes.forEach(x=>x.checked=false);const first=boxes.find(x=>x.value===preferred);if(first)first.checked=true;selected=boxes.filter(x=>x.checked)}
  if(selected.length>qty){selected.slice(qty).forEach(x=>x.checked=false)}
  selected=boxes.filter(x=>x.checked);
  if(selected.length<qty){boxes.filter(x=>!x.checked).slice(0,qty-selected.length).forEach(x=>x.checked=true)}
}
function onPhysicalCourtToggle(el){
  if(rCourtType.value!=='FUT 6')return;
  const qty=Number(rCourtQty.value||1),selected=selectedPhysicalCourts();
  if(selected.length>qty){el.checked=false;showToast(`Selecciona solo ${qty} cancha${qty>1?'s':''}`)}
  else if(selected.length<qty){showToast(`Falta seleccionar ${qty-selected.length} cancha${qty-selected.length>1?'s':''}`)}
  recalcReservationCourtTotal();checkReservationConflictUI()
}
function updateCourtSelectionUI(){
  if(reservationKind!=='court')return;
  const isFut9=rCourtType.value==='FUT 9';
  rFut6CourtSelection.classList.toggle('hidden',isFut9);rFut9ResourceInfo.classList.toggle('hidden',!isFut9);
  if(!isFut9)syncCourtQtySelection(calendarQuickSlot?.court||null);
  rCourtRateLabel.textContent=isFut9?'Tarifa FUT 9 / hora':'Tarifa por cancha / hora'
}
function reservationResources(candidate){
  const kind=candidate.reservationKind||(candidate.space==='Local exclusivo'?'exclusive':'court');
  if(kind==='exclusive')return ['Cancha 1','Cancha 2','Cancha 3'];
  const type=candidate.courtType||candidate.space;
  if(type==='FUT 9')return ['Cancha 1','Cancha 2','Cancha 3'];
  if(Array.isArray(candidate.physicalCourts)&&candidate.physicalCourts.length)return candidate.physicalCourts;
  return [candidate.physicalCourt||candidate.resourceCourt||candidate.spacePhysical||'Cancha 1']
}
function intervalsOverlap(aStart,aEnd,bStart,bEnd){
  const as=timeToMinutes(aStart), ae=timeToMinutes(aEnd), bs=timeToMinutes(bStart), be=timeToMinutes(bEnd);
  return as<be && ae>bs
}
function findReservationConflict(candidate,ignoreId=null){
  const resources=reservationResources(candidate);
  return reservations.find(r=>{
    if(String(r.id)===String(ignoreId)||['cancelled','no_show'].includes(r.status)||r.eventDate!==candidate.eventDate)return false;
    if(!intervalsOverlap(candidate.startTime,candidate.endTime,r.startTime,r.endTime))return false;
    return reservationResources(r).some(x=>resources.includes(x))
  })||null
}
function currentReservationCandidate(){
  if(!rDate.value||!rStart.value||!rEnd.value)return null;
  const isExclusive=reservationKind==='exclusive';
  const courts=isExclusive?['Cancha 1','Cancha 2','Cancha 3']:selectedPhysicalCourts();
  return {reservationKind,eventDate:rDate.value,startTime:rStart.value,endTime:rEnd.value,courtType:isExclusive?null:rCourtType.value,physicalCourts:courts,space:isExclusive?'Local exclusivo':rCourtType.value}
}
function checkReservationConflictUI(){
  const box=document.getElementById('reservationConflictBox');if(!box)return null;if(courtBookingMode==='recurring'&&reservationKind==='court'){box.classList.remove('show');box.textContent='';updateRecurringSeriesPreview();return null}
  const candidate=currentReservationCandidate();if(!candidate){box.classList.remove('show');box.textContent='';return null}
  const conflict=findReservationConflict(candidate,editingReservationId);
  if(conflict){
    const c=clientById(conflict.clientId)||{name:'Cliente'};
    box.textContent=`Horario no disponible. Se cruza con ${conflict.code} - ${c.name}, ${conflict.startTime}-${conflict.endTime}.`;
    box.classList.add('show')
  }else{box.classList.remove('show');box.textContent=''}
  return conflict
}

function reservationHours(){
  if(!rStart.value||!rEnd.value)return 0;
  const [sh,sm]=rStart.value.split(':').map(Number),[eh,em]=rEnd.value.split(':').map(Number);
  let mins=(eh*60+em)-(sh*60+sm);if(mins<0)mins+=1440;
  return mins/60
}
function updateReservationDuration(){
  const h=reservationHours();rDuration.textContent=(Number.isInteger(h)?h:h.toFixed(1))+' h';return h
}
function recalcReservationCourtTotal(){
  const h=updateReservationDuration();
  if(reservationKind!=='court'){recalcReservationBalance();return}
  const qty=rCourtType.value==='FUT 9'?1:Number(rCourtQty.value||1);
  const rate=Number(rCourtRate.value||0),total=rate*h*qty;
  rTotal.value=total.toFixed(0);recalcReservationBalance();
  if(document.getElementById('rCourtCalc'))rCourtCalc.innerHTML=`<span>Cálculo</span><b>${qty} ${rCourtType.value==='FUT 9'?'FUT 9':'cancha'+(qty>1?'s':'')} × ${Number.isInteger(h)?h:h.toFixed(1)} h × ${money(rate)} = ${money(total)}</b>`;
  checkReservationConflictUI()
}
function recalcReservationBalance(){rBalance.textContent=money(Math.max(0,Number(rTotal.value||0)-Number(rAdvance.value||0)))}
function saveReservation(){
  const cid=rClient.value;if(!cid){showToast('Selecciona un cliente');return}
  if(!reservationKind){showToast('Selecciona el tipo de reserva');return}
  if(reservationKind==='court'&&courtBookingMode==='recurring'&&!editingReservationId){createRecurringSeries();return}
  if(!rDate.value||!rStart.value||!rEnd.value){showToast('Completa fecha y horario');return}
  if(timeToMinutes(rEnd.value)<=timeToMinutes(rStart.value)){showToast('La hora fin debe ser posterior a la hora inicio');return}
  const isExclusive=reservationKind==='exclusive';
  const physicalCourts=isExclusive?['Cancha 1','Cancha 2','Cancha 3']:selectedPhysicalCourts();
  if(!isExclusive&&rCourtType.value==='FUT 6'&&physicalCourts.length!==Number(rCourtQty.value||1)){showToast('Selecciona exactamente la cantidad de canchas indicada');return}
  const conflict=checkReservationConflictUI();if(conflict){showToast('Una de las canchas ya esta ocupada');return}
  const q=rQuote.value?quoteById(rQuote.value):null;
  const conversionPlan=(q&&quoteConversionContext&&String(quoteConversionContext.quoteId)===String(q.id))?quoteConversionContext.mode:null;
  const quoteTotals=q?quoteTotalsForConversion(q):null;
  const total=Number(rTotal.value||0),advance=Math.max(0,Number(rAdvance.value||0));
  const qty=isExclusive?3:(rCourtType.value==='FUT 9'?1:Number(rCourtQty.value||1));
  const rateInfo=!isExclusive?clientCourtRate(cid,rCourtType.value):null;
  const rateSource=isExclusive?'package':(reservationRateManual?'manual':(rateInfo.special?'client_special':'general'));
  const space=isExclusive?'Local exclusivo':(rCourtType.value==='FUT 9'?'FUT 9':(qty===1?physicalCourts[0]:`${qty} canchas FUT 6`));
  const data={clientId:Number(cid),quoteId:q?q.id:null,reservationKind,eventType:isExclusive?rEventType.value:'Alquiler de cancha',people:isExclusive?Number(rPeople.value||0):null,eventDate:rDate.value,startTime:rStart.value,endTime:rEnd.value,space,courtType:isExclusive?null:rCourtType.value,courtQty:isExclusive?3:qty,physicalCourt:!isExclusive&&physicalCourts.length===1?physicalCourts[0]:null,physicalCourts,courtRate:isExclusive?null:Number(rCourtRate.value||0),rateSource,hours:reservationHours(),total,advance,balance:Math.max(0,total-advance),notes:rNotes.value.trim(),status:conversionPlan?'hold':(rStatus.value||'confirmed'),quotePaymentPlan:conversionPlan||null,regularTotal:conversionPlan?Number(quoteTotals.regular):undefined,singlePaymentTotal:conversionPlan?Number(quoteTotals.single):undefined,discountAmount:conversionPlan?Number(quoteTotals.discount):undefined,singlePaymentPending:conversionPlan==='single'};
  if(editingReservationId){
    const existing=reservationById(editingReservationId);if(!existing)return;
    Object.assign(existing,data,{updatedAt:nowISO()});
    if(q){q.status='reserved';q.reservedAt=q.reservedAt||nowISO()}
    persist();closeSheet('reservationSheet');editingReservationId=null;renderReservations();renderQuotes();renderCalendar();renderHome();renderReservationWorkspace();showToast('Reserva actualizada');go('reservations');return
  }
  const r={id:Date.now(),code:nextReservationCode(),...data,createdAt:nowISO()};
  reservations.unshift(r);if(q){q.status='reserved';q.reservedAt=nowISO();q.reservationId=r.id}
  const postPlan=conversionPlan;quoteConversionContext=null;
  persist();closeSheet('reservationSheet');renderReservations();renderQuotes();renderCalendar();renderHome();renderReservationWorkspace();go('reservations');
  if(postPlan==='single'){showToast(`Pre-reserva ${r.code} creada · registra el pago único`);setTimeout(()=>openPaymentSheet(r.id,Number(r.singlePaymentTotal||r.balance)),30);return}
  if(postPlan==='installments'){const half=Math.round(Number(r.regularTotal||r.total)*50)/100;showToast(`Pre-reserva ${r.code} creada · registra el adelanto`);setTimeout(()=>openPaymentSheet(r.id,half),30);return}
  showToast((r.status==='hold'?'Pre-reserva ':'Reserva ')+r.code+' creada')
}
function openReservations(){go('reservations')}

function setReservationWorkspace(view){
  reservationWorkspace=view;
  const map={
    agenda:['reservationAgendaTab','reservationAgendaPanel'],
    courts:['reservationCourtsTab','reservationCourtsPanel'],
    list:['reservationListTab','reservationListPanel']
  };
  ['agenda','courts','list'].forEach(k=>{
    document.getElementById(map[k][0])?.classList.toggle('active',k===view);
    document.getElementById(map[k][1])?.classList.toggle('hidden',k!==view)
  });
  renderReservationWorkspace()
}

function showReservationListView(){setReservationWorkspace('list')}

function renderReservationWorkspace(){
  if(reservationWorkspace==='agenda')renderReservationAgenda();
  else if(reservationWorkspace==='courts')renderReservationCourts();
  else renderReservations()
}

function reservationDateStripHTML(selectedDate,callbackName){
  const [y,m,d]=selectedDate.split('-').map(Number);
  const base=new Date(y,m-1,d);
  let out='';
  for(let i=-21;i<=21;i++){
    const x=new Date(base);x.setDate(base.getDate()+i);
    const ds=localDateValue(x);
    out+=`<button class="reservation-date-btn ${ds===selectedDate?'active':''}" data-res-date="${ds}" onclick="${callbackName}('${ds}')"><span>${x.toLocaleDateString('es-PE',{weekday:'short'}).replace('.','')}</span><b>${x.getDate()}</b><small>${x.toLocaleDateString('es-PE',{month:'short'}).replace('.','')}</small></button>`
  }
  return out
}

function alignReservationDateStrip(strip){
  if(!strip)return;
  requestAnimationFrame(()=>{
    const active=strip.querySelector('.reservation-date-btn.active');
    if(!active)return;
    const gap=7;
    const item=active.getBoundingClientRect().width+gap;
    strip.scrollLeft=Math.max(0,active.offsetLeft-item);
  })
}

function selectReservationFocusDate(ds){
  reservationFocusDate=ds;
  renderReservationWorkspace()
}

function openReservationDatePicker(){
  reservationDatePickerMode=true;
  calendarSelectedDate=reservationFocusDate;
  const [y,m,d]=reservationFocusDate.split('-').map(Number);
  calendarCursor=new Date(y,m-1,d);
  setCalendarView('month');
  openSheet('calendarSheet')
}

function reservationGoToday(){
  reservationFocusDate=localDateValue();
  renderReservationWorkspace()
}

function reservationDayLabel(ds){
  const d=new Date(ds+'T12:00:00');
  return d.toLocaleDateString('es-PE',{weekday:'long',day:'numeric',month:'long'}).replace(/^./,x=>x.toUpperCase())
}

function renderReservationAgenda(){
  const host=document.getElementById('reservationAgendaList');if(!host)return;
  const strip=document.getElementById('agendaDateStrip');if(strip){strip.innerHTML=reservationDateStripHTML(reservationFocusDate,'selectReservationFocusDate');alignReservationDateStrip(strip)}
  const dayTitle=document.getElementById('agendaDayTitle');if(dayTitle)dayTitle.textContent=reservationDayLabel(reservationFocusDate);

  const arr=reservations
    .filter(r=>!['cancelled','no_show'].includes(r.status)&&r.eventDate===reservationFocusDate)
    .sort((a,b)=>a.startTime.localeCompare(b.startTime));

  const sub=document.getElementById('agendaDaySummary');
  if(sub)sub.textContent=`${arr.length} reserva${arr.length===1?'':'s'} programada${arr.length===1?'':'s'}`;

  if(!arr.length){
    host.innerHTML='<div class="agenda-empty">No hay reservas para este día.</div>';
    return
  }

  host.innerHTML=arr.map(r=>{
    const c=clientById(r.clientId)||{name:'Cliente'};
    const kind=r.reservationKind||(r.space==='Local exclusivo'?'exclusive':'court');
    const space=kind==='exclusive'?'Evento exclusivo':(r.courtType==='FUT 9'?'FUT 9':(reservationResources(r).join(' + ')||r.space));
    const finance=Number(r.balance||0)>0?`Saldo ${money(r.balance)}`:'Pagado';
    const state=r.status==='hold'?'Pre-reserva':'Confirmada';
    return `<button class="agenda-row" onclick="openReservationDetail('${r.id}')">
      <div class="agenda-time"><b>${escapeHtml(r.startTime)}</b><span>${escapeHtml(r.endTime)}</span></div>
      <div class="agenda-main">
        <div class="agenda-client">${escapeHtml(c.name)}</div>
        <div class="agenda-space">${escapeHtml(space)} · ${escapeHtml(r.code)}</div>
        <div class="agenda-finance">${escapeHtml(finance)}</div>
      </div>
      <div class="agenda-status ${r.status==='hold'?'hold':'confirmed'}">${state}</div>
    </button>`
  }).join('')
}

function selectReservationCourt(court,el){
  reservationCourtFocus=court;
  document.querySelectorAll('[data-res-court]').forEach(b=>b.classList.toggle('active',b.dataset.resCourt===court));
  renderReservationCourts()
}

function dayMinutesToTime(mins){
  mins=Math.max(0,Math.min(1439,mins));
  return `${String(Math.floor(mins/60)).padStart(2,'0')}:${String(mins%60).padStart(2,'0')}`
}

function reservationsForFocusedCourt(){
  return reservations
    .filter(r=>!['cancelled','no_show'].includes(r.status)&&r.eventDate===reservationFocusDate&&reservationResources(r).includes(reservationCourtFocus))
    .sort((a,b)=>a.startTime.localeCompare(b.startTime))
}

function renderReservationCourts(){
  const strip=document.getElementById('courtsDateStrip');if(strip){strip.innerHTML=reservationDateStripHTML(reservationFocusDate,'selectReservationFocusDate');alignReservationDateStrip(strip)}
  const title=document.getElementById('courtsDayTitle');if(title)title.textContent=reservationDayLabel(reservationFocusDate);

  document.querySelectorAll('[data-res-court]').forEach(b=>b.classList.toggle('active',b.dataset.resCourt===reservationCourtFocus));

  const host=document.getElementById('reservationCourtTimeline');if(!host)return;
  const arr=reservationsForFocusedCourt();
  const summary=document.getElementById('reservationCourtSummary');
  if(summary)summary.textContent=`${reservationCourtFocus} · ${arr.length} reserva${arr.length===1?'':'s'} en el día`;

  const openMin=6*60, closeMin=23*60;
  const segments=[];
  let cursor=openMin;

  arr.forEach(r=>{
    const rs=Math.max(openMin,timeToMinutes(r.startTime));
    const re=Math.min(closeMin,timeToMinutes(r.endTime));
    if(re<=openMin||rs>=closeMin)return;
    if(rs>cursor)segments.push({type:'free',start:cursor,end:rs});
    segments.push({type:'busy',start:rs,end:re,reservation:r});
    cursor=Math.max(cursor,re)
  });
  if(cursor<closeMin)segments.push({type:'free',start:cursor,end:closeMin});

  if(!segments.length)segments.push({type:'free',start:openMin,end:closeMin});

  host.innerHTML=segments.map(seg=>{
    const start=dayMinutesToTime(seg.start),end=dayMinutesToTime(seg.end);
    if(seg.type==='free'){
      return `<button class="court-segment free" onclick="quickReserveSlot('${reservationCourtFocus}','${start}')">
        <div class="court-time">${start} - ${end}</div>
        <div class="court-main"><b>Disponible</b><span>${reservationCourtFocus}</span></div>
        <div class="court-action">Reservar</div>
      </button>`
    }
    const r=seg.reservation,c=clientById(r.clientId)||{name:'Cliente'};
    const kind=r.reservationKind||(r.space==='Local exclusivo'?'exclusive':'court');
    const cls=r.status==='hold'?'hold':(kind==='exclusive'?'exclusive':'busy');
    const typeLabel=kind==='exclusive'?'Evento exclusivo':(r.courtType==='FUT 9'?'FUT 9':'FUT 6');
    return `<button class="court-segment ${cls}" onclick="openReservationDetail('${r.id}')">
      <div class="court-time">${start} - ${end}</div>
      <div class="court-main"><b>${escapeHtml(c.name)}</b><span>${typeLabel} · ${escapeHtml(r.code)}</span></div>
      <div class="court-action">${r.status==='hold'?'Pre-reserva':'Ver'}</div>
    </button>`
  }).join('')
}
function setReservationFilter(filter,el){
  reservationFilter=filter;
  document.querySelectorAll('[data-reservation-filter]').forEach(x=>x.classList.remove('active'));
  if(el)el.classList.add('active');
  renderReservations()
}
function reservationStatusLabel(r){
  const map={hold:'Pre-reserva',confirmed:'Confirmada',completed:'Realizada',cancelled:'Cancelada',no_show:'No asistió',rescheduled:'Reprogramada'};
  return map[r.status]||'Confirmada'
}
function reservationStatusClass(r){
  if(r.status==='cancelled'||r.status==='no_show')return 'b-red';
  if(r.status==='hold')return 'b-yellow';
  if(r.status==='rescheduled')return 'b-blue';
  return 'b-green'
}
function reservationDateHeading(ds){
  if(ds===localDateValue())return 'Hoy';
  const d=new Date(ds+'T12:00:00');
  return d.toLocaleDateString('es-PE',{weekday:'long',day:'numeric',month:'long'}).replace(/^./,x=>x.toUpperCase())
}
function renderReservations(){
  const host=document.getElementById('reservationList');if(!host)return;
  const today=localDateValue(),search=(document.getElementById('reservationSearch')?.value||'').toLowerCase();
  let arr=[...reservations].filter(r=>{
    if(reservationFilter==='upcoming'&&(['cancelled','no_show','completed'].includes(r.status)||r.eventDate<today))return false;
    if(reservationFilter==='today'&&r.eventDate!==today)return false;
    if(reservationFilter==='hold'&&r.status!=='hold')return false;
    const c=clientById(r.clientId)||{name:''};
    return ((r.code||'')+' '+c.name+' '+(r.space||'')+' '+(r.courtType||'')).toLowerCase().includes(search)
  });
  arr.sort((a,b)=>(a.eventDate+a.startTime).localeCompare(b.eventDate+b.startTime));
  if(!arr.length){host.innerHTML='<div class="card empty">No hay reservas en este filtro.</div>';return}
  const groups={};arr.forEach(r=>(groups[r.eventDate]||(groups[r.eventDate]=[])).push(r));
  host.innerHTML=Object.keys(groups).sort().map(ds=>{
    const cards=groups[ds].map(r=>{
      const c=clientById(r.clientId)||{name:'Cliente'};const kind=r.reservationKind||(r.space==='Local exclusivo'?'exclusive':'court');
      const special=r.rateSource==='client_special';const duration=Number(r.hours||0);const durText=(Number.isInteger(duration)?duration:duration.toFixed(1))+' h';
      return `<div class="card reservation-card-v11">
        <div class="lead"><div class="initials">${initials(c.name)}</div><div class="lead-main"><div class="lead-name">${escapeHtml(r.code)} · ${escapeHtml(c.name)}</div><div class="lead-meta">${kind==='exclusive'?'Evento exclusivo':escapeHtml(r.courtType||'Alquiler de cancha')} · ${escapeHtml(r.space)}</div><div class="reservation-mainline"><b>${escapeHtml(r.startTime)} - ${escapeHtml(r.endTime)}</b><span>·</span><span>${durText}</span></div>${kind==='court'?`<div class="rate-tag ${special?'special':''}">${special?'Tarifa especial':'Tarifa '+(r.rateSource==='manual'?'manual':'general')} · ${money(r.courtRate||0)}${r.courtType==='FUT 6'?' / cancha/h':' / h'}</div>${r.seriesCode?`<div class="series-chip">${escapeHtml(r.seriesCode)}${r.seriesBlockIndex?` · Horario ${Number(r.seriesBlockIndex)}`:' · Recurrente'}</div>`:''}`:''}</div><div class="lead-right"><div class="badge ${reservationStatusClass(r)}">${reservationStatusLabel(r)}</div></div></div>
        <div class="reservation-money-grid"><div class="reservation-money"><span>Total</span><b>${money(r.total)}</b></div><div class="reservation-money"><span>Adelanto</span><b>${money(r.advance)}</b></div><div class="reservation-money"><span>Saldo</span><b>${money(r.balance)}</b></div></div>
        <div class="actions"><button class="btn primary-small" onclick="openReservationDetail('${r.id}')">Ver</button><button class="btn btn-edit" onclick="editReservation('${r.id}')">Editar</button><button class="btn btn-share" onclick="openShareReservation('${r.id}')">Compartir</button></div>
      </div>`
    }).join('');
    return `<div class="reservation-group"><div class="reservation-group-title">${reservationDateHeading(ds)}</div><div class="stack">${cards}</div></div>`
  }).join('')
}
function openReservationDetail(id){
  const r=reservationById(id);if(!r)return;openReservationId=r.id;const c=clientById(r.clientId)||{name:'Cliente'},q=r.quoteId?quoteById(r.quoteId):null;
  rdTitle.textContent=r.code+' · '+c.name;
  const kind=r.reservationKind||(r.space==='Local exclusivo'?'exclusive':'court');
  const paymentRows=movements.filter(m=>m.type==='payment'&&String(m.reservationId)===String(r.id)).sort((a,b)=>String(a.occurredAt||a.createdAt||'').localeCompare(String(b.occurredAt||b.createdAt||'')));
  const paymentHistory=paymentRows.length?`<div class="payment-history"><div class="payment-history-title">Pagos registrados</div>${paymentRows.map(m=>`<div class="payment-history-row"><div class="payment-history-top"><div><b>${escapeHtml(m.paymentStage||'Cobro')}</b><div class="payment-history-meta">${escapeHtml(m.method||'Sin método')} · ${fmtDateTime(m.occurredAt||m.createdAt)}</div></div><strong>${money(m.amount)}</strong></div>${m.attachmentId?`<div class="payment-history-proof"><button class="cash-proof-btn" onclick="openMovementAttachment('${String(m.id)}')">Ver comprobante</button></div>`:''}</div>`).join('')}</div>`:'';
  reservationDetailBody.innerHTML=`<div class="detail-row"><span>Estado</span><b>${reservationStatusLabel(r)}</b></div><div class="detail-row"><span>Tipo de reserva</span><b>${kind==='exclusive'?'Evento exclusivo':'Alquiler de cancha'}</b></div>${r.seriesCode?`<div class="detail-row"><span>Serie recurrente</span><b>${escapeHtml(r.seriesCode)}${r.seriesBlockIndex?` · Horario ${Number(r.seriesBlockIndex)}`:''}</b></div>`:''}<div class="detail-row"><span>Cliente</span><b>${escapeHtml(c.name)}</b></div>${kind==='exclusive'?`<div class="detail-row"><span>Evento</span><b>${escapeHtml(r.eventType)}</b></div><div class="detail-row"><span>Asistentes</span><b>${Number(r.people||0)||'—'}</b></div>`:`<div class="detail-row"><span>Formato</span><b>${escapeHtml(r.courtType||r.space)}</b></div><div class="detail-row"><span>Canchas</span><b>${r.courtType==='FUT 9'?'Cancha 1 + 2 + 3':escapeHtml(reservationResources(r).join(' + '))}</b></div><div class="detail-row"><span>Tarifa</span><b>${money(r.courtRate||0)} / hora${r.courtType==='FUT 6'?' / cancha':''}</b></div>`}<div class="detail-row"><span>Fecha</span><b>${fmtScheduled(r.eventDate,r.startTime)} - ${escapeHtml(r.endTime)}</b></div>${kind==='exclusive'?`<div class="detail-row"><span>Espacio</span><b>${escapeHtml(r.space||'Local exclusivo')}</b></div>`:''}<div class="detail-row"><span>Total</span><b>${money(r.total)}</b></div><div class="detail-row"><span>Pagado</span><b>${money(r.advance||0)}</b></div><div class="detail-row"><span>Saldo pendiente</span><b>${money(r.balance)}</b></div>${r.paymentDisposition?`<div class="detail-row"><span>Destino del pago</span><b>${paymentDispositionLabel(r.paymentDisposition)}</b></div>`:''}${Number(r.refundedAmount||0)>0?`<div class="detail-row"><span>Devuelto</span><b>${money(r.refundedAmount)}</b></div>`:''}${Number(r.creditAmount||0)>0?`<div class="detail-row"><span>Saldo a favor generado</span><b>${money(r.creditAmount)}</b></div>`:''}${Number(r.retainedAmount||0)>0?`<div class="detail-row"><span>Retenido</span><b>${money(r.retainedAmount)}</b></div>`:''}${Number(c.creditBalance||0)>0?`<div class="detail-row"><span>Saldo a favor del cliente</span><b>${money(c.creditBalance)}</b></div>`:''}<div class="detail-row"><span>Cotización</span><b>${q?escapeHtml(q.code):'Reserva directa'}</b></div><div class="detail-row"><span>Creado</span><b>${fmtDateTime(r.createdAt)}</b></div>${paymentHistory}`;
  const holdBtn=document.getElementById('confirmHoldBtn');if(holdBtn)holdBtn.classList.toggle('hidden',r.status!=='hold');
  openSheet('reservationDetailSheet')
}

function editOpenReservation(){if(openReservationId){closeSheet('reservationDetailSheet');editReservation(openReservationId)}}
function shareOpenReservation(){if(openReservationId){closeSheet('reservationDetailSheet');openShareReservation(openReservationId)}}
function editReservation(id){
  const r=reservationById(id);if(!r)return;
  editingReservationId=r.id;reservationKind=r.reservationKind||(r.space==='Local exclusivo'?'exclusive':'court');
  prepareReservationForm(reservationKind);
  reservationFormTitle.textContent=reservationKind==='exclusive'?'Editar evento exclusivo':'Editar reserva de cancha';
  reservationSaveBtn.textContent='Guardar cambios';
  rClient.value=String(r.clientId);syncReservationClientSearch();populateReservationQuotes();if(r.quoteId)rQuote.value=String(r.quoteId);setCourtBookingMode('single');
  rDate.value=r.eventDate;rAdvance.value=Number(r.advance||0);rNotes.value=r.notes||'';rStatus.value=r.status==='hold'?'hold':'confirmed';
  if(reservationKind==='exclusive'){
    rEventType.value=[...rEventType.options].some(o=>o.value===r.eventType)?r.eventType:'Otro';rPeople.value=Number(r.people||0);
    rStartExclusive.value=r.startTime;rEndExclusive.value=r.endTime;syncExclusiveSchedule();rTotal.value=Number(r.total||0);recalcReservationBalance();
  }else{
    rCourtType.value=r.courtType||'FUT 6';updateCourtSelectionUI();
    if(rCourtType.value==='FUT 6'){
      rCourtQty.value=String(r.courtQty||reservationResources(r).length||1);
      const used=reservationResources(r);[rCourtSel1,rCourtSel2,rCourtSel3].forEach(x=>x.checked=used.includes(x.value));
    }
    rCourtRate.value=Number(r.courtRate||0);reservationRateManual=r.rateSource==='manual';
    const label=document.querySelector('#rRateSource span:last-child');const c=clientById(r.clientId);
    rRateSource.classList.toggle('special',r.rateSource==='client_special');
    if(label)label.textContent=r.rateSource==='client_special'?`Tarifa especial de ${c?.name||'cliente'}`:(r.rateSource==='manual'?'Tarifa modificada para esta reserva':'Tarifa general');
    setCourtScheduleFromTimes(r.startTime,r.endTime);recalcReservationCourtTotal();
  }
  checkReservationConflictUI();openSheet('reservationSheet')
}
function reservationMessageVariables(r){
  const c=clientById(r.clientId)||{name:'Cliente'};
  const kind=r.reservationKind||(r.space==='Local exclusivo'?'exclusive':'court');
  const date=r.eventDate?new Date(r.eventDate+'T12:00:00').toLocaleDateString('es-PE',{weekday:'long',day:'numeric',month:'long',year:'numeric'}):'Sin fecha';
  const courts=kind==='court'?(r.courtType==='FUT 9'?'Cancha 1 + 2 + 3':(reservationResources(r).join(' + ')||'Cancha')):'';
  const format=kind==='exclusive'?'Evento exclusivo':(r.courtType||'Alquiler de cancha');
  const event=kind==='exclusive'?(r.eventType||'Evento exclusivo'):'';
  const space=kind==='exclusive'?(r.space||'Local exclusivo'):courts;
  const detail=kind==='exclusive'?`${event} · ${space}`:`${format} · ${courts}`;
  return {
    cliente:c.name||'Cliente',codigo:r.code||'',fecha:date,horario:`${r.startTime||''} - ${r.endTime||''}`.trim(),
    detalle,formato:format,canchas:courts,evento:event,espacio:space,total:money(r.total),pagado:money(r.advance),adelanto:money(r.advance),saldo:money(r.balance)
  };
}
function renderReservationMessageTemplate(template,r){
  const vars=reservationMessageVariables(r);
  return String(template||'').replace(/\{([a-z_]+)\}/gi,(full,key)=>Object.prototype.hasOwnProperty.call(vars,key.toLowerCase())?vars[key.toLowerCase()]:full);
}
function reservationShareText(r){
  ensureMessageTemplates();
  return renderReservationMessageTemplate(settings.messageTemplates.reservationConfirmation||defaultMessageTemplates().reservationConfirmation,r);
}
function roundedRect(ctx,x,y,w,h,r,fill){ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fillStyle=fill;ctx.fill()}
function canvasText(ctx,text,x,y,size,weight,color,align='left'){ctx.font=`${weight} ${size}px Arial`;ctx.fillStyle=color;ctx.textAlign=align;ctx.fillText(text,x,y)}
function drawReservationShareCard(r){
  const canvas=document.getElementById('reservationShareCanvas');if(!canvas)return;
  canvas.width=1080;canvas.height=1120;
  const ctx=canvas.getContext('2d');
  const c=clientById(r.clientId)||{name:'Cliente'};
  const kind=r.reservationKind||(r.space==='Local exclusivo'?'exclusive':'court');
  const dark='#14232f',green='#00ef5d',greenText='#00b94a',ink='#111827',muted='#7d8994',line='#e3e9ed',soft='#f4f7f8';
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle=soft;ctx.fillRect(0,0,canvas.width,canvas.height);

  // Tarjeta: ocupa casi todo el lienzo para verse grande en WhatsApp.
  roundedRect(ctx,24,24,1032,1072,42,'#ffffff');
  roundedRect(ctx,24,24,1032,236,42,dark);ctx.fillStyle=dark;ctx.fillRect(24,190,1032,70);

  // Logo real de Eleva Sport: usa exactamente el mismo recurso de la cabecera.
  const logo=document.querySelector('.brand-logo');
  if(logo&&logo.complete&&logo.naturalWidth){
    const maxW=305,maxH=96,scale=Math.min(maxW/logo.naturalWidth,maxH/logo.naturalHeight);
    const w=logo.naturalWidth*scale,h=logo.naturalHeight*scale;
    ctx.drawImage(logo,68,58,w,h);
  }else if(logo){
    const src=logo.src;const img=new Image();img.onload=()=>drawReservationShareCard(r);img.src=src;
  }

  canvasText(ctx,r.code,1000,92,31,'900','#ffffff','right');
  canvasText(ctx,r.status==='hold'?'PRE-RESERVA':'RESERVA CONFIRMADA',68,212,34,'900',r.status==='hold'?'#f3b61f':green);

  // Identidad del cliente y producto.
  let nameSize=62;ctx.font=`900 ${nameSize}px Arial`;
  while(ctx.measureText(c.name).width>930&&nameSize>44){nameSize-=2;ctx.font=`900 ${nameSize}px Arial`}
  canvasText(ctx,c.name,68,344,nameSize,'900',ink);
  canvasText(ctx,kind==='exclusive'?'EVENTO EXCLUSIVO':(r.courtType||'ALQUILER DE CANCHA'),68,397,27,'900',greenText);

  const date=new Date(r.eventDate+'T12:00:00').toLocaleDateString('es-PE',{weekday:'long',day:'numeric',month:'long',year:'numeric'}).replace(/^./,x=>x.toUpperCase());
  canvasText(ctx,'FECHA',68,474,18,'900',muted);
  let dateSize=41;ctx.font=`800 ${dateSize}px Arial`;
  while(ctx.measureText(date).width>940&&dateSize>32){dateSize-=1;ctx.font=`800 ${dateSize}px Arial`}
  canvasText(ctx,date,68,520,dateSize,'800',ink);

  // Horario y espacio en dos bloques grandes, legibles al enviar por chat.
  ctx.fillStyle=line;ctx.fillRect(68,563,944,1);
  canvasText(ctx,'HORARIO',68,617,18,'900',muted);
  canvasText(ctx,`${r.startTime} - ${r.endTime}`,68,670,48,'900',ink);
  const topRightLabel=kind==='exclusive'?'ESPACIO':'FORMATO';
  const topRightValue=kind==='exclusive'?String(r.space||'Local exclusivo'):String(r.courtType||'—');
  canvasText(ctx,topRightLabel,575,617,18,'900',muted);
  let topRightSize=40;ctx.font=`900 ${topRightSize}px Arial`;
  while(ctx.measureText(topRightValue).width>425&&topRightSize>28){topRightSize-=1;ctx.font=`900 ${topRightSize}px Arial`}
  canvasText(ctx,topRightValue,575,670,topRightSize,'900',ink);

  ctx.fillStyle=line;ctx.fillRect(68,714,944,1);
  canvasText(ctx,'DURACIÓN',68,766,18,'900',muted);
  const hrs=Number(r.hours||0);const duration=`${Number.isInteger(hrs)?hrs:hrs.toFixed(1)} h`;
  canvasText(ctx,duration,68,815,41,'900',ink);
  if(kind!=='exclusive'){
    canvasText(ctx,'CANCHAS',575,766,18,'900',muted);
    const courts=r.courtType==='FUT 9'?'Cancha 1 + 2 + 3':(reservationResources(r).join(' + ')||'—');
    let courtsSize=36;ctx.font=`900 ${courtsSize}px Arial`;
    while(ctx.measureText(courts).width>425&&courtsSize>25){courtsSize-=1;ctx.font=`900 ${courtsSize}px Arial`}
    canvasText(ctx,courts,575,815,courtsSize,'900',ink);
  }else{
    canvasText(ctx,'EVENTO',575,766,18,'900',muted);
    let ev=String(r.eventType||'Evento exclusivo'),evSize=38;ctx.font=`900 ${evSize}px Arial`;
    while(ctx.measureText(ev).width>425&&evSize>28){evSize-=1;ctx.font=`900 ${evSize}px Arial`}
    canvasText(ctx,ev,575,815,evSize,'900',ink);
  }

  // Finanzas más grandes y compactas.
  roundedRect(ctx,68,862,944,142,24,'#f3f7f8');
  canvasText(ctx,'TOTAL',108,908,17,'900',muted);canvasText(ctx,money(r.total),108,960,36,'900',ink);
  canvasText(ctx,'ADELANTO',407,908,17,'900',muted);canvasText(ctx,money(r.advance),407,960,36,'900',ink);
  canvasText(ctx,'SALDO',721,908,17,'900',muted);canvasText(ctx,money(r.balance),721,960,36,'900',ink);

  canvasText(ctx,'Eleva Sport · Carretera Industrial · Trujillo',68,1052,20,'700','#65727e');
  canvasText(ctx,'932 270 350',1012,1052,20,'800','#65727e','right');
}
function openShareReservation(id){shareReservationId=id;const r=reservationById(id);if(!r)return;drawReservationShareCard(r);openSheet('reservationShareSheet')}
function shareCanvasBlob(){return new Promise(resolve=>reservationShareCanvas.toBlob(resolve,'image/png',1))}
async function reservationImageFile(){
  const r=reservationById(shareReservationId);if(!r)return null;
  const blob=await shareCanvasBlob();if(!blob)return null;
  return {r,file:new File([blob],`Eleva Sport - ${r.code}.png`,{type:'image/png'}),blob};
}
async function shareReservationImage(){
  const pack=await reservationImageFile();if(!pack)return;
  const {r,file}=pack;const text=reservationShareText(r);
  if(navigator.share&&(!navigator.canShare||navigator.canShare({files:[file]}))){
    try{await navigator.share({files:[file],text,title:`Reserva ${r.code} - Eleva Sport`});return}
    catch(e){if(e&&e.name==='AbortError')return}
  }
  saveReservationImageFallback(pack);
}
async function downloadReservationImage(){
  const pack=await reservationImageFile();if(!pack)return;
  const {r,file}=pack;
  // En iPhone/iPad Chrome/Safari, Web Share entrega el PNG real al sistema.
  // Desde esa hoja se puede elegir "Guardar imagen" sin capturar la interfaz del navegador.
  if(navigator.share&&(!navigator.canShare||navigator.canShare({files:[file]}))){
    try{await navigator.share({files:[file],title:`Eleva Sport - ${r.code}`});return}
    catch(e){if(e&&e.name==='AbortError')return}
  }
  saveReservationImageFallback(pack);
}
function saveReservationImageFallback(pack){
  if(!pack||!pack.blob||!pack.r)return;
  const url=URL.createObjectURL(pack.blob);
  const a=document.createElement('a');
  a.href=url;a.download=`Eleva Sport - ${pack.r.code}.png`;a.rel='noopener';
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),4000);
  showToast('Se generó únicamente la imagen de la reserva');
}
function normalizeWhatsappPhone(phone){let p=String(phone||'').replace(/\D/g,'');if(p.length===9)p='51'+p;return p}
function openReservationWhatsApp(){
  const r=reservationById(shareReservationId);if(!r)return;const c=clientById(r.clientId)||{};const phone=normalizeWhatsappPhone(c.phone);const text=encodeURIComponent(reservationShareText(r));window.open(phone?`https://wa.me/${phone}?text=${text}`:`https://wa.me/?text=${text}`,'_blank')
}

function paymentDispositionLabel(value){
  const map={refund:'Reembolso',credit:'Saldo a favor',reprogram:'Reprogramación',retained:'Retenido / sin devolución',normal:'Pago aplicado al servicio'};
  return map[value]||value||'—'
}

function openReservationOutcome(){
  const r=reservationById(openReservationId);if(!r)return;
  const paid=Math.max(0,Number(r.advance||0));
  outcomePaidLabel.textContent=money(paid);
  outcomeStatus.value=['completed','cancelled','no_show','rescheduled'].includes(r.status)?r.status:'completed';
  outcomeReason.value=r.outcomeReason||((r.status==='no_show')?'no_show':'client');
  outcomeDisposition.value=r.paymentDisposition||((r.status==='rescheduled')?'reprogram':'retained');
  outcomeRefund.value=Number(r.refundedAmount||0);
  outcomeCredit.value=Number(r.creditAmount||0);
  outcomeRetained.value=Number(r.retainedAmount||0);
  outcomeNote.value=r.outcomeNote||'';
  updateOutcomeUI();
  closeSheet('reservationDetailSheet');openSheet('reservationOutcomeSheet')
}

function updateOutcomeUI(){
  const status=outcomeStatus.value;
  const financial=['cancelled','no_show'].includes(status);
  outcomeFinanceBlock.classList.toggle('hidden',status==='completed');
  if(status==='rescheduled'){
    outcomeFinanceBlock.classList.remove('hidden');
    outcomeDisposition.value='reprogram'
  }
  if(financial && outcomeDisposition.value==='reprogram')outcomeDisposition.value='retained';
  applyOutcomeDispositionDefaults(true)
}

function applyOutcomeDispositionDefaults(preserve=false){
  const status=outcomeStatus.value,disp=outcomeDisposition.value;
  const r=reservationById(openReservationId);if(!r)return;
  const paid=Math.max(0,Number(r.advance||0));
  outcomeReprogramNote.classList.toggle('hidden',disp!=='reprogram');
  outcomeAmountsBlock.classList.toggle('hidden',disp==='reprogram'||status==='completed');
  if(preserve)return recalcOutcomeAmounts();
  if(disp==='refund'){outcomeRefund.value=paid;outcomeCredit.value=0;outcomeRetained.value=0}
  else if(disp==='credit'){outcomeRefund.value=0;outcomeCredit.value=paid;outcomeRetained.value=0}
  else if(disp==='retained'){outcomeRefund.value=0;outcomeCredit.value=0;outcomeRetained.value=paid}
  else {outcomeRefund.value=0;outcomeCredit.value=0;outcomeRetained.value=0}
  recalcOutcomeAmounts()
}

function recalcOutcomeAmounts(source){
  const r=reservationById(openReservationId);if(!r)return;
  const paid=Math.max(0,Number(r.advance||0));
  let refund=Math.max(0,Number(outcomeRefund.value||0));
  let credit=Math.max(0,Number(outcomeCredit.value||0));
  let retained=Math.max(0,Number(outcomeRetained.value||0));
  if(refund>paid)refund=paid;
  if(credit>paid-refund)credit=Math.max(0,paid-refund);
  if(retained>paid-refund-credit)retained=Math.max(0,paid-refund-credit);
  const used=refund+credit+retained;
  if(used<paid && ['refund','credit','retained'].includes(outcomeDisposition.value)){
    retained=Math.max(0,paid-refund-credit)
  }
  outcomeRefund.value=refund.toFixed(0);outcomeCredit.value=credit.toFixed(0);outcomeRetained.value=retained.toFixed(0)
}

function saveReservationOutcome(){
  const r=reservationById(openReservationId);if(!r)return;
  const c=clientById(r.clientId);
  const previousCredit=Math.max(0,Number(r.creditAmount||0));
  const status=outcomeStatus.value;
  let disp=status==='completed'?'normal':outcomeDisposition.value;
  let refund=status==='completed'?0:Math.max(0,Number(outcomeRefund.value||0));
  let credit=status==='completed'?0:Math.max(0,Number(outcomeCredit.value||0));
  let retained=status==='completed'?0:Math.max(0,Number(outcomeRetained.value||0));
  const paid=Math.max(0,Number(r.advance||0));
  if(disp==='reprogram'){refund=0;credit=0;retained=0}
  if(refund+credit+retained>paid+0.001){showToast('Los movimientos superan lo pagado');return}

  if(c){c.creditBalance=Math.max(0,Number(c.creditBalance||0)-previousCredit+credit)}
  r.status=status;
  r.paymentDisposition=disp;
  r.refundedAmount=refund;r.creditAmount=credit;r.retainedAmount=retained;
  r.outcomeReason=outcomeReason.value;r.outcomeNote=outcomeNote.value.trim();r.outcomeAt=nowISO();
  if(status==='completed')r.completedAt=r.outcomeAt;
  if(status==='cancelled')r.cancelledAt=r.outcomeAt;
  if(status==='no_show')r.noShowAt=r.outcomeAt;
  if(status==='rescheduled')r.reprogrammedAt=r.outcomeAt;
  persist();closeSheet('reservationOutcomeSheet');renderReservations();renderCalendar();renderHome();renderReservationWorkspace();
  showToast('Estado y movimiento guardados');
  if(status==='rescheduled')editReservation(r.id);else go('reservations')
}

function confirmOpenReservation(){
  const r=reservationById(openReservationId);if(!r)return;
  r.status='confirmed';r.confirmedAt=nowISO();persist();
  closeSheet('reservationDetailSheet');renderReservations();renderCalendar();renderHome();renderReservationWorkspace();showToast('Reserva confirmada');go('reservations')
}
function cancelOpenReservation(){
  const r=reservationById(openReservationId);if(!r)return;
  outcomeStatus.value='cancelled';openReservationOutcome();outcomeStatus.value='cancelled';updateOutcomeUI()
}


function movementDateTime(date,time){
  const d=date||localDateValue(),t=time||localTimeValue();
  const x=new Date(`${d}T${t}:00`);return isNaN(x)?nowISO():x.toISOString()
}
function movementTypeLabel(type){const m={payment:'Cobro de reserva',other_income:'Otro ingreso',expense:'Gasto',cash_in:'Aporte a caja',cash_out:'Retiro de caja'};return m[type]||type}
function movementSign(type){return ['expense','cash_out'].includes(type)?-1:1}
function movementIsOperational(type){return ['payment','other_income','expense','refund'].includes(type)}
function movementReservationKind(m){const r=m.reservationId?reservationById(m.reservationId):null;return r?(r.reservationKind||(r.space==='Local exclusivo'?'exclusive':'court')):null}

function openPaymentSheet(preselectId=null,presetAmount=null){
  ensurePaymentMethods();const methods=activePaymentMethods();if(!methods.length){showToast('Activa al menos un método de pago en Masters');return}
  const eligible=reservations.filter(r=>!['cancelled','no_show'].includes(r.status)&&Number(r.balance||0)>0).sort((a,b)=>(a.eventDate+a.startTime).localeCompare(b.eventDate+b.startTime));
  paymentReservation.innerHTML=eligible.length?eligible.map(r=>{const c=clientById(r.clientId)||{name:'Cliente'};return `<option value="${r.id}">${escapeHtml(r.code)} · ${escapeHtml(c.name)} · saldo ${money(r.balance)}</option>`}).join(''):'<option value="">No hay reservas con saldo pendiente</option>';
  if(preselectId&&eligible.some(r=>String(r.id)===String(preselectId)))paymentReservation.value=String(preselectId);
  fillPaymentMethodSelect(paymentMethod);resetPendingAttachment('payment');paymentDate.value=localDateValue();paymentTime.value=localTimeValue();paymentNote.value='';syncPaymentReservation();
  if(presetAmount!==null&&presetAmount!==undefined&&paymentReservation.value){const max=Number(paymentAmount.max||0);paymentAmount.value=Math.max(0,Math.min(Number(presetAmount||0),max||Number(presetAmount||0)))}
  openSheet('paymentSheet')
}
function syncPaymentReservation(){
  const r=reservationById(paymentReservation.value);if(!r){paymentReservationInfo.innerHTML='No hay una reserva disponible para cobrar.';paymentAmount.value='';return}
  const c=clientById(r.clientId)||{name:'Cliente'};paymentAmount.value=Number(r.balance||0);paymentAmount.max=Number(r.balance||0);
  let plan='';
  if(r.singlePaymentPending)plan=`<br><b style="color:#087c34">Pago único:</b> paga ${money(r.singlePaymentTotal||r.balance)} en esta sola operación para aplicar el descuento. Si registras un monto menor, la reserva pasa automáticamente a pago en partes y conserva el precio regular.`;
  else if(r.quotePaymentPlan==='installments')plan=`<br><b>Pago en partes:</b> el descuento no aplica; cada cobro reduce el saldo regular.`;
  paymentReservationInfo.innerHTML=`<b>${escapeHtml(r.code)} · ${escapeHtml(c.name)}</b><br>Total ${money(r.total)} · Pagado ${money(r.advance)} · <b>Saldo ${money(r.balance)}</b><br>${fmtScheduled(r.eventDate,r.startTime)} · ${escapeHtml(r.space||r.courtType||'Reserva')}${plan}`
}
async function savePayment(){
  const r=reservationById(paymentReservation.value);if(!r){showToast('Selecciona una reserva');return}
  if(!paymentMethod.value){showToast('Selecciona un método de pago');return}
  const amount=Math.max(0,Number(paymentAmount.value||0));let balance=Math.max(0,Number(r.balance||0));if(!amount){showToast('Ingresa un monto');return}if(amount>balance+0.001){showToast('El cobro supera el saldo pendiente');return}
  let paymentMessage='Cobro registrado',nextTotal=Number(r.total||0),nextDiscount=Number(r.discountApplied||0),nextPlan=r.quotePaymentPlan,nextSinglePending=!!r.singlePaymentPending;
  const before=Number(r.advance||0);
  if(r.singlePaymentPending){
    const target=Number(r.singlePaymentTotal||r.total||0),regular=Number(r.regularTotal||r.total||0);
    if(before===0&&Math.abs(amount-target)<0.01){nextTotal=target;nextDiscount=Math.max(0,regular-target);nextSinglePending=false;nextPlan='single';paymentMessage='Pago único registrado · descuento aplicado'}
    else{nextTotal=regular;nextDiscount=0;nextSinglePending=false;nextPlan='installments';paymentMessage='Pago parcial registrado · descuento no aplicado'}
    balance=Math.max(0,nextTotal-before);if(amount>balance+0.001){showToast('El cobro supera el saldo aplicable');return}
  }
  let attachment=null;try{attachment=await persistPendingAttachment('payment')}catch(e){showToast(e&&e.message?e.message:'No se pudo guardar el comprobante');return}
  const stage=(before<=0&&amount>=balance-0.001)?'Pago completo':(before<=0?'Adelanto':(amount>=balance-0.001?'Saldo':'Pago parcial'));
  r.total=nextTotal;r.discountApplied=nextDiscount;r.singlePaymentPending=nextSinglePending;r.quotePaymentPlan=nextPlan;
  const m={id:Date.now()+Math.random(),code:nextMovementCode(),type:'payment',paymentStage:stage,reservationId:r.id,clientId:r.clientId,amount,method:paymentMethod.value,date:paymentDate.value||localDateValue(),time:paymentTime.value||localTimeValue(),detail:paymentNote.value.trim(),occurredAt:movementDateTime(paymentDate.value,paymentTime.value),createdAt:nowISO(),attachmentId:attachment&&attachment.id||null,attachmentName:attachment&&attachment.name||'',attachmentType:attachment&&attachment.type||''};
  movements.unshift(m);r.advance=Number(r.advance||0)+amount;r.balance=Math.max(0,Number(r.total||0)-Number(r.advance||0));r.lastPaymentAt=m.occurredAt;if(r.status==='hold'&&['single','installments'].includes(r.quotePaymentPlan)){r.status='confirmed';r.confirmedAt=r.confirmedAt||m.occurredAt}persist();resetPendingAttachment('payment');closeSheet('paymentSheet');renderReservations();renderQuotes();renderHome();renderReservationWorkspace();renderCash();showToast(paymentMessage)
}

function openMovementTypeSheet(){openSheet('movementTypeSheet')}
function movementCategories(type){
  if(type==='expense')return ['Personal','Mantenimiento','Limpieza','Servicios','Agua / luz','Compras tienda','Implementos deportivos','Marketing','Eventos','Reparaciones','Proveedores','Administración','Otros'];
  if(type==='other_income')return ['Tienda / bebidas','Estacionamiento','Parrilla','Alquiler adicional','Penalidad','Otros'];
  if(type==='cash_in')return ['Aporte a caja'];
  if(type==='cash_out')return ['Retiro de caja'];return ['Otros']
}
function openMovementForm(type){
  ensurePaymentMethods();const methods=activePaymentMethods();if(!methods.length){closeSheet('movementTypeSheet');showToast('Activa al menos un método de pago en Masters');return}
  movementFormType=type;closeSheet('movementTypeSheet');
  const cfg={expense:['Registrar gasto','Gasto','Pagado a','Registra un costo real de la operación. Sí afecta el resultado operativo.'],other_income:['Registrar otro ingreso','Otro ingreso','Recibido de','Úsalo solo para dinero que entra fuera de una reserva. Los cobros de reservas se registran con “Registrar cobro”.'],cash_in:['Aporte a caja','Movimiento de caja','Aportado por','No es una venta ni aumenta los ingresos del negocio; solo mueve efectivo hacia caja.'],cash_out:['Retiro de caja','Movimiento de caja','Retirado por / destino','No es un gasto por sí mismo; solo mueve efectivo fuera de caja.']};
  const c=cfg[type]||cfg.expense;movementFormTitle.textContent=c[0];movementFormSectionTitle.textContent=c[1];movementPartyLabel.textContent=c[2];movementFormHelp.textContent=c[3];
  movementCategory.innerHTML=movementCategories(type).map(x=>`<option>${escapeHtml(x)}</option>`).join('');movementAmount.value='';movementDate.value=localDateValue();movementTime.value=localTimeValue();movementParty.value='';movementDetail.value='';fillPaymentMethodSelect(movementMethod,(type==='cash_in'||type==='cash_out')?'Efectivo':'');resetPendingAttachment('movement');openSheet('movementFormSheet')
}
async function saveManualMovement(){
  const amount=Math.max(0,Number(movementAmount.value||0));if(!amount){showToast('Ingresa un monto');return}if(!movementMethod.value){showToast('Selecciona un método de pago');return}
  let attachment=null;try{attachment=await persistPendingAttachment('movement')}catch(e){showToast(e&&e.message?e.message:'No se pudo guardar el comprobante');return}
  const m={id:Date.now()+Math.random(),code:nextMovementCode(),type:movementFormType,category:movementCategory.value,amount,method:movementMethod.value,date:movementDate.value||localDateValue(),time:movementTime.value||localTimeValue(),party:movementParty.value.trim(),detail:movementDetail.value.trim(),occurredAt:movementDateTime(movementDate.value,movementTime.value),createdAt:nowISO(),attachmentId:attachment&&attachment.id||null,attachmentName:attachment&&attachment.name||'',attachmentType:attachment&&attachment.type||''};
  movements.unshift(m);persist();resetPendingAttachment('movement');closeSheet('movementFormSheet');renderCash();showToast(`${movementTypeLabel(m.type)} registrado`)
}

function buildCashRecords(){
  const out=[];
  movements.forEach(m=>out.push({...m,virtual:false,sign:movementSign(m.type)}));
  reservations.forEach(r=>{
    const explicit=movements.filter(m=>m.type==='payment'&&String(m.reservationId)===String(r.id)).reduce((s,m)=>s+Number(m.amount||0),0);
    const legacy=Math.max(0,Number(r.advance||0)-explicit);const c=clientById(r.clientId)||{name:'Cliente'};
    if(legacy>0)out.push({id:`legacy-${r.id}`,code:r.code,type:'payment_legacy',reservationId:r.id,clientId:r.clientId,amount:legacy,method:'No especificado',detail:'Pago registrado antes del módulo de caja',occurredAt:r.createdAt||nowISO(),sign:1,virtual:true,clientName:c.name});
    if(Number(r.refundedAmount||0)>0)out.push({id:`refund-${r.id}`,code:r.code,type:'refund',reservationId:r.id,clientId:r.clientId,amount:Number(r.refundedAmount||0),method:'No especificado',detail:r.outcomeNote||'Reembolso de reserva',occurredAt:r.outcomeAt||r.cancelledAt||r.createdAt||nowISO(),sign:-1,virtual:true,clientName:c.name})
  });
  return out.sort((a,b)=>String(b.occurredAt||b.createdAt||'').localeCompare(String(a.occurredAt||a.createdAt||'')))
}
function cashRecordLabel(m){if(m.type==='payment'||m.type==='payment_legacy')return m.paymentStage?`Cobro · ${m.paymentStage}`:'Cobro de reserva';if(m.type==='refund')return 'Reembolso';return movementTypeLabel(m.type)}
function cashRecordMeta(m){
  const r=m.reservationId?reservationById(m.reservationId):null,c=m.clientId?clientById(m.clientId):null;const parts=[];
  if(r)parts.push(r.code);if(c)parts.push(c.name);if(m.category)parts.push(m.category);if(m.method)parts.push(m.method);if(m.party)parts.push(m.party);if(m.detail)parts.push(m.detail);parts.push(fmtDateTime(m.occurredAt||m.createdAt));return parts.filter(Boolean).join(' · ')
}
function setCashFilter(filter,el){cashFilter=filter;document.querySelectorAll('#cashFilters .pill').forEach(b=>b.classList.toggle('active',b.dataset.cashFilter===filter));renderCash()}
function openCash(){cashFilter='all';document.querySelectorAll('#cashFilters .pill').forEach(b=>b.classList.toggle('active',b.dataset.cashFilter==='all'));renderCash();openSheet('cashSheet')}
function renderCash(){
  const host=document.getElementById('cashMovementList'),sum=document.getElementById('cashSummary');if(!host||!sum)return;const all=buildCashRecords();
  const operationalIn=all.filter(m=>['payment','payment_legacy','other_income'].includes(m.type)).reduce((s,m)=>s+Number(m.amount||0),0);
  const operationalOut=all.filter(m=>['expense','refund'].includes(m.type)).reduce((s,m)=>s+Number(m.amount||0),0);
  const cashMoves=all.filter(m=>['cash_in','cash_out'].includes(m.type)).reduce((s,m)=>s+Number(m.amount||0)*(m.type==='cash_out'?-1:1),0);
  sum.innerHTML=`<div class="cash-summary"><span>Ingresos operativos</span><b>${money(operationalIn)}</b><small>Cobros + otros ingresos</small></div><div class="cash-summary"><span>Salidas operativas</span><b>${money(operationalOut)}</b><small>Gastos + reembolsos</small></div><div class="cash-summary"><span>Neto operativo</span><b>${money(operationalIn-operationalOut)}</b><small>Sin aportes/retiros</small></div><div class="cash-summary"><span>Movimientos de caja</span><b>${money(cashMoves)}</b><small>Aportes − retiros</small></div>`;
  let rows=all;if(cashFilter==='income')rows=rows.filter(m=>['payment','payment_legacy','other_income'].includes(m.type));if(cashFilter==='expense')rows=rows.filter(m=>['expense','refund'].includes(m.type));if(cashFilter==='cash')rows=rows.filter(m=>['cash_in','cash_out'].includes(m.type));
  host.innerHTML=rows.length?rows.map(m=>{const positive=['payment','payment_legacy','other_income','cash_in'].includes(m.type),neutral=['cash_in','cash_out'].includes(m.type),proof=m.attachmentId&&!m.virtual?`<div class="cash-movement-proof"><button class="cash-proof-btn" onclick="openMovementAttachment('${String(m.id)}')">Ver comprobante</button></div>`:'';return `<div class="cash-movement"><div class="cash-movement-main"><div class="cash-movement-title">${escapeHtml(cashRecordLabel(m))}</div><div class="cash-movement-meta">${escapeHtml(cashRecordMeta(m))}</div>${proof}</div><div class="cash-movement-value ${neutral?'neutral':(positive?'in':'out')}">${positive?'+':'−'} ${money(m.amount)}</div></div>`}).join(''):'<div class="card empty">No hay movimientos en este filtro.</div>'
}

function operatingConfigForDate(ds){ensureOperatingSchedule();const day=parseDashDate(ds).getDay();return settings.schedule[day]||defaultOperatingSchedule()[day]}
function operatingBoundsForDate(ds){const c=operatingConfigForDate(ds);if(!c.active)return null;let a=timeToMinutes(c.open||'08:00'),b=timeToMinutes(c.close||'00:00');if(b<=a)b+=1440;return {open:a,close:b,hours:Math.max(0,(b-a)/60)}}
function availableHoursInRange(range){let h=0;for(let d=parseDashDate(range.start),e=parseDashDate(range.end);d<=e;d=dashAddDays(d,1)){const b=operatingBoundsForDate(dashDateValue(d));if(b)h+=b.hours}return h}
function operationalBucketOccurrences(range){const map={};for(let d=parseDashDate(range.start),e=parseDashDate(range.end);d<=e;d=dashAddDays(d,1)){const ds=dashDateValue(d),b=operatingBoundsForDate(ds);if(!b)continue;for(let h=Math.floor(b.open/60);h<Math.ceil(b.close/60);h++){const a=h*60,z=(h+1)*60;if(Math.min(z,b.close)>Math.max(a,b.open)){const key=`${d.getDay()}-${h%24}`;map[key]=(map[key]||0)+1}}}return map}

function openSchedule(){ensureOperatingSchedule();const days=[['Domingo',0],['Lunes',1],['Martes',2],['Miércoles',3],['Jueves',4],['Viernes',5],['Sábado',6]];scheduleEditor.innerHTML=days.map(([name,i])=>{const c=settings.schedule[i];return `<div class="schedule-row"><label class="schedule-day"><input id="schedActive${i}" type="checkbox" ${c.active?'checked':''}>${name}</label><div class="schedule-time"><label>Abre</label><input id="schedOpen${i}" type="time" value="${escapeHtml(c.open)}"></div><div class="schedule-time"><label>Cierra</label><input id="schedClose${i}" type="time" value="${escapeHtml(c.close)}"></div></div>`}).join('');openSheet('scheduleSheet')}
function updateScheduleMasterBadge(){const e=document.getElementById('scheduleMasterBadge');if(!e)return;ensureOperatingSchedule();const vals=Object.values(settings.schedule).filter(x=>x.active).map(x=>`${x.open}-${x.close}`);e.textContent=(new Set(vals).size===1&&vals.length)?vals[0]:'Por día'}
function saveSchedule(){ensureOperatingSchedule();for(let i=0;i<7;i++){settings.schedule[i]={active:document.getElementById(`schedActive${i}`).checked,open:document.getElementById(`schedOpen${i}`).value||'08:00',close:document.getElementById(`schedClose${i}`).value||'00:00'}}persist();updateScheduleMasterBadge();updatePaymentMethodsMasterBadge();closeSheet('scheduleSheet');renderHome();showToast('Horario operativo guardado')}

function openTariffs(){
  tFut6.value=settings.fut6;tFut9.value=settings.fut9;tExclusive.value=settings.exclusive;tGuarantee.value=settings.guarantee;tExtraHour.value=settings.extraHour;tDiscount.value=settings.discount;tConditions.value=settings.conditions||'';openSheet('tariffSheet')
}
function saveTariffs(){
  settings={...settings,fut6:Number(tFut6.value||0),fut9:Number(tFut9.value||0),exclusive:Number(tExclusive.value||0),guarantee:Number(tGuarantee.value||0),extraHour:Number(tExtraHour.value||0),discount:Number(tDiscount.value||0),conditions:tConditions.value.trim()};ensureOperatingSchedule();persist();closeSheet('tariffSheet');showToast('Tarifas y condiciones guardadas')
}

function openCalendar(){
  if(!document.getElementById('view-reservations')?.classList.contains('active'))go('reservations');
  
  calendarSelectedDate=calendarSelectedDate||localDateValue();
  const [y,m,d]=calendarSelectedDate.split('-').map(Number);calendarCursor=new Date(y,m-1,d);
  setCalendarView('day');renderCalendar();openSheet('calendarSheet')
}
function openCalendarForDate(dateStr){
  go('reservations');calendarSelectedDate=dateStr;
  const [y,m,d]=dateStr.split('-').map(Number);calendarCursor=new Date(y,m-1,d);
  
  setCalendarView('day');renderCalendar();openSheet('calendarSheet')
}
function closeCalendarView(){reservationDatePickerMode=false;closeSheet('calendarSheet');renderReservationWorkspace()}
function setCalendarView(view){
  calendarView=view;
  calTabDay?.classList.toggle('active',view==='day');calTabMonth?.classList.toggle('active',view==='month');
  calendarDayPanel?.classList.toggle('hidden',view!=='day');calendarMonthPanel?.classList.toggle('hidden',view!=='month');
  if(view==='month'){
    const [y,m]=calendarSelectedDate.split('-').map(Number);calendarCursor=new Date(y,m-1,1)
  }
  renderCalendar()
}
function moveCalendarDay(delta){
  const [y,m,d]=calendarSelectedDate.split('-').map(Number);
  const x=new Date(y,m-1,d+delta);calendarSelectedDate=localDateValue(x);calendarCursor=x;renderCalendar()
}
function goCalendarToday(){calendarSelectedDate=localDateValue();calendarCursor=new Date();setCalendarView('day')}
function moveCalendarMonth(delta){
  calendarCursor=new Date(calendarCursor.getFullYear(),calendarCursor.getMonth()+delta,1);
  renderCalendarMonth()
}
function renderCalendar(){
  if(calendarView==='month')renderCalendarMonth();else renderCalendarDayScheduler()
}
function renderDateStrip(){
  const host=document.getElementById('calendarDateStrip');if(!host)return;
  const [y,m,d]=calendarSelectedDate.split('-').map(Number);const base=new Date(y,m-1,d);
  const days=[];
  for(let i=-2;i<=2;i++){
    const x=new Date(base);x.setDate(base.getDate()+i);const ds=localDateValue(x);
    days.push(`<button class="date-chip ${ds===calendarSelectedDate?'active':''}" onclick="selectCalendarDate('${ds}')"><span>${x.toLocaleDateString('es-PE',{weekday:'short'}).replace('.','')}</span><b>${x.getDate()}</b><small>${x.toLocaleDateString('es-PE',{month:'short'}).replace('.','')}</small></button>`)
  }
  host.innerHTML=days.join('')
}
function selectCalendarDate(ds){
  if(reservationDatePickerMode){
    reservationFocusDate=ds;
    reservationDatePickerMode=false;
    closeSheet('calendarSheet');
    renderReservationWorkspace();
    return
  }
  calendarSelectedDate=ds;const [y,m,d]=ds.split('-').map(Number);calendarCursor=new Date(y,m-1,d);calendarView='day';
  calTabDay?.classList.add('active');calTabMonth?.classList.remove('active');calendarDayPanel?.classList.remove('hidden');calendarMonthPanel?.classList.add('hidden');
  renderCalendarDayScheduler()
}
function reservationForResourceAt(resource,date,start,end){
  return reservations.find(r=>!['cancelled','no_show'].includes(r.status)&&r.eventDate===date&&intervalsOverlap(start,end,r.startTime,r.endTime)&&reservationResources(r).includes(resource))||null
}
function renderCalendarDayScheduler(){
  const host=document.getElementById('dayScheduler');if(!host)return;
  renderDateStrip();
  const [y,m,d]=calendarSelectedDate.split('-').map(Number);const dt=new Date(y,m-1,d);
  calendarDayLabel.textContent=dt.toLocaleDateString('es-PE',{weekday:'long',day:'numeric',month:'long'}).replace(/^./,x=>x.toUpperCase());
  const dayReservations=reservations.filter(r=>r.status!=='cancelled'&&r.eventDate===calendarSelectedDate);
  calendarDaySummary.textContent=`${dayReservations.length} reserva${dayReservations.length===1?'':'s'} · 3 canchas`;
  let out='<div class="sch-head time">Hora</div><div class="sch-head">Cancha 1</div><div class="sch-head">Cancha 2</div><div class="sch-head">Cancha 3</div>';
  const resources=['Cancha 1','Cancha 2','Cancha 3'];
  for(let mins=6*60;mins<23*60;mins+=30){
    const start=`${String(Math.floor(mins/60)).padStart(2,'0')}:${String(mins%60).padStart(2,'0')}`;
    const end=addMinutesToTime(start,30);
    out+=`<div class="sch-time">${start}</div>`;
    resources.forEach(resource=>{
      const r=reservationForResourceAt(resource,calendarSelectedDate,start,end);
      if(!r){
        out+=`<div class="sch-cell free" onclick="quickReserveSlot('${resource}','${start}')"><div class="sch-slot free-ui">Disponible</div></div>`;
      }else{
        const c=clientById(r.clientId)||{name:'Cliente'};
        const kind=r.reservationKind||(r.space==='Local exclusivo'?'exclusive':'court');
        const isHold=r.status==='hold';
        const cls=isHold?'hold':(kind==='exclusive'?'exclusive':(r.courtType==='FUT 9'?'fut9':'reserved'));
        const label=isHold?'Pre-reserva':(kind==='exclusive'?'Exclusivo':(r.courtType==='FUT 9'?'FUT 9':'FUT 6'));
        const isStart=timeToMinutes(start)===timeToMinutes(r.startTime);
        out+=`<div class="sch-cell" onclick="openReservationDetail('${r.id}')"><div class="sch-slot ${cls}"><b>${label}${isStart?' · '+escapeHtml(c.name):''}</b><span>${isStart?escapeHtml(r.startTime)+'-'+escapeHtml(r.endTime):'Ocupado'}</span></div></div>`;
      }
    })
  }
  host.innerHTML=out
}
function quickReserveSlot(resource,time){
  editingReservationId=null;if(document.getElementById('reservationSaveBtn'))reservationSaveBtn.textContent='Crear reserva';
  calendarQuickSlot={date:calendarSelectedDate,court:resource,time};
  reservationKind='court';prepareReservationForm('court');openSheet('reservationSheet')
}
function renderCalendarMonth(){
  if(!document.getElementById('calendarGrid'))return;
  const y=calendarCursor.getFullYear(),m=calendarCursor.getMonth();
  calendarMonthLabel.textContent=new Date(y,m,1).toLocaleDateString('es-PE',{month:'long',year:'numeric'}).replace(/^./,x=>x.toUpperCase());
  const heads=['L','M','M','J','V','S','D'].map(x=>`<div class="cal-head">${x}</div>`).join('');
  const first=new Date(y,m,1),last=new Date(y,m+1,0);let start=(first.getDay()+6)%7,cells='';const prevLast=new Date(y,m,0).getDate();
  for(let i=0;i<42;i++){
    let day,cy=y,cm=m,muted=false;
    if(i<start){day=prevLast-start+i+1;cm=m-1;muted=true;if(cm<0){cm=11;cy--}}
    else if(i>=start+last.getDate()){day=i-(start+last.getDate())+1;cm=m+1;muted=true;if(cm>11){cm=0;cy++}}
    else day=i-start+1;
    const ds=`${cy}-${String(cm+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const count=reservations.filter(r=>r.eventDate===ds&&r.status!=='cancelled').length;
    const isToday=ds===localDateValue(),sel=ds===calendarSelectedDate;
    cells+=`<button class="cal-day ${muted?'muted':''} ${isToday?'today':''} ${sel?'selected':''}" onclick="selectCalendarDate('${ds}')"><span class="cal-num">${day}</span>${count?`<span class="event-count">${count}</span><span class="event-dot"></span>`:''}</button>`
  }
  calendarGrid.innerHTML=heads+cells
}




function openMasters(){openSheet('mastersSheet')}
function openMasterDetail(type){
  ensureQuoteSettings();
  if(type==='packages'){
    const p=settings.exclusivePackage,s=packageGroup(p,'sports','Zona deportiva'),o=packageGroup(p,'other','Otras zonas'),v=packageGroup(p,'services','Servicios del establecimiento');
    masterDetailTitle.textContent='Paquete · Local exclusivo';
    masterDetailBody.innerHTML=`<div class="info">Esta configuración se usa como base para futuras cotizaciones. Las cotizaciones ya generadas conservan su propia copia.</div><div class="form-card"><h3>Presentación</h3><div class="field"><label>Nombre del paquete</label><input id="mPkgName" value="${escapeHtml(p.name||'')}"></div><div class="field"><label>Descripción</label><input id="mPkgDescription" value="${escapeHtml(p.description||'')}"></div></div><div class="form-card"><h3>Zona deportiva</h3><div class="field"><label>Un elemento por línea</label><textarea id="mPkgSports" rows="6">${escapeHtml((s.items||[]).join('\n'))}</textarea></div></div><div class="form-card"><h3>Otras zonas</h3><div class="field"><label>Un elemento por línea</label><textarea id="mPkgOther" rows="6">${escapeHtml((o.items||[]).join('\n'))}</textarea></div></div><div class="form-card"><h3>Servicios del establecimiento</h3><div class="field"><label>Un elemento por línea</label><textarea id="mPkgServices" rows="5">${escapeHtml((v.items||[]).join('\n'))}</textarea></div></div><button class="primary" onclick="saveMasterPackage()">Guardar paquete</button>`;
    openSheet('masterDetailSheet');return
  }
  if(type==='payments'){
    ensurePaymentMethods();paymentMethodsDraft=cloneData(settings.paymentMethods);masterDetailTitle.textContent='Métodos de pago';masterDetailBody.innerHTML=`<div class="info">Estos métodos aparecen al registrar cobros y movimientos. Los movimientos históricos conservan el método que se usó en ese momento.</div><div class="form-card"><h3>Métodos disponibles</h3><div id="paymentMethodsEditor" class="payment-method-editor"></div><div class="payment-method-actions"><button class="ghost" onclick="addPaymentMethodDraft()">＋ Nuevo método</button></div></div><button class="primary" onclick="savePaymentMethodsMaster()">Guardar métodos</button>`;renderPaymentMethodsEditor();openSheet('masterDetailSheet');return
  }
  if(type==='messages'){
    ensureMessageTemplates();
    const template=settings.messageTemplates.reservationConfirmation||defaultMessageTemplates().reservationConfirmation;
    masterDetailTitle.textContent='Plantillas de mensajes';
    masterDetailBody.innerHTML=`<div class="info">Edita el texto que se abre en WhatsApp al compartir una reserva. Las variables entre llaves se reemplazan automáticamente con los datos reales.</div><div class="form-card"><h3>Confirmación de reserva</h3><div class="field"><label>Mensaje de WhatsApp</label><textarea id="mReservationConfirmTemplate" rows="13" oninput="renderReservationTemplatePreview()">${escapeHtml(template)}</textarea></div><div class="mutedline">Variables disponibles</div><div style="display:flex;flex-wrap:wrap;gap:7px;margin-top:9px">${['{cliente}','{codigo}','{fecha}','{horario}','{detalle}','{formato}','{canchas}','{evento}','{espacio}','{total}','{pagado}','{saldo}'].map(v=>`<button type="button" class="btn" onclick="insertReservationTemplateVariable('${v}')">${v}</button>`).join('')}</div></div><div class="form-card"><h3>Vista previa</h3><div id="mReservationTemplatePreview" class="info" style="white-space:pre-wrap"></div></div><div class="grid2"><button class="secondary" onclick="resetReservationMessageTemplate()">Restaurar predeterminado</button><button class="primary" onclick="saveReservationMessageTemplate()">Guardar plantilla</button></div>`;
    renderReservationTemplatePreview();openSheet('masterDetailSheet');return
  }
  if(type==='paymentData'){
    const p=settings.paymentInfo;
    masterDetailTitle.textContent='Datos para el pago';
    masterDetailBody.innerHTML=`<div class="info">Estos datos se muestran en las nuevas cotizaciones y en su PDF.</div><div class="form-card"><h3>Banco</h3><div class="grid2"><div class="field"><label>Banco</label><input id="mPayBank" value="${escapeHtml(p.bank||'')}"></div><div class="field"><label>Cuenta</label><input id="mPayAccount" value="${escapeHtml(p.account||'')}"></div></div><div class="field"><label>CCI</label><input id="mPayCci" value="${escapeHtml(p.cci||'')}"></div></div><div class="form-card"><h3>Yape y confirmación</h3><div class="grid2"><div class="field"><label>Yape</label><input id="mPayYape" value="${escapeHtml(p.yape||'')}"></div><div class="field"><label>WhatsApp</label><input id="mPayWhatsapp" value="${escapeHtml(p.whatsapp||'')}"></div></div><div class="field"><label>Titular</label><input id="mPayHolder" value="${escapeHtml(p.holder||'')}"></div><div class="field"><label>Reglamento interno</label><input id="mRulesUrl" value="${escapeHtml(p.rulesUrl||'')}"></div><div class="mutedline">Si cambias el enlace oficial, el PDF seguirá mostrando el enlace clickeable. El QR se muestra únicamente para el Linktree oficial actual.</div></div><button class="primary" onclick="saveMasterPaymentData()">Guardar datos</button>`;
    openSheet('masterDetailSheet');return
  }
  const configs={
    spaces:{title:'Espacios / Canchas',rows:[['Cancha 1','FUT 6 · Activa'],['Cancha 2','FUT 6 · Activa'],['Cancha 3','FUT 6 · Activa'],['FUT 9','Combina Cancha 1 + 2 + 3']]},
    formats:{title:'Formatos',rows:[['FUT 6','Ocupa 1 cancha física'],['FUT 9','Ocupa Cancha 1 + 2 + 3'],['Intervalo operativo','30 minutos'],['Duraciones cancha','1 h · 1 h 30 · 2 h · 2 h 30 · 3 h']]},
    events:{title:'Tipos de evento',rows:[['Campeonato','Activo'],['Cumpleaños','Activo'],['Integración','Activo'],['Reunión familiar','Activo'],['Evento deportivo','Activo'],['Otro','Activo']]},
    states:{title:'Estados',rows:[['Pre-reserva','Bloquea disponibilidad'],['Confirmada','Bloquea disponibilidad'],['Realizada','Histórico'],['Cancelada','Libera disponibilidad'],['No asistió','Histórico / libera disponibilidad'],['Reprogramada','Reserva movida a nueva fecha u horario']]},
    users:{title:'Usuarios / Vendedores',rows:[['EV','Administrador · Activo'],['Roles','Administrador / Vendedor / Operaciones']]},
    conditions:{title:'Condiciones',rows:[['Reserva','Texto base configurable'],['Cancelación','Texto base configurable'],['Garantía','Texto base configurable'],['Eventos exclusivos','Texto base configurable']]}
  };
  const c=configs[type];if(!c)return;masterDetailTitle.textContent=c.title;masterDetailBody.innerHTML=c.rows.map(r=>`<div class="card"><div class="detail-row"><span>${escapeHtml(r[0])}</span><b>${escapeHtml(r[1])}</b></div></div>`).join('');openSheet('masterDetailSheet')
}
function collectPaymentMethodsDraftFromDom(){
  const rows=[...document.querySelectorAll('#paymentMethodsEditor .payment-method-row')];rows.forEach(row=>{const i=Number(row.dataset.index),item=paymentMethodsDraft[i];if(!item)return;const name=row.querySelector('[data-pm-name]'),active=row.querySelector('[data-pm-active]');item.name=(name&&name.value||'').trim();item.active=!!(active&&active.checked)})
}
function renderPaymentMethodsEditor(){
  const host=document.getElementById('paymentMethodsEditor');if(!host)return;host.innerHTML=paymentMethodsDraft.map((m,i)=>`<div class="payment-method-row" data-index="${i}"><input data-pm-name type="text" value="${escapeHtml(m.name||'')}" placeholder="Ej. Yape"><label class="payment-method-active"><input data-pm-active type="checkbox" ${m.active!==false?'checked':''}>Activo</label><button class="payment-method-remove" onclick="removePaymentMethodDraft(${i})">Quitar</button></div>`).join('')||'<div class="empty">No hay métodos configurados.</div>'
}
function addPaymentMethodDraft(){collectPaymentMethodsDraftFromDom();paymentMethodsDraft.push({id:`pm_${Date.now()}_${paymentMethodsDraft.length+1}`,name:'',active:true});renderPaymentMethodsEditor();const inputs=document.querySelectorAll('#paymentMethodsEditor [data-pm-name]');if(inputs.length)inputs[inputs.length-1].focus()}
function removePaymentMethodDraft(index){collectPaymentMethodsDraftFromDom();const item=paymentMethodsDraft[index];if(!item)return;const used=item.name&&movements.some(m=>String(m.method||'')===item.name);if(used){item.active=false;renderPaymentMethodsEditor();showToast('Ya fue usado: se desactivó para conservar el historial');return}paymentMethodsDraft.splice(index,1);renderPaymentMethodsEditor()}
function savePaymentMethodsMaster(){
  collectPaymentMethodsDraftFromDom();const cleaned=paymentMethodsDraft.map((m,i)=>({id:String(m.id||`pm_${Date.now()}_${i}`),name:String(m.name||'').trim(),active:m.active!==false})).filter(m=>m.name);const names=new Set();for(const m of cleaned){const key=m.name.toLocaleLowerCase('es-PE');if(names.has(key)){showToast('No repitas nombres de métodos');return}names.add(key)}if(!cleaned.some(m=>m.active)){showToast('Deja al menos un método activo');return}settings.paymentMethods=cleaned;persist();updatePaymentMethodsMasterBadge();closeSheet('masterDetailSheet');showToast('Métodos de pago actualizados')
}

function reservationTemplatePreviewRecord(){
  if(reservations.length){
    return [...reservations].sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')))[0];
  }
  return {id:'preview',code:'RS-0001',clientId:null,reservationKind:'court',courtType:'FUT 6',physicalCourts:['Cancha 1'],eventDate:localDateValue(),startTime:'20:00',endTime:'21:00',total:50,advance:30,balance:20,status:'confirmed'};
}
function renderReservationTemplatePreview(){
  const box=document.getElementById('mReservationTemplatePreview'),field=document.getElementById('mReservationConfirmTemplate');if(!box||!field)return;
  const r=reservationTemplatePreviewRecord();box.textContent=renderReservationMessageTemplate(field.value,r);
}
function insertReservationTemplateVariable(token){
  const field=document.getElementById('mReservationConfirmTemplate');if(!field)return;
  const start=Number.isFinite(field.selectionStart)?field.selectionStart:field.value.length,end=Number.isFinite(field.selectionEnd)?field.selectionEnd:start;
  field.value=field.value.slice(0,start)+token+field.value.slice(end);field.focus();const pos=start+token.length;field.setSelectionRange(pos,pos);renderReservationTemplatePreview();
}
function resetReservationMessageTemplate(){
  const field=document.getElementById('mReservationConfirmTemplate');if(!field)return;field.value=defaultMessageTemplates().reservationConfirmation;renderReservationTemplatePreview();showToast('Texto predeterminado restaurado en el editor');
}
function saveReservationMessageTemplate(){
  const field=document.getElementById('mReservationConfirmTemplate');if(!field)return;const value=field.value.trim();if(!value){showToast('El mensaje no puede quedar vacío');return}
  ensureMessageTemplates();settings.messageTemplates.reservationConfirmation=value;persist();closeSheet('masterDetailSheet');showToast('Plantilla de WhatsApp actualizada');
}

function saveMasterPackage(){
  settings.exclusivePackage={name:(mPkgName.value||'').trim()||'Alquiler exclusivo',description:(mPkgDescription.value||'').trim(),groups:[{key:'sports',title:'Zona deportiva',items:normalizePackageItems(mPkgSports.value)},{key:'other',title:'Otras zonas',items:normalizePackageItems(mPkgOther.value)},{key:'services',title:'Servicios del establecimiento',items:normalizePackageItems(mPkgServices.value)}]};persist();closeSheet('masterDetailSheet');showToast('Paquete actualizado para futuras cotizaciones')
}
function saveMasterPaymentData(){
  settings.paymentInfo={bank:(mPayBank.value||'').trim(),account:(mPayAccount.value||'').trim(),cci:(mPayCci.value||'').trim(),yape:(mPayYape.value||'').trim(),holder:(mPayHolder.value||'').trim(),whatsapp:(mPayWhatsapp.value||'').trim(),rulesUrl:(mRulesUrl.value||'').trim()||'https://linktr.ee/elevasportperu'};persist();closeSheet('masterDetailSheet');showToast('Datos de pago actualizados')
}

let historyFilter='all';
function openHistory(){historyFilter='all';document.querySelectorAll('[data-history-filter]').forEach(x=>x.classList.toggle('active',x.dataset.historyFilter==='all'));renderHistory();openSheet('historySheet')}
function setHistoryFilter(filter,el){historyFilter=filter;document.querySelectorAll('[data-history-filter]').forEach(x=>x.classList.remove('active'));if(el)el.classList.add('active');renderHistory()}
function buildHistoryRecords(){
  const rows=[];
  clients.forEach(c=>rows.push({type:'clients',at:c.createdAt,title:'Cliente creado',meta:c.name,icon:'C'}));
  quotes.forEach(q=>{const c=clientById(q.clientId)||{name:'Cliente'};rows.push({type:'quotes',at:q.createdAt,title:`Cotización ${q.code} creada`,meta:`${c.name} · ${money(q.regularTotal??q.total)}`,icon:'Q'});if(q.reservedAt)rows.push({type:'quotes',at:q.reservedAt,title:`Cotización ${q.code} convertida en reserva`,meta:c.name,icon:'Q'})});
  followups.forEach(f=>{const c=clientById(f.clientId)||{name:'Cliente'};rows.push({type:'followups',at:f.createdAt,title:'Seguimiento creado',meta:`${c.name} · ${f.note}`,icon:'S'});if(f.completedAt)rows.push({type:'followups',at:f.completedAt,title:'Seguimiento realizado',meta:`${c.name} · ${f.note}`,icon:'S'})});
  reservations.forEach(r=>{const c=clientById(r.clientId)||{name:'Cliente'};rows.push({type:'reservations',at:r.createdAt,title:`${r.status==='hold'?'Pre-reserva':'Reserva'} ${r.code} creada`,meta:`${c.name} · ${r.space} · ${r.startTime}-${r.endTime}`,icon:'R'});if(r.status==='hold')rows.push({type:'blocks',at:r.createdAt,title:`Bloqueo por pre-reserva ${r.code}`,meta:`${c.name} · ${r.space} · ${r.startTime}-${r.endTime}`,icon:'B'});if(r.confirmedAt)rows.push({type:'reservations',at:r.confirmedAt,title:`Reserva ${r.code} confirmada`,meta:c.name,icon:'R'});if(r.completedAt)rows.push({type:'reservations',at:r.completedAt,title:`Reserva ${r.code} realizada`,meta:c.name,icon:'R'});if(r.cancelledAt)rows.push({type:'reservations',at:r.cancelledAt,title:`Reserva ${r.code} cancelada`,meta:c.name,icon:'R'});if(r.noShowAt)rows.push({type:'reservations',at:r.noShowAt,title:`Reserva ${r.code} - no asistió`,meta:c.name,icon:'R'});if(r.reprogrammedAt)rows.push({type:'reservations',at:r.reprogrammedAt,title:`Reserva ${r.code} reprogramada`,meta:c.name,icon:'R'});const explicitPayments=movements.filter(m=>m.type==='payment'&&String(m.reservationId)===String(r.id)).reduce((s,m)=>s+Number(m.amount||0),0),legacyAdvance=Math.max(0,Number(r.advance||0)-explicitPayments);if(legacyAdvance>0)rows.push({type:'payments',at:r.createdAt,title:'Adelanto registrado',meta:`${r.code} · ${c.name} · ${money(legacyAdvance)}`,icon:'P'});if(Number(r.refundedAmount||0)>0)rows.push({type:'payments',at:r.outcomeAt,title:'Reembolso registrado',meta:`${r.code} · ${c.name} · ${money(r.refundedAmount)}`,icon:'P'});if(Number(r.creditAmount||0)>0)rows.push({type:'payments',at:r.outcomeAt,title:'Saldo a favor generado',meta:`${r.code} · ${c.name} · ${money(r.creditAmount)}`,icon:'P'});if(Number(r.retainedAmount||0)>0)rows.push({type:'payments',at:r.outcomeAt,title:'Pago retenido',meta:`${r.code} · ${c.name} · ${money(r.retainedAmount)}`,icon:'P'})});
  movements.forEach(m=>{const r=m.reservationId?reservationById(m.reservationId):null;rows.push({type:'payments',at:m.occurredAt||m.createdAt,title:m.type==='payment'&&m.paymentStage?`Cobro · ${m.paymentStage}`:movementTypeLabel(m.type),meta:`${m.code||''}${r?' · '+r.code:''} · ${money(m.amount)}${m.category?' · '+m.category:''}${m.method?' · '+m.method:''}${m.attachmentId?' · Con comprobante':''}`,icon:'P'})});
  return rows.filter(x=>x.at).sort((a,b)=>new Date(b.at)-new Date(a.at))
}
function renderHistory(){let rows=buildHistoryRecords();if(historyFilter!=='all')rows=rows.filter(x=>x.type===historyFilter);historyList.innerHTML=rows.length?rows.map(x=>`<div class="card history-item"><div class="history-icon">${x.icon}</div><div class="history-main"><div class="history-title">${escapeHtml(x.title)}</div><div class="history-meta">${escapeHtml(x.meta)}<br>${fmtDateTime(x.at)} · Usuario EV</div></div></div>`).join(''):'<div class="empty">No hay movimientos en este concepto.</div>'}

let openClientProfileId=null;
let clientProfilePeriod='all';
let clientProfileCustomStart='';
let clientProfileCustomEnd='';
let clientRelation='reservations';

function openClients(){renderDirectory();openSheet('clientsSheet')}
function clientReservations(id){return reservations.filter(r=>String(r.clientId)===String(id))}
function clientUpcomingReservations(id){const today=localDateValue();return clientReservations(id).filter(r=>r.eventDate>=today&&!['completed','cancelled','no_show'].includes(r.status))}
function renderDirectory(){
  clientDirectory.innerHTML=clients.length?clients.map(c=>{
    const specials=[];if(c.specialFut6!==null&&c.specialFut6!==undefined&&c.specialFut6!=='')specials.push(`FUT 6 ${money(c.specialFut6)}`);if(c.specialFut9!==null&&c.specialFut9!==undefined&&c.specialFut9!=='')specials.push(`FUT 9 ${money(c.specialFut9)}`);
    const rs=clientReservations(c.id),up=clientUpcomingReservations(c.id);
    return `<div class="card"><div class="lead"><div class="initials">${initials(c.name)}</div><div class="lead-main"><div class="lead-name">${escapeHtml(c.name)}</div><div class="lead-meta">${escapeHtml(c.phone||c.company||'Solo nombre registrado')}</div><div class="client-directory-stats"><span class="client-stat-chip">${rs.length} ${rs.length===1?'reserva':'reservas'}</span><span class="client-stat-chip active">${up.length} ${up.length===1?'próxima':'próximas'}</span></div>${specials.length?`<div class="created">Tarifa especial: ${specials.join(' · ')}</div>`:''}${Number(c.creditBalance||0)>0?`<div class="created"><b>Saldo a favor: ${money(c.creditBalance)}</b></div>`:''}</div></div><div class="client-directory-actions"><button class="btn primary-small" onclick="openClientProfile('${c.id}')">Ver cliente</button><button class="btn" onclick="openEditClient('${c.id}')">Editar</button></div></div>`
  }).join(''):'<div class="empty">No hay clientes registrados.</div>'
}
function clientIsoDate(iso){if(!iso)return '';const d=new Date(iso);return isNaN(d)?String(iso).slice(0,10):localDateValue(d)}
function clientProfileRange(){
  const now=new Date(),today=localDateValue(now);
  if(clientProfilePeriod==='all')return {start:'',end:'',label:'Todo el historial'};
  if(clientProfilePeriod==='today')return {start:today,end:today,label:'Hoy'};
  if(clientProfilePeriod==='week'){
    const day=(now.getDay()+6)%7,start=new Date(now);start.setDate(now.getDate()-day);const end=new Date(start);end.setDate(start.getDate()+6);
    return {start:localDateValue(start),end:localDateValue(end),label:'Esta semana'}
  }
  if(clientProfilePeriod==='month'){
    const start=new Date(now.getFullYear(),now.getMonth(),1),end=new Date(now.getFullYear(),now.getMonth()+1,0);
    return {start:localDateValue(start),end:localDateValue(end),label:start.toLocaleDateString('es-PE',{month:'long',year:'numeric'}).replace(/^./,x=>x.toUpperCase())}
  }
  if(clientProfilePeriod==='year')return {start:`${now.getFullYear()}-01-01`,end:`${now.getFullYear()}-12-31`,label:String(now.getFullYear())};
  if(clientProfilePeriod==='custom'){
    let a=clientProfileCustomStart,b=clientProfileCustomEnd;if(a&&b&&a>b)[a,b]=[b,a];
    return {start:a,end:b,label:a&&b?`${fmtScheduled(a,'')} – ${fmtScheduled(b,'')}`:'Selecciona un período'}
  }
  return {start:'',end:'',label:'Todo el historial'}
}
function clientDateInRange(ds,range){if(!ds)return false;if(!range.start&&!range.end)return true;return (!range.start||ds>=range.start)&&(!range.end||ds<=range.end)}
function clientDurationHours(r){let a=timeToMinutes(r.startTime),b=timeToMinutes(r.endTime);if(b<a)b+=1440;return Math.max(0,(b-a)/60)}
function clientPaymentRows(clientId){
  const explicit=movements.filter(m=>m.type==='payment'&&(String(m.clientId)===String(clientId)||String(reservationById(m.reservationId)?.clientId)===String(clientId))).map(m=>({...m,_legacy:false}));
  const legacy=[];
  clientReservations(clientId).forEach(r=>{const used=movements.filter(m=>m.type==='payment'&&String(m.reservationId)===String(r.id)).reduce((s,m)=>s+Number(m.amount||0),0),legacyAmount=Math.max(0,Number(r.advance||0)-used);if(legacyAmount>0)legacy.push({id:`legacy-${r.id}`,type:'payment',reservationId:r.id,clientId:r.clientId,amount:legacyAmount,method:'No especificado',paymentStage:'Adelanto previo',occurredAt:r.createdAt,createdAt:r.createdAt,_legacy:true})});
  return [...explicit,...legacy]
}
function openClientProfile(id){
  const c=clientById(id);if(!c)return;openClientProfileId=c.id;clientProfilePeriod='all';clientRelation='reservations';clientProfileCustomStart='';clientProfileCustomEnd='';
  document.querySelectorAll('[data-client-period]').forEach(x=>x.classList.toggle('active',x.dataset.clientPeriod==='all'));
  document.querySelectorAll('[data-client-relation]').forEach(x=>x.classList.toggle('active',x.dataset.clientRelation==='reservations'));
  document.getElementById('clientProfileCustomRange')?.classList.add('hidden');renderClientProfile();openSheet('clientProfileSheet')
}
function setClientProfilePeriod(period,el){
  clientProfilePeriod=period;document.querySelectorAll('[data-client-period]').forEach(x=>x.classList.remove('active'));if(el)el.classList.add('active');
  const custom=document.getElementById('clientProfileCustomRange');custom?.classList.toggle('hidden',period!=='custom');
  if(period==='custom'&&!clientProfileCustomStart){const now=new Date();clientProfileCustomStart=localDateValue(new Date(now.getFullYear(),now.getMonth(),1));clientProfileCustomEnd=localDateValue(now);document.getElementById('clientProfileStart').value=clientProfileCustomStart;document.getElementById('clientProfileEnd').value=clientProfileCustomEnd}
  renderClientProfile()
}
function applyClientProfileCustomRange(){clientProfileCustomStart=document.getElementById('clientProfileStart')?.value||'';clientProfileCustomEnd=document.getElementById('clientProfileEnd')?.value||'';if(!clientProfileCustomStart||!clientProfileCustomEnd){showToast('Selecciona ambas fechas');return}renderClientProfile()}
function setClientRelation(relation,el){clientRelation=relation;document.querySelectorAll('[data-client-relation]').forEach(x=>x.classList.remove('active'));if(el)el.classList.add('active');renderClientProfileRelations()}
function renderClientProfile(){
  const c=clientById(openClientProfileId);if(!c)return;const range=clientProfileRange();
  document.getElementById('clientProfileTitle').textContent=c.name;document.getElementById('clientProfileName').textContent=c.name;document.getElementById('clientProfileInitials').textContent=initials(c.name);
  const contact=[c.phone,c.company,c.email].filter(Boolean).map(escapeHtml).join(' · ');document.getElementById('clientProfileContact').innerHTML=contact||'Sin datos adicionales';document.getElementById('clientProfileRangeLabel').textContent=range.label;
  const rs=clientReservations(c.id).filter(r=>clientDateInRange(r.eventDate,range));
  const active=rs.filter(r=>!['cancelled','hold'].includes(r.status));const hours=rs.filter(r=>r.status!=='cancelled').reduce((s,r)=>s+clientDurationHours(r),0);const sold=active.reduce((s,r)=>s+Number(r.total||0),0);const collected=active.reduce((s,r)=>s+Math.max(0,Number(r.advance||0)-Number(r.refundedAmount||0)),0);const pending=active.reduce((s,r)=>s+Math.max(0,Number(r.balance||0)),0);const completed=rs.filter(r=>r.status==='completed').length;
  document.getElementById('clientProfileKpis').innerHTML=`<div class="client-profile-kpi primary"><span>Reservas</span><b>${rs.length}</b><small>${completed} realizadas</small></div><div class="client-profile-kpi"><span>Horas</span><b>${hours.toLocaleString('es-PE',{maximumFractionDigits:1})} h</b><small>Reservadas en el período</small></div><div class="client-profile-kpi"><span>Vendido</span><b>${money(sold)}</b><small>Reservas activas</small></div><div class="client-profile-kpi"><span>Cobrado</span><b>${money(collected)}</b><small>Sobre esas reservas</small></div><div class="client-profile-kpi"><span>Saldo pendiente</span><b>${money(pending)}</b><small>${Number(c.creditBalance||0)>0?`Saldo a favor ${money(c.creditBalance)}`:'Por cobrar'}</small></div><div class="client-profile-kpi"><span>Próximas</span><b>${clientUpcomingReservations(c.id).filter(r=>clientDateInRange(r.eventDate,range)).length}</b><small>Reservas futuras</small></div>`;
  renderClientProfileRelations()
}
function renderClientProfileRelations(){
  const c=clientById(openClientProfileId);if(!c)return;const range=clientProfileRange();
  const rs=clientReservations(c.id).filter(r=>clientDateInRange(r.eventDate,range)).sort((a,b)=>(b.eventDate+b.startTime).localeCompare(a.eventDate+a.startTime));
  const qs=quotes.filter(q=>String(q.clientId)===String(c.id)&&clientDateInRange(clientIsoDate(q.createdAt),range)).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
  const ps=clientPaymentRows(c.id).filter(m=>clientDateInRange(clientIsoDate(m.occurredAt||m.createdAt),range)).sort((a,b)=>new Date(b.occurredAt||b.createdAt)-new Date(a.occurredAt||a.createdAt));
  const fs=followups.filter(f=>String(f.clientId)===String(c.id)&&clientDateInRange(f.scheduledDate||clientIsoDate(f.createdAt),range)).sort((a,b)=>String(b.scheduledDate||'').localeCompare(String(a.scheduledDate||'')));
  document.getElementById('clientTabReservations').textContent=`Reservas ${rs.length}`;document.getElementById('clientTabQuotes').textContent=`Cotizaciones ${qs.length}`;document.getElementById('clientTabPayments').textContent=`Pagos ${ps.length}`;document.getElementById('clientTabFollowups').textContent=`Seguimientos ${fs.length}`;
  let html='';
  if(clientRelation==='reservations')html=rs.map(r=>{const kind=r.reservationKind||(r.space==='Local exclusivo'?'exclusive':'court');const meta=kind==='exclusive'?`${r.eventType||'Evento'} · ${fmtScheduled(r.eventDate,r.startTime)} - ${escapeHtml(r.endTime||'')}`:`${escapeHtml(r.courtType||r.space||'Cancha')} · ${fmtScheduled(r.eventDate,r.startTime)} - ${escapeHtml(r.endTime||'')}`;return `<div class="client-rel-card"><div class="client-rel-top"><div class="client-rel-main"><div class="client-rel-title">${escapeHtml(r.code)} · ${reservationStatusLabel(r)}</div><div class="client-rel-meta">${meta}<br>Pagado ${money(r.advance||0)} · Saldo ${money(r.balance||0)}</div></div><div class="client-rel-money">${money(r.total||0)}</div></div><div class="client-rel-actions"><button class="btn primary-small" onclick="openReservationDetail('${r.id}')">Ver reserva</button></div></div>`}).join('');
  if(clientRelation==='quotes')html=qs.map(q=>`<div class="client-rel-card"><div class="client-rel-top"><div class="client-rel-main"><div class="client-rel-title">${escapeHtml(q.code)} · ${q.status==='reserved'?'Reservada':'Por confirmar'}</div><div class="client-rel-meta">${escapeHtml(q.eventType||'Evento')} · Emitida ${fmtDateTime(q.createdAt)}${q.eventDate?`<br>Evento ${fmtScheduled(q.eventDate,q.startTime)}`:''}</div></div><div class="client-rel-money">${money(q.regularTotal??q.total)}</div></div><div class="client-rel-actions"><button class="btn primary-small" onclick="openQuoteDetail('${q.id}')">Ver cotización</button><button class="btn" onclick="openQuotePdf('${q.id}')">PDF</button></div></div>`).join('');
  if(clientRelation==='payments')html=ps.map(m=>{const r=reservationById(m.reservationId);return `<div class="client-rel-card"><div class="client-rel-top"><div class="client-rel-main"><div class="client-rel-title">${escapeHtml(m.paymentStage||'Cobro')}</div><div class="client-rel-meta">${r?escapeHtml(r.code)+' · ':''}${escapeHtml(m.method||'No especificado')} · ${fmtDateTime(m.occurredAt||m.createdAt)}${m._legacy?'<br>Registro anterior sin movimiento individual':''}</div></div><div class="client-rel-money">${money(m.amount)}</div></div>${r||m.attachmentId?`<div class="client-rel-actions">${r?`<button class="btn primary-small" onclick="openReservationDetail('${r.id}')">Ver reserva</button>`:''}${m.attachmentId?`<button class="btn" onclick="openMovementAttachment('${m.id}')">Comprobante</button>`:''}</div>`:''}</div>`}).join('');
  if(clientRelation==='followups')html=fs.map(f=>{const q=f.quoteId?quoteById(f.quoteId):null;return `<div class="client-rel-card"><div class="client-rel-top"><div class="client-rel-main"><div class="client-rel-title">${f.status==='done'?'Realizado':'Pendiente'} · ${escapeHtml(f.note)}</div><div class="client-rel-meta">${fmtScheduled(f.scheduledDate,f.scheduledTime)}${q?` · ${escapeHtml(q.code)}`:''}</div></div></div><div class="client-rel-actions"><button class="btn primary-small" onclick="openFollowDetail('${f.id}')">Ver seguimiento</button></div></div>`}).join('');
  document.getElementById('clientRelationList').innerHTML=html||'<div class="empty">No hay registros en este período.</div>'
}
function editOpenClientProfile(){const id=openClientProfileId;if(!id)return;closeSheet('clientProfileSheet');openEditClient(id)}

function homeKindOf(item){
  if(item?.reservationKind)return item.reservationKind;
  if(item?.space==='Local exclusivo'||item?.mode==='exclusive')return 'exclusive';
  return 'court'
}
function matchesHomeReservationFilter(item){return homeReservationFilter==='all'||homeKindOf(item)===homeReservationFilter}

function setHomeReservationFilter(filter,el){
  homeReservationFilter=filter;
  document.querySelectorAll('#homeReservationFilters .pill').forEach(btn=>btn.classList.toggle('active',btn.dataset.homeFilter===filter));
  renderHome()
}
function parseDashDate(ds){const [y,m,d]=String(ds).split('-').map(Number);return new Date(y,m-1,d)}
function dashDateValue(d){return localDateValue(d)}
function dashAddDays(d,n){const x=new Date(d);x.setDate(x.getDate()+n);return x}
function dashRangeDays(a,b){return Math.max(1,Math.round((parseDashDate(b)-parseDashDate(a))/86400000)+1)}
function homeDateRange(){
  const now=new Date(),today=localDateValue(now);
  if(homePeriod==='today')return {start:today,end:today,label:'Hoy'};
  if(homePeriod==='week'){
    const day=(now.getDay()+6)%7,start=dashAddDays(now,-day),end=dashAddDays(start,6);
    return {start:dashDateValue(start),end:dashDateValue(end),label:'Esta semana'}
  }
  if(homePeriod==='custom'&&homeCustomStart&&homeCustomEnd){
    let a=homeCustomStart,b=homeCustomEnd;if(a>b)[a,b]=[b,a];
    return {start:a,end:b,label:`${fmtScheduled(a,'').split(' · ')[0]} - ${fmtScheduled(b,'').split(' · ')[0]}`}
  }
  const first=new Date(now.getFullYear(),now.getMonth(),1),last=new Date(now.getFullYear(),now.getMonth()+1,0);
  return {start:dashDateValue(first),end:dashDateValue(last),label:first.toLocaleDateString('es-PE',{month:'long',year:'numeric'}).replace(/^./,x=>x.toUpperCase())}
}
function setHomePeriod(period,el){
  homePeriod=period;
  document.querySelectorAll('[data-home-period]').forEach(btn=>btn.classList.toggle('active',btn.dataset.homePeriod===period));
  const custom=document.getElementById('homeCustomRange');custom?.classList.toggle('hidden',period!=='custom');
  if(period==='custom'){
    const r=homeDateRange();
    if(!homeCustomStart||!homeCustomEnd){
      const now=new Date();homeCustomStart=localDateValue(new Date(now.getFullYear(),now.getMonth(),1));homeCustomEnd=localDateValue(now)
    }
    if(document.getElementById('homeCustomStart'))homeCustomStart && (document.getElementById('homeCustomStart').value=homeCustomStart);
    if(document.getElementById('homeCustomEnd'))homeCustomEnd && (document.getElementById('homeCustomEnd').value=homeCustomEnd)
  }
  renderHome()
}
function applyHomeCustomRange(){
  homeCustomStart=document.getElementById('homeCustomStart')?.value||homeCustomStart;
  homeCustomEnd=document.getElementById('homeCustomEnd')?.value||homeCustomEnd;
  if(!homeCustomStart||!homeCustomEnd){showToast('Selecciona ambas fechas');return}
  renderHome()
}
function dashInRange(ds,r){return !!ds&&ds>=r.start&&ds<=r.end}
function dashDurationHours(r){let a=timeToMinutes(r.startTime),b=timeToMinutes(r.endTime);if(b<a)b+=1440;return Math.max(0,(b-a)/60)}
function dashSaleActive(r){return !['cancelled','hold'].includes(r.status)}
function dashBlocksResource(r){return r.status!=='cancelled'}
function dashMoneyPaid(r){return Math.max(0,Number(r.advance||0)-Number(r.refundedAmount||0))}
function dashMoneySold(r){return dashSaleActive(r)?Number(r.total||0):0}
function dashMoneyReceivable(r){return dashSaleActive(r)?Math.max(0,Number(r.balance||0)):0}
function dashRangeReservations(range){return reservations.filter(r=>dashInRange(r.eventDate,range)&&matchesHomeReservationFilter(r))}
function dashProductName(r){const k=homeKindOf(r);if(k==='exclusive')return 'Eventos';return (r.courtType||r.space)==='FUT 9'?'FUT 9':'FUT 6'}
function dashPctDelta(current,previous){
  if(previous===0)return current>0?'Nuevo':'Sin cambio';
  const p=((current-previous)/Math.abs(previous))*100;return `${p>=0?'↑':'↓'} ${Math.abs(p).toFixed(0)}% vs período anterior`
}
function dashPreviousRange(range){const n=dashRangeDays(range.start,range.end);const end=dashAddDays(parseDashDate(range.start),-1);const start=dashAddDays(end,-(n-1));return {start:dashDateValue(start),end:dashDateValue(end)}}
function dashFormatHours(n){return `${Number(n||0).toLocaleString('es-PE',{maximumFractionDigits:1})} h`}
function dashWeekdayShort(ds){return parseDashDate(ds).toLocaleDateString('es-PE',{weekday:'short'}).replace('.','').replace(/^./,x=>x.toUpperCase())}

function renderHome(){
  const range=homeDateRange(),prevRange=dashPreviousRange(range),rows=dashRangeReservations(range),prevRows=dashRangeReservations(prevRange);
  const rangeLabel=document.getElementById('homeRangeLabel');if(rangeLabel)rangeLabel.textContent=range.label;

  const sold=rows.reduce((s,r)=>s+dashMoneySold(r),0),collected=rows.reduce((s,r)=>s+dashMoneyPaid(r),0),receivable=rows.reduce((s,r)=>s+dashMoneyReceivable(r),0);
  const prevSold=prevRows.reduce((s,r)=>s+dashMoneySold(r),0),prevCollected=prevRows.reduce((s,r)=>s+dashMoneyPaid(r),0);
  const blocking=rows.filter(dashBlocksResource),bookingHours=blocking.reduce((s,r)=>s+dashDurationHours(r),0),courtHours=blocking.reduce((s,r)=>s+dashDurationHours(r)*reservationResources(r).length,0);
  const days=dashRangeDays(range.start,range.end),availableHours=availableHoursInRange(range),capacity=availableHours*3,occupancy=capacity?Math.min(100,courtHours/capacity*100):0;
  const receivableCount=rows.filter(r=>dashMoneyReceivable(r)>0).length;

  const setText=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v};
  setText('dashCollected',money(collected));setText('dashSold',money(sold));setText('dashReceivable',money(receivable));setText('dashOccupancy',`${occupancy.toFixed(0)}%`);
  setText('dashCollectedDelta',dashPctDelta(collected,prevCollected));setText('dashSoldDelta',dashPctDelta(sold,prevSold));setText('dashReceivableMeta',`${receivableCount} reserva${receivableCount===1?'':'s'} con saldo`);setText('dashOccupancyMeta',`${dashFormatHours(bookingHours)} reservadas`);

  // Rendimiento por producto
  const products=['FUT 6','FUT 9','Eventos'].map(name=>{
    const a=rows.filter(r=>dashProductName(r)===name&&dashSaleActive(r));
    return {name,revenue:a.reduce((s,r)=>s+Number(r.total||0),0),hours:a.reduce((s,r)=>s+dashDurationHours(r),0),count:a.length}
  });
  const maxProduct=Math.max(1,...products.map(x=>x.revenue));
  const perf=document.getElementById('homePerformance');if(perf)perf.innerHTML=products.map(x=>`<div class="dashboard-row"><div class="dashboard-row-top"><div class="dashboard-row-main"><b>${x.name}</b><span>${x.count} reserva${x.count===1?'':'s'} · ${dashFormatHours(x.hours)}</span></div><div class="dashboard-row-value"><b>${money(x.revenue)}</b><span>${sold?Math.round(x.revenue/sold*100):0}% ventas</span></div></div><div class="dashboard-progress"><i style="width:${x.revenue/maxProduct*100}%"></i></div></div>`).join('');

  // Uso por cancha física
  const courtUsage=['Cancha 1','Cancha 2','Cancha 3'].map(c=>{
    const h=blocking.reduce((s,r)=>s+(reservationResources(r).includes(c)?dashDurationHours(r):0),0);return {court:c,hours:h,pct:availableHours?Math.min(100,h/availableHours*100):0}
  });
  const usage=document.getElementById('homeCourtUsage');if(usage)usage.innerHTML=courtUsage.map(x=>`<div class="dashboard-row"><div class="dashboard-row-top"><div class="dashboard-row-main"><b>${x.court}</b><span>${dashFormatHours(x.hours)} ocupadas</span></div><div class="dashboard-row-value"><b>${x.pct.toFixed(0)}%</b></div></div><div class="dashboard-progress dark"><i style="width:${x.pct}%"></i></div></div>`).join('');

  // Horas pico por día de semana + hora, ponderando recursos físicos
  const occurrenceHour=operationalBucketOccurrences(range);
  const buckets={};blocking.forEach(r=>{
    const day=parseDashDate(r.eventDate).getDay(),dur=dashDurationHours(r),resCount=reservationResources(r).length,start=timeToMinutes(r.startTime),end=start+dur*60;
    const bounds=operatingBoundsForDate(r.eventDate);if(!bounds)return;for(let h=Math.floor(bounds.open/60);h<Math.ceil(bounds.close/60);h++){
      const a=h*60,b=(h+1)*60,overlap=Math.max(0,Math.min(end,b,bounds.close)-Math.max(start,a,bounds.open))/60;if(!overlap)continue;
      const key=`${day}-${h%24}`;buckets[key]=(buckets[key]||0)+overlap*resCount
    }
  });
  const dayNames=['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
  const peaks=Object.entries(buckets).map(([k,v])=>{const [day,h]=k.split('-').map(Number);const cap=Math.max(1,(occurrenceHour[k]||1)*3);return {label:`${dayNames[day]} ${String(h).padStart(2,'0')}:00-${String((h+1)%24).padStart(2,'0')}:00`,pct:Math.min(100,v/cap*100),value:v}}).sort((a,b)=>b.pct-a.pct).slice(0,3);
  const peakHost=document.getElementById('homePeakHours');if(peakHost)peakHost.innerHTML=peaks.length?peaks.map((x,i)=>`<div class="dashboard-row"><div class="dashboard-row-top"><div class="dashboard-rank">${i+1}</div><div class="dashboard-row-main"><b>${x.label}</b><span>Uso estimado de las 3 canchas</span></div><div class="dashboard-row-value"><b>${x.pct.toFixed(0)}%</b></div></div><div class="dashboard-progress"><i style="width:${x.pct}%"></i></div></div>`).join(''):'<div class="card empty">Aún no hay suficiente actividad en este período.</div>';

  // Mejores clientes
  const clientMap={};rows.filter(dashSaleActive).forEach(r=>{const id=String(r.clientId),c=clientById(r.clientId)||{name:'Cliente'};if(!clientMap[id])clientMap[id]={name:c.name,revenue:0,hours:0,count:0};clientMap[id].revenue+=Number(r.total||0);clientMap[id].hours+=dashDurationHours(r);clientMap[id].count++});
  const tops=Object.values(clientMap).sort((a,b)=>b.revenue-a.revenue).slice(0,5),topHost=document.getElementById('homeTopClients');
  if(topHost)topHost.innerHTML=tops.length?tops.map((x,i)=>`<div class="dashboard-row"><div class="dashboard-row-top"><div class="dashboard-rank">${i+1}</div><div class="dashboard-row-main"><b>${escapeHtml(x.name)}</b><span>${x.count} reserva${x.count===1?'':'s'} · ${dashFormatHours(x.hours)}</span></div><div class="dashboard-row-value"><b>${money(x.revenue)}</b></div></div></div>`).join(''):'<div class="card empty">Aún no hay clientes con ventas en este período.</div>';

  // Estados
  const statuses=[['Realizadas',rows.filter(r=>r.status==='completed').length],['Canceladas',rows.filter(r=>r.status==='cancelled').length],['No asistió',rows.filter(r=>r.status==='no_show').length],['Reprogramadas',rows.filter(r=>r.status==='rescheduled').length]];
  const statusHost=document.getElementById('homeStatusGrid');if(statusHost)statusHost.innerHTML=statuses.map(([n,v])=>`<div class="dashboard-status"><b>${v}</b><span>${n}</span></div>`).join('');

  // Finanzas por resultado
  const refunded=rows.reduce((s,r)=>s+Number(r.refundedAmount||0),0),credited=rows.reduce((s,r)=>s+Number(r.creditAmount||0),0),retained=rows.reduce((s,r)=>s+Number(r.retainedAmount||0),0);
  const financeHost=document.getElementById('homeFinanceGrid');if(financeHost)financeHost.innerHTML=`<div class="dashboard-finance"><span>Devuelto</span><b>${money(refunded)}</b></div><div class="dashboard-finance"><span>Saldo a favor</span><b>${money(credited)}</b></div><div class="dashboard-finance"><span>Retenido</span><b>${money(retained)}</b></div>`;

  // Tendencia: máximo 7 tramos dentro del rango
  const totalDays=dashRangeDays(range.start,range.end),bucketCount=Math.min(7,totalDays),bucketSize=Math.ceil(totalDays/bucketCount),trend=[];
  for(let i=0;i<bucketCount;i++){
    const a=dashAddDays(parseDashDate(range.start),i*bucketSize);if(a>parseDashDate(range.end))break;
    const b=new Date(Math.min(dashAddDays(a,bucketSize-1).getTime(),parseDashDate(range.end).getTime())),as=dashDateValue(a),bs=dashDateValue(b);
    const val=rows.filter(r=>dashSaleActive(r)&&r.eventDate>=as&&r.eventDate<=bs).reduce((s,r)=>s+Number(r.total||0),0);
    const label=totalDays<=7?dashWeekdayShort(as):a.toLocaleDateString('es-PE',{day:'numeric',month:'short'}).replace('.','');trend.push({label,val})
  }
  const maxTrend=Math.max(1,...trend.map(x=>x.val)),trendHost=document.getElementById('homeTrend');
  if(trendHost)trendHost.innerHTML=trend.some(x=>x.val>0)?trend.map(x=>`<div class="trend-col" title="${escapeHtml(x.label)} · ${money(x.val)}"><div class="trend-bar-wrap"><div class="trend-bar" style="height:${Math.max(4,x.val/maxTrend*100)}%"></div></div><div class="trend-label">${escapeHtml(x.label)}</div></div>`).join(''):'<div class="trend-empty">Sin ventas registradas en este período.</div>';
  setText('homeTrendSubtitle',`${money(sold)} vendidos · ${range.label}`);

  // Bloques operativos existentes
  const arr=followups.filter(f=>f.status==='pending').slice(0,3),followHost=document.getElementById('homeFollowups');
  if(followHost)followHost.innerHTML=arr.length?arr.map(f=>{const c=clientById(f.clientId)||{name:'Cliente'};return `<div class="card lead"><div class="initials">${initials(c.name)}</div><div class="lead-main"><div class="lead-name">${escapeHtml(c.name)}</div><div class="lead-meta">${escapeHtml(f.note)}</div><div class="created">${fmtScheduled(f.scheduledDate,f.scheduledTime)}</div></div><button class="btn primary-small" onclick="openFollowDetail('${f.id}')">Ver</button></div>`}).join(''):'<div class="card empty">No tienes seguimientos pendientes.</div>';
  const upcoming=reservations.filter(r=>r.status!=='cancelled'&&r.eventDate>=localDateValue()&&matchesHomeReservationFilter(r)).sort((a,b)=>(a.eventDate+a.startTime).localeCompare(b.eventDate+b.startTime)).slice(0,3),resHost=document.getElementById('homeReservations');
  const emptyText=homeReservationFilter==='exclusive'?'No hay próximos eventos.':(homeReservationFilter==='court'?'No hay próximas reservas de cancha.':'No hay próximas reservas.');
  if(resHost)resHost.innerHTML=upcoming.length?upcoming.map(r=>{const c=clientById(r.clientId)||{name:'Cliente'};const kind=homeKindOf(r);return `<div class="card lead reservation-card"><div class="initials">${initials(c.name)}</div><div class="lead-main"><div class="lead-name">${escapeHtml(c.name)}</div><div class="lead-meta">${kind==='exclusive'?escapeHtml(r.eventType):'Alquiler de cancha'} · ${fmtScheduled(r.eventDate,r.startTime)}</div></div><button class="btn primary-small" onclick="openReservationDetail('${r.id}')">Ver</button></div>`}).join(''):`<div class="card empty">${emptyText}</div>`
}

if(!reservations.length){
  quotes.filter(q=>q.status==='reserved').forEach(q=>reservations.push({id:Date.now()+Math.random(),code:nextReservationCode(),clientId:q.clientId,quoteId:q.id,eventType:q.eventType,eventDate:q.eventDate,startTime:q.startTime,endTime:q.endTime,space:q.mode==='exclusive'?'Local exclusivo':'Cancha',total:Number((q.regularTotal??q.total)||0),advance:0,balance:Number((q.regularTotal??q.total)||0),notes:'Importada desde '+q.code,status:'confirmed',createdAt:q.reservedAt||q.createdAt||nowISO()}));
  persist();
}

ensureQuoteSettings();
quotes.forEach(q=>{
  if(q.mode==='exclusive'&&!q.packageSnapshot)q.packageSnapshot=cloneData(defaultExclusivePackage());
  if(q.regularTotal===undefined)q.regularTotal=Number(q.rent||0)+Number(q.guarantee||0);
  if(q.singlePaymentTotal===undefined)q.singlePaymentTotal=Math.max(0,Number(q.regularTotal||0)-Number(q.discount||0));
  if(q.discountConditional===undefined)q.discountConditional=true;
});

clients.forEach(c=>{
  if(c.specialFut6===undefined)c.specialFut6=null;
  if(c.specialFut9===undefined)c.specialFut9=null;
  if(c.creditBalance===undefined)c.creditBalance=0;
});
reservations.forEach(r=>{
  if(r.reservationKind==='court'&&r.courtType==='FUT 6'){
    if(!Array.isArray(r.physicalCourts)||!r.physicalCourts.length)r.physicalCourts=[r.physicalCourt||((String(r.space||'').startsWith('Cancha '))?r.space:'Cancha 1')];
    if(!r.courtQty)r.courtQty=r.physicalCourts.length;
  }
  if(r.reservationKind==='court'&&r.courtType==='FUT 9'){
    r.physicalCourts=['Cancha 1','Cancha 2','Cancha 3'];r.courtQty=1;
  }
});
persist();

date.value=localDateValue();
buildHalfHourOptions();


/* =========================================================
   v33 dashboard ejecutivo + detalle + analisis
   ========================================================= */
function homePeriodName(period){return ({today:'Hoy',week:'Esta semana',month:'Este mes',year:'Este año',custom:'Personalizado'})[period]||'Período'}
function homeDateRange(){
  const anchor=parseDashDate(homeAnchorDate||localDateValue());
  if(homePeriod==='custom'&&homeCustomStart&&homeCustomEnd){let a=homeCustomStart,b=homeCustomEnd;if(a>b)[a,b]=[b,a];return {start:a,end:b,label:dashboardRangeLabel(a,b,'custom')}}
  if(homePeriod==='today'){const d=dashDateValue(anchor);return {start:d,end:d,label:dashboardRangeLabel(d,d,'today')}}
  if(homePeriod==='week'){const day=(anchor.getDay()+6)%7,start=dashAddDays(anchor,-day),end=dashAddDays(start,6);return {start:dashDateValue(start),end:dashDateValue(end),label:dashboardRangeLabel(dashDateValue(start),dashDateValue(end),'week')}}
  if(homePeriod==='year'){const y=anchor.getFullYear();return {start:`${y}-01-01`,end:`${y}-12-31`,label:String(y)}}
  const first=new Date(anchor.getFullYear(),anchor.getMonth(),1),last=new Date(anchor.getFullYear(),anchor.getMonth()+1,0);return {start:dashDateValue(first),end:dashDateValue(last),label:first.toLocaleDateString('es-PE',{month:'long',year:'numeric'}).replace(/^./,x=>x.toUpperCase())}
}
function dashboardRangeLabel(a,b,period){
  const A=parseDashDate(a),B=parseDashDate(b);if(period==='today')return A.toLocaleDateString('es-PE',{day:'numeric',month:'long'}).replace(/^./,x=>x.toUpperCase());
  if(period==='week'||period==='custom'){
    if(a===b)return A.toLocaleDateString('es-PE',{day:'numeric',month:'short',year:'numeric'}).replace('.','');
    const left=A.toLocaleDateString('es-PE',{day:'numeric',month:'short'}).replace('.',''),right=B.toLocaleDateString('es-PE',{day:'numeric',month:'short',year:'numeric'}).replace('.','');return `${left} – ${right}`
  }
  return ''
}
function openHomePeriodPicker(){document.querySelectorAll('[data-period-option]').forEach(b=>b.classList.toggle('active',b.dataset.periodOption===homePeriod));openSheet('homePeriodSheet')}
function selectHomePeriod(period){homePeriod=period;homeAnchorDate=localDateValue();closeSheet('homePeriodSheet');renderHome()}
function openHomeCustomPeriod(){
  closeSheet('homePeriodSheet');const now=new Date();if(!homeCustomStart)homeCustomStart=localDateValue(new Date(now.getFullYear(),now.getMonth(),1));if(!homeCustomEnd)homeCustomEnd=localDateValue(now);
  document.getElementById('homeCustomStart').value=homeCustomStart;document.getElementById('homeCustomEnd').value=homeCustomEnd;updateHomeCustomPreview();openSheet('homeCustomSheet')
}
function updateHomeCustomPreview(){const a=document.getElementById('homeCustomStart')?.value||'',b=document.getElementById('homeCustomEnd')?.value||'',host=document.getElementById('homeCustomPreview');if(!host)return;host.textContent=a&&b?dashboardRangeLabel(a,b,'custom'):'Selecciona las fechas'}
function applyHomeCustomRange(){let a=document.getElementById('homeCustomStart')?.value||'',b=document.getElementById('homeCustomEnd')?.value||'';if(!a||!b){showToast('Selecciona ambas fechas');return}if(a>b)[a,b]=[b,a];homeCustomStart=a;homeCustomEnd=b;homePeriod='custom';closeSheet('homeCustomSheet');renderHome()}
function shiftHomePeriod(delta){
  if(homePeriod==='custom'&&homeCustomStart&&homeCustomEnd){const days=dashRangeDays(homeCustomStart,homeCustomEnd),a=dashAddDays(parseDashDate(homeCustomStart),delta*days),b=dashAddDays(parseDashDate(homeCustomEnd),delta*days);homeCustomStart=dashDateValue(a);homeCustomEnd=dashDateValue(b);renderHome();return}
  let d=parseDashDate(homeAnchorDate||localDateValue());if(homePeriod==='today')d=dashAddDays(d,delta);else if(homePeriod==='week')d=dashAddDays(d,delta*7);else if(homePeriod==='year')d=new Date(d.getFullYear()+delta,d.getMonth(),Math.min(d.getDate(),28));else d=new Date(d.getFullYear(),d.getMonth()+delta,1);homeAnchorDate=dashDateValue(d);renderHome()
}
function setHomePeriod(period){selectHomePeriod(period)}
function dashboardCashDate(record){const raw=record.occurredAt||record.createdAt||'';if(!raw)return '';const d=new Date(raw);if(isNaN(d))return String(raw).slice(0,10);return localDateValue(d)}
function dashboardCashRows(range){return buildCashRecords().filter(m=>dashInRange(dashboardCashDate(m),range))}
function dashboardCashMetrics(range){
  const rows=dashboardCashRows(range),sumTypes=types=>rows.filter(m=>types.includes(m.type)).reduce((s,m)=>s+Number(m.amount||0),0);
  const payments=sumTypes(['payment','payment_legacy']),otherIncome=sumTypes(['other_income']),cashIn=sumTypes(['cash_in']),expenses=sumTypes(['expense']),refunds=sumTypes(['refund']),cashOut=sumTypes(['cash_out']);
  return {rows,payments,otherIncome,cashIn,expenses,refunds,cashOut,net:payments+otherIncome+cashIn-expenses-refunds-cashOut}
}
function dashboardAvailableMetrics(){const rows=buildCashRecords(),byMethod={};let total=0;rows.forEach(m=>{const v=Number(m.amount||0)*Number(m.sign||0),method=m.method||'No especificado';total+=v;byMethod[method]=(byMethod[method]||0)+v});return {rows,total,byMethod}}
function dashboardSalesProducts(rows){return ['FUT 6','FUT 9','Eventos'].map(name=>{const a=rows.filter(r=>dashProductName(r)===name&&dashSaleActive(r));return {name,revenue:a.reduce((s,r)=>s+Number(r.total||0),0),hours:a.reduce((s,r)=>s+dashDurationHours(r),0),count:a.length,rows:a}})}
function dashboardAnalysisData(range,rows){
  const active=rows.filter(dashSaleActive),sold=active.reduce((s,r)=>s+Number(r.total||0),0),blocking=rows.filter(dashBlocksResource),bookingHours=blocking.reduce((s,r)=>s+dashDurationHours(r),0),courtHours=blocking.reduce((s,r)=>s+dashDurationHours(r)*reservationResources(r).length,0),availableHours=availableHoursInRange(range),capacity=availableHours*3,occupancy=capacity?Math.min(100,courtHours/capacity*100):0,ticket=active.length?sold/active.length:0,incomeHour=bookingHours?sold/bookingHours:0;
  return {active,sold,blocking,bookingHours,courtHours,availableHours,capacity,occupancy,ticket,incomeHour}
}
function dashboardMethodBreakdown(rows){const map={};rows.forEach(m=>{const k=m.method||'No especificado';map[k]=(map[k]||0)+Number(m.amount||0)*Number(m.sign||0)});return Object.entries(map).sort((a,b)=>Math.abs(b[1])-Math.abs(a[1]))}
function renderHome(){
  const range=homeDateRange(),prevRange=dashPreviousRange(range),rows=dashRangeReservations(range),prevRows=dashRangeReservations(prevRange),cash=dashboardCashMetrics(range),prevCash=dashboardCashMetrics(prevRange),available=dashboardAvailableMetrics(),analysis=dashboardAnalysisData(range,rows);
  const sold=rows.reduce((s,r)=>s+dashMoneySold(r),0),receivable=rows.reduce((s,r)=>s+dashMoneyReceivable(r),0),prevSold=prevRows.reduce((s,r)=>s+dashMoneySold(r),0),reservationCount=rows.filter(r=>r.status!=='cancelled').length,receivableCount=rows.filter(r=>dashMoneyReceivable(r)>0).length;
  const setText=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v};
  setText('homeRangeLabel',range.label);setText('homePeriodLabel',homePeriodName(homePeriod));setText('dashAvailable',money(available.total));setText('dashCashNet',money(cash.net));setText('dashCashNetMeta',`${dashPctDelta(cash.net,prevCash.net)} · entradas − salidas`);setText('dashSold',money(sold));setText('dashSoldDelta',dashPctDelta(sold,prevSold));setText('dashReservationCount',String(reservationCount));setText('dashReservationMeta',`${dashFormatHours(analysis.bookingHours)} reservadas`);setText('dashReceivable',money(receivable));setText('dashReceivableMeta',`${receivableCount} reserva${receivableCount===1?'':'s'} con saldo`);
  setText('analysisOccupancy',`${analysis.occupancy.toFixed(0)}%`);setText('analysisHours',dashFormatHours(analysis.bookingHours));setText('analysisTicket',money(analysis.ticket));setText('analysisIncomeHour',money(analysis.incomeHour));

  const products=dashboardSalesProducts(rows),maxProduct=Math.max(1,...products.map(x=>x.revenue)),perf=document.getElementById('homePerformance');if(perf)perf.innerHTML=products.map(x=>`<button class="dashboard-row dashboard-product-row" onclick="openDashboardDetail('sales')"><div class="dashboard-row-top"><div class="dashboard-row-main"><b>${x.name}</b><span>${x.count} reserva${x.count===1?'':'s'} · ${dashFormatHours(x.hours)}</span></div><div class="dashboard-row-value"><b>${money(x.revenue)}</b><span>${sold?Math.round(x.revenue/sold*100):0}% ventas</span></div></div><div class="dashboard-progress"><i style="width:${x.revenue/maxProduct*100}%"></i></div></button>`).join('');

  const totalDays=dashRangeDays(range.start,range.end),bucketCount=Math.min(7,totalDays),bucketSize=Math.ceil(totalDays/bucketCount),trend=[];for(let i=0;i<bucketCount;i++){const a=dashAddDays(parseDashDate(range.start),i*bucketSize);if(a>parseDashDate(range.end))break;const b=new Date(Math.min(dashAddDays(a,bucketSize-1).getTime(),parseDashDate(range.end).getTime())),as=dashDateValue(a),bs=dashDateValue(b),val=rows.filter(r=>dashSaleActive(r)&&r.eventDate>=as&&r.eventDate<=bs).reduce((s,r)=>s+Number(r.total||0),0),label=totalDays<=7?dashWeekdayShort(as):a.toLocaleDateString('es-PE',{day:'numeric',month:'short'}).replace('.','');trend.push({label,val})}
  const maxTrend=Math.max(1,...trend.map(x=>x.val)),trendHost=document.getElementById('homeTrend');if(trendHost)trendHost.innerHTML=trend.some(x=>x.val>0)?trend.map(x=>`<div class="trend-col" title="${escapeHtml(x.label)} · ${money(x.val)}"><div class="trend-bar-wrap"><div class="trend-bar" style="height:${Math.max(4,x.val/maxTrend*100)}%"></div></div><div class="trend-label">${escapeHtml(x.label)}</div></div>`).join(''):'<div class="trend-empty">Sin ventas registradas en este período.</div>';setText('homeTrendSubtitle',`${money(sold)} vendidos · ${range.label}`);

  const upcoming=reservations.filter(r=>r.status!=='cancelled'&&r.eventDate>=localDateValue()&&matchesHomeReservationFilter(r)).sort((a,b)=>(a.eventDate+a.startTime).localeCompare(b.eventDate+b.startTime)).slice(0,3),resHost=document.getElementById('homeReservations'),emptyText=homeReservationFilter==='exclusive'?'No hay próximos eventos.':(homeReservationFilter==='court'?'No hay próximas reservas de cancha.':'No hay próximas reservas.');if(resHost)resHost.innerHTML=upcoming.length?upcoming.map(r=>{const c=clientById(r.clientId)||{name:'Cliente'},kind=homeKindOf(r);return `<div class="card lead reservation-card"><div class="initials">${initials(c.name)}</div><div class="lead-main"><div class="lead-name">${escapeHtml(c.name)}</div><div class="lead-meta">${kind==='exclusive'?escapeHtml(r.eventType):escapeHtml(r.courtType||r.space||'Cancha')} · ${fmtScheduled(r.eventDate,r.startTime)}</div></div><button class="btn primary-small" onclick="openReservationDetail('${r.id}')">Ver</button></div>`}).join(''):`<div class="card empty">${emptyText}</div>`;
  const arr=followups.filter(f=>f.status==='pending').slice(0,3),followHost=document.getElementById('homeFollowups');if(followHost)followHost.innerHTML=arr.length?arr.map(f=>{const c=clientById(f.clientId)||{name:'Cliente'};return `<div class="card lead"><div class="initials">${initials(c.name)}</div><div class="lead-main"><div class="lead-name">${escapeHtml(c.name)}</div><div class="lead-meta">${escapeHtml(f.note)}</div><div class="created">${fmtScheduled(f.scheduledDate,f.scheduledTime)}</div></div><button class="btn primary-small" onclick="openFollowDetail('${f.id}')">Ver</button></div>`}).join(''):'<div class="card empty">No tienes seguimientos pendientes.</div>';
  renderDashboardAnalysis(range,rows,analysis)
}
function renderDashboardAnalysis(range,rows,analysis=dashboardAnalysisData(range,rows)){
  const setText=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v};setText('analysisRangeLabel',range.label);setText('analysisFullOccupancy',`${analysis.occupancy.toFixed(0)}%`);setText('analysisFullHours',dashFormatHours(analysis.bookingHours));setText('analysisFullTicket',money(analysis.ticket));setText('analysisFullIncomeHour',money(analysis.incomeHour));
  const courtUsage=['Cancha 1','Cancha 2','Cancha 3'].map(c=>{const h=analysis.blocking.reduce((s,r)=>s+(reservationResources(r).includes(c)?dashDurationHours(r):0),0);return {court:c,hours:h,pct:analysis.availableHours?Math.min(100,h/analysis.availableHours*100):0}}),usage=document.getElementById('analysisCourtUsage');if(usage)usage.innerHTML=courtUsage.map(x=>`<div class="dashboard-row"><div class="dashboard-row-top"><div class="dashboard-row-main"><b>${x.court}</b><span>${dashFormatHours(x.hours)} ocupadas</span></div><div class="dashboard-row-value"><b>${x.pct.toFixed(0)}%</b></div></div><div class="dashboard-progress dark"><i style="width:${x.pct}%"></i></div></div>`).join('');
  const occurrenceHour=operationalBucketOccurrences(range),buckets={};analysis.blocking.forEach(r=>{const day=parseDashDate(r.eventDate).getDay(),dur=dashDurationHours(r),resCount=reservationResources(r).length,start=timeToMinutes(r.startTime),end=start+dur*60,bounds=operatingBoundsForDate(r.eventDate);if(!bounds)return;for(let h=Math.floor(bounds.open/60);h<Math.ceil(bounds.close/60);h++){const a=h*60,b=(h+1)*60,overlap=Math.max(0,Math.min(end,b,bounds.close)-Math.max(start,a,bounds.open))/60;if(!overlap)continue;const key=`${day}-${h%24}`;buckets[key]=(buckets[key]||0)+overlap*resCount}});const dayNames=['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'],peaks=Object.entries(buckets).map(([k,v])=>{const [day,h]=k.split('-').map(Number),cap=Math.max(1,(occurrenceHour[k]||1)*3);return {label:`${dayNames[day]} ${String(h).padStart(2,'0')}:00-${String((h+1)%24).padStart(2,'0')}:00`,pct:Math.min(100,v/cap*100)}}).sort((a,b)=>b.pct-a.pct).slice(0,5),peakHost=document.getElementById('analysisPeakHours');if(peakHost)peakHost.innerHTML=peaks.length?peaks.map((x,i)=>`<div class="dashboard-row"><div class="dashboard-row-top"><div class="dashboard-rank">${i+1}</div><div class="dashboard-row-main"><b>${x.label}</b><span>Uso estimado de las 3 canchas</span></div><div class="dashboard-row-value"><b>${x.pct.toFixed(0)}%</b></div></div><div class="dashboard-progress"><i style="width:${x.pct}%"></i></div></div>`).join(''):'<div class="card empty">Aún no hay suficiente actividad.</div>';
  const clientMap={};rows.filter(dashSaleActive).forEach(r=>{const id=String(r.clientId),c=clientById(r.clientId)||{name:'Cliente'};if(!clientMap[id])clientMap[id]={id,name:c.name,revenue:0,hours:0,count:0};clientMap[id].revenue+=Number(r.total||0);clientMap[id].hours+=dashDurationHours(r);clientMap[id].count++});const tops=Object.values(clientMap).sort((a,b)=>b.revenue-a.revenue).slice(0,5),topHost=document.getElementById('analysisTopClients');if(topHost)topHost.innerHTML=tops.length?tops.map((x,i)=>`<button class="dashboard-row" onclick="closeSheet('dashboardAnalysisSheet');openClientProfile('${x.id}')"><div class="dashboard-row-top"><div class="dashboard-rank">${i+1}</div><div class="dashboard-row-main"><b>${escapeHtml(x.name)}</b><span>${x.count} reserva${x.count===1?'':'s'} · ${dashFormatHours(x.hours)}</span></div><div class="dashboard-row-value"><b>${money(x.revenue)}</b></div></div></button>`).join(''):'<div class="card empty">Aún no hay clientes con ventas.</div>';
  const statuses=[['Realizadas',rows.filter(r=>r.status==='completed').length],['Canceladas',rows.filter(r=>r.status==='cancelled').length],['No asistió',rows.filter(r=>r.status==='no_show').length],['Reprogramadas',rows.filter(r=>r.status==='rescheduled').length]],statusHost=document.getElementById('analysisStatusGrid');if(statusHost)statusHost.innerHTML=statuses.map(([n,v])=>`<div class="dashboard-status"><b>${v}</b><span>${n}</span></div>`).join('');const refunded=rows.reduce((s,r)=>s+Number(r.refundedAmount||0),0),credited=rows.reduce((s,r)=>s+Number(r.creditAmount||0),0),retained=rows.reduce((s,r)=>s+Number(r.retainedAmount||0),0),financeHost=document.getElementById('analysisFinanceGrid');if(financeHost)financeHost.innerHTML=`<div class="dashboard-finance"><span>Devuelto</span><b>${money(refunded)}</b></div><div class="dashboard-finance"><span>Saldo a favor</span><b>${money(credited)}</b></div><div class="dashboard-finance"><span>Retenido</span><b>${money(retained)}</b></div>`
}
function openDashboardAnalysis(){const range=homeDateRange(),rows=dashRangeReservations(range);renderDashboardAnalysis(range,rows);openSheet('dashboardAnalysisSheet')}
function dashboardDetailStats(items){return `<div class="dashboard-detail-summary">${items.map(x=>`<div class="dashboard-detail-stat"><span>${escapeHtml(x[0])}</span><b>${escapeHtml(String(x[1]))}</b></div>`).join('')}</div>`}
function dashboardReservationRow(r,value='') {const c=clientById(r.clientId)||{name:'Cliente'},product=dashProductName(r),meta=`${product} · ${fmtScheduled(r.eventDate,r.startTime)} · ${statusLabel(r.status)}`;return `<button class="dashboard-detail-row" onclick="closeSheet('dashboardDetailSheet');openReservationDetail('${r.id}')"><div class="dashboard-detail-row-main"><b>${escapeHtml(r.code)} · ${escapeHtml(c.name)}</b><span>${escapeHtml(meta)}</span></div><div class="dashboard-detail-row-value"><b>${value||money(r.total||0)}</b>${Number(r.balance||0)>0?`<span>Saldo ${money(r.balance)}</span>`:''}</div></button>`}
function openDashboardDetail(type){
  const range=homeDateRange(),rows=dashRangeReservations(range),cash=dashboardCashMetrics(range),available=dashboardAvailableMetrics(),analysis=dashboardAnalysisData(range,rows),products=dashboardSalesProducts(rows),host=document.getElementById('dashboardDetailBody'),title=document.getElementById('dashboardDetailTitle'),rangeHost=document.getElementById('dashboardDetailRange');if(!host||!title)return;rangeHost.textContent=type==='available'?'Saldo acumulado hasta hoy':range.label;
  if(type==='available'){
    title.textContent='Saldo disponible';const methods=Object.entries(available.byMethod).sort((a,b)=>Math.abs(b[1])-Math.abs(a[1]));host.innerHTML=dashboardDetailStats([['Disponible actual',money(available.total)],['Movimientos',available.rows.length]])+`<div class="dashboard-detail-section"><div class="dashboard-detail-title">Por método</div><div class="dashboard-method-list">${methods.length?methods.map(([m,v])=>`<div class="dashboard-method-row"><span>${escapeHtml(m)}</span><b>${money(v)}</b></div>`).join(''):'<div class="card empty">Sin movimientos.</div>'}</div></div><div class="dashboard-detail-section"><button class="secondary" onclick="closeSheet('dashboardDetailSheet');openCash()">Abrir Caja y movimientos</button></div>`
  } else if(type==='cash'){
    title.textContent='Caja neta';const methods=dashboardMethodBreakdown(cash.rows),recent=cash.rows.slice(0,30);host.innerHTML=dashboardDetailStats([['Caja neta',money(cash.net)],['Cobros',money(cash.payments)],['Otros ingresos',money(cash.otherIncome)],['Salidas',money(cash.expenses+cash.refunds+cash.cashOut)]])+`<div class="dashboard-detail-section"><div class="dashboard-detail-title">Composición</div><div class="dashboard-method-list"><div class="dashboard-method-row"><span>Aportes a caja</span><b>${money(cash.cashIn)}</b></div><div class="dashboard-method-row"><span>Gastos</span><b>− ${money(cash.expenses)}</b></div><div class="dashboard-method-row"><span>Reembolsos</span><b>− ${money(cash.refunds)}</b></div><div class="dashboard-method-row"><span>Retiros de caja</span><b>− ${money(cash.cashOut)}</b></div></div></div><div class="dashboard-detail-section"><div class="dashboard-detail-title">Por método</div><div class="dashboard-method-list">${methods.length?methods.map(([m,v])=>`<div class="dashboard-method-row"><span>${escapeHtml(m)}</span><b>${money(v)}</b></div>`).join(''):'<div class="card empty">Sin movimientos.</div>'}</div></div><div class="dashboard-detail-section"><div class="dashboard-detail-title">Registros</div>${recent.length?recent.map(m=>`<div class="dashboard-detail-row"><div class="dashboard-detail-row-main"><b>${escapeHtml(cashRecordLabel(m))}</b><span>${escapeHtml(cashRecordMeta(m))}</span>${m.attachmentId&&!m.virtual?`<button class="cash-proof-btn" onclick="openMovementAttachment('${String(m.id)}')">Ver comprobante</button>`:''}</div><div class="dashboard-detail-row-value"><b>${Number(m.sign||0)>=0?'+':'−'} ${money(m.amount)}</b></div></div>`).join(''):'<div class="card empty">No hay movimientos.</div>'}</div>`
  } else if(type==='sales'){
    title.textContent='Total vendido';const sold=products.reduce((s,x)=>s+x.revenue,0),active=rows.filter(dashSaleActive);host.innerHTML=dashboardDetailStats([['Total vendido',money(sold)],['Reservas',active.length],['Horas vendidas',dashFormatHours(active.reduce((s,r)=>s+dashDurationHours(r),0))],['Ticket promedio',money(active.length?sold/active.length:0)]])+`<div class="dashboard-detail-section"><div class="dashboard-detail-title">Por producto</div>${products.map(x=>`<div class="dashboard-detail-row"><div class="dashboard-detail-row-main"><b>${x.name}</b><span>${x.count} reserva${x.count===1?'':'s'} · ${dashFormatHours(x.hours)}</span></div><div class="dashboard-detail-row-value"><b>${money(x.revenue)}</b><span>${sold?Math.round(x.revenue/sold*100):0}%</span></div></div>`).join('')}</div><div class="dashboard-detail-section"><div class="dashboard-detail-title">Reservas vendidas</div>${active.length?active.sort((a,b)=>(b.eventDate+b.startTime).localeCompare(a.eventDate+a.startTime)).map(r=>dashboardReservationRow(r)).join(''):'<div class="card empty">Sin ventas en este período.</div>'}</div>`
  } else if(type==='reservations'){
    title.textContent='Reservas';const active=rows.filter(r=>r.status!=='cancelled'),completed=rows.filter(r=>r.status==='completed').length,cancelled=rows.filter(r=>r.status==='cancelled').length;host.innerHTML=dashboardDetailStats([['Reservas',active.length],['Realizadas',completed],['Canceladas',cancelled],['Horas',dashFormatHours(analysis.bookingHours)]])+`<div class="dashboard-detail-section"><div class="dashboard-detail-title">Registros</div>${rows.length?rows.sort((a,b)=>(b.eventDate+b.startTime).localeCompare(a.eventDate+a.startTime)).map(r=>dashboardReservationRow(r)).join(''):'<div class="card empty">No hay reservas en este período.</div>'}</div>`
  } else if(type==='receivable'){
    title.textContent='Por cobrar';const pending=rows.filter(r=>dashMoneyReceivable(r)>0).sort((a,b)=>Number(b.balance||0)-Number(a.balance||0)),total=pending.reduce((s,r)=>s+Number(r.balance||0),0);host.innerHTML=dashboardDetailStats([['Por cobrar',money(total)],['Reservas con saldo',pending.length]])+`<div class="dashboard-detail-section"><div class="dashboard-detail-title">Saldos pendientes</div>${pending.length?pending.map(r=>dashboardReservationRow(r,money(r.balance||0))).join(''):'<div class="card empty">No hay saldos pendientes en este período.</div>'}</div>`
  }
  openSheet('dashboardDetailSheet')
}

cleanupLegacyDemoDataV14();ensureOperatingSchedule();renderClientOptions();renderQuotes();renderFollowups();renderReservations();reservationWorkspace='agenda';reservationFocusDate=localDateValue();renderReservationWorkspace();calendarSelectedDate=localDateValue();calendarView='day';renderCalendar();renderHome();updateScheduleMasterBadge();updatePaymentMethodsMasterBadge();recalcQuote();
