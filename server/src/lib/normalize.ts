export const toNullIfEmpty = <T>(value: T | null | undefined): T | null => {
    if (value === undefined || value === null) {
        return null;
    }

    if (typeof value === 'string' && value.trim() === '') {
        return null;
    }

    return value;
};

export const normalizeEmail = (email: string): string => email.trim().toLowerCase();

export const serializeStringArray = (value: unknown): string | null => {
    if (value === undefined || value === null) {
        return null;
    }

    if (Array.isArray(value)) {
        const cleaned = value
            .map((item) => (typeof item === 'string' ? item.trim() : ''))
            .filter(Boolean);

        return cleaned.length > 0 ? JSON.stringify(cleaned) : null;
    }

    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) {
            return null;
        }

        try {
            const parsed = JSON.parse(trimmed);
            if (Array.isArray(parsed)) {
                return serializeStringArray(parsed);
            }
        } catch {
            // Keep plain strings for backward compatibility.
        }

        return trimmed;
    }

    return null;
};

export const parseStringArray = (value: unknown): string[] => {
    if (value === undefined || value === null) {
        return [];
    }

    if (Array.isArray(value)) {
        return value
            .map((item) => (typeof item === 'string' ? item.trim() : ''))
            .filter(Boolean);
    }

    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) {
            return [];
        }

        try {
            const parsed = JSON.parse(trimmed);
            if (Array.isArray(parsed)) {
                return parseStringArray(parsed);
            }
        } catch {
            // Support legacy comma separated values.
        }

        return trimmed
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean);
    }

    return [];
};

export const toOptionalNumber = (value: unknown): number | null => {
    if (value === undefined || value === null || value === '') {
        return null;
    }

    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : null;
};
