'use client';

import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

type PersistState = 'unknown' | 'yes' | 'no';

export function PwaInstall() {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [persist, setPersist] = useState<PersistState>('unknown');
  const [status, setStatus] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const onBip = (e: Event) => {
      e.preventDefault();
      setPrompt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPrompt(null);
    };
    window.addEventListener('beforeinstallprompt', onBip);
    window.addEventListener('appinstalled', onInstalled);

    // Detectar si ya arranca instalada
    if (window.matchMedia?.('(display-mode: standalone)').matches) setInstalled(true);
    if ((navigator as { standalone?: boolean }).standalone) setInstalled(true);

    // Consultar estado de persistencia
    if (navigator.storage?.persisted) {
      navigator.storage.persisted().then(v => setPersist(v ? 'yes' : 'no'));
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', onBip);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const doInstall = async () => {
    if (!prompt) return;
    await prompt.prompt();
    const choice = await prompt.userChoice;
    setStatus(choice.outcome === 'accepted' ? 'Instalando…' : 'Instalación cancelada.');
    setPrompt(null);
  };

  const doPersist = async () => {
    if (!navigator.storage?.persist) {
      setStatus('Este navegador no soporta persistencia explícita.');
      return;
    }
    const ok = await navigator.storage.persist();
    setPersist(ok ? 'yes' : 'no');
    setStatus(ok
      ? '✅ Almacenamiento persistente activo — el navegador no borrará tus datos.'
      : '⚠️ El navegador declinó la persistencia. Instalar la app suele activarla.');
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        {installed ? (
          <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded font-medium">
            ✓ App instalada
          </span>
        ) : prompt ? (
          <button
            onClick={doInstall}
            className="px-4 py-1.5 rounded-md bg-neutral-900 text-white text-sm"
          >
            Instalar app
          </button>
        ) : (
          <span className="text-xs text-neutral-500">
            En móvil: usa el menú del navegador → "Añadir a pantalla de inicio".
          </span>
        )}

        <button
          disabled={persist === 'yes'}
          onClick={doPersist}
          className="px-4 py-1.5 rounded-md border text-sm hover:bg-neutral-50 disabled:opacity-50 disabled:hover:bg-white"
        >
          {persist === 'yes' ? '✓ Datos persistentes' : 'Proteger datos locales'}
        </button>
      </div>
      {status && (
        <p className="text-xs text-neutral-600">{status}</p>
      )}
    </div>
  );
}
