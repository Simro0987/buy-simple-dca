import confetti from 'canvas-confetti';

/** Professional terminal-style burst when a DCA week is saved. */
export function fireWeekSaveConfetti(): void {
  const colors = ['#10b981', '#14F195', '#9945FF', '#627EEA', '#F7931A', '#ffffff'];

  confetti({
    particleCount: 80,
    spread: 55,
    startVelocity: 42,
    origin: { x: 0.5, y: 0.72 },
    colors,
    ticks: 180,
    gravity: 1.05,
    scalar: 0.85,
    zIndex: 9999,
    disableForReducedMotion: true,
  });

  window.setTimeout(() => {
    confetti({
      particleCount: 45,
      spread: 100,
      startVelocity: 28,
      origin: { x: 0.5, y: 0.68 },
      colors,
      ticks: 140,
      gravity: 0.95,
      scalar: 0.75,
      zIndex: 9999,
      disableForReducedMotion: true,
    });
  }, 160);
}
