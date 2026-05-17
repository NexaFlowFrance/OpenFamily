import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { api } from '../lib/api';

interface User {
    id: string;
    email: string;
    name: string;
    is_owner?: boolean;
}

interface AuthContextType {
    user: User | null;
    loading: boolean;
    login: (email: string, password: string) => Promise<void>;
    register: (email: string, password: string, name: string, inviteToken?: string) => Promise<void>;
    joinFamily: (inviteToken: string) => Promise<void>;
    leaveFamily: () => Promise<void>;
    logout: () => void;
    isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const AUTH_EXPIRED_EVENT = 'openfamily:auth-expired';

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

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
            if (!token) {
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
        }
    };

    const register = async (email: string, password: string, name: string, inviteToken?: string) => {
        const response = await api.register(email, password, name, inviteToken);
        if (response.success && response.user) {
            setUser(response.user);
            localStorage.setItem('user', JSON.stringify(response.user));
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

    const logout = () => {
        api.logout();
        setUser(null);
        localStorage.removeItem('user');
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
                logout,
                isAuthenticated: !!user,
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
