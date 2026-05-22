import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    ScanLine,
    Camera,
    X as CloseIcon,
    Loader2,
    AlertTriangle,
    Check,
    Info,
} from 'lucide-react';
import { Button, Dialog } from '../ui';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export interface ExtractedReceipt {
    amount: number | null;
    currency: string | null;
    date: string | null;
    merchant: string | null;
    category: string;
    description: string;
    confidence: 'high' | 'medium' | 'low';
    warnings: string[];
}

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Invoked when the user confirms the extraction; parent applies it to the form. */
    onExtracted: (extraction: ExtractedReceipt) => void;
}

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
const MAX_SIZE_MB = 5;

const CONFIDENCE_STYLE: Record<ExtractedReceipt['confidence'], string> = {
    high: 'bg-success/15 text-success border border-success/30',
    medium: 'bg-warning/15 text-warning border border-warning/30',
    low: 'bg-danger/15 text-danger border border-danger/30',
};

// Distinguishes failures so the component can map them to localized messages.
type UploadErrorKind = 'http' | 'network' | 'abort';
interface UploadError extends Error {
    kind: UploadErrorKind;
    status?: number;
    code?: string;
    serverMessage?: string;
}

const uploadReceipt = (file: File): Promise<ExtractedReceipt> =>
    new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${API_URL}/api/ai/budget/scan-receipt`);
        xhr.withCredentials = true;
        xhr.responseType = 'json';

        const fail = (kind: UploadErrorKind, extra: Partial<UploadError> = {}) =>
            reject(Object.assign(new Error(kind), { kind, ...extra }) as UploadError);

        xhr.addEventListener('load', () => {
            if (xhr.status >= 200 && xhr.status < 300 && xhr.response?.success) {
                resolve(xhr.response.data.extraction as ExtractedReceipt);
                return;
            }
            const errorBody = xhr.response?.error;
            const code = typeof errorBody === 'object' ? errorBody?.code : undefined;
            const serverMessage =
                typeof errorBody === 'object' ? errorBody?.message : (errorBody as string);
            fail('http', { status: xhr.status, code, serverMessage });
        });
        xhr.addEventListener('error', () => fail('network'));
        xhr.addEventListener('abort', () => fail('abort'));

        const fd = new FormData();
        fd.append('file', file, file.name);
        xhr.send(fd);
    });

export const ReceiptScanDialog: React.FC<Props> = ({ open, onOpenChange, onExtracted }) => {
    const { t } = useTranslation();
    const confidenceLabel: Record<ExtractedReceipt['confidence'], string> = {
        high: t('budget.receiptScan.confidence.high'),
        medium: t('budget.receiptScan.confidence.medium'),
        low: t('budget.receiptScan.confidence.low'),
    };

    // Maps the upload failure (raised by uploadReceipt) to a localized string.
    const localizeUploadError = (err: unknown): string => {
        const e = err as UploadError | undefined;
        if (e?.kind === 'network') return t('budget.receiptScan.errors.network');
        if (e?.kind === 'abort') return t('budget.receiptScan.errors.aborted');
        if (e?.kind === 'http') {
            if (e.code === 'DISABLED') return t('budget.receiptScan.errors.disabled');
            if (e.code === 'QUOTA_EXCEEDED') return t('budget.receiptScan.errors.quota_exceeded');
            if (e.code === 'BAD_JSON') return t('budget.receiptScan.errors.bad_json');
            return (
                e.serverMessage ||
                t('budget.receiptScan.errors.extract_http', { status: e.status ?? '' })
            );
        }
        return t('budget.receiptScan.errors.extract_failed');
    };

    const [file, setFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [extracting, setExtracting] = useState(false);
    const [error, setError] = useState('');
    const [extraction, setExtraction] = useState<ExtractedReceipt | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Revoke the object URL whenever it changes (or on unmount) — keeping
    // stale blob URLs alive leaks memory across rescans.
    useEffect(() => {
        if (!file) {
            setPreviewUrl(null);
            return;
        }
        const url = URL.createObjectURL(file);
        setPreviewUrl(url);
        return () => URL.revokeObjectURL(url);
    }, [file]);

    // Reset when the dialog closes so reopening starts fresh.
    useEffect(() => {
        if (!open) {
            setFile(null);
            setError('');
            setExtraction(null);
            setExtracting(false);
        }
    }, [open]);

    const handleFileChosen = (f: File | undefined | null) => {
        setError('');
        setExtraction(null);
        if (!f) {
            setFile(null);
            return;
        }
        if (!ALLOWED_MIME.includes(f.type)) {
            setError(
                t('budget.receiptScan.errors.unsupported_format', {
                    type: f.type || t('budget.receiptScan.errors.unknown_type'),
                }),
            );
            return;
        }
        if (f.size > MAX_SIZE_MB * 1024 * 1024) {
            setError(t('budget.receiptScan.errors.too_large', { size: MAX_SIZE_MB }));
            return;
        }
        setFile(f);
    };

    const extract = async () => {
        if (!file) return;
        setError('');
        setExtracting(true);
        setExtraction(null);
        try {
            const result = await uploadReceipt(file);
            setExtraction(result);
        } catch (err) {
            console.error('Receipt extraction failed:', err);
            setError(localizeUploadError(err));
        } finally {
            setExtracting(false);
        }
    };

    const apply = () => {
        if (!extraction) return;
        onExtracted(extraction);
    };

    return (
        <Dialog
            open={open}
            onOpenChange={onOpenChange}
            title={t('budget.receiptScan.title')}
            description={t('budget.receiptScan.description')}
            className="sm:max-w-2xl"
        >
            <div className="space-y-5">
                {/* File picker / camera */}
                <div>
                    <input
                        ref={inputRef}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        onChange={(e) => handleFileChosen(e.target.files?.[0])}
                    />
                    {!previewUrl && (
                        <button
                            type="button"
                            onClick={() => inputRef.current?.click()}
                            className="flex w-full flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed border-border bg-surface-2/50 px-6 py-10 text-muted-foreground transition-colors hover:border-primary hover:bg-primary/5"
                        >
                            <Camera className="h-8 w-8 text-primary" />
                            <span className="text-body font-medium text-foreground">
                                {t('budget.receiptScan.pick_photo')}
                            </span>
                            <span className="text-label-sm">
                                {t('budget.receiptScan.formats_hint')}
                            </span>
                        </button>
                    )}
                    {previewUrl && (
                        <div className="relative rounded-card border border-border bg-surface-2/50 p-2">
                            <img
                                src={previewUrl}
                                alt={t('budget.receiptScan.preview_alt')}
                                className="mx-auto max-h-64 rounded-input object-contain"
                            />
                            <button
                                type="button"
                                onClick={() => {
                                    setFile(null);
                                    setExtraction(null);
                                    setError('');
                                    if (inputRef.current) inputRef.current.value = '';
                                }}
                                className="absolute right-3 top-3 rounded-full bg-card p-1.5 text-muted-foreground shadow-surface hover:text-foreground"
                                aria-label={t('budget.receiptScan.remove_photo')}
                            >
                                <CloseIcon className="h-4 w-4" />
                            </button>
                            <p className="mt-2 truncate text-center text-label-sm text-muted-foreground">
                                {t('budget.receiptScan.file_size', {
                                    name: file?.name ?? '',
                                    size: file ? Math.round(file.size / 1024) : 0,
                                })}
                            </p>
                        </div>
                    )}
                </div>

                {error && (
                    <div className="flex items-start gap-2 rounded-input border border-danger/30 bg-danger-soft px-4 py-3 text-caption text-danger">
                        <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                        <span>{error}</span>
                    </div>
                )}

                {/* Extraction trigger */}
                {file && !extraction && (
                    <div className="flex justify-end">
                        <Button type="button" onClick={extract} disabled={extracting}>
                            {extracting ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    {t('budget.receiptScan.extracting')}
                                </>
                            ) : (
                                <>
                                    <ScanLine className="w-4 h-4 mr-2" />
                                    {t('budget.receiptScan.extract')}
                                </>
                            )}
                        </Button>
                    </div>
                )}

                {/* Extraction preview */}
                {extraction && (
                    <section className="space-y-3 rounded-card border border-border bg-card p-4">
                        <div className="flex items-center justify-between gap-3">
                            <h3 className="text-h2 font-semibold flex items-center gap-2">
                                <Check className="h-5 w-5 text-success" />
                                {t('budget.receiptScan.extracted_title')}
                            </h3>
                            <span
                                className={`rounded-pill px-2.5 py-0.5 text-label-sm font-medium ${CONFIDENCE_STYLE[extraction.confidence]}`}
                            >
                                {confidenceLabel[extraction.confidence]}
                            </span>
                        </div>

                        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-caption">
                            <div>
                                <dt className="text-label-sm text-muted-foreground">
                                    {t('budget.receiptScan.amount')}
                                </dt>
                                <dd className="font-semibold text-foreground">
                                    {extraction.amount !== null
                                        ? `${extraction.amount.toFixed(2)} ${extraction.currency ?? ''}`.trim()
                                        : '—'}
                                </dd>
                            </div>
                            <div>
                                <dt className="text-label-sm text-muted-foreground">
                                    {t('budget.receiptScan.date')}
                                </dt>
                                <dd className="font-semibold text-foreground">
                                    {extraction.date ?? '—'}
                                </dd>
                            </div>
                            <div>
                                <dt className="text-label-sm text-muted-foreground">
                                    {t('budget.receiptScan.merchant')}
                                </dt>
                                <dd className="font-semibold text-foreground">
                                    {extraction.merchant ?? '—'}
                                </dd>
                            </div>
                            <div>
                                <dt className="text-label-sm text-muted-foreground">
                                    {t('budget.receiptScan.category')}
                                </dt>
                                <dd className="font-semibold text-foreground">
                                    {t('budget.categories.' + extraction.category, {
                                        defaultValue: extraction.category,
                                    })}
                                </dd>
                            </div>
                            {extraction.description && (
                                <div className="sm:col-span-2">
                                    <dt className="text-label-sm text-muted-foreground">
                                        {t('budget.receiptScan.description')}
                                    </dt>
                                    <dd className="text-foreground">{extraction.description}</dd>
                                </div>
                            )}
                        </dl>

                        {extraction.warnings.length > 0 && (
                            <ul className="space-y-1">
                                {extraction.warnings.map((w, i) => (
                                    <li
                                        key={i}
                                        className="flex items-start gap-2 text-label-sm text-warning"
                                    >
                                        <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                                        {w}
                                    </li>
                                ))}
                            </ul>
                        )}

                        <p className="flex items-start gap-2 text-label-sm text-muted-foreground">
                            <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                            {t('budget.receiptScan.adjust_hint')}
                        </p>

                        <div className="flex justify-end gap-2 pt-1">
                            <Button
                                type="button"
                                variant="secondary"
                                onClick={extract}
                                disabled={extracting}
                            >
                                {extracting ? (
                                    <>
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        {t('budget.receiptScan.re_extracting')}
                                    </>
                                ) : (
                                    t('budget.receiptScan.re_extract')
                                )}
                            </Button>
                            <Button type="button" onClick={apply}>
                                <Check className="w-4 h-4 mr-1.5" />
                                {t('budget.receiptScan.use_info')}
                            </Button>
                        </div>
                    </section>
                )}

                <div className="flex justify-end pt-2">
                    <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
                        {t('budget.receiptScan.close')}
                    </Button>
                </div>
            </div>
        </Dialog>
    );
};

export default ReceiptScanDialog;
