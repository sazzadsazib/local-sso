let lastFocusedElement: HTMLElement | null = null;

export function openModal(htmlContent: string) {
  const root = document.getElementById('modal-root');
  if (!root) return;

  lastFocusedElement = document.activeElement as HTMLElement | null;
  root.innerHTML = `<div class="modal-scrim" data-modal-scrim>${htmlContent}</div>`;
  document.body.classList.add('modal-open');

  const modal = root.querySelector<HTMLElement>('.modal');
  if (!modal) return;

  const autoFocusTarget =
    modal.querySelector<HTMLElement>('[data-autofocus]') ||
    modal.querySelector<HTMLElement>('button, input, select, textarea, a[href]');
  if (autoFocusTarget) {
    setTimeout(() => autoFocusTarget.focus(), 30);
  }
}

export function closeModal() {
  const root = document.getElementById('modal-root');
  if (!root || !root.innerHTML) return;

  root.innerHTML = '';
  document.body.classList.remove('modal-open');

  if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
    setTimeout(() => lastFocusedElement?.focus(), 10);
  }
  lastFocusedElement = null;
}

// Global modal listeners
document.addEventListener('keydown', (e) => {
  const modal = document.querySelector<HTMLElement>('#modal-root .modal');
  if (!modal) return;

  if (e.key === 'Escape') {
    e.preventDefault();
    closeModal();
    return;
  }

  if (e.key === 'Tab') {
    const focusable = Array.from(
      modal.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
      )
    ).filter((el) => el.offsetParent !== null);

    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
});

document.addEventListener('click', (e) => {
  const target = e.target as HTMLElement;
  if (target && target.matches('[data-modal-scrim]')) {
    closeModal();
  }
});
