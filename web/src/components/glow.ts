/**
 * Vercel-style Mouse Pointer Glow & Ambient Spotlight
 */
export function initCursorGlow() {
  if (typeof window === 'undefined') return;

  // Skip touch devices / non-hover pointers
  if (window.matchMedia('(hover: none)').matches) return;

  const root = document.documentElement;

  function onMouseMove(e: MouseEvent) {
    // 1. Update global viewport spotlight coordinates (wherever the cursor goes)
    root.style.setProperty('--cursor-x', `${e.clientX}px`);
    root.style.setProperty('--cursor-y', `${e.clientY}px`);
    root.style.setProperty('--cursor-opacity', '1');

    // 2. Track relative position for hovered glass panels to cast Vercel border beam
    const target = e.target as HTMLElement | null;
    const panel = target?.closest('.glass-panel, .glass-card, .tilt-card') as HTMLElement | null;
    if (panel) {
      const rect = panel.getBoundingClientRect();
      const x = (e.clientX - rect.left).toFixed(1);
      const y = (e.clientY - rect.top).toFixed(1);
      panel.style.setProperty('--mouse-x', `${x}px`);
      panel.style.setProperty('--mouse-y', `${y}px`);
    }
  }

  function onMouseLeave() {
    root.style.setProperty('--cursor-opacity', '0');
  }

  window.addEventListener('mousemove', onMouseMove, { passive: true });
  document.addEventListener('mouseleave', onMouseLeave);
}
