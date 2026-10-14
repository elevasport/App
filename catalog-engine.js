/* Business configuration and deterministic quotations; no persistence or session logic. */
(() => {
  const fail=message=>{throw new Error(message);};
  const minute=value=>{if(!/^\d{2}:\d{2}$/.test(String(value)))fail('Escribe una hora válida.');const [h,m]=value.split(':').map(Number);if(h>24||m>59||(h===24&&m!==0))fail('Escribe una hora válida.');return h*60+m;};
  const money=value=>Math.round(value*100)/100;
  function resourceSports(catalog,resource){return Array.isArray(resource.sportIds)?[...resource.sportIds]:[...new Set(catalog.offerings.filter(o=>o.resourceIds.includes(resource.id)).map(o=>catalog.services.find(s=>s.id===o.serviceId)?.sportId).filter(Boolean))];}
  function pricing(p,unit){
    const valid=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=10000000;
    if(!p||!['flat','bands'].includes(p.mode))fail('Selecciona una modalidad de tarifa.');
    if(p.mode==='flat'){if(!valid(p.rate))fail('El precio debe ser un importe válido, mayor o igual a cero.');return;}
    if(unit!=='hour')fail('Las franjas horarias requieren un servicio por hora.');
    if(!Array.isArray(p.bands)||!p.bands.length||p.bands.length>24)fail('Agrega las franjas horarias.');
    let end=0;for(const band of p.bands){const a=minute(band.start),b=minute(band.end);if(a!==end||b<=a||!valid(band.rate))fail('Las franjas deben cubrir de 00:00 a 24:00, sin huecos ni cruces.');if(band.label!==undefined&&(typeof band.label!=='string'||band.label.length>40))fail('El nombre del turno debe tener hasta 40 caracteres.');end=b;}
    if(end!==1440)fail('Las franjas deben cubrir de 00:00 a 24:00.');
  }
  function schedule(rows){
    if(!rows||Object.keys(rows).length!==7)fail('Configura los siete días de la sede.');
    for(let day=0;day<7;day++){const row=rows[day];if(!row||typeof row.active!=='boolean')fail('Horario de sede incompleto.');const a=minute(row.open),b=minute(row.close);if(a===1440||a===b)fail('La apertura y el cierre deben ser diferentes. Usa 24:00 para medianoche.');}
  }
  function validate(catalog){
    if(!catalog||!['sites','sports','resources','services','offerings'].every(key=>Array.isArray(catalog[key])))fail('Configuración incompleta.');
    for(const key of ['sites','sports','resources','services','offerings']){if(catalog[key].length>1000)fail('La configuración es demasiado grande.');const ids=new Set(),names=new Set();for(const row of catalog[key]){if(row.id===undefined||ids.has(String(row.id)))fail('No repitas identificadores.');ids.add(String(row.id));if(typeof row.name!=='string'||!row.name.trim()||row.name.length>100||typeof row.active!=='boolean')fail('Escribe nombres de hasta 100 caracteres e indica su estado.');const name=(key==='resources'?row.siteId+':':'')+row.name.trim().toLocaleLowerCase('es');if(names.has(name))fail('No repitas nombres en la misma sección o sede.');names.add(name);}}
    if(!catalog.sites.some(s=>s.active))fail('Mantén al menos una sede activa.');
    catalog.sites.forEach(site=>{if(typeof site.address!=='string'||site.address.length>250)fail('Dirección inválida.');schedule(site.schedule);});
    catalog.resources.forEach(r=>{if(!Number.isInteger(r.id)||r.id<1||r.id>32767||!catalog.sites.some(s=>s.id===r.siteId))fail('El espacio necesita una sede válida.');});
    catalog.resources.forEach(r=>{if(r.sportIds!==undefined&&(!Array.isArray(r.sportIds)||new Set(r.sportIds).size!==r.sportIds.length||r.sportIds.some(id=>!catalog.sports.some(s=>s.id===id))))fail('Selecciona deportes válidos para cada espacio, sin repetir.');});
    catalog.services.forEach(s=>{if(!/^[a-z][a-z0-9_]{0,63}$/.test(s.id)||!['court','event'].includes(s.kind)||!['hour','fixed'].includes(s.unit)||s.sportId&&!catalog.sports.some(d=>d.id===s.sportId))fail('Servicio inválido.');});
    catalog.offerings.forEach(o=>{const site=catalog.sites.find(s=>s.id===o.siteId),service=catalog.services.find(s=>s.id===o.serviceId);if(!site||!service||!Array.isArray(o.resourceIds)||!o.resourceIds.length||new Set(o.resourceIds).size!==o.resourceIds.length||o.resourceIds.some(id=>!catalog.resources.some(r=>r.id===id&&r.siteId===o.siteId)))fail('Selecciona espacios de la misma sede, sin repetir.');if(catalog.resourceSportsSupported&&o.active&&service.sportId&&o.resourceIds.some(id=>!resourceSports(catalog,catalog.resources.find(r=>r.id===id)).includes(service.sportId)))fail('Una tarifa usa un espacio que no admite ese deporte. Revisa los deportes del espacio o desactiva esa tarifa.');pricing(o.pricing,service.unit);});
    return catalog;
  }
  function quote(catalog,input){
    const o=catalog.offerings.find(o=>o.id===input.offeringId),site=catalog.sites.find(s=>s.id===o?.siteId),service=catalog.services.find(s=>s.id===o?.serviceId);
    if(!o?.active||!site?.active||!service?.active||service.sportId&&!catalog.sports.find(s=>s.id===service.sportId)?.active||o.resourceIds.some(id=>!catalog.resources.find(r=>r.id===id)?.active))fail('El servicio o sus espacios están inactivos.');
    if(catalog.resourceSportsSupported&&service.sportId&&o.resourceIds.some(id=>!resourceSports(catalog,catalog.resources.find(r=>r.id===id)).includes(service.sportId)))fail('El espacio no está habilitado para este deporte.');
    const date=new Date(input.date+'T12:00:00Z');if(!/^\d{4}-\d{2}-\d{2}$/.test(input.date)||!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==input.date)fail('Selecciona una fecha válida.');
    const start=minute(input.start),rawEnd=minute(input.end);if(start===1440)fail('La hora de inicio debe ser anterior a medianoche.');const end=rawEnd<=start?rawEnd+1440:rawEnd;
    if(end-start>1440||start===rawEnd)fail('La duración debe ser mayor a cero y menor a 24 horas.');
    pricing(o.pricing,service.unit);const segments=[];let sum=0;
    for(let at=start;at<end;){const offset=Math.floor(at/1440),clock=at%1440,weekday=(date.getUTCDay()+offset)%7,day=site.schedule[weekday];const open=minute(day.open),close=minute(day.close);const nextClose=close<open?close+1440:close;
      // Overnight opening belongs to the previous day's schedule.
      const previous=site.schedule[(weekday+6)%7],previousOpen=previous&&minute(previous.open),previousClose=previous&&minute(previous.close);
      const within=day.active&&clock>=open&&clock<Math.min(nextClose,1440),spill=previous?.active&&previousClose<previousOpen&&clock<previousClose;
      if(!within&&!spill)fail('La reserva está fuera del horario de la sede.');
      const scheduleEnd=within?Math.min(nextClose,1440):previousClose;
      const band=o.pricing.mode==='bands'?o.pricing.bands.find(b=>clock>=minute(b.start)&&clock<minute(b.end)):null;
      const limit=Math.min(end,offset*1440+scheduleEnd,offset*1440+(band?minute(band.end):1440));if(limit<=at)fail('Horario incompatible.');
      const rate=band?band.rate:o.pricing.rate,amount=service.unit==='fixed'?0:(limit-at)/60*rate;sum+=amount;segments.push({start:at,end:limit,rate,amount:money(amount)});at=limit;
    }
    if(service.unit==='fixed')sum=o.pricing.rate;
    const total=money(sum);return {total,hours:(end-start)/60,segments,siteName:site.name,serviceName:service.name,offeringName:o.name,unit:service.unit,resourceIds:[...o.resourceIds],resourceNames:o.resourceIds.map(id=>catalog.resources.find(r=>r.id===id).name)};
  }
  function conflict(reservations,input,quote){const start=Date.parse(input.date+'T'+input.start+':00-05:00'),end=start+quote.hours*3600000;return reservations.find(r=>!['cancelled','no_show','paused'].includes(r.status)&&!r.seriesPaused&&(r.resourceIds||r.physicalCourts?.map(c=>Number(c.replace(/\D/g,'')))||[]).some(id=>quote.resourceIds.includes(id))&&(()=>{const a=Date.parse(r.eventDate+'T'+r.startTime+':00-05:00');let b=Date.parse(r.eventDate+'T'+r.endTime+':00-05:00');if(b<=a)b+=86400000;return start<b&&a<end;})());}
  function turn(catalog,input){const o=catalog.offerings.find(o=>o.id===input.offeringId),q=quote(catalog,input);if(o.pricing.mode==='flat')return 'Tarifa única';const labels=[...new Set(q.segments.map(segment=>{const band=o.pricing.bands.find(b=>segment.start%1440>=minute(b.start)&&segment.start%1440<minute(b.end));return band.label?.trim()||band.start+'–'+band.end;}))];return labels.length>1?'Horario combinado · '+labels.join(' + '):labels[0];}
  function seed(settings={}){const siteId='93000000-0000-0000-0000-000000000001',sportId='93000000-0000-0000-0000-000000000002';const schedule=structuredClone(settings.schedule||Object.fromEntries(Array.from({length:7},(_,i)=>[i,{active:true,open:'08:00',close:'24:00'}])));Object.values(schedule).forEach(d=>{if(d.close==='00:00')d.close='24:00';});return {version:1,sites:[{id:siteId,name:'Sede principal',address:'',active:true,schedule}],sports:[{id:sportId,name:'Fútbol',active:true}],resources:[1,2,3].map(id=>({id,siteId,name:'Cancha '+id,active:true})),services:[{id:'fut6',name:'FUT 6',sportId,kind:'court',unit:'hour',active:true},{id:'fut9',name:'FUT 9',sportId,kind:'court',unit:'hour',active:true},{id:'full',name:'Evento exclusivo',sportId:null,kind:'event',unit:'fixed',active:true}],offerings:[...[1,2,3].map(id=>({id:'94000000-0000-0000-0000-'+String(id).padStart(12,'0'),siteId,serviceId:'fut6',name:'FUT 6 · Cancha '+id,resourceIds:[id],active:true,pricing:{mode:'flat',rate:Number(settings.fut6||50)}})),{id:'94000000-0000-0000-0000-000000000004',siteId,serviceId:'fut9',name:'FUT 9 · Canchas combinadas',resourceIds:[1,2,3],active:true,pricing:{mode:'flat',rate:Number(settings.fut9||120)}},{id:'94000000-0000-0000-0000-000000000005',siteId,serviceId:'full',name:'Evento · Local completo',resourceIds:[1,2,3],active:true,pricing:{mode:'flat',rate:Number(settings.exclusive||2000)}}]};}
  const seedCatalog=seed;
  function categorizedSeed(settings){const catalog=seedCatalog(settings);catalog.resourceSportsSupported=true;catalog.resources.forEach(r=>r.sportIds=resourceSports(catalog,r));return catalog;}
  globalThis.ElevaCatalogEngine={validate,pricing,schedule,quote,conflict,seed:categorizedSeed,resourceSports,minute,turn};
})();
