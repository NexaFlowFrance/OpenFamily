import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from './contexts/AuthContext';
import Layout from './components/layout/Layout';
import Login from './pages/Login';
import Kiosk from './pages/Kiosk';
import Dashboard from './pages/Dashboard';
import ShoppingList from './pages/ShoppingList';
import Tasks from './pages/Tasks';
import Rewards from './pages/Rewards';
import Calendar from './pages/Calendar';
import Planning from './pages/Planning';
import Recipes from './pages/Recipes';
import MealPlanning from './pages/MealPlanning';
import Budget from './pages/Budget';
import Family from './pages/Family';
import Settings from './pages/Settings';
import Join from './pages/Join';
import Integrations from './pages/Integrations';

function App() {
    const { isAuthenticated, loading } = useAuth();
    const { t } = useTranslation('common');
    const location = useLocation();

    if (loading) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-background">
                <div className="flex flex-col items-center gap-3">
                    <div className="spinner-brand" />
                    <p className="text-caption text-muted-foreground">{t('states.loading')}</p>
                </div>
            </div>
        );
    }

    if (!isAuthenticated) {
        return <Login />;
    }

    // Kiosk is a full-screen, chrome-less display — render it outside the Layout.
    if (location.pathname === '/kiosk') {
        return <Kiosk />;
    }

    return (
        <Layout>
            <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/shopping" element={<ShoppingList />} />
                <Route path="/tasks" element={<Tasks />} />
                <Route path="/rewards" element={<Rewards />} />
                <Route path="/calendar" element={<Calendar />} />
                <Route path="/planning" element={<Planning />} />
                <Route path="/recipes" element={<Recipes />} />
                <Route path="/meal-planning" element={<MealPlanning />} />
                <Route path="/budget" element={<Budget />} />
                <Route path="/family" element={<Family />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/integrations" element={<Integrations />} />
                <Route path="/join" element={<Join />} />
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </Layout>
    );
}

export default App;
