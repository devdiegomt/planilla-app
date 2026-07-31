import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { sendPush, type SubscriptionRow } from '@/lib/webpushClient';
import {
  composeReminder, todayInBogota,
  type ReminderPayload, type ReminderInput,
} from '@/lib/reminder';
import type {
  ScheduleBlock, CalendarDay, YearConfig, Course,
  AttendanceMark, Todo, CalendarEvent,
} from '@/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

// ---- Auth: Vercel Cron manda Authorization: Bearer $CRON_SECRET ----

function unauthorized() {
  return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
}

// ---- Handler ----

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: 'CRON_SECRET no configurado' }, { status: 500 });
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${secret}`) return unauthorized();

  const admin = getSupabaseAdmin();

  // 1) Todos los user_id que tienen alguna suscripción activa
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
      const payload = await buildReminderPayload(userId, admin);
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

  return NextResponse.json({ ok: true, ...report, at: new Date().toISOString() });
}

// ---- Cálculo del recordatorio ----

/**
 * Lee los sync_records del usuario y delega la composición a `composeReminder`.
 * Devuelve null si hoy no es día lectivo (no vale la pena notificar) o si
 * al usuario le falta configuración mínima.
 */
async function buildReminderPayload(
  userId: string,
  admin: ReturnType<typeof getSupabaseAdmin>,
): Promise<ReminderPayload | null> {
  // Leer solo las tablas que necesitamos
  const tables = [
    'yearConfig', 'schedule', 'calendarDays', 'courses', 'attendanceMarks',
    'todos', 'events',
  ];
  const { data, error } = await admin
    .from('sync_records')
    .select('table_name, sync_id, data')
    .eq('user_id', userId)
    .in('table_name', tables)
    .is('deleted_at', null);
  if (error) throw new Error(`fetch sync_records: ${error.message}`);

  const rowsByTable = new Map<string, Record<string, unknown>[]>();
  for (const r of data ?? []) {
    const arr = rowsByTable.get(r.table_name) ?? [];
    arr.push(r.data as Record<string, unknown>);
    rowsByTable.set(r.table_name, arr);
  }

  const input: ReminderInput = {
    yearConfig: rowsByTable.get('yearConfig')?.[0] as YearConfig | undefined,
    schedule: (rowsByTable.get('schedule') ?? []) as unknown as ScheduleBlock[],
    calendarDays: (rowsByTable.get('calendarDays') ?? []) as unknown as CalendarDay[],
    courses: (rowsByTable.get('courses') ?? []) as unknown as Course[],
    attendanceMarks: (rowsByTable.get('attendanceMarks') ?? []) as unknown as AttendanceMark[],
    todos: (rowsByTable.get('todos') ?? []) as unknown as Todo[],
    events: (rowsByTable.get('events') ?? []) as unknown as CalendarEvent[],
  };

  return composeReminder(input, todayInBogota());
}
