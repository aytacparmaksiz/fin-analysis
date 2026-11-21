'use client';

import { useEffect } from 'react';

const INTERACTIVE_SELECTOR =
  'button:not(:disabled):not([aria-disabled="true"]), [role="button"]:not([aria-disabled="true"]), a[href], .fv-card, .fv-row, .fv-pill, .ui-card-interactive';

const FORM_CONTROL_SELECTOR = 'input, textarea, select, option, [contenteditable="true"]';

function detectPulseAccent(el: HTMLElement): string {
  const cls = typeof el.className === 'string' ? el.className : '';
  if (/emerald|teal/.test(cls)) return 'emerald';
  if (/f5c242|amber|yellow/.test(cls)) return 'gold';
  if (/rose|red/.test(cls)) return 'rose';
  if (/sky|cyan|blue/.test(cls)) return 'sky';
  if (/purple|violet|indigo/.test(cls)) return 'purple';
  return 'neutral';
}

export default function TactileFeedback() {
  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    const tapTimers = new WeakMap<HTMLElement, number>();

    const prefersReducedMotion = () =>
      window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const applyTapFeedback = (interactive: HTMLElement) => {
      const isTableRow = interactive.tagName === 'TR' || interactive.classList.contains('fv-row');
      const tapClass = isTableRow ? 'fv-row-tap' : 'fv-tactile-tap';

      const prevTimer = tapTimers.get(interactive);
      if (prevTimer) window.clearTimeout(prevTimer);

      interactive.classList.remove(tapClass);
      window.requestAnimationFrame(() => {
        interactive.classList.add(tapClass);
        const nextTimer = window.setTimeout(() => {
          interactive.classList.remove(tapClass);
          tapTimers.delete(interactive);
        }, 195);
        tapTimers.set(interactive, nextTimer);
      });
    };

    const handlePointerDown = (e: PointerEvent) => {
      if (e.button !== 0 || prefersReducedMotion()) return;
      const target = e.target as HTMLElement | null;
      if (!target || typeof target.closest !== 'function') return;

      // Arama çubuğu / input / select içine tıklarken üst kapsayıcı karta dokunma efekti uygulama
      if (target.closest(FORM_CONTROL_SELECTOR)) return;

      const interactive = target.closest(INTERACTIVE_SELECTOR) as HTMLElement | null;
      if (!interactive) return;

      // Hızlı tıklamalarda (15ms trackpad tap dahil) hissedilir yay geri bildirimi
      applyTapFeedback(interactive);

      // Tıklama noktasında ince, yerel ve kesintisiz mikro-halka nabzı
      const accent = detectPulseAccent(interactive);
      const pulse = document.createElement('span');
      pulse.className = `fv-click-pulse fv-click-pulse--${accent}`;
      pulse.setAttribute('aria-hidden', 'true');
      pulse.style.left = `${e.clientX}px`;
      pulse.style.top = `${e.clientY}px`;
      document.body.appendChild(pulse);

      let removed = false;
      const cleanup = () => {
        if (!removed) {
          removed = true;
          pulse.remove();
        }
      };
      pulse.addEventListener('animationend', cleanup, { once: true });
      window.setTimeout(cleanup, 460);
    };

    document.addEventListener('pointerdown', handlePointerDown, { passive: true });
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, []);

  return null;
}
