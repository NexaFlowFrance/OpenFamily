import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    Check,
    CheckCheck,
    Edit2,
    ExternalLink,
    ImagePlus,
    MessageSquare,
    Send,
    Trash2,
    X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { useWebSocketUpdates } from '../hooks/useWebSocketUpdates';

interface SeenPerson {
    id: string;
    name: string;
    seen_at: string;
}

interface FamilyPost {
    id: string;
    author_user_id: string;
    author_name: string;
    author_avatar?: string | null;
    content?: string | null;
    image_url?: string | null;
    link_url?: string | null;
    created_at: string;
    updated_at: string;
    seen_by: SeenPerson[];
    is_seen: boolean;
    is_own: boolean;
}

const MAX_DATA_URL = 1_500_000;

const normalizeLink = (value: string): string => {
    const clean = value.trim();

    if (!clean) return '';

    return /^https?:\/\//i.test(clean)
        ? clean
        : `https://${clean}`;
};

const prepareImage = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
        if (!file.type.startsWith('image/')) {
            reject(new Error('INVALID_IMAGE'));
            return;
        }

        const reader = new FileReader();

        reader.onerror = () => reject(new Error('READ_ERROR'));

        reader.onload = () => {
            const image = new Image();

            image.onerror = () =>
                reject(new Error('INVALID_IMAGE'));

            image.onload = () => {
                const maxSide = 1280;
                const scale = Math.min(
                    1,
                    maxSide / Math.max(image.width, image.height)
                );

                const canvas = document.createElement('canvas');
                canvas.width = Math.max(
                    1,
                    Math.round(image.width * scale)
                );
                canvas.height = Math.max(
                    1,
                    Math.round(image.height * scale)
                );

                const ctx = canvas.getContext('2d');

                if (!ctx) {
                    reject(new Error('IMAGE_ERROR'));
                    return;
                }

                ctx.drawImage(
                    image,
                    0,
                    0,
                    canvas.width,
                    canvas.height
                );

                const dataUrl = canvas.toDataURL(
                    'image/jpeg',
                    0.76
                );

                if (dataUrl.length > MAX_DATA_URL) {
                    reject(new Error('IMAGE_TOO_LARGE'));
                    return;
                }

                resolve(dataUrl);
            };

            image.src = String(reader.result);
        };

        reader.readAsDataURL(file);
    });

const Posts: React.FC = () => {
    const { t } = useTranslation('nav');

    const [posts, setPosts] = useState<FamilyPost[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const [content, setContent] = useState('');
    const [imageUrl, setImageUrl] = useState('');
    const [linkUrl, setLinkUrl] = useState('');
    const [editingId, setEditingId] =
        useState<string | null>(null);

    const fileInput = useRef<HTMLInputElement>(null);
    const composerRef = useRef<HTMLDivElement>(null);

    const loadPosts = useCallback(async () => {
        try {
            const response = await api.get<{
                success: boolean;
                data: FamilyPost[];
            }>('/api/posts');

            if (response.success) {
                setPosts(response.data);
            }
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : t('posts.errors.load')
            );
        } finally {
            setLoading(false);
        }
    }, [t]);

    useEffect(() => {
        void loadPosts();
    }, [loadPosts]);

    useWebSocketUpdates('posts', () => {
        void loadPosts();
    });

    const resetComposer = () => {
        setContent('');
        setImageUrl('');
        setLinkUrl('');
        setEditingId(null);
        setError('');

        if (fileInput.current) {
            fileInput.current.value = '';
        }
    };

    const choosePhoto = async (file?: File) => {
        if (!file) return;

        setError('');

        try {
            setImageUrl(await prepareImage(file));
        } catch (err) {
            setError(
                err instanceof Error &&
                    err.message === 'IMAGE_TOO_LARGE'
                    ? t('posts.errors.imageTooLarge')
                    : t('posts.errors.image')
            );
        }
    };

    const save = async () => {
        const payload = {
            content: content.trim() || null,
            image_url: imageUrl || null,
            link_url: normalizeLink(linkUrl) || null,
        };

        if (
            !payload.content &&
            !payload.image_url &&
            !payload.link_url
        ) {
            setError(t('posts.errors.empty'));
            return;
        }

        setSaving(true);
        setError('');

        try {
            if (editingId) {
                await api.put(
                    `/api/posts/${editingId}`,
                    payload
                );
            } else {
                await api.post('/api/posts', payload);
            }

            resetComposer();
            await loadPosts();
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : t('posts.errors.save')
            );
        } finally {
            setSaving(false);
        }
    };

    const edit = (post: FamilyPost) => {
        setEditingId(post.id);
        setContent(post.content || '');
        setImageUrl(post.image_url || '');
        setLinkUrl(post.link_url || '');
        setError('');

        window.setTimeout(() => {
            composerRef.current?.scrollIntoView({
                behavior: 'smooth',
                block: 'start',
            });
        }, 0);
    };

    const remove = async (post: FamilyPost) => {
        if (!window.confirm(t('posts.confirmDelete'))) {
            return;
        }

        try {
            await api.delete(`/api/posts/${post.id}`);

            if (editingId === post.id) {
                resetComposer();
            }

            await loadPosts();
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : t('posts.errors.delete')
            );
        }
    };

    const markSeen = async (post: FamilyPost) => {
        if (post.is_seen) return;

        try {
            await api.post(`/api/posts/${post.id}/seen`, {});
            await loadPosts();
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : t('posts.errors.seen')
            );
        }
    };

    const formatWhen = (value: string) =>
        new Intl.DateTimeFormat(undefined, {
            dateStyle: 'medium',
            timeStyle: 'short',
        }).format(new Date(value));

    if (loading) {
        return (
            <div className="flex min-h-[40vh] items-center justify-center">
                <div className="spinner-brand" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="font-serif text-h1">
                    {t('posts.title')}
                </h1>
                <p className="mt-1 text-body text-muted-foreground">
                    {t('posts.subtitle')}
                </p>
            </div>

            <div
                ref={composerRef}
                className="rounded-card border border-border bg-card p-5 shadow-sm sm:p-6"
            >
                <div className="mb-4 flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-soft text-primary">
                        <MessageSquare className="h-5 w-5" />
                    </div>

                    <div>
                        <h2 className="font-semibold text-foreground">
                            {editingId
                                ? t('posts.editPost')
                                : t('posts.newPost')}
                        </h2>

                        {editingId && (
                            <p className="text-micro text-muted-foreground">
                                {t('posts.editing')}
                            </p>
                        )}
                    </div>
                </div>

                <textarea
                    value={content}
                    onChange={(e) =>
                        setContent(e.target.value)
                    }
                    maxLength={5000}
                    rows={4}
                    placeholder={t('posts.placeholder')}
                    className="input-nexus min-h-[110px] resize-y"
                />

                {imageUrl && (
                    <div className="relative mt-4 overflow-hidden rounded-card border border-border">
                        <img
                            src={imageUrl}
                            alt={t('posts.photoPreview')}
                            className="max-h-[420px] w-full bg-surface-2 object-contain"
                        />

                        <button
                            type="button"
                            onClick={() => setImageUrl('')}
                            className="absolute right-2 top-2 rounded-full bg-background/90 p-2 shadow"
                            aria-label={t(
                                'posts.removePhoto'
                            )}
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                )}

                <input
                    value={linkUrl}
                    onChange={(e) =>
                        setLinkUrl(e.target.value)
                    }
                    placeholder={t(
                        'posts.linkPlaceholder'
                    )}
                    className="input-nexus mt-4"
                />

                {error && (
                    <p className="mt-3 text-caption text-danger">
                        {error}
                    </p>
                )}

                <input
                    ref={fileInput}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                        void choosePhoto(
                            e.target.files?.[0]
                        );
                    }}
                />

                <div className="mt-4 flex flex-wrap items-center gap-2">
                    <button
                        type="button"
                        disabled={saving}
                        onClick={() =>
                            fileInput.current?.click()
                        }
                        className="inline-flex min-h-[40px] items-center rounded-input border border-border bg-surface-2 px-4 text-caption font-medium hover:bg-surface-3 disabled:opacity-50"
                    >
                        <ImagePlus className="mr-2 h-4 w-4" />
                        {t('posts.addPhoto')}
                    </button>

                    <div className="flex-1" />

                    {editingId && (
                        <button
                            type="button"
                            disabled={saving}
                            onClick={resetComposer}
                            className="min-h-[40px] rounded-input px-4 text-caption font-medium text-muted-foreground hover:bg-surface-2"
                        >
                            {t('posts.cancel')}
                        </button>
                    )}

                    <button
                        type="button"
                        disabled={
                            saving ||
                            (!content.trim() &&
                                !imageUrl &&
                                !linkUrl.trim())
                        }
                        onClick={() => void save()}
                        className="inline-flex min-h-[40px] items-center rounded-input bg-primary px-4 text-caption font-semibold text-primary-foreground disabled:opacity-50"
                    >
                        <Send className="mr-2 h-4 w-4" />
                        {editingId
                            ? t('posts.saveChanges')
                            : t('posts.post')}
                    </button>
                </div>
            </div>

            {posts.length === 0 ? (
                <div className="rounded-card border border-dashed border-border p-10 text-center">
                    <MessageSquare className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
                    <p className="font-medium text-muted-foreground">
                        {t('posts.empty')}
                    </p>
                    <p className="mt-1 text-caption text-muted-foreground">
                        {t('posts.emptySubtitle')}
                    </p>
                </div>
            ) : (
                <div className="space-y-4">
                    {posts.map((post) => (
                        <article
                            key={post.id}
                            className={`rounded-card border p-5 shadow-sm sm:p-6 ${
                                post.is_seen
                                    ? 'border-border bg-card'
                                    : 'border-primary/30 bg-primary-soft/10'
                            }`}
                        >
                            <div className="flex items-start gap-3">
                                {post.author_avatar ? (
                                    <img
                                        src={
                                            post.author_avatar
                                        }
                                        alt={post.author_name}
                                        className="h-10 w-10 shrink-0 rounded-full object-cover"
                                    />
                                ) : (
                                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-soft font-semibold text-primary">
                                        {post.author_name.charAt(
                                            0
                                        ) || '?'}
                                    </div>
                                )}

                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-start justify-between gap-2">
                                        <div>
                                            <p className="font-semibold text-foreground">
                                                {
                                                    post.author_name
                                                }
                                            </p>

                                            <p className="text-micro text-muted-foreground">
                                                {formatWhen(
                                                    post.created_at
                                                )}
                                                {post.updated_at !==
                                                    post.created_at &&
                                                    ` · ${t(
                                                        'posts.edited'
                                                    )}`}
                                            </p>
                                        </div>

                                        {post.is_own && (
                                            <div className="flex items-center gap-1">
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        edit(post)
                                                    }
                                                    className="rounded-input p-2 text-muted-foreground hover:bg-surface-2"
                                                    aria-label={t(
                                                        'posts.edit'
                                                    )}
                                                >
                                                    <Edit2 className="h-4 w-4" />
                                                </button>

                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        void remove(
                                                            post
                                                        )
                                                    }
                                                    className="rounded-input p-2 text-danger/70 hover:bg-danger/10"
                                                    aria-label={t(
                                                        'posts.delete'
                                                    )}
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    {post.content && (
                                        <p className="mt-4 whitespace-pre-wrap break-words text-body text-foreground">
                                            {post.content}
                                        </p>
                                    )}

                                    {post.image_url && (
                                        <img
                                            src={post.image_url}
                                            alt={t(
                                                'posts.sharedPhoto'
                                            )}
                                            className="mt-4 max-h-[600px] w-full rounded-card border border-border bg-surface-2 object-contain"
                                        />
                                    )}

                                    {post.link_url && (
                                        <a
                                            href={post.link_url}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="mt-4 flex min-w-0 items-center gap-2 rounded-input border border-border bg-surface-2 px-3 py-2 text-caption text-primary hover:underline"
                                        >
                                            <ExternalLink className="h-4 w-4 shrink-0" />
                                            <span className="truncate">
                                                {
                                                    post.link_url
                                                }
                                            </span>
                                        </a>
                                    )}

                                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
                                        <p className="text-micro text-muted-foreground">
                                            {post.seen_by.length
                                                ? t(
                                                      'posts.seenBy',
                                                      {
                                                          names: post.seen_by
                                                              .map(
                                                                  (
                                                                      person
                                                                  ) =>
                                                                      person.name
                                                              )
                                                              .join(
                                                                  ', '
                                                              ),
                                                      }
                                                  )
                                                : t(
                                                      'posts.notSeen'
                                                  )}
                                        </p>

                                        <button
                                            type="button"
                                            disabled={
                                                post.is_seen
                                            }
                                            onClick={() =>
                                                void markSeen(
                                                    post
                                                )
                                            }
                                            className={`inline-flex items-center gap-1.5 rounded-input px-3 py-1.5 text-caption font-medium ${
                                                post.is_seen
                                                    ? 'text-success'
                                                    : 'bg-primary-soft text-primary hover:bg-primary/15'
                                            }`}
                                        >
                                            {post.is_seen ? (
                                                <CheckCheck className="h-4 w-4" />
                                            ) : (
                                                <Check className="h-4 w-4" />
                                            )}

                                            {post.is_seen
                                                ? t(
                                                      'posts.seen'
                                                  )
                                                : t(
                                                      'posts.markSeen'
                                                  )}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </article>
                    ))}
                </div>
            )}
        </div>
    );
};

export default Posts;
