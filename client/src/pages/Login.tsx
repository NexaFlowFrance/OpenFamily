import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Users } from 'lucide-react';


const Login: React.FC = () => {
    const { login, register } = useAuth();
    const registrationEnabled = import.meta.env.VITE_REGISTRATION_ENABLED !== 'false';
    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [inviteToken, setInviteToken] = useState<string | null>(null);

    // Detect invite token in URL — auto-switch to registration mode
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
                await register(email, password, name, inviteToken ?? undefined);
            }
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Une erreur est survenue');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-nexus-background p-4 relative overflow-hidden">
            {/* Background decorative elements */}
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
                <div className="absolute top-[-10%] left-[-5%] w-[500px] h-[500px] rounded-full bg-nexus-blue/10 blur-[100px]" />
                <div className="absolute bottom-[-10%] right-[-5%] w-[500px] h-[500px] rounded-full bg-nexus-blue-light/10 blur-[100px]" />
            </div>

            <Card className="w-full max-w-md relative z-10 animate-accordion-down" hover={false}>
                <CardHeader className="text-center pb-8 pt-8">
                    <div className="mx-auto mb-6">
                        <img src="/OpenFamily.png" alt="OpenFamily" className="w-20 h-20 object-contain mx-auto" />
                    </div>
                    <CardTitle className="text-3xl mb-3 text-nexus-blue">
                        OpenFamily
                    </CardTitle>
                    <p className="text-muted-foreground text-body-sm">
                        Le numérique au service du lien familial
                    </p>
                </CardHeader>

                <CardContent className="space-y-6 px-8 pb-8">
                    {/* Invite banner */}
                    {inviteToken && !isLogin && (
                        <div className="flex items-center gap-3 p-3 rounded-nexus bg-nexus-blue/10 border border-nexus-blue/20">
                            <Users className="w-5 h-5 text-nexus-blue shrink-0" />
                            <p className="text-label-sm text-nexus-blue font-medium">
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
