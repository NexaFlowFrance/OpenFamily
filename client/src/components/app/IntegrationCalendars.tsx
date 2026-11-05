import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle, Check, Edit2, Link2, Loader2, RefreshCw, Trash2, Upload } from 'lucide-react';
import { Button, Input } from '../ui';
import { api } from '../../lib/api';
import { intlLocale } from '../../i18n/format';

export interface CalendarSubscription {
    id: string;
    name: string;
    url_host: string;
    color: string;
    family_member_ids: string[];
    last_synced_at: string | null;
    last_error: string | null;
    event_count: number;
}

interface ImportResult {
    created: number;
    updated: number;
    unchanged: number;
    total: number;
    truncated: boolean;
}

interface Member {
    id: string;
    name: string;
    color: string;
}

interface ExternalCalendarsProps {
    members: Member[];
    canManage: boolean;
    /** Called after anything that changes the events shown in the calendar. */
    onEventsChanged: () => void;
}

const COLORS = ['#3B82F6', '#16A34A', '#F97316', '#9333EA', '#DC4A60', '#0891B2', '#CA8A04', '#64748B'];
const KNOWN_ERRORS = ['INVALID_URL', 'FETCH_FAILED', 'NOT_ICS', 'TOO_LARGE', 'EMPTY', 'TOO_MANY', 'DEMO_UNAVAILABLE'];

function sinceText(iso: string | null): string {
    if (!iso) return '';
    const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    const rtf = new Intl.RelativeTimeFormat(intlLocale(), { numeric: 'auto' });
    if (Math.abs(minutes) < 60) return rtf.format(-Math.max(0, minutes), 'minute');
    if (Math.abs(minutes) < 24 * 60) return rtf.format(-Math.round(minutes / 60), 'hour');
    return rtf.format(-Math.round(minutes / (24 * 60)), 'day');
}

const ColorChoice: React.FC<{ value: string; onChange: (c: string) => void; label: string }> = ({ value, onChange, label }) => (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
        {COLORS.map((color) => (
            <button
                key={color}
                type="button"
                role="radio"
                aria-checked={value === color}
                aria-label={color}
                onClick={() => onChange(color)}
                className="flex h-8 w-8 items-center justify-center rounded-full"
            >
                <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full ${value === color ? 'ring-2 ring-offset-2 ring-offset-card' : ''}`}
                    style={{ backgroundColor: color, ['--tw-ring-color' as string]: color }}
                >
                    {value === color && <Check className="h-3.5 w-3.5 text-white" />}
                </span>
            </button>
        ))}
    </div>
);

const MemberChoice: React.FC<{ members: Member[]; value: string[]; onChange: (ids: string[]) => void }> = ({ members, value, onChange }) => (
    <div className="flex flex-wrap gap-1.5">
        {members.map((m) => {
            const on = value.includes(m.id);
            return (
                <button
                    key={m.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => onChange(on ? value.filter((id) => id !== m.id) : [...value, m.id])}
                    className={`inline-flex min-h-8 items-center gap-1.5 rounded-pill border px-3 py-1 text-caption transition-colors ${
                        on ? 'border-primary bg-primary-soft text-primary' : 'border-border bg-card text-foreground hover:border-primary/50'
                    }`}
                >
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: m.color }} />
                    {m.name}
                </button>
            );
        })}
    </div>
);

export const ExternalCalendars: React.FC<ExternalCalendarsProps> = ({ members, canManage, onEventsChanged }) => {
    const { t } = useTranslation(['calendar', 'common']);
    const [subscriptions, setSubscriptions] = useState<CalendarSubscription[]>([]);
    const [loading, setLoading] = useState(true);

    // Add or edit form
    const [formOpen, setFormOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [url, setUrl] = useState('');
    const [name, setName] = useState('');
    const [color, setColor] = useState(COLORS[0]);
    const [memberIds, setMemberIds] = useState<string[]>([]);
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState('');

    const [busyId, setBusyId] = useState<string | null>(null);
    const [listError, setListError] = useState('');

    // File import
    const fileInput = useRef<HTMLInputElement>(null);
    const [importing, setImporting] = useState(false);
    const [importMessage, setImportMessage] = useState<{ ok: boolean; text: string } | null>(null);

    const errorText = (error: unknown) => {
        const code = error instanceof Error ? error.message : '';
        return KNOWN_ERRORS.includes(code) ? t(`calendar:external.errors.${code}`) : t('calendar:external.errors.generic');
    };

    const load = useCallback(async () => {
        try {
            const res = await api.get<{ success: boolean; data: CalendarSubscription[] }>('/api/calendar/subscriptions');
            setSubscriptions(Array.isArray(res.data) ? res.data : []);
        } catch {
            setSubscriptions([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const openAdd = () => {
        setEditingId(null);
        setUrl('');
        setName('');
        setColor(COLORS[subscriptions.length % COLORS.length]);
        setMemberIds([]);
        setFormError('');
        setFormOpen(true);
    };

    const openEdit = (sub: CalendarSubscription) => {
        setEditingId(sub.id);
        setUrl('');
        setName(sub.name);
        setColor(sub.color);
        setMemberIds(sub.family_member_ids);
        setFormError('');
        setFormOpen(true);
    };

    const save = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setFormError('');
        try {
            if (editingId) {
                await api.put(`/api/calendar/subscriptions/${editingId}`, { name, color, family_member_ids: memberIds });
            } else {
                await api.post('/api/calendar/subscriptions', { url, name, color, family_member_ids: memberIds });
            }
            setFormOpen(false);
            await load();
            onEventsChanged();
        } catch (error) {
            setFormError(errorText(error));
        } finally {
            setSaving(false);
        }
    };

    const refresh = async (sub: CalendarSubscription) => {
        setBusyId(sub.id);
        setListError('');
        try {
            await api.post(`/api/calendar/subscriptions/${sub.id}/sync`, {});
            onEventsChanged();
        } catch (error) {
            setListError(`${sub.name} : ${errorText(error)}`);
        } finally {
            await load();
            setBusyId(null);
        }
    };

    const remove = async (sub: CalendarSubscription) => {
        if (!confirm(t('calendar:external.confirmRemove', { name: sub.name }))) return;
        setBusyId(sub.id);
        try {
            await api.delete(`/api/calendar/subscriptions/${sub.id}`);
            await load();
            onEventsChanged();
        } catch (error) {
            setListError(errorText(error));
        } finally {
            setBusyId(null);
        }
    };

    const importFile = async (file: File) => {
        setImporting(true);
        setImportMessage(null);
        try {
            const text = await file.text();
            const res = await api.postText<{ success: boolean; data: ImportResult }>(
                '/api/calendar/import',
                text,
                'text/calendar'
            );
            const r = res.data;
            setImportMessage({
                ok: true,
                text: t('calendar:external.importDone', { created: r.created, updated: r.updated, unchanged: r.unchanged })
                    + (r.truncated ? ` ${t('calendar:external.importTruncated')}` : ''),
            });
            onEventsChanged();
        } catch (error) {
            setImportMessage({ ok: false, text: errorText(error) });
        } finally {
            setImporting(false);
            if (fileInput.current) fileInput.current.value = '';
        }
    };

    return (
        <div className="space-y-6">
            {/* Followed calendars */}
            <section className="space-y-3">
                <div>
                    <h3 className="text-body font-semibold text-foreground">{t('calendar:external.followTitle')}</h3>
                    <p className="text-caption text-muted-foreground">{t('calendar:external.followDescription')}</p>
                </div>

                {loading ? (
                    <p className="flex items-center gap-2 text-caption text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" /> {t('common:states.loading')}
                    </p>
                ) : subscriptions.length > 0 ? (
                    <ul className="space-y-2">
                        {subscriptions.map((sub) => (
                            <li key={sub.id} className="flex items-start gap-3 rounded-input border border-border bg-surface-1 p-3">
                                <span className="mt-1.5 h-3 w-3 flex-shrink-0 rounded-full" style={{ backgroundColor: sub.color }} />
                                <div className="min-w-0 flex-1">
                                    <p className="break-words text-body-sm font-medium text-foreground">{sub.name}</p>
                                    <p className="text-micro text-muted-foreground">
                                        {sub.url_host} · {t('calendar:external.eventCount', { count: sub.event_count })}
                                    </p>
                                    {sub.last_error ? (
                                        <p className="mt-0.5 flex items-start gap-1 text-micro text-danger">
                                            <AlertCircle className="mt-px h-3 w-3 flex-shrink-0" />
                                            {KNOWN_ERRORS.includes(sub.last_error)
                                                ? t(`calendar:external.errors.${sub.last_error}`)
                                                : t('calendar:external.errors.generic')}
                                        </p>
                                    ) : sub.last_synced_at ? (
                                        <p className="mt-0.5 text-micro text-muted-foreground">
                                            {t('calendar:external.syncedAgo', { when: sinceText(sub.last_synced_at) })}
                                        </p>
                                    ) : null}
                                </div>
                                {canManage && (
                                    <div className="-mr-1 flex flex-shrink-0 items-center">
                                        <button
                                            type="button"
                                            onClick={() => void refresh(sub)}
                                            disabled={busyId === sub.id}
                                            title={t('calendar:external.refresh')}
                                            aria-label={t('calendar:external.refresh')}
                                            className="flex h-8 w-8 items-center justify-center rounded-input text-muted-foreground hover:bg-surface-2 hover:text-foreground disabled:opacity-50"
                                        >
                                            <RefreshCw className={`h-3.5 w-3.5 ${busyId === sub.id ? 'animate-spin' : ''}`} />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => openEdit(sub)}
                                            title={t('common:actions.edit')}
                                            aria-label={t('common:actions.edit')}
                                            className="flex h-8 w-8 items-center justify-center rounded-input text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                                        >
                                            <Edit2 className="h-3.5 w-3.5" />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => void remove(sub)}
                                            disabled={busyId === sub.id}
                                            title={t('calendar:external.remove')}
                                            aria-label={t('calendar:external.remove')}
                                            className="flex h-8 w-8 items-center justify-center rounded-input text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                                        >
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </button>
                                    </div>
                                )}
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="text-caption text-muted-foreground">{t('calendar:external.none')}</p>
                )}
                {listError && <p className="text-caption text-danger">{listError}</p>}

                {canManage && !formOpen && (
                    <Button type="button" variant="secondary" size="sm" onClick={openAdd}>
                        <Link2 className="mr-2 h-4 w-4" />
                        {t('calendar:external.add')}
                    </Button>
                )}

                {canManage && formOpen && (
                    <form onSubmit={save} className="space-y-3 rounded-input border border-border p-3">
                        {!editingId && (
                            <>
                                <Input
                                    label={t('calendar:external.urlLabel')}
                                    type="url"
                                    inputMode="url"
                                    required
                                    value={url}
                                    onChange={(e) => setUrl(e.target.value)}
                                    placeholder="https://calendar.google.com/calendar/ical/…/basic.ics"
                                />
                                <details className="rounded-input bg-surface-2/60 px-3 py-2 text-caption text-muted-foreground">
                                    <summary className="cursor-pointer font-medium text-foreground">{t('calendar:external.whereTitle')}</summary>
                                    <ul className="mt-2 list-disc space-y-1 pl-4">
                                        <li>{t('calendar:external.whereGoogle')}</li>
                                        <li>{t('calendar:external.whereOutlook')}</li>
                                        <li>{t('calendar:external.whereApple')}</li>
                                        <li>{t('calendar:external.whereOther')}</li>
                                    </ul>
                                    <p className="mt-2">{t('calendar:external.privacy')}</p>
                                </details>
                            </>
                        )}
                        <Input
                            label={t('calendar:external.nameLabel')}
                            value={name}
                            maxLength={100}
                            onChange={(e) => setName(e.target.value)}
                            placeholder={t('calendar:external.namePlaceholder')}
                        />
                        <div>
                            <p className="mb-1.5 text-label font-medium text-foreground">{t('calendar:external.colorLabel')}</p>
                            <ColorChoice value={color} onChange={setColor} label={t('calendar:external.colorLabel')} />
                        </div>
                        {members.length > 0 && (
                            <div>
                                <p className="mb-1.5 text-label font-medium text-foreground">{t('calendar:external.membersLabel')}</p>
                                <MemberChoice members={members} value={memberIds} onChange={setMemberIds} />
                            </div>
                        )}
                        {formError && <p className="text-caption text-danger">{formError}</p>}
                        <div className="flex justify-end gap-2">
                            <Button type="button" variant="ghost" size="sm" onClick={() => setFormOpen(false)}>
                                {t('common:actions.cancel')}
                            </Button>
                            <Button type="submit" size="sm" disabled={saving}>
                                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                {editingId ? t('common:actions.save') : t('calendar:external.follow')}
                            </Button>
                        </div>
                        {!editingId && <p className="text-micro text-muted-foreground">{t('calendar:external.refreshNote')}</p>}
                    </form>
                )}
            </section>

            {/* One-off file import */}
            {canManage && (
                <section className="space-y-2 border-t border-border pt-4">
                    <div>
                        <h3 className="text-body font-semibold text-foreground">{t('calendar:external.importTitle')}</h3>
                        <p className="text-caption text-muted-foreground">{t('calendar:external.importDescription')}</p>
                    </div>
                    <input
                        ref={fileInput}
                        type="file"
                        accept=".ics,.ical,.ifb,.icalendar,text/calendar"
                        className="hidden"
                        onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) void importFile(file);
                        }}
                    />
                    <Button type="button" variant="secondary" size="sm" disabled={importing} onClick={() => fileInput.current?.click()}>
                        {importing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                        {t('calendar:external.importButton')}
                    </Button>
                    {importMessage && (
                        <p className={`text-caption ${importMessage.ok ? 'text-success' : 'text-danger'}`}>{importMessage.text}</p>
                    )}
                </section>
            )}
        </div>
    );
};

export default ExternalCalendars;
