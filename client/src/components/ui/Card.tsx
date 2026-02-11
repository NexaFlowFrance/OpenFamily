import React from 'react';
import { cn } from '../../lib/utils';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
    children: React.ReactNode;
    hover?: boolean;
}

export const Card: React.FC<CardProps> = ({
    children,
    className,
    hover = true,
    ...props
}) => {
    return (
        <div
            className={cn(
                'card-nexus',
                hover && 'hover:-translate-y-0.5',
                className
            )}
            {...props}
        >
            {children}
        </div>
    );
};

interface CardHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
    children: React.ReactNode;
}

export const CardHeader: React.FC<CardHeaderProps> = ({
    children,
    className,
    ...props
}) => {
    return (
        <div
            className={cn('px-5 pb-3 pt-5 md:px-6 md:pt-6', className)}
            {...props}
        >
            {children}
        </div>
    );
};

interface CardTitleProps extends React.HTMLAttributes<HTMLHeadingElement> {
    children: React.ReactNode;
}

export const CardTitle: React.FC<CardTitleProps> = ({
    children,
    className,
    ...props
}) => {
    return (
        <h2
            className={cn('text-h2 font-semibold text-card-foreground', className)}
            {...props}
        >
            {children}
        </h2>
    );
};

interface CardContentProps extends React.HTMLAttributes<HTMLDivElement> {
    children: React.ReactNode;
}

export const CardContent: React.FC<CardContentProps> = ({
    children,
    className,
    ...props
}) => {
    return (
        <div
            className={cn('px-5 pb-5 md:px-6 md:pb-6', className)}
            {...props}
        >
            {children}
        </div>
    );
};
