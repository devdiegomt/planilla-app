import { AuthPanel } from '@/components/AuthPanel';

export default function AuthPage() {
  return (
    <main className="max-w-md mx-auto p-6 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Iniciar sesión</h1>
        <p className="text-sm text-neutral-500">
          Ingresa tu email y te enviamos un código de 6 dígitos.
          La app funciona local aunque no inicies sesión — la cuenta se usa para
          hacer respaldo en Supabase y sincronizar entre dispositivos.
        </p>
      </header>
      <AuthPanel />
    </main>
  );
}
