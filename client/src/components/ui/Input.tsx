import React from 'react';
import { cn } from '../../lib/utils';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
    label?: string;
    error?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
    ({ className, label, error, id, ...props }, ref) => {
        const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');

        return (
            <div className="w-full">
                {label && (
                    <label
                        htmlFor={inputId}
                        className="mb-1.5 block text-caption font-medium text-foreground"
                    >
                        {label}
                    </label>
                )}
                <input
                    id={inputId}
                    ref={ref}
                    className={cn(
                        'input-nexus',
                        error && 'border-destructive focus-visible:ring-destructive',
                        className
                    )}
                    {...props}
                />
                {error && (
                    <p className="mt-1.5 text-micro text-destructive">{error}</p>
                )}
            </div>
        );
    }
);

Input.displayName = 'Input';
