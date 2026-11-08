import { FC, useEffect, useMemo, useState } from 'react';
import { Statement } from '@freedi/shared-types';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import {
	requestDiscussionSummary,
	SummarizationNotReadyError,
} from '@/controllers/db/summarization/summarizationController';
import { buildSummaryPreview } from '@/helpers/summaryPreview';
import { isSummaryObsolete } from '@/helpers/summaryObsolete';
import { logError } from '@/utils/errorHandling';
import Text from '@/view/components/text/Text';
import styles from './SubGroupCardSummary.module.scss';

interface Props {
	statement: Statement;
	summary: string;
	/** Only admins see the button that changes what the summary covers. */
	isAdmin?: boolean;
}

/** What the callable returned, shown at once until the statement listener catches up. */
interface GeneratedSummary {
	summary: string;
	includeDivided: boolean;
	generatedAt: number;
}

/**
 * The question's one summary, shown on its card and in the Results tab. An empty
 * `summary` shows "No summary yet" (admins get a button to create it).
 * The question's summary on its card: a short preview that expands to the full
 * text. Admins get one button that toggles between the summary of the selected
 * options only and one that also covers what the group is divided on.
 */
const SubGroupCardSummary: FC<Props> = ({ statement, summary, isAdmin = false }) => {
	const { t, currentLanguage } = useTranslation();
	const [isLoading, setIsLoading] = useState(false);
	const [hasFailed, setHasFailed] = useState(false);
	const [isExpanded, setIsExpanded] = useState(false);
	const [hasNoDivided, setHasNoDivided] = useState(false);
	const [generated, setGenerated] = useState<GeneratedSummary | undefined>(undefined);

	// The prop wins again whenever the statement listener delivers a new summary.
	useEffect(() => {
		setGenerated(undefined);
	}, [summary]);

	const text = generated?.summary ?? summary;
	const includesDivided = generated?.includeDivided ?? statement.summaryIncludesDivided === true;
	const generatedAt = generated?.generatedAt ?? statement.summaryGeneratedAt;
	const hasText = text.trim().length > 0;
	// A fresh result from this component is current by definition.
	const isObsolete = !generated && hasText && isSummaryObsolete(statement);
	const preview = useMemo(() => buildSummaryPreview(text), [text]);
	const generatedOn = generatedAt
		? new Intl.DateTimeFormat(currentLanguage, { dateStyle: 'medium' }).format(generatedAt)
		: undefined;

	const regenerate = async (): Promise<void> => {
		setIsLoading(true);
		setHasFailed(false);
		setHasNoDivided(false);
		try {
			const result = await requestDiscussionSummary(statement.statementId, undefined, {
				includeDivided: hasText && (isObsolete ? includesDivided : !includesDivided),
			});
			setHasNoDivided(hasText && !isObsolete && !includesDivided && result.dividedCount === 0);
			setGenerated({
				summary: result.summary,
				includeDivided: result.includeDivided,
				generatedAt: result.generatedAt,
			});
		} catch (error) {
			if (!(error instanceof SummarizationNotReadyError)) {
				logError(error, {
					operation: 'SubGroupCardSummary.regenerate',
					statementId: statement.statementId,
				});
			}
			setHasFailed(true);
		} finally {
			setIsLoading(false);
		}
	};

	// No summary yet: the button creates the selected-options one.
	const buttonLabel = !hasText
		? t('Summarize')
		: isObsolete
			? t('Update summary')
			: includesDivided
				? t('Show selected options only')
				: t('Add what the group is divided on');

	return (
		<div className={styles.summary}>
			{!hasText ? (
				<p className={styles.summary__preview}>{t('No summary yet')}</p>
			) : isExpanded ? (
				<div className={styles.summary__text}>
					<Text description={text} enableMarkdown={true} />
				</div>
			) : (
				<p className={styles.summary__preview}>{preview.text}</p>
			)}
			{hasText && preview.isTruncated && (
				<button
					type="button"
					className={styles.summary__toggle}
					onClick={() => setIsExpanded((expanded) => !expanded)}
					aria-expanded={isExpanded}
				>
					{isExpanded ? t('Show less') : t('Read more')}
				</button>
			)}
			{generatedOn && (
				<p className={styles.summary__date}>
					{t('Summary from')} {generatedOn}
				</p>
			)}
			{isObsolete && (
				<p className={styles.summary__date} data-testid="summary-obsolete">
					{t('Agreed proposals have changed since the last summary.')}
				</p>
			)}
			{isAdmin && (
				<button
					type="button"
					className={styles.summary__button}
					onClick={regenerate}
					disabled={isLoading}
				>
					{isLoading ? t('Generating...') : buttonLabel}
				</button>
			)}
			{hasNoDivided && (
				<p className={styles.summary__date}>{t('The group is not split on any option')}</p>
			)}
			{hasFailed && (
				<p className={styles.summary__error} role="alert">
					{t('Could not update the summary')}
				</p>
			)}
		</div>
	);
};

export default SubGroupCardSummary;
