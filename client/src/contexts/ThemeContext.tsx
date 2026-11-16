import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';

type Theme = 'light' | 'dark' | 'system';

/**
 * Where the sections of the app are listed on a wide screen: a bar with the
 * sections of every day, set at the bottom, on the left or on the right, with
 * everything else behind "More"; or a menu of every section down the side.
 * On a phone the bar is always at the bottom.
 */
export type NavStyle = 'dock' | 'dock-left' | 'dock-right' | 'sidebar';
export const NAV_STYLES: readonly NavStyle[] = ['dock', 'dock-left', 'dock-right', 'sidebar'];

/** The colour of buttons, links and what is selected. Coral is the logo's. */
export type Accent = 'coral' | 'blue' | 'green' | 'violet' | 'orange' | 'slate';
export const ACCENTS: readonly Accent[] = ['coral', 'blue', 'green', 'violet', 'orange', 'slate'];

export type Corners = 'round' | 'square';
export type TextSize = 'normal' | 'large';

// All of these are kept on the device, like the theme: a tablet on the wall
// and a laptop need not agree, and nothing here is worth a request to the server.
const KEYS = {
    navStyle: 'of_nav_style',
    accent: 'of_accent',
    corners: 'of_corners',
    textSize: 'of_text_size',
} as const;

const stored = <T extends string>(key: string, allowed: readonly T[], fallback: T): T => {
    try {
        const value = localStorage.getItem(key);
        return (allowed as readonly string[]).includes(value ?? '') ? (value as T) : fallback;
    } catch {
        return fallback;
    }
};

const keep = (key: string, value: string) => {
    try {
        localStorage.setItem(key, value);
    } catch {
        // Storage refused (private window): the choice lasts for this visit.
    }
};

interface ThemeContextType {
    theme: Theme;
    setTheme: (theme: Theme) => void;
    actualTheme: 'light' | 'dark';
    navStyle: NavStyle;
    setNavStyle: (style: NavStyle) => void;
    accent: Accent;
    setAccent: (accent: Accent) => void;
    corners: Corners;
    setCorners: (corners: Corners) => void;
    textSize: TextSize;
    setTextSize: (size: TextSize) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [theme, setTheme] = useState<Theme>(() => {
        const value = localStorage.getItem('theme') as Theme;
        return value || 'system';
    });

    const [actualTheme, setActualTheme] = useState<'light' | 'dark'>('light');
    const [navStyle, setNavStyleState] = useState<NavStyle>(() => stored(KEYS.navStyle, NAV_STYLES, 'dock'));
    const [accent, setAccentState] = useState<Accent>(() => stored(KEYS.accent, ACCENTS, 'coral'));
    const [corners, setCornersState] = useState<Corners>(() => stored(KEYS.corners, ['round', 'square'] as const, 'round'));
    const [textSize, setTextSizeState] = useState<TextSize>(() => stored(KEYS.textSize, ['normal', 'large'] as const, 'normal'));

    const setNavStyle = (style: NavStyle) => { setNavStyleState(style); keep(KEYS.navStyle, style); };
    const setAccent = (value: Accent) => { setAccentState(value); keep(KEYS.accent, value); };
    const setCorners = (value: Corners) => { setCornersState(value); keep(KEYS.corners, value); };
    const setTextSize = (value: TextSize) => { setTextSizeState(value); keep(KEYS.textSize, value); };

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

    // The stylesheet reads these (design/tokens.css): the defaults carry no
    // attribute, so a page that never touched the settings is styled as before.
    useEffect(() => {
        const root = window.document.documentElement;
        const set = (name: string, value: string, fallback: string) => {
            if (value === fallback) root.removeAttribute(name);
            else root.setAttribute(name, value);
        };
        set('data-accent', accent, 'coral');
        set('data-corners', corners, 'round');
        set('data-text', textSize, 'normal');
    }, [accent, corners, textSize]);

    return (
        <ThemeContext.Provider
            value={{ theme, setTheme, actualTheme, navStyle, setNavStyle, accent, setAccent, corners, setCorners, textSize, setTextSize }}
        >
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
