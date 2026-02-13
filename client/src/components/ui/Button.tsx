import React from 'react';
import { cn } from '../../lib/utils';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    children: React.ReactNode;
    variant?: 'primary' | 'secondary' | 'ghost' | 'destructive';
    size?: 'sm' | 'md' | 'lg' | 'icon';
}

export const Button: React.FC<ButtonProps> = ({
    children,
    className,
    variant = 'primary',
    size = 'md',
    disabled,
    ...props
}) => {
    const baseClasses = 'btn-nexus';

    const variantClasses = {
        primary: 'btn-primary',
        secondary: 'btn-secondary',
        ghost: 'btn-ghost',
        destructive: 'btn-destructive',
    };

    const sizeClasses = {
        sm: 'h-10 px-4 text-caption',
        md: 'h-11 md:h-10 px-5 text-caption',
        lg: 'h-12 px-6 text-body',
        icon: 'h-10 w-10',
    };

    return (
        <button
            className={cn(
                baseClasses,
                variantClasses[variant],
                sizeClasses[size],
                disabled && 'cursor-not-allowed opacity-50',
                className
            )}
            disabled={disabled}
            {...props}
        >
            {children}
        </button>
    );
};
