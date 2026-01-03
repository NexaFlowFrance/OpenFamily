import { useState, useEffect } from 'react';
import { useApp } from '@/contexts/AppContext';
import { useAddButton } from '@/contexts/AddButtonContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Trash2, Plus, Check, AlertCircle, Edit2, Archive, TrendingUp } from 'lucide-react';
import { getDayOfWeek, getDayOfMonth, generateTaskOccurrences } from '@/lib/recurrence';
import { logger } from '../lib/logger';
import { formatDateOnly, parseDateOnly } from '@/lib/dateOnly';
import type { Task } from '@/types';

type TaskFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly';
type TaskPriority = 'low' | 'medium' | 'high';
type TaskCategory = 'household' | 'baby' | 'personal' | 'other';

const getCategoryDefaults = (t: any) => [
  { value: 'household', label: t.tasks.household, color: '#6b8e7f' },
  { value: 'baby', label: t.tasks.baby, color: '#f0d4a8' },
  { value: 'personal', label: t.tasks.personal, color: '#c8dfe8' },
  { value: 'other', label: t.tasks.other, color: '#e8e6e3' },
];

const getFrequencyDefaults = (t: any) => [
  { value: 'daily', label: t.tasks.daily },
  { value: 'weekly', label: t.tasks.weekly },
  { value: 'monthly', label: t.tasks.monthly },
  { value: 'yearly', label: t.tasks.yearly },
];

export default function Tasks() {
  const { tasks, familyMembers, addTask, updateTask, deleteTask } = useApp();
  const { setAddAction } = useAddButton();
  const { t } = useLanguage();
  
  const CATEGORIES = getCategoryDefaults(t);
  const FREQUENCIES = getFrequencyDefaults(t);
  const [showForm, setShowForm] = useState(false);
  const [editingTask, setEditingTask] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'pending' | 'completed' | 'history'>('pending');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [formData, setFormData] = useState<{
    title: string;
    description: string;
    category: TaskCategory;
    assignedTo: string;
    dueDate: string;
    dueTime: string;
    duration: number;
    priority: TaskPriority;
    recurring: boolean;
    frequency: TaskFrequency;
  }>({
    title: '',
    description: '',
    category: 'household',
    assignedTo: '',
    dueDate: formatDateOnly(new Date()),
    dueTime: '',
    duration: 30,
    priority: 'medium',
    recurring: false,
    frequency: 'weekly',
  });

  useEffect(() => {
    const addAction = () => {
      setShowForm(true);
    };
    setAddAction(addAction);
    return () => setAddAction(null);
  }, [setAddAction]);

  const handleAddTask = async () => {
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
        const newTask = {
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
        };
        await addTask(newTask);
      }
      
      setFormData({
        title: '',
        description: '',
        category: 'household',
        assignedTo: '',
        dueDate: formatDateOnly(new Date()),
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

  // Calculer les tâches du jour sélectionné
  const getDayTasks = () => {
    const dateStr = formatDateOnly(selectedDate);
    const dayStart = new Date(selectedDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(selectedDate);
    dayEnd.setHours(23, 59, 59, 999);
    
    logger.log('📅 getDayTasks - selectedDate:', dateStr);
    logger.log('📅 All tasks:', tasks);
    
    const dayTasks: Array<{ task: Task; occurrence: { date: string; time?: string }; isCompleted: boolean }> = [];
    const taskIdsInDay = new Set<string>();
    
    tasks.forEach(task => {
      logger.log('🔍 Processing task:', task.title, 'recurring:', task.recurring, 'dueDate:', task.dueDate);
      const occurrences = task.recurring 
        ? generateTaskOccurrences(task, dayStart, dayEnd)
        : [{ date: task.dueDate, time: task.dueTime }];
      
      logger.log('🔍 Occurrences for', task.title, ':', occurrences);
      
      occurrences.forEach(occ => {
        if (occ.date === dateStr) {
          const isCompleted = task.recurring 
            ? (task.completedDates?.includes(occ.date) || false)
            : task.completed;
          dayTasks.push({ task, occurrence: occ, isCompleted });
          taskIdsInDay.add(task.id);
        }
      });
    });
    
    logger.log('📅 Day tasks for', dateStr, ':', dayTasks);
    
    return { dayTasks, taskIdsInDay };
  };

  const { dayTasks, taskIdsInDay } = getDayTasks();

  const filteredTasks = tasks.filter(task => {
    // Exclure les tâches qui sont affichées dans la section du jour sélectionné
    if (taskIdsInDay.has(task.id)) return false;
    
    // Pour les tâches récurrentes qui ne sont pas aujourd'hui, vérifier leur statut global
    // Pour les tâches normales, vérifier leur statut completed
    const isTaskCompleted = task.recurring 
      ? false // Les tâches récurrentes futures ne sont jamais "complétées" globalement
      : task.completed;
    
    // Appliquer les autres filtres
    if (filter === 'pending') return !isTaskCompleted;
    if (filter === 'completed') return isTaskCompleted;
    if (filter === 'history') return isTaskCompleted;
    return true;
  });

  // Statistiques pour l'historique
  const completedTasks = tasks.filter(t => t.completed);
  const completedThisWeek = completedTasks.filter(t => {
    const completedDate = new Date(t.createdAt);
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    return completedDate >= weekAgo;
  });
  const completionRate = tasks.length > 0 
    ? Math.round((completedTasks.length / tasks.length) * 100) 
    : 0;

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
      case 'high': return t.tasks.high;
      case 'medium': return t.tasks.medium;
      case 'low': return t.tasks.low;
      default: return priority;
    }
  };

  const getAssigneeName = (id?: string) => {
    return familyMembers.find(m => m.id === id)?.name || t.tasks.notAssigned;
  };

  const isOverdue = (dueDate: string) => {
    if (!dueDate) return false;
    const due = parseDateOnly(dueDate);
    const todayStr = formatDateOnly(new Date());
    const today = parseDateOnly(todayStr);
    return due < today && dueDate !== todayStr;
  };

  const pendingTasksCount = dayTasks.filter(t => !t.isCompleted).length;
  const completedTasksCount = dayTasks.filter(t => t.isCompleted).length;

  return (
    <div className="pb-24">
      <div className="sticky top-0 bg-background/95 backdrop-blur z-20 p-4 border-b border-border">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-3xl font-bold text-foreground">{t.tasks.title}</h1>
          <Button
            onClick={() => {
              setEditingTask(null);
              setFormData({
                title: '',
                description: '',
                category: 'household',
                assignedTo: '',
                  dueDate: formatDateOnly(selectedDate),
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
            {t.tasks.newTask}
          </Button>
        </div>
        
        <div className="flex gap-2 overflow-x-auto">
          <Button
            variant={filter === 'pending' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('pending')}
          >
            {t.tasks.pending} ({pendingTasksCount})
          </Button>
          <Button
            variant={filter === 'completed' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('completed')}
          >
            {t.tasks.completed} ({completedTasksCount})
          </Button>
          <Button
            variant={filter === 'history' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('history')}
          >
            <Archive className="w-4 h-4 mr-1" />
            {t.tasks.history}
          </Button>
          <Button
            variant={filter === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('all')}
          >
            {t.tasks.all}
          </Button>
        </div>
      </div>

      {/* Calendrier journalier */}
      <div className="p-4">
        {/* Sélecteur de date */}
        <div className="mb-4 flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const newDate = new Date(selectedDate);
              newDate.setDate(selectedDate.getDate() - 1);
              setSelectedDate(newDate);
            }}
          >
            ←
          </Button>
          <div className="flex-1 text-center font-medium">
            {selectedDate.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const newDate = new Date(selectedDate);
              newDate.setDate(selectedDate.getDate() + 1);
              setSelectedDate(newDate);
            }}
          >
            →
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSelectedDate(new Date())}
          >
            {t.tasks.today}
          </Button>
        </div>
        
        {/* Tâches du jour sélectionné */}
        <Card className="mt-4 p-4">
          <h3 className="font-semibold text-foreground mb-3">
            {t.tasks.tasksFor} {selectedDate.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </h3>
          {(() => {
            // Trier par heure (avec heure en premier, puis sans heure)
            const sortedDayTasks = [...dayTasks].sort((a, b) => {
              if (a.occurrence.time && !b.occurrence.time) return -1;
              if (!a.occurrence.time && b.occurrence.time) return 1;
              if (a.occurrence.time && b.occurrence.time) return a.occurrence.time.localeCompare(b.occurrence.time);
              return 0;
            });
            
            if (sortedDayTasks.length === 0) {
              return (
                <p className="text-sm text-muted-foreground text-center py-4">
                  {t.tasks.noTasksForDay}
                </p>
              );
            }
            
            return (
              <div className="space-y-2">
                {sortedDayTasks.map(({ task, occurrence, isCompleted }, index) => (
                  <div
                    key={`${task.id}-${occurrence.date}-${index}`}
                    className={`flex items-start gap-3 p-3 rounded-lg border ${
                      isCompleted ? 'bg-muted/50 opacity-60' : 'bg-background'
                    }`}
                  >
                    <button
                      onClick={() => {
                        if (task.recurring) {
                          // Pour les tâches récurrentes, toggle la complétion de cette occurrence
                          const completedDates = task.completedDates || [];
                          const newCompletedDates = isCompleted
                            ? completedDates.filter(d => d !== occurrence.date)
                            : [...completedDates, occurrence.date];
                          updateTask(task.id, { completedDates: newCompletedDates });
                        } else {
                          // Pour les tâches normales, toggle le champ completed
                          updateTask(task.id, { completed: !task.completed });
                        }
                      }}
                      className={`flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                        isCompleted
                          ? 'bg-primary border-primary'
                          : 'border-border hover:border-primary'
                      }`}
                    >
                      {isCompleted && <Check className="w-3 h-3 text-primary-foreground" />}
                    </button>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {occurrence.time && (
                          <Badge variant="outline" className="text-xs">
                            {occurrence.time}
                          </Badge>
                        )}
                        <span className={`text-sm font-medium ${isCompleted ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                          {task.title}
                        </span>
                        <Badge
                          variant="secondary"
                          style={{ backgroundColor: getCategoryColor(task.category) + '40' }}
                          className="text-xs"
                        >
                          {getCategoryLabel(task.category)}
                        </Badge>
                      </div>
                      {task.description && (
                        <p className="text-xs text-muted-foreground mt-1">{task.description}</p>
                      )}
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
                ))}
              </div>
            );
          })()}
        </Card>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-end z-50">
          <Card className="w-full rounded-t-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold">{editingTask ? t.tasks.editTask : t.tasks.addTask}</h2>

            <div>
              <label className="text-sm font-medium text-foreground">{t.tasks.taskTitle}</label>
              <Input
                placeholder={t.tasks.titlePlaceholder}
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="mt-1"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-foreground">{t.tasks.description}</label>
              <Input
                placeholder={t.tasks.descriptionPlaceholder}
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="mt-1"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-foreground">{t.tasks.category}</label>
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
                <label className="text-sm font-medium text-foreground">{t.tasks.priority}</label>
                <select
                  value={formData.priority}
                  onChange={(e) => setFormData({ ...formData, priority: e.target.value as any })}
                  className="w-full mt-1 p-2 border border-border rounded-md bg-background text-foreground"
                >
                  <option value="low">{t.tasks.low}</option>
                  <option value="medium">{t.tasks.medium}</option>
                  <option value="high">{t.tasks.high}</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-foreground">{t.tasks.date}</label>
                <Input
                  type="date"
                  value={formData.dueDate}
                  onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                  className="mt-1"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-foreground">{t.tasks.assignedTo}</label>
                <select
                  value={formData.assignedTo}
                  onChange={(e) => setFormData({ ...formData, assignedTo: e.target.value })}
                  className="w-full mt-1 p-2 border border-border rounded-md bg-background text-foreground"
                >
                  <option value="">{t.tasks.notAssigned}</option>
                  {familyMembers.map(member => (
                    <option key={member.id} value={member.id}>{member.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-foreground">{t.tasks.time}</label>
                <Input
                  type="time"
                  value={formData.dueTime}
                  onChange={(e) => setFormData({ ...formData, dueTime: e.target.value })}
                  className="mt-1"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-foreground">{t.tasks.duration}</label>
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
                {t.tasks.recurringTask}
              </label>
            </div>

            {formData.recurring && (
              <div>
                <label className="text-sm font-medium text-foreground">{t.tasks.frequency}</label>
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
                    `${t.tasks.repeatsEvery} ${new Date(formData.dueDate).toLocaleDateString('fr-FR', { weekday: 'long' })}`}
                  {formData.frequency === 'monthly' && 
                    t.tasks.repeatsEveryMonth.replace('{day}', new Date(formData.dueDate).getDate().toString())}
                  {formData.frequency === 'yearly' && 
                    t.tasks.repeatsEveryYear.replace('{date}', new Date(formData.dueDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }))}
                  {formData.frequency === 'daily' && 
                    t.tasks.repeatsEveryDay}
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
                {t.cancel}
              </Button>
              <Button
                onClick={handleAddTask}
                className="flex-1"
              >
                {editingTask ? t.edit : t.add}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
