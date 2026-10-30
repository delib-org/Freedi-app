import * as v from 'valibot';
import { logger } from 'firebase-functions';
import { callLLM, extractJson, TAXONOMY_MODEL } from '../../config/openai-chat';
import {
	DISCOVERY_MAX_TOKENS,
	DISCOVERY_WHOLE_INPUT_MAX,
	MAX_THEMES,
	MIN_THEMES,
} from './constants';
import { DISCOVERY_SYSTEM, discoveryUserPrompt } from './prompts';
import type { DiscoveredTheme, RebuildAtom } from './types';

/**
 * Discover the theme list of a question in ONE call that sees every atom (or
 * a stratified sample of a very large question). Seeing the whole set is the
 * point: the live judge, one proposal at a time, grew a 61-of-114 catch-all.
 *
 * Pattern of `deriveTaxonomy` (services/topic-cluster/taxonomy.ts): JSON mode,
 * valibot schema, one retry when the answer is unparseable or out of bounds.
 */

const DISCOVERY_ATTEMPTS = 2;

const DiscoveryResponseSchema = v.object({
	themes: v.array(
		v.object({
			name: v.pipe(v.string(), v.trim(), v.minLength(1)),
			rule: v.pipe(v.string(), v.trim(), v.minLength(1)),
		}),
	),
});

export interface ThemeBounds {
	min: number;
	max: number;
}

/** 5-15 themes, relaxed for a question too small to fill five. */
export function themeBounds(atomCount: number): ThemeBounds {
	const min = Math.max(1, Math.min(MIN_THEMES, Math.floor(atomCount / 2)));

	return { min, max: MAX_THEMES };
}

/**
 * Up to `max` atoms for the discovery prompt. Syntheses first (each already
 * stands for several proposals), then an even stride over the options so every
 * period of the question is represented. Deterministic.
 */
export function sampleForDiscovery(
	atoms: RebuildAtom[],
	max: number = DISCOVERY_WHOLE_INPUT_MAX,
): RebuildAtom[] {
	if (atoms.length <= max) return atoms;
	const synths = atoms.filter((a) => a.isSynth).slice(0, Math.floor(max / 2));
	const options = atoms.filter((a) => !a.isSynth);
	const room = max - synths.length;
	const stride = options.length / room;
	const sampled: RebuildAtom[] = [];
	for (let i = 0; i < room && Math.floor(i * stride) < options.length; i++) {
		sampled.push(options[Math.floor(i * stride)]);
	}

	return [...synths, ...sampled];
}

/** Parse, dedupe by name and assign local keys t1..tN. Throws on a bad shape. */
export function parseDiscovery(raw: string, bounds: ThemeBounds): DiscoveredTheme[] {
	const parsed = v.parse(DiscoveryResponseSchema, JSON.parse(extractJson(raw)));
	const seen = new Set<string>();
	const unique = parsed.themes.filter((t) => {
		const name = t.name.toLocaleLowerCase();
		if (seen.has(name)) return false;
		seen.add(name);

		return true;
	});

	return unique
		.slice(0, bounds.max)
		.map((t, i) => ({ key: `t${i + 1}`, name: t.name, rule: t.rule }));
}

export async function discoverThemes(
	question: string,
	atoms: RebuildAtom[],
): Promise<DiscoveredTheme[]> {
	const bounds = themeBounds(atoms.length);
	const sample = sampleForDiscovery(atoms);
	const user = discoveryUserPrompt(
		question,
		sample.map((a) => a.text),
		bounds,
	);

	let fallback: DiscoveredTheme[] | null = null;
	for (let attempt = 1; attempt <= DISCOVERY_ATTEMPTS; attempt++) {
		try {
			const raw = await callLLM({
				model: TAXONOMY_MODEL,
				system: DISCOVERY_SYSTEM,
				user,
				maxTokens: DISCOVERY_MAX_TOKENS,
				temperature: 0,
				jsonMode: true,
			});
			const themes = parseDiscovery(raw, bounds);
			if (themes.length >= bounds.min) return themes;
			if (themes.length > 0) fallback = themes;
			logger.warn('themeRebuild.discover: too few themes, retrying', {
				attempt,
				themes: themes.length,
				min: bounds.min,
			});
		} catch (error) {
			logger.warn('themeRebuild.discover: unparseable answer', {
				attempt,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}
	// Fewer themes than asked is still a usable list; nothing at all is not.
	if (fallback) return fallback;
	throw new Error('Theme discovery failed');
}
