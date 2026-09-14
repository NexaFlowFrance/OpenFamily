// Field rules for family posts, shared by the posts route and the data import so
// a post meets the same constraints whichever way it reaches the database.

const MAX_CONTENT = 5000;
const MAX_IMAGE = 2_000_000;
const MAX_LINK = 2000;

export const cleanContent = (value: unknown): string | null => {
    if (typeof value !== 'string') return null;
    const v = value.trim();
    return v ? v.slice(0, MAX_CONTENT) : null;
};

export const cleanImage = (value: unknown): string | null => {
    if (typeof value !== 'string' || !value.trim()) return null;

    const v = value.trim();

    if (v.length > MAX_IMAGE) {
        throw new Error('IMAGE_TOO_LARGE');
    }

    if (!/^data:image\/(?:jpeg|jpg|png|webp);base64,/i.test(v)) {
        throw new Error('INVALID_IMAGE');
    }

    return v;
};

export const cleanLink = (value: unknown): string | null => {
    if (typeof value !== 'string' || !value.trim()) return null;

    const v = value.trim();

    if (v.length > MAX_LINK) {
        throw new Error('INVALID_LINK');
    }

    try {
        const url = new URL(v);

        if (!['http:', 'https:'].includes(url.protocol)) {
            throw new Error();
        }

        return url.toString();
    } catch {
        throw new Error('INVALID_LINK');
    }
};
