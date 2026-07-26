'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabase } from '@/lib/supabase';
import { useSession } from './SessionProvider';

type Step = 'email' | 'code';

export function AuthPanel() {
  const router = useRouter();
  const { user, loading } = useSession();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // Si ya hay sesión, redirigir a home
  useEffect(() => {
    if (!loading && user) router.replace('/');
  }, [user, loading, router]);

  const sendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true); setErr(null); setInfo(null);
    try {
      const { error } = await getSupabase().auth.signInWithOtp({
        email: email.trim(),
        options: { shouldCreateUser: true },
      });
      if (error) throw error;
      setStep('code');
      setInfo(`Código enviado a ${email.trim()}. Revisa tu bandeja (y spam).`);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const verifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    setBusy(true); setErr(null);
    try {
      const { error } = await getSupabase().auth.verifyOtp({
        email: email.trim(),
        token: code.trim(),
        type: 'email',
      });
      if (error) throw error;
      // El SessionProvider recoge el cambio via onAuthStateChange
      router.replace('/');
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setBusy(true); setErr(null); setInfo(null);
    try {
      const { error } = await getSupabase().auth.signInWithOtp({
        email: email.trim(),
        options: { shouldCreateUser: true },
      });
      if (error) throw error;
      setInfo(`Código reenviado a ${email.trim()}.`);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <p className="text-sm text-neutral-500">Cargando…</p>;
  if (user) return <p className="text-sm text-neutral-500">Redirigiendo…</p>;

  return (
    <div className="border rounded-lg p-4 bg-white space-y-4">
      {step === 'email' && (
        <form onSubmit={sendCode} className="space-y-3">
          <label className="text-sm block">
            <span className="text-xs text-neutral-500 block mb-1">Email</span>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="tu.email@dominio.com"
              className="w-full border rounded px-3 py-2 text-sm"
              disabled={busy}
              autoFocus
              required
            />
          </label>
          <button
            type="submit"
            disabled={busy || !email.trim()}
            className="w-full px-4 py-2 rounded-md bg-neutral-900 text-white text-sm disabled:opacity-40"
          >
            {busy ? 'Enviando…' : 'Enviar código'}
          </button>
        </form>
      )}

      {step === 'code' && (
        <form onSubmit={verifyCode} className="space-y-3">
          <div className="text-xs text-neutral-500">
            Código enviado a <span className="font-medium text-neutral-800">{email}</span>
            {' · '}
            <button
              type="button"
              onClick={() => { setStep('email'); setCode(''); setInfo(null); setErr(null); }}
              className="text-neutral-600 hover:text-neutral-900 underline"
            >
              cambiar
            </button>
          </div>
          <label className="text-sm block">
            <span className="text-xs text-neutral-500 block mb-1">Código recibido por email</span>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={10}
              value={code}
              onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
              placeholder="000000"
              className="w-full border rounded px-3 py-2 text-lg text-center tracking-widest font-mono"
              disabled={busy}
              autoFocus
              required
            />
          </label>
          <button
            type="submit"
            disabled={busy || code.length < 6}
            className="w-full px-4 py-2 rounded-md bg-neutral-900 text-white text-sm disabled:opacity-40"
          >
            {busy ? 'Verificando…' : 'Confirmar'}
          </button>
          <button
            type="button"
            onClick={resend}
            disabled={busy}
            className="w-full text-xs text-neutral-600 hover:text-neutral-900 underline"
          >
            Reenviar código
          </button>
        </form>
      )}

      {info && <p className="text-xs text-neutral-600">{info}</p>}
      {err && <p className="text-sm text-red-600">❌ {err}</p>}
    </div>
  );
}
