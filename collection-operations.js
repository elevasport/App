/* Read-only presentation of canonical reservation balances and payment allocations. */
(() => {
  const expanded=new Set(),esc=value=>window.ElevaLegacy.format.escapeHtml(value),cash=value=>window.ElevaLegacy.format.money(value);
  const sum=(rows,fn)=>rows.reduce((total,row)=>total+Number(fn(row)||0),0);
  function data(){
    const state=window.ElevaLegacy.getState(),payments=state.movements.filter(m=>m.type==='payment'&&Number(m.amount)>0);
    const operations=state.reservations.filter(r=>!window.isInternalReservation(r)).map(reservation=>{
      const entries=payments.map(payment=>({payment,amount:window.paymentAppliedAmount(payment,reservation.id)})).filter(entry=>entry.amount>0);
      return {reservation,client:state.clients.find(c=>String(c.id)===String(reservation.clientId))||{name:'Cliente'},entries,
        total:Number(reservation.total||0),paid:Number(reservation.advance||0),balance:['cancelled','no_show'].includes(reservation.status)?0:Math.max(0,Number(reservation.balance||0)),
        refund:Number(reservation.refundedAmount||0),credit:Number(reservation.creditAmount||0),retained:Number(reservation.retainedAmount||0),
        pendingRefund:state.approvalRequests.find(a=>a.status==='pending'&&String(a.entityId)===String(reservation.id)&&Number(a.payload?.refund)>0),
        active:!['cancelled','no_show'].includes(reservation.status)};
    });
    return {operations,payments,unapplied:payments.filter(payment=>window.paymentUnappliedAmount(payment)>0.001)};
  }
  function counts(){const {operations,payments,unapplied}=data();return {
    receivable:operations.filter(o=>o.active&&o.balance>0.001).length,
    paid:operations.filter(o=>o.active&&o.total>0&&o.balance<=0.001).length,
    all_operations:operations.length,unapplied:unapplied.length,refunds:operations.filter(o=>o.refund>0||o.pendingRefund).length,
    // Billing counts are unique payments, even when one payment covers several operations.
    to_invoice:payments.filter(p=>!window.paymentIsInvoiced(p)).length,invoiced:new Set(payments.filter(window.paymentIsInvoiced).map(p=>p.billingDocumentId||p.billingNumber||p.id)).size
  };}
  const billingAction=payment=>window.canViewPaymentBilling()?`<button type="button" class="operation-button" data-payment-id="${esc(payment.id)}" onclick="openBillingSheet(this.dataset.paymentId)">${window.paymentIsInvoiced(payment)?'Ver comprobante':(window.hasPermission('issue_billing')?'Preparar comprobante':'Ver detalle')}</button>`:'';
  function outcomeHTML(o){
    const r=o.reservation;
    if(window.ElevaCancellation&&window.ElevaLegacy.getState().settings.operatingPolicies?.cancellations&&['cancelled','no_show'].includes(r.status))return window.ElevaCancellation.summaryHTML(r);
    return `${o.refund>0?`<div class="operation-refund"><b>Reembolso registrado · ${cash(o.refund)}</b><span>${esc(window.ElevaLegacy.format.fmtDateTime(r.outcomeAt))} · Cuenta: ${esc(window.treasuryAccountLabel(r.refundAccountId))}</span><span>${r.outcomeNote?esc(r.outcomeNote):'Devolución asociada a esta operación.'}</span><span>Cobrado neto tras reembolso: <b>${cash(Math.max(0,o.paid-o.refund))}</b></span></div>`:''}${o.credit>0?`<p class="operation-history-note">Saldo a favor del cliente: ${cash(o.credit)}</p>`:''}${o.retained>0?`<p class="operation-history-note">Importe retenido: ${cash(o.retained)}</p>`:''}${o.pendingRefund?`<div class="operation-refund pending"><b>Reembolso pendiente de aprobación · ${cash(o.pendingRefund.payload.refund)}</b><span>Solicitado ${esc(window.ElevaLegacy.format.fmtDateTime(o.pendingRefund.requestedAt))}. Todavía no se ha registrado la salida de dinero.</span>${o.pendingRefund.payload.refundAccountId?`<span>Cuenta de origen: ${esc(window.treasuryAccountLabel(o.pendingRefund.payload.refundAccountId))}</span>`:'<span>Esta solicitud se creó sin cuenta de devolución. Debe rechazarse y volver a registrarse con una cuenta antes de aprobar.</span>'}</div>`:''}`;
  }
  function entryHTML(entry){
    const {payment,amount}=entry,applications=window.paymentApplications(payment),shared=applications.length>1||window.paymentUnappliedAmount(payment)>0.001;
    return `<div class="operation-payment" data-payment-id="${esc(payment.id)}"><div><b>${esc(payment.code||'Pago')} · ${esc(window.paymentCollectionLabel(payment))}</b><span>${esc(payment.method||'Sin método')} · ${esc(window.ElevaLegacy.format.fmtDateTime(payment.occurredAt||payment.createdAt||payment.date))}</span>${payment.createdBy?`<span>Registrado por ${esc(payment.createdBy)}</span>`:''}<span class="operation-document-status">${esc(window.paymentBillingStatusLabel(payment))}${payment.billingNumber?` · ${esc(payment.billingType||'Comprobante')} ${esc(payment.billingNumber)}`:''}</span>${shared?`<span class="operation-allocation-note">Aplicado a esta operación: ${cash(amount)} de un pago total de ${cash(payment.amount)}. ${applications.length>1?`Distribuido entre ${applications.length} operaciones.`:''} El comprobante corresponde al pago total.</span>`:''}</div><strong>${cash(amount)}</strong><div class="operation-payment-actions">${billingAction(payment)}${payment.attachmentId?`<button type="button" class="operation-button" data-payment-id="${esc(payment.id)}" onclick="openMovementAttachment(this.dataset.paymentId)">Ver sustento de pago</button>`:''}</div></div>`;
  }
  function cardHTML(operation,tab){
    const {reservation:r,client,entries,total,paid,balance,active}=operation;
    const label=!active?window.reservationStatusLabel(r):(balance>0.001?(paid>0?'Pago parcial':'Sin abonos'):'Pagada');
    const type=(r.reservationKind==='exclusive'||r.space==='Local exclusivo')?'Evento / reserva exclusiva':'Alquiler por hora';
    const missing=Math.max(0,paid-sum(entries,entry=>entry.amount));
    const pendingEntries=entries.filter(entry=>!window.paymentIsInvoiced(entry.payment)),documented=entries.filter(entry=>window.paymentIsInvoiced(entry.payment));
    const detailOpen=expanded.has(String(r.id))||['to_invoice','invoiced'].includes(tab);
    const visibleEntries=tab==='to_invoice'?pendingEntries:(tab==='invoiced'?documented:entries);
    const chronology=[...visibleEntries].sort((a,b)=>String(a.payment.occurredAt||a.payment.createdAt||a.payment.date||'').localeCompare(String(b.payment.occurredAt||b.payment.createdAt||b.payment.date||'')));
    return `<article class="operation-card" data-operation-id="${esc(r.id)}"><div class="operation-heading"><div><span class="operation-code">${esc(r.code||'Reserva')} · ${esc(type)}</span><h2>${esc(client.name)}</h2><p>${esc(r.courtType||r.space||'Reserva')}${r.siteName?' / '+esc(r.siteName):''} · ${esc(window.ElevaLegacy.format.fmtScheduled(r.eventDate,r.startTime))}${r.endTime?'–'+esc(r.endTime):''}</p></div><span class="operation-state ${active&&balance<=0.001?'settled':'outstanding'}">${esc(label)}</span></div><dl class="operation-balances"><div><dt>Total</dt><dd>${cash(total)}</dd></div><div><dt>Abonado</dt><dd>${cash(paid)}</dd></div><div><dt>Por cobrar</dt><dd>${cash(balance)}</dd></div></dl>${window.canViewPaymentBilling()?`<p class="operation-documents-summary">Abonos sin comprobante: <b>${cash(sum(pendingEntries,e=>e.amount))}</b> · Con comprobante: <b>${cash(sum(documented,e=>e.amount))}</b></p>`:''}${outcomeHTML(operation)}<div class="operation-actions">${window.hasPermission('issue_billing')&&pendingEntries.length?`<button type="button" class="operation-button operation-group-prepare" data-reservation-id="${esc(r.id)}" onclick="openGroupedBilling(this.dataset.reservationId)">Preparar comprobante · ${cash(sum(pendingEntries,e=>e.payment.amount))}</button>`:''}${active&&balance>0.001&&window.hasPermission('register_payments')?`<button type="button" class="operation-button operation-collect" data-reservation-id="${esc(r.id)}" onclick="openPaymentSheet(this.dataset.reservationId)">Registrar pago</button>`:''}<button type="button" class="operation-button" data-reservation-id="${esc(r.id)}" data-open-account onclick="openOperationAccount(this.dataset.reservationId)">Ver cuenta</button><button type="button" class="operation-button" data-reservation-id="${esc(r.id)}" onclick="openOperationTicket(this.dataset.reservationId)">Ticket interno</button></div><details data-operation-history="${esc(r.id)}" ${detailOpen?'open':''}><summary>Abonos y comprobantes · ${visibleEntries.length} pago${visibleEntries.length===1?'':'s'}</summary><div class="operation-history">${chronology.map(entryHTML).join('')}${missing>0.001&&!['to_invoice','invoiced'].includes(tab)?`<p class="operation-history-note">Cobro previo sin movimiento individual: ${cash(missing)}. Incluido en Abonado.</p>`:''}${!chronology.length&&missing<=0.001?'<p class="operation-history-note">Todavía no hay abonos registrados en esta operación.</p>':''}</div></details></article>`;
  }
  function unappliedHTML(payment){
    const client=window.paymentClient(payment),amount=window.paymentUnappliedAmount(payment);
    return `<article class="operation-card operation-unapplied"><div class="operation-heading"><div><span class="operation-code">${esc(payment.code||'Pago')} · Dinero sin aplicar</span><h2>${esc(client.name)}</h2><p>Sin reserva asignada a este importe</p></div><strong>${cash(amount)}</strong></div><p class="operation-history-note">Pago recibido: ${cash(payment.amount)} · Sin aplicar: ${cash(amount)}. Este importe aún no reduce el saldo de una reserva.</p>${entryHTML({payment,amount})}${window.hasPermission('register_payments')?`<button type="button" class="operation-button" data-client-id="${esc(payment.clientId)}" onclick="openClientUnappliedApply(this.dataset.clientId)">Aplicar a reservas</button>`:''}</article>`;
  }
  function render(tab,sort){
    const {operations,payments,unapplied}=data();let rows=operations,extras=[];
    if(tab==='receivable')rows=rows.filter(o=>o.active&&o.balance>0.001);
    if(tab==='paid')rows=rows.filter(o=>o.active&&o.total>0&&o.balance<=0.001);
    if(tab==='unapplied'){rows=[];extras=unapplied;}
    if(tab==='refunds')rows=rows.filter(o=>o.refund>0||o.pendingRefund);
    if(tab==='cancelled_funds')rows=rows.filter(o=>!o.active&&o.paid>0);
    if(['to_invoice','invoiced'].includes(tab)){
      const matches=p=>tab==='to_invoice'?!window.paymentIsInvoiced(p):window.paymentIsInvoiced(p);
      rows=rows.filter(o=>o.entries.some(entry=>matches(entry.payment)));extras=unapplied.filter(matches);
    }
    const query=(document.getElementById('collectionSearch')?.value||'').trim().toLocaleLowerCase('es-PE');
    const paymentTerms=p=>[p.code,p.method,p.billingNumber,p.billingType,window.paymentClient(p).name].filter(Boolean).join(' ');
    if(query){rows=rows.filter(o=>[o.client.name,o.reservation.code,o.reservation.courtType,o.reservation.space,o.reservation.eventDate,...o.entries.map(e=>paymentTerms(e.payment))].filter(Boolean).join(' ').toLocaleLowerCase('es-PE').includes(query));extras=extras.filter(p=>paymentTerms(p).toLocaleLowerCase('es-PE').includes(query));}
    const collator=new Intl.Collator('es',{sensitivity:'base'}),metric=o=>['to_invoice','invoiced'].includes(tab)?sum(o.entries.filter(e=>tab==='to_invoice'?!window.paymentIsInvoiced(e.payment):window.paymentIsInvoiced(e.payment)),e=>e.amount):(tab==='paid'?o.total:o.balance);
    rows=[...rows].sort((a,b)=>{
      if(sort==='az'||sort==='za')return collator.compare(a.client.name,b.client.name)*(sort==='za'?-1:1);
      if(sort==='amount_desc'||sort==='amount_asc')return (metric(a)-metric(b))*(sort==='amount_desc'?-1:1);
      if(sort==='priority')return String(window.reservationDueDate(a.reservation)).localeCompare(String(window.reservationDueDate(b.reservation)))||b.balance-a.balance;
      return String(a.reservation.eventDate||'').localeCompare(String(b.reservation.eventDate||''))*(sort==='oldest'?1:-1);
    });
    let value=tab==='receivable'?sum(rows,o=>o.balance):sum(rows,o=>o.total),label=tab==='receivable'?'Por cobrar':'Total de operaciones';
    if(tab==='unapplied'){value=sum(extras,p=>window.paymentUnappliedAmount(p));label='Sin aplicar';}
    if(tab==='cancelled_funds'){value=sum(rows,o=>Number(window.ElevaCancellation?.funds(o.reservation.id)?.pending_amount||0));label='Saldo del cliente pendiente de resolver';}
    if(tab==='refunds'){value=sum(rows,o=>o.refund);label='Reembolsado · las solicitudes pendientes no se suman';}
    if(['to_invoice','invoiced'].includes(tab)){const ids=new Set([...rows.flatMap(o=>o.entries.filter(e=>tab==='to_invoice'?!window.paymentIsInvoiced(e.payment):window.paymentIsInvoiced(e.payment)).map(e=>e.payment.id)),...extras.map(p=>p.id)]);value=sum(payments.filter(p=>ids.has(p.id)),p=>p.amount);label='Pagos únicos';}
    document.getElementById('pendingSummary').innerHTML=`<b>${cash(value)}</b> · ${esc(label)} · ${rows.length} operación${rows.length===1?'':'es'}${extras.length?` · ${extras.length} pago${extras.length===1?'':'s'} sin aplicar`:''}`;
    const empty=tab==='receivable'?'No hay saldos pendientes.':(tab==='paid'?'No hay operaciones pagadas.':'No hay registros en esta vista.');
    document.getElementById('pendingList').innerHTML=rows.map(o=>cardHTML(o,tab)).join('')+extras.map(unappliedHTML).join('')||`<div class="pending-empty">${empty}</div>`;
  }
  document.addEventListener('toggle',event=>{const details=event.target;if(!details.matches?.('details[data-operation-history]'))return;const id=details.dataset.operationHistory;if(details.open)expanded.add(id);else expanded.delete(id);},true);
  function clientHTML(clientId){
    const {operations,unapplied}=data(),rows=operations.filter(o=>String(o.reservation.clientId)===String(clientId)),active=rows.filter(o=>o.active),extras=unapplied.filter(p=>String(p.clientId)===String(clientId));
    return `<div class="collection-client-overview"><h3>Estado de cuenta del cliente</h3><dl class="operation-balances"><div><dt>Total de operaciones</dt><dd>${cash(sum(active,o=>o.total))}</dd></div><div><dt>Abonado</dt><dd>${cash(sum(active,o=>o.paid))}</dd></div><div><dt>Por cobrar</dt><dd>${cash(sum(active,o=>o.balance))}</dd></div></dl></div>${active.some(o=>o.balance>0.001)&&window.hasPermission('register_payments')?`<button type="button" class="operation-button operation-collect" data-client-id="${esc(clientId)}" onclick="openClientPayment(this.dataset.clientId)">Registrar abono del cliente</button>`:''}<div class="collection-payment-history"><h3>Operaciones, abonos y comprobantes</h3>${rows.map(o=>cardHTML(o,'all_operations')).join('')||'<p class="operation-history-note">No hay operaciones registradas.</p>'}${extras.map(unappliedHTML).join('')}</div>`;
  }
  window.ElevaCollectionOperations={data,counts,render,clientHTML,accountHTML:id=>{const operation=data().operations.find(o=>String(o.reservation.id)===String(id));return operation?cardHTML(operation,'all_operations'):null;}};
})();
