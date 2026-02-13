import React from 'react';
import { Button } from '../ui/Button';

interface EmptyStateProps {
    icon?: React.ReactNode;
    title: string;
    description?: string;
    actionLabel?: string;
    onAction?: () => void;
}

const EmptyState: React.FC<EmptyStateProps> = ({
    icon,
    title,
    description,
    actionLabel,
    onAction,
}) => {
    return (
        <div className="rounded-card border border-dashed border-border bg-card px-6 py-10 text-center shadow-surface">
            {icon ? <div className="mb-3 flex justify-center text-muted-foreground">{icon}</div> : null}
            <h3 className="text-body font-semibold text-foreground">{title}</h3>
            {description ? <p className="mt-1 text-caption text-muted-foreground">{description}</p> : null}
            {actionLabel && onAction ? (
                <Button className="mt-5" onClick={onAction}>
                    {actionLabel}
                </Button>
            ) : null}
        </div>
    );
};

export default EmptyState;
