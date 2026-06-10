import React from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';
import { SUPPORTED_LANGUAGES } from '../../i18n';
import { changeAppLanguage } from '../../lib/language';
import { useToast } from './Toast';

interface LanguageSwitcherProps {
    className?: string;
}

export const LanguageSwitcher: React.FC<LanguageSwitcherProps> = ({ className }) => {
    const { i18n, t } = useTranslation('common');
    const { showToast } = useToast();
    const current = (i18n.resolvedLanguage || i18n.language || 'en').split('-')[0];

    const handleChange = (lng: string) => {
        // Fire-and-forget server sync; only surface an error toast on failure.
        void changeAppLanguage(lng).then((synced) => {
            if (!synced) showToast({ title: t('language.syncError') });
        });
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
                    {lng}
                </button>
            ))}
        </div>
    );
};
