const celebratedOptions = new Set<string>();

export function hasCelebrated(optionId: string): boolean {
  return celebratedOptions.has(optionId);
}

export function markCelebrated(optionId: string): void {
  celebratedOptions.add(optionId);
}

export function playCelebrationSound(): void {
  try {
    const ctx = new AudioContext();

    const notes = [523, 659, 784, 1047];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.15, ctx.currentTime + i * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.12 + 0.4);

      osc.start(ctx.currentTime + i * 0.12);
      osc.stop(ctx.currentTime + i * 0.12 + 0.4);
    });
  } catch {
    /* audio not available */
  }
}

export function launchConfetti(container: HTMLElement): void {
  const colors = ['#f57c8c', '#5fc976', '#9b6dc6', '#ebbd3d', '#4eb1f9', '#ec8b81', '#a89be9'];
  const count = 60;

  const wrapper = document.createElement('div');
  wrapper.className = 'confetti-container';
  container.appendChild(wrapper);

  for (let i = 0; i < count; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    const color = colors[Math.floor(Math.random() * colors.length)];
    const left = Math.random() * 100;
    const delay = Math.random() * 0.5;
    const duration = 1.5 + Math.random() * 1.5;
    const rotation = Math.random() * 360;
    const size = 6 + Math.random() * 6;

    piece.style.cssText = `
      position: absolute;
      left: ${left}%;
      top: -10px;
      width: ${size}px;
      height: ${size * 0.6}px;
      background: ${color};
      border-radius: 2px;
      animation: confetti-fall ${duration}s ease-in ${delay}s forwards;
      transform: rotate(${rotation}deg);
      opacity: 1;
    `;
    wrapper.appendChild(piece);
  }

  setTimeout(() => {
    wrapper.remove();
  }, 3500);
}
