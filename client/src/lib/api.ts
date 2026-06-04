// VITE_API_URL non défini en dev -> http://localhost:3001.
// En build de production (installeur Windows, Docker...), on utilise la MÊME
// ORIGINE par défaut (chaîne vide) afin que l'accès fonctionne depuis un mobile
// via http://<ip-du-pc>:3000. On ne se repose pas sur une variable vide passée
// au build : PowerShell supprime les variables d'environnement vides, ce qui
// faisait basculer le client sur localhost:3001 (d'où les « Failed to fetch »).
const rawApiUrl = import.meta.env.VITE_API_URL as string | undefined;
const API_URL = rawApiUrl !== undefined
    ? rawApiUrl
    : (import.meta.env.PROD ? '' : 'http://localhost:3001');
const AUTH_EXPIRED_EVENT = 'openfamily:auth-expired';

class ApiClient {
    private baseURL: string;
    private token: string | null = null;

    constructor(baseURL: string) {
        this.baseURL = baseURL;
        this.token = localStorage.getItem('token');
    }

    setToken(token: string | null) {
        this.token = token;
        if (token) {
            localStorage.setItem('token', token);
        } else {
            localStorage.removeItem('token');
        }
    }

    getToken(): string | null {
        return this.token;
    }

    private async request<T>(
        endpoint: string,
        options: RequestInit = {}
    ): Promise<T> {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
        };

        if (this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }

        const response = await fetch(`${this.baseURL}${endpoint}`, {
            ...options,
            headers: {
                ...headers,
                ...(options.headers as Record<string, string>),
            },
        });

        const contentType = response.headers.get('content-type') || '';
        const data = contentType.includes('application/json') ? await response.json() : null;

        if (!response.ok) {
            if (response.status === 401) {
                this.setToken(null);
                localStorage.removeItem('user');
                window.dispatchEvent(
                    new CustomEvent(AUTH_EXPIRED_EVENT, {
                        detail: data?.error || data?.message || 'Unauthorized',
                    })
                );
            }

            const fallbackMessage = `HTTP ${response.status}`;
            throw new Error(data?.error || data?.message || fallbackMessage);
        }

        return data as T;
    }

    async get<T>(endpoint: string): Promise<T> {
        return this.request<T>(endpoint, { method: 'GET' });
    }

    async post<T>(endpoint: string, body: any): Promise<T> {
        return this.request<T>(endpoint, {
            method: 'POST',
            body: JSON.stringify(body),
        });
    }

    async put<T>(endpoint: string, body: any): Promise<T> {
        return this.request<T>(endpoint, {
            method: 'PUT',
            body: JSON.stringify(body),
        });
    }

    async delete<T>(endpoint: string): Promise<T> {
        return this.request<T>(endpoint, { method: 'DELETE' });
    }

    // Authentication methods
    async login(email: string, password: string) {
        const response = await this.post<any>(
            '/api/auth/login',
            { email, password }
        );

        if (response.success && response.data) {
            this.setToken(response.data.token);
            return { success: true, ...response.data };
        }
        return response;
    }

    async register(email: string, password: string, name: string, inviteToken?: string, role?: string) {
        const body: Record<string, string> = { email, password, name, role: role ?? 'parent' };
        if (inviteToken) body.inviteToken = inviteToken;

        const response = await this.post<any>(
            '/api/auth/register',
            body
        );

        if (response.success && response.data) {
            this.setToken(response.data.token);
            return { success: true, ...response.data };
        }
        return response;
    }

    async joinFamily(inviteToken: string) {
        const response = await this.post<any>('/api/invites/join', { token: inviteToken });
        if (response.success && response.data) {
            this.setToken(response.data.token);
            return { success: true, ...response.data };
        }
        return response;
    }

    async leaveFamily() {
        const response = await this.delete<any>('/api/invites/leave');
        if (response.success && response.data) {
            this.setToken(response.data.token);
            return { success: true, ...response.data };
        }
        return response;
    }

    async refreshToken() {
        const response = await this.post<any>('/api/auth/refresh', {});
        if (response.success && response.data) {
            this.setToken(response.data.token);
            return { success: true, ...response.data };
        }
        return response;
    }

    logout() {
        this.setToken(null);
    }
}

export const api = new ApiClient(API_URL);
export const API_BASE_URL = API_URL;
