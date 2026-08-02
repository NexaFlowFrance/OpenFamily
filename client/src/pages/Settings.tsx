import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { Download, Upload, CheckCircle, AlertCircle, Loader2, Bell, BellOff, Globe, Languages, Camera, Trash2, MonitorPlay, Sparkles, LayoutGrid, Server, Tags, ArrowUp, ArrowDown, Plus, Heart, Star } from 'lucide-react';
import { Card, CardContent, Button, Input, Select } from '../components/ui';
import { LanguageSwitcher } from '../components/ui/LanguageSwitcher';
import { useNotifications } from '../hooks/useNotifications';
import { useAuth } from '../contexts/AuthContext';
import { isNative, getServerUrl, clearServerUrl } from '../lib/serverConfig';
import { useCategories, CATEGORY_MODULES, type CategoryModule } from '../hooks/useCategories';
import { refreshAiStatus } from '../lib/aiStatus';
import { aiErrorKey } from '../components/app/MagicInput';

interface ImportCounts {
    family_members?: number;
    tasks?: number;
    recipes?: number;
    meal_plans?: number;
    budget_entries?: number;
    budget_limits?: number;
    shopping_items?: number;
    appointments?: number;
    schedule_entries?: number;
}

const CURRENCIES = [
    { code: 'EUR', label: 'Euro (€)' },
    { code: 'USD', label: 'US Dollar ($)' },
    { code: 'GBP', label: 'British Pound (£)' },
    { code: 'CHF', label: 'Swiss Franc (CHF)' },
    { code: 'CAD', label: 'Canadian Dollar ($)' },
    { code: 'AUD', label: 'Australian Dollar ($)' },
    { code: 'JPY', label: 'Japanese Yen (¥)' },
    { code: 'CNY', label: 'Chinese Yuan (¥)' },
    { code: 'INR', label: 'Indian Rupee (₹)' },
    { code: 'BRL', label: 'Brazilian Real (R$)' },
];

type AiProvider = 'ollama' | 'openai' | 'anthropic';

const AI_MODEL_PLACEHOLDERS: Record<AiProvider, string> = {
    ollama: 'llama3.1',
    openai: 'gpt-4o-mini',
    anthropic: 'claude-opus-4-8',
};

const AI_BASE_URL_PLACEHOLDERS: Record<AiProvider, string> = {
    ollama: 'http://localhost:11434',
    openai: 'https://api.openai.com',
    anthropic: '',
};

interface AiSettingsData {
    configured: boolean;
    enabled: boolean;
    provider?: AiProvider;
    base_url?: string | null;
    model?: string;
    has_api_key?: boolean;
}

// "Assistant IA" card — visible to everyone, editable by parents only.
// The API key is write-only: it is encrypted at rest server-side and never
// returned by the API (`has_api_key` only signals that one is stored).
const AiAssistantCard: React.FC<{ isParent: boolean }> = ({ isParent }) => {
    const { t } = useTranslation(['ai', 'common']);
    const [loading, setLoading] = useState(true);
    const [provider, setProvider] = useState<AiProvider>('ollama');
    const [baseUrl, setBaseUrl] = useState('');
    const [apiKey, setApiKey] = useState('');
    const [hasApiKey, setHasApiKey] = useState(false);
    const [apiKeyCleared, setApiKeyCleared] = useState(false);
    const [model, setModel] = useState('');
    const [enabled, setEnabled] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState('');
    const [saveSuccess, setSaveSuccess] = useState(false);
    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

    useEffect(() => {
        const load = async () => {
            try {
                const response = await api.get<{ success: boolean; data: AiSettingsData }>('/api/ai/settings');
                if (response.success && response.data.configured) {
                    setProvider(response.data.provider ?? 'ollama');
                    setBaseUrl(response.data.base_url ?? '');
                    setModel(response.data.model ?? '');
                    setEnabled(response.data.enabled);
                    setHasApiKey(Boolean(response.data.has_api_key));
                }
            } catch (err) {
                console.error('Failed to load AI settings:', err);
            } finally {
                setLoading(false);
            }
        };
        void load();
    }, []);

    const aiError = (err: unknown): string => {
        const key = aiErrorKey(err);
        if (key) return t(`ai:errors.${key}`);
        return err instanceof Error ? err.message : t('ai:errors.AI_PROVIDER_ERROR');
    };

    const handleProviderChange = (value: string) => {
        const next = value as AiProvider;
        setProvider(next);
        setTestResult(null);
        setSaveSuccess(false);
    };

    const handleSave = async () => {
        setSaving(true);
        setSaveError('');
        setSaveSuccess(false);
        setTestResult(null);
        try {
            const trimmedKey = apiKey.trim();
            const response = await api.put<{ success: boolean; data: AiSettingsData }>('/api/ai/settings', {
                provider,
                base_url: provider === 'anthropic' ? null : baseUrl.trim() || null,
                // '' keeps the stored key, explicit null clears it.
                api_key: trimmedKey ? trimmedKey : apiKeyCleared ? null : '',
                model: model.trim(),
                enabled,
            });
            if (response.success) {
                setSaveSuccess(true);
                setApiKey('');
                setApiKeyCleared(false);
                setHasApiKey(Boolean(response.data.has_api_key));
                await refreshAiStatus();
            }
        } catch (err) {
            setSaveError(aiError(err));
        } finally {
            setSaving(false);
        }
    };

    const handleTest = async () => {
        setTesting(true);
        setTestResult(null);
        setSaveSuccess(false);
        try {
            const response = await api.post<{ success: boolean; message?: string }>('/api/ai/test', {
                provider,
                base_url: provider === 'anthropic' ? undefined : baseUrl.trim() || undefined,
                api_key: apiKey.trim() || undefined,
                model: model.trim() || undefined,
            });
            setTestResult({ success: Boolean(response.success), message: t('ai:settings.testSuccess') });
        } catch (err) {
            setTestResult({ success: false, message: aiError(err) });
        } finally {
            setTesting(false);
        }
    };

    const providerOptions = [
        { value: 'ollama', label: t('ai:settings.providers.ollama') },
        { value: 'openai', label: t('ai:settings.providers.openai') },
        { value: 'anthropic', label: t('ai:settings.providers.anthropic') },
    ];

    return (
        <Card>
            <CardContent className="p-6">
                <div className="flex items-start gap-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-card bg-primary-soft text-primary">
                        <Sparkles className="h-5 w-5" />
                    </div>
                    <div className="flex-1">
                        <h3 className="text-caption font-semibold text-foreground">{t('ai:settings.title')}</h3>
                        <p className="mt-1 text-micro text-muted-foreground">{t('ai:settings.subtitle')}</p>

                        {loading ? (
                            <div className="mt-4 flex items-center gap-2 text-micro text-muted-foreground">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                {t('common:states.loading')}
                            </div>
                        ) : (
                            <div className="mt-4 space-y-4">
                                {!isParent && (
                                    <p className="flex items-center gap-1 text-micro text-muted-foreground">
                                        <AlertCircle className="h-4 w-4 shrink-0" />
                                        {t('ai:settings.parentOnly')}
                                    </p>
                                )}

                                <div>
                                    <label className="mb-1.5 block text-caption font-medium text-foreground">
                                        {t('ai:settings.provider')}
                                    </label>
                                    {isParent ? (
                                        <Select
                                            value={provider}
                                            onValueChange={handleProviderChange}
                                            options={providerOptions}
                                        />
                                    ) : (
                                        <p className="text-caption text-foreground">
                                            {providerOptions.find((o) => o.value === provider)?.label}
                                        </p>
                                    )}
                                </div>

                                {provider !== 'anthropic' && (
                                    <Input
                                        label={t('ai:settings.baseUrl')}
                                        value={baseUrl}
                                        onChange={(e) => setBaseUrl(e.target.value)}
                                        placeholder={AI_BASE_URL_PLACEHOLDERS[provider]}
                                        disabled={!isParent}
                                    />
                                )}

                                {provider !== 'ollama' && (
                                    <div>
                                        <Input
                                            label={t('ai:settings.apiKey')}
                                            type="password"
                                            value={apiKey}
                                            onChange={(e) => {
                                                setApiKey(e.target.value);
                                                setTestResult(null);
                                            }}
                                            placeholder={hasApiKey && !apiKeyCleared ? t('ai:settings.keyKept') : 'sk-…'}
                                            disabled={!isParent}
                                            autoComplete="off"
                                        />
                                        {isParent && hasApiKey && !apiKeyCleared && (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setApiKeyCleared(true);
                                                    setApiKey('');
                                                }}
                                                className="mt-1.5 text-micro text-destructive hover:underline"
                                            >
                                                {t('ai:settings.clearKey')}
                                            </button>
                                        )}
                                    </div>
                                )}

                                <Input
                                    label={t('ai:settings.model')}
                                    value={model}
                                    onChange={(e) => setModel(e.target.value)}
                                    placeholder={AI_MODEL_PLACEHOLDERS[provider]}
                                    disabled={!isParent}
                                />

                                <label className="flex cursor-pointer items-center gap-2">
                                    <input
                                        type="checkbox"
                                        checked={enabled}
                                        onChange={(e) => setEnabled(e.target.checked)}
                                        disabled={!isParent}
                                        className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                                    />
                                    <span className="text-caption text-foreground">{t('ai:settings.enabled')}</span>
                                </label>

                                <p className="rounded-input bg-surface-2 px-3 py-2 text-micro text-muted-foreground">
                                    {t('ai:settings.privacy')}
                                </p>

                                {saveError && (
                                    <p className="flex items-center gap-1 text-micro text-destructive">
                                        <AlertCircle className="h-4 w-4 shrink-0" />
                                        {saveError}
                                    </p>
                                )}
                                {saveSuccess && (
                                    <p className="flex items-center gap-1 text-micro text-green-600 dark:text-green-400">
                                        <CheckCircle className="h-4 w-4 shrink-0" />
                                        {t('ai:settings.saved')}
                                    </p>
                                )}
                                {testResult && (
                                    <p
                                        className={`flex items-center gap-1 text-micro ${
                                            testResult.success
                                                ? 'text-green-600 dark:text-green-400'
                                                : 'text-destructive'
                                        }`}
                                    >
                                        {testResult.success ? (
                                            <CheckCircle className="h-4 w-4 shrink-0" />
                                        ) : (
                                            <AlertCircle className="h-4 w-4 shrink-0" />
                                        )}
                                        {testResult.message}
                                    </p>
                                )}

                                {isParent && (
                                    <div className="flex flex-wrap gap-2">
                                        <Button onClick={() => void handleSave()} disabled={saving || !model.trim()}>
                                            {saving ? (
                                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            ) : (
                                                <CheckCircle className="mr-2 h-4 w-4" />
                                            )}
                                            {saving ? t('ai:settings.saving') : t('ai:settings.save')}
                                        </Button>
                                        <Button
                                            variant="secondary"
                                            onClick={() => void handleTest()}
                                            disabled={testing || !model.trim()}
                                        >
                                            {testing ? (
                                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            ) : (
                                                <Sparkles className="mr-2 h-4 w-4" />
                                            )}
                                            {testing ? t('ai:settings.testing') : t('ai:settings.test')}
                                        </Button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
};

// The optional modules a family can hide, mirroring TOGGLEABLE_MODULES on the
// server. `labelKey` reuses an existing nav label where one exists, otherwise a
// dedicated settings label (for modules without a nav entry).
const MODULE_DEFINITIONS: { key: string; labelKey: string; descKey: string }[] = [
    { key: 'budget', labelKey: 'nav:items.budget', descKey: 'settings:modules.descriptions.budget' },
    { key: 'rewards', labelKey: 'nav:items.rewards', descKey: 'settings:modules.descriptions.rewards' },
    { key: 'meals', labelKey: 'nav:items.meals', descKey: 'settings:modules.descriptions.meals' },
    { key: 'recipes', labelKey: 'nav:items.recipes', descKey: 'settings:modules.descriptions.recipes' },
    { key: 'planning', labelKey: 'nav:items.planning', descKey: 'settings:modules.descriptions.planning' },
    { key: 'integrations', labelKey: 'nav:items.integrations', descKey: 'settings:modules.descriptions.integrations' },
    { key: 'kiosk', labelKey: 'settings:modules.names.kiosk', descKey: 'settings:modules.descriptions.kiosk' },
    { key: 'notes', labelKey: 'settings:modules.names.notes', descKey: 'settings:modules.descriptions.notes' },
    { key: 'ai', labelKey: 'settings:modules.names.ai', descKey: 'settings:modules.descriptions.ai' },
];

// "Modules" card — visible to everyone, editable by parents only.
// Lets a family hide optional modules they don't use. The setting is family-wide.
const ModulesCard: React.FC<{ isParent: boolean }> = ({ isParent }) => {
    const { t } = useTranslation(['settings', 'nav']);
    const { disabledModules, updateDisabledModules } = useAuth();
    const [saving, setSaving] = useState<string | null>(null);
    const [error, setError] = useState('');

    const toggleModule = async (key: string, enabled: boolean) => {
        // enabled === true means the module should be ON → remove it from disabled.
        const next = enabled
            ? disabledModules.filter((m) => m !== key)
            : Array.from(new Set([...disabledModules, key]));
        setSaving(key);
        setError('');
        try {
            await updateDisabledModules(next);
        } catch (err) {
            setError(err instanceof Error ? err.message : t('settings:modules.error'));
        } finally {
            setSaving(null);
        }
    };

    return (
        <Card>
            <CardContent className="p-6">
                <div className="flex items-start gap-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-card bg-primary-soft text-primary">
                        <LayoutGrid className="h-5 w-5" />
                    </div>
                    <div className="flex-1">
                        <h3 className="text-caption font-semibold text-foreground">{t('settings:modules.title')}</h3>
                        <p className="mt-1 text-micro text-muted-foreground">{t('settings:modules.subtitle')}</p>

                        {!isParent && (
                            <p className="mt-3 flex items-center gap-1 text-micro text-muted-foreground">
                                <AlertCircle className="h-4 w-4 shrink-0" />
                                {t('settings:modules.parentOnly')}
                            </p>
                        )}

                        {error && (
                            <p className="mt-3 flex items-center gap-1 text-micro text-destructive">
                                <AlertCircle className="h-4 w-4 shrink-0" />
                                {error}
                            </p>
                        )}

                        <div className="mt-4 space-y-2">
                            {MODULE_DEFINITIONS.map((mod) => {
                                const enabled = !disabledModules.includes(mod.key);
                                return (
                                    <label
                                        key={mod.key}
                                        className={`flex items-start gap-3 rounded-input border border-border bg-card px-3 py-2.5 ${
                                            isParent ? 'cursor-pointer hover:bg-surface-2' : 'opacity-80'
                                        }`}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={enabled}
                                            disabled={!isParent || saving !== null}
                                            onChange={(e) => void toggleModule(mod.key, e.target.checked)}
                                            className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary"
                                        />
                                        <span className="flex-1">
                                            <span className="block text-caption font-medium text-foreground">{t(mod.labelKey)}</span>
                                            <span className="block text-micro text-muted-foreground">{t(mod.descKey)}</span>
                                        </span>
                                        {saving === mod.key && <Loader2 className="mt-0.5 h-4 w-4 animate-spin text-muted-foreground" />}
                                    </label>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
};

// "Categories" card — visible to everyone, editable by parents only.
// Lets a family customize the category lists used by Shopping, Recipes and Budget.
// Renames follow the existing items; removed categories are reassigned server-side.
const CategoriesCard: React.FC<{ isParent: boolean }> = ({ isParent }) => {
    const { t } = useTranslation(['categories', 'common']);
    const { categories, saveCategories } = useCategories();
    const [module, setModule] = useState<CategoryModule>('shopping');
    const [rows, setRows] = useState<Array<{ original: string | null; value: string }>>(
        () => categories.shopping.map((c) => ({ original: c, value: c }))
    );
    const [newName, setNewName] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [saved, setSaved] = useState(false);

    // Re-seed the editor whenever the module tab changes or fresh data arrives.
    useEffect(() => {
        setRows(categories[module].map((c) => ({ original: c, value: c })));
        setNewName('');
        setError('');
    }, [module, categories]);

    const dirty = rows.length !== categories[module].length
        || rows.some((r, i) => r.original !== categories[module][i] || r.value !== r.original);

    const move = (index: number, delta: number) => {
        const target = index + delta;
        if (target < 0 || target >= rows.length) return;
        setRows((prev) => {
            const next = [...prev];
            [next[index], next[target]] = [next[target], next[index]];
            return next;
        });
    };

    const addRow = () => {
        const name = newName.trim();
        if (!name) return;
        if (rows.some((r) => r.value.trim() === name)) {
            setError(t('categories:errors.duplicate', { name }));
            return;
        }
        setRows((prev) => [...prev, { original: null, value: name }]);
        setNewName('');
        setError('');
    };

    const save = async () => {
        const list = rows.map((r) => r.value.trim());
        if (list.some((v) => v.length === 0)) { setError(t('categories:errors.empty')); return; }
        if (list.length === 0) { setError(t('categories:errors.atLeastOne')); return; }
        const seen = new Set<string>();
        for (const name of list) {
            if (seen.has(name)) { setError(t('categories:errors.duplicate', { name })); return; }
            seen.add(name);
        }
        const renames: Record<string, string> = {};
        for (const row of rows) {
            if (row.original && row.value.trim() !== row.original) renames[row.original] = row.value.trim();
        }
        setSaving(true);
        setError('');
        setSaved(false);
        try {
            await saveCategories(module, list, renames);
            setSaved(true);
            setTimeout(() => setSaved(false), 2500);
        } catch (err) {
            setError(err instanceof Error ? err.message : t('categories:errors.save'));
        } finally {
            setSaving(false);
        }
    };

    const fallback = rows.some((r) => r.value.trim() === 'Autre') ? 'Autre' : rows[0]?.value.trim() || '';

    return (
        <Card>
            <CardContent className="p-6">
                <div className="flex items-start gap-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-card bg-primary-soft text-primary">
                        <Tags className="h-5 w-5" />
                    </div>
                    <div className="flex-1">
                        <h3 className="text-caption font-semibold text-foreground">{t('categories:title')}</h3>
                        <p className="mt-1 text-micro text-muted-foreground">{t('categories:subtitle')}</p>

                        {!isParent && (
                            <p className="mt-3 flex items-center gap-1 text-micro text-muted-foreground">
                                <AlertCircle className="h-4 w-4 shrink-0" />
                                {t('categories:parentOnly')}
                            </p>
                        )}

                        <div className="mt-4 flex gap-1 rounded-input border border-border bg-surface-2 p-1">
                            {CATEGORY_MODULES.map((key) => (
                                <button
                                    key={key}
                                    type="button"
                                    onClick={() => setModule(key)}
                                    className={`flex-1 rounded-input px-2 py-1.5 text-caption font-medium transition ${
                                        module === key ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                                    }`}
                                >
                                    {t(`categories:modules.${key}`)}
                                </button>
                            ))}
                        </div>

                        <div className="mt-3 space-y-2">
                            {rows.map((row, index) => (
                                <div key={`${row.original ?? 'new'}-${index}`} className="flex items-center gap-2">
                                    <Input
                                        value={row.value}
                                        disabled={!isParent || saving}
                                        onChange={(e) => setRows((prev) => prev.map((r, i) => (i === index ? { ...r, value: e.target.value } : r)))}
                                        className="flex-1"
                                    />
                                    <Button type="button" variant="ghost" size="sm" disabled={!isParent || saving || index === 0}
                                        onClick={() => move(index, -1)} aria-label={t('categories:moveUp')}>
                                        <ArrowUp className="h-4 w-4" />
                                    </Button>
                                    <Button type="button" variant="ghost" size="sm" disabled={!isParent || saving || index === rows.length - 1}
                                        onClick={() => move(index, 1)} aria-label={t('categories:moveDown')}>
                                        <ArrowDown className="h-4 w-4" />
                                    </Button>
                                    <Button type="button" variant="ghost" size="sm" disabled={!isParent || saving || rows.length <= 1}
                                        onClick={() => setRows((prev) => prev.filter((_, i) => i !== index))} aria-label={t('categories:remove')}>
                                        <Trash2 className="h-4 w-4 text-destructive" />
                                    </Button>
                                </div>
                            ))}
                        </div>

                        {isParent && (
                            <div className="mt-3 flex items-center gap-2">
                                <Input
                                    value={newName}
                                    disabled={saving}
                                    placeholder={t('categories:addPlaceholder')}
                                    onChange={(e) => setNewName(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addRow(); } }}
                                    className="flex-1"
                                />
                                <Button type="button" variant="secondary" size="sm" disabled={saving || !newName.trim()} onClick={addRow}>
                                    <Plus className="h-4 w-4" />
                                    {t('categories:add')}
                                </Button>
                            </div>
                        )}

                        {fallback && (
                            <p className="mt-3 text-micro text-muted-foreground">
                                {t('categories:hintReassign', { fallback })}
                            </p>
                        )}

                        {error && (
                            <p className="mt-3 flex items-center gap-1 text-micro text-destructive">
                                <AlertCircle className="h-4 w-4 shrink-0" />
                                {error}
                            </p>
                        )}
                        {saved && (
                            <p className="mt-3 flex items-center gap-1 text-micro text-success">
                                <CheckCircle className="h-4 w-4 shrink-0" />
                                {t('categories:saved')}
                            </p>
                        )}

                        {isParent && (
                            <div className="mt-4 flex gap-2">
                                <Button type="button" size="sm" disabled={saving || !dirty} onClick={() => void save()}>
                                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                                    {t('categories:save')}
                                </Button>
                                {dirty && !saving && (
                                    <Button type="button" variant="ghost" size="sm"
                                        onClick={() => setRows(categories[module].map((c) => ({ original: c, value: c })))}>
                                        {t('categories:reset')}
                                    </Button>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
};

const Settings: React.FC = () => {
    const { t } = useTranslation(['settings', 'common', 'kiosk', 'server']);
    const entityLabel = (key: string) => t(`settings:entities.${key}`, { defaultValue: key });
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [exportLoading, setExportLoading] = useState(false);
    const [exportError, setExportError] = useState('');
    const [importLoading, setImportLoading] = useState(false);
    const [importError, setImportError] = useState('');
    const [importSuccess, setImportSuccess] = useState<ImportCounts | null>(null);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [notifError, setNotifError] = useState('');
    const [currencyLoading, setCurrencyLoading] = useState(false);
    const [currencyError, setCurrencyError] = useState('');
    const avatarInputRef = useRef<HTMLInputElement>(null);
    const [avatarLoading, setAvatarLoading] = useState(false);
    const [avatarError, setAvatarError] = useState('');

    const { user, updateCurrency, updateProfile } = useAuth();
    const { isSupported, permission, isSubscribed, isLoading: notifLoading, subscribe, unsubscribe } = useNotifications();
    const isParent = Boolean(user?.is_owner) || (user?.role ?? '').toLowerCase() !== 'enfant';

    const handleToggleNotifications = async () => {
        setNotifError('');
        try {
            if (isSubscribed) {
                await unsubscribe();
            } else {
                await subscribe();
            }
        } catch (err) {
            setNotifError(err instanceof Error ? err.message : t('settings:errors.notif'));
        }
    };

    const handleCurrencyChange = async (currency: string) => {
        setCurrencyLoading(true);
        setCurrencyError('');
        try {
            await updateCurrency(currency);
        } catch (err) {
            setCurrencyError(err instanceof Error ? err.message : t('settings:errors.currency'));
        } finally {
            setCurrencyLoading(false);
        }
    };

    // Resize/compress the selected image client-side to keep the stored data URL small.
    const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (avatarInputRef.current) avatarInputRef.current.value = '';
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            setAvatarError(t('settings:errors.avatarImage'));
            return;
        }
        setAvatarError('');
        setAvatarLoading(true);
        try {
            const dataUrl = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result as string);
                reader.onerror = () => reject(new Error(t('settings:errors.avatarRead')));
                reader.readAsDataURL(file);
            });
            const img = await new Promise<HTMLImageElement>((resolve, reject) => {
                const image = new Image();
                image.onload = () => resolve(image);
                image.onerror = () => reject(new Error(t('settings:errors.avatarInvalid')));
                image.src = dataUrl;
            });
            const size = 256;
            const canvas = document.createElement('canvas');
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error(t('settings:errors.avatarCanvas'));
            // Cover-crop to a square.
            const min = Math.min(img.width, img.height);
            const sx = (img.width - min) / 2;
            const sy = (img.height - min) / 2;
            ctx.drawImage(img, sx, sy, min, min, 0, 0, size, size);
            const compressed = canvas.toDataURL('image/jpeg', 0.85);
            await updateProfile({ avatar_url: compressed });
        } catch (err) {
            setAvatarError(err instanceof Error ? err.message : t('settings:errors.avatarUpdate'));
        } finally {
            setAvatarLoading(false);
        }
    };

    const handleRemoveAvatar = async () => {
        setAvatarError('');
        setAvatarLoading(true);
        try {
            await updateProfile({ avatar_url: null });
        } catch (err) {
            setAvatarError(err instanceof Error ? err.message : t('settings:errors.avatarRemove'));
        } finally {
            setAvatarLoading(false);
        }
    };

    const handleExport = async () => {
        setExportLoading(true);
        setExportError('');
        try {
            const response = await api.get<{ success: boolean; data: unknown }>('/api/data/export');
            const blob = new Blob([JSON.stringify(response.data, null, 2)], {
                type: 'application/json',
            });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `openfamily-export-${new Date().toISOString().split('T')[0]}.json`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (error) {
            setExportError(error instanceof Error ? error.message : t('settings:errors.export'));
        } finally {
            setExportLoading(false);
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0] ?? null;
        setSelectedFile(file);
        setImportError('');
        setImportSuccess(null);
    };

    const handleImport = async () => {
        if (!selectedFile) return;
        setImportLoading(true);
        setImportError('');
        setImportSuccess(null);
        try {
            const text = await selectedFile.text();
            const parsed = JSON.parse(text);

            // Accept both the raw export format and the full API response
            const data = parsed.success && parsed.data ? parsed.data : parsed;

            const response = await api.post<{ success: boolean; data: { imported: ImportCounts } }>(
                '/api/data/import',
                data
            );
            if (response.success) {
                setImportSuccess(response.data.imported);
                setSelectedFile(null);
                if (fileInputRef.current) fileInputRef.current.value = '';
            }
        } catch (error) {
            if (error instanceof SyntaxError) {
                setImportError(t('settings:import.invalidJson'));
            } else {
                setImportError(error instanceof Error ? error.message : t('settings:errors.import'));
            }
        } finally {
            setImportLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-title font-bold text-foreground">{t('settings:title')}</h2>
                <p className="text-caption text-muted-foreground">{t('settings:subtitle')}</p>
            </div>

            {/* Language */}
            <Card>
                <CardContent className="p-6">
                    <div className="flex items-start gap-4">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-card bg-primary-soft text-primary">
                            <Languages className="h-5 w-5" />
                        </div>
                        <div className="flex-1">
                            <h3 className="text-caption font-semibold text-foreground">{t('settings:language.title')}</h3>
                            <p className="mt-1 text-micro text-muted-foreground">{t('settings:language.subtitle')}</p>
                            <LanguageSwitcher className="mt-4" />
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Server (native app only) */}
            {isNative() && (
                <Card>
                    <CardContent className="p-6">
                        <div className="flex items-start gap-4">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-card bg-primary-soft text-primary">
                                <Server className="h-5 w-5" />
                            </div>
                            <div className="flex-1">
                                <h3 className="text-caption font-semibold text-foreground">{t('server:settings.title')}</h3>
                                <p className="mt-1 text-micro text-muted-foreground break-all">
                                    {t('server:settings.connectedTo', { url: getServerUrl() })}
                                </p>
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    className="mt-4"
                                    onClick={() => { void clearServerUrl().then(() => window.location.reload()); }}
                                >
                                    <Server className="mr-2 h-4 w-4" />
                                    {t('server:settings.change')}
                                </Button>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Kiosk display */}
            <Card>
                <CardContent className="p-6">
                    <div className="flex items-start gap-4">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-card bg-primary-soft text-primary">
                            <MonitorPlay className="h-5 w-5" />
                        </div>
                        <div className="flex-1">
                            <h3 className="text-caption font-semibold text-foreground">{t('kiosk:settings.title')}</h3>
                            <p className="mt-1 text-micro text-muted-foreground">{t('kiosk:settings.subtitle')}</p>
                            <Link to="/kiosk">
                                <Button variant="secondary" size="sm" className="mt-4">
                                    <MonitorPlay className="mr-2 h-4 w-4" />
                                    {t('kiosk:settings.open')}
                                </Button>
                            </Link>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Profile photo */}
            <Card>
                <CardContent className="p-6">
                    <div className="flex items-start gap-4">
                        <div className="relative shrink-0">
                            {user?.avatar_url ? (
                                <img
                                    src={user.avatar_url}
                                    alt={user?.name || t('settings:profile.title')}
                                    className="h-16 w-16 rounded-full object-cover"
                                />
                            ) : (
                                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary-soft text-title font-semibold text-primary">
                                    {user?.name?.charAt(0) || 'U'}
                                </div>
                            )}
                            {avatarLoading && (
                                <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40">
                                    <Loader2 className="h-5 w-5 animate-spin text-white" />
                                </div>
                            )}
                        </div>
                        <div className="flex-1">
                            <h3 className="text-caption font-semibold text-foreground">{t('settings:profile.title')}</h3>
                            <p className="mt-1 text-micro text-muted-foreground">
                                {t('settings:profile.subtitle')}
                            </p>
                            <div className="mt-3 flex flex-wrap gap-2">
                                <input
                                    ref={avatarInputRef}
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={handleAvatarChange}
                                />
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => avatarInputRef.current?.click()}
                                    disabled={avatarLoading}
                                >
                                    <Camera className="mr-2 h-4 w-4" />
                                    {user?.avatar_url ? t('settings:profile.change') : t('settings:profile.choose')}
                                </Button>
                                {user?.avatar_url && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={handleRemoveAvatar}
                                        disabled={avatarLoading}
                                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                                    >
                                        <Trash2 className="mr-2 h-4 w-4" />
                                        {t('settings:profile.remove')}
                                    </Button>
                                )}
                            </div>
                            {avatarError && (
                                <p className="mt-2 flex items-center gap-1 text-micro text-destructive">
                                    <AlertCircle className="h-4 w-4" />
                                    {avatarError}
                                </p>
                            )}
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Push Notifications */}
            <Card>
                <CardContent className="p-6">
                    <div className="flex items-start gap-4">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-card bg-primary-soft text-primary">
                            {isSubscribed ? <Bell className="h-5 w-5" /> : <BellOff className="h-5 w-5" />}
                        </div>
                        <div className="flex-1">
                            <h3 className="text-caption font-semibold text-foreground">{t('settings:notif.title')}</h3>
                            <p className="mt-1 text-micro text-muted-foreground">
                                {t('settings:notif.subtitle')}
                            </p>

                            {!isSupported && (
                                <p className="mt-2 flex items-center gap-1 text-micro text-muted-foreground">
                                    <AlertCircle className="h-4 w-4" />
                                    {t('settings:notif.unsupported')}
                                </p>
                            )}

                            {isSupported && permission === 'denied' && (
                                <p className="mt-2 flex items-center gap-1 text-micro text-destructive">
                                    <AlertCircle className="h-4 w-4" />
                                    {t('settings:notif.denied')}
                                </p>
                            )}

                            {notifError && (
                                <p className="mt-2 flex items-center gap-1 text-micro text-destructive">
                                    <AlertCircle className="h-4 w-4" />
                                    {notifError}
                                </p>
                            )}

                            {isSupported && permission !== 'denied' && (
                                <Button
                                    className="mt-4"
                                    variant={isSubscribed ? 'secondary' : 'primary'}
                                    onClick={() => void handleToggleNotifications()}
                                    disabled={notifLoading}
                                >
                                    {notifLoading ? (
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    ) : isSubscribed ? (
                                        <BellOff className="mr-2 h-4 w-4" />
                                    ) : (
                                        <Bell className="mr-2 h-4 w-4" />
                                    )}
                                    {notifLoading
                                        ? t('settings:notif.inProgress')
                                        : isSubscribed
                                          ? t('settings:notif.disable')
                                          : t('settings:notif.enable')}
                                </Button>
                            )}

                            {isSubscribed && (
                                <p className="mt-2 flex items-center gap-1 text-micro text-green-600 dark:text-green-400">
                                    <CheckCircle className="h-4 w-4" />
                                    {t('settings:notif.active')}
                                </p>
                            )}
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Currency */}
            <Card>
                <CardContent className="p-6">
                    <div className="flex items-start gap-4">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-card bg-primary-soft text-primary">
                            <Globe className="h-5 w-5" />
                        </div>
                        <div className="flex-1">
                            <h3 className="text-caption font-semibold text-foreground">{t('settings:currency.title')}</h3>
                            <p className="mt-1 text-micro text-muted-foreground">
                                {t('settings:currency.subtitle')}
                            </p>

                            {currencyError && (
                                <p className="mt-2 flex items-center gap-1 text-micro text-destructive">
                                    <AlertCircle className="h-4 w-4" />
                                    {currencyError}
                                </p>
                            )}

                            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                                {CURRENCIES.map((curr) => (
                                    <button
                                        key={curr.code}
                                        onClick={() => void handleCurrencyChange(curr.code)}
                                        disabled={currencyLoading}
                                        className={`rounded-input border px-3 py-2 text-micro font-medium transition-colors ${
                                            user?.currency === curr.code
                                                ? 'border-primary bg-primary text-primary-foreground'
                                                : 'border-border bg-card text-foreground hover:bg-surface-2'
                                        } ${currencyLoading ? 'opacity-50' : ''}`}
                                    >
                                        {curr.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* AI assistant */}
            <AiAssistantCard isParent={isParent} />

            {/* Optional modules */}
            <ModulesCard isParent={isParent} />

            {/* Custom categories */}
            <CategoriesCard isParent={isParent} />

            {/* Export */}
            <Card>
                <CardContent className="p-6">
                    <div className="flex items-start gap-4">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-card bg-primary-soft text-primary">
                            <Download className="h-5 w-5" />
                        </div>
                        <div className="flex-1">
                            <h3 className="text-caption font-semibold text-foreground">{t('settings:export.title')}</h3>
                            <p className="mt-1 text-micro text-muted-foreground">
                                {t('settings:export.subtitle')}
                            </p>
                            {exportError && (
                                <p className="mt-2 flex items-center gap-1 text-micro text-destructive">
                                    <AlertCircle className="h-4 w-4" />
                                    {exportError}
                                </p>
                            )}
                            <Button
                                className="mt-4"
                                onClick={handleExport}
                                disabled={exportLoading}
                            >
                                {exportLoading ? (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                    <Download className="mr-2 h-4 w-4" />
                                )}
                                {exportLoading ? t('settings:export.inProgress') : t('settings:export.button')}
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Import */}
            <Card>
                <CardContent className="p-6">
                    <div className="flex items-start gap-4">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-card bg-primary-soft text-primary">
                            <Upload className="h-5 w-5" />
                        </div>
                        <div className="flex-1">
                            <h3 className="text-caption font-semibold text-foreground">{t('settings:import.title')}</h3>
                            <p className="mt-1 text-micro text-muted-foreground">
                                {t('settings:import.subtitle')}
                            </p>

                            {importSuccess && (
                                <div className="mt-3 rounded-input border border-border bg-surface-2 p-3">
                                    <p className="mb-2 flex items-center gap-1 text-micro font-semibold text-foreground">
                                        <CheckCircle className="h-4 w-4 text-green-500" />
                                        {t('settings:import.success')}
                                    </p>
                                    <ul className="space-y-0.5 text-micro text-muted-foreground">
                                        {Object.entries(importSuccess).map(([key, count]) => (
                                            <li key={key}>
                                                {entityLabel(key)} : <span className="font-medium text-foreground">{count}</span> {t('settings:import.itemsImported', { count: count as number })}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {importError && (
                                <p className="mt-2 flex items-center gap-1 text-micro text-destructive">
                                    <AlertCircle className="h-4 w-4" />
                                    {importError}
                                </p>
                            )}

                            <div className="mt-4 flex flex-wrap items-center gap-3">
                                <label className="cursor-pointer">
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept=".json,application/json"
                                        className="sr-only"
                                        onChange={handleFileChange}
                                    />
                                    <span className="inline-flex h-9 items-center gap-2 rounded-input border border-border bg-card px-3 text-caption font-medium text-foreground hover:bg-surface-2 transition-colors duration-fast">
                                        <Upload className="h-4 w-4" />
                                        {selectedFile ? selectedFile.name : t('settings:import.chooseFile')}
                                    </span>
                                </label>
                                {selectedFile && (
                                    <Button onClick={handleImport} disabled={importLoading}>
                                        {importLoading ? (
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        ) : (
                                            <Upload className="mr-2 h-4 w-4" />
                                        )}
                                        {importLoading ? t('settings:import.inProgress') : t('settings:import.button')}
                                    </Button>
                                )}
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Support the project — a passive link, never a prompt or a nag: this
                app is self-hosted and must stay out of the user's way. */}
            <Card>
                <CardContent className="p-6">
                    <div className="flex items-start gap-4">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-card bg-primary-soft text-primary">
                            <Heart className="h-5 w-5" />
                        </div>
                        <div className="flex-1">
                            <h3 className="text-caption font-semibold text-foreground">{t('settings:support.title')}</h3>
                            <p className="mt-1 text-micro text-muted-foreground">{t('settings:support.subtitle')}</p>
                            <div className="mt-4 flex flex-wrap items-center gap-3">
                                <a
                                    href="https://ko-fi.com/nexaflowfrance"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex h-9 items-center gap-2 rounded-input border border-border bg-card px-3 text-caption font-medium text-foreground hover:bg-surface-2 transition-colors duration-fast"
                                >
                                    <Heart className="h-4 w-4" />
                                    {t('settings:support.sponsor')}
                                </a>
                                <a
                                    href="https://github.com/NexaFlowFrance/OpenFamily"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex h-9 items-center gap-2 rounded-input border border-border bg-card px-3 text-caption font-medium text-foreground hover:bg-surface-2 transition-colors duration-fast"
                                >
                                    <Star className="h-4 w-4" />
                                    {t('settings:support.star')}
                                </a>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};

export default Settings;
