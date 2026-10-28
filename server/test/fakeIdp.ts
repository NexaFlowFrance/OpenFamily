import crypto from 'node:crypto';
import http from 'node:http';
import { AddressInfo } from 'node:net';
import * as jose from 'jose';

/**
 * A minimal OpenID Connect provider for the tests: discovery, JWKS, an
 * authorization endpoint that signs the user straight in, a token endpoint and
 * UserInfo. Each test sets who signs in (`claims`) and how the provider should
 * misbehave (`tamper`).
 */

export interface Tamper {
    badSignature?: boolean;
    algNone?: boolean;
    issuer?: string;
    audience?: string | string[];
    azp?: string;
    expiredSecondsAgo?: number;
    wrongNonce?: boolean;
    userinfoSub?: string;
    userinfoStatus?: number;
    /** The provider refuses the sign-in with this error code (and a free-text description). */
    authorizeError?: string;
    /** The token endpoint refuses the code with this error code (and a free-text description). */
    tokenError?: string;
}

interface PendingCode {
    nonce: string;
    challenge: string;
    redirectUri: string;
}

export class FakeIdp {
    issuer = '';
    clientId = 'openfamily-test';
    clientSecret = 'test-client-secret';
    claims: Record<string, unknown> = {};
    userinfo: Record<string, unknown> | null = null;
    tamper: Tamper = {};
    tokenRequests = 0;

    private server = http.createServer((req, res) => void this.handle(req, res));
    private codes = new Map<string, PendingCode>();
    private keys!: { privateKey: CryptoKey; jwk: jose.JWK };

    async start(): Promise<void> {
        const { privateKey, publicKey } = await jose.generateKeyPair('RS256', { extractable: true });
        this.keys = { privateKey, jwk: { ...(await jose.exportJWK(publicKey)), kid: 'test-key', alg: 'RS256', use: 'sig' } };
        await new Promise<void>((resolve) => this.server.listen(0, '127.0.0.1', resolve));
        this.issuer = `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
    }

    stop(): Promise<void> {
        return new Promise((resolve) => this.server.close(() => resolve()));
    }

    /** Who signs in next, and how the provider behaves. */
    reset(claims: Record<string, unknown> = {}): void {
        this.claims = { sub: 'alice-sub', email: 'alice@example.org', email_verified: true, name: 'Alice Martin', ...claims };
        this.userinfo = null;
        this.tamper = {};
        this.tokenRequests = 0;
    }

    private async handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
        const url = new URL(req.url ?? '/', this.issuer);
        const json = (status: number, body: unknown) => {
            res.writeHead(status, { 'content-type': 'application/json' });
            res.end(JSON.stringify(body));
        };

        if (url.pathname === '/.well-known/openid-configuration') {
            return json(200, {
                issuer: this.issuer,
                authorization_endpoint: `${this.issuer}/authorize`,
                token_endpoint: `${this.issuer}/token`,
                userinfo_endpoint: `${this.issuer}/userinfo`,
                jwks_uri: `${this.issuer}/jwks`,
                response_types_supported: ['code'],
                subject_types_supported: ['public'],
                id_token_signing_alg_values_supported: ['RS256'],
                code_challenge_methods_supported: ['S256'],
            });
        }
        if (url.pathname === '/jwks') return json(200, { keys: [this.keys.jwk] });

        if (url.pathname === '/authorize') {
            const code = crypto.randomBytes(16).toString('hex');
            const redirectUri = url.searchParams.get('redirect_uri') ?? '';
            this.codes.set(code, {
                nonce: url.searchParams.get('nonce') ?? '',
                challenge: url.searchParams.get('code_challenge') ?? '',
                redirectUri,
            });
            const target = new URL(redirectUri);
            if (this.tamper.authorizeError) {
                target.searchParams.set('error', this.tamper.authorizeError);
                target.searchParams.set('error_description', 'SECRET-DESCRIPTION <script>alert(1)</script>');
                target.searchParams.set('state', url.searchParams.get('state') ?? '');
                res.writeHead(302, { location: target.href });
                return void res.end();
            }
            target.searchParams.set('code', code);
            target.searchParams.set('state', url.searchParams.get('state') ?? '');
            res.writeHead(302, { location: target.href });
            return void res.end();
        }

        if (url.pathname === '/token') {
            this.tokenRequests += 1;
            const body = new URLSearchParams(await readBody(req));
            const pending = this.codes.get(body.get('code') ?? '');
            this.codes.delete(body.get('code') ?? '');
            const verifier = body.get('code_verifier') ?? '';
            const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
            if (!pending || pending.challenge !== challenge || pending.redirectUri !== body.get('redirect_uri')) {
                return json(400, { error: 'invalid_grant' });
            }
            if (this.tamper.tokenError) {
                return json(400, { error: this.tamper.tokenError, error_description: 'SECRET-DESCRIPTION <script>alert(1)</script>' });
            }
            return json(200, {
                access_token: 'test-access-token',
                token_type: 'Bearer',
                expires_in: 300,
                id_token: await this.idToken(pending.nonce),
            });
        }

        if (url.pathname === '/userinfo') {
            if (this.tamper.userinfoStatus) return json(this.tamper.userinfoStatus, { error: 'server_error' });
            return json(200, { sub: this.tamper.userinfoSub ?? this.claims.sub, ...(this.userinfo ?? {}) });
        }

        json(404, { error: 'not_found' });
    }

    private async idToken(nonce: string): Promise<string> {
        const now = Math.floor(Date.now() / 1000);
        const payload: Record<string, unknown> = {
            ...this.claims,
            nonce: this.tamper.wrongNonce ? 'another-nonce' : nonce,
            ...(this.tamper.azp ? { azp: this.tamper.azp } : {}),
        };
        const exp = this.tamper.expiredSecondsAgo !== undefined ? now - this.tamper.expiredSecondsAgo : now + 300;

        if (this.tamper.algNone) {
            const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
            const body = Buffer.from(JSON.stringify({ ...payload, iss: this.issuer, aud: this.clientId, iat: now, exp })).toString('base64url');
            return `${header}.${body}.`;
        }

        const token = await new jose.SignJWT(payload)
            .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
            .setIssuer(this.tamper.issuer ?? this.issuer)
            .setAudience(this.tamper.audience ?? this.clientId)
            .setIssuedAt(now)
            .setExpirationTime(exp)
            .sign(this.keys.privateKey);

        if (!this.tamper.badSignature) return token;
        const [header, body, signature] = token.split('.');
        const flipped = Buffer.from(signature, 'base64url');
        flipped[0] ^= 0xff;
        return `${header}.${body}.${flipped.toString('base64url')}`;
    }
}

const readBody = (req: http.IncomingMessage): Promise<string> => new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => resolve(data));
});
