import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import { api } from '../../lib/api';
import { Button } from '../ui/Button';
import { cn } from '../../lib/utils';

// Which photos of the family's Immich the kiosk and its screensaver may show.
// A family library also holds screenshots, scans and private pictures: the
// wall display can be kept to the favourites, or to chosen albums.

type Source = 'all' | 'favorites' | 'albums';
interface Album { id: string; name: string; count: number }
interface Choice { source: Source; albumIds: string[] }

const SOURCES: Source[] = ['all', 'favorites', 'albums'];

const ImmichPhotosPanel: React.FC = () => {
    const { t } = useTranslation(['integrations', 'common']);
    const [albums, setAlbums] = useState<Album[] | null>(null);
    const [saved, setSaved] = useState<Choice>({ source: 'all', albumIds: [] });
    const [source, setSource] = useState<Source>('all');
    const [albumIds, setAlbumIds] = useState<string[]>([]);
    const [failed, setFailed] = useState(false);
    const [saving, setSaving] = useState(false);
    const [status, setStatus] = useState<'saved' | 'error' | null>(null);

    useEffect(() => {
        let cancelled = false;
        api.get<{ success: boolean; data: Choice & { albums: Album[] } }>('/api/integrations/immich/albums')
            .then((res) => {
                if (cancelled) return;
                setAlbums(res.data.albums);
                setSaved({ source: res.data.source, albumIds: res.data.albumIds });
                setSource(res.data.source);
                setAlbumIds(res.data.albumIds);
            })
            .catch(() => { if (!cancelled) setFailed(true); });
        return () => { cancelled = true; };
    }, []);

    const toggle = (id: string) => {
        setStatus(null);
        setAlbumIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    };

    const changed = source !== saved.source
        || (source === 'albums' && (albumIds.length !== saved.albumIds.length || albumIds.some((id) => !saved.albumIds.includes(id))));
    const incomplete = source === 'albums' && albumIds.length === 0;
    // An album chosen earlier and deleted since in Immich.
    const gone = albums ? albumIds.filter((id) => !albums.some((album) => album.id === id)) : [];

    const save = async () => {
        setSaving(true);
        setStatus(null);
        try {
            const res = await api.put<{ success: boolean; data: Choice }>('/api/integrations/immich/photos', {
                source,
                albumIds: source === 'albums' ? albumIds : [],
            });
            setSaved(res.data);
            setAlbumIds(res.data.albumIds);
            setStatus('saved');
        } catch {
            setStatus('error');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="border-t border-border bg-surface-2/40 px-5 py-4">
            <p className="text-caption font-semibold text-foreground">{t('integrations:immichPhotos.title')}</p>
            <p className="mt-0.5 text-micro text-muted-foreground">{t('integrations:immichPhotos.hint')}</p>

            {failed ? (
                <p className="mt-3 text-micro text-danger">{t('integrations:immichPhotos.unreachable')}</p>
            ) : albums === null ? (
                <p className="mt-3 text-micro text-muted-foreground">{t('common:states.loading')}</p>
            ) : (
                <>
                    <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label={t('integrations:immichPhotos.title')}>
                        {SOURCES.map((value) => (
                            <button
                                key={value}
                                type="button"
                                role="radio"
                                aria-checked={source === value}
                                onClick={() => { setSource(value); setStatus(null); }}
                                className={cn(
                                    'min-h-9 whitespace-nowrap rounded-pill border px-3 py-1 text-caption transition-colors',
                                    source === value
                                        ? 'border-primary bg-primary-soft text-primary'
                                        : 'border-border bg-card text-foreground hover:border-border-strong',
                                )}
                            >
                                {t(`integrations:immichPhotos.sources.${value}`)}
                            </button>
                        ))}
                    </div>

                    {source === 'albums' && (
                        albums.length === 0 ? (
                            <p className="mt-3 text-micro text-muted-foreground">{t('integrations:immichPhotos.noAlbums')}</p>
                        ) : (
                            <ul className="mt-3 grid max-h-64 grid-cols-[repeat(auto-fill,minmax(min(100%,14rem),1fr))] gap-2 overflow-y-auto">
                                {albums.map((album) => {
                                    const chosen = albumIds.includes(album.id);
                                    return (
                                        <li key={album.id}>
                                            <button
                                                type="button"
                                                role="checkbox"
                                                aria-checked={chosen}
                                                onClick={() => toggle(album.id)}
                                                className={cn(
                                                    'flex w-full items-center gap-2 rounded-input border px-3 py-2 text-left transition-colors',
                                                    chosen ? 'border-primary bg-primary-soft' : 'border-border bg-card hover:border-border-strong',
                                                )}
                                            >
                                                <span className={cn(
                                                    'flex h-5 w-5 shrink-0 items-center justify-center rounded border',
                                                    chosen ? 'border-primary bg-primary text-primary-foreground' : 'border-border-strong',
                                                )}>
                                                    {chosen && <Check className="h-3.5 w-3.5" />}
                                                </span>
                                                <span className="min-w-0 flex-1 truncate text-caption text-foreground">
                                                    {album.name || t('integrations:immichPhotos.unnamed')}
                                                </span>
                                                <span className="shrink-0 text-micro text-muted-foreground">{album.count}</span>
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        )
                    )}

                    {source === 'albums' && gone.length > 0 && (
                        <p className="mt-2 text-micro text-warning">{t('integrations:immichPhotos.gone', { count: gone.length })}</p>
                    )}

                    <div className="mt-3 flex flex-wrap items-center gap-3">
                        <Button type="button" size="sm" disabled={saving || !changed || incomplete} onClick={() => { void save(); }}>
                            {t('common:actions.save')}
                        </Button>
                        {incomplete && <span className="text-micro text-muted-foreground">{t('integrations:immichPhotos.pickOne')}</span>}
                        {status === 'saved' && <span className="text-micro text-success" role="status">{t('integrations:immichPhotos.saved')}</span>}
                        {status === 'error' && <span className="text-micro text-danger" role="alert">{t('integrations:immichPhotos.error')}</span>}
                    </div>
                </>
            )}
        </div>
    );
};

export default ImmichPhotosPanel;
