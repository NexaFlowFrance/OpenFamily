import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { ShoppingCart, CheckSquare, Calendar, Wallet, AlertCircle, Activity, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { useNavigate } from 'react-router-dom';

interface DashboardStats {
    upcomingAppointments: number;
    pendingTasks: number;
    shoppingItems: number;
    thisMonthExpenses: number;
    budgetAlerts: number;
}

const Dashboard: React.FC = () => {
    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    useEffect(() => {
        loadStats();
    }, []);

    const loadStats = async () => {
        try {
            const response = await api.get<{ success: boolean; data: DashboardStats }>('/api/dashboard');
            if (response.success) {
                setStats(response.data);
            }
        } catch (error) {
            console.error('Failed to load dashboard stats:', error);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="flex h-full items-center justify-center min-h-[50vh]">
                <div className="flex flex-col items-center gap-4">
                    <div className="spinner-brand" />
                    <p className="text-muted-foreground font-medium animate-pulse">Chargement de votre espace...</p>
                </div>
            </div>
        );
    }

    const statCards = [
        {
            title: 'Rendez-vous à venir',
            value: stats?.upcomingAppointments || 0,
            icon: Calendar,
            color: 'text-nexus-blue',
            bgColor: 'bg-blue-50',
            borderColor: 'border-blue-100',
            href: '/calendar',
        },
        {
            title: 'Tâches en attente',
            value: stats?.pendingTasks || 0,
            icon: CheckSquare,
            color: 'text-emerald-600',
            bgColor: 'bg-emerald-50',
            borderColor: 'border-emerald-100',
            href: '/tasks',
        },
        {
            title: 'Articles à acheter',
            value: stats?.shoppingItems || 0,
            icon: ShoppingCart,
            color: 'text-purple-600',
            bgColor: 'bg-purple-50',
            borderColor: 'border-purple-100',
            href: '/shopping',
        },
        {
            title: 'Dépenses du mois',
            value: `${Number(stats?.thisMonthExpenses || 0).toFixed(0)}€`,
            icon: Wallet,
            color: 'text-nexus-amber',
            bgColor: 'bg-orange-50',
            borderColor: 'border-orange-100',
            href: '/budget',
        },
    ];

    return (
        <div className="space-y-8 animate-accordion-down">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-h1 text-foreground mb-1">Bonjour ! 👋</h1>
                    <p className="text-muted-foreground text-body">Voici ce qu'il se passe dans votre famille aujourd'hui.</p>
                </div>
                <div className="flex gap-3">
                    <Button variant="secondary" size="sm" onClick={() => navigate('/calendar')}>
                        <Activity className="w-4 h-4 mr-2" />
                        Voir l'activité
                    </Button>
                </div>
            </div>

            {stats && stats.budgetAlerts > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-nexus p-4 flex items-start gap-4 shadow-nexus-sm animate-pulse">
                    <div className="p-2 bg-amber-100 rounded-full shrink-0">
                        <AlertCircle className="h-5 w-5 text-amber-600" />
                    </div>
                    <div className="flex-1">
                        <h3 className="font-semibold text-amber-900 text-body-sm">
                            Attention au budget
                        </h3>
                        <p className="text-sm text-amber-800 mt-1">
                            {stats.budgetAlerts} catégorie{stats.budgetAlerts > 1 ? 's ont' : ' a'} dépassé le
                            budget mensuel défini.
                        </p>
                    </div>
                    <Button
                        size="sm"
                        onClick={() => navigate('/budget')}
                        className="bg-amber-600 hover:bg-amber-700 text-white shrink-0 shadow-none border-0"
                    >
                        Voir détail
                    </Button>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {statCards.map((card) => {
                    const Icon = card.icon;
                    return (
                        <Card
                            key={card.title}
                            className={`border ${card.borderColor} bg-card group cursor-pointer`}
                            onClick={() => navigate(card.href)}
                        >
                            <CardContent className="p-6 flex items-start justify-between">
                                <div>
                                    <p className="text-label text-muted-foreground font-medium mb-1">{card.title}</p>
                                    <h3 className="text-3xl font-bold text-foreground tracking-tight group-hover:scale-105 transition-transform origin-left">
                                        {card.value}
                                    </h3>
                                </div>
                                <div className={`p-3 rounded-nexus ${card.bgColor} group-hover:rotate-6 transition-transform`}>
                                    <Icon className={`h-6 w-6 ${card.color}`} />
                                </div>
                            </CardContent>
                        </Card>
                    );
                })}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <Card className="lg:col-span-2 shadow-nexus border-none">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-xl">Aperçu rapide</CardTitle>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => navigate('/calendar')}
                            className="text-nexus-blue hover:text-nexus-blue/80 hover:bg-blue-50"
                        >
                            Voir tout <ChevronRight className="w-4 h-4 ml-1" />
                        </Button>
                    </CardHeader>
                    <CardContent>
                        <div className="relative overflow-hidden rounded-nexus bg-nexus-background p-6">
                            <div className="absolute top-0 right-0 w-64 h-64 bg-nexus-blue-light/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>

                            <h3 className="text-h2 mb-4 relative z-10">Bienvenue sur votre nouvel espace Nexus</h3>
                            <p className="text-muted-foreground mb-6 max-w-lg relative z-10 text-body-sm">
                                Nous avons repensé OpenFamily pour vous offrir une expérience plus claire, plus calme et plus efficace.
                                Profitez d'une gestion familiale simplifiée.
                            </p>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 relative z-10">
                                <div className="flex items-center gap-3 p-3 bg-card rounded-lg shadow-sm border border-border/50">
                                    <div className="w-2 h-2 rounded-full bg-nexus-blue"></div>
                                    <span className="text-body-sm font-medium">Design Neo-Soft</span>
                                </div>
                                <div className="flex items-center gap-3 p-3 bg-card rounded-lg shadow-sm border border-border/50">
                                    <div className="w-2 h-2 rounded-full bg-nexus-amber"></div>
                                    <span className="text-body-sm font-medium">Navigation intuitive</span>
                                </div>
                                <div className="flex items-center gap-3 p-3 bg-card rounded-lg shadow-sm border border-border/50">
                                    <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                                    <span className="text-body-sm font-medium">Performance accrue</span>
                                </div>
                                <div className="flex items-center gap-3 p-3 bg-card rounded-lg shadow-sm border border-border/50">
                                    <div className="w-2 h-2 rounded-full bg-purple-500"></div>
                                    <span className="text-body-sm font-medium">Sécurité renforcée</span>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="shadow-nexus border-none h-full">
                    <CardHeader>
                        <CardTitle className="text-xl">Démarrage rapide</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <button
                            type="button"
                            onClick={() => navigate('/family')}
                            className="w-full p-4 text-left bg-nexus-background rounded-nexus hover:bg-blue-50 transition-colors cursor-pointer group border border-transparent hover:border-blue-100"
                        >
                            <h3 className="font-semibold text-body-sm mb-1 group-hover:text-nexus-blue transition-colors flex items-center gap-2">
                                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-nexus-blue text-white text-[10px]">1</span>
                                Ajoutez votre famille
                            </h3>
                            <p className="text-label text-muted-foreground pl-7">
                                Créez des profils pour chaque membre
                            </p>
                        </button>
                        <button
                            type="button"
                            onClick={() => navigate('/meal-planning')}
                            className="w-full p-4 text-left bg-nexus-background rounded-nexus hover:bg-blue-50 transition-colors cursor-pointer group border border-transparent hover:border-blue-100"
                        >
                            <h3 className="font-semibold text-body-sm mb-1 group-hover:text-nexus-blue transition-colors flex items-center gap-2">
                                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-nexus-blue text-white text-[10px]">2</span>
                                Planifiez vos repas
                            </h3>
                            <p className="text-label text-muted-foreground pl-7">
                                Créez votre planning de la semaine
                            </p>
                        </button>
                        <button
                            type="button"
                            onClick={() => navigate('/budget')}
                            className="w-full p-4 text-left bg-nexus-background rounded-nexus hover:bg-blue-50 transition-colors cursor-pointer group border border-transparent hover:border-blue-100"
                        >
                            <h3 className="font-semibold text-body-sm mb-1 group-hover:text-nexus-blue transition-colors flex items-center gap-2">
                                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-nexus-blue text-white text-[10px]">3</span>
                                Suivez le budget
                            </h3>
                            <p className="text-label text-muted-foreground pl-7">
                                Définissez vos limites mensuelles
                            </p>
                        </button>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
};

export default Dashboard;
