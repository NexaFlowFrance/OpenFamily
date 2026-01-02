import React, { createContext, useContext, useEffect, useState } from "react";
import { Capacitor } from '@capacitor/core';
import { logger } from '../lib/logger';

type Theme = "light" | "dark" | "auto";

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme?: () => void;
  switchable: boolean;
  actualTheme: "light" | "dark"; // Le thème réellement appliqué
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

interface ThemeProviderProps {
  children: React.ReactNode;
  defaultTheme?: Theme;
  switchable?: boolean;
}

export function ThemeProvider({
  children,
  defaultTheme = "auto",
  switchable = false,
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(() => {
    if (switchable) {
      const stored = localStorage.getItem("theme");
      return (stored as Theme) || defaultTheme;
    }
    return defaultTheme;
  });

  const [actualTheme, setActualTheme] = useState<"light" | "dark">("light");

  // Détecter le thème système
  useEffect(() => {
    if (theme !== "auto") {
      setActualTheme(theme);
      return;
    }

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    
    const updateTheme = () => {
      setActualTheme(mediaQuery.matches ? "dark" : "light");
    };

    // Initialiser
    updateTheme();

    // Écouter les changements
    mediaQuery.addEventListener("change", updateTheme);

    return () => {
      mediaQuery.removeEventListener("change", updateTheme);
    };
  }, [theme]);

  useEffect(() => {
    const root = document.documentElement;
    if (actualTheme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }

    // Couleurs de fond
    const lightBg = '#faf8f5';
    const darkBg = '#1a1a1a';
    const bgColor = actualTheme === 'dark' ? darkBg : lightBg;

    // Mettre à jour la couleur du thème pour la barre de statut mobile (PWA)
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      metaThemeColor.setAttribute('content', bgColor);
    }

    // Mettre à jour la couleur de la status bar pour Capacitor (Android/iOS)
    const updateNativeStatusBar = async () => {
      if (Capacitor.isNativePlatform()) {
        try {
          const { StatusBar } = await import('@capacitor/status-bar');
          if (actualTheme === 'dark') {
            await StatusBar.setBackgroundColor({ color: darkBg });
            await StatusBar.setStyle({ style: 'DARK' }); // Contenu clair sur fond sombre
          } else {
            await StatusBar.setBackgroundColor({ color: lightBg });
            await StatusBar.setStyle({ style: 'LIGHT' }); // Contenu sombre sur fond clair
          }
        } catch (error) {
          logger.log('StatusBar API not available:', error);
        }
      }
    };
    
    updateNativeStatusBar();

    if (switchable) {
      localStorage.setItem("theme", theme);
    }
  }, [actualTheme, theme, switchable]);

  const toggleTheme = switchable
    ? () => {
        setTheme(prev => {
          if (prev === "light") return "dark";
          if (prev === "dark") return "auto";
          return "light";
        });
      }
    : undefined;

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme, switchable, actualTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}
