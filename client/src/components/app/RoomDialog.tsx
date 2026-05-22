import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Textarea } from '../ui/Textarea';
import {
    type Room,
    type RoomCategory,
    ROOM_CATEGORIES,
    useCreateRoom,
    useUpdateRoom,
} from '../../hooks/useHouse';
import { AlertCircle, Loader2 } from 'lucide-react';

// Room palette aligned with the Famille Sénégalaise charter (indigo / safran /
// baobab / turquoise …). Keep 9 swatches so the picker fills a single row on
// mobile.
const ROOM_COLORS = [
    '#2D4A78', // indigo (primary, Papa)
    '#E8943C', // safran (accent)
    '#5C8A4B', // baobab
    '#4A9B8E', // turquoise (Fille)
    '#F4C430', // soleil (Fils)
    '#C0392B', // corail brique
    '#C44569', // magenta
    '#D4A24C', // or lion
    '#8B5A3C', // terre baobab
];

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    room: Room | null;
}

interface FormState {
    name: string;
    category: RoomCategory;
    color: string;
    notes: string;
}

const blankForm = (): FormState => ({
    name: '',
    category: 'Salon',
    color: ROOM_COLORS[0],
    notes: '',
});

const fromRoom = (r: Room): FormState => ({
    name: r.name,
    category: r.category,
    color: r.color,
    notes: r.notes ?? '',
});

const RoomDialog: React.FC<Props> = ({ open, onOpenChange, room }) => {
    const { t } = useTranslation();
    const isEdit = !!room;
    const createMut = useCreateRoom();
    const updateMut = useUpdateRoom();
    const [form, setForm] = useState<FormState>(blankForm);
    const [error, setError] = useState('');

    useEffect(() => {
        if (open) {
            setForm(room ? fromRoom(room) : blankForm());
            setError('');
        }
    }, [open, room]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        if (!form.name.trim()) {
            setError(t('house.room.dialog.nameRequired'));
            return;
        }
        const category = form.category.trim();
        if (!category) {
            setError(t('house.room.dialog.categoryRequired'));
            return;
        }
        if (category.length > 32) {
            setError(t('house.room.dialog.categoryTooLong'));
            return;
        }
        const body = {
            name: form.name.trim(),
            category,
            color: form.color,
            notes: form.notes.trim() || null,
        };
        try {
            if (isEdit && room) {
                await updateMut.mutateAsync({ id: room.id, patch: body });
            } else {
                await createMut.mutateAsync(body);
            }
            onOpenChange(false);
        } catch (err) {
            setError(err instanceof Error ? err.message : t('house.common.saveError'));
        }
    };

    const submitting = createMut.isPending || updateMut.isPending;

    return (
        <Dialog
            open={open}
            onOpenChange={onOpenChange}
            title={isEdit ? t('house.room.dialog.editTitle') : t('house.room.dialog.createTitle')}
            description={isEdit ? room?.name : t('house.room.dialog.createDescription')}
            className="sm:max-w-md"
        >
            <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                    <p className="flex items-center gap-1 text-micro text-destructive">
                        <AlertCircle className="h-4 w-4" />
                        {error}
                    </p>
                )}
                <Input
                    label={t('house.room.dialog.name')}
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder={t('house.room.dialog.namePlaceholder')}
                    required
                />
                <div>
                    <Input
                        label={t('house.room.dialog.category')}
                        value={form.category}
                        onChange={(e) => setForm({ ...form, category: e.target.value })}
                        placeholder={t('house.room.dialog.categoryPlaceholder')}
                        list="room-category-suggestions"
                        maxLength={32}
                        required
                    />
                    <datalist id="room-category-suggestions">
                        {ROOM_CATEGORIES.map((c) => (
                            <option key={c} value={c} />
                        ))}
                    </datalist>
                    <p className="mt-1.5 text-micro text-muted-foreground">
                        {t('house.room.dialog.categoryHint')}
                    </p>
                </div>
                <div>
                    <label className="block text-label font-medium text-foreground mb-1.5">
                        {t('house.room.dialog.color')}
                    </label>
                    <div className="flex flex-wrap gap-2">
                        {ROOM_COLORS.map((c) => (
                            <button
                                key={c}
                                type="button"
                                onClick={() => setForm({ ...form, color: c })}
                                className={`h-7 w-7 rounded-full border-2 ${
                                    form.color === c ? 'border-foreground' : 'border-border'
                                }`}
                                style={{ background: c }}
                                aria-label={t('house.room.dialog.colorAria', { color: c })}
                            />
                        ))}
                    </div>
                </div>
                <Textarea
                    label={t('house.room.dialog.notes')}
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    placeholder={t('house.room.dialog.notesPlaceholder')}
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

export default RoomDialog;
