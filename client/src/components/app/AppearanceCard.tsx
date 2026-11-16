import React from 'react';
import { useTranslation } from 'react-i18next';
import { Monitor, Moon, Palette, PanelBottom, PanelLeft, Sun } from 'lucide-react';
import { Card, CardContent } from '../ui';
import { useTheme, type NavStyle } from '../../contexts/ThemeContext';

type ThemeChoice = 'light' | 'dark' | 'system';

/**
 * How the app looks on this device: its theme, and where its sections are
 * listed on a wide screen. Both are kept on the device, not on the account: a
 * tablet on the wall and a laptop need not agree.
 */
const AppearanceCard: React.FC = () => {
    const { t } = useTranslation('settings');
    const { theme, setTheme, navStyle, setNavStyle } = useTheme();

    const themes: Array<{ value: ThemeChoice; label: string; icon: typeof Sun }> = [
        { value: 'light', label: t('appearance.themeLight'), icon: Sun },
        { value: 'dark', label: t('appearance.themeDark'), icon: Moon },
        { value: 'system', label: t('appearance.themeSystem'), icon: Monitor },
    ];
    const navigations: Array<{ value: NavStyle; label: string; icon: typeof Sun }> = [
        { value: 'sidebar', label: t('appearance.navSidebar'), icon: PanelLeft },
        { value: 'dock', label: t('appearance.navDock'), icon: PanelBottom },
    ];

    const choice = <T extends string>(
        label: string,
        current: T,
        options: Array<{ value: T; label: string; icon: typeof Sun }>,
        onChange: (value: T) => void,
    ) => (
        <div role="radiogroup" aria-label={label}>
            <p className="mb-1.5 text-micro font-medium text-muted-foreground">{label}</p>
            <div className="inline-flex flex-wrap gap-1 rounded-input border border-border bg-surface-2 p-1">
                {options.map((option) => {
                    const Icon = option.icon;
                    const active = option.value === current;
                    return (
                        <button
                            key={option.value}
                            type="button"
                            role="radio"
                            aria-checked={active}
                            onClick={() => onChange(option.value)}
                            className={`flex items-center gap-1.5 rounded-input px-3 py-1.5 text-caption font-medium transition-colors ${
                                active ? 'bg-card text-foreground shadow-surface' : 'text-muted-foreground hover:text-foreground'
                            }`}
                        >
                            <Icon className="h-4 w-4" />
                            {option.label}
                        </button>
                    );
                })}
            </div>
        </div>
    );

    return (
        <Card>
            <CardContent className="p-6">
                <div className="flex items-start gap-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-card bg-primary-soft text-primary">
                        <Palette className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <h3 className="text-caption font-semibold text-foreground">{t('appearance.title')}</h3>
                        <p className="mt-1 text-micro text-muted-foreground">{t('appearance.subtitle')}</p>
                        <div className="mt-4 space-y-4">
                            {choice(t('appearance.theme'), theme, themes, setTheme)}
                            {choice(t('appearance.navigation'), navStyle, navigations, setNavStyle)}
                            <p className="text-micro text-muted-foreground">{t('appearance.navHint')}</p>
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
};

export default AppearanceCard;
