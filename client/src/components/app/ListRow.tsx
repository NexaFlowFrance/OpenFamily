import React from 'react';
import { cn } from '../../lib/utils';

interface ListRowProps {
    leading?: React.ReactNode;
    title: React.ReactNode;
    meta?: React.ReactNode;
    trailing?: React.ReactNode;
    checked?: boolean;
    className?: string;
    onClick?: () => void;
}

const ListRow: React.FC<ListRowProps> = ({
    leading,
    title,
    meta,
    trailing,
    checked = false,
    className,
    onClick,
}) => {
    return (
        <div
            role={onClick ? 'button' : undefined}
            tabIndex={onClick ? 0 : undefined}
            onClick={onClick}
            onKeyDown={(event) => {
                if (!onClick) return;
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onClick();
                }
            }}
            className={cn(
                'flex min-h-[56px] items-center gap-3 rounded-card border border-border bg-card px-4 py-3 shadow-surface',
                'transition-all duration-fast ease-soft hover:border-border-strong hover:shadow-surface-hover',
                checked && 'bg-muted/30 text-muted-foreground',
                onClick && 'cursor-pointer',
                className
            )}
        >
            {leading && <div className="shrink-0">{leading}</div>}
            <div className="min-w-0 flex-1">
                <div className={cn('truncate text-body font-medium', checked && 'line-through')}>
                    {title}
                </div>
                {meta && <div className="mt-0.5 text-caption text-muted-foreground">{meta}</div>}
            </div>
            {trailing && <div className="shrink-0">{trailing}</div>}
        </div>
    );
};

export default ListRow;
