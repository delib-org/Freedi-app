/**
 * How heavy the 3D village may be on THIS device.
 *
 * The world used to carry its own quality button, drawn by the standalone
 * tour and showing through the embedded iframe — a control the app could
 * neither label, translate nor remember. The choice lives here now, the
 * shell posts it with the rest of the village state, and the world applies
 * it; the button in the world is gone.
 *
 * Per browser, never per class: a slow phone is a property of the phone.
 */

const QUALITY_KEY = 'agora_village_quality';
const SOUND_KEY = 'agora_village_sound';
const sessionPreferences = new Map<string, string>();

function preference(key: string): string | null {
	if (sessionPreferences.has(key)) return sessionPreferences.get(key) ?? null;
	try {
		return localStorage.getItem(key);
	} catch {
		return null;
	}
}

function savePreference(key: string, value: string): void {
	try {
		localStorage.setItem(key, value);
		sessionPreferences.delete(key);
	} catch {
		// Private/blocked storage still allows changes for this sitting.
		sessionPreferences.set(key, value);
	}
}

/** The cheap world: no shadows, sparse grass, fewer frames */
export function isLightWorld(): boolean {
	return preference(QUALITY_KEY) === 'low';
}

export function setLightWorld(on: boolean): void {
	savePreference(QUALITY_KEY, on ? 'low' : 'high');
}

/**
 * The village's ambience — birds, footsteps, the fountain.
 *
 * Off until asked, which is how the world has always behaved: thirty phones
 * in one classroom is not a place to start playing sound at anybody. Kept
 * apart from `lib/sound.ts`, which is the two celebration sounds and is
 * silenced from the celebration itself.
 */
export function isVillageSoundOn(): boolean {
	return preference(SOUND_KEY) === 'on';
}

export function setVillageSound(on: boolean): void {
	savePreference(SOUND_KEY, on ? 'on' : 'off');
}
