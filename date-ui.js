/* Display DD/MM/YYYY; keep the existing date inputs and ISO values for business logic. */
(() => {
  const records=new Set(),valueDescriptor=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value');
  function display(iso){return /^\d{4}-\d{2}-\d{2}$/.test(iso)?iso.split('-').reverse().join('/'):'';}
  function parse(text){
    const match=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);if(!match)return null;
    const [,day,month,year]=match,iso=`${year}-${month}-${day}`,date=new Date(iso+'T12:00:00Z');
    return Number(year)>=100&&Number(month)>=1&&Number(month)<=12&&Number(day)>=1&&Number(day)<=31&&!Number.isNaN(date.getTime())&&date.toISOString().slice(0,10)===iso?iso:null;
  }
  function attach(native){
    if(native.dataset.dateUi)return;native.dataset.dateUi='true';
    const wrap=document.createElement('div');wrap.className='date-input-wrap';
    const text=document.createElement('input');text.type='text';text.inputMode='numeric';text.placeholder='DD/MM/AAAA';text.maxLength=10;text.autocomplete='off';text.dataset.dateText='true';text.id=(native.id||'date-'+records.size)+'Display';
    const label=native.closest('.field')?.querySelector('label');text.setAttribute('aria-label',label?.textContent.trim()||'Fecha (día/mes/año)');
    const button=document.createElement('button');button.type='button';button.className='date-picker-button';button.textContent='▦';button.setAttribute('aria-label','Abrir calendario');button.addEventListener('click',()=>{try{native.showPicker();}catch{native.focus();native.click();}});
    native.before(wrap);wrap.append(text,button,native);native.classList.add('date-native-input');native.tabIndex=-1;native.setAttribute('aria-label','Elegir fecha en calendario');
    const record={native,text};records.add(record);let typing=false;
    function sync(){if(!typing){text.value=display(valueDescriptor.get.call(native));text.setCustomValidity('');text.removeAttribute('aria-invalid');}text.disabled=native.disabled;text.readOnly=native.readOnly;text.required=native.required;button.disabled=native.disabled||native.readOnly;}
    Object.defineProperty(native,'value',{configurable:true,get(){return valueDescriptor.get.call(native);},set(value){valueDescriptor.set.call(native,value);sync();}});
    native.addEventListener('input',sync);native.addEventListener('change',sync);
    text.addEventListener('input',()=>{
      let raw=text.value;if(/^\d{4}-\d{2}-\d{2}$/.test(raw))raw=display(raw);else{const digits=raw.replace(/\D/g,'').slice(0,8);raw=digits.slice(0,2)+(digits.length>2?'/'+digits.slice(2,4):'')+(digits.length>4?'/'+digits.slice(4):'');}text.value=raw;
      const iso=parse(raw),valid=!raw||!!iso;typing=true;native.value=iso||'';text.setCustomValidity(valid?'':'Ingresa una fecha válida en formato DD/MM/AAAA.');if(valid)text.removeAttribute('aria-invalid');else text.setAttribute('aria-invalid','true');
      if(iso&&((native.min&&iso<native.min)||(native.max&&iso>native.max))){text.setCustomValidity('La fecha está fuera del rango permitido.');text.setAttribute('aria-invalid','true');}
      if(valid){native.dispatchEvent(new Event('input',{bubbles:true}));native.dispatchEvent(new Event('change',{bubbles:true}));}typing=false;
    });
    new MutationObserver(changes=>{const typed=text.value;sync();if(changes.some(change=>change.attributeName==='value'))return;
      if(typed&&!parse(typed)){text.value=typed;text.setCustomValidity('Ingresa una fecha válida en formato DD/MM/AAAA.');text.setAttribute('aria-invalid','true');}
      else{const iso=parse(text.value);if(iso&&((native.min&&iso<native.min)||(native.max&&iso>native.max))){text.setCustomValidity('La fecha está fuera del rango permitido.');text.setAttribute('aria-invalid','true');}}
    }).observe(native,{attributes:true,attributeFilter:['disabled','readonly','required','min','max','value']});sync();
    record.sync=sync;
  }
  function scan(){if(!window.document)return;document.querySelectorAll('input[type=date]').forEach(attach);for(const record of records)if(!record.native.isConnected)records.delete(record);}
  new MutationObserver(scan).observe(document.body,{childList:true,subtree:true});scan();
  document.addEventListener('reset',()=>setTimeout(()=>records.forEach(record=>record.sync()),0),true);
  function validateCurrent(){
    for(const {text} of records){const modal=text.closest('.backdrop'),view=text.closest('.view');if(text.disabled||text.closest('.hidden,[hidden]')||(modal&&!modal.classList.contains('show'))||(!modal&&view&&!view.classList.contains('active')))continue;
      if(text.value&&!text.validity.valid){window.showToast('Revisa la fecha: utiliza día/mes/año (DD/MM/AAAA).');text.focus();text.reportValidity();return false;}
    }return true;
  }
  window.ElevaDateUI={parse,display,validateCurrent};
})();
