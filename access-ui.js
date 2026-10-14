(() => {
  const login = document.getElementById('loginForm'), gate = document.getElementById('authGate');
  const email = document.getElementById('authEmail'), password = document.getElementById('authPassword');
  function decorateCard(card) {
    if(card.querySelector('.account-brand'))return;
    const source=document.querySelector('.topbar .brand-logo');if(!source)return;
    const brand=document.createElement('div');brand.className='account-brand';
    const image=document.createElement('img');image.className='account-logo';image.src=source.src;image.alt=source.alt||'Eleva Sport';brand.append(image);card.prepend(brand);
  }
  decorateCard(login);login.querySelector('h1').textContent='Iniciar sesión';
  const storageKey = 'eleva.remembered-email.v1';
  const rememberRow = document.createElement('label'); rememberRow.className = 'remember-account';
  rememberRow.innerHTML = '<input id="rememberAccount" type="checkbox"><span>Recordar mi correo en este dispositivo</span>';
  document.getElementById('authSubmit').before(rememberRow);
  const remember = rememberRow.querySelector('input');
  try { const saved = localStorage.getItem(storageKey); if (saved) { email.value = saved; remember.checked = true; } } catch { /* Storage is optional. */ }
  remember.addEventListener('change', () => { if (!remember.checked) { try { localStorage.removeItem(storageKey); } catch {} } });

  const recovery = document.createElement('form'); recovery.id = 'recoveryForm'; recovery.className = 'auth-card'; recovery.hidden = true; recovery.noValidate = true;
  recovery.innerHTML = '<h1>Recupera tu acceso</h1><p>Ingresa tu correo para continuar. Te enviaremos las instrucciones para restablecer tu contraseña.</p><label for="recoveryEmail">Correo electrónico</label><div class="recovery-email-field"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="m3 6 9 7 9-7"/></svg><input id="recoveryEmail" type="email" autocomplete="email" placeholder="tu@correo.com" required aria-describedby="recoveryMessage"></div><p id="recoveryMessage" class="recovery-message" role="status" aria-live="polite"></p><button id="recoveryContinue" type="submit">Continuar</button><button id="recoveryBack" class="auth-back-link" type="button">Volver a iniciar sesión</button>';
  gate.append(recovery);
  decorateCard(recovery);
  const recoveryEmail = recovery.querySelector('input'), message = recovery.querySelector('#recoveryMessage'), button = recovery.querySelector('[type=submit]');
  let handler = null, generation = 0, pending = false;
  function resetFeedback() { message.textContent = ''; message.classList.remove('error'); recoveryEmail.removeAttribute('aria-invalid'); }
  function showLogin() {
    document.dispatchEvent(new Event('eleva:hide-passwords'));
    generation++; pending = false; recovery.hidden = true; login.hidden = false; rememberRow.hidden = false;
    login.querySelector('h1').textContent='Iniciar sesión';
    recoveryEmail.disabled = false; button.disabled = false; button.textContent = 'Continuar'; resetFeedback();
  }
  function openRecovery() {
    showLogin(); login.hidden = true; recovery.hidden = false; recoveryEmail.value = email.value.trim(); password.value = ''; password.type = 'password';
    recoveryEmail.focus();
  }
  recovery.querySelector('#recoveryBack').addEventListener('click', () => { showLogin(); email.focus(); });
  recoveryEmail.addEventListener('input', resetFeedback);
  recovery.addEventListener('submit', async event => {
    event.preventDefault(); if (pending) return;
    recoveryEmail.value = recoveryEmail.value.trim(); resetFeedback();
    if (!recoveryEmail.checkValidity()) {
      recoveryEmail.setAttribute('aria-invalid', 'true'); message.classList.add('error'); message.textContent = 'Ingresa un correo electrónico válido, por ejemplo nombre@correo.com.'; recoveryEmail.focus(); return;
    }
    const request = ++generation; pending = true; button.disabled = true; recoveryEmail.disabled = true; button.textContent = 'Enviando…';
    try {
      if (!handler) throw new Error('Unavailable');
      const result = await handler(recoveryEmail.value);
      if (request !== generation) return;
      message.textContent = result?.demo ? 'Prueba local: este envío es simulado y no se envían correos.' : 'Si el correo está registrado, recibirás un enlace para recuperar tu acceso. Revisa también la carpeta de spam.';
    } catch {
      if (request !== generation) return;
      message.classList.add('error'); message.textContent = 'No se pudo solicitar la recuperación. Intenta nuevamente en unos minutos.';
    } finally {
      if (request === generation) { pending = false; button.disabled = false; recoveryEmail.disabled = false; button.textContent = 'Continuar'; }
    }
  });
  window.ElevaAccessUI = {
    openRecovery, showLogin, decorateCard,
    setRecoveryHandler(fn) { handler = fn; },
    showPasswordMode() { showLogin(); rememberRow.hidden = true;login.querySelector('h1').textContent='Define tu contraseña'; },
    rememberSuccessfulLogin(value) { try { if (remember.checked) localStorage.setItem(storageKey, value); else localStorage.removeItem(storageKey); } catch {} }
  };
})();
