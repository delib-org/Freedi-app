import React from 'react';
import clsx from 'clsx';
import {
	Statement,
	calcMeanSentiment,
	DEFAULT_MIN_EVALUATORS,
	stakeholderCoverage,
} from '@freedi/shared-types';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { formatScore, toDisplayScore } from '@/helpers/scoreFormat';
import ResultsStripItem from './ResultsStripItem';

export type ResultsMetric = 'consensus' | 'average' | 'evaluators';

/** 'tiles' = three equal boxes; 'chips' = Join's compact row, consensus highlighted. */
export type ResultsStripVariant = 'tiles' | 'chips';

export interface ResultsStripProps {
	statement: Statement;
	/** Which number is the headline — rendered larger on a sunken tile. */
	primary?: ResultsMetric;
	/** Consensus is meaningless on a handful of votes, so it stays hidden
	 *  until this many people have evaluated. */
	minEvaluators?: number;
	variant?: ResultsStripVariant;
	className?: string;
	/** Dissolve the strip's wrapper (`display: contents`) so the chips and the
	 *  caption become flex items of the host's footer row. Chips only. */
	inline?: boolean;
}

/**
 * The three numbers a participant needs to read an answer's result: the
 * agreement score (C_p), the average rating (μ_p) and how many people rated.
 * The two scores read from −100 to +100 with no "%": they are not a share of
 * people. Each number explains itself on tap, hover and keyboard focus.
 */
const ResultsStrip: React.FC<ResultsStripProps> = ({
	statement,
	primary = 'consensus',
	minEvaluators = DEFAULT_MIN_EVALUATORS,
	variant = 'tiles',
	className,
	inline = false,
}) => {
	const { t } = useTranslation();

	const isChips = variant === 'chips';
	// Chips lead with the consensus, whatever the caller asked for.
	const headline: ResultsMetric = isChips ? 'consensus' : primary;
	const numberOfEvaluators = statement.evaluation?.numberOfEvaluators ?? 0;

	// Nothing to report yet — an all-zeros strip reads as "everyone rejected
	// this" rather than "nobody has voted".
	if (numberOfEvaluators <= 0) return null;

	const sumPro = statement.evaluation?.sumPro ?? 0;
	const sumCon = statement.evaluation?.sumCon ?? 0;
	// Older documents predate `sumEvaluations`; for them the signed sum is
	// recoverable from the pro/con totals.
	const sumEvaluations = statement.evaluation?.sumEvaluations ?? sumPro - sumCon;

	const average = calcMeanSentiment(sumEvaluations, numberOfEvaluators);
	const consensus = statement.consensus ?? 0;
	const showConsensus = numberOfEvaluators >= minEvaluators;

	// When the stakeholder count is known, the consensus shown above was
	// finite-population corrected against it — so the evaluator count stops
	// being a bare tally and becomes the claim that makes the score readable.
	// "50" says nothing; "50 / 500" says how much weight it deserves.
	const stakeholders = statement.evaluation?.stakeholderCount;
	const hasPopulation = stakeholderCoverage(numberOfEvaluators, stakeholders) !== undefined;
	const evaluatorsValue =
		stakeholders !== undefined
			? `${numberOfEvaluators} / ${stakeholders}`
			: `${numberOfEvaluators}`;
	const evaluatorsTip = hasPopulation
		? t('scoreTip.peopleOf')
				.replace('{n}', String(numberOfEvaluators))
				.replace('{total}', String(stakeholders))
		: t('scoreTip.people');

	return (
		<div
			className={clsx(
				'results-strip',
				isChips && 'results-strip--chips',
				isChips && inline && 'results-strip--inline',
				className,
			)}
		>
			<div className="results-strip__items" role="group" aria-label={t('Results')}>
				{showConsensus && (
					<ResultsStripItem
						value={formatScore(consensus)}
						label={t('Agreement score')}
						tip={t('scoreTip.agreement')}
						isPrimary={headline === 'consensus'}
						isNegative={toDisplayScore(consensus) < 0}
					/>
				)}
				<ResultsStripItem
					value={formatScore(average)}
					label={t('Average rating')}
					tip={t('scoreTip.average')}
					isPrimary={headline === 'average'}
					isNegative={toDisplayScore(average) < 0}
				/>
				<ResultsStripItem
					value={evaluatorsValue}
					label={t('People who rated')}
					tip={evaluatorsTip}
					isPrimary={headline === 'evaluators'}
				/>
			</div>
			{/* The gate made legible: without it a missing consensus tile looks
			    like missing data. */}
			{!showConsensus && (
				<p className="results-strip__caption" data-testid="results-strip-caption">
					{t('Consensus will show after {n} evaluators').replace('{n}', String(minEvaluators))}
				</p>
			)}
		</div>
	);
};

export default ResultsStrip;
