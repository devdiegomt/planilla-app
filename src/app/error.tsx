'use client';

import { useEffect } from 'react';
import { ErrorRecovery } from '@/components/ErrorRecovery';

/** Errores dentro de una página: se muestra el motivo y una salida en vez de pantalla blanca. */
export default function RouteError({
  error, reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => { console.error(error); }, [error]);
  return <ErrorRecovery error={error} reset={reset} />;
}
