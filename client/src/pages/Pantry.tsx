import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { differenceInCalendarDays, format } from 'date-fns';
import { Archive, Edit2, Minus, Package, Plus, Refrigerator, ScanBarcode, Search, ShoppingCart, Snowflake, Trash2 } from 'lucide-react';
import { Button, Card, CardContent, CardHeader, CardTitle, DatePicker, Dialog, Input, Select, useToast } from '../components/ui';
import BarcodeScanner, { canScanBarcodes } from '../components/app/BarcodeScanner';
import { useWebSocketUpdates } from '../hooks/useWebSocketUpdates';
import { api, ApiError } from '../lib/api';
import { dateLocale } from '../i18n/format';

// The pantry: what the family has at home, where it is kept, and until when it
// is good. What must be eaten first comes first.

type PantryLocation = 'fridge' | 'freezer' | 'cupboard' | 'other';
const LOCATIONS: PantryLocation[] = ['fridge', 'freezer', 'cupboard', 'other'];
const LOCATION_ICONS: Record<PantryLocation, typeof Package> = {
    fridge: Refrigerator,
    freezer: Snowflake,
    cupboard: Archive,
    other: Package,
};
/** From this many days before its date, a product is flagged as to be eaten soon. */
const SOON_DAYS = 3;

interface PantryItem {
    id: string;
    name: string;
    /** A decimal number, as text. */
    quantity: string | null;
    unit: string | null;
    location: PantryLocation;
    expires_on: string | null;
    barcode: string | null;
    notes: string | null;
}

interface FormState {
    name: string;
    quantity: string;
    unit: string;
    location: PantryLocation;
    expires_on: string;
    barcode: string;
}

const EMPTY_FORM: FormState = { name: '', quantity: '1', unit: '', location: 'fridge', expires_on: '', barcode: '' };

const formOf = (item: PantryItem): FormState => ({
    name: item.name,
    quantity: item.quantity === null ? '' : String(Number(item.quantity)),
    unit: item.unit ?? '',
    location: item.location,
    expires_on: item.expires_on ? item.expires_on.slice(0, 10) : '',
    barcode: item.barcode ?? '',
});

/** Days until a product's date: negative once it is past, null without a date. */
const daysLeft = (item: PantryItem): number | null =>
    (item.expires_on ? differenceInCalendarDays(new Date(`${item.expires_on.slice(0, 10)}T00:00:00`), new Date()) : null);

const Pantry: React.FC = () => {
    const { t } = useTranslation(['pantry', 'common']);
    const { showToast } = useToast();
    const [items, setItems] = useState<PantryItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [form, setForm] = useState<FormState>(EMPTY_FORM);
    const [hint, setHint] = useState('');
    const [looking, setLooking] = useState(false);
    const [saving, setSaving] = useState(false);
    const [scanning, setScanning] = useState(false);
    const [editing, setEditing] = useState<PantryItem | null>(null);
    const [editForm, setEditForm] = useState<FormState>(EMPTY_FORM);
    // Asked once: the answer does not change while the page is open.
    const scanner = useMemo(() => canScanBarcodes(), []);

    const load = async () => {
        try {
            const res = await api.get<{ success: boolean; data: PantryItem[] }>('/api/pantry');
            if (res.success && Array.isArray(res.data)) setItems(res.data);
            setError('');
        } catch {
            setError(t('pantry:errors.load'));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { void load(); }, []);
    useWebSocketUpdates('pantry', () => { void load(); });

    const bodyOf = (state: FormState) => ({
        name: state.name.trim(),
        quantity: state.quantity.trim() === '' ? null : state.quantity.trim(),
        unit: state.unit.trim() || null,
        location: state.location,
        expires_on: state.expires_on || null,
        barcode: state.barcode.trim() || null,
    });

    // What a barcode is the barcode of: the family's own name for it when it
    // has one, Open Food Facts otherwise. The form is filled, never sent.
    const lookup = async (barcode: string) => {
        const digits = barcode.trim();
        if (!/^\d{6,20}$/.test(digits)) {
            setHint(t('pantry:barcode.invalid'));
            return;
        }
        setLooking(true);
        setHint('');
        try {
            const res = await api.get<{ success: boolean; data: { source: string; name: string; brand: string | null; package: string | null; unit: string | null; location: PantryLocation | null } }>(
                `/api/pantry/lookup/${digits}`,
            );
            const product = res.data;
            setForm((prev) => ({
                ...prev,
                barcode: digits,
                name: product.name,
                unit: product.unit ?? prev.unit,
                location: product.location ?? prev.location,
            }));
            setHint(product.source === 'pantry'
                ? t('pantry:barcode.known')
                : [product.brand, product.package].filter(Boolean).join(' · ') || t('pantry:barcode.found'));
        } catch (e) {
            setForm((prev) => ({ ...prev, barcode: digits }));
            setHint(e instanceof ApiError && e.status === 404 ? t('pantry:barcode.unknown') : t('pantry:barcode.unavailable'));
        } finally {
            setLooking(false);
        }
    };

    const add = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!form.name.trim() || saving) return;
        setSaving(true);
        try {
            await api.post('/api/pantry', bodyOf(form));
            // The place is kept: the shopping is put away one shelf at a time.
            setForm({ ...EMPTY_FORM, location: form.location });
            setHint('');
            await load();
        } catch {
            setError(t('pantry:errors.save'));
        } finally {
            setSaving(false);
        }
    };

    const saveEdit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!editing || !editForm.name.trim() || saving) return;
        setSaving(true);
        try {
            await api.put(`/api/pantry/${editing.id}`, bodyOf(editForm));
            setEditing(null);
            await load();
        } catch {
            setError(t('pantry:errors.save'));
        } finally {
            setSaving(false);
        }
    };

    const changeQuantity = async (item: PantryItem, delta: number) => {
        const next = Math.max(0, Number(item.quantity ?? 0) + delta);
        // Shown at once: the tap must feel like a tap.
        setItems((prev) => prev.map((entry) => (entry.id === item.id ? { ...entry, quantity: String(next) } : entry)));
        try {
            await api.put(`/api/pantry/${item.id}`, { quantity: next });
        } catch {
            setError(t('pantry:errors.save'));
            void load();
        }
    };

    const remove = async (item: PantryItem) => {
        setItems((prev) => prev.filter((entry) => entry.id !== item.id));
        try {
            await api.delete(`/api/pantry/${item.id}`);
        } catch {
            setError(t('pantry:errors.save'));
            void load();
        }
    };

    const toShopping = async (item: PantryItem) => {
        try {
            // 'Alimentation' is the name food is stored under in the shopping list.
            await api.post('/api/shopping', { name: item.name, category: 'Alimentation', quantity: 1, unit: item.unit });
            showToast({ title: t('pantry:toShopping.done', { name: item.name }) });
        } catch {
            showToast({ title: t('pantry:errors.save') });
        }
    };

    const soon = items.filter((item) => { const days = daysLeft(item); return days !== null && days <= SOON_DAYS; });
    const locationOptions = LOCATIONS.map((location) => ({ value: location, label: t(`pantry:locations.${location}`) }));

    const expiryLabel = (item: PantryItem): { text: string; tone: string } | null => {
        const days = daysLeft(item);
        if (days === null || !item.expires_on) return null;
        const date = format(new Date(`${item.expires_on.slice(0, 10)}T00:00:00`), 'd MMM yyyy', { locale: dateLocale() });
        if (days < 0) return { text: t('pantry:expiry.past', { date }), tone: 'bg-danger/10 text-danger' };
        if (days === 0) return { text: t('pantry:expiry.today'), tone: 'bg-danger/10 text-danger' };
        if (days <= SOON_DAYS) return { text: t('pantry:expiry.soon', { count: days }), tone: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300' };
        return { text: t('pantry:expiry.date', { date }), tone: 'bg-surface-2 text-muted-foreground' };
    };

    const fields = (state: FormState, change: (next: FormState) => void, idPrefix: string) => (
        <>
            <div className="col-span-2 md:col-span-4">
                <Input
                    id={`${idPrefix}-name`}
                    label={t('common:labels.name')}
                    value={state.name}
                    onChange={(e) => change({ ...state, name: e.target.value })}
                    placeholder={t('pantry:form.namePlaceholder')}
                    maxLength={255}
                    required
                />
            </div>
            <div className="col-span-1 md:col-span-1">
                <Input
                    id={`${idPrefix}-quantity`}
                    label={t('pantry:form.quantity')}
                    value={state.quantity}
                    onChange={(e) => change({ ...state, quantity: e.target.value })}
                    inputMode="decimal"
                />
            </div>
            <div className="col-span-1 md:col-span-1">
                <Input
                    id={`${idPrefix}-unit`}
                    label={t('pantry:form.unit')}
                    value={state.unit}
                    onChange={(e) => change({ ...state, unit: e.target.value })}
                    placeholder={t('pantry:form.unitPlaceholder')}
                    maxLength={50}
                />
            </div>
            <div className="col-span-1 md:col-span-3">
                <label className="mb-1.5 block text-caption font-medium text-foreground">{t('pantry:form.location')}</label>
                <Select
                    value={state.location}
                    onValueChange={(value) => change({ ...state, location: value as PantryLocation })}
                    options={locationOptions}
                />
            </div>
            <div className="col-span-1 md:col-span-3">
                <DatePicker
                    label={t('pantry:form.expiresOn')}
                    type="date"
                    value={state.expires_on}
                    onChange={(value) => change({ ...state, expires_on: value })}
                />
            </div>
        </>
    );

    return (
        <div className="mx-auto max-w-4xl space-y-6">
            {error ? (
                <div className="rounded-input border border-danger/30 bg-danger/10 px-4 py-3 text-caption text-danger">{error}</div>
            ) : null}

            <div className="flex items-center gap-3">
                <div className="rounded-card bg-primary-soft p-3 text-primary">
                    <Refrigerator className="h-7 w-7" />
                </div>
                <div className="flex-1">
                    <h1 className="text-h1 text-foreground">{t('pantry:header.title')}</h1>
                    <p className="text-body text-muted-foreground">{t('pantry:header.count', { count: items.length })}</p>
                </div>
            </div>

            {soon.length > 0 && (
                <div className="rounded-card border border-amber-300/60 bg-amber-50 px-4 py-3 text-body-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                    {t('pantry:soon.banner', { count: soon.length })}
                </div>
            )}

            <Card>
                <CardHeader>
                    <CardTitle>{t('pantry:add.title')}</CardTitle>
                </CardHeader>
                <CardContent>
                    <form onSubmit={add} className="grid grid-cols-2 gap-3 md:grid-cols-6 md:gap-4">
                        <div className="col-span-2 md:col-span-6">
                            <div className="flex items-end gap-2">
                                <div className="min-w-0 flex-1">
                                    <Input
                                        id="pantry-barcode"
                                        label={t('pantry:barcode.label')}
                                        value={form.barcode}
                                        onChange={(e) => setForm({ ...form, barcode: e.target.value.replace(/\D/g, '').slice(0, 20) })}
                                        onKeyDown={(e) => {
                                            // A handheld scanner types the digits, then Enter.
                                            if (e.key === 'Enter' && form.barcode && !form.name.trim()) {
                                                e.preventDefault();
                                                void lookup(form.barcode);
                                            }
                                        }}
                                        inputMode="numeric"
                                        placeholder={t('pantry:barcode.placeholder')}
                                    />
                                </div>
                                <Button type="button" variant="secondary" disabled={looking || !form.barcode} onClick={() => { void lookup(form.barcode); }}>
                                    <Search className="h-4 w-4 sm:mr-1" />
                                    <span className="hidden sm:inline">{t('pantry:barcode.find')}</span>
                                    <span className="sr-only sm:hidden">{t('pantry:barcode.find')}</span>
                                </Button>
                                {scanner && (
                                    <Button type="button" variant="secondary" onClick={() => setScanning(true)}>
                                        <ScanBarcode className="h-4 w-4 sm:mr-1" />
                                        <span className="hidden sm:inline">{t('pantry:scan.button')}</span>
                                        <span className="sr-only sm:hidden">{t('pantry:scan.button')}</span>
                                    </Button>
                                )}
                            </div>
                            {hint && <p className="mt-1.5 text-micro text-muted-foreground" role="status">{hint}</p>}
                        </div>

                        {fields(form, setForm, 'pantry-add')}

                        <div className="col-span-2 flex justify-end md:col-span-6">
                            <Button type="submit" disabled={saving || !form.name.trim()}>
                                <Plus className="mr-1 h-4 w-4" />
                                {t('common:actions.add')}
                            </Button>
                        </div>
                    </form>
                </CardContent>
            </Card>

            {!loading && items.length === 0 && (
                <p className="rounded-card border border-dashed border-border px-4 py-10 text-center text-body text-muted-foreground">
                    {t('pantry:empty')}
                </p>
            )}

            {LOCATIONS.map((location) => {
                const here = items.filter((item) => item.location === location);
                if (here.length === 0) return null;
                const LocationIcon = LOCATION_ICONS[location];
                return (
                    <section key={location} aria-label={t(`pantry:locations.${location}`)} className="space-y-2">
                        <h2 className="flex items-center gap-2 text-h3 text-foreground">
                            <LocationIcon className="h-5 w-5 text-muted-foreground" />
                            {t(`pantry:locations.${location}`)}
                            <span className="text-body-sm font-normal text-muted-foreground">{here.length}</span>
                        </h2>
                        <ul className="space-y-2">
                            {here.map((item) => {
                                const expiry = expiryLabel(item);
                                return (
                                    <li key={item.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-card border border-border bg-card px-3 py-2.5">
                                        <div className="min-w-0 flex-1 basis-40">
                                            <p className="break-words text-body font-medium text-foreground">{item.name}</p>
                                            <div className="mt-1 flex flex-wrap items-center gap-2">
                                                {expiry && (
                                                    <span className={`rounded-full px-2 py-0.5 text-micro font-medium ${expiry.tone}`}>{expiry.text}</span>
                                                )}
                                                {item.barcode && <span className="text-micro text-muted-foreground">{item.barcode}</span>}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <Button type="button" variant="ghost" size="sm" aria-label={t('pantry:actions.less')} disabled={item.quantity === null || Number(item.quantity) <= 0} onClick={() => { void changeQuantity(item, -1); }}>
                                                <Minus className="h-4 w-4" />
                                            </Button>
                                            <span className="min-w-[3.5rem] text-center text-body-sm text-foreground">
                                                {item.quantity === null ? '·' : `${Number(item.quantity)}${item.unit ? ` ${item.unit}` : ''}`}
                                            </span>
                                            <Button type="button" variant="ghost" size="sm" aria-label={t('pantry:actions.more')} onClick={() => { void changeQuantity(item, 1); }}>
                                                <Plus className="h-4 w-4" />
                                            </Button>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <Button type="button" variant="ghost" size="sm" aria-label={t('pantry:toShopping.button')} title={t('pantry:toShopping.button')} onClick={() => { void toShopping(item); }}>
                                                <ShoppingCart className="h-4 w-4" />
                                            </Button>
                                            <Button type="button" variant="ghost" size="sm" aria-label={t('common:actions.edit')} onClick={() => { setEditing(item); setEditForm(formOf(item)); }}>
                                                <Edit2 className="h-4 w-4" />
                                            </Button>
                                            <Button type="button" variant="ghost" size="sm" aria-label={t('common:actions.delete')} onClick={() => { void remove(item); }}>
                                                <Trash2 className="h-4 w-4 text-red-500" />
                                            </Button>
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    </section>
                );
            })}

            <Dialog
                open={Boolean(editing)}
                onOpenChange={(open) => { if (!open) setEditing(null); }}
                title={t('pantry:edit.title')}
                description={editing?.name ?? ''}
            >
                <form onSubmit={saveEdit} className="grid grid-cols-2 gap-3 md:grid-cols-6 md:gap-4">
                    {fields(editForm, setEditForm, 'pantry-edit')}
                    <div className="col-span-2 flex justify-end gap-2 md:col-span-6">
                        <Button type="button" variant="secondary" onClick={() => setEditing(null)}>{t('common:actions.cancel')}</Button>
                        <Button type="submit" disabled={saving || !editForm.name.trim()}>{t('common:actions.save')}</Button>
                    </div>
                </form>
            </Dialog>

            <BarcodeScanner
                open={scanning}
                onClose={() => setScanning(false)}
                onDetected={(barcode) => {
                    setScanning(false);
                    void lookup(barcode);
                }}
            />
        </div>
    );
};

export default Pantry;
