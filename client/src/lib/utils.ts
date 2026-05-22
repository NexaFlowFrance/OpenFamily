import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import i18n from '../i18n';

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

// Map the active UI language to a BCP-47 tag for Intl.* date formatting.
// Components that also consume useTranslation() re-render on language change.
function intlLocale(): string {
    return (i18n.language ?? 'fr').split('-')[0] === 'en' ? 'en-US' : 'fr-FR';
}

export function formatDate(date: Date | string): string {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleDateString(intlLocale(), {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });
}

export function formatTime(date: Date | string): string {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleTimeString(intlLocale(), {
        hour: '2-digit',
        minute: '2-digit',
    });
}

import { getCurrencyDefinition } from './currencies';

export function formatCurrency(
    amount: number,
    currencyCode?: string | null,
    options?: Intl.NumberFormatOptions,
): string {
    const def = getCurrencyDefinition(currencyCode);
    return new Intl.NumberFormat(def.locale, {
        style: 'currency',
        currency: def.code,
        ...options,
    }).format(amount);
}

export function getCurrencySymbol(currencyCode?: string | null): string {
    return getCurrencyDefinition(currencyCode).symbol;
}
