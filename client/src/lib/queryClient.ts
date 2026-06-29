import { QueryClient } from '@tanstack/react-query';

// =============================================================================
// Tanstack Query setup
//
// Phased rollout: the data layer of new and refactored pages now goes through
// React Query (cache, dedup, retries, optimistic updates). Legacy pages still
// use the imperative api.* calls — they will be migrated module by module.
//
// Defaults are chosen for a family app: low traffic, mostly user-driven
// refreshes, no high-frequency polling.
// =============================================================================
export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            // Data is considered fresh for 30s — within that window navigating
            // away and back doesn't refetch.
            staleTime: 30_000,
            // Keep fetched data in memory for 5 min after it becomes unused.
            gcTime: 5 * 60_000,
            // Refetch automatically when the user returns to the tab.
            refetchOnWindowFocus: true,
            refetchOnReconnect: true,
            // The api client already throws on non-2xx; let React Query treat
            // those as real failures rather than retrying blindly.
            retry: (failureCount, error) => {
                const msg = error instanceof Error ? error.message : '';
                // Don't retry auth failures — the api client has already
                // attempted a refresh.
                if (/unauthorized|HTTP 401/i.test(msg)) return false;
                return failureCount < 2;
            },
        },
        mutations: {
            retry: false,
        },
    },
});

// Shared key factory — consumers should pull from here so a single rename
// doesn't leak stale keys across components.
export const queryKeys = {
    shopping: {
        all: ['shopping'] as const,
        items: () => [...queryKeys.shopping.all, 'items'] as const,
        templates: () => [...queryKeys.shopping.all, 'templates'] as const,
    },
    dashboard: {
        all: ['dashboard'] as const,
        weatherClothing: (override: { latitude: number; longitude: number } | null) =>
            [...queryKeys.dashboard.all, 'weather-clothing', override] as const,
    },
    weather: {
        all: ['weather'] as const,
        weekly: (override: { latitude: number; longitude: number } | null, days: number) =>
            [...queryKeys.weather.all, 'weekly', override, days] as const,
    },
    tasks: {
        all: ['tasks'] as const,
        today: () => [...queryKeys.tasks.all, 'today'] as const,
    },
    notifications: {
        all: ['notifications'] as const,
        list: () => [...queryKeys.notifications.all, 'list'] as const,
        unreadCount: () => [...queryKeys.notifications.all, 'unread-count'] as const,
    },
    house: {
        all: ['house'] as const,
        equipments: (filters?: { category?: string; q?: string }) =>
            [...queryKeys.house.all, 'equipments', filters ?? null] as const,
        equipment: (id: string) => [...queryKeys.house.all, 'equipments', id] as const,
        maintenance: (filters?: { equipment_id?: string; status?: 'upcoming' | 'done' | 'all' }) =>
            [...queryKeys.house.all, 'maintenance', filters ?? null] as const,
        contracts: (filters?: { status?: 'active' | 'inactive' | 'all' }) =>
            [...queryKeys.house.all, 'contracts', filters ?? null] as const,
        contacts: (filters?: { category?: string; q?: string; equipment_id?: string }) =>
            [...queryKeys.house.all, 'contacts', filters ?? null] as const,
        rooms: () => [...queryKeys.house.all, 'rooms'] as const,
        items: (filters?: { room_id?: string; category?: string; q?: string; orphan?: boolean }) =>
            [...queryKeys.house.all, 'items', filters ?? null] as const,
        projects: (filters?: { status?: string }) =>
            [...queryKeys.house.all, 'projects', filters ?? null] as const,
        project: (id: string) => [...queryKeys.house.all, 'projects', id] as const,
        dashboard: () => [...queryKeys.house.all, 'dashboard'] as const,
    },
    documents: {
        all: ['documents'] as const,
        list: (filters?: {
            entity_type?: string;
            entity_id?: string;
            category?: string;
            q?: string;
            unlinked?: boolean;
        }) => [...queryKeys.documents.all, 'list', filters ?? null] as const,
    },
    garden: {
        all: ['garden'] as const,
        zones: (filters?: { zone_type?: string; q?: string }) =>
            [...queryKeys.garden.all, 'zones', filters ?? null] as const,
        plants: (filters?: {
            zone_id?: string;
            plant_type?: string;
            health_status?: string;
            q?: string;
        }) => [...queryKeys.garden.all, 'plants', filters ?? null] as const,
        care: (filters?: {
            zone_id?: string;
            plant_id?: string;
            care_type?: string;
            status?: 'upcoming' | 'done' | 'all';
            from?: string;
            to?: string;
        }) => [...queryKeys.garden.all, 'care', filters ?? null] as const,
        observations: (filters?: { zone_id?: string; plant_id?: string }) =>
            [...queryKeys.garden.all, 'observations', filters ?? null] as const,
        statistics: () => [...queryKeys.garden.all, 'statistics'] as const,
    },
} as const;
