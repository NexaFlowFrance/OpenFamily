import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Users } from 'lucide-react';

const Login: React.FC = () => {
    const { t } = useTranslation();
    const { login, register } = useAuth();
    const registrationEnabled = import.meta.env.VITE_REGISTRATION_ENABLED !== 'false';
    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            if (isLogin) {
                await login(email, password);
            } else {
                await register(email, password, name);
            }
        } catch (err: any) {
            setError(err.message || t('common.error'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen grid lg:grid-cols-[1.1fr_1fr] bg-background relative overflow-hidden">
            {/* Hero side — Senegalese family mascots illustration */}
            <aside
                className="relative hidden lg:flex flex-col justify-end p-12 bg-cover bg-center"
                style={{ backgroundImage: "url('/images/family-bg.jpg')" }}
                aria-hidden="true"
            >
                {/* Indigo→safran tinted overlay for text contrast and brand cohesion */}
                <div className="absolute inset-0 bg-gradient-to-br from-primary/70 via-primary/30 to-accent/40" />
                <div className="relative z-10 max-w-lg text-white">
                    <h2 className="text-4xl font-bold leading-tight mb-4 drop-shadow-md">
                        {t('login.hero.line1')}
                        <br />
                        {t('login.hero.line2')}
                        <br />
                        {t('login.hero.line3')}
                    </h2>
                    <p className="text-lg text-white/90 drop-shadow">{t('login.hero.subtitle')}</p>
                </div>
            </aside>

            {/* Form side */}
            <div className="flex items-center justify-center p-4 sm:p-8 relative">
                {/* Mobile-only soft hero band evoking the same illustration vibe */}
                <div
                    className="absolute inset-x-0 top-0 h-40 lg:hidden bg-cover bg-center opacity-90"
                    style={{ backgroundImage: "url('/images/family-bg.jpg')" }}
                    aria-hidden="true"
                />
                <div
                    className="absolute inset-x-0 top-0 h-40 lg:hidden bg-gradient-to-b from-primary/40 via-background/60 to-background"
                    aria-hidden="true"
                />

                <Card
                    className="w-full max-w-md relative z-10 animate-accordion-down mt-24 lg:mt-0"
                    hover={false}
                >
                    <CardHeader className="text-center pb-8 pt-8">
                        <div className="mx-auto w-16 h-16 bg-primary rounded-2xl flex items-center justify-center mb-6 shadow-nexus-blue">
                            <Users className="w-8 h-8 text-primary-foreground" />
                        </div>
                        <CardTitle className="text-3xl mb-3 text-primary">KeurTonux</CardTitle>
                        <p className="text-muted-foreground text-body-sm">{t('login.tagline')}</p>
                    </CardHeader>

                    <CardContent className="space-y-6 px-8 pb-8">
                        <form onSubmit={handleSubmit} className="space-y-5">
                            {!isLogin && (
                                <div className="space-y-1.5">
                                    <Input
                                        label={t('login.name')}
                                        type="text"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        required={!isLogin}
                                        placeholder={t('login.name_placeholder')}
                                    />
                                </div>
                            )}

                            <div className="space-y-1.5">
                                <Input
                                    label={t('login.email')}
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                    placeholder={t('login.email_placeholder')}
                                />
                            </div>

                            <div className="space-y-1.5">
                                <Input
                                    label={t('login.password')}
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                    placeholder="••••••••"
                                />
                            </div>

                            {error && (
                                <div className="p-3 rounded-nexus bg-destructive/10 border border-destructive/20 animate-accordion-down">
                                    <p className="text-label-sm text-destructive font-medium text-center">
                                        {error}
                                    </p>
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
                                        {t('login.loading')}
                                    </span>
                                ) : isLogin ? (
                                    t('login.sign_in')
                                ) : (
                                    t('login.sign_up')
                                )}
                            </Button>
                        </form>

                        {registrationEnabled && (
                            <div className="mt-8 text-center pt-2 border-t border-border">
                                <button
                                    onClick={() => {
                                        setIsLogin(!isLogin);
                                        setError('');
                                    }}
                                    className="text-body-sm text-primary hover:text-primary/80 font-medium transition-colors hover:underline underline-offset-4"
                                >
                                    {isLogin
                                        ? t('login.switch_to_register')
                                        : t('login.switch_to_login')}
                                </button>
                            </div>
                        )}
                    </CardContent>
                </Card>

                <p className="absolute bottom-6 text-label-sm text-muted-foreground text-center w-full">
                    &copy; {new Date().getFullYear()} KeurTonux{' '}
                    <a
                        href="https://tonuxcorp.dev"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                    >
                        tonuxcorp
                    </a>{' '}
                    &middot; {t('login.footer_trust')}
                </p>
            </div>
        </div>
    );
};

export default Login;
