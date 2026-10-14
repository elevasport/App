(() => {
  const toast=document.getElementById('toast');let timer=null;
  const icon=path=>`<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
  const icons={success:icon('<path d="m5 12 4 4L19 6"/>'),error:icon('<path d="m6 6 12 12M6 18 18 6"/>'),info:icon('<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>')};
  const inferred=message=>/^(no\b|falta\b|debe\b|revisa\b|selecciona\b|ingresa\b|indica\b|usa\b|primero\b|solo\b|completa\b|ya existe)|obligatori|inválid|incorrect|requiere|sin permiso/i.test(message)?'error':/guardad|actualizad|cread|aplicad|confirmad|registrad|enviad|emitid|eliminad|restaurad|completad/i.test(message)?'success':'info';
  function dismiss(){clearTimeout(timer);timer=null;toast.classList.remove('show');}
  function show(message,{kind=inferred(String(message)),duration}={}){
    clearTimeout(timer);toast.replaceChildren();toast.dataset.kind=kind;toast.setAttribute('role',kind==='error'?'alert':'status');toast.setAttribute('aria-live',kind==='error'?'assertive':'polite');toast.setAttribute('aria-atomic','true');
    const symbol=document.createElement('span');symbol.className='feedback-symbol';symbol.innerHTML=icons[kind]||icons.info;
    const text=document.createElement('span');text.className='feedback-text';text.textContent=String(message);
    const close=document.createElement('button');close.type='button';close.className='feedback-dismiss';close.setAttribute('aria-label','Cerrar aviso');close.innerHTML=icons.error;close.addEventListener('click',dismiss);
    toast.append(symbol,text,close);toast.classList.add('show');
    const delay=duration??(kind==='error'?0:5500);if(delay)timer=setTimeout(dismiss,delay);
  }
  toast.addEventListener('mouseenter',()=>{clearTimeout(timer);timer=null;});toast.addEventListener('focusin',()=>{clearTimeout(timer);timer=null;});
  window.showToast=(message,options)=>show(message,options);
  window.ElevaFeedback={success:message=>show(message,{kind:'success'}),error:message=>show(message,{kind:'error'}),info:message=>show(message,{kind:'info'}),dismiss};

  function badge(target,count,inline=false){
    let node=target.querySelector('[data-pending-badge]');
    if(!count){node?.remove();return;}
    if(!node){node=document.createElement('span');node.dataset.pendingBadge='true';node.className='pending-badge'+(inline?' inline':'');node.setAttribute('aria-hidden','true');target.append(node);}
    node.textContent=count>99?'99+':String(count);
  }
  function updateBadges(){
    const allowed=window.hasPermission('view_pending'),count=allowed?window.pendingReceivableGroups().length:0,role=window.currentRole();
    (role.nav||[]).forEach(([destination,label],index)=>{
      const button=document.getElementById(index===2?'nav-center':`nav-slot-${index}`);if(!button)return;
      const target=document.getElementById(`navIcon${index}`)||button;
      target.classList.add('pending-notification-icon');badge(target,destination==='pending'?count:0);
      button.setAttribute('aria-label',destination==='pending'&&count?`${label}, ${count} cliente${count===1?'':'s'} con saldo pendiente`:label);
    });
    const moreIcon=document.getElementById('collectionsMoreIcon'),moreButton=document.getElementById('collectionsMoreButton');
    if(moreIcon){moreIcon.classList.add('pending-notification-icon');badge(moreIcon,count);}
    if(moreButton)moreButton.setAttribute('aria-label',count?`Por cobrar, ${count} cliente${count===1?'':'s'} con saldo pendiente`:'Por cobrar');
  }
  const navigation=window.applyRoleNavigation;window.applyRoleNavigation=function(){navigation();updateBadges();};
  const render=window.ElevaLegacy.render;window.ElevaLegacy.render=function(){render();updateBadges();};
  window.ElevaFeedback.updateBadges=updateBadges;updateBadges();
})();
