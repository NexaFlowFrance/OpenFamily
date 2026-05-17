import { z } from 'zod';

// Inputs may arrive as strings (form posts, JSON with stringified numbers).
// z.coerce.number() handles both cases; combined with `nullable().optional()`
// it accepts: number | numeric-string | null | undefined.
const optionalNumber = z.coerce.number({ message: 'Must be a number' }).nullable().optional();

const optionalTrimmedString = z
    .string()
    .trim()
    .max(2000, { message: 'Field is too long' })
    .nullable()
    .optional();

const nonEmptyString = (max: number, label: string) =>
    z
        .string()
        .trim()
        .min(1, { message: `${label} is required` })
        .max(max, { message: `${label} is too long` });

export const createShoppingItemSchema = z
    .object({
        name: nonEmptyString(255, 'name'),
        category: nonEmptyString(50, 'category'),
        quantity: optionalNumber,
        unit: z.string().trim().max(50).nullable().optional(),
        price: optionalNumber,
        notes: optionalTrimmedString,
    })
    .strict();

export const updateShoppingItemSchema = z
    .object({
        name: z.string().trim().min(1).max(255).optional(),
        category: z.string().trim().min(1).max(50).optional(),
        quantity: optionalNumber,
        unit: z.string().trim().max(50).nullable().optional(),
        price: optionalNumber,
        is_checked: z.boolean().optional(),
        notes: optionalTrimmedString,
    })
    .strict();

const templateItemSchema = z
    .object({
        name: nonEmptyString(255, 'name'),
        category: nonEmptyString(50, 'category'),
        quantity: optionalNumber,
        unit: z.string().trim().max(50).nullable().optional(),
        price: optionalNumber,
        notes: optionalTrimmedString,
    })
    .strict();

export const createTemplateSchema = z
    .object({
        name: nonEmptyString(255, 'name'),
        items: z
            .array(templateItemSchema)
            .min(1, { message: 'items must contain at least one entry' })
            .max(500, { message: 'Template is too large' }),
    })
    .strict();

// Same shape as create; full replace is intentional (PUT) so the client
// always sends the canonical template state.
export const updateTemplateSchema = createTemplateSchema;

export type CreateShoppingItemBody = z.infer<typeof createShoppingItemSchema>;
export type UpdateShoppingItemBody = z.infer<typeof updateShoppingItemSchema>;
export type CreateTemplateBody = z.infer<typeof createTemplateSchema>;
export type UpdateTemplateBody = z.infer<typeof updateTemplateSchema>;
