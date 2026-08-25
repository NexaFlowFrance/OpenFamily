import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { WebSocketProvider } from './contexts/WebSocketContext';
import { AppToastProvider } from './components/ui';
import App from './App';
import { isNative, initServerConfig } from './lib/serverConfig';
import { initDeepLinks } from './lib/deepLinks';
import './i18n';
import './index.css';

// Demo (sub-path Pages) and the native app (no server-side routing) both use
// HashRouter; the real web app keeps clean BrowserRouter URLs.
const Router = import.meta.env.VITE_DEMO || isNative() ? HashRouter : BrowserRouter;

// Load the saved server URL (native only) before first render, then mount.
// Deep links are wired up in parallel: they only ever navigate, so they do not
// need to be ready before the first paint.
void initDeepLinks();
void initServerConfig().finally(() => {
    ReactDOM.createRoot(document.getElementById('root')!).render(
        <React.StrictMode>
            <Router>
                <ThemeProvider>
                    <AppToastProvider>
                        <AuthProvider>
                            <WebSocketProvider>
                                <App />
                            </WebSocketProvider>
                        </AuthProvider>
                    </AppToastProvider>
                </ThemeProvider>
            </Router>
        </React.StrictMode>
    );
});
