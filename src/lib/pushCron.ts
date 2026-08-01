/**
 * Maquinaria compartida de los crons de push.
 *
 * Los dos recordatorios (matutino y vespertino) solo se diferencian en cómo
 * componen el payload; todo lo demás —autenticar el cron, leer las
 * suscripciones, abanicar el envío y limpiar las expiradas— es idéntico. Vive
 * aquí para que las rutas queden reducidas a su composición.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseAdmin } from './supabaseAdmin';
import { sendPush, type SubscriptionRow } from './webpushClient';
import { todayInBogota, type ReminderPayload, type ReminderInput } from './reminder';
import type {
  ScheduleBlock, CalendarDay, YearConfig, Course,
  AttendanceMark, Todo, CalendarEvent,
} from '@/types';

/** Tablas que necesita cualquiera de los dos recordatorios. */
const TABLES = [
  'yearConfig', 'schedule', 'calendarDays', 'courses', 'attendanceMarks',
  'todos', 'events',
];

type Admin = ReturnType<typeof getSupabaseAdmin>;

/** Lee los sync_records del usuario y los deserializa a `ReminderInput`. */
async function loadReminderInput(userId: string, admin: Admin): Promise<ReminderInput> {
  const { data, error } = await admin
    .from('sync_records')
    .select('table_name, sync_id, data')
    .eq('user_id', userId)
    .in('table_name', TABLES)
    .is('deleted_at', null);
  if (error) throw new Error(`fetch sync_records: ${error.message}`);

  const byTable = new Map<string, Record<string, unknown>[]>();
  for (const r of data ?? []) {
    const arr = byTable.get(r.table_name) ?? [];
    arr.push(r.data as Record<string, unknown>);
    byTable.set(r.table_name, arr);
  }

  return {
    yearConfig: byTable.get('yearConfig')?.[0] as YearConfig | undefined,
    schedule: (byTable.get('schedule') ?? []) as unknown as ScheduleBlock[],
    calendarDays: (byTable.get('calendarDays') ?? []) as unknown as CalendarDay[],
    courses: (byTable.get('courses') ?? []) as unknown as Course[],
    attendanceMarks: (byTable.get('attendanceMarks') ?? []) as unknown as AttendanceMark[],
    todos: (byTable.get('todos') ?? []) as unknown as Todo[],
    events: (byTable.get('events') ?? []) as unknown as CalendarEvent[],
  };
}

/**
 * Corre un cron de recordatorio de principio a fin.
 *
 * `compose` decide qué (y si) notificar; devolver `null` salta a ese usuario
 * sin enviar nada.
 */
export async function runReminderCron(
  req: NextRequest,
  compose: (input: ReminderInput, today: string) => ReminderPayload | null,
): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET no configurado' }, { status: 500 });
  }
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // `getSupabaseAdmin` lanza si falta la service_role key. Sin capturarlo, el
  // cron solo vería un 500 con el cuerpo vacío en los logs de Vercel.
  let admin: Admin;
  try {
    admin = getSupabaseAdmin();
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  const { data: subsAll, error: subsErr } = await admin
    .from('push_subscriptions')
    .select('id, user_id, endpoint, keys_p256dh, keys_auth');
  if (subsErr) return NextResponse.json({ error: subsErr.message }, { status: 500 });
  if (!subsAll || subsAll.length === 0) {
    return NextResponse.json({ ok: true, usersProcessed: 0, notificationsSent: 0 });
  }

  const subsByUser = new Map<string, SubscriptionRow[]>();
  for (const s of subsAll) {
    const arr = subsByUser.get(s.user_id) ?? [];
    arr.push({
      id: s.id, endpoint: s.endpoint,
      keys_p256dh: s.keys_p256dh, keys_auth: s.keys_auth,
    });
    subsByUser.set(s.user_id, arr);
  }

  const today = todayInBogota();
  const report = {
    usersProcessed: 0,
    usersSkipped: 0,
    notificationsSent: 0,
    notificationsFailed: 0,
    goneCleared: 0,
    errors: [] as string[],
  };

  for (const [userId, subs] of subsByUser) {
    try {
      const payload = compose(await loadReminderInput(userId, admin), today);
      if (!payload) {
        report.usersSkipped++;
        continue;
      }
      const results = await Promise.all(subs.map(s => sendPush(s, payload)));
      report.usersProcessed++;
      report.notificationsSent += results.filter(r => r.ok).length;
      report.notificationsFailed += results.filter(r => !r.ok && !r.gone).length;
      const goneIds = results.filter(r => r.gone).map(r => r.id);
      if (goneIds.length > 0) {
        await admin.from('push_subscriptions').delete().in('id', goneIds);
        report.goneCleared += goneIds.length;
      }
    } catch (e) {
      report.errors.push(`${userId}: ${(e as Error).message}`);
    }
  }

  return NextResponse.json({ ok: true, today, ...report, at: new Date().toISOString() });
}
