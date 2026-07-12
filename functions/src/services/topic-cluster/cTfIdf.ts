// Class-based TF-IDF: one "document" per cluster (the concatenation of its
// member texts), then standard TF-IDF across those pseudo-documents. Yields
// the most cluster-distinctive tokens. Logged only — sanity check next to
// LLM-generated cluster names.

const TOKEN_RE = /[\p{L}\p{N}]+/gu; // Unicode-aware: works for he/ar/zh/etc.

const STOPWORDS = new Set([
	// English
	'the',
	'a',
	'an',
	'and',
	'or',
	'but',
	'of',
	'to',
	'in',
	'on',
	'for',
	'with',
	'is',
	'are',
	'was',
	'were',
	'be',
	'been',
	'being',
	'this',
	'that',
	'these',
	'those',
	'it',
	'we',
	'i',
	'you',
	'they',
	'he',
	'she',
	'should',
	'would',
	'could',
	'will',
	'can',
	'may',
	'do',
	'does',
	'did',
	'have',
	'has',
	'had',
	'as',
	'at',
	'by',
	'from',
	'not',
	'no',
	'yes',
	'so',
	'if',
	'than',
	'then',
	'about',
	'into',
	'over',
	'under',
	'up',
	'down',
	'out',
	'more',
	'less',
	'all',
	'any',
	'some',
	// Hebrew (high-frequency function words; not exhaustive)
	'של',
	'את',
	'על',
	'גם',
	'או',
	'אם',
	'כי',
	'זה',
	'זאת',
	'אני',
	'אתה',
	'הוא',
	'היא',
	'אנחנו',
	'אתם',
	'הם',
	'יש',
	'אין',
	'לא',
	'כן',
	'כמו',
	'אבל',
	'רק',
	'מה',
	'מי',
	// Arabic (high-frequency)
	'من',
	'في',
	'على',
	'إلى',
	'عن',
	'مع',
	'هذا',
	'هذه',
	'ذلك',
	'تلك',
	'أن',
	'لا',
	'لم',
	'لن',
	'هو',
	'هي',
	'نحن',
	'هم',
]);

function tokenize(text: string): string[] {
	const matches: string[] = text.toLowerCase().match(TOKEN_RE) || [];

	return matches.filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

/**
 * Compute the top-N most cluster-distinctive tokens for each cluster.
 *
 * @param clusterTexts - one string per cluster (concatenation of its member texts)
 * @param topN - number of top tokens to return per cluster
 * @returns array of token lists, parallel to `clusterTexts`
 */
export function computeCTfIdf(clusterTexts: string[], topN: number): string[][] {
	if (clusterTexts.length === 0) return [];

	// Build per-cluster term counts and global doc-frequency.
	const perCluster: Array<Map<string, number>> = clusterTexts.map((text) => {
		const tokens = tokenize(text);
		const counts = new Map<string, number>();
		for (const t of tokens) counts.set(t, (counts.get(t) ?? 0) + 1);

		return counts;
	});

	const docFreq = new Map<string, number>();
	for (const counts of perCluster) {
		for (const token of counts.keys()) {
			docFreq.set(token, (docFreq.get(token) ?? 0) + 1);
		}
	}

	const numClusters = clusterTexts.length;
	const idf = new Map<string, number>();
	for (const [token, df] of docFreq) {
		idf.set(token, Math.log((1 + numClusters) / (1 + df)) + 1);
	}

	return perCluster.map((counts) => {
		const total = Array.from(counts.values()).reduce((s, n) => s + n, 0) || 1;
		const scored: Array<[string, number]> = [];
		for (const [token, count] of counts) {
			const tf = count / total;
			const score = tf * (idf.get(token) ?? 0);
			scored.push([token, score]);
		}
		scored.sort((a, b) => b[1] - a[1]);

		return scored.slice(0, topN).map(([t]) => t);
	});
}
