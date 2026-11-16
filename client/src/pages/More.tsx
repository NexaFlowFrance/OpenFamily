import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LogOut, MonitorPlay, Moon, Sun } from 'lucide-react';
import { Button } from '../components/ui';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { moreItems } from '../components/layout/navigation';

// Each section has a colour of its own, like the apps of a phone's home screen:
// the eye finds "Budget" by its green before it reads the word.
const TINTS: Record<string, string> = {
    '/posts': 'bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300',
    '/rewards': 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300',
    '/planning': 'bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300',
    '/recipes': 'bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300',
    '/meal-planning': 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300',
    '/pantry': 'bg-cyan-100 text-cyan-700 dark:bg-cyan-950/60 dark:text-cyan-300',
    '/budget': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
    '/family': 'bg-pink-100 text-pink-700 dark:bg-pink-950/60 dark:text-pink-300',
    '/integrations': 'bg-teal-100 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300',
    '/settings': 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
    '/kiosk': 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300',
};
const DEFAULT_TINT = 'bg-primary-soft text-primary';

/**
 * "More", the last tab of the phone's bottom bar: every section that has no
 * tab of its own, as a grid of icons, with the account, the theme and the way
 * out. It replaces the side menu on a phone, so nothing is listed twice.
 */
const More: React.FC = () => {
    const { t } = useTranslation(['nav', 'kiosk']);
    const { user, logout, isModuleEnabled } = useAuth();
    const { setTheme, actualTheme } = useTheme();

    const tiles = [
        ...moreItems()
            .filter((item) => !item.module || isModuleEnabled(item.module))
            .map((item) => ({ href: item.href, icon: item.icon, label: t(item.labelKey) })),
        // The wall display leaves the app's frame: it is a section all the same.
        ...(isModuleEnabled('kiosk') ? [{ href: '/kiosk', icon: MonitorPlay, label: t('kiosk:settings.title') }] : []),
    ];

    return (
        <div className="mx-auto max-w-3xl space-y-6">
            <div className="flex items-center gap-3 rounded-card border border-border bg-card p-4">
                {user?.avatar_url ? (
                    <img src={user.avatar_url} alt="" className="h-12 w-12 shrink-0 rounded-full object-cover" />
                ) : (
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary-soft text-body font-semibold text-primary">
                        {user?.name?.charAt(0) || 'U'}
                    </div>
                )}
                <div className="min-w-0 flex-1">
                    <p className="truncate text-body font-semibold text-foreground">{user?.name}</p>
                    <p className="truncate text-micro text-muted-foreground">{user?.email}</p>
                </div>
            </div>

            <nav aria-label={t('more.title')}>
                <ul className="grid grid-cols-3 gap-x-2 gap-y-5 sm:grid-cols-4 lg:grid-cols-6">
                    {tiles.map((tile) => {
                        const Icon = tile.icon;
                        return (
                            <li key={tile.href}>
                                <Link
                                    to={tile.href}
                                    className="group flex flex-col items-center gap-2 rounded-card px-1 py-1 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                >
                                    <span
                                        className={`flex h-16 w-16 items-center justify-center rounded-[1.25rem] shadow-surface transition-transform duration-fast ease-soft group-hover:scale-105 group-active:scale-95 ${TINTS[tile.href] ?? DEFAULT_TINT}`}
                                    >
                                        <Icon className="h-7 w-7" />
                                    </span>
                                    <span className="line-clamp-2 text-micro font-medium leading-tight text-foreground">{tile.label}</span>
                                </Link>
                            </li>
                        );
                    })}
                </ul>
            </nav>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Button variant="secondary" onClick={() => setTheme(actualTheme === 'dark' ? 'light' : 'dark')}>
                    {actualTheme === 'dark' ? <Sun className="mr-2 h-4 w-4" /> : <Moon className="mr-2 h-4 w-4" />}
                    {actualTheme === 'dark' ? t('more.lightTheme') : t('more.darkTheme')}
                </Button>
                <Button variant="ghost" onClick={logout} className="text-destructive hover:bg-destructive/10 hover:text-destructive">
                    <LogOut className="mr-2 h-4 w-4" />
                    {t('user.logout')}
                </Button>
            </div>
        </div>
    );
};

export default More;
