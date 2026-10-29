import { captureException } from '@/lib/sentry';

/**
 * The projector's whistle (ported from Agora's sound.ts, which join-class does
 * not import): one referee's whistle, synthesised with WebAudio so there is
 * nothing to download. Browsers keep audio locked until a user gesture, so the
 * sound is OFF until the teacher taps "turn on sound" once on the projector
 * screen; that tap opens the audio context (and plays the whistle once, so
 * the teacher hears that it works). The choice is remembered on this device.
 */

const PREF_KEY = 'jc_projector_sound';

const WHISTLE_HZ = 2650;
const TREMOLO_HZ = 42;
const TREMOLO_DEPTH = 0.5;
const PEAK_GAIN = 0.12;
const SILENT_GAIN = 0.0001;
const ATTACK_S = 0.02;
const HOLD_S = 0.3;
const END_S = 0.4;
const STOP_AFTER_S = 0.42;
const LOWPASS_HZ = 4200;

let context: AudioContext | null = null;

export function isProjectorSoundOn(): boolean {
	try {
		return localStorage.getItem(PREF_KEY) === 'on';
	} catch {
		return false;
	}
}

function remember(on: boolean): void {
	try {
		localStorage.setItem(PREF_KEY, on ? 'on' : 'off');
	} catch {
		// storage blocked: the choice holds for this sitting only
	}
}

function audio(): AudioContext | null {
	if (typeof window === 'undefined') return null;
	try {
		const Ctor =
			window.AudioContext ??
			(window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
		if (!Ctor) return null;
		context ??= new Ctor();
		if (context.state === 'suspended') void context.resume();

		return context;
	} catch (error) {
		captureException(error, { operation: 'projectorSound.audio' });

		return null;
	}
}

/** A square wave with a fast tremolo (the pea in the barrel), softened by a lowpass. */
function whistleAt(ac: AudioContext, at: number): void {
	const osc = ac.createOscillator();
	osc.type = 'square';
	osc.frequency.value = WHISTLE_HZ;
	const tremolo = ac.createOscillator();
	tremolo.frequency.value = TREMOLO_HZ;
	const depth = ac.createGain();
	depth.gain.value = TREMOLO_DEPTH;
	const level = ac.createGain();
	level.gain.setValueAtTime(SILENT_GAIN, at);
	level.gain.exponentialRampToValueAtTime(PEAK_GAIN, at + ATTACK_S);
	level.gain.setValueAtTime(PEAK_GAIN, at + HOLD_S);
	level.gain.exponentialRampToValueAtTime(SILENT_GAIN, at + END_S);
	const soften = ac.createBiquadFilter();
	soften.type = 'lowpass';
	soften.frequency.value = LOWPASS_HZ;
	tremolo.connect(depth).connect(level.gain);
	osc.connect(level).connect(soften).connect(ac.destination);
	osc.start(at);
	tremolo.start(at);
	osc.stop(at + STOP_AFTER_S);
	tremolo.stop(at + STOP_AFTER_S);
}

/** Blow the whistle now, when the teacher has turned the sound on. */
export function playWhistle(): void {
	if (!isProjectorSoundOn()) return;
	const ac = audio();
	if (ac) whistleAt(ac, ac.currentTime);
}

/**
 * Called from the teacher's tap: switches the sound on or off. Turning it on
 * opens the audio context inside the gesture and blows one whistle as proof.
 * Returns the new state.
 */
export function toggleProjectorSound(): boolean {
	const next = !isProjectorSoundOn();
	remember(next);
	if (next) {
		const ac = audio();
		if (ac) whistleAt(ac, ac.currentTime);
	}

	return next;
}
