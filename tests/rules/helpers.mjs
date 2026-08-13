import { readFileSync } from 'node:fs';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';

/**
 * The emulator port comes from firebase.json (firestore: 8081), not the
 * Firebase default 8080 — running these against 8080 silently starts a second
 * emulator with no rules loaded and every assertion passes for the wrong reason.
 */
export const FIRESTORE_PORT = Number(process.env.FIRESTORE_EMULATOR_PORT ?? 8081);

/**
 * A dedicated project id keeps this harness's writes out of the emulator data
 * the app scripts (seed.ts, fastlane.ts) are using at the same time.
 *
 * Each test FILE gets its own project, because `node --test` runs files in
 * parallel processes: with a shared project, one file's clearFirestore() would
 * delete another file's fixtures mid-assertion.
 */
export const PROJECT_ID = 'freedi-rules-test';

const RULES_PATH = new URL('../../firestore.rules', import.meta.url);

/**
 * Always starts from an empty database.
 *
 * Without the clear, documents survive between runs, and a `create` assertion
 * silently becomes an `update` assertion the second time it runs — a create
 * rule can then look broken (or, worse, look fine) for reasons that have
 * nothing to do with the rule. Test state must not be a function of how many
 * times the suite has been run.
 */
export async function makeEnv(suite) {
	const env = await initializeTestEnvironment({
		projectId: `${PROJECT_ID}-${suite}`,
		firestore: {
			rules: readFileSync(RULES_PATH, 'utf8'),
			host: '127.0.0.1',
			port: FIRESTORE_PORT,
		},
	});
	await env.clearFirestore();

	return env;
}

/**
 * Seed documents past the rules (admin context). Use this for arranging the
 * world a test acts on — never for the action under test.
 */
export async function seed(env, writer) {
	await env.withSecurityRulesDisabled(async (context) => {
		await writer(context.firestore());
	});
}

/**
 * A statement shaped closely enough for the rules to evaluate honestly.
 *
 * Both `creatorId` and `creator.uid` are populated because the two coexist in
 * the product and the rules' isCreator() reads one of them; a fixture that set
 * only one would make a create-rule test pass or fail for the wrong reason.
 */
export function statementDoc({ statementId, uid, overrides = {} }) {
	return {
		statementId,
		statement: 'a statement',
		description: '',
		creatorId: uid,
		creator: { uid, displayName: 'Someone', isAnonymous: false },
		parentId: 'parent-1',
		topParentId: 'top-1',
		parents: ['top-1', 'parent-1'],
		statementType: 'option',
		createdAt: 1_700_000_000_000,
		lastUpdate: 1_700_000_000_000,
		consensus: 0,
		...overrides,
	};
}

/**
 * An Agora proposal: a plain statement carrying agoraSessionId, and crucially
 * WITHOUT questionSettings/statementSettings. That absence is the whole point —
 * hasProtectedFieldChanges() in firestore.rules is gated on the doc having both
 * keys, so docs like this one fall through every protection on /statements.
 */
export function agoraProposalDoc({ statementId, uid, sessionId, overrides = {} }) {
	return statementDoc({
		statementId,
		uid,
		overrides: {
			agoraSessionId: sessionId,
			anonName: 'שועל כחול',
			creator: { uid, displayName: 'שועל כחול', isAnonymous: true },
			...overrides,
		},
	});
}

export function evaluationDoc({ evaluatorId, statementId, evaluation = 1, overrides = {} }) {
	return {
		evaluationId: `${evaluatorId}--${statementId}`,
		parentId: 'parent-1',
		statementId,
		evaluatorId,
		evaluation,
		updatedAt: 1_700_000_000_000,
		...overrides,
	};
}

export function agoraParticipantDoc({ sessionId, uid, overrides = {} }) {
	return {
		participantId: `${sessionId}--${uid}`,
		sessionId,
		userId: uid,
		anonName: 'שועל כחול',
		isAI: false,
		points: { valueAccuracy: 0, proposals: 0, helping: 0, total: 0 },
		creditedRatings: 0,
		lastActive: 1_700_000_000_000,
		...overrides,
	};
}
