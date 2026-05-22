import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Textarea } from '../ui/Textarea';
import {
    type Equipment,
    type EquipmentCategory,
    EQUIPMENT_CATEGORIES,
    useCreateEquipment,
    useUpdateEquipment,
} from '../../hooks/useHouse';
import { AlertCircle, Loader2 } from 'lucide-react';

// =============================================================================
// EquipmentDialog
//
// Single dialog for both create (no `equipment` prop) and edit. The form
// state is fully controlled and reset every time we open it on a fresh
// equipment — important so the previous edit doesn't bleed into a new one.
// =============================================================================

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    equipment: Equipment | null; // null = create mode
}

interface FormState {
    name: string;
    category: EquipmentCategory;
    brand: string;
    model: string;
    serial_number: string;
    purchase_date: string;
    purchase_price: string; // string in form, number on submit
    warranty_until: string;
    location_room: string;
    image_url: string;
    notes: string;
}

const blankForm = (): FormState => ({
    name: '',
    category: 'Autre',
    brand: '',
    model: '',
    serial_number: '',
    purchase_date: '',
    purchase_price: '',
    warranty_until: '',
    location_room: '',
    image_url: '',
    notes: '',
});

const fromEquipment = (e: Equipment): FormState => ({
    name: e.name,
    category: e.category,
    brand: e.brand ?? '',
    model: e.model ?? '',
    serial_number: e.serial_number ?? '',
    purchase_date: e.purchase_date ?? '',
    purchase_price: e.purchase_price !== null ? String(e.purchase_price) : '',
    warranty_until: e.warranty_until ?? '',
    location_room: e.location_room ?? '',
    image_url: e.image_url ?? '',
    notes: e.notes ?? '',
});

const EquipmentDialog: React.FC<Props> = ({ open, onOpenChange, equipment }) => {
    const { t } = useTranslation();
    const isEdit = !!equipment;
    const createMut = useCreateEquipment();
    const updateMut = useUpdateEquipment();
    const [form, setForm] = useState<FormState>(blankForm);
    const [error, setError] = useState('');

    useEffect(() => {
        if (open) {
            setForm(equipment ? fromEquipment(equipment) : blankForm());
            setError('');
        }
    }, [open, equipment]);

    const handleChange = (key: keyof FormState, value: string) =>
        setForm((prev) => ({ ...prev, [key]: value }));

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        if (!form.name.trim()) {
            setError(t('house.equipment.dialog.nameRequired'));
            return;
        }
        const priceParsed = form.purchase_price.trim()
            ? Number(form.purchase_price.replace(',', '.'))
            : undefined;
        if (priceParsed !== undefined && (!Number.isFinite(priceParsed) || priceParsed < 0)) {
            setError(t('house.equipment.dialog.priceInvalid'));
            return;
        }
        const body = {
            name: form.name.trim(),
            category: form.category,
            brand: form.brand.trim() || null,
            model: form.model.trim() || null,
            serial_number: form.serial_number.trim() || null,
            purchase_date: form.purchase_date || null,
            purchase_price: priceParsed ?? null,
            warranty_until: form.warranty_until || null,
            location_room: form.location_room.trim() || null,
            image_url: form.image_url.trim() || null,
            notes: form.notes.trim() || null,
        };
        try {
            if (isEdit && equipment) {
                await updateMut.mutateAsync({ id: equipment.id, patch: body });
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
            title={
                isEdit
                    ? t('house.equipment.dialog.editTitle')
                    : t('house.equipment.dialog.createTitle')
            }
            description={isEdit ? equipment?.name : t('house.equipment.dialog.createDescription')}
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
                    label={t('house.equipment.dialog.name')}
                    value={form.name}
                    onChange={(e) => handleChange('name', e.target.value)}
                    placeholder={t('house.equipment.dialog.namePlaceholder')}
                    required
                />
                <div>
                    <label className="block text-label font-medium text-foreground mb-1.5">
                        {t('house.equipment.dialog.category')}
                    </label>
                    <Select
                        value={form.category}
                        onValueChange={(v) => handleChange('category', v as EquipmentCategory)}
                        options={EQUIPMENT_CATEGORIES.map((c) => ({
                            value: c,
                            label: t('domain.equipmentCategory.' + c, { defaultValue: c }),
                        }))}
                    />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Input
                        label={t('house.equipment.dialog.brand')}
                        value={form.brand}
                        onChange={(e) => handleChange('brand', e.target.value)}
                        placeholder={t('house.equipment.dialog.brandPlaceholder')}
                    />
                    <Input
                        label={t('house.equipment.dialog.model')}
                        value={form.model}
                        onChange={(e) => handleChange('model', e.target.value)}
                        placeholder={t('house.equipment.dialog.modelPlaceholder')}
                    />
                </div>
                <Input
                    label={t('house.equipment.dialog.serialNumber')}
                    value={form.serial_number}
                    onChange={(e) => handleChange('serial_number', e.target.value)}
                    placeholder={t('house.equipment.dialog.serialNumberPlaceholder')}
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Input
                        label={t('house.equipment.dialog.purchaseDate')}
                        type="date"
                        value={form.purchase_date}
                        onChange={(e) => handleChange('purchase_date', e.target.value)}
                    />
                    <Input
                        label={t('house.equipment.dialog.purchasePrice')}
                        type="number"
                        step="0.01"
                        value={form.purchase_price}
                        onChange={(e) => handleChange('purchase_price', e.target.value)}
                        placeholder="0.00"
                    />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Input
                        label={t('house.equipment.dialog.warrantyUntil')}
                        type="date"
                        value={form.warranty_until}
                        onChange={(e) => handleChange('warranty_until', e.target.value)}
                    />
                    <Input
                        label={t('house.equipment.dialog.locationRoom')}
                        value={form.location_room}
                        onChange={(e) => handleChange('location_room', e.target.value)}
                        placeholder={t('house.equipment.dialog.locationRoomPlaceholder')}
                    />
                </div>
                <Input
                    label={t('house.equipment.dialog.imageUrl')}
                    value={form.image_url}
                    onChange={(e) => handleChange('image_url', e.target.value)}
                    placeholder={t('house.equipment.dialog.imageUrlPlaceholder')}
                />
                <Textarea
                    label={t('house.equipment.dialog.notes')}
                    value={form.notes}
                    onChange={(e) => handleChange('notes', e.target.value)}
                    placeholder={t('house.equipment.dialog.notesPlaceholder')}
                    rows={3}
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

export default EquipmentDialog;
