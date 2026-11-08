import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from '@freedi/shared-i18n/react';
import { EmptyState } from '@/components/atomic/atoms/EmptyState';
import { Skeleton } from '@/components/atomic/atoms/Skeleton';
import { useOrgActivity, useStatementsByIds } from '@/db/orgActivities';
import { useChildrenOfParents } from '@/db/surveyResults';
import StudioPage from '@/pages/_shared/StudioPage';
import { buildQuestionResults, scoreToPercent } from './surveyRanking';
import styles from './SurveyResults.module.scss';

/**
 * SurveyResults — a read-only view of a linked survey's outputs: each question
 * with its suggestions ranked by consensus, the score and how many people
 * rated it. Deliberately has no controls and imports no write path.
 * Route: /orgs/:orgId/questions/:qId/results
 */
export default function SurveyResults() {
	const { t, tWithParams } = useTranslation();
	const { orgId = '', qId = '' } = useParams<{ orgId: string; qId: string }>();
	const { data: activity, loading: activityLoading } = useOrgActivity(orgId, qId);
	const questionIds = useMemo(
		() => activity?.surveyQuestionIds ?? (activity ? [activity.statementId] : []),
		[activity],
	);
	const { data: questions } = useStatementsByIds(questionIds);
	const { data: children, loading, error } = useChildrenOfParents(questionIds);
	const results = useMemo(
		() => buildQuestionResults(questionIds, questions, children),
		[questionIds, questions, children],
	);

	const orgHome = `/orgs/${orgId}`;
	const boardHref = `${orgHome}/questions/${qId}`;
	const title = activity?.surveyTitle?.trim() || activity?.statementTitle || t('Survey results');
	const breadcrumb = [
		{ label: t('Questions'), to: orgHome },
		{ label: title, to: boardHref },
		{ label: t('Survey results') },
	];

	if (!activityLoading && !activity) {
		return (
			<StudioPage breadcrumb={breadcrumb}>
				<EmptyState
					variant="error"
					icon="🔍"
					title={t('Question not found')}
					text={t('It may have been archived, or you may not have access to it.')}
					action={<Link to={orgHome}>{t('Back to questions')}</Link>}
				/>
			</StudioPage>
		);
	}

	return (
		<StudioPage breadcrumb={breadcrumb} title={title}>
			<div className={styles.results}>
				<p className={styles.note}>
					{t('Read-only view. Nothing here can change the suggestions.')}
				</p>
				{error && (
					<p role="alert" className={styles.note}>
						{t('Could not load the results')}
					</p>
				)}
				{(activityLoading || loading) && <Skeleton />}
				{results.map((question) => (
					<section key={question.questionId} className={styles.question}>
						<h2 className={styles.questionTitle} dir="auto">
							{question.title}
						</h2>
						{question.options.length === 0 ? (
							<p className={styles.note}>{t('No suggestions yet')}</p>
						) : (
							<ol className={styles.list}>
								{question.options.map((option) => (
									<li key={option.statementId} className={styles.option}>
										<span className={styles.text} dir="auto">
											{option.text}
										</span>
										<span className={styles.stats}>
											<span className={styles.score}>
												{tWithParams('Score {{score}}', { score: scoreToPercent(option.score) })}
											</span>
											<span>
												{tWithParams('{{count}} evaluators', { count: option.evaluators })}
											</span>
										</span>
									</li>
								))}
							</ol>
						)}
					</section>
				))}
				<Link className={styles.back} to={boardHref}>
					{t('Back to the survey')}
				</Link>
			</div>
		</StudioPage>
	);
}
