// Minimal inline SVG icon set (24x24, stroke = currentColor) — no emoji.

export type IconName =
  | 'settings'
  | 'users'
  | 'rocket'
  | 'globe'
  | 'clipboard'
  | 'shield'
  | 'refresh'
  | 'user'
  | 'id-card'
  | 'key'
  | 'check'
  | 'check-circle'
  | 'loader'
  | 'circle'
  | 'terminal'
  | 'zap'
  | 'close'
  | 'arrow-up-right'
  | 'search'
  | 'sparkles'
  | 'plus'
  | 'folder'
  | 'external-link';

const PATHS: Record<IconName, string> = {
  settings:
    '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.56V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.56-1H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6h.09A1.7 1.7 0 0 0 10 3.04V3a2 2 0 1 1 4 0v.09A1.7 1.7 0 0 0 15 4.6a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9v.09a1.7 1.7 0 0 0 1.56 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1z"/>',
  users:
    '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  rocket:
    '<path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>',
  globe:
    '<circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
  clipboard:
    '<rect width="14" height="16" x="5" y="4" rx="2"/><path d="M9 4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1H9V4z"/><path d="M9 12h6"/><path d="M9 16h4"/>',
  shield:
    '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
  refresh:
    '<path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/>',
  user:
    '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  'id-card':
    '<rect width="20" height="14" x="2" y="5" rx="2"/><circle cx="8" cy="12" r="2.5"/><path d="M14 10h4"/><path d="M14 14h4"/><path d="M4.5 17a4 4 0 0 1 7 0"/>',
  key:
    '<circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.7 12.3 8.3-8.3"/><path d="m16 7 3 3"/><path d="m13 10 3 3"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  'check-circle':
    '<circle cx="12" cy="12" r="10"/><path d="m8.5 12.5 2.5 2.5 4.5-5"/>',
  loader:
    '<path d="M21 12a9 9 0 1 1-6.22-8.56"/>',
  circle: '<circle cx="12" cy="12" r="8"/>',
  terminal:
    '<rect width="20" height="14" x="2" y="5" rx="2"/><path d="m7 10 3 2-3 2"/><path d="M13 14h4"/>',
  zap: '<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z"/>',
  close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  'arrow-up-right':
    '<path d="M7 17 17 7"/><path d="M8 7h9v9"/>',
  search:
    '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  sparkles:
    '<path d="M12 3v4"/><path d="M12 17v4"/><path d="M3 12h4"/><path d="M17 12h4"/><path d="m6.3 6.3 2.4 2.4"/><path d="m15.3 15.3 2.4 2.4"/><path d="m17.7 6.3-2.4 2.4"/><path d="m8.7 15.3-2.4 2.4"/>',
  folder:
    '<path d="M20 9a2 2 0 0 0-1.2-1.87l-2-1A2 2 0 0 0 15.3 6H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2z"/>',
  'external-link':
    '<path d="M15 3h6v6"/><path d="M21 3 11 13"/><path d="M5 5v14h14"/>',
};

export function icon(name: IconName, cls = 'w-4 h-4', sw = 1.75): string {
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name]}</svg>`;
}

/** Filled dot used for status indicators. */
export function dot(cls = 'w-1.5 h-1.5'): string {
  return `<svg class="${cls}" viewBox="0 0 8 8" aria-hidden="true"><circle cx="4" cy="4" r="4" fill="currentColor"/></svg>`;
}
