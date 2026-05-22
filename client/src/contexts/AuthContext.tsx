import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { api } from '../lib/api';

interface User {
    id: string;
    email: string;
    name: string;
    currency?: string | null;
    city?: string | null;
    country_code?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    email_notifications_enabled?: boolean;
    email_digest_mode?: 'immediate' | 'daily';
    // NULL = this account owns its family (can manage members). Set = invited
    // member of another account's family.
    family_owner_id?: string | null;
    // True until the member changes the temporary password emailed to them.
    must_change_password?: boolean;
}

interface AuthContextType {
    user: User | null;
    loading: boolean;
    login: (email: string, password: string) => Promise<void>;
    register: (email: string, password: string, name: string) => Promise<void>;
    logout: () => Promise<void>;
    isAuthenticated: boolean;
    setUserCurrency: (currency: string) => Promise<void>;
    // Replace the cached user atomically — used after PATCH /me/location so
    // the dashboard widget sees the new city without refetching /me.
    setUserFromServer: (user: User) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const AUTH_EXPIRED_EVENT = 'openfamily:auth-expired';

// We keep a copy of the *user profile* (not the token) in localStorage so the
// UI can paint immediately on reload before /api/auth/me returns. This is a
// non-sensitive convenience cache; the source of truth is always the server.
const USER_CACHE_KEY = 'user';

const readCachedUser = (): User | null => {
    try {
        const raw = localStorage.getItem(USER_CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && typeof parsed.id === 'string') {
            return parsed as User;
        }
    } catch {
        // ignore corrupted cache
    }
    return null;
};

const writeCachedUser = (user: User | null): void => {
    if (user) {
        localStorage.setItem(USER_CACHE_KEY, JSON.stringify(user));
    } else {
        localStorage.removeItem(USER_CACHE_KEY);
    }
};

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    // Optimistically paint with the cached profile — `/api/auth/me` will
    // confirm or clear it shortly.
    const [user, setUser] = useState<User | null>(readCachedUser());
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let mounted = true;

        const clearSession = () => {
            writeCachedUser(null);
            if (mounted) setUser(null);
        };

        const onAuthExpired = () => {
            clearSession();
        };

        window.addEventListener(AUTH_EXPIRED_EVENT, onAuthExpired);

        // No more "is there a token?" check — there is no readable token. We
        // simply ask the server who we are. If we have valid cookies, /me
        // succeeds; if not (or refresh fails), the api client emits
        // auth-expired and we end up logged out.
        const bootstrapSession = async () => {
            try {
                const response = await api.get<{ success: boolean; data: { user: User } }>(
                    '/api/auth/me',
                );
                if (!mounted) return;
                if (response.success && response.data?.user) {
                    setUser(response.data.user);
                    writeCachedUser(response.data.user);
                } else {
                    clearSession();
                }
            } catch {
                // Either no session or the server is down. In either case we
                // don't surface the cached user — the api client has already
                // dispatched auth-expired if appropriate.
                if (mounted) {
                    clearSession();
                }
            } finally {
                if (mounted) setLoading(false);
            }
        };

        void bootstrapSession();

        return () => {
            mounted = false;
            window.removeEventListener(AUTH_EXPIRED_EVENT, onAuthExpired);
        };
    }, []);

    const login = async (email: string, password: string) => {
        const response = await api.login(email, password);
        if (response.success && response.user) {
            setUser(response.user);
            writeCachedUser(response.user);
        }
    };

    const register = async (email: string, password: string, name: string) => {
        const response = await api.register(email, password, name);
        if (response.success && response.user) {
            setUser(response.user);
            writeCachedUser(response.user);
        }
    };

    const logout = async () => {
        await api.logout();
        setUser(null);
        writeCachedUser(null);
    };

    const setUserCurrency = async (currency: string) => {
        const response = await api.patch<{ success: boolean; data: { user: User } }>(
            '/api/auth/me/currency',
            { currency },
        );
        if (response.success && response.data?.user) {
            setUser(response.data.user);
            writeCachedUser(response.data.user);
        }
    };

    const setUserFromServer = (next: User) => {
        setUser(next);
        writeCachedUser(next);
    };

    return (
        <AuthContext.Provider
            value={{
                user,
                loading,
                login,
                register,
                logout,
                isAuthenticated: !!user,
                setUserCurrency,
                setUserFromServer,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
