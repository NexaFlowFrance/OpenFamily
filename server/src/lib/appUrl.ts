import { Request } from 'express';

/**
 * Public base URL of this OpenFamily instance, used to build links sent OUTSIDE
 * the application (family invitations, password-reset emails).
 *
 * Resolution order:
 *  - APP_PUBLIC_URL when set. Needed only when the server cannot see its own
 *    public name, e.g. behind a reverse proxy that rewrites the Host header;
 *  - otherwise the origin the current request was addressed to. For the web
 *    client that is the app's own origin, and for the mobile app it is the
 *    server URL the device was pointed at, which is exactly the address a
 *    recipient has to open.
 *
 * Returns '' when neither is available (no request context and no configuration).
 * Callers must treat an empty value as "cannot build a link" rather than falling
 * back to some other host: a wrong origin would send your family's invitees to
 * somebody else's server.
 */
export const resolveAppBaseUrl = (req?: Request): string => {
    const strip = (u: string) => u.trim().replace(/\/+$/, '');

    const configured = process.env.APP_PUBLIC_URL?.trim();
    if (configured) {
        return strip(configured);
    }

    if (req) {
        const host = req.get('host');
        if (host) {
            return `${req.protocol}://${host}`;
        }
    }

    return '';
};
