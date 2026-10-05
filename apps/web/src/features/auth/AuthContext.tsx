import { createContext, useContext, useState, useEffect, type FC, type ReactNode } from 'react';
import { RoleCode, DEFAULT_ROLE_PERMISSIONS, Scope, type AuthUser, type Permission } from '@oams/shared';
import { api } from '@/lib/api';


interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  isAdmin: boolean;
  login: (accessToken: string, user: AuthUser) => void;
  logout: () => Promise<void>;
  can: (
    permission: Permission,
    record?: { orgId?: string; officialId?: string; userId?: string },
  ) => boolean;
  hasRole: (role: RoleCode) => boolean;
  trackLoginAttempt: (
    email: string,
    success: boolean,
  ) => { lockedOut: boolean; lockTimeRemainingMinutes: number; remainingAttempts: number };
  forgotPassword: (email: string) => Promise<{ success: boolean; resetToken?: string; message: string }>;
  resetPassword: (
    email: string,
    token: string,
    newPassword: string,
  ) => Promise<{ success: boolean; message: string }>;
  changePassword: (
    oldPassword: string,
    newPassword: string,
  ) => Promise<{ success: boolean; message: string }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Attempt to refresh session or load user on initial load
    async function initAuth() {
      try {
        const savedToken =
          sessionStorage.getItem('oams_token') ||
          (typeof localStorage !== 'undefined' ? localStorage.getItem('oams_token') : null);
        if (savedToken) {
          setToken(savedToken);
          const currentUser = await api.get<AuthUser>('/api/v1/auth/me', {
            headers: { Authorization: `Bearer ${savedToken}` },
          });
          setUser(currentUser);
        } else {
          setToken(null);
          setUser(null);
        }
      } catch {
        sessionStorage.removeItem('oams_token');
        try {
          localStorage.removeItem('oams_token');
        } catch {}
        setToken(null);
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    }

    initAuth();
  }, []);

  const login = (accessToken: string, authUser: AuthUser) => {
    setToken(accessToken);
    setUser(authUser);
    sessionStorage.setItem('oams_token', accessToken);
    sessionStorage.setItem('oams_user', JSON.stringify(authUser));
    try {
      localStorage.setItem('oams_token', accessToken);
      localStorage.setItem('oams_user', JSON.stringify(authUser));
    } catch {}
  };


  const logout = async () => {
    try {
      await api.post('/api/v1/auth/logout');
    } catch {
      // ignore
    }
    sessionStorage.removeItem('oams_token');
    sessionStorage.removeItem('oams_user');
    try {
      localStorage.removeItem('oams_token');
      localStorage.removeItem('oams_user');
      localStorage.removeItem('oams_appointment_draft');
      localStorage.removeItem('oams_last_requester_email');
    } catch {}
    setToken(null);
    setUser(null);
  };

  const hasRole = (role: RoleCode): boolean => {
    return !!user && user.roles.includes(role);
  };

  const isAdmin = Boolean(
    user &&
      (user.roles.includes(RoleCode.ADMIN) ||
        user.roles.includes(RoleCode.SUPER_ADMIN) ||
        user.roles.includes(RoleCode.APPOINTMENT_ADMIN)),
  );

  const trackLoginAttempt = (
    email: string,
    success: boolean,
  ): { lockedOut: boolean; lockTimeRemainingMinutes: number; remainingAttempts: number } => {
    const key = `oams_login_attempts_${email.trim().toLowerCase()}`;
    const now = Date.now();
    let record = { attempts: 0, lockedUntil: 0 };
    try {
      const stored = localStorage.getItem(key);
      if (stored) record = JSON.parse(stored);
    } catch {}

    if (record.lockedUntil > now) {
      const remainingMinutes = Math.ceil((record.lockedUntil - now) / 60000);
      return { lockedOut: true, lockTimeRemainingMinutes: remainingMinutes, remainingAttempts: 0 };
    }

    if (success) {
      try {
        localStorage.removeItem(key);
      } catch {}
      return { lockedOut: false, lockTimeRemainingMinutes: 0, remainingAttempts: 5 };
    } else {
      const newAttempts = record.attempts + 1;
      let lockedUntil = 0;
      if (newAttempts >= 5) {
        lockedUntil = now + 15 * 60 * 1000; // 15 minutes lockout
      }
      try {
        localStorage.setItem(key, JSON.stringify({ attempts: newAttempts, lockedUntil }));
      } catch {}

      if (lockedUntil > 0) {
        return { lockedOut: true, lockTimeRemainingMinutes: 15, remainingAttempts: 0 };
      }
      return {
        lockedOut: false,
        lockTimeRemainingMinutes: 0,
        remainingAttempts: Math.max(0, 5 - newAttempts),
      };
    }
  };

  const forgotPassword = async (email: string) => {
    return api.post<{ success: boolean; resetToken?: string; message: string }>(
      '/api/v1/auth/forgot-password',
      { email },
    );
  };

  const resetPassword = async (email: string, resetToken: string, newPass: string) => {
    return api.post<{ success: boolean; message: string }>('/api/v1/auth/reset-password', {
      email,
      token: resetToken,
      newPassword: newPass,
    });
  };

  const changePassword = async (oldPass: string, newPass: string) => {
    return api.post<{ success: boolean; message: string }>('/api/v1/auth/change-password', {
      oldPassword: oldPass,
      newPassword: newPass,
    });
  };

  const checkPermission = (
    permission: Permission,
    record?: { orgId?: string; officialId?: string; userId?: string },
  ): boolean => {
    if (!user || !user.roles || user.roles.length === 0) return false;
    if (record?.orgId && record.orgId !== user.orgId) return false;

    let highestScope: Scope | null = null;
    for (const r of user.roles) {
      const perms = DEFAULT_ROLE_PERMISSIONS[r] || [];
      const match = perms.find((p) => p.permission === permission);
      if (match) {
        if (match.scope === Scope.ORG) {
          highestScope = Scope.ORG;
          break;
        } else if (match.scope === Scope.ASSIGNED) {
          highestScope = Scope.ASSIGNED;
        } else if (match.scope === Scope.OWN && highestScope !== Scope.ASSIGNED) {
          highestScope = Scope.OWN;
        }
      }
    }

    if (!highestScope) return false;
    if (!record || highestScope === Scope.ORG) return true;

    if (highestScope === Scope.ASSIGNED) {
      if (record.officialId && user.assignedOfficialIds.includes(record.officialId)) return true;
      if (record.userId === user.id) return true;
      return false;
    }

    if (highestScope === Scope.OWN) {
      return (
        record.userId === user.id || (!!user.officialId && record.officialId === user.officialId)
      );
    }

    return false;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        isAdmin,
        login,
        logout,
        can: checkPermission,
        hasRole,
        trackLoginAttempt,
        forgotPassword,
        resetPassword,
        changePassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
