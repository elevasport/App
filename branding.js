(() => {
  const defaults={brandName:'Eleva Sport',primary:'#00c94d',header:'#14232f',background:'#f4f7f8',surface:'#ffffff',ink:'#111827',radius:16,density:'comfortable'};
  const originalLogo=document.querySelector('.brand-logo')?.src||'';
  const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));
  const admin=()=>window.ElevaSessionUser?.active&&window.ElevaSessionUser.role==='admin';
  const rgb=hex=>[1,3,5].map(start=>parseInt(hex.slice(start,start+2),16));
  const luminance=hex=>rgb(hex).map(value=>{const c=value/255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;}).reduce((sum,value,index)=>sum+value*[.2126,.7152,.0722][index],0);
  const contrast=(a,b)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
  const on=color=>contrast(color,'#ffffff')>contrast(color,'#111111')?'#ffffff':'#111111';
  const mix=(a,b,weight)=>'#'+rgb(a).map((value,index)=>Math.round(value*weight+rgb(b)[index]*(1-weight)).toString(16).padStart(2,'0')).join('');
  let service=null,current={settings:{...defaults},logoPath:null,logoUrl:originalLogo,version:null},saving=false,refreshing=false,available=false;
  function validate(settings){
    if(!settings||Object.keys(settings).sort().join('|')!==Object.keys(defaults).sort().join('|'))throw new Error('La configuración de diseño está incompleta.');
    if(typeof settings.brandName!=='string'||!settings.brandName.trim()||settings.brandName.length>80)throw new Error('Escribe un nombre de marca de hasta 80 caracteres.');
    for(const key of ['primary','header','background','surface','ink'])if(!/^#[0-9a-f]{6}$/i.test(settings[key]))throw new Error('Elige colores válidos.');
    if(![6,16,24].includes(settings.radius)||!['comfortable','compact'].includes(settings.density))throw new Error('Elige un estilo y una densidad válidos.');
    if(contrast(settings.ink,settings.surface)<4.5||contrast(settings.ink,settings.background)<4.5)throw new Error('El texto necesita más contraste con el fondo y las tarjetas. Ajusta esos colores.');
    return settings;
  }
  function tokens(settings){
    const s=settings,link=[s.primary,...[.8,.6,.4,.2,0].map(weight=>mix(s.primary,s.ink,weight))].find(color=>contrast(color,s.background)>=4.5&&contrast(color,s.surface)>=4.5)||s.ink;
    return {'brand-primary':s.primary,'brand-on-primary':on(s.primary),'brand-header':s.header,'brand-on-header':on(s.header),'brand-bg':s.background,'brand-surface':s.surface,'brand-ink':s.ink,'brand-line':mix(s.ink,s.surface,.18),'brand-link':link,'brand-radius':s.radius+'px','brand-control-radius':Math.min(s.radius,14)+'px','brand-space':(s.density==='compact'?12:16)+'px',bg:s.background,card:s.surface,ink:s.ink,muted:mix(s.ink,s.surface,.72),line:mix(s.ink,s.surface,.18),dark:s.header,dark2:mix(s.header,on(s.header),.9),green:s.primary,green2:link,softgreen:mix(s.primary,s.surface,.12)};
  }
  function apply(row){
    const settings=validate(row.settings);current={...row,settings:structuredClone(settings),logoUrl:row.logoUrl||originalLogo};
    let style=document.getElementById('brandDesignTokens');if(!style){style=document.createElement('style');style.id='brandDesignTokens';document.head.append(style);}
    style.textContent='@media screen{:root{'+Object.entries(tokens(settings)).map(([key,value])=>'--'+key+':'+value+';').join('')+'}}';document.body.dataset.branding='true';
    document.querySelectorAll('.brand-logo,.account-logo').forEach(image=>{image.src=current.logoUrl;image.alt=settings.brandName;image.onerror=()=>{image.onerror=null;image.src=originalLogo;};});
    document.title=settings.brandName+' · Gestión';
  }
  function syncNav(){const nav=document.getElementById('brandingNav');if(nav)nav.hidden=!admin();}
  const render=window.ElevaLegacy.render;window.ElevaLegacy.render=function(){render();syncNav();};
  async function refresh(){
    if(!service||refreshing||saving)return;refreshing=true;
    try{const row=await service.load();if(row){apply(row);available=true;}}catch{available=false;}finally{refreshing=false;syncNav();}
  }
  async function normalizeLogo(file){
    if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>2097152)throw new Error('Usa un PNG, JPG o WebP de hasta 2 MB.');
    const image=await createImageBitmap(file);try{
      if(image.width<1||image.height<1||image.width*image.height>20000000)throw new Error('La imagen es demasiado grande.');
      const scale=Math.min(1,640/image.width,240/image.height),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));
      canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.92));if(!blob||blob.type!=='image/webp')throw new Error('No se pudo preparar el logo.');return blob;
    }finally{image.close();}
  }
  async function open(){
    if(!admin()){window.showToast('Solo el administrador puede editar la identidad visual.');return;}
    await refresh();if(!admin())return;
    const title=document.getElementById('masterDetailTitle'),host=document.getElementById('masterDetailBody');title.textContent='Identidad visual';
    const snapshot=structuredClone(current);let draft={...current.settings},logoUrl=current.logoUrl,logoPath=current.logoPath,logoBlob=null,objectUrl=null,preparingLogo=false;
    host.innerHTML=`<form id="brandingForm" class="brand-editor"><div><h3>Diseña la identidad de tu aplicación</h3><p>El logo y el estilo se aplican al acceso y a todos los perfiles. La vista previa no cambia la aplicación hasta guardar.</p></div><div class="brand-presets"><button type="button" data-preset="eleva">Eleva</button><button type="button" data-preset="blue">Azul profesional</button><button type="button" data-preset="earth">Tierra</button><button type="button" data-preset="dark">Oscuro</button></div><div class="brand-controls"><label class="brand-wide">Nombre de la marca<input name="brandName" maxlength="80" value="${escape(draft.brandName)}" required></label><label class="brand-wide">Logo<input id="brandingLogo" type="file" accept="image/png,image/jpeg,image/webp"><small>PNG, JPG o WebP, hasta 2 MB. Conservamos sus proporciones.</small></label><div class="brand-wide brand-actions"><button type="button" id="brandingRemoveLogo">Usar logo original</button></div>${[['primary','Marca y botones'],['header','Cabecera y área del logo'],['background','Fondo general'],['surface','Tarjetas y campos'],['ink','Texto principal']].map(([key,label])=>`<label>${label}<input name="${key}" type="color" value="${escape(draft[key])}"></label>`).join('')}<label>Bordes y botones<select name="radius"><option value="6">Rectos</option><option value="16">Suaves</option><option value="24">Redondeados</option></select></label><label>Espaciado<select name="density"><option value="comfortable">Cómodo</option><option value="compact">Compacto</option></select></label></div><div><h3>Vista previa</h3><div id="brandPreview" class="brand-sample"><div class="brand-sample-header"><img class="brand-sample-logo" alt="Logo de vista previa"><b data-preview-name></b></div><div class="brand-sample-body"><div class="brand-sample-cards"><div class="brand-sample-card"><span>Reservas</span><b>12</b></div><div class="brand-sample-card"><span>Por cobrar</span><b>S/ 480</b></div></div><div class="brand-sample-input">Buscar cliente o reserva</div><div class="brand-sample-buttons"><span class="brand-sample-primary">Guardar reserva</span><span>Ver detalle</span></div><div class="brand-sample-states"><span class="success">Confirmado</span><span class="pending">Pendiente</span><span class="error">Error</span></div></div></div><p>El texto de botones y cabeceras se ajusta automáticamente al contraste. Los estados conservan sus colores para seguir siendo reconocibles.</p></div><p id="brandingMessage" class="brand-message" role="status" aria-live="polite"></p><div class="brand-actions"><button class="primary" type="submit">Guardar y aplicar a todos</button><button type="button" id="brandingRestore">Restaurar diseño original</button><button type="button" id="brandingCancel">Cancelar</button></div></form>`;
    const form=host.querySelector('form'),message=host.querySelector('#brandingMessage'),preview=host.querySelector('#brandPreview');
    function read(){for(const key of Object.keys(defaults))draft[key]=key==='radius'?Number(form.elements[key].value):form.elements[key].value;draft.brandName=draft.brandName.trim();return draft;}
    function fill(){for(const key of Object.keys(defaults))form.elements[key].value=draft[key];}
    function sample(){
      const t=tokens(draft);for(const [key,value] of Object.entries({'bg':draft.background,'surface':draft.surface,'ink':draft.ink,'primary':draft.primary,'on-primary':t['brand-on-primary'],'header':draft.header,'header-ink':t['brand-on-header'],'line':t['brand-line'],'radius':t['brand-radius'],'control-radius':t['brand-control-radius'],'space':t['brand-space']}))preview.style.setProperty('--preview-'+key,value);
      preview.querySelector('img').src=logoUrl||originalLogo;preview.querySelector('[data-preview-name]').textContent=draft.brandName;
      try{validate(draft);message.classList.remove('error');message.textContent=available?'Listo para aplicar a todos los perfiles.':'El guardado requiere habilitar Identidad visual en Supabase.';}catch(error){message.classList.add('error');message.textContent=error.message;}
    }
    fill();sample();form.addEventListener('input',()=>{read();sample();});
    const presets={eleva:defaults,blue:{...defaults,primary:'#176bcd',header:'#132945',background:'#f2f6fc'},earth:{...defaults,primary:'#b9652b',header:'#302820',background:'#f8f5ef',surface:'#fffcf7',ink:'#302820'},dark:{...defaults,primary:'#47dc9a',header:'#111c25',background:'#111827',surface:'#1f2937',ink:'#f3f4f6'}};
    host.querySelectorAll('[data-preset]').forEach(button=>button.addEventListener('click',()=>{draft={...presets[button.dataset.preset],brandName:draft.brandName};fill();sample();}));
    host.querySelector('#brandingRestore').addEventListener('click',()=>{draft={...defaults};logoPath=null;logoBlob=null;logoUrl=originalLogo;host.querySelector('#brandingLogo').value='';cleanup();fill();sample();});
    host.querySelector('#brandingRemoveLogo').addEventListener('click',()=>{logoPath=null;logoBlob=null;logoUrl=originalLogo;host.querySelector('#brandingLogo').value='';cleanup();sample();});
    const cleanup=()=>{if(objectUrl){URL.revokeObjectURL(objectUrl);objectUrl=null;}};
    host.querySelector('#brandingCancel').addEventListener('click',()=>{cleanup();window.closeSheet('masterDetailSheet');});
    host.querySelector('#brandingLogo').addEventListener('change',async event=>{
      const file=event.target.files[0];if(!file)return;
      preparingLogo=true;form.querySelector('[type=submit]').disabled=true;
      try{logoBlob=await normalizeLogo(file);cleanup();objectUrl=URL.createObjectURL(logoBlob);logoUrl=objectUrl;sample();}catch(error){message.classList.add('error');message.textContent=error.message;event.target.value='';}
      finally{preparingLogo=false;form.querySelector('[type=submit]').disabled=false;}
    });
    form.addEventListener('submit',async event=>{
      event.preventDefault();if(saving||preparingLogo)return;
      try{if(!admin())throw new Error('Tu cuenta ya no tiene permisos de administración.');validate(read());if(!service||!available)throw new Error('Primero debe habilitarse Identidad visual en Supabase.');
        saving=true;form.querySelectorAll('button,input,select').forEach(control=>control.disabled=true);message.textContent='Guardando identidad visual…';message.classList.remove('error');
        const saved=await service.save({settings:{...draft},logoPath,version:snapshot.version},logoBlob);apply(saved);snapshot.version=saved.version;logoPath=saved.logoPath;logoUrl=saved.logoUrl||originalLogo;logoBlob=null;available=true;cleanup();message.textContent='Identidad visual aplicada a todos los perfiles.';
        window.closeSheet('masterDetailSheet');document.getElementById('brandingNav')?.focus();if(window.ElevaFeedback)window.ElevaFeedback.success(message.textContent);else window.showToast(message.textContent);
      }catch(error){message.classList.add('error');message.textContent=error.message||'No se pudo guardar el diseño.';if(window.ElevaFeedback)window.ElevaFeedback.error(message.textContent);else window.showToast(message.textContent);}
      finally{saving=false;form.querySelectorAll('button,input,select').forEach(control=>control.disabled=false);}
    });
    window.openSheet('masterDetailSheet');
  }
  window.ElevaBranding={open,refresh,validate,contrast,tokens,defaults:{...defaults},isBusy:()=>saving,connect(adapter){service=adapter;refresh();},getCurrent:()=>structuredClone(current)};
  window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
  setInterval(()=>{if(!document.hidden)refresh();},30000);
  syncNav();
})();
