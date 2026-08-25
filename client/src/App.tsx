import type { ReactElement } from 'react';
import { useState } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from './contexts/AuthContext';
import { isNative, isServerConfigured } from './lib/serverConfig';
import Layout from './components/layout/Layout';
import Login from './pages/Login';
import ResetPassword from './pages/ResetPassword';
import Kiosk from './pages/Kiosk';
import ServerSetup from './pages/ServerSetup';
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
    const { isAuthenticated, loading, isModuleEnabled } = useAuth();
    const { t } = useTranslation('common');
    const location = useLocation();
    const navigate = useNavigate();

    // For an optional module: render its element only when enabled, otherwise
    // redirect to the dashboard so a bookmarked/typed URL never shows a hidden page.
    const moduleRoute = (key: string, element: ReactElement) =>
        isModuleEnabled(key) ? element : <Navigate to="/" replace />;

    const [serverReady, setServerReady] = useState(isServerConfigured());

    // Native app, first launch: ask which self-hosted server to connect to.
    if (isNative() && !serverReady) {
        return <ServerSetup onConfigured={() => setServerReady(true)} />;
    }

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

    // Password reset arrives by email link, so it must work while logged out.
    if (location.pathname === '/reset-password') {
        return <ResetPassword onDone={() => navigate('/', { replace: true })} />;
    }

    if (!isAuthenticated) {
        return <Login />;
    }

    // Kiosk is a full-screen, chrome-less display — render it outside the Layout.
    if (location.pathname === '/kiosk') {
        return isModuleEnabled('kiosk') ? <Kiosk /> : <Navigate to="/" replace />;
    }

    return (
        <Layout>
            <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/shopping" element={<ShoppingList />} />
                <Route path="/tasks" element={<Tasks />} />
                <Route path="/rewards" element={moduleRoute('rewards', <Rewards />)} />
                <Route path="/calendar" element={<Calendar />} />
                <Route path="/planning" element={moduleRoute('planning', <Planning />)} />
                <Route path="/recipes" element={moduleRoute('recipes', <Recipes />)} />
                <Route path="/meal-planning" element={moduleRoute('meals', <MealPlanning />)} />
                <Route path="/budget" element={moduleRoute('budget', <Budget />)} />
                <Route path="/family" element={<Family />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/integrations" element={moduleRoute('integrations', <Integrations />)} />
                <Route path="/join" element={<Join />} />
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </Layout>
    );
}

export default App;
