import React, { createContext, useEffect, useState, ReactNode } from 'react';

export type Theme = 'light' | 'dark' | 'system' | 'bright-deck';
export type ResolvedTheme = 'light' | 'dark' | 'bright-deck';

interface ThemeContextType {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  setAutoThemeData: (sunrise?: string, sunset?: string) => void;
  isNavigating: boolean;
  setIsNavigating: (v: boolean) => void;
}

/**
 * Automatic Theme Switching Feature:
 * - On initial load, if user hasn't manually set a theme, the app will automatically
 *   switch between light and dark modes based on the time of day
 * - Uses sunrise/sunset times from weather data when available for accurate day/night detection
 * - Falls back to simple time-based detection (6am-6pm = light mode) if sunrise/sunset unavailable
 * - Once user manually toggles the theme, their preference is saved and auto-switching is disabled
 * - Theme updates every minute to detect sunrise/sunset transitions
 */

export const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_STORAGE_KEY = 'seayou-theme';
const MANUAL_THEME_KEY = 'seayou-manual-theme';

function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function getStoredTheme(): Theme | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system' || stored === 'bright-deck') {
      return stored;
    }
  } catch (e) {
    console.warn('Failed to read theme from localStorage', e);
  }
  return null;
}

function storeTheme(theme: Theme): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch (e) {
    console.warn('Failed to save theme to localStorage', e);
  }
}

function isManualTheme(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(MANUAL_THEME_KEY) === 'true';
  } catch (e) {
    console.warn('Failed to read manual theme flag from localStorage', e);
  }
  return false;
}

function setManualThemeFlag(isManual: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    if (isManual) {
      localStorage.setItem(MANUAL_THEME_KEY, 'true');
    } else {
      localStorage.removeItem(MANUAL_THEME_KEY);
    }
  } catch (e) {
    console.warn('Failed to save manual theme flag to localStorage', e);
  }
}

function getAutoTheme(sunrise?: string, sunset?: string): ResolvedTheme {
  const now = new Date();

  // If we have sunrise/sunset data, use it for accurate day/night detection
  if (sunrise && sunset) {
    try {
      const sunriseTime = new Date(sunrise);
      const sunsetTime = new Date(sunset);

      // Check if current time is between sunrise and sunset
      if (now >= sunriseTime && now < sunsetTime) {
        return 'light';
      } else {
        return 'dark';
      }
    } catch (e) {
      console.warn('Failed to parse sunrise/sunset times, falling back to simple time check', e);
    }
  }

  // Fallback: Simple time-based detection (6am-6pm = day)
  const hour = now.getHours();
  return (hour >= 6 && hour < 18) ? 'light' : 'dark';
}

function resolveTheme(theme: Theme, sunrise?: string, sunset?: string): ResolvedTheme {
  if (theme === 'system') {
    return getSystemTheme();
  }
  if (theme === 'bright-deck') {
    return 'bright-deck';
  }
  return theme;
}

interface ThemeProviderProps {
  children: ReactNode;
  defaultTheme?: Theme;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({
  children,
  defaultTheme = 'light' as Theme
}) => {
  const [sunriseTime, setSunriseTime] = useState<string | undefined>(undefined);
  const [sunsetTime, setSunsetTime] = useState<string | undefined>(undefined);
  const [isNavigating, setIsNavigating] = useState(false);

  // Initialize theme from localStorage or default, considering auto-theme
  const [theme, setThemeState] = useState<Theme>(() => {
    const storedTheme = getStoredTheme();

    // If user hasn't manually set a theme, we'll use auto theme in the useEffect
    // but store the default theme value here
    return storedTheme || defaultTheme;
  });

  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => {
    const storedTheme = getStoredTheme();

    // If user hasn't manually set a theme, use auto theme
    if (!storedTheme && !isManualTheme()) {
      return getAutoTheme();
    }

    const themeToResolve: Theme = storedTheme ?? defaultTheme;
    return resolveTheme(themeToResolve);
  });

  // Apply theme class to document root
  useEffect(() => {
    const root = document.documentElement;
    let resolved: ResolvedTheme;

    // Navigation mode always forces bright-deck regardless of user preference
    if (isNavigating) {
      resolved = 'bright-deck';
    } else if (isManualTheme()) {
      // Check if user has manually set a theme
      resolved = resolveTheme(theme);
    } else {
      // Use auto theme based on time of day
      resolved = getAutoTheme(sunriseTime, sunsetTime);
    }

    root.classList.remove('light', 'dark', 'bright-deck');

    if (resolved === 'bright-deck') {
      root.classList.add('bright-deck');
    } else if (resolved === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.add('light');
    }

    setResolvedTheme(resolved);
  }, [theme, sunriseTime, sunsetTime, isNavigating]);

  // Auto-update theme every minute if using auto mode
  useEffect(() => {
    if (isManualTheme()) return;

    const interval = setInterval(() => {
      const autoTheme = getAutoTheme(sunriseTime, sunsetTime);

      if (autoTheme !== resolvedTheme) {
        setResolvedTheme(autoTheme);
        const root = document.documentElement;
        root.classList.remove('light', 'dark', 'bright-deck');
        root.classList.add(autoTheme);
      }
    }, 60000); // Check every minute

    return () => clearInterval(interval);
  }, [resolvedTheme, sunriseTime, sunsetTime]);

  // Listen for system theme changes when theme is set to 'system'
  useEffect(() => {
    if (theme !== 'system') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const handleChange = (e: MediaQueryListEvent) => {
      const newResolvedTheme = e.matches ? 'dark' : 'light';
      setResolvedTheme(newResolvedTheme);

      const root = document.documentElement;
      root.classList.remove('light', 'dark', 'bright-deck');
      root.classList.add(newResolvedTheme);
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme]);

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
    storeTheme(newTheme);
    // Mark as manual theme when user explicitly sets it
    setManualThemeFlag(true);
  };

  const toggleTheme = () => {
    // Toggle between light and dark (bright-deck and system treated as light for this toggle)
    const newTheme: Theme = resolvedTheme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
  };

  const setAutoThemeData = (sunrise?: string, sunset?: string) => {
    setSunriseTime(sunrise);
    setSunsetTime(sunset);
  };

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme, toggleTheme, setAutoThemeData, isNavigating, setIsNavigating }}>
      {children}
    </ThemeContext.Provider>
  );
};
