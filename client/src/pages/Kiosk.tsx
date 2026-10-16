import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Calendar, MapPin } from 'lucide-react';
import { api } from '../lib/api';
import { useWebSocketUpdates } from '../hooks/useWebSocketUpdates';
import { cn } from '../lib/utils';

// OPENFAMILY_KIOSK_WEATHER_START

interface WeatherDay {
    date: string;
    weatherCode: number;
    temperatureMax: number;
    temperatureMin: number;
    apparentTemperatureMax: number;
    apparentTemperatureMin: number;
    precipitationProbability: number;
    precipitationSum: number;
    rainSum: number;
    snowfallSum: number;
    windSpeedMax: number;
    windGustMax: number;
    uvIndexMax: number;
    sunrise: string;
    sunset: string;
}

interface WeatherHour {
    time: string;
    temperature: number;
    precipitationProbability: number;
    precipitation: number;
    rain: number;
    weatherCode: number;
    windSpeed: number;
}

interface OpenMeteoResponse {
    daily?: {
        time?: string[];
        weather_code?: number[];
        temperature_2m_max?: number[];
        temperature_2m_min?: number[];
        apparent_temperature_max?: number[];
        apparent_temperature_min?: number[];
        precipitation_probability_max?: number[];
        precipitation_sum?: number[];
        rain_sum?: number[];
        snowfall_sum?: number[];
        wind_speed_10m_max?: number[];
        wind_gusts_10m_max?: number[];
        uv_index_max?: number[];
        sunrise?: string[];
        sunset?: string[];
    };
    hourly?: {
        time?: string[];
        temperature_2m?: number[];
        precipitation_probability?: number[];
        precipitation?: number[];
        rain?: number[];
        weather_code?: number[];
        wind_speed_10m?: number[];
    };
}

type ViewMode = 'week' | 'month';
type MonthDisplayMode = 'rolling' | 'calendar';

interface Member {
    id: string;
    name: string;
    color: string;
    role?: string;
}

interface Appointment {
    id: string;
    occurrence_id?: string;
    title: string;
    description?: string;
    notes?: string;
    color?: string;
    start_time: string;
    end_time?: string;
    location?: string;
    family_member_ids?: string[];
    family_members_data?: Member[];
    source_integration_id?: string;
    source_calendar_id?: string;
}

interface PlanningEntry {
    id: string;
    family_member_name: string;
    family_member_color: string;
    schedule_type: string;
    title: string;
    day_of_week: number;
    start_time: string;
    end_time: string;
    location?: string;
    specific_date?: string | null;
    excluded_dates?: string[];
    participants?: Member[];
    participant_ids?: string[];
}

type TimelineEntry =
    | {
        kind: 'appointment';
        key: string;
        startMinutes: number;
        endMinutes: number;
        appointment: Appointment;
    }
    | {
        kind: 'planning';
        key: string;
        startMinutes: number;
        endMinutes: number;
        planning: PlanningEntry;
    };

interface TimelineColumnEntry {
    entry: TimelineEntry;
    column: number;
}

interface TimelineGroup {
    entries: TimelineColumnEntry[];
    columns: number;
}

interface ApiResponse<T> {
    success: boolean;
    data: T;
}

interface TouchPoint {
    x: number;
    y: number;
}

const LOCALE = 'de-AT';
const DATA_REFRESH_MS = 30_000;
const PAGE_RELOAD_MS = 6 * 60 * 60 * 1000;
const SWIPE_THRESHOLD_PX = 60;

const pad = (value: number): string => String(value).padStart(2, '0');

const toDateKey = (date: Date): string =>
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const atMidnight = (date: Date): Date =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate());

const addDays = (date: Date, days: number): Date => {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
};

const mondayOfWeek = (date: Date): Date => {
    const result = atMidnight(date);
    result.setDate(result.getDate() - ((result.getDay() + 6) % 7));
    return result;
};

const isWeekend = (date: Date): boolean =>
    date.getDay() === 0 || date.getDay() === 6;

const isSameDay = (left: Date, right: Date): boolean =>
    toDateKey(left) === toDateKey(right);

const planningDayNumber = (date: Date): number =>
    ((date.getDay() + 6) % 7) + 1;

const isoWeekNumber = (date: Date): number => {
    const utcDate = new Date(Date.UTC(
        date.getFullYear(),
        date.getMonth(),
        date.getDate()
    ));
    const weekday = utcDate.getUTCDay() || 7;
    utcDate.setUTCDate(utcDate.getUTCDate() + 4 - weekday);
    const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));

    return Math.ceil(
        (((utcDate.getTime() - yearStart.getTime()) / 86_400_000) + 1) / 7
    );
};

const formatTime = (value: Date | string): string =>
    new Intl.DateTimeFormat(LOCALE, {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    }).format(typeof value === 'string' ? new Date(value) : value);

const formatCurrentDate = (date: Date): string =>
    new Intl.DateTimeFormat(LOCALE, {
        weekday: 'long',
        day: '2-digit',
        month: 'long',
        year: 'numeric',
    }).format(date);

const formatDayHeader = (date: Date): string => {
    const weekday = new Intl.DateTimeFormat(LOCALE, { weekday: 'short' })
        .format(date)
        .replace('.', '')
        .toUpperCase();

    return `${weekday} ${pad(date.getDate())}.${pad(date.getMonth() + 1)}`;
};

const formatRange = (start: Date, end: Date): string =>
    `${pad(start.getDate())}.${pad(start.getMonth() + 1)} – ` +
    `${pad(end.getDate())}.${pad(end.getMonth() + 1)}.${end.getFullYear()}`;

const WEATHER_REFRESH_MS = 60 * 60 * 1000;
const WEATHER_CACHE_KEY = 'openfamily-kiosk-weather-v3';

const WEATHER_URL =
    'https://api.open-meteo.com/v1/forecast' +
    '?latitude=48.18333' +
    '&longitude=15.81667' +
    '&daily=weather_code,temperature_2m_max,temperature_2m_min,' +
    'apparent_temperature_max,apparent_temperature_min,' +
    'precipitation_probability_max,precipitation_sum,rain_sum,' +
    'snowfall_sum,wind_speed_10m_max,wind_gusts_10m_max,' +
    'uv_index_max,sunrise,sunset' +
    '&hourly=temperature_2m,precipitation_probability,precipitation,' +
    'rain,weather_code,wind_speed_10m' +
    '&timezone=Europe%2FVienna' +
    '&forecast_days=14' +
    '&temperature_unit=celsius' +
    '&wind_speed_unit=kmh' +
    '&precipitation_unit=mm';

const weatherSymbol = (code: number): string => {
    if (code === 0) return '☀️';
    if (code === 1 || code === 2) return '🌤️';
    if (code === 3) return '☁️';
    if (code === 45 || code === 48) return '🌫️';
    if (code >= 51 && code <= 57) return '🌦️';
    if (code >= 61 && code <= 67) return '🌧️';
    if (code >= 71 && code <= 77) return '🌨️';
    if (code >= 80 && code <= 82) return '🌦️';
    if (code >= 85 && code <= 86) return '🌨️';
    if (code >= 95) return '⛈️';
    return '🌤️';
};

const formatWeatherDay = (
    dateString: string,
    index: number
): string => {
    if (index === 0) return 'HEUTE';

    return new Intl.DateTimeFormat(LOCALE, {
        weekday: 'short',
        day: '2-digit',
        month: '2-digit',
    })
        .format(new Date(`${dateString}T12:00:00`))
        .replace('.', '')
        .toUpperCase();
};

// OPENFAMILY_KIOSK_WEATHER_CONTRAST_V2
const rainCellClass = (hour: WeatherHour): string => {
    const probability = hour.precipitationProbability;
    const amount = Math.max(hour.rain, hour.precipitation);

    if (amount >= 2 || probability >= 80) {
        return 'border-sky-800 bg-sky-300 !text-slate-950 shadow-sm';
    }
    if (amount >= 0.5 || probability >= 60) {
        return 'border-sky-700 bg-sky-200 !text-slate-950';
    }
    if (amount > 0 || probability >= 30) {
        return 'border-sky-600 bg-sky-100 !text-slate-950';
    }
    if (probability >= 15) {
        return 'border-sky-500 bg-sky-50 !text-slate-900';
    }
    return 'border-border/70 bg-background/70 !text-foreground';
};

const clockValueToMinutes = (value: string): number => {
    const time = value.includes('T') ? value.slice(11, 16) : value.slice(0, 5);
    const [hours, minutes] = time.split(':').map(Number);
    return (Number.isFinite(hours) ? hours : 0) * 60 +
        (Number.isFinite(minutes) ? minutes : 0);
};

const buildTimelineGroups = (
    dayKey: string,
    appointments: Appointment[],
    planning: PlanningEntry[]
): TimelineGroup[] => {
    const entries: TimelineEntry[] = [
        ...appointments.map((appointment) => {
            const startMinutes = clockValueToMinutes(appointment.start_time);
            const rawEnd = appointment.end_time
                ? clockValueToMinutes(appointment.end_time)
                : startMinutes + 30;
            return {
                kind: 'appointment' as const,
                key: appointment.occurrence_id || appointment.id,
                startMinutes,
                endMinutes: rawEnd > startMinutes ? rawEnd : startMinutes + 30,
                appointment,
            };
        }),
        ...planning.map((entry) => {
            const startMinutes = clockValueToMinutes(entry.start_time);
            const rawEnd = clockValueToMinutes(entry.end_time);
            return {
                kind: 'planning' as const,
                key: `planning-${dayKey}-${entry.id}`,
                startMinutes,
                endMinutes: rawEnd > startMinutes ? rawEnd : startMinutes + 30,
                planning: entry,
            };
        }),
    ].sort((left, right) =>
        left.startMinutes - right.startMinutes ||
        left.endMinutes - right.endMinutes ||
        left.key.localeCompare(right.key)
    );

    // OPENFAMILY_TAGDIENST_FULL_ROW
    const titleOf = (entry: TimelineEntry): string =>
        entry.kind === 'appointment'
            ? entry.appointment.title
            : entry.planning.title;

    // Tagdienst blockiert weiterhin den Zeitraum, soll aber nicht alle anderen
    // Termine des Tages in schmale Spalten zwingen. Er bekommt eine eigene,
    // volle Zeile und die restlichen Eintraege werden separat gruppiert.
    const isFullRowEntry = (entry: TimelineEntry): boolean =>
        titleOf(entry).trim().toLocaleLowerCase('de-AT') === 'tagdienst';

    const grouped: TimelineEntry[][] = [];
    let activeGroup: TimelineEntry[] = [];
    let activeEnd = -1;

    const flushActiveGroup = (): void => {
        if (activeGroup.length === 0) return;
        grouped.push(activeGroup);
        activeGroup = [];
        activeEnd = -1;
    };

    entries.forEach((entry) => {
        if (isFullRowEntry(entry)) {
            flushActiveGroup();
            grouped.push([entry]);
            return;
        }

        if (activeGroup.length === 0 || entry.startMinutes < activeEnd) {
            activeGroup.push(entry);
            activeEnd = Math.max(activeEnd, entry.endMinutes);
            return;
        }

        flushActiveGroup();
        activeGroup = [entry];
        activeEnd = entry.endMinutes;
    });
    flushActiveGroup();

    return grouped.map((groupEntries) => {
        if (groupEntries.length === 1 && isFullRowEntry(groupEntries[0])) {
            return {
                entries: [{ entry: groupEntries[0], column: 0 }],
                columns: 1,
            };
        }

        const columnEnds: number[] = [];
        const positioned = groupEntries.map((entry) => {
            let column = columnEnds.findIndex(
                (end) => entry.startMinutes >= end
            );
            if (column < 0) {
                column = columnEnds.length;
                columnEnds.push(entry.endMinutes);
            } else {
                columnEnds[column] = entry.endMinutes;
            }
            return { entry, column };
        });
        return {
            entries: positioned,
            columns: Math.max(1, columnEnds.length),
        };
    });
};

const Kiosk: React.FC = () => {
    const [now, setNow] = useState<Date>(() => new Date());
    const [weekOffset, setWeekOffset] = useState<number>(0);
    const [viewMode, setViewMode] = useState<ViewMode>('week');
    const [monthOffset, setMonthOffset] = useState<number>(0);
    const [monthDisplayMode, setMonthDisplayMode] = useState<MonthDisplayMode>('rolling');
    const [appointments, setAppointments] = useState<Appointment[]>([]);
    // OPENFAMILY_KIOSK_FAMILY_LEGEND_DOTS
    const [familyMembers, setFamilyMembers] = useState<Member[]>([]);
    const [planningByWeek, setPlanningByWeek] = useState<
        Record<string, PlanningEntry[]>
    >({});
    const [loading, setLoading] = useState<boolean>(true);
    const [selectedAppointment, setSelectedAppointment] =
        useState<Appointment | null>(null);
    const [weatherDetailsOpen, setWeatherDetailsOpen] =
        useState<boolean>(false);
    const touchStart = useRef<TouchPoint | null>(null);
    const lastTapRef = useRef<number>(0);

    useEffect(() => {
        let cancelled = false;

        const loadFamilyMembers = async (): Promise<void> => {
            try {
                const response = await api.get<ApiResponse<Member[]>>('/api/family');
                if (!cancelled && Array.isArray(response.data)) {
                    setFamilyMembers(
                        response.data
                            .filter((member) => member?.id && member?.name)
                            .map((member) => ({
                                id: String(member.id),
                                name: String(member.name),
                                color: String(member.color || '#64748B'),
                                role: member.role,
                            }))
                    );
                }
            } catch (error) {
                console.error('Kiosk family legend could not be loaded:', error);
            }
        };

        void loadFamilyMembers();

        return () => {
            cancelled = true;
        };
    }, []);

    const todayKey = toDateKey(now);

    const today = useMemo<Date>(() => {
        const [year, month, day] = todayKey.split('-').map(Number);
        return new Date(year, month - 1, day);
    }, [todayKey]);

    const selectedMonday = useMemo<Date>(
        () => addDays(mondayOfWeek(today), weekOffset * 7),
        [today, weekOffset]
    );

    const displayedWeekStart = useMemo<Date>(() => {
        if (weekOffset === 0 && isWeekend(today)) {
            return today;
        }
        return selectedMonday;
    }, [weekOffset, today, selectedMonday]);

    const displayedWeekEnd = useMemo<Date>(
        () => addDays(displayedWeekStart, 6),
        [displayedWeekStart]
    );

    const monthPreviewStart = useMemo<Date>(() => {
        if (monthDisplayMode === 'rolling') {
            return today;
        }
        return new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
    }, [today, monthOffset, monthDisplayMode]);

    const monthPreviewEnd = useMemo<Date>(() => {
        if (monthDisplayMode === 'rolling') {
            return addDays(monthPreviewStart, 30);
        }
        return new Date(
            monthPreviewStart.getFullYear(),
            monthPreviewStart.getMonth() + 1,
            0
        );
    }, [monthPreviewStart, monthDisplayMode]);

    const monthPreviewDayCount = monthDisplayMode === 'rolling'
        ? 31
        : monthPreviewEnd.getDate();

    const queryStart = useMemo<Date>(() => {
        if (viewMode === 'month') {
            return monthPreviewStart;
        }
        return displayedWeekStart;
    }, [viewMode, monthPreviewStart, displayedWeekStart]);

    const queryEnd = useMemo<Date>(() => {
        if (viewMode === 'month') {
            return monthPreviewEnd;
        }
        return displayedWeekEnd;
    }, [viewMode, monthPreviewEnd, displayedWeekEnd]);

    const loadCalendarData = useCallback(async (): Promise<void> => {
        setLoading(true);

        try {
            const cacheBuster = Date.now();
            const start = `${toDateKey(queryStart)}T00:00:00`;
            const end = `${toDateKey(queryEnd)}T23:59:59`;

            const mondays: Date[] = [];
            let cursor = mondayOfWeek(queryStart);
            const finalMonday = mondayOfWeek(queryEnd);

            while (cursor.getTime() <= finalMonday.getTime()) {
                mondays.push(new Date(cursor));
                cursor = addDays(cursor, 7);
            }

            const [appointmentResponse, planningResponses] = await Promise.all([
                api.get<ApiResponse<Appointment[]>>(
                    `/api/appointments?start_date=${encodeURIComponent(start)}` +
                    `&end_date=${encodeURIComponent(end)}&_=${cacheBuster}`
                ),
                Promise.all(
                    mondays.map(async (monday) => {
                        const weekKey = toDateKey(monday);
                        const response = await api.get<ApiResponse<PlanningEntry[]>>(
                            `/api/planning?week_start=${encodeURIComponent(weekKey)}` +
                            `&_=${cacheBuster}`
                        );
                        return {
                            weekKey,
                            entries: response.success ? response.data : [],
                        };
                    })
                ),
            ]);

            if (appointmentResponse.success) {
                setAppointments(appointmentResponse.data);
            }

            const nextPlanningByWeek: Record<string, PlanningEntry[]> = {};
            planningResponses.forEach(({ weekKey, entries }) => {
                nextPlanningByWeek[weekKey] = entries;
            });
            setPlanningByWeek(nextPlanningByWeek);
        } catch (error) {
            console.error('Kiosk calendar load error:', error);
        } finally {
            setLoading(false);
        }
    }, [queryStart, queryEnd]);

    useEffect(() => {
        void loadCalendarData();
        const refreshId = window.setInterval(
            () => void loadCalendarData(),
            DATA_REFRESH_MS
        );
        return () => window.clearInterval(refreshId);
    }, [loadCalendarData]);

    useEffect(() => {
        const clockId = window.setInterval(() => setNow(new Date()), 15_000);
        return () => window.clearInterval(clockId);
    }, []);

    useEffect(() => {
        const reloadId = window.setInterval(
            () => window.location.reload(),
            PAGE_RELOAD_MS
        );
        return () => window.clearInterval(reloadId);
    }, []);

    useEffect(() => {
        const enterFullscreen = (): void => {
            if (!document.fullscreenElement) {
                void document.documentElement.requestFullscreen().catch(() => undefined);
            }
        };

        enterFullscreen();
        document.addEventListener('pointerdown', enterFullscreen, {
            once: true,
            passive: true,
        });
        document.addEventListener('touchstart', enterFullscreen, {
            once: true,
            passive: true,
        });
        document.addEventListener('keydown', enterFullscreen, { once: true });

        return () => {
            document.removeEventListener('pointerdown', enterFullscreen);
            document.removeEventListener('touchstart', enterFullscreen);
            document.removeEventListener('keydown', enterFullscreen);
        };
    }, []);

    useWebSocketUpdates('appointments', () => void loadCalendarData());
    useWebSocketUpdates('planning', () => void loadCalendarData());

    const appointmentsByDay = useMemo<Map<string, Appointment[]>>(() => {
        const grouped = new Map<string, Appointment[]>();

        appointments.forEach((appointment) => {
            const key = appointment.start_time.slice(0, 10);
            grouped.set(key, [...(grouped.get(key) ?? []), appointment]);
        });

        grouped.forEach((entries) => {
            entries.sort((left, right) =>
                left.start_time.localeCompare(right.start_time)
            );
        });

        return grouped;
    }, [appointments]);

    const getPlanningForDay = (day: Date): PlanningEntry[] => {
        const dayKey = toDateKey(day);
        const weekKey = toDateKey(mondayOfWeek(day));
        const weekPlanning = planningByWeek[weekKey] ?? [];

        return weekPlanning
            .filter((entry) => {
                if ((entry.excluded_dates ?? []).includes(dayKey)) {
                    return false;
                }
                if (entry.specific_date) {
                    return entry.specific_date.slice(0, 10) === dayKey;
                }
                return entry.day_of_week === planningDayNumber(day);
            })
            .sort((left, right) =>
                left.start_time.localeCompare(right.start_time)
            );
    };

    const getPlanningParticipants = (entry: PlanningEntry): Member[] => {
        if (entry.participants && entry.participants.length > 0) {
            return entry.participants;
        }

        return [{
            id: `primary-${entry.id}`,
            name: entry.family_member_name,
            color: entry.family_member_color,
        }];
    };

    const [weather, setWeather] = useState<WeatherDay[]>([]);
    const [weatherHours, setWeatherHours] =
        useState<WeatherHour[]>([]);
    const [weatherLoading, setWeatherLoading] =
        useState(true);
    const [weatherError, setWeatherError] =
        useState(false);

    const loadWeather = useCallback(async (): Promise<void> => {
        try {
            const response = await fetch(
                `${WEATHER_URL}&_=${Date.now()}`,
                {
                    method: 'GET',
                    cache: 'no-store',
                    headers: {
                        Accept: 'application/json',
                    },
                }
            );

            if (!response.ok) {
                throw new Error(
                    `Open-Meteo HTTP ${response.status}`
                );
            }

            const data =
                (await response.json()) as OpenMeteoResponse;

            const daily = data.daily;
            const hourly = data.hourly;

            if (
                !daily?.time ||
                !daily.weather_code ||
                !daily.temperature_2m_max ||
                !daily.temperature_2m_min ||
                !hourly?.time
            ) {
                throw new Error(
                    'Unvollständige Open-Meteo-Daten'
                );
            }

            const nextWeather: WeatherDay[] =
                daily.time
                    .slice(0, 14)
                    .map((date, index) => ({
                        date,
                        weatherCode:
                            daily.weather_code?.[index] ?? 0,
                        temperatureMax:
                            daily.temperature_2m_max?.[index] ?? 0,
                        temperatureMin:
                            daily.temperature_2m_min?.[index] ?? 0,
                        apparentTemperatureMax:
                            daily.apparent_temperature_max?.[index] ?? 0,
                        apparentTemperatureMin:
                            daily.apparent_temperature_min?.[index] ?? 0,
                        precipitationProbability:
                            daily.precipitation_probability_max?.[index] ?? 0,
                        precipitationSum:
                            daily.precipitation_sum?.[index] ?? 0,
                        rainSum:
                            daily.rain_sum?.[index] ?? 0,
                        snowfallSum:
                            daily.snowfall_sum?.[index] ?? 0,
                        windSpeedMax:
                            daily.wind_speed_10m_max?.[index] ?? 0,
                        windGustMax:
                            daily.wind_gusts_10m_max?.[index] ?? 0,
                        uvIndexMax:
                            daily.uv_index_max?.[index] ?? 0,
                        sunrise:
                            daily.sunrise?.[index] ?? '',
                        sunset:
                            daily.sunset?.[index] ?? '',
                    }));

            const nextHours: WeatherHour[] =
                hourly.time.map((time, index) => ({
                    time,
                    temperature:
                        hourly.temperature_2m?.[index] ?? 0,
                    precipitationProbability:
                        hourly
                            .precipitation_probability
                            ?.[index] ?? 0,
                    precipitation:
                        hourly.precipitation?.[index] ?? 0,
                    rain:
                        hourly.rain?.[index] ?? 0,
                    weatherCode:
                        hourly.weather_code?.[index] ?? 0,
                    windSpeed:
                        hourly.wind_speed_10m?.[index] ?? 0,
                }));

            setWeather(nextWeather);
            setWeatherHours(nextHours);
            setWeatherError(false);

            localStorage.setItem(
                WEATHER_CACHE_KEY,
                JSON.stringify({
                    daily: nextWeather,
                    hourly: nextHours,
                })
            );
        } catch (error) {
            console.error(
                'Kiosk weather load error:',
                error
            );

            setWeatherError(true);

            try {
                const cached =
                    localStorage.getItem(
                        WEATHER_CACHE_KEY
                    );

                if (cached) {
                    const parsed =
                        JSON.parse(cached) as {
                            daily?: WeatherDay[];
                            hourly?: WeatherHour[];
                        };

                    setWeather(parsed.daily ?? []);
                    setWeatherHours(parsed.hourly ?? []);
                }
            } catch {
                // Ungültigen lokalen Wetter-Cache ignorieren.
            }
        } finally {
            setWeatherLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadWeather();

        const weatherRefreshId =
            window.setInterval(
                () => void loadWeather(),
                WEATHER_REFRESH_MS
            );

        return () =>
            window.clearInterval(weatherRefreshId);
    }, [loadWeather]);

    const hourlyWeatherByDay = useMemo(() => {
        const todayDate =
            `${now.getFullYear()}-` +
            `${pad(now.getMonth() + 1)}-` +
            `${pad(now.getDate())}`;

        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const tomorrowDate =
            `${tomorrow.getFullYear()}-` +
            `${pad(tomorrow.getMonth() + 1)}-` +
            `${pad(tomorrow.getDate())}`;

        const isVisibleHour = (hourNumber: number): boolean =>
            hourNumber >= 6 && hourNumber <= 20;

        return {
            today: weatherHours.filter((hour) => {
                const date = hour.time.slice(0, 10);
                const hourNumber = Number(hour.time.slice(11, 13));
                return date === todayDate && isVisibleHour(hourNumber);
            }),
            tomorrow: weatherHours.filter((hour) => {
                const date = hour.time.slice(0, 10);
                const hourNumber = Number(hour.time.slice(11, 13));
                return date === tomorrowDate && isVisibleHour(hourNumber);
            }),
        };
    }, [weatherHours, now]);

    const renderRainRow = (
        label: string,
        hours: WeatherHour[]
    ): React.ReactNode => (
        <div className="grid grid-cols-[62px_minmax(0,1fr)] items-stretch gap-1.5">
            <div className="flex flex-col justify-center">
                <span className="text-[0.55rem] font-bold uppercase tracking-wider text-muted-foreground">
                    Regen
                </span>

                <span className="text-[0.7rem] font-bold text-foreground">
                    {label}
                </span>
            </div>

            {hours.length === 0 ? (
                <div className="flex items-center text-[0.65rem] text-muted-foreground">
                    Keine Stundenwerte verfügbar
                </div>
            ) : (
                <div
                    className="grid min-w-0 gap-0.5"
                    style={{
                        gridTemplateColumns:
                            `repeat(${hours.length}, minmax(44px, 1fr))`,
                    }}
                >
                    {hours.map((hour) => {
                        const hourLabel =
                            hour.time.slice(11, 13);

                        const wet =
                            hour.precipitationProbability >= 20 ||
                            hour.precipitation > 0 ||
                            hour.rain > 0;

                        return (
                            <div
                                key={hour.time}
                                className={cn(
                                    'flex min-w-0 flex-col items-center justify-center rounded-sm border px-0.5 py-0.5',
                                    rainCellClass(hour)
                                )}
                                title={
                                    `${hourLabel}:00 Uhr, ` +
                                    `${Math.round(
                                        hour.precipitationProbability
                                    )} % Regen, ` +
                                    `${hour.precipitation.toFixed(1)} mm, ` +
                                    `${Math.round(
                                        hour.temperature
                                    )} °C`
                                }
                            >
                                <span style={{ color: '#020617' }} className="text-[0.82rem] font-bold tabular-nums">
                                    {hourLabel}
                                </span>

                                <span style={{ color: '#020617' }} className="text-[0.5rem] font-semibold tabular-nums">
                                    {wet
                                        ? `${Math.round(
                                            hour
                                                .precipitationProbability
                                        )}%`
                                        : '·'}
                                </span>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );

    const renderWeatherView =
        (): React.ReactNode => (
            <section
                className="min-w-0 cursor-pointer rounded-card border border-border bg-card/85 px-2.5 py-1.5 transition-colors hover:border-primary/60 active:bg-primary/10"
                aria-label="14-Tage-Wettervorhersage für Kirchstetten öffnen"
                role="button"
                tabIndex={0}
                onClick={(event) => {
                    event.stopPropagation();
                    setWeatherDetailsOpen(true);
                }}
                onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setWeatherDetailsOpen(true);
                    }
                }}
            >
                {weatherLoading &&
                weather.length === 0 ? (
                    <div className="flex min-h-[90px] items-center justify-center text-sm text-muted-foreground">
                        Wetter wird geladen …
                    </div>
                ) : weather.length === 0 ? (
                    <div className="flex min-h-[90px] items-center justify-center text-sm text-muted-foreground">
                        Wetter nicht verfügbar
                    </div>
                ) : (
                    <div className="space-y-1">
                        <div className="flex min-w-0 items-center gap-1 border-b border-border/70 pb-1">
                            <span className="mr-1 shrink-0 text-[0.58rem] font-bold uppercase tracking-[0.12em] text-primary">
                                Wetter
                            </span>

                            {weather.slice(0, 3).map(
                                (day, index) => (
                                    <div
                                        key={day.date}
                                        className="flex min-w-0 flex-1 items-center justify-center gap-1 border-l border-border/60 px-1 first:border-l-0"
                                    >
                                        <span
                                            className="text-base"
                                            aria-hidden="true"
                                        >
                                            {weatherSymbol(
                                                day.weatherCode
                                            )}
                                        </span>

                                        <span
                                            className={cn(
                                                'text-[0.62rem] font-bold',
                                                index === 0
                                                    ? 'text-primary'
                                                    : 'text-foreground'
                                            )}
                                        >
                                            {formatWeatherDay(
                                                day.date,
                                                index
                                            )}
                                        </span>

                                        <span className="font-serif text-[0.72rem] font-bold tabular-nums">
                                            {Math.round(
                                                day.temperatureMax
                                            )}°
                                        </span>

                                        <span className="text-[0.54rem] font-semibold text-muted-foreground">
                                            /{' '}
                                            {Math.round(
                                                day.temperatureMin
                                            )}°
                                        </span>

                                        <span
                                            className="text-[0.65rem]"
                                            aria-hidden="true"
                                        >
                                            🌧
                                        </span>

                                        <span className="text-[0.54rem] font-semibold text-muted-foreground">
                                            {Math.round(
                                                day
                                                    .precipitationProbability
                                            )}%
                                        </span>

                                        <span
                                            className="text-[0.65rem]"
                                            aria-hidden="true"
                                        >
                                            💨
                                        </span>

                                        <span className="text-[0.54rem] font-semibold text-muted-foreground">
                                            {Math.round(
                                                day.windSpeedMax
                                            )}
                                        </span>
                                    </div>
                                )
                            )}

                            {weatherError && (
                                <span className="shrink-0 text-[0.5rem] text-amber-500">
                                    letzter Stand
                                </span>
                            )}
                        </div>

                        {renderRainRow(
                            'Heute',
                            hourlyWeatherByDay.today
                        )}

                        {renderRainRow(
                            'Morgen',
                            hourlyWeatherByDay.tomorrow
                        )}
                    </div>
                )}
            </section>
        );

    // OPENFAMILY_KIOSK_FULL_FEATURES_START
    useEffect(() => {
        const closeOnEscape = (event: KeyboardEvent): void => {
            if (event.key !== 'Escape') return;
            setSelectedAppointment(null);
            setWeatherDetailsOpen(false);
        };
        document.addEventListener('keydown', closeOnEscape);
        return () => document.removeEventListener('keydown', closeOnEscape);
    }, []);

    const formatAppointmentDateTime = (value: string): string =>
        new Intl.DateTimeFormat(LOCALE, {
            weekday: 'long',
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
        }).format(new Date(value));

    const renderAppointmentDetails = (): React.ReactNode => {
        if (!selectedAppointment) return null;
        const members = selectedAppointment.family_members_data ?? [];
        return (
            <div
                className="fixed inset-0 z-[250] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
                role="dialog"
                aria-modal="true"
                aria-label={`Termindetails: ${selectedAppointment.title}`}
                onClick={() => setSelectedAppointment(null)}
            >
                <section
                    className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-card border border-border bg-card p-5 shadow-2xl lg:p-7"
                    onClick={(event) => event.stopPropagation()}
                >
                    <header className="mb-5 flex items-start justify-between gap-4 border-b border-border pb-4">
                        <div className="min-w-0">
                            <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Kalendereintrag</p>
                            <h2 className="mt-1 break-words font-serif text-[clamp(1.8rem,4vw,3rem)] font-bold">
                                {selectedAppointment.title}
                            </h2>
                        </div>
                        <button
                            type="button"
                            className="shrink-0 rounded-input border border-border bg-background px-4 py-2 font-bold hover:border-primary hover:text-primary"
                            onClick={() => setSelectedAppointment(null)}
                        >
                            Schließen
                        </button>
                    </header>
                    <div className="grid gap-4 text-lg sm:grid-cols-2">
                        <div className="rounded-input bg-surface-2 p-4">
                            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Beginn</p>
                            <p className="mt-1 font-semibold capitalize">{formatAppointmentDateTime(selectedAppointment.start_time)}</p>
                        </div>
                        {selectedAppointment.end_time && (
                            <div className="rounded-input bg-surface-2 p-4">
                                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Ende</p>
                                <p className="mt-1 font-semibold capitalize">{formatAppointmentDateTime(selectedAppointment.end_time)}</p>
                            </div>
                        )}
                        {selectedAppointment.location && (
                            <div className="rounded-input bg-surface-2 p-4 sm:col-span-2">
                                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Ort</p>
                                <p className="mt-1 whitespace-pre-wrap font-semibold">{selectedAppointment.location}</p>
                            </div>
                        )}
                        {members.length > 0 && (
                            <div className="rounded-input bg-surface-2 p-4 sm:col-span-2">
                                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Teilnehmer</p>
                                <div className="mt-2 flex flex-wrap gap-3">
                                    {members.map((member) => (
                                        <span key={member.id} className="inline-flex items-center gap-2 font-semibold">
                                            <span className="h-3 w-3 rounded-full" style={{ backgroundColor: member.color || 'var(--primary)' }} />
                                            {member.name}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                        {(selectedAppointment.description || selectedAppointment.notes) && (
                            <div className="rounded-input bg-surface-2 p-4 sm:col-span-2">
                                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Details</p>
                                <p className="mt-2 whitespace-pre-wrap break-words leading-relaxed">
                                    {selectedAppointment.description || selectedAppointment.notes}
                                </p>
                            </div>
                        )}
                    </div>
                </section>
            </div>
        );
    };

    const renderWeatherDetails = (): React.ReactNode => {
        if (!weatherDetailsOpen) return null;
        return (
            <div
                className="fixed inset-0 z-[200] overflow-y-auto bg-background/95 p-4 backdrop-blur-md lg:p-8"
                role="dialog"
                aria-modal="true"
                aria-label="14-Tage-Wettervorhersage"
                onClick={() => setWeatherDetailsOpen(false)}
            >
                <section
                    className="mx-auto max-w-[1700px] rounded-card border border-border bg-card p-4 shadow-2xl lg:p-6"
                    onClick={(event) => event.stopPropagation()}
                >
                    <header className="mb-5 flex items-center justify-between gap-4 border-b border-border pb-4">
                        <div>
                            <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Wetter · Kirchstetten</p>
                            <h2 className="mt-1 font-serif text-[clamp(1.8rem,3vw,3rem)] font-bold">14-Tage-Vorhersage</h2>
                            <p className="mt-1 text-sm text-muted-foreground">Nach links wischen oder außerhalb tippen zum Schließen</p>
                        </div>
                        <button
                            type="button"
                            className="min-h-12 rounded-input border border-border bg-background px-5 py-2 text-base font-bold hover:border-primary hover:text-primary"
                            onClick={() => setWeatherDetailsOpen(false)}
                        >
                            Schließen
                        </button>
                    </header>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-7">
                        {weather.map((day, index) => {
                            const date = new Date(`${day.date}T12:00:00`);
                            const dayLabel = index === 0 ? 'Heute' : new Intl.DateTimeFormat(LOCALE, { weekday: 'long' }).format(date);
                            const dateLabel = new Intl.DateTimeFormat(LOCALE, { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
                            const sunrise = day.sunrise ? day.sunrise.slice(11, 16) : '–';
                            const sunset = day.sunset ? day.sunset.slice(11, 16) : '–';
                            return (
                                <article
                                    key={day.date}
                                    className={cn(
                                        'rounded-card border p-4',
                                        index === 0 ? 'border-primary bg-primary/10 ring-2 ring-primary/20' : 'border-border bg-background/60'
                                    )}
                                >
                                    <header className="mb-3 flex items-start justify-between gap-3 border-b border-border pb-3">
                                        <div>
                                            <p className={cn('font-serif text-xl font-bold capitalize', index === 0 && 'text-primary')}>{dayLabel}</p>
                                            <p className="text-sm font-semibold text-muted-foreground">{dateLabel}</p>
                                        </div>
                                        <span className="text-4xl" aria-hidden="true">{weatherSymbol(day.weatherCode)}</span>
                                    </header>
                                    <div className="space-y-3">
                                        <div>
                                            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Temperatur</p>
                                            <p className="font-serif text-2xl font-bold tabular-nums">
                                                {Math.round(day.temperatureMax)}°
                                                <span className="ml-2 text-base text-muted-foreground">/ {Math.round(day.temperatureMin)}°</span>
                                            </p>
                                            <p className="text-xs text-muted-foreground">Gefühlt {Math.round(day.apparentTemperatureMax)}° / {Math.round(day.apparentTemperatureMin)}°</p>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                            <div className="rounded-input bg-surface-2 p-2">
                                                <p className="text-[0.65rem] font-bold uppercase text-muted-foreground">Regen</p>
                                                <p className="mt-1 font-bold tabular-nums">{Math.round(day.precipitationProbability)}%</p>
                                                <p className="text-xs text-muted-foreground">{day.precipitationSum.toFixed(1)} mm</p>
                                            </div>
                                            <div className="rounded-input bg-surface-2 p-2">
                                                <p className="text-[0.65rem] font-bold uppercase text-muted-foreground">Wind</p>
                                                <p className="mt-1 font-bold tabular-nums">{Math.round(day.windSpeedMax)} km/h</p>
                                                <p className="text-xs text-muted-foreground">Böen {Math.round(day.windGustMax)} km/h</p>
                                            </div>
                                            <div className="rounded-input bg-surface-2 p-2">
                                                <p className="text-[0.65rem] font-bold uppercase text-muted-foreground">UV-Index</p>
                                                <p className="mt-1 font-bold tabular-nums">{day.uvIndexMax.toFixed(1)}</p>
                                            </div>
                                            <div className="rounded-input bg-surface-2 p-2">
                                                <p className="text-[0.65rem] font-bold uppercase text-muted-foreground">Sonne</p>
                                                <p className="mt-1 text-sm font-bold tabular-nums">↑ {sunrise}</p>
                                                <p className="text-sm font-bold tabular-nums">↓ {sunset}</p>
                                            </div>
                                        </div>
                                        {day.snowfallSum > 0 && (
                                            <p className="rounded-input bg-sky-500/10 px-2 py-1 text-sm font-semibold text-sky-300">
                                                Schnee: {day.snowfallSum.toFixed(1)} cm
                                            </p>
                                        )}
                                    </div>
                                </article>
                            );
                        })}
                    </div>
                    <footer className="mt-5 border-t border-border pt-3 text-center text-xs text-muted-foreground">
                        Wetterdaten von Open-Meteo · automatische Aktualisierung
                    </footer>
                </section>
            </div>
        );
    };
    // OPENFAMILY_KIOSK_FULL_FEATURES_END


    const renderParticipantDots = (
        members: Member[],
        fallbackColor?: string
    ): React.ReactNode => {
        const colors = members.length > 0
            ? members.map((member) => member.color || fallbackColor || '#64748B')
            : fallbackColor
              ? [fallbackColor]
              : [];

        if (colors.length === 0) return null;

        return (
            <div
                className="mt-2 flex flex-wrap items-center gap-1.5"
                aria-label={`${colors.length} zugeordnete Familienmitglieder`}
            >
                {colors.map((color, index) => (
                    <span
                        key={`${color}-${index}`}
                        className="h-3 w-3 rounded-full ring-1 ring-black/10"
                        style={{ backgroundColor: color }}
                    />
                ))}
            </div>
        );
    };

    const renderWeekView = (): React.ReactNode => (
        <>
            <header className="grid grid-cols-[minmax(400px,32%)_minmax(0,1fr)] items-center gap-3 px-4 pb-3 pt-3 lg:px-8">
                <div className="flex min-w-0 items-baseline gap-4 font-serif font-semibold">
                    <span className="shrink-0 text-[clamp(2rem,4vw,3.6rem)] tabular-nums">
                        {formatTime(now)}
                    </span>
                    <span className="min-w-0 truncate text-[clamp(1rem,1.65vw,1.6rem)] capitalize text-muted-foreground">
                        {formatCurrentDate(now)}
                    </span>
                </div>
                {renderWeatherView()}
            </header>

            <section className="mx-4 rounded-card border border-border bg-card p-4 lg:mx-8 lg:p-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <Calendar className="h-7 w-7 shrink-0 text-primary" />
                        <span className="font-serif text-[clamp(1.4rem,2vw,2rem)] font-bold">
                            KW {isoWeekNumber(displayedWeekStart)}
                        </span>
                        <button type="button"
                                onClick={() => setViewMode('month')}
                                className="rounded-input border border-border bg-surface-2 px-3 py-1 text-sm font-semibold transition-colors hover:bg-primary hover:text-white"
                                >
                                Monat
                        </button>

                                    {/* OPENFAMILY_HORIZONTAL_FAMILY_LEGEND */}
                                    <div
                                        className="ml-1 grid min-w-0 flex-1 items-center gap-x-2 border-l border-border pl-3"
                                        style={{
                                            gridTemplateColumns: `repeat(${Math.max(
                                                1,
                                                familyMembers.length
                                            )}, minmax(0, 1fr))`,
                                        }}
                                        aria-label="Familienlegende"
                                    >
                                        {familyMembers.map((member) => {
                                            const dynamicSize = Math.max(
                                                0.68,
                                                Math.min(
                                                    1.05,
                                                    1.22 - familyMembers.length * 0.07
                                                )
                                            );

                                            return (
                                                <span
                                                    key={member.id}
                                                    className="min-w-0 truncate text-center font-extrabold leading-none"
                                                    style={{
                                                        color: member.color,
                                                        fontSize: `clamp(0.68rem, ${dynamicSize}vw, 1.05rem)`,
                                                    }}
                                                    title={member.name}
                                                >
                                                    {member.name}
                                                </span>
                                            );
                                        })}
                                    </div>
                    </div>
                    <span className="text-[clamp(1rem,1.35vw,1.3rem)] font-semibold tabular-nums text-muted-foreground">
                        {formatRange(displayedWeekStart, displayedWeekEnd)}
                    </span>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-7">
                    {Array.from({ length: 7 }, (_, index) => {
                        const day = addDays(displayedWeekStart, index);
                        const dayKey = toDateKey(day);
                        const dayAppointments = appointmentsByDay.get(dayKey) ?? [];
                        const dayPlanning = getPlanningForDay(day);
                        const timelineGroups = buildTimelineGroups(
                            dayKey,
                            dayAppointments,
                            dayPlanning
                        );
                        const todayMarker = isSameDay(day, now);

                        return (
                            <article
                                key={dayKey}
                                className={cn(
                                    'min-h-52 rounded-input border p-3',
                                    todayMarker
                                        ? 'border-primary bg-primary/10 ring-2 ring-primary/30'
                                        : 'border-border bg-background/70'
                                )}
                            >
                                <header className="mb-3 border-b border-border pb-3">
                                    <div
                                        className={cn(
                                            'font-serif text-[clamp(1.5rem,2vw,2rem)] font-bold leading-none tabular-nums',
                                            todayMarker ? 'text-primary' : 'text-foreground'
                                        )}
                                    >
                                        {formatDayHeader(day)}{todayMarker && ' · HEUTE'}
                                    </div>
                                </header>

                                {timelineGroups.length === 0 ? (
                                    <p className="py-8 text-center text-lg font-medium text-muted-foreground">
                                        Keine Termine
                                    </p>
                                ) : (
                                    <div className="space-y-3">
                                        {timelineGroups.map((group, groupIndex) => (
                                            <div
                                                key={`${dayKey}-timeline-${groupIndex}`}
                                                className="grid items-stretch gap-1.5"
                                                style={{
                                                    gridTemplateColumns: `repeat(${group.columns}, minmax(0, 1fr))`,
                                                }}
                                            >
                                                {group.entries.map(({ entry, column }) => {
                                                    const compact = group.columns >= 2;
                                                    const verticalTitle = group.columns >= 3;

                                                    if (entry.kind === 'appointment') {
                                                        const appointment = entry.appointment;
                                                        const accentColor =
                                                            appointment.family_members_data?.[0]?.color ||
                                                            appointment.color ||
                                                            'var(--primary)';
                                                        return (
                                                            <div
                                                                key={entry.key}
                                                                role="button"
                                                                tabIndex={0}
                                                                onClick={(event) => {
                                                                    event.stopPropagation();
                                                                    setSelectedAppointment(appointment);
                                                                }}
                                                                onKeyDown={(event) => {
                                                                    if (event.key === 'Enter' || event.key === ' ') {
                                                                        event.preventDefault();
                                                                        setSelectedAppointment(appointment);
                                                                    }
                                                                }}
                                                                className={cn(
                                                                    'min-w-0 cursor-pointer rounded-input border-l-4 bg-surface-2 transition-colors hover:bg-primary/10 active:bg-primary/15',
                                                                    compact ? 'px-1.5 py-2' : 'px-3 py-3'
                                                                )}
                                                                style={{
                                                                    borderLeftColor: accentColor,
                                                                    gridColumnStart: column + 1,
                                                                }}
                                                            >
                                                                <div
                                                                    className={cn(
                                                                        'whitespace-nowrap font-serif font-bold leading-none tabular-nums',
                                                                        compact
                                                                            ? 'text-[clamp(0.72rem,0.8vw,0.95rem)]'
                                                                            : 'text-[clamp(1.05rem,1.35vw,1.55rem)]'
                                                                    )}
                                                                    style={{ color: accentColor }}
                                                                >
                                                                    {formatTime(appointment.start_time)}
                                                                    {appointment.end_time &&
                                                                        ` – ${formatTime(appointment.end_time)}`}
                                                                </div>
                                                                <p
                                                                    className={cn(
                                                                        'break-words font-serif font-bold uppercase leading-tight',
                                                                        compact
                                                                            ? 'mt-1 text-[clamp(0.78rem,0.85vw,1rem)]'
                                                                            : 'mt-2 text-[clamp(1rem,1.25vw,1.45rem)]',
                                                                        verticalTitle && 'mx-auto min-h-28'
                                                                    )}
                                                                    style={
                                                                        verticalTitle
                                                                            ? {
                                                                                writingMode: 'vertical-rl',
                                                                                textOrientation: 'mixed',
                                                                            }
                                                                            : undefined
                                                                    }
                                                                >
                                                                    {appointment.title}
                                                                </p>
                                                                {!compact && appointment.location && (
                                                                    <p className="mt-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
                                                                        <MapPin className="h-4 w-4 shrink-0" />
                                                                        <span className="truncate">{appointment.location}</span>
                                                                    </p>
                                                                )}
                                                                {!verticalTitle && renderParticipantDots(appointment.family_members_data ?? [])}
                                                            </div>
                                                        );
                                                    }

                                                    const planning = entry.planning;
                                                    const planningMembers = getPlanningParticipants(planning);
                                                    const accentColor =
                                                        planning.family_member_color ||
                                                        planningMembers[0]?.color ||
                                                        'var(--primary)';
                                                    return (
                                                        <div
                                                            key={entry.key}
                                                            className={cn(
                                                                'min-w-0 rounded-input border-l-4 bg-surface-2',
                                                                compact ? 'px-1.5 py-2' : 'px-3 py-3'
                                                            )}
                                                            style={{
                                                                borderLeftColor: accentColor,
                                                                gridColumnStart: column + 1,
                                                            }}
                                                        >
                                                            <div
                                                                className={cn(
                                                                    'whitespace-nowrap font-serif font-bold leading-none tabular-nums',
                                                                    compact
                                                                        ? 'text-[clamp(0.72rem,0.8vw,0.95rem)]'
                                                                        : 'text-[clamp(1.05rem,1.35vw,1.55rem)]'
                                                                )}
                                                                style={{ color: accentColor }}
                                                            >
                                                                {planning.start_time.slice(0, 5)} – {planning.end_time.slice(0, 5)}
                                                            </div>
                                                            <p
                                                                className={cn(
                                                                    'break-words font-serif font-bold uppercase leading-tight',
                                                                    compact
                                                                        ? 'mt-1 text-[clamp(0.78rem,0.85vw,1rem)]'
                                                                        : 'mt-2 text-[clamp(1rem,1.25vw,1.45rem)]',
                                                                    verticalTitle && 'mx-auto min-h-28'
                                                                )}
                                                                style={
                                                                    verticalTitle
                                                                        ? {
                                                                            writingMode: 'vertical-rl',
                                                                            textOrientation: 'mixed',
                                                                        }
                                                                        : undefined
                                                                }
                                                            >
                                                                {planning.title}
                                                            </p>
                                                            {!compact && planning.location && (
                                                                <p className="mt-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
                                                                    <MapPin className="h-4 w-4 shrink-0" />
                                                                    <span className="truncate">{planning.location}</span>
                                                                </p>
                                                            )}
                                                            {!verticalTitle && renderParticipantDots(planningMembers, planning.family_member_color)}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </article>
                        );
                    })}
                </div>
            </section>
        </>
    );

    const renderMonthView = (): React.ReactNode => {
        const rollingStartMonth = monthPreviewStart.getMonth();

        return (
            <section className="m-4 rounded-card border border-border bg-card p-4 lg:m-8 lg:p-5">
                <div className="mb-3 flex flex-wrap gap-3 font-semibold">
                    <span className="rounded-full bg-primary/15 px-3 py-1 text-primary">
                        {new Intl.DateTimeFormat(LOCALE, { month: 'long' })
                            .format(monthPreviewStart)}
                    </span>
                    {monthPreviewStart.getMonth() !== monthPreviewEnd.getMonth() && (
                        <span className="rounded-full bg-amber-500/15 px-3 py-1 text-amber-600">
                            {new Intl.DateTimeFormat(LOCALE, { month: 'long' })
                                .format(monthPreviewEnd)}
                        </span>
                    )}
                </div>

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-7 xl:grid-cols-8">
                    {Array.from(
                        { length: monthPreviewDayCount },
                        (_, index) => {
                            const day = addDays(monthPreviewStart, index);
                            const dayKey = toDateKey(day);
                            const dayAppointments = appointmentsByDay.get(dayKey) ?? [];
                            const dayPlanning = getPlanningForDay(day);
                            const todayMarker = isSameDay(day, now);

                            return (
                                <article
                                    key={dayKey}
                                    className={cn(
                                        'min-h-32 rounded-input border p-2.5',
                                        monthDisplayMode === 'rolling' &&
                                        day.getMonth() !== rollingStartMonth
                                            ? 'border-amber-500/35 bg-amber-500/10'
                                            : 'border-primary/35 bg-primary/10',
                                        todayMarker && 'ring-2 ring-primary'
                                    )}
                                >
                                    <div className="mb-2 font-serif text-lg font-bold">
                                        {formatDayHeader(day)}{todayMarker && ' · HEUTE'}
                                    </div>

                                    <div className="space-y-1.5">
                                        {dayAppointments.map((appointment) => (
                                            <div
                                                key={appointment.occurrence_id || appointment.id}
                                                role="button"
                                                tabIndex={0}
                                                onClick={(event) => { event.stopPropagation(); setSelectedAppointment(appointment); }}
                                                onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedAppointment(appointment); } }}
                                                className="cursor-pointer rounded bg-surface-2 px-2 py-1.5 transition-colors hover:bg-primary/10 active:bg-primary/15"
                                            >
                                                <p className="truncate text-base font-bold uppercase">
                                                    {appointment.title}
                                                </p>
                                                <p className="truncate text-sm font-semibold text-muted-foreground">
                                                    {(appointment.family_members_data ?? [])
                                                        .map((member) => member.name)
                                                        .join(', ')}
                                                </p>
                                            </div>
                                        ))}

                                        {dayPlanning.map((entry) => (
                                            <div
                                                key={`month-planning-${dayKey}-${entry.id}`}
                                                className="cursor-pointer rounded bg-surface-2 px-2 py-1.5 transition-colors hover:bg-primary/10 active:bg-primary/15"
                                            >
                                                <p className="truncate text-base font-bold uppercase">
                                                    {entry.title}
                                                </p>
                                                <p className="truncate text-sm font-semibold text-muted-foreground">
                                                    {getPlanningParticipants(entry)
                                                        .map((member) => member.name)
                                                        .join(', ')}
                                                </p>
                                            </div>
                                        ))}
                                    </div>
                                </article>
                            );
                        }
                    )}
                </div>
            </section>
        );
    };

    const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>): void => {
        const touch = event.touches[0];
        touchStart.current = { x: touch.clientX, y: touch.clientY };
    };

    const handleTouchEnd = (event: React.TouchEvent<HTMLDivElement>): void => {
        if (!touchStart.current) return;

        const startPoint = touchStart.current;
        const touch = event.changedTouches[0];
        const deltaX = touch.clientX - startPoint.x;
        const deltaY = touch.clientY - startPoint.y;
        const startedInNavigationZone = startPoint.y <= 350;
        touchStart.current = null;

        if (Math.abs(deltaX) < 12 && Math.abs(deltaY) < 12) {
            const currentTap = Date.now();
            const elapsed = currentTap - lastTapRef.current;
            if (elapsed > 0 && elapsed < 450) {
                lastTapRef.current = 0;
                window.location.reload();
                return;
            }
            lastTapRef.current = currentTap;
        }

        const horizontal = Math.abs(deltaX) > Math.abs(deltaY);

        if (
            weatherDetailsOpen &&
            horizontal &&
            deltaX <= -SWIPE_THRESHOLD_PX
        ) {
            setWeatherDetailsOpen(false);
            return;
        }

        if (horizontal && Math.abs(deltaX) >= SWIPE_THRESHOLD_PX) {
            if (viewMode === 'month') {
                if (monthDisplayMode === 'rolling') {
                    setMonthDisplayMode('calendar');
                    setMonthOffset(deltaX < 0 ? 1 : -1);
                } else {
                    setMonthOffset((current) => current + (deltaX < 0 ? 1 : -1));
                }
            } else {
                setWeekOffset((current) => current + (deltaX < 0 ? 1 : -1));
            }
            return;
        }

        if (
            startedInNavigationZone &&
            !horizontal &&
            deltaY <= -SWIPE_THRESHOLD_PX &&
            viewMode === 'week'
        ) {
            setMonthOffset(0);
            setMonthDisplayMode('rolling');
            setViewMode('month');
            return;
        }

        if (
            startedInNavigationZone &&
            !horizontal &&
            deltaY >= SWIPE_THRESHOLD_PX &&
            viewMode === 'month'
        ) {
            setViewMode('week');
            setWeekOffset(0);
        }
    };

    return (
        <div
            className="min-h-screen touch-pan-y bg-background text-foreground"
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            onDoubleClick={() => window.location.reload()}
        >
            {renderAppointmentDetails()}
            {renderWeatherDetails()}
            {loading &&
            appointments.length === 0 &&
            Object.keys(planningByWeek).length === 0 ? (
                <div className="m-4 rounded-card border border-border bg-card p-12 text-center text-h2 text-muted-foreground lg:m-8">
                    Kalender wird geladen …
                </div>
            ) : viewMode === 'month' ? (
                renderMonthView()
            ) : (
                renderWeekView()
            )}
        </div>
    );
};

export default Kiosk;

// OPENFAMILY_KIOSK_WEATHER_END
// OPENFAMILY_KIOSK_FULL_PATCH_APPLIED
