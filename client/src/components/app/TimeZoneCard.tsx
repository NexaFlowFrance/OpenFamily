import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Globe2 } from 'lucide-react';
import { Card, CardContent, Button, Input } from '../ui';
import { api, ApiError } from '../../lib/api';

interface TimeZoneState {
    /** The zone in effect: the family's, or the server's when none was chosen. */
    timezone: string;
    family_timezone: string | null;
    server_timezone: string;
}

// Every zone name the browser knows, for the suggestions under the field.
const supportedZones = (): string[] => {
    const list = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf;
    try {
        return typeof list === 'function' ? list('timeZone') : [];
    } catch {
        return [];
    }
};

/**
 * Settings card, for parents: the family's time zone. Appointments are stored
 * as the family types them ("09:30"); the server needs to know where that is
 * to send a reminder on time, to pick the day a wall display shows and to
 * tell other calendars when an event starts. Without a choice, it assumes the
 * zone it runs in itself.
 */
const TimeZoneCard: React.FC = () => {
    const { t } = useTranslation('settings');
    const [state, setState] = useState<TimeZoneState | null>(null);
    const [value, setValue] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const zones = useMemo(supportedZones, []);
    const device = useMemo(() => {
        try {
            return new Intl.DateTimeFormat().resolvedOptions().timeZone || '';
        } catch {
            return '';
        }
    }, []);

    useEffect(() => {
        api.get<{ success: boolean; data: TimeZoneState }>('/api/auth/timezone')
            .then((res) => {
                setState(res.data);
                setValue(res.data.family_timezone ?? '');
            })
            .catch(() => undefined);
    }, []);

    const save = async (timezone: string | null) => {
        if (saving) return;
        setSaving(true);
        setError('');
        try {
            const res = await api.put<{ success: boolean; data: TimeZoneState }>('/api/auth/timezone', { timezone });
            setState(res.data);
            setValue(res.data.family_timezone ?? '');
        } catch (e) {
            setError(e instanceof ApiError && e.status === 400 ? t('timeZone.invalid') : t('timeZone.error'));
        } finally {
            setSaving(false);
        }
    };

    if (!state) return null;
    const trimmed = value.trim();

    return (
        <Card>
            <CardContent className="p-6">
                <div className="flex items-start gap-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-card bg-primary-soft text-primary">
                        <Globe2 className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <h3 className="text-caption font-semibold text-foreground">{t('timeZone.title')}</h3>
                        <p className="mt-1 text-micro text-muted-foreground">{t('timeZone.subtitle')}</p>
                        <p className="mt-3 text-caption text-foreground">
                            {state.family_timezone
                                ? t('timeZone.current', { zone: state.family_timezone })
                                : t('timeZone.serverDefault', { zone: state.server_timezone })}
                        </p>

                        <form
                            onSubmit={(event) => { event.preventDefault(); if (trimmed) void save(trimmed); }}
                            className="mt-3 flex max-w-md items-end gap-2"
                        >
                            <Input
                                value={value}
                                list="openfamily-time-zones"
                                onChange={(e) => setValue(e.target.value)}
                                placeholder={t('timeZone.placeholder')}
                                aria-label={t('timeZone.label')}
                                autoComplete="off"
                                spellCheck={false}
                            />
                            <datalist id="openfamily-time-zones">
                                {zones.map((zone) => <option key={zone} value={zone} />)}
                            </datalist>
                            <Button
                                type="submit"
                                variant="secondary"
                                size="sm"
                                className="shrink-0"
                                disabled={saving || !trimmed || trimmed === state.family_timezone}
                            >
                                {t('timeZone.save')}
                            </Button>
                        </form>
                        {error && <p className="mt-2 text-micro text-danger">{error}</p>}

                        <div className="mt-3 flex flex-wrap gap-2">
                            {device && device !== state.family_timezone && (
                                <Button type="button" variant="ghost" size="sm" disabled={saving} onClick={() => void save(device)}>
                                    {t('timeZone.useDevice', { zone: device })}
                                </Button>
                            )}
                            {state.family_timezone && (
                                <Button type="button" variant="ghost" size="sm" disabled={saving} onClick={() => void save(null)}>
                                    {t('timeZone.useServer')}
                                </Button>
                            )}
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
};

export default TimeZoneCard;
