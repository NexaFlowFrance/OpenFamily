import React, { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import {
    Home,
    ShoppingCart,
    CheckSquare,
    Calendar as CalendarIcon,
    CalendarDays,
    ChefHat,
    UtensilsCrossed,
    Wallet,
    Users,
    Moon,
    Sun,
    LogOut,
    Menu,
    X,
    Plus,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from '../ui/Button';

interface LayoutProps {
    children: ReactNode;
}

const navigation = [
    { name: 'Aujourd\'hui', href: '/', icon: Home },
    { name: 'Courses', href: '/shopping', icon: ShoppingCart },
    { name: 'Taches', href: '/tasks', icon: CheckSquare },
    { name: 'Rendez-vous', href: '/calendar', icon: CalendarIcon },
    { name: 'Planning', href: '/planning', icon: CalendarDays },
    { name: 'Recettes', href: '/recipes', icon: ChefHat },
    { name: 'Repas', href: '/meal-planning', icon: UtensilsCrossed },
    { name: 'Budget', href: '/budget', icon: Wallet },
    { name: 'Famille', href: '/family', icon: Users },
];

const mobileTabs = [
    { name: 'Home', href: '/', icon: Home },
    { name: 'Planning', href: '/planning', icon: CalendarDays },
    { name: 'Listes', href: '/shopping', icon: ShoppingCart },
    { name: 'Budget', href: '/budget', icon: Wallet },
    { name: 'Famille', href: '/family', icon: Users },
];

const quickActions = [
    { name: 'Ajouter une course', href: '/shopping', icon: ShoppingCart },
    { name: 'Ajouter une tache', href: '/tasks', icon: CheckSquare },
    { name: 'Ajouter un rendez-vous', href: '/calendar', icon: CalendarIcon },
    { name: 'Ajouter un horaire', href: '/planning', icon: CalendarDays },
    { name: 'Ajouter une recette', href: '/recipes', icon: ChefHat },
    { name: 'Ajouter un repas', href: '/meal-planning', icon: UtensilsCrossed },
    { name: 'Ajouter une depense', href: '/budget', icon: Wallet },
    { name: 'Ajouter un membre', href: '/family', icon: Users },
];

const isRouteActive = (pathname: string, href: string) => {
    if (href === '/') {
        return pathname === '/';
    }
    return pathname === href || pathname.startsWith(`${href}/`);
};

const Layout: React.FC<LayoutProps> = ({ children }) => {
    const location = useLocation();
    const { user, logout } = useAuth();
    const { setTheme, actualTheme } = useTheme();
    const [sidebarOpen, setSidebarOpen] = React.useState(false);
    const [quickActionsOpen, setQuickActionsOpen] = React.useState(false);

    const currentPage = navigation.find((item) => isRouteActive(location.pathname, item.href));

    const toggleTheme = () => {
        setTheme(actualTheme === 'dark' ? 'light' : 'dark');
    };

    const closeMenus = () => {
        setSidebarOpen(false);
        setQuickActionsOpen(false);
    };

    return (
        <div className="min-h-screen bg-background font-sans text-foreground">
            {(sidebarOpen || quickActionsOpen) && (
                <div
                    className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm lg:hidden"
                    onClick={closeMenus}
                />
            )}

            <aside
                className={cn(
                    'fixed left-0 top-0 z-50 h-full w-72 border-r border-border bg-card shadow-surface',
                    'transform transition-transform duration-base ease-soft lg:translate-x-0',
                    sidebarOpen ? 'translate-x-0' : '-translate-x-full'
                )}
            >
                <div className="flex h-full flex-col">
                    <div className="flex h-20 items-center justify-between border-b border-border px-6">
                        <Link to="/" className="flex items-center gap-3" onClick={closeMenus}>
                            <div className="flex h-9 w-9 items-center justify-center rounded-card bg-primary text-primary-foreground shadow-surface">
                                <Users className="h-5 w-5" />
                            </div>
                            <span className="text-lg font-semibold tracking-tight">OpenFamily</span>
                        </Link>
                        <button
                            type="button"
                            onClick={() => setSidebarOpen(false)}
                            className="rounded-input p-2 text-muted-foreground hover:bg-surface-2 lg:hidden"
                        >
                            <X className="h-5 w-5" />
                        </button>
                    </div>

                    <nav className="flex-1 space-y-1 overflow-y-auto px-4 py-6 scrollbar-hide">
                        {navigation.map((item) => {
                            const Icon = item.icon;
                            const active = isRouteActive(location.pathname, item.href);
                            return (
                                <Link
                                    key={item.name}
                                    to={item.href}
                                    onClick={closeMenus}
                                    className={cn(
                                        'group relative flex items-center gap-3 rounded-input px-4 py-3 text-caption font-medium',
                                        'transition-colors duration-fast ease-soft',
                                        active
                                            ? 'bg-primary-soft text-primary'
                                            : 'text-muted-foreground hover:bg-surface-2 hover:text-foreground'
                                    )}
                                >
                                    <Icon
                                        className={cn(
                                            'h-5 w-5 transition-transform duration-fast ease-soft group-hover:scale-105',
                                            active ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'
                                        )}
                                    />
                                    <span>{item.name}</span>
                                </Link>
                            );
                        })}
                    </nav>

                    <div className="border-t border-border bg-surface-2/60 p-4">
                        <div className="mb-4 flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-soft text-primary text-body font-semibold">
                                {user?.name?.charAt(0) || 'U'}
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-caption font-semibold text-foreground">{user?.name}</p>
                                <p className="truncate text-micro text-muted-foreground">{user?.email}</p>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <Button
                                variant="secondary"
                                size="icon"
                                onClick={toggleTheme}
                                aria-label="Changer le theme"
                                className="flex-1"
                            >
                                {actualTheme === 'dark' ? (
                                    <Sun className="h-4 w-4" />
                                ) : (
                                    <Moon className="h-4 w-4" />
                                )}
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={logout}
                                aria-label="Se deconnecter"
                                className="flex-1 text-destructive hover:bg-destructive/10 hover:text-destructive"
                            >
                                <LogOut className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                </div>
            </aside>

            <div className="lg:pl-72">
                <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur-md">
                    <div className="container flex h-16 max-w-[1200px] items-center justify-between px-4 lg:px-6">
                        <div className="flex items-center gap-3">
                            <button
                                type="button"
                                onClick={() => {
                                    setQuickActionsOpen(false);
                                    setSidebarOpen(true);
                                }}
                                className="rounded-input p-2 text-muted-foreground hover:bg-surface-2 lg:hidden"
                                aria-label="Ouvrir le menu"
                            >
                                <Menu className="h-5 w-5" />
                            </button>
                            <div>
                                <p className="text-micro uppercase tracking-[0.12em] text-muted-foreground">OpenFamily</p>
                                <h1 className="text-caption font-semibold text-foreground">
                                    {currentPage?.name || 'Tableau de bord'}
                                </h1>
                            </div>
                        </div>

                        <div className="hidden items-center gap-2 lg:flex">
                            <Button
                                variant="secondary"
                                size="icon"
                                onClick={toggleTheme}
                                aria-label="Changer le theme"
                            >
                                {actualTheme === 'dark' ? (
                                    <Sun className="h-4 w-4" />
                                ) : (
                                    <Moon className="h-4 w-4" />
                                )}
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={logout}
                                aria-label="Se deconnecter"
                                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                            >
                                <LogOut className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                </header>

                <main className="container max-w-[1200px] px-4 pb-28 pt-6 lg:px-6 lg:pb-10 lg:pt-8">
                    {children}
                </main>
            </div>

            <button
                type="button"
                onClick={() => {
                    setSidebarOpen(false);
                    setQuickActionsOpen((open) => !open);
                }}
                className="fixed bottom-24 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-surface-hover transition-all duration-fast ease-soft hover:bg-primary-hover active:scale-[0.98] lg:hidden"
                aria-label="Actions rapides"
            >
                <Plus className="h-6 w-6" />
            </button>

            <div
                className={cn(
                    'fixed inset-x-4 bottom-44 z-50 rounded-card border border-border bg-card p-4 shadow-surface-hover',
                    'transition-all duration-base ease-soft lg:hidden',
                    quickActionsOpen
                        ? 'pointer-events-auto translate-y-0 opacity-100'
                        : 'pointer-events-none translate-y-3 opacity-0'
                )}
            >
                <p className="mb-3 text-caption font-semibold text-foreground">Actions rapides</p>
                <div className="grid grid-cols-1 gap-2">
                    {quickActions.map((action) => {
                        const Icon = action.icon;
                        return (
                            <Link
                                key={action.name}
                                to={action.href}
                                onClick={closeMenus}
                                className="flex items-center gap-2 rounded-input px-3 py-2 text-caption text-foreground hover:bg-surface-2"
                            >
                                <Icon className="h-4 w-4 text-primary" />
                                <span>{action.name}</span>
                            </Link>
                        );
                    })}
                </div>
            </div>

            <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 pb-safe backdrop-blur lg:hidden">
                <div className="grid grid-cols-5 gap-1 px-2 py-2">
                    {mobileTabs.map((item) => {
                        const Icon = item.icon;
                        const active = isRouteActive(location.pathname, item.href);
                        return (
                            <Link
                                key={item.name}
                                to={item.href}
                                className={cn(
                                    'flex flex-col items-center justify-center gap-1 rounded-input px-2 py-2 text-micro font-medium',
                                    active
                                        ? 'bg-primary-soft text-primary'
                                        : 'text-muted-foreground hover:bg-surface-2 hover:text-foreground'
                                )}
                            >
                                <Icon className="h-4 w-4" />
                                <span>{item.name}</span>
                            </Link>
                        );
                    })}
                </div>
            </nav>
        </div>
    );
};

export default Layout;
