import { describe, expect, it } from 'vitest';
import { DEFAULT_ELDERS, buildEldersFromDefaults } from '../eldersDefaults';
import { DEFAULT_ISLANDS } from '../defaults';

/**
 * The crew is authored by hand, twelve figures deep, and every mistake it can
 * hold is silent at runtime: a stance index one past the end just drops the
 * island, a challenge keyed to an island the elder never charted is never
 * shown, a duplicated slug quietly overwrites a persona. None of that throws.
 * These are the checks that would otherwise be a reader's job.
 */

const islandBySlug = new Map(DEFAULT_ISLANDS.map((island) => [island.slug, island]));

describe('DEFAULT_ELDERS', () => {
	it('ships the twelve of the crew screen, in card order', () => {
		expect(DEFAULT_ELDERS.map((elder) => elder.slug)).toEqual([
			'herzl',
			'ben-gurion',
			'jabotinsky',
			'rav-kook',
			'begin',
			'golda',
			'dayan',
			'ovadia',
			'aloni',
			'leibowitz',
			'habibi',
			'senesh',
		]);
	});

	it('gives every elder a card: name, role, years, colour, persona bio', () => {
		for (const elder of DEFAULT_ELDERS) {
			expect(elder.name.trim()).not.toBe('');
			expect(elder.role.trim()).not.toBe('');
			expect(elder.years).toMatch(/^\d{4}–\d{4}$/);
			expect(elder.color).toMatch(/^#[0-9a-f]{6}$/i);
			// The AI-persona framing is the one thing no elder may ship without.
			expect(elder.bio).toContain('בהשראת');
			expect(elder.needs.length).toBeGreaterThan(0);
			// The card shows exactly three keywords.
			expect(elder.values).toHaveLength(3);
		}
	});

	it('declares stances that exist on islands that exist', () => {
		for (const elder of DEFAULT_ELDERS) {
			for (const [slug, stanceIndex] of Object.entries(elder.positions)) {
				const island = islandBySlug.get(slug);
				expect(island, `${elder.slug} → ${slug}`).toBeDefined();
				expect(stanceIndex).toBeGreaterThanOrEqual(1);
				expect(stanceIndex).toBeLessThanOrEqual(island?.stances.length ?? 0);
			}
		}
	});

	it('never keys a challenge to an island the elder did not chart', () => {
		for (const elder of DEFAULT_ELDERS) {
			for (const slug of Object.keys(elder.challenges)) {
				expect(elder.positions[slug], `${elder.slug} → ${slug}`).toBeDefined();
			}
			// …and never leaves a charted island without one to argue about.
			for (const slug of Object.keys(elder.positions)) {
				expect(elder.challenges[slug]?.trim(), `${elder.slug} → ${slug}`).toBeTruthy();
			}
		}
	});

	it('carries {island} in both reaction lines so the island can be named', () => {
		for (const elder of DEFAULT_ELDERS) {
			expect(elder.agreeLine).toContain('{island}');
			expect(elder.opposeLine).toContain('{island}');
		}
	});

	it('lets an elder stay silent where their record is', () => {
		const senesh = DEFAULT_ELDERS.find((elder) => elder.slug === 'senesh');
		expect(Object.keys(senesh?.positions ?? {}).length).toBeLessThan(DEFAULT_ISLANDS.length);
	});
});

describe('buildEldersFromDefaults', () => {
	const islandIdBySlug = new Map(
		DEFAULT_ISLANDS.map((island) => [island.slug, `q-${island.slug}`]),
	);
	const stanceIdsBySlug = new Map(
		DEFAULT_ISLANDS.map((island) => [
			island.slug,
			island.stances.map((_, index) => `s-${island.slug}-${index + 1}`),
		]),
	);
	const titleBySlug = new Map(DEFAULT_ISLANDS.map((island) => [island.slug, island.title]));

	const built = buildEldersFromDefaults({ islandIdBySlug, stanceIdsBySlug, titleBySlug });

	it('numbers the crew in author order and enables all of them', () => {
		expect(built).toHaveLength(DEFAULT_ELDERS.length);
		expect(built.map((elder) => elder.sortOrder)).toEqual(
			DEFAULT_ELDERS.map((_, index) => index + 1),
		);
		expect(built.every((elder) => elder.enabled)).toBe(true);
		expect(built[0].years).toBe('1860–1904');
	});

	it('resolves stance indexes to ids and names the island in every reaction', () => {
		const herzl = built[0];
		expect(herzl.positions['q-accountability']).toBe('s-accountability-1');
		expect(herzl.reactions['s-accountability-1']).toContain('האחריות');
		expect(herzl.reactions['s-accountability-2']).toContain('האחריות');
	});

	it('carries a silent elder through with only her charted islands', () => {
		const senesh = built[built.length - 1];
		expect(senesh.elderId).toBe('senesh');
		expect(senesh.positions['q-accountability']).toBe('s-accountability-1');
		expect(senesh.positions['q-sabbath-rabbinate']).toBeUndefined();
		expect(senesh.challenges['q-sabbath-rabbinate']).toBeUndefined();
	});
});
