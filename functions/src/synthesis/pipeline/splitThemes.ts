import { createHash } from 'node:crypto';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { Collections, StatementType, type Statement, getRandomUID } from '@freedi/shared-types';
import { proposeThemeSplit, type ThemeSplitMember } from '../../services/integration-ai-service';
import { recordLiveSynthEvent } from '../liveSynth/auditLog';
import { enqueueClusterRecompute } from '../liveSynth/clusterRecompute';
import { isSynth, isTopicCluster } from './clusterOps';

/**
 * Split themes that have grown into catch-alls.
 *
 * The mirror of `consolidateThemes`. That sweep can only make the theme set
 * smaller, and until now nothing could make it larger except a synthesis the
 * filing judge refused every existing heading for. On a NARROW question that
 * never happens: every answer shares the question's subject, the first theme is
 * named for that subject, and the judge — whose notion of "same topic" is "the
 * same general area of concern" — files nearly everything into it. Measured on
 * Bq-VQPMPiG7b (114 Hebrew statements, human-coded into 36 clusters): one theme
 * held 61 statements spanning 26 of the coder's 36 clusters, the theme layer
 * scored pairwise F1 0.19 / ARI 0.04 against her, and no mechanism existed that
 * could ever undo it. The paper's 100-statement benchmark, ten clearly distinct
 * topics, never exercised this regime.
 *
 * Trigger: a theme holding at least `MIN_LEAVES_TO_SPLIT` statements AND either
 * more than a third of everything placed under the question, or more than
 * `ALWAYS_SPLIT_ABOVE_LEAVES` outright. "Statements" counts leaves — a synthesis
 * inside the theme counts for each of its members — because that is what a
 * reader browses.
 *
 * One LLM call per candidate theme, with the theme's contents in view, proposes
 * 2–6 sub-topics and assigns the members; the sub-topics are created, the
 * members re-homed and the parent hidden, in one transaction that re-checks the
 * parent is still the theme that was judged. Like consolidation, each distinct
 * membership is judged ONCE (`alreadyJudged`): the sweep runs every 10 minutes
 * and a split is irreversible for the reader.
 *
 * Over-splits are repaired by the merge sweep, with one guard against the two
 * sweeps chasing each other: sub-topics carry `splitFrom`, and
 * `consolidateThemes` refuses to merge two siblings of the same split.
 */

/** Below this many leaves a theme is small enough to browse whatever it holds. */
export const MIN_LEAVES_TO_SPLIT = 8;
/** Share of the question's placed statements that marks a theme as an attractor. */
export const SPLIT_SHARE_OF_PLACED = 1 / 3;
/** A theme this large is split whatever share it holds. */
export const ALWAYS_SPLIT_ABOVE_LEAVES = 25;
/** Runaway brake: splits applied per parent per sweep. */
const MAX_SPLITS_PER_SWEEP = 2;
/** Prompt-size brake; a theme with more direct members than this is logged and left. */
const MAX_MEMBERS_IN_PROMPT = 150;

/** Where the last-judged membership per theme lives. See `alreadyJudged`. */
const SWEEP_STATE_COLLECTION = '_liveSynthThemeSplit';

function db() {
	return getFirestore();
}

interface SplitState {
	judged?: Record<string, string>;
}

/** Identity of a theme's MEMBERSHIP — the thing the judge was shown. */
export function membershipFingerprint(theme: Statement): string {
	const ids = [...(theme.integratedOptions ?? [])].sort().join('|');

	return createHash('sha1').update(ids).digest('hex').slice(0, 16);
}

async function loadState(parentId: string): Promise<SplitState> {
	try {
		const snap = await db().collection(SWEEP_STATE_COLLECTION).doc(parentId).get();

		return snap.exists ? ((snap.data() as SplitState) ?? {}) : {};
	} catch (error) {
		// Fail-open: judge anyway. One redundant call beats a theme that never splits.
		logger.warn('synthesis.splitThemes: sweep-state read failed, judging anyway', {
			parentId,
			error: error instanceof Error ? error.message : String(error),
		});

		return {};
	}
}

async function recordJudged(parentId: string, themeId: string, fingerprint: string): Promise<void> {
	try {
		await db()
			.collection(SWEEP_STATE_COLLECTION)
			.doc(parentId)
			.set({ judged: { [themeId]: fingerprint }, judgedAt: Date.now() }, { merge: true });
	} catch (error) {
		logger.warn('synthesis.splitThemes: sweep-state write failed', {
			parentId,
			themeId,
			error: error instanceof Error ? error.message : String(error),
		});
	}
}

/** Leaves a theme reaches: a synthesis counts for each of its members. */
export function leafCount(theme: Statement, byId: Map<string, Statement>): number {
	let n = 0;
	for (const id of theme.integratedOptions ?? []) {
		const member = byId.get(id);
		n += member && isSynth(member) ? (member.integratedOptions ?? []).length : 1;
	}

	return n;
}

export function isOversized(leaves: number, placedTotal: number): boolean {
	if (leaves < MIN_LEAVES_TO_SPLIT) return false;

	return (
		leaves >= ALWAYS_SPLIT_ABOVE_LEAVES ||
		leaves / Math.max(placedTotal, 1) >= SPLIT_SHARE_OF_PLACED
	);
}

export interface SplitResult {
	splits: number;
	/** Sub-topics created across all splits. */
	created: number;
	themesBefore: number;
	/** Themes that met the size trigger. */
	candidates: number;
	/** Candidates whose exact membership had already been judged; no LLM call. */
	skipped: number;
}

export async function splitOversizedThemes(
	parentId: string,
	questionContext: string,
	triggerSource: string,
): Promise<SplitResult> {
	const empty: SplitResult = { splits: 0, created: 0, themesBefore: 0, candidates: 0, skipped: 0 };

	let all: Statement[];
	try {
		const snap = await db()
			.collection(Collections.statements)
			.where('parentId', '==', parentId)
			.where('statementType', '==', StatementType.option)
			.get();
		all = snap.docs.map((d) => d.data() as Statement);
	} catch (error) {
		logger.warn('synthesis.splitThemes: listing failed', {
			parentId,
			error: error instanceof Error ? error.message : String(error),
		});

		return empty;
	}

	const byId = new Map(all.map((s) => [s.statementId, s]));
	const themes = all.filter((s) => s.isCluster === true && s.hide !== true && isTopicCluster(s));
	const result: SplitResult = { ...empty, themesBefore: themes.length };
	if (themes.length === 0) return result;

	const leaves = new Map(themes.map((t) => [t.statementId, leafCount(t, byId)]));
	const placedTotal = Array.from(leaves.values()).reduce((a, b) => a + b, 0);
	const candidates = themes
		.filter((t) => isOversized(leaves.get(t.statementId) ?? 0, placedTotal))
		.sort((a, b) => (leaves.get(b.statementId) ?? 0) - (leaves.get(a.statementId) ?? 0));
	result.candidates = candidates.length;
	if (candidates.length === 0) return result;

	const state = await loadState(parentId);

	for (const theme of candidates) {
		if (result.splits >= MAX_SPLITS_PER_SWEEP) break;

		const fingerprint = membershipFingerprint(theme);
		if (state.judged?.[theme.statementId] === fingerprint) {
			result.skipped++;
			continue;
		}

		const directMembers = theme.integratedOptions ?? [];
		if (directMembers.length > MAX_MEMBERS_IN_PROMPT) {
			logger.warn('synthesis.splitThemes: theme too large for one prompt, left as is', {
				parentId,
				themeId: theme.statementId,
				members: directMembers.length,
			});
			continue;
		}

		const members: ThemeSplitMember[] = directMembers
			.map((id) => ({ id, title: byId.get(id)?.statement ?? '' }))
			.filter((m) => m.title.length > 0);

		const subTopics = await proposeThemeSplit({
			theme: {
				id: theme.statementId,
				title: theme.statement ?? '',
				description: theme.description,
			},
			members,
			questionContext,
			otherThemeTitles: themes
				.filter((t) => t.statementId !== theme.statementId)
				.map((t) => t.statement ?? '')
				.filter(Boolean),
			placedTotal,
		});
		// Judged, whatever the answer — "one coherent sub-area" is a real verdict
		// on THIS membership, and the next sweep must not re-ask it.
		await recordJudged(parentId, theme.statementId, fingerprint);
		if (subTopics.length === 0) {
			logger.info('synthesis.splitThemes.noSplit', {
				parentId,
				themeId: theme.statementId,
				leaves: leaves.get(theme.statementId),
				placedTotal,
			});
			continue;
		}

		const applied = await applySplit(theme, subTopics, fingerprint, parentId, triggerSource);
		if (!applied) continue;

		result.splits++;
		result.created += applied.length;
	}

	return result;
}

/**
 * Create the sub-topics, move the members, hide the parent — atomically, and
 * only if the parent is still exactly the theme the judge was shown. The queue
 * worker files into themes concurrently; a parent that gained or lost a member
 * since the read is left for the next sweep rather than split on stale
 * evidence.
 */
async function applySplit(
	parent: Statement,
	subTopics: { title: string; description: string; memberIds: string[] }[],
	fingerprint: string,
	parentId: string,
	triggerSource: string,
): Promise<string[] | null> {
	const now = Date.now();
	const parentRef = db().collection(Collections.statements).doc(parent.statementId);
	const created = subTopics.map((sub) => {
		const id = getRandomUID();
		const doc: Partial<Statement> & Record<string, unknown> = {
			statementId: id,
			statement: sub.title,
			description: sub.description,
			statementType: StatementType.option,
			parentId: parent.parentId,
			parents: parent.parents ?? [],
			topParentId: parent.topParentId ?? parent.parentId,
			creatorId: parent.creatorId,
			creator: parent.creator,
			createdAt: now,
			lastUpdate: now,
			consensus: 0,
			integratedOptions: sub.memberIds,
			isCluster: true,
			isSynthesis: false,
			derivedByPipeline: 'topic-cluster',
			synthesisMechanism: 'live-spawn',
			liveSynthOrigin: 'split',
			splitFrom: parent.statementId,
			hide: false,
		};

		return { id, doc, sub };
	});
	const assigned = new Set(subTopics.flatMap((s) => s.memberIds));
	const unassigned = (parent.integratedOptions ?? []).filter((id) => !assigned.has(id));

	try {
		await db().runTransaction(async (tx) => {
			const fresh = await tx.get(parentRef);
			const current = fresh.exists ? (fresh.data() as Statement) : null;
			if (!current || current.hide === true || membershipFingerprint(current) !== fingerprint) {
				throw new Error('parent changed since it was judged');
			}
			for (const { id, doc } of created) {
				tx.set(db().collection(Collections.statements).doc(id), doc);
			}
			tx.update(parentRef, {
				hide: true,
				splitInto: created.map((c) => c.id),
				integratedOptions: [],
				lastUpdate: now,
			});
		});
	} catch (error) {
		logger.warn('synthesis.splitThemes: split not applied', {
			parentId,
			themeId: parent.statementId,
			error: error instanceof Error ? error.message : String(error),
		});

		return null;
	}

	logger.info('synthesis.splitThemes.split', {
		parentId,
		themeId: parent.statementId,
		title: parent.statement?.substring(0, 60),
		subTopics: created.map((c) => ({
			id: c.id,
			title: c.sub.title.substring(0, 60),
			members: c.sub.memberIds.length,
		})),
		unassigned: unassigned.length,
		triggerSource,
	});

	await recordLiveSynthEvent({
		action: 'split',
		clusterId: parent.statementId,
		reason: `theme split into ${created.length} sub-topics (${unassigned.length} member(s) left unthemed)`,
		prevState: { integratedOptions: parent.integratedOptions ?? [] },
		newState: {
			splitInto: created.map((c) => ({ id: c.id, title: c.sub.title, members: c.sub.memberIds })),
			unassigned,
		},
		triggerSource: `${triggerSource}:themeSplit`,
		parentStatementId: parentId,
	});

	for (const { id } of created) {
		await enqueueClusterRecompute(id, `${triggerSource}:themeSplit`);
	}

	return created.map((c) => c.id);
}
