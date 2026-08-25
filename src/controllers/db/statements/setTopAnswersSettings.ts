import { setDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { CutoffBy, ResultsBy, ResultsSettings, SortType, Statement } from '@freedi/shared-types';
import { functions } from '../config';
import { createStatementRef, getCurrentTimestamp, updateTimestamp } from '@/utils/firebaseUtils';
import { logError } from '@/utils/errorHandling';
import { updateResultSettingsToDB } from './setResultSettings';

/**
 * Writes behind the Top Answers admin panel.
 *
 * Every field here is one the join app's FacilitatorPanel already writes, so a
 * question stays in lockstep whichever app the admin is standing in. The
 * mirrored sources are named per-function below — keep them in step.
 */

/** The rank-by control's ✋ segment is not a `SortType`; manual order lives in
 *  its own field. This union is what the panel's segmented control models. */
export type RankBy = SortType | 'manual';

/**
 * Build a complete `ResultsSettings` from the question's existing settings plus
 * the keys being edited. `resultsBy` is the only non-optional field on
 * `ResultsSettingsSchema`, so a patch that omitted it would fail validation on
 * a question that has never had results settings written.
 *
 * Mirrors `buildResultsSettingsPatch` in the join app's FacilitatorPanel (minus
 * its workspace-scope branch, which has no equivalent here — the main-app panel
 * always edits exactly one question).
 */
export function buildResultsSettings(
	base: ResultsSettings | undefined,
	patch: Partial<ResultsSettings>,
): ResultsSettings {
	return {
		...(base ?? {}),
		resultsBy: base?.resultsBy ?? ResultsBy.consensus,
		...patch,
	};
}

/**
 * Which rank-by segment is active for a question. A saved manual order wins
 * over `defaultSortType` — the same precedence the join list applies when it
 * builds the option order.
 */
export function getActiveRankBy(statement: Statement | undefined): RankBy {
	if (statement?.statementSettings?.manualOptionOrder?.length) return 'manual';

	return statement?.statementSettings?.defaultSortType ?? SortType.accepted;
}

/**
 * Set the list's rank order. Mirrors `setSortType` in the join store: choosing
 * `random` writes a fresh shared seed so every viewer computes the same
 * shuffle, and choosing any sort clears a saved manual order — picking a sort
 * *is* the act of handing the list back to the algorithm.
 */
export async function setRankBy(statementId: string, sortType: SortType): Promise<void> {
	try {
		const statementSettings: {
			defaultSortType: SortType;
			randomSortSeed?: number;
			manualOptionOrder: null;
		} = {
			defaultSortType: sortType,
			manualOptionOrder: null,
		};
		if (sortType === SortType.random) {
			statementSettings.randomSortSeed = getCurrentTimestamp();
		}

		// `setDoc` with `{ merge: true }`, NOT `updateDoc`: passing a nested object
		// to `updateDoc` REPLACES the whole `statementSettings` map, which would
		// silently wipe every other setting on the question (showEvaluation,
		// enableAddEvaluationOption, the join-app flags…). Merge deep-writes just
		// these keys — the same call shape the join app and MapAdminPanel use.
		await setDoc(
			createStatementRef(statementId),
			{ statementSettings, ...updateTimestamp() },
			{ merge: true },
		);
	} catch (error) {
		logError(error, {
			operation: 'statements.setTopAnswersSettings.setRankBy',
			statementId,
			metadata: { sortType },
		});
	}
}

/**
 * Persist a hand-placed order of this question's options. Mirrors
 * `setManualOptionOrder` in the join store — same field, same id-array shape,
 * so an order saved in either app is honoured by both. Pass `null` to clear.
 */
export async function setManualOptionOrder(
	statementId: string,
	optionIds: string[] | null,
): Promise<void> {
	try {
		// Merge, not replace — see the note in `setRankBy`.
		await setDoc(
			createStatementRef(statementId),
			{ statementSettings: { manualOptionOrder: optionIds }, ...updateTimestamp() },
			{ merge: true },
		);
	} catch (error) {
		logError(error, {
			operation: 'statements.setTopAnswersSettings.setManualOptionOrder',
			statementId,
			metadata: { count: optionIds?.length ?? 0 },
		});
	}
}

/**
 * Switch between "the top N answers" and "every answer above a score".
 * Mirrors `flipThreshold` in the FacilitatorPanel.
 */
export async function setCutoffMethod(
	statementId: string,
	base: ResultsSettings | undefined,
	cutoffBy: CutoffBy,
): Promise<void> {
	await updateResultSettingsToDB(statementId, buildResultsSettings(base, { cutoffBy }));
}

/**
 * Move the cutoff. Which field the value lands in depends on the method:
 * top-N writes `numberOfResults`, threshold writes `cutoffNumber`. Mirrors
 * `writeThresholdValue` in the FacilitatorPanel, generalised over both modes.
 */
export async function setCutoffValue(
	statementId: string,
	base: ResultsSettings | undefined,
	value: number,
): Promise<void> {
	const cutoffBy = base?.cutoffBy ?? CutoffBy.topOptions;
	const patch: Partial<ResultsSettings> =
		cutoffBy === CutoffBy.aboveThreshold
			? { cutoffNumber: value }
			: { numberOfResults: Math.ceil(value) };

	await updateResultSettingsToDB(statementId, buildResultsSettings(base, patch));
}

/** Change how answers are scored in the first place (consensus / most liked / …). */
export async function setResultsBy(
	statementId: string,
	base: ResultsSettings | undefined,
	resultsBy: ResultsBy,
): Promise<void> {
	await updateResultSettingsToDB(statementId, buildResultsSettings(base, { resultsBy }));
}

/**
 * Ask the server to re-mark the top answers now.
 *
 * `statement.results` / `isChosen` are otherwise only recomputed by the
 * evaluation triggers, so without this a cutoff change would not show on the
 * cards until somebody next rated something. Failure is logged and swallowed:
 * the settings write already succeeded, and the marks will catch up on the next
 * evaluation regardless.
 */
export async function requestTopOptionsRecompute(statementId: string): Promise<void> {
	try {
		const recompute = httpsCallable<{ statementId: string }, { success: true }>(
			functions,
			'recomputeTopOptions',
		);
		await recompute({ statementId });
	} catch (error) {
		logError(error, {
			operation: 'statements.setTopAnswersSettings.requestTopOptionsRecompute',
			statementId,
		});
	}
}
