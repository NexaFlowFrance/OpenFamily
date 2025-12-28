import { useState, useEffect } from 'react';
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "./contexts/ThemeContext";
import { LanguageProvider } from "./contexts/LanguageContext";
import { AppProvider } from "./contexts/AppContext";
import Navigation from "./components/Navigation";
import SearchBar from "./components/SearchBar";
import Home from "./pages/Home";
import Shopping from "./pages/Shopping";
import Tasks from "./pages/Tasks";
import Appointments from "./pages/Appointments";
import Settings from "./pages/Settings";
import Recipes from "./pages/Recipes";
import Meals from "./pages/Meals";
import Budget from "./pages/Budget";
import Statistics from "./pages/Statistics";
import Onboarding from "./pages/Onboarding";
import ErrorBoundary from "./components/ErrorBoundary";
import { isOnboardingCompleted } from "./lib/configSync";

function AppContent() {
  const [currentPage, setCurrentPage] = useState<'home' | 'shopping' | 'tasks' | 'appointments' | 'settings' | 'recipes' | 'meals' | 'budget' | 'statistics'>('home');
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

  if (showOnboarding) {
    return <Onboarding onComplete={handleOnboardingComplete} />;
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {currentPage === 'home' && <Home onNavigate={setCurrentPage} />}
      {currentPage === 'shopping' && <Shopping />}
      {currentPage === 'tasks' && <Tasks />}
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
        <ThemeProvider defaultTheme="light" switchable={true}>
          <TooltipProvider>
            <AppProvider>
              <Toaster />
              <AppContent />
            </AppProvider>
          </TooltipProvider>
        </ThemeProvider>
      </LanguageProvider>
    </ErrorBoundary>
  );
}

export default App;
