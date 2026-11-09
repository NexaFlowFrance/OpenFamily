import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Copy, ExternalLink, Tablet, Trash2 } from 'lucide-react';
import { Card, CardContent, Button, Input } from '../ui';
import { api, ApiError } from '../../lib/api';
import { apiBase } from '../../lib/serverConfig';
import { formatDateTime, intlLocale } from '../../i18n/format';

interface DisplayLink {
    id: string;
    name: string;
    token: string;
    locale: string;
    created_at: string;
    last_used_at: string | null;
}

const MAX_NAME_LENGTH = 80;

/**
 * Settings card, for parents: display links. Each one is a stable address that
 * shows the family's day without signing in, for a screen that cannot sign in
 * (e-paper frame, e-reader, wall display). The page itself is rendered by the
 * server; this card only creates, shows and revokes the links.
 */
const DisplayLinksCard: React.FC = () => {
    const { t } = useTranslation('settings');
    const [links, setLinks] = useState<DisplayLink[] | null>(null);
    const [name, setName] = useState('');
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState('');
    const [copiedId, setCopiedId] = useState<string | null>(null);

    // In same-origin builds apiBase() is '': the page's own origin makes the address absolute.
    const addressOf = (link: DisplayLink): string => `${apiBase() || window.location.origin}/api/display/${link.token}`;

    useEffect(() => {
        api.get<{ success: boolean; data: DisplayLink[] }>('/api/display-links')
            .then((res) => setLinks(res.data))
            .catch(() => setLinks([]));
    }, []);

    const create = async (event: React.FormEvent) => {
        event.preventDefault();
        const trimmed = name.trim();
        if (!trimmed || creating) return;
        setCreating(true);
        setError('');
        try {
            // The page is written in this browser's language and regional style
            // (3:00 PM or 15:00): the screen itself has neither.
            const res = await api.post<{ success: boolean; data: DisplayLink }>('/api/display-links', {
                name: trimmed,
                locale: intlLocale(),
            });
            setLinks((prev) => [...(prev ?? []), res.data]);
            setName('');
        } catch (e) {
            setError(e instanceof ApiError && e.status === 409 ? t('displayLinks.limit') : t('displayLinks.error'));
        } finally {
            setCreating(false);
        }
    };

    const revoke = async (link: DisplayLink) => {
        if (!window.confirm(t('displayLinks.confirmRevoke', { name: link.name }))) return;
        setError('');
        try {
            await api.delete(`/api/display-links/${link.id}`);
            setLinks((prev) => (prev ?? []).filter((item) => item.id !== link.id));
        } catch {
            setError(t('displayLinks.error'));
        }
    };

    const copy = async (link: DisplayLink) => {
        try {
            await navigator.clipboard.writeText(addressOf(link));
            setCopiedId(link.id);
            window.setTimeout(() => setCopiedId((current) => (current === link.id ? null : current)), 2000);
        } catch {
            // No clipboard here (plain http, some web views): the field can still be selected by hand.
        }
    };

    return (
        <Card>
            <CardContent className="p-6">
                <div className="flex items-start gap-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-card bg-primary-soft text-primary">
                        <Tablet className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <h3 className="text-caption font-semibold text-foreground">{t('displayLinks.title')}</h3>
                        <p className="mt-1 text-micro text-muted-foreground">{t('displayLinks.subtitle')}</p>

                        {links !== null && links.length === 0 && (
                            <p className="mt-4 text-micro text-muted-foreground">{t('displayLinks.empty')}</p>
                        )}

                        {links !== null && links.length > 0 && (
                            <ul className="mt-4 space-y-3">
                                {links.map((link) => (
                                    <li key={link.id} className="rounded-input border border-border p-3">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <p className="truncate text-caption font-semibold text-foreground">{link.name}</p>
                                                <p className="text-micro text-muted-foreground">
                                                    {link.last_used_at
                                                        ? t('displayLinks.lastUsed', { date: formatDateTime(link.last_used_at) })
                                                        : t('displayLinks.neverUsed')}
                                                </p>
                                            </div>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                className="shrink-0 text-danger"
                                                onClick={() => void revoke(link)}
                                            >
                                                <Trash2 className="mr-2 h-4 w-4" />
                                                {t('displayLinks.revoke')}
                                            </Button>
                                        </div>
                                        <div className="mt-2 flex items-center gap-2">
                                            <input
                                                readOnly
                                                value={addressOf(link)}
                                                aria-label={t('displayLinks.address', { name: link.name })}
                                                onFocus={(e) => e.target.select()}
                                                className="min-w-0 flex-1 rounded-input border border-border bg-surface-1 px-3 py-2 text-caption text-foreground"
                                            />
                                            <Button
                                                type="button"
                                                variant="secondary"
                                                size="icon"
                                                className="shrink-0"
                                                aria-label={t('displayLinks.copy')}
                                                title={t('displayLinks.copy')}
                                                onClick={() => void copy(link)}
                                            >
                                                {copiedId === link.id ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
                                            </Button>
                                            <a
                                                href={addressOf(link)}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                aria-label={t('displayLinks.open')}
                                                title={t('displayLinks.open')}
                                                className="btn-nexus btn-secondary flex h-10 w-10 shrink-0 items-center justify-center"
                                            >
                                                <ExternalLink className="h-4 w-4" />
                                            </a>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}

                        <form onSubmit={(event) => void create(event)} className="mt-4 flex items-end gap-2">
                            <Input
                                value={name}
                                maxLength={MAX_NAME_LENGTH}
                                onChange={(e) => setName(e.target.value)}
                                placeholder={t('displayLinks.namePlaceholder')}
                                aria-label={t('displayLinks.nameLabel')}
                            />
                            <Button type="submit" variant="secondary" size="sm" className="shrink-0" disabled={!name.trim() || creating}>
                                {t('displayLinks.create')}
                            </Button>
                        </form>
                        {error && <p className="mt-2 text-micro text-danger">{error}</p>}

                        <p className="mt-4 text-micro text-muted-foreground">{t('displayLinks.warning')}</p>
                        <p className="mt-1 text-micro text-muted-foreground">
                            {t('displayLinks.options', { show: '?show=schedule,tasks', scale: '?scale=1.3' })}
                        </p>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
};

export default DisplayLinksCard;
