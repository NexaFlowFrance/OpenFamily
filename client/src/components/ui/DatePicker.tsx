import React from 'react';
import { cn } from '../../lib/utils';

interface DatePickerProps {
    value: string;
    onChange: (value: string) => void;
    label?: string;
    type?: 'date' | 'datetime-local' | 'time';
    min?: string;
    max?: string;
    className?: string;
}

const parseDateTimeValue = (value: string): { date: string; time: string } => {
    if (!value) {
        return { date: '', time: '' };
    }

    const normalized = value.trim().replace(' ', 'T');
    const [datePart, timePart = ''] = normalized.split('T');
    const safeDate = /^\d{4}-\d{2}-\d{2}$/.test(datePart) ? datePart : '';
    const safeTime = /^(\d{2}:\d{2})/.test(timePart) ? timePart.slice(0, 5) : '';
    return { date: safeDate, time: safeTime };
};

export const DatePicker: React.FC<DatePickerProps> = ({
    value,
    onChange,
    label,
    type = 'date',
    min,
    max,
    className,
}) => {
    if (type === 'datetime-local') {
        const { date, time } = parseDateTimeValue(value);
        const today = new Date().toISOString().slice(0, 10);
        const minDate = min ? min.slice(0, 10) : undefined;
        const maxDate = max ? max.slice(0, 10) : undefined;

        return (
            <div className="w-full">
                {label && (
                    <label className="mb-1.5 block text-caption font-medium text-foreground">
                        {label}
                    </label>
                )}
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <input
                        type="date"
                        value={date}
                        onChange={(e) => {
                            const nextDate = e.target.value;
                            if (!nextDate) {
                                onChange('');
                                return;
                            }
                            onChange(`${nextDate}T${time || '09:00'}`);
                        }}
                        min={minDate}
                        max={maxDate}
                        className={cn('input-nexus py-0 text-caption', className)}
                    />
                    <input
                        type="time"
                        step={60}
                        value={time}
                        onChange={(e) => {
                            const nextTime = e.target.value;
                            if (!nextTime) {
                                if (!date) {
                                    onChange('');
                                    return;
                                }
                                onChange(`${date}T00:00`);
                                return;
                            }
                            onChange(`${date || today}T${nextTime}`);
                        }}
                        className={cn('input-nexus py-0 text-caption', className)}
                    />
                </div>
            </div>
        );
    }

    return (
        <div className="w-full">
            {label && (
                <label className="mb-1.5 block text-caption font-medium text-foreground">
                    {label}
                </label>
            )}
            <input
                type={type}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                min={min}
                max={max}
                className={cn('input-nexus py-0 text-caption', className)}
            />
        </div>
    );
};
