/**
 * Shared helpers for the merge-judge fragmentation study: load a benchmark end
 * state, work out which true topic each theme stands for, apply merge groups the
 * way `consolidateThemes` does, and score with the official scorer.
 *
 * No participant text leaves this folder's outputs except benchmark statements,
 * which are synthetic (the accuracy-100 corpora).
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, cpSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const HERE = dirname(fileURLToPath(import.meta.url));
export const STUDY = resolve(HERE, '..');
export const SCI = resolve(STUDY, '..');
export const REFILE_RESULTS = join(SCI, '2026-10-24-theme-refile-pass/results');
export const SCORER = join(SCI, '2026-08-18-live-synth-accuracy/score100.mjs');
/** Main checkout holds functions/.env and a compiled lib; read-only use. */
export const MAIN_REPO = '/Users/talyaron/Documents/Freedi-app';
export const WORKTREE_ROOT = resolve(STUDY, '../..');
const require = createRequire(import.meta.url);

export const RUNS = [
	'en-seed42-themefix',
	'en-seed42-consolidated',
	'en-seed7-consolidated',
	'en-seed1234-consolidated',
	'en-seed42-filingfix',
	'he-seed42-large-formulation',
	'he-seed42-large-judgedattach',
	'he-seed42-large-recall',
];

export function loadEnv() {
	for (const line of readFileSync(join(MAIN_REPO, 'functions/.env'), 'utf8').split('\n')) {
		const t = line.trim();
		if (!t || t.startsWith('#')) continue;
		const i = t.indexOf('=');
		if (i === -1) continue;
		const k = t.slice(0, i).trim();
		let v = t.slice(i + 1).trim();
		if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
		if (!(k in process.env)) process.env[k] = v;
	}
}

/** Compiled lib: pass 'worktree' for this branch's build, 'main' for the checkout's. */
export function compiled(which, file) {
	const root = which === 'worktree' ? WORKTREE_ROOT : MAIN_REPO;

	return require(join(root, 'functions/lib/functions/src', file));
}

const ids = (list) => (list ?? []).map((m) => (typeof m === 'string' ? m : m.id));

/** state: visible topic themes with the statements (and true topics) they hold. */
export function loadState(run) {
	const dir = join(REFILE_RESULTS, run, 'pass0');
	const results = JSON.parse(readFileSync(join(dir, 'results.json'), 'utf8'));
	const stmts = JSON.parse(readFileSync(join(dir, 'statements.json'), 'utf8'));
	const topicOf = new Map(stmts.statements.map((s) => [s.id, s.groundTruthTopic]));
	const synthMembers = new Map(results.synths.items.filter((s) => !s.hidden).map((s) => [s.id, ids(s.members)]));
	const themes = results.topicClusters.items
		.filter((t) => !t.hidden)
		.map((t) => {
			const atomIds = [...(t.memberSynthIds ?? []), ...ids(t.members)];
			const statementIds = atomIds.flatMap((a) => synthMembers.get(a) ?? [a]);
			const counts = {};
			for (const s of statementIds) counts[topicOf.get(s) ?? '?'] = (counts[topicOf.get(s) ?? '?'] ?? 0) + 1;
			const [dominant, n] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0] ?? ['?', 0];

			return {
				id: t.id,
				title: t.title,
				description: t.description,
				atomIds,
				memberSynthIds: t.memberSynthIds ?? [],
				directMembers: ids(t.members),
				statementIds,
				counts,
				dominant,
				purity: statementIds.length ? n / statementIds.length : 0,
			};
		})
		.filter((t) => t.statementIds.length > 0);

	return { run, question: stmts.question, themes, results, stmts, topicOf, synthMembers };
}

/** Pair of themes "shares a true topic" when both are dominated by the same topic. */
export function topicPairs(themes) {
	const out = [];
	for (let i = 0; i < themes.length; i++) {
		for (let j = i + 1; j < themes.length; j++) {
			const a = themes[i];
			const b = themes[j];
			if (a.dominant === b.dominant) out.push([a, b, 'same-dominant']);
		}
	}

	return out;
}

/** Apply merge groups the way consolidateThemes does: survivor = most members, ties earliest. */
export function applyGroups(results, groups, titleToId) {
	const copy = JSON.parse(JSON.stringify(results));
	const byId = new Map(copy.topicClusters.items.map((t) => [t.id, t]));
	const size = (t) => (t.memberSynthIds?.length ?? 0) + (t.members?.length ?? 0);
	for (const g of groups) {
		const members = g.ids.map((id) => byId.get(id)).filter(Boolean);
		if (members.length < 2) continue;
		const survivor = [...members].sort((a, b) => size(b) - size(a))[0];
		for (const donor of members) {
			if (donor === survivor) continue;
			survivor.memberSynthIds = [...new Set([...(survivor.memberSynthIds ?? []), ...(donor.memberSynthIds ?? [])])];
			survivor.members = [...(survivor.members ?? []), ...(donor.members ?? [])];
			donor.hidden = true;
			donor.memberSynthIds = [];
			donor.members = [];
		}
		survivor.title = g.title;
	}

	return copy;
}

export function score(state, results, tag) {
	const dir = join(STUDY, 'results/_scratch', `${state.run}-${tag}`);
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, 'results.json'), JSON.stringify(results));
	writeFileSync(join(dir, 'statements.json'), JSON.stringify(state.stmts));
	const out = JSON.parse(execFileSync('node', [SCORER, dir, '--json'], { encoding: 'utf8' }));

	return {
		precision: out.topic.precision,
		recall: out.topic.recall,
		f1: out.topic.f1,
		themes: out.topic.producedCount,
		synthF1: out.synth.f1,
		falseMerges: out.synth.falseMerges,
	};
}

export function visibleThemesForJudge(results) {
	return results.topicClusters.items
		.filter((t) => !t.hidden)
		.filter((t) => (t.memberSynthIds?.length ?? 0) + (t.members?.length ?? 0) > 0)
		.map((t) => ({ id: t.id, title: t.title, description: t.description }));
}

/** Mean/largest share of statements (largest theme). */
export function largestShare(results, state) {
	const sizes = results.topicClusters.items
		.filter((t) => !t.hidden)
		.map((t) => {
			const aIds = [...(t.memberSynthIds ?? []), ...ids(t.members)];

			return aIds.flatMap((a) => state.synthMembers.get(a) ?? [a]).length;
		});
	const total = sizes.reduce((a, b) => a + b, 0);

	return total ? Math.max(...sizes) / total : 0;
}

export function sha(s) {
	return createHash('sha256').update(s).digest('hex');
}

export function jsonlCache(file) {
	const map = new Map();
	if (existsSync(file)) {
		for (const l of readFileSync(file, 'utf8').split('\n')) {
			if (l.trim()) {
				const r = JSON.parse(l);
				map.set(r.key, r.value);
			}
		}
	}

	return map;
}

export { cpSync };
