import { useState } from 'react';
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "./contexts/ThemeContext";
import { AppProvider } from "./contexts/AppContext";
import Navigation from "./components/Navigation";
import Home from "./pages/Home";
import Shopping from "./pages/Shopping";
import Tasks from "./pages/Tasks";
import Appointments from "./pages/Appointments";
import Settings from "./pages/Settings";
import Recipes from "./pages/Recipes";
import Meals from "./pages/Meals";
import Budget from "./pages/Budget";
import Statistics from "./pages/Statistics";
import ErrorBoundary from "./components/ErrorBoundary";

function AppContent() {
  const [currentPage, setCurrentPage] = useState<'home' | 'shopping' | 'tasks' | 'appointments' | 'settings' | 'recipes' | 'meals' | 'budget' | 'statistics'>('home');

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
      
      <Navigation currentPage={currentPage} onPageChange={setCurrentPage} />
    </div>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light" switchable={true}>
        <TooltipProvider>
          <AppProvider>
            <Toaster />
            <AppContent />
          </AppProvider>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
