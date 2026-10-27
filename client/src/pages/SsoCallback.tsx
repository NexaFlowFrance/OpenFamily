import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../lib/api';
import { takePendingSso } from '../lib/sso';

// Error codes the server can return, each with its own message. Anything else
// gets the generic one.
const KNOWN_ERRORS = new Set([
    'cancelled', 'expired', 'invalid_code', 'account_conflict', 'identity_in_use', 'already_linked',
    'session_mismatch', 'registration_closed', 'invite_invalid', 'email_required', 'email_unverified',
    'provider_unavailable', 'try_again', 'sign_in_failed',
]);

/**
 * Where the identity provider sends the browser back (/auth/callback#code=...).
 * Rendered outside the authenticated app, like the password reset page. The
 * one-time code is removed from the address bar before anything else, then
 * redeemed with the secret this tab kept when the sign-in started.
 */
const SsoCallback: React.FC<{ onDone: (path: string) => void }> = ({ onDone }) => {
    const { t } = useTranslation(['auth', 'common']);
    const { completeSsoLogin } = useAuth();
    const [error, setError] = useState<string | null>(null);
    const [backPath, setBackPath] = useState('/');
    const started = useRef(false);

    useEffect(() => {
        // React StrictMode runs effects twice in development; the code works once.
        if (started.current) return;
        started.current = true;

        const fragment = new URLSearchParams(window.location.hash.slice(1));
        window.history.replaceState(null, '', window.location.pathname);
        const pending = takePendingSso();
        if (pending?.mode === 'link') setBackPath('/settings');

        const code = fragment.get('code');
        const failure = fragment.get('error');
        if (failure || !code || !pending) {
            // No code and nothing pending: a reload, or a link opened in another tab.
            setError(failure ? (KNOWN_ERRORS.has(failure) ? failure : 'generic') : 'expired');
            return;
        }

        api.exchangeSso(code, pending.verifier)
            .then((result) => {
                if (result.mode === 'link') {
                    onDone('/settings?sso=linked');
                    return;
                }
                completeSsoLogin(result.user);
                // An invitation opened by someone who already had an account:
                // show the usual "join this family" confirmation.
                onDone(pending.invite && !result.created ? `/join?invite=${encodeURIComponent(pending.invite)}` : '/');
            })
            .catch((err: unknown) => {
                const message = err instanceof Error ? err.message : '';
                setError(KNOWN_ERRORS.has(message) ? message : 'generic');
            });
    }, [completeSsoLogin, onDone]);

    return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
            <Card className="w-full max-w-md" hover={false}>
                {error ? (
                    <>
                        <CardHeader className="text-center pb-6 pt-8">
                            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
                                <AlertCircle className="h-7 w-7" />
                            </div>
                            <CardTitle className="font-serif text-display mb-2">{t('auth:sso.failedTitle')}</CardTitle>
                            <p className="text-muted-foreground text-caption">{t(`auth:sso.errors.${error}`)}</p>
                        </CardHeader>
                        <CardContent className="px-8 pb-8">
                            <Button className="w-full h-12 text-body-sm font-semibold" size="lg" onClick={() => onDone(backPath)}>
                                {backPath === '/settings' ? t('auth:sso.backToSettings') : t('auth:sso.backToLogin')}
                            </Button>
                        </CardContent>
                    </>
                ) : (
                    <CardContent className="flex flex-col items-center gap-3 py-12">
                        <div className="spinner-brand" />
                        <p className="text-caption text-muted-foreground">{t('auth:sso.signingIn')}</p>
                    </CardContent>
                )}
            </Card>
        </div>
    );
};

export default SsoCallback;
