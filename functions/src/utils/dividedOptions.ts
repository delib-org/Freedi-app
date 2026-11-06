import { Statement } from '@freedi/shared-types';

/** An option needs at least this many evaluators before we call it divided. */
export const DIVIDED_MIN_EVALUATORS = 5;

/** Both the "for" share and the "against" share must be strictly above this. */
export const DIVIDED_MIN_SIDE_SHARE = 0.3;

/**
 * True when the group is split on the option: at least DIVIDED_MIN_EVALUATORS
 * evaluators, and strictly more than DIVIDED_MIN_SIDE_SHARE of them for AND
 * strictly more than that share against.
 *
 * "For" / "against" are evaluators who rated above / below zero
 * (evaluation.numberOfProEvaluators / numberOfConEvaluators), which is the
 * equivalent for every scale that centres on zero. Decided by code from the
 * stored counts, never guessed by the AI from text.
 */
export function isDividedOption(statement: Statement): boolean {
	const evaluation = statement.evaluation;
	if (!evaluation) return false;

	const total = evaluation.numberOfEvaluators ?? 0;
	if (total < DIVIDED_MIN_EVALUATORS) return false;

	const proShare = (evaluation.numberOfProEvaluators ?? 0) / total;
	const conShare = (evaluation.numberOfConEvaluators ?? 0) / total;

	return proShare > DIVIDED_MIN_SIDE_SHARE && conShare > DIVIDED_MIN_SIDE_SHARE;
}

/** Divided options the reader may see: hidden options are never summarized. */
export function filterDividedOptions(options: Statement[]): Statement[] {
	return options.filter((option) => option.hide !== true && isDividedOption(option));
}
