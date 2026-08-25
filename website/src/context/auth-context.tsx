"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  AUTH_STORAGE_KEY,
  AUTH_TOKEN_STORAGE_KEY,
} from "@/lib/constants";
import {
  getMyProfile,
  loginCustomer,
  registerCustomer,
  updateMyProfile,
} from "@/services/api";
import type { Customer, LoginPayload, RegisterPayload } from "@/types";

interface AuthContextValue {
  customer: Customer | null;
  isAuthenticated: boolean;
  login: (payload: LoginPayload) => Promise<Customer>;
  register: (payload: RegisterPayload) => Promise<Customer>;
  logout: () => void;
  refreshProfile: () => Promise<Customer | null>;
  saveCheckoutDefaults: (input: {
    name: string;
    address: string;
    location_id: string;
  }) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(AUTH_STORAGE_KEY);
      const token = localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
      if (raw && token) setCustomer(JSON.parse(raw) as Customer);
    } catch {
      setCustomer(null);
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (customer) {
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(customer));
    } else {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    }
  }, [customer, hydrated]);

  // Refresh profile from server once so default_address / location stay current.
  useEffect(() => {
    if (!hydrated || !customer) return;
    const token = localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
    if (!token) return;
    let active = true;
    getMyProfile()
      .then((fresh) => {
        if (active) setCustomer(fresh);
      })
      .catch(() => {
        /* keep cached profile if offline / 401 handled elsewhere */
      });
    return () => {
      active = false;
    };
    // Only on first hydrate while logged in
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  const login = useCallback(async (payload: LoginPayload) => {
    const result = await loginCustomer(payload);
    setCustomer(result);
    return result;
  }, []);

  const register = useCallback(async (payload: RegisterPayload) => {
    const result = await registerCustomer(payload);
    setCustomer(result);
    return result;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
    setCustomer(null);
  }, []);

  const refreshProfile = useCallback(async () => {
    const token = localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
    if (!token) return null;
    try {
      const fresh = await getMyProfile();
      setCustomer(fresh);
      return fresh;
    } catch {
      return null;
    }
  }, []);

  const saveCheckoutDefaults = useCallback(
    async (input: { name: string; address: string; location_id: string }) => {
      const token = localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
      if (!token) return;
      try {
        const fresh = await updateMyProfile({
          name: input.name,
          default_address: input.address,
          default_location_id: input.location_id,
        });
        setCustomer(fresh);
      } catch {
        /* non-blocking — order already placed */
      }
    },
    [],
  );

  const value = useMemo(
    () => ({
      customer,
      isAuthenticated: Boolean(customer),
      login,
      register,
      logout,
      refreshProfile,
      saveCheckoutDefaults,
    }),
    [
      customer,
      login,
      register,
      logout,
      refreshProfile,
      saveCheckoutDefaults,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
