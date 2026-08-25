import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { LanguageSwitcher } from '../components/ui/LanguageSwitcher';
import { Users, Sun, Moon, ArrowLeft } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';


const Login: React.FC = () => {
    const { t } = useTranslation(['auth', 'common', 'nav']);
    const { login, register } = useAuth();
    const { actualTheme, setTheme } = useTheme();
    const registrationEnabled = import.meta.env.VITE_REGISTRATION_ENABLED !== 'false';
    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [inviteToken, setInviteToken] = useState<string | null>(null);

    // "Forgot password" sub-form, shown in place of the credentials form.
    const [forgotMode, setForgotMode] = useState(false);
    const [forgotSent, setForgotSent] = useState(false);

    // Detect invite token in URL (both the plain ?invite= form and the hash route
    // used by the native shell); auto-switch to registration mode.
    useEffect(() => {
        const fromSearch = new URLSearchParams(window.location.search).get('invite');
        const hashQuery = window.location.hash.split('?')[1] ?? '';
        const fromHash = new URLSearchParams(hashQuery).get('invite');
        const invite = fromSearch || fromHash;
        if (invite) {
            setInviteToken(invite);
            setIsLogin(false);
        }
    }, []);

    const handleForgotSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            await api.post('/api/auth/password/forgot', { email });
            setForgotSent(true);
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : '';
            // The server says so explicitly when it has no mail relay: a
            // self-hosted install must tell the user to ask their administrator.
            setError(message === 'mail_not_configured'
                ? t('auth:forgot.mailNotConfigured')
                : message || t('common:states.error'));
        } finally {
            setLoading(false);
        }
    };

    const leaveForgotMode = () => {
        setForgotMode(false);
        setForgotSent(false);
        setError('');
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            if (isLogin) {
                await login(email, password);
            } else {
                // The account role is decided server-side: invited members get the role
                // chosen by the inviter; standalone accounts own their family (parent).
                await register(email, password, name, inviteToken ?? undefined);
            }
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : t('common:states.error'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4 relative">
            <LanguageSwitcher className="absolute top-4 left-4" />
            <button
                type="button"
                onClick={() => setTheme(actualTheme === 'dark' ? 'light' : 'dark')}
                aria-label={t('nav:user.toggleTheme')}
                className="absolute top-4 right-4 p-2 rounded-input border border-border bg-card text-muted-foreground hover:text-foreground hover:border-border-strong transition-colors"
            >
                {actualTheme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <Card className="w-full max-w-md" hover={false}>
                <CardHeader className="text-center pb-8 pt-8">
                    <div className="mx-auto mb-6">
                        <img src={`${import.meta.env.BASE_URL}OpenFamily.png`} alt="OpenFamily" className="w-16 h-16 rounded-xl object-contain mx-auto" />
                    </div>
                    <CardTitle className="font-serif text-display mb-2">
                        Open<span className="text-primary">Family</span>
                    </CardTitle>
                    <p className="text-muted-foreground text-caption">
                        {t('auth:tagline')}
                    </p>
                </CardHeader>

                <CardContent className="space-y-6 px-8 pb-8">
                    {/* Invite banner */}
                    {inviteToken && !isLogin && !forgotMode && (
                        <div className="flex items-center gap-3 p-3 rounded-input bg-primary-soft border border-border">
                            <Users className="w-5 h-5 text-primary shrink-0" />
                            <p className="text-label-sm text-primary font-medium">
                                {t('auth:invite.banner')}
                            </p>
                        </div>
                    )}

                    {forgotMode ? (
                        <div className="space-y-5">
                            {forgotSent ? (
                                <>
                                    <div className="p-3 rounded-input bg-primary-soft border border-border">
                                        <p className="text-label-sm text-primary font-medium text-center">
                                            {t('auth:forgot.sent')}
                                        </p>
                                    </div>
                                    <Button type="button" variant="secondary" className="w-full" onClick={leaveForgotMode}>
                                        <ArrowLeft className="w-4 h-4 mr-2" />
                                        {t('auth:forgot.backToLogin')}
                                    </Button>
                                </>
                            ) : (
                                <form onSubmit={handleForgotSubmit} className="space-y-5">
                                    <p className="text-body-sm text-muted-foreground text-center">
                                        {t('auth:forgot.desc')}
                                    </p>
                                    <Input
                                        label={t('auth:fields.email')}
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        required
                                        placeholder={t('auth:fields.emailPlaceholder')}
                                    />
                                    {error && (
                                        <div className="p-3 rounded-nexus bg-destructive/10 border border-destructive/20">
                                            <p className="text-label-sm text-destructive font-medium text-center">{error}</p>
                                        </div>
                                    )}
                                    <Button type="submit" disabled={loading} className="w-full h-12 text-body-sm font-semibold" size="lg">
                                        {loading ? t('common:states.loading') : t('auth:forgot.submit')}
                                    </Button>
                                    <button
                                        type="button"
                                        onClick={leaveForgotMode}
                                        className="w-full text-body-sm text-nexus-blue hover:text-nexus-blue/80 font-medium transition-colors hover:underline underline-offset-4"
                                    >
                                        {t('auth:forgot.backToLogin')}
                                    </button>
                                </form>
                            )}
                        </div>
                    ) : (
                    <>
                    <form onSubmit={handleSubmit} className="space-y-5">
                        {!isLogin && (
                            <div className="space-y-1.5">
                                <Input
                                    label={t('auth:fields.fullName')}
                                    type="text"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    required={!isLogin}
                                    placeholder={t('auth:fields.fullNamePlaceholder')}
                                />
                            </div>
                        )}

                        <div className="space-y-1.5">
                            <Input
                                label={t('auth:fields.email')}
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                placeholder={t('auth:fields.emailPlaceholder')}
                            />
                        </div>

                        <div className="space-y-1.5">
                            <Input
                                label={t('auth:fields.password')}
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                placeholder="••••••••"
                            />
                        </div>

                        {error && (
                            <div className="p-3 rounded-nexus bg-destructive/10 border border-destructive/20 animate-accordion-down">
                                <p className="text-label-sm text-destructive font-medium text-center">{error}</p>
                            </div>
                        )}

                        <Button
                            type="submit"
                            disabled={loading}
                            className="w-full h-12 text-body-sm font-semibold mt-2"
                            size="lg"
                        >
                            {loading ? (
                                <span className="flex items-center gap-2">
                                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    {t('common:states.loading')}
                                </span>
                            ) : isLogin ? (
                                t('auth:login.submit')
                            ) : (
                                t('auth:register.submit')
                            )}
                        </Button>
                    </form>

                    {isLogin && (
                        <div className="text-center">
                            <button
                                type="button"
                                onClick={() => {
                                    setForgotMode(true);
                                    setError('');
                                }}
                                className="text-body-sm text-muted-foreground hover:text-foreground font-medium transition-colors hover:underline underline-offset-4"
                            >
                                {t('auth:forgot.link')}
                            </button>
                        </div>
                    )}

                    {registrationEnabled && (
                        <div className="mt-8 text-center pt-2 border-t border-border">
                            <button
                                onClick={() => {
                                    setIsLogin(!isLogin);
                                    setError('');
                                }}
                                className="text-body-sm text-nexus-blue hover:text-nexus-blue/80 font-medium transition-colors hover:underline underline-offset-4"
                            >
                                {isLogin
                                    ? t('auth:login.noAccount')
                                    : t('auth:login.haveAccount')}
                            </button>
                        </div>
                    )}
                    </>
                    )}
                </CardContent>
            </Card>

            <p className="absolute bottom-6 text-label-sm text-muted-foreground text-center w-full">
                &copy; {new Date().getFullYear()} OpenFamily <a href="https://nexaflow.fr" target="_blank" rel="noopener noreferrer" className="text-nexus-blue hover:underline">NexaFlow</a> &middot; {t('auth:footer')}
            </p>
        </div>
    );
};

export default Login;
