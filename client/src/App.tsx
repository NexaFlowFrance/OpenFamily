import { Routes, Route, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from './contexts/AuthContext';
import Layout from './components/layout/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import ShoppingList from './pages/ShoppingList';
import Tasks from './pages/Tasks';
import Calendar from './pages/Calendar';
import Planning from './pages/Planning';
import Recipes from './pages/Recipes';
import MealPlanning from './pages/MealPlanning';
import Budget from './pages/Budget';
import Family from './pages/Family';
import House from './pages/House';
import Vacations from './pages/Vacations';
import Settings from './pages/Settings';
import CurrencyOnboardingDialog from './components/CurrencyOnboardingDialog';

function App() {
    const { isAuthenticated, loading } = useAuth();
    const { t } = useTranslation();

    if (loading) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-background">
                <div className="flex flex-col items-center gap-3">
                    <div className="spinner-brand" />
                    <p className="text-caption text-muted-foreground">{t('common.loading')}</p>
                </div>
            </div>
        );
    }

    if (!isAuthenticated) {
        return <Login />;
    }

    return (
        <Layout>
            <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/shopping" element={<ShoppingList />} />
                <Route path="/tasks" element={<Tasks />} />
                <Route path="/calendar" element={<Calendar />} />
                <Route path="/planning" element={<Planning />} />
                <Route path="/recipes" element={<Recipes />} />
                <Route path="/meal-planning" element={<MealPlanning />} />
                <Route path="/budget" element={<Budget />} />
                <Route path="/family" element={<Family />} />
                <Route path="/house" element={<House />} />
                <Route path="/vacations" element={<Vacations />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            <CurrencyOnboardingDialog />
        </Layout>
    );
}

export default App;
