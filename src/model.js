export const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const formatCode=value=>({'FUT 6':'fut6','FUT 9':'fut9','FULL':'full','Local exclusivo':'full'}[value]||value);
export const formatName=value=>({fut6:'FUT 6',fut9:'FUT 9',full:'FULL'}[value]||value);
export const courtIds=row=>row.resourceIds?.length?[...row.resourceIds]:(row.physicalCourts?.length?row.physicalCourts:row.physicalCourt?[row.physicalCourt]:['Cancha 1','Cancha 2','Cancha 3']).map(x=>Number(String(x).replace(/\D/g,'')));
export const courtNames=rows=>rows.map(x=>`Cancha ${x.court_id ?? x}`);
export const number=value=>Number(value||0);
export const rateSource=value=>({general:'standard',package:'standard',client_special:'client'}[value]||value||null);
export function instant(date,time){return date&&time?`${date}T${time.slice(0,8).length===5?time+':00':time}-05:00`:null;}
export function bookingInstants(row){const start=instant(row.eventDate,row.startTime);let end=instant(row.eventDate,row.endTime);if(start&&end&&new Date(end)<=new Date(start))end=new Date(new Date(end).getTime()+86400000).toISOString();return {starts_at:start,ends_at:end};}
export function localParts(value){if(!value)return {date:'',time:''};const date=new Date(new Date(value).getTime()-5*3600000);return {date:date.toISOString().slice(0,10),time:date.toISOString().slice(11,16)};}
export function reservationRow(r){
  const internal=r.reservationKind==='internal';
  return {id:r.id,kind:r.reservationKind,client_id:internal?null:r.clientId,quote_id:r.quoteId||null,series_block_id:r.seriesBlockId||null,is_series_exception:!!r.seriesException,
    format_code:r.formatCode||(r.reservationKind==='exclusive'?'full':formatCode(r.courtType||'FUT 6')),...bookingInstants(r),status:r.seriesPaused?'paused':r.status,status_before_pause:r.seriesPaused?r.seriesPreviousStatus:null,event_type:r.eventType||null,attendees:r.people ?? null,
    internal_use_type:internal?r.internalUseType:null,internal_title:internal?r.internalTitle:null,internal_responsible:internal?r.internalResponsible:null,
    hourly_rate:r.courtRate ?? null,rate_source:rateSource(r.rateSource),
    base_amount:internal?0:number(r.baseTotal ?? r.total),non_taxable_amount:internal?0:number(r.nonTaxableExtra),apply_tax:internal?false:!!r.taxApplied,tax_rate:number(r.taxRate),payment_plan:internal?null:r.quotePaymentPlan||null,payment_due_on:internal?null:r.paymentDueDate||r.eventDate,notes:r.notes||null};
}
export function quoteRow(q){return {id:q.id,client_id:q.clientId,kind:q.mode,format_code:q.mode==='court'?formatCode(q.courtType):null,event_type:q.eventType||null,attendees:q.people ?? null,...(q.eventDate&&q.startTime&&q.endTime?bookingInstants(q):{starts_at:null,ends_at:null}),rental_amount:number(q.rent),guarantee_amount:number(q.guarantee),single_payment_discount:number(q.discount),apply_tax:!!q.applyIgv,tax_rate:number(q.taxRate),extra_hour_price:number(q.extraHour),package_snapshot:q.packageSnapshot||null};}
export function seriesRow(s){return {id:s.id,kind:s.reservationKind,client_id:s.reservationKind==='internal'?null:s.clientId,internal_use_type:s.internalUseType||null,internal_title:s.internalTitle||null,internal_responsible:s.internalResponsible||null,starts_on:s.startDate,ends_on:s.endDate,frequency:s.frequency,billing_mode:s.billing,monthly_base_amount:s.billing==='monthly'?number(s.monthlyAmount):null,apply_tax:!!s.applyIgv,tax_rate:number(s.taxRate),status:s.status,status_before_pause:s.statusBeforePause||null,notes:s.notes||null};}
export function blockRow(b,i){return {id:b.id,position:i+1,format_code:formatCode(b.courtType),starts_at:b.startTime,duration_minutes:b.durationMinutes??Math.round(number(b.hours||b.duration)*60),hourly_rate:number(b.courtRate),rate_source:rateSource(b.rateSource)||'standard',weekdays:b.weekdays,court_ids:courtIds(b)};}
export function movementRow(m,methods){const method=methods.find(p=>p.name===m.method);return {id:m.id,kind:m.type,amount:number(m.amount),occurred_at:m.occurredAt,account_id:m.type==='transfer'?null:m.accountId,source_account_id:m.sourceAccountId||null,destination_account_id:m.destinationAccountId||null,payment_method_id:m.type==='transfer'?null:method?.id,client_id:m.type==='payment'?m.clientId:null,expense_category_id:m.type==='expense'?m.categoryId:null,expense_area_id:m.type==='expense'?m.areaId:null,expense_document_type:m.type==='expense'?m.documentType||null:null,expense_document_number:m.type==='expense'?m.documentNumber||null:null,party:m.party||null,detail:m.detail||null,attachment_id:m.attachmentId||null};}
export function outcomesArgs(r){return {reservation_id:r.id,status:r.status,disposition:r.paymentDisposition||'normal',refund_amount:number(r.refundedAmount),credit_amount:number(r.creditAmount),retained_amount:number(r.retainedAmount),refund_account_id:r.refundAccountId||null,reason:r.outcomeReason||null,note:r.outcomeNote||null};}
export function controlledDatabaseError(error){
  if(error?.code==='42501')return 'No tienes permiso para esta operación.';
  if(error?.code==='23505')return 'Ya existe ese registro. Actualiza la pantalla antes de continuar.';
  if(error?.code==='23503')return 'El registro está relacionado con otros datos y no se puede eliminar.';
  if(error?.code==='P0001')return error.message;
  if(['23514','23502','22P02'].includes(error?.code))return 'Revisa los campos y los importes ingresados.';
  return 'No se pudo guardar. Comprueba la conexión y vuelve a intentarlo.';
}
