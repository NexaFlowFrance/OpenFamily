import { useState, useEffect } from 'react';
import { useApp } from '@/contexts/AppContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAddButton } from '@/contexts/AddButtonContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, GripVertical, Calendar, User, AlertCircle, Edit2, X } from 'lucide-react';

const getCategoriesLabels = (t: any) => [
  { value: 'household', label: t.tasks.categories.household, color: '#6b8e7f' },
  { value: 'baby', label: t.tasks.categories.baby, color: '#f0d4a8' },
  { value: 'personal', label: t.tasks.categories.personal, color: '#c8dfe8' },
  { value: 'other', label: t.tasks.categories.other, color: '#e8e6e3' },
];

const getColumnsLabels = (t: any) => [
  { id: 'todo', title: t.tasks.kanban.todo, status: 'todo' },
  { id: 'in-progress', title: t.tasks.kanban.inProgress, status: 'in-progress' },
  { id: 'done', title: t.tasks.kanban.done, status: 'done' },
];

export default function TasksKanban() {
  const { t } = useLanguage();
  const { tasks, familyMembers, addTask, updateTask } = useApp();
  const { setAddAction } = useAddButton();
  const [draggedTask, setDraggedTask] = useState<string | null>(null);
  const [touchStartPos, setTouchStartPos] = useState<{ x: number; y: number } | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingTask, setEditingTask] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    category: 'household' as const,
    priority: 'medium' as 'low' | 'medium' | 'high',
    dueDate: '',
    dueTime: '',
    duration: 30,
    assignedTo: '',
    status: 'todo' as 'todo' | 'in-progress' | 'done',
  });

  useEffect(() => {
    setAddAction(() => setShowForm(true));
    return () => setAddAction(null);
  }, [setAddAction]);

  const getCategoryColor = (category: string) => {
    return getCategoriesLabels(t).find(c => c.value === category)?.color || '#e8e6e3';
  };

  const getCategoryLabel = (category: string) => {
    return getCategoriesLabels(t).find(c => c.value === category)?.label || category;
  };

  const getAssigneeName = (id?: string) => {
    return familyMembers.find(m => m.id === id)?.name || t.tasks.notAssigned;
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return '#d97b7b';
      case 'medium': return '#f0d4a8';
      case 'low': return '#c8dfe8';
      default: return '#e8e6e3';
    }
  };

  const isOverdue = (dueDate: string) => {
    return new Date(dueDate) < new Date() && dueDate !== new Date().toISOString().split('T')[0];
  };

  const getTasksByStatus = (status: string) => {
    if (status === 'done') {
      return tasks.filter(t => t.completed);
    }
    return tasks.filter(t => !t.completed && (t.status === status || (!t.status && status === 'todo')));
  };

  const handleDragStart = (taskId: string) => {
    setDraggedTask(taskId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (status: string) => {
    if (draggedTask) {
      const task = tasks.find(t => t.id === draggedTask);
      if (task) {
        if (status === 'done') {
          updateTask(draggedTask, { completed: true, status: 'done' as const });
        } else {
          updateTask(draggedTask, { completed: false, status: status as 'todo' | 'in-progress' });
        }
      }
      setDraggedTask(null);
      setDragOverColumn(null);
    }
  };

  // Support tactile pour mobile
  const handleTouchStart = (taskId: string, e: React.TouchEvent) => {
    // Empêcher la sélection de texte
    e.currentTarget.style.userSelect = 'none';
    e.currentTarget.style.webkitUserSelect = 'none';
    
    const touch = e.touches[0];
    setTouchStartPos({ x: touch.clientX, y: touch.clientY });
    
    // Attendre un peu pour distinguer tap (édition) du drag
    setTimeout(() => {
      if (touchStartPos) {
        setDraggedTask(taskId);
      }
    }, 200);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStartPos) return;
    
    const touch = e.touches[0];
    const deltaX = Math.abs(touch.clientX - touchStartPos.x);
    const deltaY = Math.abs(touch.clientY - touchStartPos.y);
    
    // Si le mouvement est significatif, c'est un drag
    if (deltaX > 10 || deltaY > 10) {
      // Empêcher le scroll dès qu'on détecte un mouvement
      e.preventDefault();
      
      if (!draggedTask) {
        return; // Pas encore de drag initié
      }
      
      // Détecter sur quelle colonne on se trouve
      const columns = document.querySelectorAll('[data-column-id]');
      let targetColumn: string | null = null;
      
      columns.forEach((col) => {
        const rect = col.getBoundingClientRect();
        if (
          touch.clientX >= rect.left &&
          touch.clientX <= rect.right &&
          touch.clientY >= rect.top &&
          touch.clientY <= rect.bottom
        ) {
          targetColumn = col.getAttribute('data-column-id');
        }
      });
      
      setDragOverColumn(targetColumn);
    }
  };

  const handleTouchEnd = (taskId: string, e: React.TouchEvent) => {
    // Réactiver la sélection de texte
    e.currentTarget.style.userSelect = '';
    e.currentTarget.style.webkitUserSelect = '';
    
    if (!touchStartPos) return;
    
    // Si c'était un tap court (pas de drag), ouvrir l'édition
    if (!draggedTask) {
      const task = tasks.find(t => t.id === taskId);
      if (task) {
        handleEditTask(task);
      }
    } else if (dragOverColumn) {
      // Si c'était un drag, changer le statut
      handleDrop(dragOverColumn);
    }
    
    setDraggedTask(null);
    setTouchStartPos(null);
    setDragOverColumn(null);
  };

  const handleEditTask = (task: any) => {
    setEditingTask(task.id);
    setFormData({
      title: task.title,
      description: task.description || '',
      category: task.category,
      priority: task.priority,
      dueDate: task.dueDate || '',
      dueTime: task.dueTime || '',
      duration: task.duration || 30,
      assignedTo: task.assignedTo || '',
      status: task.status || 'todo',
    });
    setShowForm(true);
  };

  const handleSaveTask = () => {
    if (!formData.title.trim()) return;

    const taskData = {
      ...formData,
      dueDate: formData.dueDate || new Date().toISOString().split('T')[0], // Default to today if empty
      completed: formData.status === 'done',
    };

    if (editingTask) {
      updateTask(editingTask, taskData);
    } else {
      addTask(taskData);
    }

    setShowForm(false);
    setEditingTask(null);
    setFormData({
      title: '',
      description: '',
      category: 'household',
      priority: 'medium',
      dueDate: '',
      dueTime: '',
      duration: 30,
      assignedTo: '',
      status: 'todo',
    });
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setEditingTask(null);
    setFormData({
      title: '',
      description: '',
      category: 'household',
      priority: 'medium',
      dueDate: '',
      dueTime: '',
      duration: 30,
      assignedTo: '',
      status: 'todo',
    });
  };

  return (
    <div className="h-full flex flex-col">
      {/* En-tête */}
      <div className="sticky top-0 bg-background/95 backdrop-blur z-10 p-4 border-b border-border">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">{t.tasks.kanban.title}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {t.tasks.kanban.dragDrop}
            </p>
          </div>
          <Button size="sm" onClick={() => setShowForm(true)}>
            <Plus className="w-4 h-4 mr-2" />
            {t.tasks.newTask}
          </Button>
        </div>
      </div>

      {/* Colonnes Kanban */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden">
        <div className="h-full p-4 min-w-max">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 h-full">
            {getColumnsLabels(t).map(column => {
              const columnTasks = getTasksByStatus(column.status);
              const isHighlighted = dragOverColumn === column.status;
              
              return (
                <div
                  key={column.id}
                  data-column-id={column.status}
                  className={`flex flex-col min-h-[200px] md:min-h-0 rounded-lg transition-all ${
                    isHighlighted ? 'bg-primary/10 ring-2 ring-primary' : ''
                  }`}
                  onDragOver={handleDragOver}
                  onDrop={() => handleDrop(column.status)}
                >
                  {/* En-tête de colonne */}
                  <div className="flex items-center justify-between mb-3 px-2">
                    <div className="flex items-center gap-2">
                      <h2 className="font-semibold text-lg">{column.title}</h2>
                      <Badge variant="secondary">{columnTasks.length}</Badge>
                    </div>
                  </div>

                  {/* Liste des tâches */}
                  <div className="flex-1 space-y-2 overflow-y-auto pr-1">
                    {columnTasks.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground text-sm">
                        {t.tasks.noTasks}
                      </div>
                    ) : (
                      columnTasks.map(task => (
                        <Card
                          key={task.id}
                          draggable
                          onDragStart={() => handleDragStart(task.id)}
                          onTouchStart={(e) => handleTouchStart(task.id, e)}
                          onTouchMove={handleTouchMove}
                          onTouchEnd={(e) => handleTouchEnd(task.id, e)}
                          onContextMenu={(e) => e.preventDefault()}
                          className={`p-3 cursor-move hover:shadow-md transition-all group select-none touch-pan-x ${
                            draggedTask === task.id ? 'opacity-50 scale-105 shadow-lg' : ''
                          } ${isOverdue(task.dueDate) && !task.completed ? 'border-destructive/50' : ''}`}
                          style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none', touchAction: 'pan-x' }}
                        >
                          <div className="flex items-start gap-2">
                            <GripVertical className="w-4 h-4 text-muted-foreground mt-1 flex-shrink-0" />
                            
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2">
                                <h3 className="font-medium text-foreground leading-snug">
                                  {task.title}
                                </h3>
                                <div className="flex items-center gap-1 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-6 w-6"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleEditTask(task);
                                    }}
                                    onTouchEnd={(e) => {
                                      e.stopPropagation();
                                      handleEditTask(task);
                                    }}
                                  >
                                    <Edit2 className="w-3 h-3" />
                                  </Button>
                                  {isOverdue(task.dueDate) && !task.completed && (
                                    <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0" />
                                  )}
                                </div>
                              </div>

                              {task.description && (
                                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                  {task.description}
                                </p>
                              )}

                              {/* Badges */}
                              <div className="flex flex-wrap gap-1 mt-2">
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
                                  {task.priority === 'high' ? '🔴' : task.priority === 'medium' ? '🟡' : '🟢'}
                                </Badge>
                                {task.recurring && (
                                  <Badge variant="secondary" className="text-xs">
                                    🔄
                                  </Badge>
                                )}
                              </div>

                              {/* Infos complémentaires */}
                              <div className="flex flex-wrap gap-2 mt-2 text-xs text-muted-foreground">
                                {task.dueDate && (
                                  <div className="flex items-center gap-1">
                                    <Calendar className="w-3 h-3" />
                                    {new Date(task.dueDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                                  </div>
                                )}
                                {task.assignedTo && (
                                  <div className="flex items-center gap-1">
                                    <User className="w-3 h-3" />
                                    {getAssigneeName(task.assignedTo)}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </Card>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Formulaire d'ajout/modification */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-end z-50">
          <Card className="w-full rounded-t-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">
                {editingTask ? t.tasks.editTask : t.tasks.newTask}
              </h2>
              <Button size="icon" variant="ghost" onClick={handleCloseForm}>
                <X className="w-5 h-5" />
              </Button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium text-foreground mb-1 block">{t.tasks.title} *</label>
                <Input
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder={t.tasks.taskNamePlaceholder}
                />
              </div>

              <div>
                <label className="text-sm font-medium text-foreground mb-1 block">{t.tasks.description}</label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder={t.tasks.detailsPlaceholder}
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-foreground mb-1 block">{t.tasks.category}</label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value as any })}
                    className="w-full p-2 border border-border rounded-md bg-background text-foreground"
                  >
                    {getCategoriesLabels(t).map(cat => (
                      <option key={cat.value} value={cat.value}>{cat.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-sm font-medium text-foreground mb-1 block">{t.tasks.priority}</label>
                  <select
                    value={formData.priority}
                    onChange={(e) => setFormData({ ...formData, priority: e.target.value as any })}
                    className="w-full p-2 border border-border rounded-md bg-background text-foreground"
                  >
                    <option value="low">🟢 {t.tasks.priorities.low}</option>
                    <option value="medium">🟡 {t.tasks.priorities.medium}</option>
                    <option value="high">🔴 {t.tasks.priorities.high}</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-foreground mb-1 block">{t.tasks.status}</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                  className="w-full p-2 border border-border rounded-md bg-background text-foreground"
                >
                  <option value="todo">{t.tasks.kanban.todo}</option>
                  <option value="in-progress">{t.tasks.kanban.inProgress}</option>
                  <option value="done">{t.tasks.kanban.done}</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-foreground mb-1 block">{t.tasks.date}</label>
                  <Input
                    type="date"
                    value={formData.dueDate}
                    onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-foreground mb-1 block">{t.tasks.time}</label>
                  <Input
                    type="time"
                    value={formData.dueTime}
                    onChange={(e) => setFormData({ ...formData, dueTime: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-foreground mb-1 block">{t.tasks.assignedTo}</label>
                <select
                  value={formData.assignedTo}
                  onChange={(e) => setFormData({ ...formData, assignedTo: e.target.value })}
                  className="w-full p-2 border border-border rounded-md bg-background text-foreground"
                >
                  <option value="">{t.tasks.notAssigned}</option>
                  {familyMembers.map(member => (
                    <option key={member.id} value={member.id}>{member.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex gap-2 pt-4">
              <Button onClick={handleSaveTask} className="flex-1">
                {editingTask ? t.edit : t.add}
              </Button>
              <Button variant="outline" onClick={handleCloseForm} className="flex-1">
                {t.cancel}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
