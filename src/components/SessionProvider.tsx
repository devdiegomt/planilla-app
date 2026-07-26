'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { getSupabase } from '@/lib/supabase';

interface SessionContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue>({
  user: null,
  session: null,
  loading: true,
  signOut: async () => {},
});

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = getSupabase();
    // Hidratar la sesión inicial (Supabase la persiste en localStorage por defecto)
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    // Suscribirse a cambios (login, logout, refresh de token)
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await getSupabase().auth.signOut();
  };

  return (
    <SessionContext.Provider
      value={{ user: session?.user ?? null, session, loading, signOut }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  return useContext(SessionContext);
}
