'use client';

import { useEffect, useState } from 'react';
import { explicarError, repairAndReload } from '@/lib/recovery';

/**
 * Pantalla de error con salida, compartida por `error.tsx` y `global-error.tsx`.
 *
 * Estilos inline y no Tailwind: `global-error` reemplaza al layout raíz, y con
 * él puede no estar cargado `globals.css`.
 */
export function ErrorRecovery({
  error, reset,
}: {
  error: Error & { digest?: string };
  reset?: () => void;
}) {
  const [reparando, setReparando] = useState(false);
  // React está corriendo y ya se muestra una salida: el vigía no debe duplicarla.
  useEffect(() => {
    (window as unknown as { __planillaHydrated?: boolean }).__planillaHydrated = true;
  }, []);
  const exp = explicarError(error);
  const detalle = `${error?.name ?? 'Error'}: ${error?.message ?? ''}`
    + (error?.digest ? `\ndigest: ${error.digest}` : '');

  const boton = (primario: boolean): React.CSSProperties => ({
    background: primario ? '#111827' : '#fff',
    color: primario ? '#fff' : '#111827',
    border: '1px solid #111827',
    borderRadius: 6,
    padding: '8px 14px',
    font: 'inherit',
    cursor: 'pointer',
  });

  return (
    <div style={{
      maxWidth: 520, margin: '12vh auto', padding: '0 20px',
      font: '15px/1.5 system-ui, sans-serif', color: '#1f2937',
    }}>
      <h1 style={{ fontSize: 20, margin: '0 0 8px' }}>{exp.titulo}</h1>
      <p style={{ margin: '0 0 14px' }}>{exp.mensaje}</p>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        {exp.reparable && (
          <button
            type="button"
            style={boton(true)}
            disabled={reparando}
            onClick={() => { setReparando(true); repairAndReload(); }}
          >
            {reparando ? 'Reparando…' : 'Reparar y recargar'}
          </button>
        )}
        {reset && (
          <button type="button" style={boton(!exp.reparable)} onClick={() => reset()}>
            Reintentar
          </button>
        )}
      </div>

      <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 6px' }}>
        Tus datos no se tocan: la reparación solo limpia la copia de la app guardada
        en este navegador.
      </p>
      <details style={{ fontSize: 12, color: '#6b7280' }}>
        <summary style={{ cursor: 'pointer' }}>Detalle técnico</summary>
        <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', marginTop: 6 }}>
          {detalle}
        </pre>
      </details>
    </div>
  );
}
