import { afterEach, describe, expect, it, vi } from 'vitest';
import { dragLook } from '../../../prototypes/olive-hill/drag-look.js';
import { PALETTES, paletteFor } from '../../../prototypes/olive-hill/palettes.js';
import { lushness, valueNoise } from '../../../prototypes/olive-hill/meadow.js';
import { VILLAGE_PALETTES } from '../villagePrefs';

/**
 * The camera's yaw grows to the LEFT and its pitch grows UP. These tests pin
 * what that means for a drag, so the phone's direction cannot flip back.
 */
describe('dragLook', () => {
	const start = { yaw: 0, pitch: 0 };

	it('lets a finger grab the world: drag right turns the camera left, so the ground follows the finger', () => {
		const next = dragLook(start, 50, 0, 'touch');
		expect(next.yaw).toBeGreaterThan(0);
		expect(next.pitch).toBe(0);
	});

	it('lets a finger drag the ground down to look up', () => {
		expect(dragLook(start, 0, 40, 'touch').pitch).toBeGreaterThan(0);
		expect(dragLook(start, 0, -40, 'touch').pitch).toBeLessThan(0);
	});

	it('treats a pen like a finger', () => {
		expect(dragLook(start, 50, 30, 'pen')).toEqual(dragLook(start, 50, 30, 'touch'));
	});

	it('keeps the desktop mouse-look: drag right looks right, drag down looks down', () => {
		const next = dragLook(start, 50, 40, 'mouse');
		expect(next.yaw).toBeLessThan(0);
		expect(next.pitch).toBeLessThan(0);
	});

	it('turns touch and mouse by the same amount, in opposite directions', () => {
		const touch = dragLook(start, 30, 20, 'touch');
		const mouse = dragLook(start, 30, 20, 'mouse');
		expect(touch.yaw).toBeCloseTo(-mouse.yaw);
		expect(touch.pitch).toBeCloseTo(-mouse.pitch);
	});

	it('clamps the pitch to the limits it is given', () => {
		expect(dragLook(start, 0, 10000, 'touch').pitch).toBe(0.55);
		expect(dragLook(start, 0, -10000, 'touch').pitch).toBe(-0.7);
		expect(dragLook(start, 0, 10000, 'touch', { min: -0.65, max: 0.65 }).pitch).toBe(0.65);
	});
});

describe('village palettes', () => {
	it('names the same sets in the app and in the world', () => {
		expect(Object.keys(PALETTES).sort()).toEqual([...VILLAGE_PALETTES].sort());
	});

	it('gives every set every colour, as a hex', () => {
		const slots = Object.keys(PALETTES.default).sort();
		for (const palette of Object.values(PALETTES)) {
			expect(Object.keys(palette).sort()).toEqual(slots);
			for (const color of Object.values(palette)) expect(color).toMatch(/^#[0-9a-f]{6}$/);
		}
	});

	it('falls back to the hill as drawn for an unknown or inherited name', () => {
		expect(paletteFor('nope')).toBe(PALETTES.default);
		expect(paletteFor('toString')).toBe(PALETTES.default);
		expect(paletteFor('forest')).toBe(PALETTES.forest);
	});
});

describe('meadow map', () => {
	it('stays in [0, 1] and is deterministic', () => {
		for (let i = 0; i < 500; i++) {
			const x = ((i * 37.3) % 300) - 150;
			const z = ((i * 91.7) % 300) - 150;
			const n = valueNoise(x, z);
			const l = lushness(x, z);
			expect(n).toBeGreaterThanOrEqual(0);
			expect(n).toBeLessThanOrEqual(1);
			expect(l).toBeGreaterThanOrEqual(0);
			expect(l).toBeLessThanOrEqual(1);
			expect(lushness(x, z)).toBe(l);
		}
	});

	it('has both lush and dry ground across the hill', () => {
		let lush = 0;
		let dry = 0;
		for (let x = -80; x <= 80; x += 4) {
			for (let z = -40; z <= 120; z += 4) {
				const l = lushness(x, z);
				if (l > 0.7) lush++;
				if (l < 0.3) dry++;
			}
		}
		expect(lush).toBeGreaterThan(20);
		expect(dry).toBeGreaterThan(20);
	});
});

describe('village palette preference', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.resetModules();
	});

	it('defaults to the original look, remembers a choice and ignores a stale value', async () => {
		const saved = new Map<string, string>();
		vi.stubGlobal('localStorage', {
			getItem: (key: string) => saved.get(key) ?? null,
			setItem: (key: string, value: string) => saved.set(key, value),
		});
		const prefs = await import('../villagePrefs');
		expect(prefs.villagePalette()).toBe('default');
		prefs.setVillagePalette('forest');
		vi.resetModules();
		const reloaded = await import('../villagePrefs');
		expect(reloaded.villagePalette()).toBe('forest');
		saved.set('agora_village_palette', 'neon');
		expect(reloaded.villagePalette()).toBe('default');
	});

	it('keeps the choice for this sitting when storage is blocked', async () => {
		vi.stubGlobal('localStorage', {
			getItem: () => {
				throw new Error('Storage blocked');
			},
			setItem: () => {
				throw new Error('Storage blocked');
			},
		});
		const prefs = await import('../villagePrefs');
		expect(prefs.villagePalette()).toBe('default');
		prefs.setVillagePalette('desert');
		expect(prefs.villagePalette()).toBe('desert');
	});
});
