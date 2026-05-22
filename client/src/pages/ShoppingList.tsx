import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Plus,
    Trash2,
    Check,
    ShoppingBag,
    ListChecks,
    Sparkles,
    X,
    Pencil,
    PlayCircle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { useCurrency } from '../lib/useCurrency';
import {
    type ShoppingItem,
    type ShoppingTemplate,
    useApplyTemplate,
    useClearCheckedItems,
    useCreateShoppingItem,
    useCreateTemplate,
    useUpdateTemplate,
    useDeleteShoppingItem,
    useDeleteTemplate,
    useShoppingItems,
    useShoppingTemplates,
    useUpdateShoppingItem,
} from '../hooks/useShopping';
import { useParseShoppingText, type AiParsedItem } from '../hooks/useAiShopping';
import ShoppingItemPicker, { type PickerSuggestion } from '../components/app/ShoppingItemPicker';
import TemplateEditorDialog from '../components/app/TemplateEditorDialog';
import { SHOPPING_CATALOG } from '../lib/shoppingCatalog';

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
    const { t } = useTranslation();
    const { format: formatMoney } = useCurrency();

    // React Query owns the data lifecycle now — cache, dedup, refetch on focus,
    // and (for write paths) optimistic updates with rollback are handled by the
    // hooks in useShopping. UI state stays here.
    const itemsQuery = useShoppingItems();
    const templatesQuery = useShoppingTemplates();
    const items: ShoppingItem[] = itemsQuery.data ?? [];
    const templates: ShoppingTemplate[] = templatesQuery.data ?? [];
    const loading = itemsQuery.isPending || templatesQuery.isPending;

    const createItem = useCreateShoppingItem();
    const updateItem = useUpdateShoppingItem();
    const deleteItemMutation = useDeleteShoppingItem();
    const clearCheckedMutation = useClearCheckedItems();
    const createTemplateMutation = useCreateTemplate();
    const updateTemplateMutation = useUpdateTemplate();
    const applyTemplateMutation = useApplyTemplate();
    const deleteTemplateMutation = useDeleteTemplate();

    const [newItem, setNewItem] = useState({
        name: '',
        category: 'Alimentation',
        quantity: '',
        price: '',
        unit: '',
    });
    const [error, setError] = useState('');

    // Template editor: undefined target = create mode, otherwise edit mode.
    // `seedFromCurrentList` lets the "Save current list as template" button
    // pre-fill the editor without polluting an existing template.
    const [templateEditor, setTemplateEditor] = useState<{
        open: boolean;
        target?: ShoppingTemplate;
        seedFromCurrentList?: boolean;
    }>({ open: false });

    // AI: free-form text → list of items (PR #17).
    // - `aiText` is the textarea content
    // - `aiPreview` is the parsed result (null = nothing to review yet)
    // - per-line checkbox state lives in `aiKeep`
    const parseAi = useParseShoppingText();
    const [aiText, setAiText] = useState('');
    const [aiPreview, setAiPreview] = useState<AiParsedItem[] | null>(null);
    const [aiKeep, setAiKeep] = useState<boolean[]>([]);

    // Surface query errors in the same banner used by user actions.
    const fetchError =
        (itemsQuery.error instanceof Error ? itemsQuery.error.message : null) ??
        (templatesQuery.error instanceof Error ? templatesQuery.error.message : null);
    const displayedError = error || fetchError || '';

    // Quick-add path: picking a suggestion inserts the item immediately
    // (qty=1, no price), so the user can chain "Lait, Pain, Œufs…" without
    // touching the keyboard between rows. The visible form still works for
    // edge cases that need a specific quantity/price.
    const quickAddFromSuggestion = async (suggestion: PickerSuggestion) => {
        setError('');
        try {
            await createItem.mutateAsync({
                name: suggestion.name,
                category: suggestion.category,
                unit: suggestion.unit,
            });
            setNewItem({
                name: '',
                category: 'Alimentation',
                quantity: '',
                price: '',
                unit: '',
            });
        } catch (err) {
            setError(err instanceof Error ? err.message : t('shopping.errors.add_item'));
        }
    };

    const addItem = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (!newItem.name.trim()) {
            setError(t('shopping.errors.name_required'));
            return;
        }

        const quantity = parseOptionalPositiveNumber(newItem.quantity);
        const price = parseOptionalPositiveNumber(newItem.price);

        if (quantity !== undefined && (!Number.isFinite(quantity) || quantity <= 0)) {
            setError(t('shopping.errors.quantity_positive'));
            return;
        }

        if (price !== undefined && (!Number.isFinite(price) || price < 0)) {
            setError(t('shopping.errors.price_valid'));
            return;
        }

        try {
            await createItem.mutateAsync({
                name: newItem.name,
                category: newItem.category,
                quantity,
                price,
                unit: newItem.unit || undefined,
            });
            setNewItem({
                name: '',
                category: 'Alimentation',
                quantity: '',
                price: '',
                unit: '',
            });
        } catch (err) {
            setError(err instanceof Error ? err.message : t('shopping.errors.add_item'));
        }
    };

    const toggleItem = async (item: ShoppingItem) => {
        setError('');
        try {
            await updateItem.mutateAsync({
                id: item.id,
                patch: { is_checked: !item.is_checked },
            });
        } catch (err) {
            setError(err instanceof Error ? err.message : t('shopping.errors.update_item'));
        }
    };

    const deleteItem = async (id: string) => {
        setError('');
        try {
            await deleteItemMutation.mutateAsync(id);
        } catch (err) {
            setError(err instanceof Error ? err.message : t('shopping.errors.delete_item'));
        }
    };

    const clearCheckedItems = async () => {
        setError('');
        try {
            await clearCheckedMutation.mutateAsync();
        } catch (err) {
            setError(err instanceof Error ? err.message : t('shopping.errors.clear_checked'));
        }
    };

    const openCreateTemplate = () => {
        setError('');
        setTemplateEditor({ open: true });
    };

    const openCreateFromCurrentList = () => {
        setError('');
        if (items.length === 0) {
            setError(t('shopping.errors.list_empty_template'));
            return;
        }
        setTemplateEditor({ open: true, seedFromCurrentList: true });
    };

    const openEditTemplate = (template: ShoppingTemplate) => {
        setError('');
        setTemplateEditor({ open: true, target: template });
    };

    const handleSaveTemplate = async (payload: {
        name: string;
        items: ShoppingTemplate['items'];
    }) => {
        if (templateEditor.target) {
            await updateTemplateMutation.mutateAsync({
                id: templateEditor.target.id,
                input: payload,
            });
        } else {
            await createTemplateMutation.mutateAsync(payload);
        }
    };

    const applyTemplateById = async (id: string) => {
        setError('');
        try {
            await applyTemplateMutation.mutateAsync(id);
        } catch (err) {
            setError(err instanceof Error ? err.message : t('shopping.errors.apply_template'));
        }
    };

    const deleteTemplateById = async (id: string, name: string) => {
        setError('');
        const ok = window.confirm(t('shopping.templates.confirm_delete', { name }));
        if (!ok) return;
        try {
            await deleteTemplateMutation.mutateAsync(id);
        } catch (err) {
            setError(err instanceof Error ? err.message : t('shopping.errors.delete_template'));
        }
    };

    // For "create from current list", we pass the current rows as
    // initialDraftItems while leaving `template` undefined so the editor stays
    // in create mode (no PUT, no existing id).
    const editorInitialItems = templateEditor.seedFromCurrentList
        ? items.map((item) => ({
              name: item.name,
              category: item.category,
              quantity: item.quantity,
              unit: item.unit,
              price: item.price,
              notes: item.notes,
          }))
        : undefined;

    // ------------------------------------------------------------------ //
    // AI handlers                                                         //
    // ------------------------------------------------------------------ //

    const runAiParse = async () => {
        setError('');
        const text = aiText.trim();
        if (!text) {
            setError(t('shopping.errors.ai_describe'));
            return;
        }
        try {
            const items = await parseAi.mutateAsync(text);
            setAiPreview(items);
            setAiKeep(items.map(() => true));
        } catch (err) {
            setError(err instanceof Error ? err.message : t('shopping.errors.ai_failed'));
        }
    };

    const dismissAiPreview = () => {
        setAiPreview(null);
        setAiKeep([]);
        setAiText('');
    };

    const acceptAiPreview = async () => {
        if (!aiPreview) return;
        setError('');
        const toCreate = aiPreview.filter((_, i) => aiKeep[i]);
        if (toCreate.length === 0) {
            dismissAiPreview();
            return;
        }
        try {
            // Sequential creates keep us under the per-IP rate limit and let
            // each row optimistically appear in the list as it's inserted.
            for (const item of toCreate) {
                await createItem.mutateAsync({
                    name: item.name,
                    category: item.category,
                    quantity: item.quantity ?? undefined,
                    unit: item.unit ?? undefined,
                });
            }
            dismissAiPreview();
        } catch (err) {
            setError(err instanceof Error ? err.message : t('shopping.errors.add_items'));
        }
    };

    const toggleAiKeep = (idx: number) => {
        setAiKeep((prev) => prev.map((v, i) => (i === idx ? !v : v)));
    };

    const pendingItems = useMemo(() => items.filter((item) => !item.is_checked), [items]);
    const completedItems = useMemo(() => items.filter((item) => item.is_checked), [items]);

    // Top-6 chips for one-tap re-add. Prefer the user's existing rows (sorted by
    // frequency), then fall back to a small set of catalog staples so brand-new
    // users still get something to tap on.
    const quickAddChips: PickerSuggestion[] = useMemo(() => {
        const counts = new Map<string, { item: ShoppingItem; count: number }>();
        for (const item of items) {
            const key = item.name.toLowerCase();
            const existing = counts.get(key);
            if (existing) existing.count += 1;
            else counts.set(key, { item, count: 1 });
        }
        const fromHistory = Array.from(counts.values())
            .sort((a, b) => b.count - a.count)
            .slice(0, 6)
            .map<PickerSuggestion>(({ item }) => ({
                name: item.name,
                category: item.category,
                unit: item.unit,
                source: 'history',
            }));
        if (fromHistory.length >= 6) return fromHistory;
        const staples = ['Lait', 'Pain', 'Œufs', 'Beurre', 'Yaourt nature', 'Pommes'];
        const filler = staples
            .map((name) => SHOPPING_CATALOG.find((c) => c.name === name))
            .filter((c): c is (typeof SHOPPING_CATALOG)[number] => Boolean(c))
            .filter((c) => !fromHistory.some((h) => h.name.toLowerCase() === c.name.toLowerCase()))
            .slice(0, 6 - fromHistory.length)
            .map<PickerSuggestion>((c) => ({
                name: c.name,
                category: c.category,
                unit: c.unit,
                source: 'catalog',
            }));
        return [...fromHistory, ...filler];
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
                    <p className="animate-pulse font-medium text-muted-foreground">
                        {t('shopping.loading')}
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-4xl space-y-6">
            {displayedError ? (
                <div className="rounded-input border border-danger/30 bg-danger/10 px-4 py-3 text-caption text-danger">
                    {displayedError}
                </div>
            ) : null}

            <div className="flex items-center gap-3">
                <div className="rounded-card bg-primary-soft p-3 text-primary">
                    <ShoppingBag className="h-7 w-7" />
                </div>
                <div>
                    <h1 className="text-h1 text-foreground">{t('shopping.title')}</h1>
                    <p className="text-body text-muted-foreground">
                        {t('shopping.items_remaining', { count: pendingItems.length })}
                    </p>
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Sparkles className="h-5 w-5 text-primary" />
                        {t('shopping.ai.title')}
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    <p className="text-caption text-muted-foreground">{t('shopping.ai.hint')}</p>
                    <textarea
                        className="input-nexus min-h-[80px] py-2 text-caption"
                        placeholder={t('shopping.ai.placeholder')}
                        value={aiText}
                        onChange={(e) => setAiText(e.target.value)}
                    />
                    <div className="flex flex-wrap items-center gap-2">
                        <Button
                            type="button"
                            onClick={runAiParse}
                            disabled={parseAi.isPending || !aiText.trim()}
                        >
                            <Sparkles className="mr-1 h-4 w-4" />
                            {parseAi.isPending
                                ? t('shopping.ai.analyzing')
                                : t('shopping.ai.analyze')}
                        </Button>
                        {aiPreview ? (
                            <Button type="button" variant="secondary" onClick={dismissAiPreview}>
                                <X className="mr-1 h-4 w-4" />
                                {t('common.cancel')}
                            </Button>
                        ) : null}
                    </div>

                    {aiPreview ? (
                        <div className="mt-2 space-y-2">
                            <p className="text-caption font-medium text-foreground">
                                {aiPreview.length === 0
                                    ? t('shopping.ai.none_detected')
                                    : t('shopping.ai.to_add', {
                                          kept: aiKeep.filter(Boolean).length,
                                          total: aiPreview.length,
                                      })}
                            </p>
                            <ul className="space-y-1">
                                {aiPreview.map((item, idx) => (
                                    <li
                                        key={`${item.name}-${idx}`}
                                        className="flex items-center gap-3 rounded-input border border-border bg-card px-3 py-2 text-caption"
                                    >
                                        <input
                                            type="checkbox"
                                            checked={aiKeep[idx] ?? true}
                                            onChange={() => toggleAiKeep(idx)}
                                            className="h-4 w-4"
                                            aria-label={t('shopping.ai.keep_aria', {
                                                name: item.name,
                                            })}
                                        />
                                        <span className="flex-1 truncate">
                                            {item.quantity != null ? `${item.quantity} ` : ''}
                                            {item.unit ? `${item.unit} ` : ''}
                                            {item.name}
                                        </span>
                                        <span className="text-micro text-muted-foreground">
                                            {t('shopping.categories.' + item.category, {
                                                defaultValue: item.category,
                                            })}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                            {aiPreview.length > 0 ? (
                                <Button
                                    type="button"
                                    onClick={acceptAiPreview}
                                    disabled={createItem.isPending}
                                >
                                    <Check className="mr-1 h-4 w-4" />
                                    {t('shopping.ai.add_to_list')}
                                </Button>
                            ) : null}
                        </div>
                    ) : null}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>{t('shopping.add.title')}</CardTitle>
                </CardHeader>
                <CardContent>
                    {quickAddChips.length > 0 ? (
                        <div className="mb-4">
                            <p className="mb-2 text-micro font-medium uppercase tracking-wide text-muted-foreground">
                                {t('shopping.add.quick_add')}
                            </p>
                            <div className="flex flex-wrap gap-2">
                                {quickAddChips.map((chip) => (
                                    <button
                                        key={`${chip.source}-${chip.name}`}
                                        type="button"
                                        onClick={() => void quickAddFromSuggestion(chip)}
                                        disabled={createItem.isPending}
                                        className="inline-flex items-center gap-1 rounded-pill border border-border bg-muted/30 px-3 py-1 text-caption text-foreground transition-colors hover:border-primary hover:bg-primary-soft disabled:opacity-50"
                                    >
                                        <Plus className="h-3 w-3" />
                                        {chip.name}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : null}
                    <form onSubmit={addItem} className="grid grid-cols-1 gap-4 md:grid-cols-8">
                        <div className="md:col-span-3">
                            <ShoppingItemPicker
                                value={newItem.name}
                                onChange={(value) =>
                                    setNewItem((prev) => ({ ...prev, name: value }))
                                }
                                onPick={(suggestion) => {
                                    // Auto-fill category + unit so the user only
                                    // tweaks quantity/price if they care.
                                    setNewItem((prev) => ({
                                        ...prev,
                                        name: suggestion.name,
                                        category: suggestion.category,
                                        unit: suggestion.unit ?? prev.unit,
                                    }));
                                    // No quantity/price entered yet → assume the
                                    // user wants the default "just add it" path.
                                    if (!newItem.quantity && !newItem.price) {
                                        void quickAddFromSuggestion(suggestion);
                                    }
                                }}
                                historyItems={items}
                            />
                        </div>
                        <div className="md:col-span-2">
                            <label className="mb-1.5 block text-caption font-medium text-foreground">
                                {t('shopping.add.category_label')}
                            </label>
                            <select
                                value={newItem.category}
                                onChange={(e) =>
                                    setNewItem((prev) => ({ ...prev, category: e.target.value }))
                                }
                                className="input-nexus py-0 text-caption"
                            >
                                {categories.map((category) => (
                                    <option key={category} value={category}>
                                        {t('shopping.categories.' + category, {
                                            defaultValue: category,
                                        })}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <Input
                                label={t('shopping.add.quantity_label')}
                                type="number"
                                min="0"
                                step="0.1"
                                value={newItem.quantity}
                                onChange={(e) =>
                                    setNewItem((prev) => ({ ...prev, quantity: e.target.value }))
                                }
                                placeholder={t('shopping.add.quantity_placeholder')}
                            />
                        </div>
                        <div>
                            <Input
                                label={t('shopping.add.price_label')}
                                type="number"
                                min="0"
                                step="0.01"
                                value={newItem.price}
                                onChange={(e) =>
                                    setNewItem((prev) => ({ ...prev, price: e.target.value }))
                                }
                                placeholder={t('shopping.add.price_placeholder')}
                            />
                        </div>
                        <div className="md:col-span-8 flex justify-end">
                            <Button type="submit">
                                <Plus className="mr-1 h-4 w-4" />
                                {t('common.add')}
                            </Button>
                        </div>
                    </form>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <CardTitle className="flex items-center gap-2">
                            <ListChecks className="h-5 w-5 text-primary" />
                            {t('shopping.templates.title')}
                        </CardTitle>
                        <div className="flex flex-wrap gap-2">
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={openCreateFromCurrentList}
                                disabled={items.length === 0}
                                title={
                                    items.length === 0
                                        ? t('shopping.templates.list_empty')
                                        : t('shopping.templates.from_list_title')
                                }
                            >
                                {t('shopping.templates.from_list')}
                            </Button>
                            <Button size="sm" onClick={openCreateTemplate}>
                                <Plus className="mr-1 h-4 w-4" />
                                {t('shopping.templates.new_template')}
                            </Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    {templates.length === 0 ? (
                        <div className="rounded-input border border-dashed border-border bg-muted/20 px-3 py-8 text-center">
                            <p className="text-caption text-muted-foreground">
                                {t('shopping.templates.empty')}
                            </p>
                        </div>
                    ) : (
                        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
                            {templates.map((template) => {
                                const preview = template.items
                                    .slice(0, 3)
                                    .map((i) => i.name)
                                    .join(' · ');
                                const extra = Math.max(0, template.items.length - 3);
                                return (
                                    <li
                                        key={template.id}
                                        className="rounded-card border border-border bg-card p-3 transition-colors hover:border-border-strong"
                                    >
                                        <div className="mb-1 flex items-start justify-between gap-2">
                                            <div className="min-w-0">
                                                <p className="truncate text-body font-semibold text-foreground">
                                                    {template.name}
                                                </p>
                                                <p className="text-micro text-muted-foreground">
                                                    {t('shopping.templates.items', {
                                                        count: template.items.length,
                                                    })}
                                                </p>
                                            </div>
                                            <div className="flex shrink-0 gap-1">
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    onClick={() => openEditTemplate(template)}
                                                    title={t('common.edit')}
                                                >
                                                    <Pencil className="h-4 w-4" />
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    className="text-destructive hover:bg-destructive/10"
                                                    onClick={() =>
                                                        deleteTemplateById(
                                                            template.id,
                                                            template.name,
                                                        )
                                                    }
                                                    title={t('common.delete')}
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </div>
                                        <p className="mb-3 line-clamp-2 text-caption text-muted-foreground">
                                            {preview || t('shopping.templates.empty_template')}
                                            {extra > 0 ? ` · +${extra}` : ''}
                                        </p>
                                        <Button
                                            size="sm"
                                            variant="secondary"
                                            className="w-full"
                                            onClick={() => applyTemplateById(template.id)}
                                            disabled={applyTemplateMutation.isPending}
                                        >
                                            <PlayCircle className="mr-1 h-4 w-4" />
                                            {t('shopping.templates.apply')}
                                        </Button>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </CardContent>
            </Card>

            <div className="space-y-3">
                {pendingItems.length === 0 && completedItems.length === 0 ? (
                    <div className="rounded-card border border-dashed border-border bg-card py-16 text-center">
                        <ShoppingBag className="mx-auto mb-3 h-12 w-12 text-muted-foreground/30" />
                        <h3 className="text-body font-semibold text-foreground">
                            {t('shopping.list.empty_title')}
                        </h3>
                        <p className="text-caption text-muted-foreground">
                            {t('shopping.list.empty_hint')}
                        </p>
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
                                    {item.is_checked ? (
                                        <Check className="h-3.5 w-3.5 text-primary" />
                                    ) : null}
                                </button>

                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-body font-medium text-foreground">
                                        {item.name}
                                    </p>
                                    <div className="mt-1 flex flex-wrap items-center gap-2 text-micro">
                                        <span className="rounded-pill bg-primary-soft px-2 py-0.5 text-primary">
                                            {t('shopping.categories.' + item.category, {
                                                defaultValue: item.category,
                                            })}
                                        </span>
                                        {item.quantity ? (
                                            <span className="text-muted-foreground">
                                                {t('shopping.list.quantity', {
                                                    quantity: item.quantity,
                                                })}
                                            </span>
                                        ) : null}
                                        {item.price ? (
                                            <span className="text-muted-foreground">
                                                {formatMoney(item.price)}
                                            </span>
                                        ) : null}
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
                                    <p className="text-caption font-medium text-muted-foreground">
                                        {t('shopping.list.checked_items', {
                                            count: completedItems.length,
                                        })}
                                    </p>
                                    <Button variant="ghost" size="sm" onClick={clearCheckedItems}>
                                        {t('shopping.list.clean')}
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
                                            <p className="line-through text-caption text-muted-foreground">
                                                {item.name}
                                            </p>
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
                    <span className="text-muted-foreground">
                        {t('shopping.list.total_estimate')}
                    </span>
                    <span className="text-body font-semibold text-foreground">
                        {formatMoney(totalPrice)}
                    </span>
                </div>
            </div>

            <TemplateEditorDialog
                open={templateEditor.open}
                onOpenChange={(open) =>
                    setTemplateEditor((prev) => ({
                        ...prev,
                        open,
                        ...(open ? {} : { target: undefined, seedFromCurrentList: false }),
                    }))
                }
                template={templateEditor.target}
                initialDraftItems={editorInitialItems}
                historyItems={items}
                onSave={handleSaveTemplate}
                isSaving={createTemplateMutation.isPending || updateTemplateMutation.isPending}
            />
        </div>
    );
};

export default ShoppingList;
