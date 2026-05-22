import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Textarea } from '../ui/Textarea';
import {
    type Contact,
    type ContactCategory,
    CONTACT_CATEGORIES,
    useCreateContact,
    useUpdateContact,
    useEquipments,
} from '../../hooks/useHouse';
import { AlertCircle, Loader2 } from 'lucide-react';

// =============================================================================
// ContactDialog
//
// One dialog for both create and edit. Equipment selector pulls all the user's
// equipments so a single contact can be tied to e.g. "Chaudière Viessmann"
// (handy for "who fixes this?" lookups in Phase 4 / 5).
// =============================================================================

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    contact: Contact | null;
}

interface FormState {
    name: string;
    category: ContactCategory;
    company: string;
    phone: string;
    email: string;
    address: string;
    notes: string;
    last_intervention_date: string;
    is_favorite: boolean;
    equipment_id: string;
}

const blankForm = (): FormState => ({
    name: '',
    category: 'Plombier',
    company: '',
    phone: '',
    email: '',
    address: '',
    notes: '',
    last_intervention_date: '',
    is_favorite: false,
    equipment_id: '',
});

const fromContact = (c: Contact): FormState => ({
    name: c.name,
    category: c.category,
    company: c.company ?? '',
    phone: c.phone ?? '',
    email: c.email ?? '',
    address: c.address ?? '',
    notes: c.notes ?? '',
    last_intervention_date: c.last_intervention_date ?? '',
    is_favorite: c.is_favorite,
    equipment_id: c.equipment_id ?? '',
});

const ContactDialog: React.FC<Props> = ({ open, onOpenChange, contact }) => {
    const { t } = useTranslation();
    const isEdit = !!contact;
    const createMut = useCreateContact();
    const updateMut = useUpdateContact();
    const equipmentsQuery = useEquipments();
    const [form, setForm] = useState<FormState>(blankForm);
    const [error, setError] = useState('');

    useEffect(() => {
        if (open) {
            setForm(contact ? fromContact(contact) : blankForm());
            setError('');
        }
    }, [open, contact]);

    const handleChange = <K extends keyof FormState>(key: K, value: FormState[K]) =>
        setForm((prev) => ({ ...prev, [key]: value }));

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        if (!form.name.trim()) {
            setError(t('house.contact.dialog.nameRequired'));
            return;
        }
        const body = {
            name: form.name.trim(),
            category: form.category,
            company: form.company.trim() || null,
            phone: form.phone.trim() || null,
            email: form.email.trim() || null,
            address: form.address.trim() || null,
            notes: form.notes.trim() || null,
            last_intervention_date: form.last_intervention_date || null,
            is_favorite: form.is_favorite,
            equipment_id: form.equipment_id || null,
        };
        try {
            if (isEdit && contact) {
                await updateMut.mutateAsync({ id: contact.id, patch: body });
            } else {
                await createMut.mutateAsync(body);
            }
            onOpenChange(false);
        } catch (err) {
            setError(err instanceof Error ? err.message : t('house.common.saveError'));
        }
    };

    const submitting = createMut.isPending || updateMut.isPending;

    const equipmentOptions = [
        { value: '', label: t('house.common.noneLinkedEquipment') },
        ...(equipmentsQuery.data ?? []).map((e) => ({
            value: e.id,
            label: `${e.name} (${t('domain.equipmentCategory.' + e.category, { defaultValue: e.category })})`,
        })),
    ];

    return (
        <Dialog
            open={open}
            onOpenChange={onOpenChange}
            title={
                isEdit ? t('house.contact.dialog.editTitle') : t('house.contact.dialog.createTitle')
            }
            description={isEdit ? contact?.name : t('house.contact.dialog.createDescription')}
            className="sm:max-w-xl"
        >
            <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                    <p className="flex items-center gap-1 text-micro text-destructive">
                        <AlertCircle className="h-4 w-4" />
                        {error}
                    </p>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Input
                        label={t('house.contact.dialog.name')}
                        value={form.name}
                        onChange={(e) => handleChange('name', e.target.value)}
                        placeholder={t('house.contact.dialog.namePlaceholder')}
                        required
                    />
                    <div>
                        <label className="block text-label font-medium text-foreground mb-1.5">
                            {t('house.contact.dialog.category')}
                        </label>
                        <Select
                            value={form.category}
                            onValueChange={(v) => handleChange('category', v as ContactCategory)}
                            options={CONTACT_CATEGORIES.map((c) => ({
                                value: c,
                                label: t('domain.contactCategory.' + c, { defaultValue: c }),
                            }))}
                        />
                    </div>
                </div>
                <Input
                    label={t('house.contact.dialog.company')}
                    value={form.company}
                    onChange={(e) => handleChange('company', e.target.value)}
                    placeholder={t('house.contact.dialog.companyPlaceholder')}
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Input
                        label={t('house.contact.dialog.phone')}
                        type="tel"
                        value={form.phone}
                        onChange={(e) => handleChange('phone', e.target.value)}
                        placeholder={t('house.contact.dialog.phonePlaceholder')}
                    />
                    <Input
                        label={t('house.contact.dialog.email')}
                        type="email"
                        value={form.email}
                        onChange={(e) => handleChange('email', e.target.value)}
                        placeholder={t('house.contact.dialog.emailPlaceholder')}
                    />
                </div>
                <Textarea
                    label={t('house.contact.dialog.address')}
                    value={form.address}
                    onChange={(e) => handleChange('address', e.target.value)}
                    placeholder={t('house.contact.dialog.addressPlaceholder')}
                    rows={2}
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Input
                        label={t('house.contact.dialog.lastIntervention')}
                        type="date"
                        value={form.last_intervention_date}
                        onChange={(e) => handleChange('last_intervention_date', e.target.value)}
                    />
                    <div>
                        <label className="block text-label font-medium text-foreground mb-1.5">
                            {t('house.contact.dialog.linkedEquipment')}
                        </label>
                        <Select
                            value={form.equipment_id}
                            onValueChange={(v) => handleChange('equipment_id', v)}
                            options={equipmentOptions}
                        />
                    </div>
                </div>
                <Textarea
                    label={t('house.contact.dialog.notes')}
                    value={form.notes}
                    onChange={(e) => handleChange('notes', e.target.value)}
                    placeholder={t('house.contact.dialog.notesPlaceholder')}
                    rows={2}
                />
                <label className="flex items-center gap-2 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={form.is_favorite}
                        onChange={(e) => handleChange('is_favorite', e.target.checked)}
                        className="h-4 w-4"
                    />
                    <span className="text-caption">{t('house.contact.dialog.favorite')}</span>
                </label>
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

export default ContactDialog;
