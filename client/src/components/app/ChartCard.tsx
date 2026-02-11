import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card';

interface ChartCardProps {
    title: string;
    subtitle?: string;
    action?: React.ReactNode;
    children: React.ReactNode;
    className?: string;
}

const ChartCard: React.FC<ChartCardProps> = ({
    title,
    subtitle,
    action,
    children,
    className,
}) => {
    return (
        <Card className={className}>
            <CardHeader className="flex flex-row items-start justify-between gap-3">
                <div>
                    <CardTitle>{title}</CardTitle>
                    {subtitle ? <p className="mt-1 text-caption text-muted-foreground">{subtitle}</p> : null}
                </div>
                {action}
            </CardHeader>
            <CardContent>{children}</CardContent>
        </Card>
    );
};

export default ChartCard;
