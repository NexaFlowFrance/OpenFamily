import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
    Cloud,
    CloudDrizzle,
    CloudRain,
    CloudSnow,
    CloudSun,
    CloudLightning,
    Sun,
    Wind,
    Droplets,
    LocateFixed,
    MapPin,
    Sparkles,
    AlertCircle,
    RefreshCw,
} from 'lucide-react';
import { Card, CardContent, Button, useToast } from '../ui';
import { useAuth } from '../../contexts/AuthContext';
import {
    useDashboardWeather,
    type ClothingDegradedCode,
    type ClothingKidDTO,
    type ClothingSuggestionDTO,
    type ForecastDTO,
} from '../../hooks/useDashboardWeather';
import WeatherDetailsDialog from './WeatherDetailsDialog';

// =============================================================================
// WeatherClothingCard
//
// Dashboard widget showing tomorrow's forecast plus an AI-generated outfit
// per child. Lots of states are handled inline because the source data has
// many "partial success" paths (no city / no kids / AI off / weather down).
//
// Geolocation overrides are session-only: they live in this component's
// state and are passed to the hook, never persisted server-side. The user
// must use Settings to change the saved city.
// =============================================================================

const weatherIconFor = (code: number) => {
    if (code === 0 || code === 1) return Sun;
    if (code === 2) return CloudSun;
    if (code === 3 || code === 45 || code === 48) return Cloud;
    if (code >= 51 && code <= 57) return CloudDrizzle;
    if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return CloudRain;
    if ((code >= 71 && code <= 77) || code === 85 || code === 86) return CloudSnow;
    if (code >= 95) return CloudLightning;
    return Cloud;
};

const isClientLocationError = (msg: string): boolean => /NO_LOCATION|HTTP 4\d\d/i.test(msg);

const errorMessageFor = (msg: string, t: TFunction): { code?: 'NO_LOCATION'; text: string } => {
    if (/NO_LOCATION/i.test(msg)) {
        return { code: 'NO_LOCATION', text: t('weatherClothing.errorNoLocation') };
    }
    if (/CITY_NOT_FOUND/i.test(msg)) {
        return { text: t('weatherClothing.errorCityNotFound') };
    }
    if (/TIMEOUT/i.test(msg)) {
        return { text: t('weatherClothing.errorTimeout') };
    }
    return { text: t('weatherClothing.errorGeneric') };
};

const degradedLabelKey: Record<ClothingDegradedCode, string> = {
    DISABLED: 'weatherClothing.degradedDisabled',
    QUOTA_EXCEEDED: 'weatherClothing.degradedQuotaExceeded',
    BAD_JSON: 'weatherClothing.degradedBadJson',
};

const WeatherClothingCard: React.FC = () => {
    const { t } = useTranslation();
    const { user } = useAuth();
    const navigate = useNavigate();
    const { showToast } = useToast();
    const [override, setOverride] = useState<{ latitude: number; longitude: number } | null>(null);
    const [locating, setLocating] = useState(false);
    const [detailsOpen, setDetailsOpen] = useState(false);

    // Don't fire the request when we know up-front there's no city saved AND
    // no override — the empty state CTA is enough.
    const enabled =
        !!user && (override !== null || (user.latitude !== null && user.latitude !== undefined));

    const query = useDashboardWeather(override, { enabled });

    const requestGeolocation = () => {
        if (!('geolocation' in navigator)) {
            showToast({ title: t('weatherClothing.geoUnavailable') });
            return;
        }
        setLocating(true);
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                setOverride({
                    latitude: pos.coords.latitude,
                    longitude: pos.coords.longitude,
                });
                setLocating(false);
            },
            (err) => {
                setLocating(false);
                showToast({
                    title: t('weatherClothing.geoDeniedTitle'),
                    description:
                        err.code === err.PERMISSION_DENIED
                            ? t('weatherClothing.geoDeniedPermission')
                            : t('weatherClothing.geoDeniedOther'),
                });
            },
            { timeout: 10_000, maximumAge: 5 * 60_000 },
        );
    };

    const resetOverride = () => setOverride(null);

    // ------------------------------------------------------------------------
    // Empty state: no saved city.
    // ------------------------------------------------------------------------
    if (!enabled) {
        return (
            <EmptyShell
                icon={<MapPin className="h-5 w-5 text-primary" />}
                title={t('weatherClothing.emptyTitle')}
                description={t('weatherClothing.emptyDescription')}
                actionLabel={t('weatherClothing.configureCity')}
                onAction={() => navigate('/settings')}
            />
        );
    }

    // ------------------------------------------------------------------------
    // Loading skeleton.
    // ------------------------------------------------------------------------
    if (query.isPending) {
        return (
            <Card className="shadow-nexus border-none">
                <CardContent className="p-6">
                    <div className="animate-pulse space-y-4">
                        <div className="h-6 w-48 rounded bg-surface-2" />
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            <div className="h-32 rounded-card bg-surface-2" />
                            <div className="h-32 rounded-card bg-surface-2 lg:col-span-2" />
                        </div>
                    </div>
                </CardContent>
            </Card>
        );
    }

    // ------------------------------------------------------------------------
    // Error state.
    // ------------------------------------------------------------------------
    if (query.isError) {
        const msg = query.error instanceof Error ? query.error.message : '';
        const detail = errorMessageFor(msg, t);
        if (detail.code === 'NO_LOCATION') {
            return (
                <EmptyShell
                    icon={<MapPin className="h-5 w-5 text-primary" />}
                    title={t('weatherClothing.emptyTitle')}
                    description={t('weatherClothing.emptyDescriptionShort')}
                    actionLabel={t('weatherClothing.configureCity')}
                    onAction={() => navigate('/settings')}
                />
            );
        }
        return (
            <Card className="shadow-nexus border-none">
                <CardContent className="p-6">
                    <div className="flex items-start gap-3">
                        <AlertCircle className="mt-0.5 h-5 w-5 text-destructive shrink-0" />
                        <div className="flex-1">
                            <p className="text-caption font-semibold">
                                {t('weatherClothing.weatherUnavailableTitle')}
                            </p>
                            <p className="text-micro text-muted-foreground">{detail.text}</p>
                        </div>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => query.refetch()}
                            disabled={isClientLocationError(msg)}
                        >
                            <RefreshCw className="h-4 w-4 mr-1.5" />
                            {t('weatherClothing.retry')}
                        </Button>
                    </div>
                </CardContent>
            </Card>
        );
    }

    // ------------------------------------------------------------------------
    // Success: data available (kids might be empty / AI might be unavailable).
    // ------------------------------------------------------------------------
    const data = query.data!;
    return (
        <Card className="shadow-nexus border-none">
            <CardContent className="p-6 space-y-4">
                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                    <div>
                        <h2 className="text-h2 font-semibold flex items-center gap-2">
                            <Sparkles className="h-5 w-5 text-primary" />
                            {t('weatherClothing.tomorrowSchool')}
                        </h2>
                        <p className="text-micro text-muted-foreground flex items-center gap-1">
                            <MapPin className="h-3.5 w-3.5" />
                            {override
                                ? t('weatherClothing.currentPosition')
                                : (data.city ?? t('weatherClothing.savedCity'))}
                            {data.aiUnavailable && data.code && (
                                <span className="ml-2 italic">
                                    · {t(degradedLabelKey[data.code])}
                                </span>
                            )}
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        {override && (
                            <Button variant="ghost" size="sm" onClick={resetOverride}>
                                {t('weatherClothing.reset')}
                            </Button>
                        )}
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={requestGeolocation}
                            disabled={locating}
                        >
                            <LocateFixed className="h-4 w-4 mr-1.5" />
                            {locating
                                ? t('weatherClothing.locating')
                                : t('weatherClothing.myPosition')}
                        </Button>
                    </div>
                </div>

                {/* Body */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <WeatherTile forecast={data.weather} onClick={() => setDetailsOpen(true)} />

                    <div className="lg:col-span-2">
                        {data.kids.length === 0 ? (
                            <EmptyKidsHint onClick={() => navigate('/family')} />
                        ) : (
                            <KidsSuggestions
                                kids={data.kids}
                                suggestions={data.suggestions}
                                aiUnavailable={!!data.aiUnavailable}
                            />
                        )}
                    </div>
                </div>
            </CardContent>
            <WeatherDetailsDialog
                open={detailsOpen}
                onOpenChange={setDetailsOpen}
                tomorrow={data.weather}
                cityLabel={override ? t('weatherClothing.positionLabel') : data.city}
                override={override}
            />
        </Card>
    );
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const EmptyShell: React.FC<{
    icon: React.ReactNode;
    title: string;
    description: string;
    actionLabel: string;
    onAction: () => void;
}> = ({ icon, title, description, actionLabel, onAction }) => (
    <Card className="shadow-nexus border-none">
        <CardContent className="p-6 flex flex-col md:flex-row md:items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-card bg-primary-soft">
                {icon}
            </div>
            <div className="flex-1">
                <h3 className="text-caption font-semibold text-foreground">{title}</h3>
                <p className="mt-1 text-micro text-muted-foreground">{description}</p>
            </div>
            <Button onClick={onAction}>{actionLabel}</Button>
        </CardContent>
    </Card>
);

const WeatherTile: React.FC<{ forecast: ForecastDTO; onClick?: () => void }> = ({
    forecast,
    onClick,
}) => {
    const { t } = useTranslation();
    const Icon = weatherIconFor(forecast.weatherCode);
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={!onClick}
            className="text-left rounded-card border border-border bg-info-soft p-4 transition-all hover:shadow-surface hover:border-primary/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-default"
            aria-label={t('weatherClothing.viewWeekDetail')}
        >
            <div className="flex items-start justify-between">
                <div>
                    <p className="text-label text-muted-foreground flex items-center gap-1">
                        {t('weatherClothing.tomorrow')}
                        {onClick && (
                            <span className="text-[10px] italic text-primary/70">
                                · {t('weatherClothing.clickForWeek')}
                            </span>
                        )}
                    </p>
                    <p className="text-h2 font-semibold text-foreground">{forecast.label}</p>
                </div>
                <Icon className="h-12 w-12 text-info" />
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-micro text-muted-foreground">
                <div>
                    <p className="text-foreground font-semibold">
                        {Math.round(forecast.tempMin)}° / {Math.round(forecast.tempMax)}°C
                    </p>
                    <p>{t('weatherClothing.minMax')}</p>
                </div>
                <div className="flex items-start gap-1">
                    <Droplets className="h-3.5 w-3.5 mt-0.5" />
                    <div>
                        <p className="text-foreground font-semibold">
                            {Math.round(forecast.precipitationProbability)}%
                        </p>
                        <p>{t('weatherClothing.rain')}</p>
                    </div>
                </div>
                <div className="flex items-start gap-1">
                    <Wind className="h-3.5 w-3.5 mt-0.5" />
                    <div>
                        <p className="text-foreground font-semibold">
                            {Math.round(forecast.windSpeedMax)} km/h
                        </p>
                        <p>{t('weatherClothing.wind')}</p>
                    </div>
                </div>
            </div>
        </button>
    );
};

const EmptyKidsHint: React.FC<{ onClick: () => void }> = ({ onClick }) => {
    const { t } = useTranslation();
    return (
        <div className="flex h-full items-center justify-center rounded-card border border-dashed border-border bg-muted/20 p-4 text-center">
            <div>
                <p className="text-caption font-medium text-foreground">
                    {t('weatherClothing.addKidTitle')}
                </p>
                <p className="mt-1 text-micro text-muted-foreground">
                    {t('weatherClothing.addKidDescription')}
                </p>
                <Button variant="secondary" size="sm" className="mt-3" onClick={onClick}>
                    {t('weatherClothing.goToFamily')}
                </Button>
            </div>
        </div>
    );
};

const KidsSuggestions: React.FC<{
    kids: ClothingKidDTO[];
    suggestions: ClothingSuggestionDTO[];
    aiUnavailable: boolean;
}> = ({ kids, suggestions, aiUnavailable }) => {
    const { t } = useTranslation();
    const byKidId = useMemo(() => {
        const m = new Map<string, ClothingSuggestionDTO>();
        for (const s of suggestions) m.set(s.kidId, s);
        return m;
    }, [suggestions]);

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {kids.map((kid) => {
                const suggestion = byKidId.get(kid.id);
                return (
                    <div
                        key={kid.id}
                        className="rounded-card border border-border bg-card p-3 space-y-2"
                    >
                        <div className="flex items-center gap-2">
                            <span
                                className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                                style={{ background: kid.color }}
                            />
                            <p className="text-caption font-semibold truncate">{kid.name}</p>
                            <span className="text-micro text-muted-foreground">
                                {t('weatherClothing.ageYears', { count: kid.ageYears })}
                            </span>
                        </div>

                        {aiUnavailable || !suggestion ? (
                            <p className="text-micro italic text-muted-foreground">
                                {t('weatherClothing.noSuggestion')}
                            </p>
                        ) : (
                            <SuggestionPills suggestion={suggestion} />
                        )}
                    </div>
                );
            })}
        </div>
    );
};

const SuggestionPills: React.FC<{ suggestion: ClothingSuggestionDTO }> = ({ suggestion }) => {
    const { t } = useTranslation();
    const sections: Array<{ id: string; label: string; items: string[] }> = [
        { id: 'top', label: t('weatherClothing.sectionTop'), items: suggestion.top },
        { id: 'bottom', label: t('weatherClothing.sectionBottom'), items: suggestion.bottom },
        { id: 'footwear', label: t('weatherClothing.sectionFootwear'), items: suggestion.footwear },
        {
            id: 'accessories',
            label: t('weatherClothing.sectionAccessories'),
            items: suggestion.accessories,
        },
    ];

    return (
        <div className="space-y-1.5">
            {sections.map(({ id, label, items }) =>
                items.length === 0 ? null : (
                    <div key={id} className="flex flex-wrap items-center gap-1">
                        <span className="text-micro font-medium text-muted-foreground w-20 shrink-0">
                            {label}
                        </span>
                        {items.map((item) => (
                            <span
                                key={item}
                                className="rounded-pill bg-primary-soft px-2 py-0.5 text-micro text-primary"
                            >
                                {item}
                            </span>
                        ))}
                    </div>
                ),
            )}
            {suggestion.advice && (
                <p className="mt-2 text-micro italic text-muted-foreground border-l-2 border-primary/30 pl-2">
                    {suggestion.advice}
                </p>
            )}
        </div>
    );
};

export default WeatherClothingCard;
