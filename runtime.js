'use strict';
/* =====================================================================
   RUNTIME — the hosted platform's connection to Supabase.
   1. Sign-in screens: sign in, create account, forgotten password, new password.
   2. Once someone is signed in, the three services the app uses, with the
      same shape they had in the prototype:
        db         live collections of documents (read, set, update, delete)
        user       who is signed in, and the names of other people
        downloads  save a file to this computer
   3. app.js is loaded only after sign-in.
   Every read and write is checked again by the database (row level security).
   ===================================================================== */
(function () {
  const CFG = window.SCOUTING_CONFIG || {};
  const authEl = document.getElementById('auth');
  const appEl = document.getElementById('app');

  /* ---------- Language (same choice as the app: saved in this browser) ---------- */
  let lang = (() => {
    try { const s = localStorage.getItem('lang'); if (s === 'pt' || s === 'en') return s; } catch (e) { /* none saved */ }
    return /^pt\b/i.test(navigator.language || '') ? 'pt' : 'en';
  })();
  const TEXT = {
    en: {
      brand: 'Scouting & Recruitment',
      loading: 'Loading…',
      signinTitle: 'Sign in',
      email: 'Email',
      password: 'Password',
      newPassword: 'New password',
      repeatPassword: 'Repeat the password',
      name: 'Name',
      signin: 'Sign in',
      forgot: 'Forgot your password?',
      createAccount: 'Create account',
      signupTitle: 'Create account',
      signupHint: 'Use the email you were invited with. Your access opens as soon as you confirm it.',
      haveAccount: 'Already have an account? Sign in',
      checkTitle: 'Confirm your email',
      checkText: 'We sent a link to {email}. Open it to activate your account, then sign in here.',
      backToSignin: 'Back to sign in',
      forgotTitle: 'Forgotten password',
      forgotText: 'Enter your email and we will send you a link to choose a new password.',
      sendLink: 'Send link',
      forgotSent: 'If there is an account with this email, we sent it a link to choose a new password.',
      resetTitle: 'Choose a new password',
      savePassword: 'Save password',
      passwordSaved: 'Password saved.',
      welcomeTitle: 'Welcome to the platform',
      welcomeText: '{club} invited you to the platform. Choose the name others will see and your password.',
      enter: 'Enter the platform',
      errEmail: 'Enter a valid email address.',
      errName: 'Enter your name.',
      errPasswordShort: 'Use at least 8 characters.',
      errPasswordMatch: 'The passwords do not match.',
      errCredentials: 'Wrong email or password.',
      errNotConfirmed: 'This email is not confirmed yet. Open the link we sent you.',
      errExists: 'There is already an account with this email. Sign in with your password.',
      errWeak: 'Choose a stronger password (at least 8 characters).',
      errRate: 'Too many attempts. Try again in a few minutes.',
      errSignupOff: 'New accounts are not open. Ask the Owner for an invitation.',
      errNetwork: 'No connection to the server. Check the internet connection and try again.',
      errLink: 'This link is no longer valid. Ask for a new one.',
      errGeneric: 'Something went wrong: {m}',
      unavailable: 'The platform is not available right now. Try again in a few minutes.',
      working: 'One moment…',
    },
    pt: {
      brand: 'Scouting e Recrutamento',
      loading: 'A carregar…',
      signinTitle: 'Entrar',
      email: 'Email',
      password: 'Palavra-passe',
      newPassword: 'Nova palavra-passe',
      repeatPassword: 'Repita a palavra-passe',
      name: 'Nome',
      signin: 'Entrar',
      forgot: 'Esqueceu-se da palavra-passe?',
      createAccount: 'Criar conta',
      signupTitle: 'Criar conta',
      signupHint: 'Use o email para o qual foi convidado. O acesso abre-se assim que o confirmar.',
      haveAccount: 'Já tem conta? Entrar',
      checkTitle: 'Confirme o seu email',
      checkText: 'Enviámos um link para {email}. Abra-o para ativar a conta e depois entre aqui.',
      backToSignin: 'Voltar a entrar',
      forgotTitle: 'Palavra-passe esquecida',
      forgotText: 'Escreva o seu email e enviamos um link para escolher uma nova palavra-passe.',
      sendLink: 'Enviar link',
      forgotSent: 'Se existir uma conta com este email, enviámos um link para escolher uma nova palavra-passe.',
      resetTitle: 'Escolha uma nova palavra-passe',
      savePassword: 'Guardar palavra-passe',
      passwordSaved: 'Palavra-passe guardada.',
      welcomeTitle: 'Bem-vindo à plataforma',
      welcomeText: 'O {club} convidou-o para a plataforma. Escolha o nome que os outros vão ver e a sua palavra-passe.',
      enter: 'Entrar na plataforma',
      errEmail: 'Escreva um email válido.',
      errName: 'Escreva o seu nome.',
      errPasswordShort: 'Use pelo menos 8 caracteres.',
      errPasswordMatch: 'As palavras-passe não são iguais.',
      errCredentials: 'Email ou palavra-passe errados.',
      errNotConfirmed: 'Este email ainda não está confirmado. Abra o link que lhe enviámos.',
      errExists: 'Já existe uma conta com este email. Entre com a sua palavra-passe.',
      errWeak: 'Escolha uma palavra-passe mais forte (pelo menos 8 caracteres).',
      errRate: 'Demasiadas tentativas. Tente daqui a alguns minutos.',
      errSignupOff: 'A criação de contas não está aberta. Peça um convite ao proprietário.',
      errNetwork: 'Sem ligação ao servidor. Verifique a ligação à internet e tente de novo.',
      errLink: 'Este link já não é válido. Peça um novo.',
      errGeneric: 'Ocorreu um problema: {m}',
      unavailable: 'A plataforma não está disponível neste momento. Tente daqui a alguns minutos.',
      working: 'Um momento…',
    },
  };
  const t = (k, v = {}) => (TEXT[lang][k] || TEXT.en[k] || k).replace(/\{(\w+)\}/g, (_, n) => (v[n] === undefined ? '' : String(v[n])));
  const esc = (s) => String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
  const isUuid = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(s || ''));
  const here = () => location.origin + location.pathname;

  /* ---------- Links coming back from emails (confirmation, new password) ---------- */
  const hashParams = new URLSearchParams(location.hash.replace(/^#/, ''));
  const queryParams = new URLSearchParams(location.search);
  const linkType = hashParams.get('type') || '';
  const linkError = hashParams.get('error_description') || queryParams.get('error_description') || '';

  if (!window.supabase || typeof window.supabase.createClient !== 'function' || !CFG.url || !CFG.key) {
    authEl.hidden = false;
    authEl.innerHTML = `<div class="auth-card"><section class="panel auth-panel"><p class="auth-text">${esc(t('unavailable'))}</p></section></div>`;
    return;
  }

  const client = window.supabase.createClient(CFG.url, CFG.key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit' },
  });

  /* ---------- Sign-in screens ---------- */
  let screen = { name: 'loading', args: {} };
  // An invitation link signs the person in; they choose a name and password before entering.
  let recovering = linkType === 'recovery' || linkType === 'invite';
  const setupScreen = () => (linkType === 'invite' ? 'welcome' : 'reset');
  let started = false;

  const field = (id, label, type, attrs = '') => `<div class="field"><label for="${id}">${esc(label)}</label><input id="${id}" class="input" type="${type}" name="${id}" ${attrs}></div>`;
  const link = (to, label) => `<button type="button" class="auth-link" data-go="${to}">${esc(label)}</button>`;
  const notice = (kind, text) => (text ? `<p class="auth-msg auth-msg--${kind}">${esc(text)}</p>` : '');

  const SCREENS = {
    loading: () => `<p class="auth-text">${esc(t('loading'))}</p>`,
    signin: ({ info, error } = {}) => `
      <h1 class="auth-title">${esc(t('signinTitle'))}</h1>
      ${notice('ok', info)}${notice('error', error)}
      <form class="auth-form" data-form="signin" novalidate>
        ${field('a-email', t('email'), 'email', 'autocomplete="username" required')}
        ${field('a-password', t('password'), 'password', 'autocomplete="current-password" required')}
        <p class="auth-msg auth-msg--error" data-error hidden></p>
        <button type="submit" class="btn btn--primary">${esc(t('signin'))}</button>
      </form>
      <div class="auth-links">${link('forgot', t('forgot'))}${link('signup', t('createAccount'))}</div>`,
    signup: () => `
      <h1 class="auth-title">${esc(t('signupTitle'))}</h1>
      <p class="auth-text">${esc(t('signupHint'))}</p>
      <form class="auth-form" data-form="signup" novalidate>
        ${field('a-name', t('name'), 'text', 'autocomplete="name" maxlength="80" required')}
        ${field('a-email', t('email'), 'email', 'autocomplete="username" required')}
        ${field('a-password', t('password'), 'password', 'autocomplete="new-password" minlength="8" required')}
        <p class="auth-msg auth-msg--error" data-error hidden></p>
        <button type="submit" class="btn btn--primary">${esc(t('createAccount'))}</button>
      </form>
      <div class="auth-links">${link('signin', t('haveAccount'))}</div>`,
    check: ({ email }) => `
      <h1 class="auth-title">${esc(t('checkTitle'))}</h1>
      <p class="auth-text">${esc(t('checkText', { email }))}</p>
      <div class="auth-links">${link('signin', t('backToSignin'))}</div>`,
    forgot: ({ sent } = {}) => `
      <h1 class="auth-title">${esc(t('forgotTitle'))}</h1>
      ${sent ? notice('ok', t('forgotSent')) : `<p class="auth-text">${esc(t('forgotText'))}</p>
      <form class="auth-form" data-form="forgot" novalidate>
        ${field('a-email', t('email'), 'email', 'autocomplete="username" required')}
        <p class="auth-msg auth-msg--error" data-error hidden></p>
        <button type="submit" class="btn btn--primary">${esc(t('sendLink'))}</button>
      </form>`}
      <div class="auth-links">${link('signin', t('backToSignin'))}</div>`,
    welcome: () => `
      <h1 class="auth-title">${esc(t('welcomeTitle'))}</h1>
      <p class="auth-text">${esc(t('welcomeText', { club: CFG.club || '' }))}</p>
      <form class="auth-form" data-form="welcome" novalidate>
        ${field('a-name', t('name'), 'text', 'autocomplete="name" maxlength="80" required')}
        ${field('a-password', t('password'), 'password', 'autocomplete="new-password" minlength="8" required')}
        ${field('a-password2', t('repeatPassword'), 'password', 'autocomplete="new-password" minlength="8" required')}
        <p class="auth-msg auth-msg--error" data-error hidden></p>
        <button type="submit" class="btn btn--primary">${esc(t('enter'))}</button>
      </form>`,
    reset: () => `
      <h1 class="auth-title">${esc(t('resetTitle'))}</h1>
      <form class="auth-form" data-form="reset" novalidate>
        ${field('a-password', t('newPassword'), 'password', 'autocomplete="new-password" minlength="8" required')}
        ${field('a-password2', t('repeatPassword'), 'password', 'autocomplete="new-password" minlength="8" required')}
        <p class="auth-msg auth-msg--error" data-error hidden></p>
        <button type="submit" class="btn btn--primary">${esc(t('savePassword'))}</button>
      </form>`,
  };

  function show(name, args = {}) {
    screen = { name, args };
    document.documentElement.lang = lang;
    authEl.hidden = false;
    authEl.innerHTML = `<div class="auth-card">
      <div class="auth-top">
        <div class="auth-brand"><img class="sb-logo" src="logo.svg" alt="" width="32" height="32"><div><div class="sb-name">${esc(t('brand'))}</div><div class="auth-club">${esc(CFG.club || '')}</div></div></div>
        <div class="seg seg--lang" role="group" aria-label="Language">${['pt', 'en'].map((l) => `<button type="button" class="seg__btn${l === lang ? ' is-active' : ''}" data-lang="${l}" aria-pressed="${l === lang}" translate="no">${l.toUpperCase()}</button>`).join('')}</div>
      </div>
      <section class="panel auth-panel">${SCREENS[name](args)}</section>
    </div>`;
    const first = authEl.querySelector('input');
    if (first) first.focus();
  }

  function errText(e) {
    const m = String((e && (e.message || e.error_description || e.msg)) || '');
    const code = String((e && e.code) || '');
    if (code === 'invalid_credentials' || /invalid login credentials/i.test(m)) return t('errCredentials');
    if (code === 'email_not_confirmed' || /email not confirmed/i.test(m)) return t('errNotConfirmed');
    if (code === 'user_already_exists' || /already (registered|exists)/i.test(m)) return t('errExists');
    if (code === 'weak_password' || /password should|password is too|weak password/i.test(m)) return t('errWeak');
    if ((e && e.status === 429) || /rate limit|too many/i.test(m) || /^over_/.test(code)) return t('errRate');
    if (code === 'signup_disabled' || /signups? not allowed|signup is disabled/i.test(m)) return t('errSignupOff');
    if (/failed to fetch|network/i.test(m)) return t('errNetwork');
    return t('errGeneric', { m });
  }

  function setBusy(form, busy) {
    const btn = form.querySelector('button[type="submit"]');
    if (!btn) return;
    if (busy) { btn.dataset.label = btn.textContent; btn.textContent = t('working'); btn.disabled = true; }
    else { btn.textContent = btn.dataset.label || btn.textContent; btn.disabled = false; }
  }
  function fail(form, text) {
    const box = form.querySelector('[data-error]');
    if (box) { box.textContent = text; box.hidden = false; }
    setBusy(form, false);
  }

  const HANDLERS = {
    async signin(form) {
      const email = form.elements['a-email'].value.trim();
      const password = form.elements['a-password'].value;
      if (!isEmail(email)) return fail(form, t('errEmail'));
      if (!password) return fail(form, t('errCredentials'));
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error) return fail(form, errText(error));
      await startApp(data.session);
    },
    async signup(form) {
      const name = form.elements['a-name'].value.trim();
      const email = form.elements['a-email'].value.trim();
      const password = form.elements['a-password'].value;
      if (!name) return fail(form, t('errName'));
      if (!isEmail(email)) return fail(form, t('errEmail'));
      if (password.length < 8) return fail(form, t('errPasswordShort'));
      const { data, error } = await client.auth.signUp({ email, password, options: { data: { name }, emailRedirectTo: here() } });
      if (error) return fail(form, errText(error));
      if (data && data.session) return startApp(data.session);
      show('check', { email });
    },
    async forgot(form) {
      const email = form.elements['a-email'].value.trim();
      if (!isEmail(email)) return fail(form, t('errEmail'));
      const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: here() });
      if (error) return fail(form, errText(error));
      show('forgot', { sent: true });
    },
    async welcome(form) {
      const name = form.elements['a-name'].value.trim();
      const password = form.elements['a-password'].value;
      const again = form.elements['a-password2'].value;
      if (!name) return fail(form, t('errName'));
      if (password.length < 8) return fail(form, t('errPasswordShort'));
      if (password !== again) return fail(form, t('errPasswordMatch'));
      const { error } = await client.auth.updateUser({ password, data: { name } });
      if (error) return fail(form, errText(error));
      recovering = false;
      history.replaceState(null, '', here());
      const { data } = await client.auth.getSession();
      if (data && data.session) return startApp(data.session);
      show('signin', { info: t('passwordSaved') });
    },
    async reset(form) {
      const password = form.elements['a-password'].value;
      const again = form.elements['a-password2'].value;
      if (password.length < 8) return fail(form, t('errPasswordShort'));
      if (password !== again) return fail(form, t('errPasswordMatch'));
      const { error } = await client.auth.updateUser({ password });
      if (error) return fail(form, errText(error));
      recovering = false;
      const { data } = await client.auth.getSession();
      if (data && data.session) return startApp(data.session);
      show('signin', { info: t('passwordSaved') });
    },
  };

  authEl.addEventListener('submit', async (e) => {
    const form = e.target.closest('form[data-form]');
    if (!form) return;
    e.preventDefault();
    const box = form.querySelector('[data-error]');
    if (box) box.hidden = true;
    setBusy(form, true);
    try { await HANDLERS[form.dataset.form](form); } catch (err) { fail(form, errText(err)); }
  });
  authEl.addEventListener('click', (e) => {
    const go = e.target.closest('[data-go]');
    if (go) { show(go.dataset.go); return; }
    const l = e.target.closest('[data-lang]');
    if (l && l.dataset.lang !== lang) {
      lang = l.dataset.lang;
      try { localStorage.setItem('lang', lang); } catch (err) { /* kept for this visit */ }
      show(screen.name, screen.args);
    }
  });

  /* ---------- Services for the app ---------- */
  const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  function deepMerge(base, patch) {
    const out = { ...base };
    Object.entries(patch).forEach(([k, v]) => { out[k] = isPlainObject(v) && isPlainObject(out[k]) ? deepMerge(out[k], v) : v; });
    return out;
  }
  function asError(error) {
    const e = new Error((error && error.message) || 'request_failed');
    e.code = error && error.code;
    return e;
  }

  function makeDb(uid) {
    const cols = new Map();      // path -> { items: Map(id -> data), subs: Set, loaded, loading }
    let channel = null;
    let wasDown = false;
    let reloadTimer = null;
    let hiddenAt = 0;

    const col = (path) => {
      if (!cols.has(path)) cols.set(path, { items: new Map(), subs: new Set(), loaded: false, loading: null });
      return cols.get(path);
    };
    const snapshot = (c) => ({ docs: [...c.items].map(([id, d]) => ({ id, exists: true, data: () => d })) });
    const emit = (c) => {
      const snap = snapshot(c);
      c.subs.forEach((s) => { try { s.next(snap); } catch (err) { console.error(err); } });
    };

    async function load(path) {
      const c = col(path);
      const items = new Map();
      const size = 1000;
      for (let from = 0; ; from += size) {
        const { data, error } = await client.from('docs').select('id,data').eq('collection', path).order('id').range(from, from + size - 1);
        if (error) throw asError(error);
        data.forEach((r) => items.set(r.id, r.data || {}));
        if (data.length < size) break;
      }
      c.items = items;
      c.loaded = true;
      emit(c);
    }
    function reloadAll() {
      cols.forEach((c, path) => {
        if (!c.subs.size) return;
        load(path).catch((err) => console.error('reload', path, err));
      });
    }
    function scheduleReloadAll() {
      clearTimeout(reloadTimer);
      reloadTimer = setTimeout(reloadAll, 400);
    }

    function onChange(payload) {
      const row = payload.eventType === 'DELETE' ? payload.old : payload.new;
      if (!row || !row.collection) return;
      // A change to this person's own membership can widen or narrow what they may see.
      if (row.collection === 'members' && row.id === uid) scheduleReloadAll();
      const c = cols.get(row.collection);
      if (!c || !c.loaded) return;
      if (payload.eventType === 'DELETE') c.items.delete(row.id);
      else c.items.set(row.id, row.data || {});
      emit(c);
    }
    function ensureChannel() {
      if (channel) return;
      channel = client.channel(`docs-${uid}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'docs' }, onChange)
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') { if (wasDown) { wasDown = false; reloadAll(); } }
          else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') wasDown = true;
        });
    }
    // Back on the page after a while: catch up in case live updates were missed.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { hiddenAt = Date.now(); return; }
      if (hiddenAt && Date.now() - hiddenAt > 120000) reloadAll();
      hiddenAt = 0;
    });

    const putLocal = (path, id, data) => {
      const c = col(path);
      if (!c.loaded) return;
      c.items.set(id, data);
      emit(c);
    };

    return {
      collection(path) {
        return {
          onSnapshot(next, error) {
            const c = col(path);
            const sub = { next, error };
            c.subs.add(sub);
            ensureChannel();
            if (c.loaded) next(snapshot(c));
            else if (!c.loading) {
              c.loading = load(path).catch((err) => {
                c.loading = null;
                c.subs.forEach((s) => { if (s.error) s.error(err); });
              });
            }
            return () => c.subs.delete(sub);
          },
          doc(id) {
            return {
              async set(data) {
                const { error } = await client.rpc('doc_set', { c: path, i: id, d: data });
                if (error) throw asError(error);
                putLocal(path, id, data);
              },
              async update(patch) {
                const { error } = await client.rpc('doc_patch', { c: path, i: id, patch });
                if (error) throw asError(error);
                const c = col(path);
                putLocal(path, id, deepMerge(c.items.get(id) || {}, patch));
              },
              async delete() {
                const { data, error } = await client.from('docs').delete().eq('collection', path).eq('id', id).select('id');
                if (error) throw asError(error);
                const c = col(path);
                if (!data.length && c.items.has(id)) throw asError({ message: 'not_permitted', code: '42501' });
                if (c.items.delete(id)) emit(c);
              },
            };
          },
        };
      },
    };
  }

  function makeUser(me) {
    return {
      async me() { return { ...me }; },
      async can() { return true; },
      async profiles(ids) {
        const wanted = [...new Set(ids)].filter(isUuid);
        if (!wanted.length) return {};
        const { data, error } = await client.from('profiles').select('id,name,email').in('id', wanted);
        if (error) throw asError(error);
        return Object.fromEntries(data.map((p) => [p.id, { name: p.name || '', email: p.email || '' }]));
      },
    };
  }

  const downloads = {
    async save({ filename, data, mimeType }) {
      const blob = data instanceof Blob ? data : new Blob([data], { type: mimeType || 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename || 'download';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    },
  };

  /* ---------- Start the app for a signed-in person ---------- */
  async function startApp(session) {
    if (started || !session) return;
    started = true;
    show('loading');
    const user = session.user;
    // An invited person who signs in with the invited email joins here (checked in the database).
    try { await client.rpc('accept_invite'); } catch (err) { /* nothing to accept */ }
    let isOwner = false;
    try { const r = await client.rpc('am_i_owner'); isOwner = r.data === true; } catch (err) { isOwner = false; }
    let profileName = '';
    try {
      const { data } = await client.from('profiles').select('name').eq('id', user.id).maybeSingle();
      profileName = (data && data.name) || '';
    } catch (err) { /* the name is not essential */ }
    const me = {
      id: user.id,
      name: profileName || (user.user_metadata && user.user_metadata.name) || '',
      email: user.email || null,
      isOwner,
      canEdit: isOwner,
    };
    const services = { db: makeDb(user.id), user: makeUser(me), downloads };
    window.claude = { use: async (name) => services[name] || null };
    window.ScoutingAuth = {
      email: user.email || '',
      // Asks the server to email an invitation (it checks that the Owner is asking and the invitation is open).
      async sendInvite(email) {
        const { data, error } = await client.functions.invoke('send-invite', { body: { email, redirectTo: here() } });
        if (error) return { status: 'error' };
        return data && data.status ? data : { status: 'error' };
      },
      async signOut() {
        try { await client.auth.signOut(); } catch (err) { /* leave anyway */ }
        location.replace(here());
      },
    };
    authEl.hidden = true;
    authEl.innerHTML = '';
    appEl.hidden = false;
    const s = document.createElement('script');
    s.src = 'app.js';
    document.body.appendChild(s);
  }

  client.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY') { recovering = true; if (!started) show('reset'); return; }
    if (recovering && session && !started && screen.name !== setupScreen()) { setTimeout(() => show(setupScreen()), 0); return; }
    if (event === 'SIGNED_OUT' && started) location.replace(here());
    if (event === 'SIGNED_IN' && session && !started && !recovering) setTimeout(() => startApp(session), 0);
  });

  (async function main() {
    show('loading');
    if (linkError) { show('signin', { error: t('errLink') }); history.replaceState(null, '', here()); return; }
    let session = null;
    try { session = (await client.auth.getSession()).data.session; } catch (err) { session = null; }
    if (recovering) { if (session) show(setupScreen()); else show('signin', { error: t('errLink') }); return; }
    if (session) { await startApp(session); return; }
    if (!started) show('signin');
  })();
})();
