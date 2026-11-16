import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';

type Theme = 'light' | 'dark' | 'system';

/**
 * Where the sections of the app are listed on a wide screen: a menu down the
 * side, or the same bar as on a phone, at the bottom, with everything else
 * behind "More". Kept on the device, like the theme: a wall tablet and a
 * laptop need not agree.
 */
export type NavStyle = 'sidebar' | 'dock';
const NAV_STYLE_KEY = 'of_nav_style';

interface ThemeContextType {
    theme: Theme;
    setTheme: (theme: Theme) => void;
    actualTheme: 'light' | 'dark';
    navStyle: NavStyle;
    setNavStyle: (style: NavStyle) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [theme, setTheme] = useState<Theme>(() => {
        const stored = localStorage.getItem('theme') as Theme;
        return stored || 'system';
    });

    const [actualTheme, setActualTheme] = useState<'light' | 'dark'>('light');

    const [navStyle, setNavStyleState] = useState<NavStyle>(() => {
        try {
            return localStorage.getItem(NAV_STYLE_KEY) === 'dock' ? 'dock' : 'sidebar';
        } catch {
            return 'sidebar';
        }
    });
    const setNavStyle = (style: NavStyle) => {
        setNavStyleState(style);
        try {
            localStorage.setItem(NAV_STYLE_KEY, style);
        } catch {
            // Storage refused (private window): the choice lasts for this visit.
        }
    };

    useEffect(() => {
        const root = window.document.documentElement;
        root.classList.remove('light', 'dark');

        let effectiveTheme: 'light' | 'dark';

        if (theme === 'system') {
            effectiveTheme = window.matchMedia('(prefers-color-scheme: dark)').matches
                ? 'dark'
                : 'light';
        } else {
            effectiveTheme = theme;
        }

        root.classList.add(effectiveTheme);
        setActualTheme(effectiveTheme);
        localStorage.setItem('theme', theme);
    }, [theme]);

    return (
        <ThemeContext.Provider value={{ theme, setTheme, actualTheme, navStyle, setNavStyle }}>
            {children}
        </ThemeContext.Provider>
    );
};

export const useTheme = () => {
    const context = useContext(ThemeContext);
    if (context === undefined) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
};
