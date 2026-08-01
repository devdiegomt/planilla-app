import { type NextRequest } from 'next/server';
import { runReminderCron } from '@/lib/pushCron';
import { composeAfternoonReminder } from '@/lib/reminder';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Recordatorio vespertino (cron 3 PM COT, lun-vie).
 *
 * Solo suena si quedaron clases de HOY sin F/R registrado; si está todo al día
 * no envía nada, para que el aviso no se vuelva ruido de fondo.
 */
export async function GET(req: NextRequest) {
  return runReminderCron(req, composeAfternoonReminder);
}
