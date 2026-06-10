import { isIP } from 'node:net';
import dns from 'node:dns/promises';

/**
 * SSRF guard for user-supplied integration URLs (Mealie, Home Assistant, Grocy…).
 *
 * OpenFamily is self-hosted: private LAN targets (Home Assistant on 192.168.x.x,
 * a NAS on 10.x…) are LEGITIMATE, so RFC1918 addresses are allowed by default.
 * What is ALWAYS blocked:
 *   - non-http(s) schemes
 *   - cloud metadata endpoints (AWS/Azure/GCP link-local 169.254.169.254,
 *     AWS IPv6 fd00:ec2::254, GCP metadata.google.internal, Alibaba 100.100.100.200)
 *     — checked on the literal host AND on the DNS-resolved addresses, so a
 *     domain pointing at the metadata service is rejected too.
 *
 * For hardened deployments, set INTEGRATIONS_BLOCK_PRIVATE_IPS=true to also block
 * loopback, RFC1918, link-local and unique-local targets.
 */

const METADATA_HOSTNAMES = new Set([
    'metadata.google.internal',
    'metadata.goog',
]);

// Always-blocked literal addresses (cloud metadata services)
const METADATA_IPV4 = new Set(['169.254.169.254', '100.100.100.200']);
const METADATA_IPV6 = new Set(['fd00:ec2::254']);

const normalizeIpv6 = (ip: string): string => {
    // Cheap canonicalization: lowercase and strip a zone index ("%eth0").
    return ip.toLowerCase().split('%')[0];
};

const ipv4ToInt = (ip: string): number => {
    const parts = ip.split('.').map(Number);
    return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
};

const inCidr4 = (ip: string, base: string, maskBits: number): boolean => {
    const mask = maskBits === 0 ? 0 : (~0 << (32 - maskBits)) >>> 0;
    return (ipv4ToInt(ip) & mask) === (ipv4ToInt(base) & mask);
};

const isPrivateIpv4 = (ip: string): boolean =>
    inCidr4(ip, '127.0.0.0', 8) ||
    inCidr4(ip, '10.0.0.0', 8) ||
    inCidr4(ip, '172.16.0.0', 12) ||
    inCidr4(ip, '192.168.0.0', 16) ||
    inCidr4(ip, '169.254.0.0', 16) ||
    inCidr4(ip, '0.0.0.0', 8);

const isPrivateIpv6 = (ip: string): boolean => {
    const n = normalizeIpv6(ip);
    if (n === '::1' || n === '::') return true;
    if (n.startsWith('fe80:') || n.startsWith('fc') || n.startsWith('fd')) return true;
    // IPv4-mapped addresses (::ffff:192.168.0.1)
    const mapped = n.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIpv4(mapped[1]);
    return false;
};

const isBlockedAddress = (address: string, blockPrivate: boolean): string | null => {
    const family = isIP(address);
    if (family === 4) {
        if (METADATA_IPV4.has(address)) return 'cloud metadata address';
        // The AWS/GCP metadata service lives in 169.254.0.0/16 — always block link-local v4.
        if (inCidr4(address, '169.254.0.0', 16)) return 'link-local (metadata) address';
        if (blockPrivate && isPrivateIpv4(address)) return 'private address';
    } else if (family === 6) {
        const n = normalizeIpv6(address);
        if (METADATA_IPV6.has(n)) return 'cloud metadata address';
        const mapped = n.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
        if (mapped) return isBlockedAddress(mapped[1], blockPrivate);
        if (n.startsWith('fe80:')) return 'link-local (metadata) address';
        if (blockPrivate && isPrivateIpv6(n)) return 'private address';
    }
    return null;
};

export class UnsafeUrlError extends Error {}

export interface SafeUrlOptions {
    /**
     * Force-block loopback/RFC1918/link-local/unique-local targets regardless of
     * INTEGRATIONS_BLOCK_PRIVATE_IPS. Use this for routes that fetch the PUBLIC
     * internet (e.g. recipe import), where a private target is never legitimate.
     * When omitted, the env flag keeps deciding (integrations on a LAN).
     */
    blockPrivate?: boolean;
}

/**
 * Validates a user-supplied integration base URL. Throws UnsafeUrlError when the
 * URL must not be fetched. Call this both when an integration is saved AND right
 * before every test/sync request (the DNS answer can change between the two).
 */
export async function assertSafeIntegrationUrl(baseUrl: string, options: SafeUrlOptions = {}): Promise<void> {
    let url: URL;
    try {
        url = new URL(baseUrl);
    } catch {
        throw new UnsafeUrlError('URL invalide');
    }

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new UnsafeUrlError('Seuls les protocoles http et https sont autorisés');
    }

    const blockPrivate = options.blockPrivate ?? (process.env.INTEGRATIONS_BLOCK_PRIVATE_IPS === 'true');
    // URL.hostname keeps brackets around IPv6 literals — strip them.
    const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();

    if (METADATA_HOSTNAMES.has(hostname)) {
        throw new UnsafeUrlError('Cette adresse est bloquée (service de métadonnées cloud)');
    }

    if (isIP(hostname)) {
        const reason = isBlockedAddress(hostname, blockPrivate);
        if (reason) throw new UnsafeUrlError(`Cette adresse est bloquée (${reason})`);
        return;
    }

    if (blockPrivate && hostname === 'localhost') {
        throw new UnsafeUrlError('Cette adresse est bloquée (private address)');
    }

    // Resolve the hostname and check every returned address, so a DNS name pointing
    // at a metadata endpoint is rejected too. If resolution fails we let the request
    // proceed — the subsequent fetch will fail with a clearer network error.
    let addresses: { address: string }[] = [];
    try {
        addresses = await dns.lookup(hostname, { all: true });
    } catch {
        return;
    }

    for (const { address } of addresses) {
        const reason = isBlockedAddress(address, blockPrivate);
        if (reason) {
            throw new UnsafeUrlError(`Cette adresse est bloquée (${reason})`);
        }
    }
}
