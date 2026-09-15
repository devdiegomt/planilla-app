'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useSession } from './SessionProvider';
import { DownloadIcon, ENTREGAS_URL, GearIcon } from './nav-icons';

/**
 * Menú de desbordamiento de móvil.
 *
 * Reemplaza la píldora del correo, que con `max-w-[220px]` se comía casi dos
 * tercios de la barra en 375px y dejaba a los íconos sin espacio. Acá el
 * usuario es un círculo con la inicial y el correo se lee al abrir.
 *
 * Recoge lo que no entra en la barra inferior: Ajustes y "Descargar entregas".
 * Ajustes tiene que estar también sin sesión iniciada — la app es local-first y
 * el backup, la reparación y la instalación no dependen de estar autenticado.
 *
 * El cierre va por un fondo que capta el toque, no por `onMouseLeave`: en una
 * pantalla táctil ese evento no llega nunca.
 */
export function NavMenu() {
  const { user, loading, signOut } = useSession();
  const [open, setOpen] = useState(false);

  const email = user?.email ?? null;
  const inicial = email?.[0]?.toUpperCase() ?? '?';

  return (
    <div className="sm:hidden relative">
      <button
        onClick={() => setOpen(o => !o)}
        aria-label="Más opciones"
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center justify-center w-8 h-8 rounded-full border
                   text-xs font-medium text-neutral-700 hover:bg-neutral-50"
      >
        {loading ? '…' : user ? inicial : '⋯'}
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            aria-hidden="true"
            onClick={() => setOpen(false)}
          />
          <div
            role="menu"
            className="absolute right-0 top-full mt-1 border rounded-md bg-white shadow-md
                       min-w-[220px] z-50 text-sm"
          >
            <Link
              href="/ajustes"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-2.5 hover:bg-neutral-50 text-neutral-800"
            >
              <GearIcon />
              Ajustes
            </Link>

            <a
              href={ENTREGAS_URL}
              target="_blank"
              rel="noopener noreferrer"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-2.5 hover:bg-neutral-50 text-neutral-800 border-t"
            >
              <DownloadIcon />
              Descargar entregas ↗
            </a>

            {user ? (
              <div className="border-t">
                <div className="px-3 py-2 text-[11px] text-neutral-500 truncate" title={email ?? ''}>
                  {email ?? 'Cuenta'}
                </div>
                <button
                  role="menuitem"
                  onClick={async () => { setOpen(false); await signOut(); }}
                  className="w-full text-left px-3 py-2.5 hover:bg-neutral-50 text-neutral-700"
                >
                  Salir
                </button>
              </div>
            ) : (
              <Link
                href="/auth"
                role="menuitem"
                onClick={() => setOpen(false)}
                className="block px-3 py-2.5 hover:bg-neutral-50 text-neutral-800 border-t"
              >
                Iniciar sesión
              </Link>
            )}
          </div>
        </>
      )}
    </div>
  );
}
