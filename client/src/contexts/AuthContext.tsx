import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { logger } from '../lib/logger';

export interface AuthMember {
  id: string;
  name: string;
  color: string;
  familyId: string;
}

export interface LoginMember {
  id: string;
  name: string;
  color: string;
  hasPin: boolean;
}

interface AuthSession {
  token: string;
  member: AuthMember;
  expiresAt: string;
}

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  currentMember: AuthMember | null;
  token: string | null;
  login: (memberId: string, pin?: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  setPin: (pin: string, currentPin?: string) => Promise<{ success: boolean; error?: string }>;
  fetchLoginMembers: () => Promise<LoginMember[]>;
}

// Exported so other contexts can read it directly via useContext without crashing
export const AuthContext = createContext<AuthContextType | undefined>(undefined);

const STORAGE_KEY = 'openfamily_session';

function getApiUrl(): string {
  return '/api';
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  const [session, setSession] = useState<AuthSession | null>(null);

  // Restore session from localStorage on mount
  useEffect(() => {
    const restoreSession = async () => {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (!stored) {
          setIsLoading(false);
          return;
        }

        const parsed: AuthSession = JSON.parse(stored);
        
        // Validate the token with the server
        const response = await fetch(`${getApiUrl()}/auth/session`, {
          headers: {
            'Authorization': `Bearer ${parsed.token}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          const restoredSession: AuthSession = {
            token: data.token,
            member: data.member,
            expiresAt: data.expiresAt,
          };
          setSession(restoredSession);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(restoredSession));
          logger.log('✅ Session restored for', restoredSession.member.name);
        } else {
          // Session is invalid, clear it
          localStorage.removeItem(STORAGE_KEY);
          logger.log('⚠️ Stored session is invalid, cleared');
        }
      } catch (error) {
        logger.error('Error restoring session:', error);
        localStorage.removeItem(STORAGE_KEY);
      } finally {
        setIsLoading(false);
      }
    };

    restoreSession();
  }, []);

  const fetchLoginMembers = useCallback(async (): Promise<LoginMember[]> => {
    try {
      const response = await fetch(`${getApiUrl()}/auth/members`, {
        headers: {
          'X-Family-Id': 'family-default',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch members');
      }

      return await response.json();
    } catch (error) {
      logger.error('Error fetching login members:', error);
      return [];
    }
  }, []);

  const login = useCallback(async (memberId: string, pin?: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const response = await fetch(`${getApiUrl()}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          memberId,
          pin: pin || undefined,
          familyId: 'family-default',
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        return { success: false, error: error.error || 'Login failed' };
      }

      const data = await response.json();
      const newSession: AuthSession = {
        token: data.token,
        member: data.member,
        expiresAt: data.expiresAt,
      };

      setSession(newSession);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newSession));
      logger.log('✅ Logged in as', newSession.member.name);
      return { success: true };
    } catch (error) {
      logger.error('Login error:', error);
      return { success: false, error: 'Connection error' };
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      if (session?.token) {
        await fetch(`${getApiUrl()}/auth/logout`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.token}`,
          },
        });
      }
    } catch (error) {
      logger.error('Logout error:', error);
    } finally {
      setSession(null);
      localStorage.removeItem(STORAGE_KEY);
      logger.log('✅ Logged out');
    }
  }, [session]);

  const setPin = useCallback(async (pin: string, currentPin?: string): Promise<{ success: boolean; error?: string }> => {
    try {
      if (!session?.token) {
        return { success: false, error: 'Not authenticated' };
      }

      const response = await fetch(`${getApiUrl()}/auth/set-pin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.token}`,
        },
        body: JSON.stringify({ pin, currentPin }),
      });

      if (!response.ok) {
        const error = await response.json();
        return { success: false, error: error.error || 'Failed to set PIN' };
      }

      return { success: true };
    } catch (error) {
      logger.error('Set PIN error:', error);
      return { success: false, error: 'Connection error' };
    }
  }, [session]);

  const value: AuthContextType = {
    isAuthenticated: !!session,
    isLoading,
    currentMember: session?.member || null,
    token: session?.token || null,
    login,
    logout,
    setPin,
    fetchLoginMembers,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
