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
    Moon,
    Sun,
    LogOut,
    Menu,
    X,
    Plus,
    WifiOff,
    MessageSquare,
    MonitorPlay,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from '../ui/Button';
import { NotificationBell } from '../ui/NotificationBell';
import { DemoBanner } from '../app/DemoBanner';
import { MagicInputButton } from '../app/MagicInput';
import WelcomeSetup from '../app/WelcomeSetup';
import { NAVIGATION, MOBILE_TABS, MORE_TAB, isOnMobileTab, isRouteActive } from './navigation';

interface LayoutProps {
    children: ReactNode;
}

const quickActions: { labelKey: string; href: string; icon: typeof Home; module?: string }[] = [
    { labelKey: 'quickActions.addShopping', href: '/shopping', icon: ShoppingCart },
    { labelKey: 'quickActions.addTask', href: '/tasks', icon: CheckSquare },
    { labelKey: 'quickActions.addPost', href: '/posts', icon: MessageSquare },
    { labelKey: 'quickActions.addAppointment', href: '/calendar', icon: CalendarIcon },
    { labelKey: 'quickActions.addSchedule', href: '/planning', icon: CalendarDays, module: 'planning' },
    { labelKey: 'quickActions.addRecipe', href: '/recipes', icon: ChefHat, module: 'recipes' },
    { labelKey: 'quickActions.addMeal', href: '/meal-planning', icon: UtensilsCrossed, module: 'meals' },
    { labelKey: 'quickActions.addExpense', href: '/budget', icon: Wallet, module: 'budget' },
    { labelKey: 'quickActions.addMember', href: '/family', icon: Users },
];

const Layout: React.FC<LayoutProps> = ({ children }) => {
    const location = useLocation();
    const { t } = useTranslation('nav');
    const { user, logout, isModuleEnabled } = useAuth();
    const { setTheme, actualTheme, navStyle } = useTheme();
    // The bar of everyday sections on every width, and no menu down the side.
    // On a wide screen it sits where the person chose: bottom, left or right.
    // On a phone it is always at the bottom.
    const dock = navStyle !== 'sidebar';
    const dockSide = navStyle === 'dock-left' ? 'left' : navStyle === 'dock-right' ? 'right' : 'bottom';

    // Hide entries whose optional module the family has disabled.
    const visibleNavigation = NAVIGATION.filter((item) => !item.module || isModuleEnabled(item.module));
    // The phone's bottom bar: four everyday sections, then "More" for the rest.
    const mobileTabs = [...MOBILE_TABS, MORE_TAB];
    const onMobileTab = isOnMobileTab(location.pathname);
    const onMoreGrid = location.pathname === MORE_TAB.href;
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

    const currentPage = NAVIGATION.find((item) => isRouteActive(location.pathname, item.href));
    const pageTitle = currentPage
        ? t(currentPage.labelKey)
        : location.pathname === MORE_TAB.href ? t(MORE_TAB.labelKey) : t('pageTitleFallback');

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
                    'transform transition-transform duration-base ease-soft',
                    !dock && 'lg:translate-x-0',
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

            {/* Medium windows (a tablet held upright, the inner screen of a folding
                phone, half of a large screen in split view): too wide for a bottom
                bar, too narrow for the full sidebar. A rail keeps every section one
                tap away and leaves the width to the content. */}
            <nav
                aria-label={t('rail.label')}
                className={cn('fixed left-0 top-0 z-30 hidden h-full w-20 flex-col border-r border-border bg-card', !dock && 'md:flex lg:hidden')}
            >
                <Link to="/" className="flex h-16 shrink-0 items-center justify-center border-b border-border" aria-label="OpenFamily">
                    <img src={`${import.meta.env.BASE_URL}OpenFamily.png`} alt="" className="h-8 w-8 object-contain" />
                </Link>
                <div className="flex-1 space-y-1 overflow-y-auto px-2 py-3 scrollbar-hide">
                    {visibleNavigation.map((item) => {
                        const Icon = item.icon;
                        const active = isRouteActive(location.pathname, item.href);
                        return (
                            <Link
                                key={item.labelKey}
                                to={item.href}
                                className={cn(
                                    'flex flex-col items-center justify-center gap-1 rounded-input px-0.5 py-2',
                                    'transition-colors duration-fast ease-soft',
                                    active
                                        ? 'bg-primary-soft text-primary'
                                        : 'text-muted-foreground hover:bg-surface-2 hover:text-foreground'
                                )}
                            >
                                <Icon className="h-5 w-5 shrink-0" />
                                <span className="max-h-[2.4em] w-full overflow-hidden break-words text-center text-[9px] font-medium leading-tight tracking-tight">
                                    {t(item.labelKey)}
                                </span>
                            </Link>
                        );
                    })}
                </div>
            </nav>

            <div className={cn(!dock && 'md:pl-20 lg:pl-72', dock && dockSide === 'left' && 'md:pl-28', dock && dockSide === 'right' && 'md:pr-28')}>
                <DemoBanner />
                <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur-md">
                    {/* The page takes the width of the screen up to a limit past
                        which lines get too long to read: nothing is gained by
                        leaving half of a wide screen empty. */}
                    <div className="mx-auto flex h-16 w-full max-w-[1760px] items-center justify-between px-4 lg:px-8 2xl:px-10">
                        <div className="flex items-center gap-3">
                            <button
                                type="button"
                                onClick={() => {
                                    setQuickActionsOpen(false);
                                    setSidebarOpen(true);
                                }}
                                // On a phone the bottom bar's "More" holds the menu; this
                                // button is for the medium widths, next to the rail.
                                className={cn('hidden rounded-input p-2 text-muted-foreground hover:bg-surface-2', !dock && 'md:block lg:hidden')}
                                aria-label={t('user.openMenu')}
                            >
                                <Menu className="h-5 w-5" />
                            </button>
                            <h1 className="text-caption font-semibold text-foreground">
                                {pageTitle}
                            </h1>
                        </div>

                        <div className="flex items-center gap-2">
                            <MagicInputButton />
                            {/* One tap to the wall display, from any page */}
                            {isModuleEnabled('kiosk') && (
                                <Link
                                    to="/kiosk"
                                    aria-label={t('kiosk:settings.open')}
                                    title={t('kiosk:settings.open')}
                                    className="btn-nexus btn-secondary flex h-10 w-10 shrink-0 items-center justify-center"
                                >
                                    <MonitorPlay className="h-4 w-4" />
                                </Link>
                            )}
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

                <main className={cn('mx-auto w-full max-w-[1760px] px-4 pb-28 pt-6 lg:px-8 lg:pt-8 2xl:px-10', dock && dockSide === 'bottom' ? 'md:pb-32' : 'md:pb-10')}>
                    {isOffline && (
                        <div className="mb-4 flex items-center gap-2 rounded-card border border-amber-300 bg-amber-50 px-4 py-2.5 text-caption text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-400">
                            <WifiOff className="h-4 w-4 flex-shrink-0" />
                            {t('offline')}
                        </div>
                    )}
                    {children}
                </main>
            </div>

            {/* Nothing to add from the grid of sections: the button would only sit on its last row. */}
            {!onMoreGrid && (
                <button
                    type="button"
                    onClick={() => {
                        setSidebarOpen(false);
                        setQuickActionsOpen((open) => !open);
                    }}
                    className={cn(
                        'fixed bottom-24 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-surface-hover transition-all duration-fast ease-soft hover:bg-primary-hover active:scale-[0.98]',
                        // Beside the bar when it is on the right, never under it.
                        !dock ? 'md:bottom-6 lg:hidden' : dockSide === 'right' ? 'md:bottom-8 md:right-32' : 'md:bottom-8 md:right-8'
                    )}
                    aria-label={t('quickActions.title')}
                >
                    <Plus className="h-6 w-6" />
                </button>
            )}

            <div
                className={cn(
                    'fixed inset-x-4 bottom-44 z-50 rounded-card border border-border bg-card p-4 shadow-surface-hover md:inset-x-auto md:bottom-24 md:right-4 md:w-72',
                    'transition-all duration-base ease-soft',
                    !dock ? 'lg:hidden' : dockSide === 'right' ? 'md:bottom-28 md:right-32' : 'md:bottom-28 md:right-8',
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

            {/* On a phone, a bar across the bottom. On a wide screen the same
                bar floats where the person put it: along the bottom, or down
                the left or the right edge. */}
            <nav
                className={cn(
                    'fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 pb-safe backdrop-blur',
                    !dock && 'md:hidden',
                    dock && 'md:rounded-[1.4rem] md:border md:bg-card/95 md:pb-0 md:shadow-surface-hover',
                    dock && dockSide === 'bottom' && 'md:inset-x-auto md:bottom-5 md:left-1/2 md:w-[34rem] md:max-w-[calc(100vw-8rem)] md:-translate-x-1/2',
                    dock && dockSide === 'left' && 'md:inset-x-auto md:bottom-auto md:left-5 md:top-1/2 md:w-[5.5rem] md:-translate-y-1/2',
                    dock && dockSide === 'right' && 'md:inset-x-auto md:bottom-auto md:right-5 md:top-1/2 md:w-[5.5rem] md:-translate-y-1/2',
                )}
            >
                <div
                    className={cn(
                        'grid grid-cols-[repeat(var(--tabs),minmax(0,1fr))] gap-1 px-2 py-2',
                        dock && 'md:gap-1.5 md:p-2',
                        // Down an edge, the tabs are one above the other.
                        dock && dockSide !== 'bottom' && 'md:grid-cols-1',
                    )}
                    style={{ '--tabs': mobileTabs.length } as React.CSSProperties}
                >
                    {mobileTabs.map((item) => {
                        const Icon = item.icon;
                        // "More" is lit for every page reached through it.
                        const active = item.href === MORE_TAB.href ? !onMobileTab : isRouteActive(location.pathname, item.href);
                        return (
                            <Link
                                key={item.labelKey}
                                to={item.href}
                                aria-current={active ? 'page' : undefined}
                                className={cn(
                                    'flex flex-col items-center justify-center gap-1 rounded-input px-1 py-2',
                                    dock && 'md:rounded-[1rem] md:py-2.5',
                                    active
                                        ? 'bg-primary-soft text-primary'
                                        : 'text-muted-foreground hover:bg-surface-2 hover:text-foreground'
                                )}
                            >
                                <Icon className={cn('h-4 w-4 shrink-0', dock && 'md:h-5 md:w-5')} />
                                <span className={cn('text-[10px] font-medium leading-none whitespace-nowrap', dock && 'md:text-[11px]')}>{t(item.labelKey)}</span>
                            </Link>
                        );
                    })}
                </div>
            </nav>

            {/* Shown once, to whoever has just created a family. */}
            <WelcomeSetup />
        </div>
    );
};

export default Layout;
