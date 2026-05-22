import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Textarea } from '../ui/Textarea';
import {
    type HouseItem,
    type ItemCategory,
    ITEM_CATEGORIES,
    useCreateItem,
    useUpdateItem,
    useRooms,
} from '../../hooks/useHouse';
import { AlertCircle, Loader2 } from 'lucide-react';

// =============================================================================
// ItemDialog
//
// Single dialog for create/edit. The room selector is pre-populated from
// the user's rooms list; "À ranger" (no room) stays a valid option so the
// user can register an item before deciding where it goes.
// =============================================================================

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    item: HouseItem | null;
    /** Pre-select a room when creating from inside a room view. */
    defaultRoomId?: string | null;
}

interface FormState {
    name: string;
    category: ItemCategory;
    room_id: string;
    quantity: string;
    location_detail: string;
    photo_url: string;
    notes: string;
}

const blankForm = (defaultRoomId?: string | null): FormState => ({
    name: '',
    category: 'Autre',
    room_id: defaultRoomId ?? '',
    quantity: '',
    location_detail: '',
    photo_url: '',
    notes: '',
});

const fromItem = (i: HouseItem): FormState => ({
    name: i.name,
    category: i.category,
    room_id: i.room_id ?? '',
    quantity: i.quantity !== null ? String(i.quantity) : '',
    location_detail: i.location_detail ?? '',
    photo_url: i.photo_url ?? '',
    notes: i.notes ?? '',
});

const ItemDialog: React.FC<Props> = ({ open, onOpenChange, item, defaultRoomId }) => {
    const { t } = useTranslation();
    const isEdit = !!item;
    const createMut = useCreateItem();
    const updateMut = useUpdateItem();
    const roomsQuery = useRooms();
    const [form, setForm] = useState<FormState>(blankForm);
    const [error, setError] = useState('');

    useEffect(() => {
        if (open) {
            setForm(item ? fromItem(item) : blankForm(defaultRoomId));
            setError('');
        }
    }, [open, item, defaultRoomId]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        if (!form.name.trim()) {
            setError(t('house.item.dialog.nameRequired'));
            return;
        }
        let quantity: number | null = null;
        if (form.quantity.trim()) {
            const n = Number(form.quantity);
            if (!Number.isInteger(n) || n < 1) {
                setError(t('house.item.dialog.quantityInvalid'));
                return;
            }
            quantity = n;
        }
        const body = {
            name: form.name.trim(),
            category: form.category,
            room_id: form.room_id || null,
            quantity,
            location_detail: form.location_detail.trim() || null,
            photo_url: form.photo_url.trim() || null,
            notes: form.notes.trim() || null,
        };
        try {
            if (isEdit && item) {
                await updateMut.mutateAsync({ id: item.id, patch: body });
            } else {
                await createMut.mutateAsync(body);
            }
            onOpenChange(false);
        } catch (err) {
            setError(err instanceof Error ? err.message : t('house.common.saveError'));
        }
    };

    const submitting = createMut.isPending || updateMut.isPending;
    const roomOptions = [
        { value: '', label: t('house.item.dialog.roomNone') },
        ...(roomsQuery.data ?? []).map((r) => ({ value: r.id, label: r.name })),
    ];

    return (
        <Dialog
            open={open}
            onOpenChange={onOpenChange}
            title={isEdit ? t('house.item.dialog.editTitle') : t('house.item.dialog.createTitle')}
            description={isEdit ? item?.name : t('house.item.dialog.createDescription')}
            className="sm:max-w-xl"
        >
            <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                    <p className="flex items-center gap-1 text-micro text-destructive">
                        <AlertCircle className="h-4 w-4" />
                        {error}
                    </p>
                )}
                <Input
                    label={t('house.item.dialog.name')}
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder={t('house.item.dialog.namePlaceholder')}
                    required
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-label font-medium text-foreground mb-1.5">
                            {t('house.item.dialog.category')}
                        </label>
                        <Select
                            value={form.category}
                            onValueChange={(v) => setForm({ ...form, category: v as ItemCategory })}
                            options={ITEM_CATEGORIES.map((c) => ({
                                value: c,
                                label: t('domain.itemCategory.' + c, { defaultValue: c }),
                            }))}
                        />
                    </div>
                    <Input
                        label={t('house.item.dialog.quantity')}
                        type="number"
                        min={1}
                        value={form.quantity}
                        onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                        placeholder={t('house.item.dialog.quantityPlaceholder')}
                    />
                </div>
                <div>
                    <label className="block text-label font-medium text-foreground mb-1.5">
                        {t('house.item.dialog.room')}
                    </label>
                    <Select
                        value={form.room_id}
                        onValueChange={(v) => setForm({ ...form, room_id: v })}
                        options={roomOptions}
                    />
                </div>
                <Input
                    label={t('house.item.dialog.locationDetail')}
                    value={form.location_detail}
                    onChange={(e) => setForm({ ...form, location_detail: e.target.value })}
                    placeholder={t('house.item.dialog.locationDetailPlaceholder')}
                />
                <Input
                    label={t('house.item.dialog.photoUrl')}
                    value={form.photo_url}
                    onChange={(e) => setForm({ ...form, photo_url: e.target.value })}
                    placeholder={t('house.item.dialog.photoUrlPlaceholder')}
                />
                <Textarea
                    label={t('house.item.dialog.notes')}
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    placeholder={t('house.item.dialog.notesPlaceholder')}
                    rows={2}
                />
                <div className="flex justify-end gap-3 pt-2">
                    <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
                        {t('common.cancel')}
                    </Button>
                    <Button type="submit" disabled={submitting}>
                        {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {isEdit ? t('common.save') : t('house.common.create')}
                    </Button>
                </div>
            </form>
        </Dialog>
    );
};

export default ItemDialog;
