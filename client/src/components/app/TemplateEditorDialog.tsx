import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Save, Trash2 } from 'lucide-react';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import ShoppingItemPicker from './ShoppingItemPicker';
import type { ShoppingTemplate } from '../../hooks/useShopping';

const CATEGORIES = ['Alimentation', 'Bebe', 'Menage', 'Sante', 'Autre'];

export type TemplateDraftItem = ShoppingTemplate['items'][number];

interface TemplateEditorDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    // When provided, the dialog opens in edit mode. Otherwise it's create.
    template?: ShoppingTemplate;
    // Create-mode seed: starting items to pre-populate the draft (e.g. when
    // creating a template from the current shopping list). Ignored if
    // `template` is set since that already carries items.
    initialDraftItems?: TemplateDraftItem[];
    // Pre-fill source for the picker's "Your items" tab — pass the current
    // shopping list so users can pull from things they already buy.
    historyItems: Array<{ name: string; category: string; unit?: string }>;
    onSave: (payload: { name: string; items: TemplateDraftItem[] }) => Promise<void> | void;
    isSaving?: boolean;
}

const emptyDraft = (template?: ShoppingTemplate, initialItems?: TemplateDraftItem[]) => ({
    name: template?.name ?? '',
    items: template
        ? template.items.map((item) => ({ ...item }))
        : initialItems
          ? initialItems.map((item) => ({ ...item }))
          : [],
});

const TemplateEditorDialog: React.FC<TemplateEditorDialogProps> = ({
    open,
    onOpenChange,
    template,
    initialDraftItems,
    historyItems,
    onSave,
    isSaving,
}) => {
    const { t } = useTranslation();
    const [draft, setDraft] = useState(() => emptyDraft(template, initialDraftItems));
    const [pickerValue, setPickerValue] = useState('');
    const [error, setError] = useState('');

    // Reset draft whenever the dialog opens or the target template changes.
    // Otherwise switching from "Edit A" → close → "Edit B" would carry A's
    // draft into B's editor.
    useEffect(() => {
        if (open) {
            setDraft(emptyDraft(template, initialDraftItems));
            setPickerValue('');
            setError('');
        }
    }, [open, template, initialDraftItems]);

    const addItemRow = (item: TemplateDraftItem) => {
        // Dedupe by case-insensitive name — picking "Lait" twice in a row
        // shouldn't create two lines.
        const existing = draft.items.findIndex(
            (i) => i.name.toLowerCase() === item.name.toLowerCase(),
        );
        if (existing >= 0) {
            setDraft((prev) => {
                const next = [...prev.items];
                next[existing] = {
                    ...next[existing],
                    quantity: (next[existing].quantity ?? 1) + 1,
                };
                return { ...prev, items: next };
            });
        } else {
            setDraft((prev) => ({
                ...prev,
                items: [...prev.items, { ...item, quantity: item.quantity ?? 1 }],
            }));
        }
        setPickerValue('');
    };

    const updateItem = (idx: number, patch: Partial<TemplateDraftItem>) => {
        setDraft((prev) => ({
            ...prev,
            items: prev.items.map((item, i) => (i === idx ? { ...item, ...patch } : item)),
        }));
    };

    const removeItem = (idx: number) => {
        setDraft((prev) => ({
            ...prev,
            items: prev.items.filter((_, i) => i !== idx),
        }));
    };

    const handleSave = async () => {
        setError('');
        const name = draft.name.trim();
        if (!name) {
            setError(t('house.template.nameRequired'));
            return;
        }
        if (draft.items.length === 0) {
            setError(t('house.template.itemsRequired'));
            return;
        }
        try {
            await onSave({
                name,
                items: draft.items.map((item) => ({
                    name: item.name.trim(),
                    category: item.category,
                    quantity: item.quantity ?? undefined,
                    unit: item.unit?.trim() || undefined,
                    price: item.price ?? undefined,
                    notes: item.notes?.trim() || undefined,
                })),
            });
            onOpenChange(false);
        } catch (err) {
            setError(err instanceof Error ? err.message : t('house.template.saveError'));
        }
    };

    return (
        <Dialog
            open={open}
            onOpenChange={onOpenChange}
            title={template ? t('house.template.editTitle') : t('house.template.createTitle')}
            description={
                template
                    ? t('house.template.editDescription')
                    : t('house.template.createDescription')
            }
        >
            <div className="space-y-5">
                {error ? (
                    <div className="rounded-input border border-danger/30 bg-danger/10 px-3 py-2 text-caption text-danger">
                        {error}
                    </div>
                ) : null}

                <Input
                    label={t('house.template.name')}
                    value={draft.name}
                    onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder={t('house.template.namePlaceholder')}
                />

                <div>
                    <p className="mb-2 text-caption font-medium text-foreground">
                        {t('house.template.addItem')}
                    </p>
                    <ShoppingItemPicker
                        value={pickerValue}
                        onChange={setPickerValue}
                        onPick={(s) =>
                            addItemRow({
                                name: s.name,
                                category: s.category,
                                unit: s.unit,
                                quantity: 1,
                            })
                        }
                        historyItems={historyItems}
                        placeholder={t('house.template.pickerPlaceholder')}
                    />
                    {pickerValue.trim() ? (
                        <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            className="mt-2"
                            onClick={() =>
                                addItemRow({
                                    name: pickerValue.trim(),
                                    category: 'Alimentation',
                                    quantity: 1,
                                })
                            }
                        >
                            <Plus className="mr-1 h-4 w-4" />
                            {t('house.template.addNamed', { name: pickerValue.trim() })}
                        </Button>
                    ) : null}
                </div>

                <div>
                    <div className="mb-2 flex items-center justify-between">
                        <p className="text-caption font-medium text-foreground">
                            {t('house.template.itemsCount', { count: draft.items.length })}
                        </p>
                    </div>
                    {draft.items.length === 0 ? (
                        <div className="rounded-input border border-dashed border-border bg-muted/20 px-3 py-6 text-center text-caption text-muted-foreground">
                            {t('house.template.noItems')}
                        </div>
                    ) : (
                        <ul className="max-h-72 space-y-2 overflow-y-auto rounded-input border border-border p-2">
                            {draft.items.map((item, idx) => (
                                <li
                                    key={`${item.name}-${idx}`}
                                    className="grid grid-cols-12 items-center gap-2 rounded-input bg-card px-2 py-1.5"
                                >
                                    <input
                                        type="text"
                                        value={item.name}
                                        onChange={(e) => updateItem(idx, { name: e.target.value })}
                                        className="input-nexus col-span-5 h-9 py-0 text-caption"
                                        aria-label={t('house.template.itemName')}
                                    />
                                    <input
                                        type="number"
                                        min="0"
                                        step="0.1"
                                        value={item.quantity ?? ''}
                                        onChange={(e) =>
                                            updateItem(idx, {
                                                quantity: e.target.value
                                                    ? Number(e.target.value)
                                                    : undefined,
                                            })
                                        }
                                        className="input-nexus col-span-2 h-9 py-0 text-caption"
                                        placeholder={t('house.template.quantityShort')}
                                        aria-label={t('house.template.quantity')}
                                    />
                                    <select
                                        value={item.category}
                                        onChange={(e) =>
                                            updateItem(idx, { category: e.target.value })
                                        }
                                        className="input-nexus col-span-4 h-9 py-0 text-caption"
                                        aria-label={t('house.template.category')}
                                    >
                                        {CATEGORIES.map((c) => (
                                            <option key={c} value={c}>
                                                {t('domain.shoppingCategory.' + c, {
                                                    defaultValue: c,
                                                })}
                                            </option>
                                        ))}
                                    </select>
                                    <button
                                        type="button"
                                        onClick={() => removeItem(idx)}
                                        className="col-span-1 inline-flex items-center justify-center rounded-input p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                        aria-label={t('house.template.removeItem', {
                                            name: item.name,
                                        })}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                <div className="flex justify-end gap-3 pt-2">
                    <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
                        {t('common.cancel')}
                    </Button>
                    <Button type="button" onClick={handleSave} disabled={isSaving}>
                        <Save className="mr-1 h-4 w-4" />
                        {template ? t('house.template.save') : t('house.template.create')}
                    </Button>
                </div>
            </div>
        </Dialog>
    );
};

export default TemplateEditorDialog;
