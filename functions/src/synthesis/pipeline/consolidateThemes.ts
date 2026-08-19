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
 */

const MIN_THEMES_TO_CONSOLIDATE = 3;
const MAX_MERGES_PER_SWEEP = 8;

function db() {
	return getFirestore();
}

export interface ConsolidateResult {
	merges: number;
	themesBefore: number;
	themesAfter: number;
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

	const options: ThemeOption[] = themes.map((t) => ({
		id: t.statementId,
		title: t.statement ?? '',
		description: t.description,
	}));
	const groups = await groupEquivalentThemes({ themes: options, questionContext });
	if (groups.length === 0) {
		return { merges: 0, themesBefore, themesAfter: themesBefore };
	}

	const byId = new Map(themes.map((t) => [t.statementId, t]));
	let merges = 0;

	for (const group of groups.slice(0, MAX_MERGES_PER_SWEEP)) {
		const members = group.ids
			.map((id) => byId.get(id))
			.filter((t): t is Statement => Boolean(t));
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

	return { merges, themesBefore, themesAfter: themesBefore - merges };
}
