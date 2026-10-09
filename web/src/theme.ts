export type Theme = 'dark' | 'light';

const THEME_STORAGE_KEY = 'local-sso-theme';

export function getTheme(): Theme {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') {
      return saved;
    }
  } catch {}
  return 'dark'; // Default is dark
}

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === 'light') {
    root.classList.remove('dark');
    root.classList.add('light');
  } else {
    root.classList.remove('light');
    root.classList.add('dark');
  }

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute('content', theme === 'light' ? '#ffffff' : '#000000');
  }
}

export function setTheme(theme: Theme) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {}
  applyTheme(theme);
}

export function toggleTheme(): Theme {
  const current = getTheme();
  const next: Theme = current === 'dark' ? 'light' : 'dark';
  setTheme(next);
  return next;
}
