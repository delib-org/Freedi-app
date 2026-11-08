import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import {
	Collections,
	ODYSSEY_TRANSLATION_LANGS,
	functionConfig,
	odysseyTranslationsPath,
} from '@freedi/shared-types';
import type {
	OdysseyGame,
	OdysseyGameTranslation,
	OdysseyTranslateGameRequest as Request,
	OdysseyTranslateGameResponse as Result,
	OdysseyTranslationLang,
	Statement,
} from '@freedi/shared-types';
import { db } from '../db';
import { logError } from '../utils/errorHandling';
import { buildTranslationChunks } from './translation/translationSource';
import type { TranslationChunk } from './translation/translationSource';
import { assembleTranslationDoc, staleItems } from './translation/translationDoc';
import { batchItems, translateBatch } from './translation/translateChunk';

const OPERATION = 'odyssey.translateGame';

/** Long enough for a full game (a dozen islands, a dozen elders) in one press. */
const TIMEOUT_SECONDS = 540;

/**
 * Translate one game's Hebrew content into English or Arabic.
 *
 * Hebrew stays the single source: this writes an overlay document
 * (`odysseyGames/{gameId}/translations/{lang}`) that the client lays over
 * the Hebrew per field. Every source field is hashed, so a second press
 * after a Hebrew edit re-translates only what changed; `force` redoes all.
 * A chunk the model fails is logged and skipped — its previous translation
 * (if any) is kept — rather than failing the whole press, because a
 * half-updated overlay is still a readable game. `dryRun` only counts the
 * stale fields, for the admin screen's status line.
 */
export const odysseyTranslateGame = onCall(
	{ region: functionConfig.region, timeoutSeconds: TIMEOUT_SECONDS, memory: '512MiB' },
	async (request: CallableRequest<Request>): Promise<Result> => {
		const uid = request.auth?.uid;
		if (!uid) throw new HttpsError('unauthenticated', 'User must be authenticated');

		const { gameId, lang, force, dryRun } = parseRequest(request.data);
		const game = await loadGameOrThrow(gameId);
		if (game.creatorId !== uid && !game.adminUids.includes(uid)) {
			throw new HttpsError('permission-denied', 'Only a game admin may translate it');
		}

		try {
			const [statements, previous] = await Promise.all([
				loadGameStatements(game.rootStatementId),
				loadTranslation(gameId, lang),
			]);
			const chunks = buildTranslationChunks(game, statements);
			const total = chunks.reduce((sum, chunk) => sum + chunk.items.length, 0);
			if (dryRun) {
				const stale = chunks.reduce(
					(sum, chunk) => sum + staleItems(chunk.items, previous, force === true).length,
					0,
				);

				return { lang, translated: stale, failed: 0, skipped: total - stale, total };
			}
			const { fresh, failed } = await translateStale(chunks, lang, previous, force === true, {
				gameId,
				uid,
			});
			const translated = Object.keys(fresh).length;
			const doc = assembleTranslationDoc({
				gameId,
				lang,
				chunks,
				previous,
				fresh,
				now: Date.now(),
			});
			await db.collection(odysseyTranslationsPath(gameId)).doc(lang).set(doc);
			logger.info('Odyssey game translated', { gameId, lang, total, translated, failed });

			return { lang, translated, failed, skipped: total - translated - failed, total };
		} catch (error) {
			logError(error, { operation: OPERATION, userId: uid, metadata: { gameId, lang } });
			throw new HttpsError('internal', 'Translation failed');
		}
	},
);

function parseRequest(data: Partial<Request> | undefined): Request {
	const gameId = typeof data?.gameId === 'string' ? data.gameId.trim() : '';
	if (!gameId) throw new HttpsError('invalid-argument', 'gameId is required');
	const lang = data?.lang;
	if (!isTranslationLang(lang)) {
		throw new HttpsError(
			'invalid-argument',
			`lang must be one of ${ODYSSEY_TRANSLATION_LANGS.join(', ')}`,
		);
	}

	return { gameId, lang, force: data?.force === true, dryRun: data?.dryRun === true };
}

function isTranslationLang(value: unknown): value is OdysseyTranslationLang {
	return (ODYSSEY_TRANSLATION_LANGS as readonly unknown[]).includes(value);
}

async function loadGameOrThrow(gameId: string): Promise<OdysseyGame> {
	const snap = await db.collection(Collections.odysseyGames).doc(gameId).get();
	if (!snap.exists) throw new HttpsError('not-found', 'Game not found');

	return snap.data() as OdysseyGame;
}

/** Same query the client's loadGame runs: every descendant of the game root. */
async function loadGameStatements(rootStatementId: string): Promise<Statement[]> {
	const snap = await db
		.collection(Collections.statements)
		.where('parents', 'array-contains', rootStatementId)
		.get();

	return snap.docs.map((doc) => doc.data() as Statement);
}

async function loadTranslation(
	gameId: string,
	lang: OdysseyTranslationLang,
): Promise<OdysseyGameTranslation | null> {
	const snap = await db.collection(odysseyTranslationsPath(gameId)).doc(lang).get();

	return snap.exists ? (snap.data() as OdysseyGameTranslation) : null;
}

/**
 * Translate every stale item, chunk by chunk, batch by batch, in parallel
 * (the OpenAI helper caps the concurrency). Returns the accepted answers and
 * how many items got none — a failed batch or a key the model dropped.
 */
async function translateStale(
	chunks: TranslationChunk[],
	lang: OdysseyTranslationLang,
	previous: OdysseyGameTranslation | null,
	force: boolean,
	context: { gameId: string; uid: string },
): Promise<{ fresh: Record<string, string>; failed: number }> {
	const fresh: Record<string, string> = {};
	let failed = 0;
	const jobs = chunks.flatMap((chunk) =>
		batchItems(staleItems(chunk.items, previous, force)).map(async (batch) => {
			try {
				const answers = await translateBatch(lang, batch, chunk.voice);
				Object.assign(fresh, answers);
				failed += batch.length - Object.keys(answers).length;
			} catch (error) {
				failed += batch.length;
				logError(error, {
					operation: OPERATION,
					userId: context.uid,
					metadata: { gameId: context.gameId, lang, chunkId: chunk.chunkId, items: batch.length },
				});
			}
		}),
	);
	await Promise.all(jobs);

	return { fresh, failed };
}
