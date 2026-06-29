import { z } from 'zod';

export const classifyShoppingItemBodySchema = z
    .object({
        name: z
            .string()
            .trim()
            .min(1, { message: 'name is required' })
            .max(255, { message: 'name is too long' }),
    })
    .strict();

export const parseShoppingNLBodySchema = z
    .object({
        text: z
            .string()
            .trim()
            .min(1, { message: 'text is required' })
            .max(1000, { message: 'text is too long (max 1000 chars)' }),
    })
    .strict();

export type ClassifyShoppingItemBody = z.infer<typeof classifyShoppingItemBodySchema>;
export type ParseShoppingNLBody = z.infer<typeof parseShoppingNLBodySchema>;

// Optional override coordinates for the dashboard widget when the user lets
// the browser share its current position. Both fields must be provided
// together; if neither is sent the route falls back to the persisted city.
export const clothingSuggestionsBodySchema = z
    .object({
        latitude: z.number().min(-90).max(90).optional(),
        longitude: z.number().min(-180).max(180).optional(),
    })
    .strict()
    .refine(
        (v) =>
            (v.latitude === undefined && v.longitude === undefined) ||
            (v.latitude !== undefined && v.longitude !== undefined),
        { message: 'latitude and longitude must be provided together' },
    );

export type ClothingSuggestionsBody = z.infer<typeof clothingSuggestionsBodySchema>;

// Recipe generator. The route resolves familyMemberIds against the user's
// own family (allergies + dietary_preferences are merged into the prompt
// server-side), so the client never has to sniff that data itself.
export const generateRecipesBodySchema = z
    .object({
        ingredients: z
            .array(z.string().trim().min(1).max(120))
            .min(1, { message: 'At least one ingredient is required' })
            .max(30, { message: 'Too many ingredients (max 30)' }),
        familyMemberIds: z.array(z.string().uuid()).max(15).optional(),
        cuisine: z.enum(['senegalese', 'world', 'any']).optional(),
        simple: z.boolean().optional(),
        maxTimeMinutes: z.number().int().positive().max(360).optional(),
        count: z
            .union([z.literal(1), z.literal(2), z.literal(3)])
            .optional()
            .default(3),
    })
    .strict();

export type GenerateRecipesBody = z.infer<typeof generateRecipesBodySchema>;

// Weekly nutrition analysis. The route fetches meal_plans between the two
// dates server-side, then sends them (joined with recipe + family member
// labels) to the model for evaluation.
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const analyzeWeekMealsBodySchema = z
    .object({
        startDate: z.string().regex(ISO_DATE_RE, 'startDate must be YYYY-MM-DD'),
        endDate: z.string().regex(ISO_DATE_RE, 'endDate must be YYYY-MM-DD'),
    })
    .strict()
    .refine((v) => v.startDate <= v.endDate, {
        message: 'startDate must be on or before endDate',
    });

export type AnalyzeWeekMealsBody = z.infer<typeof analyzeWeekMealsBodySchema>;

// Lunchbox idea generator. Each "available" list is independent — the user
// might list only fruits and snacks, leaving mains/drinks empty. familyMemberId
// (optional) lets the server merge that child's age/allergies/regime into the
// prompt without the client needing access to that data.
const lunchboxItemArray = z.array(z.string().trim().min(1).max(80)).max(30);

export const generateLunchboxIdeasBodySchema = z
    .object({
        availableMains: lunchboxItemArray.optional(),
        availableFruits: lunchboxItemArray.optional(),
        availableSnacks: lunchboxItemArray.optional(),
        availableDrinks: lunchboxItemArray.optional(),
        location: z.enum(['school', 'daycare', 'outing', 'work', 'travel', 'other']),
        familyMemberId: z.string().uuid().optional(),
        count: z
            .union([z.literal(1), z.literal(2), z.literal(3)])
            .optional()
            .default(3),
        context: z.string().trim().max(280).optional(),
    })
    .strict()
    .refine(
        (v) =>
            (v.availableMains?.length ?? 0) +
                (v.availableFruits?.length ?? 0) +
                (v.availableSnacks?.length ?? 0) +
                (v.availableDrinks?.length ?? 0) >
            0,
        {
            message: 'At least one available item (fruit, snack, main or drink) is required',
        },
    );

export type GenerateLunchboxIdeasBody = z.infer<typeof generateLunchboxIdeasBodySchema>;

// Budget month analysis. The route gathers stats server-side from
// budget_entries / budget_limits using these (month, year) coordinates, so the
// client doesn't have to ship its locally-computed numbers (which would let a
// hostile client influence the AI summary).
export const analyzeBudgetMonthBodySchema = z
    .object({
        month: z.number().int().min(1).max(12),
        year: z.number().int().min(2000).max(2100),
    })
    .strict();

export type AnalyzeBudgetMonthBody = z.infer<typeof analyzeBudgetMonthBodySchema>;

// Vacation AI endpoints. The route resolves the vacation + participants
// server-side from vacationId, so the client cannot inflate the input or
// reach into someone else's trip.
export const generateVacationPlanBodySchema = z
    .object({
        vacationId: z.string().uuid(),
        /** Optional extra context the user types in the dialog. */
        extraNotes: z.string().trim().max(500).optional(),
        /** When true, persist generated days to vacation_itinerary (upsert). */
        persist: z.boolean().optional().default(true),
    })
    .strict();

export type GenerateVacationPlanBody = z.infer<typeof generateVacationPlanBodySchema>;

export const generateVacationLuggageBodySchema = z
    .object({
        vacationId: z.string().uuid(),
        extraNotes: z.string().trim().max(500).optional(),
        /** Replace existing luggage list (DELETE before INSERT). */
        replace: z.boolean().optional().default(false),
    })
    .strict();

export type GenerateVacationLuggageBody = z.infer<typeof generateVacationLuggageBodySchema>;

// Gardening tips. The route resolves the zone + its plants server-side from
// zoneId, so the client cannot reach into someone else's garden. `season` is
// supplied by the client (it knows the user's locale/hemisphere); the rest is
// derived from the persisted zone.
export const generateGardeningTipsBodySchema = z
    .object({
        zoneId: z.string().uuid(),
        season: z.enum(['Printemps', 'Été', 'Automne', 'Hiver']),
        climate: z.string().trim().max(120).optional(),
    })
    .strict();

export type GenerateGardeningTipsBody = z.infer<typeof generateGardeningTipsBodySchema>;
