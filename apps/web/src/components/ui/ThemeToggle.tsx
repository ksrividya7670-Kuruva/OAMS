import { useEffect, useState, type FC } from 'react';
import { Sun, Moon, Laptop } from 'lucide-react';

export type ThemePreference = 'light' | 'dark' | 'system';

interface ThemeToggleProps {
  className?: string;
  onThemeChange?: (theme: ThemePreference) => void;
}

export const ThemeToggle: FC<ThemeToggleProps> = ({ className = '', onThemeChange }) => {
  const [theme, setTheme] = useState<ThemePreference>('system');

  useEffect(() => {
    // Read initial preference
    const match = document.cookie.match(/(?:^|; )oams_theme=([^;]*)/);
    const stored = match
      ? (decodeURIComponent(match[1]) as ThemePreference)
      : (localStorage.getItem('oams_theme') as ThemePreference);
    const initialTheme = stored && ['light', 'dark', 'system'].includes(stored) ? stored : 'system';
    setTheme(initialTheme);
    applyTheme(initialTheme);
  }, []);

  const applyTheme = (newTheme: ThemePreference) => {
    setTheme(newTheme);

    // Persist in localStorage and non-sensitive cookie
    try {
      localStorage.setItem('oams_theme', newTheme);
      document.cookie = `oams_theme=${newTheme}; path=/; max-age=31536000; SameSite=Lax`;
    } catch {
      // ignore storage errors
    }

    // Resolve system preference
    let resolved = newTheme;
    if (newTheme === 'system') {
      resolved = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }

    document.documentElement.setAttribute('data-theme', resolved);
    document.documentElement.setAttribute('data-theme-preference', newTheme);
    document.documentElement.classList.toggle('dark', resolved === 'dark');

    if (onThemeChange) {
      onThemeChange(newTheme);
    }
  };

  useEffect(() => {
    if (theme !== 'system') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      const res = e.matches ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', res);
      document.documentElement.classList.toggle('dark', res === 'dark');
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme]);

  const options: { id: ThemePreference; label: string; icon: typeof Sun }[] = [
    { id: 'light', label: 'Light theme', icon: Sun },
    { id: 'dark', label: 'Dark theme', icon: Moon },
    { id: 'system', label: 'System theme', icon: Laptop },
  ];

  return (
    <div
      role="radiogroup"
      aria-label="Theme selector"
      className={`inline-flex items-center p-1 rounded-lg border border-[var(--border-default)] bg-[var(--bg-subtle)] text-[var(--text-muted)] ${className}`}
    >
      {options.map(({ id, label, icon: Icon }) => {
        const isSelected = theme === id;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={isSelected}
            aria-label={label}
            title={label}
            onClick={() => applyTheme(id)}
            className={`flex items-center justify-center p-1.5 rounded-md text-xs font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] ${
              isSelected
                ? 'bg-[var(--bg-surface)] text-[var(--text-main)] shadow-xs'
                : 'hover:text-[var(--text-main)] hover:bg-[var(--bg-surface)]/50'
            }`}
          >
            <Icon className="w-4 h-4" aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
};
