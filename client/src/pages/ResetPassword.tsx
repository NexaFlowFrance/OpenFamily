import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle, KeyRound } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { LanguageSwitcher } from '../components/ui/LanguageSwitcher';
import { api } from '../lib/api';

/**
 * Consumes a password-reset link (/reset-password?token=...). Rendered outside
 * the authenticated app: someone who lost their password is by definition
 * logged out. On success the user is sent back to the login screen.
 */
const ResetPassword: React.FC<{ onDone: () => void }> = ({ onDone }) => {
    const { t } = useTranslation(['auth', 'common']);
    const [token, setToken] = useState('');
    const [password, setPassword] = useState('');
    const [confirmation, setConfirmation] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [done, setDone] = useState(false);

    // The native shell uses HashRouter, so the token can arrive in either place.
    useEffect(() => {
        const fromSearch = new URLSearchParams(window.location.search).get('token');
        const hashQuery = window.location.hash.split('?')[1] ?? '';
        const fromHash = new URLSearchParams(hashQuery).get('token');
        setToken(fromSearch || fromHash || '');
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (password.length < 8) {
            setError(t('auth:reset.tooShort'));
            return;
        }
        if (password !== confirmation) {
            setError(t('auth:reset.mismatch'));
            return;
        }

        setLoading(true);
        try {
            await api.post('/api/auth/password/reset', { token, password });
            setDone(true);
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : '';
            setError(message === 'invalid_or_expired_token'
                ? t('auth:reset.invalidToken')
                : message || t('common:states.error'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4 relative">
            <LanguageSwitcher className="absolute top-4 left-4" />
            <Card className="w-full max-w-md" hover={false}>
                <CardHeader className="text-center pb-6 pt-8">
                    <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-soft text-primary">
                        {done ? <CheckCircle className="h-7 w-7" /> : <KeyRound className="h-7 w-7" />}
                    </div>
                    <CardTitle className="font-serif text-display mb-2">{t('auth:reset.title')}</CardTitle>
                    <p className="text-muted-foreground text-caption">
                        {done ? t('auth:reset.doneSubtitle') : t('auth:reset.subtitle')}
                    </p>
                </CardHeader>

                <CardContent className="space-y-6 px-8 pb-8">
                    {done ? (
                        <Button className="w-full h-12 text-body-sm font-semibold" size="lg" onClick={onDone}>
                            {t('auth:reset.backToLogin')}
                        </Button>
                    ) : !token ? (
                        <>
                            <div className="p-3 rounded-nexus bg-destructive/10 border border-destructive/20">
                                <p className="text-label-sm text-destructive font-medium text-center">
                                    {t('auth:reset.missingToken')}
                                </p>
                            </div>
                            <Button variant="secondary" className="w-full" onClick={onDone}>
                                {t('auth:reset.backToLogin')}
                            </Button>
                        </>
                    ) : (
                        <form onSubmit={handleSubmit} className="space-y-5">
                            <Input
                                label={t('auth:reset.newPassword')}
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                placeholder="••••••••"
                            />
                            <Input
                                label={t('auth:reset.confirmPassword')}
                                type="password"
                                value={confirmation}
                                onChange={(e) => setConfirmation(e.target.value)}
                                required
                                placeholder="••••••••"
                            />
                            <p className="text-micro text-muted-foreground">{t('auth:reset.hint')}</p>

                            {error && (
                                <div className="p-3 rounded-nexus bg-destructive/10 border border-destructive/20">
                                    <p className="text-label-sm text-destructive font-medium text-center">{error}</p>
                                </div>
                            )}

                            <Button
                                type="submit"
                                disabled={loading}
                                className="w-full h-12 text-body-sm font-semibold"
                                size="lg"
                            >
                                {loading ? t('common:states.loading') : t('auth:reset.submit')}
                            </Button>
                            <button
                                type="button"
                                onClick={onDone}
                                className="w-full text-body-sm text-nexus-blue hover:text-nexus-blue/80 font-medium transition-colors hover:underline underline-offset-4"
                            >
                                {t('auth:reset.backToLogin')}
                            </button>
                        </form>
                    )}
                </CardContent>
            </Card>
        </div>
    );
};

export default ResetPassword;
