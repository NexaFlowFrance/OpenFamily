import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { WebSocketProvider } from './contexts/WebSocketContext';
import { AppToastProvider } from './components/ui';
import App from './App';
import './i18n';
import './index.css';

// The static GitHub Pages demo is served from a sub-path with no server-side
// routing, so it uses HashRouter; the real app keeps clean BrowserRouter URLs.
const Router = import.meta.env.VITE_DEMO ? HashRouter : BrowserRouter;

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
