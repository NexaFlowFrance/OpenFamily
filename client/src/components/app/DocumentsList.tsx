import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    FileText,
    Image as ImageIcon,
    File as FileIcon,
    Download,
    Eye,
    Trash2,
    Plus,
    Paperclip,
} from 'lucide-react';
import { Button } from '../ui/Button';
import {
    documentFileUrl,
    formatFileSize,
    isPdf,
    isPreviewableImage,
    useDeleteDocument,
    useDocuments,
    type DocumentEntityType,
    type HouseDocument,
} from '../../hooks/useDocuments';
import DocumentUploadDialog from './DocumentUploadDialog';

// =============================================================================
// DocumentsList
//
// Reusable: pass an entity (type+id+label) to scope the list to that entity
// and pre-fix uploads. Pass nothing to render all docs (used by the
// standalone Documents tab).
// =============================================================================

interface Props {
    entityType?: DocumentEntityType;
    entityId?: string;
    entityLabel?: string;
    /** Render mode — full = card grid, compact = horizontal pills. */
    mode?: 'full' | 'compact';
    /** Hide the "Add document" button (e.g., when showing read-only list). */
    hideAdd?: boolean;
}

const DocumentsList: React.FC<Props> = ({
    entityType,
    entityId,
    entityLabel,
    mode = 'full',
    hideAdd = false,
}) => {
    const { t } = useTranslation();
    const filters =
        entityType && entityId ? { entity_type: entityType, entity_id: entityId } : undefined;
    const docsQuery = useDocuments(filters);
    const deleteMut = useDeleteDocument();
    const [uploadOpen, setUploadOpen] = useState(false);

    const handleDelete = async (doc: HouseDocument) => {
        if (!confirm(t('house.documents.deleteConfirm', { name: doc.name }))) return;
        try {
            await deleteMut.mutateAsync(doc.id);
        } catch (err) {
            alert(err instanceof Error ? err.message : t('house.common.deleteFailed'));
        }
    };

    const docs = docsQuery.data ?? [];

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
                <p className="text-caption font-semibold flex items-center gap-2">
                    <Paperclip className="h-4 w-4" />
                    {t('house.documents.title')}
                    {docs.length > 0 && (
                        <span className="text-micro text-muted-foreground font-normal">
                            ({docs.length})
                        </span>
                    )}
                </p>
                {!hideAdd && (
                    <Button size="sm" variant="secondary" onClick={() => setUploadOpen(true)}>
                        <Plus className="h-4 w-4 mr-1.5" />
                        {t('house.documents.documentShort')}
                    </Button>
                )}
            </div>

            {docsQuery.isPending ? (
                <p className="text-micro text-muted-foreground italic">{t('common.loading')}</p>
            ) : docs.length === 0 ? (
                <p className="text-micro text-muted-foreground italic">
                    {entityType
                        ? t('house.documents.noneAttached')
                        : t('house.documents.noneGeneric')}
                </p>
            ) : mode === 'compact' ? (
                <div className="flex flex-wrap gap-2">
                    {docs.map((doc) => (
                        <DocumentChip key={doc.id} doc={doc} onDelete={() => handleDelete(doc)} />
                    ))}
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {docs.map((doc) => (
                        <DocumentCard key={doc.id} doc={doc} onDelete={() => handleDelete(doc)} />
                    ))}
                </div>
            )}

            <DocumentUploadDialog
                open={uploadOpen}
                onOpenChange={setUploadOpen}
                boundEntity={
                    entityType && entityId
                        ? { type: entityType, id: entityId, label: entityLabel }
                        : null
                }
            />
        </div>
    );
};

const iconForMime = (mime: string) => {
    if (isPdf(mime)) return FileText;
    if (isPreviewableImage(mime)) return ImageIcon;
    return FileIcon;
};

const DocumentCard: React.FC<{ doc: HouseDocument; onDelete: () => void }> = ({
    doc,
    onDelete,
}) => {
    const { t } = useTranslation();
    const Icon = iconForMime(doc.mime_type);
    const isImage = isPreviewableImage(doc.mime_type);
    return (
        <div className="rounded-card border border-border bg-card overflow-hidden">
            {isImage ? (
                <a
                    href={documentFileUrl(doc.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block h-32 bg-surface-2"
                >
                    <img
                        src={documentFileUrl(doc.id)}
                        alt={doc.name}
                        className="h-full w-full object-cover"
                        onError={(e) => {
                            (e.currentTarget as HTMLImageElement).style.display = 'none';
                        }}
                    />
                </a>
            ) : (
                <a
                    href={documentFileUrl(doc.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex h-32 items-center justify-center bg-surface-2 hover:bg-surface-2/80"
                >
                    <Icon className="h-12 w-12 text-muted-foreground" />
                </a>
            )}
            <div className="p-3 space-y-1">
                <p className="text-caption font-semibold truncate">{doc.name}</p>
                <p className="text-micro text-muted-foreground truncate">
                    {t('domain.documentCategory.' + doc.category, { defaultValue: doc.category })} ·{' '}
                    {formatFileSize(doc.file_size)}
                </p>
                <div className="flex gap-1 pt-1">
                    <a
                        href={documentFileUrl(doc.id)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1 rounded hover:bg-surface-2 text-muted-foreground"
                        aria-label={t('house.documents.preview')}
                        title={t('house.documents.preview')}
                    >
                        <Eye className="h-4 w-4" />
                    </a>
                    <a
                        href={documentFileUrl(doc.id, { download: true })}
                        className="p-1 rounded hover:bg-surface-2 text-muted-foreground"
                        aria-label={t('house.documents.download')}
                        title={t('house.documents.download')}
                    >
                        <Download className="h-4 w-4" />
                    </a>
                    <button
                        onClick={onDelete}
                        className="ml-auto p-1 rounded hover:bg-destructive/10 text-destructive"
                        aria-label={t('common.delete')}
                    >
                        <Trash2 className="h-4 w-4" />
                    </button>
                </div>
            </div>
        </div>
    );
};

const DocumentChip: React.FC<{ doc: HouseDocument; onDelete: () => void }> = ({
    doc,
    onDelete,
}) => {
    const { t } = useTranslation();
    const Icon = iconForMime(doc.mime_type);
    return (
        <div className="group inline-flex items-center gap-2 rounded-pill border border-border bg-card px-2.5 py-1 text-micro">
            <Icon className="h-3.5 w-3.5 text-muted-foreground" />
            <a
                href={documentFileUrl(doc.id)}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline truncate max-w-[160px]"
            >
                {doc.name}
            </a>
            <button
                onClick={onDelete}
                className="opacity-0 group-hover:opacity-100 transition-opacity text-destructive"
                aria-label={t('common.delete')}
            >
                <Trash2 className="h-3 w-3" />
            </button>
        </div>
    );
};

export default DocumentsList;
