import { useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Trash2, Plus, Check, AlertCircle, Edit2 } from 'lucide-react';
import DaySchedule from '@/components/DaySchedule';
import { getDayOfWeek, getDayOfMonth } from '@/lib/recurrence';

const CATEGORIES = [
  { value: 'household', label: 'Ménage', color: '#6b8e7f' },
  { value: 'baby', label: 'Bébé', color: '#f0d4a8' },
  { value: 'personal', label: 'Personnel', color: '#c8dfe8' },
  { value: 'other', label: 'Autre', color: '#e8e6e3' },
];

const FREQUENCIES = [
  { value: 'daily', label: 'Quotidienne' },
  { value: 'weekly', label: 'Hebdomadaire' },
  { value: 'monthly', label: 'Mensuelle' },
  { value: 'yearly', label: 'Annuelle' },
];

export default function Tasks() {
  const { tasks, familyMembers, appointments, addTask, updateTask, deleteTask } = useApp();
  const [showForm, setShowForm] = useState(false);
  const [editingTask, setEditingTask] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'pending' | 'completed'>('pending');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    category: 'household' as const,
    assignedTo: '',
    dueDate: new Date().toISOString().split('T')[0],
    dueTime: '',
    duration: 30,
    priority: 'medium' as const,
    recurring: false,
    frequency: 'weekly' as const,
  });

  const handleAddTask = () => {
    if (formData.title.trim()) {
      const recurringConfig = formData.recurring ? {
        frequency: formData.frequency,
        dayOfWeek: formData.frequency === 'weekly' ? getDayOfWeek(formData.dueDate) : undefined,
        dayOfMonth: formData.frequency === 'monthly' ? getDayOfMonth(formData.dueDate) : undefined,
      } : undefined;

      if (editingTask) {
        // Mode édition
        updateTask(editingTask, {
          title: formData.title,
          description: formData.description,
          category: formData.category,
          assignedTo: formData.assignedTo || undefined,
          dueDate: formData.dueDate,
          dueTime: formData.dueTime || undefined,
          duration: formData.duration || undefined,
          priority: formData.priority,
          recurring: recurringConfig,
        });
        setEditingTask(null);
      } else {
        // Mode ajout
        addTask({
          title: formData.title,
          description: formData.description,
          category: formData.category,
          assignedTo: formData.assignedTo || undefined,
          dueDate: formData.dueDate,
          dueTime: formData.dueTime || undefined,
          duration: formData.duration || undefined,
          completed: false,
          priority: formData.priority,
          recurring: recurringConfig,
        });
      }
      
      setFormData({
        title: '',
        description: '',
        category: 'household',
        assignedTo: '',
        dueDate: new Date().toISOString().split('T')[0],
        dueTime: '',
        duration: 30,
        priority: 'medium',
        recurring: false,
        frequency: 'weekly',
      });
      setShowForm(false);
    }
  };

  const handleEditTask = (task: any) => {
    setEditingTask(task.id);
    setFormData({
      title: task.title,
      description: task.description || '',
      category: task.category,
      assignedTo: task.assignedTo || '',
      dueDate: task.dueDate,
      dueTime: task.dueTime || '',
      duration: task.duration || 30,
      priority: task.priority,
      recurring: !!task.recurring,
      frequency: task.recurring?.frequency || 'weekly',
    });
    setShowForm(true);
  };

  const filteredTasks = tasks.filter(task => {
    if (filter === 'pending') return !task.completed;
    if (filter === 'completed') return task.completed;
    return true;
  });

  const getCategoryColor = (category: string) => {
    return CATEGORIES.find(c => c.value === category)?.color || '#e8e6e3';
  };

  const getCategoryLabel = (category: string) => {
    return CATEGORIES.find(c => c.value === category)?.label || category;
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return '#d97b7b';
      case 'medium': return '#f0d4a8';
      case 'low': return '#c8dfe8';
      default: return '#e8e6e3';
    }
  };

  const getPriorityLabel = (priority: string) => {
    switch (priority) {
      case 'high': return 'Haute';
      case 'medium': return 'Moyenne';
      case 'low': return 'Basse';
      default: return priority;
    }
  };

  const getAssigneeName = (id?: string) => {
    return familyMembers.find(m => m.id === id)?.name || 'Non assignée';
  };

  const isOverdue = (dueDate: string) => {
    return new Date(dueDate) < new Date() && dueDate !== new Date().toISOString().split('T')[0];
  };

  return (
    <div className="pb-24">
      <div className="sticky top-0 bg-background/95 backdrop-blur z-10 p-4 border-b border-border">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-3xl font-bold text-foreground">Tâches & Emploi du temps</h1>
          <Button
            onClick={() => {
              setEditingTask(null);
              setFormData({
                title: '',
                description: '',
                category: 'household',
                assignedTo: '',
                dueDate: selectedDate.toISOString().split('T')[0],
                dueTime: '',
                duration: 30,
                priority: 'medium',
                recurring: false,
                frequency: 'weekly',
              });
              setShowForm(true);
            }}
            size="sm"
          >
            <Plus className="w-4 h-4 mr-2" />
            Nouvelle tâche
          </Button>
        </div>
        
        <div className="flex gap-2">
          <Button
            variant={filter === 'pending' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('pending')}
          >
            À faire ({tasks.filter(t => !t.completed).length})
          </Button>
          <Button
            variant={filter === 'completed' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('completed')}
          >
            Complétées ({tasks.filter(t => t.completed).length})
          </Button>
          <Button
            variant={filter === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('all')}
          >
            Tout
          </Button>
        </div>
      </div>

      {/* Calendrier journalier */}
      <div className="p-4">
        <DaySchedule
          tasks={tasks}
          appointments={appointments}
          selectedDate={selectedDate}
          onDateChange={setSelectedDate}
        />
      </div>

      <div className="p-4 space-y-3">
        {filteredTasks.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Aucune tâche à afficher</p>
          </div>
        ) : (
          filteredTasks.map(task => (
            <Card
              key={task.id}
              className={`p-4 transition-all ${task.completed ? 'opacity-60 bg-muted' : ''} ${
                isOverdue(task.dueDate) && !task.completed ? 'border-destructive/50' : ''
              }`}
            >
              <div className="flex items-start gap-3">
                <button
                  onClick={() => updateTask(task.id, { completed: !task.completed })}
                  className={`flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                    task.completed
                      ? 'bg-primary border-primary'
                      : 'border-border hover:border-primary'
                  }`}
                >
                  {task.completed && <Check className="w-4 h-4 text-primary-foreground" />}
                </button>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className={`font-medium ${task.completed ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                      {task.title}
                    </h3>
                    {isOverdue(task.dueDate) && !task.completed && (
                      <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0 mt-1" />
                    )}
                  </div>

                  {task.description && (
                    <p className="text-sm text-muted-foreground mt-1">{task.description}</p>
                  )}

                  <div className="flex gap-2 mt-2 flex-wrap">
                    <Badge
                      variant="secondary"
                      style={{ backgroundColor: getCategoryColor(task.category) + '40' }}
                      className="text-xs"
                    >
                      {getCategoryLabel(task.category)}
                    </Badge>
                    <Badge
                      variant="secondary"
                      style={{ backgroundColor: getPriorityColor(task.priority) + '40' }}
                      className="text-xs"
                    >
                      {getPriorityLabel(task.priority)}
                    </Badge>
                    {task.recurring && (
                      <Badge variant="secondary" className="text-xs">
                        {FREQUENCIES.find(f => f.value === task.recurring?.frequency)?.label}
                      </Badge>
                    )}
                  </div>

                  <div className="flex gap-3 mt-2 text-xs text-muted-foreground">
                    <span>📅 {new Date(task.dueDate).toLocaleDateString('fr-FR')}</span>
                    {task.dueTime && (
                      <span>🕐 {task.dueTime}</span>
                    )}
                    {task.assignedTo && (
                      <span>👤 {getAssigneeName(task.assignedTo)}</span>
                    )}
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => handleEditTask(task)}
                    className="flex-shrink-0 text-muted-foreground hover:text-primary transition-colors"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => deleteTask(task.id)}
                    className="flex-shrink-0 text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </Card>
          ))
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-end z-50">
          <Card className="w-full rounded-t-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold">{editingTask ? 'Modifier la tâche' : 'Ajouter une tâche'}</h2>

            <div>
              <label className="text-sm font-medium text-foreground">Titre</label>
              <Input
                placeholder="Ex: Faire le ménage"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="mt-1"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-foreground">Description</label>
              <Input
                placeholder="Détails optionnels"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="mt-1"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-foreground">Catégorie</label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value as any })}
                  className="w-full mt-1 p-2 border border-border rounded-md bg-background text-foreground"
                >
                  {CATEGORIES.map(cat => (
                    <option key={cat.value} value={cat.value}>{cat.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-sm font-medium text-foreground">Priorité</label>
                <select
                  value={formData.priority}
                  onChange={(e) => setFormData({ ...formData, priority: e.target.value as any })}
                  className="w-full mt-1 p-2 border border-border rounded-md bg-background text-foreground"
                >
                  <option value="low">Basse</option>
                  <option value="medium">Moyenne</option>
                  <option value="high">Haute</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-foreground">Date</label>
                <Input
                  type="date"
                  value={formData.dueDate}
                  onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                  className="mt-1"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-foreground">Assignée à</label>
                <select
                  value={formData.assignedTo}
                  onChange={(e) => setFormData({ ...formData, assignedTo: e.target.value })}
                  className="w-full mt-1 p-2 border border-border rounded-md bg-background text-foreground"
                >
                  <option value="">Non assignée</option>
                  {familyMembers.map(member => (
                    <option key={member.id} value={member.id}>{member.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-foreground">Heure (optionnel)</label>
                <Input
                  type="time"
                  value={formData.dueTime}
                  onChange={(e) => setFormData({ ...formData, dueTime: e.target.value })}
                  className="mt-1"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-foreground">Durée (minutes)</label>
                <Input
                  type="number"
                  value={formData.duration}
                  onChange={(e) => setFormData({ ...formData, duration: parseInt(e.target.value) || 30 })}
                  className="mt-1"
                  min="15"
                  step="15"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="recurring"
                checked={formData.recurring}
                onChange={(e) => setFormData({ ...formData, recurring: e.target.checked })}
                className="w-4 h-4"
              />
              <label htmlFor="recurring" className="text-sm font-medium text-foreground">
                Tâche récurrente
              </label>
            </div>

            {formData.recurring && (
              <div>
                <label className="text-sm font-medium text-foreground">Fréquence</label>
                <select
                  value={formData.frequency}
                  onChange={(e) => setFormData({ ...formData, frequency: e.target.value as any })}
                  className="w-full mt-1 p-2 border border-border rounded-md bg-background text-foreground"
                >
                  {FREQUENCIES.map(freq => (
                    <option key={freq.value} value={freq.value}>{freq.label}</option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground mt-1">
                  {formData.frequency === 'weekly' && 
                    `Se répétera tous les ${new Date(formData.dueDate).toLocaleDateString('fr-FR', { weekday: 'long' })}`}
                  {formData.frequency === 'monthly' && 
                    `Se répétera tous les ${new Date(formData.dueDate).getDate()} de chaque mois`}
                  {formData.frequency === 'yearly' && 
                    `Se répétera chaque année le ${new Date(formData.dueDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}`}
                  {formData.frequency === 'daily' && 
                    `Se répétera tous les jours`}
                </p>
              </div>
            )}

            <div className="flex gap-3 pt-4">
              <Button
                variant="outline"
                onClick={() => {
                  setShowForm(false);
                  setEditingTask(null);
                }}
                className="flex-1"
              >
                Annuler
              </Button>
              <Button
                onClick={handleAddTask}
                className="flex-1"
              >
                {editingTask ? 'Modifier' : 'Ajouter'}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
