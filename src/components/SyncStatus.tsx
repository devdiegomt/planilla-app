'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import {
  syncAll, getSyncStatus, SYNCABLE_TABLES,
  type SyncStatus as SyncStatusData,
} from '@/lib/sync';
import { useSession } from './SessionProvider';

const AUTO_SYNC_INTERVAL_MS = 60_000;   // sync cada minuto
const WRITE_DEBOUNCE_MS = 5_000;         // tras última escritura, sync 5s después

export function SyncStatus() {
  const { user } = useSession();
  const [status, setStatus] = useState<SyncStatusData | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState(0);
  const [anomalies, setAnomalies] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const busyRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Rehacer conteo cuando cambia cualquier tabla syncable (incluye tombstones)
  const trigger = useLiveQuery(async () => {
    let sum = 0;
    for (const t of SYNCABLE_TABLES) sum += await db.table(t).count();
    sum += await db.syncTombstones.count();
    return sum;
  }, [], 0);

  const refresh = useCallback(async () => {
    if (!user) return;
    try {
      setStatus(await getSyncStatus(user.id));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [user]);

  const doSync = useCallback(async (silent = false) => {
    if (!user || busyRef.current) return;
    busyRef.current = true;
    if (!silent) setBusy(true);
    setError(null);
    try {
      const { pull, push } = await syncAll(user.id);
      setConflicts(prev => prev + pull.conflicts);
      // Huérfanos puntuales en el primer pull son normales (llegaron hijos antes
      // que padres y relinkOrphans los acomodó). Sostenidos en el tiempo, no.
      setAnomalies(
        pull.orphans || pull.dedupedCourses
          ? `${pull.orphans} filas sin curso · ${pull.dedupedCourses} cursos colapsados`
          : null,
      );
      if (!pull.ok || !push.ok) {
        const msgs = [...pull.errorMessages, ...push.errorMessages].join(' · ');
        setError(msgs || 'Error de sincronización');
      }
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      busyRef.current = false;
      if (!silent) setBusy(false);
    }
  }, [user, refresh]);

  // Inicial refresh
  useEffect(() => {
    if (!user) { setStatus(null); setConflicts(0); setAnomalies(null); return; }
    refresh();
  }, [user, refresh]);

  // Interval de auto-sync
  useEffect(() => {
    if (!user) return;
    const iv = setInterval(() => { doSync(true); }, AUTO_SYNC_INTERVAL_MS);
    return () => clearInterval(iv);
  }, [user, doSync]);

  // Debounce on write: cuando cambia el count total, agenda un sync 5s después
  useEffect(() => {
    if (!user) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { doSync(true); }, WRITE_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [user, trigger, doSync]);

  // Rerender de status cuando cambien las tablas
  useEffect(() => { refresh(); }, [trigger, refresh]);

  if (!user) return null;

  const pending = status?.pendingPush ?? 0;
  const badgeCls =
    error ? 'bg-red-100 text-red-800' :
    pending === 0 ? 'bg-green-100 text-green-800' :
    pending < 20 ? 'bg-amber-100 text-amber-800' :
                    'bg-red-100 text-red-800';

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className={`text-xs px-2 py-1 rounded font-medium ${badgeCls}`}
        title={error ?? (pending === 0 ? 'Todo sincronizado' : `${pending} cambios pendientes`)}
      >
        {busy ? '⟳' : pending === 0 ? '✓' : `↑ ${pending}`}
      </button>
      {open && (
        <div
          className="absolute right-0 top-full mt-1 border rounded-md bg-white shadow-md min-w-[280px] z-20 text-sm"
          onMouseLeave={() => setOpen(false)}
        >
          <div className="px-3 py-2 border-b space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs text-neutral-500">Pendientes de subir</span>
              <span className="font-medium tabular-nums">{pending}</span>
            </div>
            {status?.lastPushAt && (
              <div className="flex items-center justify-between text-[11px] text-neutral-500">
                <span>Último push</span>
                <span>{formatWhen(status.lastPushAt)}</span>
              </div>
            )}
            {status?.lastPullAt && (
              <div className="flex items-center justify-between text-[11px] text-neutral-500">
                <span>Último pull</span>
                <span>{formatWhen(status.lastPullAt)}</span>
              </div>
            )}
            {conflicts > 0 && (
              <div className="flex items-center justify-between text-[11px] pt-1 border-t">
                <span className="text-amber-800">Conflictos resueltos</span>
                <span className="text-amber-800 font-medium tabular-nums" title="Filas donde el cambio remoto pisó un cambio local no sincronizado">
                  {conflicts}
                  <button
                    onClick={() => setConflicts(0)}
                    className="ml-2 text-neutral-500 hover:text-neutral-800 underline"
                    title="Reiniciar contador"
                  >
                    ✕
                  </button>
                </span>
              </div>
            )}
          </div>
          <button
            disabled={busy}
            onClick={() => doSync(false)}
            className="w-full text-left px-3 py-2 hover:bg-neutral-50 text-neutral-800 disabled:opacity-40 disabled:hover:bg-white"
          >
            {busy ? 'Sincronizando…' : 'Sincronizar ahora'}
          </button>
          {anomalies && (
            <div className="px-3 py-2 text-[11px] text-amber-800 border-t bg-amber-50">
              ⚠ {anomalies}
              <div className="text-neutral-500 mt-0.5">
                Si persiste, revisa Diagnóstico y reparación.
              </div>
            </div>
          )}
          <div className="px-3 py-1.5 text-[10px] text-neutral-400 border-t">
            Auto-sync cada {Math.round(AUTO_SYNC_INTERVAL_MS/1000)}s
          </div>
          {error && (
            <div className="px-3 py-2 text-[11px] text-red-700 border-t">
              ❌ {error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h}h`;
  return d.toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' });
}