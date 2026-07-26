import { NextResponse, type NextRequest } from 'next/server';
import { currentUser } from '@/lib/supabaseServer';
import { sendPush, type SubscriptionRow } from '@/lib/webpushClient';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const { user, client } = await currentUser(req);
  if (!user || !client) {
    return NextResponse.json({ error: 'not_authenticated' }, { status: 401 });
  }

  const { data: subs, error } = await client
    .from('push_subscriptions')
    .select('id, endpoint, keys_p256dh, keys_auth')
    .eq('user_id', user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!subs || subs.length === 0) {
    return NextResponse.json(
      { error: 'Sin suscripciones activas. Habilita notificaciones primero.' },
      { status: 404 },
    );
  }

  const payload = {
    title: 'planilla-app · Prueba',
    body: `Notificación de prueba enviada a ${subs.length} dispositivo${subs.length > 1 ? 's' : ''}. Si la ves, todo funciona.`,
    url: '/',
    tag: 'planilla-test',
  };

  const results = await Promise.all(
    (subs as SubscriptionRow[]).map(s => sendPush(s, payload)),
  );

  // Limpiar las Gone (expiradas / des-suscritas del navegador)
  const goneIds = results.filter(r => r.gone).map(r => r.id);
  if (goneIds.length > 0) {
    await client.from('push_subscriptions').delete().in('id', goneIds);
  }

  return NextResponse.json({
    sent: results.filter(r => r.ok).length,
    failed: results.filter(r => !r.ok).length,
    goneCleared: goneIds.length,
    details: results,
  });
}
