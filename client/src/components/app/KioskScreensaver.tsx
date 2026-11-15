import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api';
import { formatTime, intlLocale } from '../../i18n/format';
import { cn } from '../../lib/utils';

export type ScreensaverStyle = 'photos' | 'clock';

// One photo a minute: the request goes out to the family's Immich through the
// server, which allows thirty outbound requests per quarter of an hour.
const PHOTO_INTERVAL_MS = 60_000;
// The clock reaches a new random spot in this time, then leaves for another.
const DRIFT_MS = 20_000;
// A mouse resting on a table moves by a pixel now and then: only a real
// movement wakes the display.
const WAKE_MOVE_PX = 12;

// Where the small clock sits over a photo: a new corner with each photo.
const CORNERS = ['left-8 top-8', 'right-8 top-8 text-right', 'right-8 bottom-8 text-right', 'left-8 bottom-8'];

const Photo: React.FC<{ url: string }> = ({ url }) => {
    const [visible, setVisible] = useState(false);
    useEffect(() => {
        // Double rAF so the opacity-0 frame is painted before the transition starts.
        let raf2 = 0;
        const raf1 = requestAnimationFrame(() => { raf2 = requestAnimationFrame(() => setVisible(true)); });
        return () => { cancelAnimationFrame(raf1); cancelAnimationFrame(raf2); };
    }, []);
    return (
        <div
            className="absolute inset-0 bg-black bg-contain bg-center bg-no-repeat transition-opacity duration-1000 ease-in-out"
            style={{ backgroundImage: `url(${url})`, opacity: visible ? 1 : 0 }}
        />
    );
};

/**
 * What the kiosk shows after a while without anyone touching it, so that a
 * display left on all day does not burn in: photos from the family's Immich,
 * or, without that integration (or when it does not answer), the time
 * wandering over a black screen. Nothing on it stays in place.
 *
 * A tap, a click, a key or a real mouse movement brings the display back, and
 * that gesture stops here: it never reaches what is underneath.
 */
const KioskScreensaver: React.FC<{ style: ScreensaverStyle; onWake: () => void }> = ({ style, onWake }) => {
    const { t } = useTranslation('kiosk');
    const [now, setNow] = useState(new Date());
    const [photos, setPhotos] = useState<{ id: number; url: string }[]>([]);
    const [corner, setCorner] = useState(0);
    const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
    const [gliding, setGliding] = useState(false);
    const clockRef = useRef<HTMLDivElement>(null);
    const photosRef = useRef(photos);
    photosRef.current = photos;
    const wakeRef = useRef(onWake);
    wakeRef.current = onWake;

    useEffect(() => {
        const id = setInterval(() => setNow(new Date()), 15_000);
        return () => clearInterval(id);
    }, []);

    // Keys, the wheel and the mouse. A tap or a click is taken by the overlay itself.
    useEffect(() => {
        let origin: { x: number; y: number } | null = null;
        const onMove = (event: PointerEvent) => {
            if (event.pointerType !== 'mouse') return;
            if (!origin) { origin = { x: event.clientX, y: event.clientY }; return; }
            if (Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > WAKE_MOVE_PX) wakeRef.current();
        };
        const onKey = (event: KeyboardEvent) => {
            // Enter or Space would also press whatever button still has the focus.
            event.preventDefault();
            event.stopPropagation();
            wakeRef.current();
        };
        const onWheel = () => wakeRef.current();
        window.addEventListener('pointermove', onMove);
        window.addEventListener('keydown', onKey, true);
        window.addEventListener('wheel', onWheel, { passive: true });
        return () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('keydown', onKey, true);
            window.removeEventListener('wheel', onWheel);
        };
    }, []);

    // Photos, when asked for. A failure (no Immich integration, the demo, a
    // server that does not answer) leaves the clock, and the next minute tries again.
    useEffect(() => {
        if (style !== 'photos') return undefined;
        let cancelled = false;
        const load = async () => {
            try {
                const blob = await api.getBlob('/api/integrations/immich/photo');
                if (cancelled) return;
                const url = URL.createObjectURL(blob);
                setPhotos((prev) => {
                    const next = [...prev, { id: Date.now(), url }];
                    while (next.length > 2) URL.revokeObjectURL(next.shift()!.url);
                    return next;
                });
                setCorner((current) => (current + 1) % CORNERS.length);
            } catch {
                if (cancelled) return;
                setPhotos((prev) => { prev.forEach((p) => URL.revokeObjectURL(p.url)); return []; });
            }
        };
        void load();
        const id = setInterval(() => void load(), PHOTO_INTERVAL_MS);
        return () => { cancelled = true; clearInterval(id); };
    }, [style]);
    useEffect(() => () => { photosRef.current.forEach((p) => URL.revokeObjectURL(p.url)); }, []);

    const showPhotos = photos.length > 0;

    // The wandering clock: a first spot at once, then a slow glide from spot to
    // spot. With reduced motion it jumps once a minute instead, which protects
    // the screen just as well.
    useEffect(() => {
        if (showPhotos) return undefined;
        const reduced = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const place = () => {
            const element = clockRef.current;
            if (!element) return;
            const maxX = Math.max(0, window.innerWidth - element.offsetWidth);
            const maxY = Math.max(0, window.innerHeight - element.offsetHeight);
            setPosition({ x: Math.round(Math.random() * maxX), y: Math.round(Math.random() * maxY) });
        };
        place();
        const start = window.setTimeout(() => { setGliding(!reduced); place(); }, 100);
        const id = window.setInterval(place, reduced ? 60_000 : DRIFT_MS);
        return () => {
            window.clearTimeout(start);
            window.clearInterval(id);
            setGliding(false);
            setPosition(null);
        };
    }, [showPhotos]);

    const time = formatTime(now);
    const date = new Intl.DateTimeFormat(intlLocale(), { weekday: 'long', day: 'numeric', month: 'long' }).format(now);

    return (
        <div
            role="button"
            tabIndex={-1}
            aria-label={t('screensaver.wake')}
            onClick={() => wakeRef.current()}
            data-testid="kiosk-screensaver"
            className="fixed inset-0 z-[60] cursor-none overflow-hidden bg-black animate-fade-in"
        >
            {showPhotos ? (
                <>
                    {photos.map((photo) => <Photo key={photo.id} url={photo.url} />)}
                    <div className={cn('absolute text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.8)]', CORNERS[corner])}>
                        <div className="font-serif text-[clamp(1.8rem,4vw,3.2rem)] font-semibold leading-none tabular-nums">{time}</div>
                        <p className="mt-1 text-[clamp(0.8rem,1.4vw,1.1rem)] capitalize text-white/85">{date}</p>
                    </div>
                </>
            ) : (
                <div
                    ref={clockRef}
                    data-testid="kiosk-screensaver-clock"
                    className="absolute left-0 top-0 whitespace-nowrap p-6 text-white/75"
                    style={{
                        transform: position ? `translate(${position.x}px, ${position.y}px)` : undefined,
                        transition: gliding ? `transform ${DRIFT_MS}ms linear` : 'none',
                        visibility: position ? 'visible' : 'hidden',
                    }}
                >
                    <div className="font-serif text-[clamp(3rem,11vw,8rem)] font-semibold leading-none tabular-nums">{time}</div>
                    <p className="mt-2 text-[clamp(1rem,2.2vw,1.6rem)] capitalize text-white/60">{date}</p>
                </div>
            )}
        </div>
    );
};

export default KioskScreensaver;
