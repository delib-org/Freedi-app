import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import {
	Collections,
	StatementType,
	THEME_SOURCE_LLM_REBUILD,
	getRandomUID,
	type Statement,
} from '@freedi/shared-types';
import { collectAbsorbedIds } from '../../condensation/absorbedClusters';
import { recordLiveSynthEvent } from '../liveSynth/auditLog';
import { enqueueClusterRecompute } from '../liveSynth/clusterRecompute';
import { FIRESTORE_BATCH_LIMIT, LIVE_THEME_STATE_COLLECTIONS } from './constants';
import type { HiddenTheme, MatchResult, MatchedTheme } from './types';

/**
 * Write a rebuilt theme list. One transaction per theme (a reused doc is
 * re-read so a theme hidden since the preview gets a fresh doc instead of
 * being resurrected), then one batch for the hides.
 *
 * Theme docs keep the live shape (`isCluster`, `derivedByPipeline:
 * 'topic-cluster'`, `integratedOptions`), so filing, split and merge treat them
 * like any other theme afterwards. Every old theme is either overwritten or
 * hidden with its members cleared, so each atom ends up in exactly one theme.
 */

const TRIGGER_SOURCE = 'rebuildThemes';

function db() {
	return getFirestore();
}

export interface ApplyInput {
	question: Statement;
	runId: string;
	match: MatchResult;
	/** The question's visible themes now; the source of losers' absorbed ids. */
	liveThemes: Statement[];
}

export interface ApplyCounts {
	themesWritten: number;
	themesHidden: number;
	atomsPlaced: number;
}

function themeFields(theme: MatchedTheme, runId: string, now: number): Partial<Statement> {
	return {
		statement: theme.name,
		description: theme.rule,
		integratedOptions: theme.memberIds,
		themeRule: theme.rule,
		themeSource: THEME_SOURCE_LLM_REBUILD,
		themeRebuildRunId: runId,
		lastUpdate: now,
	};
}

function newThemeDoc(
	id: string,
	theme: MatchedTheme,
	question: Statement,
	runId: string,
	absorbed: string[],
): Partial<Statement> & { isSynthesis: boolean } {
	const now = Date.now();

	return {
		...themeFields(theme, runId, now),
		statementId: id,
		statementType: StatementType.option,
		parentId: question.statementId,
		parents: [...(question.parents ?? []), question.statementId],
		topParentId: question.topParentId || question.statementId,
		creatorId: question.creatorId,
		creator: question.creator,
		createdAt: now,
		consensus: 0,
		isCluster: true,
		isSynthesis: false,
		derivedByPipeline: 'topic-cluster',
		synthesisMechanism: 'bulk',
		hide: false,
		...(absorbed.length > 0 ? { absorbedClusterIds: absorbed } : {}),
	};
}

/** Returns the id written: the reused doc, or a new one when it is gone. */
async function writeTheme(
	theme: MatchedTheme,
	losers: Statement[],
	input: ApplyInput,
): Promise<string> {
	const statements = db().collection(Collections.statements);

	return db().runTransaction(async (tx) => {
		if (theme.reusesThemeId) {
			const ref = statements.doc(theme.reusesThemeId);
			const snap = await tx.get(ref);
			const current = snap.exists ? (snap.data() as Statement) : null;
			if (current && current.hide !== true) {
				const absorbed = new Set([
					...(current.absorbedClusterIds ?? []),
					...collectAbsorbedIds(ref.id, losers),
				]);
				tx.update(ref, {
					...themeFields(theme, input.runId, Date.now()),
					absorbedClusterIds: [...absorbed],
				});

				return ref.id;
			}
		}
		const id = getRandomUID();
		const absorbed = collectAbsorbedIds(id, losers);
		tx.set(statements.doc(id), newThemeDoc(id, theme, input.question, input.runId, absorbed));

		return id;
	});
}

async function hideThemes(hidden: HiddenTheme[], idByKey: Map<string, string>): Promise<void> {
	const statements = db().collection(Collections.statements);
	for (let i = 0; i < hidden.length; i += FIRESTORE_BATCH_LIMIT) {
		const batch = db().batch();
		for (const h of hidden.slice(i, i + FIRESTORE_BATCH_LIMIT)) {
			const mergedInto = h.mergedIntoKey ? idByKey.get(h.mergedIntoKey) : undefined;
			batch.update(statements.doc(h.themeId), {
				hide: true,
				integratedOptions: [],
				...(mergedInto ? { mergedInto } : {}),
				lastUpdate: Date.now(),
			});
		}
		await batch.commit();
	}
}

/**
 * The live sweeps remember which theme list they last judged per question.
 * Cleared so they judge the rebuilt list instead of skipping it.
 */
export async function resetLiveThemeState(questionId: string): Promise<void> {
	await Promise.all(
		LIVE_THEME_STATE_COLLECTIONS.map(async (name) => {
			try {
				await db().collection(name).doc(questionId).delete();
			} catch (error) {
				logger.warn('themeRebuild.apply: live theme state reset failed', {
					questionId,
					collection: name,
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}),
	);
}

async function auditTheme(
	theme: MatchedTheme,
	themeId: string,
	input: ApplyInput,
	previous: Statement | undefined,
): Promise<void> {
	await recordLiveSynthEvent({
		action: 'theme-rebuild',
		clusterId: themeId,
		reason: `theme ${previous ? 'rewritten' : 'created'} by AI rebuild "${theme.name}"`,
		prevState: previous
			? { statement: previous.statement, integratedOptions: previous.integratedOptions ?? [] }
			: undefined,
		newState: { statement: theme.name, rule: theme.rule, integratedOptions: theme.memberIds },
		triggerSource: `${TRIGGER_SOURCE}:${input.runId}`,
		parentStatementId: input.question.statementId,
	});
}

export async function applyRebuild(input: ApplyInput): Promise<ApplyCounts> {
	const { match, liveThemes } = input;
	const oldById = new Map(liveThemes.map((t) => [t.statementId, t]));
	const losersOf = (key: string): Statement[] =>
		match.hidden
			.filter((h) => h.mergedIntoKey === key)
			.map((h) => oldById.get(h.themeId))
			.filter((t): t is Statement => t !== undefined);

	const idByKey = new Map<string, string>();
	for (const theme of match.themes) {
		const themeId = await writeTheme(theme, losersOf(theme.key), input);
		idByKey.set(theme.key, themeId);
		await auditTheme(theme, themeId, input, oldById.get(themeId));
	}

	await hideThemes(match.hidden, idByKey);
	for (const h of match.hidden) {
		await recordLiveSynthEvent({
			action: 'merge',
			clusterId: h.themeId,
			reason: 'theme replaced by AI rebuild',
			prevState: { integratedOptions: oldById.get(h.themeId)?.integratedOptions ?? [] },
			newState: { hide: true, mergedInto: h.mergedIntoKey ? idByKey.get(h.mergedIntoKey) : null },
			triggerSource: `${TRIGGER_SOURCE}:${input.runId}`,
			parentStatementId: input.question.statementId,
		});
	}

	await resetLiveThemeState(input.question.statementId);
	for (const themeId of idByKey.values()) {
		await enqueueClusterRecompute(themeId, TRIGGER_SOURCE);
	}

	return {
		themesWritten: match.themes.length,
		themesHidden: match.hidden.length,
		atomsPlaced: match.themes.reduce((sum, t) => sum + t.memberIds.length, 0),
	};
}
