'use client';

import { useState } from 'react';
import { exportBackup, restoreBackup, type Backup } from '@/lib/backup';
import { downloadBlob } from '@/lib/utils';

export function BackupRestore() {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string>('');

  const doExport = async () => {
    setBusy(true); setStatus('');
    try {
      const data = await exportBackup();
      const total = Object.values(data.tables).reduce((a, b) => a + b.length, 0);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      downloadBlob(blob, `planilla-backup-${stamp}.json`);
      setStatus(`✅ Backup descargado (${total} registros de ${Object.keys(data.tables).length} tablas)`);
    } catch (e) {
      setStatus(`❌ Error: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const doRestore = async (file: File) => {
    if (!confirm(
      `Vas a REEMPLAZAR toda la base local con el contenido de ${file.name}.\n` +
      `Esta operación no se puede deshacer. ¿Continuar?`
    )) return;
    setBusy(true); setStatus('');
    try {
      const text = await file.text();
      const data = JSON.parse(text) as Backup;
      const report = await restoreBackup(data);
      const total = Object.values(report.restored).reduce((a, b) => a + b, 0);
      const skipMsg = report.skipped.length ? ` · omitidas: ${report.skipped.join(', ')}` : '';
      setStatus(`✅ Restaurados ${total} registros${skipMsg}`);
    } catch (e) {
      setStatus(`❌ Error: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <button
          disabled={busy}
          onClick={doExport}
          className="px-4 py-1.5 rounded-md bg-neutral-900 text-white text-sm disabled:opacity-40"
        >
          Descargar backup
        </button>
        <label className={`px-4 py-1.5 rounded-md border text-sm cursor-pointer ${busy ? 'opacity-40 pointer-events-none' : 'hover:bg-neutral-50'}`}>
          Restaurar backup
          <input
            type="file"
            accept=".json,application/json"
            onChange={e => e.target.files?.[0] && doRestore(e.target.files[0])}
            className="hidden"
          />
        </label>
        <span className="text-xs text-neutral-500">
          Copia local completa · JSON portable
        </span>
      </div>
      {status && (
        <p className={`text-sm ${status.startsWith('❌') ? 'text-red-600' : 'text-neutral-700'}`}>
          {status}
        </p>
      )}
    </div>
  );
}
