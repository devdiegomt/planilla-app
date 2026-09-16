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
import { cutoffIso, PODA_SERVIDOR_MAX_FILAS } from './retention';
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

/**
 * Cuántos usuarios se resuelven por consulta.
 *
 * Antes era una consulta por usuario dentro de un bucle serial: con 200
 * docentes eran 200 idas y vueltas a Supabase dentro de una función que Vercel
 * corta a los 60 s. En lotes, 200 docentes son 8 consultas.
 *
 * No se traen todos de una porque el lote también acota la memoria y da un
 * punto natural donde mirar el reloj antes de seguir.
 */
const USUARIOS_POR_LOTE = 25;

/** Filas por página. Supabase corta en 1000 por defecto. */
const PAGINA = 1000;

/**
 * Margen bajo el `maxDuration` de 60 s de las rutas. Al agotarse, el cron corta
 * por su cuenta y REPORTA cuántos quedaron sin procesar: antes Vercel mataba la
 * función y los últimos de la lista se quedaban sin notificación sin que nada
 * lo dijera.
 */
const PRESUPUESTO_MS = 50_000;

type FilasPorTabla = Map<string, Record<string, unknown>[]>;

function aReminderInput(porTabla: FilasPorTabla): ReminderInput {
  return {
    yearConfig: porTabla.get('yearConfig')?.[0] as YearConfig | undefined,
    schedule: (porTabla.get('schedule') ?? []) as unknown as ScheduleBlock[],
    calendarDays: (porTabla.get('calendarDays') ?? []) as unknown as CalendarDay[],
    courses: (porTabla.get('courses') ?? []) as unknown as Course[],
    attendanceMarks: (porTabla.get('attendanceMarks') ?? []) as unknown as AttendanceMark[],
    todos: (porTabla.get('todos') ?? []) as unknown as Todo[],
    events: (porTabla.get('events') ?? []) as unknown as CalendarEvent[],
  };
}

/** Lee los sync_records de VARIOS usuarios en una sola consulta paginada. */
async function loadReminderInputs(
  userIds: string[],
  admin: Admin,
): Promise<Map<string, ReminderInput>> {
  const porUsuario = new Map<string, FilasPorTabla>();

  for (let from = 0; ; from += PAGINA) {
    const { data, error } = await admin
      .from('sync_records')
      .select('user_id, table_name, data')
      .in('user_id', userIds)
      .in('table_name', TABLES)
      .is('deleted_at', null)
      // El orden es lo que hace estable el paginado por rango: sin él, dos
      // páginas pueden traer la misma fila y perder otra.
      .order('user_id', { ascending: true })
      .order('table_name', { ascending: true })
      .order('sync_id', { ascending: true })
      .range(from, from + PAGINA - 1);
    if (error) throw new Error(`fetch sync_records: ${error.message}`);

    const page = data ?? [];
    for (const r of page) {
      const porTabla = porUsuario.get(r.user_id) ?? new Map();
      const arr = porTabla.get(r.table_name) ?? [];
      arr.push(r.data as Record<string, unknown>);
      porTabla.set(r.table_name, arr);
      porUsuario.set(r.user_id, porTabla);
    }
    if (page.length < PAGINA) break;
  }

  const out = new Map<string, ReminderInput>();
  for (const id of userIds) {
    out.set(id, aReminderInput(porUsuario.get(id) ?? new Map()));
  }
  return out;
}

/**
 * Borra del servidor la historia de ediciones anterior al corte.
 *
 * Es la mitad que de verdad libera espacio. Podar en local no alcanza: un
 * borrado sincronizado deja la fila marcada `deleted_at` en el servidor, así
 * que se cambiarían filas por lápidas. Acá el borrado es de verdad.
 *
 * Solo toca `changeLog`. Las notas, la asistencia y los trimestres archivados
 * no se podan nunca.
 *
 * Va acotada por corrida porque corre dentro del cron, que tiene el minuto
 * contado. Si hay atraso, se termina de poner al día en las corridas
 * siguientes: es una tarea diaria, no una migración.
 */
export async function pruneRemoteChangeLog(
  admin: Admin,
  corteIso: string,
  max = PODA_SERVIDOR_MAX_FILAS,
): Promise<{ borradas: number; quedanMas: boolean }> {
  const { data, error } = await admin
    .from('sync_records')
    .select('sync_id')
    .eq('table_name', 'changeLog')
    .lt('updated_at', corteIso)
    .limit(max);
  if (error) throw new Error(`select changeLog viejo: ${error.message}`);

  const ids = (data ?? []).map(r => r.sync_id as string);
  if (ids.length === 0) return { borradas: 0, quedanMas: false };

  // `sync_id` es único por registro, pero el filtro por tabla se repite para
  // que un id no pueda alcanzar a una fila de otra tabla.
  const { error: delErr } = await admin
    .from('sync_records')
    .delete()
    .eq('table_name', 'changeLog')
    .in('sync_id', ids);
  if (delErr) throw new Error(`borrar changeLog viejo: ${delErr.message}`);

  return { borradas: ids.length, quedanMas: ids.length === max };
}

/** Parte una lista en trozos de `n`. */
function enLotes<T>(xs: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
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
  opciones: { podarHistorial?: boolean } = {},
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
  const arranque = Date.now();
  const report = {
    usersProcessed: 0,
    usersSkipped: 0,
    usersPending: 0,
    truncated: false,
    notificationsSent: 0,
    notificationsFailed: 0,
    goneCleared: 0,
    errors: [] as string[],
  };

  const userIds = [...subsByUser.keys()];
  const lotes = enLotes(userIds, USUARIOS_POR_LOTE);

  for (let i = 0; i < lotes.length; i++) {
    // Cortar por cuenta propia y decirlo. Si en cambio se agota el maxDuration,
    // Vercel mata la función y los últimos de la lista se quedan sin
    // notificación sin que nada lo reporte.
    if (Date.now() - arranque > PRESUPUESTO_MS) {
      report.truncated = true;
      report.usersPending = lotes.slice(i).reduce((n, l) => n + l.length, 0);
      break;
    }

    const lote = lotes[i];
    let entradas: Map<string, ReminderInput>;
    try {
      entradas = await loadReminderInputs(lote, admin);
    } catch (e) {
      // Un lote que no carga no debe tumbar a los que siguen.
      report.errors.push(`lote ${i}: ${(e as Error).message}`);
      continue;
    }

    // Dentro del lote los usuarios son independientes: el envío va en paralelo.
    // Antes todo era serial, incluida la espera de red de cada push.
    await Promise.all(lote.map(async (userId) => {
      const subs = subsByUser.get(userId) ?? [];
      try {
        const payload = compose(entradas.get(userId) ?? aReminderInput(new Map()), today);
        if (!payload) {
          report.usersSkipped++;
          return;
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
    }));
  }

  // Mantenimiento al final y solo si sobra tiempo: notificar es lo que no
  // puede quedarse sin hacer; podar espera a mañana sin que pase nada.
  let poda: { borradas: number; quedanMas: boolean } | { error: string } | null = null;
  if (opciones.podarHistorial && Date.now() - arranque < PRESUPUESTO_MS) {
    try {
      poda = await pruneRemoteChangeLog(admin, cutoffIso(new Date()));
    } catch (e) {
      poda = { error: (e as Error).message };
    }
  }

  return NextResponse.json({
    ok: true,
    today,
    ...report,
    poda,
    usersTotal: userIds.length,
    elapsedMs: Date.now() - arranque,
    at: new Date().toISOString(),
  });
}
