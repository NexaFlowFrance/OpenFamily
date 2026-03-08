import React, { useRef, useState } from 'react';
import { api } from '../lib/api';
import { Download, Upload, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { Card, CardContent, Button } from '../components/ui';

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

const Settings: React.FC = () => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [exportLoading, setExportLoading] = useState(false);
    const [exportError, setExportError] = useState('');
    const [importLoading, setImportLoading] = useState(false);
    const [importError, setImportError] = useState('');
    const [importSuccess, setImportSuccess] = useState<ImportCounts | null>(null);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);

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
