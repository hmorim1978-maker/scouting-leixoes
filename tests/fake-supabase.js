/* In-memory stand-in for supabase-js, for local tests only (the workspace cannot reach Supabase).
   Implements just what runtime.js uses. Row level security is tested separately in SQL. */
(function () {
  const db = { docs: new Map(), profiles: new Map(), users: new Map() };   // docs key: collection \u0000 id
  const key = (c, i) => `${c}\u0000${i}`;
  const channels = new Set();
  const authSubs = new Set();
  let session = null;
  const calls = [];
  const SS = 'fake-sb-session';
  try { const s = sessionStorage.getItem(SS); if (s) session = JSON.parse(s); } catch (e) {}
  const persist = () => { try { if (session) sessionStorage.setItem(SS, JSON.stringify(session)); else sessionStorage.removeItem(SS); } catch (e) {} };
  const fire = (event) => authSubs.forEach((fn) => setTimeout(() => fn(event, session), 0));
  const emit = (eventType, row, old) => channels.forEach((ch) => ch.handlers.forEach((h) => setTimeout(() => h({ eventType, new: row || {}, old: old || {} }), 5)));
  const merge = (a, b) => { const o = { ...a }; Object.entries(b).forEach(([k, v]) => { o[k] = v && typeof v === 'object' && !Array.isArray(v) && o[k] && typeof o[k] === 'object' && !Array.isArray(o[k]) ? merge(o[k], v) : v; }); return o; };

  function query(table) {
    const st = { table, filters: [], inF: null, range: null, op: 'select', single: false };
    const run = () => {
      calls.push({ table, op: st.op, filters: st.filters.slice() });
      if (!session) return { data: null, error: { message: 'JWT expired', code: 'PGRST301' } };
      if (table === 'docs') {
        let rows = [...db.docs.values()].filter((r) => st.filters.every(([k, v]) => r[k] === v));
        if (st.op === 'delete') {
          rows.forEach((r) => { db.docs.delete(key(r.collection, r.id)); emit('DELETE', null, { collection: r.collection, id: r.id }); });
          return { data: rows.map((r) => ({ id: r.id })), error: null };
        }
        rows.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
        if (st.range) rows = rows.slice(st.range[0], st.range[1] + 1);
        return { data: rows.map((r) => ({ id: r.id, data: JSON.parse(JSON.stringify(r.data)) })), error: null };
      }
      if (table === 'profiles') {
        let rows = [...db.profiles.values()].filter((r) => st.filters.every(([k, v]) => r[k] === v));
        if (st.inF) rows = rows.filter((r) => st.inF[1].includes(r[st.inF[0]]));
        if (st.single) return { data: rows[0] || null, error: null };
        return { data: rows, error: null };
      }
      return { data: [], error: null };
    };
    const b = {
      select() { return b; },
      eq(k, v) { st.filters.push([k, v]); return b; },
      in(k, v) { st.inF = [k, v]; return b; },
      order() { return b; },
      range(a, z) { st.range = [a, z]; return b; },
      delete() { st.op = 'delete'; return b; },
      maybeSingle() { st.single = true; return b; },
      then(res, rej) { return Promise.resolve(run()).then(res, rej); },
    };
    return b;
  }

  const auth = {
    async getSession() { return { data: { session } }; },
    async signInWithPassword({ email, password }) {
      calls.push({ auth: 'signin', email });
      const u = db.users.get(String(email).toLowerCase());
      if (!u || u.password !== password) return { data: {}, error: { message: 'Invalid login credentials', code: 'invalid_credentials', status: 400 } };
      if (!u.confirmed) return { data: {}, error: { message: 'Email not confirmed', code: 'email_not_confirmed', status: 400 } };
      session = { access_token: 't-' + u.id, user: { id: u.id, email: u.email, user_metadata: { name: u.name } } };
      persist(); fire('SIGNED_IN');
      return { data: { session, user: session.user }, error: null };
    },
    async signUp({ email, password, options }) {
      calls.push({ auth: 'signup', email, redirect: options && options.emailRedirectTo });
      const id = crypto.randomUUID();
      db.users.set(email.toLowerCase(), { id, email, password, name: options.data.name, confirmed: false });
      db.profiles.set(id, { id, email, name: options.data.name });
      return { data: { user: { id }, session: null }, error: null };
    },
    async resetPasswordForEmail(email, opts) { calls.push({ auth: 'reset', email, redirect: opts && opts.redirectTo }); return { data: {}, error: null }; },
    async updateUser({ password }) { calls.push({ auth: 'update' }); return { data: {}, error: null }; },
    async signOut() { calls.push({ auth: 'signout' }); session = null; persist(); fire('SIGNED_OUT'); return { error: null }; },
    onAuthStateChange(fn) { authSubs.add(fn); return { data: { subscription: { unsubscribe() { authSubs.delete(fn); } } } }; },
  };

  async function rpc(name, args) {
    calls.push({ rpc: name, args });
    if (!session) return { data: null, error: { message: 'not signed in' } };
    const uid = session.user.id;
    if (name === 'am_i_owner') return { data: !!(db.ownerEmail && session.user.email.toLowerCase() === db.ownerEmail), error: null };
    if (name === 'accept_invite') return { data: 'none', error: null };
    if (name === 'doc_set') {
      const k = key(args.c, args.i); const existed = db.docs.has(k);
      const row = { collection: args.c, id: args.i, data: JSON.parse(JSON.stringify(args.d)) };
      db.docs.set(k, row); emit(existed ? 'UPDATE' : 'INSERT', row);
      return { data: null, error: null };
    }
    if (name === 'doc_patch') {
      const k = key(args.c, args.i); const row = db.docs.get(k);
      if (!row) return { data: null, error: { message: 'not found', code: 'P0002' } };
      row.data = merge(row.data, JSON.parse(JSON.stringify(args.patch))); emit('UPDATE', row);
      return { data: null, error: null };
    }
    return { data: null, error: { message: 'unknown rpc ' + name } };
  }

  window.supabase = {
    createClient(url, key) {
      return {
        auth, rpc, from: query,
        channel(name) {
          const ch = { name, handlers: [], on(type, filter, fn) { ch.handlers.push(fn); return ch; }, subscribe(cb) { channels.add(ch); setTimeout(() => cb && cb('SUBSCRIBED'), 0); return ch; } };
          return ch;
        },
      };
    },
  };
  // Test hooks
  window.__fake = {
    db, calls,
    seed(rows) { rows.forEach((r) => db.docs.set(key(r.collection, r.id), r)); },
    user(email, password, name, confirmed = true) { const id = crypto.randomUUID(); db.users.set(email.toLowerCase(), { id, email, password, name, confirmed }); db.profiles.set(id, { id, email, name }); return id; },
    owner(email) { db.ownerEmail = email.toLowerCase(); },
    external(eventType, row) { if (eventType === 'DELETE') db.docs.delete(key(row.collection, row.id)); else db.docs.set(key(row.collection, row.id), row); emit(eventType, eventType === 'DELETE' ? null : row, eventType === 'DELETE' ? { collection: row.collection, id: row.id } : null); },
  };
})();
