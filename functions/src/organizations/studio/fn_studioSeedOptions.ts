import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v1';
import {
	Collections,
	QuestionType,
	Statement,
	STUDIO_SEED_OPTIONS_COUNT,
	functionConfig,
} from '@freedi/shared-types';
import { db } from '../../db';
import { logError } from '../../utils/errorHandling';
import { assertStatementAdmin } from '../../progress/assertStatementAdmin';
import { detectLanguage } from '../../services/topic-cluster/language';
import { commitInChunks } from '../orgAuth';
import { getCallerIdentity } from '../orgInvites';
import { loadCallerUser } from '../orgStatements';
import { LANGUAGE_NAMES } from './planSession';
import {
	buildSeedOption,
	generateSeedOptions,
	loadExistingOptions,
	seedOptionWrites,
} from './seedOptions';

export interface SeedOptionsRequest {
	statementId: string;
	count?: number;
	intent?: string;
	language?: string;
}

export interface SeedOptionsResult {
	statementId: string;
	created: number;
	total: number;
}

const MAX_COUNT = 10;

/** Admin: seed a crowd survey question with starting suggestions. */
export const fn_studioSeedOptions = onCall(
	{ region: functionConfig.region, timeoutSeconds: 120 },
	async (request: CallableRequest<SeedOptionsRequest>): Promise<SeedOptionsResult> => {
		const caller = getCallerIdentity(request);
		const { statementId, count, intent, language } = request.data ?? {};
		if (!statementId || typeof statementId !== 'string') {
			throw new HttpsError('invalid-argument', 'statementId is required');
		}
		const wanted =
			typeof count === 'number' && count > 0
				? Math.min(MAX_COUNT, Math.round(count))
				: STUDIO_SEED_OPTIONS_COUNT;
		const { statement: question } = await assertStatementAdmin(
			caller.uid,
			statementId,
			'studio.seedOptions',
		);
		if (question.questionSettings?.questionType !== QuestionType.massConsensus) {
			throw new HttpsError('failed-precondition', 'Only crowd surveys are seeded');
		}
		try {
			const existing = await loadExistingOptions(statementId);
			const missing = wanted - existing.length;
			if (missing <= 0) return { statementId, created: 0, total: existing.length };

			const detected = detectLanguage(question.statement);
			const languageCode = LANGUAGE_NAMES[detected]
				? detected
				: typeof language === 'string' && LANGUAGE_NAMES[language]
					? language
					: 'en';
			const topId = question.parentId === 'top' ? question.statementId : question.topParentId;
			const topSnap = topId
				? await db.collection(Collections.statements).doc(topId).get()
				: undefined;
			const texts = await generateSeedOptions({
				question,
				topQuestion: topSnap?.exists ? (topSnap.data() as Statement).statement : undefined,
				languageCode,
				count: missing,
				intent: typeof intent === 'string' ? intent.trim().slice(0, 500) : undefined,
				existing: existing.map((s) => s.statement),
			});
			const creator = await loadCallerUser(caller.uid, caller);
			const now = Date.now();
			const options = texts.map((text, index) =>
				buildSeedOption({
					statementId: db.collection(Collections.statements).doc().id,
					question,
					text,
					creator,
					index: existing.length + index,
				}),
			);
			await commitInChunks(seedOptionWrites(options, statementId, now));
			logger.info('[studioSeedOptions] seeded', { statementId, created: options.length });

			return { statementId, created: options.length, total: existing.length + options.length };
		} catch (error) {
			if (error instanceof HttpsError) throw error;
			logError(error, { operation: 'studio.seedOptions', userId: caller.uid, statementId });
			throw new HttpsError('internal', 'Could not seed the suggestions');
		}
	},
);
