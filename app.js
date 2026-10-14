
const nowISO = () => new Date().toISOString();
const localDateValue = (d=new Date()) => {
  const x = new Date(d.getTime() - d.getTimezoneOffset()*60000);
  return x.toISOString().slice(0,10);
};
const localTimeValue = (d=new Date()) => `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
const fmtDateTime = iso => {
  if(!iso) return '—';
  if(/^\d{4}-\d{2}-\d{2}$/.test(String(iso)))return fmtScheduled(String(iso),'');
  const d=new Date(iso);
  if(Number.isNaN(d.getTime()))return '—';
  const parts=Object.fromEntries(new Intl.DateTimeFormat('es-PE',{timeZone:'America/Lima',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(d).map(p=>[p.type,p.value]));
  return `${parts.day}/${parts.month}/${parts.year} · ${parts.hour}:${parts.minute}`;
};
const fmtScheduled = (date,time) => {
  if(!date) return 'Sin fecha';
  const [y,m,d]=date.split('-');
  return `${d}/${m}/${y}${time?' · '+time:''}`;
};
const money=n=>'S/ '+Number(n||0).toLocaleString('es-PE',{maximumFractionDigits:2});
const money2=n=>'S/ '+Number(n||0).toLocaleString('es-PE',{minimumFractionDigits:2,maximumFractionDigits:2});
const roundMoney=n=>Math.round((Number(n||0)+Number.EPSILON)*100)/100;
const escapeHtml = s => String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const initials = name => String(name||'CL').trim().split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase();

let clients = [];
let quotes = [];
let followups = [];
let reservations = [];
let movements = [];
let recurringSeries = [];
let auditLog = [];
let approvalRequests = [];
let recurringDraftBlocks=[];
let recurringDraftSeq=0;
let editingRecurringSeriesId=null, recurringEditScope=null, recurringEditBlockId=null, recurringEditEffectiveDate=null, seriesManagerCurrentId=null;
let receivableDashboardFilter='all', receivableDashboardRange=null, receivableClientId=null, clientPaymentClientId=null, clientCreditClientId=null, clientPaymentReturnClientId=null, clientPaymentReturnMode=null;
let pendingTab='receivable', pendingSort='priority', billingPaymentId=null, receivableReturnMode='dashboard';
let editingBillingProfileId=null,billingProfileClientId=null,billingProfileReturnMode=null,billingProfileReturnPaymentId=null;
let reportTab='sales', reportInitialized=false, reportCurrentData=null;
let controlTab='approvals', rolePreviewId=null, userMasterDraft=[];
let accessConfigTab='users', accessPermissionRoleId='supervisor';
let settings = {fut6:50,fut9:120,exclusive:2000,guarantee:300,extraHour:180,discount:200,conditions:''};

const ROLE_DEFS={
  admin:{name:'Administrador general',short:'Administrador',homeTitle:'Ventas y reservas',permissions:['*'],nav:[['home','Inicio','⌂'],['pending','Pendientes','◷'],['action','+','+'],['reservations','Reservas','▦'],['more','Más','•••']]},
  director:{name:'Director / Dueño',short:'Director',homeTitle:'Resumen ejecutivo',permissions:['view_dashboard','view_reservations','view_pending','view_reports','view_cash','view_history','view_audit','view_control','view_clients','view_quotes','view_followups','approve_sensitive'],nav:[['home','Resumen','⌂'],['reports','Análisis','▥'],['control','Control','✓'],['pending','Pendientes','◷'],['more','Más','•••']]},
  supervisor:{name:'Supervisor operativo',short:'Supervisor',homeTitle:'Control operativo',permissions:['view_dashboard','view_reservations','manage_reservations','view_pending','view_control','view_cash','view_reports','view_history','view_clients','manage_clients','view_quotes','manage_quotes','view_followups','manage_followups','register_payments','reconcile_payments','register_expenses','approve_expenses','manage_treasury','issue_billing','approve_sensitive'],nav:[['home','Inicio','⌂'],['control','Control','✓'],['action','+','+'],['reservations','Reservas','▦'],['more','Más','•••']]},
  shift:{name:'Encargado de turno',short:'Encargado',homeTitle:'Mi turno',permissions:['view_dashboard','view_reservations','manage_reservations','view_pending','view_clients','manage_clients','register_payments','register_expenses'],nav:[['home','Hoy','⌂'],['reservations','Reservas','▦'],['action','+','+'],['pending','Cobros','◷'],['more','Más','•••']]},
  sales:{name:'Ventas / Comercial',short:'Ventas',homeTitle:'Comercial',permissions:['view_dashboard','view_reservations','manage_reservations','view_pending','view_clients','manage_clients','view_quotes','manage_quotes','view_followups','manage_followups','register_payments'],nav:[['home','Inicio','⌂'],['follow','Seguimientos','▤'],['action','+','+'],['reservations','Reservas','▦'],['more','Más','•••']]},
  finance:{name:'Finanzas / Contabilidad',short:'Finanzas',homeTitle:'Finanzas',permissions:['view_dashboard','view_pending','view_control','view_cash','view_reports','view_history','view_clients','register_payments','reconcile_payments','register_expenses','approve_expenses','manage_treasury','issue_billing'],nav:[['home','Inicio','⌂'],['pending','Pendientes','◷'],['control','Control','✓'],['reports','Reportes','▥'],['more','Más','•••']]}
};
const PERMISSION_CATALOG=[
  {group:'Pantallas',items:[['view_dashboard','Ver Inicio','Dashboard según perfil'],['view_reservations','Ver Reservas','Agenda, canchas y lista'],['view_pending','Ver Pendientes','Cobranza y comprobantes'],['view_control','Ver Control','Bandeja de supervisión'],['view_reports','Ver Reportes','Ventas, caja, gastos y CPE'],['view_cash','Ver Caja / Tesorería','Saldos y movimientos'],['view_history','Ver Historial','Actividad operativa'],['view_audit','Ver Auditoría','Antes → después y usuario']]},
  {group:'Clientes y comercial',items:[['view_clients','Ver clientes','Directorio y fichas'],['manage_clients','Gestionar clientes','Crear y editar clientes'],['view_quotes','Ver cotizaciones','Acceso comercial'],['manage_quotes','Gestionar cotizaciones','Crear y editar'],['view_followups','Ver seguimientos','Pendientes comerciales'],['manage_followups','Gestionar seguimientos','Crear, editar y cerrar']]},
  {group:'Reservas y cobros',items:[['manage_reservations','Gestionar reservas','Crear, editar y estados'],['register_payments','Registrar cobros','Pagos parciales o completos'],['reconcile_payments','Conciliar pagos','Validar banco/Yape/Plin'],['approve_sensitive','Aprobar excepciones','Cancelaciones pagadas y devoluciones']]},
  {group:'Gastos y tesorería',items:[['register_expenses','Registrar gastos','Crear gastos y adjuntos'],['approve_expenses','Aprobar gastos','Sustentar, observar o regularizar'],['manage_treasury','Gestionar tesorería','Rendiciones y transferencias internas'],['issue_billing','Emitir comprobantes','Boleta/factura preparada']]},
  {group:'Configuración',items:[['manage_settings','Editar Masters','Tarifas, métodos, cuentas y reglas base'],['manage_access','Administrar accesos','Usuarios, roles y permisos']]}
];
function ensureAccessSettings(){
  if(!settings.roleOverrides||typeof settings.roleOverrides!=='object')settings.roleOverrides={};
  if(!Array.isArray(settings.customRoles))settings.customRoles=[];
  if(!settings.approvalRules||typeof settings.approvalRules!=='object')settings.approvalRules={};
  const a=settings.approvalRules;
  if(typeof a.paidReservationOutcome!=='boolean')a.paidReservationOutcome=true;
  if(!Number.isFinite(Number(a.paidReservationApprovalLimit)))a.paidReservationApprovalLimit=0;
  if(typeof a.preventSelfApproval!=='boolean')a.preventSelfApproval=true;
  if(typeof a.expenseApprovalEnabled!=='boolean')a.expenseApprovalEnabled=false;
  if(!Number.isFinite(Number(a.expenseApprovalThreshold)))a.expenseApprovalThreshold=200;
  if(typeof a.expenseWithoutProofPending!=='boolean')a.expenseWithoutProofPending=true;
  if(!settings.controlRules||typeof settings.controlRules!=='object')settings.controlRules={};
  const c=settings.controlRules;
  if(typeof c.reconcileDigitalPayments!=='boolean')c.reconcileDigitalPayments=true;
  if(typeof c.reconcileCashPayments!=='boolean')c.reconcileCashPayments=false;
  if(!Number.isFinite(Number(c.overdueAlertDays)))c.overdueAlertDays=1;
  if(!c.defaultUserRole)c.defaultUserRole='shift';
}
function cloneRoleDef(r){return {...r,permissions:[...(r.permissions||[])],nav:(r.nav||[]).map(x=>[...x])}}
function roleCatalog(){
  ensureAccessSettings();const out={};
  Object.entries(ROLE_DEFS).forEach(([id,b])=>{const o=settings.roleOverrides[id]||{},r=cloneRoleDef(b);out[id]={...r,...o,id,baseRole:id,permissions:id==='admin'?['*']:(Array.isArray(o.permissions)?[...o.permissions]:[...r.permissions]),nav:(r.nav||[]).map(x=>[...x])}});
  settings.customRoles.forEach(c=>{if(!c||!c.id)return;const base=out[c.baseRole]||out.shift;out[c.id]={id:c.id,name:c.name||'Rol personalizado',short:c.short||c.name||'Rol',homeTitle:c.homeTitle||base.homeTitle,baseRole:c.baseRole||'shift',permissions:Array.isArray(c.permissions)?[...c.permissions]:[...(base.permissions||[])],nav:(base.nav||[]).map(x=>[...x]),custom:true}});
  return out
}
function defaultUsers(){return []}
function ensureUsers(){if(!Array.isArray(settings.users))settings.users=[];}
function sessionState(){return {user:window.ElevaSessionUser||null}}
function currentUser(){return sessionState().user}
function currentRoleId(){return currentUser()?.role||'guest'}
function currentRole(){return roleCatalog()[currentRoleId()]||{name:'Sin acceso',short:'Sin acceso',homeTitle:'Eleva Sport',permissions:[],nav:ROLE_DEFS.shift.nav,baseRole:'shift'}}
function currentRoleBaseId(){return currentRole().baseRole||currentRoleId()}
function hasPermission(permission){const u=window.ElevaSessionUser;if(!u?.active)return false;const p=roleCatalog()[u.role]?.permissions||[];return u.role==='admin'||p.includes(permission)}
function requirePermission(permission,msg='No tienes permiso para esta acción'){if(hasPermission(permission))return true;showToast(msg);return false}
function actorName(){return currentUser()?.name||'Usuario EV'}
function actorRoleName(){return currentRole().name}
function roleCanViewPage(name){
  const map={home:'view_dashboard',reservations:'view_reservations',pending:'view_pending',reports:'view_reports',control:'view_control',follow:'view_followups',quotes:'view_quotes',more:'view_dashboard'};
  const perm=map[name];return !perm||hasPermission(perm)
}
function roleDefaultPage(){return 'home'}
function initialPaymentReconciliationStatus(method){ensureAccessSettings();const c=settings.controlRules||{},cash=/efectivo/i.test(String(method||''));if(cash&&!c.reconcileCashPayments)return 'not_required';if(!cash&&!c.reconcileDigitalPayments)return 'not_required';return 'pending'}
function controlOverdueReservations(){ensureAccessSettings();const days=Math.max(0,Number(settings.controlRules.overdueAlertDays||0)),today=parseDashDate(localDateValue());return reservations.filter(r=>{if(!dashSaleActive(r)||Number(r.balance||0)<=0)return false;const due=parseDashDate(reservationDueDate(r));return Math.floor((today-due)/86400000)>=Math.max(1,days)})}

function ensureTaxSettings(){
  if(!settings.taxConfig||typeof settings.taxConfig!=='object')settings.taxConfig={taxRate:18,pricesIncludeTax:true,boletaSeries:'B001',facturaSeries:'F001'};
  if(!Number.isFinite(Number(settings.taxConfig.taxRate)))settings.taxConfig.taxRate=18;
  if(typeof settings.taxConfig.pricesIncludeTax!=='boolean')settings.taxConfig.pricesIncludeTax=true;
  if(!settings.taxConfig.boletaSeries)settings.taxConfig.boletaSeries='B001';
  if(!settings.taxConfig.facturaSeries)settings.taxConfig.facturaSeries='F001';
}
function billingTaxBreakdown(total){ensureTaxSettings();const rate=Math.max(0,Number(settings.taxConfig.taxRate||0)),gross=Math.max(0,Number(total||0));if(!rate)return {base:gross,tax:0,total:gross,rate};if(settings.taxConfig.pricesIncludeTax){const base=gross/(1+rate/100);return {base:roundMoney(base),tax:roundMoney(gross-base),total:roundMoney(gross),rate}}const tax=roundMoney(gross*rate/100);return {base:roundMoney(gross),tax,total:roundMoney(gross+tax),rate}}
function billingBreakdownForPayment(m){const apps=paymentApplications(m);if(!apps.length)return billingTaxBreakdown(m?.amount||0);let base=0,tax=0,total=0,rate=0;apps.forEach(a=>{const r=reservationById(a.reservationId),amt=Math.max(0,Number(a.amount||0));if(!r||!amt)return;const rt=Number(r.total||0)||1,ratio=Math.min(1,amt/rt),rBase=Number(r.baseTotal!==undefined?r.baseTotal:Math.max(0,Number(r.total||0)-Number(r.taxAmount||0)-Number(r.nonTaxableExtra||0))),rTax=Number(r.taxAmount||0),rExtra=Number(r.nonTaxableExtra||0);base+=rBase*ratio+rExtra*ratio;tax+=rTax*ratio;total+=amt;if(r.taxApplied)rate=Number(r.taxRate||rate||18)});const unapplied=paymentUnappliedAmount(m);if(unapplied>0){base+=unapplied;total+=unapplied}return {base:roundMoney(base),tax:roundMoney(tax),total:roundMoney(total),rate:rate||Number(settings.taxConfig.taxRate||18)}}
function nextBillingNumber(type){ensureTaxSettings();const series=type==='Factura'?settings.taxConfig.facturaSeries:settings.taxConfig.boletaSeries;let max=0;movements.forEach(m=>{if(!m.billingNumber)return;const [s,n]=String(m.billingNumber).split('-');if(s===series)max=Math.max(max,Number(n)||0)});return `${series}-${String(max+1).padStart(6,'0')}`}

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
  reservationConfirmation:'Hola {cliente}. Te compartimos la confirmación de tu reserva en Eleva Sport.\n\n{codigo}\n{fecha}\n{horario}\n{detalle}\nTotal: {total}\nCobrado: {pagado}\nSaldo: {saldo}\n\nEleva Sport - Trujillo'
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
const defaultExpenseCategories=()=>[
  {id:'exp_personal',name:'Personal',active:true},
  {id:'exp_maintenance',name:'Mantenimiento',active:true},
  {id:'exp_services',name:'Servicios',active:true},
  {id:'exp_cleaning',name:'Limpieza',active:true},
  {id:'exp_marketing',name:'Marketing',active:true},
  {id:'exp_security',name:'Seguridad',active:true},
  {id:'exp_supplies',name:'Insumos / compras operativas',active:true},
  {id:'exp_admin',name:'Administración',active:true},
  {id:'exp_taxes',name:'Impuestos / comisiones',active:true},
  {id:'exp_other',name:'Otros',active:true}
];
const defaultExpenseAreas=()=>[
  {id:'area_general',name:'General Eleva',active:true},
  {id:'area_courts',name:'Canchas',active:true},
  {id:'area_academy',name:'Academia / Formación Eleva',active:true},
  {id:'area_events',name:'Eventos',active:true},
  {id:'area_store',name:'Tienda',active:true},
  {id:'area_infra',name:'Infraestructura',active:true}
];
function ensureExpenseMasters(){
  const clean=(arr,defs,prefix)=>{if(!Array.isArray(arr)||!arr.length)return cloneData(defs);const seen=new Set();const out=arr.map((x,i)=>({id:String(x&&x.id||`${prefix}_${i+1}`),name:String(x&&x.name||'').trim(),active:x&&x.active!==false})).filter(x=>x.name&&!seen.has(x.id)&&(seen.add(x.id),true));return out.length?out:cloneData(defs)};
  settings.expenseCategories=clean(settings.expenseCategories,defaultExpenseCategories(),'expc');settings.expenseAreas=clean(settings.expenseAreas,defaultExpenseAreas(),'expa');
}
function activeExpenseCategories(){ensureExpenseMasters();return settings.expenseCategories.filter(x=>x.active)}
function activeExpenseAreas(){ensureExpenseMasters();return settings.expenseAreas.filter(x=>x.active)}
function expenseCategoryById(id){ensureExpenseMasters();return settings.expenseCategories.find(x=>String(x.id)===String(id))||null}
function expenseAreaById(id){ensureExpenseMasters();return settings.expenseAreas.find(x=>String(x.id)===String(id))||null}
function expenseCategoryName(m){if(!m)return 'Sin categoría';const cur=m.categoryId?expenseCategoryById(m.categoryId):null;return cur?.name||m.category||'Sin categoría'}
function expenseAreaName(m){if(!m)return 'General / histórico';const cur=m.areaId?expenseAreaById(m.areaId):null;return cur?.name||m.area||'General / histórico'}
const defaultTreasuryAccounts=()=>[
  {id:'acc_cash',name:'Caja Eleva',kind:'company',active:true,openingBalance:0},
  {id:'acc_bcp',name:'BCP Eleva',kind:'company',active:true,openingBalance:0},
  {id:'acc_yape',name:'Yape Eleva',kind:'company',active:true,openingBalance:0},
  {id:'cust_admin_cash',name:'Administrador · Efectivo por rendir',kind:'custody',active:true,openingBalance:0},
  {id:'cust_admin_plin',name:'Administrador · Plin por rendir',kind:'custody',active:true,openingBalance:0},
  {id:'acc_unassigned',name:'Sin asignar histórico',kind:'company',active:false,openingBalance:0}
];
function ensureTreasuryAccounts(){if(!Array.isArray(settings.treasuryAccounts))settings.treasuryAccounts=[];}
function treasuryAccounts(activeOnly=false){ensureTreasuryAccounts();return settings.treasuryAccounts.filter(a=>!activeOnly||a.active)}
function treasuryAccountById(id){ensureTreasuryAccounts();return settings.treasuryAccounts.find(a=>String(a.id)===String(id))||null}
function treasuryAccountLabel(id){return treasuryAccountById(id)?.name||'Sin asignar'}
function defaultTreasuryAccountForMethod(method){
  ensureTreasuryAccounts();const m=String(method||'').toLocaleLowerCase('es-PE');let candidates=['acc_unassigned'];
  if(m.includes('efectivo'))candidates=['acc_cash'];else if(m.includes('yape'))candidates=['acc_yape','acc_bcp'];else if(m.includes('plin'))candidates=['cust_admin_plin','acc_bcp'];else if(m.includes('transfer')||m.includes('bcp')||m.includes('pos'))candidates=['acc_bcp'];
  for(const id of candidates){const a=treasuryAccountById(id);if(a&&a.active)return id}
  const active=treasuryAccounts(true),named=pattern=>active.find(a=>pattern.test(a.name.toLocaleLowerCase('es-PE')))?.id;
  if(m.includes('efectivo'))return named(/caja|efectivo/)||'';
  if(m.includes('yape'))return named(/yape/)||named(/banco|bcp|interbank|bbva|scotiabank/)||'';
  if(m.includes('plin'))return named(/plin/)||named(/banco|bcp|interbank|bbva|scotiabank/)||'';
  if(m.includes('transfer')||m.includes('bcp')||m.includes('pos'))return named(/banco|bcp|interbank|bbva|scotiabank/)||'';
  return ''
}
function movementAccountId(m){return m&&m.accountId||(defaultTreasuryAccountForMethod(m&&m.method||'No especificado')||'acc_unassigned')}
function fillTreasuryAccountSelect(select,preferred='',kind='all'){
  if(!select)return;let arr=treasuryAccounts(true);if(kind==='company')arr=arr.filter(a=>a.kind==='company');if(kind==='custody')arr=arr.filter(a=>a.kind==='custody');select.innerHTML=`<option value="">${arr.length?'Selecciona dónde quedó el dinero':'No hay cuentas activas configuradas'}</option>`+arr.map(a=>`<option value="${escapeHtml(a.id)}">${escapeHtml(a.name)}${a.kind==='custody'?' · por rendir':''}</option>`).join('');select.disabled=!arr.length;if(preferred&&arr.some(a=>a.id===preferred))select.value=preferred
}
function treasuryAccountHelp(id){const a=treasuryAccountById(id);if(!treasuryAccounts(true).length)return 'No hay cuentas activas. El administrador general debe configurarlas en Masters → Cuentas y custodia antes de registrar el movimiento.';if(!a||!a.active)return 'Selecciona la cuenta o persona que recibió el dinero.';return a.kind==='custody'?'Este dinero queda bajo custodia y aparecerá como pendiente de rendir a Eleva.':'Este dinero queda registrado directamente dentro de los fondos de Eleva.'}
function validateTreasuryAccount(id){if(treasuryAccountById(id)?.active)return true;showToast(treasuryAccounts(true).length?'Selecciona una cuenta activa donde quedó el dinero':'No hay cuentas activas. Solicita al administrador que configure Cuentas y custodia.');return false}
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
ensureExpenseMasters();
const defaultOperatingSchedule=()=>({0:{active:true,open:'08:00',close:'00:00'},1:{active:true,open:'08:00',close:'00:00'},2:{active:true,open:'08:00',close:'00:00'},3:{active:true,open:'08:00',close:'00:00'},4:{active:true,open:'08:00',close:'00:00'},5:{active:true,open:'08:00',close:'00:00'},6:{active:true,open:'08:00',close:'00:00'}});
function ensureOperatingSchedule(){
  if(!settings.schedule||typeof settings.schedule!=='object')settings.schedule=defaultOperatingSchedule();
  const def=defaultOperatingSchedule();for(let i=0;i<7;i++){if(!settings.schedule[i])settings.schedule[i]=def[i];settings.schedule[i].active=settings.schedule[i].active!==false;settings.schedule[i].open=settings.schedule[i].open||'08:00';settings.schedule[i].close=settings.schedule[i].close||'00:00'}
}
ensureOperatingSchedule();
ensureUsers();

let selectedClient=null, afterClientCreate=false, afterReservationClientCreate=false, quoteMode='exclusive', editingClientId=null, reservationRateManual=false, editingReservationId=null, shareReservationId=null, reservationFilter='upcoming', reservationWorkspace='agenda', reservationFocusDate=localDateValue(), reservationCourtFocus='Cancha 1', courtBookingMode='single';
let quotePackageDraft=cloneData(settings.exclusivePackage);
let quoteFilter='all', followFilter='pending', homeReservationFilter='all', homePeriod='month', homeCustomStart='', homeCustomEnd='', openQuoteId=null, openFollowId=null, preselectQuoteId=null, openReservationId=null, reservationKind=null, preselectReservationQuoteId=null, calendarQuickSlot=null;
let homeAnchorDate=localDateValue();
let quoteConversionContext=null;
let calendarCursor=new Date(), calendarSelectedDate=localDateValue(), calendarView='day', reservationDatePickerMode=false;
let cashFilter='all', movementFormType='expense';
let expenseCategoriesDraft=[], expenseAreasDraft=[], expenseAnalysisMode='category';
let paymentMethodsDraft=[];
let treasuryAccountsDraft=[];
let pendingPaymentAttachment=null,pendingMovementAttachment=null,pendingClientPaymentAttachment=null,attachmentViewerUrl=null;
function persist(){ if(!window.ElevaBridge?.mutation) throw new Error('La escritura requiere una acción autenticada'); window.ElevaBridge.dirty=true; }
async function storeAttachmentFile(){throw new Error('La conexión de archivos aún no está lista.');}
async function getAttachmentFile(){throw new Error('La conexión de archivos aún no está lista.');}
function attachmentState(context){if(context==='payment')return pendingPaymentAttachment;if(context==='clientPayment')return pendingClientPaymentAttachment;return pendingMovementAttachment}
function setAttachmentState(context,value){if(context==='payment')pendingPaymentAttachment=value;else if(context==='clientPayment')pendingClientPaymentAttachment=value;else pendingMovementAttachment=value}
function attachmentElements(context){const p=context==='payment'?'payment':(context==='clientPayment'?'clientPayment':'movement');return {name:document.getElementById(p+'AttachmentName'),preview:document.getElementById(p+'AttachmentPreview'),camera:document.getElementById(p+'CameraInput'),file:document.getElementById(p+'FileInput')}}
function resetPendingAttachment(context){const current=attachmentState(context);if(current&&current.url)URL.revokeObjectURL(current.url);setAttachmentState(context,null);const e=attachmentElements(context);if(e.name)e.name.textContent='Sin foto';if(e.preview){e.preview.innerHTML='';e.preview.classList.add('hidden')}if(e.camera)e.camera.value='';if(e.file)e.file.value=''}
function handleAttachmentSelection(context,input){
  const file=input&&input.files&&input.files[0];if(!file)return;const type=String(file.type||''),isImage=type.startsWith('image/'),isPdf=type==='application/pdf';if(!isImage&&!isPdf){showToast('Selecciona una imagen o PDF');input.value='';return}if(file.size>15*1024*1024){showToast('El archivo supera 15 MB');input.value='';return}
  const previous=attachmentState(context);if(previous&&previous.url)URL.revokeObjectURL(previous.url);const url=URL.createObjectURL(file);setAttachmentState(context,{file,url});const e=attachmentElements(context);if(e.name)e.name.textContent=file.name||'Archivo seleccionado';if(e.preview){e.preview.classList.remove('hidden');e.preview.innerHTML=`${isImage?`<img src="${url}" alt="Comprobante seleccionado">`:`<div style="font-size:28px">PDF</div>`}<div><b>${escapeHtml(file.name||'Archivo')}</b><span>${Math.max(1,Math.round(file.size/1024))} KB</span></div><button type="button" class="attachment-clear" onclick="resetPendingAttachment('${context}')">Quitar</button>`}
}
async function persistPendingAttachment(context){const state=attachmentState(context);if(!state||!state.file)return null;return await storeAttachmentFile(state.file)}
async function openMovementAttachment(id){
  const m=movements.find(x=>String(x.id)===String(id));if(!m||!m.attachmentId){showToast('Este movimiento no tiene comprobante');return}
  try{const rec=await getAttachmentFile(m.attachmentId);if(!rec||!rec.blob){showToast('No se encontró el comprobante');return}if(rec.type==='application/pdf'){const url=URL.createObjectURL(rec.blob),w=window.open(url,'_blank');if(!w)showToast('Permite ventanas emergentes para abrir el PDF');setTimeout(()=>URL.revokeObjectURL(url),60000);return}if(attachmentViewerUrl)URL.revokeObjectURL(attachmentViewerUrl);attachmentViewerUrl=URL.createObjectURL(rec.blob);attachmentViewerImage.src=attachmentViewerUrl;attachmentViewerTitle.textContent=m.type==='payment'?'Comprobante de cobro':'Comprobante';attachmentViewerMeta.textContent=`${m.code||''}${m.method?' · '+m.method:''}${m.attachmentName?' · '+m.attachmentName:''}`;openSheet('attachmentViewerSheet')}catch(e){showToast('No se pudo abrir el comprobante')}
}
function closeAttachmentViewer(){closeSheet('attachmentViewerSheet');if(attachmentViewerUrl){URL.revokeObjectURL(attachmentViewerUrl);attachmentViewerUrl=null}attachmentViewerImage.removeAttribute('src')}

function cleanupLegacyDemoDataV14(){}

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
  if(!roleCanViewPage(name)){showToast('Este perfil no tiene acceso a esta sección');name=roleDefaultPage()}
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.querySelectorAll('.nav > button,.nav > div > button').forEach(b=>b.classList.remove('active'));
  const view=document.getElementById('view-'+name);if(!view)return;view.classList.add('active');
  const config=currentRole().nav||[];let idx=config.findIndex(x=>x[0]===name);if(idx<0&&['follow','quotes','reports'].includes(name))idx=config.findIndex(x=>x[0]==='more');if(idx>=0){const id=idx===2?'nav-center':`nav-slot-${idx}`;document.getElementById(id)?.classList.add('active')}
  if(name==='home'){renderHome();renderRoleHomePanel();} if(name==='quotes')renderQuotes(); if(name==='follow')renderFollowups(); if(name==='pending')renderPendingView(); if(name==='reservations')renderReservationWorkspace(); if(name==='reports')renderReports(); if(name==='control')renderControl();
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
  const max=Math.max(0,...reservations.filter(r=>/^RS-/.test(String(r.code||''))).map(r=>Number(String(r.code||'').replace(/\D/g,''))||0));
  return 'RS-'+String(max+1).padStart(4,'0');
}
function nextOccupancyCode(){
  const max=Math.max(0,...reservations.filter(r=>/^OC-/.test(String(r.code||''))).map(r=>Number(String(r.code||'').replace(/\D/g,''))||0));
  return 'OC-'+String(max+1).padStart(4,'0');
}
function internalUseTypeLabel(value){return ({activity:'Actividad propia Eleva',courtesy:'Cortes\u00eda / uso sin cobro',maintenance:'Bloqueo operativo / mantenimiento'})[value]||'Uso interno'}
function isInternalReservation(r){return !!r&&r.reservationKind==='internal'}
function reservationDisplayName(r){if(isInternalReservation(r))return r.internalTitle||internalUseTypeLabel(r.internalUseType);const c=clientById(r?.clientId);return c?.name||'Cliente'}
function reservationKindLabel(r){const k=r?.reservationKind||(r?.space==='Local exclusivo'?'exclusive':'court');if(k==='internal')return internalUseTypeLabel(r.internalUseType);if(k==='exclusive')return 'Evento exclusivo';return 'Alquiler de cancha'}
function nextRecurringSeriesCode(){const max=Math.max(0,...recurringSeries.map(x=>Number(String(x.code||'').replace(/\D/g,''))||0));return 'SR-'+String(max+1).padStart(4,'0')}
function nextMovementCode(){const max=Math.max(0,...movements.map(m=>Number(String(m.code||'').replace(/\D/g,''))||0));return 'MOV-'+String(max+1).padStart(4,'0')}
function openActions(){applyActionPermissions();openSheet('actionSheet')}

function openNewClient(fromQuote,fromReservation=false){if(!requirePermission('manage_clients'))return;
  afterClientCreate=!!fromQuote;afterReservationClientCreate=!!fromReservation;editingClientId=null;
  if(document.getElementById('selectClientSheet').classList.contains('show'))closeSheet('selectClientSheet');
  ['cName','cPhone','cCompany','cDoc','cEmail','cNotes','cRateFut6','cRateFut9'].forEach(id=>{const el=document.getElementById(id);if(el)el.value=''});
  if(document.getElementById('clientFormTitle'))clientFormTitle.textContent='Nuevo cliente';
  if(document.getElementById('clientSaveBtn'))clientSaveBtn.textContent='Crear cliente';
  openSheet('clientSheet');
}
function openEditClient(id){
  const c=clientById(id);if(!c)return;editingClientId=c.id;afterClientCreate=false;afterReservationClientCreate=false;
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
    const c=clientById(editingClientId);if(!c)return;const before=clientAuditSnapshot(c);
    Object.assign(c,{name,phone:cPhone.value.trim(),company:cCompany.value.trim(),doc:cDoc.value.trim(),email:cEmail.value.trim(),notes:cNotes.value.trim(),specialFut6,specialFut9,updatedAt:nowISO()});
    const changes=clientAuditChanges(before,clientAuditSnapshot(c));if(changes.length)addAuditEvent('client',c.id,c.name,'Cliente actualizado',changes);
    persist();editingClientId=null;closeSheet('clientSheet');renderDirectory();renderClientOptions();if(openClientProfileId)renderClientProfile();showToast('Cliente actualizado');return
  }
  const c={id:crypto.randomUUID(),name,phone:cPhone.value.trim(),company:cCompany.value.trim(),doc:cDoc.value.trim(),email:cEmail.value.trim(),notes:cNotes.value.trim(),specialFut6,specialFut9,createdAt:nowISO()};
  clients.unshift(c);addAuditEvent('client',c.id,c.name,'Cliente creado',[],[c.phone,c.company].filter(Boolean).join(' · '));persist();selectedClient=c;closeSheet('clientSheet');showToast('Cliente creado');
  if(afterReservationClientCreate){
    afterReservationClientCreate=false;
    if(document.getElementById('rClient')){
      rClient.innerHTML=clients.map(x=>`<option value="${x.id}">${escapeHtml(x.name)}</option>`).join('');
      rClient.value=String(c.id);syncReservationClientSearch();hideReservationClientSearchResults();onReservationClientChange();
      setTimeout(()=>document.getElementById('rClientSearch')?.focus(),80);
    }
  }
  if(afterClientCreate){afterClientCreate=false;openQuoteFor(c)}
}

function clientBillingProfiles(c){return Array.isArray(c?.billingProfiles)?c.billingProfiles:[]}
function billingProfileMeta(p){return `${p.docType||''}${p.docNumber?' '+p.docNumber:''}`.trim()||'Sin documento'}
function renderClientBillingProfiles(){
  const host=document.getElementById('clientBillingProfiles'),c=clientById(openClientProfileId);if(!host||!c)return;const arr=clientBillingProfiles(c);
  host.innerHTML=arr.length?arr.map(p=>`<div class="billing-profile-row"><div class="billing-profile-row-main"><b>${escapeHtml(p.name||'Receptor')}</b><span>${escapeHtml((p.kind==='company'?'Empresa · ':'Persona · ')+billingProfileMeta(p))}</span></div><button onclick="openBillingProfileEditor('${String(c.id)}','${String(p.id)}','client')">Editar</button></div>`).join(''):'<div class="client-billing-empty">Aún no hay perfiles tributarios. Agrégalos cuando necesites emitir boleta o factura a un receptor específico.</div>'
}
function openBillingProfileEditor(clientId,profileId=null,returnMode='client'){
  const c=clientById(clientId);if(!c)return;billingProfileClientId=c.id;editingBillingProfileId=profileId;billingProfileReturnMode=returnMode;billingProfileReturnPaymentId=returnMode==='billing'?billingPaymentId:null;
  if(returnMode==='client')closeSheet('clientProfileSheet');else if(returnMode==='billing')closeSheet('billingSheet');
  const p=profileId?clientBillingProfiles(c).find(x=>String(x.id)===String(profileId)):null;
  document.getElementById('billingProfileTitle').textContent=p?'Editar receptor':'Nuevo receptor';
  document.getElementById('bpKind').value=p?.kind||'person';document.getElementById('bpName').value=p?.name||(p?.kind==='company'?'':c.name||'');document.getElementById('bpDocType').value=p?.docType||(p?.kind==='company'?'RUC':'DNI');document.getElementById('bpDocNumber').value=p?.docNumber||'';document.getElementById('bpEmail').value=p?.email||c.email||'';document.getElementById('bpAddress').value=p?.address||'';syncBillingProfileKind();openSheet('billingProfileSheet')
}
function syncBillingProfileKind(){const kind=document.getElementById('bpKind')?.value||'person',sel=document.getElementById('bpDocType');document.getElementById('bpNameLabel').innerHTML=kind==='company'?'Razón social <span class="req">*</span>':'Nombre completo <span class="req">*</span>';if(kind==='company'){sel.value='RUC';[...sel.options].forEach(o=>o.disabled=o.value!=='RUC')}else{[...sel.options].forEach(o=>o.disabled=false);if(sel.value==='RUC')sel.value='DNI'}}
function closeBillingProfileEditor(){closeSheet('billingProfileSheet');const mode=billingProfileReturnMode,pay=billingProfileReturnPaymentId,cid=billingProfileClientId;billingProfileReturnMode=null;if(mode==='billing'&&pay)setTimeout(()=>openBillingSheet(pay),40);else if(mode==='client'&&cid)setTimeout(()=>openClientProfile(cid),40)}
function saveBillingProfile(){
  const c=clientById(billingProfileClientId);if(!c)return;const kind=document.getElementById('bpKind').value,name=document.getElementById('bpName').value.trim(),docType=document.getElementById('bpDocType').value,docNumber=document.getElementById('bpDocNumber').value.trim();if(!name){showToast('Ingresa el nombre o razón social');return}if(!docNumber){showToast('Ingresa el documento');return}if(kind==='company'&&(!/^\d{11}$/.test(docNumber)||docType!=='RUC')){showToast('Para empresa ingresa un RUC válido de 11 dígitos');return}
  if(!Array.isArray(c.billingProfiles))c.billingProfiles=[];const data={kind,name,docType,docNumber,email:document.getElementById('bpEmail').value.trim(),address:document.getElementById('bpAddress').value.trim(),updatedAt:nowISO()};
  if(editingBillingProfileId){const p=c.billingProfiles.find(x=>String(x.id)===String(editingBillingProfileId));if(p){const before=cloneData(p);Object.assign(p,data);const ch=auditDiff(before,p,[['name','Receptor'],['docType','Tipo documento'],['docNumber','Documento'],['email','Correo'],['address','Dirección']]);if(ch.length)addAuditEvent('client',c.id,c.name,'Perfil tributario actualizado',ch)}}else{const np={id:crypto.randomUUID(),...data,createdAt:nowISO()};c.billingProfiles.push(np);addAuditEvent('client',c.id,c.name,'Perfil tributario agregado',[],`${np.name} · ${np.docType} ${np.docNumber}`)}persist();showToast('Datos de facturación guardados');closeBillingProfileEditor()
}
function openBillingProfileFromIssue(){const m=movements.find(x=>String(x.id)===String(billingPaymentId));if(!m)return;const c=paymentClient(m);openBillingProfileEditor(c.id,null,'billing')}

function startQuote(){if(!requirePermission('manage_quotes'))return;renderClientOptions();openSheet('selectClientSheet')}
function renderClientOptions(){
  const q=(document.getElementById('clientSearch')?.value||'').toLowerCase();
  const arr=clients.filter(c=>(c.name+' '+(c.phone||'')+' '+(c.company||'')).toLowerCase().includes(q));
  clientOptions.innerHTML=arr.length?arr.map(c=>`<button class="client-option" onclick="chooseClient('${c.id}')"><div class="initials">${initials(c.name)}</div><div style="min-width:0;flex:1"><div style="font-weight:900">${escapeHtml(c.name)}</div><div class="lead-meta">${escapeHtml(c.phone||c.company||'Sin datos adicionales')}</div></div><div style="font-size:20px;color:#93a0aa">›</div></button>`).join(''):'<div class="empty">No encontramos clientes.</div>';
}
function chooseClient(id){const c=clientById(id);if(!c)return;selectedClient=c;closeSheet('selectClientSheet');openQuoteFor(c)}
function openQuoteFor(c){
  selectedClient=c;qInitials.textContent=initials(c.name);qClientName.textContent=c.name;qClientMeta.textContent=c.phone||c.company||'Sin teléfono';
  packagePrice.value=settings.exclusive; courtType.options[0].value=settings.fut6; courtType.options[1].value=settings.fut9; courtRate.value=quoteMode==='court'?(courtType.selectedIndex===1?settings.fut9:settings.fut6):settings.fut6;
  guarantee.value=settings.guarantee; discount.value=settings.discount; extraHour.value=settings.extraHour;
  quotePackageDraft=cloneData(settings.exclusivePackage);renderQuotePackagePreview();
  
date.value=localDateValue();if(document.getElementById('qApplyIgv'))qApplyIgv.checked=false; calcHours(); recalcQuote(); openSheet('quoteSheet');
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
function quoteTaxCalculation(rent,guaranteeValue,discountValue,applyIgv,rate=18){
  rent=Math.max(0,Number(rent||0));const guarantee=Math.max(0,Number(guaranteeValue||0)),discount=Math.min(rent,Math.max(0,Number(discountValue||0))),taxRate=Math.max(0,Number(rate||0));
  const regularBase=roundMoney(rent),singleBase=roundMoney(Math.max(0,rent-discount));
  const regularTax=applyIgv?roundMoney(regularBase*taxRate/100):0,singleTax=applyIgv?roundMoney(singleBase*taxRate/100):0;
  return {applyIgv:!!applyIgv,taxRate,regularBase,singleBase,regularTax,singleTax,guarantee,discount,regularTotal:roundMoney(regularBase+regularTax+guarantee),singleTotal:roundMoney(singleBase+singleTax+guarantee)}
}
function recalcQuote(){
  ensureTaxSettings();const hours=Number(totalHours.value||0),rent=quoteMode==='exclusive'?Number(packagePrice.value||0):Number(courtRate.value||0)*hours,g=Number(guarantee.value||0),d=Number(discount.value||0),apply=!!document.getElementById('qApplyIgv')?.checked,calc=quoteTaxCalculation(rent,g,d,apply,settings.taxConfig.taxRate||18);
  sumRent.textContent=money(calc.regularBase);sumGuarantee.textContent=money(calc.guarantee);sumDiscount.textContent='− '+money(calc.discount);if(document.getElementById('sumRegular'))sumRegular.textContent=money(calc.regularTotal);sumTotal.textContent=money(calc.singleTotal);
  const row=document.getElementById('sumIgvRow');if(row)row.classList.toggle('hidden',!calc.applyIgv);if(document.getElementById('sumIgvLabel'))sumIgvLabel.textContent=`IGV ${calc.taxRate}%`;if(document.getElementById('sumIgv'))sumIgv.textContent=money2(calc.regularTax);
  const preview=document.getElementById('qTaxPreview');if(preview)preview.innerHTML=`<div><span>Base</span><b>${money2(calc.regularBase)}</b></div><div class="${calc.applyIgv?'tax-on':''}"><span>IGV ${calc.taxRate}%</span><b>${money2(calc.regularTax)}</b></div><div><span>Total alquiler</span><b>${money2(calc.regularBase+calc.regularTax)}</b></div>`
}
function generateQuote(){
  if(!selectedClient){showToast('Selecciona un cliente');return}
  ensureTaxSettings();const id=crypto.randomUUID(), code=nextQuoteCode(), hours=Number(totalHours.value||0),rent=quoteMode==='exclusive'?Number(packagePrice.value||0):Number(courtRate.value||0)*hours,g=Number(guarantee.value||0),d=Number(discount.value||0),applyIgv=!!document.getElementById('qApplyIgv')?.checked,calc=quoteTaxCalculation(rent,g,d,applyIgv,settings.taxConfig.taxRate||18);
  quotes.unshift({id,code,clientId:selectedClient.id,eventType:eventType.value,people:Number(people.value||0),eventDate:date.value,startTime:startTime.value,endTime:endTime.value,hours,mode:quoteMode,courtType:quoteMode==='court'?(courtType.options[courtType.selectedIndex]?.text||'FUT 6'):null,rent:calc.regularBase,guarantee:calc.guarantee,discount:calc.discount,discountConditional:true,applyIgv:calc.applyIgv,taxRate:calc.taxRate,regularBaseTotal:calc.regularBase,regularTaxAmount:calc.regularTax,singleBaseTotal:calc.singleBase,singleTaxAmount:calc.singleTax,extraHour:Number(extraHour.value||0),regularTotal:calc.regularTotal,singlePaymentTotal:calc.singleTotal,total:calc.regularTotal,packageSnapshot:quoteMode==='exclusive'?cloneData(quotePackageDraft):null,status:'pending',createdAt:nowISO()});
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
    <div class="detail-row"><span>Alquiler base</span><b>${money(q.rent)}</b></div>
    ${q.applyIgv?`<div class="detail-row"><span>IGV ${Number(q.taxRate||18)}%</span><b>${money2(Number(q.regularTaxAmount||0))}</b></div>`:`<div class="detail-row"><span>IGV</span><b>No aplicado</b></div>`}
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
  const phone=c.phone||'Sin teléfono registrado',extraHour=Number(q.extraHour??settings.extraHour??180),discount=Number(q.discount||0),guarantee=Number(q.guarantee||0),pay=settings.paymentInfo||defaultPaymentInfo(),rules=pay.rulesUrl||'https://linktr.ee/elevasportperu',applyIgv=!!q.applyIgv,taxRate=Number(q.taxRate||18),taxAmount=Number(q.regularTaxAmount||0);
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
          ${applyIgv?`<div class="q24-calc-row"><span>IGV ${taxRate}% sobre alquiler</span><b>${money2(taxAmount)}</b></div>`:''}
          ${guarantee?`<div class="q24-calc-row guarantee"><span>Garantía reembolsable</span><b>${money(guarantee)}</b></div>`:''}
          ${discount?`<div class="q24-calc-row discount"><span>Descuento por pago único anticipado<div class="q24-discount-note">Aplica únicamente si el importe completo se cancela en una sola operación anticipada. Con IGV activo, el impuesto se recalcula sobre el alquiler después del descuento.</div></span><b>-${money(discount)}</b></div>`:''}
        </div>
      </div>
      <div class="q24-payment"><div class="q24-payment-head"><div class="q24-payment-title">Datos para el pago</div><div class="q24-payment-help">Reserva sujeta a confirmación</div></div><div class="q24-payment-grid"><div><div class="q24-pay-label">Banco ${escapeHtml(pay.bank||'BCP')}</div><div class="q24-pay-main">Cuenta: ${escapeHtml(pay.account||'')}</div><div class="q24-pay-sub">CCI: ${escapeHtml(pay.cci||'')}</div></div><div><div class="q24-pay-label">Yape</div><div class="q24-pay-main">${escapeHtml(pay.yape||'')}</div><div class="q24-pay-name">Titular: ${escapeHtml(pay.holder||'')}</div></div></div><div class="q24-payment-confirm">Una vez realizado el pago, enviar el comprobante al WhatsApp ${escapeHtml(pay.whatsapp||pay.yape||'')} para confirmar la reserva.</div></div>
      <div class="q24-note-box"><div class="q24-note-title">A tener en cuenta</div><div class="q24-note">${applyIgv?`IGV ${taxRate}% aplicado al alquiler / servicio.`:`IGV no aplicado en esta cotización.`}</div><div class="q24-note">Hora adicional: ${money(extraHour)} por hora.</div><div class="q24-note">Ingreso de público hasta 30 minutos antes y cierre 30 minutos después.</div><div class="q24-note">La garantía se devuelve después del evento, previa revisión de las instalaciones.</div><div class="q24-note">No incluye instalación de estrado ni permisos.</div><div class="q24-note">Seguridad y primeros auxilios adicionales corresponden al organizador cuando aplique.</div></div>
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
  const applyIgv=!!q.applyIgv,rate=Number(q.taxRate||18),guarantee=Math.max(0,Number(q.guarantee||0)),rent=Math.max(0,Number(q.rent||0)),discount=Math.min(rent,Math.max(0,Number(q.discount||0)));
  const regularBase=Number(q.regularBaseTotal!==undefined?q.regularBaseTotal:rent),singleBase=Number(q.singleBaseTotal!==undefined?q.singleBaseTotal:Math.max(0,rent-discount));
  const regularTax=Number(q.regularTaxAmount!==undefined?q.regularTaxAmount:(applyIgv?roundMoney(regularBase*rate/100):0)),singleTax=Number(q.singleTaxAmount!==undefined?q.singleTaxAmount:(applyIgv?roundMoney(singleBase*rate/100):0));
  const computedRegular=roundMoney(regularBase+regularTax+guarantee),computedSingle=roundMoney(singleBase+singleTax+guarantee),regular=Number(q.regularTotal!==undefined?q.regularTotal:(computedRegular>0?computedRegular:Number(q.total||0))),single=Number(q.singlePaymentTotal!==undefined?q.singlePaymentTotal:(q.applyIgv!==undefined?computedSingle:Math.max(0,regular-Number(q.discount||0))));
  return {regular,single,discount,applyIgv,taxRate:rate,guarantee,regularBase,singleBase,regularTax,singleTax}
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

function openNewFollowup(){if(!requirePermission('manage_followups'))return;
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
  followups.unshift({id:crypto.randomUUID(),clientId:String(clientId),quoteId:fQuote.value?Number(fQuote.value):null,note,scheduledDate:fDate.value,scheduledTime:fTime.value,status:'pending',createdAt:nowISO()});
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
  const matches=arr.length?arr.map(c=>`<button type="button" class="res-client-option" onmousedown="event.preventDefault()" onclick="selectReservationClient('${c.id}')"><div class="initials">${initials(c.name)}</div><div><b>${escapeHtml(c.name)}</b><span>${escapeHtml(reservationClientSearchMeta(c))}</span></div></button>`).join(''):'<div class="empty" style="padding:14px 10px 8px">No se encontraron clientes.</div>';
  host.innerHTML=matches+`<button type="button" class="res-client-option res-client-create" onmousedown="event.preventDefault()" onclick="openNewClientFromReservation()"><div class="initials">+</div><div><b>Crear nuevo cliente</b><span>Agregarlo sin salir de esta reserva</span></div></button>`;
  host.classList.remove('hidden')
}
function openNewClientFromReservation(){hideReservationClientSearchResults();openNewClient(false,true)}
function hideReservationClientSearchResults(){document.getElementById('rClientSearchResults')?.classList.add('hidden')}
function syncReservationClientSearch(){const c=clientById(rClient?.value);const input=document.getElementById('rClientSearch');if(input)input.value=c?.name||''}
function selectReservationClient(id){
  const c=clientById(id);if(!c)return;rClient.value=String(c.id);syncReservationClientSearch();hideReservationClientSearchResults();onReservationClientChange()
}
function setCourtBookingMode(mode){
  if(!['court','internal'].includes(reservationKind))return;
  if(editingReservationId&&mode==='recurring'&&!editingRecurringSeriesId){showToast('La edición actual modifica solo esta reserva');return}
  if(reservationKind==='court'&&rQuote?.value&&mode==='recurring'){showToast('Las series recurrentes se crean como reserva directa');return}
  courtBookingMode=mode==='recurring'?'recurring':'single';
  document.querySelectorAll('[data-booking-mode]').forEach(b=>b.classList.toggle('active',b.dataset.bookingMode===courtBookingMode));
  document.getElementById('rRecurringBlock')?.classList.toggle('hidden',courtBookingMode!=='recurring');
  document.getElementById('rSingleCourtConfig')?.classList.toggle('hidden',reservationKind!=='court'||courtBookingMode==='recurring');
  document.getElementById('rInternalSingleConfig')?.classList.toggle('hidden',reservationKind!=='internal'||courtBookingMode==='recurring');
  document.getElementById('rDateScheduleCard')?.classList.toggle('hidden',courtBookingMode==='recurring');
  document.getElementById('rPaymentCard')?.classList.toggle('hidden',courtBookingMode==='recurring'||reservationKind==='internal');
  const payCreateBtn=document.getElementById('reservationSaveAndPayBtn');if(payCreateBtn)payCreateBtn.classList.toggle('hidden',courtBookingMode==='recurring'||reservationKind==='internal'||!!editingReservationId);
  if(document.getElementById('reservationSaveBtn'))reservationSaveBtn.textContent=courtBookingMode==='recurring'?(reservationKind==='internal'?'Crear actividad recurrente':'Crear serie recurrente'):(editingReservationId?'Guardar cambios':(reservationKind==='internal'?'Crear ocupación':'Crear reserva'));
  if(courtBookingMode==='recurring'){
    if(reservationKind==='court')rQuote.value='';
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
function updateRecurringBillingUI(){const internal=reservationKind==='internal';const billing=document.getElementById('rRecurringBilling'),field=document.getElementById('rRecurringBillingField');if(internal&&billing)billing.value='per_reservation';field?.classList.toggle('hidden',internal);const monthly=!internal&&billing?.value==='monthly';document.getElementById('rRecurringMonthlyAmountField')?.classList.toggle('hidden',!monthly);document.getElementById('rRecurringTaxField')?.classList.toggle('hidden',internal)}
function recurringDefaultStartTime(){return rStart?.value||'19:00'}
function makeRecurringScheduleBlock(seed={}){
  const internal=reservationKind==='internal',type=seed.courtType||'FUT 6',info=internal?{rate:0,special:false}:clientCourtRate(rClient?.value,type),qty=['FUT 9','FULL'].includes(type)?1:Number(seed.courtQty||1);
  let courts=['FUT 9','FULL'].includes(type)?['Cancha 1','Cancha 2','Cancha 3']:(Array.isArray(seed.physicalCourts)&&seed.physicalCourts.length?[...seed.physicalCourts]:['Cancha 1']);
  if(type==='FUT 6'){
    courts=courts.filter(x=>['Cancha 1','Cancha 2','Cancha 3'].includes(x)).slice(0,qty);
    ['Cancha 1','Cancha 2','Cancha 3'].forEach(x=>{if(courts.length<qty&&!courts.includes(x))courts.push(x)});
  }
  return {id:crypto.randomUUID(),weekdays:Array.isArray(seed.weekdays)?[...seed.weekdays]:[],courtType:type,courtQty:qty,physicalCourts:courts,startTime:seed.startTime||recurringDefaultStartTime(),durationMinutes:Number(seed.durationMinutes||60),courtRate:internal?0:(seed.courtRate!==undefined?Number(seed.courtRate):Number(info.rate||0)),rateSource:internal?'internal':(seed.rateSource||(info.special?'client_special':'general')),rateManual:internal?false:!!seed.rateManual}
}
function resetRecurringScheduleBlocks(){const ds=document.getElementById('rRecurringStartDate')?.value||rDate?.value||localDateValue();const d=new Date(ds+'T12:00:00');recurringDraftBlocks=[makeRecurringScheduleBlock({weekdays:[d.getDay()]})]}
function recurringBlockById(id){return recurringDraftBlocks.find(x=>String(x.id)===String(id))}
function recurringBlockEndTime(b){return addMinutesToTime(b.startTime,Number(b.durationMinutes||60))}
function recurringBlockHours(b){return Number(b.durationMinutes||0)/60}
function recurringBlockQty(b){return ['FUT 9','FULL'].includes(b.courtType)?1:Number(b.courtQty||1)}
function recurringBlockResources(b){return ['FUT 9','FULL'].includes(b.courtType)?['Cancha 1','Cancha 2','Cancha 3']:[...(b.physicalCourts||[])]}
function recurringBlockSpace(b){if(b.courtType==='FULL')return 'Establecimiento completo';if(b.courtType==='FUT 9')return 'FUT 9';const courts=recurringBlockResources(b),qty=recurringBlockQty(b);return qty===1?courts[0]:`${qty} canchas FUT 6`}
function recurringBlockTotal(b){return Number(b.courtRate||0)*recurringBlockHours(b)*recurringBlockQty(b)}
function recurringStartOptions(selected){let out='';for(let mins=6*60;mins<=22*60;mins+=30){const t=`${String(Math.floor(mins/60)).padStart(2,'0')}:${String(mins%60).padStart(2,'0')}`;out+=`<option value="${t}" ${t===selected?'selected':''}>${t}</option>`}return out}
function recurringDurationOptions(selected){return [[60,'1 hora'],[90,'1 hora 30 min'],[120,'2 horas'],[150,'2 horas 30 min'],[180,'3 horas']].map(([v,l])=>`<option value="${v}" ${Number(selected)===v?'selected':''}>${l}</option>`).join('')}
function recurringDaysLabel(days){const m={0:'Dom',1:'Lun',2:'Mar',3:'Mié',4:'Jue',5:'Vie',6:'Sáb'};return (days||[]).slice().sort((a,b)=>a-b).map(x=>m[x]).join(' · ')||'Sin días'}
function renderRecurringScheduleBlocks(){
  const host=document.getElementById('rRecurringSchedules');if(!host)return;
  if(!recurringDraftBlocks.length)resetRecurringScheduleBlocks();
  const internal=reservationKind==='internal';
  host.innerHTML=recurringDraftBlocks.map((b,i)=>{
    const full=b.courtType==='FULL',isFut9=b.courtType==='FUT 9',qty=recurringBlockQty(b),courts=recurringBlockResources(b),hours=recurringBlockHours(b),baseTotal=internal?0:recurringBlockTotal(b),applyIgv=!internal&&!!document.getElementById('rRecurringApplyIgv')?.checked,taxRate=Number(settings.taxConfig?.taxRate||18),total=internal?0:roundMoney(baseTotal+(applyIgv?baseTotal*taxRate/100:0)),source=b.rateManual?'Tarifa manual':(b.rateSource==='client_special'?'Tarifa especial del cliente':'Tarifa general');
    const dayNames=[[1,'Lun'],[2,'Mar'],[3,'Mié'],[4,'Jue'],[5,'Vie'],[6,'Sáb'],[0,'Dom']];
    const options=`<option ${b.courtType==='FUT 6'?'selected':''}>FUT 6</option><option ${isFut9?'selected':''}>FUT 9</option>${internal?`<option value="FULL" ${full?'selected':''}>Establecimiento completo</option>`:''}`;
    const formatLabel=full?'Establecimiento completo':(isFut9?'FUT 9':`${qty} cancha${qty===1?'':'s'} · ${escapeHtml(courts.join(' + '))}`);
    return `<div class="recurring-schedule-card">
      <div class="recurring-schedule-head"><div><b>Horario ${i+1}</b><span>${escapeHtml(recurringDaysLabel(b.weekdays))} · ${escapeHtml(b.startTime)}–${escapeHtml(recurringBlockEndTime(b))}</span></div>${recurringDraftBlocks.length>1?`<button type="button" class="recurring-remove" onclick="removeRecurringScheduleBlock('${escapeHtml(b.id)}')">Eliminar</button>`:''}</div>
      <div class="field"><label>Días fijos</label><div class="weekday-grid">${dayNames.map(([v,l])=>`<label class="weekday-check"><input type="checkbox" ${b.weekdays.includes(v)?'checked':''} onchange="toggleRecurringScheduleDay('${escapeHtml(b.id)}',${v},this.checked)"><span>${l}</span></label>`).join('')}</div></div>
      <div class="grid2">
        <div class="field"><label>Formato</label><select onchange="updateRecurringScheduleField('${escapeHtml(b.id)}','courtType',this.value)">${options}</select></div>
        ${internal?`<div class="field"><label>Tipo</label><input value="Sin cobro" readonly></div>`:`<div class="field"><label>${isFut9?'Tarifa FUT 9 / hora':'Tarifa por cancha / hora'}</label><input type="number" min="0" value="${Number(b.courtRate||0)}" oninput="updateRecurringScheduleField('${escapeHtml(b.id)}','courtRate',this.value,true)"></div>`}
      </div>
      ${internal?'':`<div class="rate-source ${b.rateSource==='client_special'&&!b.rateManual?'special':''}"><span class="dotrate"></span><span>${source}</span></div>`}
      ${!isFut9&&!full?`<div class="recurring-courts"><div class="field"><label>Cantidad de canchas</label><select onchange="updateRecurringScheduleField('${escapeHtml(b.id)}','courtQty',this.value)"><option value="1" ${qty===1?'selected':''}>1 cancha</option><option value="2" ${qty===2?'selected':''}>2 canchas</option><option value="3" ${qty===3?'selected':''}>3 canchas</option></select></div><div class="field"><label>Canchas físicas</label><div class="court-select-grid">${['Cancha 1','Cancha 2','Cancha 3'].map(c=>`<label class="court-check"><input type="checkbox" ${courts.includes(c)?'checked':''} onchange="toggleRecurringScheduleCourt('${escapeHtml(b.id)}','${c}',this.checked)"><span>${c}</span></label>`).join('')}</div></div></div>`:`<div class="resource-help"><b>${full?'Establecimiento completo':'FUT 9'}:</b> bloquea automáticamente Cancha 1 + Cancha 2 + Cancha 3.</div>`}
      <div class="grid2"><div class="field"><label>Hora inicio</label><select onchange="updateRecurringScheduleField('${escapeHtml(b.id)}','startTime',this.value)">${recurringStartOptions(b.startTime)}</select></div><div class="field"><label>Duración</label><select onchange="updateRecurringScheduleField('${escapeHtml(b.id)}','durationMinutes',this.value)">${recurringDurationOptions(b.durationMinutes)}</select></div></div>
      <div class="recurring-block-calc"><b>${escapeHtml(recurringDaysLabel(b.weekdays))}</b> · ${escapeHtml(b.startTime)}–${escapeHtml(recurringBlockEndTime(b))}<br>${formatLabel} · ${Number.isInteger(hours)?hours:hours.toFixed(1)} h · <b>${internal?'Sin cobro':money(total)+' por fecha'+(applyIgv?' · con IGV':'')}</b></div>
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
  if(['FUT 9','FULL'].includes(b.courtType)){b.courtQty=1;b.physicalCourts=['Cancha 1','Cancha 2','Cancha 3'];return}
  b.courtQty=Math.min(3,Math.max(1,Number(b.courtQty||1)));let courts=(b.physicalCourts||[]).filter(x=>['Cancha 1','Cancha 2','Cancha 3'].includes(x)).slice(0,b.courtQty);
  ['Cancha 1','Cancha 2','Cancha 3'].forEach(x=>{if(courts.length<b.courtQty&&!courts.includes(x))courts.push(x)});b.physicalCourts=courts
}
function updateRecurringScheduleField(id,field,value,manual=false){
  const b=recurringBlockById(id);if(!b)return;
  if(field==='courtType'){
    const internal=reservationKind==='internal';b.courtType=(internal&&value==='FULL')?'FULL':(value==='FUT 9'?'FUT 9':'FUT 6');b.courtQty=['FUT 9','FULL'].includes(b.courtType)?1:Math.min(3,Math.max(1,Number(b.courtQty||1)));syncRecurringBlockCourts(b);
    if(internal){b.courtRate=0;b.rateSource='internal';b.rateManual=false}else{const info=clientCourtRate(rClient.value,b.courtType);b.courtRate=Number(info.rate||0);b.rateSource=info.special?'client_special':'general';b.rateManual=false}
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
  if(reservationKind==='internal')return;recurringDraftBlocks.forEach(b=>{if(b.rateManual)return;const info=clientCourtRate(rClient.value,b.courtType);b.courtRate=Number(info.rate||0);b.rateSource=info.special?'client_special':'general'});renderRecurringScheduleBlocks();updateRecurringSeriesPreview()
}
function recurringSeriesById(id){return recurringSeries.find(x=>String(x.id)===String(id))||null}
function recurringReservationsForSeries(id){return reservations.filter(r=>String(r.seriesId)===String(id))}
function recurringReservationHasPayment(r){return Number(r.advance||0)>0||movements.some(m=>m.type==='payment'&&paymentTouchesReservation(m,r.id))}
function recurringSeriesStateLabel(series){if(series?.status==='paused')return 'Pausada';if(series?.status==='finished')return 'Finalizada';if(series?.status==='hold')return 'Pre-reserva';return 'Activa'}
function recurringSeriesStateClass(series){return series?.status==='paused'?'paused':(series?.status==='finished'?'finished':'')}
function recurringPureDates(days,startDate,endDate,frequency='weekly',anchorDate=startDate){
  if(!startDate||!endDate||!days?.length||startDate>endDate)return [];
  const start=new Date(startDate+'T12:00:00'),end=new Date(endDate+'T12:00:00'),anchor=new Date((anchorDate||startDate)+'T12:00:00'),out=[];
  for(let d=new Date(start);d<=end;d.setDate(d.getDate()+1)){
    if(!days.includes(d.getDay()))continue;
    if(frequency==='biweekly'){const diff=Math.floor((d-anchor)/86400000);if(Math.floor(diff/7)%2!==0)continue}
    out.push(localDateValue(d))
  }
  return out
}
function recurringInstancesForConfig(blocks,startDate,endDate,frequency,anchorDate){
  const out=[];(blocks||[]).forEach((b,index)=>recurringPureDates(b.weekdays,startDate,endDate,frequency,anchorDate).forEach(date=>out.push({date,block:b,blockIndex:index})));
  return out.sort((a,b)=>(a.date+a.block.startTime).localeCompare(b.date+b.block.startTime))
}
function recurringConflictsIgnoring(instances,ignoreIds=new Set()){
  const conflicts=[];
  instances.forEach((inst,i)=>{
    const candidate=recurringCandidate(inst),resources=reservationResources(candidate);
    const existing=reservations.find(r=>!ignoreIds.has(String(r.id))&&!['cancelled','no_show'].includes(r.status)&&r.eventDate===candidate.eventDate&&intervalsOverlap(candidate.startTime,candidate.endTime,r.startTime,r.endTime)&&reservationResources(r).some(x=>resources.includes(x)));
    if(existing){conflicts.push({type:'existing',instance:inst,conflict:existing});return}
    for(let j=0;j<i;j++){
      const other=instances[j];if(other.date!==inst.date)continue;const a=recurringCandidate(other),b=candidate;if(!intervalsOverlap(a.startTime,a.endTime,b.startTime,b.endTime))continue;
      if(reservationResources(a).some(x=>reservationResources(b).includes(x))){conflicts.push({type:'internal',instance:inst,other});break}
    }
  });return conflicts
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
function recurringCandidate(instance){const b=instance.block,courts=recurringBlockResources(b);return {reservationKind:reservationKind==='internal'?'internal':'court',eventDate:instance.date,startTime:b.startTime,endTime:recurringBlockEndTime(b),courtType:b.courtType,physicalCourts:courts,space:recurringBlockSpace(b)}}
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
    if(reservationKind!=='internal'&&Number(b.courtRate||0)<0){if(show)showToast(`Revisa la tarifa de Horario ${n}`);return false}
  }return true
}
function updateRecurringSeriesPreview(){
  if(courtBookingMode!=='recurring')return;const host=document.getElementById('rRecurringPreview');if(!host)return;
  const a=document.getElementById('rRecurringStartDate')?.value,b=document.getElementById('rRecurringEndDate')?.value;if(!a||!b||a>b){host.className='recurring-preview error';host.innerHTML='Selecciona un rango Desde/Hasta válido.';return}
  if(!validateRecurringBlocks(false)){host.className='recurring-preview';host.innerHTML='Completa días, canchas y horario de cada bloque.';return}
  const instances=recurringSeriesInstances();if(!instances.length){host.className='recurring-preview';host.innerHTML='No hay fechas para generar con esta configuración.';return}
  const editIgnore=editingRecurringSeriesId?new Set(recurringReservationsForSeries(editingRecurringSeriesId).filter(r=>r.eventDate>=a).map(r=>String(r.id))):null;const conflicts=editingRecurringSeriesId?recurringConflictsIgnoring(instances,editIgnore):recurringSeriesConflicts(instances),billing=document.getElementById('rRecurringBilling')?.value||'per_reservation';
  const applyIgv=reservationKind!=='internal'&&!!document.getElementById('rRecurringApplyIgv')?.checked,rate=Number(settings.taxConfig?.taxRate||18);let financial='';if(reservationKind==='internal')financial=' · sin cobro';else if(billing==='monthly'){const amt=Number(document.getElementById('rRecurringMonthlyAmount')?.value||0),total=applyIgv?roundMoney(amt*(1+rate/100)):amt;financial=amt?` · ${money(total)} / mes${applyIgv?` (base ${money(amt)} + IGV)`:''}`:' · falta monto mensual'}else{const base=instances.reduce((sum,x)=>sum+recurringBlockTotal(x.block),0),total=applyIgv?roundMoney(base*(1+rate/100)):base;financial=` · ${money(total)} estimado${applyIgv?' con IGV':''}`}
  host.className='recurring-preview'+(conflicts.length?' error':'');host.innerHTML=`<b>${recurringDraftBlocks.length} horario${recurringDraftBlocks.length===1?'':'s'} · ${instances.length} reserva${instances.length===1?'':'s'}</b>${financial}<br>${conflicts.length?`${conflicts.length} cruce${conflicts.length===1?'':'s'} detectado${conflicts.length===1?'':'s'}. Corrige los bloques antes de crear la serie.`:'Todas las fechas y recursos están disponibles.'}`
}
function recurringMonthlyInstanceTotals(instances,amount){
  const groups={};instances.forEach((x,i)=>{const k=x.date.slice(0,7);(groups[k]||(groups[k]=[])).push(i)});const totals=new Array(instances.length).fill(0),cents=Math.round(Number(amount||0)*100);
  Object.values(groups).forEach(indexes=>{const base=Math.floor(cents/indexes.length),rest=cents-base*indexes.length;indexes.forEach((idx,j)=>totals[idx]=(base+(j<rest?1:0))/100)});return totals
}
function recurringMonthlyTotalsForEdit(instances,amount,seriesId,effective){
  const groups={};instances.forEach((x,i)=>{const k=x.date.slice(0,7);(groups[k]||(groups[k]=[])).push(i)});const totals=new Array(instances.length).fill(0),target=Math.round(Number(amount||0)*100);
  Object.entries(groups).forEach(([month,indexes])=>{
    const preserved=recurringReservationsForSeries(seriesId).filter(r=>r.eventDate?.startsWith(month)&&r.eventDate<effective).reduce((sum,r)=>sum+Number(r.total||0),0);
    const remaining=Math.max(0,target-Math.round(preserved*100)),base=Math.floor(remaining/indexes.length),rest=remaining-base*indexes.length;indexes.forEach((idx,j)=>totals[idx]=(base+(j<rest?1:0))/100)
  });return totals
}
function recurringRecordFromInstance(series,inst,total,existing=null){
  const block=inst.block,qty=recurringBlockQty(block),courts=recurringBlockResources(block),hours=recurringBlockHours(block),space=recurringBlockSpace(block),internal=series.reservationKind==='internal',applyIgv=!internal&&!!series.applyIgv,taxRate=internal?0:Number(series.taxRate||18),baseTotal=internal?0:(series.billing==='monthly'?(applyIgv?roundMoney(Number(total||0)/(1+taxRate/100)):Number(total||0)):recurringBlockTotal(block)),taxAmount=internal||!applyIgv?0:roundMoney(Number(total||0)-baseTotal);
  const base={clientId:internal?null:String(series.clientId),quoteId:null,reservationKind:internal?'internal':'court',eventType:internal?'Uso interno':'Alquiler de cancha',people:null,eventDate:inst.date,startTime:block.startTime,endTime:recurringBlockEndTime(block),space,courtType:block.courtType,courtQty:qty,physicalCourt:courts.length===1?courts[0]:null,physicalCourts:[...courts],courtRate:internal?0:Number(block.courtRate||0),rateSource:internal?'internal':(block.rateManual?'manual':block.rateSource),hours,baseTotal,taxApplied:applyIgv,taxRate,taxAmount,nonTaxableExtra:0,total:internal?0:total,advance:internal?0:Number(existing?.advance||0),balance:internal?0:Math.max(0,Number(total||0)-Number(existing?.advance||0)),notes:internal?(series.internalNotes||series.notes||''):(series.notes||''),status:existing?.status||((series.status==='hold')?'hold':'confirmed'),seriesId:series.id,seriesCode:series.code,seriesBlockId:block.id,seriesBlockIndex:inst.blockIndex+1,recurringBilling:internal?'none':series.billing,monthlyAmount:!internal&&series.billing==='monthly'?series.monthlyAmount:null,internalUseType:internal?series.internalUseType:null,internalTitle:internal?series.internalTitle:null,internalResponsible:internal?series.internalResponsible:null};
  return base
}
function updateRecurringSeriesFromForm(){
  const series=recurringSeriesById(editingRecurringSeriesId);if(!series){showToast('No se encontró la serie');return false}const auditBefore=seriesAuditSnapshot(series)
  const effective=document.getElementById('rRecurringStartDate')?.value||recurringEditEffectiveDate||localDateValue(),end=document.getElementById('rRecurringEndDate')?.value||series.endDate;
  if(!effective||!end||effective>end){showToast('Revisa el rango de fechas');return false}
  if(!validateRecurringBlocks(true))return false;
  const internal=series.reservationKind==='internal',billing=internal?'none':(document.getElementById('rRecurringBilling')?.value||series.billing||'per_reservation'),monthlyAmount=internal?0:Number(document.getElementById('rRecurringMonthlyAmount')?.value||0);if(!internal&&billing==='monthly'&&!monthlyAmount){showToast('Ingresa el monto mensual');return false}const applyIgv=!internal&&!!document.getElementById('rRecurringApplyIgv')?.checked,taxRate=internal?0:reservationTaxRate()
  const frequency=document.getElementById('rRecurringFrequency')?.value||series.frequency||'weekly';
  let blocks=(series.blocks||[]).map(x=>cloneData(x));
  if(recurringEditScope==='block'){
    const idx=blocks.findIndex(x=>String(x.id)===String(recurringEditBlockId));if(idx<0){showToast('No se encontró el horario');return false}
    const b=cloneData(recurringDraftBlocks[0]);b.id=blocks[idx].id;b.blockIndex=blocks[idx].blockIndex||idx+1;b.physicalCourts=[...recurringBlockResources(b)];b.endTime=recurringBlockEndTime(b);b.hours=recurringBlockHours(b);blocks[idx]={...blocks[idx],...b}
  }else{
    blocks=recurringDraftBlocks.map((x,i)=>{const b=cloneData(x);b.id=b.id||Date.now()+i;b.blockIndex=i+1;b.physicalCourts=[...recurringBlockResources(b)];b.endTime=recurringBlockEndTime(b);b.hours=recurringBlockHours(b);return b})
  }
  const future=recurringReservationsForSeries(series.id).filter(r=>r.eventDate>=effective);
  const paid=future.filter(r=>!r.seriesException&&recurringReservationHasPayment(r)&&!['cancelled','no_show','completed'].includes(r.status));
  if(paid.length){showToast(`Hay ${paid.length} reserva${paid.length===1?'':'s'} futura${paid.length===1?'':'s'} con pago. Edítala individualmente o usa una fecha posterior.`);return false}
  const terminal=new Set(['cancelled','no_show','completed']);
  const protectedRows=future.filter(r=>r.seriesException||terminal.has(r.status));
  if(!internal&&billing==='monthly'&&protectedRows.length){showToast('Hay excepciones o estados cerrados en una serie mensual. Usa una fecha posterior o edítalos individualmente.');return false}
  const replaceable=future.filter(r=>!r.seriesException&&!terminal.has(r.status)&&!recurringReservationHasPayment(r));
  const ignoreIds=new Set(replaceable.map(r=>String(r.id)));
  const protectedSlots=new Set(protectedRows.map(r=>`${r.seriesOriginalBlockId||r.seriesBlockId}|${r.seriesOriginalDate||r.eventDate}`));
  let instances=recurringInstancesForConfig(blocks,effective,end,frequency,series.startDate||effective).filter(inst=>!protectedSlots.has(`${inst.block.id}|${inst.date}`));
  if(instances.length>1000){showToast('La serie genera demasiadas reservas');return false}
  const conflicts=recurringConflictsIgnoring(instances,ignoreIds);if(conflicts.length){showToast(`${conflicts.length} cruce${conflicts.length===1?'':'s'} detectado${conflicts.length===1?'':'s'}. Revisa horarios o canchas.`);return false}
  const baseTotals=internal?instances.map(()=>0):(billing==='monthly'?recurringMonthlyTotalsForEdit(instances,monthlyAmount,series.id,effective):instances.map(x=>recurringBlockTotal(x.block))),finalMonthly=applyIgv?roundMoney(monthlyAmount*(1+taxRate/100)):monthlyAmount,totals=internal?instances.map(()=>0):(billing==='monthly'?recurringMonthlyTotalsForEdit(instances,finalMonthly,series.id,effective):baseTotals.map(x=>roundMoney(x+(applyIgv?x*taxRate/100:0))));
  const existingMap=new Map(replaceable.map(r=>[`${r.seriesBlockId}|${r.eventDate}`,r]));const used=new Set();
  const workingSeries={...series,clientId:internal?null:(recurringEditScope==='series'?String(rClient.value||series.clientId):series.clientId),reservationKind:internal?'internal':'court',billing,monthlyAmount:!internal&&billing==='monthly'?monthlyAmount:null,applyIgv,taxRate,frequency,endDate:end,notes:internal?(document.getElementById('rInternalNotes')?.value.trim()||''):rNotes.value.trim(),internalNotes:internal?(document.getElementById('rInternalNotes')?.value.trim()||''):series.internalNotes,internalUseType:internal?(document.getElementById('rInternalUseType')?.value||series.internalUseType):null,internalTitle:internal?(document.getElementById('rInternalTitle')?.value.trim()||series.internalTitle):null,internalResponsible:internal?(document.getElementById('rInternalResponsible')?.value.trim()||''):null,blocks,status:series.status==='finished'?'confirmed':series.status};
  instances.forEach((inst,i)=>{
    const key=`${inst.block.id}|${inst.date}`,existing=existingMap.get(key)||null,total=totals[i],data=recurringRecordFromInstance(workingSeries,inst,total,existing);
    if(existing){Object.assign(existing,data,{updatedAt:nowISO()});used.add(String(existing.id))}
    else{const nr={id:crypto.randomUUID(),code:internal?nextOccupancyCode():nextReservationCode(),advance:0,...data,createdAt:nowISO()};reservations.unshift(nr)}
  });
  for(const r of replaceable){if(used.has(String(r.id)))continue;const idx=reservations.findIndex(x=>String(x.id)===String(r.id));if(idx>=0)reservations.splice(idx,1)}
  Object.assign(series,{clientId:workingSeries.clientId,reservationKind:workingSeries.reservationKind,internalUseType:workingSeries.internalUseType,internalTitle:workingSeries.internalTitle,internalResponsible:workingSeries.internalResponsible,internalNotes:workingSeries.internalNotes,frequency,billing,monthlyAmount:workingSeries.monthlyAmount,applyIgv:workingSeries.applyIgv,taxRate:workingSeries.taxRate,endDate:end,notes:workingSeries.notes,blocks,status:series.status==='finished'?'confirmed':series.status,updatedAt:nowISO(),lastEditedFrom:effective});
  const first=blocks[0];Object.assign(series,{courtType:first?.courtType,courtQty:first?.courtQty,physicalCourts:first?.physicalCourts,courtRate:first?.courtRate,startTime:first?.startTime,endTime:first?.endTime,weekdays:first?.weekdays});
  const auditChanges=seriesAuditChanges(auditBefore,seriesAuditSnapshot(series));if(auditChanges.length)addAuditEvent('series',series.id,series.code,recurringEditScope==='block'?'Horario recurrente actualizado':'Serie recurrente actualizada',auditChanges,`Cambios desde ${effective}`);
  persist();editingRecurringSeriesId=null;recurringEditScope=null;recurringEditBlockId=null;recurringEditEffectiveDate=null;closeSheet('reservationSheet');renderReservations();renderCalendar();renderHome();renderReservationWorkspace();showToast(`${series.code} actualizada desde ${effective}`);go('reservations');return true
}
function openRecurringEditScope(){if(!requirePermission('manage_reservations'))return;
  const r=reservationById(openReservationId);if(!r?.seriesId){editReservation(openReservationId);return}
  const series=recurringSeriesById(r.seriesId);if(!series){editReservation(openReservationId);return}
  const name=reservationDisplayName(r);recurringEditScopeInfo.innerHTML=`<b>${escapeHtml(series.code)} · ${escapeHtml(name)}</b><br>${fmtScheduled(r.eventDate,r.startTime)} · Horario ${Number(r.seriesBlockIndex||1)}<br>Los cambios de serie se aplican desde <b>${escapeHtml(r.eventDate)}</b> hacia adelante.`;
  closeSheet('reservationDetailSheet');openSheet('recurringEditScopeSheet')
}
function chooseRecurringEditScope(scope){
  const r=reservationById(openReservationId);if(!r)return;closeSheet('recurringEditScopeSheet');
  if(scope==='single'){editReservation(r.id);return}
  beginRecurringSeriesEdit(r.seriesId,scope,r.seriesBlockId,r.eventDate)
}
function beginRecurringSeriesEdit(seriesId,scope='series',blockId=null,effectiveDate=null){
  const series=recurringSeriesById(seriesId);if(!series){showToast('No se encontró la serie');return}
  if(series.status==='paused'){showToast('Reanuda la serie antes de editar sus horarios');return}
  if(series.status==='finished'){showToast('La serie está finalizada. El historial permanece cerrado.');return}
  editingReservationId=null;editingRecurringSeriesId=series.id;recurringEditScope=scope;recurringEditBlockId=blockId;recurringEditEffectiveDate=effectiveDate||localDateValue();reservationKind=series.reservationKind==='internal'?'internal':'court';
  prepareReservationForm(reservationKind);setCourtBookingMode('recurring');
  if(reservationKind==='court'){rClient.value=String(series.clientId);syncReservationClientSearch();populateReservationQuotes()}else{rInternalUseType.value=series.internalUseType||'activity';rInternalTitle.value=series.internalTitle||'Actividad interna';rInternalResponsible.value=series.internalResponsible||'';rInternalNotes.value=series.internalNotes||series.notes||''}
  rRecurringStartDate.value=recurringEditEffectiveDate;rRecurringStartDate.min=recurringEditEffectiveDate;rRecurringEndDate.value=series.endDate;rRecurringFrequency.value=series.frequency||'weekly';rRecurringBilling.value=series.billing==='monthly'?'monthly':'per_reservation';rRecurringMonthlyAmount.value=series.monthlyAmount||'';if(document.getElementById('rRecurringApplyIgv'))rRecurringApplyIgv.checked=!!series.applyIgv;updateRecurringBillingUI();rNotes.value=series.notes||'';rStatus.value=series.status==='hold'?'hold':'confirmed';
  if(scope==='block'){
    const target=(series.blocks||[]).find(x=>String(x.id)===String(blockId));if(!target){showToast('No se encontró el horario');closeSheet('reservationSheet');return}
    recurringDraftBlocks=[makeRecurringScheduleBlock(cloneData(target))];
  }else recurringDraftBlocks=(series.blocks||[]).map(x=>makeRecurringScheduleBlock(cloneData(x)));
  renderRecurringScheduleBlocks();updateRecurringSeriesPreview();reservationFormTitle.textContent=scope==='block'?`Editar horario · ${series.code}`:`Editar serie · ${series.code}`;reservationSaveBtn.textContent=scope==='block'?'Guardar horario futuro':'Guardar serie futura';
  const intro=document.querySelector('#rRecurringBlock .recurring-series-intro');if(intro)intro.innerHTML=`<b>${scope==='block'?'Editando un horario':'Editando toda la serie'} desde ${escapeHtml(recurringEditEffectiveDate)}</b><br>Las reservas anteriores quedan congeladas. Las excepciones individuales no se sobrescriben.`;
  openSheet('reservationSheet')
}
function renderSeriesManager(seriesId){
  const series=recurringSeriesById(seriesId);if(!series)return;seriesManagerCurrentId=series.id;const internal=series.reservationKind==='internal',c=clientById(series.clientId)||{name:'Cliente'},display=internal?(series.internalTitle||internalUseTypeLabel(series.internalUseType)):c.name,rows=recurringReservationsForSeries(series.id),today=localDateValue(),future=rows.filter(r=>r.eventDate>=today&&!['cancelled','no_show'].includes(r.status)),done=rows.filter(r=>r.status==='completed').length,exceptions=rows.filter(r=>r.seriesException).length;
  seriesManagerTitle.textContent=`${series.code} · ${display}`;seriesManagerEffectiveDate.value=today<series.startDate?series.startDate:today;seriesManagerEffectiveDate.min=series.startDate||'';seriesManagerEffectiveDate.max=series.endDate||'';
  const blocks=(series.blocks||[]).map((b,i)=>`<div class="series-manage-block"><div class="series-manage-block-head"><div><b>Horario ${i+1}</b><span>${escapeHtml(recurringDaysLabel(b.weekdays))} · ${escapeHtml(b.startTime)}–${escapeHtml(recurringBlockEndTime(b))}<br>${escapeHtml(b.courtType==='FULL'?'Establecimiento completo':b.courtType)}${b.courtType==='FUT 6'?` · ${recurringBlockQty(b)} cancha${recurringBlockQty(b)>1?'s':''} · ${escapeHtml(recurringBlockResources(b).join(' + '))}`:' · Cancha 1 + 2 + 3'} · ${internal?'Sin cobro':money(recurringBlockTotal(b))+' por fecha'}</span></div><button class="btn" onclick="editSeriesBlockFromManager('${String(b.id)}')">Editar</button></div></div>`).join('');
  const finance=internal?`<div class="form-card"><h3>Tipo de uso</h3><div class="detail-row"><span>Clasificación</span><b>${escapeHtml(internalUseTypeLabel(series.internalUseType))}</b></div><div class="detail-row"><span>Responsable</span><b>${escapeHtml(series.internalResponsible||'—')}</b></div><div class="detail-row"><span>Impacto financiero</span><b>Sin cobro</b></div></div>`:`<div class="form-card"><h3>Cobro</h3><div class="detail-row"><span>Modalidad</span><b>${series.billing==='monthly'?'Mensual fijo':'Por reserva'}</b></div>${series.billing==='monthly'?`<div class="detail-row"><span>Monto mensual base</span><b>${money(series.monthlyAmount||0)}</b></div>`:''}<div class="detail-row"><span>IGV</span><b>${series.applyIgv?`Aplicado ${Number(series.taxRate||18)}%`:'No aplicado'}</b></div></div>`;
  seriesManagerBody.innerHTML=`<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px"><div><b>${escapeHtml(display)}</b><div class="mutedline">${escapeHtml(series.startDate)} → ${escapeHtml(series.endDate)} · ${series.frequency==='biweekly'?'Cada 2 semanas':'Semanal'}</div></div><span class="series-state ${recurringSeriesStateClass(series)}">${recurringSeriesStateLabel(series)}</span></div><div class="series-manage-summary"><div class="series-manage-kpi"><span>Ocupaciones</span><b>${rows.length}</b></div><div class="series-manage-kpi"><span>Próximas</span><b>${future.length}</b></div><div class="series-manage-kpi"><span>Realizadas</span><b>${done}</b></div><div class="series-manage-kpi"><span>Excepciones</span><b>${exceptions}</b></div></div>${finance}<div class="more-section-title" style="margin-top:16px">Horarios</div><div class="series-manage-blocks">${blocks||'<div class="empty">Sin horarios configurados.</div>'}</div>`;
  const pauseBtn=document.getElementById('seriesPauseResumeBtn'),finishBtn=document.getElementById('seriesFinishBtn');if(pauseBtn){pauseBtn.textContent=series.status==='paused'?'Reanudar serie':'Pausar serie';pauseBtn.classList.toggle('hidden',series.status==='finished')}if(finishBtn)finishBtn.classList.toggle('hidden',series.status==='finished')
}
function openRecurringSeriesManager(seriesId,effectiveDate=null){closeSheet('reservationDetailSheet');closeSheet('recurringEditScopeSheet');openSheet('seriesManagerSheet');renderSeriesManager(seriesId);if(effectiveDate&&document.getElementById('seriesManagerEffectiveDate'))seriesManagerEffectiveDate.value=effectiveDate}
function openSeriesManagerFromOpenReservation(){if(!requirePermission('manage_reservations'))return;const r=reservationById(openReservationId);if(r?.seriesId)openRecurringSeriesManager(r.seriesId,r.eventDate)}
function openSeriesManagerFromScope(){const r=reservationById(openReservationId);if(r?.seriesId)openRecurringSeriesManager(r.seriesId,r.eventDate)}
function editWholeSeriesFromManager(){const s=recurringSeriesById(seriesManagerCurrentId);if(!s)return;const d=seriesManagerEffectiveDate.value||localDateValue();closeSheet('seriesManagerSheet');beginRecurringSeriesEdit(s.id,'series',null,d)}
function editSeriesBlockFromManager(blockId){const s=recurringSeriesById(seriesManagerCurrentId);if(!s)return;const d=seriesManagerEffectiveDate.value||localDateValue();closeSheet('seriesManagerSheet');beginRecurringSeriesEdit(s.id,'block',blockId,d)}
function pauseRecurringSeries(series,effective){
  const rows=recurringReservationsForSeries(series.id).filter(r=>r.eventDate>=effective&&!['completed','cancelled','no_show'].includes(r.status));const paid=rows.filter(recurringReservationHasPayment);if(paid.length){showToast(`Hay ${paid.length} reserva${paid.length===1?'':'s'} futura${paid.length===1?'':'s'} con pago. Resuélvela antes de pausar.`);return false}
  const before=series.status;series.statusBeforePause=series.status;series.status='paused';series.pausedAt=nowISO();series.pausedFrom=effective;rows.forEach(r=>{r.seriesPreviousStatus=r.status;r.seriesPaused=true;r.status='cancelled';r.updatedAt=nowISO()});addAuditEvent('series',series.id,series.code,'Serie pausada',[{field:'Estado',before,after:'paused'}],`Desde ${effective} · ${rows.length} reservas futuras`);persist();return true
}
function resumeRecurringSeries(series,effective){
  const rows=recurringReservationsForSeries(series.id).filter(r=>r.seriesPaused&&r.eventDate>=effective);const ignore=new Set(rows.map(r=>String(r.id))),conflicts=[];rows.forEach(r=>{const c={reservationKind:r.reservationKind||'court',eventDate:r.eventDate,startTime:r.startTime,endTime:r.endTime,courtType:r.courtType,physicalCourts:reservationResources(r),space:r.space};const hit=reservations.find(x=>!ignore.has(String(x.id))&&!['cancelled','no_show'].includes(x.status)&&x.eventDate===c.eventDate&&intervalsOverlap(c.startTime,c.endTime,x.startTime,x.endTime)&&reservationResources(x).some(z=>reservationResources(c).includes(z)));if(hit)conflicts.push({r,hit})});if(conflicts.length){showToast(`${conflicts.length} cruce${conflicts.length===1?'':'s'} impide${conflicts.length===1?'':'n'} reanudar la serie`);return false}
  const before=series.status;rows.forEach(r=>{r.status=r.seriesPreviousStatus||'confirmed';delete r.seriesPreviousStatus;delete r.seriesPaused;r.updatedAt=nowISO()});series.status=series.statusBeforePause||'confirmed';delete series.statusBeforePause;series.resumedAt=nowISO();addAuditEvent('series',series.id,series.code,'Serie reanudada',[{field:'Estado',before,after:series.status}],`Desde ${effective} · ${rows.length} reservas restauradas`);persist();return true
}
function togglePauseSeriesFromManager(){const s=recurringSeriesById(seriesManagerCurrentId);if(!s)return;const d=seriesManagerEffectiveDate.value||localDateValue();const ok=s.status==='paused'?resumeRecurringSeries(s,d):pauseRecurringSeries(s,d);if(ok){renderSeriesManager(s.id);renderReservations();renderCalendar();renderHome();renderReservationWorkspace();showToast(s.status==='paused'?'Serie pausada':'Serie reanudada')}}
function finishSeriesFromManager(){const s=recurringSeriesById(seriesManagerCurrentId);if(!s)return;const d=seriesManagerEffectiveDate.value||localDateValue();const rows=recurringReservationsForSeries(s.id).filter(r=>r.eventDate>=d&&!['completed','cancelled','no_show'].includes(r.status));const paid=rows.filter(recurringReservationHasPayment);if(paid.length){showToast(`Hay ${paid.length} reserva${paid.length===1?'':'s'} futura${paid.length===1?'':'s'} con pago. Resuélvela antes de finalizar.`);return}rows.forEach(r=>{r.seriesFinalized=true;r.seriesPreviousStatus=r.status;r.status='cancelled';r.updatedAt=nowISO()});const before=s.status;s.status='finished';s.finishedAt=nowISO();s.finishedFrom=d;addAuditEvent('series',s.id,s.code,'Serie finalizada',[{field:'Estado',before,after:'finished'}],`Desde ${d} · ${rows.length} reservas futuras cerradas`);persist();renderSeriesManager(s.id);renderReservations();renderCalendar();renderHome();renderReservationWorkspace();showToast('Serie finalizada')}

function createRecurringSeries(){
  const internal=reservationKind==='internal',cid=rClient.value;if(!internal&&!cid){showToast('Selecciona un cliente');return false}
  if(internal&&!String(document.getElementById('rInternalTitle')?.value||'').trim()){showToast('Ingresa la actividad o motivo');return false}
  const a=document.getElementById('rRecurringStartDate')?.value,b=document.getElementById('rRecurringEndDate')?.value;if(!a||!b||a>b){showToast('Revisa el rango Desde/Hasta');return false}
  if(!validateRecurringBlocks(true))return false;
  const instances=recurringSeriesInstances();if(!instances.length){showToast('No hay fechas para generar');return false}if(instances.length>1000){showToast('La serie genera demasiadas ocupaciones');return false}
  const conflicts=recurringSeriesConflicts(instances);if(conflicts.length){updateRecurringSeriesPreview();showToast(`${conflicts.length} cruce${conflicts.length===1?'':'s'} por resolver`);return false}
  const billing=internal?'none':(document.getElementById('rRecurringBilling')?.value||'per_reservation'),monthlyAmount=internal?0:Number(document.getElementById('rRecurringMonthlyAmount')?.value||0);if(!internal&&billing==='monthly'&&!monthlyAmount){showToast('Ingresa el monto mensual');return false}const applyIgv=!internal&&!!document.getElementById('rRecurringApplyIgv')?.checked,taxRate=internal?0:reservationTaxRate(),monthlyBaseTotals=!internal&&billing==='monthly'?recurringMonthlyInstanceTotals(instances,monthlyAmount):[],monthlyFinalAmount=!internal&&billing==='monthly'?(applyIgv?roundMoney(monthlyAmount*(1+taxRate/100)):monthlyAmount):0,monthlyTotals=!internal&&billing==='monthly'?recurringMonthlyInstanceTotals(instances,monthlyFinalAmount):[];
  const seriesId=crypto.randomUUID(),seriesCode=nextRecurringSeriesCode(),status=internal?'confirmed':(rStatus.value||'confirmed');
  const blocks=recurringDraftBlocks.map((x,i)=>({...x,blockIndex:i+1,physicalCourts:[...recurringBlockResources(x)],endTime:recurringBlockEndTime(x),hours:recurringBlockHours(x),courtRate:internal?0:Number(x.courtRate||0),rateSource:internal?'internal':x.rateSource}));
  const first=blocks[0],internalTitle=internal?rInternalTitle.value.trim():null,internalType=internal?rInternalUseType.value:null,internalResponsible=internal?rInternalResponsible.value.trim():null,internalNotes=internal?rInternalNotes.value.trim():null;
  const series={id:seriesId,code:seriesCode,clientId:internal?null:String(cid),reservationKind:internal?'internal':'court',internalUseType:internalType,internalTitle,internalResponsible,internalNotes,startDate:a,endDate:b,frequency:rRecurringFrequency.value,billing,monthlyAmount:!internal&&billing==='monthly'?monthlyAmount:null,applyIgv,taxRate,status,notes:internal?internalNotes:rNotes.value.trim(),blocks,createdAt:nowISO(),courtType:first?.courtType,courtQty:first?.courtQty,physicalCourts:first?.physicalCourts,courtRate:internal?0:first?.courtRate,startTime:first?.startTime,endTime:first?.endTime,weekdays:first?.weekdays};
  recurringSeries.unshift(series);addAuditEvent('series',series.id,series.code,'Serie recurrente creada',[],`${internal?(series.internalTitle||'Actividad interna'):(clientById(series.clientId)?.name||'Cliente')} · ${blocks.length} horario${blocks.length===1?'':'s'} · ${a} → ${b}`);
  const prefix=internal?'OC':'RS',startCodeNum=Math.max(0,...reservations.filter(r=>String(r.code||'').startsWith(prefix+'-')).map(r=>Number(String(r.code||'').replace(/\D/g,''))||0))+1,created=[];
  instances.forEach((inst,i)=>{const block=inst.block,qty=recurringBlockQty(block),courts=recurringBlockResources(block),hours=recurringBlockHours(block),baseTotal=internal?0:(billing==='monthly'?monthlyBaseTotals[i]:recurringBlockTotal(block)),taxAmount=internal||!applyIgv?0:roundMoney(baseTotal*taxRate/100),total=internal?0:(billing==='monthly'?monthlyTotals[i]:roundMoney(baseTotal+taxAmount)),space=recurringBlockSpace(block);created.push({id:crypto.randomUUID(),code:prefix+'-'+String(startCodeNum+i).padStart(4,'0'),clientId:internal?null:String(cid),quoteId:null,reservationKind:internal?'internal':'court',eventType:internal?'Uso interno':'Alquiler de cancha',people:null,eventDate:inst.date,startTime:block.startTime,endTime:recurringBlockEndTime(block),space,courtType:block.courtType,courtQty:qty,physicalCourt:courts.length===1?courts[0]:null,physicalCourts:[...courts],courtRate:internal?0:Number(block.courtRate||0),rateSource:internal?'internal':(block.rateManual?'manual':block.rateSource),hours,baseTotal,taxApplied:applyIgv,taxRate,taxAmount,nonTaxableExtra:0,total,advance:0,balance:internal?0:total,notes:internal?internalNotes:rNotes.value.trim(),status,seriesId,seriesCode,seriesBlockId:block.id,seriesBlockIndex:inst.blockIndex+1,recurringBilling:internal?'none':billing,monthlyAmount:!internal&&billing==='monthly'?monthlyAmount:null,internalUseType:internalType,internalTitle,internalResponsible,createdAt:nowISO()})});
  reservations.unshift(...created);persist();closeSheet('reservationSheet');renderReservations();renderCalendar();renderHome();renderReservationWorkspace();go('reservations');showToast(`${seriesCode} creada · ${blocks.length} horarios · ${created.length} ${internal?'ocupaciones':'reservas'}`);return true
}

function openNewReservation(){if(!requirePermission('manage_reservations'))return;
  quoteConversionContext=null;
  editingRecurringSeriesId=null;recurringEditScope=null;recurringEditBlockId=null;recurringEditEffectiveDate=null;
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
  rClient.innerHTML=clients.map(c=>`<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
  rClient.value=clients.length?String(clients[0].id):'';syncReservationClientSearch();
  courtBookingMode='single';document.querySelectorAll('[data-booking-mode]').forEach(b=>b.classList.toggle('active',b.dataset.bookingMode==='single'));document.getElementById('rRecurringBlock')?.classList.add('hidden');document.getElementById('rSingleCourtConfig')?.classList.toggle('hidden',kind!=='court');document.getElementById('rInternalSingleConfig')?.classList.toggle('hidden',kind!=='internal');document.getElementById('rDateScheduleCard')?.classList.remove('hidden');document.getElementById('rPaymentCard')?.classList.toggle('hidden',kind==='internal');document.getElementById('rClientOriginCard')?.classList.toggle('hidden',kind==='internal');document.getElementById('rStatusCard')?.classList.toggle('hidden',kind==='internal');recurringDraftBlocks=[];
  rDate.value=calendarQuickSlot?.date||localDateValue();if(document.getElementById('rPaymentDueDate'))rPaymentDueDate.value=rDate.value;
  if(document.getElementById('rRecurringStartDate')){rRecurringStartDate.value=rDate.value;rRecurringStartDate.min=''}if(document.getElementById('rRecurringEndDate')){const rd=new Date(rDate.value+'T12:00:00');rd.setMonth(rd.getMonth()+1);rRecurringEndDate.value=localDateValue(rd)}
  const recurringIntro=document.querySelector('#rRecurringBlock .recurring-series-intro');if(recurringIntro)recurringIntro.innerHTML=kind==='internal'?'<b>Una actividad interna también puede ser recurrente.</b><br>Define sus días y canchas; bloqueará agenda sin generar ventas.':'<b>Un solo acuerdo, varios horarios.</b><br>Puedes combinar días, formatos y canchas diferentes dentro de la misma serie recurrente.';
  if(document.getElementById('rRecurringFrequency'))rRecurringFrequency.value='weekly';if(document.getElementById('rRecurringBilling'))rRecurringBilling.value='per_reservation';if(document.getElementById('rRecurringMonthlyAmount'))rRecurringMonthlyAmount.value='';updateRecurringBillingUI();
  buildHalfHourOptions();
  const initialStart=calendarQuickSlot?.time||'11:00';
  if(document.getElementById('rStartSelect'))rStartSelect.value=initialStart;
  if(document.getElementById('rDurationSelect'))rDurationSelect.value='60';
  if(document.getElementById('rStartExclusive'))rStartExclusive.value=initialStart;
  if(document.getElementById('rEndExclusive'))rEndExclusive.value=addMinutesToTime(initialStart,120);
  rStart.value=initialStart;rEnd.value=addMinutesToTime(initialStart,60);
  rAdvance.value=0;rNotes.value='';rStatus.disabled=false;rStatus.value=kind==='internal'?'confirmed':'hold';const payCreateBtn=document.getElementById('reservationSaveAndPayBtn');if(payCreateBtn)payCreateBtn.classList.toggle('hidden',kind==='internal'||!!editingReservationId);const planInfo=document.getElementById('rQuotePaymentPlanInfo');if(planInfo){planInfo.classList.add('hidden');planInfo.innerHTML=''};
  rEventType.value='Campeonato';rPeople.value=20;
  rCourtType.value='FUT 6';reservationRateManual=false;rCourtQty.value='1';[rCourtSel1,rCourtSel2,rCourtSel3].forEach(x=>x.checked=false);
  if(document.getElementById('rInternalUseType'))rInternalUseType.value='activity';if(document.getElementById('rInternalTitle'))rInternalTitle.value='';if(document.getElementById('rInternalResponsible'))rInternalResponsible.value='';if(document.getElementById('rInternalNotes'))rInternalNotes.value='';if(document.getElementById('rInternalFormat'))rInternalFormat.value='FUT 6';if(document.getElementById('rInternalQty'))rInternalQty.value='1';[document.getElementById('rInternalSel1'),document.getElementById('rInternalSel2'),document.getElementById('rInternalSel3')].filter(Boolean).forEach(x=>x.checked=false);
  const quickCourt=calendarQuickSlot?.court||'Cancha 1';const quickEl=[rCourtSel1,rCourtSel2,rCourtSel3].find(x=>x.value===quickCourt);if(quickEl)quickEl.checked=true;const internalQuick=[rInternalSel1,rInternalSel2,rInternalSel3].find(x=>x.value===quickCourt);if(internalQuick)internalQuick.checked=true;
  if(kind==='court')applyReservationClientRate();
  reservationFormTitle.textContent=editingReservationId?(kind==='exclusive'?'Editar evento exclusivo':(kind==='internal'?'Editar ocupación interna':'Editar reserva de cancha')):(kind==='exclusive'?'Reserva de evento exclusivo':(kind==='internal'?'Actividad / uso interno':'Reserva de cancha'));
  reservationKindChip.textContent=kind==='exclusive'?'Evento exclusivo':(kind==='internal'?'Actividad / uso interno':'Alquiler de cancha');
  rExclusiveBlock.classList.toggle('hidden',kind!=='exclusive');rCourtBlock.classList.toggle('hidden',kind!=='court');rInternalBlock.classList.toggle('hidden',kind!=='internal');
  if(document.getElementById('rApplyIgv'))rApplyIgv.checked=false;if(document.getElementById('rRecurringApplyIgv'))rRecurringApplyIgv.checked=false;if(document.getElementById('rNonTaxableExtra'))rNonTaxableExtra.value=0;if(document.getElementById('rTaxInheritedNote'))rTaxInheritedNote.classList.add('hidden');if(document.getElementById('rBaseTotal')){rBaseTotal.readOnly=kind==='court';rBaseTotal.value=kind==='exclusive'?Number(settings.exclusive||0):0}if(document.getElementById('rBaseTotalLabel'))rBaseTotalLabel.textContent=kind==='exclusive'?'Tarifa / subtotal base':'Subtotal base';
  rTotal.value=0;
  populateReservationQuotes();
  if(preselectReservationQuoteId&&kind!=='internal'){rQuote.value=String(preselectReservationQuoteId);loadReservationQuote();preselectReservationQuoteId=null}
  updateCourtSelectionUI();updateInternalSelectionUI();if(kind==='court')applyReservationClientRate();syncReservationScheduleUI();updateReservationDuration();if(kind==='court')recalcReservationCourtTotal();else recalcReservationTax();checkReservationConflictUI();calendarQuickSlot=null;
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
  const conversion=(quoteConversionContext&&String(quoteConversionContext.quoteId)===String(q.id))?quoteConversionContext.mode:null,t=quoteTotalsForConversion(q),useSingle=conversion==='single';
  if(document.getElementById('rApplyIgv'))rApplyIgv.checked=!!t.applyIgv;if(document.getElementById('rBaseTotal'))rBaseTotal.value=roundMoney(useSingle?t.singleBase:t.regularBase);if(document.getElementById('rNonTaxableExtra'))rNonTaxableExtra.value=roundMoney(t.guarantee);if(document.getElementById('rTaxInheritedNote'))rTaxInheritedNote.classList.remove('hidden');rAdvance.value=0;recalcReservationTax();
  const planInfo=document.getElementById('rQuotePaymentPlanInfo');
  if(planInfo){
    planInfo.classList.toggle('hidden',!conversion);
    if(conversion==='single')planInfo.innerHTML=`<b>Pago único anticipado</b><br>Se cobrará ${money(t.single)} en una sola operación para aplicar el descuento de ${money(t.discount)}. La reserva queda como pre-reserva hasta registrar ese cobro.`;
    else if(conversion==='installments')planInfo.innerHTML=`<b>Pago en partes / adelanto</b><br>Total regular ${money(t.regular)}. No aplica descuento. Después de crear la reserva se abrirá el cobro con 50% precargado como referencia.`;
    else if(conversion==='hold')planInfo.innerHTML=`<b>Pre-reserva sin pago</b><br>Total regular ${money(t.regular)}. El horario quedará bloqueado y el cobro podrá registrarse posteriormente.`;
  }
  if(conversion)rStatus.value='hold';
  updateCourtSelectionUI();updateReservationDuration();recalcReservationTax();checkReservationConflictUI()
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
  const courtLike=['court','internal'].includes(reservationKind);
  const courtBlock=document.getElementById('rCourtScheduleBlock'),exclusiveBlock=document.getElementById('rExclusiveScheduleBlock');
  if(courtBlock)courtBlock.classList.toggle('hidden',!courtLike);
  if(exclusiveBlock)exclusiveBlock.classList.toggle('hidden',courtLike);
  if(courtLike)syncCourtScheduleFromSelectors();else syncExclusiveSchedule()
}
function syncCourtScheduleFromSelectors(){
  clearReservationConflictUI();
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
function selectedInternalCourts(){const fmt=document.getElementById('rInternalFormat')?.value||'FUT 6';if(['FUT 9','FULL'].includes(fmt))return ['Cancha 1','Cancha 2','Cancha 3'];return [rInternalSel1,rInternalSel2,rInternalSel3].filter(x=>x.checked).map(x=>x.value)}
function syncInternalQtySelection(preferred=null){if((rInternalFormat?.value||'FUT 6')!=='FUT 6')return;const qty=Number(rInternalQty?.value||1),boxes=[rInternalSel1,rInternalSel2,rInternalSel3];let selected=boxes.filter(x=>x.checked);if(preferred){boxes.forEach(x=>x.checked=false);const first=boxes.find(x=>x.value===preferred);if(first)first.checked=true;selected=boxes.filter(x=>x.checked)}if(selected.length>qty)selected.slice(qty).forEach(x=>x.checked=false);selected=boxes.filter(x=>x.checked);if(selected.length<qty)boxes.filter(x=>!x.checked).slice(0,qty-selected.length).forEach(x=>x.checked=true)}
function onInternalCourtToggle(el){const qty=Number(rInternalQty?.value||1),selected=selectedInternalCourts();if(selected.length>qty){el.checked=false;showToast(`Selecciona solo ${qty} cancha${qty>1?'s':''}`)}else if(selected.length<qty)showToast(`Falta seleccionar ${qty-selected.length} cancha${qty-selected.length>1?'s':''}`);checkReservationConflictUI()}
function updateInternalSelectionUI(){const fmt=document.getElementById('rInternalFormat')?.value||'FUT 6',isFut6=fmt==='FUT 6';document.getElementById('rInternalFut6Selection')?.classList.toggle('hidden',!isFut6);document.getElementById('rInternalAllInfo')?.classList.toggle('hidden',isFut6);if(isFut6)syncInternalQtySelection(calendarQuickSlot?.court||null);checkReservationConflictUI()}
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
  if(candidate.resourceIds?.length)return candidate.resourceIds.map(id=>'Cancha '+id);
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
function businessResources(){return settings.businessCatalog?.resources?.map(r=>({...r,key:'Cancha '+r.id,label:(settings.businessCatalog.sites.find(s=>s.id===r.siteId)?.name||'Sede')+' · '+r.name}))||[1,2,3].map(id=>({id,key:'Cancha '+id,label:'Cancha '+id,active:true}));}
function businessResourceName(key){return businessResources().find(r=>r.key===key)?.label||key;}
function businessHours(range,resource){
  const catalog=settings.businessCatalog,site=catalog?.sites.find(s=>s.id===resource?.siteId);if(!site)return availableHoursInRange(range);
  let hours=0;for(let d=parseDashDate(range.start),e=parseDashDate(range.end);d<=e;d=dashAddDays(d,1)){const row=site.schedule[d.getDay()];if(!row?.active)continue;let a=timeToMinutes(row.open),b=timeToMinutes(row.close);if(b<a)b+=1440;hours+=(b-a)/60;}return hours;
}
function businessCapacityHours(range){return businessResources().reduce((sum,r)=>sum+businessHours(range,r),0);}
function businessPeaks(range,rows){
  const capacity={},occupied={},catalog=settings.businessCatalog;if(!catalog)return [];
  for(let date=parseDashDate(range.start),end=parseDashDate(range.end);date<=end;date=dashAddDays(date,1)){
    const day=date.getDay();for(const resource of businessResources()){const site=catalog.sites.find(s=>s.id===resource.siteId);if(!site)continue;const row=site.schedule[day],previous=site.schedule[(day+6)%7],a=timeToMinutes(row.open),b=timeToMinutes(row.close),pa=timeToMinutes(previous.open),pb=timeToMinutes(previous.close);
      for(let h=0;h<24;h++){const start=h*60,end=start+60,own=row.active?Math.max(0,Math.min(end,b<a?1440:b)-Math.max(start,a)):0,spill=previous.active&&pb<pa?Math.max(0,Math.min(end,pb)-start):0,key=day+'-'+h;capacity[key]=(capacity[key]||0)+Math.min(60,own+spill)/60;}}
  }
  for(const r of rows.filter(dashBlocksResource)){const start=Date.parse(r.eventDate+'T'+r.startTime+':00-05:00'),end=start+dashDurationHours(r)*3600000;for(let at=Math.floor(start/3600000)*3600000;at<end;at+=3600000){const local=new Date(at-5*3600000),key=local.getUTCDay()+'-'+local.getUTCHours(),amount=Math.max(0,Math.min(end,at+3600000)-Math.max(start,at))/3600000*reservationResources(r).length;occupied[key]=(occupied[key]||0)+amount;}}
  const days=['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];return Object.entries(occupied).map(([key,hours])=>{const [day,h]=key.split('-').map(Number);return {label:`${days[day]} ${String(h).padStart(2,'0')}:00–${String((h+1)%24).padStart(2,'0')}:00`,pct:capacity[key]?Math.min(100,hours/capacity[key]*100):0};}).sort((a,b)=>b.pct-a.pct);
}
function businessResourceOpen(resource,date,clock){
  const catalog=settings.businessCatalog,space=catalog?.resources.find(r=>'Cancha '+r.id===resource),site=catalog?.sites.find(s=>s.id===space?.siteId);if(!site)return true;if(!space.active||!site.active)return false;
  const day=parseDashDate(date).getDay(),row=site.schedule[day],previous=site.schedule[(day+6)%7],minute=timeToMinutes(clock),a=timeToMinutes(row.open),b=timeToMinutes(row.close),pa=timeToMinutes(previous.open),pb=timeToMinutes(previous.close);
  return row.active&&minute>=a&&minute<(b<a?1440:b)||previous.active&&pb<pa&&minute<pb;
}
function renderBusinessResourceTimeline(){
  const allResources=businessResources(),resources=window.ElevaReservationCalendar?.filterResources(allResources)||allResources,tabs=document.querySelector('.reservation-court-tabs'),host=document.getElementById('reservationCourtTimeline');if(!host||!tabs)return;
  if(!resources.length){tabs.replaceChildren();host.innerHTML='<div class="agenda-empty">Esta sede no tiene canchas en los datos disponibles.</div>';document.getElementById('reservationCourtSummary').textContent='Sin canchas';return;}
  if(!resources.some(r=>r.key===reservationCourtFocus))reservationCourtFocus=resources[0]?.key;
  tabs.replaceChildren();resources.forEach(resource=>{const button=document.createElement('button');button.type='button';button.dataset.resCourt=resource.key;button.textContent=resource.label;button.classList.toggle('active',resource.key===reservationCourtFocus);button.onclick=()=>selectReservationCourt(resource.key,button);tabs.append(button);});
  const strip=document.getElementById('courtsDateStrip');if(strip)strip.innerHTML=reservationDateStripHTML(reservationFocusDate,'selectReservationFocusDate');document.getElementById('courtsDayTitle').textContent=reservationDayLabel(reservationFocusDate);document.getElementById('reservationCourtSummary').textContent=businessResourceName(reservationCourtFocus);
  const segments=[];for(let minute=0;minute<1440;minute+=30){const start=addMinutesToTime('00:00',minute),r=reservationForResourceAt(reservationCourtFocus,reservationFocusDate,start,addMinutesToTime(start,30)),open=businessResourceOpen(reservationCourtFocus,reservationFocusDate,start),key=r?r.id:(open?'free':'closed'),last=segments.at(-1);if(last?.key===key)last.end=minute+30;else segments.push({key,start:minute,end:minute+30,reservation:r});}
  host.replaceChildren();segments.forEach(segment=>{const button=document.createElement('button');button.type='button';button.className='court-segment '+(segment.reservation?'busy':segment.key==='free'?'free':'catalog-slot-closed');const a=addMinutesToTime('00:00',segment.start),b=segment.end===1440?'24:00':addMinutesToTime('00:00',segment.end);const r=segment.reservation;button.innerHTML=`<div class="court-time">${a}–${b}</div><div class="court-main"><b>${escBusinessTimeline(r?reservationDisplayName(r):segment.key==='free'?'Disponible':'Cerrado')}</b><span>${escBusinessTimeline(r?(r.code+' · '+(r.catalogSnapshot?.serviceName||dashProductName(r))):businessResourceName(reservationCourtFocus))}</span></div>`;button.disabled=segment.key==='closed';button.onclick=()=>r?openReservationDetail(r.id):window.ElevaBusinessCatalog.openBooking({resource:reservationCourtFocus,date:reservationFocusDate,time:a});host.append(button);});
}
function escBusinessTimeline(value){return escapeHtml(value);}
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
  const isExclusive=reservationKind==='exclusive',isInternal=reservationKind==='internal';
  const courts=isExclusive?['Cancha 1','Cancha 2','Cancha 3']:(isInternal?selectedInternalCourts():selectedPhysicalCourts());
  const type=isInternal?(rInternalFormat?.value||'FUT 6'):(isExclusive?null:rCourtType.value);
  const space=isExclusive?'Local exclusivo':(isInternal?(type==='FULL'?'Establecimiento completo':type):rCourtType.value);
  return {reservationKind,eventDate:rDate.value,startTime:rStart.value,endTime:rEnd.value,courtType:type,physicalCourts:courts,space}
}
function clearReservationConflictUI(){
  const box=document.getElementById('reservationConflictBox');if(!box)return;
  box.classList.remove('show');box.textContent='';box.removeAttribute('data-conflict-code')
}
function checkReservationConflictUI(){
  const box=document.getElementById('reservationConflictBox');if(!box)return null;
  // Limpia primero cualquier aviso anterior para que nunca quede un conflicto visual obsoleto.
  clearReservationConflictUI();
  if(courtBookingMode==='recurring'&&['court','internal'].includes(reservationKind)){updateRecurringSeriesPreview();return null}
  const candidate=currentReservationCandidate();if(!candidate)return null;
  const conflict=findReservationConflict(candidate,editingReservationId);
  if(conflict){
    const name=reservationDisplayName(conflict);
    box.textContent=`Horario no disponible. Se cruza con ${conflict.code} - ${name}, ${conflict.startTime}-${conflict.endTime}.`;
    box.dataset.conflictCode=String(conflict.code||'');box.classList.add('show')
  }
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
function reservationTaxRate(){ensureTaxSettings();return Math.max(0,Number(settings.taxConfig.taxRate||18))}
function reservationTaxBreakdownFromForm(){const base=Math.max(0,Number(document.getElementById('rBaseTotal')?.value||0)),extra=Math.max(0,Number(document.getElementById('rNonTaxableExtra')?.value||0)),rate=reservationTaxRate(),apply=!!document.getElementById('rApplyIgv')?.checked,tax=apply?roundMoney(base*rate/100):0;return {base,extra,rate,apply,tax,total:roundMoney(base+tax+extra)}}
function recalcReservationTax(){const calc=reservationTaxBreakdownFromForm();if(document.getElementById('rTotal'))rTotal.value=calc.total;if(document.getElementById('rTaxPreview'))rTaxPreview.innerHTML=`<div><span>Base</span><b>${money2(calc.base)}</b></div><div class="${calc.apply?'tax-on':''}"><span>IGV ${calc.rate}%</span><b>${money2(calc.tax)}</b></div><div><span>Total</span><b>${money2(calc.total)}</b></div>`;const row=document.getElementById('rNonTaxableExtraRow');if(row)row.classList.toggle('hidden',calc.extra<=0.001);if(document.getElementById('rNonTaxableExtraDisplay'))rNonTaxableExtraDisplay.textContent=money2(calc.extra);recalcReservationBalance();return calc}
function recalcReservationCourtTotal(){
  const h=updateReservationDuration();
  if(reservationKind==='internal'){if(document.getElementById('rBaseTotal'))rBaseTotal.value=0;rTotal.value=0;rAdvance.value=0;recalcReservationBalance();checkReservationConflictUI();return}
  if(reservationKind!=='court'){recalcReservationTax();return}
  const qty=rCourtType.value==='FUT 9'?1:Number(rCourtQty.value||1),rate=Number(rCourtRate.value||0),base=roundMoney(rate*h*qty);if(document.getElementById('rBaseTotal'))rBaseTotal.value=base;const calc=recalcReservationTax();
  if(document.getElementById('rCourtCalc'))rCourtCalc.innerHTML=`<span>Cálculo</span><b>${qty} ${rCourtType.value==='FUT 9'?'FUT 9':'cancha'+(qty>1?'s':'')} × ${Number.isInteger(h)?h:h.toFixed(1)} h × ${money(rate)} = ${money(base)}${calc.apply?` + IGV ${calc.rate}% = ${money(calc.total)}`:''}</b>`;
  checkReservationConflictUI()
}
function recalcReservationBalance(){const paid=Math.max(0,Number(rAdvance.value||0)),balance=Math.max(0,Number(rTotal.value||0)-paid);if(document.getElementById('rPaidDisplay'))rPaidDisplay.textContent=money(paid);rBalance.textContent=money(balance)}
function saveReservation(postAction='none'){
  const internal=reservationKind==='internal',cid=rClient.value;if(!internal&&!cid){showToast('Selecciona un cliente');return}
  if(!reservationKind){showToast('Selecciona el tipo de reserva');return}
  if(['court','internal'].includes(reservationKind)&&courtBookingMode==='recurring'&&!editingReservationId){if(editingRecurringSeriesId){updateRecurringSeriesFromForm();return}createRecurringSeries();return}
  if(internal&&!String(rInternalTitle?.value||'').trim()){showToast('Ingresa la actividad o motivo');return}
  if(!rDate.value||!rStart.value||!rEnd.value){showToast('Completa fecha y horario');return}
  if(timeToMinutes(rEnd.value)<=timeToMinutes(rStart.value)){showToast('La hora fin debe ser posterior a la hora inicio');return}
  const isExclusive=reservationKind==='exclusive',isInternal=internal;
  const physicalCourts=isExclusive?['Cancha 1','Cancha 2','Cancha 3']:(isInternal?selectedInternalCourts():selectedPhysicalCourts());
  if(!isExclusive&&!isInternal&&rCourtType.value==='FUT 6'&&physicalCourts.length!==Number(rCourtQty.value||1)){showToast('Selecciona exactamente la cantidad de canchas indicada');return}
  if(isInternal&&(rInternalFormat.value==='FUT 6')&&physicalCourts.length!==Number(rInternalQty.value||1)){showToast('Selecciona exactamente la cantidad de canchas indicada');return}
  const conflict=checkReservationConflictUI();if(conflict){showToast('Una de las canchas ya está ocupada');return}
  const q=!isInternal&&rQuote.value?quoteById(rQuote.value):null;
  const conversionPlan=(q&&quoteConversionContext&&String(quoteConversionContext.quoteId)===String(q.id))?quoteConversionContext.mode:null;
  const quoteTotals=q?quoteTotalsForConversion(q):null;
  const taxCalc=isInternal?{base:0,extra:0,rate:0,apply:false,tax:0,total:0}:reservationTaxBreakdownFromForm(),total=isInternal?0:Number(taxCalc.total||0),advance=isInternal?0:Math.max(0,Number(rAdvance.value||0));
  const internalFmt=isInternal?rInternalFormat.value:null,qty=isExclusive?3:(isInternal?(internalFmt==='FUT 6'?Number(rInternalQty.value||1):1):(rCourtType.value==='FUT 9'?1:Number(rCourtQty.value||1)));
  const rateInfo=!isExclusive&&!isInternal?clientCourtRate(cid,rCourtType.value):null;
  const rateSource=isInternal?'internal':(isExclusive?'package':(reservationRateManual?'manual':(rateInfo.special?'client_special':'general')));
  const space=isExclusive?'Local exclusivo':(isInternal?(internalFmt==='FULL'?'Establecimiento completo':(internalFmt==='FUT 9'?'FUT 9':(qty===1?physicalCourts[0]:`${qty} canchas FUT 6`))):(rCourtType.value==='FUT 9'?'FUT 9':(qty===1?physicalCourts[0]:`${qty} canchas FUT 6`)));
  const data={clientId:isInternal?null:String(cid),quoteId:q?q.id:null,reservationKind,eventType:isExclusive?rEventType.value:(isInternal?'Uso interno':'Alquiler de cancha'),people:isExclusive?Number(rPeople.value||0):null,eventDate:rDate.value,startTime:rStart.value,endTime:rEnd.value,space,courtType:isExclusive?null:(isInternal?internalFmt:rCourtType.value),courtQty:isExclusive?3:qty,physicalCourt:!isExclusive&&physicalCourts.length===1?physicalCourts[0]:null,physicalCourts,courtRate:isExclusive?null:(isInternal?0:Number(rCourtRate.value||0)),rateSource,hours:reservationHours(),baseTotal:isInternal?0:taxCalc.base,taxApplied:isInternal?false:taxCalc.apply,taxRate:isInternal?0:taxCalc.rate,taxAmount:isInternal?0:taxCalc.tax,nonTaxableExtra:isInternal?0:taxCalc.extra,total,advance,balance:isInternal?0:Math.max(0,total-advance),notes:isInternal?rInternalNotes.value.trim():rNotes.value.trim(),status:editingReservationId?reservationById(editingReservationId).status:(isInternal?'confirmed':(conversionPlan?'hold':(rStatus.value||'confirmed'))),paymentDueDate:isInternal?null:(document.getElementById('rPaymentDueDate')?.value||rDate.value),quotePaymentPlan:isInternal?null:(conversionPlan||null),regularTotal:conversionPlan?Number(quoteTotals.regular):undefined,singlePaymentTotal:conversionPlan?Number(quoteTotals.single):undefined,regularBaseTotal:conversionPlan?Number(quoteTotals.regularBase):undefined,regularTaxAmount:conversionPlan?Number(quoteTotals.regularTax):undefined,singleBaseTotal:conversionPlan?Number(quoteTotals.singleBase):undefined,singleTaxAmount:conversionPlan?Number(quoteTotals.singleTax):undefined,discountAmount:conversionPlan?Number(quoteTotals.discount):undefined,singlePaymentPending:conversionPlan==='single',internalUseType:isInternal?rInternalUseType.value:null,internalTitle:isInternal?rInternalTitle.value.trim():null,internalResponsible:isInternal?rInternalResponsible.value.trim():null};
  if(editingReservationId){
    const existing=reservationById(editingReservationId);if(!existing)return;const before=reservationAuditSnapshot(existing);
    if(existing.seriesId){existing.seriesException=true;existing.seriesOriginalDate=existing.seriesOriginalDate||existing.eventDate;existing.seriesOriginalBlockId=existing.seriesOriginalBlockId||existing.seriesBlockId;existing.seriesExceptionAt=nowISO()}
    Object.assign(existing,data,{updatedAt:nowISO()});if(q){q.status='reserved';q.reservedAt=q.reservedAt||nowISO()}
    const changes=reservationAuditChanges(before,reservationAuditSnapshot(existing));if(changes.length)addAuditEvent('reservation',existing.id,existing.code,isInternal?'Ocupación actualizada':'Reserva actualizada',changes,existing.seriesId?'Excepción individual de serie recurrente':'');
    persist();closeSheet('reservationSheet');editingReservationId=null;renderReservations();renderQuotes();renderCalendar();renderHome();renderReservationWorkspace();showToast(isInternal?'Ocupación actualizada':'Reserva actualizada');go('reservations');return
  }
  const r={id:crypto.randomUUID(),code:isInternal?nextOccupancyCode():nextReservationCode(),...data,createdAt:nowISO()};
  reservations.unshift(r);addAuditEvent('reservation',r.id,r.code,isInternal?'Ocupación creada':'Reserva creada',[],`${reservationDisplayName(r)} · ${r.eventDate} · ${r.startTime}-${r.endTime}`);if(q){q.status='reserved';q.reservedAt=nowISO();q.reservationId=r.id}
  const postPlan=conversionPlan;quoteConversionContext=null;persist();closeSheet('reservationSheet');renderReservations();renderQuotes();renderCalendar();renderHome();renderReservationWorkspace();go('reservations');
  if(isInternal){showToast('Ocupación '+r.code+' creada');return}
  if(postPlan==='single'){showToast(`Pre-reserva ${r.code} creada · registra el pago único`);setTimeout(()=>openPaymentSheet(r.id,Number(r.singlePaymentTotal||r.balance)),30);return}
  if(postPlan==='installments'){const half=Math.round(Number(r.regularTotal||r.total)*50)/100;showToast(`Pre-reserva ${r.code} creada · registra el adelanto`);setTimeout(()=>openPaymentSheet(r.id,half),30);return}
  if(postAction==='pay'){showToast(`${r.code} creada · registra el cobro recibido`);setTimeout(()=>openPaymentSheet(r.id),30);return}
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

function normalizeReservationSearchText(value){
  return String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim()
}
function reservationSearchQuery(){return normalizeReservationSearchText(document.getElementById('reservationSearch')?.value||'')}
function reservationSearchHaystack(r){
  const c=clientById(r.clientId)||{};
  const kind=r.reservationKind||(r.space==='Local exclusivo'?'exclusive':'court');
  const type=kind==='internal'?internalUseTypeLabel(r.internalUseType):(kind==='exclusive'?'Evento exclusivo':'Alquiler de cancha');
  const resources=reservationResources(r).join(' ');
  return normalizeReservationSearchText([
    r.code,r.seriesCode,r.seriesBlockIndex?`Horario ${r.seriesBlockIndex}`:'',
    reservationDisplayName(r),c.name,c.phone,c.company,c.doc,c.email,c.notes,
    type,r.courtType,r.space,resources,r.eventType,r.internalTitle,r.internalResponsible,
    r.notes,reservationStatusLabel(r),r.eventDate,r.startTime,r.endTime,reservationDueDate(r),
    Number(r.total||0),Number(r.balance||0)
  ].filter(Boolean).join(' '))
}
function reservationMatchesGlobalSearch(r,query){
  const terms=normalizeReservationSearchText(query).split(/\s+/).filter(Boolean);
  if(!terms.length)return true;
  const hay=reservationSearchHaystack(r);
  return terms.every(term=>hay.includes(term))
}
function reservationSearchKindLabel(r){
  const kind=r.reservationKind||(r.space==='Local exclusivo'?'exclusive':'court');
  if(kind==='internal')return internalUseTypeLabel(r.internalUseType);
  if(kind==='exclusive')return r.eventType?`Evento · ${r.eventType}`:'Evento exclusivo';
  return `${r.courtType||'Cancha'}${r.seriesCode?' · Recurrente':''}`
}
function renderReservationSearchResults(){
  const host=document.getElementById('reservationSearchResults');if(!host)return;
  const query=reservationSearchQuery();
  const today=localDateValue();
  let arr=reservations.filter(r=>reservationMatchesGlobalSearch(r,query));
  arr.sort((a,b)=>{
    const af=a.eventDate>=today,bf=b.eventDate>=today;
    if(af!==bf)return af?-1:1;
    const av=(a.eventDate||'')+(a.startTime||''),bv=(b.eventDate||'')+(b.startTime||'');
    return af?av.localeCompare(bv):bv.localeCompare(av)
  });
  const title=document.getElementById('reservationSearchTitle'),summary=document.getElementById('reservationSearchSummary');
  if(title)title.textContent=query?`Resultados para “${document.getElementById('reservationSearch')?.value.trim()||''}”`:'Resultados';
  if(summary)summary.textContent=`${arr.length} resultado${arr.length===1?'':'s'} · todas las fechas y estados`;
  if(!arr.length){host.innerHTML=`<div class="reservation-search-empty">No encontramos reservas u ocupaciones con “${escapeHtml(document.getElementById('reservationSearch')?.value.trim()||'')}”.</div>`;return}
  host.innerHTML=`<div class="reservation-search-list">${arr.map(r=>{
    const name=reservationDisplayName(r),internal=isInternalReservation(r),finance=internal?internalUseTypeLabel(r.internalUseType):(Number(r.balance||0)>0?`Pendiente ${money(r.balance)}`:'Pagado ✓');
    const meta=[r.code,r.seriesCode,fmtScheduled(r.eventDate,r.startTime),reservationSearchKindLabel(r),r.courtType==='FUT 9'?'Cancha 1 + 2 + 3':reservationResources(r).join(' + ')].filter(Boolean).join(' · ');
    return `<button class="reservation-search-row" onclick="openReservationDetail('${String(r.id)}')"><div class="reservation-search-main"><b>${escapeHtml(name)}</b><span>${escapeHtml(meta)}</span></div><div class="reservation-search-side"><b>${escapeHtml(finance)}</b><span>${escapeHtml(reservationStatusLabel(r))} ›</span></div></button>`
  }).join('')}</div>`
}
function onReservationGlobalSearch(){
  const active=!!reservationSearchQuery();
  document.getElementById('reservationSearchClear')?.classList.toggle('hidden',!active);
  document.getElementById('reservationViewSwitch')?.classList.toggle('hidden',active);
  document.getElementById('reservationSearchPanel')?.classList.toggle('hidden',!active);
  if(active){
    ['reservationAgendaPanel','reservationCourtsPanel','reservationListPanel'].forEach(id=>document.getElementById(id)?.classList.add('hidden'));
    renderReservationSearchResults();
  }else{
    setReservationWorkspace(reservationWorkspace);
  }
}
function clearReservationGlobalSearch(){
  const input=document.getElementById('reservationSearch');if(input)input.value='';
  onReservationGlobalSearch();
  input?.focus()
}

function renderReservationWorkspace(){
  if(reservationSearchQuery()){renderReservationSearchResults();return}
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
    .filter(r=>(window.ElevaReservationCalendar?window.ElevaReservationCalendar.occursOn(r,reservationFocusDate)&&window.ElevaReservationCalendar.matches(r):r.eventDate===reservationFocusDate))
    .sort((a,b)=>a.startTime.localeCompare(b.startTime));

  const sub=document.getElementById('agendaDaySummary');
  if(sub)sub.textContent=`${arr.length} reserva${arr.length===1?'':'s'} · ${arr.filter(r=>!['cancelled','no_show'].includes(r.status)).length} ocupaciones`;

  if(!arr.length){
    host.innerHTML='<div class="agenda-empty">No hay ocupaciones para este día.</div>';
    return
  }

  host.innerHTML=arr.map(r=>{
    const kind=r.reservationKind||(r.space==='Local exclusivo'?'exclusive':'court'),name=reservationDisplayName(r);
    const space=kind==='exclusive'?'Evento exclusivo':(kind==='internal'?`${internalUseTypeLabel(r.internalUseType)} · ${r.space||reservationResources(r).join(' + ')}`:(r.courtType==='FUT 9'?'FUT 9':(reservationResources(r).join(' + ')||r.space)));
    const finance=kind==='internal'?'Sin cobro':(['cancelled','no_show'].includes(r.status)?reservationRefundLabel(r):(Number(r.balance||0)>0?`Pendiente ${money(r.balance)}`:'Pagado ✓'));
    const location=window.ElevaReservationCalendar?.location(r),times=window.ElevaReservationCalendar?.dayTimes(r,reservationFocusDate),state=reservationStatusLabel(r);
    const canPay=hasPermission('register_payments')&&kind!=='internal'&&Number(r.balance||0)>0&&!['cancelled','no_show'].includes(r.status);
    return `<div class="agenda-row" role="button" tabindex="0" onclick="openReservationDetail('${r.id}')" onkeydown="if(event.target===this&&(event.key==='Enter'||event.key===' ')){event.preventDefault();openReservationDetail('${r.id}')}">
      <div class="agenda-time"><b>${escapeHtml(times?.start||r.startTime)}</b><span>${escapeHtml(times?.end||r.endTime)}</span>${times?.continues?'<small>Continúa</small>':''}</div>
      <div class="agenda-main">
        <div class="agenda-client">${escapeHtml(name)}</div>
        <div class="agenda-space">${escapeHtml(location?.courtLabel||space)}</div>
        ${location?`<div class="agenda-site">${escapeHtml(location.siteLabel)} · ${escapeHtml(location.format)}${r.code?' · '+escapeHtml(r.code):''}</div>`:''}
        <div class="agenda-finance ${Number(r.balance||0)>0||['cancelled','no_show'].includes(r.status)?'pending':'paid'}">${escapeHtml(finance)}</div>
      </div>
      <div class="agenda-side">${reservationStatusBadge(r,'agenda-status')}${canPay?`<button class="agenda-pay-btn" onclick="event.stopPropagation();openPaymentSheet('${r.id}')">Cobrar</button>`:''}</div>
    </div>`
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
  if(settings.businessCatalog){renderBusinessResourceTimeline();return;}
  const strip=document.getElementById('courtsDateStrip');if(strip){strip.innerHTML=reservationDateStripHTML(reservationFocusDate,'selectReservationFocusDate');alignReservationDateStrip(strip)}
  const title=document.getElementById('courtsDayTitle');if(title)title.textContent=reservationDayLabel(reservationFocusDate);

  document.querySelectorAll('[data-res-court]').forEach(b=>b.classList.toggle('active',b.dataset.resCourt===reservationCourtFocus));

  const host=document.getElementById('reservationCourtTimeline');if(!host)return;
  const arr=reservationsForFocusedCourt();
  const summary=document.getElementById('reservationCourtSummary');
  if(summary)summary.textContent=`${reservationCourtFocus} · ${arr.length} ocupación${arr.length===1?'':'es'} en el día`;

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
    const r=seg.reservation,kind=r.reservationKind||(r.space==='Local exclusivo'?'exclusive':'court'),name=reservationDisplayName(r);
    const cls=kind==='internal'?'hold':(r.status==='hold'?'hold':(kind==='exclusive'?'exclusive':'busy'));
    const typeLabel=kind==='internal'?internalUseTypeLabel(r.internalUseType):(kind==='exclusive'?'Evento exclusivo':(r.courtType==='FUT 9'?'FUT 9':'FUT 6'));
    return `<button class="court-segment ${cls}" onclick="openReservationDetail('${r.id}')">
      <div class="court-time">${start} - ${end}</div>
      <div class="court-main"><b>${escapeHtml(name)}</b><span>${escapeHtml(typeLabel)} · ${escapeHtml(r.code)}</span></div>
      <div class="court-action">${kind==='internal'?'Ver':(r.status==='hold'?'Pre-reserva':'Ver')}</div>
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
  const map={hold:'Pendiente',confirmed:'Confirmada',completed:'Realizada',cancelled:'Cancelada',no_show:'No asistió',rescheduled:'Reprogramada'};
  if(isInternalReservation(r)&&r.status==='confirmed')return r.internalUseType==='maintenance'?'Bloqueo programado':'Programada';
  return map[r.status]||'Confirmada'
}
function reservationStatusClass(r){
  return 'reservation-state-'+(r.status||'confirmed');
}
function reservationStatusBadge(r,classes='badge'){
  const text=escapeHtml(reservationStatusLabel(r)),style=classes+' '+reservationStatusClass(r);
  return hasPermission('manage_reservations')&&!r.seriesPaused?`<button type="button" class="${style} reservation-state-action" aria-label="Cambiar estado: ${text}" onclick="event.stopPropagation();openReservationStatus('${r.id}')">${text}<span aria-hidden="true"> ▾</span></button>`:`<span class="${style}">${text}</span>`;
}
function openReservationStatus(id){
  if(!requirePermission('manage_reservations'))return;
  const r=reservationById(id);if(!r||r.seriesPaused)return;
  openReservationId=id;window.openReservationOutcome();
}
function reservationRefundLabel(r){
  if(isInternalReservation(r)||!['cancelled','no_show'].includes(r.status))return 'No aplica';
  const f=window.ElevaCancellation?.funds(r.id),paid=Number(f?.cash_paid??r.advance??0),refunded=Number(f?.refunded_amount??r.refundedAmount??0);
  if(paid<=0)return 'No aplica';
  if(f&&(Number(f.pending_amount)>0.001||Number(f.refund_due)>0.001))return 'Reembolso pendiente';
  if(refunded>=paid-0.001)return 'Reembolso completo';
  if(refunded>0.001)return 'Reembolso parcial';
  return 'Sin reembolso';
}
function reservationDateHeading(ds){
  if(ds===localDateValue())return 'Hoy';
  const d=new Date(ds+'T12:00:00');
  return d.toLocaleDateString('es-PE',{weekday:'long',day:'numeric',month:'long'}).replace(/^./,x=>x.toUpperCase())
}
function renderReservations(){
  const host=document.getElementById('reservationList');if(!host)return;
  const today=localDateValue(),search=reservationSearchQuery();
  let arr=[...reservations].filter(r=>{if(window.ElevaReservationCalendar&&!window.ElevaReservationCalendar.matches(r))return false;const internal=isInternalReservation(r),activeMoney=!internal&&!['cancelled','no_show'].includes(r.status);if(reservationFilter==='upcoming'&&(['cancelled','no_show','completed'].includes(r.status)||r.eventDate<today))return false;if(reservationFilter==='today'&&r.eventDate!==today)return false;if(reservationFilter==='pending'&&!(activeMoney&&Number(r.balance||0)>0))return false;if(reservationFilter==='paid'&&!(activeMoney&&Number(r.total||0)>0&&Number(r.balance||0)<=0.001))return false;if(reservationFilter==='hold'&&r.status!=='hold')return false;return !search||reservationMatchesGlobalSearch(r,search)});
  const listSummary=document.getElementById('reservationListSummary');if(listSummary){if(reservationFilter==='pending'){const total=arr.reduce((sum,r)=>sum+Number(r.balance||0),0);listSummary.innerHTML=`<b>${money(total)} por cobrar</b><span>${arr.length} reserva${arr.length===1?'':'s'} con saldo pendiente</span>`;listSummary.classList.remove('hidden')}else if(reservationFilter==='paid'){listSummary.innerHTML=`<b>${arr.length} reserva${arr.length===1?'':'s'} pagada${arr.length===1?'':'s'}</b><span>Saldo pendiente S/ 0</span>`;listSummary.classList.remove('hidden')}else listSummary.classList.add('hidden')}
  arr.sort((a,b)=>(a.eventDate+a.startTime).localeCompare(b.eventDate+b.startTime));if(!arr.length){host.innerHTML='<div class="card empty">No hay reservas en este filtro.</div>';return}
  const groups={};arr.forEach(r=>(groups[r.eventDate]||(groups[r.eventDate]=[])).push(r));
  host.innerHTML=Object.keys(groups).sort().map(ds=>{const cards=groups[ds].map(r=>{const name=reservationDisplayName(r),kind=r.reservationKind||(r.space==='Local exclusivo'?'exclusive':'court'),special=r.rateSource==='client_special',duration=Number(r.hours||0),durText=(Number.isInteger(duration)?duration:duration.toFixed(1))+' h',internal=kind==='internal';return `<div class="card reservation-card-v11"><div class="lead"><div class="initials">${initials(name)}</div><div class="lead-main"><div class="lead-name">${escapeHtml(r.code)} · ${escapeHtml(name)}</div><div class="lead-meta">${internal?escapeHtml(internalUseTypeLabel(r.internalUseType)):(kind==='exclusive'?'Evento exclusivo':escapeHtml(r.courtType||'Alquiler de cancha'))} · ${escapeHtml(r.space)}</div><div class="reservation-mainline"><b>${escapeHtml(r.startTime)} - ${escapeHtml(r.endTime)}</b><span>·</span><span>${durText}</span></div>${internal?`<div class="internal-use-chip ${r.internalUseType==='maintenance'?'maintenance':(r.internalUseType==='courtesy'?'courtesy':'')}">Sin cobro · cuenta en ocupación</div>${r.seriesCode?`<div class="series-chip">${escapeHtml(r.seriesCode)}${r.seriesBlockIndex?` · Horario ${Number(r.seriesBlockIndex)}`:' · Recurrente'}</div>`:''}`:(kind==='court'?`<div class="rate-tag ${special?'special':''}">${special?'Tarifa especial':'Tarifa '+(r.rateSource==='manual'?'manual':'general')} · ${money(r.courtRate||0)}${r.courtType==='FUT 6'?' / cancha/h':' / h'}</div>${r.seriesCode?`<div class="series-chip">${escapeHtml(r.seriesCode)}${r.seriesBlockIndex?` · Horario ${Number(r.seriesBlockIndex)}`:' · Recurrente'}</div>`:''}`:'')}</div><div class="lead-right">${reservationStatusBadge(r)}</div></div>${internal?'':`<div class="reservation-money-grid"><div class="reservation-money"><span>Total</span><b>${money(r.total)}</b></div><div class="reservation-money"><span>Cobrado</span><b>${money(r.advance)}</b></div><div class="reservation-money"><span>Saldo</span><b>${money(r.balance)}</b></div></div>`}<div class="actions">${!internal&&Number(r.balance||0)>0&&!['cancelled','no_show'].includes(r.status)?`<button class="btn primary-small" onclick="openPaymentSheet('${r.id}')">Cobrar ${money(r.balance)}</button>`:''}<button class="btn" onclick="openReservationDetail('${r.id}')">Ver</button><button class="btn btn-edit" onclick="editReservation('${r.id}')">Editar</button>${internal?'':`<button class="btn btn-share" onclick="openShareReservation('${r.id}')">Compartir</button>`}</div></div>`}).join('');return `<div class="reservation-group"><div class="reservation-group-title">${reservationDateHeading(ds)}</div><div class="stack">${cards}</div></div>`}).join('')
}
function openReservationDetail(id){
  const r=reservationById(id);if(!r)return;openReservationId=r.id;const internal=isInternalReservation(r),c=clientById(r.clientId)||{name:'Cliente'},q=r.quoteId?quoteById(r.quoteId):null,name=reservationDisplayName(r);rdTitle.textContent=r.code+' · '+name;const kind=r.reservationKind||(r.space==='Local exclusivo'?'exclusive':'court');
  if(internal){reservationDetailBody.innerHTML=`<div class="detail-row"><span>Estado</span>${reservationStatusBadge(r)}</div><div class="detail-row"><span>Tipo</span><b>${escapeHtml(internalUseTypeLabel(r.internalUseType))}</b></div>${r.seriesCode?`<div class="detail-row"><span>Serie recurrente</span><b>${escapeHtml(r.seriesCode)}${r.seriesBlockIndex?` · Horario ${Number(r.seriesBlockIndex)}`:''}</b></div>`:''}<div class="detail-row"><span>Actividad / motivo</span><b>${escapeHtml(r.internalTitle||'Uso interno')}</b></div><div class="detail-row"><span>Responsable</span><b>${escapeHtml(r.internalResponsible||'—')}</b></div><div class="detail-row"><span>Espacio</span><b>${escapeHtml(r.space||'Cancha')}</b></div><div class="detail-row"><span>Canchas</span><b>${escapeHtml(reservationResources(r).join(' + '))}</b></div><div class="detail-row"><span>Fecha</span><b>${fmtScheduled(r.eventDate,r.startTime)} - ${escapeHtml(r.endTime)}</b></div><div class="detail-row"><span>Impacto financiero</span><b>Sin cobro</b></div><div class="detail-row"><span>Ocupación</span><b>Sí contabiliza</b></div>${r.notes?`<div class="detail-row"><span>Notas</span><b>${escapeHtml(r.notes)}</b></div>`:''}<div class="detail-row"><span>Creado</span><b>${fmtDateTime(r.createdAt)}</b></div>`}else{const paymentRows=movements.filter(m=>m.type==='payment'&&paymentTouchesReservation(m,r.id)).sort((a,b)=>String(a.occurredAt||a.createdAt||'').localeCompare(String(b.occurredAt||b.createdAt||''))),movementPaid=paymentRows.reduce((sum,m)=>sum+paymentAppliedAmount(m,r.id),0),legacyPaid=Math.max(0,Number(r.advance||0)-movementPaid),legacyRow=legacyPaid>0.001?`<div class="payment-history-row legacy"><div class="payment-history-top"><div><b>Cobro previo</b><div class="payment-history-meta">Registrado antes del historial detallado de cobros</div></div><strong>${money(legacyPaid)}</strong></div></div>`:'',paymentHistory=(paymentRows.length||legacyPaid>0.001)?`<div class="payment-history"><div class="payment-history-title">Historial de cobros</div>${legacyRow}${paymentRows.map(m=>`<div class="payment-history-row"><div class="payment-history-top"><div><b>${escapeHtml(m.paymentStage||'Cobro')}</b><div class="payment-history-meta">${escapeHtml(m.method||'Sin método')} · ${escapeHtml(treasuryAccountLabel(movementAccountId(m)))} · ${fmtDateTime(m.occurredAt||m.createdAt)}</div></div><strong>${money(paymentAppliedAmount(m,r.id))}</strong></div>${paymentApplications(m).length>1||paymentUnappliedAmount(m)>0.001?`<div class="payment-history-link">Pago total <b>${money(m.amount)}</b>${paymentApplications(m).length>1?` aplicado a ${paymentApplications(m).length} reservas`:''}${paymentUnappliedAmount(m)>0.001?` · sin aplicar ${money(paymentUnappliedAmount(m))}`:''} · ${escapeHtml(m.code||'')}</div>`:''}${m.attachmentId?`<div class="payment-history-proof"><button class="cash-proof-btn" onclick="openMovementAttachment('${String(m.id)}')">Ver comprobante</button></div>`:''}</div>`).join('')}</div>`:'';reservationDetailBody.innerHTML=`<div class="detail-row"><span>Estado</span>${reservationStatusBadge(r)}</div><div class="detail-row"><span>Tipo de reserva</span><b>${kind==='exclusive'?'Evento exclusivo':'Alquiler de cancha'}</b></div>${r.seriesCode?`<div class="detail-row"><span>Serie recurrente</span><b>${escapeHtml(r.seriesCode)}${r.seriesBlockIndex?` · Horario ${Number(r.seriesBlockIndex)}`:''}</b></div>`:''}<div class="detail-row"><span>Cliente</span><b>${escapeHtml(c.name)}</b></div>${kind==='exclusive'?`<div class="detail-row"><span>Evento</span><b>${escapeHtml(r.eventType)}</b></div><div class="detail-row"><span>Asistentes</span><b>${Number(r.people||0)||'—'}</b></div>`:`<div class="detail-row"><span>Formato</span><b>${escapeHtml(r.courtType||r.space)}</b></div><div class="detail-row"><span>Canchas</span><b>${escapeHtml(window.ElevaReservationCalendar?.location(r)?.courtLabel||reservationResources(r).join(' + '))}</b></div><div class="detail-row"><span>Tarifa</span><b>${money(r.courtRate||0)} / hora${r.courtType==='FUT 6'?' / cancha':''}</b></div>`}<div class="detail-row"><span>Fecha</span><b>${fmtScheduled(r.eventDate,r.startTime)} - ${escapeHtml(r.endTime)}</b></div>${kind==='exclusive'?`<div class="detail-row"><span>Espacio</span><b>${escapeHtml(r.space||'Local exclusivo')}</b></div>`:''}${r.taxApplied?`<div class="detail-row"><span>Subtotal base</span><b>${money2(r.baseTotal??Math.max(0,Number(r.total||0)-Number(r.taxAmount||0)-Number(r.nonTaxableExtra||0)))}</b></div><div class="detail-row"><span>IGV ${Number(r.taxRate||18)}%</span><b>${money2(r.taxAmount||0)}</b></div>${Number(r.nonTaxableExtra||0)>0?`<div class="detail-row"><span>Garantía / no gravado</span><b>${money2(r.nonTaxableExtra)}</b></div>`:''}`:''}<div class="detail-row"><span>Total</span><b>${money(r.total)}</b></div><div class="detail-row"><span>Cobrado</span><b>${money(r.advance||0)}</b></div><div class="detail-row"><span>Saldo pendiente</span><b>${money(['cancelled','no_show'].includes(r.status)?0:r.balance)}</b></div><div class="detail-row"><span>Vencimiento</span><b>${fmtScheduled(reservationDueDate(r),'')}</b></div>${['cancelled','no_show'].includes(r.status)?`<div class="detail-row"><span>Reembolso</span><b>${reservationRefundLabel(r)}</b></div>`:''}${r.paymentDisposition?`<div class="detail-row"><span>Destino del pago</span><b>${paymentDispositionLabel(r.paymentDisposition)}</b></div>`:''}${Number(r.refundedAmount||0)>0?`<div class="detail-row"><span>Devuelto</span><b>${money(r.refundedAmount)}</b></div>`:''}${Number(r.creditAmount||0)>0?`<div class="detail-row"><span>Saldo a favor generado</span><b>${money(r.creditAmount)}</b></div>`:''}${Number(r.retainedAmount||0)>0?`<div class="detail-row"><span>Retenido</span><b>${money(r.retainedAmount)}</b></div>`:''}${Number(c.creditBalance||0)>0?`<div class="detail-row"><span>Saldo a favor del cliente</span><b>${money(c.creditBalance)}</b></div>`:''}<div class="detail-row"><span>Cotización</span><b>${q?escapeHtml(q.code):'Reserva directa'}</b></div><div class="detail-row"><span>Creado</span><b>${fmtDateTime(r.createdAt)}</b></div>${paymentHistory}`}
  reservationDetailBody.insertAdjacentHTML('beforeend',reservationActivityHtml(r));
  const payBtn=document.getElementById('reservationPayBtn');if(payBtn){const canPay=hasPermission('register_payments')&&!internal&&Number(r.balance||0)>0&&!['cancelled','no_show'].includes(r.status);payBtn.classList.toggle('hidden',!canPay);if(canPay)payBtn.textContent=`Registrar cobro · ${money(r.balance)}`}const holdBtn=document.getElementById('confirmHoldBtn');if(holdBtn)holdBtn.classList.toggle('hidden',!hasPermission('manage_reservations')||internal||r.status!=='hold');const editBtn=document.getElementById('reservationEditBtn');if(editBtn)editBtn.classList.toggle('hidden',!hasPermission('manage_reservations'));const seriesBtn=document.getElementById('manageSeriesBtn');if(seriesBtn)seriesBtn.classList.toggle('hidden',!hasPermission('manage_reservations')||!r.seriesId);const shareBtn=document.getElementById('shareOpenReservationBtn');if(shareBtn)shareBtn.classList.toggle('hidden',internal);const outcomeBtn=document.getElementById('reservationOutcomeBtn');if(outcomeBtn){outcomeBtn.classList.toggle('hidden',!hasPermission('manage_reservations'));outcomeBtn.textContent=['cancelled','no_show'].includes(r.status)&&settings.operatingPolicies?.cancellations?'Ver / resolver saldo':'Gestionar reserva'}openSheet('reservationDetailSheet')
}
function payOpenReservation(){const r=reservationById(openReservationId);if(!r||isInternalReservation(r)||Number(r.balance||0)<=0)return;closeSheet('reservationDetailSheet');openPaymentSheet(r.id)}

function editOpenReservation(){if(!requirePermission('manage_reservations'))return;if(!openReservationId)return;const r=reservationById(openReservationId);if(r?.seriesId){openRecurringEditScope();return}closeSheet('reservationDetailSheet');editReservation(openReservationId)}
function shareOpenReservation(){if(openReservationId){closeSheet('reservationDetailSheet');openShareReservation(openReservationId)}}
function editReservation(id){if(!requirePermission('manage_reservations'))return;
  const r=reservationById(id);if(!r)return;editingReservationId=r.id;reservationKind=r.reservationKind||(r.space==='Local exclusivo'?'exclusive':'court');prepareReservationForm(reservationKind);reservationFormTitle.textContent=reservationKind==='exclusive'?'Editar evento exclusivo':(reservationKind==='internal'?'Editar ocupación interna':'Editar reserva de cancha');reservationSaveBtn.textContent='Guardar cambios';setCourtBookingMode('single');
  rDate.value=r.eventDate;if(document.getElementById('rPaymentDueDate'))rPaymentDueDate.value=r.paymentDueDate||r.eventDate;rStatus.value=r.status;rStatus.disabled=true;
  if(reservationKind==='internal'){rInternalUseType.value=r.internalUseType||'activity';rInternalTitle.value=r.internalTitle||'Actividad interna';rInternalResponsible.value=r.internalResponsible||'';rInternalNotes.value=r.notes||'';rInternalFormat.value=r.courtType||'FUT 6';updateInternalSelectionUI();if(rInternalFormat.value==='FUT 6'){rInternalQty.value=String(r.courtQty||reservationResources(r).length||1);const used=reservationResources(r);[rInternalSel1,rInternalSel2,rInternalSel3].forEach(x=>x.checked=used.includes(x.value))}setCourtScheduleFromTimes(r.startTime,r.endTime);checkReservationConflictUI();openSheet('reservationSheet');return}
  rClient.value=String(r.clientId);syncReservationClientSearch();populateReservationQuotes();if(r.quoteId)rQuote.value=String(r.quoteId);rAdvance.value=Number(r.advance||0);if(document.getElementById('reservationSaveAndPayBtn'))reservationSaveAndPayBtn.classList.add('hidden');rNotes.value=r.notes||'';
  if(document.getElementById('rApplyIgv'))rApplyIgv.checked=!!r.taxApplied;if(document.getElementById('rNonTaxableExtra'))rNonTaxableExtra.value=Number(r.nonTaxableExtra||0);if(document.getElementById('rTaxInheritedNote'))rTaxInheritedNote.classList.toggle('hidden',!r.quoteId);if(reservationKind==='exclusive'){rEventType.value=[...rEventType.options].some(o=>o.value===r.eventType)?r.eventType:'Otro';rPeople.value=Number(r.people||0);rStartExclusive.value=r.startTime;rEndExclusive.value=r.endTime;syncExclusiveSchedule();if(document.getElementById('rBaseTotal')){rBaseTotal.readOnly=false;rBaseTotal.value=Number(r.baseTotal!==undefined?r.baseTotal:Math.max(0,Number(r.total||0)-Number(r.nonTaxableExtra||0)-Number(r.taxAmount||0)))}recalcReservationTax()}else{rCourtType.value=r.courtType||'FUT 6';updateCourtSelectionUI();if(rCourtType.value==='FUT 6'){rCourtQty.value=String(r.courtQty||reservationResources(r).length||1);const used=reservationResources(r);[rCourtSel1,rCourtSel2,rCourtSel3].forEach(x=>x.checked=used.includes(x.value))}rCourtRate.value=Number(r.courtRate||0);reservationRateManual=r.rateSource==='manual';const label=document.querySelector('#rRateSource span:last-child'),c=clientById(r.clientId);rRateSource.classList.toggle('special',r.rateSource==='client_special');if(label)label.textContent=r.rateSource==='client_special'?`Tarifa especial de ${c?.name||'cliente'}`:(r.rateSource==='manual'?'Tarifa modificada para esta reserva':'Tarifa general');setCourtScheduleFromTimes(r.startTime,r.endTime);recalcReservationCourtTotal()}
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
  canvasText(ctx,reservationStatusLabel(r).toUpperCase(),68,212,34,'900',r.status==='hold'?'#f3b61f':green);

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
  const map={mixed:'Pendiente de resolver',refund:'Reembolso',credit:'Saldo a favor',reprogram:'Reprogramación',retained:'Retenido / sin devolución',normal:'Pago aplicado al servicio'};
  return map[value]||value||'—'
}

function openReservationOutcome(){if(!requirePermission('manage_reservations'))return;
  const r=reservationById(openReservationId);if(!r)return;
  const paid=Math.max(0,Number(r.advance||0));
  outcomePaidLabel.textContent=money(paid);
  outcomeStatus.value=['hold','confirmed','completed','cancelled','no_show','rescheduled'].includes(r.status)?r.status:'confirmed';
  outcomeReason.value=r.outcomeReason||((r.status==='no_show')?'no_show':(['hold','confirmed','completed'].includes(r.status)?'other':'client'));
  outcomeDisposition.value=r.paymentDisposition||((r.status==='rescheduled')?'reprogram':settings.operatingPolicies?.cancellations?'mixed':'retained');
  outcomeRefund.value=Number(r.refundedAmount||0);
  fillTreasuryAccountSelect(document.getElementById('outcomeRefundAccount'),r.refundAccountId||'');
  outcomeCredit.value=Number(r.creditAmount||0);
  outcomeRetained.value=Number(r.retainedAmount||0);
  outcomeNote.value=r.outcomeNote||'';
  updateOutcomeUI();
  closeSheet('reservationDetailSheet');openSheet('reservationOutcomeSheet')
}

function updateOutcomeUI(){
  const status=outcomeStatus.value,r=reservationById(openReservationId),internal=isInternalReservation(r);
  const hints={hold:'Pendiente de confirmación. El espacio sigue reservado; no indica que el servicio se haya realizado.',confirmed:'Reserva asegurada según las reglas de confirmación y cobro actuales. El encargado debe marcar Realizada cuando se haya atendido.',completed:'El encargado confirma que el servicio se realizó. El saldo de pago se controla por separado.',cancelled:'Libera el espacio. El destino del dinero se revisa por separado; cancelar no ejecuta un reembolso.',no_show:'El cliente no asistió. El destino del dinero se revisa por separado.',rescheduled:'Conserva el pago y permite ajustar fecha u horario. Seguirá identificada como Reprogramada.'};
  document.getElementById('reservationStateHint').textContent=status==='rescheduled'&&r?.catalogSnapshot?'El pago se conserva. Esta reserva mantiene el horario actual hasta gestionar otra fecha; la tarifa y los espacios acordados están protegidos.':hints[status]||'';
  outcomeReason.closest('.field').hidden=['hold','confirmed','completed'].includes(status);
  if(internal){outcomeFinanceBlock.classList.add('hidden');return}
  if(['hold','confirmed','completed'].includes(status)){outcomeFinanceBlock.classList.add('hidden');return;}
  const financial=['cancelled','no_show'].includes(status);
  outcomeFinanceBlock.classList.toggle('hidden',status==='completed');
  if(status==='rescheduled'){
    outcomeFinanceBlock.classList.remove('hidden');
    outcomeDisposition.value='reprogram';
    outcomeReprogramNote.textContent=r?.catalogSnapshot?'Cambiar este estado no modifica fecha ni espacios. Las reservas por sede conservan su tarifa acordada; el cambio de servicio u horario se gestiona con una nueva reserva, sin crear pagos ficticios.':'El pago se mantiene asociado a la reserva. Después de guardar, podrás editar fecha, hora o cancha.';
  }
  if(financial&&settings.operatingPolicies?.cancellations){if(!['mixed','credit'].includes(outcomeDisposition.value))outcomeDisposition.value='mixed';outcomeRefund.value=0;outcomeRetained.value=0;for(const option of outcomeDisposition.options)option.hidden=!['mixed','credit'].includes(option.value);outcomeRefund.closest('.field').hidden=true;outcomeRetained.closest('.field').hidden=true;}else{for(const option of outcomeDisposition.options)option.hidden=false;outcomeRefund.closest('.field').hidden=false;outcomeRetained.closest('.field').hidden=false;}if(financial && outcomeDisposition.value==='reprogram')outcomeDisposition.value='retained';
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
  if(!settings.operatingPolicies?.cancellations&&used<paid && ['refund','credit','retained'].includes(outcomeDisposition.value)){
    retained=Math.max(0,paid-refund-credit)
  }
  outcomeRefund.value=refund.toFixed(2);outcomeCredit.value=credit.toFixed(2);outcomeRetained.value=retained.toFixed(2);
  document.getElementById('outcomeRefundAccountField').classList.toggle('hidden',refund<=0||outcomeStatus.value==='completed');if(settings.operatingPolicies?.cancellations&&['cancelled','no_show'].includes(outcomeStatus.value)){let preview=document.getElementById('outcomePendingPreview');if(!preview){preview=document.createElement('p');preview.id='outcomePendingPreview';preview.className='info';outcomeAmountsBlock.append(preview);}preview.textContent='Pendiente de resolver: '+money(Math.max(0,paid-credit))+'. No se convierte en ingreso ni se devuelve dinero al cancelar.';preview.hidden=false;}else{const preview=document.getElementById('outcomePendingPreview');if(preview)preview.hidden=true;}
}

function saveReservationOutcome(){
  if(!requirePermission('manage_reservations'))return;
  const r=reservationById(openReservationId);if(!r)return;
  const c=clientById(r.clientId);
  const previousCredit=Math.max(0,Number(r.creditAmount||0));
  const status=outcomeStatus.value;
  if(['cancelled','no_show'].includes(r.status)){showToast('Revisa el saldo de esta cancelación antes de cualquier cambio de estado.');return;}
  if(['hold','confirmed'].includes(status)){
    if(r.status==='completed'){showToast('Una reserva realizada conserva su resultado.');return;}
    if(status===r.status){showToast('La reserva ya tiene este estado.');return;}
    const previous=r.status;r.status=status;if(status==='confirmed')r.confirmedAt=nowISO();
    addAuditEvent('reservation',r.id,r.code,'Estado de reserva actualizado',[{field:'Estado',before:previous,after:status}],outcomeNote.value.trim());
    persist();closeSheet('reservationOutcomeSheet');renderReservations();renderCalendar();renderHome();renderReservationWorkspace();showToast('Estado de la reserva actualizado');return;
  }
  let disp=status==='completed'?'normal':outcomeDisposition.value;
  let refund=status==='completed'?0:Math.max(0,Number(outcomeRefund.value||0));
  let credit=status==='completed'?0:Math.max(0,Number(outcomeCredit.value||0));
  let retained=status==='completed'?0:Math.max(0,Number(outcomeRetained.value||0));
  const paid=Math.max(0,Number(r.advance||0));
  if(settings.operatingPolicies?.cancellations&&['cancelled','no_show'].includes(status)&&(!['mixed','credit'].includes(disp)||refund>0||retained>0)){showToast('Cancela con el saldo pendiente y resuelve su destino desde Cancelaciones.');return;}if(disp==='reprogram'){refund=0;credit=0;retained=0}
  if(refund+credit+retained>paid+0.001){showToast('Los movimientos superan lo pagado');return}
  const refundAccountId=refund>0?document.getElementById('outcomeRefundAccount').value:null;
  if(refund>0&&!validateTreasuryAccount(refundAccountId))return;
  ensureAccessSettings();const ar=settings.approvalRules||{},sensitive=paid>Math.max(0,Number(ar.paidReservationApprovalLimit||0))&&(['cancelled','no_show'].includes(status)||refund>0||credit>0),needsApproval=ar.paidReservationOutcome!==false&&sensitive;
  if(needsApproval&&!hasPermission('approve_sensitive')){const req=requestApproval('reservation_outcome',r.id,r.code,{status,disposition:disp,refund,credit,retained,refundAccountId,reason:outcomeReason.value,note:outcomeNote.value.trim()},`${reservationDisplayName(r)} · ${status} · pagado ${money(paid)}${refund?` · devolver ${money(refund)}`:''}${credit?` · saldo a favor ${money(credit)}`:''}`);if(req){closeSheet('reservationOutcomeSheet');showToast('Solicitud enviada a supervisión para aprobación');if(roleCanViewPage('control'))go('control')}return}

  const previousStatus=r.status,previousDisposition=r.paymentDisposition||'';
  if(c){c.creditBalance=Math.max(0,Number(c.creditBalance||0)-previousCredit+credit)}
  r.status=status;
  r.paymentDisposition=disp;
  r.refundedAmount=refund;r.creditAmount=credit;r.retainedAmount=retained;r.refundAccountId=refundAccountId;
  r.outcomeReason=outcomeReason.value;r.outcomeNote=outcomeNote.value.trim();r.outcomeAt=nowISO();
  if(status==='completed')r.completedAt=r.outcomeAt;
  if(status==='cancelled')r.cancelledAt=r.outcomeAt;
  if(status==='no_show')r.noShowAt=r.outcomeAt;
  if(status==='rescheduled')r.reprogrammedAt=r.outcomeAt;
  const outcomeChanges=[{field:'Estado',before:previousStatus,after:status},{field:'Tratamiento del pago',before:previousDisposition||'—',after:disp||'—'}];if(refund>0)outcomeChanges.push({field:'Reembolso',before:'S/ 0',after:money(refund)});if(credit>0)outcomeChanges.push({field:'Saldo a favor',before:'S/ 0',after:money(credit)});if(retained>0)outcomeChanges.push({field:'Retenido',before:'S/ 0',after:money(retained)});addAuditEvent('reservation',r.id,r.code,'Estado / resultado actualizado',outcomeChanges,r.outcomeReason||'');
  persist();closeSheet('reservationOutcomeSheet');renderReservations();renderCalendar();renderHome();renderReservationWorkspace();
  showToast('Estado de la reserva guardado');
  if(status==='rescheduled')editReservation(r.id);else go('reservations')
}

function confirmOpenReservation(){if(!requirePermission('manage_reservations'))return;
  const r=reservationById(openReservationId);if(!r)return;
  const before=r.status;r.status='confirmed';r.confirmedAt=nowISO();addAuditEvent('reservation',r.id,r.code,'Reserva confirmada',[{field:'Estado',before,after:'confirmed'}]);persist();
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
function movementTypeLabel(type){const m={payment:'Cobro de reserva',other_income:'Otro ingreso',expense:'Gasto',cash_in:'Aporte a caja',cash_out:'Retiro de caja',transfer:'Rendición / transferencia'};return m[type]||type}
function movementSign(type){return ['expense','cash_out'].includes(type)?-1:(type==='transfer'?0:1)}
function movementIsOperational(type){return ['payment','other_income','expense','refund'].includes(type)}
function movementReservationKind(m){const rs=paymentApplications(m).map(a=>reservationById(a.reservationId)).filter(Boolean);if(!rs.length){const r=m.reservationId?reservationById(m.reservationId):null;return r?(r.reservationKind||(r.space==='Local exclusivo'?'exclusive':'court')):null}const kinds=[...new Set(rs.map(r=>r.reservationKind||(r.space==='Local exclusivo'?'exclusive':'court')))];return kinds.length===1?kinds[0]:null}

function paymentApplications(m){
  if(!m||m.type!=='payment')return [];
  if(Array.isArray(m.applications)&&m.applications.length)return m.applications.map(a=>({reservationId:a.reservationId,amount:Number(a.amount||0)})).filter(a=>a.reservationId&&a.amount>0);
  return m.reservationId?[{reservationId:m.reservationId,amount:Number(m.amount||0)}]:[]
}
function paymentAppliedAmount(m,reservationId){return paymentApplications(m).filter(a=>String(a.reservationId)===String(reservationId)).reduce((s,a)=>s+Number(a.amount||0),0)}
function paymentAppliedTotal(m){return paymentApplications(m).reduce((s,a)=>s+Number(a.amount||0),0)}
function paymentUnappliedAmount(m){if(!m||m.type!=='payment')return 0;if(m.unappliedAmount!==undefined&&m.unappliedAmount!==null)return Math.max(0,Number(m.unappliedAmount||0));return Math.max(0,Number(m.amount||0)-paymentAppliedTotal(m))}
function clientUnappliedPaymentRows(clientId){return movements.filter(m=>m.type==='payment'&&String(m.clientId)===String(clientId)&&paymentUnappliedAmount(m)>0.001).sort((a,b)=>String(a.occurredAt||a.createdAt||'').localeCompare(String(b.occurredAt||b.createdAt||'')))}
function clientUnappliedBalance(clientId){return clientUnappliedPaymentRows(clientId).reduce((s,m)=>s+paymentUnappliedAmount(m),0)}
function paymentTouchesReservation(m,reservationId){return paymentAppliedAmount(m,reservationId)>0}
function reservationDueDate(r){return r?.paymentDueDate||r?.eventDate||''}
function receivableStatus(r){const due=reservationDueDate(r),today=localDateValue();if(!due)return 'upcoming';if(due<today)return 'overdue';if(due===today)return 'today';return 'upcoming'}
function receivableStatusLabel(r){const x=receivableStatus(r);return x==='overdue'?'Vencido':(x==='today'?'Vence hoy':'Próximo')}
function applyPaymentAmountToReservation(r,amount,occurredAt){
  amount=Math.max(0,Number(amount||0));if(!r||!amount)return {ok:false,message:'Monto inválido'};
  let balance=Math.max(0,Number(r.balance||0)),nextTotal=Number(r.total||0),nextDiscount=Number(r.discountApplied||0),nextPlan=r.quotePaymentPlan,nextSinglePending=!!r.singlePaymentPending;
  const before=Number(r.advance||0);
  if(r.singlePaymentPending){
    const target=Number(r.singlePaymentTotal||r.total||0),regular=Number(r.regularTotal||r.total||0);
    if(before===0&&Math.abs(amount-target)<0.01){nextTotal=target;nextDiscount=Math.max(0,regular-target);nextSinglePending=false;nextPlan='single';if(r.singleBaseTotal!==undefined)r.baseTotal=Number(r.singleBaseTotal||0);if(r.singleTaxAmount!==undefined)r.taxAmount=Number(r.singleTaxAmount||0)}
    else{nextTotal=regular;nextDiscount=0;nextSinglePending=false;nextPlan='installments';if(r.regularBaseTotal!==undefined)r.baseTotal=Number(r.regularBaseTotal||0);if(r.regularTaxAmount!==undefined)r.taxAmount=Number(r.regularTaxAmount||0)}
    balance=Math.max(0,nextTotal-before)
  }
  if(amount>balance+0.001)return {ok:false,message:`El monto supera el saldo de ${r.code}`};
  r.total=nextTotal;r.discountApplied=nextDiscount;r.singlePaymentPending=nextSinglePending;r.quotePaymentPlan=nextPlan;
  r.advance=before+amount;r.balance=Math.max(0,Number(r.total||0)-Number(r.advance||0));r.lastPaymentAt=occurredAt;
  if(r.status==='hold'){const prevStatus=r.status;r.status='confirmed';r.confirmedAt=r.confirmedAt||occurredAt;addAuditEvent('reservation',r.id,r.code,'Reserva confirmada por cobro',[{field:'Estado',before:prevStatus,after:'confirmed'}],`Primer cobro recibido`)}
  return {ok:true,before,balanceBefore:balance}
}

function openPaymentSheet(preselectId=null,presetAmount=null){if(!requirePermission('register_payments'))return;
  ensurePaymentMethods();const methods=activePaymentMethods();if(!methods.length){showToast('Activa al menos un método de pago en Masters');return}
  const eligible=reservations.filter(r=>!isInternalReservation(r)&&!['cancelled','no_show'].includes(r.status)&&Number(r.balance||0)>0).sort((a,b)=>(a.eventDate+a.startTime).localeCompare(b.eventDate+b.startTime));
  paymentReservation.innerHTML=eligible.length?eligible.map(r=>{const c=clientById(r.clientId)||{name:'Cliente'};return `<option value="${r.id}">${escapeHtml(r.code)} · ${escapeHtml(c.name)} · saldo ${money(r.balance)}</option>`}).join(''):'<option value="">No hay reservas con saldo pendiente</option>';
  if(preselectId&&eligible.some(r=>String(r.id)===String(preselectId)))paymentReservation.value=String(preselectId);
  fillPaymentMethodSelect(paymentMethod);fillTreasuryAccountSelect(paymentAccount,defaultTreasuryAccountForMethod(paymentMethod.value));renderPaymentAccountHelp();resetPendingAttachment('payment');paymentDate.value=localDateValue();paymentTime.value=localTimeValue();paymentNote.value='';syncPaymentReservation();
  if(presetAmount!==null&&presetAmount!==undefined&&paymentReservation.value){const max=Number(paymentAmount.max||0);paymentAmount.value=Math.max(0,Math.min(Number(presetAmount||0),max||Number(presetAmount||0)))}
  openSheet('paymentSheet')
}
function syncPaymentReservation(){
  const r=reservationById(paymentReservation.value);if(!r){paymentReservationInfo.innerHTML='No hay una reserva disponible para cobrar.';paymentAmount.value='';return}
  const c=clientById(r.clientId)||{name:'Cliente'};paymentAmount.value=Number(r.balance||0);paymentAmount.max=Number(r.balance||0);
  let plan='';
  if(r.singlePaymentPending)plan=`<br><b style="color:#087c34">Pago único:</b> paga ${money(r.singlePaymentTotal||r.balance)} en esta sola operación para aplicar el descuento. Si registras un monto menor, la reserva pasa automáticamente a pago en partes y conserva el precio regular.`;
  else if(r.quotePaymentPlan==='installments')plan=`<br><b>Pago en partes:</b> el descuento no aplica; cada cobro reduce el saldo regular.`;
  paymentReservationInfo.innerHTML=`<b>${escapeHtml(r.code)} · ${escapeHtml(c.name)}</b><br>Total ${money(r.total)} · Cobrado ${money(r.advance)} · <b>Saldo pendiente ${money(r.balance)}</b><br>${fmtScheduled(r.eventDate,r.startTime)} · ${escapeHtml(r.space||r.courtType||'Reserva')}${plan}`
}
function syncPaymentAccountDefault(){fillTreasuryAccountSelect(paymentAccount,defaultTreasuryAccountForMethod(paymentMethod.value));renderPaymentAccountHelp()}
function renderPaymentAccountHelp(){const h=document.getElementById('paymentAccountHelp');if(h)h.textContent=treasuryAccountHelp(paymentAccount?.value)}
async function savePayment(){
  if(!requirePermission('register_payments'))return;
  const r=reservationById(paymentReservation.value);if(!r){showToast('Selecciona una reserva');return}
  if(!paymentMethod.value){showToast('Selecciona un método de pago');return}if(!validateTreasuryAccount(paymentAccount.value))return;
  const amount=Math.max(0,Number(paymentAmount.value||0)),balance=Math.max(0,Number(r.balance||0));if(!amount){showToast('Ingresa un monto');return}if(amount>balance+0.001&&!r.singlePaymentPending){showToast('El cobro supera el saldo pendiente');return}
  let attachment=null;try{attachment=await persistPendingAttachment('payment')}catch(e){showToast(e&&e.message?e.message:'No se pudo guardar el comprobante');return}
  const occurredAt=movementDateTime(paymentDate.value,paymentTime.value),before=Number(r.advance||0),result=applyPaymentAmountToReservation(r,amount,occurredAt);if(!result.ok){showToast(result.message);return}
  const stage=(before<=0&&r.balance<=0.001)?'Pago completo':(before<=0?'Adelanto':(r.balance<=0.001?'Saldo':'Pago parcial'));
  const m={id:crypto.randomUUID(),code:nextMovementCode(),type:'payment',reconciliationStatus:initialPaymentReconciliationStatus(paymentMethod.value),paymentStage:stage,reservationId:r.id,clientId:r.clientId,amount,applications:[{reservationId:r.id,amount}],method:paymentMethod.value,accountId:paymentAccount.value,date:paymentDate.value||localDateValue(),time:paymentTime.value||localTimeValue(),detail:paymentNote.value.trim(),occurredAt,createdAt:nowISO(),attachmentId:attachment&&attachment.id||null,attachmentName:attachment&&attachment.name||'',attachmentType:attachment&&attachment.type||''};
  movements.unshift(m);addAuditEvent('payment',m.id,m.code,'Pago recibido',[],`${r.code} · ${money(amount)} · ${m.method} · ${treasuryAccountLabel(m.accountId)}`);persist();resetPendingAttachment('payment');closeSheet('paymentSheet');renderReservations();renderQuotes();renderHome();renderReservationWorkspace();renderCash();if(document.getElementById('view-pending')?.classList.contains('active'))renderPendingView();showToast(stage==='Pago completo'?'Pago completo registrado':'Cobro registrado')
}

function clientPendingReservations(clientId,range=null){return reservations.filter(r=>String(r.clientId)===String(clientId)&&!isInternalReservation(r)&&!['cancelled','no_show'].includes(r.status)&&Number(r.balance||0)>0&&(!range||dashInRange(r.eventDate,range))).sort((a,b)=>(reservationDueDate(a)+a.eventDate+a.startTime).localeCompare(reservationDueDate(b)+b.eventDate+b.startTime))}
function openClientPayment(clientId){
  if(!requirePermission('register_payments'))return;
  ensurePaymentMethods();const methods=activePaymentMethods();if(!methods.length){showToast('Activa al menos un método de pago en Masters');return}
  const c=clientById(clientId),rows=clientPendingReservations(clientId);if(!c||!rows.length){showToast('Este cliente no tiene saldos pendientes');return}
  const detail=document.getElementById('dashboardDetailSheet');
  if(detail?.classList.contains('show')){clientPaymentReturnClientId=c.id;clientPaymentReturnMode=receivableReturnMode||'pending';closeSheet('dashboardDetailSheet')}else{clientPaymentReturnClientId=null;clientPaymentReturnMode=null}
  clientPaymentClientId=c.id;clientPaymentTitle.textContent=`Pago · ${c.name}`;const total=rows.reduce((s,r)=>s+Number(r.balance||0),0),existingUnapplied=clientUnappliedBalance(c.id);clientPaymentTotal.innerHTML=`<span>Deuda total actual</span><b>${money(total)}</b><small>${rows.length} reserva${rows.length===1?'':'s'} pendiente${rows.length===1?'':'s'}${existingUnapplied>0.001?` · ya tiene ${money(existingUnapplied)} sin aplicar`:''}</small>`;
  clientPaymentAmount.value=total;clientPaymentAmount.removeAttribute('max');fillPaymentMethodSelect(clientPaymentMethod);fillTreasuryAccountSelect(clientPaymentAccount,defaultTreasuryAccountForMethod(clientPaymentMethod.value));renderClientPaymentAccountHelp();clientPaymentDate.value=localDateValue();clientPaymentTime.value=localTimeValue();clientPaymentNote.value='';resetPendingAttachment('clientPayment');renderClientPaymentAllocations(rows);const wrap=document.getElementById('clientPaymentAllocationsWrap'),toggle=document.getElementById('clientPaymentToggleBtn'),back=document.getElementById('clientPaymentBackBtn');if(wrap)wrap.classList.add('hidden');if(toggle)toggle.textContent='Ver / editar distribución';if(back)back.classList.toggle('hidden',!clientPaymentReturnClientId);autoAllocateClientPayment();openSheet('clientPaymentSheet')
}
function closeClientPaymentFlow(){
  const returnId=clientPaymentReturnClientId,returnMode=clientPaymentReturnMode;clientPaymentReturnClientId=null;clientPaymentReturnMode=null;closeSheet('clientPaymentSheet');if(returnId){receivableReturnMode=returnMode||'pending';openReceivableClient(returnId);openSheet('dashboardDetailSheet')}
}
function toggleClientPaymentDistribution(){const wrap=document.getElementById('clientPaymentAllocationsWrap'),btn=document.getElementById('clientPaymentToggleBtn');if(!wrap||!btn)return;const opening=wrap.classList.contains('hidden');wrap.classList.toggle('hidden',!opening);btn.textContent=opening?'Ocultar distribución':'Ver / editar distribución';if(opening)setTimeout(()=>wrap.scrollIntoView({behavior:'smooth',block:'nearest'}),60)}
function renderClientPaymentAllocations(rows=null){
  rows=rows||clientPendingReservations(clientPaymentClientId);clientPaymentAllocations.innerHTML=rows.map(r=>`<div class="client-pay-allocation"><div><b>${escapeHtml(r.code)} · ${fmtScheduled(r.eventDate,r.startTime)}</b><span>Pendiente ${money(r.balance)} · ${escapeHtml(receivableStatusLabel(r))}</span></div><input class="client-allocation-input" data-reservation-id="${String(r.id)}" data-max="${Number(r.balance||0)}" type="number" min="0" max="${Number(r.balance||0)}" step="0.01" value="0" oninput="updateClientPaymentReconcile()"></div>`).join('');updateClientPaymentReconcile()
}
function autoAllocateClientPayment(){
  const amount=Math.max(0,Number(clientPaymentAmount?.value||0));let left=amount;document.querySelectorAll('#clientPaymentAllocations .client-allocation-input').forEach(input=>{const max=Math.max(0,Number(input.dataset.max||0)),v=Math.min(max,left);input.value=v?v.toFixed(2):'0';left=Math.max(0,left-v)});updateClientPaymentReconcile()
}
function clientPaymentAllocationData(){return [...document.querySelectorAll('#clientPaymentAllocations .client-allocation-input')].map(i=>({reservationId:i.dataset.reservationId,amount:Math.max(0,Number(i.value||0)),max:Math.max(0,Number(i.dataset.max||0))})).filter(a=>a.amount>0)}
function updateClientPaymentReconcile(){const received=Math.max(0,Number(clientPaymentAmount?.value||0)),all=[...document.querySelectorAll('#clientPaymentAllocations .client-allocation-input')].map(i=>({amount:Math.max(0,Number(i.value||0)),max:Math.max(0,Number(i.dataset.max||0))})),applied=all.reduce((s,a)=>s+a.amount,0),unapplied=Math.max(0,received-applied),over=Math.max(0,applied-received),note=document.getElementById('clientPaymentUnappliedNote'),impact=document.getElementById('clientPaymentImpact'),submit=document.getElementById('clientPaymentSubmitBtn'),full=all.filter(a=>a.max>0&&a.amount>=a.max-0.001).length,partial=all.filter(a=>a.amount>0.001&&a.amount<a.max-0.001).length;clientPaymentReconcile.innerHTML=`<span>Recibido <b>${money(received)}</b></span><span>Aplicado <b>${money(applied)}</b></span><span>Sin aplicar <strong class="${over>0.001?'warn':'ok'}">${money(unapplied)}</strong></span>`;if(impact){let msg='';if(over>0.001)msg=`<b>Revisa la distribución.</b> Se está aplicando ${money(over)} más de lo recibido.`;else if(!received)msg='Ingresa el monto realmente recibido para calcular la aplicación.';else{const parts=[];if(full)parts.push(`<b>${full}</b> reserva${full===1?' quedará pagada':'s quedarán pagadas'}`);if(partial)parts.push(`<b>${partial}</b> reserva${partial===1?' quedará parcialmente pagada':'s quedarán parcialmente pagadas'}`);if(!full&&!partial)parts.push('El pago quedará sin aplicar');msg=parts.join(' · ')}impact.innerHTML=msg}if(note){note.classList.toggle('hidden',unapplied<=0.001&&over<=0.001);note.textContent=over>0.001?`Has aplicado ${money(over)} más de lo recibido. Reduce la distribución.`:`${money(unapplied)} quedará registrado como saldo sin aplicar de este cliente y podrá usarse en reservas futuras.`}if(submit)submit.textContent=received?`Registrar pago ${money(received)}`:'Registrar pago'}
function syncClientPaymentAccountDefault(){fillTreasuryAccountSelect(clientPaymentAccount,defaultTreasuryAccountForMethod(clientPaymentMethod.value));renderClientPaymentAccountHelp()}
function renderClientPaymentAccountHelp(){const h=document.getElementById('clientPaymentAccountHelp');if(h)h.textContent=treasuryAccountHelp(clientPaymentAccount?.value)}
async function saveClientPayment(){
  if(!requirePermission('register_payments'))return;
  const c=clientById(clientPaymentClientId);if(!c){showToast('Cliente no disponible');return}if(!clientPaymentMethod.value){showToast('Selecciona un método de pago');return}if(!validateTreasuryAccount(clientPaymentAccount.value))return;
  const amount=Math.max(0,Number(clientPaymentAmount.value||0)),apps=clientPaymentAllocationData(),applied=apps.reduce((s,a)=>s+a.amount,0),unapplied=Math.max(0,amount-applied);if(!amount){showToast('Ingresa el monto recibido');return}if(applied>amount+0.01){showToast('El total aplicado no puede superar el monto recibido');return}
  for(const a of apps){const r=reservationById(a.reservationId);if(!r||a.amount>Number(r.balance||0)+0.001){showToast('Revisa los montos aplicados');return}}
  let attachment=null;try{attachment=await persistPendingAttachment('clientPayment')}catch(e){showToast(e&&e.message?e.message:'No se pudo guardar el comprobante');return}
  const firstReservation=apps.length===1?reservationById(apps[0].reservationId):null,previouslyPaid=Number(firstReservation?.advance||0);
  const occurredAt=movementDateTime(clientPaymentDate.value,clientPaymentTime.value);for(const a of apps){const r=reservationById(a.reservationId),res=applyPaymentAmountToReservation(r,a.amount,occurredAt);if(!res.ok){showToast(res.message);return}}
  const m={id:crypto.randomUUID(),code:nextMovementCode(),type:'payment',reconciliationStatus:initialPaymentReconciliationStatus(clientPaymentMethod.value),paymentStage:apps.length>1?'Pago de cliente':(firstReservation?(firstReservation.balance<=0.001?(previouslyPaid>0?'Saldo':'Pago completo'):(previouslyPaid>0?'Pago parcial':'Adelanto')):'Pago sin aplicar'),reservationId:apps.length===1?apps[0].reservationId:null,clientId:c.id,amount,applications:apps.map(a=>({reservationId:a.reservationId,amount:a.amount,appliedAt:occurredAt})),unappliedAmount:unapplied,method:clientPaymentMethod.value,accountId:clientPaymentAccount.value,date:clientPaymentDate.value||localDateValue(),time:clientPaymentTime.value||localTimeValue(),detail:clientPaymentNote.value.trim(),occurredAt,createdAt:nowISO(),attachmentId:attachment&&attachment.id||null,attachmentName:attachment&&attachment.name||'',attachmentType:attachment&&attachment.type||''};
  const returnId=clientPaymentReturnClientId,returnMode=clientPaymentReturnMode;clientPaymentReturnClientId=null;clientPaymentReturnMode=null;movements.unshift(m);addAuditEvent('payment',m.id,m.code,'Pago de cliente recibido',[],`${c.name} · ${money(amount)} · ${apps.length} aplicación${apps.length===1?'':'es'}${unapplied>0.001?` · ${money(unapplied)} sin aplicar`:''}`);persist();resetPendingAttachment('clientPayment');closeSheet('clientPaymentSheet');renderReservations();renderReservationWorkspace();renderCash();renderHome();if(document.getElementById('view-pending')?.classList.contains('active'))renderPendingView();if(returnId){receivableReturnMode=returnMode||'pending';openReceivableClient(returnId);openSheet('dashboardDetailSheet')}showToast(unapplied>0.001?`Pago ${money(amount)} registrado · ${money(unapplied)} sin aplicar`:`Pago ${money(amount)} aplicado a ${apps.length} reserva${apps.length===1?'':'s'}`)
}


function openClientUnappliedApply(clientId){
  const c=clientById(clientId),rows=clientPendingReservations(clientId),available=clientUnappliedBalance(clientId);if(!c)return;if(available<=0.001){showToast('Este cliente no tiene saldo sin aplicar');return}if(!rows.length){showToast('No hay reservas pendientes donde aplicar el saldo');return}
  clientCreditClientId=c.id;document.getElementById('clientCreditTitle').textContent=`Aplicar saldo · ${c.name}`;document.getElementById('clientCreditTotal').innerHTML=`<span>Saldo recibido sin aplicar</span><b>${money(available)}</b><small>${rows.length} reserva${rows.length===1?'':'s'} pendiente${rows.length===1?'':'s'}</small>`;document.getElementById('clientCreditAllocations').innerHTML=rows.map(r=>`<div class="client-pay-allocation"><div><b>${escapeHtml(r.code)} · ${fmtScheduled(r.eventDate,r.startTime)}</b><span>Pendiente ${money(r.balance)} · ${escapeHtml(receivableStatusLabel(r))}</span></div><input class="client-credit-allocation-input" data-reservation-id="${String(r.id)}" data-max="${Number(r.balance||0)}" type="number" min="0" max="${Number(r.balance||0)}" step="0.01" value="0" oninput="updateClientCreditReconcile()"></div>`).join('');autoAllocateClientUnapplied();openSheet('clientCreditSheet')
}
function clientCreditAllocationData(){return [...document.querySelectorAll('#clientCreditAllocations .client-credit-allocation-input')].map(i=>({reservationId:i.dataset.reservationId,amount:Math.max(0,Number(i.value||0)),max:Math.max(0,Number(i.dataset.max||0))})).filter(a=>a.amount>0)}
function autoAllocateClientUnapplied(){const available=clientUnappliedBalance(clientCreditClientId);let left=available;document.querySelectorAll('#clientCreditAllocations .client-credit-allocation-input').forEach(input=>{const max=Math.max(0,Number(input.dataset.max||0)),v=Math.min(max,left);input.value=v?v.toFixed(2):'0';left=Math.max(0,left-v)});updateClientCreditReconcile()}
function updateClientCreditReconcile(){const available=clientUnappliedBalance(clientCreditClientId),applied=clientCreditAllocationData().reduce((s,a)=>s+a.amount,0),remaining=Math.max(0,available-applied),over=Math.max(0,applied-available),host=document.getElementById('clientCreditReconcile');if(host)host.innerHTML=`<span>Disponible <b>${money(available)}</b></span><span>Aplicar <b>${money(applied)}</b></span><span>Restante <strong class="${over>0.001?'warn':'ok'}">${money(remaining)}</strong></span>`}
function saveClientUnappliedApplication(){
  const c=clientById(clientCreditClientId),apps=clientCreditAllocationData(),available=clientUnappliedBalance(clientCreditClientId),applied=apps.reduce((s,a)=>s+a.amount,0);if(!c)return;if(!apps.length){showToast('Selecciona cuánto saldo aplicar');return}if(applied>available+0.01){showToast('El monto aplicado supera el saldo disponible');return}
  for(const a of apps){const r=reservationById(a.reservationId);if(!r||a.amount>Number(r.balance||0)+0.001){showToast('Revisa los montos aplicados');return}}
  const sources=clientUnappliedPaymentRows(c.id),appliedAt=nowISO();let sourceIndex=0;
  for(const a of apps){const r=reservationById(a.reservationId),res=applyPaymentAmountToReservation(r,a.amount,appliedAt);if(!res.ok){showToast(res.message);return}let need=a.amount;while(need>0.001&&sourceIndex<sources.length){const m=sources[sourceIndex],before=paymentUnappliedAmount(m);if(before<=0.001){sourceIndex++;continue}const take=Math.min(before,need);if(!Array.isArray(m.applications))m.applications=paymentApplications(m).map(x=>({reservationId:x.reservationId,amount:x.amount}));m.applications.push({reservationId:r.id,amount:take,appliedAt});m.unappliedAmount=Math.max(0,before-take);need-=take;if(m.unappliedAmount<=0.001)sourceIndex++}if(need>0.01){showToast('No se pudo completar la aplicación del saldo');return}}
  addAuditEvent('payment',c.id,c.name,'Saldo sin aplicar utilizado',[],`${money(applied)} aplicado a ${apps.length} reserva${apps.length===1?'':'s'} sin nuevo ingreso`);persist();closeSheet('clientCreditSheet');renderReservations();renderReservationWorkspace();renderCash();renderHome();if(document.getElementById('dashboardDetailSheet')?.classList.contains('show'))openReceivableClient(c.id);if(document.getElementById('view-pending')?.classList.contains('active'))renderPendingView();showToast(`${money(applied)} aplicado sin registrar un nuevo ingreso`)
}

function openMovementTypeSheet(){
  if(!hasPermission('register_expenses')&&!hasPermission('manage_treasury')){showToast('No tienes permiso para registrar movimientos');return}
  const sh=document.getElementById('movementTypeSheet');if(sh){sh.querySelectorAll('.movement-type-card').forEach(b=>{const oc=b.getAttribute('onclick')||'';const expense=oc.includes("openMovementForm('expense')");const treasury=!expense;b.style.display=(expense?hasPermission('register_expenses'):hasPermission('manage_treasury'))?'':'none'})}
  openSheet('movementTypeSheet')
}
function movementCategories(type){
  if(type==='other_income')return ['Tienda / bebidas','Estacionamiento','Parrilla','Alquiler adicional','Penalidad','Otros'];
  if(type==='cash_in')return ['Aporte a caja'];
  if(type==='cash_out')return ['Retiro de caja'];return ['Otros']
}
function openMovementForm(type){if(type==='expense'&&!requirePermission('register_expenses'))return;if(type!=='expense'&&!requirePermission('manage_treasury'))return;
  ensurePaymentMethods();const methods=activePaymentMethods();if(!methods.length){closeSheet('movementTypeSheet');showToast('Activa al menos un método de pago en Masters');return}
  movementFormType=type;closeSheet('movementTypeSheet');
  const cfg={expense:['Registrar gasto','Gasto','Pagado a','Registra un costo real de la operación. Sí afecta el resultado operativo.'],other_income:['Registrar otro ingreso','Otro ingreso','Recibido de','Úsalo solo para dinero que entra fuera de una reserva. Los cobros de reservas se registran con “Registrar cobro”.'],cash_in:['Aporte a caja','Movimiento de caja','Aportado por','No es una venta ni aumenta los ingresos del negocio; solo mueve efectivo hacia caja.'],cash_out:['Retiro de caja','Movimiento de caja','Retirado por / destino','No es un gasto por sí mismo; solo mueve efectivo fuera de caja.']};
  const c=cfg[type]||cfg.expense;movementFormTitle.textContent=c[0];movementFormSectionTitle.textContent=c[1];movementPartyLabel.textContent=c[2];movementFormHelp.textContent=c[3];
  const areaField=document.getElementById('movementAreaField'),docField=document.getElementById('movementDocumentField');if(type==='expense'){ensureExpenseMasters();movementCategory.innerHTML=activeExpenseCategories().map(x=>`<option value="${escapeHtml(x.id)}">${escapeHtml(x.name)}</option>`).join('');movementArea.innerHTML=activeExpenseAreas().map(x=>`<option value="${escapeHtml(x.id)}">${escapeHtml(x.name)}</option>`).join('');if(areaField)areaField.classList.remove('hidden');if(docField)docField.classList.remove('hidden')}else{movementCategory.innerHTML=movementCategories(type).map(x=>`<option value="${escapeHtml(x)}">${escapeHtml(x)}</option>`).join('');if(areaField)areaField.classList.add('hidden');if(docField)docField.classList.add('hidden')}movementAmount.value='';movementDate.value=localDateValue();movementTime.value=localTimeValue();movementParty.value='';movementDetail.value='';if(document.getElementById('movementDocumentType'))movementDocumentType.value='Factura';if(document.getElementById('movementDocumentNumber'))movementDocumentNumber.value='';fillPaymentMethodSelect(movementMethod,(type==='cash_in'||type==='cash_out')?'Efectivo':'');fillTreasuryAccountSelect(movementAccount,defaultTreasuryAccountForMethod(movementMethod.value));syncMovementSupportUI();resetPendingAttachment('movement');openSheet('movementFormSheet')
}
function syncMovementAccountDefault(){fillTreasuryAccountSelect(movementAccount,defaultTreasuryAccountForMethod(movementMethod.value));syncMovementSupportUI()}
function syncMovementSupportUI(){
  const a=treasuryAccountById(movementAccount?.value),field=document.getElementById('movementSupportField'),help=document.getElementById('movementAccountHelp');if(field)field.classList.toggle('hidden',!(movementFormType==='expense'&&a&&a.kind==='custody'));if(help)help.textContent=!a||!a.active?treasuryAccountHelp(movementAccount?.value):a.kind==='custody'?'Fondos bajo responsabilidad de una persona. Un gasto aquí reduce lo que físicamente debe entregar, pero puede quedar pendiente de sustento.':'Fondos registrados directamente en Eleva.'
}
async function saveManualMovement(){
  const amount=Math.max(0,Number(movementAmount.value||0));if(!amount){showToast('Ingresa un monto');return}if(!movementMethod.value){showToast('Selecciona un método de pago');return}if(!validateTreasuryAccount(movementAccount.value))return;if(movementFormType==='expense'){if(!movementCategory.value){showToast('Selecciona una categoría');return}if(!movementArea.value){showToast('Selecciona un área');return}if(!movementDetail.value.trim()){showToast('Describe brevemente el gasto');movementDetail.focus();return}}
  let attachment=null;try{attachment=await persistPendingAttachment('movement')}catch(e){showToast(e&&e.message?e.message:'No se pudo guardar el comprobante');return}
  ensureAccessSettings();const acc=treasuryAccountById(movementAccount.value),rules=settings.approvalRules||{};let supportStatus='';if(movementFormType==='expense'){const custody=!!(acc&&acc.kind==='custody'),amountReview=!!rules.expenseApprovalEnabled&&amount>=Math.max(0,Number(rules.expenseApprovalThreshold||0)),noProof=!!rules.expenseWithoutProofPending&&!attachment;supportStatus=(custody||amountReview||noProof)?'pending':'supported'}const cat=movementFormType==='expense'?expenseCategoryById(movementCategory.value):null,area=movementFormType==='expense'?expenseAreaById(movementArea.value):null;const m={id:crypto.randomUUID(),code:nextMovementCode(),type:movementFormType,categoryId:cat?.id||null,category:cat?.name||movementCategory.value,areaId:area?.id||null,area:area?.name||'',amount,method:movementMethod.value,accountId:movementAccount.value,supportStatus,documentType:movementFormType==='expense'?(document.getElementById('movementDocumentType')?.value||''):null,documentNumber:movementFormType==='expense'?(document.getElementById('movementDocumentNumber')?.value.trim()||''):null,date:movementDate.value||localDateValue(),time:movementTime.value||localTimeValue(),party:movementParty.value.trim(),detail:movementDetail.value.trim(),occurredAt:movementDateTime(movementDate.value,movementTime.value),createdAt:nowISO(),createdByUserId:currentUser()?.id||null,createdBy:actorName(),attachmentId:attachment&&attachment.id||null,attachmentName:attachment&&attachment.name||'',attachmentType:attachment&&attachment.type||''};
  movements.unshift(m);addAuditEvent(m.type==='expense'?'expense':'treasury',m.id,m.code,m.type==='expense'?'Gasto registrado':movementTypeLabel(m.type),[],`${money(m.amount)} · ${m.category||''}${m.area?' · '+m.area:''}${m.party?' · '+m.party:''}`);persist();resetPendingAttachment('movement');closeSheet('movementFormSheet');renderCash();renderHome();showToast(m.type==='expense'&&m.supportStatus==='pending'?'Gasto registrado · pendiente de sustento':`${movementTypeLabel(m.type)} registrado`)
}

function treasuryMovementEffect(m){
  const amount=Number(m.amount||0),effects=[];
  if(m.type==='transfer'){if(m.sourceAccountId)effects.push([m.sourceAccountId,-amount]);if(m.destinationAccountId)effects.push([m.destinationAccountId,amount]);return effects}
  const accountId=movementAccountId(m);if(!accountId)return effects;
  if(['payment','payment_legacy','other_income','cash_in'].includes(m.type))effects.push([accountId,amount]);
  else if(m.type==='expense'){if(!['observed','returned'].includes(m.supportStatus||'supported'))effects.push([accountId,-amount])}
  else if(['cash_out','refund'].includes(m.type))effects.push([accountId,-amount]);
  return effects
}
function treasuryBalances(){
  ensureTreasuryAccounts();const map={};settings.treasuryAccounts.forEach(a=>map[a.id]=Number(a.openingBalance||0));buildCashRecordsRaw().forEach(m=>treasuryMovementEffect(m).forEach(([id,v])=>map[id]=(map[id]||0)+v));return map
}
function buildCashRecordsRaw(){
  const out=[];movements.forEach(m=>out.push({...m,virtual:false,sign:movementSign(m.type)}));
  reservations.forEach(r=>{const explicit=movements.filter(m=>m.type==='payment'&&paymentTouchesReservation(m,r.id)).reduce((sum,m)=>sum+paymentAppliedAmount(m,r.id),0);const legacy=Math.max(0,Number(r.advance||0)-explicit),c=clientById(r.clientId)||{name:'Cliente'};if(legacy>0)out.push({id:`legacy-${r.id}`,code:r.code,type:'payment_legacy',reservationId:r.id,clientId:r.clientId,amount:legacy,method:'No especificado',accountId:'acc_unassigned',detail:'Pago registrado antes del módulo de caja',occurredAt:r.createdAt||nowISO(),sign:1,virtual:true,clientName:c.name});const tracked=settings.cancellationRefundEvents?.filter(e=>e.reservation_id===r.id)||[];for(const e of tracked)out.push({id:e.id,code:r.code,type:'refund',reservationId:r.id,clientId:r.clientId,amount:Number(e.amount),accountId:e.account_id,method:'',detail:e.note,occurredAt:e.occurred_at,sign:-1,virtual:true,clientName:c.name});const legacyRefund=Math.max(0,Number(r.refundedAmount||0)-tracked.reduce((sum,e)=>sum+Number(e.amount),0));if(legacyRefund>0)out.push({id:`refund-${r.id}`,code:r.code,type:'refund',reservationId:r.id,clientId:r.clientId,amount:legacyRefund,method:'No especificado',accountId:r.refundAccountId||'acc_unassigned',detail:r.outcomeNote||'Reembolso de reserva',occurredAt:r.outcomeCreatedAt||r.outcomeAt||r.cancelledAt||r.createdAt||nowISO(),sign:-1,virtual:true,clientName:c.name})});return out
}
function treasuryMetrics(){
  const balances=treasuryBalances(),accounts=treasuryAccounts(false);let company=0,custody=0;accounts.forEach(a=>{const v=Number(balances[a.id]||0);if(a.kind==='custody')custody+=v;else company+=v});const pending=movements.filter(m=>m.type==='expense'&&m.supportStatus==='pending').reduce((s,m)=>s+Number(m.amount||0),0),observed=movements.filter(m=>m.type==='expense'&&m.supportStatus==='observed').reduce((s,m)=>s+Number(m.amount||0),0);return {balances,company,custody,pending,observed,accounts}
}
function accountCurrentBalance(id){return Number(treasuryBalances()[id]||0)}
function openTreasuryTransfer(){if(!requirePermission('manage_treasury'))return;
  closeSheet('movementTypeSheet');ensureTreasuryAccounts();fillTreasuryAccountSelect(transferFrom);fillTreasuryAccountSelect(transferTo);if(transferFrom.options.length)transferFrom.value=treasuryAccounts(true).find(a=>a.kind==='custody')?.id||transferFrom.options[0].value;if(transferTo.options.length){const company=treasuryAccounts(true).find(a=>a.kind==='company'&&a.id!=='acc_unassigned');transferTo.value=company?.id||transferTo.options[0].value}transferAmount.value='';transferDate.value=localDateValue();transferTime.value=localTimeValue();transferDetail.value='';renderTransferHelp();openSheet('treasuryTransferSheet')
}
function renderTransferHelp(){const a=treasuryAccountById(transferFrom?.value),h=document.getElementById('transferHelp');if(!h)return;const bal=accountCurrentBalance(transferFrom.value);h.innerHTML=`<b>${escapeHtml(a?.name||'Cuenta')}</b><br>Saldo registrado: ${money(bal)}${a&&a.kind==='custody'?'<br>Al transferirlo a una cuenta de Eleva disminuye el monto pendiente de rendir.':''}`}
function saveTreasuryTransfer(){if(!requirePermission('manage_treasury'))return;
  const from=transferFrom.value,to=transferTo.value,amount=Math.max(0,Number(transferAmount.value||0));if(!from||!to){showToast('Selecciona origen y destino');return}if(from===to){showToast('Origen y destino deben ser distintos');return}if(!amount){showToast('Ingresa un monto');return}const bal=accountCurrentBalance(from);if(amount>bal+0.001){showToast(`El monto supera el saldo disponible (${money(bal)})`);return}const m={id:crypto.randomUUID(),code:nextMovementCode(),type:'transfer',amount,sourceAccountId:from,destinationAccountId:to,date:transferDate.value||localDateValue(),time:transferTime.value||localTimeValue(),detail:transferDetail.value.trim(),occurredAt:movementDateTime(transferDate.value,transferTime.value),createdAt:nowISO()};movements.unshift(m);addAuditEvent('treasury',m.id,m.code,'Transferencia interna',[],`${treasuryAccountLabel(from)} → ${treasuryAccountLabel(to)} · ${money(amount)}`);persist();closeSheet('treasuryTransferSheet');renderCash();renderHome();showToast('Transferencia interna registrada')
}
function setExpenseSupportStatus(id,status){if(!requirePermission('approve_expenses'))return;const m=movements.find(x=>String(x.id)===String(id));if(!m||m.type!=='expense')return;ensureAccessSettings();if(status==='supported'&&settings.approvalRules.preventSelfApproval&&m.createdByUserId&&String(m.createdByUserId)===String(currentUser()?.id)&&currentRoleBaseId()!=='admin'){showToast('No puedes aprobar tu propio gasto. Debe revisarlo otro aprobador.');return}const before=m.supportStatus||'supported';m.supportStatus=status;addAuditEvent('expense',m.id,m.code,'Estado de sustento actualizado',[{field:'Estado',before,after:status}],`${expenseCategoryName(m)} · ${money(m.amount)}`);persist();renderCash();renderHome();showToast(status==='supported'?'Gasto marcado como sustentado':(status==='returned'?'Observación marcada como regularizada':'Gasto observado · vuelve a responsabilidad del custodio'))}
function buildCashRecords(){return buildCashRecordsRaw().sort((a,b)=>String(b.occurredAt||b.createdAt||'').localeCompare(String(a.occurredAt||a.createdAt||'')))}
function cashRecordLabel(m){if(m.type==='payment'||m.type==='payment_legacy')return m.paymentStage?`Cobro · ${m.paymentStage}`:'Cobro de reserva';if(m.type==='refund')return 'Reembolso';if(m.type==='expense'&&m.supportStatus==='pending')return 'Gasto · por sustentar';if(m.type==='expense'&&m.supportStatus==='observed')return 'Gasto observado / por devolver';if(m.type==='expense'&&m.supportStatus==='returned')return 'Gasto observado · regularizado';return movementTypeLabel(m.type)}
function cashRecordMeta(m){
  const r=m.reservationId?reservationById(m.reservationId):null,c=m.clientId?clientById(m.clientId):null;const parts=[];
  if(r)parts.push(r.code);if(c)parts.push(c.name);if(m.type==='payment'&&paymentApplications(m).length>1)parts.push(`${paymentApplications(m).length} reservas`);if(m.type==='payment'&&paymentUnappliedAmount(m)>0.001)parts.push(`${money(paymentUnappliedAmount(m))} sin aplicar`);if(m.type==='expense'){parts.push(expenseCategoryName(m));parts.push(expenseAreaName(m))}else if(m.category)parts.push(m.category);if(m.method)parts.push(m.method);if(m.type==='transfer'){parts.push(`${treasuryAccountLabel(m.sourceAccountId)} → ${treasuryAccountLabel(m.destinationAccountId)}`)}else if(movementAccountId(m))parts.push(treasuryAccountLabel(movementAccountId(m)));if(m.party)parts.push(m.party);if(m.detail)parts.push(m.detail);parts.push(fmtDateTime(m.occurredAt||m.createdAt));return parts.filter(Boolean).join(' · ')
}
function setCashFilter(filter,el){cashFilter=filter;document.querySelectorAll('#cashFilters .pill').forEach(b=>b.classList.toggle('active',b.dataset.cashFilter===filter));renderCash()}
function openCash(){if(!requirePermission('view_cash'))return;cashFilter='all';document.querySelectorAll('#cashFilters .pill').forEach(b=>b.classList.toggle('active',b.dataset.cashFilter==='all'));renderCash();openSheet('cashSheet')}
function renderCash(){
  const host=document.getElementById('cashMovementList'),sum=document.getElementById('cashSummary');if(!host||!sum)return;const all=buildCashRecords(),treasury=treasuryMetrics();
  const operationalIn=all.filter(m=>['payment','payment_legacy','other_income'].includes(m.type)).reduce((s,m)=>s+Number(m.amount||0),0);
  const operationalOut=all.filter(m=>m.type==='expense'&&(m.supportStatus||'supported')==='supported'||m.type==='refund').reduce((s,m)=>s+Number(m.amount||0),0);
  sum.innerHTML=`<div class="cash-summary"><span>Disponible Eleva</span><b>${money(treasury.company)}</b><small>Caja + cuentas propias</small></div><div class="cash-summary"><span>Por rendir</span><b>${money(treasury.custody)}</b><small>Fondos bajo custodia</small></div><div class="cash-summary"><span>Por sustentar</span><b>${money(treasury.pending)}</b><small>Gastos aún no aprobados</small></div><div class="cash-summary"><span>Neto operativo</span><b>${money(operationalIn-operationalOut)}</b><small>Ingresos − gastos aprobados</small></div>`;
  let rows=all;if(cashFilter==='income')rows=rows.filter(m=>['payment','payment_legacy','other_income'].includes(m.type));if(cashFilter==='expense')rows=rows.filter(m=>['expense','refund'].includes(m.type));if(cashFilter==='treasury')rows=rows.filter(m=>m.type==='transfer'||(m.type==='expense'&&['pending','observed'].includes(m.supportStatus)));if(cashFilter==='cash')rows=rows.filter(m=>['cash_in','cash_out'].includes(m.type));
  host.innerHTML=rows.length?rows.map(m=>{const positive=['payment','payment_legacy','other_income','cash_in'].includes(m.type),neutral=['cash_in','cash_out','transfer'].includes(m.type),proof=m.attachmentId&&!m.virtual?`<div class="cash-movement-proof"><button class="cash-proof-btn" onclick="openMovementAttachment('${String(m.id)}')">Ver comprobante</button></div>`:'',support=m.type==='expense'&&m.supportStatus?`<div class="support-badge ${m.supportStatus}">${m.supportStatus==='pending'?'Por sustentar':(m.supportStatus==='observed'?'Observado / por devolver':(m.supportStatus==='returned'?'Regularizado':'Sustentado'))}</div>`:'',actions=m.type==='expense'&&m.supportStatus==='pending'?`<div class="cash-inline-actions"><button class="ok" onclick="setExpenseSupportStatus('${String(m.id)}','supported')">Marcar sustentado</button><button class="warn" onclick="setExpenseSupportStatus('${String(m.id)}','observed')">Observar</button></div>`:(m.type==='expense'&&m.supportStatus==='observed'?`<div class="cash-inline-actions"><button class="ok" onclick="setExpenseSupportStatus('${String(m.id)}','returned')">Marcar regularizado</button></div>`:'');let value='';if(m.type==='transfer')value=`${money(m.amount)}`;else value=`${positive?'+':'−'} ${money(m.amount)}`;return `<div class="cash-movement"><div class="cash-movement-main"><div class="cash-movement-title">${escapeHtml(cashRecordLabel(m))}</div><div class="cash-movement-meta">${escapeHtml(cashRecordMeta(m))}</div>${support}${proof}${actions}</div><div class="cash-movement-value ${neutral?'neutral':(positive?'in':'out')}">${value}</div></div>`}).join(''):'<div class="card empty">No hay movimientos en este filtro.</div>'
}

function operatingConfigForDate(ds){ensureOperatingSchedule();const day=parseDashDate(ds).getDay();return settings.schedule[day]||defaultOperatingSchedule()[day]}
function operatingBoundsForDate(ds){const c=operatingConfigForDate(ds);if(!c.active)return null;let a=timeToMinutes(c.open||'08:00'),b=timeToMinutes(c.close||'00:00');if(b<=a)b+=1440;return {open:a,close:b,hours:Math.max(0,(b-a)/60)}}
function availableHoursInRange(range){let h=0;for(let d=parseDashDate(range.start),e=parseDashDate(range.end);d<=e;d=dashAddDays(d,1)){const b=operatingBoundsForDate(dashDateValue(d));if(b)h+=b.hours}return h}
function operationalBucketOccurrences(range){const map={};for(let d=parseDashDate(range.start),e=parseDashDate(range.end);d<=e;d=dashAddDays(d,1)){const ds=dashDateValue(d),b=operatingBoundsForDate(ds);if(!b)continue;for(let h=Math.floor(b.open/60);h<Math.ceil(b.close/60);h++){const a=h*60,z=(h+1)*60;if(Math.min(z,b.close)>Math.max(a,b.open)){const key=`${d.getDay()}-${h%24}`;map[key]=(map[key]||0)+1}}}return map}

function openSchedule(){ensureOperatingSchedule();const days=[['Domingo',0],['Lunes',1],['Martes',2],['Miércoles',3],['Jueves',4],['Viernes',5],['Sábado',6]];scheduleEditor.innerHTML=days.map(([name,i])=>{const c=settings.schedule[i];return `<div class="schedule-row"><label class="schedule-day"><input id="schedActive${i}" type="checkbox" ${c.active?'checked':''}>${name}</label><div class="schedule-time"><label>Abre</label><input id="schedOpen${i}" type="time" value="${escapeHtml(c.open)}"></div><div class="schedule-time"><label>Cierra</label><input id="schedClose${i}" type="time" value="${escapeHtml(c.close)}"></div></div>`}).join('');openSheet('scheduleSheet')}
function updateScheduleMasterBadge(){const e=document.getElementById('scheduleMasterBadge');if(!e)return;ensureOperatingSchedule();const vals=Object.values(settings.schedule).filter(x=>x.active).map(x=>`${x.open}-${x.close}`);e.textContent=(new Set(vals).size===1&&vals.length)?vals[0]:'Por día'}
function saveSchedule(){ensureOperatingSchedule();for(let i=0;i<7;i++){settings.schedule[i]={active:document.getElementById(`schedActive${i}`).checked,open:document.getElementById(`schedOpen${i}`).value||'08:00',close:document.getElementById(`schedClose${i}`).value||'00:00'}}persist();updateScheduleMasterBadge();updatePaymentMethodsMasterBadge();closeSheet('scheduleSheet');renderHome();showToast('Horario operativo guardado')}

function openTariffs(){if(!requirePermission('manage_settings'))return;
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
  const a=Date.parse(date+'T'+start+':00-05:00'),b=a+30*60000;return reservations.find(r=>!['cancelled','no_show','paused'].includes(r.status)&&!r.seriesPaused&&reservationResources(r).includes(resource)&&(()=>{const x=Date.parse(r.eventDate+'T'+r.startTime+':00-05:00');let y=Date.parse(r.eventDate+'T'+r.endTime+':00-05:00');if(y<=x)y+=86400000;return a<y&&x<b;})())||null
}
function renderCalendarDayScheduler(){
  const host=document.getElementById('dayScheduler');if(!host)return;
  renderDateStrip();
  const [y,m,d]=calendarSelectedDate.split('-').map(Number);const dt=new Date(y,m-1,d);
  calendarDayLabel.textContent=dt.toLocaleDateString('es-PE',{weekday:'long',day:'numeric',month:'long'}).replace(/^./,x=>x.toUpperCase());
  const dayReservations=reservations.filter(r=>!['cancelled','no_show'].includes(r.status)&&r.eventDate===calendarSelectedDate);
  calendarDaySummary.textContent=`${dayReservations.length} ocupación${dayReservations.length===1?'':'es'} · ${businessResources().length} espacios`;
  const resources=businessResources().map(r=>r.key);host.style.gridTemplateColumns='60px repeat('+resources.length+', minmax(140px,1fr))';
  let out='<div class="sch-head time">Hora</div>'+resources.map(key=>'<div class="sch-head">'+escapeHtml(businessResourceName(key))+'</div>').join('');
  for(let mins=(settings.businessCatalog?0:6*60);mins<(settings.businessCatalog?24*60:23*60);mins+=30){
    const start=`${String(Math.floor(mins/60)).padStart(2,'0')}:${String(mins%60).padStart(2,'0')}`;
    const end=addMinutesToTime(start,30);
    out+=`<div class="sch-time">${start}</div>`;
    resources.forEach(resource=>{
      const r=reservationForResourceAt(resource,calendarSelectedDate,start,end);
      if(!r&&!businessResourceOpen(resource,calendarSelectedDate,start)){out+='<div class="sch-cell catalog-slot-closed">Cerrado</div>';return;}
      if(!r){
        out+=`<div class="sch-cell free" onclick="quickReserveSlot('${resource}','${start}')"><div class="sch-slot free-ui">Disponible</div></div>`;
      }else{
        const kind=r.reservationKind||(r.space==='Local exclusivo'?'exclusive':'court'),name=reservationDisplayName(r);
        const isHold=r.status==='hold';
        const cls=kind==='internal'?'hold':(isHold?'hold':(kind==='exclusive'?'exclusive':(r.courtType==='FUT 9'?'fut9':'reserved')));
        const label=kind==='internal'?(r.internalUseType==='maintenance'?'Bloqueo':(r.internalUseType==='courtesy'?'Cortesía':'Interno')):(isHold?'Pendiente':(kind==='exclusive'?'Exclusivo':(r.courtType==='FUT 9'?'FUT 9':'FUT 6')));
        const isStart=timeToMinutes(start)===timeToMinutes(r.startTime);
        out+=`<div class="sch-cell" onclick="openReservationDetail('${r.id}')"><div class="sch-slot ${cls}"><b>${label}${isStart?' · '+escapeHtml(name):''}</b><span>${isStart?escapeHtml(r.startTime)+'-'+escapeHtml(r.endTime)+' · '+escapeHtml(reservationStatusLabel(r)):'Ocupado'}</span></div></div>`;
      }
    })
  }
  host.innerHTML=out
}
function quickReserveSlot(resource,time){if(!requirePermission('manage_reservations'))return;
  if(settings.businessCatalog&&window.ElevaBusinessCatalog){window.ElevaBusinessCatalog.openBooking({resource,date:calendarSelectedDate,time});return;}
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




function openMasters(){if(!requirePermission('manage_settings'))return;openSheet('mastersSheet')}
function openMasterDetail(type){
  ensureQuoteSettings();
  if(type==='users'){
    if(!requirePermission('manage_access','Solo un usuario con permiso de administrar accesos puede cambiar usuarios y roles'))return;openAccessConfigCenter();return
  }
  if(type==='packages'){
    const p=settings.exclusivePackage,s=packageGroup(p,'sports','Zona deportiva'),o=packageGroup(p,'other','Otras zonas'),v=packageGroup(p,'services','Servicios del establecimiento');
    masterDetailTitle.textContent='Paquete · Local exclusivo';
    masterDetailBody.innerHTML=`<div class="info">Esta configuración se usa como base para futuras cotizaciones. Las cotizaciones ya generadas conservan su propia copia.</div><div class="form-card"><h3>Presentación</h3><div class="field"><label>Nombre del paquete</label><input id="mPkgName" value="${escapeHtml(p.name||'')}"></div><div class="field"><label>Descripción</label><input id="mPkgDescription" value="${escapeHtml(p.description||'')}"></div></div><div class="form-card"><h3>Zona deportiva</h3><div class="field"><label>Un elemento por línea</label><textarea id="mPkgSports" rows="6">${escapeHtml((s.items||[]).join('\n'))}</textarea></div></div><div class="form-card"><h3>Otras zonas</h3><div class="field"><label>Un elemento por línea</label><textarea id="mPkgOther" rows="6">${escapeHtml((o.items||[]).join('\n'))}</textarea></div></div><div class="form-card"><h3>Servicios del establecimiento</h3><div class="field"><label>Un elemento por línea</label><textarea id="mPkgServices" rows="5">${escapeHtml((v.items||[]).join('\n'))}</textarea></div></div><button class="primary" onclick="saveMasterPackage()">Guardar paquete</button>`;
    openSheet('masterDetailSheet');return
  }
  if(type==='expenseCategories'){
    ensureExpenseMasters();expenseCategoriesDraft=cloneData(settings.expenseCategories);masterDetailTitle.textContent='Categorías de gasto';masterDetailBody.innerHTML=`<div class="info">La categoría responde <b>en qué se gastó</b>. Si una categoría ya tiene historial, al quitarla se desactiva para conservar los movimientos anteriores.</div><div class="form-card"><h3>Categorías disponibles</h3><div id="expenseCategoriesEditor" class="expense-master-editor"></div><div class="payment-method-actions"><button class="ghost" onclick="addExpenseMasterDraft('category')">＋ Nueva categoría</button></div></div><button class="primary" onclick="saveExpenseMaster('category')">Guardar categorías</button>`;renderExpenseMasterEditor('category');openSheet('masterDetailSheet');return
  }
  if(type==='expenseAreas'){
    ensureExpenseMasters();expenseAreasDraft=cloneData(settings.expenseAreas);masterDetailTitle.textContent='Áreas / centros';masterDetailBody.innerHTML=`<div class="info">El área responde <b>para qué parte del negocio</b> se hizo el gasto. Ejemplo: Marketing + Academia, o Mantenimiento + Canchas.</div><div class="form-card"><h3>Áreas disponibles</h3><div id="expenseAreasEditor" class="expense-master-editor"></div><div class="payment-method-actions"><button class="ghost" onclick="addExpenseMasterDraft('area')">＋ Nueva área</button></div></div><button class="primary" onclick="saveExpenseMaster('area')">Guardar áreas</button>`;renderExpenseMasterEditor('area');openSheet('masterDetailSheet');return
  }
  if(type==='treasury'){
    ensureTreasuryAccounts();treasuryAccountsDraft=cloneData(settings.treasuryAccounts.filter(a=>a.id!=='acc_unassigned'));masterDetailTitle.textContent='Cuentas y custodia';masterDetailBody.innerHTML=`<div class="info">Configura dónde puede quedar el dinero. “Eleva” son fondos propios; “Por rendir” son fondos temporalmente bajo responsabilidad de una persona. El saldo inicial permite empezar con el dinero que ya existía sin registrarlo como ingreso.</div><div class="form-card"><h3>Cuentas disponibles</h3><div id="treasuryAccountsEditor" class="treasury-editor"></div><div class="payment-method-actions"><button class="ghost" onclick="addTreasuryAccountDraft()">＋ Nueva cuenta / custodia</button></div></div><button class="primary" onclick="saveTreasuryAccountsMaster()">Guardar cuentas</button>`;renderTreasuryAccountsEditor();openSheet('masterDetailSheet');return
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
    states:{title:'Estados',rows:[['Pendiente','Bloquea disponibilidad'],['Confirmada','Bloquea disponibilidad'],['Realizada','Histórico'],['Cancelada','Libera disponibilidad'],['No asistió','Histórico / libera disponibilidad'],['Reprogramada','Reserva movida a nueva fecha u horario']]},
    users:{title:'Usuarios / Vendedores',rows:[['EV','Administrador · Activo'],['Roles','Administrador / Vendedor / Operaciones']]},
    conditions:{title:'Condiciones',rows:[['Reserva','Texto base configurable'],['Cancelación','Texto base configurable'],['Garantía','Texto base configurable'],['Eventos exclusivos','Texto base configurable']]}
  };
  const c=configs[type];if(!c)return;masterDetailTitle.textContent=c.title;masterDetailBody.innerHTML=c.rows.map(r=>`<div class="card"><div class="detail-row"><span>${escapeHtml(r[0])}</span><b>${escapeHtml(r[1])}</b></div></div>`).join('');openSheet('masterDetailSheet')
}
function expenseMasterDraft(type){return type==='area'?expenseAreasDraft:expenseCategoriesDraft}
function expenseMasterEditorId(type){return type==='area'?'expenseAreasEditor':'expenseCategoriesEditor'}
function collectExpenseMasterDraft(type){const draft=expenseMasterDraft(type),hostId=expenseMasterEditorId(type);document.querySelectorAll(`#${hostId} .expense-master-row`).forEach(row=>{const i=Number(row.dataset.index),item=draft[i];if(!item)return;item.name=(row.querySelector('[data-exp-name]')?.value||'').trim();item.active=!!row.querySelector('[data-exp-active]')?.checked})}
function renderExpenseMasterEditor(type){const draft=expenseMasterDraft(type),host=document.getElementById(expenseMasterEditorId(type));if(!host)return;host.innerHTML=draft.map((x,i)=>`<div class="expense-master-row" data-index="${i}"><input data-exp-name type="text" value="${escapeHtml(x.name||'')}" placeholder="${type==='area'?'Ej. Canchas':'Ej. Mantenimiento'}"><label class="expense-master-active"><input data-exp-active type="checkbox" ${x.active!==false?'checked':''}> Activa</label><button class="expense-master-remove" onclick="removeExpenseMasterDraft('${type}',${i})">Quitar</button></div>`).join('')||'<div class="empty">Sin registros.</div>'}
function addExpenseMasterDraft(type){collectExpenseMasterDraft(type);const draft=expenseMasterDraft(type);draft.push({id:crypto.randomUUID(),name:'',active:true});renderExpenseMasterEditor(type)}
function removeExpenseMasterDraft(type,index){collectExpenseMasterDraft(type);const draft=expenseMasterDraft(type),item=draft[index];if(!item)return;const used=movements.some(m=>m.type==='expense'&&(type==='area'?String(m.areaId||'')===String(item.id):String(m.categoryId||'')===String(item.id)));if(used){item.active=false;renderExpenseMasterEditor(type);showToast('Ya fue usado: se desactivó para conservar el historial');return}draft.splice(index,1);renderExpenseMasterEditor(type)}
function saveExpenseMaster(type){collectExpenseMasterDraft(type);const draft=expenseMasterDraft(type),clean=draft.map((x,i)=>({id:crypto.randomUUID(),name:String(x.name||'').trim(),active:x.active!==false})).filter(x=>x.name),seen=new Set();for(const x of clean){const k=x.name.toLocaleLowerCase('es-PE');if(seen.has(k)){showToast('No repitas nombres');return}seen.add(k)}if(!clean.some(x=>x.active)){showToast(`Deja al menos una ${type==='area'?'área':'categoría'} activa`);return}if(type==='area')settings.expenseAreas=clean;else settings.expenseCategories=clean;persist();updateExpenseMasterBadges();closeSheet('masterDetailSheet');renderHome();showToast(type==='area'?'Áreas actualizadas':'Categorías actualizadas')}
function updateExpenseMasterBadges(){ensureExpenseMasters();const c=document.getElementById('expenseCategoriesMasterBadge'),a=document.getElementById('expenseAreasMasterBadge');if(c)c.textContent=`${activeExpenseCategories().length} activas`;if(a)a.textContent=`${activeExpenseAreas().length} activas`}

function collectTreasuryAccountsDraftFromDom(){document.querySelectorAll('#treasuryAccountsEditor .treasury-editor-row').forEach(row=>{const i=Number(row.dataset.index),item=treasuryAccountsDraft[i];if(!item)return;item.name=(row.querySelector('[data-ta-name]')?.value||'').trim();item.kind=row.querySelector('[data-ta-kind]')?.value==='custody'?'custody':'company';item.active=!!row.querySelector('[data-ta-active]')?.checked;item.openingBalance=Number(row.querySelector('[data-ta-opening]')?.value||0)})}
function renderTreasuryAccountsEditor(){const host=document.getElementById('treasuryAccountsEditor');if(!host)return;host.innerHTML=treasuryAccountsDraft.map((a,i)=>`<div class="treasury-editor-row" data-index="${i}"><input data-ta-name value="${escapeHtml(a.name||'')}" placeholder="Ej. Caja Eleva"><select data-ta-kind><option value="company" ${a.kind!=='custody'?'selected':''}>Fondos de Eleva</option><option value="custody" ${a.kind==='custody'?'selected':''}>Fondos por rendir</option></select><input data-ta-opening type="number" step="0.01" value="${Number(a.openingBalance||0)}" placeholder="Saldo inicial"><div class="treasury-editor-actions"><label class="treasury-editor-active"><input data-ta-active type="checkbox" ${a.active!==false?'checked':''}> Activa</label><button class="treasury-editor-remove" onclick="removeTreasuryAccountDraft(${i})">Quitar</button></div></div>`).join('')}
function addTreasuryAccountDraft(){collectTreasuryAccountsDraftFromDom();treasuryAccountsDraft.push({id:crypto.randomUUID(),name:'',kind:'company',active:true,openingBalance:0});renderTreasuryAccountsEditor()}
function removeTreasuryAccountDraft(index){collectTreasuryAccountsDraftFromDom();const item=treasuryAccountsDraft[index];if(!item)return;const used=movements.some(m=>movementAccountId(m)===item.id||m.sourceAccountId===item.id||m.destinationAccountId===item.id);if(used){item.active=false;renderTreasuryAccountsEditor();showToast('Ya fue usada: se desactivó para conservar el historial');return}treasuryAccountsDraft.splice(index,1);renderTreasuryAccountsEditor()}
function saveTreasuryAccountsMaster(){collectTreasuryAccountsDraftFromDom();settings.treasuryAccounts=treasuryAccountsDraft.map(a=>({...a,name:String(a.name||'').trim()})).filter(a=>a.name);persist();closeSheet('masterDetailSheet');showToast('Cuentas actualizadas');}
function updateTreasuryMasterBadge(){const e=document.getElementById('treasuryMasterBadge');if(!e)return;ensureTreasuryAccounts();const active=treasuryAccounts(true);e.textContent=`${active.filter(a=>a.kind==='company').length} Eleva · ${active.filter(a=>a.kind==='custody').length} por rendir`}
function collectPaymentMethodsDraftFromDom(){
  const rows=[...document.querySelectorAll('#paymentMethodsEditor .payment-method-row')];rows.forEach(row=>{const i=Number(row.dataset.index),item=paymentMethodsDraft[i];if(!item)return;const name=row.querySelector('[data-pm-name]'),active=row.querySelector('[data-pm-active]');item.name=(name&&name.value||'').trim();item.active=!!(active&&active.checked)})
}
function renderPaymentMethodsEditor(){
  const host=document.getElementById('paymentMethodsEditor');if(!host)return;host.innerHTML=paymentMethodsDraft.map((m,i)=>`<div class="payment-method-row" data-index="${i}"><input data-pm-name type="text" value="${escapeHtml(m.name||'')}" placeholder="Ej. Yape"><label class="payment-method-active"><input data-pm-active type="checkbox" ${m.active!==false?'checked':''}>Activo</label><button class="payment-method-remove" onclick="removePaymentMethodDraft(${i})">Quitar</button></div>`).join('')||'<div class="empty">No hay métodos configurados.</div>'
}
function addPaymentMethodDraft(){collectPaymentMethodsDraftFromDom();paymentMethodsDraft.push({id:crypto.randomUUID(),name:'',active:true});renderPaymentMethodsEditor();const inputs=document.querySelectorAll('#paymentMethodsEditor [data-pm-name]');if(inputs.length)inputs[inputs.length-1].focus()}
function removePaymentMethodDraft(index){collectPaymentMethodsDraftFromDom();const item=paymentMethodsDraft[index];if(!item)return;const used=item.name&&movements.some(m=>String(m.method||'')===item.name);if(used){item.active=false;renderPaymentMethodsEditor();showToast('Ya fue usado: se desactivó para conservar el historial');return}paymentMethodsDraft.splice(index,1);renderPaymentMethodsEditor()}
function savePaymentMethodsMaster(){
  collectPaymentMethodsDraftFromDom();const cleaned=paymentMethodsDraft.map((m,i)=>({id:crypto.randomUUID(),name:String(m.name||'').trim(),active:m.active!==false})).filter(m=>m.name);const names=new Set();for(const m of cleaned){const key=m.name.toLocaleLowerCase('es-PE');if(names.has(key)){showToast('No repitas nombres de métodos');return}names.add(key)}if(!cleaned.some(m=>m.active)){showToast('Deja al menos un método activo');return}settings.paymentMethods=cleaned;persist();updatePaymentMethodsMasterBadge();closeSheet('masterDetailSheet');showToast('Métodos de pago actualizados')
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
function auditValue(v){if(v===null||v===undefined||v==='')return '—';if(Array.isArray(v))return v.join(' + ')||'—';if(typeof v==='boolean')return v?'Sí':'No';return String(v)}
function addAuditEvent(){/* La auditoría es propiedad de los triggers de PostgreSQL. */}
function auditDiff(before,after,defs){return defs.map(([key,label,format])=>{const b=format?format(before?.[key],before):before?.[key],a=format?format(after?.[key],after):after?.[key];return {field:label,before:auditValue(b),after:auditValue(a)}}).filter(x=>x.before!==x.after)}
function reservationAuditSnapshot(r){const c=clientById(r?.clientId);return {client:c?.name||'',eventDate:r?.eventDate||'',startTime:r?.startTime||'',endTime:r?.endTime||'',courtType:r?.courtType||r?.space||'',courts:reservationResources(r||{}),courtRate:Number(r?.courtRate||0),baseTotal:Number(r?.baseTotal||0),taxApplied:!!r?.taxApplied,taxAmount:Number(r?.taxAmount||0),total:Number(r?.total||0),paymentDueDate:reservationDueDate(r),status:r?.status||'',notes:r?.notes||''}}
function reservationAuditChanges(a,b){return auditDiff(a,b,[['client','Cliente'],['eventDate','Fecha'],['startTime','Hora inicio'],['endTime','Hora fin'],['courtType','Formato / espacio'],['courts','Canchas'],['courtRate','Tarifa',v=>money(Number(v||0))],['baseTotal','Base',v=>money2(Number(v||0))],['taxApplied','Aplicar IGV'],['taxAmount','IGV',v=>money2(Number(v||0))],['total','Total',v=>money2(Number(v||0))],['paymentDueDate','Vencimiento'],['status','Estado'],['notes','Notas']])}
function clientAuditSnapshot(c){return {name:c?.name||'',phone:c?.phone||'',company:c?.company||'',doc:c?.doc||'',email:c?.email||'',specialFut6:c?.specialFut6??'',specialFut9:c?.specialFut9??''}}
function clientAuditChanges(a,b){return auditDiff(a,b,[['name','Nombre'],['phone','Celular'],['company','Empresa'],['doc','Documento'],['email','Correo'],['specialFut6','Tarifa FUT6',v=>v===''?'—':money(Number(v||0))],['specialFut9','Tarifa FUT9',v=>v===''?'—':money(Number(v||0))]])}
function seriesAuditSnapshot(x){return {startDate:x?.startDate||'',endDate:x?.endDate||'',frequency:x?.frequency||'',billing:x?.billing||'',monthlyAmount:x?.monthlyAmount??'',applyIgv:!!x?.applyIgv,status:x?.status||'',blocks:(x?.blocks||[]).map(b=>`${recurringDaysLabel(b.weekdays)} ${b.startTime}-${recurringBlockEndTime(b)} ${b.courtType}`).join(' | ')}}
function seriesAuditChanges(a,b){return auditDiff(a,b,[['startDate','Inicio'],['endDate','Fin'],['frequency','Frecuencia'],['billing','Cobro'],['monthlyAmount','Monto mensual',v=>v===''?'—':money(Number(v||0))],['applyIgv','Aplicar IGV'],['status','Estado'],['blocks','Horarios']])}
function openHistory(){if(!requirePermission('view_history'))return;historyFilter='all';document.querySelectorAll('[data-history-filter]').forEach(x=>x.classList.toggle('active',x.dataset.historyFilter==='all'));renderHistory();openSheet('historySheet')}
function setHistoryFilter(filter,el){historyFilter=filter;document.querySelectorAll('[data-history-filter]').forEach(x=>x.classList.remove('active'));if(el)el.classList.add('active');renderHistory()}
function movementHistoryType(m){if(m.type==='payment'||m.type==='refund')return 'payments';if(m.type==='expense')return 'expenses';return 'treasury'}
function buildHistoryRecords(){
  const rows=[];
  clients.forEach(c=>rows.push({type:'commercial',at:c.createdAt,title:'Cliente creado',meta:c.name,icon:'C',entityType:'client',entityId:c.id,action:`closeSheet('historySheet');openClientProfile('${String(c.id)}')`}));
  quotes.forEach(q=>{const c=clientById(q.clientId)||{name:'Cliente'};rows.push({type:'commercial',at:q.createdAt,title:`Cotización ${q.code} creada`,meta:`${c.name} · ${money(q.regularTotal??q.total)}`,icon:'Q',entityType:'quote',entityId:q.id,action:`closeSheet('historySheet');openQuoteDetail('${String(q.id)}')`});if(q.reservedAt)rows.push({type:'commercial',at:q.reservedAt,title:`Cotización ${q.code} convertida en reserva`,meta:c.name,icon:'Q',entityType:'quote',entityId:q.id,action:`closeSheet('historySheet');openQuoteDetail('${String(q.id)}')`})});
  followups.forEach(f=>{const c=clientById(f.clientId)||{name:'Cliente'};rows.push({type:'commercial',at:f.createdAt,title:'Seguimiento creado',meta:`${c.name} · ${f.note}`,icon:'S',entityType:'followup',entityId:f.id,action:`closeSheet('historySheet');openFollowDetail('${String(f.id)}')`});if(f.completedAt)rows.push({type:'commercial',at:f.completedAt,title:'Seguimiento realizado',meta:`${c.name} · ${f.note}`,icon:'S',entityType:'followup',entityId:f.id,action:`closeSheet('historySheet');openFollowDetail('${String(f.id)}')`})});
  recurringSeries.forEach(sr=>{const c=clientById(sr.clientId)||{name:sr.internalTitle||'Actividad interna'};rows.push({type:'reservations',at:sr.createdAt,title:`Serie ${sr.code} creada`,meta:`${c.name} · ${(sr.blocks||[]).length} horario${(sr.blocks||[]).length===1?'':'s'}`,icon:'SR',entityType:'series',entityId:sr.id,action:`closeSheet('historySheet');openRecurringSeriesManager('${String(sr.id)}')`});if(sr.pausedAt)rows.push({type:'reservations',at:sr.pausedAt,title:`Serie ${sr.code} pausada`,meta:`Desde ${sr.pausedFrom||'—'}`,icon:'SR',entityType:'series',entityId:sr.id,action:`closeSheet('historySheet');openRecurringSeriesManager('${String(sr.id)}')`});if(sr.resumedAt)rows.push({type:'reservations',at:sr.resumedAt,title:`Serie ${sr.code} reanudada`,meta:c.name,icon:'SR',entityType:'series',entityId:sr.id,action:`closeSheet('historySheet');openRecurringSeriesManager('${String(sr.id)}')`});if(sr.finishedAt)rows.push({type:'reservations',at:sr.finishedAt,title:`Serie ${sr.code} finalizada`,meta:`Desde ${sr.finishedFrom||'—'}`,icon:'SR',entityType:'series',entityId:sr.id,action:`closeSheet('historySheet');openRecurringSeriesManager('${String(sr.id)}')`})});
  reservations.forEach(r=>{const c={name:reservationDisplayName(r)},act=`closeSheet('historySheet');openReservationDetail('${String(r.id)}')`;rows.push({type:'reservations',at:r.createdAt,title:`${isInternalReservation(r)?'Ocupación':(r.status==='hold'?'Pre-reserva':'Reserva')} ${r.code} creada`,meta:`${c.name} · ${r.space} · ${r.startTime}-${r.endTime}`,icon:'R',entityType:'reservation',entityId:r.id,action:act});if(r.confirmedAt)rows.push({type:'reservations',at:r.confirmedAt,title:`Reserva ${r.code} confirmada`,meta:c.name,icon:'R',entityType:'reservation',entityId:r.id,action:act});if(r.completedAt)rows.push({type:'reservations',at:r.completedAt,title:`Reserva ${r.code} realizada`,meta:c.name,icon:'R',entityType:'reservation',entityId:r.id,action:act});if(r.cancelledAt)rows.push({type:'reservations',at:r.cancelledAt,title:`Reserva ${r.code} cancelada`,meta:c.name,icon:'R',entityType:'reservation',entityId:r.id,action:act});if(r.noShowAt)rows.push({type:'reservations',at:r.noShowAt,title:`Reserva ${r.code} · no asistió`,meta:c.name,icon:'R',entityType:'reservation',entityId:r.id,action:act});if(r.reprogrammedAt)rows.push({type:'reservations',at:r.reprogrammedAt,title:`Reserva ${r.code} reprogramada`,meta:c.name,icon:'R',entityType:'reservation',entityId:r.id,action:act});const explicit=movements.filter(m=>m.type==='payment'&&paymentTouchesReservation(m,r.id)).reduce((sum,m)=>sum+paymentAppliedAmount(m,r.id),0),legacy=Math.max(0,Number(r.advance||0)-explicit);if(legacy>0)rows.push({type:'payments',at:r.createdAt,title:'Cobro previo registrado',meta:`${r.code} · ${c.name} · ${money(legacy)}`,icon:'P',entityType:'reservation',entityId:r.id,action:act})});
  movements.forEach(m=>{const r=m.reservationId?reservationById(m.reservationId):null,type=movementHistoryType(m),icon=type==='expenses'?'G':(type==='treasury'?'T':'P');let title=m.type==='payment'&&m.paymentStage?`Cobro · ${m.paymentStage}`:cashRecordLabel(m);let meta=`${m.code||''}${r?' · '+r.code:''} · ${money(m.amount)}${m.category?' · '+m.category:''}${m.method?' · '+m.method:''}${m.attachmentId?' · Con adjunto':''}`;let action='';if(m.type==='payment'&&m.clientId)action=`closeSheet('historySheet');openClientProfile('${String(m.clientId)}')`;else if(['expense','transfer','cash_in','cash_out','other_income','refund'].includes(m.type))action=`closeSheet('historySheet');openCash()`;rows.push({type,at:m.occurredAt||m.createdAt,title,meta,icon,entityType:m.type==='expense'?'expense':(m.type==='payment'?'payment':'treasury'),entityId:m.id,action});if(paymentIsInvoiced(m))rows.push({type:'billing',at:m.billingAt||m.billingDate||m.occurredAt,title:`${m.billingType||'Comprobante'} ${m.billingNumber||''} preparado`,meta:`${paymentClient(m).name} · ${money(m.billingTotal??m.amount)} · ${paymentBillingStatusLabel(m)}`,icon:'CPE',entityType:'billing',entityId:m.id,action:`closeSheet('historySheet');openBillingSheet('${String(m.id)}')`})});
  return rows.filter(x=>x.at).sort((a,b)=>new Date(b.at)-new Date(a.at))
}
function renderHistory(){let rows=buildHistoryRecords();if(historyFilter!=='all')rows=rows.filter(x=>x.type===historyFilter);historyList.innerHTML=rows.length?rows.map(x=>`<div class="card history-item ${x.action?'clickable':''}" ${x.action?`onclick="${x.action}"`:''}><div class="history-icon">${escapeHtml(x.icon)}</div><div class="history-main"><div class="history-title">${escapeHtml(x.title)}</div><div class="history-meta">${escapeHtml(x.meta)}<br>${fmtDateTime(x.at)} · Usuario EV</div></div></div>`).join(''):'<div class="empty">No hay movimientos en este concepto.</div>'}
function openAuditLog(){if(!requirePermission('view_audit'))return;closeSheet('historySheet');const a=document.getElementById('auditStart'),b=document.getElementById('auditEnd'),q=document.getElementById('auditSearch'),t=document.getElementById('auditType');if(a)a.value='';if(b)b.value='';if(q)q.value='';if(t)t.value='all';renderAuditLog();openSheet('auditSheet')}
function renderAuditLog(){const q=String(document.getElementById('auditSearch')?.value||'').toLocaleLowerCase('es-PE'),start=document.getElementById('auditStart')?.value||'',end=document.getElementById('auditEnd')?.value||'',type=document.getElementById('auditType')?.value||'all';let rows=[...auditLog].filter(x=>{const ds=String(x.at||'').slice(0,10);if(start&&ds<start)return false;if(end&&ds>end)return false;if(type!=='all'&&x.entityType!==type)return false;const hay=[x.code,x.action,x.meta,x.user,x.role,...(x.changes||[]).flatMap(c=>[c.field,c.before,c.after])].join(' ').toLocaleLowerCase('es-PE');return !q||hay.includes(q)}).sort((a,b)=>new Date(b.at)-new Date(a.at));const host=document.getElementById('auditList');if(!host)return;host.innerHTML=rows.length?rows.map(x=>`<div class="audit-row"><div class="audit-top"><b>${escapeHtml((x.code?x.code+' · ':'')+x.action)}</b><span>${fmtDateTime(x.at)}</span></div><div class="audit-meta">${escapeHtml(x.user||'Usuario EV')} · ${escapeHtml(x.role||'Administrador')}${x.meta?`<br>${escapeHtml(x.meta)}`:''}</div>${(x.changes||[]).map(c=>`<div class="audit-change"><strong>${escapeHtml(c.field)}</strong><span>${escapeHtml(c.before)} → <b>${escapeHtml(c.after)}</b></span></div>`).join('')}</div>`).join(''):'<div class="audit-empty">No hay cambios auditados con estos filtros. Los cambios detallados empiezan a registrarse desde la v56.</div>'}
function reservationActivityHtml(r){const rows=[];rows.push({at:r.createdAt,title:`${isInternalReservation(r)?'Ocupación':'Reserva'} creada`,meta:'Usuario EV'});if(r.confirmedAt)rows.push({at:r.confirmedAt,title:'Reserva confirmada',meta:'Usuario EV'});if(r.completedAt)rows.push({at:r.completedAt,title:'Reserva realizada',meta:'Usuario EV'});if(r.reprogrammedAt)rows.push({at:r.reprogrammedAt,title:'Reserva reprogramada',meta:'Usuario EV'});if(r.cancelledAt)rows.push({at:r.cancelledAt,title:'Reserva cancelada',meta:'Usuario EV'});if(r.noShowAt)rows.push({at:r.noShowAt,title:'No asistió',meta:'Usuario EV'});movements.filter(m=>m.type==='payment'&&paymentTouchesReservation(m,r.id)).forEach(m=>rows.push({at:m.occurredAt||m.createdAt,title:`Cobro · ${m.paymentStage||'Pago'}`,meta:`${money(paymentAppliedAmount(m,r.id))} · ${m.method||'Sin método'}`}));auditLog.filter(a=>a.entityType==='reservation'&&String(a.entityId)===String(r.id)&&!/creada/i.test(a.action)).forEach(a=>rows.push({at:a.at,title:a.action,meta:(a.changes||[]).slice(0,3).map(c=>`${c.field}: ${c.before} → ${c.after}`).join(' · ')||a.meta||'Usuario EV'}));rows.sort((a,b)=>new Date(b.at)-new Date(a.at));if(!rows.length)return '';return `<div class="activity-box"><div class="activity-title">Actividad</div>${rows.slice(0,20).map(x=>`<div class="activity-row"><div class="activity-dot"></div><div><b>${escapeHtml(x.title)}</b><span>${escapeHtml(x.meta||'')} · ${fmtDateTime(x.at)}</span></div></div>`).join('')}</div>`}

let openClientProfileId=null;
let clientProfilePeriod='all';
let clientProfileCustomStart='';
let clientProfileCustomEnd='';
let clientRelation='reservations';

function openClients(){if(!requirePermission('view_clients'))return;renderDirectory();openSheet('clientsSheet')}
function clientReservations(id){return reservations.filter(r=>String(r.clientId)===String(id))}
function clientUpcomingReservations(id){const today=localDateValue();return clientReservations(id).filter(r=>r.eventDate>=today&&!['completed','cancelled','no_show'].includes(r.status))}
function renderDirectory(){
  clientDirectory.innerHTML=clients.length?clients.map(c=>{
    const specials=[];if(c.specialFut6!==null&&c.specialFut6!==undefined&&c.specialFut6!=='')specials.push(`FUT 6 ${money(c.specialFut6)}`);if(c.specialFut9!==null&&c.specialFut9!==undefined&&c.specialFut9!=='')specials.push(`FUT 9 ${money(c.specialFut9)}`);
    const rs=clientReservations(c.id),up=clientUpcomingReservations(c.id);
    return `<div class="card"><div class="lead"><div class="initials">${initials(c.name)}</div><div class="lead-main"><div class="lead-name">${escapeHtml(c.name)}</div><div class="lead-meta">${escapeHtml(c.phone||c.company||'Solo nombre registrado')}</div><div class="client-directory-stats"><span class="client-stat-chip">${rs.length} ${rs.length===1?'reserva':'reservas'}</span><span class="client-stat-chip active">${up.length} ${up.length===1?'próxima':'próximas'}</span></div>${specials.length?`<div class="created">Tarifa especial: ${specials.join(' · ')}</div>`:''}${Number(c.creditBalance||0)>0?`<div class="created"><b>Saldo a favor: ${money(c.creditBalance)}</b></div>`:''}${clientUnappliedBalance(c.id)>0.001?`<div class="created"><b>Pago sin aplicar: ${money(clientUnappliedBalance(c.id))}</b></div>`:''}</div></div><div class="client-directory-actions"><button class="btn primary-small" onclick="openClientProfile('${c.id}')">Ver cliente</button><button class="btn" onclick="openEditClient('${c.id}')">Editar</button></div></div>`
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
  clientReservations(clientId).forEach(r=>{const used=movements.filter(m=>m.type==='payment'&&paymentTouchesReservation(m,r.id)).reduce((sum,m)=>sum+paymentAppliedAmount(m,r.id),0),legacyAmount=Math.max(0,Number(r.advance||0)-used);if(legacyAmount>0)legacy.push({id:`legacy-${r.id}`,type:'payment',reservationId:r.id,clientId:r.clientId,amount:legacyAmount,method:'No especificado',paymentStage:'Adelanto previo',occurredAt:r.createdAt,createdAt:r.createdAt,_legacy:true})});
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
  const contact=[c.phone,c.company,c.email].filter(Boolean).map(escapeHtml).join(' · ');document.getElementById('clientProfileContact').innerHTML=contact||'Sin datos adicionales';renderClientBillingProfiles();document.getElementById('clientProfileRangeLabel').textContent=range.label;
  const rs=clientReservations(c.id).filter(r=>clientDateInRange(r.eventDate,range));
  const active=rs.filter(r=>!['cancelled','hold'].includes(r.status));const hours=rs.filter(r=>r.status!=='cancelled').reduce((s,r)=>s+clientDurationHours(r),0);const sold=active.reduce((s,r)=>s+Number(r.total||0),0);const collected=active.reduce((s,r)=>s+Math.max(0,Number(r.advance||0)-Number(r.refundedAmount||0)),0);const pending=active.reduce((s,r)=>s+Math.max(0,Number(r.balance||0)),0);const completed=rs.filter(r=>r.status==='completed').length;
  document.getElementById('clientProfileKpis').innerHTML=`<div class="client-profile-kpi primary"><span>Reservas</span><b>${rs.length}</b><small>${completed} realizadas</small></div><div class="client-profile-kpi"><span>Horas</span><b>${hours.toLocaleString('es-PE',{maximumFractionDigits:1})} h</b><small>Reservadas en el período</small></div><div class="client-profile-kpi"><span>Vendido</span><b>${money(sold)}</b><small>Reservas activas</small></div><div class="client-profile-kpi"><span>Cobrado</span><b>${money(collected)}</b><small>Sobre esas reservas</small></div><div class="client-profile-kpi"><span>Saldo pendiente</span><b>${money(pending)}</b><small>${clientUnappliedBalance(c.id)>0.001?`Sin aplicar ${money(clientUnappliedBalance(c.id))}`:(Number(c.creditBalance||0)>0?`Saldo a favor ${money(c.creditBalance)}`:'Por cobrar')}</small></div><div class="client-profile-kpi"><span>Próximas</span><b>${clientUpcomingReservations(c.id).filter(r=>clientDateInRange(r.eventDate,range)).length}</b><small>Reservas futuras</small></div>`;
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
  if(clientRelation==='payments')html=ps.map(m=>{const apps=paymentApplications(m),r=apps.length===1?reservationById(apps[0].reservationId):reservationById(m.reservationId),multi=apps.length>1;return `<div class="client-rel-card"><div class="client-rel-top"><div class="client-rel-main"><div class="client-rel-title">${escapeHtml(m.paymentStage||'Cobro')}</div><div class="client-rel-meta">${multi?`${apps.length} reservas · `:(r?escapeHtml(r.code)+' · ':'')}${escapeHtml(m.method||'No especificado')} · ${fmtDateTime(m.occurredAt||m.createdAt)}${paymentUnappliedAmount(m)>0.001?`<br><b>Sin aplicar ${money(paymentUnappliedAmount(m))}</b>`:''}${m._legacy?'<br>Registro anterior sin movimiento individual':''}</div></div><div class="client-rel-money">${money(m.amount)}</div></div>${r||m.attachmentId?`<div class="client-rel-actions">${r?`<button class="btn primary-small" onclick="openReservationDetail('${r.id}')">Ver reserva</button>`:''}${m.attachmentId?`<button class="btn" onclick="openMovementAttachment('${m.id}')">Comprobante</button>`:''}</div>`:''}</div>`}).join('');
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
function dashSaleActive(r){return homeKindOf(r)!=='internal'&&!['cancelled','no_show','rescheduled','hold'].includes(r.status)}
function dashBlocksResource(r){return r.status!=='cancelled'}
function dashMoneyPaid(r){return Math.max(0,Number(r.advance||0)-Number(r.refundedAmount||0))}
function dashMoneySold(r){return dashSaleActive(r)?Number(r.total||0):0}
function dashMoneyReceivable(r){return dashSaleActive(r)?Math.max(0,Number(r.balance||0)):0}
function dashRangeReservations(range){return reservations.filter(r=>dashInRange(r.eventDate,range)&&matchesHomeReservationFilter(r))}
function dashProductName(r){if(r.catalogSnapshot)return r.catalogSnapshot.serviceName;const k=homeKindOf(r);if(k==='internal')return internalUseTypeLabel(r.internalUseType);if(k==='exclusive')return 'Eventos';return (r.courtType||r.space)==='FUT 9'?'FUT 9':'FUT 6'}
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
  const days=dashRangeDays(range.start,range.end),availableHours=availableHoursInRange(range),capacity=businessCapacityHours(range),occupancy=capacity?Math.min(100,courtHours/capacity*100):0;
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
  const perf=document.getElementById('homePerformance');if(perf)perf.innerHTML=products.map(x=>`<div class="dashboard-row"><div class="dashboard-row-top"><div class="dashboard-row-main"><b>${escapeHtml(x.name)}</b><span>${x.count} reserva${x.count===1?'':'s'} · ${dashFormatHours(x.hours)}</span></div><div class="dashboard-row-value"><b>${money(x.revenue)}</b><span>${sold?Math.round(x.revenue/sold*100):0}% ventas</span></div></div><div class="dashboard-progress"><i style="width:${x.revenue/maxProduct*100}%"></i></div></div>`).join('');

  // Uso por cancha física
  const courtUsage=businessResources().map(resource=>resource.key).map(c=>{
    const h=blocking.reduce((s,r)=>s+(reservationResources(r).includes(c)?dashDurationHours(r):0),0);return {court:businessResourceName(c),hours:h,pct:businessHours(range,businessResources().find(r=>r.key===c))?Math.min(100,h/businessHours(range,businessResources().find(r=>r.key===c))*100):0}
  });
  const usage=document.getElementById('homeCourtUsage');if(usage)usage.innerHTML=courtUsage.map(x=>`<div class="dashboard-row"><div class="dashboard-row-top"><div class="dashboard-row-main"><b>${escapeHtml(x.court)}</b><span>${dashFormatHours(x.hours)} ocupadas</span></div><div class="dashboard-row-value"><b>${x.pct.toFixed(0)}%</b></div></div><div class="dashboard-progress dark"><i style="width:${x.pct}%"></i></div></div>`).join('');

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
  const peakHost=document.getElementById('homePeakHours');if(peakHost)peakHost.innerHTML=peaks.length?peaks.map((x,i)=>`<div class="dashboard-row"><div class="dashboard-row-top"><div class="dashboard-rank">${i+1}</div><div class="dashboard-row-main"><b>${x.label}</b><span>Uso de los espacios configurados</span></div><div class="dashboard-row-value"><b>${x.pct.toFixed(0)}%</b></div></div><div class="dashboard-progress"><i style="width:${x.pct}%"></i></div></div>`).join(''):'<div class="card empty">Aún no hay suficiente actividad en este período.</div>';

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
  quotes.filter(q=>q.status==='reserved').forEach(q=>reservations.push({id:crypto.randomUUID(),code:nextReservationCode(),clientId:q.clientId,quoteId:q.id,eventType:q.eventType,eventDate:q.eventDate,startTime:q.startTime,endTime:q.endTime,space:q.mode==='exclusive'?'Local exclusivo':'Cancha',total:Number((q.regularTotal??q.total)||0),advance:0,balance:Number((q.regularTotal??q.total)||0),notes:'Importada desde '+q.code,status:'confirmed',createdAt:q.reservedAt||q.createdAt||nowISO()}));
  
}

ensureQuoteSettings();
quotes.forEach(q=>{
  if(q.mode==='exclusive'&&!q.packageSnapshot)q.packageSnapshot=cloneData(defaultExclusivePackage());
  if(q.regularTotal===undefined)q.regularTotal=Number(q.rent||0)+Number(q.guarantee||0);
  if(q.singlePaymentTotal===undefined)q.singlePaymentTotal=Math.max(0,Number(q.regularTotal||0)-Number(q.discount||0));
  if(q.discountConditional===undefined)q.discountConditional=true;if(q.applyIgv===undefined)q.applyIgv=false;if(q.taxRate===undefined)q.taxRate=18;if(q.regularBaseTotal===undefined)q.regularBaseTotal=Number(q.rent||0);if(q.regularTaxAmount===undefined)q.regularTaxAmount=0;if(q.singleBaseTotal===undefined)q.singleBaseTotal=Math.max(0,Number(q.rent||0)-Number(q.discount||0));if(q.singleTaxAmount===undefined)q.singleTaxAmount=0;
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
  if(!isInternalReservation(r)){if(r.taxApplied===undefined)r.taxApplied=false;if(r.taxRate===undefined)r.taxRate=18;if(r.taxAmount===undefined)r.taxAmount=0;if(r.nonTaxableExtra===undefined)r.nonTaxableExtra=0;if(r.baseTotal===undefined)r.baseTotal=Math.max(0,Number(r.total||0)-Number(r.taxAmount||0)-Number(r.nonTaxableExtra||0))}
});
recurringSeries.forEach(sr=>{if(sr.applyIgv===undefined)sr.applyIgv=false;if(sr.taxRate===undefined)sr.taxRate=18});


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
function dashboardCashRows(range){let rows=buildCashRecords().filter(m=>dashInRange(dashboardCashDate(m),range));if(homeReservationFilter==='all')return rows;return rows.filter(m=>movementReservationKind(m)===homeReservationFilter)}
function dashboardExpenseRows(range){return movements.filter(m=>m.type==='expense'&&dashInRange(m.date||dashboardCashDate(m),range))}
function dashboardExpenseMetrics(range){const rows=dashboardExpenseRows(range),supported=rows.filter(m=>(m.supportStatus||'supported')==='supported'),pending=rows.filter(m=>m.supportStatus==='pending'),observed=rows.filter(m=>m.supportStatus==='observed'),sum=a=>a.reduce((s,m)=>s+Number(m.amount||0),0),group=(arr,fn)=>{const map={};arr.forEach(m=>{const k=fn(m)||'Sin clasificar';map[k]=(map[k]||0)+Number(m.amount||0)});return Object.entries(map).sort((a,b)=>b[1]-a[1])};return {rows,supported,pending,observed,approvedTotal:sum(supported),pendingTotal:sum(pending),observedTotal:sum(observed),byCategory:group(supported,expenseCategoryName),byArea:group(supported,expenseAreaName)}}
function cancellationIncomeForRange(range){return (settings.cancellationRetentionEvents||[]).filter(e=>dashInRange(new Intl.DateTimeFormat('en-CA',{timeZone:'America/Lima',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(e.occurred_at)),range)).reduce((sum,e)=>sum+Number(e.amount),0)}
function companySoldForRange(range){return reservations.filter(r=>dashInRange(r.eventDate,range)).reduce((s,r)=>s+dashMoneySold(r),0)+cancellationIncomeForRange(range)}
function setExpenseAnalysisMode(mode){expenseAnalysisMode=mode;renderExpenseDashboardDetail()}
function renderExpenseDashboardDetail(){const range=homeDateRange(),m=dashboardExpenseMetrics(range),host=document.getElementById('dashboardDetailBody'),title=document.getElementById('dashboardDetailTitle'),rangeHost=document.getElementById('dashboardDetailRange');if(!host||!title)return;title.textContent='Gastos';rangeHost.textContent=range.label;const sold=companySoldForRange(range),result=sold-m.approvedTotal,data=expenseAnalysisMode==='area'?m.byArea:m.byCategory,max=Math.max(1,...data.map(x=>x[1]));const all=[...m.rows].sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))||String(b.time||'').localeCompare(String(a.time||'')));host.innerHTML=dashboardDetailStats([['Gastos aprobados',money(m.approvedTotal)],['Por sustentar',money(m.pendingTotal)],['Observado',money(m.observedTotal)],['Resultado operativo',money(result)]])+`<div class="expense-analysis-tabs"><button class="expense-analysis-tab ${expenseAnalysisMode==='category'?'active':''}" onclick="setExpenseAnalysisMode('category')">Por categoría</button><button class="expense-analysis-tab ${expenseAnalysisMode==='area'?'active':''}" onclick="setExpenseAnalysisMode('area')">Por área</button></div><div class="dashboard-detail-section"><div class="dashboard-detail-title">${expenseAnalysisMode==='area'?'Distribución por área':'Distribución por categoría'}</div>${data.length?data.map(([name,value])=>`<div class="dashboard-row"><div class="dashboard-row-top"><div class="dashboard-row-main"><b>${escapeHtml(name)}</b><span>${m.approvedTotal?Math.round(value/m.approvedTotal*100):0}% de gastos aprobados</span></div><div class="dashboard-row-value"><b>${money(value)}</b></div></div><div class="dashboard-progress"><i style="width:${value/max*100}%"></i></div></div>`).join(''):'<div class="card empty">Aún no hay gastos aprobados en este período.</div>'}</div><div class="dashboard-detail-section"><div class="dashboard-detail-title">Movimientos</div>${all.length?all.map(x=>{const st=x.supportStatus||'supported',label=st==='pending'?'Por sustentar':(st==='observed'?'Observado':(st==='returned'?'Regularizado / no aprobado':'Sustentado'));return `<div class="dashboard-detail-row"><div class="dashboard-detail-row-main"><b>${escapeHtml(expenseCategoryName(x))} · ${escapeHtml(expenseAreaName(x))}</b><span>${escapeHtml(x.detail||'Sin detalle')} · ${fmtScheduled(x.date||dashboardCashDate(x),x.time||'')}</span><span class="expense-status-inline ${st}">${label}</span></div><div class="dashboard-detail-row-value"><b>${money(x.amount)}</b>${x.attachmentId?`<button class="cash-proof-btn" onclick="openMovementAttachment('${String(x.id)}')">Comprobante</button>`:''}</div></div>`}).join(''):'<div class="card empty">No hay gastos registrados.</div>'}</div><div class="dashboard-detail-section"><button class="secondary" onclick="closeSheet('dashboardDetailSheet');openMovementForm('expense')">Registrar gasto</button></div>`}

function dashboardCashMetrics(range){
  const rows=dashboardCashRows(range),sumTypes=types=>rows.filter(m=>types.includes(m.type)).reduce((s,m)=>s+Number(m.amount||0),0);
  const payments=sumTypes(['payment','payment_legacy']),otherIncome=sumTypes(['other_income']),cashIn=sumTypes(['cash_in']),expenses=rows.filter(m=>m.type==='expense'&&(m.supportStatus||'supported')==='supported').reduce((s,m)=>s+Number(m.amount||0),0),pendingExpenses=rows.filter(m=>m.type==='expense'&&m.supportStatus==='pending').reduce((s,m)=>s+Number(m.amount||0),0),refunds=sumTypes(['refund']),cashOut=sumTypes(['cash_out']);
  return {rows,payments,otherIncome,cashIn,expenses,pendingExpenses,refunds,cashOut,net:payments+otherIncome+cashIn-expenses-refunds-cashOut}
}
function dashboardAvailableMetrics(){const t=treasuryMetrics(),byAccount={};t.accounts.forEach(a=>{byAccount[a.name]=Number(t.balances[a.id]||0)});return {rows:buildCashRecords(),total:t.company,custody:t.custody,pending:t.pending,observed:t.observed,accounts:t.accounts,byAccount}}
function dashboardSalesProducts(rows){return [...new Set(['FUT 6','FUT 9','Eventos',...rows.map(dashProductName)])].map(name=>{const a=rows.filter(r=>dashProductName(r)===name&&dashSaleActive(r));return {name,revenue:a.reduce((s,r)=>s+Number(r.total||0),0),hours:a.reduce((s,r)=>s+dashDurationHours(r),0),count:a.length,rows:a}})}
function dashboardAnalysisData(range,rows){
  const active=rows.filter(dashSaleActive),sold=active.reduce((s,r)=>s+Number(r.total||0),0),blocking=rows.filter(dashBlocksResource),bookingHours=blocking.reduce((s,r)=>s+dashDurationHours(r),0),courtHours=blocking.reduce((s,r)=>s+dashDurationHours(r)*reservationResources(r).length,0),availableHours=availableHoursInRange(range),capacity=businessCapacityHours(range),occupancy=capacity?Math.min(100,courtHours/capacity*100):0,ticket=active.length?sold/active.length:0;
  const commercialBlocking=blocking.filter(r=>homeKindOf(r)!=='internal'),commercialBookingHours=commercialBlocking.reduce((s,r)=>s+dashDurationHours(r),0),incomeHour=commercialBookingHours?sold/commercialBookingHours:0;
  const mix={commercial:0,activity:0,courtesy:0,maintenance:0};blocking.forEach(r=>{const h=dashDurationHours(r)*reservationResources(r).length;if(homeKindOf(r)!=='internal')mix.commercial+=h;else if(r.internalUseType==='courtesy')mix.courtesy+=h;else if(r.internalUseType==='maintenance')mix.maintenance+=h;else mix.activity+=h});
  return {active,sold,blocking,bookingHours,courtHours,availableHours,capacity,occupancy,ticket,incomeHour,commercialBookingHours,mix}
}
function dashboardMethodBreakdown(rows){const map={};rows.forEach(m=>{const k=m.method||'No especificado';map[k]=(map[k]||0)+Number(m.amount||0)*Number(m.sign||0)});return Object.entries(map).sort((a,b)=>Math.abs(b[1])-Math.abs(a[1]))}
function renderHome(){
  const range=homeDateRange(),prevRange=dashPreviousRange(range),rows=dashRangeReservations(range),prevRows=dashRangeReservations(prevRange),cash=dashboardCashMetrics(range),prevCash=dashboardCashMetrics(prevRange),available=dashboardAvailableMetrics(),analysis=dashboardAnalysisData(range,rows);
  const sold=rows.reduce((s,r)=>s+dashMoneySold(r),0),receivableRowsCurrent=reservations.filter(r=>matchesHomeReservationFilter(r)&&dashMoneyReceivable(r)>0),receivable=receivableRowsCurrent.reduce((s,r)=>s+Number(r.balance||0),0),prevSold=prevRows.reduce((s,r)=>s+dashMoneySold(r),0),reservationCount=rows.filter(r=>r.status!=='cancelled').length,receivableCount=receivableRowsCurrent.length;
  const setText=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v};
  setText('homeRangeLabel',range.label);setText('homePeriodLabel',homePeriodName(homePeriod));setText('dashAvailable',money(available.total));setText('dashAvailableMeta',available.custody>0?`${money(available.custody)} por rendir`:'Fondos propios');setText('dashCashNet',money(cash.net));setText('dashCashNetMeta',`${dashPctDelta(cash.net,prevCash.net)} · entradas − salidas`);setText('dashSold',money(sold));setText('dashSoldDelta',dashPctDelta(sold,prevSold));setText('dashReservationCount',String(reservationCount));setText('dashReservationMeta',`${dashFormatHours(analysis.bookingHours)} ocupadas`);setText('dashReceivable',money(receivable));const receivableClients=new Set(receivableRowsCurrent.map(r=>String(r.clientId))).size;setText('dashReceivableMeta',`${receivableClients} cliente${receivableClients===1?'':'s'} · ${receivableCount} reserva${receivableCount===1?'':'s'}`);
  const expenseMetrics=dashboardExpenseMetrics(range),companySold=companySoldForRange(range),operatingResult=companySold-expenseMetrics.approvedTotal;setText('dashExpenses',money(expenseMetrics.approvedTotal));setText('dashExpensesPending',money(expenseMetrics.pendingTotal));setText('dashOperatingResult',money(operatingResult));const resultEl=document.getElementById('dashOperatingResult');if(resultEl)resultEl.classList.toggle('negative',operatingResult<0);
  setText('analysisOccupancy',`${analysis.occupancy.toFixed(0)}%`);setText('analysisHours',dashFormatHours(analysis.bookingHours));setText('analysisTicket',money(analysis.ticket));setText('analysisIncomeHour',money(analysis.incomeHour));

  const perf=document.getElementById('homePerformance'),perfSub=document.getElementById('homePerformanceSubtitle');
  if(homeReservationFilter==='internal'){
    const usage=[['Actividad propia','activity'],['Cortesías','courtesy'],['Mantenimiento / bloqueo','maintenance']].map(([name,key])=>{const a=rows.filter(r=>isInternalReservation(r)&&(r.internalUseType||'activity')===key&&dashBlocksResource(r));return {name,hours:a.reduce((sum,r)=>sum+dashDurationHours(r)*reservationResources(r).length,0),count:a.length}}),totalUse=usage.reduce((sum,x)=>sum+x.hours,0),maxUse=Math.max(1,...usage.map(x=>x.hours));if(perfSub)perfSub.textContent='Uso interno por tipo';if(perf)perf.innerHTML=usage.map(x=>`<div class="dashboard-row"><div class="dashboard-row-top"><div class="dashboard-row-main"><b>${escapeHtml(x.name)}</b><span>${x.count} registro${x.count===1?'':'s'}</span></div><div class="dashboard-row-value"><b>${dashFormatHours(x.hours)}</b><span>${totalUse?Math.round(x.hours/totalUse*100):0}% uso</span></div></div><div class="dashboard-progress"><i style="width:${x.hours/maxUse*100}%"></i></div></div>`).join('')
  }else{
    const products=dashboardSalesProducts(rows),maxProduct=Math.max(1,...products.map(x=>x.revenue));if(perfSub)perfSub.textContent='Ventas por producto';if(perf)perf.innerHTML=products.map(x=>`<button class="dashboard-row dashboard-product-row" onclick="openDashboardDetail('sales')"><div class="dashboard-row-top"><div class="dashboard-row-main"><b>${escapeHtml(x.name)}</b><span>${x.count} reserva${x.count===1?'':'s'} · ${dashFormatHours(x.hours)}</span></div><div class="dashboard-row-value"><b>${money(x.revenue)}</b><span>${sold?Math.round(x.revenue/sold*100):0}% ventas</span></div></div><div class="dashboard-progress"><i style="width:${x.revenue/maxProduct*100}%"></i></div></button>`).join('')
  }

  const totalDays=dashRangeDays(range.start,range.end),bucketCount=Math.min(7,totalDays),bucketSize=Math.ceil(totalDays/bucketCount),trend=[],internalTrend=homeReservationFilter==='internal';for(let i=0;i<bucketCount;i++){const a=dashAddDays(parseDashDate(range.start),i*bucketSize);if(a>parseDashDate(range.end))break;const b=new Date(Math.min(dashAddDays(a,bucketSize-1).getTime(),parseDashDate(range.end).getTime())),as=dashDateValue(a),bs=dashDateValue(b),bucket=rows.filter(r=>r.eventDate>=as&&r.eventDate<=bs),val=internalTrend?bucket.filter(r=>isInternalReservation(r)&&dashBlocksResource(r)).reduce((sum,r)=>sum+dashDurationHours(r)*reservationResources(r).length,0):bucket.filter(dashSaleActive).reduce((sum,r)=>sum+Number(r.total||0),0),label=totalDays<=7?dashWeekdayShort(as):a.toLocaleDateString('es-PE',{day:'numeric',month:'short'}).replace('.','');trend.push({label,val})}
  const maxTrend=Math.max(1,...trend.map(x=>x.val)),trendHost=document.getElementById('homeTrend');if(trendHost)trendHost.innerHTML=trend.some(x=>x.val>0)?trend.map(x=>`<div class="trend-col" title="${escapeHtml(x.label)} · ${internalTrend?dashFormatHours(x.val):money(x.val)}"><div class="trend-bar-wrap"><div class="trend-bar" style="height:${Math.max(4,x.val/maxTrend*100)}%"></div></div><div class="trend-label">${escapeHtml(x.label)}</div></div>`).join(''):`<div class="trend-empty">${internalTrend?'Sin uso interno registrado en este período.':'Sin ventas registradas en este período.'}</div>`;setText('homeTrendSubtitle',internalTrend?`${dashFormatHours(trend.reduce((sum,x)=>sum+x.val,0))} de uso interno · ${range.label}`:`${money(sold)} vendidos · ${range.label}`);

  const upcoming=reservations.filter(r=>r.status!=='cancelled'&&r.eventDate>=localDateValue()&&matchesHomeReservationFilter(r)).sort((a,b)=>(a.eventDate+a.startTime).localeCompare(b.eventDate+b.startTime)).slice(0,3),resHost=document.getElementById('homeReservations'),emptyText=homeReservationFilter==='exclusive'?'No hay próximos eventos.':(homeReservationFilter==='court'?'No hay próximas reservas de cancha.':(homeReservationFilter==='internal'?'No hay actividades internas próximas.':'No hay próximas ocupaciones.'));if(resHost)resHost.innerHTML=upcoming.length?upcoming.map(r=>{const name=reservationDisplayName(r),kind=homeKindOf(r),meta=kind==='internal'?internalUseTypeLabel(r.internalUseType):(kind==='exclusive'?r.eventType:(r.courtType||r.space||'Cancha'));return `<div class="card lead reservation-card"><div class="initials">${initials(name)}</div><div class="lead-main"><div class="lead-name">${escapeHtml(name)}</div><div class="lead-meta">${escapeHtml(meta)} · ${fmtScheduled(r.eventDate,r.startTime)}</div></div><button class="btn primary-small" onclick="openReservationDetail('${r.id}')">Ver</button></div>`}).join(''):`<div class="card empty">${emptyText}</div>`;
  const arr=followups.filter(f=>f.status==='pending').slice(0,3),followHost=document.getElementById('homeFollowups');if(followHost)followHost.innerHTML=arr.length?arr.map(f=>{const c=clientById(f.clientId)||{name:'Cliente'};return `<div class="card lead"><div class="initials">${initials(c.name)}</div><div class="lead-main"><div class="lead-name">${escapeHtml(c.name)}</div><div class="lead-meta">${escapeHtml(f.note)}</div><div class="created">${fmtScheduled(f.scheduledDate,f.scheduledTime)}</div></div><button class="btn primary-small" onclick="openFollowDetail('${f.id}')">Ver</button></div>`}).join(''):'<div class="card empty">No tienes seguimientos pendientes.</div>';
  renderDashboardAnalysis(range,rows,analysis)
}
function renderDashboardAnalysis(range,rows,analysis=dashboardAnalysisData(range,rows)){
  const setText=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v};setText('analysisRangeLabel',range.label);setText('analysisFullOccupancy',`${analysis.occupancy.toFixed(0)}%`);setText('analysisFullHours',dashFormatHours(analysis.bookingHours));setText('analysisFullTicket',money(analysis.ticket));setText('analysisFullIncomeHour',money(analysis.incomeHour));
  const mixHost=document.getElementById('analysisOccupancyMix');if(mixHost){const items=[['Comercial',analysis.mix.commercial],['Actividad propia',analysis.mix.activity],['Cortes\u00edas',analysis.mix.courtesy],['Mantenimiento / bloqueo',analysis.mix.maintenance]];mixHost.innerHTML=items.map(([name,h])=>{const pct=analysis.capacity?Math.min(100,h/analysis.capacity*100):0;return `<div class="dashboard-row"><div class="dashboard-row-top"><div class="dashboard-row-main"><b>${name}</b><span>${dashFormatHours(h)} cancha-hora</span></div><div class="dashboard-row-value"><b>${pct.toFixed(0)}%</b></div></div><div class="dashboard-progress dark"><i style="width:${pct}%"></i></div></div>`}).join('')}
  const courtUsage=businessResources().map(resource=>resource.key).map(c=>{const h=analysis.blocking.reduce((s,r)=>s+(reservationResources(r).includes(c)?dashDurationHours(r):0),0);return {court:businessResourceName(c),hours:h,pct:businessHours(range,businessResources().find(r=>r.key===c))?Math.min(100,h/businessHours(range,businessResources().find(r=>r.key===c))*100):0}}),usage=document.getElementById('analysisCourtUsage');if(usage)usage.innerHTML=courtUsage.map(x=>`<div class="dashboard-row"><div class="dashboard-row-top"><div class="dashboard-row-main"><b>${escapeHtml(x.court)}</b><span>${dashFormatHours(x.hours)} ocupadas</span></div><div class="dashboard-row-value"><b>${x.pct.toFixed(0)}%</b></div></div><div class="dashboard-progress dark"><i style="width:${x.pct}%"></i></div></div>`).join('');
  const occurrenceHour=operationalBucketOccurrences(range),buckets={};analysis.blocking.forEach(r=>{const day=parseDashDate(r.eventDate).getDay(),dur=dashDurationHours(r),resCount=reservationResources(r).length,start=timeToMinutes(r.startTime),end=start+dur*60,bounds=operatingBoundsForDate(r.eventDate);if(!bounds)return;for(let h=Math.floor(bounds.open/60);h<Math.ceil(bounds.close/60);h++){const a=h*60,b=(h+1)*60,overlap=Math.max(0,Math.min(end,b,bounds.close)-Math.max(start,a,bounds.open))/60;if(!overlap)continue;const key=`${day}-${h%24}`;buckets[key]=(buckets[key]||0)+overlap*resCount}});const dayNames=['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'],peaks=settings.businessCatalog?businessPeaks(range,rows).slice(0,5):Object.entries(buckets).map(([k,v])=>{const [day,h]=k.split('-').map(Number),cap=Math.max(1,(occurrenceHour[k]||1)*3);return {label:`${dayNames[day]} ${String(h).padStart(2,'0')}:00-${String((h+1)%24).padStart(2,'0')}:00`,pct:Math.min(100,v/cap*100)}}).sort((a,b)=>b.pct-a.pct).slice(0,5),peakHost=document.getElementById('analysisPeakHours');if(peakHost)peakHost.innerHTML=peaks.length?peaks.map((x,i)=>`<div class="dashboard-row"><div class="dashboard-row-top"><div class="dashboard-rank">${i+1}</div><div class="dashboard-row-main"><b>${x.label}</b><span>Uso de los espacios configurados</span></div><div class="dashboard-row-value"><b>${x.pct.toFixed(0)}%</b></div></div><div class="dashboard-progress"><i style="width:${x.pct}%"></i></div></div>`).join(''):'<div class="card empty">Aún no hay suficiente actividad.</div>';
  const clientMap={};rows.filter(dashSaleActive).forEach(r=>{const id=String(r.clientId),c=clientById(r.clientId)||{name:'Cliente'};if(!clientMap[id])clientMap[id]={id,name:c.name,revenue:0,hours:0,count:0};clientMap[id].revenue+=Number(r.total||0);clientMap[id].hours+=dashDurationHours(r);clientMap[id].count++});const tops=Object.values(clientMap).sort((a,b)=>b.revenue-a.revenue).slice(0,5),topHost=document.getElementById('analysisTopClients');if(topHost)topHost.innerHTML=tops.length?tops.map((x,i)=>`<button class="dashboard-row" onclick="closeSheet('dashboardAnalysisSheet');openClientProfile('${x.id}')"><div class="dashboard-row-top"><div class="dashboard-rank">${i+1}</div><div class="dashboard-row-main"><b>${escapeHtml(x.name)}</b><span>${x.count} reserva${x.count===1?'':'s'} · ${dashFormatHours(x.hours)}</span></div><div class="dashboard-row-value"><b>${money(x.revenue)}</b></div></div></button>`).join(''):'<div class="card empty">Aún no hay clientes con ventas.</div>';
  const statuses=[['Realizadas',rows.filter(r=>r.status==='completed').length],['Canceladas',rows.filter(r=>r.status==='cancelled').length],['No asistió',rows.filter(r=>r.status==='no_show').length],['Reprogramadas',rows.filter(r=>r.status==='rescheduled').length]],statusHost=document.getElementById('analysisStatusGrid');if(statusHost)statusHost.innerHTML=statuses.map(([n,v])=>`<div class="dashboard-status"><b>${v}</b><span>${n}</span></div>`).join('');const refunded=rows.reduce((s,r)=>s+Number(r.refundedAmount||0),0),credited=rows.reduce((s,r)=>s+Number(r.creditAmount||0),0),retained=rows.reduce((s,r)=>s+Number(r.retainedAmount||0),0),financeHost=document.getElementById('analysisFinanceGrid');if(financeHost)financeHost.innerHTML=`<div class="dashboard-finance"><span>Devuelto</span><b>${money(refunded)}</b></div><div class="dashboard-finance"><span>Saldo a favor</span><b>${money(credited)}</b></div><div class="dashboard-finance"><span>Retenido</span><b>${money(retained)}</b></div>`
}
function openDashboardAnalysis(){const range=homeDateRange(),rows=dashRangeReservations(range);renderDashboardAnalysis(range,rows);openSheet('dashboardAnalysisSheet')}

function canViewPaymentBilling(){return hasPermission('issue_billing')||hasPermission('view_reports')}
function allowedPendingTab(tab){return ['receivable','paid','all_operations','unapplied','refunds','cancelled_funds'].includes(tab)||(['to_invoice','invoiced'].includes(tab)&&canViewPaymentBilling())?tab:'receivable'}
function openPending(tab='receivable'){tab=allowedPendingTab(tab);pendingTab=tab;pendingSort=pendingDefaultSort(tab);go('pending')}
function pendingDefaultSort(tab){return tab==='receivable'?'priority':(tab==='to_invoice'?'oldest':'recent')}
function setPendingTab(tab){tab=allowedPendingTab(tab);pendingTab=tab;pendingSort=pendingDefaultSort(tab);renderPendingView()}
function setPendingSort(value){pendingSort=value;renderPendingView(false)}
function pendingSortChoices(tab){
  if(tab==='receivable')return [['priority','Más atrasados'],['amount_desc','Monto mayor'],['amount_asc','Monto menor'],['az','Cliente A–Z'],['za','Cliente Z–A']];
  if(tab==='to_invoice')return [['oldest','Más antiguos'],['recent','Más recientes'],['amount_desc','Monto mayor'],['amount_asc','Monto menor'],['az','Cliente A–Z']];
  return [['recent','Más recientes'],['oldest','Más antiguos'],['amount_desc','Monto mayor'],['amount_asc','Monto menor'],['az','Cliente A–Z'],['za','Cliente Z–A']]
}
function pendingPaymentRows(){return movements.filter(m=>m.type==='payment'&&Number(m.amount||0)>0)}
function paymentClient(m){return clientById(m.clientId)||{name:'Cliente'}}
function paymentDateValue(m){return m.date||String(m.occurredAt||m.createdAt||'').slice(0,10)||''}
function paymentReservationSummary(m){const apps=paymentApplications(m),codes=[...new Set(apps.map(a=>reservationById(a.reservationId)?.code).filter(Boolean))];if(codes.length===1)return codes[0];if(codes.length>1)return `${codes.length} reservas`;if(paymentUnappliedAmount(m)>0.001)return 'Saldo sin aplicar';return m.code||'Cobro'}
function paymentIsInvoiced(m){return !!m&&(!!m.billingDocumentId||['invoiced','issued','issued_local','accepted'].includes(m.billingStatus))}
function paymentBillingStatusLabel(m){if(!paymentIsInvoiced(m))return 'Comprobante pendiente';if(m.billingProviderStatus==='accepted')return 'Aceptado por SUNAT';if(m.billingProviderStatus==='rejected')return 'Rechazado';if(m.billingStatus==='invoiced')return 'Emitido histórico';if(m.billingProviderStatus==='submitted')return 'Enviado · pendiente de aceptación';return 'Preparado · pendiente de envío'}
function paymentCollectionLabel(m){
  if(paymentUnappliedAmount(m)>0.001)return 'Pago con saldo sin aplicar';
  if(m.paymentStage==='Saldo')return 'Pago de saldo';
  const apps=paymentApplications(m);
  if(!apps.length)return 'Pago recibido';
  if(apps.some(a=>Number(a.amount||0)<Number(reservationById(a.reservationId)?.total||0)-0.001))return 'Abono parcial';
  return apps.length>1?'Pago de varias reservas':'Pago completo';
}
function paymentReservationBalances(m){
  return paymentApplications(m).map(a=>reservationById(a.reservationId)).filter(Boolean).map(r=>
    `<span class="payment-balance-line">${escapeHtml(r.code||'Reserva')} · Total ${money(r.total)} · Abonado ${money(r.advance||0)} · Por cobrar ${money(r.balance||0)}</span>`
  ).join('');
}
function pendingReceivableGroups(){
  const rows=reservations.filter(r=>!isInternalReservation(r)&&!['cancelled','no_show'].includes(r.status)&&Number(r.balance||0)>0),groups=receivableClientGroups(rows);
  return groups.map(g=>{const dues=g.rows.map(reservationDueDate).filter(Boolean).sort();return {...g,oldestDue:dues[0]||'9999-12-31',overdueCount:g.rows.filter(r=>receivableStatus(r)==='overdue').length}})
}
function sortPendingClientGroups(groups){const coll=new Intl.Collator('es',{sensitivity:'base'});return [...groups].sort((a,b)=>{
  if(pendingSort==='amount_desc')return b.total-a.total;if(pendingSort==='amount_asc')return a.total-b.total;if(pendingSort==='az')return coll.compare(a.name,b.name);if(pendingSort==='za')return coll.compare(b.name,a.name);
  const ao=a.overdueCount>0,bo=b.overdueCount>0;if(ao!==bo)return ao?-1:1;return String(a.oldestDue).localeCompare(String(b.oldestDue))||b.total-a.total
})}
function sortPendingPayments(rows){const coll=new Intl.Collator('es',{sensitivity:'base'});return [...rows].sort((a,b)=>{const an=paymentClient(a).name,bn=paymentClient(b).name;if(pendingSort==='amount_desc')return Number(b.amount||0)-Number(a.amount||0);if(pendingSort==='amount_asc')return Number(a.amount||0)-Number(b.amount||0);if(pendingSort==='az')return coll.compare(an,bn);if(pendingSort==='za')return coll.compare(bn,an);const ad=pendingTab==='invoiced'?(a.billingDate||paymentDateValue(a)):paymentDateValue(a),bd=pendingTab==='invoiced'?(b.billingDate||paymentDateValue(b)):paymentDateValue(b),cmp=String(ad).localeCompare(String(bd));return pendingSort==='oldest'?cmp:-cmp})}
function updatePendingTabs(counts){
  const defs=[['pendingTabReceivable','Con saldo pendiente',counts.receivable],['pendingTabPaid','Pagadas',counts.paid],['pendingTabRefunds','Reembolsos',counts.refunds],['pendingTabCancelledFunds','Cancelaciones',reservations.filter(r=>['cancelled','no_show'].includes(r.status)&&Number(r.advance)>0).length],['pendingTabOperations','Todas las operaciones',counts.all_operations],['pendingTabUnapplied','Dinero sin aplicar',counts.unapplied],['pendingTabToInvoice','Pendientes de comprobante',counts.to_invoice],['pendingTabInvoiced','Preparados / emitidos',counts.invoiced]];
  defs.forEach(([id,label,count])=>{const el=document.getElementById(id);if(!el)return;el.textContent=`${label} ${count??0}`;el.classList.toggle('active',id===({receivable:'pendingTabReceivable',paid:'pendingTabPaid',all_operations:'pendingTabOperations',unapplied:'pendingTabUnapplied',refunds:'pendingTabRefunds',cancelled_funds:'pendingTabCancelledFunds',to_invoice:'pendingTabToInvoice',invoiced:'pendingTabInvoiced'})[pendingTab])})
}
function renderPendingView(resetSortControl=true){
  const host=document.getElementById('pendingList'),summary=document.getElementById('pendingSummary'),sort=document.getElementById('pendingSort');if(!host||!summary||!sort)return;
  pendingTab=allowedPendingTab(pendingTab);
  const billingVisible=canViewPaymentBilling();document.getElementById('pendingBillingTabs').hidden=!billingVisible;
  document.getElementById('pendingViewTitle').textContent=billingVisible?'Cobranza y comprobantes':'Cobranza';
  document.getElementById('pendingContext').textContent=({refunds:'Devoluciones registradas y solicitudes pendientes de aprobar, asociadas a su cuenta de origen.',receivable:'Cada operación muestra su total, los abonos acumulados y cuánto falta pagar.',paid:'Operaciones sin saldo por cobrar. Su historial y sus comprobantes permanecen disponibles.',all_operations:'Consulta cada reserva o alquiler con todos sus abonos y comprobantes asociados.',unapplied:'Dinero recibido que todavía no se ha asignado a una operación. No reduce su deuda hasta aplicarlo.',to_invoice:'Operaciones con abonos pendientes de comprobante. Cada documento corresponde al pago recibido.',invoiced:'Operaciones con comprobantes preparados o emitidos. El pago completo y el estado tributario se controlan por separado.'})[pendingTab];
  const groupsAll=pendingReceivableGroups(),paymentsAll=pendingPaymentRows(),toInvoiceAll=paymentsAll.filter(m=>!paymentIsInvoiced(m)),invoicedAll=paymentsAll.filter(paymentIsInvoiced);
  const flowItems=[['Saldo por cobrar',money(groupsAll.reduce((sum,g)=>sum+g.total,0))],['Dinero recibido',money(paymentsAll.reduce((sum,m)=>sum+Number(m.amount),0))]];
  const refundedTotal=reservations.reduce((sum,r)=>sum+Number(r.refundedAmount||0),0);if(refundedTotal>0)flowItems.push(['Reembolsado',money(refundedTotal)],['Recibido neto de reembolsos',money(paymentsAll.reduce((sum,m)=>sum+Number(m.amount),0)-refundedTotal)]);
  if(billingVisible)flowItems.push(['Sin comprobante preparado',money(toInvoiceAll.reduce((sum,m)=>sum+Number(m.amount),0))],['Con comprobante preparado',money(invoicedAll.reduce((sum,m)=>sum+Number(m.amount),0))]);
  document.getElementById('pendingFlowSummary').innerHTML=flowItems.map(([label,value])=>`<div><span>${escapeHtml(label)}</span><b>${escapeHtml(value)}</b></div>`).join('');
  updatePendingTabs({receivable:groupsAll.length,paid:paymentsAll.length,to_invoice:toInvoiceAll.length,invoiced:invoicedAll.length});
  const choices=pendingSortChoices(pendingTab);if(!choices.some(x=>x[0]===pendingSort))pendingSort=pendingDefaultSort(pendingTab);sort.innerHTML=choices.map(([v,l])=>`<option value="${v}">${l}</option>`).join('');sort.value=pendingSort;
  if(window.ElevaCollectionOperations){updatePendingTabs(window.ElevaCollectionOperations.counts());window.ElevaCollectionOperations.render(pendingTab,pendingSort);return;}
  if(pendingTab==='receivable'){
    const groups=sortPendingClientGroups(groupsAll),total=groups.reduce((s,g)=>s+g.total,0),reservationCount=groups.reduce((s,g)=>s+g.count,0);summary.innerHTML=`<b>${money(total)}</b> · ${groups.length} cliente${groups.length===1?'':'s'} · ${reservationCount} reserva${reservationCount===1?'':'s'}`;
    host.innerHTML=`<div class="pending-table"><div class="pending-head"><span>Cliente</span><span>Pendiente</span><span></span></div>${groups.length?groups.map(g=>`<button class="pending-row" onclick="openPendingReceivableClient('${String(g.clientId)}')"><div class="pending-main"><b>${escapeHtml(g.name)}</b><span>${g.count} reserva${g.count===1?'':'s'}${g.overdue>0?` · <span class=\"pending-overdue\">${money(g.overdue)} vencido</span>`:''}${g.unapplied>0.001?` · ${money(g.unapplied)} sin aplicar`:''}</span></div><div class="pending-value"><b>${money(g.total)}</b><span>${g.overdueCount?`${g.overdueCount} vencida${g.overdueCount===1?'':'s'}`:'Al día'}</span></div><div class="pending-arrow">›</div></button>`).join(''):`<div class="pending-empty">No hay saldos pendientes.</div>`}</div>`;return
  }
  let rows=pendingTab==='paid'?paymentsAll:(pendingTab==='to_invoice'?toInvoiceAll:invoicedAll);rows=sortPendingPayments(rows);const total=rows.reduce((s,m)=>s+Number(m.amount||0),0);summary.innerHTML=`<b>${money(total)}</b> · ${rows.length} registro${rows.length===1?'':'s'}`;
  const title=pendingTab==='paid'?'Recibido':(pendingTab==='to_invoice'?'Pago a documentar':'Documentado');
  host.innerHTML=`<div class="pending-table"><div class="pending-head"><span>Cliente</span><span>${title}</span><span></span></div>${rows.length?rows.map(m=>{const c=paymentClient(m),apps=paymentApplications(m),date=paymentDateValue(m),meta=`${m.code||'Cobro'} · ${fmtScheduled(date,'')} · ${m.method||'Sin método'} · ${paymentReservationSummary(m)}`;if(pendingTab==='to_invoice')return `<button class="pending-row" onclick="openBillingSheet('${String(m.id)}')"><div class="pending-main"><b>${escapeHtml(c.name)}</b><span>${escapeHtml(meta)}</span><span class="payment-kind">${escapeHtml(paymentCollectionLabel(m))} · Comprobante pendiente</span>${paymentReservationBalances(m)}</div><div class="pending-value"><b>${money(m.amount)}</b><span>${hasPermission('issue_billing')?'Preparar':'Ver detalle'}</span></div><div class="pending-arrow">›</div></button>`;if(pendingTab==='invoiced')return `<button class="pending-row" onclick="openBillingSheet('${String(m.id)}')"><div class="pending-main"><b>${escapeHtml(c.name)}</b><span>${escapeHtml(meta)}</span><span class="payment-kind">${escapeHtml(paymentBillingStatusLabel(m))}</span>${paymentReservationBalances(m)}</div><div class="pending-value"><b>${money(m.amount)}</b><span class="pending-invoice-badge">${escapeHtml((m.billingType||'Comprobante')+' '+(m.billingNumber||''))}</span></div><div class="pending-arrow">›</div></button>`;return `<div class="pending-row"><div class="pending-main"><b>${escapeHtml(c.name)}</b><span>${escapeHtml(meta)}</span><span class="payment-kind">${escapeHtml(paymentCollectionLabel(m))}${canViewPaymentBilling()?' · '+escapeHtml(paymentIsInvoiced(m)?paymentBillingStatusLabel(m):'Comprobante pendiente'):''}</span>${paymentReservationBalances(m)}</div><div class="pending-value"><b>${money(m.amount)}</b><span>${paymentUnappliedAmount(m)>0.001?`Sin aplicar ${money(paymentUnappliedAmount(m))}`:(apps.length>1?apps.length+' reservas':(m.paymentStage||'Cobro'))}</span></div><div class="pending-arrow"></div></div>`}).join(''):`<div class="pending-empty">No hay registros en esta vista.</div>`}</div>`
}
function openPendingReceivableClient(clientId){
  receivableReturnMode='pending';receivableDashboardFilter='all';receivableDashboardRange=homeDateRange();const c=clientById(clientId);if(!c)return;document.getElementById('dashboardDetailRange').textContent='Saldo pendiente actual';document.getElementById('dashboardDetailTitle').textContent=c.name;openReceivableClient(clientId);openSheet('dashboardDetailSheet')
}
function billingRecipientOptions(m){
  const c=paymentClient(m),type=document.getElementById('billingType')?.value||m.billingType||'Boleta',profiles=clientBillingProfiles(c),out=[];
  if(type==='Boleta'){
    if(Number(m.amount||0)<=700)out.push({id:'consumer',label:'Consumidor final',meta:'Sin identificación específica'});
    profiles.filter(p=>p.kind!=='company').forEach(p=>out.push({id:String(p.id),label:p.name,meta:billingProfileMeta(p)}));
  }else profiles.filter(p=>p.kind==='company'&&p.docType==='RUC'&&/^\d{11}$/.test(String(p.docNumber||''))).forEach(p=>out.push({id:String(p.id),label:p.name,meta:billingProfileMeta(p)}));
  return out
}
function renderBillingRecipientOptions(){
  const m=movements.find(x=>String(x.id)===String(billingPaymentId)&&x.type==='payment');if(!m)return;const select=document.getElementById('billingRecipient'),opts=billingRecipientOptions(m),current=m.billingRecipientProfileId||'';select.innerHTML=opts.length?opts.map(o=>`<option value="${escapeHtml(o.id)}">${escapeHtml(o.label)} · ${escapeHtml(o.meta)}</option>`).join(''):'<option value="">Sin receptor válido</option>';if(opts.some(o=>o.id===current))select.value=current;document.getElementById('billingRecipientHint').textContent=opts.length?(document.getElementById('billingType').value==='Factura'?'La factura requiere un perfil de empresa con RUC válido.':'Puedes usar consumidor final cuando corresponda o un perfil identificado.'):'Agrega datos de facturación compatibles para poder emitir este comprobante.';updateBillingIssuePreview()
}
function updateBillingIssuePreview(){
  const m=movements.find(x=>String(x.id)===String(billingPaymentId)&&x.type==='payment'),host=document.getElementById('billingIssuePreview');if(!m||!host)return;const type=document.getElementById('billingType').value,recipient=document.getElementById('billingRecipient').value,breakdown=billingBreakdownForPayment(m),number=nextBillingNumber(type),c=paymentClient(m),profile=recipient&&recipient!=='consumer'?clientBillingProfiles(c).find(p=>String(p.id)===String(recipient)):null,receiver=recipient==='consumer'?'Consumidor final':(profile?.name||'Sin receptor');host.innerHTML=`<div class="billing-issue-grid"><div><span>Serie / correlativo</span><b>${escapeHtml(number)}</b></div><div><span>Receptor</span><b>${escapeHtml(receiver)}</b></div><div><span>Valor venta</span><b>${money(breakdown.base)}</b></div><div><span>IGV ${breakdown.rate}%</span><b>${money(breakdown.tax)}</b></div><div class="billing-issue-total"><span>Total comprobante</span><b>${money(breakdown.total)}</b></div></div>`;document.getElementById('billingIssueBtn').disabled=!recipient||!hasPermission('issue_billing')
}
function openBillingSheet(paymentId){
  if(!canViewPaymentBilling()){showToast('La gestión de comprobantes corresponde a los perfiles de administración o finanzas');return}
  const m=movements.find(x=>String(x.id)===String(paymentId)&&x.type==='payment');if(!m)return;billingPaymentId=m.id;const c=paymentClient(m),apps=paymentApplications(m),issued=paymentIsInvoiced(m);document.getElementById('billingSheetTitle').textContent=issued?'Comprobante del pago':'Preparar comprobante del pago';document.getElementById('billingPaymentSummary').innerHTML=`<span>${escapeHtml(c.name)}</span><b>${money(m.amount)}</b><small>${escapeHtml(paymentCollectionLabel(m))} · ${escapeHtml(m.code||'Cobro')} · ${apps.length} reserva${apps.length===1?'':'s'} · ${escapeHtml(m.method||'Sin método')} · ${fmtScheduled(paymentDateValue(m),'')}</small>${paymentReservationBalances(m)}`;
  const status=document.getElementById('billingIssuedStatus'),form=document.getElementById('billingIssueForm');status.classList.toggle('hidden',!issued);form.classList.toggle('hidden',issued);document.getElementById('billingIssueBtn').disabled=!hasPermission('issue_billing');
  if(issued){const r=m.billingRecipientSnapshot||{};status.className='billing-status-card'+(m.billingProviderStatus==='rejected'?' warn':'');status.innerHTML=`<span>${escapeHtml(paymentBillingStatusLabel(m))}</span><b>${escapeHtml((m.billingType||'Comprobante')+' '+(m.billingNumber||''))}</b><small>${escapeHtml(r.name||c.name)}${r.docNumber?` · ${escapeHtml(r.docType||'Doc')} ${escapeHtml(r.docNumber)}`:''}<br>Emitido ${fmtScheduled(m.billingDate||paymentDateValue(m),'')} · Total ${money(m.billingTotal??m.amount)}${m.billingProviderStatus==='prepared_local'?'<br><b>Modo local:</b> falta envío y validación real del proveedor electrónico.':''}</small>`;openSheet('billingSheet');return}
  status.className='billing-status-card hidden';document.getElementById('billingType').value=m.billingType||'Boleta';document.getElementById('billingDate').value=m.billingDate||localDateValue();document.getElementById('billingNote').value=m.billingNote||'';renderBillingRecipientOptions();openSheet('billingSheet')
}
function issueBillingRecord(){if(!requirePermission('issue_billing'))return;
  const m=movements.find(x=>String(x.id)===String(billingPaymentId)&&x.type==='payment');if(!m||paymentIsInvoiced(m))return;const type=document.getElementById('billingType').value,recipientId=document.getElementById('billingRecipient').value,c=paymentClient(m);if(!recipientId){showToast('Selecciona o agrega un receptor válido');return}let snapshot;if(recipientId==='consumer'){if(Number(m.amount||0)>700){showToast('Este monto requiere identificar al receptor de la boleta');return}snapshot={id:'consumer',kind:'person',name:'Consumidor final',docType:'',docNumber:''}}else{const p=clientBillingProfiles(c).find(x=>String(x.id)===String(recipientId));if(!p){showToast('No encontramos el perfil tributario');return}if(type==='Factura'&&(p.kind!=='company'||p.docType!=='RUC'||!/^\d{11}$/.test(String(p.docNumber||'')))){showToast('La factura requiere empresa con RUC válido');return}snapshot={id:p.id,kind:p.kind,name:p.name,docType:p.docType,docNumber:p.docNumber,email:p.email||'',address:p.address||''}}
  const breakdown=billingBreakdownForPayment(m);m.billingStatus='issued_local';m.billingProviderStatus='prepared_local';m.billingType=type;m.billingNumber=nextBillingNumber(type);m.billingDate=document.getElementById('billingDate').value||localDateValue();m.billingNote=document.getElementById('billingNote').value.trim();m.billingRecipientProfileId=recipientId;m.billingRecipientSnapshot=snapshot;m.billingBase=Number(breakdown.base.toFixed(2));m.billingTax=Number(breakdown.tax.toFixed(2));m.billingTaxRate=breakdown.rate;m.billingTotal=Number(breakdown.total.toFixed(2));m.billingAt=nowISO();addAuditEvent('billing',m.id,m.billingNumber,'Comprobante preparado',[],`${type} · ${snapshot.name} · ${money(m.billingTotal)} · ${paymentBillingStatusLabel(m)}`);persist();closeSheet('billingSheet');if(document.getElementById('view-pending')?.classList.contains('active'))renderPendingView();showToast('Comprobante preparado para emisión electrónica')
}


/* v52: Reportes */
function reportMonthRange(){const d=new Date(),start=new Date(d.getFullYear(),d.getMonth(),1),end=new Date(d.getFullYear(),d.getMonth()+1,0);return [localDateValue(start),localDateValue(end)]}
function ensureReportRange(){const a=document.getElementById('reportStart'),b=document.getElementById('reportEnd');if(!a||!b)return;if(!reportInitialized){const [x,y]=reportMonthRange();a.value=x;b.value=y;reportInitialized=true}}
function resetReportRange(){const [a,b]=reportMonthRange();document.getElementById('reportStart').value=a;document.getElementById('reportEnd').value=b;renderReports()}
function setReportTab(tab){reportTab=tab;document.querySelectorAll('[data-report-tab]').forEach(x=>x.classList.toggle('active',x.dataset.reportTab===tab));const ex=document.getElementById('reportExtraFilter');if(ex)ex.dataset.forTab='';renderReports()}
function reportInRange(date){const a=document.getElementById('reportStart')?.value||'',b=document.getElementById('reportEnd')?.value||'';if(!date)return false;return (!a||date>=a)&&(!b||date<=b)}
function reportFmtDate(date){if(!date)return '—';return fmtScheduled(date,'').replace('Sin fecha','—')}
function reportSearchMatch(values){const q=(document.getElementById('reportSearch')?.value||'').trim().toLowerCase();return !q||values.join(' ').toLowerCase().includes(q)}
function reportFilterValue(){return document.getElementById('reportExtraFilter')?.value||'all'}
function setReportExtraOptions(options){const el=document.getElementById('reportExtraFilter');if(!el)return;const key=reportTab+':'+options.map(x=>x[0]).join('|');if(el.dataset.forTab!==key){const prev=el.value;el.innerHTML=options.map(([v,l])=>`<option value="${escapeHtml(v)}">${escapeHtml(l)}</option>`).join('');el.value=options.some(x=>x[0]===prev)?prev:'all';el.dataset.forTab=key}}
function reportBillingForReservation(r){const pays=movements.filter(m=>m.type==='payment'&&paymentTouchesReservation(m,r.id));if(!pays.length)return 'Sin cobro';const invoiced=pays.filter(paymentIsInvoiced);if(invoiced.length===pays.length)return [...new Set(invoiced.map(m=>m.billingType||'Comprobante'))].join(' / ');if(invoiced.length)return 'Parcial';return 'Por emitir'}
function reportSupportLabel(m){const s=m.supportStatus||'supported';return s==='pending'?'Por sustentar':(s==='observed'?'Observado':(s==='returned'?'Regularizado':'Sustentado'))}
function reportPaymentRows(){return buildCashRecordsRaw().filter(m=>['payment','payment_legacy'].includes(m.type)&&Number(m.amount||0)>0)}
function reportDataset(){
  ensureExpenseMasters();ensureTreasuryAccounts();
  let extra=reportFilterValue();
  if(reportTab==='sales'){
    setReportExtraOptions([['all','Todos los servicios'],['FUT 6','FUT 6'],['FUT 9','FUT 9'],['Eventos','Eventos']]);extra=reportFilterValue();
    let rows=reservations.filter(dashSaleActive).filter(r=>reportInRange(r.eventDate));
    if(extra!=='all')rows=rows.filter(r=>dashProductName(r)===extra);
    rows=rows.filter(r=>{const c=clientById(r.clientId)||{name:'Cliente'};return reportSearchMatch([c.name,r.code,dashProductName(r),r.space||'',reservationStatusLabel(r)])}).sort((a,b)=>(a.eventDate+a.startTime).localeCompare(b.eventDate+b.startTime));
    const total=rows.reduce((s,r)=>s+Number(r.total||0),0),paid=rows.reduce((s,r)=>s+Number(r.advance||0),0),hours=rows.reduce((s,r)=>s+dashDurationHours(r),0);
    return {title:'Reporte de ventas',note:'El período usa la fecha del servicio. Base e IGV provienen del snapshot guardado en cada reserva; los registros históricos sin IGV configurado se mantienen tal como fueron creados.',summary:[['Ventas',money(total)],['Reservas',rows.length],['Horas',dashFormatHours(hours)],['Cobrado',money(paid)]],columns:['Fecha','Cliente','Reserva','Servicio','Cant.','Horas','Precio','Base','IGV','Total','Cobrado','Pendiente','Estado','Comprobante'],rows:rows.map(r=>{const c=clientById(r.clientId)||{name:'Cliente'},service=dashProductName(r),qty=service==='FUT 6'?Number(r.courtQty||1):1,price=service==='Eventos'?Number(r.baseTotal!==undefined?r.baseTotal:(r.total||0)):Number(r.courtRate||0),base=Number(r.baseTotal!==undefined?r.baseTotal:Math.max(0,Number(r.total||0)-Number(r.taxAmount||0)-Number(r.nonTaxableExtra||0)));return {cells:[reportFmtDate(r.eventDate),c.name,r.code,service,qty,Number(r.hours||dashDurationHours(r)).toFixed(1),money(price),money2(base),r.taxApplied?money2(r.taxAmount||0):'—',money(r.total),money(r.advance),money(r.balance),reservationStatusLabel(r),reportBillingForReservation(r)],search:[c.name,r.code,service],action:`openReservationDetail('${String(r.id)}')`}})}
  }
  if(reportTab==='payments'){
    const methods=[...new Set(reportPaymentRows().map(m=>m.method||'No especificado'))].sort();setReportExtraOptions([['all','Todos los métodos'],...methods.map(x=>[x,x])]);extra=reportFilterValue();
    let rows=reportPaymentRows().filter(m=>reportInRange(m.date||dashboardCashDate(m)));if(extra!=='all')rows=rows.filter(m=>(m.method||'No especificado')===extra);
    rows=rows.filter(m=>{const c=m.clientId?clientById(m.clientId):null;return reportSearchMatch([c?.name||m.clientName||'Cliente',m.code||'',m.method||'',m.detail||'',paymentReservationSummary(m)])}).sort((a,b)=>String(b.date||b.occurredAt||'').localeCompare(String(a.date||a.occurredAt||'')));
    const total=rows.reduce((s,m)=>s+Number(m.amount||0),0),unapplied=rows.filter(m=>m.type==='payment').reduce((s,m)=>s+paymentUnappliedAmount(m),0);
    return {title:'Reporte de cobros',note:'Cada fila representa dinero realmente recibido. Un pago puede estar aplicado a una o varias reservas.',summary:[['Cobrado',money(total)],['Pagos',rows.length],['Sin aplicar',money(unapplied)]],columns:['Fecha','Cliente','Pago','Monto','Método','Destino','Aplicación','Sin aplicar','Comprobante','Facturación'],rows:rows.map(m=>{const c=m.clientId?clientById(m.clientId):null,explicit=m.type==='payment';return {cells:[reportFmtDate(m.date||dashboardCashDate(m)),c?.name||m.clientName||'Cliente',m.code||'Cobro previo',money(m.amount),m.method||'No especificado',treasuryAccountLabel(movementAccountId(m)),explicit?paymentReservationSummary(m):(m.reservationId?reservationById(m.reservationId)?.code||'—':'—'),explicit?money(paymentUnappliedAmount(m)):'—',m.attachmentId?'Adjunto':'—',explicit?(paymentIsInvoiced(m)?`${m.billingType||'Comprobante'} ${m.billingNumber||''}`:'Por emitir'):'Histórico'],search:[c?.name||'',m.code||'',m.method||'',m.detail||''],action:m.attachmentId?`openMovementAttachment('${String(m.id)}')`:''}})}
  }
  if(reportTab==='cash'){
    setReportExtraOptions([['all','Todos los movimientos'],['income','Entradas'],['expense','Salidas / gastos'],['transfer','Transferencias'],['cash','Aportes / retiros']]);extra=reportFilterValue();
    let rows=buildCashRecords().filter(m=>reportInRange(m.date||dashboardCashDate(m)));
    if(extra==='income')rows=rows.filter(m=>['payment','payment_legacy','other_income'].includes(m.type));if(extra==='expense')rows=rows.filter(m=>['expense','refund'].includes(m.type));if(extra==='transfer')rows=rows.filter(m=>m.type==='transfer');if(extra==='cash')rows=rows.filter(m=>['cash_in','cash_out'].includes(m.type));
    rows=rows.filter(m=>reportSearchMatch([cashRecordLabel(m),cashRecordMeta(m),m.code||'',m.party||'',m.detail||'']));
    const incoming=rows.filter(m=>['payment','payment_legacy','other_income','cash_in'].includes(m.type)).reduce((s,m)=>s+Number(m.amount||0),0),outgoing=rows.filter(m=>(m.type==='expense'&&!['observed','returned'].includes(m.supportStatus||'supported'))||['refund','cash_out'].includes(m.type)).reduce((s,m)=>s+Number(m.amount||0),0);
    return {title:'Reporte de caja / tesorería',note:'Las transferencias internas se muestran para trazabilidad, pero no se suman como ingreso ni gasto del negocio.',summary:[['Entradas',money(incoming)],['Salidas',money(outgoing)],['Neto',money(incoming-outgoing)],['Movimientos',rows.length]],columns:['Fecha','Tipo','Código','Detalle / persona','Cuenta / movimiento','Método','Entrada','Salida','Sustento','Adjunto'],rows:rows.map(m=>{const pos=['payment','payment_legacy','other_income','cash_in'].includes(m.type),neg=(m.type==='expense'&&!['observed','returned'].includes(m.supportStatus||'supported'))||['refund','cash_out'].includes(m.type),account=m.type==='transfer'?`${treasuryAccountLabel(m.sourceAccountId)} → ${treasuryAccountLabel(m.destinationAccountId)}`:treasuryAccountLabel(movementAccountId(m));return {cells:[reportFmtDate(m.date||dashboardCashDate(m)),cashRecordLabel(m),m.code||'—',[m.party,m.detail].filter(Boolean).join(' · ')||'—',account,m.method||'—',pos?money(m.amount):'—',neg?money(m.amount):'—',m.type==='expense'?reportSupportLabel(m):'—',m.attachmentId?'Adjunto':'—'],search:[cashRecordLabel(m),m.code||'',m.party||'',m.detail||'',account],action:m.attachmentId?`openMovementAttachment('${String(m.id)}')`:''}})}
  }
  if(reportTab==='expenses'){
    const cats=[...new Set(movements.filter(m=>m.type==='expense').map(expenseCategoryName))].sort();setReportExtraOptions([['all','Todas las categorías'],...cats.map(x=>[x,x])]);extra=reportFilterValue();
    let rows=movements.filter(m=>m.type==='expense'&&reportInRange(m.date||dashboardCashDate(m)));if(extra!=='all')rows=rows.filter(m=>expenseCategoryName(m)===extra);
    rows=rows.filter(m=>reportSearchMatch([expenseCategoryName(m),expenseAreaName(m),m.party||'',m.detail||'',m.documentType||'',m.documentNumber||''])).sort((a,b)=>String(b.date||b.occurredAt||'').localeCompare(String(a.date||a.occurredAt||'')));
    const approved=rows.filter(m=>(m.supportStatus||'supported')==='supported').reduce((s,m)=>s+Number(m.amount||0),0),pending=rows.filter(m=>m.supportStatus==='pending').reduce((s,m)=>s+Number(m.amount||0),0),observed=rows.filter(m=>m.supportStatus==='observed').reduce((s,m)=>s+Number(m.amount||0),0);
    return {title:'Reporte de gastos',note:'Gasto = consumo del negocio. Una transferencia entre cuentas no aparece aquí porque no es un gasto.',summary:[['Aprobados',money(approved)],['Por sustentar',money(pending)],['Observados',money(observed)],['Registros',rows.length]],columns:['Fecha','Categoría','Área','Detalle','Pagado a','Método','Cuenta','Monto','Estado','Documento','Número','Adjunto'],rows:rows.map(m=>({cells:[reportFmtDate(m.date||dashboardCashDate(m)),expenseCategoryName(m),expenseAreaName(m),m.detail||'—',m.party||'—',m.method||'—',treasuryAccountLabel(movementAccountId(m)),money(m.amount),reportSupportLabel(m),m.documentType||'Sin dato',m.documentNumber||'—',m.attachmentId?'Adjunto':'—'],search:[expenseCategoryName(m),expenseAreaName(m),m.detail||'',m.party||'',m.documentType||'',m.documentNumber||''],action:m.attachmentId?`openMovementAttachment('${String(m.id)}')`:''}))}
  }
  const pays=movements.filter(m=>m.type==='payment'&&Number(m.amount||0)>0);setReportExtraOptions([['all','Todos'],['pending','Por emitir'],['Boleta','Boleta'],['Factura','Factura'],['Otro','Otro']]);extra=reportFilterValue();
  let rows=pays.filter(m=>reportInRange(paymentIsInvoiced(m)?(m.billingDate||paymentDateValue(m)):paymentDateValue(m)));if(extra==='pending')rows=rows.filter(m=>!paymentIsInvoiced(m));else if(extra!=='all')rows=rows.filter(m=>paymentIsInvoiced(m)&&(m.billingType||'Otro')===extra);
  rows=rows.filter(m=>{const c=paymentClient(m);return reportSearchMatch([c.name,m.code||'',m.billingType||'',m.billingNumber||'',paymentReservationSummary(m)])}).sort((a,b)=>String((b.billingDate||paymentDateValue(b))).localeCompare(String(a.billingDate||paymentDateValue(a))));
  const documentRows=new Map();for(const m of rows){const key=paymentIsInvoiced(m)?(m.billingDocumentId||m.billingNumber||m.id):m.id;if(!documentRows.has(key)){const group=pays.filter(p=>paymentIsInvoiced(m)&&paymentIsInvoiced(p)&&(p.billingDocumentId||p.billingNumber||p.id)===key);documentRows.set(key,group.length>1?{...m,code:group.map(p=>p.code||'Cobro').join(' + '),method:[...new Set(group.map(p=>p.method||'Sin método'))].join(' / '),amount:m.billingTotal||group.reduce((sum,p)=>sum+Number(p.amount),0),applications:group.flatMap(paymentApplications)}:m);}}rows=[...documentRows.values()];
  const invoiced=rows.filter(paymentIsInvoiced),total=invoiced.reduce((s,m)=>s+Number(m.amount||0),0),pending=rows.filter(m=>!paymentIsInvoiced(m));
  return {title:'Reporte de comprobantes',note:'Vista de comprobantes preparada para integración electrónica. Los CPE marcados como Emitido local aún requieren envío/validación real cuando se conecte el proveedor.',summary:[['Emitido',money(total)],['Emitidos',invoiced.length],['Por emitir',pending.length]],columns:['Fecha','Cliente','Pago','Tipo','Número','Monto','Reservas','Método','Estado'],rows:rows.map(m=>{const c=paymentClient(m),inv=paymentIsInvoiced(m);return {cells:[reportFmtDate(inv?(m.billingDate||paymentDateValue(m)):paymentDateValue(m)),c.name,m.code||'Cobro',inv?(m.billingType||'Comprobante'):'—',inv?(m.billingNumber||'—'):'—',money(m.amount),paymentReservationSummary(m),m.method||'—',inv?paymentBillingStatusLabel(m):'Por emitir'],search:[c.name,m.code||'',m.billingType||'',m.billingNumber||''],action:`openBillingSheet('${String(m.id)}')`}})}
}
function renderReports(){
  ensureReportRange();document.querySelectorAll('[data-report-tab]').forEach(x=>x.classList.toggle('active',x.dataset.reportTab===reportTab));const data=reportDataset();reportCurrentData=data;const sum=document.getElementById('reportSummary'),note=document.getElementById('reportNote'),wrap=document.getElementById('reportTableWrap'),count=document.getElementById('reportCount');if(!sum||!wrap)return;
  sum.innerHTML=data.summary.map(([k,v])=>`<div class="report-summary-card"><span>${escapeHtml(k)}</span><b>${escapeHtml(String(v))}</b></div>`).join('');note.textContent=data.note||'';count.textContent=`${data.rows.length} registro${data.rows.length===1?'':'s'} en el reporte`;
  if(!data.rows.length){wrap.innerHTML='<div class="report-empty">No hay registros con estos filtros.</div>';return}
  wrap.innerHTML=`<table class="report-table"><thead><tr>${data.columns.map(c=>`<th>${escapeHtml(c)}</th>`).join('')}</tr></thead><tbody>${data.rows.map(r=>`<tr class="${r.action?'clickable':''}" ${r.action?`onclick="${r.action}"`:''}>${r.cells.map((c,i)=>`<td class="${i===3?'wrap':''}">${escapeHtml(String(c??''))}</td>`).join('')}</tr>`).join('')}</tbody></table>`
}
function reportSafeFilename(){const names={sales:'ventas',payments:'cobros',cash:'caja-tesoreria',expenses:'gastos',billing:'comprobantes'},a=document.getElementById('reportStart')?.value||'',b=document.getElementById('reportEnd')?.value||'';return `Eleva Sport - Reporte ${names[reportTab]||'gestion'} ${a} a ${b}`}
function exportCurrentReportExcel(){renderReports();const d=reportCurrentData;if(!d)return;const esc=x=>String(x??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');const html=`<html><head><meta charset="UTF-8"></head><body><h2>${esc(d.title)}</h2><p>${esc(fmtScheduled(document.getElementById('reportStart')?.value||'','')+' a '+fmtScheduled(document.getElementById('reportEnd')?.value||'',''))}</p><table border="1"><thead><tr>${d.columns.map(x=>`<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>${d.rows.map(r=>`<tr>${r.cells.map(x=>`<td>${esc(x)}</td>`).join('')}</tr>`).join('')}</tbody></table></body></html>`,blob=new Blob(['\ufeff',html],{type:'application/vnd.ms-excel;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=reportSafeFilename()+'.xls';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);showToast('Reporte Excel generado')}
function printCurrentReport(){renderReports();const d=reportCurrentData;if(!d)return;const w=window.open('','_blank');if(!w){showToast('Permite ventanas emergentes para generar el PDF');return}const esc=x=>String(x??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');w.document.write(`<!doctype html><html><head><meta charset="UTF-8"><title>${esc(reportSafeFilename())}</title><style>body{font-family:Arial,sans-serif;color:#101820;padding:24px;font-size:10px}h1{font-size:20px;margin:0 0 5px}p{color:#5f6b76}.summary{display:flex;gap:12px;margin:14px 0}.summary div{border:1px solid #ddd;border-radius:8px;padding:8px 12px}.summary span{display:block;font-size:8px;text-transform:uppercase;color:#777}.summary b{font-size:13px}table{width:100%;border-collapse:collapse}th{background:#f1f3f4;text-align:left;font-size:8px;text-transform:uppercase}th,td{border:1px solid #ddd;padding:6px;vertical-align:top}td{font-size:8.5px}@page{size:A4 landscape;margin:10mm}</style></head><body><h1>${esc(d.title)}</h1><p>Eleva Sport · ${esc(fmtScheduled(document.getElementById('reportStart')?.value||'',''))} a ${esc(fmtScheduled(document.getElementById('reportEnd')?.value||'',''))}</p><div class="summary">${d.summary.map(([k,v])=>`<div><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('')}</div><table><thead><tr>${d.columns.map(x=>`<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>${d.rows.map(r=>`<tr>${r.cells.map(x=>`<td>${esc(x)}</td>`).join('')}</tr>`).join('')}</tbody></table><script>window.onload=()=>setTimeout(()=>window.print(),250)<\/script></body></html>`);w.document.close()}

function dashboardDetailStats(items){return `<div class="dashboard-detail-summary">${items.map(x=>`<div class="dashboard-detail-stat"><span>${escapeHtml(x[0])}</span><b>${escapeHtml(String(x[1]))}</b></div>`).join('')}</div>`}
function dashboardReservationRow(r,value=''){
  const name=reservationDisplayName(r),product=dashProductName(r),internal=isInternalReservation(r),status=reservationStatusLabel(r),meta=`${r.code} · ${product} · ${fmtScheduled(r.eventDate,r.startTime)}`;
  return `<button class="dashboard-simple-row" onclick="closeSheet('dashboardDetailSheet');openReservationDetail('${r.id}')"><div class="dashboard-simple-main"><b>${escapeHtml(name)}</b><span>${escapeHtml(meta)}</span></div><div class="dashboard-simple-value"><b>${internal?'Sin cobro':(value||money(r.total||0))}<span class="arrow">›</span></b><span>${escapeHtml(status)}${!internal&&Number(r.balance||0)>0?` · saldo ${money(r.balance)}`:''}</span></div></button>`
}
function receivableRowsForRange(range){return reservations.filter(r=>matchesHomeReservationFilter(r)&&dashMoneyReceivable(r)>0)}
function filterReceivableRows(rows){if(receivableDashboardFilter==='all')return rows;return rows.filter(r=>receivableStatus(r)===receivableDashboardFilter)}
function receivableClientGroups(rows){const map={};rows.forEach(r=>{const id=String(r.clientId),c=clientById(r.clientId)||{name:'Cliente'};if(!map[id])map[id]={clientId:r.clientId,name:c.name,total:0,count:0,overdue:0,unapplied:clientUnappliedBalance(r.clientId),rows:[]};map[id].total+=Number(r.balance||0);map[id].count++;if(receivableStatus(r)==='overdue')map[id].overdue+=Number(r.balance||0);map[id].rows.push(r)});return Object.values(map).sort((a,b)=>b.total-a.total)}
function setReceivableDashboardFilter(filter){receivableDashboardFilter=filter;renderReceivableDashboard(receivableDashboardRange||homeDateRange())}
function renderReceivableDashboard(range){
  receivableReturnMode='dashboard';receivableDashboardRange=range;const all=receivableRowsForRange(range),rows=filterReceivableRows(all),groups=receivableClientGroups(rows),total=rows.reduce((s,r)=>s+Number(r.balance||0),0),host=document.getElementById('dashboardDetailBody');if(!host)return;
  const filters=[['all','Todos'],['overdue','Vencidos'],['today','Hoy'],['upcoming','Próximos']];host.innerHTML=dashboardDetailStats([['Por cobrar',money(total)],['Clientes',groups.length],['Reservas',rows.length]])+`<div class="receivable-toolbar">${filters.map(([k,n])=>`<button class="receivable-filter ${receivableDashboardFilter===k?'active':''}" onclick="setReceivableDashboardFilter('${k}')">${n}</button>`).join('')}</div><div class="receivable-table"><div class="receivable-head"><span>Cliente</span><span>Deuda</span><span></span></div>${groups.length?groups.map(g=>`<button class="receivable-client-row" onclick="openReceivableClient('${String(g.clientId)}')"><div class="receivable-client-main"><b>${escapeHtml(g.name)}</b><span>${g.count} reserva${g.count===1?'':'s'}${g.overdue>0?` · ${money(g.overdue)} vencido`:''}${g.unapplied>0.001?` · ${money(g.unapplied)} sin aplicar`:''}</span></div><div class="receivable-client-amount">${money(g.total)}</div><div class="receivable-client-arrow">›</div></button>`).join(''):`<div class="card empty" style="border:0">No hay saldos en este filtro.</div>`}</div>`
}
function clientCollectionHistory(clientId){
  const payments=pendingPaymentRows().filter(m=>String(m.clientId)===String(clientId)).sort((a,b)=>String(b.occurredAt||b.createdAt||'').localeCompare(String(a.occurredAt||a.createdAt||'')));
  return `<div class="collection-payment-history"><h3>Historial de abonos y pagos</h3><div class="pending-table">${payments.length?payments.map(m=>`<div class="pending-row"><div class="pending-main"><b>${escapeHtml(paymentCollectionLabel(m))}</b><span>${escapeHtml(m.code||'Pago')} · ${escapeHtml(m.method||'Sin método')} · ${fmtScheduled(paymentDateValue(m),'')}</span><span>${escapeHtml(paymentReservationSummary(m))}</span><span>${escapeHtml(paymentBillingStatusLabel(m))}</span></div><div class="pending-value"><b>${money(m.amount)}</b>${canViewPaymentBilling()?`<button class="pending-action" onclick="openBillingSheet('${String(m.id)}')">${paymentIsInvoiced(m)?'Ver comprobante':(hasPermission('issue_billing')?'Preparar comprobante':'Ver detalle')}</button>`:''}</div></div>`).join(''):'<div class="pending-empty">Todavía no hay pagos registrados.</div>'}</div></div>`;
}
function openReceivableClient(clientId){
  const c=clientById(clientId);if(!c)return;receivableClientId=c.id;const rows=clientPendingReservations(c.id),total=rows.reduce((s,r)=>s+Number(r.balance||0),0),unapplied=clientUnappliedBalance(c.id),host=document.getElementById('dashboardDetailBody'),title=document.getElementById('dashboardDetailTitle'),backAction=receivableReturnMode==='pending'?"closeSheet('dashboardDetailSheet')":"document.getElementById('dashboardDetailTitle').textContent='Por cobrar';renderReceivableDashboard(receivableDashboardRange||homeDateRange())",backLabel=receivableReturnMode==='pending'?'‹ Volver a Pendientes':'‹ Volver a clientes';title.textContent=c.name;host.innerHTML=`<button class="receivable-back" onclick="${backAction}">${backLabel}</button><div class="receivable-client-summary"><div><span>Pendiente total</span><b>${money(total)}</b></div><small>${rows.length} reserva${rows.length===1?'':'s'}${unapplied>0.001?` · ${money(unapplied)} sin aplicar · neto ${money(Math.max(0,total-unapplied))}`:''}</small></div>${rows.length?`${unapplied>0.001?`<button class="secondary" style="width:100%;margin-bottom:8px" onclick="openClientUnappliedApply('${String(c.id)}')">Aplicar saldo disponible · ${money(unapplied)}</button>`:''}<button class="primary" style="width:100%;margin-bottom:12px" onclick="openClientPayment('${String(c.id)}')">Registrar nuevo pago</button><div class="receivable-debt-list">${rows.map(r=>{const st=receivableStatus(r);return `<div class="receivable-debt-row"><div class="receivable-debt-main"><b>${escapeHtml(r.code)} · ${fmtScheduled(r.eventDate,r.startTime)}</b><span>Total ${money(r.total)} · Abonado ${money(r.advance||0)} · Por cobrar ${money(r.balance||0)}</span><span class="debt-status ${st}">${escapeHtml(receivableStatusLabel(r))} · vence ${fmtScheduled(reservationDueDate(r),'')}</span></div><div class="receivable-debt-value"><b>${money(r.balance)}</b><button onclick="event.stopPropagation();closeSheet('dashboardDetailSheet');openPaymentSheet('${String(r.id)}')">Cobrar</button><button onclick="event.stopPropagation();closeSheet('dashboardDetailSheet');openReservationDetail('${String(r.id)}')">Ver reserva</button></div></div>`}).join('')}</div>`:'<div class="card empty">Este cliente ya no tiene deuda pendiente.</div>'}`
  if(window.ElevaCollectionOperations)host.innerHTML=`<button class="receivable-back" onclick="${backAction}">${backLabel}</button>`+window.ElevaCollectionOperations.clientHTML(c.id);
  else host.insertAdjacentHTML('beforeend',clientCollectionHistory(c.id));
}

function openDashboardDetail(type){
  const range=homeDateRange(),rows=dashRangeReservations(range),cash=dashboardCashMetrics(range),available=dashboardAvailableMetrics(),analysis=dashboardAnalysisData(range,rows),products=dashboardSalesProducts(rows),host=document.getElementById('dashboardDetailBody'),title=document.getElementById('dashboardDetailTitle'),rangeHost=document.getElementById('dashboardDetailRange');if(!host||!title)return;rangeHost.textContent=type==='available'?'Saldo acumulado hasta hoy':(type==='receivable'?'Saldo pendiente actual':range.label);
  if(type==='available'){
    title.textContent='Tesorería';const accounts=Object.entries(available.byAccount).sort((a,b)=>Math.abs(b[1])-Math.abs(a[1]));host.innerHTML=dashboardDetailStats([['Disponible Eleva',money(available.total)],['Por rendir',money(available.custody)],['Por sustentar',money(available.pending)],['Observado',money(available.observed)]])+`<div class="dashboard-detail-section"><div class="dashboard-detail-title">Por cuenta / custodia</div><div class="dashboard-method-list">${accounts.length?accounts.map(([m,v])=>`<div class="dashboard-method-row"><span>${escapeHtml(m)}</span><b>${money(v)}</b></div>`).join(''):'<div class="card empty">Sin movimientos.</div>'}</div></div><div class="dashboard-detail-section"><button class="secondary" onclick="closeSheet('dashboardDetailSheet');openCash()">Abrir Caja y movimientos</button></div>`
  } else if(type==='cash'){
    title.textContent='Caja neta';const methods=dashboardMethodBreakdown(cash.rows),recent=cash.rows.slice(0,30);host.innerHTML=dashboardDetailStats([['Caja neta',money(cash.net)],['Cobros',money(cash.payments)],['Otros ingresos',money(cash.otherIncome)],['Salidas',money(cash.expenses+cash.refunds+cash.cashOut)],['Por sustentar',money(cash.pendingExpenses)]])+`<div class="dashboard-detail-section"><div class="dashboard-detail-title">Composición</div><div class="dashboard-method-list"><div class="dashboard-method-row"><span>Aportes a caja</span><b>${money(cash.cashIn)}</b></div><div class="dashboard-method-row"><span>Gastos</span><b>− ${money(cash.expenses)}</b></div><div class="dashboard-method-row"><span>Reembolsos</span><b>− ${money(cash.refunds)}</b></div><div class="dashboard-method-row"><span>Retiros de caja</span><b>− ${money(cash.cashOut)}</b></div></div></div><div class="dashboard-detail-section"><div class="dashboard-detail-title">Por método</div><div class="dashboard-method-list">${methods.length?methods.map(([m,v])=>`<div class="dashboard-method-row"><span>${escapeHtml(m)}</span><b>${money(v)}</b></div>`).join(''):'<div class="card empty">Sin movimientos.</div>'}</div></div><div class="dashboard-detail-section"><div class="dashboard-detail-title">Registros</div>${recent.length?recent.map(m=>`<div class="dashboard-detail-row"><div class="dashboard-detail-row-main"><b>${escapeHtml(cashRecordLabel(m))}</b><span>${escapeHtml(cashRecordMeta(m))}</span>${m.attachmentId&&!m.virtual?`<button class="cash-proof-btn" onclick="openMovementAttachment('${String(m.id)}')">Ver comprobante</button>`:''}</div><div class="dashboard-detail-row-value"><b>${m.type==='transfer'?'':(Number(m.sign||0)>=0?'+':'−')} ${money(m.amount)}</b></div></div>`).join(''):'<div class="card empty">No hay movimientos.</div>'}</div>`
  } else if(type==='sales'){
    title.textContent='Total vendido';
    const sold=products.reduce((s,x)=>s+x.revenue,0),active=rows.filter(dashSaleActive).sort((a,b)=>(b.eventDate+b.startTime).localeCompare(a.eventDate+a.startTime)),soldHours=active.reduce((s,r)=>s+dashDurationHours(r),0);
    const productRows=products.filter(x=>x.count>0);
    host.innerHTML=dashboardDetailStats([['Total vendido',money(sold)],['Reservas',active.length],['Horas',dashFormatHours(soldHours)],['Ticket prom.',money(active.length?sold/active.length:0)]])+`<div class="dashboard-detail-section"><div class="dashboard-detail-title">Resumen</div><div class="dashboard-simple-list">${productRows.length?productRows.map(x=>`<div class="dashboard-simple-row" style="cursor:default"><div class="dashboard-simple-main"><b>${escapeHtml(x.name)}</b><span>${x.count} reserva${x.count===1?'':'s'} · ${dashFormatHours(x.hours)}</span></div><div class="dashboard-simple-value"><b>${money(x.revenue)}</b><span>${sold?Math.round(x.revenue/sold*100):0}% de ventas</span></div></div>`).join(''):'<div class="card empty" style="border:0">Sin ventas en este período.</div>'}</div></div><div class="dashboard-detail-section"><div class="dashboard-detail-title">Reservas</div>${active.length?`<div class="dashboard-simple-list">${active.map(r=>dashboardReservationRow(r)).join('')}</div>`:'<div class="card empty">Sin ventas en este período.</div>'}</div>`
  } else if(type==='reservations'){
    title.textContent='Ocupaciones';
    const active=rows.filter(r=>r.status!=='cancelled').sort((a,b)=>(b.eventDate+b.startTime).localeCompare(a.eventDate+a.startTime)),commercial=active.filter(r=>!isInternalReservation(r)),internal=active.filter(isInternalReservation),activity=internal.filter(r=>r.internalUseType==='activity'),courtesy=internal.filter(r=>r.internalUseType==='courtesy'),maintenance=internal.filter(r=>r.internalUseType==='maintenance'),hours=active.reduce((s,r)=>s+dashDurationHours(r),0);
    const mix=[['Comercial',commercial],['Actividad propia',activity],['Cortesía',courtesy],['Mantenimiento',maintenance]].filter(([,arr])=>arr.length).map(([name,arr])=>({name,count:arr.length,hours:arr.reduce((s,r)=>s+dashDurationHours(r),0)}));
    host.innerHTML=dashboardDetailStats([['Ocupaciones',active.length],['Horas ocupadas',dashFormatHours(hours)],['Comerciales',commercial.length],['Internas',internal.length]])+`<div class="dashboard-detail-section"><div class="dashboard-detail-title">Composición</div><div class="dashboard-simple-list">${mix.length?mix.map(x=>`<div class="dashboard-simple-row" style="cursor:default"><div class="dashboard-simple-main"><b>${escapeHtml(x.name)}</b><span>${x.count} registro${x.count===1?'':'s'}</span></div><div class="dashboard-simple-value"><b>${dashFormatHours(x.hours)}</b></div></div>`).join(''):'<div class="card empty" style="border:0">No hay ocupaciones en este período.</div>'}</div></div><div class="dashboard-detail-section"><div class="dashboard-detail-title">Registros</div>${active.length?`<div class="dashboard-simple-list">${active.map(r=>dashboardReservationRow(r)).join('')}</div>`:'<div class="card empty">No hay ocupaciones en este período.</div>'}</div>`
  } else if(type==='receivable'){
    title.textContent='Por cobrar';receivableDashboardFilter='all';receivableDashboardRange=range;renderReceivableDashboard(range)
  } else if(type==='expenses'){
    expenseAnalysisMode='category';renderExpenseDashboardDetail()
  }
  openSheet('dashboardDetailSheet')
}



/* v57: roles, permisos y supervisión */
function roleNav(index){const e=(currentRole().nav||[])[index];if(!e)return;const dest=e[0];if(dest==='action')openActions();else if(dest==='pending')openPending('receivable');else go(dest)}
function applyRoleNavigation(){
  const role=currentRole(),nav=role.nav||[];[0,1,3,4].forEach(i=>{const e=nav[i],b=document.getElementById(`nav-slot-${i}`);if(!b||!e)return;document.getElementById(`navIcon${i}`).textContent=e[2];document.getElementById(`navLabel${i}`).textContent=e[1];b.style.display=''});
  const center=document.getElementById('nav-center'),e=nav[2];if(center&&e){center.textContent=e[2]||'+';center.classList.toggle('green',e[0]==='action');center.classList.toggle('role-page-fab',e[0]!=='action');center.style.visibility='visible'}
  const t=document.getElementById('topRoleTitle');if(t)t.textContent=role.name;const a=document.getElementById('roleAvatar'),u=currentUser();if(a)a.textContent=(u?.initials||initials(u?.name||'EV')).slice(0,3).toUpperCase();
  document.body.classList.remove('role-admin','role-director','role-supervisor','role-shift','role-sales','role-finance');document.body.classList.add('role-'+currentRoleBaseId());
  applyMorePermissions();applyActionPermissions();
}
function applyMorePermissions(){
  const rules=[["openPending('receivable')",'view_pending'],['go(\'follow\')','view_followups'],['go(\'quotes\')','view_quotes'],['openClients()','view_clients'],['openCash()','view_cash'],['go(\'reports\')','view_reports'],['openHistory()','view_history'],["openMasterDetail('users')",'manage_access'],['openMasters()','manage_settings'],['openTariffs()','manage_settings']];
  const alreadyInMainNav=(currentRole().nav||[]).some(([dest])=>dest==='pending');
  const collectionsMoreButton=document.getElementById('collectionsMoreButton');
  if(collectionsMoreButton){collectionsMoreButton.style.display=alreadyInMainNav?'none':'';collectionsMoreButton.hidden=alreadyInMainNav;}
  document.querySelectorAll('#view-more button.more-card').forEach(b=>{const oc=b.getAttribute('onclick')||'',r=rules.find(x=>oc.includes(x[0]));b.style.display=r&&!hasPermission(r[1])?'none':''});
}
function applyActionPermissions(){
  const sheet=document.getElementById('actionSheet');if(!sheet)return;const rules=[['openNewReservation()','manage_reservations'],['startQuote()','manage_quotes'],['openNewFollowup()','manage_followups'],['openNewClient(false)','manage_clients'],['openPaymentSheet()','register_payments'],['openMovementTypeSheet()','register_expenses']];
  sheet.querySelectorAll('button.actionbtn').forEach(b=>{const oc=b.getAttribute('onclick')||'',r=rules.find(x=>oc.includes(x[0]));b.style.display=r&&!hasPermission(r[1])?'none':''});
}
function roleHomeCounts(){
  const today=localDateValue(),pendingApprovals=approvalRequests.filter(a=>a.status==='pending'),todayRs=reservations.filter(r=>r.eventDate===today&&!['cancelled','no_show'].includes(r.status)),todayDebt=todayRs.filter(r=>!isInternalReservation(r)&&Number(r.balance||0)>0),pendingRecon=movements.filter(m=>m.type==='payment'&&m.reconciliationStatus==='pending'),pendingExp=movements.filter(m=>m.type==='expense'&&m.supportStatus==='pending'),custody=dashboardAvailableMetrics().custody,overdue=controlOverdueReservations(),toIssue=movements.filter(m=>m.type==='payment'&&Number(m.amount||0)>0&&!paymentIsInvoiced(m)),pendingF=followups.filter(f=>!f.done),pendingQ=quotes.filter(q=>q.status!=='reserved'),range=homeDateRange(),rows=dashRangeReservations(range),sold=dashboardSalesProducts(rows).reduce((s,x)=>s+x.revenue,0),expenses=dashboardExpenseMetrics(range).approvedTotal;
  return {todayRs,todayDebt,pendingApprovals,pendingRecon,pendingExp,custody,overdue,toIssue,pendingF,pendingQ,sold,result:sold-expenses};
}
function renderRoleHomePanel(){
  const host=document.getElementById('roleHomePanel');if(!host)return;const role=currentRoleBaseId(),c=roleHomeCounts(),u=currentUser(),name=escapeHtml(u?.name||'Usuario');let title=currentRole().name,desc='',metrics=[],actions=[];
  if(role==='admin'){desc='Acceso total a operación, finanzas, configuración y auditoría.';metrics=[['Aprobaciones',c.pendingApprovals.length,'pendientes'],['Control',c.pendingRecon.length+c.pendingExp.length,'revisiones'],['Por rendir',money(c.custody),'custodia']];actions=[['Control','control'],['Reportes','reports']]}
  if(role==='director'){desc='Vista ejecutiva para analizar resultados, riesgos y decisiones sin operar el día a día.';metrics=[['Ventas',money(c.sold),'período'],['Resultado',money(c.result),'operativo'],['Por cobrar',money(c.overdue.reduce((s,r)=>s+Number(r.balance||0),0)),'vencido'],['Alertas',c.pendingRecon.length+c.pendingExp.length,'control']];actions=[['Ver reportes','reports'],['Ver control','control']]}
  if(role==='supervisor'){desc='Supervisa que reservas, pagos, rendiciones y gastos cierren correctamente.';metrics=[['Aprobaciones',c.pendingApprovals.length,'pendientes'],['Conciliar',c.pendingRecon.length,'pagos'],['Gastos',c.pendingExp.length,'por revisar'],['Por rendir',money(c.custody),'custodia']];actions=[['Abrir Control','control'],['Reservas','reservations']]}
  if(role==='shift'){desc='Operación del turno: reservas de hoy, cobros y registro de incidencias.';metrics=[['Reservas hoy',c.todayRs.length,'programadas'],['Por cobrar',money(c.todayDebt.reduce((s,r)=>s+Number(r.balance||0),0)),'hoy'],['Pendientes',c.todayDebt.length,'cobros'],['Próxima',c.todayRs.filter(r=>r.startTime>=localTimeValue()).sort((a,b)=>a.startTime.localeCompare(b.startTime))[0]?.startTime||'—','horario']];actions=[['Ver agenda','reservations'],['Cobros','pending']]}
  if(role==='sales'){desc='Clientes, cotizaciones, seguimientos y reservas comerciales.';metrics=[['Seguimientos',c.pendingF.length,'pendientes'],['Cotizaciones',c.pendingQ.length,'abiertas'],['Reservas hoy',c.todayRs.filter(r=>!isInternalReservation(r)).length,'comerciales'],['Por cobrar',c.overdue.length,'vencidas']];actions=[['Seguimientos','follow'],['Cotizaciones','quotes']]}
  if(role==='finance'){desc='Cobranza, conciliación, tesorería, gastos y comprobantes.';metrics=[['Conciliar',c.pendingRecon.length,'pagos'],['Por emitir',c.toIssue.length,'CPE'],['Gastos',c.pendingExp.length,'por revisar'],['Por rendir',money(c.custody),'custodia']];actions=[['Control','control'],['Pendientes','pending'],['Reportes','reports']]}
  const titleEl=document.getElementById('homeTitle');if(titleEl)titleEl.textContent=currentRole().homeTitle;const eyebrow=document.getElementById('homeEyebrow');if(eyebrow)eyebrow.textContent=`${name} · ${currentRole().short}`;
  host.innerHTML=`${metrics.length?`<div class="role-metric-grid">${metrics.map(x=>`<div class="role-metric"><span>${escapeHtml(x[0])}</span><b>${escapeHtml(String(x[1]))}</b><small>${escapeHtml(x[2])}</small></div>`).join('')}</div>`:''}${actions.length?`<div class="role-action-row">${actions.map((x,i)=>`<button class="${i?'secondary-role':''}" onclick="go('${x[1]}')">${escapeHtml(x[0])}</button>`).join('')}</div>`:''}`;
  const cash=document.getElementById('homeKpiCash'),occ=document.getElementById('homeKpiOccupancy'),sales=document.getElementById('homeKpiSales'),recv=document.getElementById('homeKpiReceivable');[cash,occ,sales,recv].forEach(x=>{if(x)x.style.display=''});if(role==='sales'){if(cash)cash.style.display='none'}if(role==='finance'){if(occ)occ.style.display='none'}
}
function openSessionSheet(){renderSessionSheet();openSheet('sessionSheet')}
function closeSessionSheet(){closeSheet('sessionSheet')}
function renderSessionSheet(){ensureUsers();const roles=roleCatalog(),u=currentUser(),cur=document.getElementById('sessionCurrent'),list=document.getElementById('sessionUsers'),preview=document.getElementById('rolePreviewBlock'),grid=document.getElementById('rolePreviewGrid');if(cur)cur.innerHTML=`<div class="session-user-card"><div class="avatar">${escapeHtml(u?.initials||'EV')}</div><div class="session-user-main"><b>${escapeHtml(u?.name||'Usuario')}</b><span>${escapeHtml(currentRole().name)}${rolePreviewId?' · vista previa':''}</span></div></div>`;if(list){const canSwitch=u?.role==='admin';const visible=canSwitch?settings.users.filter(x=>x.active):[u].filter(Boolean);list.innerHTML=visible.map(x=>`<div class="session-user-card"><div class="avatar">${escapeHtml(x.initials||initials(x.name))}</div><div class="session-user-main"><b>${escapeHtml(x.name)}</b><span>${escapeHtml(roles[x.role]?.name||x.role)}</span></div>${canSwitch?`<button onclick="switchSessionUser('${String(x.id)}')">Entrar</button>`:''}</div>`).join('')}if(preview)preview.style.display=(u?.role==='admin')?'':'none';if(grid)grid.innerHTML=Object.entries(roles).map(([id,r])=>`<button class="role-preview-btn ${currentRoleId()===id?'active':''}" onclick="previewRole('${id}')"><b>${escapeHtml(r.name)}</b><span>${id==='admin'?'Acceso total':escapeHtml(r.short)}</span></button>`).join('')}
function switchSessionUser(){showToast('Cada usuario debe iniciar sesión con su propia cuenta')}
function previewRole(){showToast('La identidad se verifica con Supabase Auth')}
function applyRoleUI(){applyRoleNavigation();renderRoleHomePanel();updateUsersMasterBadge();const nc=document.querySelector('#clientsSheet button.primary[onclick*="openNewClient"]');if(nc)nc.style.display=hasPermission('manage_clients')?'':'none';const addBilling=document.querySelector('.client-billing-head button');if(addBilling)addBilling.style.display=hasPermission('manage_clients')?'':'none'}
function addUserMasterRow(){ensureAccessSettings();const roles=roleCatalog(),preferred=roles[settings.controlRules.defaultUserRole]?settings.controlRules.defaultUserRole:'shift';userMasterDraft.push({id:crypto.randomUUID(),name:'',initials:'',role:preferred,active:true});renderUserMaster()}
function collectUserMaster(){document.querySelectorAll('#userMasterList .user-master-row').forEach(row=>{const i=Number(row.dataset.index),u=userMasterDraft[i];if(!u)return;u.name=(row.querySelector('[data-u-name]')?.value||'').trim();u.role=row.querySelector('[data-u-role]')?.value||'shift';u.active=!!row.querySelector('[data-u-active]')?.checked;u.initials=initials(u.name||'U').slice(0,3).toUpperCase()})}
function renderUserMaster(){const h=document.getElementById('userMasterList');if(!h)return;const roles=roleCatalog();h.innerHTML=userMasterDraft.map((u,i)=>`<div class="user-master-row" data-index="${i}"><input data-u-name value="${escapeHtml(u.name||'')}" placeholder="Nombre"><select data-u-role>${Object.entries(roles).map(([id,r])=>`<option value="${id}" ${u.role===id?'selected':''}>${escapeHtml(r.name)}</option>`).join('')}</select><label class="user-active"><input data-u-active type="checkbox" ${u.active!==false?'checked':''}> Activo</label></div>`).join('')}
function saveUserMaster(stay=false){collectUserMaster();settings.users=userMasterDraft.filter(u=>u.name);persist();if(stay)renderAccessConfigTab();else closeSheet('masterDetailSheet');showToast('Usuarios actualizados');}
function updateUsersMasterBadge(){const e=document.getElementById('usersMasterBadge');if(e){ensureUsers();e.textContent=`${settings.users.filter(u=>u.active).length} usuarios · ${Object.keys(roleCatalog()).length} roles`}}
function openAccessConfigCenter(){ensureAccessSettings();ensureUsers();accessConfigTab='users';userMasterDraft=cloneData(settings.users);masterDetailTitle.textContent='Accesos y control';masterDetailBody.innerHTML=`<div class="info"><b>Centro no-code.</b> Administra quién entra, qué puede hacer cada rol y qué operaciones necesitan control. Las reglas críticas del historial y del último Administrador permanecen protegidas.</div><div class="access-tabs"><button class="access-tab active" data-access-tab="users" onclick="setAccessConfigTab('users')">Usuarios</button><button class="access-tab" data-access-tab="roles" onclick="setAccessConfigTab('roles')">Roles</button><button class="access-tab" data-access-tab="permissions" onclick="setAccessConfigTab('permissions')">Permisos</button><button class="access-tab" data-access-tab="approvals" onclick="setAccessConfigTab('approvals')">Aprobaciones</button><button class="access-tab" data-access-tab="rules" onclick="setAccessConfigTab('rules')">Reglas</button></div><div id="accessConfigPanel" class="access-panel"></div>`;renderAccessConfigTab();openSheet('masterDetailSheet')}
function setAccessConfigTab(tab){accessConfigTab=tab;document.querySelectorAll('[data-access-tab]').forEach(b=>b.classList.toggle('active',b.dataset.accessTab===tab));renderAccessConfigTab()}
function renderAccessConfigTab(){const host=document.getElementById('accessConfigPanel');if(!host)return;if(accessConfigTab==='users')return renderAccessUsersTab(host);if(accessConfigTab==='roles')return renderAccessRolesTab(host);if(accessConfigTab==='permissions')return renderAccessPermissionsTab(host);if(accessConfigTab==='approvals')return renderAccessApprovalsTab(host);renderAccessRulesTab(host)}
function renderAccessUsersTab(host){const roles=roleCatalog();host.innerHTML=`<div class="access-section"><div class="access-section-head"><div><b>Usuarios</b><span>Asigna un rol. Los permisos se administran por rol para mantener el sistema ordenado.</span></div><div class="access-count">${userMasterDraft.filter(u=>u.active!==false).length} activos</div></div><div id="userMasterList" class="user-master-list"></div><div class="user-master-actions"><button class="ghost" onclick="addUserMasterRow()">＋ Nuevo usuario</button></div></div><div class="access-hint">Si una persona necesita permisos diferentes, duplica un rol y asígnaselo en lugar de crear excepciones difíciles de auditar.</div><div class="access-savebar"><button class="primary" onclick="saveUserMaster(true)">Guardar usuarios</button></div>`;renderUserMaster()}
function baseRoleLabel(id){return ROLE_DEFS[id]?.name||id}
function renderAccessRolesTab(host){const roles=roleCatalog(),counts={};settings.users.forEach(u=>{counts[u.role]=(counts[u.role]||0)+(u.active!==false?1:0)});host.innerHTML=`<div class="access-section"><div class="access-section-head"><div><b>Roles del sistema</b><span>Los seis perfiles base permanecen disponibles. Puedes crear roles personalizados a partir de cualquiera de ellos.</span></div><div class="access-count">${Object.keys(roles).length} roles</div></div><div class="access-role-list">${Object.entries(roles).map(([id,r])=>{const custom=!!r.custom;return `<div class="access-role-row"><div class="access-role-top"><div class="access-role-main"><b>${escapeHtml(r.name)}${id==='admin'?' · protegido':''}</b><span>${custom?`Personalizado · experiencia ${escapeHtml(baseRoleLabel(r.baseRole))}`:`Perfil base · ${escapeHtml(r.homeTitle||'Inicio')}`} · ${counts[id]||0} usuario${(counts[id]||0)===1?'':'s'} activo${(counts[id]||0)===1?'':'s'}</span></div><div class="access-role-actions"><button class="access-mini-btn" onclick="openPermissionsForRole('${id}')">Permisos</button>${id!=='admin'?`<button class="access-mini-btn" onclick="duplicateRole('${id}')">Duplicar</button>`:''}${custom?`<button class="access-mini-btn danger" onclick="deleteCustomRole('${id}')">Eliminar</button>`:''}</div></div>${custom?`<div class="access-role-edit"><input data-custom-role-name="${id}" value="${escapeHtml(r.name)}" placeholder="Nombre del rol"><select data-custom-role-base="${id}">${['director','supervisor','shift','sales','finance'].map(x=>`<option value="${x}" ${r.baseRole===x?'selected':''}>Experiencia: ${escapeHtml(ROLE_DEFS[x].name)}</option>`).join('')}</select></div>`:''}</div>`}).join('')}</div></div><div class="access-section"><div class="access-section-head"><div><b>Crear rol</b><span>Elige una experiencia base para navegación y dashboard; luego ajusta permisos.</span></div></div><div class="custom-role-create"><div class="field"><label>Nombre</label><input id="newCustomRoleName" placeholder="Ej. Coordinador de academia"></div><div class="field"><label>Basado en</label><select id="newCustomRoleBase">${['director','supervisor','shift','sales','finance'].map(x=>`<option value="${x}">${escapeHtml(ROLE_DEFS[x].name)}</option>`).join('')}</select></div><button class="secondary" onclick="createCustomRole()">Crear rol</button></div></div><div class="access-savebar"><button class="primary" onclick="saveCustomRoleMeta()">Guardar roles</button></div>`}
function roleSlug(name){return String(name||'rol').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'').slice(0,28)||'rol'}
function createCustomRole(){ensureAccessSettings();const name=(document.getElementById('newCustomRoleName')?.value||'').trim(),base=document.getElementById('newCustomRoleBase')?.value||'shift';if(!name){showToast('Escribe un nombre para el rol');return}let id=`custom_${roleSlug(name)}`,i=2,roles=roleCatalog();while(roles[id])id=`custom_${roleSlug(name)}_${i++}`;const template=roles[base]||ROLE_DEFS.shift;settings.customRoles.push({id,name,short:name.slice(0,18),baseRole:base,permissions:[...(template.permissions||[])]});accessPermissionRoleId=id;addAuditEvent('config',id,name,'Rol creado',[],`Basado en ${baseRoleLabel(base)}`);persist();renderAccessConfigTab();showToast('Rol creado · ahora puedes ajustar sus permisos')}
function duplicateRole(id){const roles=roleCatalog(),r=roles[id];if(!r||id==='admin')return;let base=r.baseRole||id,name=`${r.name} copia`,newId=`custom_${roleSlug(name)}`,i=2;while(roles[newId])newId=`custom_${roleSlug(name)}_${i++}`;settings.customRoles.push({id:newId,name,short:name.slice(0,18),baseRole:base,permissions:[...(r.permissions||[])]});accessPermissionRoleId=newId;addAuditEvent('config',newId,name,'Rol duplicado',[],`Origen: ${r.name}`);persist();renderAccessConfigTab();showToast('Rol duplicado')}
function saveCustomRoleMeta(){ensureAccessSettings();settings.customRoles.forEach(c=>{const ni=document.querySelector(`[data-custom-role-name="${c.id}"]`),bi=document.querySelector(`[data-custom-role-base="${c.id}"]`);if(ni&&ni.value.trim()){c.name=ni.value.trim();c.short=c.name.slice(0,18)}if(bi&&ROLE_DEFS[bi.value])c.baseRole=bi.value});addAuditEvent('config','roles','Roles','Definiciones de roles actualizadas',[],`${settings.customRoles.length} roles personalizados`);persist();applyRoleUI();renderAccessConfigTab();showToast('Roles actualizados')}
function deleteCustomRole(id){ensureAccessSettings();if(settings.users.some(u=>u.active!==false&&u.role===id)){showToast('No puedes eliminar un rol asignado a usuarios activos');return}const old=roleCatalog()[id];settings.customRoles=settings.customRoles.filter(r=>r.id!==id);if(accessPermissionRoleId===id)accessPermissionRoleId='supervisor';addAuditEvent('config',id,old?.name||id,'Rol eliminado',[],old?.name||id);persist();renderAccessConfigTab();showToast('Rol eliminado')}
function openPermissionsForRole(id){accessPermissionRoleId=id;accessConfigTab='permissions';document.querySelectorAll('[data-access-tab]').forEach(b=>b.classList.toggle('active',b.dataset.accessTab==='permissions'));renderAccessConfigTab()}
function renderAccessPermissionsTab(host){const roles=roleCatalog();if(!roles[accessPermissionRoleId])accessPermissionRoleId='supervisor';const r=roles[accessPermissionRoleId],admin=accessPermissionRoleId==='admin';host.innerHTML=`<div class="access-section"><div class="permission-role-picker"><div class="field"><label>Rol</label><select id="permissionRoleSelect" onchange="accessPermissionRoleId=this.value;renderAccessConfigTab()">${Object.entries(roles).map(([id,x])=>`<option value="${id}" ${id===accessPermissionRoleId?'selected':''}>${escapeHtml(x.name)}</option>`).join('')}</select></div><div class="access-count">${admin?'Acceso total':`${(r.permissions||[]).length} permisos`}</div></div></div>${admin?'<div class="protected-rule"><b>Administrador general protegido.</b><br>Siempre conserva acceso total para evitar que el sistema se quede sin administración.</div>':`<div class="permission-groups">${PERMISSION_CATALOG.map(g=>`<div class="permission-group"><h4>${escapeHtml(g.group)}</h4><div class="permission-grid">${g.items.map(([key,label,desc])=>`<label class="permission-item"><input type="checkbox" data-role-permission="${key}" ${(r.permissions||[]).includes(key)?'checked':''}><span><b>${escapeHtml(label)}</b><span>${escapeHtml(desc)}</span></span></label>`).join('')}</div></div>`).join('')}</div><div class="access-savebar"><div style="display:flex;gap:7px"><button class="secondary" onclick="restoreRolePermissions('${accessPermissionRoleId}')">Restaurar perfil base</button><button class="primary" style="flex:1" onclick="saveRolePermissions('${accessPermissionRoleId}')">Guardar permisos</button></div></div>`}`}
function saveRolePermissions(id){if(id==='admin')return;const selected=[...document.querySelectorAll('[data-role-permission]:checked')].map(x=>x.dataset.rolePermission),roles=roleCatalog();if(!roles[id])return;if(ROLE_DEFS[id]){settings.roleOverrides[id]=settings.roleOverrides[id]||{};settings.roleOverrides[id].permissions=selected}else{const c=settings.customRoles.find(x=>x.id===id);if(c)c.permissions=selected}addAuditEvent('config',id,roles[id]?.name||id,'Permisos de rol actualizados',[],`${selected.length} permisos`);persist();applyRoleUI();renderAccessConfigTab();showToast('Permisos actualizados')}
function restoreRolePermissions(id){if(id==='admin')return;const roles=roleCatalog(),r=roles[id];if(!r)return;const baseId=ROLE_DEFS[id]?id:(r.baseRole||'shift'),defaults=[...(ROLE_DEFS[baseId]?.permissions||[])];if(ROLE_DEFS[id]){settings.roleOverrides[id]=settings.roleOverrides[id]||{};settings.roleOverrides[id].permissions=defaults}else{const c=settings.customRoles.find(x=>x.id===id);if(c)c.permissions=defaults}addAuditEvent('config',id,r.name||id,'Permisos restaurados',[],`Perfil base: ${baseRoleLabel(baseId)}`);persist();renderAccessConfigTab();showToast('Permisos restaurados')}
function renderAccessApprovalsTab(host){ensureAccessSettings();const a=settings.approvalRules;host.innerHTML=`<div class="access-section"><div class="access-section-head"><div><b>Aprobaciones por excepción</b><span>No se aprueba cada operación normal; solo acciones sensibles según estas reglas.</span></div></div><div class="config-rule-list"><label class="config-rule"><span class="config-rule-main"><b>Reserva pagada / devolución</b><span>Cancelar, no-show, devolver o generar crédito requiere un rol con “Aprobar excepciones”.</span></span><span class="config-rule-control"><input id="rulePaidOutcome" type="checkbox" ${a.paidReservationOutcome?'checked':''}></span></label><div class="config-rule"><span class="config-rule-main"><b>Importe mínimo para aprobación</b><span>Solo aplica a reservas que ya tengan más de este monto cobrado.</span></span><span class="config-rule-control">S/<input id="rulePaidLimit" type="number" min="0" step="1" value="${Number(a.paidReservationApprovalLimit||0)}"></span></div><label class="config-rule"><span class="config-rule-main"><b>Evitar autoaprobación</b><span>Quien solicita una excepción o registra un gasto no puede aprobarlo, salvo Administrador general.</span></span><span class="config-rule-control"><input id="ruleNoSelf" type="checkbox" ${a.preventSelfApproval?'checked':''}></span></label><label class="config-rule"><span class="config-rule-main"><b>Revisar gastos por monto</b><span>Activa un umbral configurable para que gastos grandes queden pendientes.</span></span><span class="config-rule-control"><input id="ruleExpenseApproval" type="checkbox" ${a.expenseApprovalEnabled?'checked':''}></span></label><div class="config-rule"><span class="config-rule-main"><b>Umbral de gasto</b><span>Desde este monto el gasto requiere revisión cuando la regla está activa.</span></span><span class="config-rule-control">S/<input id="ruleExpenseLimit" type="number" min="0" step="1" value="${Number(a.expenseApprovalThreshold||0)}"></span></div><label class="config-rule"><span class="config-rule-main"><b>Sin comprobante → por sustentar</b><span>Un gasto sin imagen/PDF queda pendiente aunque salga de una cuenta propia de Eleva.</span></span><span class="config-rule-control"><input id="ruleExpenseProof" type="checkbox" ${a.expenseWithoutProofPending?'checked':''}></span></label></div></div><div class="access-savebar"><button class="primary" onclick="saveApprovalConfig()">Guardar aprobaciones</button></div>`}
function saveApprovalConfig(){ensureAccessSettings();const a=settings.approvalRules;a.paidReservationOutcome=!!document.getElementById('rulePaidOutcome')?.checked;a.paidReservationApprovalLimit=Math.max(0,Number(document.getElementById('rulePaidLimit')?.value||0));a.preventSelfApproval=!!document.getElementById('ruleNoSelf')?.checked;a.expenseApprovalEnabled=!!document.getElementById('ruleExpenseApproval')?.checked;a.expenseApprovalThreshold=Math.max(0,Number(document.getElementById('ruleExpenseLimit')?.value||0));a.expenseWithoutProofPending=!!document.getElementById('ruleExpenseProof')?.checked;addAuditEvent('config','approvals','Aprobaciones','Reglas de aprobación actualizadas',[],`Reserva pagada: ${a.paidReservationOutcome?'Sí':'No'} · gasto desde ${money(a.expenseApprovalThreshold)}`);persist();showToast('Reglas de aprobación actualizadas')}
function renderAccessRulesTab(host){ensureAccessSettings();const c=settings.controlRules,roles=roleCatalog();host.innerHTML=`<div class="access-section"><div class="access-section-head"><div><b>Control operativo</b><span>Configura qué debe llegar a revisión y cuándo generar alertas.</span></div></div><div class="config-rule-list"><label class="config-rule"><span class="config-rule-main"><b>Conciliar pagos digitales</b><span>Yape, Plin, transferencia y otros medios quedan pendientes de validar.</span></span><span class="config-rule-control"><input id="ruleReconDigital" type="checkbox" ${c.reconcileDigitalPayments?'checked':''}></span></label><label class="config-rule"><span class="config-rule-main"><b>Conciliar efectivo pago por pago</b><span>Normalmente el efectivo se controla por cierre de caja, por eso viene desactivado.</span></span><span class="config-rule-control"><input id="ruleReconCash" type="checkbox" ${c.reconcileCashPayments?'checked':''}></span></label><div class="config-rule"><span class="config-rule-main"><b>Alertar deuda desde</b><span>Días de atraso antes de aparecer como alerta de supervisión.</span></span><span class="config-rule-control"><input id="ruleOverdueDays" type="number" min="1" max="90" step="1" value="${Math.max(1,Number(c.overdueAlertDays||1))}"> días</span></div><div class="config-rule"><span class="config-rule-main"><b>Rol predeterminado de usuario nuevo</b><span>Se propone automáticamente al crear un usuario.</span></span><span class="config-rule-control"><select id="ruleDefaultRole">${Object.entries(roles).filter(([id])=>id!=='admin').map(([id,r])=>`<option value="${id}" ${c.defaultUserRole===id?'selected':''}>${escapeHtml(r.name)}</option>`).join('')}</select></span></div></div></div><div class="access-section"><div class="access-section-head"><div><b>Protecciones del sistema</b><span>Estas reglas no pueden desactivarse desde la interfaz.</span></div></div><div class="protected-rule">• Siempre debe existir al menos un Administrador general activo.<br>• La auditoría no se elimina desde la operación.<br>• Pagos y movimientos históricos no se borran: se corrigen mediante estados/contramovimientos.<br>• Un comprobante tributario aceptado no debe reescribirse como si nunca hubiera existido.</div></div><div class="access-savebar"><button class="primary" onclick="saveControlConfig()">Guardar reglas</button></div>`}
function saveControlConfig(){ensureAccessSettings();const c=settings.controlRules,roles=roleCatalog();c.reconcileDigitalPayments=!!document.getElementById('ruleReconDigital')?.checked;c.reconcileCashPayments=!!document.getElementById('ruleReconCash')?.checked;c.overdueAlertDays=Math.max(1,Number(document.getElementById('ruleOverdueDays')?.value||1));const dr=document.getElementById('ruleDefaultRole')?.value||'shift';c.defaultUserRole=roles[dr]&&dr!=='admin'?dr:'shift';addAuditEvent('config','rules','Control','Reglas de control actualizadas',[],`Digital ${c.reconcileDigitalPayments?'conciliar':'sin conciliación'} · atraso ${c.overdueAlertDays} día(s)`);persist();showToast('Reglas de control actualizadas')}

function paymentReconciliationLabel(m){const s=m?.reconciliationStatus;return s==='reconciled'?'Conciliado':(s==='observed'?'Observado':(s==='pending'?'Pendiente':(s==='not_required'?'No requiere':'Histórico')))}
function setPaymentReconciliation(id,status){if(!requirePermission('reconcile_payments'))return;const m=movements.find(x=>String(x.id)===String(id)&&x.type==='payment');if(!m)return;const before=paymentReconciliationLabel(m);m.reconciliationStatus=status;m.reconciledAt=status==='reconciled'?nowISO():null;m.reconciledBy=status==='reconciled'?actorName():null;addAuditEvent('payment',m.id,m.code,'Estado de conciliación actualizado',[{field:'Conciliación',before,after:paymentReconciliationLabel(m)}],`${money(m.amount)} · ${m.method||'Sin método'}`);persist();renderControl();renderHome();showToast(status==='reconciled'?'Pago conciliado':'Pago observado')}
function setControlTab(tab){controlTab=tab;document.querySelectorAll('[data-control-tab]').forEach(b=>b.classList.toggle('active',b.dataset.controlTab===tab));renderControl()}
function openRenditionFromControl(accountId){if(!requirePermission('manage_treasury'))return;openTreasuryTransfer();setTimeout(()=>{if(document.getElementById('transferFrom'))transferFrom.value=accountId},0)}
function requestApproval(type,entityId,code,payload,summary){
  const existing=approvalRequests.find(a=>a.status==='pending'&&a.type===type&&String(a.entityId)===String(entityId));if(existing){showToast('Ya existe una solicitud pendiente para este registro');return existing}
  const a={id:crypto.randomUUID(),type,entityId:String(entityId),code:code||'',payload:cloneData(payload||{}),summary:summary||'',status:'pending',requestedAt:nowISO(),requestedBy:actorName(),requestedByUserId:currentUser()?.id||null,requestedRole:actorRoleName()};approvalRequests.unshift(a);addAuditEvent('approval',a.id,a.code,'Aprobación solicitada',[],`${type} · ${summary||''}`);persist();return a
}
function approvalStatusLabel(a){return a.status==='approved'?'Aprobada':(a.status==='rejected'?'Rechazada':'Pendiente')}
function applyApprovedReservationOutcome(req){
  const r=reservationById(req.entityId),p=req.payload||{};if(!r)return false;const c=clientById(r.clientId),previousCredit=Math.max(0,Number(r.creditAmount||0)),status=p.status||r.status,disp=p.disposition||'normal',refund=Math.max(0,Number(p.refund||0)),credit=Math.max(0,Number(p.credit||0)),retained=Math.max(0,Number(p.retained||0)),previousStatus=r.status,previousDisposition=r.paymentDisposition||'';
  if(c)c.creditBalance=Math.max(0,Number(c.creditBalance||0)-previousCredit+credit);r.status=status;r.paymentDisposition=disp;r.refundedAmount=refund;r.creditAmount=credit;r.retainedAmount=retained;r.refundAccountId=p.refundAccountId||null;r.outcomeReason=p.reason||'';r.outcomeNote=p.note||'';r.outcomeAt=nowISO();if(status==='completed')r.completedAt=r.outcomeAt;if(status==='cancelled')r.cancelledAt=r.outcomeAt;if(status==='no_show')r.noShowAt=r.outcomeAt;if(status==='rescheduled')r.reprogrammedAt=r.outcomeAt;addAuditEvent('reservation',r.id,r.code,'Excepción financiera aprobada',[{field:'Estado',before:previousStatus,after:status},{field:'Tratamiento del pago',before:previousDisposition||'—',after:disp||'—'}],`Aprobación ${req.id} · ${req.requestedBy}`);return true
}
function resolveApproval(id,decision){
  if(!requirePermission('approve_sensitive','No tienes permiso para resolver esta solicitud'))return;const a=approvalRequests.find(x=>String(x.id)===String(id));if(!a||a.status!=='pending')return;ensureAccessSettings();if(settings.approvalRules.preventSelfApproval&&a.requestedByUserId&&String(a.requestedByUserId)===String(currentUser()?.id)&&currentRoleBaseId()!=='admin'){showToast('No puedes aprobar tu propia solicitud. Debe resolverla otro aprobador.');return}
  if(decision==='approved'&&a.type==='reservation_outcome'&&Number(a.payload?.refund)>0&&!treasuryAccountById(a.payload.refundAccountId)?.active){showToast('Esta solicitud no tiene una cuenta de devolución activa. Recházala y vuelve a registrar el reembolso eligiendo la cuenta de origen.');return}
  if(decision==='approved'){let ok=true;if(a.type==='reservation_outcome')ok=applyApprovedReservationOutcome(a);if(!ok){showToast('No se pudo aplicar la solicitud');return}a.status='approved';a.resolvedAt=nowISO();a.resolvedBy=actorName();addAuditEvent('approval',a.id,a.code,'Solicitud aprobada',[],a.summary||'')}
  else{a.status='rejected';a.resolvedAt=nowISO();a.resolvedBy=actorName();addAuditEvent('approval',a.id,a.code,'Solicitud rechazada',[],a.summary||'')}
  persist();renderControl();renderReservations();renderReservationWorkspace();renderHome();showToast(decision==='approved'?'Solicitud aprobada':'Solicitud rechazada')
}
function renderControl(){
  const summary=document.getElementById('controlSummary'),host=document.getElementById('controlList');if(!summary||!host)return;const today=localDateValue(),pendingApprovals=approvalRequests.filter(a=>a.status==='pending'),pendingRecon=movements.filter(m=>m.type==='payment'&&['pending','observed'].includes(m.reconciliationStatus)),pendingExp=movements.filter(m=>m.type==='expense'&&m.supportStatus==='pending'),observedExp=movements.filter(m=>m.type==='expense'&&m.supportStatus==='observed'),t=dashboardAvailableMetrics(),custodyAccounts=t.accounts.filter(a=>a.kind==='custody'&&Number(t.balances[a.id]||0)>0.001),overdue=controlOverdueReservations(),billingIssues=movements.filter(m=>m.type==='payment'&&m.billingProviderStatus==='rejected');summary.innerHTML=`<div class="control-stat"><span>Aprobaciones</span><b>${pendingApprovals.length}</b></div><div class="control-stat"><span>Conciliar</span><b>${pendingRecon.filter(m=>m.reconciliationStatus==='pending').length}</b></div><div class="control-stat"><span>Por rendir</span><b>${money(t.custody)}</b></div><div class="control-stat"><span>Alertas</span><b>${overdue.length+pendingExp.length+observedExp.length+billingIssues.length}</b></div>`;
  if(controlTab==='approvals'){host.innerHTML=`<div class="control-list">${pendingApprovals.length?pendingApprovals.map(a=>`<div class="control-row"><div class="control-main"><b>${escapeHtml(a.code||'Solicitud')} · ${escapeHtml(a.type==='reservation_outcome'?'Estado / dinero':'Excepción')}</b><span>${escapeHtml(a.summary||'Sin detalle')} · solicitado por ${escapeHtml(a.requestedBy||'Usuario')} · ${fmtDateTime(a.requestedAt)}</span><span class="control-badge">Pendiente de autorización</span></div><div class="control-actions">${hasPermission('approve_sensitive')?`<button onclick="resolveApproval('${String(a.id)}','approved')">Aprobar</button><button class="warn" onclick="resolveApproval('${String(a.id)}','rejected')">Rechazar</button>`:''}</div></div>`).join(''):'<div class="control-empty">No hay solicitudes pendientes de aprobación.</div>'}</div>`;return}
  if(controlTab==='reconcile'){const rows=pendingRecon.sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));host.innerHTML=`<div class="control-list">${rows.length?rows.map(m=>{const c=paymentClient(m);return `<div class="control-row"><div class="control-main"><b>${escapeHtml(m.code||'Pago')} · ${escapeHtml(c.name)}</b><span>${money(m.amount)} · ${escapeHtml(m.method||'Sin método')} · ${escapeHtml(treasuryAccountLabel(movementAccountId(m)))} · ${fmtScheduled(m.date||paymentDateValue(m),'')}</span><span class="control-badge">${escapeHtml(paymentReconciliationLabel(m))}</span></div><div class="control-actions">${hasPermission('reconcile_payments')?`<button onclick="setPaymentReconciliation('${String(m.id)}','reconciled')">Conciliar</button><button class="warn" onclick="setPaymentReconciliation('${String(m.id)}','observed')">Observar</button>`:''}</div></div>`}).join(''):'<div class="control-empty">No hay pagos nuevos pendientes de conciliación.</div>'}</div>`;return}
  if(controlTab==='expenses'){const rows=[...pendingExp,...observedExp];host.innerHTML=`<div class="control-list">${rows.length?rows.map(m=>`<div class="control-row"><div class="control-main"><b>${escapeHtml(expenseCategoryName(m))} · ${money(m.amount)}</b><span>${escapeHtml(expenseAreaName(m))} · ${escapeHtml(m.detail||'Sin detalle')} · ${fmtScheduled(m.date,'')}</span><span class="control-badge">${m.supportStatus==='observed'?'Observado':'Por sustentar'}</span></div><div class="control-actions">${hasPermission('approve_expenses')&&m.supportStatus==='pending'?`<button onclick="setExpenseSupportStatus('${String(m.id)}','supported');renderControl()">Aprobar</button><button class="warn" onclick="setExpenseSupportStatus('${String(m.id)}','observed');renderControl()">Observar</button>`:(hasPermission('approve_expenses')&&m.supportStatus==='observed'?`<button onclick="setExpenseSupportStatus('${String(m.id)}','returned');renderControl()">Regularizar</button>`:'')}</div></div>`).join(''):'<div class="control-empty">No hay gastos pendientes de revisión.</div>'}</div>`;return}
  if(controlTab==='custody'){host.innerHTML=`<div class="control-list">${custodyAccounts.length?custodyAccounts.map(a=>`<div class="control-row"><div class="control-main"><b>${escapeHtml(a.name)}</b><span>Fondos de Eleva todavía bajo custodia.</span></div><div class="control-actions"><b>${money(t.balances[a.id])}</b>${hasPermission('manage_treasury')?`<button onclick="openRenditionFromControl('${String(a.id)}')">Rendir</button>`:''}</div></div>`).join(''):'<div class="control-empty">No hay fondos pendientes de rendición.</div>'}</div>`;return}
  const alerts=[...overdue.map(r=>({title:`${r.code} · ${reservationDisplayName(r)}`,meta:`${money(r.balance)} vencido · ${fmtScheduled(reservationDueDate(r),'')}`,cls:'control-overdue',action:`openReservationDetail('${String(r.id)}')`})),...observedExp.map(m=>({title:`${m.code} · Gasto observado`,meta:`${money(m.amount)} · ${expenseCategoryName(m)}`,cls:'control-overdue',action:`openCash()`})),...billingIssues.map(m=>({title:`${m.billingNumber||m.code} · CPE rechazado`,meta:`${money(m.amount)} · ${paymentClient(m).name}`,cls:'control-overdue',action:`openBillingSheet('${String(m.id)}')`}))];host.innerHTML=`<div class="control-list">${alerts.length?alerts.map(x=>`<div class="control-row" onclick="${x.action}" style="cursor:pointer"><div class="control-main"><b>${escapeHtml(x.title)}</b><span class="${x.cls}">${escapeHtml(x.meta)}</span></div><div class="control-actions">›</div></div>`).join(''):'<div class="control-empty">No hay alertas accionables.</div>'}</div>`
}

reservations.forEach(r=>{if(!isInternalReservation(r)&&!r.paymentDueDate)r.paymentDueDate=r.eventDate});
void 0;ensureOperatingSchedule();ensureTreasuryAccounts();ensureAccessSettings();ensureUsers();renderClientOptions();renderQuotes();renderFollowups();renderReservations();reservationWorkspace='agenda';reservationFocusDate=localDateValue();renderReservationWorkspace();calendarSelectedDate=localDateValue();calendarView='day';renderCalendar();renderHome();updateScheduleMasterBadge();updatePaymentMethodsMasterBadge();updateTreasuryMasterBadge();updateExpenseMasterBadges();updateUsersMasterBadge();applyRoleUI();recalcQuote();
// v58: centro no-code de accesos, roles, permisos, aprobaciones y reglas

window.ElevaLegacy={
 format:{money,escapeHtml,fmtScheduled,fmtDateTime,billingBreakdownForPayment},
 refreshUserDraft(){userMasterDraft=cloneData(settings.users);},
 getOpenReservation:()=>structuredClone(reservationById(openReservationId)||null),
 getReservationFormContext:()=>({kind:reservationKind,mode:courtBookingMode,editingId:editingReservationId,editingSeriesId:editingRecurringSeriesId}),
 getCalendarContext:()=>({focusDate:reservationFocusDate,selectedDate:calendarSelectedDate,datePicker:reservationDatePickerMode,workspace:reservationWorkspace}),
 getState:()=>structuredClone({clients,quotes,followups,reservations,movements,recurringSeries,auditLog,approvalRequests,settings}),
 setState(s){({clients,quotes,followups,reservations,movements,recurringSeries,auditLog,approvalRequests,settings}=s);quotePackageDraft=cloneData(settings.exclusivePackage);selectedClient=selectedClient?clientById(selectedClient.id):null;},
 render(){renderClientOptions();renderQuotes();renderFollowups();renderReservations();renderReservationWorkspace();renderCalendar();renderHome();applyRoleUI();updateUsersMasterBadge();},
 mutators:["saveClient","saveBillingProfile","generateQuote","saveFollowup","completeFollowup","finishSeriesFromManager","saveReservation","saveReservationOutcome","confirmOpenReservation","savePayment","saveClientPayment","saveClientUnappliedApplication","saveManualMovement","saveTreasuryTransfer","setExpenseSupportStatus","saveSchedule","saveTariffs","saveExpenseMaster","savePaymentMethodsMaster","saveReservationMessageTemplate","saveMasterPackage","saveMasterPaymentData","issueBillingRecord","createCustomRole","duplicateRole","saveCustomRoleMeta","deleteCustomRole","saveRolePermissions","restoreRolePermissions","saveApprovalConfig","saveControlConfig","setPaymentReconciliation","requestApproval","resolveApproval","saveUserMaster","saveTreasuryAccountsMaster"]
};
