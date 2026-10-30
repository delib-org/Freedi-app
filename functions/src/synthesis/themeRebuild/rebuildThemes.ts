import * as v from 'valibot';
import { HttpsError } from 'firebase-functions/v2/https';
import {
	getRandomUID,
	type Statement,
	type ThemeRebuildApplyResponse,
	type ThemeRebuildFailureReason,
	type ThemeRebuildPreviewResponse,
	type ThemeRebuildRequest,
	type ThemeRebuildResponse,
} from '@freedi/shared-types';
import { logError } from '../../utils/errorHandling';
import { assertSynthesisAdmin } from '../admin/assertSynthesisAdmin';
import { recordLiveSynthEvent } from '../liveSynth/auditLog';
import { applyRebuild } from './applyRebuild';
import { assignAtoms } from './assignAtoms';
import { collectAtoms } from './collectAtoms';
import { PROPOSAL_TTL_MS } from './constants';
import { discoverThemes } from './discoverThemes';
import { matchToExisting } from './matchToExisting';
import { groupAssignments, reconcileWithCurrent, toPreviewThemes } from './proposal';
import {
	acquireLease,
	isSynthesisRunInFlight,
	loadProposal,
	markProposalApplied,
	releaseLease,
	saveProposal,
} from './rebuildStore';
import type { StoredProposal } from './types';

/**
 * "Re-theme with AI". Preview discovers a theme list in one call, sorts every
 * atom into it in small batches, matches it to the existing theme docs and
 * stores the proposal; apply writes a stored proposal after re-validating it
 * against the atoms that exist now.
 */

const OPERATION = 'synthesis.rebuildThemes';

const RequestSchema = v.object({
	questionId: v.pipe(v.string(), v.trim(), v.minLength(1)),
	mode: v.picklist(['preview', 'apply']),
	runId: v.optional(v.pipe(v.string(), v.trim(), v.minLength(1))),
});

function refuse(reason: ThemeRebuildFailureReason, message: string): HttpsError {
	return new HttpsError('failed-precondition', message, { reason });
}

export function parseRequest(data: unknown): ThemeRebuildRequest {
	const result = v.safeParse(RequestSchema, data);
	if (!result.success) {
		throw new HttpsError('invalid-argument', 'questionId and mode (preview | apply) are required');
	}
	if (result.output.mode === 'apply' && !result.output.runId) {
		throw new HttpsError('invalid-argument', 'runId is required to apply a preview');
	}

	return result.output;
}

async function runPreview(question: Statement, uid: string): Promise<ThemeRebuildPreviewResponse> {
	const questionId = question.statementId;
	const { atoms, liveThemes } = await collectAtoms(questionId);
	if (atoms.length === 0) throw refuse('no-atoms', 'This question has no ideas to theme');

	const questionText = question.statement || questionId;
	const themes = await discoverThemes(questionText, atoms);
	const atomIds = atoms.map((a) => a.id);
	const { assignments, unanswered } = await assignAtoms(questionText, themes, atoms);
	const grouped = groupAssignments(themes, atomIds, assignments);
	const match = matchToExisting(grouped.themes, liveThemes);

	const now = Date.now();
	const proposal: StoredProposal = {
		runId: getRandomUID(),
		questionId,
		createdBy: uid,
		createdAt: now,
		expiresAt: now + PROPOSAL_TTL_MS,
		atomIds,
		themes: grouped.themes,
		otherIds: grouped.otherIds,
	};
	await saveProposal(proposal);

	await recordLiveSynthEvent({
		action: 'theme-rebuild',
		clusterId: questionId,
		reason: `preview: ${grouped.themes.length} themes over ${atoms.length} atoms`,
		newState: {
			runId: proposal.runId,
			themes: match.themes.map((t) => ({ name: t.name, members: t.memberIds.length })),
			other: grouped.otherIds.length,
			unanswered,
			reused: match.themes.filter((t) => t.reusesThemeId).length,
			toHide: match.hidden.length,
		},
		triggerSource: 'rebuildThemes:preview',
		parentStatementId: questionId,
	});

	return {
		runId: proposal.runId,
		atomCount: atoms.length,
		otherCount: grouped.otherIds.length,
		themes: toPreviewThemes(match.themes, new Map(atoms.map((a) => [a.id, a.title]))),
	};
}

async function loadLiveProposal(questionId: string, runId: string): Promise<StoredProposal> {
	const proposal = await loadProposal(questionId, runId);
	if (!proposal) throw refuse('proposal-not-found', 'No preview with this runId');
	if (proposal.expiresAt <= Date.now()) {
		throw refuse('proposal-expired', 'This preview has expired; run a new one');
	}

	return proposal;
}

async function runApply(question: Statement, runId: string): Promise<ThemeRebuildApplyResponse> {
	const questionId = question.statementId;
	const proposal = await loadLiveProposal(questionId, runId);
	const { atoms, liveThemes } = await collectAtoms(questionId);
	if (atoms.length === 0) throw refuse('no-atoms', 'This question has no ideas to theme');

	// Matched again against the themes as they are NOW: one the live layer
	// created since the preview is hidden too, so no atom keeps two owners.
	const reconciled = reconcileWithCurrent(
		proposal,
		atoms.map((a) => a.id),
	);
	const match = matchToExisting(reconciled.themes, liveThemes);
	const counts = await applyRebuild({ question, runId, match, liveThemes });
	await markProposalApplied(questionId, runId);

	const response: ThemeRebuildApplyResponse = {
		runId,
		...counts,
		atomsToOther: reconciled.otherIds.length,
		lateArrivalsToOther: reconciled.lateArrivals.length,
	};
	await recordLiveSynthEvent({
		action: 'theme-rebuild',
		clusterId: questionId,
		reason: `apply: ${counts.themesWritten} themes written, ${counts.themesHidden} hidden`,
		newState: { ...response },
		triggerSource: 'rebuildThemes:apply',
		parentStatementId: questionId,
	});

	return response;
}

export async function handleRebuildThemes(
	uid: string | undefined,
	data: unknown,
): Promise<ThemeRebuildResponse> {
	if (!uid) throw new HttpsError('unauthenticated', 'User must be authenticated');
	const request = parseRequest(data);
	const question = await assertSynthesisAdmin(request.questionId, uid);

	if (await isSynthesisRunInFlight(request.questionId)) {
		throw new HttpsError('already-exists', 'A synthesis run is in progress for this question');
	}
	const holder = getRandomUID();
	if (!(await acquireLease(request.questionId, holder))) {
		throw new HttpsError('already-exists', 'A theme rebuild is already running for this question');
	}

	try {
		return request.mode === 'preview'
			? await runPreview(question, uid)
			: await runApply(question, request.runId ?? '');
	} catch (error) {
		if (error instanceof HttpsError) throw error;
		logError(error, {
			operation: OPERATION,
			userId: uid,
			statementId: request.questionId,
			metadata: { mode: request.mode, runId: request.runId },
		});
		throw new HttpsError('internal', 'Theme rebuild failed');
	} finally {
		await releaseLease(request.questionId, holder);
	}
}
