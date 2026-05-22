import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, Button, Select } from './ui';
import { useAuth } from '../contexts/AuthContext';
import { SUPPORTED_CURRENCIES, DEFAULT_CURRENCY } from '../lib/currencies';
import { AlertCircle, Loader2 } from 'lucide-react';

const currencyOptions = SUPPORTED_CURRENCIES.map((c) => ({
    value: c.code,
    label: `${c.code} — ${c.name} (${c.symbol})`,
}));

/**
 * Shown automatically when the authenticated user has no currency set yet.
 * Existing accounts created before multi-currency support need to confirm
 * the currency their existing amounts are stored in.
 */
const CurrencyOnboardingDialog: React.FC = () => {
    const { t } = useTranslation();
    const { user, setUserCurrency } = useAuth();
    const [selected, setSelected] = useState<string>(DEFAULT_CURRENCY);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    const open = !!user && !user.currency;

    const handleConfirm = async () => {
        setSubmitting(true);
        setError('');
        try {
            await setUserCurrency(selected);
        } catch (err) {
            setError(err instanceof Error ? err.message : t('currencyOnboarding.saveError'));
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Dialog
            open={open}
            // Modal is intentionally not dismissible: the user must pick a currency.
            onOpenChange={() => undefined}
            title={t('currencyOnboarding.title')}
            description={t('currencyOnboarding.description')}
        >
            <div className="space-y-4">
                <div>
                    <label className="block text-label font-medium text-foreground mb-1.5">
                        {t('currencyOnboarding.currencyLabel')}
                    </label>
                    <Select
                        value={selected}
                        onValueChange={setSelected}
                        options={currencyOptions}
                    />
                </div>
                {error && (
                    <p className="flex items-center gap-1 text-micro text-destructive">
                        <AlertCircle className="h-4 w-4" />
                        {error}
                    </p>
                )}
                <div className="flex justify-end pt-2">
                    <Button onClick={handleConfirm} disabled={submitting}>
                        {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {t('currencyOnboarding.confirm')}
                    </Button>
                </div>
            </div>
        </Dialog>
    );
};

export default CurrencyOnboardingDialog;
