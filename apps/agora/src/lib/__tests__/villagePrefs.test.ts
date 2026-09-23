import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
	vi.unstubAllGlobals();
	vi.resetModules();
});

describe('village preferences', () => {
	it('remembers choices across reloads without changing celebration sound', async () => {
		const saved = new Map<string, string>();
		vi.stubGlobal('localStorage', {
			getItem: (key: string) => saved.get(key) ?? null,
			setItem: (key: string, value: string) => saved.set(key, value),
		});
		const prefs = await import('../villagePrefs');
		expect(prefs.isVillageSoundOn()).toBe(false);
		expect(prefs.isLightWorld()).toBe(false);
		prefs.setVillageSound(true);
		prefs.setLightWorld(true);
		vi.resetModules();
		const reloaded = await import('../villagePrefs');
		expect(reloaded.isVillageSoundOn()).toBe(true);
		expect(reloaded.isLightWorld()).toBe(true);
		expect([...saved.keys()].sort()).toEqual(['agora_village_quality', 'agora_village_sound']);
	});

	it.each([true, false])(
		'keeps switches usable when storage writes fail (reads blocked: %s)',
		async (blockedRead) => {
			vi.stubGlobal('localStorage', {
				getItem: () => {
					if (blockedRead) throw new Error('Storage blocked');

					return null;
				},
				setItem: () => {
					throw new Error('Storage full or blocked');
				},
			});
			const prefs = await import('../villagePrefs');
			prefs.setVillageSound(true);
			prefs.setLightWorld(true);
			expect(prefs.isVillageSoundOn()).toBe(true);
			expect(prefs.isLightWorld()).toBe(true);
			prefs.setVillageSound(false);
			prefs.setLightWorld(false);
			expect(prefs.isVillageSoundOn()).toBe(false);
			expect(prefs.isLightWorld()).toBe(false);
		},
	);
});
