import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import {
    Download,
    Upload,
    CheckCircle,
    AlertCircle,
    Loader2,
    Coins,
    MapPin,
    Mail,
    Send,
    Languages,
} from 'lucide-react';
import { Card, CardContent, Button, Input, Select } from '../components/ui';
import { useAuth } from '../contexts/AuthContext';
import { SUPPORTED_CURRENCIES, DEFAULT_CURRENCY } from '../lib/currencies';
import { SUPPORTED_LANGUAGES } from '../i18n';
import { useUpdateUserLocation } from '../hooks/useDashboardWeather';

const currencyOptions = SUPPORTED_CURRENCIES.map((c) => ({
    value: c.code,
    label: `${c.code} — ${c.name} (${c.symbol})`,
}));

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

const Settings: React.FC = () => {
    const { t, i18n } = useTranslation();
    const { user, setUserCurrency, setUserFromServer } = useAuth();
    const languageOptions = SUPPORTED_LANGUAGES.map((lng) => ({
        value: lng,
        label: t(`language.${lng}`),
    }));
    const updateLocation = useUpdateUserLocation();
    const [cityDraft, setCityDraft] = useState<string>(user?.city ?? '');
    const [cityMessage, setCityMessage] = useState<{
        kind: 'success' | 'error';
        text: string;
    } | null>(null);

    const cityDirty = cityDraft.trim() !== '' && cityDraft.trim() !== (user?.city ?? '');

    const handleSaveCity = async () => {
        setCityMessage(null);
        try {
            const updated = await updateLocation.mutateAsync(cityDraft.trim());
            setUserFromServer(updated);
            setCityDraft(updated.city ?? '');
            setCityMessage({
                kind: 'success',
                text: t('settings.location.saved', {
                    city: updated.city ?? cityDraft.trim(),
                }),
            });
        } catch (err) {
            const msg = err instanceof Error ? err.message : t('settings.errors.update');
            const friendly = /CITY_NOT_FOUND/i.test(msg) ? t('settings.location.notFound') : msg;
            setCityMessage({ kind: 'error', text: friendly });
        }
    };

    // ---- Email notifications ----
    const [emailEnabled, setEmailEnabled] = useState<boolean>(
        user?.email_notifications_enabled ?? true,
    );
    const [emailDigestMode, setEmailDigestMode] = useState<'immediate' | 'daily'>(
        user?.email_digest_mode ?? 'immediate',
    );
    const [emailSaving, setEmailSaving] = useState(false);
    const [emailMessage, setEmailMessage] = useState<{
        kind: 'success' | 'error';
        text: string;
    } | null>(null);
    const [emailTesting, setEmailTesting] = useState(false);

    const emailDirty =
        emailEnabled !== (user?.email_notifications_enabled ?? true) ||
        emailDigestMode !== (user?.email_digest_mode ?? 'immediate');

    const handleSaveEmailPrefs = async () => {
        setEmailSaving(true);
        setEmailMessage(null);
        try {
            const response = await api.patch<{ success: boolean; data: { user: any } }>(
                '/api/auth/me/email-preferences',
                { enabled: emailEnabled, digestMode: emailDigestMode },
            );
            if (response.success && response.data?.user) {
                setUserFromServer(response.data.user);
            }
            setEmailMessage({ kind: 'success', text: t('settings.email.saved') });
        } catch (err) {
            setEmailMessage({
                kind: 'error',
                text: err instanceof Error ? err.message : t('settings.errors.update'),
            });
        } finally {
            setEmailSaving(false);
        }
    };

    const handleSendTestEmail = async () => {
        setEmailTesting(true);
        setEmailMessage(null);
        try {
            await api.post<{ success: boolean }>('/api/notifications/_test-email', {});
            setEmailMessage({
                kind: 'success',
                text: t('settings.email.testSent', { email: user?.email }),
            });
        } catch (err) {
            setEmailMessage({
                kind: 'error',
                text:
                    err instanceof Error
                        ? t('settings.email.testFailed', { message: err.message })
                        : t('settings.email.testFailedGeneric'),
            });
        } finally {
            setEmailTesting(false);
        }
    };

    const fileInputRef = useRef<HTMLInputElement>(null);
    const [exportLoading, setExportLoading] = useState(false);
    const [exportError, setExportError] = useState('');
    const [importLoading, setImportLoading] = useState(false);
    const [importError, setImportError] = useState('');
    const [importSuccess, setImportSuccess] = useState<ImportCounts | null>(null);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [currencyDraft, setCurrencyDraft] = useState<string>(user?.currency ?? DEFAULT_CURRENCY);
    const [currencySaving, setCurrencySaving] = useState(false);
    const [currencyMessage, setCurrencyMessage] = useState<{
        kind: 'success' | 'error';
        text: string;
    } | null>(null);

    const currentCurrency = user?.currency ?? null;
    const currencyDirty = currencyDraft !== currentCurrency;

    const handleSaveCurrency = async () => {
        setCurrencySaving(true);
        setCurrencyMessage(null);
        try {
            await setUserCurrency(currencyDraft);
            setCurrencyMessage({ kind: 'success', text: t('settings.currency.saved') });
        } catch (err) {
            setCurrencyMessage({
                kind: 'error',
                text: err instanceof Error ? err.message : t('settings.errors.update'),
            });
        } finally {
            setCurrencySaving(false);
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
            a.download = `keurtonux-export-${new Date().toISOString().split('T')[0]}.json`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (error) {
            setExportError(error instanceof Error ? error.message : t('settings.export.error'));
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
                data,
            );
            if (response.success) {
                setImportSuccess(response.data.imported);
                setSelectedFile(null);
                if (fileInputRef.current) fileInputRef.current.value = '';
            }
        } catch (error) {
            if (error instanceof SyntaxError) {
                setImportError(t('settings.import.invalidJson'));
            } else {
                setImportError(error instanceof Error ? error.message : t('settings.import.error'));
            }
        } finally {
            setImportLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-title font-bold text-foreground">{t('settings.title')}</h2>
                <p className="text-caption text-muted-foreground">{t('settings.subtitle')}</p>
            </div>

            {/* Language */}
            <Card>
                <CardContent className="p-6">
                    <div className="flex items-start gap-4">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-card bg-primary-soft text-primary">
                            <Languages className="h-5 w-5" />
                        </div>
                        <div className="flex-1">
                            <h3 className="text-caption font-semibold text-foreground">
                                {t('language.title')}
                            </h3>
                            <p className="mt-1 text-micro text-muted-foreground">
                                {t('language.description')}
                            </p>
                            <div className="mt-4 max-w-sm">
                                <Select
                                    value={i18n.language.split('-')[0]}
                                    onValueChange={(lng) => {
                                        void i18n.changeLanguage(lng);
                                    }}
                                    options={languageOptions}
                                />
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Currency */}
            <Card>
                <CardContent className="p-6">
                    <div className="flex items-start gap-4">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-card bg-primary-soft text-primary">
                            <Coins className="h-5 w-5" />
                        </div>
                        <div className="flex-1">
                            <h3 className="text-caption font-semibold text-foreground">
                                {t('settings.currency.title')}
                            </h3>
                            <p className="mt-1 text-micro text-muted-foreground">
                                {t('settings.currency.description')}
                            </p>
                            <div className="mt-4 max-w-sm">
                                <Select
                                    value={currencyDraft}
                                    onValueChange={setCurrencyDraft}
                                    options={currencyOptions}
                                />
                            </div>
                            {currencyMessage && (
                                <p
                                    className={`mt-2 flex items-center gap-1 text-micro ${
                                        currencyMessage.kind === 'error'
                                            ? 'text-destructive'
                                            : 'text-emerald-600'
                                    }`}
                                >
                                    {currencyMessage.kind === 'error' ? (
                                        <AlertCircle className="h-4 w-4" />
                                    ) : (
                                        <CheckCircle className="h-4 w-4" />
                                    )}
                                    {currencyMessage.text}
                                </p>
                            )}
                            <Button
                                className="mt-4"
                                onClick={handleSaveCurrency}
                                disabled={!currencyDirty || currencySaving}
                            >
                                {currencySaving && (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                )}
                                {t('common.save')}
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Location */}
            <Card>
                <CardContent className="p-6">
                    <div className="flex items-start gap-4">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-card bg-primary-soft text-primary">
                            <MapPin className="h-5 w-5" />
                        </div>
                        <div className="flex-1">
                            <h3 className="text-caption font-semibold text-foreground">
                                {t('settings.location.title')}
                            </h3>
                            <p className="mt-1 text-micro text-muted-foreground">
                                {t('settings.location.description')}
                            </p>
                            <div className="mt-4 max-w-sm">
                                <Input
                                    value={cityDraft}
                                    onChange={(e) => setCityDraft(e.target.value)}
                                    placeholder={t('settings.location.placeholder')}
                                />
                            </div>
                            {user?.city && (
                                <p className="mt-2 text-micro text-muted-foreground">
                                    {t('settings.location.current', { city: user.city })}
                                    {user.country_code ? ` (${user.country_code})` : ''}
                                </p>
                            )}
                            {cityMessage && (
                                <p
                                    className={`mt-2 flex items-center gap-1 text-micro ${
                                        cityMessage.kind === 'error'
                                            ? 'text-destructive'
                                            : 'text-emerald-600'
                                    }`}
                                >
                                    {cityMessage.kind === 'error' ? (
                                        <AlertCircle className="h-4 w-4" />
                                    ) : (
                                        <CheckCircle className="h-4 w-4" />
                                    )}
                                    {cityMessage.text}
                                </p>
                            )}
                            <Button
                                className="mt-4"
                                onClick={handleSaveCity}
                                disabled={!cityDirty || updateLocation.isPending}
                            >
                                {updateLocation.isPending && (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                )}
                                {t('settings.location.save')}
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Email notifications */}
            <Card>
                <CardContent className="p-6">
                    <div className="flex items-start gap-4">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-card bg-primary-soft text-primary">
                            <Mail className="h-5 w-5" />
                        </div>
                        <div className="flex-1">
                            <h3 className="text-caption font-semibold text-foreground">
                                {t('settings.email.title')}
                            </h3>
                            <p className="mt-1 text-micro text-muted-foreground">
                                {t('settings.email.description')}{' '}
                                <span className="font-medium text-foreground">{user?.email}</span>.
                            </p>

                            <label className="mt-4 flex cursor-pointer items-center gap-3">
                                <input
                                    type="checkbox"
                                    checked={emailEnabled}
                                    onChange={(e) => setEmailEnabled(e.target.checked)}
                                    className="h-4 w-4 rounded border-border accent-primary"
                                />
                                <span className="text-caption text-foreground">
                                    {t('settings.email.enable')}
                                </span>
                            </label>

                            <div className="mt-4 max-w-sm">
                                <label className="text-micro font-medium text-muted-foreground">
                                    {t('settings.email.mode')}
                                </label>
                                <div
                                    className={`mt-1 ${emailEnabled ? '' : 'pointer-events-none opacity-50'}`}
                                >
                                    <Select
                                        value={emailDigestMode}
                                        onValueChange={(v) =>
                                            setEmailDigestMode(v as 'immediate' | 'daily')
                                        }
                                        options={[
                                            {
                                                value: 'immediate',
                                                label: t('settings.email.immediate'),
                                            },
                                            {
                                                value: 'daily',
                                                label: t('settings.email.daily'),
                                            },
                                        ]}
                                    />
                                </div>
                            </div>

                            {emailMessage && (
                                <p
                                    className={`mt-3 flex items-center gap-1 text-micro ${
                                        emailMessage.kind === 'error'
                                            ? 'text-destructive'
                                            : 'text-emerald-600'
                                    }`}
                                >
                                    {emailMessage.kind === 'error' ? (
                                        <AlertCircle className="h-4 w-4" />
                                    ) : (
                                        <CheckCircle className="h-4 w-4" />
                                    )}
                                    {emailMessage.text}
                                </p>
                            )}

                            <div className="mt-4 flex flex-wrap gap-2">
                                <Button
                                    onClick={handleSaveEmailPrefs}
                                    disabled={!emailDirty || emailSaving}
                                >
                                    {emailSaving && (
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    )}
                                    {t('common.save')}
                                </Button>
                                <Button
                                    variant="secondary"
                                    onClick={handleSendTestEmail}
                                    disabled={emailTesting || !emailEnabled}
                                >
                                    {emailTesting ? (
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    ) : (
                                        <Send className="mr-2 h-4 w-4" />
                                    )}
                                    {emailTesting
                                        ? t('settings.email.sending')
                                        : t('settings.email.sendTest')}
                                </Button>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Export */}
            <Card>
                <CardContent className="p-6">
                    <div className="flex items-start gap-4">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-card bg-primary-soft text-primary">
                            <Download className="h-5 w-5" />
                        </div>
                        <div className="flex-1">
                            <h3 className="text-caption font-semibold text-foreground">
                                {t('settings.export.title')}
                            </h3>
                            <p className="mt-1 text-micro text-muted-foreground">
                                {t('settings.export.description')}
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
                                {exportLoading
                                    ? t('settings.export.exporting')
                                    : t('settings.export.button')}
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
                            <h3 className="text-caption font-semibold text-foreground">
                                {t('settings.import.title')}
                            </h3>
                            <p className="mt-1 text-micro text-muted-foreground">
                                {t('settings.import.description')}
                            </p>

                            {importSuccess && (
                                <div className="mt-3 rounded-input border border-border bg-surface-2 p-3">
                                    <p className="mb-2 flex items-center gap-1 text-micro font-semibold text-foreground">
                                        <CheckCircle className="h-4 w-4 text-green-500" />
                                        {t('settings.import.success')}
                                    </p>
                                    <ul className="space-y-0.5 text-micro text-muted-foreground">
                                        {Object.entries(importSuccess).map(([key, count]) => (
                                            <li key={key}>
                                                {t(`settings.import.entities.${key}`, {
                                                    defaultValue: key,
                                                })}{' '}
                                                :{' '}
                                                <span className="font-medium text-foreground">
                                                    {count}
                                                </span>{' '}
                                                {t('settings.import.itemsImported', {
                                                    count: count ?? 0,
                                                })}
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
                                        {selectedFile
                                            ? selectedFile.name
                                            : t('settings.import.chooseFile')}
                                    </span>
                                </label>
                                {selectedFile && (
                                    <Button onClick={handleImport} disabled={importLoading}>
                                        {importLoading ? (
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        ) : (
                                            <Upload className="mr-2 h-4 w-4" />
                                        )}
                                        {importLoading
                                            ? t('settings.import.importing')
                                            : t('settings.import.button')}
                                    </Button>
                                )}
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};

export default Settings;
