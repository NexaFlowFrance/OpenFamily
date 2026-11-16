import React from 'react';
import { useTranslation } from 'react-i18next';
import { ALargeSmall, Check, Monitor, Moon, Palette, PanelBottom, PanelLeft, PanelRight, Sidebar, Square, Squircle, Sun, Type } from 'lucide-react';
import { Card, CardContent } from '../ui';
import { ACCENTS, useTheme, type Accent, type Corners, type NavStyle, type TextSize } from '../../contexts/ThemeContext';

type ThemeChoice = 'light' | 'dark' | 'system';
type Option<T extends string> = { value: T; label: string; icon: typeof Sun };

// The colour shown in each swatch: the accent as the light theme draws it.
const SWATCH: Record<Accent, string> = {
    coral: '#dc4a60',
    blue: '#2563eb',
    green: '#1f8a5b',
    violet: '#7c4dc4',
    orange: '#cc621e',
    slate: '#475569',
};

/**
 * How the app looks on this device: its theme and colour, the shape of its
 * corners, the size of its text, and where its sections are listed on a wide
 * screen. All of it is kept on the device, not on the account: a tablet on
 * the wall and a laptop need not agree.
 */
const AppearanceCard: React.FC = () => {
    const { t } = useTranslation('settings');
    const { theme, setTheme, navStyle, setNavStyle, accent, setAccent, corners, setCorners, textSize, setTextSize } = useTheme();

    const themes: Option<ThemeChoice>[] = [
        { value: 'light', label: t('appearance.themeLight'), icon: Sun },
        { value: 'dark', label: t('appearance.themeDark'), icon: Moon },
        { value: 'system', label: t('appearance.themeSystem'), icon: Monitor },
    ];
    const navigations: Option<NavStyle>[] = [
        { value: 'dock', label: t('appearance.navDock'), icon: PanelBottom },
        { value: 'dock-left', label: t('appearance.navDockLeft'), icon: PanelLeft },
        { value: 'dock-right', label: t('appearance.navDockRight'), icon: PanelRight },
        { value: 'sidebar', label: t('appearance.navSidebar'), icon: Sidebar },
    ];
    const cornerChoices: Option<Corners>[] = [
        { value: 'round', label: t('appearance.cornersRound'), icon: Squircle },
        { value: 'square', label: t('appearance.cornersSquare'), icon: Square },
    ];
    const textSizes: Option<TextSize>[] = [
        { value: 'normal', label: t('appearance.textNormal'), icon: Type },
        { value: 'large', label: t('appearance.textLarge'), icon: ALargeSmall },
    ];

    const choice = <T extends string>(label: string, current: T, options: Option<T>[], onChange: (value: T) => void) => (
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

                            <div role="radiogroup" aria-label={t('appearance.accent')}>
                                <p className="mb-1.5 text-micro font-medium text-muted-foreground">{t('appearance.accent')}</p>
                                <div className="flex flex-wrap gap-2">
                                    {ACCENTS.map((value) => {
                                        const active = value === accent;
                                        return (
                                            <button
                                                key={value}
                                                type="button"
                                                role="radio"
                                                aria-checked={active}
                                                aria-label={t(`appearance.accents.${value}`)}
                                                title={t(`appearance.accents.${value}`)}
                                                onClick={() => setAccent(value)}
                                                className={`flex h-9 w-9 items-center justify-center rounded-full text-white transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card ${
                                                    active ? 'ring-2 ring-foreground ring-offset-2 ring-offset-card' : ''
                                                }`}
                                                style={{ backgroundColor: SWATCH[value] }}
                                            >
                                                {active && <Check className="h-4 w-4" aria-hidden="true" />}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {choice(t('appearance.corners'), corners, cornerChoices, setCorners)}
                            {choice(t('appearance.text'), textSize, textSizes, setTextSize)}
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
