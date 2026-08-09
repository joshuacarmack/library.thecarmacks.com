import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "./api";

interface AuthUser {
  id: string;
  email: string;
  displayName: string | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, displayName: string, signupCode?: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .me()
      .then((u) => setUser({ id: u.id, email: u.email, displayName: u.display_name }))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const value: AuthContextValue = {
    user,
    loading,
    login: async (email, password) => {
      const u = await api.login(email, password);
      setUser(u);
    },
    signup: async (email, password, displayName, signupCode) => {
      const u = await api.signup(email, password, displayName, signupCode);
      setUser(u);
    },
    logout: async () => {
      await api.logout();
      setUser(null);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
