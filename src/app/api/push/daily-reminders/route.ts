import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { sendPush, type SubscriptionRow } from '@/lib/webpushClient';
import {
  computeDayTypes,
  todayIso,
  classesForDayType,
  courseSessionDates,
  currentCicloForCourse,
  sessionInCiclo,
} from '@/lib/schedule';
import type {
  DayType, ScheduleBlock, CalendarDay, YearConfig, Course,
  AttendanceMark,
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

interface Payload {
  title: string;
  body: string;
  url: string;
  tag: string;
}

/**
 * Lee los sync_records del usuario y arma un recordatorio.
 * Devuelve null si hoy no es día lectivo (no vale la pena notificar) o si
 * al usuario le falta configuración mínima.
 */
async function buildReminderPayload(
  userId: string,
  admin: ReturnType<typeof getSupabaseAdmin>,
): Promise<Payload | null> {
  // Leer solo las tablas que necesitamos
  const tables = ['yearConfig', 'schedule', 'calendarDays', 'courses', 'attendanceMarks'];
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

  const yearConfigRow = rowsByTable.get('yearConfig')?.[0] as YearConfig | undefined;
  if (!yearConfigRow) return null;                    // sin config, no puede saber si es día lectivo

  const schedule = (rowsByTable.get('schedule') ?? []) as unknown as ScheduleBlock[];
  const calendarDays = (rowsByTable.get('calendarDays') ?? []) as unknown as CalendarDay[];
  const courses = (rowsByTable.get('courses') ?? []) as unknown as Course[];
  const attendanceMarks = (rowsByTable.get('attendanceMarks') ?? []) as unknown as AttendanceMark[];

  const today = todayIso();
  const seq = computeDayTypes(
    yearConfigRow.startDate,
    yearConfigRow.initialDayType,
    today,
    calendarDays,
    true,
  );
  const status = seq.get(today);
  if (!status || status === 'weekend' || status === 'skip') {
    return null;                                       // hoy no toca clase
  }

  // Clases de hoy
  const classesToday = classesForDayType(status as DayType, schedule);
  if (classesToday.length === 0) return null;         // día lectivo pero sin bloques definidos

  const courseCodesToday = classesToday.map(c => c.courseCode);
  const uniqueCodes = [...new Set(courseCodesToday)];

  // Contar ciclos pendientes de F/R hasta ayer
  const trimStart = activeTrimStart(today, yearConfigRow) ?? yearConfigRow.startDate;
  const trimSeq = new Map<string, ReturnType<typeof seq.get>>();
  for (const [iso, s] of seq) {
    if (iso >= trimStart && iso < today) trimSeq.set(iso, s);
  }

  let pendingCount = 0;
  for (const course of courses) {
    // Solo cursos que Diego dicta
    if (!schedule.some(b => b.courseCode === course.code)) continue;
    const sessionsPerCiclo = course.grade === 11 ? 2 : 1;
    const sessionDates = courseSessionDates(course.code, trimSeq as Map<string, DayType | 'weekend' | 'skip'>, schedule);
    const cicloAyer = currentCicloForCourse(sessionDates.at(-1) ?? '', sessionDates, 9, sessionsPerCiclo);
    if (cicloAyer <= 0) continue;
    const lastSessionDate = sessionDates.at(-1)!;
    const sess = sessionInCiclo(lastSessionDate, sessionDates, sessionsPerCiclo);
    const mark = attendanceMarks.find(m =>
      m.courseId === course.id
      && m.ciclo === cicloAyer
      && (sess == null ? m.session == null : m.session === sess),
    );
    if (!mark) pendingCount++;
  }

  const dayLabel = status === 'FIJO' ? 'Día Fijo' : `Día ${status.slice(1)}`;
  const title = `${dayLabel} · ${classesToday.length} clase${classesToday.length > 1 ? 's' : ''} hoy`;
  const body = pendingCount > 0
    ? `${uniqueCodes.join(', ')} · ${pendingCount} F/R pendiente${pendingCount > 1 ? 's' : ''} de días previos`
    : `${uniqueCodes.join(', ')} · sin F/R pendientes`;

  return {
    title,
    body,
    url: '/',
    tag: `daily-${today}`,
  };
}

function activeTrimStart(dateIso: string, cfg: YearConfig): string | undefined {
  const starts = [cfg.trim1Start, cfg.trim2Start, cfg.trim3Start]
    .filter((d): d is string => !!d && d <= dateIso)
    .sort();
  return starts.at(-1);
}
