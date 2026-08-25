import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { api } from '../lib/api';
import { applyServerLanguage } from '../lib/language';

interface User {
    id: string;
    email: string;
    name: string;
    is_owner?: boolean;
    role?: string;
    currency?: string;
    avatar_url?: string | null;
    language?: string;
    /** Family-wide list of optional modules the family has hidden. */
    disabled_modules?: string[];
}

/** Dashboard widgets, in default display order (mirrors the server's list). */
export const DASHBOARD_WIDGETS = ['stats', 'agenda', 'planning', 'quick', 'notes'] as const;
export type DashboardWidget = typeof DASHBOARD_WIDGETS[number];

export interface DashboardPrefs {
    order: DashboardWidget[];
    hidden: DashboardWidget[];
    agendaView: 'day' | 'week';
}

export const DEFAULT_DASHBOARD_PREFS: DashboardPrefs = {
    order: [...DASHBOARD_WIDGETS],
    hidden: [],
    agendaView: 'day',
};

interface AuthContextType {
    user: User | null;
    loading: boolean;
    login: (email: string, password: string) => Promise<void>;
    register: (email: string, password: string, name: string, inviteToken?: string, role?: string) => Promise<void>;
    joinFamily: (inviteToken: string) => Promise<void>;
    leaveFamily: () => Promise<void>;
    refreshToken: () => Promise<void>;
    logout: () => void;
    isAuthenticated: boolean;
    updateCurrency: (currency: string) => Promise<void>;
    updateProfile: (data: { name?: string; avatar_url?: string | null }) => Promise<void>;
    /** This member's dashboard layout (null until loaded). */
    dashboardPrefs: DashboardPrefs | null;
    /** Persist this member's dashboard layout and update the context. */
    updateDashboardPrefs: (prefs: DashboardPrefs) => Promise<void>;
    /** Family-wide list of hidden optional modules (empty when nothing is hidden). */
    disabledModules: string[];
    /** True when a module is not hidden by the family. Always-on modules are always enabled. */
    isModuleEnabled: (key: string) => boolean;
    /** Persist the family's hidden-modules list (parents only) and update the context. */
    updateDisabledModules: (modules: string[]) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const AUTH_EXPIRED_EVENT = 'openfamily:auth-expired';
const IS_DEMO = Boolean(import.meta.env.VITE_DEMO);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [dashboardPrefs, setDashboardPrefs] = useState<DashboardPrefs | null>(null);

    useEffect(() => {
        let mounted = true;

        const clearSession = () => {
            api.logout();
            localStorage.removeItem('user');
            if (mounted) {
                setUser(null);
            }
        };

        const onAuthExpired = () => {
            clearSession();
        };

        window.addEventListener(AUTH_EXPIRED_EVENT, onAuthExpired);

        const bootstrapSession = async () => {
            const token = api.getToken();
            // In the static demo there is no real auth: load the seeded user directly.
            if (!token && !IS_DEMO) {
                if (mounted) {
                    setLoading(false);
                }
                return;
            }

            try {
                const response = await api.get<{ success: boolean; data: { user: User } }>('/api/auth/me');
                if (!mounted) {
                    return;
                }

                if (response.success && response.data?.user) {
                    setUser(response.data.user);
                    localStorage.setItem('user', JSON.stringify(response.data.user));
                    // Once per session load: reconcile UI language with the account.
                    applyServerLanguage(response.data.user.language);
                } else {
                    clearSession();
                }
            } catch (error) {
                console.error('Failed to restore session:', error);
                clearSession();
            } finally {
                if (mounted) {
                    setLoading(false);
                }
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
            // Also store in localStorage for persistence
            localStorage.setItem('user', JSON.stringify(response.user));
            // Once per login: reconcile UI language with the account.
            applyServerLanguage(response.user.language);
        }
    };

    const register = async (email: string, password: string, name: string, inviteToken?: string, role?: string) => {
        const response = await api.register(email, password, name, inviteToken, role);
        if (response.success && response.user) {
            setUser(response.user);
            localStorage.setItem('user', JSON.stringify(response.user));
            applyServerLanguage(response.user.language);
        }
    };

    const joinFamily = async (inviteToken: string) => {
        const response = await api.joinFamily(inviteToken);
        if (response.success && response.user) {
            setUser(response.user);
            localStorage.setItem('user', JSON.stringify(response.user));
        }
    };

    const leaveFamily = async () => {
        const response = await api.leaveFamily();
        if (response.success && response.user) {
            setUser(response.user);
            localStorage.setItem('user', JSON.stringify(response.user));
        }
    };

    const refreshToken = async () => {
        const response = await api.refreshToken();
        if (response.success && response.user) {
            setUser(response.user);
            localStorage.setItem('user', JSON.stringify(response.user));
        }
    };

    const logout = () => {
        api.logout();
        setUser(null);
        localStorage.removeItem('user');
    };

    const updateCurrency = async (currency: string) => {
        const response = await api.put<{ success: boolean; data: { user: User } }>('/api/auth/currency', { currency });
        if (response.success && response.data?.user) {
            setUser(response.data.user);
            localStorage.setItem('user', JSON.stringify(response.data.user));
        }
    };

    const updateProfile = async (data: { name?: string; avatar_url?: string | null }) => {
        const response = await api.put<{ success: boolean; data: { user: User } }>('/api/auth/profile', data);
        if (response.success && response.data?.user) {
            setUser(response.data.user);
            localStorage.setItem('user', JSON.stringify(response.data.user));
        }
    };

    // Dashboard layout belongs to the logged-in member; (re)load it whenever the
    // session changes. Failure is non-blocking: the dashboard falls back to the
    // default arrangement.
    useEffect(() => {
        if (!user) {
            setDashboardPrefs(null);
            return;
        }

        let active = true;
        api.get<{ success: boolean; data: DashboardPrefs }>('/api/auth/dashboard-prefs')
            .then((res) => {
                if (active && res.success && res.data) setDashboardPrefs(res.data);
            })
            .catch(() => {
                if (active) setDashboardPrefs(DEFAULT_DASHBOARD_PREFS);
            });

        return () => { active = false; };
    }, [user?.id]);

    const updateDashboardPrefs = async (prefs: DashboardPrefs) => {
        // Optimistic: the dashboard reorders instantly, the server confirms.
        setDashboardPrefs(prefs);
        const response = await api.put<{ success: boolean; data: DashboardPrefs }>(
            '/api/auth/dashboard-prefs',
            prefs
        );
        if (response.success && response.data) {
            setDashboardPrefs(response.data);
        }
    };

    const disabledModules = user?.disabled_modules ?? [];

    const isModuleEnabled = (key: string) => !disabledModules.includes(key);

    const updateDisabledModules = async (modules: string[]) => {
        const response = await api.put<{ success: boolean; data: { disabled_modules: string[] } }>(
            '/api/auth/modules',
            { disabled_modules: modules }
        );
        if (response.success && response.data) {
            setUser((prev) => {
                if (!prev) return prev;
                const next = { ...prev, disabled_modules: response.data.disabled_modules };
                localStorage.setItem('user', JSON.stringify(next));
                return next;
            });
        }
    };

    return (
        <AuthContext.Provider
            value={{
                user,
                loading,
                login,
                register,
                joinFamily,
                leaveFamily,
                refreshToken,
                logout,
                isAuthenticated: !!user,
                updateCurrency,
                updateProfile,
                dashboardPrefs,
                updateDashboardPrefs,
                disabledModules,
                isModuleEnabled,
                updateDisabledModules,
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
