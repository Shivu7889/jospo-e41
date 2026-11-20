'use client';

import { createContext, useContext, useEffect, useState, useRef } from 'react';
import { getSupabase } from '@/lib/supabase';

const AuthContext = createContext({});

const CACHE_USER_KEY = 'jospo_auth_user';
const CACHE_EMP_KEY = 'jospo_auth_employee';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const cached = localStorage.getItem(CACHE_USER_KEY);
        if (cached) return JSON.parse(cached);
      } catch (e) {}
    }
    return null;
  });

  const [employee, setEmployee] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const cached = localStorage.getItem(CACHE_EMP_KEY);
        if (cached) return JSON.parse(cached);
      } catch (e) {}
    }
    return null;
  });

  // If we already have a cached user and employee, start with loading: false for 0ms initial render!
  const [loading, setLoading] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const cachedUser = localStorage.getItem(CACHE_USER_KEY);
        const cachedEmp = localStorage.getItem(CACHE_EMP_KEY);
        if (cachedUser && cachedEmp) {
          return false;
        }
      } catch (e) {}
    }
    return true;
  });

  const supabase = getSupabase();
  const fetchingEmpRef = useRef(false);

  // Sync state to localStorage
  const updateCachedUser = (u) => {
    setUser(u);
    if (typeof window !== 'undefined') {
      if (u) localStorage.setItem(CACHE_USER_KEY, JSON.stringify(u));
      else localStorage.removeItem(CACHE_USER_KEY);
    }
  };

  const updateCachedEmployee = (emp) => {
    setEmployee(emp);
    if (typeof window !== 'undefined') {
      if (emp) localStorage.setItem(CACHE_EMP_KEY, JSON.stringify(emp));
      else localStorage.removeItem(CACHE_EMP_KEY);
    }
  };

  const fetchEmployee = async (userId) => {
    if (!userId || !supabase) return;
    if (fetchingEmpRef.current) return;
    fetchingEmpRef.current = true;
    try {
      const { data, error } = await supabase
        .from('employees')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) throw error;
      updateCachedEmployee(data);
    } catch (error) {
      console.error('Error fetching employee:', error);
      // Only clear if employee explicitly not found (PGRST116)
      if (error?.code === 'PGRST116') {
        updateCachedEmployee(null);
      }
    } finally {
      fetchingEmpRef.current = false;
    }
  };

  useEffect(() => {
    if (!supabase) return;

    let mounted = true;

    // Background validation: verify session with Supabase (Stale-While-Revalidate)
    const verifySession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!mounted) return;

        if (session?.user) {
          updateCachedUser(session.user);
          await fetchEmployee(session.user.id);
        } else {
          // No active session: clear cached credentials
          updateCachedUser(null);
          updateCachedEmployee(null);
        }
      } catch (error) {
        console.error('Error verifying session:', error);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    verifySession();

    // Listen for auth changes (sign in, sign out, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return;

        if (event === 'SIGNED_OUT' || !session?.user) {
          updateCachedUser(null);
          updateCachedEmployee(null);
          setLoading(false);
        } else if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
          updateCachedUser(session.user);
          await fetchEmployee(session.user.id);
          setLoading(false);
        }
      }
    );

    return () => {
      mounted = false;
      subscription?.unsubscribe();
    };
  }, []);

  const signIn = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
    if (data?.user) {
      updateCachedUser(data.user);
      await fetchEmployee(data.user.id);
    }
    return data;
  };

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.warn('Signout error:', err);
    }
    updateCachedUser(null);
    updateCachedEmployee(null);
    if (typeof window !== 'undefined') {
      try {
        sessionStorage.clear();
      } catch (e) {}
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        employee,
        loading,
        signIn,
        signOut,
        refreshEmployee: () => fetchEmployee(user?.id),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
