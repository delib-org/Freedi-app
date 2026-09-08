/**
 * The game's only sounds, and there are three of them.
 *
 * Synthesised rather than shipped: an applause sample is a 100KB download on a
 * classroom wifi that already carries thirty clients, and filtered noise with
 * the right envelope reads as a room clapping perfectly well at this length.
 *
 * A classroom is thirty devices in one room, so this is deliberately tiny in
 * scope — the two rare milestones, nothing else — and it can be silenced from
 * the celebration itself, where a student who wants quiet is already looking.
 */

const PREF_KEY = 'agora_sound';

let context: AudioContext | null = null;

export function isSoundOn(): boolean {
	try {
		return localStorage.getItem(PREF_KEY) !== 'off';
	} catch {
		return true;
	}
}

export function toggleSound(): boolean {
	const next = !isSoundOn();
	try {
		localStorage.setItem(PREF_KEY, next ? 'on' : 'off');
	} catch {
		// Storage blocked — the choice holds for this sitting only
	}

	return next;
}

/**
 * The audio context can only be created (and resumed) off the back of a real
 * gesture. These sounds fire from Firestore events, so the context is built
 * lazily and resumed hopefully: by the time a milestone lands the student has
 * been tapping for several minutes, and a browser that still refuses just
 * leaves the celebration silent, which is a fine outcome.
 */
function ctx(): AudioContext | null {
	if (typeof window === 'undefined') return null;
	try {
		const Ctor =
			window.AudioContext ??
			(window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
		if (!Ctor) return null;
		context ??= new Ctor();
		if (context.state === 'suspended') void context.resume();

		return context;
	} catch {
		return null;
	}
}

/**
 * iOS Safari — the tablet a classroom actually runs on — will only START an
 * audio context inside a real gesture, and these sounds fire from Firestore
 * events, which are never one. So the context is opened on the student's first
 * tap of the lesson and kept warm; by the time a milestone lands it is ready.
 * Costs nothing when the student never earns one, and stays silent either way
 * if the browser still refuses.
 */
if (typeof document !== 'undefined') {
	const unlock = (): void => {
		document.removeEventListener('pointerdown', unlock);
		document.removeEventListener('keydown', unlock);
		if (isSoundOn()) ctx();
	};
	document.addEventListener('pointerdown', unlock, { once: true });
	document.addEventListener('keydown', unlock, { once: true });
}

/** A short burst of filtered noise — one pair of hands */
function clap(audio: AudioContext, at: number, gain: number): void {
	const length = Math.floor(audio.sampleRate * 0.09);
	const buffer = audio.createBuffer(1, length, audio.sampleRate);
	const data = buffer.getChannelData(0);
	for (let i = 0; i < length; i++) {
		// Noise under a fast decay: the shape is what makes it a clap rather
		// than a hiss
		data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3;
	}
	const source = audio.createBufferSource();
	source.buffer = buffer;
	const band = audio.createBiquadFilter();
	band.type = 'bandpass';
	band.frequency.value = 1400 + Math.random() * 900;
	band.Q.value = 0.8;
	const level = audio.createGain();
	level.gain.value = gain;
	source.connect(band).connect(level).connect(audio.destination);
	source.start(at);
}

/**
 * A room applauding: a scatter of claps that arrives fast, peaks, and thins
 * out. Around a second and a half — long enough to feel like people, short
 * enough that thirty phones do not turn the lesson into a stadium.
 */
export function playApplause(): void {
	if (!isSoundOn()) return;
	const audio = ctx();
	if (!audio) return;
	const now = audio.currentTime;
	const CLAPS = 46;
	for (let i = 0; i < CLAPS; i++) {
		// Dense at the front, sparse at the tail
		const progress = i / CLAPS;
		const at = now + progress ** 1.7 * 1.5 + Math.random() * 0.05;
		clap(audio, at, 0.1 * (1 - progress * 0.75));
	}
}

/**
 * A referee's whistle: one high tone with a fast tremolo, which is the pea
 * rattling in the barrel — the part that makes it a whistle rather than a
 * beep — cut short so the roar behind it can arrive.
 */
function whistle(audio: AudioContext, at: number): void {
	const osc = audio.createOscillator();
	osc.type = 'square';
	osc.frequency.value = 2650;
	const tremolo = audio.createOscillator();
	tremolo.frequency.value = 42;
	const depth = audio.createGain();
	depth.gain.value = 0.5;
	const level = audio.createGain();
	level.gain.setValueAtTime(0.0001, at);
	level.gain.exponentialRampToValueAtTime(0.06, at + 0.02);
	level.gain.setValueAtTime(0.06, at + 0.3);
	level.gain.exponentialRampToValueAtTime(0.0001, at + 0.4);
	// Square waves are harsh; a lowpass on the way out takes the buzz off
	const soften = audio.createBiquadFilter();
	soften.type = 'lowpass';
	soften.frequency.value = 4200;
	tremolo.connect(depth).connect(level.gain);
	osc.connect(level).connect(soften).connect(audio.destination);
	osc.start(at);
	tremolo.start(at);
	osc.stop(at + 0.42);
	tremolo.stop(at + 0.42);
}

/**
 * A stadium: low, wide noise that swells and settles — the sound of a crowd
 * on its feet — with the applause scatter riding on top of it. Just under
 * three seconds: long enough to be a goal, short enough that thirty devices
 * in one classroom stay a classroom.
 */
export function playGoal(): void {
	if (!isSoundOn()) return;
	const audio = ctx();
	if (!audio) return;
	const now = audio.currentTime;
	whistle(audio, now);

	const ROAR_LENGTH = 2.8;
	const length = Math.floor(audio.sampleRate * ROAR_LENGTH);
	const buffer = audio.createBuffer(1, length, audio.sampleRate);
	const data = buffer.getChannelData(0);
	for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
	const source = audio.createBufferSource();
	source.buffer = buffer;
	// The crowd is the low band; the claps above carry the highs
	const body = audio.createBiquadFilter();
	body.type = 'lowpass';
	body.frequency.setValueAtTime(500, now);
	body.frequency.linearRampToValueAtTime(1100, now + 0.9);
	body.frequency.linearRampToValueAtTime(600, now + ROAR_LENGTH);
	body.Q.value = 0.7;
	const level = audio.createGain();
	level.gain.setValueAtTime(0.0001, now + 0.25);
	level.gain.exponentialRampToValueAtTime(0.14, now + 0.7);
	level.gain.setValueAtTime(0.14, now + 1.4);
	level.gain.exponentialRampToValueAtTime(0.0001, now + ROAR_LENGTH);
	source.connect(body).connect(level).connect(audio.destination);
	source.start(now + 0.25);

	const CLAPS = 40;
	for (let i = 0; i < CLAPS; i++) {
		const progress = i / CLAPS;
		clap(
			audio,
			now + 0.45 + progress ** 1.5 * 2 + Math.random() * 0.05,
			0.07 * (1 - progress * 0.6),
		);
	}
}

/** Two rising notes — a small "well done", for the smaller moment */
export function playCheer(): void {
	if (!isSoundOn()) return;
	const audio = ctx();
	if (!audio) return;
	const now = audio.currentTime;
	[
		{ freq: 659.25, at: 0, length: 0.14 },
		{ freq: 987.77, at: 0.13, length: 0.26 },
	].forEach((note) => {
		const osc = audio.createOscillator();
		osc.type = 'triangle';
		osc.frequency.value = note.freq;
		const level = audio.createGain();
		level.gain.setValueAtTime(0.0001, now + note.at);
		level.gain.exponentialRampToValueAtTime(0.16, now + note.at + 0.02);
		level.gain.exponentialRampToValueAtTime(0.0001, now + note.at + note.length);
		osc.connect(level).connect(audio.destination);
		osc.start(now + note.at);
		osc.stop(now + note.at + note.length + 0.02);
	});
}
