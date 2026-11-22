import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'trr-theme';

function getSystemTheme() {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function getStoredPreference() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(STORAGE_KEY);
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  document.documentElement.classList.toggle('dark', theme === 'dark');
}

export function useTheme() {
  const [mode, setModeState] = useState(() => getStoredPreference() || 'auto');
  const [theme, setTheme] = useState(() => getStoredPreference() || getSystemTheme());

  const resolveTheme = useCallback((m) => m === 'auto' ? getSystemTheme() : m, []);

  const setMode = useCallback((newMode) => {
    setModeState(newMode);
    const resolved = resolveTheme(newMode);
    setTheme(resolved);
    applyTheme(resolved);
    if (newMode === 'auto') localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, newMode);
  }, [resolveTheme]);

  const toggleTheme = useCallback(() => {
    const nextMode = mode === 'auto'
      ? (getSystemTheme() === 'dark' ? 'light' : 'dark')
      : mode === 'light' ? 'dark' : 'light';
    setMode(nextMode);
  }, [mode, setMode]);

  useEffect(() => {
    applyTheme(resolveTheme(mode));
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      if (!getStoredPreference()) {
        const sys = getSystemTheme();
        setTheme(sys);
        applyTheme(sys);
      }
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [mode, resolveTheme]);

  return { theme, mode, toggleTheme, setMode };
}
