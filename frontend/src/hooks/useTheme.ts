import { useState, useEffect } from 'react';

type Theme = 'light' | 'dark';

export function useTheme() {
  const [theme, setTheme] = useState<Theme>('dark'); // Default for SSR matching, updated in useEffect

  useEffect(() => {
    // 1. Read prefers-color-scheme
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    let initialTheme: Theme = systemPrefersDark ? 'dark' : 'light';
    
    // 2. Check local storage
    const storedTheme = localStorage.getItem('stella_theme') as Theme | null;
    if (storedTheme) {
      initialTheme = storedTheme;
    }
    
    setTheme(initialTheme);
    document.documentElement.setAttribute('data-theme', initialTheme);
  }, []);

  const toggleTheme = () => {
    setTheme((prevTheme) => {
      const newTheme = prevTheme === 'light' ? 'dark' : 'light';
      localStorage.setItem('stella_theme', newTheme);
      document.documentElement.setAttribute('data-theme', newTheme);
      return newTheme;
    });
  };

  return { theme, toggleTheme };
}
