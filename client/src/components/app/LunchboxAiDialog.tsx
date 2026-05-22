import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Sparkles,
    X as CloseIcon,
    Loader2,
    AlertTriangle,
    Apple,
    Cookie,
    GlassWater,
    UtensilsCrossed,
    Info,
    Check,
} from 'lucide-react';
import { api } from '../../lib/api';
import { Button, Dialog, Input, Select } from '../ui';

// Server-side enum, mirrored here so we don't introduce a server import.
type LunchboxLocation = 'school' | 'daycare' | 'outing' | 'work' | 'travel' | 'other';

export interface LunchboxIdea {
    main: string;
    fruit: string;
    snack: string;
    drink: string;
    reasoning: string;
    warnings: string[];
}

interface FamilyMemberLite {
    id: string;
    name: string;
    color?: string;
}

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Child the lunchbox is for. Optional — drives age/allergies on server. */
    familyMember?: FamilyMemberLite | null;
    /** When the user picks an idea, the parent form pre-fills its 4 fields. */
    onIdeaApplied: (idea: LunchboxIdea) => void;
}

// Stored DATA values (server enum) — labels resolved at render time via i18n.
const LOCATION_VALUES: LunchboxLocation[] = [
    'school',
    'daycare',
    'outing',
    'work',
    'travel',
    'other',
];

// Remembered between opens so a family doesn't re-enter their pantry every day.
const STORAGE_KEY = 'openfamily.lunchboxAi.prefs.v1';

interface RememberedPrefs {
    mains: string[];
    fruits: string[];
    snacks: string[];
    drinks: string[];
    location: LunchboxLocation;
}

const loadPrefs = (): RememberedPrefs => {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) throw new Error('miss');
        const p = JSON.parse(raw) as Partial<RememberedPrefs>;
        const arr = (v: unknown): string[] =>
            Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : [];
        const validLoc: LunchboxLocation[] = [
            'school',
            'daycare',
            'outing',
            'work',
            'travel',
            'other',
        ];
        return {
            mains: arr(p.mains),
            fruits: arr(p.fruits),
            snacks: arr(p.snacks),
            drinks: arr(p.drinks),
            location: (p.location && validLoc.includes(p.location as LunchboxLocation)
                ? p.location
                : 'school') as LunchboxLocation,
        };
    } catch {
        return { mains: [], fruits: [], snacks: [], drinks: [], location: 'school' };
    }
};

// Generic chip-list input. Comma-separated paste is supported.
const ChipListInput: React.FC<{
    label: string;
    icon: React.ReactNode;
    placeholder: string;
    values: string[];
    onChange: (next: string[]) => void;
}> = ({ label, icon, placeholder, values, onChange }) => {
    const { t } = useTranslation();
    const [draft, setDraft] = useState('');

    const add = () => {
        const tokens = draft
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean);
        if (tokens.length === 0) return;
        const next = [...values];
        for (const t of tokens) {
            if (!next.includes(t) && next.length < 30) next.push(t);
        }
        onChange(next);
        setDraft('');
    };

    const remove = (idx: number) => onChange(values.filter((_, i) => i !== idx));

    return (
        <div>
            <label className="flex items-center gap-2 text-label font-medium text-foreground mb-1.5">
                <span className="text-primary">{icon}</span>
                {label}
            </label>
            <div className="flex gap-2">
                <Input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            add();
                        }
                    }}
                    placeholder={placeholder}
                />
                <Button type="button" variant="secondary" onClick={add}>
                    {t('meals.lunchboxAi.add')}
                </Button>
            </div>
            {values.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                    {values.map((v, idx) => (
                        <span
                            key={`${v}-${idx}`}
                            className="inline-flex items-center gap-1 rounded-pill bg-primary/10 text-primary px-2.5 py-0.5 text-label-sm"
                        >
                            {v}
                            <button
                                type="button"
                                onClick={() => remove(idx)}
                                className="hover:text-primary-pressed"
                                aria-label={t('meals.lunchboxAi.remove', { name: v })}
                            >
                                <CloseIcon className="h-3 w-3" />
                            </button>
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
};

export const LunchboxAiDialog: React.FC<Props> = ({
    open,
    onOpenChange,
    familyMember,
    onIdeaApplied,
}) => {
    const { t } = useTranslation();
    const locationOptions = LOCATION_VALUES.map((value) => ({
        value,
        label: t('meals.lunchboxAi.locations.' + value, { defaultValue: value }),
    }));
    const [mains, setMains] = useState<string[]>([]);
    const [fruits, setFruits] = useState<string[]>([]);
    const [snacks, setSnacks] = useState<string[]>([]);
    const [drinks, setDrinks] = useState<string[]>([]);
    const [location, setLocation] = useState<LunchboxLocation>('school');
    const [context, setContext] = useState('');

    const [generating, setGenerating] = useState(false);
    const [error, setError] = useState('');
    const [ideas, setIdeas] = useState<LunchboxIdea[] | null>(null);
    const [appliedIdx, setAppliedIdx] = useState<number | null>(null);

    // Hydrate once on mount. We *intentionally* don't reset on each open so
    // the parent's typical pantry stays sticky day-to-day.
    useEffect(() => {
        const p = loadPrefs();
        setMains(p.mains);
        setFruits(p.fruits);
        setSnacks(p.snacks);
        setDrinks(p.drinks);
        setLocation(p.location);
    }, []);

    const persistPrefs = () => {
        try {
            localStorage.setItem(
                STORAGE_KEY,
                JSON.stringify({ mains, fruits, snacks, drinks, location }),
            );
        } catch {
            /* localStorage unavailable — non-fatal */
        }
    };

    const totalItems = mains.length + fruits.length + snacks.length + drinks.length;

    const generate = async () => {
        setError('');
        if (totalItems === 0) {
            setError(t('meals.lunchboxAi.errors.min_item'));
            return;
        }
        setGenerating(true);
        setIdeas(null);
        setAppliedIdx(null);
        persistPrefs();

        try {
            const body: Record<string, unknown> = { location, count: 3 };
            if (mains.length > 0) body.availableMains = mains;
            if (fruits.length > 0) body.availableFruits = fruits;
            if (snacks.length > 0) body.availableSnacks = snacks;
            if (drinks.length > 0) body.availableDrinks = drinks;
            if (familyMember?.id) body.familyMemberId = familyMember.id;
            if (context.trim()) body.context = context.trim();

            const response = await api.post<{
                success: boolean;
                data?: { ideas: LunchboxIdea[]; model: string };
                error?: { code?: string; message?: string };
            }>('/api/ai/lunchbox/generate', body);

            if (!response.success) {
                const code = response.error?.code;
                if (code === 'DISABLED') {
                    setError(t('meals.lunchboxAi.errors.disabled'));
                } else if (code === 'QUOTA_EXCEEDED') {
                    setError(t('meals.lunchboxAi.errors.quota_exceeded'));
                } else if (code === 'BAD_JSON') {
                    setError(t('meals.lunchboxAi.errors.bad_json'));
                } else {
                    setError(
                        response.error?.message || t('meals.lunchboxAi.errors.generate_failed'),
                    );
                }
                return;
            }

            setIdeas(response.data?.ideas ?? []);
        } catch (err) {
            console.error('Lunchbox AI generation failed:', err);
            setError(
                err instanceof Error ? err.message : t('meals.lunchboxAi.errors.generate_failed'),
            );
        } finally {
            setGenerating(false);
        }
    };

    const apply = (idx: number) => {
        const idea = ideas?.[idx];
        if (!idea) return;
        onIdeaApplied(idea);
        setAppliedIdx(idx);
    };

    const aiHint = useMemo(() => {
        const parts: string[] = [];
        if (familyMember) parts.push(t('meals.lunchboxAi.hint_for', { name: familyMember.name }));
        const loc = t('meals.lunchboxAi.locations.' + location, { defaultValue: '' });
        if (loc) parts.push(loc.toLowerCase());
        parts.push(t('meals.lunchboxAi.hint_items', { count: totalItems }));
        return parts.join(' • ');
    }, [familyMember, location, totalItems, t]);

    return (
        <Dialog
            open={open}
            onOpenChange={onOpenChange}
            title={t('meals.lunchboxAi.title')}
            description={t('meals.lunchboxAi.description')}
            className="sm:max-w-3xl"
        >
            <div className="space-y-5">
                <ChipListInput
                    label={t('meals.lunchboxAi.mains')}
                    icon={<UtensilsCrossed className="h-4 w-4" />}
                    placeholder={t('meals.lunchboxAi.mains_placeholder')}
                    values={mains}
                    onChange={setMains}
                />
                <ChipListInput
                    label={t('meals.lunchboxAi.fruits')}
                    icon={<Apple className="h-4 w-4" />}
                    placeholder={t('meals.lunchboxAi.fruits_placeholder')}
                    values={fruits}
                    onChange={setFruits}
                />
                <ChipListInput
                    label={t('meals.lunchboxAi.snacks')}
                    icon={<Cookie className="h-4 w-4" />}
                    placeholder={t('meals.lunchboxAi.snacks_placeholder')}
                    values={snacks}
                    onChange={setSnacks}
                />
                <ChipListInput
                    label={t('meals.lunchboxAi.drinks')}
                    icon={<GlassWater className="h-4 w-4" />}
                    placeholder={t('meals.lunchboxAi.drinks_placeholder')}
                    values={drinks}
                    onChange={setDrinks}
                />

                <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-label font-medium text-foreground mb-1.5">
                            {t('meals.lunchboxAi.location')}
                        </label>
                        <Select
                            value={location}
                            onValueChange={(v) => setLocation(v as LunchboxLocation)}
                            options={locationOptions}
                        />
                    </div>
                    <div>
                        <label className="block text-label font-medium text-foreground mb-1.5">
                            {t('meals.lunchboxAi.context')}
                        </label>
                        <Input
                            value={context}
                            onChange={(e) => setContext(e.target.value)}
                            placeholder={t('meals.lunchboxAi.context_placeholder')}
                        />
                    </div>
                </section>

                {error && (
                    <div className="flex items-start gap-2 rounded-input border border-danger/30 bg-danger-soft px-4 py-3 text-caption text-danger">
                        <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                        <span>{error}</span>
                    </div>
                )}

                {!ideas && (
                    <div className="flex items-center justify-between gap-4 pt-2">
                        <p className="text-label-sm text-muted-foreground">{aiHint}</p>
                        <Button type="button" onClick={generate} disabled={generating}>
                            {generating ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    {t('meals.lunchboxAi.generating')}
                                </>
                            ) : (
                                <>
                                    <Sparkles className="w-4 h-4 mr-2" />
                                    {t('meals.lunchboxAi.generate')}
                                </>
                            )}
                        </Button>
                    </div>
                )}

                {ideas && (
                    <section className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-h2 font-semibold flex items-center gap-2">
                                <Sparkles className="h-5 w-5 text-accent" />
                                {t('meals.lunchboxAi.ideas', { count: ideas.length })}
                            </h3>
                            <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                onClick={generate}
                                disabled={generating}
                            >
                                {generating ? (
                                    <>
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        {t('meals.lunchboxAi.re_generating')}
                                    </>
                                ) : (
                                    t('meals.lunchboxAi.re_generate')
                                )}
                            </Button>
                        </div>

                        {ideas.map((idea, idx) => (
                            <div
                                key={`${idea.main}-${idx}`}
                                className="rounded-card border border-border bg-card p-4 space-y-3"
                            >
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-caption">
                                    {idea.main && (
                                        <div className="flex items-start gap-2">
                                            <UtensilsCrossed className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                                            <span>
                                                <span className="font-medium">
                                                    {t('meals.lunchboxAi.main_label')}
                                                </span>{' '}
                                                {idea.main}
                                            </span>
                                        </div>
                                    )}
                                    {idea.fruit && (
                                        <div className="flex items-start gap-2">
                                            <Apple className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                                            <span>
                                                <span className="font-medium">
                                                    {t('meals.lunchboxAi.fruit_label')}
                                                </span>{' '}
                                                {idea.fruit}
                                            </span>
                                        </div>
                                    )}
                                    {idea.snack && (
                                        <div className="flex items-start gap-2">
                                            <Cookie className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                                            <span>
                                                <span className="font-medium">
                                                    {t('meals.lunchboxAi.snack_label')}
                                                </span>{' '}
                                                {idea.snack}
                                            </span>
                                        </div>
                                    )}
                                    {idea.drink && (
                                        <div className="flex items-start gap-2">
                                            <GlassWater className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                                            <span>
                                                <span className="font-medium">
                                                    {t('meals.lunchboxAi.drink_label')}
                                                </span>{' '}
                                                {idea.drink}
                                            </span>
                                        </div>
                                    )}
                                </div>

                                {idea.reasoning && (
                                    <p className="flex items-start gap-2 text-label-sm text-muted-foreground">
                                        <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                                        {idea.reasoning}
                                    </p>
                                )}

                                {idea.warnings.length > 0 && (
                                    <ul className="space-y-1">
                                        {idea.warnings.map((w, i) => (
                                            <li
                                                key={i}
                                                className="flex items-start gap-2 text-label-sm text-warning"
                                            >
                                                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                                                {w}
                                            </li>
                                        ))}
                                    </ul>
                                )}

                                <div className="flex justify-end pt-1">
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant={appliedIdx === idx ? 'secondary' : 'primary'}
                                        onClick={() => apply(idx)}
                                    >
                                        {appliedIdx === idx ? (
                                            <>
                                                <Check className="w-4 h-4 mr-1" />
                                                {t('meals.lunchboxAi.applied')}
                                            </>
                                        ) : (
                                            t('meals.lunchboxAi.use_idea')
                                        )}
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </section>
                )}

                <div className="flex justify-end pt-2">
                    <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
                        {t('meals.lunchboxAi.close')}
                    </Button>
                </div>
            </div>
        </Dialog>
    );
};

export default LunchboxAiDialog;
