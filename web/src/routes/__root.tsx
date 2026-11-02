import { useState, useEffect, useCallback } from 'react';
import { createRootRoute, Outlet, useNavigate } from '@tanstack/react-router';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';
import { ToastContainer, showToast } from '../components/toast';
import { getTheme, toggleTheme, applyTheme, Theme } from '../theme';
import { initCardTilt } from '../components/tilt';
import { initCursorGlow } from '../components/glow';
import { saveActiveProject } from '../storage';
import { Profile } from '../types';

export const Route = createRootRoute({
  component: RootComponent,
});

function RootComponent() {
  const [theme, setThemeState] = useState<Theme>(() => getTheme());
  const navigate = useNavigate();

  const handleDeepLink = useCallback(() => {
    if (typeof window === 'undefined') return;
    const hash = window.location.hash;
    const search = window.location.search;

    // Check query params or hash query for cfg / auto
    const params = new URLSearchParams(search || (hash.includes('?') ? hash.split('?')[1] : ''));
    const cfg = params.get('cfg');
    const auto = params.get('auto');

    if (cfg) {
      try {
        const decoded = JSON.parse(atob(cfg.replace(/-/g, '+').replace(/_/g, '/'))) as Profile;
        saveActiveProject(decoded);
        showToast('Imported project from launcher link');
      } catch (e: unknown) {
        console.error('Failed to parse cfg deep link', e);
      }
    }

    if (auto === '1') {
      void navigate({ to: '/login' });
    }
  }, [navigate]);

  useEffect(() => {
    applyTheme(theme);
    initCardTilt();
    initCursorGlow();
    handleDeepLink();
  }, [theme, handleDeepLink]);

  const handleToggleTheme = () => {
    const next = toggleTheme();
    setThemeState(next);
    showToast(`Switched to ${next} theme`, 'info');
  };

  return (
    <div className="relative z-10 flex flex-col flex-1 min-h-screen">
      <Navbar theme={theme} onToggleTheme={handleToggleTheme} />
      <main className="flex-1 flex flex-col">
        <Outlet />
      </main>
      <Footer />
      <ToastContainer />
    </div>
  );
}
