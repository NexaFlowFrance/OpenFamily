import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useWebSocketUpdates } from '../hooks/useWebSocketUpdates';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../lib/api';
import { Plus, CheckSquare, Square, Trash2, Edit2, Filter, TrendingUp, Star, Hourglass, Check, X } from 'lucide-react';
import { Card, CardContent, Button, Dialog, Input, Select, Textarea, DatePicker, Badge, useToast } from '../components/ui';
import { format, parseISO } from 'date-fns';
import { dateLocale } from '../i18n/format';

interface Task {
    id: string;
    title: string;
    description?: string;
    is_completed: boolean;
    due_date?: string;
    frequency?: string;
    priority?: string;
    assigned_to?: string[];
    assigned_to_members?: Array<{ id: string; name: string; color: string }>;
    points?: number;
    pending_approval?: boolean;
    completed_at?: string;
    created_at: string;
}

interface FamilyMember {
    id: string;
    name: string;
    color: string;
}

interface TaskStats {
    total: number;
    completed: number;
    pending: number;
    completionRate: number;
    byPriority: {
        Haute: number;
        Moyenne: number;
        Basse: number;
    };
}

const Tasks: React.FC = () => {
    const { t } = useTranslation(['tasks', 'common']);
    const { user } = useAuth();
    const { showToast } = useToast();
    // Child accounts cannot grant points or approve chores.
    const isParent = Boolean(user?.is_owner) || user?.role !== 'enfant';
    const PRIORITIES = [
        { value: 'Haute', label: t('tasks:priorities.Haute') },
        { value: 'Moyenne', label: t('tasks:priorities.Moyenne') },
        { value: 'Basse', label: t('tasks:priorities.Basse') },
    ];
    const FREQUENCIES = [
        { value: 'Une fois', label: t('tasks:frequencies.Une fois') },
        { value: 'Quotidien', label: t('tasks:frequencies.Quotidien') },
        { value: 'Hebdomadaire', label: t('tasks:frequencies.Hebdomadaire') },
        { value: 'Mensuel', label: t('tasks:frequencies.Mensuel') },
        { value: 'Annuel', label: t('tasks:frequencies.Annuel') },
    ];
    const priorityLabel = (v?: string) => (v ? t(`tasks:priorities.${v}`, { defaultValue: v }) : '');
    const frequencyLabel = (v?: string) => (v ? t(`tasks:frequencies.${v}`, { defaultValue: v }) : '');
    const [tasks, setTasks] = useState<Task[]>([]);
    const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);
    const [stats, setStats] = useState<TaskStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingTask, setEditingTask] = useState<Task | null>(null);
    const [filterPriority, setFilterPriority] = useState<string>('');
    const [filterStatus, setFilterStatus] = useState<string>('all');
    const [filterMember, setFilterMember] = useState<string>('');
    const [error, setError] = useState('');

    // Form state
    const [formData, setFormData] = useState({
        title: '',
        description: '',
        due_date: '',
        frequency: 'Une fois',
        priority: 'Moyenne',
        assigned_to: [] as string[],
        points: '',
    });

    useEffect(() => {
        loadTasks();
        loadFamilyMembers();
        loadStats();
    }, []);
    useWebSocketUpdates('tasks', () => { void loadTasks(); void loadStats(); });

    const loadTasks = async () => {
        try {
            const response = await api.get<{ success: boolean; data: Task[] }>('/api/tasks');
            if (response.success) {
                setTasks(response.data);
            }
        } catch (error) {
            console.error('Failed to load tasks:', error);
            setError(error instanceof Error ? error.message : t('tasks:errors.loadTasks'));
        } finally {
            setLoading(false);
        }
    };

    const loadFamilyMembers = async () => {
        try {
            const response = await api.get<{ success: boolean; data: FamilyMember[] }>('/api/family');
            if (response.success) {
                setFamilyMembers(response.data);
            }
        } catch (error) {
            console.error('Failed to load family members:', error);
            setError(error instanceof Error ? error.message : t('tasks:errors.loadMembers'));
        }
    };

    const loadStats = async () => {
        try {
            const response = await api.get<{ success: boolean; data: TaskStats }>('/api/tasks/statistics');
            if (response.success) {
                setStats(response.data);
            }
        } catch (error) {
            console.error('Failed to load stats:', error);
            setError(error instanceof Error ? error.message : t('tasks:errors.loadStats'));
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        try {
            const payload: Record<string, unknown> = {
                ...formData,
                // Children never send points; the server ignores it anyway.
                points: isParent ? parseInt(formData.points, 10) || 0 : undefined,
            };
            if (editingTask) {
                await api.put(`/api/tasks/${editingTask.id}`, payload);
            } else {
                await api.post('/api/tasks', payload);
            }
            setDialogOpen(false);
            resetForm();
            loadTasks();
            loadStats();
        } catch (error) {
            console.error('Failed to save task:', error);
            setError(error instanceof Error ? error.message : t('tasks:errors.saveTask'));
        }
    };

    const handleToggleComplete = async (task: Task) => {
        try {
            const response = await api.put<{ success: boolean; data: Task }>(`/api/tasks/${task.id}`, {
                is_completed: !task.is_completed,
            });
            // A child completing a points chore: the points wait for a parent.
            if (!task.is_completed && response.success && response.data?.pending_approval) {
                showToast({
                    title: t('tasks:approval.toastTitle'),
                    description: t('tasks:approval.toastDescription'),
                });
            }
            loadTasks();
            loadStats();
        } catch (error) {
            console.error('Failed to toggle task:', error);
            setError(error instanceof Error ? error.message : t('tasks:errors.toggleTask'));
        }
    };

    const handleApprove = async (task: Task) => {
        try {
            await api.post(`/api/tasks/${task.id}/approve`, {});
            loadTasks();
            loadStats();
        } catch (error) {
            console.error('Failed to approve task:', error);
            setError(error instanceof Error ? error.message : t('tasks:errors.approveTask'));
        }
    };

    const handleReject = async (task: Task) => {
        try {
            await api.post(`/api/tasks/${task.id}/reject`, {});
            loadTasks();
            loadStats();
        } catch (error) {
            console.error('Failed to reject task:', error);
            setError(error instanceof Error ? error.message : t('tasks:errors.rejectTask'));
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm(t('tasks:confirmDelete'))) return;
        try {
            await api.delete(`/api/tasks/${id}`);
            loadTasks();
            loadStats();
        } catch (error) {
            console.error('Failed to delete task:', error);
            setError(error instanceof Error ? error.message : t('tasks:errors.deleteTask'));
        }
    };

    const handleEdit = (task: Task) => {
        setEditingTask(task);
        setFormData({
            title: task.title,
            description: task.description || '',
            // due_date is either a bare "yyyy-MM-dd" date or a naive local datetime
            // ("yyyy-MM-ddTHH:mm:ss" / "yyyy-MM-dd HH:mm:ss"); the first 10 chars
            // are always the local date — no Date round-trip (and no UTC shift).
            due_date: task.due_date ? task.due_date.slice(0, 10) : '',
            frequency: task.frequency || 'Une fois',
            priority: task.priority || 'Moyenne',
            assigned_to: task.assigned_to || [],
            points: task.points ? String(task.points) : '',
        });
        setDialogOpen(true);
    };

    const resetForm = () => {
        setEditingTask(null);
        setFormData({
            title: '',
            description: '',
            due_date: '',
            frequency: 'Une fois',
            priority: 'Moyenne',
            assigned_to: [],
            points: '',
        });
    };

    const filteredTasks = tasks.filter((task) => {
        if (filterPriority && task.priority !== filterPriority) return false;
        if (filterStatus === 'completed' && !task.is_completed) return false;
        if (filterStatus === 'pending' && task.is_completed) return false;
        if (filterMember === '__unassigned__' && task.assigned_to && task.assigned_to.length > 0) return false;
        if (filterMember && filterMember !== '__unassigned__' && !(task.assigned_to || []).includes(filterMember)) return false;
        return true;
    });

    const getPriorityColor = (priority?: string) => {
        switch (priority) {
            case 'Haute':
                return 'danger';
            case 'Moyenne':
                return 'warning';
            case 'Basse':
                return 'success';
            default:
                return 'default';
        }
    };

    if (loading) {
        return (
            <div className="flex h-full items-center justify-center min-h-[50vh]">
                <div className="flex flex-col items-center gap-4">
                    <div className="spinner-brand" />
                    <p className="text-muted-foreground font-medium animate-pulse">{t('tasks:loading')}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-6xl mx-auto space-y-6">
            {error ? (
                <div className="rounded-input border border-danger/30 bg-danger/10 px-4 py-3 text-caption text-danger">
                    {error}
                </div>
            ) : null}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-h1 mb-1">{t('tasks:title')}</h1>
                    <p className="text-muted-foreground text-body">{t('tasks:subtitle')}</p>
                </div>
                <Button onClick={() => { resetForm(); setDialogOpen(true); }}>
                    <Plus className="w-4 h-4 mr-2" />
                    {t('tasks:newTask')}
                </Button>
            </div>

            {/* Statistics */}
            {stats && (
                <div className="grid grid-cols-2 md:grid-cols-4 overflow-hidden rounded-card border border-border bg-card">
                    <div className="flex items-center justify-between gap-2 p-4 border-b border-r border-border md:border-b-0">
                        <div>
                            <p className="text-label text-muted-foreground mb-1">{t('tasks:stats.total')}</p>
                            <p className="font-serif text-3xl tracking-tight">{stats.total}</p>
                        </div>
                        <CheckSquare className="h-7 w-7 text-muted-foreground" />
                    </div>
                    <div className="flex items-center justify-between gap-2 p-4 border-b border-border md:border-b-0 md:border-r">
                        <div>
                            <p className="text-label text-muted-foreground mb-1">{t('tasks:stats.completed')}</p>
                            <p className="font-serif text-3xl tracking-tight text-success">{stats.completed}</p>
                        </div>
                        <TrendingUp className="h-7 w-7 text-success" />
                    </div>
                    <div className="flex items-center justify-between gap-2 p-4 border-r border-border">
                        <div>
                            <p className="text-label text-muted-foreground mb-1">{t('tasks:stats.pending')}</p>
                            <p className="font-serif text-3xl tracking-tight">{stats.pending}</p>
                        </div>
                        <Square className="h-7 w-7 text-muted-foreground" />
                    </div>
                    <div className="flex items-center justify-between gap-2 p-4">
                        <div>
                            <p className="text-label text-muted-foreground mb-1">{t('tasks:stats.completionRate')}</p>
                            <p className="font-serif text-3xl tracking-tight text-primary">{stats.completionRate}%</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Filters */}
            <Card>
                <CardContent className="p-4">
                    <div className="flex flex-wrap items-center gap-4">
                        <div className="flex items-center gap-2">
                            <Filter className="h-4 w-4 text-muted-foreground" />
                            <span className="text-body-sm font-medium">{t('tasks:filters.label')}</span>
                        </div>
                        <Select
                            value={filterStatus}
                            onValueChange={setFilterStatus}
                            options={[
                                { value: 'all', label: t('tasks:filters.statusAll') },
                                { value: 'pending', label: t('tasks:filters.statusPending') },
                                { value: 'completed', label: t('tasks:filters.statusCompleted') },
                            ]}
                            className="w-40"
                        />
                        <Select
                            value={filterPriority}
                            onValueChange={setFilterPriority}
                            options={[
                                { value: '', label: t('tasks:filters.allPriorities') },
                                ...PRIORITIES,
                            ]}
                            className="w-48"
                        />
                        <Select
                            value={filterMember}
                            onValueChange={setFilterMember}
                            options={[
                                { value: '', label: t('tasks:filters.allMembers') },
                                { value: '__unassigned__', label: t('tasks:filters.unassigned') },
                                ...familyMembers.map((m) => ({ value: m.id, label: m.name })),
                            ]}
                            className="w-48"
                        />
                        {(filterPriority || filterStatus !== 'all' || filterMember) && (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                    setFilterPriority('');
                                    setFilterStatus('all');
                                    setFilterMember('');
                                }}
                            >
                                {t('common:actions.reset')}
                            </Button>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Tasks List */}
            <div className="space-y-3">
                {filteredTasks.length === 0 ? (
                    <Card>
                        <CardContent className="p-8 text-center">
                            <CheckSquare className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-50" />
                            <p className="text-muted-foreground">
                                {tasks.length === 0
                                    ? t('tasks:empty.none')
                                    : t('tasks:empty.noMatch')}
                            </p>
                        </CardContent>
                    </Card>
                ) : (
                    filteredTasks.map((task) => (
                        <Card
                            key={task.id}
                            className={`transition-all hover:shadow-md ${task.pending_approval
                                ? 'border-amber-300 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20'
                                : task.is_completed ? 'opacity-60' : ''}`}
                        >
                            <CardContent className="p-4">
                                <div className="flex items-start gap-4">
                                    <button
                                        onClick={() => handleToggleComplete(task)}
                                        className="mt-1 flex-shrink-0"
                                    >
                                        {task.is_completed ? (
                                            <CheckSquare className="h-5 w-5 text-emerald-600" />
                                        ) : (
                                            <Square className="h-5 w-5 text-muted-foreground hover:text-nexus-blue transition-colors" />
                                        )}
                                    </button>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="flex-1">
                                                <h3
                                                    className={`text-body font-semibold mb-1 ${task.is_completed ? 'line-through text-muted-foreground' : ''
                                                        }`}
                                                >
                                                    {task.title}
                                                </h3>
                                                {task.description && (
                                                    <p className="text-body-sm text-muted-foreground mb-2">
                                                        {task.description}
                                                    </p>
                                                )}
                                                <div className="flex flex-wrap items-center gap-2">
                                                    {(task.points ?? 0) > 0 && (
                                                        <Badge variant="warning" className="flex items-center gap-1">
                                                            <Star className="h-3 w-3 fill-current" />
                                                            {task.points}
                                                        </Badge>
                                                    )}
                                                    {task.pending_approval && (
                                                        <Badge variant="warning" className="flex items-center gap-1">
                                                            <Hourglass className="h-3 w-3" />
                                                            {t('tasks:approval.pendingBadge')}
                                                        </Badge>
                                                    )}
                                                    {task.priority && (
                                                        <Badge variant={getPriorityColor(task.priority)}>
                                                            {priorityLabel(task.priority)}
                                                        </Badge>
                                                    )}
                                                    {task.frequency && task.frequency !== 'Une fois' && (
                                                        <Badge variant="secondary">{frequencyLabel(task.frequency)}</Badge>
                                                    )}
                                                    {task.due_date && (
                                                        <Badge variant="default">
                                                            {t('tasks:due', { date: format(parseISO(task.due_date), 'dd MMM yyyy', { locale: dateLocale() }) })}
                                                        </Badge>
                                                    )}
                                                {(task.assigned_to_members || []).map((member) => (
                                                        <Badge
                                                            key={member.id}
                                                            variant="primary"
                                                            className="flex items-center gap-1"
                                                        >
                                                            <div
                                                                className="w-2 h-2 rounded-full"
                                                                style={{ backgroundColor: member.color }}
                                                            />
                                                            {member.name}
                                                        </Badge>
                                                    ))}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {isParent && task.pending_approval && (
                                                    <>
                                                        <Button
                                                            variant="secondary"
                                                            size="sm"
                                                            onClick={() => handleApprove(task)}
                                                            className="text-success"
                                                        >
                                                            <Check className="h-4 w-4 mr-1" />
                                                            {t('tasks:approval.approve')}
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => handleReject(task)}
                                                            className="text-destructive"
                                                        >
                                                            <X className="h-4 w-4 mr-1" />
                                                            {t('tasks:approval.reject')}
                                                        </Button>
                                                    </>
                                                )}
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleEdit(task)}
                                                >
                                                    <Edit2 className="h-4 w-4" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleDelete(task.id)}
                                                >
                                                    <Trash2 className="h-4 w-4 text-red-500" />
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    ))
                )}
            </div>

            {/* Dialog */}
            <Dialog
                open={dialogOpen}
                onOpenChange={setDialogOpen}
                title={editingTask ? t('tasks:dialog.editTitle') : t('tasks:dialog.createTitle')}
                description={t('tasks:dialog.description')}
            >
                <form onSubmit={handleSubmit} className="space-y-4">
                    <Input
                        label={t('tasks:form.title')}
                        value={formData.title}
                        onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                        required
                        placeholder={t('tasks:form.titlePlaceholder')}
                    />
                    <Textarea
                        label={t('tasks:form.description')}
                        value={formData.description}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        placeholder={t('tasks:form.descriptionPlaceholder')}
                        rows={3}
                    />
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-label font-medium text-foreground mb-1.5">
                                {t('tasks:form.priority')}
                            </label>
                            <Select
                                value={formData.priority}
                                onValueChange={(value) => setFormData({ ...formData, priority: value })}
                                options={PRIORITIES}
                            />
                        </div>
                        <div>
                            <label className="block text-label font-medium text-foreground mb-1.5">
                                {t('tasks:form.frequency')}
                            </label>
                            <Select
                                value={formData.frequency}
                                onValueChange={(value) => setFormData({ ...formData, frequency: value })}
                                options={FREQUENCIES}
                            />
                        </div>
                    </div>
                    <DatePicker
                        label={t('tasks:form.dueDate')}
                        value={formData.due_date}
                        onChange={(value) => setFormData({ ...formData, due_date: value })}
                    />
                    {isParent && (
                        <div>
                            <label className="flex items-center gap-1.5 text-label font-medium text-foreground mb-1.5">
                                <Star className="h-4 w-4 text-amber-500 fill-current" />
                                {t('tasks:form.points')}
                            </label>
                            <Input
                                type="number"
                                min={0}
                                step={1}
                                value={formData.points}
                                onChange={(e) => setFormData({ ...formData, points: e.target.value })}
                                placeholder="0"
                            />
                            <p className="mt-1 text-micro text-muted-foreground">{t('tasks:form.pointsHint')}</p>
                        </div>
                    )}
                    <div>
                        <label className="block text-label font-medium text-foreground mb-1.5">
                            {t('tasks:form.assignTo')}
                        </label>
                        {familyMembers.length === 0 ? (
                            <p className="text-body-sm text-muted-foreground">{t('tasks:form.noMembers')}</p>
                        ) : (
                            <div className="space-y-2 rounded-input border border-border bg-surface-2/40 p-3">
                                {familyMembers.map((member) => (
                                    <label key={member.id} className="flex items-center gap-2 cursor-pointer hover:bg-nexus-background rounded px-1 py-0.5">
                                        <input
                                            type="checkbox"
                                            checked={formData.assigned_to.includes(member.id)}
                                            onChange={() => {
                                                setFormData((prev) => ({
                                                    ...prev,
                                                    assigned_to: prev.assigned_to.includes(member.id)
                                                        ? prev.assigned_to.filter((id) => id !== member.id)
                                                        : [...prev.assigned_to, member.id],
                                                }));
                                            }}
                                            className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                                        />
                                        <div
                                            className="w-3 h-3 rounded-full flex-shrink-0"
                                            style={{ backgroundColor: member.color }}
                                        />
                                        <span className="text-body-sm">{member.name}</span>
                                    </label>
                                ))}
                            </div>
                        )}
                    </div>
                    <div className="flex justify-end gap-3 pt-4">
                        <Button
                            type="button"
                            variant="secondary"
                            onClick={() => setDialogOpen(false)}
                        >
                            {t('common:actions.cancel')}
                        </Button>
                        <Button type="submit">
                            {editingTask ? t('common:actions.save') : t('common:actions.create')}
                        </Button>
                    </div>
                </form>
            </Dialog>
        </div>
    );
};

export default Tasks;
