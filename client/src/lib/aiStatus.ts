// Tiny shared cache for GET /api/ai/settings, so the Layout (✨ button),
// MealPlanning and Settings all reuse a single fetch per session.
import { useEffect, useState } from 'react';
import { api } from './api';

export interface AiStatus {
    configured: boolean;
    enabled: boolean;
    provider?: 'ollama' | 'openai' | 'anthropic';
    base_url?: string | null;
    model?: string;
    has_api_key?: boolean;
}

let cached: AiStatus | null = null;
let inflight: Promise<AiStatus | null> | null = null;
const listeners = new Set<(status: AiStatus | null) => void>();

const notify = () => {
    for (const listener of listeners) listener(cached);
};

async function fetchStatus(): Promise<AiStatus | null> {
    if (!inflight) {
        inflight = api
            .get<{ success: boolean; data: AiStatus }>('/api/ai/settings')
            .then((response) => {
                cached = response.success ? response.data : { configured: false, enabled: false };
                notify();
                return cached;
            })
            .catch(() => {
                // Not logged in / server error: behave as "not configured" without caching,
                // so a later refresh can succeed.
                return null;
            })
            .finally(() => {
                inflight = null;
            });
    }
    return inflight;
}

/** Force a refetch (called after saving the settings). */
export async function refreshAiStatus(): Promise<void> {
    cached = null;
    await fetchStatus();
}

/** null while loading/unknown, then the latest known status. */
export function useAiStatus(): AiStatus | null {
    const [status, setStatus] = useState<AiStatus | null>(cached);

    useEffect(() => {
        const listener = (next: AiStatus | null) => setStatus(next);
        listeners.add(listener);
        if (cached) {
            setStatus(cached);
        } else {
            void fetchStatus().then((s) => {
                if (s) setStatus(s);
            });
        }
        return () => {
            listeners.delete(listener);
        };
    }, []);

    return status;
}

/** Convenience flag: the ✨ features only show when configured AND enabled. */
export function useAiEnabled(): boolean {
    const status = useAiStatus();
    return Boolean(status?.configured && status?.enabled);
}
