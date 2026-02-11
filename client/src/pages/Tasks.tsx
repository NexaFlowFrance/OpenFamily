import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Plus, CheckSquare, Square, Trash2, Edit2, Filter, TrendingUp } from 'lucide-react';
import { Card, CardContent, Button, Dialog, Input, Select, Textarea, DatePicker, Badge } from '../components/ui';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

interface Task {
    id: string;
    title: string;
    description?: string;
    is_completed: boolean;
    due_date?: string;
    frequency?: string;
    priority?: string;
    assigned_to?: string;
    assigned_to_name?: string;
    assigned_to_color?: string;
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

const PRIORITIES = [
    { value: 'Haute', label: 'Haute' },
    { value: 'Moyenne', label: 'Moyenne' },
    { value: 'Basse', label: 'Basse' },
];

const FREQUENCIES = [
    { value: 'Une fois', label: 'Une fois' },
    { value: 'Quotidien', label: 'Quotidien' },
    { value: 'Hebdomadaire', label: 'Hebdomadaire' },
    { value: 'Mensuel', label: 'Mensuel' },
    { value: 'Annuel', label: 'Annuel' },
];

const Tasks: React.FC = () => {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);
    const [stats, setStats] = useState<TaskStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingTask, setEditingTask] = useState<Task | null>(null);
    const [filterPriority, setFilterPriority] = useState<string>('');
    const [filterStatus, setFilterStatus] = useState<string>('all');
    const [error, setError] = useState('');

    // Form state
    const [formData, setFormData] = useState({
        title: '',
        description: '',
        due_date: '',
        frequency: 'Une fois',
        priority: 'Moyenne',
        assigned_to: '',
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
            setError(error instanceof Error ? error.message : 'Impossible de charger les tâches.');
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
            setError(error instanceof Error ? error.message : 'Impossible de charger les membres.');
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
            setError(error instanceof Error ? error.message : 'Impossible de charger les statistiques.');
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
            setError(error instanceof Error ? error.message : 'Impossible d’enregistrer cette tâche.');
        }
    };

    const handleToggleComplete = async (task: Task) => {
        try {
            await api.put(`/api/tasks/${task.id}`, {
                is_completed: !task.is_completed,
            });
            loadTasks();
            loadStats();
        } catch (error) {
            console.error('Failed to toggle task:', error);
            setError(error instanceof Error ? error.message : 'Impossible de mettre à jour cette tâche.');
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Êtes-vous sûr de vouloir supprimer cette tâche ?')) return;
        try {
            await api.delete(`/api/tasks/${id}`);
            loadTasks();
            loadStats();
        } catch (error) {
            console.error('Failed to delete task:', error);
            setError(error instanceof Error ? error.message : 'Impossible de supprimer cette tâche.');
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
            assigned_to: task.assigned_to || '',
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
            assigned_to: '',
        });
    };

    const filteredTasks = tasks.filter((task) => {
        if (filterPriority && task.priority !== filterPriority) return false;
        if (filterStatus === 'completed' && !task.is_completed) return false;
        if (filterStatus === 'pending' && task.is_completed) return false;
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
                    <p className="text-muted-foreground font-medium animate-pulse">Chargement des tâches...</p>
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
                    <h1 className="text-h1 mb-1">Tâches</h1>
                    <p className="text-muted-foreground text-body">Gérez vos tâches familiales et suivez leur progression</p>
                </div>
                <Button onClick={() => { resetForm(); setDialogOpen(true); }}>
                    <Plus className="w-4 h-4 mr-2" />
                    Nouvelle tâche
                </Button>
            </div>

            {/* Statistics */}
            {stats && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <Card className="border-blue-100 bg-card">
                        <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-label text-muted-foreground mb-1">Total</p>
                                    <p className="text-2xl font-bold">{stats.total}</p>
                                </div>
                                <CheckSquare className="h-8 w-8 text-nexus-blue" />
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="border-emerald-100 bg-card">
                        <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-label text-muted-foreground mb-1">Complétées</p>
                                    <p className="text-2xl font-bold text-emerald-600">{stats.completed}</p>
                                </div>
                                <TrendingUp className="h-8 w-8 text-emerald-600" />
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="border-amber-100 bg-card">
                        <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-label text-muted-foreground mb-1">En attente</p>
                                    <p className="text-2xl font-bold text-amber-600">{stats.pending}</p>
                                </div>
                                <Square className="h-8 w-8 text-amber-600" />
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="border-purple-100 bg-card">
                        <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-label text-muted-foreground mb-1">Taux de réussite</p>
                                    <p className="text-2xl font-bold text-purple-600">{stats.completionRate}%</p>
                                </div>
                                <div className="h-8 w-8 rounded-full bg-purple-100 flex items-center justify-center">
                                    <span className="text-sm font-bold text-purple-600">%</span>
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
                            <span className="text-body-sm font-medium">Filtres:</span>
                        </div>
                        <Select
                            value={filterStatus}
                            onValueChange={setFilterStatus}
                            options={[
                                { value: 'all', label: 'Toutes' },
                                { value: 'pending', label: 'En attente' },
                                { value: 'completed', label: 'Complétées' },
                            ]}
                            className="w-40"
                        />
                        <Select
                            value={filterPriority}
                            onValueChange={setFilterPriority}
                            options={[
                                { value: '', label: 'Toutes priorités' },
                                ...PRIORITIES,
                            ]}
                            className="w-48"
                        />
                        {(filterPriority || filterStatus !== 'all') && (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                    setFilterPriority('');
                                    setFilterStatus('all');
                                }}
                            >
                                Réinitialiser
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
                                    ? 'Aucune tâche pour le moment. Créez votre première tâche !'
                                    : 'Aucune tâche ne correspond aux filtres sélectionnés.'}
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
                                                    {task.priority && (
                                                        <Badge variant={getPriorityColor(task.priority)}>
                                                            {task.priority}
                                                        </Badge>
                                                    )}
                                                    {task.frequency && task.frequency !== 'Une fois' && (
                                                        <Badge variant="secondary">{task.frequency}</Badge>
                                                    )}
                                                    {task.due_date && (
                                                        <Badge variant="default">
                                                            Échéance: {format(new Date(task.due_date), 'dd MMM yyyy', { locale: fr })}
                                                        </Badge>
                                                    )}
                                                    {task.assigned_to_name && (
                                                        <Badge
                                                            variant="primary"
                                                            className="flex items-center gap-1"
                                                        >
                                                            <div
                                                                className="w-2 h-2 rounded-full"
                                                                style={{ backgroundColor: task.assigned_to_color }}
                                                            />
                                                            {task.assigned_to_name}
                                                        </Badge>
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
                title={editingTask ? 'Modifier la tâche' : 'Nouvelle tâche'}
                description="Remplissez les informations de la tâche"
            >
                <form onSubmit={handleSubmit} className="space-y-4">
                    <Input
                        label="Titre"
                        value={formData.title}
                        onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                        required
                        placeholder="Ex: Faire les courses"
                    />
                    <Textarea
                        label="Description (optionnel)"
                        value={formData.description}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        placeholder="Détails supplémentaires..."
                        rows={3}
                    />
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-label font-medium text-foreground mb-1.5">
                                Priorité
                            </label>
                            <Select
                                value={formData.priority}
                                onValueChange={(value) => setFormData({ ...formData, priority: value })}
                                options={PRIORITIES}
                            />
                        </div>
                        <div>
                            <label className="block text-label font-medium text-foreground mb-1.5">
                                Fréquence
                            </label>
                            <Select
                                value={formData.frequency}
                                onValueChange={(value) => setFormData({ ...formData, frequency: value })}
                                options={FREQUENCIES}
                            />
                        </div>
                    </div>
                    <DatePicker
                        label="Date d'échéance (optionnel)"
                        value={formData.due_date}
                        onChange={(value) => setFormData({ ...formData, due_date: value })}
                    />
                    <div>
                        <label className="block text-label font-medium text-foreground mb-1.5">
                            Assigner à (optionnel)
                        </label>
                        <Select
                            value={formData.assigned_to}
                            onValueChange={(value) => setFormData({ ...formData, assigned_to: value })}
                            options={[
                                { value: '', label: 'Personne' },
                                ...familyMembers.map((member) => ({
                                    value: member.id,
                                    label: member.name,
                                })),
                            ]}
                        />
                    </div>
                    <div className="flex justify-end gap-3 pt-4">
                        <Button
                            type="button"
                            variant="secondary"
                            onClick={() => setDialogOpen(false)}
                        >
                            Annuler
                        </Button>
                        <Button type="submit">
                            {editingTask ? 'Enregistrer' : 'Créer'}
                        </Button>
                    </div>
                </form>
            </Dialog>
        </div>
    );
};

export default Tasks;
