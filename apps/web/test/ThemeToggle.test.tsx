import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeToggle } from '../src/components/ui/ThemeToggle';

describe('ThemeToggle component', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('data-theme-preference');
  });

  it('renders all 3 theme options as an accessible radio group', () => {
    render(<ThemeToggle />);

    const radiogroup = screen.getByRole('radiogroup', { name: /theme selector/i });
    expect(radiogroup).toBeDefined();

    expect(screen.getByRole('radio', { name: /light theme/i })).toBeDefined();
    expect(screen.getByRole('radio', { name: /dark theme/i })).toBeDefined();
    expect(screen.getByRole('radio', { name: /system theme/i })).toBeDefined();
  });

  it('switches to dark theme when clicking dark button', async () => {
    const user = userEvent.setup();
    const onThemeChange = vi.fn();

    render(<ThemeToggle onThemeChange={onThemeChange} />);

    const darkBtn = screen.getByRole('radio', { name: /dark theme/i });
    await user.click(darkBtn);

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme-preference')).toBe('dark');
    expect(localStorage.getItem('oams_theme')).toBe('dark');
    expect(onThemeChange).toHaveBeenCalledWith('dark');
    expect(darkBtn.getAttribute('aria-checked')).toBe('true');
  });

  it('switches to light theme when clicking light button', async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);

    const lightBtn = screen.getByRole('radio', { name: /light theme/i });
    await user.click(lightBtn);

    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(document.documentElement.getAttribute('data-theme-preference')).toBe('light');
    expect(localStorage.getItem('oams_theme')).toBe('light');
    expect(lightBtn.getAttribute('aria-checked')).toBe('true');
  });
});
