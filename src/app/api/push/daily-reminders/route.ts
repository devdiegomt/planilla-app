import { type NextRequest } from 'next/server';
import { runReminderCron } from '@/lib/pushCron';
import { composeReminder } from '@/lib/reminder';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Recordatorio matutino (cron 7 AM COT, lun-vie).
 * Agenda del día: clases, entregas, pendientes y F/R rezagado de días previos.
 */
export async function GET(req: NextRequest) {
  return runReminderCron(req, composeReminder);
}
