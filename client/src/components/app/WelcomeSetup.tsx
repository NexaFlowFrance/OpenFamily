import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ArrowRight, Check, Home, Monitor, Moon, Plus, Smartphone, Sun, Trash2, UserPlus } from 'lucide-react';
import { Button, DatePicker, Input, Select } from '../ui';
import { LanguageSwitcher } from '../ui/LanguageSwitcher';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { api } from '../../lib/api';

// The first minutes of a new family: a short guided setup, shown once to the
// person who created the family and has not added anyone to it yet. Three
// questions (how the app looks, who is in the family, which sections it
// needs), each with an answer already filled in, and a way out at every step:
// everything asked here can be changed later in Settings.

const DONE_KEY = 'of_setup_done';
const COLORS = ['#2563EB', '#DB2777', '#16A34A', '#F97316', '#7C3AED', '#0891B2', '#CA8A04', '#64748B'];
// The optional sections, in the order of the menu.
const MODULES: Array<{ key: string; labelKey: string; descKey: string }> = [
    { key: 'meals', labelKey: 'nav:items.meals', descKey: 'settings:modules.descriptions.meals' },
    { key: 'recipes', labelKey: 'nav:items.recipes', descKey: 'settings:modules.descriptions.recipes' },
    { key: 'pantry', labelKey: 'nav:items.pantry', descKey: 'settings:modules.descriptions.pantry' },
    { key: 'budget', labelKey: 'nav:items.budget', descKey: 'settings:modules.descriptions.budget' },
    { key: 'rewards', labelKey: 'nav:items.rewards', descKey: 'settings:modules.descriptions.rewards' },
    { key: 'planning', labelKey: 'nav:items.planning', descKey: 'settings:modules.descriptions.planning' },
    { key: 'notes', labelKey: 'settings:modules.names.notes', descKey: 'settings:modules.descriptions.notes' },
    { key: 'kiosk', labelKey: 'settings:modules.names.kiosk', descKey: 'settings:modules.descriptions.kiosk' },
    { key: 'integrations', labelKey: 'nav:items.integrations', descKey: 'settings:modules.descriptions.integrations' },
    { key: 'ai', labelKey: 'settings:modules.names.ai', descKey: 'settings:modules.descriptions.ai' },
];
const STEPS = ['welcome', 'family', 'modules', 'done'] as const;

interface Person { name: string; role: 'Parent' | 'Enfant'; birthdate: string }

const isDone = (userId: string): boolean => {
    try {
        return localStorage.getItem(`${DONE_KEY}:${userId}`) === '1';
    } catch {
        return true;
    }
};
const markDone = (userId: string) => {
    try {
        localStorage.setItem(`${DONE_KEY}:${userId}`, '1');
    } catch {
        // Nothing to keep it in: it will be offered again, and can be skipped again.
    }
};

const WelcomeSetup: React.FC = () => {
    const { t } = useTranslation(['setup', 'settings', 'nav', 'family', 'common']);
    const { user, disabledModules, updateDisabledModules } = useAuth();
    const { theme, setTheme } = useTheme();
    const [open, setOpen] = useState(false);
    const [step, setStep] = useState(0);
    const [people, setPeople] = useState<Person[]>([]);
    const [hidden, setHidden] = useState<string[]>([]);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const userId = user?.id;
    // The person who created the family, as a parent. Someone invited joins a
    // family that is already set up.
    const eligible = Boolean(userId) && user?.is_owner !== false && (user?.role ?? 'parent') === 'parent' && !import.meta.env.VITE_DEMO;

    useEffect(() => {
        if (!eligible || !userId || isDone(userId)) return undefined;
        let active = true;
        api.get<{ success: boolean; data: unknown[] }>('/api/family')
            .then((res) => {
                // A family that already has someone in it has been set up, here or elsewhere.
                if (!active || !res.success || !Array.isArray(res.data) || res.data.length > 0) return;
                const firstName = (user?.name || '').trim().split(/\s+/)[0] || '';
                setPeople([{ name: firstName, role: 'Parent', birthdate: '' }]);
                setHidden([...disabledModules]);
                setOpen(true);
            })
            .catch(() => undefined);
        return () => { active = false; };
        // Asked once per sign-in: the answer must not reopen the setup while it is being filled.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [eligible, userId]);

    if (!open || !userId) return null;

    const close = () => {
        markDone(userId);
        setOpen(false);
    };

    const save = async () => {
        setSaving(true);
        setError('');
        try {
            const named = people.filter((person) => person.name.trim());
            for (const [index, person] of named.entries()) {
                await api.post('/api/family', {
                    name: person.name.trim(),
                    role: person.role,
                    color: COLORS[index % COLORS.length],
                    birthdate: person.birthdate || null,
                });
            }
            if ([...hidden].sort().join() !== [...disabledModules].sort().join()) {
                await updateDisabledModules(hidden);
            }
            // Saved: whatever happens next, it is not asked again.
            markDone(userId);
            setStep(STEPS.length - 1);
        } catch {
            setError(t('setup:error'));
        } finally {
            setSaving(false);
        }
    };

    const current = STEPS[step];
    const themes: Array<{ value: 'light' | 'dark' | 'system'; label: string; icon: typeof Sun }> = [
        { value: 'light', label: t('settings:appearance.themeLight'), icon: Sun },
        { value: 'dark', label: t('settings:appearance.themeDark'), icon: Moon },
        { value: 'system', label: t('settings:appearance.themeSystem'), icon: Monitor },
    ];
    const roles = [
        { value: 'Parent', label: t('family:roles.Parent') },
        { value: 'Enfant', label: t('family:roles.Enfant') },
    ];
    const setPerson = (index: number, change: Partial<Person>) =>
        setPeople((prev) => prev.map((person, i) => (i === index ? { ...person, ...change } : person)));

    return (
        <div className="fixed inset-0 z-[70] overflow-y-auto bg-background/95 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="setup-title">
            <div className="mx-auto flex min-h-full max-w-2xl flex-col justify-center px-4 py-8">
                <div className="rounded-card border border-border bg-card p-6 shadow-surface-hover sm:p-8">
                    <div className="mb-6 flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <img src={`${import.meta.env.BASE_URL}OpenFamily.png`} alt="" className="h-9 w-9 object-contain" />
                            {/* Where one is in the setup: a dot per step. */}
                            <ol className="flex items-center gap-1.5" aria-label={t('setup:step', { current: step + 1, total: STEPS.length })}>
                                {STEPS.map((name, index) => (
                                    <li key={name} className={`h-1.5 rounded-full transition-all ${index === step ? 'w-6 bg-primary' : index < step ? 'w-1.5 bg-primary/60' : 'w-1.5 bg-border-strong'}`} />
                                ))}
                            </ol>
                        </div>
                        {current !== 'done' && (
                            <button type="button" onClick={close} className="text-caption font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
                                {t('setup:actions.skip')}
                            </button>
                        )}
                    </div>

                    {current === 'welcome' && (
                        <div className="space-y-5">
                            <div>
                                <h2 id="setup-title" className="font-serif text-h1 text-foreground">{t('setup:welcome.title', { name: (user?.name || '').trim().split(/\s+/)[0] })}</h2>
                                <p className="mt-2 text-body text-muted-foreground">{t('setup:welcome.text')}</p>
                            </div>
                            <div>
                                <p className="mb-1.5 text-caption font-medium text-foreground">{t('setup:welcome.language')}</p>
                                <LanguageSwitcher />
                            </div>
                            <div role="radiogroup" aria-label={t('settings:appearance.theme')}>
                                <p className="mb-1.5 text-caption font-medium text-foreground">{t('settings:appearance.theme')}</p>
                                <div className="inline-flex flex-wrap gap-1 rounded-input border border-border bg-surface-2 p-1">
                                    {themes.map((option) => {
                                        const Icon = option.icon;
                                        const active = option.value === theme;
                                        return (
                                            <button
                                                key={option.value}
                                                type="button"
                                                role="radio"
                                                aria-checked={active}
                                                onClick={() => setTheme(option.value)}
                                                className={`flex items-center gap-1.5 rounded-input px-3 py-1.5 text-caption font-medium transition-colors ${active ? 'bg-card text-foreground shadow-surface' : 'text-muted-foreground hover:text-foreground'}`}
                                            >
                                                <Icon className="h-4 w-4" />
                                                {option.label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    )}

                    {current === 'family' && (
                        <div className="space-y-5">
                            <div>
                                <h2 id="setup-title" className="font-serif text-h1 text-foreground">{t('setup:family.title')}</h2>
                                <p className="mt-2 text-body text-muted-foreground">{t('setup:family.text')}</p>
                            </div>
                            <ul className="space-y-3">
                                {people.map((person, index) => (
                                    <li key={index} className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2 rounded-input border border-border p-3 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.2fr)_auto]">
                                        <div className="col-span-2 sm:col-span-1">
                                            <Input
                                                id={`setup-name-${index}`}
                                                label={t('common:labels.name')}
                                                value={person.name}
                                                onChange={(e) => setPerson(index, { name: e.target.value })}
                                                placeholder={t('setup:family.namePlaceholder')}
                                                maxLength={100}
                                            />
                                        </div>
                                        <div className="col-span-2 sm:col-span-1">
                                            <Select value={person.role} onValueChange={(value) => setPerson(index, { role: value as Person['role'] })} options={roles} />
                                        </div>
                                        <div className="min-w-0">
                                            <DatePicker label={t('setup:family.birthdate')} type="date" value={person.birthdate} onChange={(value) => setPerson(index, { birthdate: value })} />
                                        </div>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            aria-label={t('setup:family.remove')}
                                            disabled={people.length === 1}
                                            onClick={() => setPeople((prev) => prev.filter((_, i) => i !== index))}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </li>
                                ))}
                            </ul>
                            <Button type="button" variant="secondary" onClick={() => setPeople((prev) => [...prev, { name: '', role: 'Enfant', birthdate: '' }])}>
                                <Plus className="mr-1 h-4 w-4" />
                                {t('setup:family.add')}
                            </Button>
                        </div>
                    )}

                    {current === 'modules' && (
                        <div className="space-y-5">
                            <div>
                                <h2 id="setup-title" className="font-serif text-h1 text-foreground">{t('setup:modules.title')}</h2>
                                <p className="mt-2 text-body text-muted-foreground">{t('setup:modules.text')}</p>
                            </div>
                            <ul className="grid gap-2 sm:grid-cols-2">
                                {MODULES.map((module) => {
                                    const enabled = !hidden.includes(module.key);
                                    return (
                                        <li key={module.key}>
                                            <label className={`flex cursor-pointer items-start gap-3 rounded-input border p-3 transition-colors ${enabled ? 'border-primary/40 bg-primary-soft/40' : 'border-border'}`}>
                                                <input
                                                    type="checkbox"
                                                    className="mt-0.5 h-4 w-4 accent-[rgb(var(--primary))]"
                                                    checked={enabled}
                                                    onChange={(e) => setHidden((prev) => (e.target.checked ? prev.filter((key) => key !== module.key) : [...prev, module.key]))}
                                                />
                                                <span className="min-w-0">
                                                    <span className="block text-caption font-semibold text-foreground">{t(module.labelKey)}</span>
                                                    <span className="block text-micro text-muted-foreground">{t(module.descKey)}</span>
                                                </span>
                                            </label>
                                        </li>
                                    );
                                })}
                            </ul>
                            {error && <p className="rounded-input border border-danger/30 bg-danger/10 px-3 py-2 text-caption text-danger">{error}</p>}
                        </div>
                    )}

                    {current === 'done' && (
                        <div className="space-y-5">
                            <div>
                                <h2 id="setup-title" className="flex items-center gap-2 font-serif text-h1 text-foreground">
                                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground"><Check className="h-5 w-5" /></span>
                                    {t('setup:done.title')}
                                </h2>
                                <p className="mt-2 text-body text-muted-foreground">{t('setup:done.text')}</p>
                            </div>
                            <ul className="space-y-3">
                                {[
                                    { icon: UserPlus, text: t('setup:done.tipInvite') },
                                    { icon: Smartphone, text: t('setup:done.tipPhone') },
                                    { icon: Home, text: t('setup:done.tipHome') },
                                ].map((tip) => (
                                    <li key={tip.text} className="flex items-start gap-3 text-caption text-foreground">
                                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-input bg-primary-soft text-primary"><tip.icon className="h-4 w-4" /></span>
                                        <span className="pt-1.5">{tip.text}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    <div className="mt-8 flex items-center justify-between gap-3">
                        {step > 0 && current !== 'done' ? (
                            <Button type="button" variant="ghost" onClick={() => setStep(step - 1)} disabled={saving}>
                                <ArrowLeft className="mr-1 h-4 w-4" />
                                {t('setup:actions.back')}
                            </Button>
                        ) : <span />}
                        {current === 'done' ? (
                            <Button type="button" onClick={close}>{t('setup:actions.open')}</Button>
                        ) : current === 'modules' ? (
                            <Button type="button" onClick={() => { void save(); }} disabled={saving}>{t('setup:actions.finish')}</Button>
                        ) : (
                            <Button type="button" onClick={() => setStep(step + 1)}>
                                {t('setup:actions.next')}
                                <ArrowRight className="ml-1 h-4 w-4" />
                            </Button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default WelcomeSetup;
