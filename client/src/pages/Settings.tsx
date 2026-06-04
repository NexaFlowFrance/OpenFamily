import React, { useRef, useState } from 'react';
import { api } from '../lib/api';
import { Download, Upload, CheckCircle, AlertCircle, Loader2, Bell, BellOff, Globe, Camera, Trash2 } from 'lucide-react';
import { Card, CardContent, Button } from '../components/ui';
import { useNotifications } from '../hooks/useNotifications';
import { useAuth } from '../contexts/AuthContext';

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

const ENTITY_LABELS: Record<string, string> = {
    family_members: 'Membres de la famille',
    tasks: 'Tâches',
    recipes: 'Recettes',
    meal_plans: 'Repas planifiés',
    budget_entries: 'Entrées budget',
    budget_limits: 'Limites budget',
    shopping_items: 'Articles de courses',
    appointments: 'Rendez-vous',
    schedule_entries: 'Plannings',
};

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

const Settings: React.FC = () => {
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

    const handleToggleNotifications = async () => {
        setNotifError('');
        try {
            if (isSubscribed) {
                await unsubscribe();
            } else {
                await subscribe();
            }
        } catch (err) {
            setNotifError(err instanceof Error ? err.message : 'Erreur lors de la configuration des notifications.');
        }
    };

    const handleCurrencyChange = async (currency: string) => {
        setCurrencyLoading(true);
        setCurrencyError('');
        try {
            await updateCurrency(currency);
        } catch (err) {
            setCurrencyError(err instanceof Error ? err.message : 'Erreur lors de la mise à jour de la devise.');
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
            setAvatarError('Veuillez choisir une image.');
            return;
        }
        setAvatarError('');
        setAvatarLoading(true);
        try {
            const dataUrl = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result as string);
                reader.onerror = () => reject(new Error('Lecture du fichier impossible.'));
                reader.readAsDataURL(file);
            });
            const img = await new Promise<HTMLImageElement>((resolve, reject) => {
                const image = new Image();
                image.onload = () => resolve(image);
                image.onerror = () => reject(new Error('Image invalide.'));
                image.src = dataUrl;
            });
            const size = 256;
            const canvas = document.createElement('canvas');
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error('Canvas indisponible.');
            // Cover-crop to a square.
            const min = Math.min(img.width, img.height);
            const sx = (img.width - min) / 2;
            const sy = (img.height - min) / 2;
            ctx.drawImage(img, sx, sy, min, min, 0, 0, size, size);
            const compressed = canvas.toDataURL('image/jpeg', 0.85);
            await updateProfile({ avatar_url: compressed });
        } catch (err) {
            setAvatarError(err instanceof Error ? err.message : 'Erreur lors de la mise à jour de la photo.');
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
            setAvatarError(err instanceof Error ? err.message : 'Erreur lors de la suppression de la photo.');
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
            setExportError(error instanceof Error ? error.message : 'Erreur lors de l\'export.');
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
                setImportError('Fichier JSON invalide.');
            } else {
                setImportError(error instanceof Error ? error.message : 'Erreur lors de l\'import.');
            }
        } finally {
            setImportLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-title font-bold text-foreground">Paramètres</h2>
                <p className="text-caption text-muted-foreground">Gérez vos données et préférences.</p>
            </div>

            {/* Profile photo */}
            <Card>
                <CardContent className="p-6">
                    <div className="flex items-start gap-4">
                        <div className="relative shrink-0">
                            {user?.avatar_url ? (
                                <img
                                    src={user.avatar_url}
                                    alt={user?.name || 'Profil'}
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
                            <h3 className="text-caption font-semibold text-foreground">Photo de profil</h3>
                            <p className="mt-1 text-micro text-muted-foreground">
                                Choisissez une photo qui apparaîtra dans le menu de l'application.
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
                                    {user?.avatar_url ? 'Changer la photo' : 'Choisir une photo'}
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
                                        Retirer
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
                            <h3 className="text-caption font-semibold text-foreground">Notifications push</h3>
                            <p className="mt-1 text-micro text-muted-foreground">
                                Recevez des rappels pour vos rendez-vous directement sur cet appareil, même
                                quand l'application est fermée.
                            </p>

                            {!isSupported && (
                                <p className="mt-2 flex items-center gap-1 text-micro text-muted-foreground">
                                    <AlertCircle className="h-4 w-4" />
                                    Notifications non supportées sur ce navigateur.
                                </p>
                            )}

                            {isSupported && permission === 'denied' && (
                                <p className="mt-2 flex items-center gap-1 text-micro text-destructive">
                                    <AlertCircle className="h-4 w-4" />
                                    Permission refusée. Autorisez les notifications dans les paramètres de votre
                                    navigateur.
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
                                        ? 'En cours…'
                                        : isSubscribed
                                          ? 'Désactiver les notifications'
                                          : 'Activer les notifications'}
                                </Button>
                            )}

                            {isSubscribed && (
                                <p className="mt-2 flex items-center gap-1 text-micro text-green-600 dark:text-green-400">
                                    <CheckCircle className="h-4 w-4" />
                                    Notifications activées sur cet appareil.
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
                            <h3 className="text-caption font-semibold text-foreground">Devise</h3>
                            <p className="mt-1 text-micro text-muted-foreground">
                                Sélectionnez la devise pour afficher les montants dans votre application.
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

            {/* Export */}
            <Card>
                <CardContent className="p-6">
                    <div className="flex items-start gap-4">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-card bg-primary-soft text-primary">
                            <Download className="h-5 w-5" />
                        </div>
                        <div className="flex-1">
                            <h3 className="text-caption font-semibold text-foreground">Exporter les données</h3>
                            <p className="mt-1 text-micro text-muted-foreground">
                                Télécharge toutes vos données (budget, tâches, recettes, membres, courses,
                                rendez-vous, plannings, repas) dans un fichier JSON.
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
                                {exportLoading ? 'Export en cours…' : 'Exporter'}
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
                            <h3 className="text-caption font-semibold text-foreground">Importer des données</h3>
                            <p className="mt-1 text-micro text-muted-foreground">
                                Restaure des données depuis un fichier d'export OpenFamily. Les données
                                existantes ne sont pas écrasées (doublons ignorés).
                            </p>

                            {importSuccess && (
                                <div className="mt-3 rounded-input border border-border bg-surface-2 p-3">
                                    <p className="mb-2 flex items-center gap-1 text-micro font-semibold text-foreground">
                                        <CheckCircle className="h-4 w-4 text-green-500" />
                                        Import réussi
                                    </p>
                                    <ul className="space-y-0.5 text-micro text-muted-foreground">
                                        {Object.entries(importSuccess).map(([key, count]) => (
                                            <li key={key}>
                                                {ENTITY_LABELS[key] ?? key} : <span className="font-medium text-foreground">{count}</span> élément(s) importé(s)
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
                                        {selectedFile ? selectedFile.name : 'Choisir un fichier…'}
                                    </span>
                                </label>
                                {selectedFile && (
                                    <Button onClick={handleImport} disabled={importLoading}>
                                        {importLoading ? (
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        ) : (
                                            <Upload className="mr-2 h-4 w-4" />
                                        )}
                                        {importLoading ? 'Import en cours…' : 'Importer'}
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
