// The API base URL is resolved at request time by `apiBase()`:
//  - web: same-origin in prod ('' ), localhost:3001 in dev (see serverConfig);
//  - native (Capacitor): the server URL the user configured on the device.
import { mockRequest } from '../demo/mockApi';
import { apiBase } from './serverConfig';

const IS_DEMO = Boolean(import.meta.env.VITE_DEMO);
const AUTH_EXPIRED_EVENT = 'openfamily:auth-expired';

class ApiClient {
    private token: string | null = null;

    constructor() {
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
        // Static GitHub Pages demo: serve everything from the in-browser mock.
        if (IS_DEMO) {
            const method = (options.method as string) || 'GET';
            const body = options.body ? JSON.parse(options.body as string) : undefined;
            return mockRequest<T>(method, endpoint, body);
        }

        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
        };

        if (this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }

        const response = await fetch(`${apiBase()}${endpoint}`, {
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

    /**
     * Fetches binary content (images…) with the auth header.
     * Not supported by the static demo mock — throws so callers fall back.
     */
    async getBlob(endpoint: string): Promise<Blob> {
        if (IS_DEMO) throw new Error('Binary endpoints are not available in demo mode');

        const headers: Record<string, string> = {};
        if (this.token) headers['Authorization'] = `Bearer ${this.token}`;

        const response = await fetch(`${apiBase()}${endpoint}`, { headers });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.blob();
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

export const api = new ApiClient();
