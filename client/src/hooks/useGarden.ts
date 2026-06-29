import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { queryKeys } from '../lib/queryClient';

// =============================================================================
// Garden & Lawn ("Jardin & Pelouse") data hooks.
// Same shape as useHouse: enum constants + <Type> interfaces → useXxx queries →
// useCreate / useUpdate / useDelete mutations that invalidate the right keys.
//
// Enum values are STORED IN FRENCH (DATA-vs-UI rule). They mirror the shared
// package (@keurtonux/shared) but are duplicated locally because that workspace
// isn't wired into the client bundle — same convention as lib/currencies.ts.
// =============================================================================

export const GARDEN_ZONE_TYPES = [
    'Pelouse',
    'Potager',
    'Massif fleuri',
    'Verger',
    'Haie',
    'Autre',
] as const;
export type GardenZoneType = (typeof GARDEN_ZONE_TYPES)[number];

export const GARDEN_LOCATIONS = ['Devant', 'Derrière', 'Côté', 'Autour', 'Autre'] as const;
export type GardenLocation = (typeof GARDEN_LOCATIONS)[number];

export const GARDEN_SUN_EXPOSURES = ['Plein soleil', 'Mi-ombre', 'Ombre'] as const;
export type GardenSunExposure = (typeof GARDEN_SUN_EXPOSURES)[number];

export const GARDEN_PLANT_TYPES = [
    'Légume',
    'Fleur',
    'Arbre',
    'Arbuste',
    'Aromatique',
    'Gazon',
    'Autre',
] as const;
export type GardenPlantType = (typeof GARDEN_PLANT_TYPES)[number];

export const GARDEN_HEALTH_STATUSES = ['En bonne santé', 'À surveiller', 'Malade', 'Mort'] as const;
export type GardenHealthStatus = (typeof GARDEN_HEALTH_STATUSES)[number];

export const GARDEN_CARE_TYPES = [
    'Arrosage',
    'Tonte',
    'Fertilisation',
    'Taille',
    'Désherbage',
    'Traitement',
    'Inspection',
    'Plantation',
    'Récolte',
] as const;
export type GardenCareType = (typeof GARDEN_CARE_TYPES)[number];

export const GARDEN_SEASONS = ['Printemps', 'Été', 'Automne', 'Hiver'] as const;
export type GardenSeason = (typeof GARDEN_SEASONS)[number];

// ---------- Entity types ----------

export interface GardenZone {
    id: string;
    user_id: string;
    name: string;
    zone_type: GardenZoneType;
    location?: GardenLocation | null;
    area_m2?: number | null;
    sun_exposure?: GardenSunExposure | null;
    soil_type?: string | null;
    notes?: string | null;
    created_at?: string;
    updated_at?: string;
    plants_count: number;
}

export interface GardenPlant {
    id: string;
    user_id: string;
    zone_id?: string | null;
    name: string;
    plant_type: GardenPlantType;
    variety?: string | null;
    planted_date?: string | null;
    watering_frequency_days?: number | null;
    health_status: GardenHealthStatus;
    photo_url?: string | null;
    notes?: string | null;
    created_at?: string;
    updated_at?: string;
    zone_name: string | null;
}

export interface GardenCare {
    id: string;
    user_id: string;
    zone_id?: string | null;
    plant_id?: string | null;
    care_type: GardenCareType;
    title: string;
    planned_date?: string | null;
    performed_date?: string | null;
    cost?: number | null;
    recurrence_days?: number | null;
    notes?: string | null;
    created_at?: string;
    updated_at?: string;
    zone_name: string | null;
    plant_name: string | null;
}

export interface GardenObservation {
    id: string;
    user_id: string;
    zone_id?: string | null;
    plant_id?: string | null;
    observed_at: string;
    health_status?: GardenHealthStatus | null;
    height_cm?: number | null;
    notes?: string | null;
    photo_url?: string | null;
    created_at?: string;
    updated_at?: string;
    zone_name: string | null;
    plant_name: string | null;
}

export interface GardenStatistics {
    upcoming_care: GardenCare[];
    counts: {
        zones: number;
        plants: number;
        plants_to_watch: number;
        care_due_today: number;
        care_due_7d: number;
    };
}

export interface GardenTips {
    summary: string;
    tips: { title: string; detail: string; timing: string }[];
    wateringSchedule: string;
    warnings: string[];
}

export interface GardenTipsResult {
    tips: GardenTips;
    model: string;
}

// ---------- Zone queries & mutations ----------

export const useGardenZones = (filters?: { zone_type?: GardenZoneType; q?: string }) =>
    useQuery({
        queryKey: queryKeys.garden.zones(filters),
        queryFn: async () => {
            const params = new URLSearchParams();
            if (filters?.zone_type) params.set('zone_type', filters.zone_type);
            if (filters?.q) params.set('q', filters.q);
            const suffix = params.toString();
            const r = await api.get<{ success: boolean; data: GardenZone[] }>(
                `/api/garden/zones${suffix ? `?${suffix}` : ''}`,
            );
            return r.data;
        },
    });

export const useGardenPlants = (filters?: {
    zone_id?: string;
    plant_type?: GardenPlantType;
    health_status?: GardenHealthStatus;
    q?: string;
}) =>
    useQuery({
        queryKey: queryKeys.garden.plants(filters),
        queryFn: async () => {
            const params = new URLSearchParams();
            if (filters?.zone_id) params.set('zone_id', filters.zone_id);
            if (filters?.plant_type) params.set('plant_type', filters.plant_type);
            if (filters?.health_status) params.set('health_status', filters.health_status);
            if (filters?.q) params.set('q', filters.q);
            const suffix = params.toString();
            const r = await api.get<{ success: boolean; data: GardenPlant[] }>(
                `/api/garden/plants${suffix ? `?${suffix}` : ''}`,
            );
            return r.data;
        },
    });

export const useGardenCare = (filters?: {
    zone_id?: string;
    plant_id?: string;
    care_type?: GardenCareType;
    status?: 'upcoming' | 'done' | 'all';
    from?: string;
    to?: string;
}) =>
    useQuery({
        queryKey: queryKeys.garden.care(filters),
        queryFn: async () => {
            const params = new URLSearchParams();
            if (filters?.zone_id) params.set('zone_id', filters.zone_id);
            if (filters?.plant_id) params.set('plant_id', filters.plant_id);
            if (filters?.care_type) params.set('care_type', filters.care_type);
            if (filters?.status) params.set('status', filters.status);
            if (filters?.from) params.set('from', filters.from);
            if (filters?.to) params.set('to', filters.to);
            const suffix = params.toString();
            const r = await api.get<{ success: boolean; data: GardenCare[] }>(
                `/api/garden/care${suffix ? `?${suffix}` : ''}`,
            );
            return r.data;
        },
    });

export const useGardenObservations = (filters?: { zone_id?: string; plant_id?: string }) =>
    useQuery({
        queryKey: queryKeys.garden.observations(filters),
        queryFn: async () => {
            const params = new URLSearchParams();
            if (filters?.zone_id) params.set('zone_id', filters.zone_id);
            if (filters?.plant_id) params.set('plant_id', filters.plant_id);
            const suffix = params.toString();
            const r = await api.get<{ success: boolean; data: GardenObservation[] }>(
                `/api/garden/observations${suffix ? `?${suffix}` : ''}`,
            );
            return r.data;
        },
    });

export const useGardenStatistics = () =>
    useQuery({
        queryKey: queryKeys.garden.statistics(),
        queryFn: async () => {
            const r = await api.get<{ success: boolean; data: GardenStatistics }>(
                '/api/garden/statistics',
            );
            return r.data;
        },
        staleTime: 60_000,
    });

// ---------- Mutations ----------

const invalidateGarden = (qc: ReturnType<typeof useQueryClient>) => {
    qc.invalidateQueries({ queryKey: queryKeys.garden.all });
    // Dashboard KPIs may surface garden counts; keep them fresh too.
    qc.invalidateQueries({ queryKey: ['dashboard'] });
};

// Zones

export type ZoneInput = {
    name: string;
    zone_type: GardenZoneType;
    location?: GardenLocation | null;
    area_m2?: number | null;
    sun_exposure?: GardenSunExposure | null;
    soil_type?: string | null;
    notes?: string | null;
};

export const useCreateZone = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (body: ZoneInput) => {
            const r = await api.post<{ success: boolean; data: GardenZone }>(
                '/api/garden/zones',
                body,
            );
            return r.data;
        },
        onSuccess: () => invalidateGarden(qc),
    });
};

export const useUpdateZone = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, patch }: { id: string; patch: Partial<ZoneInput> }) => {
            const r = await api.patch<{ success: boolean; data: GardenZone }>(
                `/api/garden/zones/${id}`,
                patch,
            );
            return r.data;
        },
        onSuccess: () => invalidateGarden(qc),
    });
};

export const useDeleteZone = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (id: string) => {
            await api.delete<{ success: boolean }>(`/api/garden/zones/${id}`);
            return id;
        },
        onSuccess: () => invalidateGarden(qc),
    });
};

// Plants

export type PlantInput = {
    name: string;
    plant_type: GardenPlantType;
    zone_id?: string | null;
    variety?: string | null;
    planted_date?: string | null;
    watering_frequency_days?: number | null;
    health_status?: GardenHealthStatus;
    photo_url?: string | null;
    notes?: string | null;
};

export const useCreatePlant = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (body: PlantInput) => {
            const r = await api.post<{ success: boolean; data: GardenPlant }>(
                '/api/garden/plants',
                body,
            );
            return r.data;
        },
        onSuccess: () => invalidateGarden(qc),
    });
};

export const useUpdatePlant = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, patch }: { id: string; patch: Partial<PlantInput> }) => {
            const r = await api.patch<{ success: boolean; data: GardenPlant }>(
                `/api/garden/plants/${id}`,
                patch,
            );
            return r.data;
        },
        onSuccess: () => invalidateGarden(qc),
    });
};

export const useDeletePlant = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (id: string) => {
            await api.delete<{ success: boolean }>(`/api/garden/plants/${id}`);
            return id;
        },
        onSuccess: () => invalidateGarden(qc),
    });
};

// Care

export type CareInput = {
    title: string;
    care_type: GardenCareType;
    zone_id?: string | null;
    plant_id?: string | null;
    planned_date?: string | null;
    performed_date?: string | null;
    cost?: number | null;
    recurrence_days?: number | null;
    notes?: string | null;
};

export const useCreateCare = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (body: CareInput) => {
            const r = await api.post<{ success: boolean; data: GardenCare }>(
                '/api/garden/care',
                body,
            );
            return r.data;
        },
        onSuccess: () => invalidateGarden(qc),
    });
};

export const useUpdateCare = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, patch }: { id: string; patch: Partial<CareInput> }) => {
            const r = await api.patch<{ success: boolean; data: GardenCare }>(
                `/api/garden/care/${id}`,
                patch,
            );
            return r.data;
        },
        onSuccess: () => invalidateGarden(qc),
    });
};

// Marks a care task done. The server auto-creates the next occurrence when
// recurrence_days is set and returns it as `next_occurrence`.
export const useCompleteCare = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, performed_date }: { id: string; performed_date?: string }) => {
            const r = await api.patch<{
                success: boolean;
                data: GardenCare & { next_occurrence: GardenCare | null };
            }>(`/api/garden/care/${id}/complete`, performed_date ? { performed_date } : {});
            return r.data;
        },
        onSuccess: () => invalidateGarden(qc),
    });
};

export const useDeleteCare = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (id: string) => {
            await api.delete<{ success: boolean }>(`/api/garden/care/${id}`);
            return id;
        },
        onSuccess: () => invalidateGarden(qc),
    });
};

// Observations

export type ObservationInput = {
    zone_id?: string | null;
    plant_id?: string | null;
    observed_at?: string | null;
    health_status?: GardenHealthStatus | null;
    height_cm?: number | null;
    notes?: string | null;
    photo_url?: string | null;
};

export const useCreateObservation = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (body: ObservationInput) => {
            const r = await api.post<{ success: boolean; data: GardenObservation }>(
                '/api/garden/observations',
                body,
            );
            return r.data;
        },
        onSuccess: () => invalidateGarden(qc),
    });
};

export const useDeleteObservation = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (id: string) => {
            await api.delete<{ success: boolean }>(`/api/garden/observations/${id}`);
            return id;
        },
        onSuccess: () => invalidateGarden(qc),
    });
};

// AI tips — can fail gracefully (AI disabled / quota); the dialog handles
// the non-2xx error itself, so this mutation just surfaces the thrown error.
export const useGenerateGardeningTips = () =>
    useMutation({
        mutationFn: async ({
            zoneId,
            season,
            climate,
        }: {
            zoneId: string;
            season: GardenSeason;
            climate?: string;
        }) => {
            const r = await api.post<{ success: boolean; data: GardenTipsResult }>(
                '/api/ai/garden/tips',
                { zoneId, season, ...(climate ? { climate } : {}) },
            );
            return r.data;
        },
    });
