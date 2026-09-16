'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { wipeLocalData } from '@/lib/backup';
import { useSession } from './SessionProvider';

/**
 * Borrado de salida: deja el equipo sin datos de estudiantes.
 *
 * Es el cierre de quien deja el colegio o devuelve un equipo prestado.
 * Restringir el dominio del correo impide entrar, pero no saca los datos del
 * navegador de nadie — la app es local-first. Esto sí.
 *
 * No borra del servidor a propósito: si el docente vuelve a entrar, sus datos
 * están. Para que no queden en ninguna parte, el colegio desactiva la cuenta y
 * después se corre esto.
 *
 * La confirmación es por escrito y no un `confirm()`: no tiene vuelta atrás y
 * conviene que el gesto cueste.
 */
export function WipeDevice() {
  const router = useRouter();
  const { user, signOut } = useSession();
  const [texto, setTexto] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirmado = texto.trim().toUpperCase() === 'BORRAR';

  const borrar = async () => {
    if (!confirmado) return;
    setBusy(true);
    setError(null);
    try {
      await wipeLocalData();
      // Cerrar sesión después: si quedara abierta, el sync siguiente volvería
      // a bajar del servidor todo lo que se acaba de borrar.
      if (user) await signOut();
      router.replace('/');
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-neutral-700">
        Borra de <strong>este equipo</strong> los cursos, estudiantes, notas,
        asistencia y observaciones, y cierra la sesión. Úsalo al dejar el colegio
        o al devolver un equipo prestado.
      </p>
      <p className="text-xs text-neutral-500">
        No borra lo que está en el servidor: si vuelves a iniciar sesión, tus
        datos bajan otra vez. Para que no queden en ninguna parte, el colegio
        tiene que desactivar la cuenta antes.
      </p>
      <p className="text-xs text-amber-800">
        ⚠ Si tienes algo que no esté sincronizado, descarga primero una copia
        arriba — esto no se puede deshacer.
      </p>

      <div className="flex items-end gap-2 flex-wrap">
        <label className="text-xs">
          <span className="block text-neutral-500 mb-0.5">
            Escribe BORRAR para confirmar
          </span>
          <input
            type="text"
            value={texto}
            onChange={e => setTexto(e.target.value)}
            className="border rounded px-2 py-1.5 text-sm w-40"
            placeholder="BORRAR"
          />
        </label>
        <button
          onClick={borrar}
          disabled={!confirmado || busy}
          className="px-3 py-1.5 rounded-md bg-red-600 text-white text-sm disabled:opacity-40"
        >
          {busy ? 'Borrando…' : 'Borrar y cerrar sesión'}
        </button>
      </div>

      {error && <p className="text-sm text-red-700">❌ {error}</p>}
    </div>
  );
}
