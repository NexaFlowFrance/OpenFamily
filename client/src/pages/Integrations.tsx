import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { CheckCircle2, AlertCircle, RefreshCw, Unplug, Plug, X, Clock } from 'lucide-react';
import { cn } from '../lib/utils';
import { intlLocale } from '../i18n/format';

// Brand SVG icons (Simple Icons paths, viewBox 0 0 24 24)
const BRAND_SVG: Record<string, { path: string; hex: string }> = {
    mealie: {
        hex: 'E58325',
        path: 'M6.619 13.59 1.444 8.427c-1.925-1.939-1.925-5.063 0-6.989l8.666 8.642-3.491 3.51m6.551-.42 8.51 8.49-1.76 1.74-8.48-8.48-8.502 8.48-1.741-1.74L13.12 9.739l-.25-.272a2.448 2.448 0 0 1 0-3.472L18.23.6l1.14 1.135-3.99 4.024 1.18 1.161 3.99-4.012 1.15 1.136-4.01 4 1.15 1.189 4.03-4.017L24 6.377l-5.4 5.353c-.95.96-2.51.96-3.46 0l-.27-.25z',
    },
    homeassistant: {
        hex: '18BCF2',
        path: 'M22.939 10.627 13.061.749a1.505 1.505 0 0 0-2.121 0l-9.879 9.878C.478 11.21 0 12.363 0 13.187v9c0 .826.675 1.5 1.5 1.5h9.227l-4.063-4.062a2.034 2.034 0 0 1-.664.113c-1.13 0-2.05-.92-2.05-2.05s.92-2.05 2.05-2.05 2.05.92 2.05 2.05c0 .233-.041.456-.113.665l3.163 3.163V9.928a2.05 2.05 0 0 1-1.15-1.84c0-1.13.92-2.05 2.05-2.05s2.05.92 2.05 2.05a2.05 2.05 0 0 1-1.15 1.84v8.127l3.146-3.146A2.051 2.051 0 0 1 18 12.239c1.13 0 2.05.92 2.05 2.05s-.92 2.05-2.05 2.05c-.25 0-.488-.047-.709-.13L12.9 20.602v3.088h9.6c.825 0 1.5-.675 1.5-1.5v-9c0-.825-.477-1.977-1.061-2.561z',
    },
    grocy: {
        hex: '337AB7',
        path: 'M12.621.068C7.527.786 3.608 4.618 2.345 10.082c-.316 1.35-.392 3.896-.163 5.203.62 3.57 2.96 6.574 6.15 7.913 1.36.577 2.1.73 3.842.784 1.22.043 1.862.01 2.722-.13 2.688-.447 5.399-1.699 6.65-3.092l.403-.447-.054-1.872a481.92 481.92 0 0 1-.12-5.344l-.065-3.473-2.907.087c-1.589.033-3.722.098-4.746.142l-1.85.065-.087 2.319c-.055 1.284-.076 2.34-.055 2.362.022.022.882.076 1.916.12l1.872.076v.294c0 .707-.13.98-.555 1.208-.653.326-1.872.479-2.623.326-2.71-.566-3.777-4.55-1.96-7.369C11.86 7.48 13.873 6.62 16.562 6.74c.74.043 1.665.163 2.123.272.446.12.838.174.87.12.098-.142.468-5.726.403-5.9-.087-.24-1.35-.697-2.569-.947-1.252-.25-3.722-.37-4.767-.218z',
    },
    immich: {
        hex: '4250AF',
        path: 'M11.9863.2695c-2.409 0-5.207 1.091-5.207 3.8946v.1523c1.3428.597 2.9347 1.6629 4.4121 2.9707 1.5713 1.3912 2.8374 2.8821 3.6524 4.2871 1.3997-2.5034 2.3358-5.4784 2.3476-7.373V4.164c0-2.8035-2.796-3.8946-5.205-3.8946m7.5117 4.4903c-.3778-.0081-.7747.0502-1.1914.1855-.0366.0118-.086.0278-.1445.0469-.1525 1.4611-.6756 3.304-1.4629 5.1133-.8373 1.9243-1.8627 3.5898-2.9472 4.7988 2.8132.558 5.9307.5273 7.7363-.0469.0126-.004.0246-.0065.0351-.0097 2.6665-.8666 2.84-3.8636 2.0957-6.1543-.6279-1.9332-2.081-3.89-4.121-3.9336m-14.996.039C2.4618 4.8424 1.0088 6.7973.3809 8.7305c-.7442 2.291-.5708 5.288 2.0957 6.1543l.1445.0468c.982-1.0926 2.4873-2.2761 4.1875-3.2773 1.8088-1.0646 3.619-1.808 5.207-2.1484-1.9483-2.1049-4.4884-3.9132-6.287-4.5098l-.0352-.0117c-.4167-.1354-.8136-.1936-1.1914-.1856m4.6718 6.7578c-2.6038 1.2025-5.1088 3.0598-6.2324 4.586l-.0215.0293c-1.6478 2.2683-.0272 4.7953 1.9219 6.211 1.9487 1.4159 4.8518 2.1765 6.5-.0919.0228-.0309.0536-.071.0898-.121-.7356-1.2717-1.396-3.0718-1.8222-4.9981-.4534-2.0492-.6023-4-.4356-5.6153m1.0723 3.338c.3387 2.8478 1.3315 5.8037 2.4355 7.3437l.0215.0293c1.6478 2.2683 4.551 1.5078 6.5.0918 1.9487-1.416 3.5697-3.943 1.9219-6.211-.0228-.0309-.0517-.073-.0879-.123-1.4367.3066-3.3522.3794-5.3164.1894-2.089-.2017-3.9895-.6623-5.4746-1.3203',
    },
    nextcloud: {
        hex: '0082C9',
        path: 'M12.018 6.537c-2.5 0-4.6 1.712-5.241 4.015-.56-1.232-1.793-2.105-3.225-2.105A3.569 3.569 0 0 0 0 12a3.569 3.569 0 0 0 3.552 3.553c1.432 0 2.664-.874 3.224-2.106.641 2.304 2.742 4.016 5.242 4.016 2.487 0 4.576-1.693 5.231-3.977.569 1.21 1.783 2.067 3.198 2.067A3.568 3.568 0 0 0 24 12a3.569 3.569 0 0 0-3.553-3.553c-1.416 0-2.63.858-3.199 2.067-.654-2.284-2.743-3.978-5.23-3.977zm0 2.085c1.878 0 3.378 1.5 3.378 3.378 0 1.878-1.5 3.378-3.378 3.378A3.362 3.362 0 0 1 8.641 12c0-1.878 1.5-3.378 3.377-3.378zm-8.466 1.91c.822 0 1.467.645 1.467 1.468s-.644 1.467-1.467 1.468A1.452 1.452 0 0 1 2.085 12c0-.823.644-1.467 1.467-1.467zm16.895 0c.823 0 1.468.645 1.468 1.468s-.645 1.468-1.468 1.468A1.452 1.452 0 0 1 18.98 12c0-.823.644-1.467 1.467-1.467z',
    },
};

// For Tandoor we use the real PNG logo placed in public/
const IMG_ICONS: Record<string, string> = {
    tandoor: `${import.meta.env.BASE_URL}tandoor.png`,
};

function BrandIcon({ id, size = 20 }: { id: string; size?: number }) {
    if (IMG_ICONS[id]) {
        return (
            <img
                src={IMG_ICONS[id]}
                alt={id}
                width={size}
                height={size}
                style={{ objectFit: 'contain', flexShrink: 0 }}
            />
        );
    }
    const icon = BRAND_SVG[id];
    if (!icon) return null;
    return (
        <svg viewBox="0 0 24 24" width={size} height={size} fill={`#${icon.hex}`} aria-hidden="true" style={{ flexShrink: 0 }}>
            <path d={icon.path} />
        </svg>
    );
}

interface Integration {
    id: string;
    type: string;
    display_name: string;
    base_url: string;
    status: 'connected' | 'syncing' | 'error';
    last_synced_at: string | null;
    last_error: string | null;
}

interface FieldDef {
    key: string;
    label: string;
    placeholder: string;
    type: 'text' | 'url' | 'password';
    optional?: boolean;
}

interface CatalogItem {
    id: string;
    name: string;
    tagline: string;
    description: string;
    syncs: string[];
    fields: FieldDef[];
}

const Integrations: React.FC = () => {
    const { t } = useTranslation(['integrations', 'common']);
    const CATALOG: CatalogItem[] = [
        {
            id: 'mealie',
            name: 'Mealie',
            tagline: t('integrations:catalog.mealie.tagline'),
            description: t('integrations:catalog.mealie.description'),
            syncs: [t('integrations:syncs.recipes'), t('integrations:syncs.menus')],
            fields: [
                { key: 'base_url', label: t('integrations:catalog.mealie.urlLabel'), placeholder: t('integrations:catalog.mealie.urlPlaceholder'), type: 'url' },
                { key: 'apiKey', label: t('integrations:catalog.mealie.keyLabel'), placeholder: t('integrations:catalog.mealie.keyPlaceholder'), type: 'password' },
            ],
        },
        {
            id: 'tandoor',
            name: 'Tandoor',
            tagline: t('integrations:catalog.tandoor.tagline'),
            description: t('integrations:catalog.tandoor.description'),
            syncs: [t('integrations:syncs.recipes')],
            fields: [
                { key: 'base_url', label: t('integrations:catalog.tandoor.urlLabel'), placeholder: t('integrations:catalog.tandoor.urlPlaceholder'), type: 'url' },
                { key: 'apiKey', label: t('integrations:catalog.tandoor.keyLabel'), placeholder: t('integrations:catalog.tandoor.keyPlaceholder'), type: 'password' },
            ],
        },
        {
            id: 'homeassistant',
            name: 'Home Assistant',
            tagline: t('integrations:catalog.homeassistant.tagline'),
            description: t('integrations:catalog.homeassistant.description'),
            syncs: [t('integrations:syncs.shopping')],
            fields: [
                { key: 'base_url', label: t('integrations:catalog.homeassistant.urlLabel'), placeholder: t('integrations:catalog.homeassistant.urlPlaceholder'), type: 'url' },
                { key: 'token', label: t('integrations:catalog.homeassistant.tokenLabel'), placeholder: t('integrations:catalog.homeassistant.tokenPlaceholder'), type: 'password' },
                { key: 'ha_entity_id', label: t('integrations:catalog.homeassistant.entityLabel'), placeholder: t('integrations:catalog.homeassistant.entityPlaceholder'), type: 'text', optional: true },
            ],
        },
        {
            id: 'grocy',
            name: 'Grocy',
            tagline: t('integrations:catalog.grocy.tagline'),
            description: t('integrations:catalog.grocy.description'),
            syncs: [t('integrations:syncs.shopping'), t('integrations:syncs.stock')],
            fields: [
                { key: 'base_url', label: t('integrations:catalog.grocy.urlLabel'), placeholder: t('integrations:catalog.grocy.urlPlaceholder'), type: 'url' },
                { key: 'apiKey', label: t('integrations:catalog.grocy.keyLabel'), placeholder: t('integrations:catalog.grocy.keyPlaceholder'), type: 'password' },
            ],
        },
        {
            id: 'nextcloud',
            name: 'Nextcloud',
            tagline: t('integrations:catalog.nextcloud.tagline'),
            description: t('integrations:catalog.nextcloud.description'),
            syncs: [t('integrations:syncs.calendar'), t('integrations:syncs.appointments')],
            fields: [
                { key: 'base_url', label: t('integrations:catalog.nextcloud.urlLabel'), placeholder: t('integrations:catalog.nextcloud.urlPlaceholder'), type: 'url' },
                { key: 'username', label: t('integrations:catalog.nextcloud.userLabel'), placeholder: t('integrations:catalog.nextcloud.userPlaceholder'), type: 'text' },
                { key: 'password', label: t('integrations:catalog.nextcloud.passwordLabel'), placeholder: t('integrations:catalog.nextcloud.passwordPlaceholder'), type: 'password' },
            ],
        },
        {
            id: 'immich',
            name: 'Immich',
            tagline: t('integrations:catalog.immich.tagline'),
            description: t('integrations:catalog.immich.description'),
            syncs: [t('integrations:syncs.photos')],
            fields: [
                { key: 'base_url', label: t('integrations:catalog.immich.urlLabel'), placeholder: t('integrations:catalog.immich.urlPlaceholder'), type: 'url' },
                { key: 'apiKey', label: t('integrations:catalog.immich.keyLabel'), placeholder: t('integrations:catalog.immich.keyPlaceholder'), type: 'password' },
            ],
        },
    ];
    const [integrations, setIntegrations] = useState<Integration[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeModal, setActiveModal] = useState<string | null>(null);
    const [formValues, setFormValues] = useState<Record<string, string>>({});
    const [testStatus, setTestStatus] = useState<{ ok: boolean; message: string } | null>(null);
    const [testing, setTesting] = useState(false);
    const [saving, setSaving] = useState(false);
    const [syncingId, setSyncingId] = useState<string | null>(null);

    useEffect(() => { void load(); }, []);

    const load = async () => {
        try {
            const res = await api.get<{ success: boolean; data: Integration[] }>('/api/integrations');
            if (res.success) setIntegrations(res.data);
        } finally {
            setLoading(false);
        }
    };

    const openModal = (type: string) => {
        setActiveModal(type);
        setFormValues({});
        setTestStatus(null);
    };

    const closeModal = () => {
        setActiveModal(null);
        setFormValues({});
        setTestStatus(null);
    };

    const handleTest = async () => {
        if (!activeModal) return;
        setTesting(true);
        setTestStatus(null);
        try {
            const res = await api.post<{ success: boolean; message: string }>('/api/integrations/test', {
                type: activeModal,
                ...formValues,
            });
            setTestStatus({ ok: res.success, message: res.message });
        } catch (e) {
            setTestStatus({ ok: false, message: e instanceof Error ? e.message : t('integrations:modal.error') });
        } finally {
            setTesting(false);
        }
    };

    const handleConnect = async () => {
        if (!activeModal) return;
        setSaving(true);
        try {
            const res = await api.post<{ success: boolean; data: Integration }>('/api/integrations', {
                type: activeModal,
                ...formValues,
            });
            if (res.success) {
                setIntegrations((prev) => [...prev.filter((i) => i.type !== res.data.type), res.data]);
                closeModal();
            }
        } finally {
            setSaving(false);
        }
    };

    const handleDisconnect = async (id: string) => {
        if (!confirm(t('integrations:confirmDisconnect'))) return;
        await api.delete(`/api/integrations/${id}`);
        setIntegrations((prev) => prev.filter((i) => i.id !== id));
    };

    const handleSync = async (id: string) => {
        setSyncingId(id);
        try {
            await api.post(`/api/integrations/${id}/sync`, {});
            await load();
        } finally {
            setSyncingId(null);
        }
    };

    const fmtDate = (iso: string | null) => {
        if (!iso) return null;
        return new Intl.DateTimeFormat(intlLocale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
    };

    const connectedMap = new Map(integrations.map((i) => [i.type, i]));
    const activeCatalog = CATALOG.filter((c) => connectedMap.has(c.id));
    const availableCatalog = CATALOG.filter((c) => !connectedMap.has(c.id));

    if (loading) {
        return (
            <div className="flex h-full items-center justify-center min-h-[50vh]">
                <div className="spinner-brand" />
            </div>
        );
    }

    return (
        <div className="space-y-8 max-w-2xl">
            <div>
                <h1 className="font-serif text-display text-foreground">{t('integrations:title')}</h1>
                <p className="text-caption text-muted-foreground mt-1">
                    {t('integrations:subtitle')}
                </p>
            </div>

            {activeCatalog.length > 0 && (
                <section>
                    <h2 className="font-serif text-h2 mb-4">{t('integrations:connected')}</h2>
                    <div className="rounded-card border border-border bg-card divide-y divide-border overflow-hidden">
                        {activeCatalog.map((item) => {
                            const integ = connectedMap.get(item.id)!;
                            const syncing = syncingId === integ.id || integ.status === 'syncing';
                            return (
                                <div key={item.id} className="flex items-center gap-4 px-5 py-4">
                                    <div className="h-9 w-9 shrink-0 rounded-input flex items-center justify-center bg-surface-2 border border-border">
                                        <BrandIcon id={item.id} size={20} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <p className="text-body font-semibold text-foreground">{item.name}</p>
                                            {integ.status === 'error' ? (
                                                <span className="inline-flex items-center gap-1 text-micro text-danger">
                                                    <AlertCircle className="h-3 w-3" /> {t('integrations:status.error')}
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 text-micro text-success">
                                                    <CheckCircle2 className="h-3 w-3" /> {t('integrations:status.connected')}
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-micro text-muted-foreground truncate">{integ.base_url}</p>
                                        {integ.last_error && (
                                            <p className="text-micro text-danger mt-0.5 line-clamp-1">{integ.last_error}</p>
                                        )}
                                        {integ.last_synced_at && (
                                            <p className="text-micro text-muted-foreground mt-0.5 flex items-center gap-1">
                                                <Clock className="h-3 w-3" />
                                                {t('integrations:lastSync', { date: fmtDate(integ.last_synced_at) })}
                                            </p>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                        <button
                                            type="button"
                                            onClick={() => handleSync(integ.id)}
                                            disabled={syncing}
                                            title={t('integrations:syncTitle')}
                                            className="p-2 rounded-input text-muted-foreground hover:bg-surface-2 hover:text-foreground disabled:opacity-50 transition-colors"
                                        >
                                            <RefreshCw className={cn('h-4 w-4', syncing && 'animate-spin')} />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleDisconnect(integ.id)}
                                            title={t('integrations:disconnectTitle')}
                                            className="p-2 rounded-input text-muted-foreground hover:bg-danger/10 hover:text-danger transition-colors"
                                        >
                                            <Unplug className="h-4 w-4" />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </section>
            )}

            {availableCatalog.length > 0 && (
                <section>
                    <h2 className="font-serif text-h2 mb-4">{t('integrations:available')}</h2>
                    <div className="grid gap-3">
                        {availableCatalog.map((item) => (
                            <button
                                key={item.id}
                                type="button"
                                onClick={() => openModal(item.id)}
                                className="group flex items-center gap-4 rounded-card border border-border bg-card p-5 text-left hover:bg-surface-2 transition-colors"
                            >
                                <div className="h-11 w-11 shrink-0 rounded-input flex items-center justify-center bg-surface-2 border border-border group-hover:border-border-strong transition-colors">
                                    <BrandIcon id={item.id} size={22} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-body font-semibold text-foreground">{item.name}</p>
                                    <p className="text-caption text-muted-foreground">{item.tagline}</p>
                                    <div className="flex flex-wrap gap-1.5 mt-2">
                                        {item.syncs.map((s) => (
                                            <span key={s} className="text-micro px-2 py-0.5 rounded-full border border-border bg-surface-2 text-muted-foreground">
                                                {s}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                                <Plug className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                            </button>
                        ))}
                    </div>
                </section>
            )}

            {/* Connect modal */}
            {activeModal && (() => {
                const item = CATALOG.find((c) => c.id === activeModal)!;
                const canSubmit = item.fields.filter((f) => !f.optional).every((f) => formValues[f.key]);
                return (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={closeModal} />
                        <Card className="relative w-full max-w-md shadow-lg" hover={false}>
                            <CardHeader className="pb-4">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex items-center gap-3">
                                        <div className="h-10 w-10 shrink-0 rounded-input flex items-center justify-center bg-surface-2 border border-border">
                                            <BrandIcon id={item.id} size={22} />
                                        </div>
                                        <div>
                                            <CardTitle className="font-serif text-h2">
                                                {t('integrations:modal.connect', { name: item.name })}
                                            </CardTitle>
                                            <p className="text-caption text-muted-foreground mt-0.5">{item.description}</p>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={closeModal}
                                        className="p-1.5 rounded-input text-muted-foreground hover:bg-surface-2 shrink-0"
                                    >
                                        <X className="h-4 w-4" />
                                    </button>
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {item.fields.map((field) => (
                                    <Input
                                        key={field.key}
                                        label={field.label}
                                        type={field.type}
                                        placeholder={field.placeholder}
                                        value={formValues[field.key] || ''}
                                        onChange={(e) => setFormValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
                                    />
                                ))}

                                {testStatus && (
                                    <div className={cn(
                                        'flex items-start gap-2 rounded-input border p-3 text-caption',
                                        testStatus.ok
                                            ? 'border-success/30 bg-success/10 text-success'
                                            : 'border-danger/30 bg-danger/10 text-danger'
                                    )}>
                                        {testStatus.ok
                                            ? <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                                            : <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />}
                                        <span>{testStatus.message}</span>
                                    </div>
                                )}

                                <div className="flex gap-2 pt-2">
                                    <Button
                                        variant="secondary"
                                        onClick={handleTest}
                                        disabled={!canSubmit || testing}
                                        className="flex-1"
                                    >
                                        {testing ? (
                                            <span className="flex items-center gap-2">
                                                <span className="h-3.5 w-3.5 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                                                {t('integrations:modal.testing')}
                                            </span>
                                        ) : t('integrations:modal.test')}
                                    </Button>
                                    <Button
                                        onClick={handleConnect}
                                        disabled={!canSubmit || saving}
                                        className="flex-1"
                                    >
                                        {saving ? (
                                            <span className="flex items-center gap-2">
                                                <span className="h-3.5 w-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                {t('integrations:modal.connecting')}
                                            </span>
                                        ) : (
                                            <span className="flex items-center gap-2">
                                                <Plug className="h-3.5 w-3.5" />
                                                {t('integrations:modal.connectBtn')}
                                            </span>
                                        )}
                                    </Button>
                                </div>

                                <p className="text-micro text-muted-foreground text-center">
                                    {t('integrations:modal.encrypted')}
                                </p>
                            </CardContent>
                        </Card>
                    </div>
                );
            })()}
        </div>
    );
};

export default Integrations;
