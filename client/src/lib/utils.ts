import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { intlLocale, formatTime as formatClockTime } from '../i18n/format';

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export function formatDate(date: Date | string): string {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleDateString(intlLocale(), {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

export function formatTime(date: Date | string): string {
    return formatClockTime(date);
}

export function formatCurrency(amount: number, currency: string = 'EUR'): string {
    return new Intl.NumberFormat(intlLocale(), {
        style: 'currency',
        currency: currency.toUpperCase()
    }).format(amount);
}
