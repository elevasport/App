(() => {
  const E=window.ElevaCatalogEngine,by=id=>document.getElementById(id),state=()=>window.ElevaLegacy.getState();
  const esc=window.ElevaLegacy.format.escapeHtml,cash=window.ElevaLegacy.format.money;
  const legacy=document.createElement('div'),config=by('rSingleCourtConfig');legacy.id='rLegacyCourtControls';
  while(config.firstChild)legacy.append(config.firstChild);config.append(legacy);
  const panel=document.createElement('div');panel.id='rCatalogCourtControls';panel.className='hidden';
  panel.innerHTML='<div class="grid2"><div class="field"><label for="rCatalogSite">Sede</label><select id="rCatalogSite"></select></div><div class="field"><label for="rCatalogOffering">Formato y cancha</label><select id="rCatalogOffering"></select></div></div><div id="rCatalogResources" class="resource-help"></div><div id="rCatalogCalculation" class="calc-box" aria-live="polite"></div><p id="rCatalogBookingMessage" class="mutedline" role="status"></p>';
  config.append(panel);
  let adapter=null,busy=false,createdId=null,owner=null;
  const context=()=>window.ElevaLegacy.getReservationFormContext();
  const active=()=>!!state().settings.businessCatalog&&context().kind==='court'&&context().mode==='single'&&!context().editingId&&!by('rQuote').value;
  const options=(rows,selected)=>rows.map(r=>`<option value="${esc(r.id)}" ${r.id===selected?'selected':''}>${esc(r.name)}</option>`).join('');
  const catalog=()=>state().settings.businessCatalog;
  function offerings(){const c=catalog();return c.offerings.filter(o=>o.active&&o.siteId===by('rCatalogSite').value&&c.services.some(s=>s.id===o.serviceId&&s.active&&s.kind==='court'&&s.unit==='hour'));}
  function initialize(){
    createdId=null;owner=window.ElevaSessionUser?.id;
    if(catalog()){by('rCatalogSite').innerHTML=options(catalog().sites.filter(s=>s.active));selectSite();}
    sync();
  }
  function selectSite(){const selected=by('rCatalogOffering').value;by('rCatalogOffering').innerHTML=options(offerings(),selected);sync();}
  function quoteInput(){return {offeringId:by('rCatalogOffering').value,date:by('rDate').value,start:by('rStart').value,end:by('rEnd').value};}
  const clock=minutes=>String(Math.floor(minutes/60)).padStart(2,'0')+':'+String(minutes%60).padStart(2,'0');
  function sync(){
    const enabled=active();panel.classList.toggle('hidden',!enabled);legacy.classList.toggle('hidden',enabled);
    const toggle=by('rApplyIgv');
    if(!enabled){toggle.disabled=window.ElevaSessionUser?.role!=='admin';restoreTaxCopy();return;}
    toggle.disabled=true;by('rBaseTotal').readOnly=true;
    const tax=state().settings.taxConfig||{},rate=Number(tax.taxRate??18),include=!!tax.pricesIncludeTax;
    toggle.checked=include;
    const copy=by('rReservationTaxToggle').querySelector('.tax-toggle-copy');
    copy.querySelector('b').textContent=include?'IGV '+rate+'% incluido':'IGV no aplicado';
    copy.querySelector('span').textContent=include?'Se desglosa del precio final configurado. No se suma otra vez.':'Según la configuración actual del negocio. Solo el administrador modifica las tarifas e impuestos.';
    by('rTaxInheritedNote').classList.add('hidden');
    try{
      const input=quoteInput(),q=E.quote(catalog(),input),conflict=E.conflict(state().reservations,input,q);
      const base=include?Math.floor(q.total/(1+rate/100)*100)/100:q.total,taxAmount=include?Math.round(base*rate)/100:0;
      by('rBaseTotal').value=base.toFixed(2);by('rTotal').value=q.total.toFixed(2);by('rBalance').textContent=cash(q.total);by('rPaidDisplay').textContent=cash(0);
      by('rNonTaxableExtra').value=Math.round((q.total-base-taxAmount)*100)/100;by('rNonTaxableExtraRow').classList.add('hidden');
      by('rTaxPreview').innerHTML=`<div class="detail-row"><span>Subtotal base</span><b>${cash(base)}</b></div><div class="detail-row"><span>IGV ${rate}%${include?' incluido':''}</span><b>${cash(taxAmount)}</b></div>${Math.abs(q.total-base-taxAmount)>.001?`<div class="detail-row"><span>Ajuste de redondeo</span><b>${cash(q.total-base-taxAmount)}</b></div>`:''}`;
      by('rCatalogResources').textContent=q.siteName+' · '+q.resourceNames.join(' + ');
      by('rCatalogCalculation').innerHTML=`<span>Turno aplicado: ${esc(E.turn(catalog(),input))}</span><b>${q.hours} h · ${cash(q.total)}</b><div class="mutedline">${q.segments.map(s=>`${clock(s.start)}–${clock(s.end)} · ${cash(s.rate)}/h × ${(s.end-s.start)/60} h = ${cash(s.amount)}`).join('<br>')}</div>`;
      by('rCatalogBookingMessage').textContent='La duración calcula la hora final y el importe automáticamente. La tarifa corresponde a estos espacios y al horario seleccionado.';
      const conflictBox=by('reservationConflictBox');conflictBox.classList.toggle('show',!!conflict);conflictBox.textContent=conflict?'Horario no disponible. Una de las canchas está ocupada. El importe mostrado es una cotización; cambia el horario para crear la reserva.':'';
    }catch(error){by('rCatalogCalculation').innerHTML='<span>Selecciona sede, formato, fecha y horario</span>';by('rCatalogBookingMessage').textContent=error.message;by('rTotal').value=0;by('rBaseTotal').value=0;by('rBalance').textContent=cash(0);by('rTaxPreview').textContent='';}
  }
  const originalTaxCopy=by('rReservationTaxToggle').querySelector('.tax-toggle-copy').innerHTML;
  function restoreTaxCopy(){const copy=by('rReservationTaxToggle').querySelector('.tax-toggle-copy');if(copy.querySelector('b').textContent!== 'Aplicar IGV 18%')copy.innerHTML=originalTaxCopy;}
  by('rCatalogSite').addEventListener('change',selectSite);by('rCatalogOffering').addEventListener('change',sync);
  by('reservationSheet').addEventListener('input',()=>{if(!busy)sync();});by('reservationSheet').addEventListener('change',()=>{if(!busy)sync();});
  for(const name of ['prepareReservationForm','setCourtBookingMode','onReservationClientChange','loadReservationQuote','syncCourtScheduleFromSelectors','recalcReservationCourtTotal','recalcReservationTax']){
    const original=window[name];window[name]=function(...args){const result=original.apply(this,args);if(name==='prepareReservationForm')initialize();else sync();return result;};
  }
  function setBusy(value){busy=value;by('reservationSheet').querySelectorAll('button,input,select,textarea').forEach(e=>{if(value){e.dataset.catalogWasDisabled=String(e.disabled);e.disabled=true;}else if(e.dataset.catalogWasDisabled!==undefined){e.disabled=e.dataset.catalogWasDisabled==='true';delete e.dataset.catalogWasDisabled;}});}
  async function save(postAction='none'){
    if(busy||!active()||!window.ElevaSessionUser?.active||!window.hasPermission('manage_reservations'))return;
    if(window.ElevaDateUI&&!window.ElevaDateUI.validateCurrent())return;
    if(owner!==window.ElevaSessionUser.id){window.showToast('Vuelve a abrir la reserva con tu sesión actual.');return;}
    const input={...quoteInput(),clientId:by('rClient').value,version:catalog().version,notes:by('rNotes').value.trim()},extras={status:by('rStatus').value,dueDate:by('rPaymentDueDate').value||input.date};
    if(!state().clients.some(c=>String(c.id)===input.clientId)){window.showToast('Selecciona un cliente');return;}
    try{const q=E.quote(catalog(),input);if(E.conflict(state().reservations,input,q))throw new Error('Una de las canchas ya está ocupada.');}catch(error){window.ElevaFeedback?.error(error.message);return;}
    setBusy(true);
    try{
      if(!createdId)createdId=await adapter.reserve(input);
      if(extras.status!=='hold'||extras.dueDate!==input.date)await adapter.details(createdId,extras);
      const id=createdId;createdId=null;setBusy(false);window.closeSheet('reservationSheet');window.go('reservations');
      window.ElevaFeedback?.success('Reserva creada con su horario, tarifa y desglose de IGV.');
      if(postAction==='pay')window.openPaymentSheet(id);
    }catch(error){setBusy(false);by('rCatalogBookingMessage').textContent=createdId?'La reserva ya se creó. Revisa su estado y vencimiento desde el detalle antes de continuar.':error.message;window.ElevaFeedback?.error(by('rCatalogBookingMessage').textContent);if(createdId){window.closeSheet('reservationSheet');window.openReservationDetail(createdId);createdId=null;}else if(error.committed){window.closeSheet('reservationSheet');window.go('reservations');}}
  }
  window.ElevaReservationForm={handles:active,save,isBusy:()=>busy,connect(service){adapter=service;},sync};
})();
