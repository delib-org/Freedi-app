/**
 * Simple sound effects using Web Audio API
 * For prototype use only
 */

let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  }
  return audioContext;
}

/**
 * Play a whoosh sound effect
 * Uses white noise with bandpass filter sweep for realistic whoosh
 */
export function playWhooshSound() {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    const duration = 0.4;

    // Create white noise buffer
    const bufferSize = ctx.sampleRate * duration;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    // Fill with white noise
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    // Create nodes
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const bandpass = ctx.createBiquadFilter();
    bandpass.type = 'bandpass';
    bandpass.Q.setValueAtTime(1, now);

    // Sweep from high to low frequency for whoosh effect
    bandpass.frequency.setValueAtTime(3000, now);
    bandpass.frequency.exponentialRampToValueAtTime(300, now + duration);

    const gainNode = ctx.createGain();

    // Envelope: quick fade in, sustain, then fade out
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(0.3, now + 0.05); // Fast attack
    gainNode.gain.linearRampToValueAtTime(0.25, now + 0.15); // Sustain
    gainNode.gain.exponentialRampToValueAtTime(0.01, now + duration); // Fade out

    // Connect the chain
    noise.connect(bandpass);
    bandpass.connect(gainNode);
    gainNode.connect(ctx.destination);

    // Play
    noise.start(now);
    noise.stop(now + duration);

  } catch (error) {
    // Silently fail if audio context not available
    console.info('Audio not available:', error);
  }
}

/**
 * Play a short click sound for button taps
 */
export function playClickSound() {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(800, now);

    gainNode.gain.setValueAtTime(0.1, now);
    gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.05);

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.start(now);
    oscillator.stop(now + 0.05);

  } catch (error) {
    console.info('Audio not available:', error);
  }
}
