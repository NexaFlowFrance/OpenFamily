import React from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import { ChevronDown, ChevronUp, Check } from 'lucide-react';
import { cn } from '../../lib/utils';

interface SelectProps {
    value: string;
    onValueChange: (value: string) => void;
    placeholder?: string;
    options: Array<{ value: string; label: string }>;
    className?: string;
}

const EMPTY_SELECT_VALUE = '__of_empty_value__';

const toInternalValue = (value: string) => (value === '' ? EMPTY_SELECT_VALUE : value);
const fromInternalValue = (value: string) => (value === EMPTY_SELECT_VALUE ? '' : value);

export const Select: React.FC<SelectProps> = ({
    value,
    onValueChange,
    placeholder = '',
    options,
    className,
}) => {
    // An empty value that no option carries shows the placeholder (an action
    // menu such as "Add a reminder"); an option can still stand for "".
    const emptyIsOption = options.some((option) => option.value === '');
    return (
        <SelectPrimitive.Root
            value={value === '' && !emptyIsOption ? '' : toInternalValue(value)}
            onValueChange={(nextValue) => onValueChange(fromInternalValue(nextValue))}
        >
            <SelectPrimitive.Trigger
                className={cn(
                    'input-nexus flex items-center justify-between py-0 text-caption',
                    className
                )}
            >
                <SelectPrimitive.Value placeholder={placeholder} />
                <SelectPrimitive.Icon>
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </SelectPrimitive.Icon>
            </SelectPrimitive.Trigger>
            <SelectPrimitive.Portal>
                {/* A popper has no height limit of its own: with a long list
                    (forty recipes) it ran off the screen and could not scroll.
                    Capped to the room left on screen and to 20rem, the
                    viewport scrolls with the wheel, touch and the arrows. */}
                <SelectPrimitive.Content
                    className="z-50 max-h-[min(20rem,var(--radix-select-content-available-height))] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-card border border-border bg-popover shadow-surface-hover animate-fade-in"
                    position="popper"
                    sideOffset={6}
                    collisionPadding={8}
                >
                    <SelectPrimitive.ScrollUpButton className="flex h-6 cursor-default items-center justify-center text-muted-foreground">
                        <ChevronUp className="h-4 w-4" />
                    </SelectPrimitive.ScrollUpButton>
                    <SelectPrimitive.Viewport className="overscroll-contain p-1">
                        {options.map((option) => (
                            <SelectPrimitive.Item
                                key={`${option.value}-${option.label}`}
                                value={toInternalValue(option.value)}
                                className={cn(
                                    'relative flex min-h-[40px] cursor-pointer select-none items-center rounded-input py-2 pl-9 pr-3 text-caption',
                                    'focus:bg-surface-2 focus:outline-none',
                                    'data-[disabled]:pointer-events-none data-[disabled]:opacity-50'
                                )}
                            >
                                <span className="absolute left-3 flex h-4 w-4 items-center justify-center">
                                    <SelectPrimitive.ItemIndicator>
                                        <Check className="h-4 w-4 text-primary" />
                                    </SelectPrimitive.ItemIndicator>
                                </span>
                                <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
                            </SelectPrimitive.Item>
                        ))}
                    </SelectPrimitive.Viewport>
                    <SelectPrimitive.ScrollDownButton className="flex h-6 cursor-default items-center justify-center text-muted-foreground">
                        <ChevronDown className="h-4 w-4" />
                    </SelectPrimitive.ScrollDownButton>
                </SelectPrimitive.Content>
            </SelectPrimitive.Portal>
        </SelectPrimitive.Root>
    );
};
