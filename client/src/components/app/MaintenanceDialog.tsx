import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Textarea } from '../ui/Textarea';
import {
    type Equipment,
    type Maintenance,
    type MaintenanceKind,
    MAINTENANCE_KINDS,
    useCreateMaintenance,
    useUpdateMaintenance,
} from '../../hooks/useHouse';
import { AlertCircle, Loader2 } from 'lucide-react';

// =============================================================================
// MaintenanceDialog
//
// Always tied to one equipment (passed in `equipment`). Same dialog handles
// creation (no `maintenance` prop) and edition.
// Recurrence is exposed as months so the user can think in plain calendar
// terms ("12 mois" = annuel). The server enforces 1..120.
// =============================================================================

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    equipment: Equipment;
    maintenance: Maintenance | null;
}

interface FormState {
    title: string;
    kind: MaintenanceKind;
    planned_date: string;
    performed_date: string;
    cost: string;
    recurrence_months: string;
    notes: string;
}

const blankForm = (): FormState => ({
    title: '',
    kind: 'Entretien',
    planned_date: '',
    performed_date: '',
    cost: '',
    recurrence_months: '',
    notes: '',
});

const fromMaintenance = (m: Maintenance): FormState => ({
    title: m.title,
    kind: m.kind,
    planned_date: m.planned_date ?? '',
    performed_date: m.performed_date ?? '',
    cost: m.cost !== null ? String(m.cost) : '',
    recurrence_months: m.recurrence_months !== null ? String(m.recurrence_months) : '',
    notes: m.notes ?? '',
});

const MaintenanceDialog: React.FC<Props> = ({ open, onOpenChange, equipment, maintenance }) => {
    const { t } = useTranslation();
    const isEdit = !!maintenance;
    const createMut = useCreateMaintenance();
    const updateMut = useUpdateMaintenance();
    const [form, setForm] = useState<FormState>(blankForm);
    const [error, setError] = useState('');
    const [recurrenceFired, setRecurrenceFired] = useState<string | null>(null);

    useEffect(() => {
        if (open) {
            setForm(maintenance ? fromMaintenance(maintenance) : blankForm());
            setError('');
            setRecurrenceFired(null);
        }
    }, [open, maintenance]);

    const handleChange = (key: keyof FormState, value: string) =>
        setForm((prev) => ({ ...prev, [key]: value }));

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        if (!form.title.trim()) {
            setError(t('house.maintenance.dialog.titleRequired'));
            return;
        }
        if (!form.planned_date && !form.performed_date) {
            setError(t('house.maintenance.dialog.dateRequired'));
            return;
        }
        const cost = form.cost.trim() ? Number(form.cost.replace(',', '.')) : null;
        if (cost !== null && (!Number.isFinite(cost) || cost < 0)) {
            setError(t('house.maintenance.dialog.costInvalid'));
            return;
        }
        const recurrence = form.recurrence_months.trim() ? Number(form.recurrence_months) : null;
        if (
            recurrence !== null &&
            (!Number.isInteger(recurrence) || recurrence < 1 || recurrence > 120)
        ) {
            setError(t('house.maintenance.dialog.recurrenceInvalid'));
            return;
        }
        const body = {
            equipment_id: equipment.id,
            title: form.title.trim(),
            kind: form.kind,
            planned_date: form.planned_date || null,
            performed_date: form.performed_date || null,
            cost,
            recurrence_months: recurrence,
            notes: form.notes.trim() || null,
        };
        try {
            if (isEdit && maintenance) {
                const result = await updateMut.mutateAsync({
                    id: maintenance.id,
                    patch: body,
                });
                if (result.next_occurrence) {
                    // Show a confirmation banner instead of closing immediately
                    // so the user notices the new auto-planned occurrence.
                    setRecurrenceFired(result.next_occurrence.planned_date ?? '');
                    setForm(fromMaintenance(result));
                    return;
                }
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
                    ? t('house.maintenance.dialog.editTitle')
                    : t('house.maintenance.dialog.createTitle')
            }
            description={t('house.maintenance.dialog.forEquipment', { name: equipment.name })}
            className="sm:max-w-xl"
        >
            <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                    <p className="flex items-center gap-1 text-micro text-destructive">
                        <AlertCircle className="h-4 w-4" />
                        {error}
                    </p>
                )}
                {recurrenceFired && (
                    <div className="rounded-input border border-success/40 bg-success-soft px-3 py-2 text-micro text-success">
                        {t('house.maintenance.dialog.nextOccurrenceCreated', {
                            date: recurrenceFired,
                        })}
                    </div>
                )}
                <Input
                    label={t('house.maintenance.dialog.title')}
                    value={form.title}
                    onChange={(e) => handleChange('title', e.target.value)}
                    placeholder={t('house.maintenance.dialog.titlePlaceholder')}
                    required
                />
                <div>
                    <label className="block text-label font-medium text-foreground mb-1.5">
                        {t('house.maintenance.dialog.type')}
                    </label>
                    <Select
                        value={form.kind}
                        onValueChange={(v) => handleChange('kind', v as MaintenanceKind)}
                        options={MAINTENANCE_KINDS.map((k) => ({
                            value: k,
                            label: t('domain.maintenanceKind.' + k, { defaultValue: k }),
                        }))}
                    />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Input
                        label={t('house.maintenance.dialog.plannedDate')}
                        type="date"
                        value={form.planned_date}
                        onChange={(e) => handleChange('planned_date', e.target.value)}
                    />
                    <Input
                        label={t('house.maintenance.dialog.performedDate')}
                        type="date"
                        value={form.performed_date}
                        onChange={(e) => handleChange('performed_date', e.target.value)}
                    />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Input
                        label={t('house.maintenance.dialog.cost')}
                        type="number"
                        step="0.01"
                        value={form.cost}
                        onChange={(e) => handleChange('cost', e.target.value)}
                        placeholder="0.00"
                    />
                    <Input
                        label={t('house.maintenance.dialog.recurrence')}
                        type="number"
                        min={1}
                        max={120}
                        value={form.recurrence_months}
                        onChange={(e) => handleChange('recurrence_months', e.target.value)}
                        placeholder={t('house.maintenance.dialog.recurrencePlaceholder')}
                    />
                </div>
                <Textarea
                    label={t('house.maintenance.dialog.notes')}
                    value={form.notes}
                    onChange={(e) => handleChange('notes', e.target.value)}
                    placeholder={t('house.maintenance.dialog.notesPlaceholder')}
                    rows={3}
                />
                <div className="flex justify-end gap-3 pt-2">
                    <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
                        {recurrenceFired ? t('house.maintenance.dialog.close') : t('common.cancel')}
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

export default MaintenanceDialog;
