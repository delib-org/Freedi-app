import * as v from 'valibot';
import { parse } from 'valibot';
import type { ClusteringTaxonomyCache, Statement, TaxonomyCategory } from '@freedi/shared-types';
import { TaxonomyCategorySchema } from '@freedi/shared-types';
import { logger } from 'firebase-functions';
import { callLLM, extractJson, TAXONOMY_MODEL } from '../../config/openai-chat';
import {
	PROMPT_VERSION_TAXONOMY,
	TAXONOMY_MAX_CATEGORIES,
	TAXONOMY_MIN_CATEGORIES,
	TAXONOMY_SAMPLE_MAX,
} from './constants';
import {
	getTaxonomyCache,
	questionHash as computeQuestionHash,
	saveTaxonomyCache,
	taxonomyCacheId,
} from './cache';
import { TAXONOMY_SYSTEM, taxonomyUserPrompt } from './prompts';
import type { RawResponse } from './types';

const TaxonomyResponseSchema = v.object({
	language: v.string(),
	categories: v.array(TaxonomyCategorySchema),
});

/**
 * Pick a stratified sample for the taxonomy call: short, medium, long.
 * Cap total at TAXONOMY_SAMPLE_MAX. Deterministic — sorts by id within bucket.
 */
function stratifiedSample(responses: RawResponse[], max: number): RawResponse[] {
	const buckets: { short: RawResponse[]; medium: RawResponse[]; long: RawResponse[] } = {
		short: [],
		medium: [],
		long: [],
	};
	for (const r of responses) {
		const len = r.text.length;
		if (len < 80) buckets.short.push(r);
		else if (len < 240) buckets.medium.push(r);
		else buckets.long.push(r);
	}
	const each = Math.max(1, Math.floor(max / 3));
	const pick = (b: RawResponse[]): RawResponse[] => {
		b.sort((a, c) => a.statementId.localeCompare(c.statementId));

		return b.slice(0, each);
	};

	return [...pick(buckets.short), ...pick(buckets.medium), ...pick(buckets.long)].slice(0, max);
}

interface DeriveOptions {
	rebuildTaxonomy?: boolean;
}

/**
 * Derive (or load from cache) the per-question taxonomy. Returns the cache
 * record so callers can persist its `cacheId` on dependent normalization
 * records.
 */
export async function deriveTaxonomy(
	parent: Statement,
	core: RawResponse[],
	opts: DeriveOptions = {},
): Promise<ClusteringTaxonomyCache> {
	const qText = parent.statement ?? '';
	const qHash = computeQuestionHash(qText);

	if (!opts.rebuildTaxonomy) {
		const cached = await getTaxonomyCache(parent.statementId, qHash);
		if (cached && cached.promptVersion === PROMPT_VERSION_TAXONOMY) {
			logger.info('Taxonomy cache hit', {
				parentId: parent.statementId,
				categories: cached.categories.length,
			});

			return cached;
		}
	}

	const sample = stratifiedSample(core, TAXONOMY_SAMPLE_MAX);
	const prompt = taxonomyUserPrompt(
		qText,
		sample.map((r) => r.text),
	);

	let parsed: { language: string; categories: TaxonomyCategory[] } | null = null;
	for (let attempt = 1; attempt <= 2; attempt++) {
		const raw = await callLLM({
			model: TAXONOMY_MODEL,
			system: TAXONOMY_SYSTEM,
			user: prompt,
			maxTokens: 4096,
			temperature: 0,
			jsonMode: true,
		});
		try {
			const json = extractJson(raw);
			parsed = parse(TaxonomyResponseSchema, JSON.parse(json));
		} catch (error) {
			logger.warn(`Taxonomy parse failed attempt ${attempt}`, {
				error: (error as Error).message,
				rawPreview: raw.substring(0, 200),
			});
			parsed = null;
			continue;
		}
		const n = parsed.categories.length;
		if (n >= TAXONOMY_MIN_CATEGORIES && n <= TAXONOMY_MAX_CATEGORIES) break;
		logger.warn(
			`Taxonomy size ${n} outside [${TAXONOMY_MIN_CATEGORIES}, ${TAXONOMY_MAX_CATEGORIES}], retrying`,
		);
		parsed = null;
	}

	if (!parsed) {
		throw new Error('Taxonomy derivation failed after 2 attempts');
	}

	// Ensure each category has a unique key AND a unique display name.
	// Without name dedup, the LLM can emit several keys that share the same
	// human-readable name — and since names drive UI grouping, the user sees
	// what looks like duplicates side-by-side.
	const seenKeys = new Set<string>();
	const seenNames = new Set<string>();
	const uniqueCategories: TaxonomyCategory[] = [];
	for (const c of parsed.categories) {
		const key = c.key.trim();
		const normalizedName = c.name.trim().toLocaleLowerCase();
		if (seenKeys.has(key)) continue;
		if (seenNames.has(normalizedName)) continue;
		seenKeys.add(key);
		seenNames.add(normalizedName);
		uniqueCategories.push({ ...c, key });
	}

	const cache: ClusteringTaxonomyCache = {
		cacheId: taxonomyCacheId(parent.statementId, qHash),
		parentId: parent.statementId,
		questionHash: qHash,
		promptVersion: PROMPT_VERSION_TAXONOMY,
		language: parsed.language,
		categories: uniqueCategories,
		createdAt: Date.now(),
	};
	await saveTaxonomyCache(cache);
	logger.info('Taxonomy derived and cached', {
		parentId: parent.statementId,
		categories: cache.categories.length,
		language: cache.language,
	});

	return cache;
}
