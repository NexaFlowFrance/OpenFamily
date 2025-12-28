import { useState } from 'react';
import { Settings, Home, ArrowLeft, Plus, ShoppingCart, CheckSquare, BarChart3, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useApp } from '@/contexts/AppContext';

interface NavigationProps {
  currentPage: 'home' | 'shopping' | 'tasks' | 'appointments' | 'settings' | 'recipes' | 'meals' | 'budget' | 'statistics';
  onPageChange: (page: 'home' | 'shopping' | 'tasks' | 'appointments' | 'settings' | 'recipes' | 'meals' | 'budget' | 'statistics') => void;
  onSearchClick?: () => void;
}

export default function Navigation({ currentPage, onPageChange, onSearchClick }: NavigationProps) {
  const { addShoppingItem, addTask } = useApp();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [mode, setMode] = useState<'shopping' | 'task'>('task');
  const [inputValue, setInputValue] = useState('');
  const [taskDate, setTaskDate] = useState(new Date().toISOString().split('T')[0]);
  const [taskTime, setTaskTime] = useState('');

  const handleQuickAdd = () => {
    if (!inputValue.trim()) return;

    if (mode === 'shopping') {
      addShoppingItem({
        name: inputValue,
        category: 'food',
        quantity: 1,
        price: 0,
        completed: false,
        notes: '',
      });
    } else if (mode === 'task') {
      addTask({
        title: inputValue,
        description: '',
        dueDate: taskDate,
        dueTime: taskTime || undefined,
        duration: taskTime ? 30 : undefined,
        completed: false,
        category: 'personal',
        priority: 'medium',
        assignedTo: '',
      });
    }

    setInputValue('');
    setTaskDate(new Date().toISOString().split('T')[0]);
    setTaskTime('');
    setIsDialogOpen(false);
  };

  const handleBack = () => {
    // Si on est sur la page d'accueil, ne rien faire
    if (currentPage === 'home') return;
    
    // Sinon retourner à l'accueil
    onPageChange('home');
  };

  const handleAddClick = () => {
    // Déterminer le mode par défaut selon la page actuelle
    if (currentPage === 'shopping') {
      setMode('shopping');
    } else {
      setMode('task');
    }
    setIsDialogOpen(true);
  };

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 bg-background border-t border-border z-40 shadow-lg">
        <div className="flex items-center justify-around h-20 px-2">
          {/* Bouton Accueil */}
          <button
            onClick={() => onPageChange('home')}
            className={`flex flex-col items-center justify-center gap-1 w-20 h-full transition-colors relative ${
              currentPage === 'home'
                ? 'text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Home className="w-6 h-6" />
            <span className="text-xs font-medium">Accueil</span>
            {currentPage === 'home' && (
              <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-8 h-1 bg-primary rounded-b" />
            )}
          </button>

          {/* Bouton Retour */}
          <button
            onClick={handleBack}
            className={`flex flex-col items-center justify-center gap-1 w-20 h-full transition-colors ${
              currentPage === 'home'
                ? 'text-muted-foreground/50'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            disabled={currentPage === 'home'}
          >
            <ArrowLeft className="w-6 h-6" />
            <span className="text-xs font-medium">Retour</span>
          </button>

          {/* Bouton + central surélevé */}
          <button
            onClick={handleAddClick}
            className="flex flex-col items-center justify-center -mt-8 relative"
          >
            <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center shadow-xl hover:shadow-2xl transition-all hover:scale-110 border-4 border-background">
              <Plus className="w-8 h-8 text-primary-foreground" />
            </div>
            <span className="text-xs font-medium text-primary mt-1">Ajouter</span>
          </button>

          {/* Bouton Statistiques */}
          <button
            onClick={() => onPageChange('statistics')}
            className={`flex flex-col items-center justify-center gap-1 w-20 h-full transition-colors relative ${
              currentPage === 'statistics'
                ? 'text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <BarChart3 className="w-6 h-6" />
            <span className="text-xs font-medium">Stats</span>
            {currentPage === 'statistics' && (
              <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-8 h-1 bg-primary rounded-b" />
            )}
          </button>

          {/* Bouton Paramètres */}
          <button
            onClick={() => onPageChange('settings')}
            className={`flex flex-col items-center justify-center gap-1 w-20 h-full transition-colors relative ${
              currentPage === 'settings'
                ? 'text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Settings className="w-6 h-6" />
            <span className="text-xs font-medium">Paramètres</span>
            {currentPage === 'settings' && (
              <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-8 h-1 bg-primary rounded-b" />
            )}
          </button>
        </div>
      </nav>

      {/* Dialog d'ajout rapide */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Ajouter rapidement
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Sélecteur de mode */}
            <div className="flex gap-2">
              <Button
                variant={mode === 'task' ? 'default' : 'outline'}
                className="flex-1"
                onClick={() => setMode('task')}
              >
                <CheckSquare className="w-4 h-4 mr-2" />
                Tâche
              </Button>
              <Button
                variant={mode === 'shopping' ? 'default' : 'outline'}
                className="flex-1"
                onClick={() => setMode('shopping')}
              >
                <ShoppingCart className="w-4 h-4 mr-2" />
                Article
              </Button>
            </div>

            <Input
              placeholder={mode === 'shopping' ? 'Ex: Pain, Lait...' : 'Ex: Appeler le médecin...'}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && inputValue.trim()) {
                  handleQuickAdd();
                }
              }}
              autoFocus
            />

            {/* Champs date et heure pour les tâches */}
            {mode === 'task' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-foreground">Date</label>
                  <Input
                    type="date"
                    value={taskDate}
                    onChange={(e) => setTaskDate(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground">Heure (optionnel)</label>
                  <Input
                    type="time"
                    value={taskTime}
                    onChange={(e) => setTaskTime(e.target.value)}
                    className="mt-1"
                  />
                </div>
              </div>
            )}
            
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => setIsDialogOpen(false)}
                className="flex-1"
              >
                Annuler
              </Button>
              <Button
                onClick={handleQuickAdd}
                className="flex-1"
                disabled={!inputValue.trim()}
              >
                Ajouter
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
