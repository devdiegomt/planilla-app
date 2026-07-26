import { NextResponse, type NextRequest } from 'next/server';
import { currentUser } from '@/lib/supabaseServer';

export const runtime = 'nodejs';

interface Body {
  endpoint: string;
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

  if (!body?.endpoint) {
    return NextResponse.json({ error: 'Se requiere endpoint' }, { status: 400 });
  }

  const { error } = await client
    .from('push_subscriptions')
    .delete()
    .eq('endpoint', body.endpoint);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
