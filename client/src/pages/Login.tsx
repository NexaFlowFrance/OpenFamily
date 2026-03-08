import React, { useState } from 'react';
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
            setError(err.message || 'Une erreur est survenue');
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
                    <div className="mx-auto w-16 h-16 bg-nexus-blue rounded-2xl flex items-center justify-center mb-6 shadow-nexus-blue">
                        <Users className="w-8 h-8 text-white" />
                    </div>
                    <CardTitle className="text-3xl mb-3 text-nexus-blue">
                        OpenFamily
                    </CardTitle>
                    <p className="text-muted-foreground text-body-sm">
                        Le numérique au service du lien familial
                    </p>
                </CardHeader>

                <CardContent className="space-y-6 px-8 pb-8">
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
                &copy; {new Date().getFullYear()} OpenFamily Nexus &middot; Confiance & Sécurité
            </p>
        </div>
    );
};

export default Login;
