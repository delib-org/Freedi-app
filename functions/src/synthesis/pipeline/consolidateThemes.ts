import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { Collections, StatementType, type Statement } from '@freedi/shared-types';
import { groupEquivalentThemes, type ThemeOption } from '../../services/integration-ai-service';
import { recordLiveSynthEvent } from '../liveSynth/auditLog';
import { enqueueClusterRecompute } from '../liveSynth/clusterRecompute';
import { isTopicCluster } from './clusterOps';

/**
 * Merge themes that name the same topic.
 *
 * Themes are created in arrival order — the first synthesis under a question has
 * nothing to be filed under, so it necessarily creates one. That is correct, and
 * it has an unavoidable side effect: early themes are named after whichever idea
 * happened to arrive first, and are therefore narrower than the topic they will
 * end up representing. Nothing revisited them.
 *
 * Measured on a certified 100-statement run: 18 themes for 10 true topics, ten
 * of them holding exactly one synthesis — "Smaller class sizes" and "Student
 * nutrition programs" sitting beside a broad "School facility modernization"
 * that should have absorbed both. Topic pairwise F1 moved to 0.481 while the
 * countable cluster score stayed at 0.500, which is the signature of correct
 * groupings scattered across too many headings.
 *
 * This is the theme-level counterpart to the cross-synth reJudge sweep, and it
 * runs from the same place. Like that sweep it is a judgement call, not a
 * distance comparison — and unlike it, the judgement is about the whole SET of
 * headings at once, so it is a single call rather than a pairwise scan.
 *
 * Merge direction: into the theme with the most members, ties to the earliest
 * created, so the survivor is the one most readers have already seen. Donors are
 * hidden rather than deleted, matching how the synth sweep retires a merged
 * cluster.
 *
 * Two things the seed sweep taught, both measured in
 * `scientific-research/2026-08-18-live-synth-accuracy/analysis/themeConsolidation.mjs`:
 *
 *   - The judge must see the proposals under each heading, not just the
 *     heading. See `groupEquivalentThemes`.
 *   - Each distinct theme set is judged ONCE. This function is called from a
 *     10-minute schedule, so without that guard a settled question re-asks a
 *     non-deterministic model to find merges ~144 times a day, and merges are
 *     irreversible for the reader. See `alreadyJudged`.
 */

const MIN_THEMES_TO_CONSOLIDATE = 3;

/**
 * Runaway brake, not a tuning knob — and measurement says it has never engaged.
 *
 * Replaying the judge against the three certified seed runs
 * (`analysis/themeConsolidation.mjs`) it proposed at most 6 groups in a call,
 * and the live sweeps that produced those runs proposed 1–3. An earlier plan
 * blamed this constant for seed 1234 finishing with 17 headings and proposed
 * raising it; the run logs refute that directly — that sweep saw 19 headings and
 * was offered 2 groups, so the cap was never reached. What was actually limiting
 * the merge count is what the judge could SEE, which is fixed in
 * `groupEquivalentThemes` by showing it the proposals under each heading.
 *
 * It stays because a judge that one day returns thirty groups should not be able
 * to collapse a question's whole topic list in a single unattended sweep.
 */
const MAX_MERGES_PER_SWEEP = 8;

/** Where the last-judged fingerprint per question lives. See `alreadyJudged`. */
const SWEEP_STATE_COLLECTION = '_liveSynthThemeSweep';

function db() {
	return getFirestore();
}

/**
 * Identity of a theme SET: which headings exist and how much each holds.
 *
 * Changes whenever a heading is created, hidden, or gains a proposal — i.e.
 * whenever there is genuinely something new to judge — and is stable across
 * sweeps when nothing has happened.
 */
function themeSetFingerprint(themes: Statement[]): string {
	return themes
		.map((t) => `${t.statementId}:${(t.integratedOptions ?? []).length}`)
		.sort()
		.join('|');
}

/**
 * Has this exact theme set already been judged?
 *
 * The sweep that calls this runs every 10 minutes for as long as a question
 * exists, and it asks the judge to FIND groups. On a settled question that is
 * the same question put to a non-deterministic model ~144 times a day, and a
 * merge hides the donor heading irreversibly — so a spurious group that a single
 * call proposes with low probability becomes a near-certainty given enough
 * calls. Measured on the certified runs, one sample in two proposed a merge of
 * "parks" with "culture" on a seed whose ten headings were already correct.
 *
 * Judging each distinct set once bounds that exposure to one sample per actual
 * change, and removes an LLM call per parent per sweep on questions where
 * nothing has happened. It does not stop the sweep from converging: a merge
 * changes the set, so the next sweep judges the new one.
 *
 * Fail-open — an unreadable state doc means judge anyway, matching how the rest
 * of the pipeline treats its own bookkeeping. The cost of failing open is one
 * redundant call, the cost of failing closed is a question that never tidies.
 */
async function alreadyJudged(parentId: string, fingerprint: string): Promise<boolean> {
	try {
		const snap = await db().collection(SWEEP_STATE_COLLECTION).doc(parentId).get();

		return snap.exists && (snap.data() as { fingerprint?: string }).fingerprint === fingerprint;
	} catch (error) {
		logger.warn('synthesis.consolidateThemes: sweep-state read failed, judging anyway', {
			parentId,
			error: error instanceof Error ? error.message : String(error),
		});

		return false;
	}
}

async function recordJudged(parentId: string, fingerprint: string): Promise<void> {
	try {
		await db()
			.collection(SWEEP_STATE_COLLECTION)
			.doc(parentId)
			.set({ fingerprint, judgedAt: Date.now() });
	} catch (error) {
		// Non-fatal: the next sweep judges the same set again, which is the
		// behaviour this existed to improve on, not a correctness problem.
		logger.warn('synthesis.consolidateThemes: sweep-state write failed', {
			parentId,
			error: error instanceof Error ? error.message : String(error),
		});
	}
}

export interface ConsolidateResult {
	merges: number;
	themesBefore: number;
	themesAfter: number;
	/** True when this exact theme set had already been judged; no LLM call made. */
	skipped?: boolean;
}

export async function consolidateThemes(
	parentId: string,
	questionContext: string,
	triggerSource: string,
): Promise<ConsolidateResult> {
	let themes: Statement[];
	try {
		const snap = await db()
			.collection(Collections.statements)
			.where('parentId', '==', parentId)
			.where('statementType', '==', StatementType.option)
			.get();
		themes = snap.docs
			.map((d) => d.data() as Statement)
			.filter((s) => s.isCluster === true && s.hide !== true && isTopicCluster(s));
	} catch (error) {
		logger.warn('synthesis.consolidateThemes: theme listing failed', {
			parentId,
			error: error instanceof Error ? error.message : String(error),
		});

		return { merges: 0, themesBefore: 0, themesAfter: 0 };
	}

	const themesBefore = themes.length;
	if (themesBefore < MIN_THEMES_TO_CONSOLIDATE) {
		return { merges: 0, themesBefore, themesAfter: themesBefore };
	}

	const fingerprint = themeSetFingerprint(themes);
	if (await alreadyJudged(parentId, fingerprint)) {
		return { merges: 0, themesBefore, themesAfter: themesBefore, skipped: true };
	}

	const options: ThemeOption[] = themes.map((t) => ({
		id: t.statementId,
		title: t.statement ?? '',
		description: t.description,
	}));
	const groups = await groupEquivalentThemes({ themes: options, questionContext });
	if (groups.length === 0) {
		// Nothing to merge is a real answer about THIS set — record it, so the
		// next sweep does not put the same question to the model again.
		await recordJudged(parentId, fingerprint);

		return { merges: 0, themesBefore, themesAfter: themesBefore };
	}

	const byId = new Map(themes.map((t) => [t.statementId, t]));
	let merges = 0;

	for (const group of groups.slice(0, MAX_MERGES_PER_SWEEP)) {
		const members = group.ids.map((id) => byId.get(id)).filter((t): t is Statement => Boolean(t));
		if (members.length < 2) continue;

		// Survivor: most members, ties to earliest created.
		const survivor = [...members].sort((a, b) => {
			const sizeDiff = (b.integratedOptions ?? []).length - (a.integratedOptions ?? []).length;
			if (sizeDiff !== 0) return sizeDiff;

			return (a.createdAt ?? 0) - (b.createdAt ?? 0);
		})[0];
		const donors = members.filter((t) => t.statementId !== survivor.statementId);

		const merged = new Set(survivor.integratedOptions ?? []);
		for (const donor of donors) {
			for (const memberId of donor.integratedOptions ?? []) merged.add(memberId);
		}
		const nextMembers = Array.from(merged);

		try {
			const batch = db().batch();
			batch.update(db().collection(Collections.statements).doc(survivor.statementId), {
				statement: group.title,
				integratedOptions: nextMembers,
				lastUpdate: Date.now(),
			});
			for (const donor of donors) {
				batch.update(db().collection(Collections.statements).doc(donor.statementId), {
					hide: true,
					mergedInto: survivor.statementId,
					integratedOptions: [],
					lastUpdate: Date.now(),
				});
			}
			await batch.commit();
		} catch (error) {
			logger.warn('synthesis.consolidateThemes: merge write failed', {
				parentId,
				survivorId: survivor.statementId,
				error: error instanceof Error ? error.message : String(error),
			});
			continue;
		}

		merges += donors.length;
		logger.info('synthesis.consolidateThemes.merged', {
			parentId,
			survivorId: survivor.statementId,
			donorIds: donors.map((d) => d.statementId),
			title: group.title?.substring(0, 60),
			memberCount: nextMembers.length,
			triggerSource,
		});

		await recordLiveSynthEvent({
			action: 'merge',
			clusterId: survivor.statementId,
			reason: `themes consolidated into "${group.title}" (${donors.length} donor(s))`,
			prevState: { integratedOptions: survivor.integratedOptions ?? [] },
			newState: { integratedOptions: nextMembers, absorbed: donors.map((d) => d.statementId) },
			triggerSource: `${triggerSource}:themeConsolidate`,
			parentStatementId: parentId,
		});

		await enqueueClusterRecompute(survivor.statementId, `${triggerSource}:themeConsolidate`);
	}

	// The set we just judged, not the one the merges produced. The new set has a
	// different fingerprint, so the next sweep judges it — which is how a merge
	// that opens up a further merge still gets found — while this set, if it ever
	// recurs, does not go back to the model.
	await recordJudged(parentId, fingerprint);

	return { merges, themesBefore, themesAfter: themesBefore - merges };
}
