import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, Star, BookOpen } from 'lucide-react';
import { type CatalogItem, type FrequentItem, matchCatalog } from '../../lib/shoppingCatalog';

export interface PickerSuggestion {
    name: string;
    category: string;
    unit?: string;
    source: 'history' | 'catalog';
}

interface ShoppingItemPickerProps {
    value: string;
    onChange: (value: string) => void;
    // Fired when the user picks a suggestion (catalog or history). The parent
    // receives the full row so it can auto-fill category/unit fields.
    onPick: (suggestion: PickerSuggestion) => void;
    // The current shopping list, used to derive history suggestions.
    historyItems: Array<{ name: string; category: string; unit?: string }>;
    placeholder?: string;
    autoFocus?: boolean;
}

const buildSuggestions = (history: FrequentItem[], catalog: CatalogItem[]): PickerSuggestion[] => {
    const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

    const seen = new Set<string>();
    const out: PickerSuggestion[] = [];

    // History first — what the user already buys beats the catalog every time.
    for (const item of history) {
        const key = fold(item.name);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
            name: item.name,
            category: item.category,
            unit: item.unit,
            source: 'history',
        });
    }

    // Catalog rows that aren't already covered by history.
    for (const item of catalog) {
        const key = fold(item.name);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
            name: item.name,
            category: item.category,
            unit: item.unit,
            source: 'catalog',
        });
    }

    return out.slice(0, 8);
};

const ShoppingItemPicker: React.FC<ShoppingItemPickerProps> = ({
    value,
    onChange,
    onPick,
    historyItems,
    placeholder,
    autoFocus,
}) => {
    const { t } = useTranslation();
    const resolvedPlaceholder = placeholder ?? t('shopping.picker.placeholder');
    const [open, setOpen] = useState(false);
    const [highlight, setHighlight] = useState(0);
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // History bucket changes only when the underlying list does, not on every
    // keystroke — recomputing on each change would be wasteful.
    const frequentItems = useMemo(() => {
        const byKey = new Map<string, FrequentItem>();
        for (const item of historyItems) {
            const key = item.name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
            const existing = byKey.get(key);
            if (existing) {
                existing.count += 1;
            } else {
                byKey.set(key, {
                    name: item.name,
                    category: item.category,
                    unit: item.unit,
                    count: 1,
                });
            }
        }
        return Array.from(byKey.values()).sort(
            (a, b) => b.count - a.count || a.name.localeCompare(b.name, 'fr'),
        );
    }, [historyItems]);

    const suggestions = useMemo(() => {
        const q = value.trim();
        if (!q) {
            // Empty query: show user's top-6 history then top catalog hits.
            const topHistory = frequentItems.slice(0, 6).map<PickerSuggestion>((item) => ({
                name: item.name,
                category: item.category,
                unit: item.unit,
                source: 'history',
            }));
            return topHistory;
        }
        const folded = q.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
        const historyMatches = frequentItems.filter((item) =>
            item.name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(folded),
        );
        const catalogMatches = matchCatalog(q, 8);
        return buildSuggestions(historyMatches, catalogMatches);
    }, [value, frequentItems]);

    // Reset highlight whenever the suggestion list changes so the user always
    // sees the first row selected after typing.
    useEffect(() => {
        setHighlight(0);
    }, [suggestions.length, value]);

    // Click-outside closes the dropdown.
    useEffect(() => {
        if (!open) return;
        const onDocClick = (e: MouseEvent) => {
            if (!containerRef.current?.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', onDocClick);
        return () => document.removeEventListener('mousedown', onDocClick);
    }, [open]);

    const pick = (s: PickerSuggestion) => {
        onPick(s);
        setOpen(false);
        // Return focus to the input so the user can immediately type the next
        // item without grabbing the mouse.
        inputRef.current?.focus();
    };

    const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
            setOpen(true);
            return;
        }
        if (!open || suggestions.length === 0) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlight((h) => (h + 1) % suggestions.length);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlight((h) => (h - 1 + suggestions.length) % suggestions.length);
        } else if (e.key === 'Enter') {
            // Only intercept Enter when there's an active suggestion to pick.
            // Otherwise we let the parent form submit normally.
            if (suggestions[highlight]) {
                e.preventDefault();
                pick(suggestions[highlight]);
            }
        } else if (e.key === 'Escape') {
            setOpen(false);
        }
    };

    return (
        <div ref={containerRef} className="relative w-full">
            <label className="mb-1.5 block text-caption font-medium text-foreground">
                {t('shopping.picker.name')}
            </label>
            <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                    ref={inputRef}
                    type="text"
                    value={value}
                    onChange={(e) => {
                        onChange(e.target.value);
                        setOpen(true);
                    }}
                    onFocus={() => setOpen(true)}
                    onKeyDown={onKeyDown}
                    placeholder={resolvedPlaceholder}
                    autoFocus={autoFocus}
                    className="input-nexus pl-9"
                    aria-autocomplete="list"
                    aria-expanded={open}
                    role="combobox"
                />
            </div>

            {open && suggestions.length > 0 ? (
                <div className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-card border border-border bg-card shadow-surface">
                    <ul role="listbox">
                        {suggestions.map((s, idx) => (
                            <li
                                key={`${s.source}-${s.name}-${idx}`}
                                role="option"
                                aria-selected={idx === highlight}
                            >
                                <button
                                    type="button"
                                    onClick={() => pick(s)}
                                    onMouseEnter={() => setHighlight(idx)}
                                    className={`flex w-full items-center gap-3 px-3 py-2 text-left text-caption transition-colors ${
                                        idx === highlight
                                            ? 'bg-primary-soft text-foreground'
                                            : 'hover:bg-muted/40'
                                    }`}
                                >
                                    {s.source === 'history' ? (
                                        <Star className="h-3.5 w-3.5 shrink-0 text-warning" />
                                    ) : (
                                        <BookOpen className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                    )}
                                    <span className="flex-1 truncate font-medium">{s.name}</span>
                                    {s.unit ? (
                                        <span className="text-micro text-muted-foreground">
                                            {s.unit}
                                        </span>
                                    ) : null}
                                    <span className="rounded-pill bg-muted/60 px-2 py-0.5 text-micro text-muted-foreground">
                                        {t('shopping.categories.' + s.category, {
                                            defaultValue: s.category,
                                        })}
                                    </span>
                                </button>
                            </li>
                        ))}
                    </ul>
                    <div className="border-t border-border bg-muted/20 px-3 py-1.5 text-micro text-muted-foreground">
                        <Star className="mr-1 inline h-3 w-3 text-warning" />{' '}
                        {t('shopping.picker.your_items')} ·{' '}
                        <BookOpen className="mr-1 inline h-3 w-3" /> {t('shopping.picker.catalog')}
                    </div>
                </div>
            ) : null}
        </div>
    );
};

export default ShoppingItemPicker;
