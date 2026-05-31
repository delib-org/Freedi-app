import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { Collections, QuestionType, type Statement } from '@freedi/shared-types';
import {
	DEFAULT_SYNTHESIS_SETTINGS,
	MC_DEFAULT_SYNTHESIS_SETTINGS,
	type SynthesisSettings,
} from './types';

/**
 * Resolve effective synthesis settings for a question.
 *
 * Resolution order:
 *   1. Explicit `statementSettings.synthesis` block on the question.
 *   2. Legacy `statementSettings.liveSynthEnabled` boolean — kept for one
 *      release as a compatibility shim. When present (and `synthesis` block
 *      is missing), it maps to `enabled` only; everything else uses defaults.
 *   3. Default by question type. Mass-Consensus questions default to ON;
 *      everything else defaults to OFF.
 *
 * Never throws. On any read error (missing parent, unreadable doc, etc.) we
 * log + return the disabled default — the pipeline then no-ops cleanly.
 */

function db() {
	return getFirestore();
}

function readSynthesisBlock(
	statement: Statement | null | undefined,
): Partial<SynthesisSettings> | undefined {
	if (!statement) return undefined;
	const settings = statement.statementSettings as Record<string, unknown> | undefined;
	if (!settings) return undefined;
	const block = settings['synthesis'];
	if (!block || typeof block !== 'object') return undefined;

	return block as Partial<SynthesisSettings>;
}

function readLegacyLiveSynthEnabled(statement: Statement | null | undefined): boolean | undefined {
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

function mergeWithDefaults(
	partial: Partial<SynthesisSettings> | undefined,
	defaults: SynthesisSettings,
): SynthesisSettings {
	if (!partial) return { ...defaults };

	return {
		enabled: typeof partial.enabled === 'boolean' ? partial.enabled : defaults.enabled,
		minEvaluators:
			typeof partial.minEvaluators === 'number' && Number.isFinite(partial.minEvaluators)
				? partial.minEvaluators
				: defaults.minEvaluators,
		minConsensus:
			typeof partial.minConsensus === 'number' && Number.isFinite(partial.minConsensus)
				? partial.minConsensus
				: defaults.minConsensus,
		attachThreshold:
			typeof partial.attachThreshold === 'number' && Number.isFinite(partial.attachThreshold)
				? partial.attachThreshold
				: defaults.attachThreshold,
		synthLowerBound:
			typeof partial.synthLowerBound === 'number' && Number.isFinite(partial.synthLowerBound)
				? partial.synthLowerBound
				: defaults.synthLowerBound,
		clusterThreshold:
			typeof partial.clusterThreshold === 'number' && Number.isFinite(partial.clusterThreshold)
				? partial.clusterThreshold
				: defaults.clusterThreshold,
		reviewLowerBound:
			typeof partial.reviewLowerBound === 'number' && Number.isFinite(partial.reviewLowerBound)
				? partial.reviewLowerBound
				: defaults.reviewLowerBound,
	};
}

export async function loadSynthesisSettings(questionId: string): Promise<SynthesisSettings> {
	if (!questionId) return { ...DEFAULT_SYNTHESIS_SETTINGS };
	try {
		const snap = await db().collection(Collections.statements).doc(questionId).get();
		if (!snap.exists) {
			return { ...DEFAULT_SYNTHESIS_SETTINGS };
		}
		const statement = snap.data() as Statement;

		return loadSynthesisSettingsFromStatement(statement);
	} catch (error) {
		logger.warn('loadSynthesisSettings: read failed, using disabled default', {
			questionId,
			error: error instanceof Error ? error.message : String(error),
		});

		return { ...DEFAULT_SYNTHESIS_SETTINGS };
	}
}

/**
 * Same as `loadSynthesisSettings` but takes an already-loaded statement.
 * Use this on the hot path when the caller has the parent doc in hand —
 * avoids the second Firestore round-trip.
 */
export function loadSynthesisSettingsFromStatement(
	statement: Statement | null | undefined,
): SynthesisSettings {
	const defaults = isMassConsensus(statement)
		? MC_DEFAULT_SYNTHESIS_SETTINGS
		: DEFAULT_SYNTHESIS_SETTINGS;

	const explicit = readSynthesisBlock(statement);
	if (explicit) {
		return mergeWithDefaults(explicit, defaults);
	}

	const legacy = readLegacyLiveSynthEnabled(statement);
	if (legacy !== undefined) {
		return mergeWithDefaults({ enabled: legacy }, defaults);
	}

	return { ...defaults };
}
