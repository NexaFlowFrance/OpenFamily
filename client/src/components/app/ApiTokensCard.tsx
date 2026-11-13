import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Copy, KeyRound, Trash2 } from 'lucide-react';
import { Card, CardContent, Button, Input, Select, Badge } from '../ui';
import { api, ApiError } from '../../lib/api';
import { formatDateTime } from '../../i18n/format';

type Scope = 'read' | 'write';

interface ApiToken {
    id: string;
    name: string;
    token_prefix: string;
    scope: Scope;
    created_at: string;
    last_used_at: string | null;
    created_by: string | null;
}

const MAX_NAME_LENGTH = 80;

/**
 * Settings card, for parents: personal API tokens, so that another program
 * (Home Assistant, Gladys Assistant, n8n, a script) can read or add to the
 * family's data. The secret is shown once, when the token is made; the list
 * only shows how each token starts, who made it and when it was last used.
 */
const ApiTokensCard: React.FC = () => {
    const { t } = useTranslation('settings');
    const [tokens, setTokens] = useState<ApiToken[] | null>(null);
    const [name, setName] = useState('');
    const [scope, setScope] = useState<Scope>('read');
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState('');
    const [fresh, setFresh] = useState<{ name: string; token: string } | null>(null);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        api.get<{ success: boolean; data: ApiToken[] }>('/api/api-tokens')
            .then((res) => setTokens(res.data))
            .catch(() => setTokens([]));
    }, []);

    const create = async (event: React.FormEvent) => {
        event.preventDefault();
        const trimmed = name.trim();
        if (!trimmed || creating) return;
        setCreating(true);
        setError('');
        try {
            const res = await api.post<{ success: boolean; data: ApiToken & { token: string } }>('/api/api-tokens', {
                name: trimmed,
                scope,
            });
            const { token, ...created } = res.data;
            setTokens((prev) => [...(prev ?? []), created]);
            setFresh({ name: created.name, token });
            setCopied(false);
            setName('');
        } catch (e) {
            setError(e instanceof ApiError && e.status === 409 ? t('apiTokens.limit') : t('apiTokens.error'));
        } finally {
            setCreating(false);
        }
    };

    const revoke = async (token: ApiToken) => {
        if (!window.confirm(t('apiTokens.confirmRevoke', { name: token.name }))) return;
        setError('');
        try {
            await api.delete(`/api/api-tokens/${token.id}`);
            setTokens((prev) => (prev ?? []).filter((item) => item.id !== token.id));
        } catch {
            setError(t('apiTokens.error'));
        }
    };

    const copy = async () => {
        if (!fresh) return;
        try {
            await navigator.clipboard.writeText(fresh.token);
            setCopied(true);
        } catch {
            // No clipboard here (plain http, some web views): the field can still be selected by hand.
        }
    };

    const scopeLabel = (value: Scope) => (value === 'write' ? t('apiTokens.scopeWrite') : t('apiTokens.scopeRead'));
    const scopeOptions = [
        { value: 'read', label: t('apiTokens.scopeRead') },
        { value: 'write', label: t('apiTokens.scopeWrite') },
    ];

    return (
        <Card>
            <CardContent className="p-6">
                <div className="flex items-start gap-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-card bg-primary-soft text-primary">
                        <KeyRound className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <h3 className="text-caption font-semibold text-foreground">{t('apiTokens.title')}</h3>
                        <p className="mt-1 text-micro text-muted-foreground">{t('apiTokens.subtitle')}</p>

                        {fresh && (
                            <div className="mt-4 rounded-input border border-primary/40 bg-surface-2 p-3">
                                <p className="text-caption font-semibold text-foreground">
                                    {t('apiTokens.created', { name: fresh.name })}
                                </p>
                                <p className="mt-1 text-micro text-muted-foreground">{t('apiTokens.createdHint')}</p>
                                <div className="mt-2 flex items-center gap-2">
                                    <input
                                        readOnly
                                        value={fresh.token}
                                        aria-label={t('apiTokens.secret')}
                                        onFocus={(e) => e.target.select()}
                                        className="min-w-0 flex-1 rounded-input border border-border bg-surface-1 px-3 py-2 font-mono text-caption text-foreground"
                                    />
                                    <Button
                                        type="button"
                                        variant="secondary"
                                        size="icon"
                                        className="shrink-0"
                                        aria-label={t('apiTokens.copy')}
                                        title={t('apiTokens.copy')}
                                        onClick={() => void copy()}
                                    >
                                        {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
                                    </Button>
                                </div>
                                <Button type="button" variant="secondary" size="sm" className="mt-3" onClick={() => setFresh(null)}>
                                    {t('apiTokens.done')}
                                </Button>
                            </div>
                        )}

                        {tokens !== null && tokens.length === 0 && (
                            <p className="mt-4 text-micro text-muted-foreground">{t('apiTokens.empty')}</p>
                        )}

                        {tokens !== null && tokens.length > 0 && (
                            <ul className="mt-4 space-y-3">
                                {tokens.map((token) => (
                                    <li key={token.id} className="rounded-input border border-border p-3">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <p className="truncate text-caption font-semibold text-foreground">{token.name}</p>
                                                    <Badge variant={token.scope === 'write' ? 'warning' : 'secondary'}>
                                                        {scopeLabel(token.scope)}
                                                    </Badge>
                                                </div>
                                                <p className="mt-1 text-micro text-muted-foreground">
                                                    <span className="font-mono">{token.token_prefix}…</span>
                                                    {token.created_by && (
                                                        <span>{' · '}{t('apiTokens.createdBy', { name: token.created_by })}</span>
                                                    )}
                                                </p>
                                                <p className="text-micro text-muted-foreground">
                                                    {token.last_used_at
                                                        ? t('apiTokens.lastUsed', { date: formatDateTime(token.last_used_at) })
                                                        : t('apiTokens.neverUsed')}
                                                </p>
                                            </div>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                className="shrink-0 text-danger"
                                                onClick={() => void revoke(token)}
                                            >
                                                <Trash2 className="mr-2 h-4 w-4" />
                                                {t('apiTokens.revoke')}
                                            </Button>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}

                        <form onSubmit={(event) => void create(event)} className="mt-4 flex flex-wrap items-end gap-2">
                            <div className="min-w-[10rem] flex-1">
                                <Input
                                    value={name}
                                    maxLength={MAX_NAME_LENGTH}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder={t('apiTokens.namePlaceholder')}
                                    aria-label={t('apiTokens.nameLabel')}
                                />
                            </div>
                            <Select
                                className="w-44"
                                value={scope}
                                onValueChange={(value) => setScope(value === 'write' ? 'write' : 'read')}
                                options={scopeOptions}
                            />
                            <Button type="submit" variant="secondary" size="sm" className="shrink-0" disabled={!name.trim() || creating}>
                                {t('apiTokens.create')}
                            </Button>
                        </form>
                        {error && <p className="mt-2 text-micro text-danger">{error}</p>}

                        <p className="mt-4 text-micro text-muted-foreground">{t('apiTokens.warning')}</p>
                        <p className="mt-1 text-micro text-muted-foreground">
                            {t('apiTokens.usage', { header: 'Authorization: Bearer ofk_…' })}
                        </p>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
};

export default ApiTokensCard;
