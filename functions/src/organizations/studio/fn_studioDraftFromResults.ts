import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v1';
import {
	Collections,
	DEFAULT_DRAFT_CUTOFF,
	Statement,
	StudioDraftCutoff,
	functionConfig,
	getRandomUID,
} from '@freedi/shared-types';
import { db } from '../../db';
import { logError } from '../../utils/errorHandling';
import { assertStatementAdmin } from '../../progress/assertStatementAdmin';
import { getCallerIdentity } from '../orgInvites';
import { getStudioBaseUrl } from '../orgAuth';
import { loadCallerUser } from '../orgStatements';
import { isSignDocument } from './documentStatus';
import {
	draftLanguage,
	generateDraft,
	loadDraftSources,
	writeDraftParagraphs,
} from './draftWriter';

export interface DraftFromResultsRequest {
	documentId: string;
	sourceStatementIds?: string[];
	cutoff?: StudioDraftCutoff;
	intent?: string;
}

export interface DraftFromResultsResult {
	documentId: string;
	paragraphCount: number;
	openGaps: number;
	signAdminUrl: string;
}

const CUTOFF_MODES: ReadonlySet<string> = new Set(['chosen', 'topN', 'threshold']);
const INTENT_MAX = 1000;

export function normalizeCutoff(raw: StudioDraftCutoff | undefined): StudioDraftCutoff {
	if (!raw || !CUTOFF_MODES.has(raw.mode)) return DEFAULT_DRAFT_CUTOFF;
	const cutoff: StudioDraftCutoff = { mode: raw.mode };
	if (typeof raw.n === 'number' && raw.n > 0) cutoff.n = Math.round(raw.n);
	if (typeof raw.minConsensus === 'number') cutoff.minConsensus = raw.minConsensus;
	if (typeof raw.minEvaluators === 'number' && raw.minEvaluators >= 0) {
		cutoff.minEvaluators = Math.round(raw.minEvaluators);
	}

	return cutoff;
}

export interface RunDraftInput {
	documentId: string;
	sourceStatementIds: string[];
	cutoff: StudioDraftCutoff;
	intent?: string;
	language?: string;
	actorUid: string;
	actorName: string;
	actorEmail: string | null;
	now: number;
}

/** Shared by the callable and the `draft` scheduled action. */
export async function runDraft(input: RunDraftInput): Promise<DraftFromResultsResult> {
	const docSnap = await db.collection(Collections.statements).doc(input.documentId).get();
	if (!docSnap.exists) throw new HttpsError('not-found', 'Document not found');
	const document = docSnap.data() as Statement;
	if (!isSignDocument(document)) throw new HttpsError('failed-precondition', 'Not a document');

	const topId = document.parentId === 'top' ? document.statementId : document.topParentId;
	const topSnap = await db.collection(Collections.statements).doc(topId).get();
	const topQuestion = topSnap.exists ? (topSnap.data() as Statement).statement : document.statement;

	const sources = await loadDraftSources(input.sourceStatementIds, input.cutoff);
	const total = sources.reduce((n, s) => n + s.suggestions.length, 0);
	if (total === 0) {
		throw new HttpsError(
			'failed-precondition',
			'No suggestions pass the cutoff yet — lower it or wait for more ratings',
		);
	}
	// Sources must belong to the same main question as the document.
	sources.forEach((s) => {
		const sourceTop =
			s.statement.parentId === 'top' ? s.statement.statementId : s.statement.topParentId;
		if (sourceTop !== topId) {
			throw new HttpsError('permission-denied', 'Sources must belong to the same main question');
		}
	});

	const languageCode = draftLanguage(sources, input.language ?? 'en');
	const draft = await generateDraft({ sources, topQuestion, intent: input.intent, languageCode });
	const creator = await loadCallerUser(input.actorUid, {
		email: input.actorEmail,
		displayName: input.actorName,
	});
	const runId = getRandomUID();
	const written = await writeDraftParagraphs({
		document,
		draft,
		sources,
		creator,
		runId,
		languageCode,
		now: input.now,
	});

	logger.info('[studioDraft] written', {
		documentId: input.documentId,
		sources: input.sourceStatementIds.length,
		suggestions: total,
		...written,
	});

	return {
		documentId: input.documentId,
		...written,
		signAdminUrl: `${signBaseUrl()}/doc/${input.documentId}/admin/editor`,
	};
}

function signBaseUrl(): string {
	return process.env.SIGN_APP_BASE_URL || getStudioBaseUrl().replace('studio.', 'sign.');
}

/** Admin: write (or rewrite) a document's draft from the results of source activities. */
export const fn_studioDraftFromResults = onCall(
	{ region: functionConfig.region, timeoutSeconds: 300, memory: '1GiB' },
	async (request: CallableRequest<DraftFromResultsRequest>): Promise<DraftFromResultsResult> => {
		const caller = getCallerIdentity(request);
		const { documentId, sourceStatementIds, cutoff, intent } = request.data ?? {};
		if (!documentId || typeof documentId !== 'string') {
			throw new HttpsError('invalid-argument', 'documentId is required');
		}
		if (!Array.isArray(sourceStatementIds) || sourceStatementIds.length === 0) {
			throw new HttpsError('invalid-argument', 'sourceStatementIds is required');
		}
		if (sourceStatementIds.some((id) => typeof id !== 'string' || !id)) {
			throw new HttpsError('invalid-argument', 'Invalid source id');
		}
		await assertStatementAdmin(caller.uid, documentId, 'studio.draft');
		try {
			return await runDraft({
				documentId,
				sourceStatementIds: [...new Set(sourceStatementIds)],
				cutoff: normalizeCutoff(cutoff),
				intent: typeof intent === 'string' ? intent.trim().slice(0, INTENT_MAX) : undefined,
				actorUid: caller.uid,
				actorName: caller.displayName,
				actorEmail: caller.email,
				now: Date.now(),
			});
		} catch (error) {
			if (error instanceof HttpsError) throw error;
			logError(error, {
				operation: 'studio.draft.fromResults',
				userId: caller.uid,
				statementId: documentId,
				metadata: { sources: sourceStatementIds.length },
			});
			throw new HttpsError('internal', 'Could not write the draft');
		}
	},
);
