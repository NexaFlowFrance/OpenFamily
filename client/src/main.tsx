import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { AppToastProvider } from './components/ui';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <BrowserRouter>
            <ThemeProvider>
                <AppToastProvider>
                    <AuthProvider>
                        <App />
                    </AuthProvider>
                </AppToastProvider>
            </ThemeProvider>
        </BrowserRouter>
    </React.StrictMode>
);
