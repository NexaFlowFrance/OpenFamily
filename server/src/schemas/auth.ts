import { z } from 'zod';

// Must stay in sync with shared/src/constants.ts SUPPORTED_CURRENCIES and the
// SUPPORTED_CURRENCY_CODES Set in routes/auth.ts.
const SUPPORTED_CURRENCIES = [
    'EUR',
    'USD',
    'GBP',
    'CHF',
    'CAD',
    'JPY',
    'CNY',
    'AUD',
    'XOF',
    'XAF',
    'MAD',
    'TND',
    'DZD',
    'BRL',
    'INR',
] as const;

export const registerBodySchema = z
    .object({
        email: z.string().trim().toLowerCase().email({ message: 'Invalid email address' }),
        // The bcrypt cost is non-trivial — cap the password length to avoid
        // DoS by hashing a multi-megabyte string.
        password: z
            .string()
            .min(8, { message: 'Password must be at least 8 characters' })
            .max(256, { message: 'Password is too long' }),
        name: z
            .string()
            .trim()
            .min(1, { message: 'Name is required' })
            .max(255, { message: 'Name is too long' }),
    })
    .strict();

export const loginBodySchema = z
    .object({
        email: z.string().trim().toLowerCase().email({ message: 'Invalid email address' }),
        password: z.string().min(1, { message: 'Password is required' }).max(256),
    })
    .strict();

export const updateCurrencyBodySchema = z
    .object({
        currency: z.enum(SUPPORTED_CURRENCIES, {
            message: 'Unsupported currency',
        }),
    })
    .strict();

export const updateLocationBodySchema = z
    .object({
        city: z
            .string()
            .trim()
            .min(1, { message: 'City is required' })
            .max(120, { message: 'City is too long' }),
    })
    .strict();

export const updateEmailPreferencesBodySchema = z
    .object({
        enabled: z.boolean(),
        digestMode: z.enum(['immediate', 'daily']),
    })
    .strict();

export const changePasswordBodySchema = z
    .object({
        currentPassword: z.string().min(1, { message: 'Current password is required' }).max(256),
        // Same constraints as registration: bcrypt cost makes very long inputs a
        // DoS vector, so cap the length.
        newPassword: z
            .string()
            .min(8, { message: 'Password must be at least 8 characters' })
            .max(256, { message: 'Password is too long' }),
    })
    .strict();

export type RegisterBody = z.infer<typeof registerBodySchema>;
export type LoginBody = z.infer<typeof loginBodySchema>;
export type UpdateCurrencyBody = z.infer<typeof updateCurrencyBodySchema>;
export type UpdateLocationBody = z.infer<typeof updateLocationBodySchema>;
export type UpdateEmailPreferencesBody = z.infer<typeof updateEmailPreferencesBodySchema>;
export type ChangePasswordBody = z.infer<typeof changePasswordBodySchema>;
