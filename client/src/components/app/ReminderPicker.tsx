import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bell, X } from 'lucide-react';
import { Select } from '../ui';
import { intlLocale } from '../../i18n/format';

/** Mirrors server/src/lib/reminders.ts. */
export const MAX_REMINDERS = 5;
export const MAX_REMINDER_MINUTES = 4 * 7 * 24 * 60;

const HOUR = 60;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const TIMED_PRESETS = [0, 5, 10, 15, 30, HOUR, 2 * HOUR, DAY, 2 * DAY, WEEK];
const ALL_DAY_PRESETS = [0, DAY, 2 * DAY, WEEK];
const UNITS = { minutes: 1, hours: HOUR, days: DAY, weeks: WEEK } as const;
type Unit = keyof typeof UNITS;

/** "30 minutes", "2 heures", "1 jour", "1 semaine" in the interface language. */
export function formatDuration(minutes: number): string {
    const [value, unit] =
        minutes % WEEK === 0 ? [minutes / WEEK, 'week']
            : minutes % DAY === 0 ? [minutes / DAY, 'day']
                : minutes % HOUR === 0 ? [minutes / HOUR, 'hour']
                    : [minutes, 'minute'];
    return new Intl.NumberFormat(intlLocale(), { style: 'unit', unit, unitDisplay: 'long' }).format(value);
}

/** Old appointments (and older servers) only carry the two flags. */
export function reminderMinutesOf(appointment: {
    reminder_minutes?: number[] | null;
    reminder_30min?: boolean;
    reminder_1hour?: boolean;
}): number[] {
    if (Array.isArray(appointment.reminder_minutes)) return [...appointment.reminder_minutes].sort((a, b) => a - b);
    return [
        ...(appointment.reminder_30min ? [30] : []),
        ...(appointment.reminder_1hour ? [60] : []),
    ];
}

interface ReminderPickerProps {
    value: number[];
    onChange: (value: number[]) => void;
    allDay: boolean;
}

export const ReminderPicker: React.FC<ReminderPickerProps> = ({ value, onChange, allDay }) => {
    const { t } = useTranslation(['calendar']);
    const [customOpen, setCustomOpen] = useState(false);
    const [customValue, setCustomValue] = useState('3');
    const [customUnit, setCustomUnit] = useState<Unit>(allDay ? 'days' : 'hours');
    const [customError, setCustomError] = useState('');

    const label = (minutes: number): string => {
        if (allDay) {
            if (minutes === 0) return t('calendar:reminders.allDaySameDay');
            return minutes % DAY === 0
                ? t('calendar:reminders.allDayBefore', { duration: formatDuration(minutes) })
                : t('calendar:reminders.allDayBeforeNine', { duration: formatDuration(minutes) });
        }
        return minutes === 0
            ? t('calendar:reminders.atStart')
            : t('calendar:reminders.before', { duration: formatDuration(minutes) });
    };

    const add = (minutes: number) => {
        if (value.includes(minutes) || value.length >= MAX_REMINDERS) return;
        onChange([...value, minutes].sort((a, b) => a - b));
    };

    const addCustom = () => {
        const amount = Number(customValue.replace(',', '.'));
        const minutes = Math.round(amount * UNITS[customUnit]);
        if (!Number.isFinite(amount) || amount <= 0 || minutes > MAX_REMINDER_MINUTES) {
            setCustomError(t('calendar:reminders.customInvalid'));
            return;
        }
        add(minutes);
        setCustomError('');
        setCustomOpen(false);
    };

    const presets = (allDay ? ALL_DAY_PRESETS : TIMED_PRESETS).filter((m) => !value.includes(m));
    const full = value.length >= MAX_REMINDERS;

    return (
        <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-label font-medium text-foreground">
                <Bell className="h-3.5 w-3.5" aria-hidden />
                {t('calendar:reminders.title')}
            </p>
            {value.length > 0 ? (
                <ul className="mb-2 flex flex-wrap gap-1.5">
                    {value.map((minutes) => (
                        <li key={minutes} className="inline-flex items-center gap-1 rounded-pill bg-primary-soft py-0.5 pl-3 pr-1 text-caption text-primary">
                            {label(minutes)}
                            <button
                                type="button"
                                onClick={() => onChange(value.filter((m) => m !== minutes))}
                                aria-label={t('calendar:reminders.remove', { reminder: label(minutes) })}
                                title={t('calendar:reminders.remove', { reminder: label(minutes) })}
                                className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-primary/10"
                            >
                                <X className="h-3.5 w-3.5" />
                            </button>
                        </li>
                    ))}
                </ul>
            ) : (
                <p className="mb-2 text-caption text-muted-foreground">{t('calendar:reminders.none')}</p>
            )}

            {full ? (
                <p className="text-micro text-muted-foreground">{t('calendar:reminders.max', { max: MAX_REMINDERS })}</p>
            ) : customOpen ? (
                <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                        <input
                            type="number"
                            min="1"
                            step="1"
                            inputMode="numeric"
                            value={customValue}
                            onChange={(e) => setCustomValue(e.target.value)}
                            aria-label={t('calendar:reminders.customAmount')}
                            className="input-nexus h-10 w-20 py-0 text-caption"
                        />
                        <div className="min-w-[8rem] flex-1">
                            <Select
                                value={customUnit}
                                onValueChange={(v) => setCustomUnit(v as Unit)}
                                options={(Object.keys(UNITS) as Unit[]).map((unit) => ({
                                    value: unit,
                                    label: t(`calendar:reminders.units.${unit}`),
                                }))}
                            />
                        </div>
                        <span className="text-caption text-muted-foreground">{t('calendar:reminders.beforeSuffix')}</span>
                    </div>
                    <div className="flex gap-2">
                        <button type="button" onClick={addCustom} className="rounded-input bg-primary px-3 py-1.5 text-caption font-medium text-white hover:opacity-90">
                            {t('calendar:reminders.addThis')}
                        </button>
                        <button type="button" onClick={() => { setCustomOpen(false); setCustomError(''); }} className="rounded-input px-3 py-1.5 text-caption text-muted-foreground hover:bg-surface-2">
                            {t('common:actions.cancel')}
                        </button>
                    </div>
                    {customError && <p className="text-micro text-danger">{customError}</p>}
                </div>
            ) : (
                <Select
                    value=""
                    onValueChange={(v) => {
                        if (v === 'custom') setCustomOpen(true);
                        else if (v) add(Number(v));
                    }}
                    placeholder={t('calendar:reminders.add')}
                    options={[
                        ...presets.map((m) => ({ value: String(m), label: label(m) })),
                        { value: 'custom', label: t('calendar:reminders.custom') },
                    ]}
                />
            )}
            {!full && !customOpen && (
                <p className="mt-1 text-micro text-muted-foreground">{t('calendar:reminders.hint')}</p>
            )}
        </div>
    );
};

export default ReminderPicker;
