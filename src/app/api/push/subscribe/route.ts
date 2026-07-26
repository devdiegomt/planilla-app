import { NextResponse, type NextRequest } from 'next/server';
import { currentUser } from '@/lib/supabaseServer';

export const runtime = 'nodejs';

interface Body {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userAgent?: string;
}

export async function POST(req: NextRequest) {
  const { user, client } = await currentUser(req);
  if (!user || !client) {
    return NextResponse.json({ error: 'not_authenticated' }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 });
  }

  if (!body?.endpoint || !body?.keys?.p256dh || !body?.keys?.auth) {
    return NextResponse.json(
      { error: 'Se requiere endpoint + keys.p256dh + keys.auth' },
      { status: 400 },
    );
  }

  // Upsert por endpoint (única). Si existe, actualiza user_id + last_used_at.
  const { data, error } = await client
    .from('push_subscriptions')
    .upsert(
      {
        user_id: user.id,
        endpoint: body.endpoint,
        keys_p256dh: body.keys.p256dh,
        keys_auth: body.keys.auth,
        user_agent: body.userAgent ?? null,
        last_used_at: new Date().toISOString(),
      },
      { onConflict: 'endpoint' },
    )
    .select('id')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: data.id });
}
