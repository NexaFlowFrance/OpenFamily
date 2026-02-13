import React from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cn } from '../../lib/utils';

interface Tab {
    value: string;
    label: string;
    content: React.ReactNode;
}

interface TabsProps {
    tabs: Tab[];
    defaultValue?: string;
    className?: string;
}

export const Tabs: React.FC<TabsProps> = ({ tabs, defaultValue, className }) => {
    return (
        <TabsPrimitive.Root
            defaultValue={defaultValue || tabs[0]?.value}
            className={cn('w-full', className)}
        >
            <TabsPrimitive.List className="inline-flex min-h-[44px] w-full flex-wrap gap-1 rounded-pill bg-surface-2 p-1">
                {tabs.map((tab) => (
                    <TabsPrimitive.Trigger
                        key={tab.value}
                        value={tab.value}
                        className={cn(
                            'inline-flex flex-1 items-center justify-center rounded-pill px-4 py-2 text-caption font-medium text-muted-foreground',
                            'transition-colors duration-fast ease-soft',
                            'data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-surface'
                        )}
                    >
                        {tab.label}
                    </TabsPrimitive.Trigger>
                ))}
            </TabsPrimitive.List>
            {tabs.map((tab) => (
                <TabsPrimitive.Content
                    key={tab.value}
                    value={tab.value}
                    className="mt-6 focus:outline-none"
                >
                    {tab.content}
                </TabsPrimitive.Content>
            ))}
        </TabsPrimitive.Root>
    );
};
