import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, X, StickyNote } from 'lucide-react';
import { api } from '../../lib/api';
import { cn } from '../../lib/utils';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { Textarea } from '../ui/Textarea';
import { useToast } from '../ui/Toast';

export interface FamilyNote {
    id: string;
    author_name: string;
    content: string;
    color: string;
    expires_at?: string | null;
    created_at: string;
}

export type NoteColor = 'yellow' | 'pink' | 'blue' | 'green' | 'orange';
export type NoteExpiry = 'today' | 'day' | 'week' | 'never';

const NOTE_COLORS: NoteColor[] = ['yellow', 'pink', 'blue', 'green', 'orange'];
const EXPIRY_OPTIONS: NoteExpiry[] = ['today', 'day', 'week', 'never'];
const MAX_CONTENT_LENGTH = 500;

const pad2 = (n: number) => String(n).padStart(2, '0');

// Expiry is computed CLIENT-side as a naive local "YYYY-MM-DDTHH:mm:ss" string
// (TIMESTAMP columns round-trip as naive local time) — the server stays dumb.
const computeExpiresAt = (choice: NoteExpiry): string | null => {
    if (choice === 'never') return null;
    const d = new Date();
    if (choice === 'today') {
        return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T23:59:59`;
    }
    d.setDate(d.getDate() + (choice === 'day' ? 1 : 7));
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
};

// Paper post-it look: pastel backgrounds with dark ink, in light AND dark mode.
const COLOR_CLASSES: Record<NoteColor, string> = {
    yellow: 'bg-amber-100 text-amber-950',
    pink: 'bg-pink-100 text-pink-950',
    blue: 'bg-sky-100 text-sky-950',
    green: 'bg-green-100 text-green-950',
    orange: 'bg-orange-100 text-orange-950',
};

const SWATCH_CLASSES: Record<NoteColor, string> = {
    yellow: 'bg-amber-200',
    pink: 'bg-pink-200',
    blue: 'bg-sky-200',
    green: 'bg-green-200',
    orange: 'bg-orange-200',
};

// Slight alternating tilt so the wall of notes feels hand-stuck, not gridded.
const ROTATIONS = ['-rotate-2', 'rotate-1', 'rotate-2', '-rotate-1'];

const colorOf = (note: FamilyNote): NoteColor =>
    (NOTE_COLORS as string[]).includes(note.color) ? (note.color as NoteColor) : 'yellow';

interface FamilyNotesProps {
    notes: FamilyNote[];
    /** 'full' = interactive (add + delete); 'kiosk' = display-only, bigger text */
    variant?: 'full' | 'kiosk';
    /** Called after a note was added or removed so the owner can reload */
    onChanged?: () => void;
    /** Kiosk only: when set, tapping a note dismisses it (the owner handles undo + delete) */
    onDismiss?: (note: FamilyNote) => void;
}

const FamilyNotes: React.FC<FamilyNotesProps> = ({ notes, variant = 'full', onChanged, onDismiss }) => {
    const { t } = useTranslation(['notes', 'common']);
    const { showToast } = useToast();
    const isKiosk = variant === 'kiosk';

    const [dialogOpen, setDialogOpen] = useState(false);
    const [content, setContent] = useState('');
    const [color, setColor] = useState<NoteColor>('yellow');
    const [expiresIn, setExpiresIn] = useState<NoteExpiry>('week');
    const [saving, setSaving] = useState(false);

    // Relative age — created_at is a naive local "YYYY-MM-DDTHH:mm:ss" string,
    // which new Date() parses as local time.
    const relativeAge = (iso: string): string => {
        const minutes = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60_000));
        if (minutes < 1) return t('notes:age.now');
        if (minutes < 60) return t('notes:age.minutes', { count: minutes });
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return t('notes:age.hours', { count: hours });
        return t('notes:age.days', { count: Math.floor(hours / 24) });
    };

    const openDialog = () => {
        setContent('');
        setColor('yellow');
        setExpiresIn('week');
        setDialogOpen(true);
    };

    const handleAdd = async () => {
        const cleaned = content.trim();
        if (!cleaned || saving) return;
        setSaving(true);
        try {
            await api.post('/api/notes', { content: cleaned, color, expires_at: computeExpiresAt(expiresIn) });
            setDialogOpen(false);
            showToast({ title: t('notes:added') });
            onChanged?.();
        } catch (e) {
            console.error('Add note error:', e);
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        try {
            await api.delete(`/api/notes/${id}`);
            showToast({ title: t('notes:deleted') });
            onChanged?.();
        } catch (e) {
            console.error('Delete note error:', e);
        }
    };

    return (
        <>
            <div className={cn(
                'grid gap-4',
                isKiosk
                    ? 'grid-cols-2 sm:grid-cols-3 xl:grid-cols-4'
                    : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4'
            )}>
                {notes.map((note, i) => {
                    const dismissible = isKiosk && !!onDismiss;
                    const cardClass = cn(
                        'group relative flex aspect-square flex-col rounded-[4px] p-4 text-left shadow-md transition-transform',
                        COLOR_CLASSES[colorOf(note)],
                        ROTATIONS[i % ROTATIONS.length],
                        !isKiosk && 'hover:rotate-0 hover:scale-[1.03]',
                        dismissible && 'active:scale-95'
                    );
                    const cardContent = (
                        <>
                            {!isKiosk && (
                                <button
                                    type="button"
                                    onClick={() => void handleDelete(note.id)}
                                    aria-label={t('notes:delete')}
                                    className="absolute right-1.5 top-1.5 rounded-full p-1 opacity-0 transition-opacity hover:bg-black/10 focus-visible:opacity-100 group-hover:opacity-100 group-active:opacity-100"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            )}
                            <p className={cn(
                                'min-h-0 flex-1 overflow-hidden whitespace-pre-wrap break-words font-serif italic leading-snug',
                                isKiosk ? 'text-[clamp(1.05rem,1.6vw,1.5rem)]' : 'text-[1.05rem]'
                            )}>
                                {note.content}
                            </p>
                            <p className={cn('mt-2 shrink-0 opacity-70', isKiosk ? 'text-caption' : 'text-micro')}>
                                {t('notes:by', { name: note.author_name })} · {relativeAge(note.created_at)}
                            </p>
                        </>
                    );
                    return dismissible ? (
                        <button
                            key={note.id}
                            type="button"
                            onClick={() => onDismiss?.(note)}
                            aria-label={t('notes:delete')}
                            className={cardClass}
                        >
                            {cardContent}
                        </button>
                    ) : (
                        <div key={note.id} className={cardClass}>
                            {cardContent}
                        </div>
                    );
                })}

                {/* Add tile (interactive variant only) */}
                {!isKiosk && (
                    <button
                        type="button"
                        onClick={openDialog}
                        className="flex aspect-square flex-col items-center justify-center gap-2 rounded-[4px] border-2 border-dashed border-border-strong p-4 text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                    >
                        <Plus className="h-6 w-6" />
                        <span className="text-caption font-medium">{t('notes:add')}</span>
                    </button>
                )}
            </div>

            {/* Subtle hint when the fridge is empty (interactive variant only) */}
            {!isKiosk && notes.length === 0 && (
                <p className="mt-3 flex items-center gap-2 text-caption text-muted-foreground">
                    <StickyNote className="h-4 w-4 shrink-0" />
                    {t('notes:emptyHint')}
                </p>
            )}

            {!isKiosk && (
                <Dialog open={dialogOpen} onOpenChange={setDialogOpen} title={t('notes:addTitle')}>
                    <div className="space-y-5">
                        <div>
                            <Textarea
                                value={content}
                                onChange={(e) => setContent(e.target.value.slice(0, MAX_CONTENT_LENGTH))}
                                placeholder={t('notes:placeholder')}
                                maxLength={MAX_CONTENT_LENGTH}
                                autoFocus
                            />
                            <p className="mt-1 text-right text-micro text-muted-foreground tabular-nums">
                                {t('notes:counter', { count: content.length, max: MAX_CONTENT_LENGTH })}
                            </p>
                        </div>

                        <div>
                            <p className="mb-1.5 text-caption font-medium text-foreground">{t('notes:colorLabel')}</p>
                            <div className="flex items-center gap-2.5">
                                {NOTE_COLORS.map((c) => (
                                    <button
                                        key={c}
                                        type="button"
                                        onClick={() => setColor(c)}
                                        aria-label={t(`notes:colors.${c}`)}
                                        aria-pressed={color === c}
                                        className={cn(
                                            'h-8 w-8 rounded-full transition-transform',
                                            SWATCH_CLASSES[c],
                                            color === c
                                                ? 'scale-110 ring-2 ring-primary ring-offset-2 ring-offset-card'
                                                : 'hover:scale-105'
                                        )}
                                    />
                                ))}
                            </div>
                        </div>

                        <div>
                            <p className="mb-1.5 text-caption font-medium text-foreground">{t('notes:expiryLabel')}</p>
                            <div className="flex flex-wrap gap-2">
                                {EXPIRY_OPTIONS.map((opt) => (
                                    <button
                                        key={opt}
                                        type="button"
                                        onClick={() => setExpiresIn(opt)}
                                        aria-pressed={expiresIn === opt}
                                        className={cn(
                                            'rounded-full border px-3.5 py-1.5 text-caption transition-colors',
                                            expiresIn === opt
                                                ? 'border-primary bg-primary-soft font-medium text-primary'
                                                : 'border-border text-muted-foreground hover:border-border-strong hover:text-foreground'
                                        )}
                                    >
                                        {t(`notes:expiry.${opt}`)}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="flex justify-end gap-3 pt-1">
                            <Button variant="secondary" onClick={() => setDialogOpen(false)}>
                                {t('notes:cancel')}
                            </Button>
                            <Button onClick={() => void handleAdd()} disabled={!content.trim() || saving}>
                                {t('notes:submit')}
                            </Button>
                        </div>
                    </div>
                </Dialog>
            )}
        </>
    );
};

export default FamilyNotes;
