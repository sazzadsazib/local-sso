import { icon } from './icons';

export function showToast(message: string, type: 'success' | 'info' | 'error' = 'success', duration = 3200) {
  const container = document.getElementById('toast-region') || document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast${type === 'error' ? ' is-error' : ''}`;
  toast.innerHTML = `
    ${icon(type === 'error' ? 'alert' : 'check-circle', 'w-4 h-4')}
    <span>${message}</span>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('is-leaving');
    setTimeout(() => toast.remove(), 180);
  }, duration);
}
