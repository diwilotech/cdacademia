// Login en la raíz: correo + contraseña, link de invitación (#invite=<token>) y elección de negocio.
// Cloudflare Turnstile protege el ingreso y la invitación: el token se verifica en el Worker (Siteverify).
(function () {
  const { api, esc } = window.App;
  const $ = (id) => document.getElementById(id);
  const show = (id) => ['login', 'invite', 'choose'].forEach((x) => ($(x).hidden = x !== id));
  let cfg = { turnstileSiteKey: null };
  const widgets = {};

  // Turnstile: un widget por formulario; cada token sirve una vez, así que tras un error se reinicia.
  function loadTurnstile() {
    return new Promise((resolve) => {
      if (window.turnstile) return resolve();
      window.onTurnstileLoad = resolve;
      const s = document.createElement('script');
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=onTurnstileLoad';
      s.async = true;
      document.head.appendChild(s);
    });
  }
  async function mountTurnstile(formId) {
    if (!cfg.turnstileSiteKey || widgets[formId] !== undefined) return;
    await loadTurnstile();
    widgets[formId] = window.turnstile.render($(formId).querySelector('[data-turnstile]'), { sitekey: cfg.turnstileSiteKey, language: 'es', theme: 'auto', size: 'flexible' });
  }
  const tsToken = (formId) => (widgets[formId] !== undefined ? window.turnstile.getResponse(widgets[formId]) : '');
  const tsReset = (formId) => { if (widgets[formId] !== undefined) window.turnstile.reset(widgets[formId]); };

  function afterLogin(data) {
    if (data.businesses.length === 1) return location.replace('/staff/');
    if (!data.businesses.length) {
      show('login');
      $('login').querySelector('[data-err]').textContent = 'Tu cuenta no tiene ningún negocio activo.';
      return;
    }
    $('choose').querySelector('[data-list]').innerHTML = data.businesses.map((b) =>
      `<button type="button" class="btn btn-outline-secondary btn-lg text-start" data-id="${esc(b.id)}"><i class="bi bi-shop me-2"></i>${esc(b.name)}</button>`).join('');
    show('choose');
  }

  $('choose').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-id]');
    if (!b) return;
    await api('/api/auth/business', { method: 'POST', body: { businessId: b.dataset.id } });
    location.replace('/staff/');
  });

  $('login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target, err = f.querySelector('[data-err]'), btn = f.querySelector('button');
    err.textContent = '';
    if (!f.email.value || !f.password.value) { err.textContent = 'Escribe tu correo y tu contraseña'; return; }
    btn.disabled = true;
    try {
      afterLogin(await api('/api/auth/login', { method: 'POST', body: { email: f.email.value, password: f.password.value, turnstile: tsToken('login') } }));
    } catch (ex) {
      err.textContent = ex.message;
      tsReset('login');
    } finally {
      btn.disabled = false;
    }
  });

  async function startInvite(token) {
    const f = $('invite'), err = f.querySelector('[data-err]');
    show('invite');
    let info;
    try {
      info = await api(`/api/auth/invite?token=${encodeURIComponent(token)}`);
    } catch (ex) {
      show('login');
      mountTurnstile('login');
      $('login').querySelector('[data-err]').textContent = ex.message;
      history.replaceState(null, '', '/');
      return;
    }
    f.querySelector('[data-title]').textContent = info.reset ? 'Crea una contraseña nueva' : 'Crea tu contraseña';
    f.querySelector('[data-email]').textContent = info.email;
    f.name.value = info.name && info.name !== info.email.split('@')[0] ? info.name : '';
    f.querySelector('[data-consent]').hidden = !info.needsConsent;
    mountTurnstile('invite');
    f.onsubmit = async (e) => {
      e.preventDefault();
      err.textContent = '';
      if (f.password.value.length < 8) { err.textContent = 'La contraseña debe tener al menos 8 caracteres'; return; }
      if (f.password.value !== f.confirm.value) { err.textContent = 'Las contraseñas no coinciden'; return; }
      if (info.needsConsent && (!f.consent.checked || !f.adult.checked)) { err.textContent = 'Para continuar, autoriza el tratamiento de tus datos y confirma que eres mayor de edad'; return; }
      try {
        const data = await api('/api/auth/invite', { method: 'POST', body: { token, password: f.password.value, name: f.name.value, consent: f.consent.checked, adult: f.adult.checked, turnstile: tsToken('invite') } });
        history.replaceState(null, '', '/');
        afterLogin(data);
      } catch (ex) {
        err.textContent = ex.message;
        tsReset('invite');
      }
    };
  }

  $('invite').onsubmit = (e) => e.preventDefault(); // nunca se envía solo
  const route = () => {
    const token = new URLSearchParams(location.hash.slice(1)).get('invite');
    if (token) startInvite(token);
    else { show('login'); mountTurnstile('login'); }
  };
  addEventListener('hashchange', route);
  api('/api/config').then((c) => {
    cfg = c;
    document.querySelector('[data-app]').textContent = c.app;
    document.title = `Ingresar · ${c.app}`;
    if (!localStorage.getItem('dw_tema')) document.documentElement.setAttribute('data-dw-tema', c.tema);
  }).catch(() => {}).finally(route);
})();
