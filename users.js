/* User management presentation. Persistence uses the existing repository and RPCs. */
(() => {
  const emails = new Map(); // Server directory, cleared whenever the session ends.
  let query = '', statusFilter = 'all', busy = false;
  let directoryLoader = null, directoryState = 'idle', directoryGeneration = 0;
  const isAdmin = () => window.ElevaSessionUser?.active && window.ElevaSessionUser.role === 'admin';
  const permissionsFor = role => roleCatalog()[role]?.permissions || [];
  const checkedPermissions = host => [...host.querySelectorAll('[data-user-permission]:checked')].map(input => input.value);
  const samePermissions = (a, b) => [...a].sort().join('|') === [...b].sort().join('|');
  const roleOptions = selected => (roleCatalog()[selected] ? '' : '<option value="" disabled selected>Selecciona un perfil</option>') + Object.entries(roleCatalog()).map(([id, role]) => `<option value="${escapeHtml(id)}" ${id === selected ? 'selected' : ''}>${escapeHtml(role.name)}</option>`).join('');
  const requireAdmin = () => { if (!isAdmin()) throw new Error('Solo el administrador general puede gestionar usuarios.'); };

  function permissionMarkup(roleId, editable) {
    const admin = roleId === 'admin', permissions = permissionsFor(roleId);
    return PERMISSION_CATALOG.map(group => `<section class="users-permission-group"><h4>${escapeHtml(group.group)}</h4><div class="users-permission-grid">${group.items.map(([code, label, description]) => `<label class="users-permission"><input type="checkbox" data-user-permission value="${escapeHtml(code)}" ${admin || (code !== 'manage_access' && permissions.includes(code)) ? 'checked' : ''} ${admin || !editable || code === 'manage_access' ? 'disabled' : ''}><span><b>${escapeHtml(label)}</b><small>${escapeHtml(code === 'manage_access' ? 'Reservado al administrador general' : description)}</small></span></label>`).join('')}</div></section>`).join('');
  }

  function makePersonalRole(base, permissions, name) {
    const roles = roleCatalog(), template = roles[base];
    if (!template || base === 'admin') throw new Error('Elige un perfil operativo para personalizar permisos.');
    const known = new Set(PERMISSION_CATALOG.flatMap(group => group.items.map(item => item[0])));
    if (permissions.some(code => !known.has(code) || code === 'manage_access')) throw new Error('Hay permisos no reconocidos o reservados al administrador.');
    const suffix = crypto.randomUUID().replaceAll('-', '');
    const id = `custom_user_${suffix}`;
    settings.customRoles.push({id, name: `Acceso de ${name.trim()} · ${suffix.slice(0, 8)}`, short: name.trim().slice(0, 18), baseRole: template.baseRole || base, permissions: [...new Set(permissions)]});
    return id;
  }

  // Registered before bridge.js so its existing mutation wrapper saves and reloads them.
  window.saveNewUserProfile = function(base, permissions, name) {
    requireAdmin();
    const id = makePersonalRole(base, permissions, name);
    persist();
    return id;
  };
  window.saveUserAccess = function(id, changes) {
    requireAdmin();
    const user = settings.users.find(row => row.id === id);
    if (!user) throw new Error('El usuario ya no está disponible.');
    const name = String(changes.name || '').trim();
    if (!name || name.length > 120 || !roleCatalog()[changes.role]) throw new Error('Revisa el nombre y el perfil.');
    const active = changes.active === true;
    if (user.active && user.role === 'admin' && (!active || changes.role !== 'admin') && !settings.users.some(row => row.id !== id && row.active && row.role === 'admin')) throw new Error('Debe quedar al menos un administrador general activo.');
    if (id === window.ElevaSessionUser.id && (!active || changes.role !== 'admin')) throw new Error('Usa otra cuenta administradora para cambiar tu propio acceso.');
    const role = changes.customize ? makePersonalRole(changes.role, changes.permissions, name) : changes.role;
    Object.assign(user, {name, role, active, initials: initials(name)});
    persist();
    return role;
  };
  window.ElevaLegacy.mutators.push('saveNewUserProfile', 'saveUserAccess');

  window.saveRoleLabel = function(id, label, base) {
    requireAdmin();
    const name = String(label || '').trim(), roles = roleCatalog();
    if (!roles[id] || !name || name.length > 120) throw new Error('Escribe un nombre de rol de hasta 120 caracteres.');
    if (Object.entries(roles).some(([other, role]) => other !== id && role.name.toLocaleLowerCase('es') === name.toLocaleLowerCase('es'))) throw new Error('Otro rol ya tiene ese nombre.');
    const custom = settings.customRoles.find(role => role.id === id);
    if (custom) { if(base!==undefined && (!ROLE_DEFS[base] || base==='admin')) throw new Error('Elige un perfil operativo como base.');custom.name = name; custom.short = name.slice(0, 18);if(base!==undefined)custom.baseRole=base; }
    else { settings.roleOverrides[id] = {...settings.roleOverrides[id], name}; }
    persist();
    return id;
  };
  window.ElevaLegacy.mutators.push('saveRoleLabel');
  window.baseRoleLabel = id => roleCatalog()[id]?.name || id;

  window.renderAccessRolesTab = function(host) {
    if (!isAdmin()) { host.innerHTML = '<div class="users-empty">Solo el administrador general puede gestionar roles.</div>'; return; }
    const roles = roleCatalog();
    const bases=selected=>Object.entries(roles).filter(([id,role])=>id!=='admin'&&!role.custom).map(([id,role])=>`<option value="${escapeHtml(id)}" ${id===selected?'selected':''}>${escapeHtml(role.name)}</option>`).join('');
    host.innerHTML = `<div class="access-section users-section"><div class="access-section-head"><div><b>Roles y nombres</b><span>Cambia el nombre visible de cada perfil. Sus permisos y usuarios se conservan.</span></div></div><div class="users-list">${Object.entries(roles).map(([id, role]) => `<article class="users-card"><form data-role-label="${escapeHtml(id)}"><label class="role-label-field">Nombre del rol<input name="role_name" value="${escapeHtml(role.name)}" required maxlength="120"></label><p class="users-meta">${settings.users.filter(user => user.role === id).length} usuarios · ${id === 'admin' ? 'Acceso total protegido' : role.custom ? `Perfil personalizado · basado en ${escapeHtml(baseRoleLabel(role.baseRole))}` : 'Perfil del sistema'}</p>${role.custom?`<label class="role-label-field">Experiencia y navegación<select name="role_base">${bases(role.baseRole)}</select></label>`:''}<div class="users-actions"><button class="primary" type="submit">Guardar ${role.custom?'perfil':'nombre'}</button><button type="button" data-role-permissions="${escapeHtml(id)}">Ver permisos</button>${id!=='admin'?`<button type="button" data-role-duplicate="${escapeHtml(id)}">Duplicar</button>`:''}${role.custom?`<button type="button" data-role-delete="${escapeHtml(id)}" ${settings.users.some(user=>user.role===id)?'disabled title="Tiene usuarios asignados"':''}>Eliminar</button>`:''}</div><p class="users-message" role="alert"></p></form></article>`).join('')}</div><div class="users-editor"><h3>Crear rol</h3><div class="users-fields"><label>Nombre<input id="newCustomRoleName" maxlength="120" placeholder="Ej. Coordinación de academia"></label><label>Basado en<select id="newCustomRoleBase">${bases()}</select></label></div><div class="users-actions"><button type="button" class="secondary" id="usersCreateRole">Crear rol</button></div></div></div>`;
    host.querySelectorAll('[data-role-permissions]').forEach(button => button.addEventListener('click', () => openPermissionsForRole(button.dataset.rolePermissions)));
    host.querySelectorAll('[data-role-label]').forEach(form => form.addEventListener('submit', async event => {
      event.preventDefault(); if (busy || window.ElevaBridge?.mutation) return;
      const id = form.dataset.roleLabel, name = form.elements.role_name.value.trim(), base=form.elements.role_base?.value, button = form.querySelector('[type=submit]'), message = form.querySelector('.users-message');
      busy = true; button.disabled = true; message.textContent = 'Guardando nombre…';
      try {
        const saved = await window.saveRoleLabel(id, name, base);
        if (!saved || roleCatalog()[id]?.name !== name || (base!==undefined&&roleCatalog()[id]?.baseRole!==base)) throw new Error('No se confirmó el perfil. Revisa el aviso y vuelve a intentarlo.');
        renderAccessConfigTab(); showToast('Nombre de rol actualizado');
      } catch (error) { message.textContent = error.message; window.ElevaFeedback?.error(error.message); }
      finally { busy = false; button.disabled = false; }
    }));
    for(const [attribute,action] of [['data-role-duplicate','duplicateRole'],['data-role-delete','deleteCustomRole']])host.querySelectorAll(`[${attribute}]`).forEach(button=>button.addEventListener('click',async()=>{
      if(busy||window.ElevaBridge?.mutation)return;busy=true;button.disabled=true;
      try{await window[action](button.getAttribute(attribute));renderAccessConfigTab();}finally{busy=false;button.disabled=false;}
    }));
    host.querySelector('#usersCreateRole').addEventListener('click', async () => {
      if (busy || window.ElevaBridge?.mutation) return;
      busy = true;
      try { await window.createCustomRole(); renderAccessConfigTab(); }
      finally { busy = false; }
    });
  };

  function updateDirectoryNotice() {
    const notice = document.getElementById('usersDirectoryNotice');
    if (notice && isAdmin()) notice.textContent = directoryState === 'loading' ? 'Consultando correos…' : directoryState === 'error' ? 'No se pudieron actualizar los correos. Puedes volver a intentarlo.' : directoryState === 'ready' ? 'Correos actualizados desde las cuentas de usuario.' : 'Los correos se consultan al abrir el listado.';
  }
  async function loadDirectory(force = false) {
    if (!directoryLoader || !isAdmin() || directoryState === 'loading' || (!force && directoryState === 'ready')) return;
    const generation = ++directoryGeneration, owner = window.ElevaSessionUser.id, collected = new Map();
    directoryState = 'loading'; updateDirectoryNotice();
    try {
      let page = 1;
      while (page) {
        const result = await directoryLoader(page);
        if (generation !== directoryGeneration || !isAdmin() || window.ElevaSessionUser.id !== owner) return;
        if (!Array.isArray(result?.users)) throw new Error('Directorio incompleto');
        result.users.forEach(user => { if (typeof user.id === 'string' && typeof user.email === 'string') collected.set(user.id, user.email); });
        const next = result.next_page;
        if (next != null && (!Number.isSafeInteger(next) || next !== page + 1)) throw new Error('Paginación no válida');
        page = next ?? null;
      }
      emails.clear(); collected.forEach((email, id) => emails.set(id, email)); directoryState = 'ready';
    } catch { if (generation === directoryGeneration) directoryState = 'error'; }
    if (generation === directoryGeneration && isAdmin() && window.ElevaSessionUser.id === owner) { updateDirectoryNotice(); renderUserMaster(); }
  }

  window.renderAccessUsersTab = function(host) {
    if (!isAdmin()) { host.innerHTML = '<div class="users-empty">Solo el administrador general puede gestionar usuarios.</div>'; return; }
    userMasterDraft = cloneData(settings.users);
    const active = settings.users.filter(user => user.active === true).length;
    host.innerHTML = `<div class="access-section users-section"><div class="access-section-head"><div><b>Usuarios y accesos</b><span>Crea cuentas y revisa qué puede hacer cada persona.</span></div></div><div class="users-summary"><span>${settings.users.length} usuarios</span><span>${active} activos</span><span>${settings.users.length - active} inactivos</span></div><div class="users-toolbar"><label>Buscar usuario<input id="usersSearch" type="search" placeholder="Nombre, correo o perfil" value="${escapeHtml(query)}"></label><label>Estado<select id="usersStatus"><option value="all">Todos</option><option value="active">Activos</option><option value="inactive">Inactivos</option></select></label><button class="primary" type="button" id="usersCreate">＋ Crear usuario</button></div><div class="users-directory-controls"><p class="users-email-note" id="usersDirectoryNotice" role="status"></p><button type="button" id="usersReloadDirectory">Actualizar correos</button></div><div id="userMasterList" class="users-list"></div><div id="userEditor" class="users-editor" hidden></div></div>`;
    host.querySelector('#usersStatus').value = statusFilter;
    host.querySelector('#usersSearch').addEventListener('input', event => { query = event.target.value; renderUserMaster(); });
    host.querySelector('#usersStatus').addEventListener('change', event => { statusFilter = event.target.value; renderUserMaster(); });
    host.querySelector('#usersCreate').addEventListener('click', () => window.addUserMasterRow());
    host.querySelector('#usersReloadDirectory').addEventListener('click', () => loadDirectory(true));
    renderUserMaster();
    updateDirectoryNotice(); loadDirectory();
  };

  window.renderUserMaster = function() {
    const host = document.getElementById('userMasterList');
    if (!host || !isAdmin()) return;
    const roles = roleCatalog(), term = query.trim().toLocaleLowerCase('es');
    const users = settings.users.filter(user => (statusFilter === 'all' || (user.active === true) === (statusFilter === 'active')) && `${user.name} ${emails.get(user.id) || ''} ${roles[user.role]?.name || ''}`.toLocaleLowerCase('es').includes(term));
    host.innerHTML = users.length ? users.map(user => `<article class="users-card" data-user-id="${escapeHtml(user.id)}"><div class="users-card-header"><div class="users-identity"><b data-user-name>${escapeHtml(user.name)}</b><span>${escapeHtml(emails.get(user.id) || 'Correo no disponible')}</span></div><span class="users-status ${user.active ? '' : 'inactive'}">${user.active ? 'Activo' : 'Inactivo'}</span></div><div class="users-meta">${escapeHtml(roles[user.role]?.name || 'Sin perfil asignado')} · ${user.role === 'admin' ? 'Acceso total protegido' : `${permissionsFor(user.role).length} permisos`}</div><div class="users-actions"><button type="button" data-user-view="${escapeHtml(user.id)}">Ver permisos</button><button type="button" data-user-edit="${escapeHtml(user.id)}">Editar acceso</button><button type="button" data-user-status="${escapeHtml(user.id)}" ${user.id === window.ElevaSessionUser.id ? 'disabled' : ''}>${user.active ? 'Desactivar' : 'Activar'}</button></div></article>`).join('') : '<div class="users-empty" role="status">No hay usuarios que coincidan con estos filtros.</div>';
    host.querySelectorAll('[data-user-view]').forEach(button => button.addEventListener('click', () => openUserEditor(button.dataset.userView, true)));
    host.querySelectorAll('[data-user-edit]').forEach(button => button.addEventListener('click', () => openUserEditor(button.dataset.userEdit)));
    host.querySelectorAll('[data-user-status]').forEach(button => button.addEventListener('click', () => openUserEditor(button.dataset.userStatus, false, true)));
  };

  function setupPermissions(host, roleSelect, customize, review) {
    const panel = host.querySelector('[data-permissions-panel]');
    function update(reset = false) {
      const role = roleSelect.value, admin = role === 'admin';
      if (admin) customize.checked = false;
      customize.disabled = admin;
      if (reset) panel.innerHTML = permissionMarkup(role, customize.checked);
      else panel.querySelectorAll('input').forEach(input => { input.disabled = admin || !customize.checked || input.value === 'manage_access'; });
      review();
    }
    roleSelect.addEventListener('change', () => update(true));
    customize.addEventListener('change', () => update(!customize.checked));
    panel.addEventListener('change', event => {
      const dependencies = {manage_clients:'view_clients',manage_quotes:'view_quotes',manage_followups:'view_followups',manage_reservations:'view_reservations',manage_treasury:'view_cash'};
      const input = event.target;
      if (input.matches('[data-user-permission]')) {
        if (input.checked && dependencies[input.value]) panel.querySelector(`[value="${dependencies[input.value]}"]`).checked = true;
        if (!input.checked) Object.entries(dependencies).forEach(([action, view]) => { if (view === input.value) panel.querySelector(`[value="${action}"]`).checked = false; });
      }
      review();
    });
    update(true);
  }

  function openUserEditor(id, readOnly = false, toggle = false) {
    if (!isAdmin() || busy) return;
    const user = settings.users.find(row => row.id === id), host = document.getElementById('userEditor');
    if (!user || !host) return;
    host.hidden = false;
    if (readOnly) {
      host.innerHTML = `<h3>Permisos de ${escapeHtml(user.name)}</h3><p>${user.active ? 'Acceso activo' : 'Cuenta inactiva: no tiene acceso operativo'} · ${escapeHtml(roleCatalog()[user.role]?.name || 'Sin perfil')}</p><div class="users-permissions">${permissionMarkup(user.role, false)}</div><button type="button" data-close-editor>Cerrar</button>`;
      host.querySelector('[data-close-editor]').addEventListener('click', () => { host.hidden = true; });
    } else {
      host.innerHTML = `<form id="userAccessForm"><h3>Editar acceso</h3><fieldset><div class="users-fields"><label>Nombre<input name="display_name" value="${escapeHtml(user.name)}" maxlength="120" required></label><label>Perfil<select name="role_code">${roleOptions(user.role)}</select></label><label>Estado<select name="active"><option value="true">Activo</option><option value="false">Inactivo</option></select></label></div><label class="users-check"><input type="checkbox" id="userCustomize"><span>Personalizar permisos solo para esta persona. Se guardará un perfil exclusivo; los demás usuarios conservarán sus permisos.</span></label><div class="users-permissions" data-permissions-panel></div><div class="users-review" id="userAccessReview" aria-live="polite"></div><div class="users-actions"><button class="primary" type="submit">Guardar acceso</button><button type="button" data-close-editor>Cancelar</button></div></fieldset><p class="users-message" role="alert"></p></form>`;
      const form = host.querySelector('form'), customize = host.querySelector('#userCustomize'), message = host.querySelector('.users-message');
      form.elements.active.value = String(toggle ? !user.active : user.active === true);
      const review = () => { host.querySelector('#userAccessReview').textContent = `${form.elements.display_name.value.trim() || 'Usuario'} · ${roleCatalog()[form.elements.role_code.value]?.name || 'Sin perfil'} · ${form.elements.active.value === 'true' ? 'Activo' : 'Inactivo'} · ${form.elements.role_code.value === 'admin' ? 'Acceso total protegido' : `${checkedPermissions(host).length} permisos${customize.checked ? ' en un perfil exclusivo' : ' del perfil compartido'}`}.`; };
      setupPermissions(host, form.elements.role_code, customize, review);
      if (user.id === window.ElevaSessionUser.id) { form.elements.role_code.disabled = true; form.elements.active.disabled = true; }
      form.addEventListener('input', review);
      form.addEventListener('change', review);
      host.querySelector('[data-close-editor]').addEventListener('click', () => { host.hidden = true; });
      form.addEventListener('submit', async event => {
        event.preventDefault();
        if (busy || window.ElevaBridge?.mutation) return;
        const changes = {name: form.elements.display_name.value.trim(), role: form.elements.role_code.value, active: form.elements.active.value === 'true', customize: customize.checked, permissions: checkedPermissions(host)};
        busy = true; form.querySelector('fieldset').disabled = true; message.textContent = 'Guardando acceso…';
        try {
          const role = await window.saveUserAccess(id, changes);
          const saved = settings.users.find(row => row.id === id);
          if (!role || !saved || saved.name !== changes.name || saved.role !== role || saved.active !== changes.active || (changes.customize && !samePermissions(permissionsFor(role), changes.permissions))) throw new Error('No se confirmó el cambio. Revisa el aviso y vuelve a consultar el usuario.');
          renderAccessConfigTab(); showToast('Acceso actualizado');
        } catch (error) { message.textContent = error.message; window.ElevaFeedback?.error(error.message); }
        finally { busy = false; form.querySelector('fieldset').disabled = false; }
      });
    }
    host.scrollIntoView?.({behavior: 'smooth', block: 'start'});
    host.querySelector('input,button')?.focus();
  }

  window.ElevaUsersUI = {
    isBusy: () => busy,
    setDirectoryLoader(loader) { directoryLoader = loader; directoryState = 'idle'; },
    clearDirectory() { directoryGeneration++; directoryState = 'idle'; emails.clear(); query = ''; statusFilter = 'all'; },
    reloadDirectory() { directoryGeneration++; directoryState = 'idle'; return loadDirectory(true); },
    openCreate({create, refresh, feedback}) {
      if (!isAdmin() || busy) return;
      const host = document.getElementById('userEditor');
      if (!host) return;
      host.hidden = false;
      const preferred = roleCatalog()[settings.controlRules.defaultUserRole] ? settings.controlRules.defaultUserRole : 'shift';
      host.innerHTML = `<form id="inviteUserForm"><h3>Crear usuario</h3><p>Define la cuenta y revisa sus accesos antes de confirmar.</p><fieldset><div class="users-fields"><label>Nombre<input name="display_name" maxlength="120" required autocomplete="name"></label><label>Correo<input name="email" type="email" maxlength="254" required autocomplete="email"></label><label>Perfil inicial<select name="role_code">${roleOptions(preferred)}</select></label><label>Forma de acceso<select name="action"><option value="invite">Invitación por correo</option><option value="create">Crear con contraseña inicial</option></select></label><label id="invitePasswordField" hidden>Contraseña inicial<input name="password" type="password" autocomplete="new-password" minlength="12" maxlength="128" disabled></label></div><label class="users-check"><input type="checkbox" id="inviteCustomize"><span>Elegir permisos exclusivos para esta persona</span></label><div class="users-permissions" data-permissions-panel></div><div class="users-review" id="inviteReview" aria-live="polite"></div><div class="users-actions"><button class="primary" type="submit">Crear y enviar invitación</button><button type="button" data-cancel-create>Cancelar</button></div></fieldset><p id="inviteUserError" class="users-message" role="alert"></p></form>`;
      const form = host.querySelector('form'), customize = host.querySelector('#inviteCustomize'), button = form.querySelector('[type=submit]'), message = host.querySelector('#inviteUserError');
      window.ElevaAccessUI?.decorateCard(form);
      let created = false, pendingRole = null;
      const review = () => { host.querySelector('#inviteReview').textContent = `${form.elements.display_name.value.trim() || 'Nuevo usuario'} · ${form.elements.email.value.trim() || 'Correo pendiente'} · Activo al completar el alta · ${form.elements.role_code.value === 'admin' ? 'Acceso total protegido' : `${checkedPermissions(host).length} permisos${customize.checked ? ' exclusivos' : ' del perfil seleccionado'}`}.`; };
      setupPermissions(host, form.elements.role_code, customize, review);
      form.addEventListener('input', review);
      form.elements.action.addEventListener('change', () => {
        const direct = form.elements.action.value === 'create';
        host.querySelector('#invitePasswordField').hidden = !direct;
        form.elements.password.disabled = !direct; form.elements.password.required = direct;
        if (!direct) form.elements.password.value = '';
        button.textContent = direct ? 'Crear cuenta' : 'Crear y enviar invitación';
      });
      host.querySelector('[data-cancel-create]').addEventListener('click', () => { host.hidden = true; });
      form.addEventListener('submit', async event => {
        event.preventDefault();
        if (busy || created || window.ElevaBridge?.mutation) return;
        const input = Object.fromEntries(new FormData(form)), selected = checkedPermissions(host);
        busy = true; form.querySelector('fieldset').disabled = true; message.textContent = 'Creando usuario…';
        try {
          requireAdmin();
          if (customize.checked) {
            if (!pendingRole || !samePermissions(permissionsFor(pendingRole), selected) || roleCatalog()[pendingRole]?.baseRole !== roleCatalog()[input.role_code]?.baseRole) pendingRole = await window.saveNewUserProfile(input.role_code, selected, input.display_name);
            if (!pendingRole || !roleCatalog()[pendingRole] || !samePermissions(permissionsFor(pendingRole), selected)) throw new Error('No se confirmó el perfil de permisos. La cuenta todavía no se ha creado.');
            input.role_code = pendingRole;
          }
          const result = await create(input);
          created = true; form.elements.password.value = '';
          if (result?.user?.id) emails.set(result.user.id, input.email.trim());
          await refresh();
          await window.ElevaUsersUI.reloadDirectory();
          query = ''; statusFilter = 'all';
          window.ElevaLegacy.refreshUserDraft(); renderAccessConfigTab();
          feedback(input.action === 'invite' ? 'Cuenta creada e invitación enviada.' : 'Usuario creado.');
        } catch (error) {
          form.elements.password.value = '';
          message.textContent = created ? `La cuenta se creó, pero no se pudo actualizar el listado: ${error.message} Cierra este formulario y vuelve a abrir Usuarios antes de intentar otra alta.` : error.message;
          window.ElevaFeedback?.error(message.textContent);
          if (created) host.querySelector('[data-cancel-create]').textContent = 'Cerrar';
        } finally { busy = false; form.querySelector('fieldset').disabled = false; button.disabled = created; }
      });
      host.scrollIntoView?.({behavior: 'smooth', block: 'start'});
      form.elements.display_name.focus();
    }
  };
})();
