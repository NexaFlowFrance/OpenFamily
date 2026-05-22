import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { Plus, CheckSquare, Square, Trash2, Edit2, Filter, TrendingUp, Repeat } from 'lucide-react';
import {
    Card,
    CardContent,
    Button,
    Dialog,
    Input,
    Select,
    Textarea,
    DatePicker,
    Badge,
    useToast,
} from '../components/ui';
import { format } from 'date-fns';
import { useDateLocale } from '../lib/dateLocale';

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

// Persisted data values (kept verbatim — server + TS literals). Display labels
// are resolved at render time via t('tasks.priority.' + value).
const PRIORITY_VALUES = ['Haute', 'Moyenne', 'Basse'];
const FREQUENCY_VALUES = ['Une fois', 'Quotidien', 'Hebdomadaire', 'Mensuel', 'Annuel'];

const Tasks: React.FC = () => {
    const { t } = useTranslation();
    const locale = useDateLocale();
    const { showToast } = useToast();

    const PRIORITIES = PRIORITY_VALUES.map((value) => ({
        value,
        label: t('tasks.priority.' + value, { defaultValue: value }),
    }));
    const FREQUENCIES = FREQUENCY_VALUES.map((value) => ({
        value,
        label: t('tasks.frequency.' + value, { defaultValue: value }),
    }));
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
    });

    useEffect(() => {
        loadTasks();
        loadFamilyMembers();
        loadStats();
    }, []);

    const loadTasks = async () => {
        try {
            const response = await api.get<{ success: boolean; data: Task[] }>('/api/tasks');
            if (response.success) {
                setTasks(response.data);
            }
        } catch (error) {
            console.error('Failed to load tasks:', error);
            setError(error instanceof Error ? error.message : t('tasks.errors.load'));
        } finally {
            setLoading(false);
        }
    };

    const loadFamilyMembers = async () => {
        try {
            const response = await api.get<{ success: boolean; data: FamilyMember[] }>(
                '/api/family',
            );
            if (response.success) {
                setFamilyMembers(response.data);
            }
        } catch (error) {
            console.error('Failed to load family members:', error);
            setError(error instanceof Error ? error.message : t('tasks.errors.load_members'));
        }
    };

    const loadStats = async () => {
        try {
            const response = await api.get<{ success: boolean; data: TaskStats }>(
                '/api/tasks/statistics',
            );
            if (response.success) {
                setStats(response.data);
            }
        } catch (error) {
            console.error('Failed to load stats:', error);
            setError(error instanceof Error ? error.message : t('tasks.errors.load_stats'));
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        try {
            if (editingTask) {
                await api.put(`/api/tasks/${editingTask.id}`, formData);
            } else {
                await api.post('/api/tasks', formData);
            }
            setDialogOpen(false);
            resetForm();
            loadTasks();
            loadStats();
        } catch (error) {
            console.error('Failed to save task:', error);
            setError(error instanceof Error ? error.message : t('tasks.errors.save'));
        }
    };

    const handleToggleComplete = async (task: Task) => {
        try {
            // Server may return next_occurrence when marking a recurring task
            // complete — surface it so the user knows the next instance exists.
            const response = await api.put<{
                success: boolean;
                data: Task & { next_occurrence?: Task | null };
            }>(`/api/tasks/${task.id}`, {
                is_completed: !task.is_completed,
            });
            if (response.success && response.data?.next_occurrence) {
                const next = response.data.next_occurrence;
                showToast({
                    title: t('tasks.toast.completed_title'),
                    description: next.due_date
                        ? t('tasks.toast.next_scheduled', {
                              title: next.title,
                              date: format(new Date(next.due_date), 'dd MMM', { locale }),
                          })
                        : t('tasks.toast.next_created', { title: next.title }),
                });
            }
            loadTasks();
            loadStats();
        } catch (error) {
            console.error('Failed to toggle task:', error);
            setError(error instanceof Error ? error.message : t('tasks.errors.update'));
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm(t('tasks.confirm_delete'))) return;
        try {
            await api.delete(`/api/tasks/${id}`);
            loadTasks();
            loadStats();
        } catch (error) {
            console.error('Failed to delete task:', error);
            setError(error instanceof Error ? error.message : t('tasks.errors.delete'));
        }
    };

    const handleEdit = (task: Task) => {
        setEditingTask(task);
        setFormData({
            title: task.title,
            description: task.description || '',
            due_date: task.due_date ? task.due_date.split('T')[0] : '',
            frequency: task.frequency || 'Une fois',
            priority: task.priority || 'Moyenne',
            assigned_to: task.assigned_to || [],
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
        });
    };

    const filteredTasks = tasks.filter((task) => {
        if (filterPriority && task.priority !== filterPriority) return false;
        if (filterStatus === 'completed' && !task.is_completed) return false;
        if (filterStatus === 'pending' && task.is_completed) return false;
        if (filterMember === '__unassigned__' && task.assigned_to && task.assigned_to.length > 0)
            return false;
        if (
            filterMember &&
            filterMember !== '__unassigned__' &&
            !(task.assigned_to || []).includes(filterMember)
        )
            return false;
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
                    <p className="text-muted-foreground font-medium animate-pulse">
                        {t('tasks.loading')}
                    </p>
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
                    <h1 className="text-h1 mb-1">{t('tasks.title')}</h1>
                    <p className="text-muted-foreground text-body">{t('tasks.subtitle')}</p>
                </div>
                <Button
                    onClick={() => {
                        resetForm();
                        setDialogOpen(true);
                    }}
                >
                    <Plus className="w-4 h-4 mr-2" />
                    {t('tasks.new_task')}
                </Button>
            </div>

            {/* Statistics */}
            {stats && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <Card className="border-info/20 bg-card">
                        <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-label text-muted-foreground mb-1">
                                        {t('tasks.stats.total')}
                                    </p>
                                    <p className="text-2xl font-bold">{stats.total}</p>
                                </div>
                                <CheckSquare className="h-8 w-8 text-info" />
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="border-success/20 bg-card">
                        <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-label text-muted-foreground mb-1">
                                        {t('tasks.stats.completed')}
                                    </p>
                                    <p className="text-2xl font-bold text-success">
                                        {stats.completed}
                                    </p>
                                </div>
                                <TrendingUp className="h-8 w-8 text-success" />
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="border-warning/20 bg-card">
                        <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-label text-muted-foreground mb-1">
                                        {t('tasks.stats.pending')}
                                    </p>
                                    <p className="text-2xl font-bold text-warning">
                                        {stats.pending}
                                    </p>
                                </div>
                                <Square className="h-8 w-8 text-warning" />
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="border-primary/20 bg-card">
                        <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-label text-muted-foreground mb-1">
                                        {t('tasks.stats.completion_rate')}
                                    </p>
                                    <p className="text-2xl font-bold text-primary">
                                        {stats.completionRate}%
                                    </p>
                                </div>
                                <div className="h-8 w-8 rounded-full bg-primary-soft flex items-center justify-center">
                                    <span className="text-sm font-bold text-primary">%</span>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Filters */}
            <Card>
                <CardContent className="p-4">
                    <div className="flex flex-wrap items-center gap-4">
                        <div className="flex items-center gap-2">
                            <Filter className="h-4 w-4 text-muted-foreground" />
                            <span className="text-body-sm font-medium">
                                {t('tasks.filters.label')}
                            </span>
                        </div>
                        <Select
                            value={filterStatus}
                            onValueChange={setFilterStatus}
                            options={[
                                { value: 'all', label: t('tasks.filters.all') },
                                { value: 'pending', label: t('tasks.filters.pending') },
                                { value: 'completed', label: t('tasks.filters.completed') },
                            ]}
                            className="w-40"
                        />
                        <Select
                            value={filterPriority}
                            onValueChange={setFilterPriority}
                            options={[
                                { value: '', label: t('tasks.filters.all_priorities') },
                                ...PRIORITIES,
                            ]}
                            className="w-48"
                        />
                        <Select
                            value={filterMember}
                            onValueChange={setFilterMember}
                            options={[
                                { value: '', label: t('tasks.filters.all_members') },
                                { value: '__unassigned__', label: t('tasks.filters.unassigned') },
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
                                {t('tasks.filters.reset')}
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
                                    ? t('tasks.empty.none')
                                    : t('tasks.empty.no_match')}
                            </p>
                        </CardContent>
                    </Card>
                ) : (
                    filteredTasks.map((task) => (
                        <Card
                            key={task.id}
                            className={`transition-all hover:shadow-md ${task.is_completed ? 'opacity-60' : ''}`}
                        >
                            <CardContent className="p-4">
                                <div className="flex items-start gap-4">
                                    <button
                                        onClick={() => handleToggleComplete(task)}
                                        className="mt-1 flex-shrink-0"
                                    >
                                        {task.is_completed ? (
                                            <CheckSquare className="h-5 w-5 text-success" />
                                        ) : (
                                            <Square className="h-5 w-5 text-muted-foreground hover:text-primary transition-colors" />
                                        )}
                                    </button>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="flex-1">
                                                <h3
                                                    className={`text-body font-semibold mb-1 ${
                                                        task.is_completed
                                                            ? 'line-through text-muted-foreground'
                                                            : ''
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
                                                    {task.priority && (
                                                        <Badge
                                                            variant={getPriorityColor(
                                                                task.priority,
                                                            )}
                                                        >
                                                            {t('tasks.priority.' + task.priority, {
                                                                defaultValue: task.priority,
                                                            })}
                                                        </Badge>
                                                    )}
                                                    {task.frequency &&
                                                        task.frequency !== 'Une fois' && (
                                                            <Badge variant="secondary">
                                                                <Repeat className="h-3 w-3 mr-1" />
                                                                {t(
                                                                    'tasks.frequency.' +
                                                                        task.frequency,
                                                                    {
                                                                        defaultValue:
                                                                            task.frequency,
                                                                    },
                                                                )}
                                                            </Badge>
                                                        )}
                                                    {task.due_date && (
                                                        <Badge variant="default">
                                                            {t('tasks.due_date_badge', {
                                                                date: format(
                                                                    new Date(task.due_date),
                                                                    'dd MMM yyyy',
                                                                    { locale },
                                                                ),
                                                            })}
                                                        </Badge>
                                                    )}
                                                    {(task.assigned_to_members || []).map(
                                                        (member) => (
                                                            <Badge
                                                                key={member.id}
                                                                variant="primary"
                                                                className="flex items-center gap-1"
                                                            >
                                                                <div
                                                                    className="w-2 h-2 rounded-full"
                                                                    style={{
                                                                        backgroundColor:
                                                                            member.color,
                                                                    }}
                                                                />
                                                                {member.name}
                                                            </Badge>
                                                        ),
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
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
                                                    <Trash2 className="h-4 w-4 text-destructive" />
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
                title={editingTask ? t('tasks.dialog.edit_title') : t('tasks.dialog.new_title')}
                description={t('tasks.dialog.description')}
            >
                <form onSubmit={handleSubmit} className="space-y-4">
                    <Input
                        label={t('tasks.dialog.title_label')}
                        value={formData.title}
                        onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                        required
                        placeholder={t('tasks.dialog.title_placeholder')}
                    />
                    <Textarea
                        label={t('tasks.dialog.description_label')}
                        value={formData.description}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        placeholder={t('tasks.dialog.description_placeholder')}
                        rows={3}
                    />
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-label font-medium text-foreground mb-1.5">
                                {t('tasks.dialog.priority_label')}
                            </label>
                            <Select
                                value={formData.priority}
                                onValueChange={(value) =>
                                    setFormData({ ...formData, priority: value })
                                }
                                options={PRIORITIES}
                            />
                        </div>
                        <div>
                            <label className="block text-label font-medium text-foreground mb-1.5">
                                {t('tasks.dialog.frequency_label')}
                            </label>
                            <Select
                                value={formData.frequency}
                                onValueChange={(value) =>
                                    setFormData({ ...formData, frequency: value })
                                }
                                options={FREQUENCIES}
                            />
                        </div>
                    </div>
                    <DatePicker
                        label={t('tasks.dialog.due_date_label')}
                        value={formData.due_date}
                        onChange={(value) => setFormData({ ...formData, due_date: value })}
                    />
                    <div>
                        <label className="block text-label font-medium text-foreground mb-1.5">
                            {t('tasks.dialog.assign_label')}
                        </label>
                        {familyMembers.length === 0 ? (
                            <p className="text-body-sm text-muted-foreground">
                                {t('tasks.dialog.no_members')}
                            </p>
                        ) : (
                            <div className="space-y-2 rounded-input border border-border bg-surface-2/40 p-3">
                                {familyMembers.map((member) => (
                                    <label
                                        key={member.id}
                                        className="flex items-center gap-2 cursor-pointer hover:bg-nexus-background rounded px-1 py-0.5"
                                    >
                                        <input
                                            type="checkbox"
                                            checked={formData.assigned_to.includes(member.id)}
                                            onChange={() => {
                                                setFormData((prev) => ({
                                                    ...prev,
                                                    assigned_to: prev.assigned_to.includes(
                                                        member.id,
                                                    )
                                                        ? prev.assigned_to.filter(
                                                              (id) => id !== member.id,
                                                          )
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
                            {t('common.cancel')}
                        </Button>
                        <Button type="submit">
                            {editingTask ? t('common.save') : t('tasks.dialog.create')}
                        </Button>
                    </div>
                </form>
            </Dialog>
        </div>
    );
};

export default Tasks;
