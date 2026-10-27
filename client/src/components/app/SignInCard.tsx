import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle, CheckCircle, KeyRound, Loader2, LogOut } from 'lucide-react';
import { Card, CardContent, Button } from '../ui';
import { api, AuthServerConfig } from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';
import { isNative } from '../../lib/serverConfig';
import { ssoSupported, startSso } from '../../lib/sso';

interface SignInState {
    hasPassword: boolean;
    ssoLinked: boolean;
}

/**
 * "Sign-in" card in Settings: link or unlink the server's identity provider,
 * and sign out of every device.
 */
const SignInCard: React.FC = () => {
    const { t } = useTranslation(['settings', 'common']);
    const { logoutEverywhere } = useAuth();
    const [config, setConfig] = useState<AuthServerConfig | null>(null);
    const [state, setState] = useState<SignInState | null>(null);
    const [busy, setBusy] = useState<'link' | 'unlink' | 'logout' | null>(null);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');

    const load = async () => {
        const me = await api.get<{ success: boolean; data: { user: { has_password?: boolean; sso_linked?: boolean } } }>('/api/auth/me');
        setState({ hasPassword: me.data.user.has_password !== false, ssoLinked: Boolean(me.data.user.sso_linked) });
    };

    useEffect(() => {
        api.getAuthConfig().then(setConfig).catch(() => setConfig(null));
        load().catch(() => setState(null));
        // Back from the provider after linking (see SsoCallback).
        const params = new URLSearchParams(window.location.search);
        if (params.get('sso') === 'linked') {
            setNotice(t('settings:signIn.linked'));
            window.history.replaceState(null, '', window.location.pathname);
        }
    }, [t]);

    const ssoOffered = Boolean(config?.oidc.enabled) && ssoSupported() && !isNative();
    // Unlinking leaves the password as the only way in.
    const canUnlink = Boolean(state?.hasPassword) && Boolean(config?.passwordLogin);

    const handleLink = async () => {
        setError('');
        setBusy('link');
        try {
            await startSso('link');
        } catch (err) {
            setError(err instanceof Error ? err.message : t('common:states.error'));
            setBusy(null);
        }
    };

    const handleUnlink = async () => {
        if (!confirm(t('settings:signIn.confirmUnlink', { name: config?.oidc.name }))) return;
        setError('');
        setNotice('');
        setBusy('unlink');
        try {
            await api.unlinkSso();
            await load();
            setNotice(t('settings:signIn.unlinked'));
        } catch (err) {
            setError(err instanceof Error ? err.message : t('common:states.error'));
        } finally {
            setBusy(null);
        }
    };

    const handleLogoutEverywhere = async () => {
        if (!confirm(t('settings:signIn.confirmLogoutEverywhere'))) return;
        setError('');
        setBusy('logout');
        try {
            await logoutEverywhere();
        } catch (err) {
            setError(err instanceof Error ? err.message : t('common:states.error'));
            setBusy(null);
        }
    };

    return (
        <Card>
            <CardContent className="p-6">
                <div className="flex items-start gap-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-card bg-primary-soft text-primary">
                        <KeyRound className="h-5 w-5" />
                    </div>
                    <div className="flex-1 space-y-4">
                        <div>
                            <h3 className="text-caption font-semibold text-foreground">{t('settings:signIn.title')}</h3>
                            <p className="mt-1 text-micro text-muted-foreground">{t('settings:signIn.subtitle')}</p>
                        </div>

                        {error && (
                            <p className="flex items-center gap-1 text-micro text-destructive">
                                <AlertCircle className="h-4 w-4 shrink-0" />
                                {error}
                            </p>
                        )}
                        {notice && (
                            <p className="flex items-center gap-1 text-micro text-primary">
                                <CheckCircle className="h-4 w-4 shrink-0" />
                                {notice}
                            </p>
                        )}

                        {ssoOffered && state && (
                            <div className="space-y-2">
                                <p className="text-micro text-foreground">
                                    {state.ssoLinked
                                        ? t('settings:signIn.ssoLinked', { name: config?.oidc.name })
                                        : t('settings:signIn.ssoNotLinked', { name: config?.oidc.name })}
                                </p>
                                {state.ssoLinked ? (
                                    <>
                                        <Button variant="secondary" size="sm" disabled={!canUnlink || busy !== null} onClick={handleUnlink}>
                                            {busy === 'unlink' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                            {t('settings:signIn.unlink')}
                                        </Button>
                                        {!canUnlink && (
                                            <p className="text-micro text-muted-foreground">
                                                {config?.passwordLogin
                                                    ? t('settings:signIn.unlinkNeedsPassword')
                                                    : t('settings:signIn.unlinkPasswordOff')}
                                            </p>
                                        )}
                                        <p className="text-micro text-muted-foreground">{t('settings:signIn.relinkNote', { name: config?.oidc.name })}</p>
                                    </>
                                ) : (
                                    <Button variant="secondary" size="sm" disabled={busy !== null} onClick={handleLink}>
                                        {busy === 'link' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                        {t('settings:signIn.link', { name: config?.oidc.name })}
                                    </Button>
                                )}
                            </div>
                        )}

                        <div className="space-y-2 border-t border-border pt-4">
                            <p className="text-micro text-muted-foreground">{t('settings:signIn.logoutEverywhereDesc')}</p>
                            <Button variant="secondary" size="sm" disabled={busy !== null} onClick={handleLogoutEverywhere}>
                                {busy === 'logout' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LogOut className="mr-2 h-4 w-4" />}
                                {t('settings:signIn.logoutEverywhere')}
                            </Button>
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
};

export default SignInCard;
