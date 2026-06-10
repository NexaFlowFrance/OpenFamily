import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useWebSocketUpdates } from '../hooks/useWebSocketUpdates';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { formatCurrency } from '../lib/utils';
import { Plus, Trash2, Check, ShoppingBag, Save, ListChecks, Store, ChevronLeft } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Dialog } from '../components/ui';

interface ShoppingItem {
    id: string;
    name: string;
    category: string;
    quantity?: number;
    unit?: string;
    price?: number;
    is_checked: boolean;
    notes?: string;
}

interface ShoppingTemplate {
    id: string;
    name: string;
    items: Array<{
        name: string;
        category: string;
        quantity?: number;
        unit?: string;
        price?: number;
        notes?: string;
    }>;
}

const categories = ['Alimentation', 'Bebe', 'Menage', 'Sante', 'Autre'];

const parseOptionalPositiveNumber = (value: string): number | undefined => {
    const trimmed = value.trim();
    if (!trimmed) {
        return undefined;
    }

    const parsed = Number(trimmed.replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : Number.NaN;
};

const ShoppingList: React.FC = () => {
    const { t } = useTranslation(['shopping', 'common']);
    const categoryLabel = (value: string) => t(`shopping:categories.${value}`, { defaultValue: value });
    const { user } = useAuth();
    const currency = user?.currency || 'EUR';
    const [items, setItems] = useState<ShoppingItem[]>([]);
    const [templates, setTemplates] = useState<ShoppingTemplate[]>([]);
    const [selectedTemplateId, setSelectedTemplateId] = useState('');
    const [templateName, setTemplateName] = useState('');
    const [newItem, setNewItem] = useState({
        name: '',
        category: 'Alimentation',
        quantity: '',
        price: '',
        unit: '',
    });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
    const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
    const [storeMode, setStoreMode] = useState(false);

    useEffect(() => {
        void Promise.all([loadItems(), loadTemplates()]).finally(() => setLoading(false));
    }, []);
    useWebSocketUpdates('shopping', () => { void loadItems(); });

    const loadItems = async () => {
        try {
            const response = await api.get<{ success: boolean; data: ShoppingItem[] }>('/api/shopping');
            if (response.success) {
                setItems(response.data);
            }
        } catch (err) {
            console.error('Failed to load shopping items:', err);
            setError(err instanceof Error ? err.message : t('shopping:errors.loadItems'));
        }
    };

    const loadTemplates = async () => {
        try {
            const response = await api.get<{ success: boolean; data: ShoppingTemplate[] }>('/api/shopping/templates');
            if (response.success) {
                setTemplates(response.data);
            }
        } catch (err) {
            console.error('Failed to load templates:', err);
            setError(err instanceof Error ? err.message : t('shopping:errors.loadTemplates'));
        }
    };

    const addItem = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (!newItem.name.trim()) {
            setError(t('shopping:errors.nameRequired'));
            return;
        }

        const quantity = parseOptionalPositiveNumber(newItem.quantity);
        const price = parseOptionalPositiveNumber(newItem.price);

        if (quantity !== undefined && (!Number.isFinite(quantity) || quantity <= 0)) {
            setError(t('shopping:errors.quantityInvalid'));
            return;
        }

        if (price !== undefined && (!Number.isFinite(price) || price < 0)) {
            setError(t('shopping:errors.priceInvalid'));
            return;
        }

        try {
            const response = await api.post<{ success: boolean; data: ShoppingItem }>('/api/shopping', {
                name: newItem.name,
                category: newItem.category,
                quantity,
                price,
                unit: newItem.unit || null,
            });

            if (response.success) {
                setItems((prev) => [response.data, ...prev]);
                setNewItem({ name: '', category: 'Alimentation', quantity: '', price: '', unit: '' });
            }
        } catch (err) {
            console.error('Failed to add item:', err);
            setError(err instanceof Error ? err.message : t('shopping:errors.addFailed'));
        }
    };

    const toggleItem = async (item: ShoppingItem) => {
        setError('');
        try {
            const response = await api.put<{ success: boolean; data: ShoppingItem }>(`/api/shopping/${item.id}`, {
                is_checked: !item.is_checked,
            });
            if (response.success) {
                setItems((prev) => prev.map((current) => (current.id === item.id ? response.data : current)));
            }
        } catch (err) {
            console.error('Failed to toggle item:', err);
            setError(err instanceof Error ? err.message : t('shopping:errors.toggleFailed'));
        }
    };

    const deleteItem = async (id: string) => {
        setError('');
        try {
            await api.delete(`/api/shopping/${id}`);
            setItems((prev) => prev.filter((item) => item.id !== id));
        } catch (err) {
            console.error('Failed to delete item:', err);
            setError(err instanceof Error ? err.message : t('shopping:errors.deleteFailed'));
        }
    };

    const clearCheckedItems = async () => {
        setError('');
        try {
            await api.delete('/api/shopping/checked/clear');
            setItems((prev) => prev.filter((item) => !item.is_checked));
        } catch (err) {
            console.error('Failed to clear checked items:', err);
            setError(err instanceof Error ? err.message : t('shopping:errors.clearFailed'));
        }
    };

    const openTemplateDialog = () => {
        setError('');
        if (items.length === 0) {
            setError(t('shopping:errors.noItemsForTemplate'));
            return;
        }
        // Pre-select all items by default
        setSelectedItemIds(new Set(items.map((item) => item.id)));
        setTemplateDialogOpen(true);
    };

    const toggleItemSelection = (id: string) => {
        setSelectedItemIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const selectByCategory = (category: string) => {
        setSelectedItemIds((prev) => {
            const next = new Set(prev);
            items.filter((item) => item.category === category).forEach((item) => next.add(item.id));
            return next;
        });
    };

    const deselectByCategory = (category: string) => {
        setSelectedItemIds((prev) => {
            const next = new Set(prev);
            items.filter((item) => item.category === category).forEach((item) => next.delete(item.id));
            return next;
        });
    };

    const saveTemplateFromDialog = async () => {
        setError('');
        const name = templateName.trim();
        if (!name) {
            setError(t('shopping:errors.templateNameRequired'));
            return;
        }

        const templateItems = items
            .filter((item) => selectedItemIds.has(item.id))
            .map((item) => ({
                name: item.name,
                category: item.category,
                quantity: item.quantity,
                unit: item.unit,
                price: item.price,
                notes: item.notes,
            }));

        if (templateItems.length === 0) {
            setError(t('shopping:errors.selectAtLeastOne'));
            return;
        }

        try {
            await api.post('/api/shopping/templates', {
                name,
                items: templateItems,
            });
            setTemplateName('');
            setTemplateDialogOpen(false);
            setSelectedItemIds(new Set());
            await loadTemplates();
        } catch (err) {
            console.error('Failed to save template:', err);
            setError(err instanceof Error ? err.message : t('shopping:errors.saveTemplateFailed'));
        }
    };

    const applyTemplate = async () => {
        setError('');
        if (!selectedTemplateId) {
            setError(t('shopping:errors.selectTemplateApply'));
            return;
        }

        try {
            await api.post(`/api/shopping/templates/${selectedTemplateId}/apply`, {});
            await loadItems();
        } catch (err) {
            console.error('Failed to apply template:', err);
            setError(err instanceof Error ? err.message : t('shopping:errors.applyTemplateFailed'));
        }
    };

    const deleteTemplate = async () => {
        setError('');
        if (!selectedTemplateId) {
            setError(t('shopping:errors.selectTemplateDelete'));
            return;
        }

        try {
            await api.delete(`/api/shopping/templates/${selectedTemplateId}`);
            setSelectedTemplateId('');
            await loadTemplates();
        } catch (err) {
            console.error('Failed to delete template:', err);
            setError(err instanceof Error ? err.message : t('shopping:errors.deleteTemplateFailed'));
        }
    };

    const pendingItems = useMemo(() => items.filter((item) => !item.is_checked), [items]);
    const completedItems = useMemo(() => items.filter((item) => item.is_checked), [items]);

    // Store mode: group every item by category (aisle), keeping checked ones for context.
    const itemsByAisle = useMemo(() => {
        const groups = new Map<string, ShoppingItem[]>();
        for (const cat of categories) groups.set(cat, []);
        for (const item of items) {
            const cat = groups.has(item.category) ? item.category : 'Autre';
            groups.get(cat)!.push(item);
        }
        return Array.from(groups.entries())
            .filter(([, list]) => list.length > 0)
            .map(([category, list]) => ({
                category,
                list: [...list].sort((a, b) => Number(a.is_checked) - Number(b.is_checked)),
            }));
    }, [items]);

    const totalPrice = useMemo(() => {
        return pendingItems.reduce((sum, item) => {
            const quantity = item.quantity && item.quantity > 0 ? item.quantity : 1;
            const price = item.price || 0;
            return sum + quantity * price;
        }, 0);
    }, [pendingItems]);

    if (loading) {
        return (
            <div className="flex h-full min-h-[50vh] items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="spinner-brand" />
                    <p className="animate-pulse font-medium text-muted-foreground">{t('shopping:loading')}</p>
                </div>
            </div>
        );
    }

    // ─── Mode magasin ───────────────────────────────────────────────────────────
    if (storeMode) {
        const remaining = pendingItems.length;
        const total = items.length;
        const done = total - remaining;
        return (
            <div className="mx-auto max-w-2xl space-y-4 pb-28">
                <div className="sticky top-0 z-20 -mx-4 flex items-center gap-3 border-b border-border bg-background/90 px-4 py-3 backdrop-blur-md">
                    <Button variant="ghost" size="sm" onClick={() => setStoreMode(false)}>
                        <ChevronLeft className="h-5 w-5" />
                    </Button>
                    <div className="flex-1">
                        <h1 className="flex items-center gap-2 text-h2 font-semibold text-foreground">
                            <Store className="h-5 w-5 text-primary" /> {t('shopping:storeMode.title')}
                        </h1>
                        <p className="text-caption text-muted-foreground">
                            {t('shopping:storeMode.cart', { done, total })} · {t('shopping:storeMode.remaining', { count: remaining })}
                        </p>
                    </div>
                </div>

                {total === 0 ? (
                    <div className="rounded-card border border-dashed border-border bg-card py-16 text-center">
                        <ShoppingBag className="mx-auto mb-3 h-12 w-12 text-muted-foreground/30" />
                        <p className="text-body font-semibold text-foreground">{t('shopping:storeMode.emptyList')}</p>
                    </div>
                ) : (
                    itemsByAisle.map(({ category, list }) => (
                        <section key={category}>
                            <h2 className="mb-2 px-1 text-caption font-semibold uppercase tracking-wide text-muted-foreground">
                                {categoryLabel(category)}
                            </h2>
                            <div className="space-y-2">
                                {list.map((item) => (
                                    <button
                                        key={item.id}
                                        type="button"
                                        onClick={() => toggleItem(item)}
                                        className={`flex w-full items-center gap-4 rounded-card border p-4 text-left transition-all active:scale-[0.99] ${
                                            item.is_checked
                                                ? 'border-border bg-muted/30 opacity-60'
                                                : 'border-border bg-card shadow-surface'
                                        }`}
                                    >
                                        <span
                                            className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border-2 ${
                                                item.is_checked ? 'border-primary bg-primary' : 'border-input'
                                            }`}
                                        >
                                            {item.is_checked && <Check className="h-5 w-5 text-white" strokeWidth={3} />}
                                        </span>
                                        <span className="min-w-0 flex-1">
                                            <span className={`block truncate text-body font-medium ${item.is_checked ? 'text-muted-foreground line-through' : 'text-foreground'}`}>
                                                {item.name}
                                            </span>
                                            {(item.quantity || item.price) && (
                                                <span className="mt-0.5 flex items-center gap-2 text-micro text-muted-foreground">
                                                    {item.quantity ? <span>{t('shopping:qty')}: {item.quantity}{item.unit ? ` ${item.unit}` : ''}</span> : null}
                                                    {item.price ? <span>{formatCurrency(Number(item.price), currency)}</span> : null}
                                                </span>
                                            )}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </section>
                    ))
                )}
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-4xl space-y-6">
            {error ? (
                <div className="rounded-input border border-danger/30 bg-danger/10 px-4 py-3 text-caption text-danger">
                    {error}
                </div>
            ) : null}

            <div className="flex items-center gap-3">
                <div className="rounded-card bg-primary-soft p-3 text-primary">
                    <ShoppingBag className="h-7 w-7" />
                </div>
                <div className="flex-1">
                    <h1 className="text-h1 text-foreground">{t('shopping:header.title')}</h1>
                    <p className="text-body text-muted-foreground">{t('shopping:header.remaining', { count: pendingItems.length })}</p>
                </div>
                {items.length > 0 && (
                    <Button onClick={() => setStoreMode(true)}>
                        <Store className="mr-1 h-4 w-4" />
                        {t('shopping:storeMode.enter')}
                    </Button>
                )}
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>{t('shopping:add.title')}</CardTitle>
                </CardHeader>
                <CardContent>
                    <form onSubmit={addItem} className="grid grid-cols-1 gap-4 md:grid-cols-8">
                        <div className="md:col-span-3">
                            <Input
                                label={t('common:labels.name')}
                                type="text"
                                value={newItem.name}
                                onChange={(e) => setNewItem((prev) => ({ ...prev, name: e.target.value }))}
                                placeholder={t('shopping:add.namePlaceholder')}
                            />
                        </div>
                        <div className="md:col-span-2">
                            <label className="mb-1.5 block text-caption font-medium text-foreground">{t('shopping:add.category')}</label>
                            <select
                                value={newItem.category}
                                onChange={(e) => setNewItem((prev) => ({ ...prev, category: e.target.value }))}
                                className="input-nexus py-0 text-caption"
                            >
                                {categories.map((category) => (
                                    <option key={category} value={category}>
                                        {categoryLabel(category)}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <Input
                                label={t('shopping:qty')}
                                type="number"
                                min="0"
                                step="0.1"
                                value={newItem.quantity}
                                onChange={(e) => setNewItem((prev) => ({ ...prev, quantity: e.target.value }))}
                                placeholder={t('shopping:add.qtyPlaceholder')}
                            />
                        </div>
                        <div>
                            <Input
                                label={t('common:labels.price')}
                                type="number"
                                min="0"
                                step="0.01"
                                value={newItem.price}
                                onChange={(e) => setNewItem((prev) => ({ ...prev, price: e.target.value }))}
                                placeholder={t('shopping:add.pricePlaceholder')}
                            />
                        </div>
                        <div className="md:col-span-8 flex justify-end">
                            <Button type="submit">
                                <Plus className="mr-1 h-4 w-4" />
                                {t('common:actions.add')}
                            </Button>
                        </div>
                    </form>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <ListChecks className="h-5 w-5 text-primary" />
                        {t('shopping:templates.title')}
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                        <Input
                            label={t('shopping:templates.newLabel')}
                            value={templateName}
                            onChange={(e) => setTemplateName(e.target.value)}
                            placeholder={t('shopping:templates.newPlaceholder')}
                        />
                        <div className="md:col-span-2 flex items-end gap-2">
                            <Button variant="secondary" className="w-full md:w-auto" onClick={openTemplateDialog}>
                                <Save className="mr-1 h-4 w-4" />
                                {t('shopping:templates.create')}
                            </Button>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                        <div className="md:col-span-2">
                            <label className="mb-1.5 block text-caption font-medium text-foreground">{t('shopping:templates.existing')}</label>
                            <select
                                value={selectedTemplateId}
                                onChange={(e) => setSelectedTemplateId(e.target.value)}
                                className="input-nexus py-0 text-caption"
                            >
                                <option value="">{t('shopping:templates.selectPlaceholder')}</option>
                                {templates.map((template) => (
                                    <option key={template.id} value={template.id}>
                                        {template.name} ({t('shopping:templates.optionItems', { count: template.items?.length || 0 })})
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="flex items-end gap-2">
                            <Button variant="secondary" className="flex-1" onClick={applyTemplate}>
                                {t('common:actions.apply')}
                            </Button>
                            <Button variant="ghost" className="text-destructive hover:bg-destructive/10" onClick={deleteTemplate}>
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <div className="space-y-3">
                {pendingItems.length === 0 && completedItems.length === 0 ? (
                    <div className="rounded-card border border-dashed border-border bg-card py-16 text-center">
                        <ShoppingBag className="mx-auto mb-3 h-12 w-12 text-muted-foreground/30" />
                        <h3 className="text-body font-semibold text-foreground">{t('shopping:list.emptyTitle')}</h3>
                        <p className="text-caption text-muted-foreground">{t('shopping:list.emptySubtitle')}</p>
                    </div>
                ) : (
                    <>
                        {pendingItems.map((item) => (
                            <div
                                key={item.id}
                                className="group flex items-center gap-4 rounded-card border border-border bg-card p-4 shadow-surface transition-all duration-fast ease-soft hover:border-border-strong"
                            >
                                <button
                                    type="button"
                                    onClick={() => toggleItem(item)}
                                    className="flex h-6 w-6 items-center justify-center rounded-md border-2 border-input"
                                >
                                    {item.is_checked ? <Check className="h-3.5 w-3.5 text-primary" /> : null}
                                </button>

                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-body font-medium text-foreground">{item.name}</p>
                                    <div className="mt-1 flex flex-wrap items-center gap-2 text-micro">
                                        <span className="rounded-pill bg-primary-soft px-2 py-0.5 text-primary">{categoryLabel(item.category)}</span>
                                        {item.quantity ? <span className="text-muted-foreground">{t('shopping:qty')}: {item.quantity}</span> : null}
                                        {item.price ? <span className="text-muted-foreground">{formatCurrency(Number(item.price), currency)}</span> : null}
                                    </div>
                                </div>

                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => deleteItem(item.id)}
                                    className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                >
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </div>
                        ))}

                        {completedItems.length > 0 ? (
                            <div className="rounded-card border border-dashed border-border bg-muted/20 p-4">
                                <div className="mb-3 flex items-center justify-between">
                                    <p className="text-caption font-medium text-muted-foreground">{t('shopping:list.completed', { count: completedItems.length })}</p>
                                    <Button variant="ghost" size="sm" onClick={clearCheckedItems}>
                                        {t('shopping:list.clean')}
                                    </Button>
                                </div>
                                <div className="space-y-2">
                                    {completedItems.map((item) => (
                                        <div
                                            key={item.id}
                                            className="flex items-center gap-3 rounded-input border border-border bg-card px-3 py-2"
                                        >
                                            <button
                                                type="button"
                                                onClick={() => toggleItem(item)}
                                                className="flex h-5 w-5 items-center justify-center rounded border border-primary bg-primary"
                                            >
                                                <Check className="h-3 w-3 text-white" />
                                            </button>
                                            <p className="line-through text-caption text-muted-foreground">{item.name}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : null}
                    </>
                )}
            </div>

            <div className="sticky bottom-20 z-20 rounded-card border border-border bg-card px-4 py-3 shadow-surface lg:bottom-4">
                <div className="flex items-center justify-between text-caption">
                    <span className="text-muted-foreground">{t('shopping:footer.estimatedTotal')}</span>
                    <span className="text-body font-semibold text-foreground">{formatCurrency(totalPrice, currency)}</span>
                </div>
            </div>

            {/* Template creation dialog */}
            <Dialog
                open={templateDialogOpen}
                onOpenChange={setTemplateDialogOpen}
                title={t('shopping:dialog.title')}
                description={t('shopping:dialog.description')}
            >
                <div className="space-y-4">
                    <Input
                        label={t('shopping:dialog.nameLabel')}
                        value={templateName}
                        onChange={(e) => setTemplateName(e.target.value)}
                        placeholder={t('shopping:dialog.namePlaceholder')}
                    />
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-label font-medium text-foreground">
                                {t('shopping:dialog.itemsSelected', { selected: selectedItemIds.size, total: items.length })}
                            </span>
                            <div className="flex gap-2">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setSelectedItemIds(new Set(items.map((i) => i.id)))}
                                >
                                    {t('shopping:dialog.selectAll')}
                                </Button>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setSelectedItemIds(new Set())}
                                >
                                    {t('shopping:dialog.deselectAll')}
                                </Button>
                            </div>
                        </div>
                        <div className="max-h-72 overflow-y-auto space-y-3 rounded-input border border-border p-3">
                            {categories.map((category) => {
                                const categoryItems = items.filter((item) => item.category === category);
                                if (categoryItems.length === 0) return null;
                                const allSelected = categoryItems.every((item) => selectedItemIds.has(item.id));
                                return (
                                    <div key={category}>
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="text-caption font-semibold text-muted-foreground uppercase tracking-wide">
                                                {categoryLabel(category)} ({categoryItems.length})
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => allSelected ? deselectByCategory(category) : selectByCategory(category)}
                                                className="text-micro text-primary underline hover:no-underline"
                                            >
                                                {allSelected ? t('shopping:dialog.deselect') : t('shopping:dialog.selectAll')}
                                            </button>
                                        </div>
                                        <div className="space-y-1 pl-1">
                                            {categoryItems.map((item) => (
                                                <label
                                                    key={item.id}
                                                    className="flex items-center gap-2 cursor-pointer hover:bg-nexus-background rounded px-1 py-0.5"
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedItemIds.has(item.id)}
                                                        onChange={() => toggleItemSelection(item.id)}
                                                        className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                                                    />
                                                    <span className={`text-body-sm ${item.is_checked ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                                                        {item.name}
                                                        {item.quantity ? ` · ${item.quantity}${item.unit ? ' ' + item.unit : ''}` : ''}
                                                    </span>
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                    <div className="flex justify-end gap-3 pt-2">
                        <Button type="button" variant="secondary" onClick={() => setTemplateDialogOpen(false)}>
                            {t('common:actions.cancel')}
                        </Button>
                        <Button type="button" onClick={saveTemplateFromDialog}>
                            <Save className="mr-1 h-4 w-4" />
                            {t('shopping:dialog.create')}
                        </Button>
                    </div>
                </div>
            </Dialog>
        </div>
    );
};

export default ShoppingList;
