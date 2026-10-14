/* Read-only projections of the existing reservation/catalog data. Peru has UTC-05. */
(() => {
  const DAY=86400000;
  const validDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(value||'')&&Number.isFinite(Date.parse(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;
  const minute=value=>/^\d{2}:\d{2}$/.test(value||'')&&Number(value.slice(0,2))<=24&&Number(value.slice(3))<60&&(value.slice(0,2)!=='24'||value.slice(3)==='00')?Number(value.slice(0,2))*60+Number(value.slice(3)):NaN;
  const clock=value=>String(Math.floor(Math.round(value)/60)).padStart(2,'0')+':'+String(Math.round(value)%60).padStart(2,'0');
  const midnight=date=>Date.parse(date+'T00:00:00-05:00');
  const dateAt=time=>new Date(time-5*3600000).toISOString().slice(0,10);
  const addDays=(date,n)=>dateAt(midnight(date)+n*DAY);
  function addMonths(date,n){const [y,m,d]=date.split('-').map(Number),first=new Date(Date.UTC(y,m-1+n,1)),last=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0)).getUTCDate();return new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth(),Math.min(d,last))).toISOString().slice(0,10);}
  const weekStart=date=>addDays(date,-((new Date(date+'T12:00:00Z').getUTCDay()+6)%7));
  function interval(r){
    if(!validDate(r.eventDate)||!Number.isFinite(minute(r.startTime))||minute(r.startTime)>=1440)return null;
    const start=midnight(r.eventDate)+minute(r.startTime)*60000,hours=Number(r.hours);
    let duration=hours>0&&hours<=168?hours*60:minute(r.endTime)-minute(r.startTime);
    if(!Number.isFinite(duration))return null;if(duration<0)duration+=1440;if(duration<=0)return null;
    return {start,end:start+duration*60000};
  }
  const occupies=r=>!['cancelled','no_show','paused'].includes(r.status)&&!r.seriesPaused;
  function windows(schedule,date){
    if(!schedule)return null;
    const weekday=new Date(date+'T12:00:00Z').getUTCDay(),today=schedule[weekday],previous=schedule[(weekday+6)%7];
    if(!today||!previous)return null;
    const result=[];
    for(const [row,offset] of [[previous,-1440],[today,0]]){
      if(!row.active)continue;let a=minute(row.open),b=minute(row.close);if(!Number.isFinite(a)||!Number.isFinite(b)||a===b)return null;if(b<a)b+=1440;
      a=Math.max(0,a+offset);b=Math.min(1440,b+offset);if(b>a)result.push({start:a,end:b});
    }
    return result.sort((a,b)=>a.start-b.start);
  }
  function closed(w){if(w===null)return null;let last=0;const result=[];for(const item of w){if(item.start>last)result.push({start:last,end:item.start});last=Math.max(last,item.end);}if(last<1440)result.push({start:last,end:1440});return result;}
  function lanes(events){
    const ordered=[...events].sort((a,b)=>a.start-b.start||b.end-a.end||String(a.r.id).localeCompare(String(b.r.id))),result=[];
    let group=[],boundary=-1;
    const flush=()=>{const ends=[];for(const event of group){let lane=ends.findIndex(end=>end<=event.start);if(lane<0)lane=ends.length;ends[lane]=event.end;event.lane=lane;}for(const event of group)result.push({...event,laneCount:ends.length});group=[];};
    for(const event of ordered){if(group.length&&event.start>=boundary){flush();boundary=-1;}group.push({...event});boundary=Math.max(boundary,event.end);}flush();return result;
  }
  function build(state,physicalResources){
    const catalog=state.settings.businessCatalog,sites=catalog?.sites?.length?catalog.sites.map(s=>({...s,id:String(s.id)})):[{id:'legacy',name:'Sede principal',active:true,schedule:state.settings.schedule}];
    const siteMap=new Map(sites.map(s=>[s.id,s]));
    const resources=physicalResources.map(r=>({...r,id:String(r.id),siteId:catalog?String(r.siteId||'unknown'):'legacy',name:r.name||r.label||r.key}));
    const resourceMap=new Map(resources.map(r=>[r.key,r])),byId=new Map(resources.map(r=>[r.id,r]));
    const clients=new Map(state.clients.map(c=>[String(c.id),c.name])),records=new Map(),days=new Map(),invalid=[],eventCache=new Map();
    function keys(r){
      if(r.resourceIds?.length)return r.resourceIds.map(id=>byId.get(String(id))?.key||'Cancha '+id);
      if(r.physicalCourts?.length)return [...new Set(r.physicalCourts)];
      if(r.physicalCourt)return [r.physicalCourt];
      // Do not guess physical courts from FUT 7 / FUT 9 / another sports format.
      return [];
    }
    function location(r){const rs=keys(r).map(k=>resourceMap.get(k)).filter(Boolean),names=rs.map(x=>x.name),siteNames=[...new Set(rs.map(x=>siteMap.get(x.siteId)?.name).filter(Boolean))];return {keys:keys(r),courtLabel:names.length?names.join(' + '):r.resourceNames?.join(' + ')||'Cancha no identificada',siteLabel:siteNames.join(' / ')||r.siteName||r.catalogSnapshot?.siteName||'Sede no identificada',client:clients.get(String(r.clientId))||r.internalTitle||'Cliente',format:r.catalogSnapshot?.serviceName||r.courtType||r.formatCode||''};}
    for(const r of state.reservations){
      const times=interval(r);records.set(String(r.id),{r,times,location:location(r)});if(!times){invalid.push(r);continue;}
      for(let d=dateAt(times.start),n=0;midnight(d)<times.end&&n<8;d=addDays(d,1),n++){
        const event={r,location:location(r),start:Math.max(0,(times.start-midnight(d))/60000),end:Math.min(1440,(times.end-midnight(d))/60000),continues:times.start<midnight(d),overnight:times.end>midnight(d)+DAY};
        if(!days.has(d))days.set(d,[]);days.get(d).push(event);
      }
    }
    const matches=(r,filters)=>{const ks=keys(r);return (!filters.court||ks.includes(filters.court))&&(!filters.site||ks.some(k=>resourceMap.get(k)?.siteId===filters.site));};
    return {sites,resources,resourceMap,records,invalid,location,keys,matches,
      events(date,filters={}){const key=JSON.stringify([date,filters.site||'',filters.court||'']);if(!eventCache.has(key))eventCache.set(key,(days.get(date)||[]).filter(e=>matches(e.r,filters)).sort((a,b)=>a.start-b.start||String(a.r.code).localeCompare(String(b.r.code))));return eventCache.get(key);},
      occurs(r,date){const t=records.get(String(r.id))?.times||interval(r);return !!t&&t.start<midnight(date)+DAY&&t.end>midnight(date);},
      resourcesFor(filters={}){return resources.filter(r=>(!filters.site||r.siteId===filters.site)&&(!filters.court||r.key===filters.court));},
      hours(resource,date){const site=siteMap.get(resource.siteId);return resource.active===false||site?.active===false?[]:windows(site?.schedule,date);}
    };
  }
  globalThis.ElevaCalendarModel={DAY,minute,clock,validDate,midnight,dateAt,addDays,addMonths,weekStart,interval,occupies,windows,closed,lanes,build};
})();
