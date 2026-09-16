import { FC, useId, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useSelector } from 'react-redux';
import { SortType, Statement } from '@freedi/shared-types';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { fullyLoadedScopeSelector } from '@/redux/statements/statementsSlice';
import { useAutoLoadAllForSort } from '@/view/pages/statement/hooks/useAutoLoadAllForSort';
import QuestionProcess from '@/view/components/atomic/organisms/ThinkingSpace/QuestionProcess';
import { STAGE_COLLECTING, STAGE_DECIDED } from '../questionStage';
import {
	getResultsAccess,
	rankAnswers,
	resultsRuleCaption,
	selectLeadingAnswers,
} from '../resultsLogic';
import type { QuestionScreenData } from '../useQuestionScreenData';
import AnswerResult from './AnswerResult';
import AgreementCard from './AgreementCard';
import styles from '../QuestionScreen.module.scss';

interface ResultsTabProps {
	statement: Statement;
	data: QuestionScreenData;
}

/**
 * תוצאות — what used to be spread over Common ground, Summary and Our covenant:
 * the leading answers under the question's own results selection, the summary,
 * the full ranking (collapsed) and the agreement. Gated while mid-flow until the
 * viewer rated something; decided questions are always readable.
 */
const ResultsTab: FC<ResultsTabProps> = ({ statement, data }) => {
	const { t } = useTranslation();
	const [, setSearchParams] = useSearchParams();
	const [showAll, setShowAll] = useState(false);
	const listId = useId();

	const access = getResultsAccess({
		isHost: data.isHost,
		stage: data.stage,
		ratedCount: data.ratedCount,
		showLiveResults: data.showLiveResults,
		isDeadlinePassed: data.isDeadlinePassed,
	});
	const visible = access === 'visible';
	const { isAutoLoading } = useAutoLoadAllForSort(
		visible ? statement.statementId : undefined,
		SortType.accepted,
	);
	const loadedSelector = useMemo(
		() => fullyLoadedScopeSelector(statement.statementId),
		[statement.statementId],
	);
	const fullyLoaded = useSelector(loadedSelector);

	const decided = data.stage === STAGE_DECIDED;
	const leading = useMemo(
		() =>
			data.stage === STAGE_COLLECTING
				? []
				: selectLeadingAnswers(data.answers, statement.resultsSettings),
		[data.stage, data.answers, statement.resultsSettings],
	);
	const ranked = useMemo(() => rankAnswers(data.answers), [data.answers]);
	const caption = resultsRuleCaption(statement.resultsSettings, decided);
	const captionText = caption.value ? t(caption.key).replace('{n}', caption.value) : t(caption.key);

	const goToAnswers = () =>
		setSearchParams(
			(previous) => {
				const next = new URLSearchParams(previous);
				next.set('tab', 'options');

				return next;
			},
			{ replace: true },
		);

	if (access === 'rate-first') {
		return (
			<div className={styles.tab} data-testid="results-tab">
				<div className={styles.gate} data-testid="results-gated">
					<h2 className={styles.gate__title}>{t('Results are hidden until you rate')}</h2>
					<p className={styles.gate__body}>
						{t(
							'Rate at least one answer yourself to see what the group thinks. This keeps your rating independent.',
						)}
					</p>
					<button type="button" className={styles.darkButton} onClick={goToAnswers}>
						{t('Rate the answers')}
					</button>
				</div>
				<AgreementCard statement={statement} decided={decided} />
			</div>
		);
	}

	const intro =
		data.stage === STAGE_COLLECTING
			? t('Still collecting. Results start to form once rating opens.')
			: decided
				? t('The decision: the answer the whole group can live with.')
				: t(
						'Candidates, not a decision: answers most of the group can live with, not just a majority.',
					);

	return (
		<div className={styles.tab} data-testid="results-tab">
			{access === 'hidden-by-host' && (
				<p className={styles.notice} role="note">
					{t('Results are hidden. Evaluate independently.')}
				</p>
			)}

			{visible && leading.length > 0 && (
				<section className={styles.section} aria-labelledby={`${listId}-leading`}>
					<div className={styles.section__head}>
						<h2 id={`${listId}-leading`} className={styles.section__title}>
							{decided ? t('What was chosen') : t('Leading now')}
						</h2>
						<span className={styles.caption}>{captionText}</span>
					</div>
					{leading.map((answer) => (
						<AnswerResult key={answer.statementId} answer={answer} variant="leading" />
					))}
				</section>
			)}

			{visible && <QuestionProcess statement={statement} view="summary" variant="card" />}

			{visible && (
				<section className={styles.section}>
					<button
						type="button"
						className={styles.allToggle}
						aria-expanded={showAll}
						aria-controls={`${listId}-all`}
						onClick={() => setShowAll((value) => !value)}
						data-testid="results-all-toggle"
					>
						<span className={styles.allToggle__title}>
							{t('All answers ({n})').replace('{n}', String(ranked.length))}
						</span>
						<span className={styles.allToggle__action}>{showAll ? t('Collapse') : t('Show')}</span>
					</button>
					<p className={styles.caption}>{intro}</p>
					{isAutoLoading && <p role="status">{t('Loading the complete set of options…')}</p>}
					{!fullyLoaded && !isAutoLoading && (
						<p className={styles.caption}>
							{t('Loaded options only; the complete ranking is not available yet.')}
						</p>
					)}
					{showAll && (
						<ol id={`${listId}-all`} className={styles.ranked}>
							{ranked.map((answer, index) => (
								<AnswerResult
									key={answer.statementId}
									answer={answer}
									variant="ranked"
									rank={index + 1}
								/>
							))}
						</ol>
					)}
				</section>
			)}

			<AgreementCard statement={statement} decided={decided} />
		</div>
	);
};

export default ResultsTab;
