import { useState, useEffect } from 'react';

export function useTheme() {
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('theme');
    return saved || 'dark'; // default gelap
  });

  const [fontSize, setFontSize] = useState(() => {
    const saved = localStorage.getItem('fontSize');
    return saved || 'sedang'; // default sedang
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.setAttribute('data-fontsize', fontSize);
    localStorage.setItem('fontSize', fontSize);
  }, [fontSize]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const setThemeMode = (mode) => {
    setTheme(mode);
  };

  return { theme, toggleTheme, setThemeMode, fontSize, setFontSize };
}
