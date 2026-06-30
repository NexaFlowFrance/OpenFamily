import React, { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
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
    Settings,
    Moon,
    Sun,
    LogOut,
    Menu,
    X,
    Plus,
    WifiOff,
    Plug,
    PiggyBank,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from '../ui/Button';
import { NotificationBell } from '../ui/NotificationBell';
import { DemoBanner } from '../app/DemoBanner';
import { MagicInputButton } from '../app/MagicInput';

interface LayoutProps {
    children: ReactNode;
}

// `module` ties a nav entry to an optional module key (see TOGGLEABLE_MODULES on
// the server). Entries without a `module` are always-on and can never be hidden.
const navigation: { labelKey: string; href: string; icon: typeof Home; module?: string }[] = [
    { labelKey: 'items.today', href: '/', icon: Home },
    { labelKey: 'items.shopping', href: '/shopping', icon: ShoppingCart },
    { labelKey: 'items.tasks', href: '/tasks', icon: CheckSquare },
    { labelKey: 'items.rewards', href: '/rewards', icon: PiggyBank, module: 'rewards' },
    { labelKey: 'items.calendar', href: '/calendar', icon: CalendarIcon },
    { labelKey: 'items.planning', href: '/planning', icon: CalendarDays, module: 'planning' },
    { labelKey: 'items.recipes', href: '/recipes', icon: ChefHat, module: 'recipes' },
    { labelKey: 'items.meals', href: '/meal-planning', icon: UtensilsCrossed, module: 'meals' },
    { labelKey: 'items.budget', href: '/budget', icon: Wallet, module: 'budget' },
    { labelKey: 'items.family', href: '/family', icon: Users },
    { labelKey: 'items.integrations', href: '/integrations', icon: Plug, module: 'integrations' },
    { labelKey: 'items.settings', href: '/settings', icon: Settings },
];

const mobileTabs: { labelKey: string; href: string; icon: typeof Home; module?: string }[] = [
    { labelKey: 'mobile.home', href: '/', icon: Home },
    { labelKey: 'mobile.planning', href: '/planning', icon: CalendarDays, module: 'planning' },
    { labelKey: 'mobile.lists', href: '/shopping', icon: ShoppingCart },
    { labelKey: 'mobile.budget', href: '/budget', icon: Wallet, module: 'budget' },
    { labelKey: 'mobile.family', href: '/family', icon: Users },
];

const quickActions: { labelKey: string; href: string; icon: typeof Home; module?: string }[] = [
    { labelKey: 'quickActions.addShopping', href: '/shopping', icon: ShoppingCart },
    { labelKey: 'quickActions.addTask', href: '/tasks', icon: CheckSquare },
    { labelKey: 'quickActions.addAppointment', href: '/calendar', icon: CalendarIcon },
    { labelKey: 'quickActions.addSchedule', href: '/planning', icon: CalendarDays, module: 'planning' },
    { labelKey: 'quickActions.addRecipe', href: '/recipes', icon: ChefHat, module: 'recipes' },
    { labelKey: 'quickActions.addMeal', href: '/meal-planning', icon: UtensilsCrossed, module: 'meals' },
    { labelKey: 'quickActions.addExpense', href: '/budget', icon: Wallet, module: 'budget' },
    { labelKey: 'quickActions.addMember', href: '/family', icon: Users },
];

const isRouteActive = (pathname: string, href: string) => {
    if (href === '/') {
        return pathname === '/';
    }
    return pathname === href || pathname.startsWith(`${href}/`);
};

const Layout: React.FC<LayoutProps> = ({ children }) => {
    const location = useLocation();
    const { t } = useTranslation('nav');
    const { user, logout, isModuleEnabled } = useAuth();
    const { setTheme, actualTheme } = useTheme();

    // Hide entries whose optional module the family has disabled.
    const visibleNavigation = navigation.filter((item) => !item.module || isModuleEnabled(item.module));
    const visibleMobileTabs = mobileTabs.filter((item) => !item.module || isModuleEnabled(item.module));
    const visibleQuickActions = quickActions.filter((item) => !item.module || isModuleEnabled(item.module));
    const [sidebarOpen, setSidebarOpen] = React.useState(false);
    const [quickActionsOpen, setQuickActionsOpen] = React.useState(false);
    const [isOffline, setIsOffline] = React.useState(!navigator.onLine);

    React.useEffect(() => {
        const goOnline = () => setIsOffline(false);
        const goOffline = () => setIsOffline(true);
        window.addEventListener('online', goOnline);
        window.addEventListener('offline', goOffline);
        return () => {
            window.removeEventListener('online', goOnline);
            window.removeEventListener('offline', goOffline);
        };
    }, []);

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
                            <img src={`${import.meta.env.BASE_URL}OpenFamily.png`} alt="OpenFamily" className="h-9 w-9 object-contain" />
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
                        {visibleNavigation.map((item) => {
                            const Icon = item.icon;
                            const active = isRouteActive(location.pathname, item.href);
                            return (
                                <Link
                                    key={item.labelKey}
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
                                    <span>{t(item.labelKey)}</span>
                                </Link>
                            );
                        })}
                    </nav>

                    <div className="border-t border-border bg-surface-2/60 p-4">
                        <div className="mb-4 flex items-center gap-3">
                            {user?.avatar_url ? (
                                <img
                                    src={user.avatar_url}
                                    alt={user?.name || t('user.profile')}
                                    className="h-10 w-10 shrink-0 rounded-full object-cover"
                                />
                            ) : (
                                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-soft text-primary text-body font-semibold">
                                    {user?.name?.charAt(0) || 'U'}
                                </div>
                            )}
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
                                aria-label={t('user.toggleTheme')}
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
                                aria-label={t('user.logout')}
                                className="flex-1 text-destructive hover:bg-destructive/10 hover:text-destructive"
                            >
                                <LogOut className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                </div>
            </aside>

            <div className="lg:pl-72">
                <DemoBanner />
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
                                aria-label={t('user.openMenu')}
                            >
                                <Menu className="h-5 w-5" />
                            </button>
                            <h1 className="text-caption font-semibold text-foreground">
                                {currentPage ? t(currentPage.labelKey) : t('pageTitleFallback')}
                            </h1>
                        </div>

                        <div className="flex items-center gap-2">
                            <MagicInputButton />
                            <NotificationBell />
                            <div className="hidden items-center gap-2 lg:flex">
                                <Button
                                    variant="secondary"
                                    size="icon"
                                    onClick={toggleTheme}
                                    aria-label={t('user.toggleTheme')}
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
                                    aria-label={t('user.logout')}
                                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                                >
                                    <LogOut className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    </div>
                </header>

                <main className="container max-w-[1200px] px-4 pb-28 pt-6 lg:px-6 lg:pb-10 lg:pt-8">
                    {isOffline && (
                        <div className="mb-4 flex items-center gap-2 rounded-card border border-amber-300 bg-amber-50 px-4 py-2.5 text-caption text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-400">
                            <WifiOff className="h-4 w-4 flex-shrink-0" />
                            {t('offline')}
                        </div>
                    )}
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
                aria-label={t('quickActions.title')}
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
                <p className="mb-3 text-caption font-semibold text-foreground">{t('quickActions.title')}</p>
                <div className="grid grid-cols-1 gap-2">
                    {visibleQuickActions.map((action) => {
                        const Icon = action.icon;
                        return (
                            <Link
                                key={action.labelKey}
                                to={action.href}
                                onClick={closeMenus}
                                className="flex items-center gap-2 rounded-input px-3 py-2 text-caption text-foreground hover:bg-surface-2"
                            >
                                <Icon className="h-4 w-4 text-primary" />
                                <span>{t(action.labelKey)}</span>
                            </Link>
                        );
                    })}
                </div>
            </div>

            <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 pb-safe backdrop-blur lg:hidden">
                <div
                    className="grid gap-1 px-2 py-2"
                    style={{ gridTemplateColumns: `repeat(${visibleMobileTabs.length}, minmax(0, 1fr))` }}
                >
                    {visibleMobileTabs.map((item) => {
                        const Icon = item.icon;
                        const active = isRouteActive(location.pathname, item.href);
                        return (
                            <Link
                                key={item.labelKey}
                                to={item.href}
                                className={cn(
                                    'flex flex-col items-center justify-center gap-1 rounded-input px-1 py-2',
                                    active
                                        ? 'bg-primary-soft text-primary'
                                        : 'text-muted-foreground hover:bg-surface-2 hover:text-foreground'
                                )}
                            >
                                <Icon className="h-4 w-4 shrink-0" />
                                <span className="text-[10px] font-medium leading-none whitespace-nowrap">{t(item.labelKey)}</span>
                            </Link>
                        );
                    })}
                </div>
            </nav>
        </div>
    );
};

export default Layout;
