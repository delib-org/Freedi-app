import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { Collections, QuestionType, type Statement } from '@freedi/shared-types';

/**
 * Per-question feature gate for the live-synth triggers.
 *
 * The global env-var flag (`SYNTHESIS_LIVE_SYNTH_ENABLED`) is the
 * deploy-wide kill switch. This module is the per-question layer on top:
 * it decides whether live-synth should run for a given question even when
 * the global flag is ON.
 *
 * Default policy (the user's product call):
 *   - **Mass-Consensus questions**: live-synth ON by default. MC is built
 *     for many participants (often hundreds-to-thousands), so background
 *     attach/spawn keeps the option set clean without admin intervention.
 *   - **All other questions**: live-synth OFF by default. The rest of the
 *     app is designed for small participant counts where a foreground
 *     "join similar?" prompt is enough — autonomous merging would surprise
 *     admins who expect every option to stand on its own.
 *
 * Admin override: an explicit boolean on `statement.statementSettings.
 * liveSynthEnabled` always wins over the default. We don't add this field
 * to the shared-types schema today because the codebase uses a packaged
 * .tgz for `@freedi/shared-types` — adding a typed field would require a
 * coordinated rebuild + reinstall. Instead we read the override via a
 * typed cast, the same pattern Ship 3b uses for `optedOutOfMerge`. The
 * UI can write the field freely; Firestore stores it.
 *
 * Inheritance: when a question has no explicit override, we walk up to
 * its `topParent` (a sub-question may live under a top-level MC parent).
 * The first explicit override found wins. If neither has one, the default
 * fires.
 */

interface FeatureGateInput {
	/** The question (or sub-question) under which the option was created/updated. */
	parent: Statement;
	/**
	 * The top-level question. Optional — when omitted, we fetch it via
	 * `parent.topParentId` if that differs from `parent.statementId`.
	 * Pass it in when the caller already has it loaded to avoid an extra
	 * Firestore read on the trigger hot path.
	 */
	topParent?: Statement | null;
}

function db() {
	return getFirestore();
}

function readOverride(statement: Statement | null | undefined): boolean | undefined {
	if (!statement) return undefined;
	const settings = statement.statementSettings as Record<string, unknown> | undefined;
	if (!settings) return undefined;
	const raw = settings['liveSynthEnabled'];
	if (raw === true) return true;
	if (raw === false) return false;

	return undefined;
}

function isMassConsensus(statement: Statement | null | undefined): boolean {
	if (!statement) return false;

	return statement.questionSettings?.questionType === QuestionType.massConsensus;
}

/**
 * Lazy fetch the topParent if the caller didn't provide it. Best-effort:
 * a missing or unreadable topParent doesn't block the gate decision —
 * we fall back to the question's own settings + default.
 */
async function loadTopParent(parent: Statement): Promise<Statement | null> {
	const topId = parent.topParentId;
	if (!topId || topId === parent.statementId) return parent;
	try {
		const snap = await db().collection(Collections.statements).doc(topId).get();
		if (!snap.exists) return null;

		return snap.data() as Statement;
	} catch (error) {
		logger.warn('liveSynth.featureGate: topParent fetch failed', {
			parentId: parent.statementId,
			topParentId: topId,
			error: error instanceof Error ? error.message : String(error),
		});

		return null;
	}
}

/**
 * Decide whether live-synth runs for this question. Returns true/false
 * synchronously after at most one Firestore read (only for the topParent,
 * and only when the caller didn't supply it).
 */
export async function isLiveSynthEnabledForQuestion(input: FeatureGateInput): Promise<boolean> {
	const { parent } = input;
	if (!parent) return false;

	// 1. Explicit override on the question itself wins.
	const directOverride = readOverride(parent);
	if (directOverride !== undefined) return directOverride;

	// 2. Else look at topParent. Many sub-questions inherit MC-ness
	//    transitively; the override may live there.
	const topParent = input.topParent === undefined ? await loadTopParent(parent) : input.topParent;
	const topOverride = readOverride(topParent);
	if (topOverride !== undefined) return topOverride;

	// 3. Default by question type. MC is opt-in for the bulk; everything
	//    else is opt-in only via explicit override.
	if (isMassConsensus(parent)) return true;
	if (isMassConsensus(topParent)) return true;

	return false;
}

export const __INTERNAL = { readOverride, isMassConsensus };
