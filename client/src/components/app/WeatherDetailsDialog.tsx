import React from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { format, type Locale } from 'date-fns';
import { useDateLocale } from '../../lib/dateLocale';
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
    Sunrise,
    Sunset,
    Thermometer,
    AlertCircle,
    Loader2,
} from 'lucide-react';
import { Dialog } from '../ui/Dialog';
import { useWeeklyForecast, type DailyForecastDTO } from '../../hooks/useDashboardWeather';
import type { ForecastDTO } from '../../hooks/useDashboardWeather';

// =============================================================================
// WeatherDetailsDialog
//
// Opens when the user clicks the weather tile on the dashboard. Shows:
//   - tomorrow's full breakdown (taken from the dashboard forecast already in
//     React Query cache so there's no duplicate request),
//   - the next 7 days as a compact list (lazy-loaded via /api/weather/forecast).
//
// Mirrors the override coords passed by the parent so a session-scoped
// geolocation toggle is honored here too.
// =============================================================================

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    tomorrow: ForecastDTO | null;
    cityLabel: string | null;
    override: { latitude: number; longitude: number } | null;
}

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

const formatHourFromIso = (iso: string | null, locale: Locale): string => {
    if (!iso) return '—';
    // Open-Meteo returns local-tz timestamps without a TZ suffix: parsing as
    // Date works for display purposes even though the offset is implicit.
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return format(d, 'HH:mm', { locale });
};

const formatDayLabel = (
    yyyymmdd: string,
    isFirst: boolean,
    t: TFunction,
    locale: Locale,
): string => {
    const d = new Date(`${yyyymmdd}T12:00:00`);
    if (Number.isNaN(d.getTime())) return yyyymmdd;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dayMidnight = new Date(d);
    dayMidnight.setHours(0, 0, 0, 0);
    const diffDays = Math.round((dayMidnight.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
    if (diffDays === 0) return t('weatherDetails.today');
    if (diffDays === 1) return t('weatherDetails.tomorrow');
    return format(d, isFirst ? 'EEEE dd MMMM' : 'EEEE dd MMM', { locale });
};

const WeatherDetailsDialog: React.FC<Props> = ({
    open,
    onOpenChange,
    tomorrow,
    cityLabel,
    override,
}) => {
    const { t } = useTranslation();
    // Only fetch when the dialog is open — saves an Open-Meteo call per page
    // load when the user never opens the modal.
    const weekly = useWeeklyForecast(override, { enabled: open, days: 7 });

    return (
        <Dialog
            open={open}
            onOpenChange={onOpenChange}
            title={t('weatherDetails.title')}
            description={
                cityLabel
                    ? t('weatherDetails.descriptionForCity', { city: cityLabel })
                    : t('weatherDetails.descriptionSaved')
            }
            className="sm:max-w-2xl"
        >
            <div className="space-y-6">
                {tomorrow && <TomorrowDetail forecast={tomorrow} />}

                <section>
                    <h3 className="text-caption font-semibold mb-3">
                        {t('weatherDetails.thisWeek')}
                    </h3>
                    {weekly.isPending ? (
                        <div className="flex items-center gap-2 py-6 text-caption text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            {t('weatherDetails.loadingWeek')}
                        </div>
                    ) : weekly.isError ? (
                        <p className="flex items-center gap-1 text-micro text-destructive">
                            <AlertCircle className="h-4 w-4" />
                            {weekly.error instanceof Error
                                ? weekly.error.message
                                : t('weatherDetails.forecastUnavailable')}
                        </p>
                    ) : (
                        <ul className="space-y-2">
                            {weekly.data?.days.map((day, i) => (
                                <WeeklyRow key={day.date} day={day} isFirst={i === 0} />
                            ))}
                        </ul>
                    )}
                </section>
            </div>
        </Dialog>
    );
};

const TomorrowDetail: React.FC<{ forecast: ForecastDTO }> = ({ forecast }) => {
    const { t } = useTranslation();
    const locale = useDateLocale();
    const Icon = weatherIconFor(forecast.weatherCode);
    return (
        <section className="rounded-card border border-border bg-info-soft p-4">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className="text-label text-muted-foreground">
                        {formatDayLabel(forecast.date, true, t, locale)}
                    </p>
                    <p className="text-h2 font-semibold text-foreground">{forecast.label}</p>
                </div>
                <Icon className="h-14 w-14 text-info shrink-0" />
            </div>
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-micro text-muted-foreground">
                <DetailMetric
                    icon={<Thermometer className="h-3.5 w-3.5" />}
                    label={t('weatherDetails.minMax')}
                    value={`${Math.round(forecast.tempMin)}° / ${Math.round(forecast.tempMax)}°C`}
                />
                <DetailMetric
                    icon={<Droplets className="h-3.5 w-3.5" />}
                    label={t('weatherDetails.rain')}
                    value={`${Math.round(forecast.precipitationProbability)}%`}
                    secondary={
                        forecast.precipitationMm > 0
                            ? `~${forecast.precipitationMm.toFixed(1)} mm`
                            : undefined
                    }
                />
                <DetailMetric
                    icon={<Wind className="h-3.5 w-3.5" />}
                    label={t('weatherDetails.wind')}
                    value={`${Math.round(forecast.windSpeedMax)} km/h`}
                />
                <DetailMetric
                    icon={<Cloud className="h-3.5 w-3.5" />}
                    label={t('weatherDetails.code')}
                    value={forecast.weatherCode.toString()}
                />
            </div>
        </section>
    );
};

const DetailMetric: React.FC<{
    icon: React.ReactNode;
    label: string;
    value: string;
    secondary?: string;
}> = ({ icon, label, value, secondary }) => (
    <div className="flex items-start gap-1.5">
        <span className="mt-0.5">{icon}</span>
        <div>
            <p className="text-foreground font-semibold">{value}</p>
            <p>{label}</p>
            {secondary && <p className="italic">{secondary}</p>}
        </div>
    </div>
);

const WeeklyRow: React.FC<{ day: DailyForecastDTO; isFirst: boolean }> = ({ day, isFirst }) => {
    const { t } = useTranslation();
    const locale = useDateLocale();
    const Icon = weatherIconFor(day.weatherCode);
    return (
        <li className="rounded-card border border-border bg-card p-3">
            <div className="flex items-center gap-3">
                <Icon className="h-7 w-7 text-info shrink-0" />
                <div className="flex-1 min-w-0">
                    <p className="text-caption font-semibold capitalize truncate">
                        {formatDayLabel(day.date, isFirst, t, locale)}
                    </p>
                    <p className="text-micro text-muted-foreground truncate">{day.label}</p>
                </div>
                <div className="text-right">
                    <p className="text-caption font-semibold">
                        {Math.round(day.tempMin)}° / {Math.round(day.tempMax)}°
                    </p>
                    <p className="text-micro text-muted-foreground flex items-center gap-2 justify-end">
                        <span className="flex items-center gap-0.5">
                            <Droplets className="h-3 w-3" />
                            {Math.round(day.precipitationProbability)}%
                        </span>
                        <span className="flex items-center gap-0.5">
                            <Wind className="h-3 w-3" />
                            {Math.round(day.windSpeedMax)}
                        </span>
                    </p>
                </div>
            </div>
            {(day.sunrise || day.sunset || day.uvIndexMax !== null) && (
                <div className="mt-2 flex flex-wrap gap-3 text-micro text-muted-foreground border-t border-border pt-2">
                    {day.sunrise && (
                        <span className="flex items-center gap-1">
                            <Sunrise className="h-3 w-3" />
                            {formatHourFromIso(day.sunrise, locale)}
                        </span>
                    )}
                    {day.sunset && (
                        <span className="flex items-center gap-1">
                            <Sunset className="h-3 w-3" />
                            {formatHourFromIso(day.sunset, locale)}
                        </span>
                    )}
                    {day.uvIndexMax !== null && (
                        <span>
                            {t('weatherDetails.uvMax')}&nbsp;: {day.uvIndexMax.toFixed(1)}
                        </span>
                    )}
                    {day.apparentTempMax !== day.tempMax && (
                        <span>
                            {t('weatherDetails.feelsLike')}&nbsp;: {Math.round(day.apparentTempMin)}
                            ° / {Math.round(day.apparentTempMax)}°
                        </span>
                    )}
                </div>
            )}
        </li>
    );
};

export default WeatherDetailsDialog;
