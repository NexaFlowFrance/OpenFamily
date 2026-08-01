import React from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';
import { SUPPORTED_LANGUAGES } from '../../i18n';
import { LANGUAGE_CONFIG } from '../../i18n/languages';
import { changeAppLanguage } from '../../lib/language';
import { useToast } from './Toast';
import { useAuth } from '../../contexts/AuthContext';

interface LanguageSwitcherProps {
    className?: string;
}

export const LanguageSwitcher: React.FC<LanguageSwitcherProps> = ({ className }) => {
    const { i18n, t } = useTranslation('common');
    const { showToast } = useToast();
    const { user, updateCurrency } = useAuth();
    const current = (i18n.resolvedLanguage || i18n.language || 'en').split('-')[0];

    const handleChange = (lng: string) => {
        void (async () => {
            const synced = await changeAppLanguage(lng);
            if (!synced) showToast({ title: t('language.syncError') });

            const currencyDefault = LANGUAGE_CONFIG[lng]?.currencyDefault;
            if (user && currencyDefault) {
                const shouldApplyCurrencyDefault = user.currency
                    ? currencyDefault.replace.includes(user.currency)
                    : currencyDefault.replaceMissing;

                if (shouldApplyCurrencyDefault) {
                    try {
                        await updateCurrency(currencyDefault.with);
                    } catch {
                        showToast({ title: t('language.currencySyncError') });
                    }
                }
            }
        })();
    };

    return (
        <div
            className={cn(
                'inline-flex items-center rounded-input border border-border bg-card p-0.5',
                className
            )}
            role="group"
            aria-label="Language"
        >
            {SUPPORTED_LANGUAGES.map((lng) => (
                <button
                    key={lng}
                    type="button"
                    onClick={() => handleChange(lng)}
                    aria-pressed={current === lng}
                    className={cn(
                        'rounded-[6px] px-2.5 py-1 text-micro font-semibold uppercase tracking-wide transition-colors',
                        current === lng
                            ? 'bg-primary text-primary-foreground'
                            : 'text-muted-foreground hover:text-foreground'
                    )}
                >
                    {LANGUAGE_CONFIG[lng]?.label ?? lng.toUpperCase()}
                </button>
            ))}
        </div>
    );
};
