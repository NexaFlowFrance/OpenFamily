// A recipe photo is either an image the browser sent inline (same formats and
// size cap as a profile picture) or a web address. Anything else, including
// javascript: or a relative path, is refused rather than stored and rendered
// in every family member's recipe list.
// Returns the value to store (null to clear), or undefined when invalid.
const MAX_INLINE_IMAGE = 1_500_000;
const MAX_IMAGE_URL = 2048;
export const cleanImageUrl = (value: unknown): string | null | undefined => {
    if (value === undefined || value === null) return null;
    if (typeof value !== 'string') return undefined;
    const v = value.trim();
    if (!v) return null;
    if (v.startsWith('data:')) {
        return /^data:image\/(png|jpeg|jpg|webp|gif);base64,/i.test(v) && v.length <= MAX_INLINE_IMAGE ? v : undefined;
    }
    if (v.length > MAX_IMAGE_URL) return undefined;
    try {
        const url = new URL(v);
        return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : undefined;
    } catch {
        return undefined;
    }
};
