import React from 'react';
import { useTranslation } from 'react-i18next';
import { Github, RotateCcw, Info } from 'lucide-react';

const IS_DEMO = Boolean(import.meta.env.VITE_DEMO);

/** Thin banner shown only in the static GitHub Pages demo build. */
export const DemoBanner: React.FC = () => {
    const { t } = useTranslation('common');
    if (!IS_DEMO) return null;
    return (
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-border bg-primary-soft px-4 py-2 text-center text-micro text-primary">
            <span className="inline-flex items-center gap-1.5 font-medium">
                <Info className="h-3.5 w-3.5" />
                {t('demo.notice')}
            </span>
            {/* The demo store lives purely in memory (no persistence), so a
                plain reload recreates the seed and fully resets the demo. */}
            <button
                type="button"
                onClick={() => window.location.reload()}
                className="inline-flex items-center gap-1 font-semibold underline underline-offset-2 hover:no-underline"
            >
                <RotateCcw className="h-3.5 w-3.5" />
                {t('demo.reset')}
            </button>
            <a
                href="https://github.com/NexaFlowFrance/OpenFamily"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-semibold underline underline-offset-2 hover:no-underline"
            >
                <Github className="h-3.5 w-3.5" />
                {t('demo.star')}
            </a>
        </div>
    );
};
