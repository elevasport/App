/* Calendar presentation only: uses the loaded repository state, never writes bookings. */
(() => {
  const M=window.ElevaCalendarModel,legacy=window.ElevaLegacy,esc=legacy.format.escapeHtml,cash=legacy.format.money;
  const by=id=>document.getElementById(id),sheet=by('calendarSheet'),surface=sheet.querySelector('.sheet');
  const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Lima',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const allowed=()=>window.ElevaSessionUser?.active&&window.roleCanViewPage('reservations');
  let data=null,owner=null,version=0,renderedVersion=-1;
  const ui={date:today(),view:'month',site:'',court:''};
  const savedScroll=new Map();
  const old=document.createElement('div');old.id='legacyCalendarContent';while(surface.firstChild)old.append(surface.firstChild);surface.append(old);
  const root=document.createElement('div');root.id='elevaCalendarContent';root.hidden=true;
  root.innerHTML=`<header class="ec-header"><div class="ec-heading"><button type="button" class="ec-icon" data-cal-action="back" aria-label="Volver a la agenda">‹</button><div><div class="eyebrow">Reservas</div><h2>Calendario</h2></div><button type="button" class="ec-today" data-cal-action="today">Hoy</button></div><div class="ec-datebar"><button type="button" class="ec-icon" data-cal-action="previous" aria-label="Período anterior">‹</button><button type="button" id="ecDateTitle" class="ec-date-title" data-cal-action="picker" aria-expanded="false" aria-controls="ecDatePicker"></button><button type="button" class="ec-icon" data-cal-action="next" aria-label="Período siguiente">›</button></div><form id="ecDatePicker" class="ec-picker" hidden><label>Mes<select name="month">${Array.from({length:12},(_,i)=>`<option value="${i+1}">${new Intl.DateTimeFormat('es-PE',{month:'long',timeZone:'UTC'}).format(new Date(Date.UTC(2026,i,1)))}</option>`).join('')}</select></label><label>Año<input name="year" type="number" min="1900" max="2200" required></label><button class="ec-today" type="submit">Ir</button></form><div class="ec-tabs" role="tablist" aria-label="Vista de calendario"><button type="button" role="tab" data-cal-view="month">Mes</button><button type="button" role="tab" data-cal-view="week">Semana</button><button type="button" role="tab" data-cal-view="day">Día</button></div><div class="ec-filters" id="ecFilters"></div><p id="ecStatus" class="ec-status" role="status" aria-live="polite"></p></header><div id="ecContent" class="ec-content"></div><footer class="ec-footer"><span><i class="ec-key occupied"></i> Reserva</span><span><i class="ec-key internal"></i> Actividad / bloqueo</span><span><i class="ec-key closed"></i> Cerrado</span><button type="button" data-cal-action="back">Volver a la agenda</button></footer>`;
  surface.append(root);
  const filters=document.createElement('div');filters.id='reservationLocationFilters';filters.className='ec-filters ec-agenda-filters';
  by('reservationViewSwitch').before(filters);
  function load(){data=M.build(legacy.getState(),window.businessResources());version++;return data;}
  const model=()=>data||load();
  function normalize(){const m=model();if(ui.site&&!m.sites.some(s=>s.id===ui.site))ui.site='';if(ui.court&&!m.resources.some(r=>r.key===ui.court&&(!ui.site||r.siteId===ui.site)))ui.court='';}
  function filterHTML(){const m=model(),rs=m.resourcesFor({site:ui.site});return `<label>Sede<select data-cal-filter="site"><option value="">Todas las sedes</option>${m.sites.map(s=>`<option value="${esc(s.id)}" ${ui.site===s.id?'selected':''}>${esc(s.name)}${s.active===false?' · Inactiva':''}</option>`).join('')}</select></label><label>Cancha física<select data-cal-filter="court"><option value="">Todas las canchas</option>${rs.map(r=>`<option value="${esc(r.key)}" ${ui.court===r.key?'selected':''}>${esc(r.name)}${!ui.site?' · '+esc(m.sites.find(s=>s.id===r.siteId)?.name||'Sin sede'):''}${r.active===false?' · Inactiva':''}</option>`).join('')}</select></label>`;}
  function syncFilters(){normalize();const html=filterHTML();for(const node of [filters,by('ecFilters')]){if(node.innerHTML!==html)node.innerHTML=html;}}
  const dateLabel=date=>new Intl.DateTimeFormat('es-PE',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(date+'T12:00:00Z'));
  const monthLabel=date=>new Intl.DateTimeFormat('es-PE',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(date+'T12:00:00Z'));
  function stateLabel(r){return window.reservationStatusLabel(r);}
  function payment(r){if(window.isInternalReservation(r))return 'Sin cobro';if(!M.occupies(r))return window.reservationRefundLabel(r);if(Number(r.total)===0)return 'Sin importe';const pending=Number.isFinite(Number(r.balance))?Number(r.balance):Math.max(0,Number(r.total||0)-Number(r.advance||0));return pending>0?`Por pagar ${cash(pending)}`:'Pagada';}
  function rememberScroll(){const viewport=by('ecTimelineViewport');if(viewport)savedScroll.set(ui.view+':'+ui.date,{top:viewport.scrollTop,left:viewport.scrollLeft});}
  function agenda(date=ui.date){if(!allowed())return;rememberScroll();ui.date=date;window.closeCalendarView();window.selectReservationFocusDate(date);window.setReservationWorkspace('agenda');}
  function detail(id){if(allowed()&&model().records.has(String(id)))window.openReservationDetail(id);}
  function monthHTML(){
    const first=ui.date.slice(0,7)+'-01',start=M.weekStart(first),next=M.addMonths(first,1),days=Math.ceil((M.midnight(next)-M.midnight(start))/M.DAY/7)*7;
    let html='<div class="ec-month-weekdays" aria-hidden="true">'+['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'].map(d=>`<span>${d}</span>`).join('')+'</div><div class="ec-month-grid" role="group" aria-label="'+esc(monthLabel(ui.date))+'">';
    for(let n=0;n<days;n++){
      const date=M.addDays(start,n),events=model().events(date,ui),occupied=events.filter(e=>M.occupies(e.r)),count=occupied.length,other=events.length-count;
      html+=`<button type="button" class="ec-month-day ${date.slice(0,7)!==ui.date.slice(0,7)?'adjacent':''} ${date===today()?'today':''} ${date===ui.date?'selected':''}" data-cal-date="${date}" aria-label="${esc(dateLabel(date))}: ${count} reservas con ocupación${other?', '+other+' canceladas o sin asistencia':''}. Abrir agenda" ${date===ui.date?'aria-current="date"':''}><b>${Number(date.slice(8))}</b>${count?`<span class="ec-month-count"><i></i>${count}<span class="sr-only"> reservas</span></span>`:'<span class="ec-month-spacer"></span>'}${other?'<small>Historial</small>':''}</button>`;
    }
    const count=Array.from({length:days},(_,n)=>model().events(M.addDays(start,n),ui).filter(e=>M.occupies(e.r)).length).reduce((a,b)=>a+b,0);
    return html+'</div><p class="ec-note">Toca un día para abrir su agenda. Los indicadores cuentan reservas con ocupación; un mismo alquiler de varias canchas se cuenta una vez por día.</p>'+(!count?'<div class="ec-empty">No hay ocupaciones en este período para los filtros elegidos.</div>':'');
  }
  function eventHTML(e){
    const kind=window.isInternalReservation(e.r)?e.r.internalUseType==='maintenance'?'blocked':'internal':'reservation',short=e.end-e.start<45;
    const label=`${M.clock(e.start)}–${M.clock(e.end)} · ${e.location.courtLabel} · ${e.location.siteLabel} · ${e.location.client} · ${stateLabel(e.r)} · ${payment(e.r)}`;
    return `<button type="button" class="ec-event ${kind} ${short?'compact':''} ${e.conflict?'conflict':''}" data-cal-reservation="${esc(e.r.id)}" title="${esc(label)}" aria-label="${esc(label)}${e.conflict?'. Reservas simultáneas en esta cancha':''}" style="top:${e.start/60*60}px;height:${(e.end-e.start)/60*60}px;left:calc(${e.lane/e.laneCount*100}% + 3px);width:calc(${100/e.laneCount}% - 6px)"><span class="ec-event-time">${M.clock(e.start)}–${M.clock(e.end)}</span><b>${esc(short?e.location.courtLabel:e.location.client)}</b>${!short?`<span>${esc(e.location.courtLabel)}</span>${e.end-e.start>=90?`<small>${esc(e.location.siteLabel)}</small>`:''}`:''}${e.continues?'<i class="ec-continuation" aria-label="Continúa desde el día anterior">↳</i>':''}${e.overnight?'<i class="ec-continuation end" aria-label="Continúa al día siguiente">↪</i>':''}</button>`;
  }
  function shadeHTML(resource,date){const closed=M.closed(model().hours(resource,date));if(closed===null)return '<div class="ec-hours-unknown" aria-label="Horario no disponible"></div>';return closed.map(s=>`<div class="ec-closed" style="top:${s.start}px;height:${s.end-s.start}px" aria-label="Cerrado ${M.clock(s.start)}–${M.clock(s.end)}"></div>`).join('');}
  function agendaHTML(events){return `<details class="ec-day-agenda"><summary>Agenda del día · ${events.length} registros</summary>${events.length?events.map(e=>`<button type="button" class="ec-agenda-card" data-cal-reservation="${esc(e.r.id)}"><span class="ec-agenda-time">${M.clock(e.start)}<small>${M.clock(e.end)}${e.continues?' · continúa':''}</small></span><span><b>${esc(e.location.client)}</b><span>${esc(e.location.courtLabel)} · ${esc(e.location.siteLabel)}</span><small>${esc(e.location.format)}${e.r.code?' · '+esc(e.r.code):''}</small><small>${esc(stateLabel(e.r))} · ${esc(payment(e.r))}</small></span><span aria-hidden="true">›</span></button>`).join(''):'<p class="ec-empty">No hay reservas para este día.</p>'}</details>`;}
  function timelineHTML(){
    const m=model(),rs=m.resourcesFor(ui),isWeek=ui.view==='week',start=isWeek?M.weekStart(ui.date):ui.date,dates=isWeek?Array.from({length:7},(_,n)=>M.addDays(start,n)):[ui.date],columns=[];
    if(!rs.length)return '<div class="ec-empty">No hay canchas en los datos de la sede seleccionada.</div>';
    let unknown=0,total=0;
    for(const date of dates){
      const events=m.events(date,ui).filter(e=>M.occupies(e.r));total+=events.length;
      if(isWeek){
        const assigned=M.lanes(events.filter(e=>e.location.keys.some(k=>m.resourceMap.has(k))));
        const capacity=Math.max(1,...assigned.map(e=>e.laneCount));
        const allWindows=rs.map(r=>m.hours(r,date));unknown+=allWindows.filter(w=>w===null).length;
        // Shade as closed only when every displayed court is closed; blocks remain court-specific.
        const combined=allWindows.some(w=>w===null)?null:allWindows.flat().sort((a,b)=>a.start-b.start),closed=M.closed(combined);
        const shades=closed===null?'<div class="ec-hours-unknown"></div>':closed.map(s=>`<div class="ec-closed" style="top:${s.start}px;height:${s.end-s.start}px"></div>`).join('');
        columns.push({width:Math.max(170,capacity*112),header:`<button type="button" data-cal-date="${date}" class="ec-column-date ${date===today()?'today':''}"><span>${new Intl.DateTimeFormat('es-PE',{weekday:'short',timeZone:'UTC'}).format(new Date(date+'T12:00:00Z'))}</span><b>${Number(date.slice(8))}</b><small>${events.length} reservas</small></button>`,body:shades+assigned.map(eventHTML).join('')});
      }else for(const resource of rs){
        if(m.hours(resource,date)===null)unknown++;
        const assigned=M.lanes(events.filter(e=>e.location.keys.includes(resource.key))),capacity=Math.max(1,...assigned.map(e=>e.laneCount));
        columns.push({width:Math.max(156,capacity*112),header:`<b>${esc(resource.name)}</b><span>${esc(m.sites.find(s=>s.id===resource.siteId)?.name||'Sede no identificada')}</span>`,body:shadeHTML(resource,date)+assigned.map(e=>eventHTML({...e,conflict:e.laneCount>1})).join('')});
      }
    }
    if(!columns.length)return '<div class="ec-empty">No hay canchas disponibles en los datos de la sede seleccionada.</div>';
    const cols='54px '+columns.map(c=>'minmax('+c.width+'px,1fr)').join(' '),ticks=Array.from({length:24},(_,h)=>`<span style="top:${h*60}px">${String(h).padStart(2,'0')}:00</span>`).join('');
    const unmapped=dates.flatMap(d=>m.events(d,ui)).filter(e=>M.occupies(e.r)&&!e.location.keys.some(k=>m.resourceMap.has(k))).length;
    return `<div class="ec-timeline-caption">${isWeek?'Cada bloque indica su cancha. Desliza entre días.':'Una columna por cancha física. Desliza para ver otras canchas.'}</div><div id="ecTimelineViewport" class="ec-timeline-viewport" tabindex="0" aria-label="Calendario por horas; desplazamiento horizontal y vertical"><div class="ec-timeline" style="grid-template-columns:${cols}"><div class="ec-time-heading">Hora</div>${columns.map(c=>`<div class="ec-column-heading">${c.header}</div>`).join('')}<div class="ec-times">${ticks}<span style="top:1418px">24:00</span></div>${columns.map(c=>`<div class="ec-day-column">${c.body}</div>`).join('')}</div></div>${unknown?'<p class="ec-note ec-warning">Faltan horarios de algunas canchas o sedes. El fondo rayado no confirma disponibilidad.</p>':''}${unmapped?`<p class="ec-note ec-warning">${unmapped} reservas sin cancha física identificada. Se muestran en la agenda; no se asignan a una cancha por su formato deportivo.</p>`:''}${!total?'<p class="ec-note">Sin ocupaciones para estos filtros. Las franjas grises están fuera del horario de atención.</p>':''}${isWeek?'<p class="ec-note">En Semana, una franja clara solo indica que alguna cancha está en horario de atención. Usa Día y selecciona la cancha para consultar su ocupación.</p>':agendaHTML(m.events(ui.date,ui))}`;
  }
  function render(){
    if(!allowed())return;syncFilters();const selected=by('ecDateTitle');
    selected.textContent=(ui.view==='month'?monthLabel(ui.date):ui.view==='week'?dateLabel(M.weekStart(ui.date))+' – '+dateLabel(M.addDays(M.weekStart(ui.date),6)):dateLabel(ui.date))+' ▾';
    root.querySelectorAll('[data-cal-view]').forEach(b=>{const active=b.dataset.calView===ui.view;b.classList.toggle('active',active);b.setAttribute('aria-selected',String(active));});
    by('ecStatus').textContent=model().invalid.length?`${model().invalid.length} registros sin horario válido; no se representan como disponibles.`:'';
    by('ecContent').innerHTML=ui.view==='month'?monthHTML():timelineHTML();renderedVersion=version;
    const viewport=by('ecTimelineViewport');if(viewport){
      const scroll=savedScroll.get(ui.view+':'+ui.date);viewport.scrollLeft=scroll?.left||0;
      if(scroll)viewport.scrollTop=scroll.top;
      else{
        const events=model().events(ui.date,ui).filter(e=>M.occupies(e.r)),hours=model().resourcesFor(ui).flatMap(r=>model().hours(r,ui.date)||[]),first=events.length?Math.min(...events.map(e=>e.start)):hours.length?Math.min(...hours.map(h=>h.start)):480;
        viewport.scrollTop=Math.max(0,first-60);
        if(ui.view==='week'){const selected=viewport.querySelector(`[data-cal-date="${ui.date}"]`)?.closest('.ec-column-heading');if(selected)viewport.scrollLeft=Math.max(0,selected.getBoundingClientRect().left-viewport.getBoundingClientRect().left-54);}
      }
    }
  }
  function open(date){if(!allowed()){window.showToast('Este perfil no tiene acceso a Reservas.');return;}load();owner=window.ElevaSessionUser.id;const saved=legacy.getCalendarContext();ui.date=M.validDate(date)?date:saved.focusDate;normalize();old.hidden=true;root.hidden=false;sheet.classList.add('eleva-calendar');render();window.openSheet(sheet.id);root.querySelector('[data-cal-action=back]').focus();}
  function showLegacy(){old.hidden=false;root.hidden=true;sheet.classList.remove('eleva-calendar');}
  function filterChange(event){const input=event.target.closest('[data-cal-filter]');if(!input)return;rememberScroll();ui[input.dataset.calFilter]=input.value;if(input.dataset.calFilter==='site')ui.court='';syncFilters();window.renderReservationWorkspace();window.renderReservations();if(sheet.classList.contains('show')&&!root.hidden)render();}
  filters.addEventListener('change',filterChange);root.addEventListener('change',filterChange);
  root.addEventListener('click',event=>{
    const button=event.target.closest('button');if(!button)return;
    if(button.dataset.calReservation){detail(button.dataset.calReservation);return;}
    if(button.dataset.calDate){agenda(button.dataset.calDate);return;}
    if(button.dataset.calView){rememberScroll();ui.view=button.dataset.calView;render();return;}
    const action=button.dataset.calAction;
    if(action==='back'){agenda();return;}
    if(action==='picker'){const form=by('ecDatePicker');form.hidden=!form.hidden;by('ecDateTitle').setAttribute('aria-expanded',String(!form.hidden));form.elements.month.value=Number(ui.date.slice(5,7));form.elements.year.value=Number(ui.date.slice(0,4));if(!form.hidden)form.elements.month.focus();return;}
    if(action==='today'||action==='previous'||action==='next'){rememberScroll();const n=action==='previous'?-1:1;ui.date=action==='today'?today():ui.view==='month'?M.addMonths(ui.date,n):M.addDays(ui.date,n*(ui.view==='week'?7:1));render();}
  });
  by('ecDatePicker').addEventListener('submit',event=>{event.preventDefault();const form=event.currentTarget,y=Number(form.elements.year.value),m=Number(form.elements.month.value);if(!Number.isInteger(y)||y<1900||y>2200)return;rememberScroll();ui.date=String(y)+'-'+String(m).padStart(2,'0')+'-01';form.hidden=true;by('ecDateTitle').setAttribute('aria-expanded','false');render();});
  const close=window.closeCalendarView;window.closeCalendarView=function(){rememberScroll();close.apply(this,arguments);if(!root.hidden)window.selectReservationFocusDate(ui.date);};
  window.openCalendar=()=>open();window.openCalendarForDate=date=>open(date);
  const datePicker=window.openReservationDatePicker;window.openReservationDatePicker=function(){showLegacy();return datePicker.apply(this,arguments);};
  const calendarRender=window.renderCalendar;window.renderCalendar=function(){if(!root.hidden){load();if(sheet.classList.contains('show'))render();return;}return calendarRender.apply(this,arguments);};
  const oldRender=legacy.render;legacy.render=function(...args){
    if(owner&&owner!==window.ElevaSessionUser?.id){ui.site='';ui.court='';ui.date=today();savedScroll.clear();data=null;window.closeSheet(sheet.id);showLegacy();owner=null;}
    owner=window.ElevaSessionUser?.id||null;load();normalize();const result=oldRender.apply(this,args);filters.hidden=!allowed();by('reservationCalendarButton').hidden=!allowed();
    if(!allowed()){window.closeSheet(sheet.id);showLegacy();data=null;}else{syncFilters();if(!root.hidden&&sheet.classList.contains('show')&&renderedVersion!==version)render();}return result;
  };
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&sheet.classList.contains('show')&&!root.hidden&&!document.querySelector('.backdrop.show:not(#calendarSheet)'))agenda();});
  const loading=document.querySelector('.save-overlay');if(loading)new MutationObserver(()=>{if(!root.hidden)by('ecStatus').textContent=loading.hidden?'':'Actualizando datos…';}).observe(loading,{attributes:true,attributeFilter:['hidden']});
  window.ElevaReservationCalendar={open,render,model,getState:()=>({...ui}),matches:r=>model().matches(r,ui),occursOn:(r,date)=>model().occurs(r,date),location:r=>model().location(r),filterResources:rs=>{const keys=new Set(model().resourcesFor(ui).map(r=>r.key));return rs.filter(r=>keys.has(r.key));},dayTimes(r,date){const t=model().records.get(String(r.id))?.times;if(!t)return null;const start=M.midnight(date),end=start+M.DAY;if(t.start>=end||t.end<=start)return null;return {start:M.clock(Math.max(0,(t.start-start)/60000)),end:M.clock(Math.min(1440,(t.end-start)/60000)),continues:t.start<start,overnight:t.end>end};}};
})();
