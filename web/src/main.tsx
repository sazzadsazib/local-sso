import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './style.css';

// If a user navigates using a legacy hash (#projects or #/projects),
// rewrite it to the clean browser path (/projects).
if (typeof window !== 'undefined' && window.location.hash) {
  const hash = window.location.hash;
  const clean = hash.replace(/^#\/?/, '').split('?')[0];
  const query = hash.includes('?') ? '?' + hash.split('?')[1] : '';
  const validRoutes = ['projects', 'config', 'users', 'examples', 'login', 'callback'];
  if (validRoutes.includes(clean)) {
    window.history.replaceState(null, '', `/${clean}${query || window.location.search}`);
  }
}

const container = document.getElementById('app');
if (container) {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
