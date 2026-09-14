'use client';

import { useEffect } from 'react';
import { ErrorRecovery } from '@/components/ErrorRecovery';

/**
 * Errores en el layout raíz (sesión, navegación). Reemplaza al layout entero,
 * por eso trae su propio <html> y <body>.
 */
export default function GlobalError({
  error, reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <html lang="es">
      <body style={{ margin: 0, background: '#fff' }}>
        <ErrorRecovery error={error} reset={reset} />
      </body>
    </html>
  );
}
