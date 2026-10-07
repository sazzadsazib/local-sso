/**
 * Subtle 3D Card Tilt Animation on Mouse Move
 */
export function initCardTilt() {
  if (typeof window === 'undefined') return;

  // Skip touch / non-hover devices
  if (window.matchMedia('(hover: none)').matches) return;

  let activeCard: HTMLElement | null = null;
  let rafId: number | null = null;
  let targetRotateX = 0;
  let targetRotateY = 0;
  let currentRotateX = 0;
  let currentRotateY = 0;

  const MAX_TILT = 2.0; // Ultra-subtle and light tilt angle in degrees
  const PERSPECTIVE = 1200; // Flatter 3D perspective depth in px
  const LERP_FACTOR = 0.12; // Smoothing factor for silky motion

  function tick() {
    if (!activeCard) {
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      return;
    }

    currentRotateX += (targetRotateX - currentRotateX) * LERP_FACTOR;
    currentRotateY += (targetRotateY - currentRotateY) * LERP_FACTOR;

    activeCard.style.transform = `perspective(${PERSPECTIVE}px) rotateX(${currentRotateX.toFixed(2)}deg) rotateY(${currentRotateY.toFixed(2)}deg) scale3d(1.002, 1.002, 1.002)`;

    rafId = requestAnimationFrame(tick);
  }

  function resetCard(card: HTMLElement) {
    card.classList.remove('is-tilting');
    card.style.transform = `perspective(${PERSPECTIVE}px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)`;
  }

  function onMouseMove(e: MouseEvent) {
    // Only apply tilt to elements explicitly designated as .tilt-card
    const card = (e.target as HTMLElement)?.closest('.tilt-card') as HTMLElement | null;

    if (!card || card.closest('#userModal, .fixed')) {
      if (activeCard) {
        resetCard(activeCard);
        activeCard = null;
      }
      return;
    }

    if (activeCard !== card) {
      if (activeCard) {
        resetCard(activeCard);
      }
      activeCard = card;
      activeCard.classList.add('is-tilting');
      currentRotateX = 0;
      currentRotateY = 0;
      if (!rafId) {
        rafId = requestAnimationFrame(tick);
      }
    }

    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    targetRotateX = ((y - centerY) / centerY) * -MAX_TILT;
    targetRotateY = ((x - centerX) / centerX) * MAX_TILT;

    // Dynamic specular reflection position
    const shineX = ((x / rect.width) * 100).toFixed(1);
    const shineY = ((y / rect.height) * 100).toFixed(1);
    card.style.setProperty('--mouse-x', `${shineX}%`);
    card.style.setProperty('--mouse-y', `${shineY}%`);
  }

  function onMouseLeave() {
    if (activeCard) {
      resetCard(activeCard);
      activeCard = null;
    }
  }

  document.addEventListener('mousemove', onMouseMove, { passive: true });
  document.addEventListener('mouseleave', onMouseLeave);
}
