import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Copy, Send, Trash2, Webhook as WebhookIcon } from 'lucide-react';
import { Card, CardContent, Button, Input, Badge } from '../ui';
import { api, ApiError } from '../../lib/api';
import { formatDateTime } from '../../i18n/format';

interface Webhook {
    id: string;
    name: string;
    url_host: string;
    /** The kinds of change it is told about; empty for all of them. */
    events: string[];
    enabled: boolean;
    created_at: string;
    last_delivery_at: string | null;
    last_status: number | null;
    last_error: string | null;
    failure_count: number;
}

interface Delivery { ok: boolean; status: number; error: string | null }

const MAX_NAME_LENGTH = 80;
const MAX_FAILURES = 20;

// Each kind of change is named like the page it belongs to.
const ENTITY_LABELS: Record<string, string> = {
    shopping: 'nav:items.shopping',
    tasks: 'nav:items.tasks',
    appointments: 'nav:items.calendar',
    'meal-plans': 'nav:items.meals',
    planning: 'nav:items.planning',
    recipes: 'nav:items.recipes',
    notes: 'notes:title',
    posts: 'nav:items.posts',
    family: 'nav:items.family',
    budget: 'nav:items.budget',
    rewards: 'nav:items.rewards',
};

/**
 * Settings card, for parents: outgoing webhooks. OpenFamily calls each
 * registered address when the family's data changes, saying what kind of
 * thing changed; the program at the other end then reads what it needs with
 * an API token. The signing secret is shown once, when the webhook is added.
 */
const WebhooksCard: React.FC = () => {
    const { t } = useTranslation(['settings', 'nav', 'notes']);
    const [hooks, setHooks] = useState<Webhook[] | null>(null);
    const [entities, setEntities] = useState<string[]>([]);
    const [name, setName] = useState('');
    const [url, setUrl] = useState('');
    const [events, setEvents] = useState<string[]>([]);
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState('');
    const [fresh, setFresh] = useState<{ name: string; secret: string } | null>(null);
    const [copied, setCopied] = useState(false);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [tested, setTested] = useState<{ id: string; delivery: Delivery } | null>(null);

    useEffect(() => {
        api.get<{ success: boolean; data: Webhook[]; entities: string[] }>('/api/webhooks')
            .then((res) => {
                setHooks(res.data);
                setEntities(res.entities ?? []);
            })
            .catch(() => setHooks([]));
    }, []);

    const label = (entity: string): string => t(ENTITY_LABELS[entity] ?? entity, { defaultValue: entity });
    const replace = (next: Webhook) => setHooks((prev) => (prev ?? []).map((hook) => (hook.id === next.id ? next : hook)));

    const create = async (event: React.FormEvent) => {
        event.preventDefault();
        const trimmedName = name.trim();
        const trimmedUrl = url.trim();
        if (!trimmedName || !trimmedUrl || creating) return;
        setCreating(true);
        setError('');
        try {
            const res = await api.post<{ success: boolean; data: Webhook & { secret: string } }>('/api/webhooks', {
                name: trimmedName,
                url: trimmedUrl,
                events,
            });
            const { secret, ...created } = res.data;
            setHooks((prev) => [...(prev ?? []), created]);
            setFresh({ name: created.name, secret });
            setCopied(false);
            setName('');
            setUrl('');
            setEvents([]);
        } catch (e) {
            if (e instanceof ApiError && e.status === 409) setError(t('webhooks.limit'));
            else if (e instanceof ApiError && e.status === 400) setError(t('webhooks.invalidUrl'));
            else setError(t('webhooks.error'));
        } finally {
            setCreating(false);
        }
    };

    const toggle = async (hook: Webhook) => {
        setBusyId(hook.id);
        setError('');
        try {
            const res = await api.put<{ success: boolean; data: Webhook }>(`/api/webhooks/${hook.id}`, { enabled: !hook.enabled });
            replace(res.data);
        } catch {
            setError(t('webhooks.error'));
        } finally {
            setBusyId(null);
        }
    };

    const test = async (hook: Webhook) => {
        setBusyId(hook.id);
        setError('');
        setTested(null);
        try {
            const res = await api.post<{ success: boolean; data: { delivery: Delivery; webhook: Webhook } }>(
                `/api/webhooks/${hook.id}/test`,
                {},
            );
            replace(res.data.webhook);
            setTested({ id: hook.id, delivery: res.data.delivery });
        } catch {
            setError(t('webhooks.error'));
        } finally {
            setBusyId(null);
        }
    };

    const remove = async (hook: Webhook) => {
        if (!window.confirm(t('webhooks.confirmRemove', { name: hook.name }))) return;
        setError('');
        try {
            await api.delete(`/api/webhooks/${hook.id}`);
            setHooks((prev) => (prev ?? []).filter((item) => item.id !== hook.id));
        } catch {
            setError(t('webhooks.error'));
        }
    };

    const copy = async () => {
        if (!fresh) return;
        try {
            await navigator.clipboard.writeText(fresh.secret);
            setCopied(true);
        } catch {
            // No clipboard here (plain http, some web views): the field can still be selected by hand.
        }
    };

    const outcome = (hook: Webhook): string => {
        if (!hook.last_delivery_at) return t('webhooks.never');
        const date = formatDateTime(hook.last_delivery_at);
        return hook.last_error
            ? t('webhooks.lastFailed', { date, reason: hook.last_error })
            : t('webhooks.lastOk', { date, status: hook.last_status });
    };

    return (
        <Card>
            <CardContent className="p-6">
                <div className="flex items-start gap-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-card bg-primary-soft text-primary">
                        <WebhookIcon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <h3 className="text-caption font-semibold text-foreground">{t('webhooks.title')}</h3>
                        <p className="mt-1 text-micro text-muted-foreground">{t('webhooks.subtitle')}</p>

                        {fresh && (
                            <div className="mt-4 rounded-input border border-primary/40 bg-surface-2 p-3">
                                <p className="text-caption font-semibold text-foreground">{t('webhooks.created', { name: fresh.name })}</p>
                                <p className="mt-1 text-micro text-muted-foreground">{t('webhooks.createdHint')}</p>
                                <div className="mt-2 flex items-center gap-2">
                                    <input
                                        readOnly
                                        value={fresh.secret}
                                        aria-label={t('webhooks.secret')}
                                        onFocus={(e) => e.target.select()}
                                        className="min-w-0 flex-1 rounded-input border border-border bg-surface-1 px-3 py-2 font-mono text-caption text-foreground"
                                    />
                                    <Button
                                        type="button"
                                        variant="secondary"
                                        size="icon"
                                        className="shrink-0"
                                        aria-label={t('webhooks.copy')}
                                        title={t('webhooks.copy')}
                                        onClick={() => void copy()}
                                    >
                                        {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
                                    </Button>
                                </div>
                                <Button type="button" variant="secondary" size="sm" className="mt-3" onClick={() => setFresh(null)}>
                                    {t('webhooks.done')}
                                </Button>
                            </div>
                        )}

                        {hooks !== null && hooks.length === 0 && (
                            <p className="mt-4 text-micro text-muted-foreground">{t('webhooks.empty')}</p>
                        )}

                        {hooks !== null && hooks.length > 0 && (
                            <ul className="mt-4 space-y-3">
                                {hooks.map((hook) => (
                                    <li key={hook.id} className="rounded-input border border-border p-3">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <p className="truncate text-caption font-semibold text-foreground">{hook.name}</p>
                                            {!hook.enabled && (
                                                <Badge variant="danger">
                                                    {hook.failure_count >= MAX_FAILURES ? t('webhooks.offAfterFailures') : t('webhooks.off')}
                                                </Badge>
                                            )}
                                        </div>
                                        <p className="mt-1 text-micro text-muted-foreground">
                                            <span className="font-mono">{hook.url_host}</span>
                                            {' · '}
                                            {hook.events.length === 0 ? t('webhooks.allEvents') : hook.events.map(label).join(', ')}
                                        </p>
                                        <p className={`text-micro ${hook.last_error ? 'text-danger' : 'text-muted-foreground'}`}>{outcome(hook)}</p>
                                        {tested?.id === hook.id && (
                                            <p className={`mt-1 text-micro ${tested.delivery.ok ? 'text-success' : 'text-danger'}`}>
                                                {tested.delivery.ok
                                                    ? t('webhooks.testOk', { status: tested.delivery.status })
                                                    : t('webhooks.testFailed', { reason: tested.delivery.error ?? '' })}
                                            </p>
                                        )}
                                        <div className="mt-2 flex flex-wrap gap-2">
                                            <Button type="button" variant="secondary" size="sm" disabled={busyId === hook.id} onClick={() => void test(hook)}>
                                                <Send className="mr-2 h-4 w-4" />
                                                {t('webhooks.test')}
                                            </Button>
                                            <Button type="button" variant="ghost" size="sm" disabled={busyId === hook.id} onClick={() => void toggle(hook)}>
                                                {hook.enabled ? t('webhooks.disable') : t('webhooks.enable')}
                                            </Button>
                                            <Button type="button" variant="ghost" size="sm" className="text-danger" onClick={() => void remove(hook)}>
                                                <Trash2 className="mr-2 h-4 w-4" />
                                                {t('webhooks.remove')}
                                            </Button>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}

                        <form onSubmit={(event) => void create(event)} className="mt-4 space-y-2">
                            <div className="flex flex-wrap gap-2">
                                <div className="min-w-[9rem] flex-1">
                                    <Input
                                        value={name}
                                        maxLength={MAX_NAME_LENGTH}
                                        onChange={(e) => setName(e.target.value)}
                                        placeholder={t('webhooks.namePlaceholder')}
                                        aria-label={t('webhooks.nameLabel')}
                                    />
                                </div>
                                <div className="min-w-[14rem] flex-[2]">
                                    <Input
                                        value={url}
                                        type="url"
                                        onChange={(e) => setUrl(e.target.value)}
                                        placeholder={t('webhooks.urlPlaceholder')}
                                        aria-label={t('webhooks.urlLabel')}
                                        autoComplete="off"
                                        spellCheck={false}
                                    />
                                </div>
                            </div>
                            {entities.length > 0 && (
                                <div>
                                    <p className="text-micro text-muted-foreground">{t('webhooks.eventsLabel')}</p>
                                    <div role="group" aria-label={t('webhooks.eventsLabel')} className="mt-1 flex flex-wrap gap-1.5">
                                        <button
                                            type="button"
                                            aria-pressed={events.length === 0}
                                            onClick={() => setEvents([])}
                                            className={`rounded-pill border px-3 py-1 text-micro transition-colors ${
                                                events.length === 0
                                                    ? 'border-primary/30 bg-primary-soft font-medium text-primary'
                                                    : 'border-border text-muted-foreground hover:text-foreground'
                                            }`}
                                        >
                                            {t('webhooks.allEvents')}
                                        </button>
                                        {entities.map((entity) => {
                                            const on = events.includes(entity);
                                            return (
                                                <button
                                                    key={entity}
                                                    type="button"
                                                    aria-pressed={on}
                                                    onClick={() => setEvents((prev) => (on ? prev.filter((item) => item !== entity) : [...prev, entity]))}
                                                    className={`rounded-pill border px-3 py-1 text-micro transition-colors ${
                                                        on
                                                            ? 'border-primary/30 bg-primary-soft font-medium text-primary'
                                                            : 'border-border text-muted-foreground hover:text-foreground'
                                                    }`}
                                                >
                                                    {label(entity)}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                            <Button type="submit" variant="secondary" size="sm" disabled={!name.trim() || !url.trim() || creating}>
                                {t('webhooks.create')}
                            </Button>
                        </form>
                        {error && <p className="mt-2 text-micro text-danger">{error}</p>}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
};

export default WebhooksCard;
