(() => {
  const fields = new Set();
  const eye = '<svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/><path class="password-eye-slash" d="m3 3 18 18"/></svg>';
  let sequence = 0;
  function setVisibility(input, button, visible) {
    input.type = visible ? 'text' : 'password';
    button.setAttribute('aria-label', visible ? 'Ocultar contraseña' : 'Mostrar contraseña');
    button.setAttribute('aria-pressed', String(visible));
    button.title = visible ? 'Ocultar contraseña' : 'Mostrar contraseña';
  }
  function enhance() {
    if (typeof document === 'undefined' || !document.body) return;
    document.querySelectorAll('input[type="password"]').forEach(input => {
      if (input.closest('.password-field')) return;
      const field = document.createElement('span'); field.className = 'password-field';
      const button = document.createElement('button'); button.type = 'button'; button.className = 'password-toggle';
      if (!input.id) input.id = `password-input-${++sequence}`;
      button.setAttribute('aria-controls', input.id); button.innerHTML = eye;
      input.before(field); field.append(input, button); fields.add({input, button});
      setVisibility(input, button, false);
      button.addEventListener('click', event => { event.preventDefault(); setVisibility(input, button, input.type === 'password'); });
    });
    for (const entry of fields) {
      if (!entry.input.isConnected) { fields.delete(entry); continue; }
      if (entry.button.disabled !== entry.input.disabled) entry.button.disabled = entry.input.disabled;
      if (entry.input.disabled || entry.input.closest('[hidden]')) setVisibility(entry.input, entry.button, false);
    }
  }
  document.addEventListener('submit', event => {
    for (const {input, button} of fields) if (input.form === event.target) setVisibility(input, button, false);
  }, true);
  document.addEventListener('eleva:hide-passwords', () => { for (const {input, button} of fields) setVisibility(input, button, false); });
  new MutationObserver(enhance).observe(document.body, {childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'disabled']});
  enhance();
})();
