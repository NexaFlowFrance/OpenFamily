import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Users, User, Baby, Sun, Moon } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';


const Login: React.FC = () => {
    const { login, register } = useAuth();
    const { actualTheme, setTheme } = useTheme();
    const registrationEnabled = import.meta.env.VITE_REGISTRATION_ENABLED !== 'false';
    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [role, setRole] = useState<'parent' | 'enfant'>('parent');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [inviteToken, setInviteToken] = useState<string | null>(null);

    // Detect invite token in URL; auto-switch to registration mode
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const invite = params.get('invite');
        if (invite) {
            setInviteToken(invite);
            setIsLogin(false);
        }
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            if (isLogin) {
                await login(email, password);
            } else {
                await register(email, password, name, inviteToken ?? undefined, role);
            }
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Une erreur est survenue');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4 relative">
            <button
                type="button"
                onClick={() => setTheme(actualTheme === 'dark' ? 'light' : 'dark')}
                aria-label="Changer de thème"
                className="absolute top-4 right-4 p-2 rounded-input border border-border bg-card text-muted-foreground hover:text-foreground hover:border-border-strong transition-colors"
            >
                {actualTheme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <Card className="w-full max-w-md" hover={false}>
                <CardHeader className="text-center pb-8 pt-8">
                    <div className="mx-auto mb-6">
                        <img src="/OpenFamily.png" alt="OpenFamily" className="w-16 h-16 rounded-xl object-contain mx-auto" />
                    </div>
                    <CardTitle className="font-serif text-display mb-2">
                        Open<span className="text-primary">Family</span>
                    </CardTitle>
                    <p className="text-muted-foreground text-caption">
                        Le numérique au service du lien familial
                    </p>
                </CardHeader>

                <CardContent className="space-y-6 px-8 pb-8">
                    {/* Invite banner */}
                    {inviteToken && !isLogin && (
                        <div className="flex items-center gap-3 p-3 rounded-input bg-primary-soft border border-border">
                            <Users className="w-5 h-5 text-primary shrink-0" />
                            <p className="text-label-sm text-primary font-medium">
                                Vous avez été invité à rejoindre une famille ! Créez votre compte pour accepter l'invitation.
                            </p>
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-5">
                        {!isLogin && (
                            <div className="space-y-1.5">
                                <Input
                                    label="Nom complet"
                                    type="text"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    required={!isLogin}
                                    placeholder="Ex: Jean Dupont"
                                />
                            </div>
                        )}

                        {!isLogin && (
                            <div className="space-y-1.5">
                                <label className="text-label-sm font-medium text-foreground block">Rôle dans la famille</label>
                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setRole('parent')}
                                        className={`flex flex-col items-center gap-2 p-3 rounded-input border transition-colors ${
                                            role === 'parent'
                                                ? 'border-primary bg-primary-soft text-primary'
                                                : 'border-border text-muted-foreground hover:border-border-strong'
                                        }`}
                                    >
                                        <User className="w-5 h-5" />
                                        <span className="text-label-sm font-semibold">Parent</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setRole('enfant')}
                                        className={`flex flex-col items-center gap-2 p-3 rounded-input border transition-colors ${
                                            role === 'enfant'
                                                ? 'border-primary bg-primary-soft text-primary'
                                                : 'border-border text-muted-foreground hover:border-border-strong'
                                        }`}
                                    >
                                        <Baby className="w-5 h-5" />
                                        <span className="text-label-sm font-semibold">Enfant</span>
                                    </button>
                                </div>
                            </div>
                        )}

                        <div className="space-y-1.5">
                            <Input
                                label="Email"
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                placeholder="votre@email.com"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <Input
                                label="Mot de passe"
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
                                    Chargement...
                                </span>
                            ) : isLogin ? (
                                'Se connecter'
                            ) : (
                                "S'inscrire"
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
                                className="text-body-sm text-nexus-blue hover:text-nexus-blue/80 font-medium transition-colors hover:underline underline-offset-4"
                            >
                                {isLogin
                                    ? "Je n'ai pas de compte, m'inscrire"
                                    : 'J\'ai déjà un compte, me connecter'}
                            </button>
                        </div>
                    )}
                </CardContent>
            </Card>

            <p className="absolute bottom-6 text-label-sm text-muted-foreground text-center w-full">
                &copy; {new Date().getFullYear()} OpenFamily <a href="https://nexaflow.fr" target="_blank" rel="noopener noreferrer" className="text-nexus-blue hover:underline">NexaFlow</a> &middot; Confiance & Sécurité
            </p>
        </div>
    );
};

export default Login;
