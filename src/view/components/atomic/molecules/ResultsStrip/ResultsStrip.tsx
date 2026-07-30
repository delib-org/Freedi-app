import React from 'react';
import clsx from 'clsx';
import { Statement, calcMeanSentiment, DEFAULT_MIN_EVALUATORS } from '@freedi/shared-types';
import { useTranslation } from '@/controllers/hooks/useTranslation';

export type ResultsMetric = 'consensus' | 'average' | 'evaluators';

export interface ResultsStripProps {
	statement: Statement;
	/** Which number is the headline — rendered larger with an accent ring. */
	primary?: ResultsMetric;
	/** Consensus is meaningless on a handful of votes, so it stays hidden
	 *  until this many people have evaluated. */
	minEvaluators?: number;
	className?: string;
}

/**
 * The three numbers a participant needs to read a suggestion's result:
 * consensus (C_p), average sentiment (μ_p) and how many people evaluated.
 *
 * Previously these lived only inside a hover tooltip on a colour bar, which
 * meant touch users never saw them at all. Same three metrics, same labels as
 * the Join app's card results strip.
 */
const ResultsStrip: React.FC<ResultsStripProps> = ({
	statement,
	primary = 'consensus',
	minEvaluators = DEFAULT_MIN_EVALUATORS,
	className,
}) => {
	const { t } = useTranslation();

	const numberOfEvaluators = statement.evaluation?.numberOfEvaluators ?? 0;

	// Nothing to report yet — an all-zeros strip reads as "everyone rejected
	// this" rather than "nobody has voted".
	if (numberOfEvaluators <= 0) return null;

	const sumPro = statement.evaluation?.sumPro ?? 0;
	const sumCon = statement.evaluation?.sumCon ?? 0;
	// Older documents predate `sumEvaluations`; for them the signed sum is
	// recoverable from the pro/con totals.
	const sumEvaluations = statement.evaluation?.sumEvaluations ?? sumPro - sumCon;

	const averagePct = Math.round(calcMeanSentiment(sumEvaluations, numberOfEvaluators) * 100);
	const consensusPct = Math.round((statement.consensus ?? 0) * 100);
	const showConsensus = numberOfEvaluators >= minEvaluators;

	const item = (
		metric: ResultsMetric,
		label: string,
		title: string,
		value: string,
		isNegative = false,
	) => (
		<div
			key={metric}
			className={clsx(
				'results-strip__item',
				primary === metric && 'results-strip__item--primary',
				isNegative && 'results-strip__item--negative',
			)}
			title={`${title}: ${value}`}
		>
			<span className="results-strip__value">{value}</span>
			<span className="results-strip__label">{label}</span>
		</div>
	);

	return (
		<div className={clsx('results-strip', className)} aria-label={t('Results')}>
			{showConsensus &&
				item(
					'consensus',
					t('Consensus'),
					t('Consensus score'),
					`${consensusPct}%`,
					consensusPct < 0,
				)}
			{item('average', t('Average'), t('Average score'), `${averagePct}%`, averagePct < 0)}
			{item('evaluators', t('Evaluators'), t('Evaluators'), `${numberOfEvaluators}`)}
		</div>
	);
};

export default ResultsStrip;
