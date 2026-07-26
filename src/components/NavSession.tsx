'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useSession } from './SessionProvider';

export function NavSession() {
  const { user, loading, signOut } = useSession();
  const [open, setOpen] = useState(false);

  if (loading) {
    return <div className="text-xs text-neutral-400">…</div>;
  }

  if (!user) {
    return (
      <Link
        href="/auth"
        className="text-xs px-2 py-1 rounded border hover:bg-neutral-50 text-neutral-700"
      >
        Iniciar sesión
      </Link>
    );
  }

  const label = user.email ?? 'Cuenta';

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="text-xs px-2 py-1 rounded border hover:bg-neutral-50 text-neutral-700 max-w-[220px] truncate"
        title={label}
      >
        {label}
      </button>
      {open && (
        <div
          className="absolute right-0 top-full mt-1 border rounded-md bg-white shadow-md min-w-[180px] z-20"
          onMouseLeave={() => setOpen(false)}
        >
          <div className="px-3 py-2 text-[11px] text-neutral-500 border-b truncate" title={label}>
            {label}
          </div>
          <button
            onClick={async () => { setOpen(false); await signOut(); }}
            className="w-full text-left px-3 py-2 text-sm hover:bg-neutral-50 text-neutral-700"
          >
            Salir
          </button>
        </div>
      )}
    </div>
  );
}
