import { z } from 'zod';

// =============================================================================
// Garden & Lawn schemas — zones, plants, care tasks, observations.
// Same conventions as schemas/house.ts: zod enums for restricted fields,
// .strict() to reject unknown keys, ISO date strings handed straight to PG,
// PATCH schemas redeclare the shape with .optional() + a non-empty refine.
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

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'Expected YYYY-MM-DD' });

const optionalNullable = <T extends z.ZodTypeAny>(schema: T) =>
    schema.nullish().transform((v) => (v === undefined ? undefined : v));

const optionalString = (max: number) =>
    optionalNullable(z.string().trim().max(max).or(z.literal('')))
        // Coerce empty strings to null so the DB stays clean.
        .transform((v) => (typeof v === 'string' && v.length === 0 ? null : v));

// ---------- Zones ----------

export const zoneBodySchema = z
    .object({
        name: z.string().trim().min(1).max(120),
        zone_type: z.enum(GARDEN_ZONE_TYPES),
        location: z.enum(GARDEN_LOCATIONS).nullish(),
        area_m2: optionalNullable(z.number().min(0).max(1_000_000)),
        sun_exposure: z.enum(GARDEN_SUN_EXPOSURES).nullish(),
        soil_type: optionalString(60),
        notes: optionalString(2000),
    })
    .strict();

export const zonePatchSchema = z
    .object({
        name: z.string().trim().min(1).max(120).optional(),
        zone_type: z.enum(GARDEN_ZONE_TYPES).optional(),
        location: z.enum(GARDEN_LOCATIONS).nullish(),
        area_m2: optionalNullable(z.number().min(0).max(1_000_000)).optional(),
        sun_exposure: z.enum(GARDEN_SUN_EXPOSURES).nullish(),
        soil_type: optionalString(60).optional(),
        notes: optionalString(2000).optional(),
    })
    .strict()
    .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' });

export const zoneListQuerySchema = z
    .object({
        zone_type: z.enum(GARDEN_ZONE_TYPES).optional(),
        q: z.string().trim().min(1).max(120).optional(),
    })
    .strict();

// ---------- Plants ----------

export const plantBodySchema = z
    .object({
        name: z.string().trim().min(1).max(120),
        plant_type: z.enum(GARDEN_PLANT_TYPES),
        zone_id: z.string().uuid().nullable().optional(),
        variety: optionalString(120),
        planted_date: optionalNullable(isoDate),
        watering_frequency_days: optionalNullable(z.number().int().min(1).max(365)),
        health_status: z.enum(GARDEN_HEALTH_STATUSES).optional(),
        photo_url: optionalString(2048),
        notes: optionalString(2000),
    })
    .strict();

export const plantPatchSchema = z
    .object({
        name: z.string().trim().min(1).max(120).optional(),
        plant_type: z.enum(GARDEN_PLANT_TYPES).optional(),
        zone_id: z.string().uuid().nullable().optional(),
        variety: optionalString(120).optional(),
        planted_date: optionalNullable(isoDate).optional(),
        watering_frequency_days: optionalNullable(z.number().int().min(1).max(365)).optional(),
        health_status: z.enum(GARDEN_HEALTH_STATUSES).optional(),
        photo_url: optionalString(2048).optional(),
        notes: optionalString(2000).optional(),
    })
    .strict()
    .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' });

export const plantListQuerySchema = z
    .object({
        zone_id: z.string().uuid().optional(),
        plant_type: z.enum(GARDEN_PLANT_TYPES).optional(),
        health_status: z.enum(GARDEN_HEALTH_STATUSES).optional(),
        q: z.string().trim().min(1).max(120).optional(),
    })
    .strict();

// ---------- Care ----------

const datesPresentRefine = <T extends { planned_date?: unknown; performed_date?: unknown }>(v: T) =>
    v.planned_date != null || v.performed_date != null;

export const careBodySchema = z
    .object({
        title: z.string().trim().min(1).max(120),
        care_type: z.enum(GARDEN_CARE_TYPES),
        zone_id: z.string().uuid().nullable().optional(),
        plant_id: z.string().uuid().nullable().optional(),
        planned_date: optionalNullable(isoDate),
        performed_date: optionalNullable(isoDate),
        cost: optionalNullable(z.number().min(0).max(10_000_000)),
        recurrence_days: optionalNullable(z.number().int().min(1).max(365)),
        notes: optionalString(2000),
    })
    .strict()
    .refine(datesPresentRefine, {
        message: 'Either planned_date or performed_date must be set',
        path: ['planned_date'],
    });

export const carePatchSchema = z
    .object({
        title: z.string().trim().min(1).max(120).optional(),
        care_type: z.enum(GARDEN_CARE_TYPES).optional(),
        zone_id: z.string().uuid().nullable().optional(),
        plant_id: z.string().uuid().nullable().optional(),
        planned_date: optionalNullable(isoDate).optional(),
        performed_date: optionalNullable(isoDate).optional(),
        cost: optionalNullable(z.number().min(0).max(10_000_000)).optional(),
        recurrence_days: optionalNullable(z.number().int().min(1).max(365)).optional(),
        notes: optionalString(2000).optional(),
    })
    .strict()
    .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' });

export const careListQuerySchema = z
    .object({
        zone_id: z.string().uuid().optional(),
        plant_id: z.string().uuid().optional(),
        care_type: z.enum(GARDEN_CARE_TYPES).optional(),
        status: z.enum(['upcoming', 'done', 'all']).optional(),
        from: isoDate.optional(),
        to: isoDate.optional(),
    })
    .strict();

// ---------- Observations ----------

export const observationBodySchema = z
    .object({
        zone_id: z.string().uuid().nullable().optional(),
        plant_id: z.string().uuid().nullable().optional(),
        observed_at: isoDate.optional(),
        health_status: z.enum(GARDEN_HEALTH_STATUSES).nullish(),
        height_cm: optionalNullable(z.number().min(0).max(100_000)),
        notes: optionalString(2000),
        photo_url: optionalString(2048),
    })
    .strict()
    .refine((v) => v.zone_id != null || v.plant_id != null, {
        message: 'Either zone_id or plant_id must be set',
        path: ['zone_id'],
    });

export const observationListQuerySchema = z
    .object({
        zone_id: z.string().uuid().optional(),
        plant_id: z.string().uuid().optional(),
    })
    .strict();

export type ZoneBody = z.infer<typeof zoneBodySchema>;
export type ZonePatch = z.infer<typeof zonePatchSchema>;
export type PlantBody = z.infer<typeof plantBodySchema>;
export type PlantPatch = z.infer<typeof plantPatchSchema>;
export type CareBody = z.infer<typeof careBodySchema>;
export type CarePatch = z.infer<typeof carePatchSchema>;
export type ObservationBody = z.infer<typeof observationBodySchema>;
