// Sends the Supabase invitation email for an open invitation.
// Only the Owner may call it, and only for an email that has a pending invitation in the platform.
// The service role key exists only here, on the server (Supabase provides it to the function).
import { createClient } from 'npm:@supabase/supabase-js@2.97.0';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reply = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return reply(405, { status: 'method_not_allowed' });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Who is asking: checked with the caller's own session.
    const caller = createClient(url, anon, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
      auth: { persistSession: false },
    });
    const { data: isOwner, error: ownerError } = await caller.rpc('am_i_owner');
    if (ownerError || isOwner !== true) return reply(403, { status: 'forbidden' });

    const body = await req.json().catch(() => ({}));
    const email = String(body.email ?? '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return reply(400, { status: 'invalid_email' });
    const redirectTo = typeof body.redirectTo === 'string' && /^https:\/\/[a-z0-9.-]+(:\d+)?\/?$/i.test(body.redirectTo)
      ? body.redirectTo : undefined;

    const admin = createClient(url, service, { auth: { persistSession: false } });
    const { data: open } = await admin.from('docs').select('id')
      .eq('collection', 'invites').eq('data->>email', email).eq('data->>status', 'pending').limit(1);
    if (!open || !open.length) return reply(404, { status: 'no_invitation' });

    const { error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo });
    if (error) {
      const message = String(error.message ?? '');
      if (/already (been )?registered|already exists/i.test(message)) return reply(200, { status: 'exists' });
      return reply(200, { status: 'error', message });
    }
    return reply(200, { status: 'sent' });
  } catch (err) {
    return reply(500, { status: 'error', message: String((err as Error)?.message ?? err) });
  }
});
