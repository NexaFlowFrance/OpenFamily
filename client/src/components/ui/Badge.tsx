import React from 'react';
import { cn } from '../../lib/utils';

interface BadgeProps {
    children: React.ReactNode;
    variant?: 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'secondary';
    className?: string;
}

export const Badge: React.FC<BadgeProps> = ({
    children,
    variant = 'default',
    className,
}) => {
    const variantClasses = {
        default: 'bg-surface-2 text-foreground border-border',
        primary: 'bg-primary-soft text-primary border-primary/20',
        success: 'bg-success/10 text-success border-success/20',
        warning: 'bg-warning/10 text-warning border-warning/20',
        danger: 'bg-danger/10 text-danger border-danger/20',
        secondary: 'bg-muted text-muted-foreground border-border',
    };

    return (
        <span
            className={cn(
                'inline-flex min-h-[24px] items-center rounded-pill border px-2.5 py-0.5 text-micro font-medium',
                variantClasses[variant],
                className
            )}
        >
            {children}
        </span>
    );
};
