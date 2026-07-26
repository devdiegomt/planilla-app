'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import {
  syncAll, getSyncStatus, SYNCABLE_TABLES,
  type SyncStatus as SyncStatusData,
} from '@/lib/sync';
import { useSession } from './SessionProvider';

export function SyncStatus() {
  const { user } = useSession();
  const [status, setStatus] = useState<SyncStatusData | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  // Rehacer conteo cuando cambia cualquier tabla syncable
  const trigger = useLiveQuery(async () => {
    let sum = 0;
    for (const t of SYNCABLE_TABLES) sum += await db.table(t).count();
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

  useEffect(() => {
    if (!user) { setStatus(null); return; }
    refresh();
  }, [user, refresh, trigger]);

  if (!user) return null;

  const sync = async () => {
    setBusy(true); setError(null);
    try {
      const { pull, push } = await syncAll(user.id);
      if (!pull.ok || !push.ok) {
        const msgs = [...pull.errorMessages, ...push.errorMessages].join(' · ');
        setError(msgs || 'Error de sincronización');
      }
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const pending = status?.pendingPush ?? 0;
  const badgeCls =
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
          className="absolute right-0 top-full mt-1 border rounded-md bg-white shadow-md min-w-[260px] z-20 text-sm"
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
          </div>
          <button
            disabled={busy}
            onClick={sync}
            className="w-full text-left px-3 py-2 hover:bg-neutral-50 text-neutral-800 disabled:opacity-40 disabled:hover:bg-white"
          >
            {busy ? 'Sincronizando…' : 'Sincronizar ahora'}
          </button>
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
