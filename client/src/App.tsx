import { useState, useEffect } from 'react';
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Home as HomeIcon } from 'lucide-react';
import { ThemeProvider } from "@/contexts/ThemeContext";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { CurrencyProvider } from "@/contexts/CurrencyContext";
import { AppProvider } from "@/contexts/AppContext";
import { AddButtonProvider } from "@/contexts/AddButtonContext";
import Navigation from "./components/Navigation";
import SearchBar from "./components/SearchBar";
import Home from "./pages/Home";
import Shopping from "./pages/Shopping";
import Tasks from "./pages/Tasks";
import TasksKanban from "./pages/TasksKanban";
import Appointments from "./pages/Appointments";
import Settings from "./pages/Settings";
import Recipes from "./pages/Recipes";
import Meals from "./pages/Meals";
import Budget from "./pages/Budget";
import Statistics from "./pages/Statistics";
import Onboarding from "./pages/Onboarding";
import ErrorBoundary from "./components/ErrorBoundary";
import { useSwipeToHome } from "./hooks/useSwipeToHome";
import { isOnboardingCompleted } from "./lib/configSync";

function AppContent() {
  const [currentPage, setCurrentPage] = useState<'home' | 'shopping' | 'tasks' | 'tasks-kanban' | 'appointments' | 'settings' | 'recipes' | 'meals' | 'budget' | 'statistics'>('home');
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showSearch, setShowSearch] = useState(false);

  useEffect(() => {
    // Vérifier si l'onboarding a été complété (vérifie serveur si mode serveur)
    const checkOnboarding = async () => {
      const completed = await isOnboardingCompleted();
      if (!completed) {
        setShowOnboarding(true);
      }
    };

    checkOnboarding();

    // Raccourci clavier pour la recherche (Ctrl+K ou Cmd+K)
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setShowSearch(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleOnboardingComplete = () => {
    setShowOnboarding(false);
  };

  // Hook pour le swipe vers la droite pour revenir à l'accueil
  const swipeProgress = useSwipeToHome({
    onSwipeRight: () => setCurrentPage('home'),
    enabled: currentPage !== 'home' && !showSearch,
  });

  if (showOnboarding) {
    return <Onboarding onComplete={handleOnboardingComplete} />;
  }

  return (
    <div className="min-h-screen bg-background text-foreground relative">
      {/* Indicateur de swipe */}
      {swipeProgress > 0 && (
        <div
          className="fixed inset-0 pointer-events-none z-50 flex items-center justify-start"
          style={{
            background: `linear-gradient(to right, rgba(107, 142, 127, ${swipeProgress * 0.1}), transparent)`,
          }}
        >
          <div
            className="ml-8 transition-all duration-100"
            style={{
              transform: `translateX(${swipeProgress * 50}px) scale(${0.5 + swipeProgress * 0.5})`,
              opacity: swipeProgress,
            }}
          >
            <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center shadow-2xl">
              <HomeIcon className="w-8 h-8 text-primary-foreground" />
            </div>
          </div>
        </div>
      )}

      {currentPage === 'home' && <Home onNavigate={setCurrentPage} />}
      {currentPage === 'shopping' && <Shopping />}
      {currentPage === 'tasks' && <Tasks />}
      {currentPage === 'tasks-kanban' && <TasksKanban />}
      {currentPage === 'appointments' && <Appointments />}
      {currentPage === 'settings' && <Settings />}
      {currentPage === 'recipes' && <Recipes />}
      {currentPage === 'meals' && <Meals />}
      {currentPage === 'budget' && <Budget />}
      {currentPage === 'statistics' && <Statistics />}
      
      <Navigation 
        currentPage={currentPage} 
        onPageChange={setCurrentPage}
        onSearchClick={() => setShowSearch(true)}
      />

      {showSearch && (
        <SearchBar 
          onNavigate={setCurrentPage} 
          onClose={() => setShowSearch(false)}
        />
      )}
    </div>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <LanguageProvider>
        <CurrencyProvider>
          <ThemeProvider defaultTheme="light" switchable={true}>
            <TooltipProvider>
              <AppProvider>
                <AddButtonProvider>
                  <Toaster />
                  <AppContent />
                </AddButtonProvider>
              </AppProvider>
            </TooltipProvider>
          </ThemeProvider>
        </CurrencyProvider>
      </LanguageProvider>
    </ErrorBoundary>
  );
}

export default App;
