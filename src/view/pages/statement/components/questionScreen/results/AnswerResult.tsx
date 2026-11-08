import { CSSProperties, FC } from 'react';
import clsx from 'clsx';
import { useNavigate } from 'react-router';
import { Check } from 'lucide-react';
import { Statement } from '@freedi/shared-types';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { getConsensusScore } from '@/redux/utils/selectorFactories';
import { renderInlineMarkdown } from '@/helpers/inlineMarkdownHelpers';
import { buildStatementPath } from '@/routes/statementPaths';
import ResultsStrip from '@/view/components/atomic/molecules/ResultsStrip/ResultsStrip';
import { evaluatorCount, scoreLabelKey, scorePercent, scoreTone } from '../resultsLogic';
import styles from '../QuestionScreen.module.scss';

interface AnswerResultProps {
	answer: Statement;
	/** `leading` = mint card with a check; `ranked` = a row in the full ranking. */
	variant: 'leading' | 'ranked';
	rank?: number;
}

/** One answer's result: text (opens the answer), agreement bar, label and the results strip. */
const AnswerResult: FC<AnswerResultProps> = ({ answer, variant, rank }) => {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const rated = evaluatorCount(answer) > 0;
	const score = getConsensusScore(answer);
	const tone = scoreTone(score);
	const label = rated ? t(scoreLabelKey(score)) : t('Not rated yet');
	const barStyle = { '--bar-pct': `${scorePercent(score)}%` } as CSSProperties;

	const open = () =>
		navigate(buildStatementPath({ statementId: answer.statementId, view: 'chat' }));

	const body = (
		<div className={styles.result__body}>
			<button type="button" className={styles.result__text} onClick={open}>
				{renderInlineMarkdown(answer.statement)}
			</button>
			{rated && (
				<span
					className={clsx(styles.bar, variant === 'leading' && styles['bar--onTint'])}
					role="img"
					aria-label={label}
				>
					<span className={clsx(styles.bar__fill, styles[`bar__fill--${tone}`])} style={barStyle} />
				</span>
			)}
			<span className={styles.result__label}>{label}</span>
			<ResultsStrip statement={answer} className={styles.result__strip} />
		</div>
	);

	if (variant === 'leading') {
		return (
			<article className={styles.lead} data-testid="results-leading-answer">
				<span className={styles.lead__icon} aria-hidden="true">
					<Check size={16} />
				</span>
				{body}
			</article>
		);
	}

	return (
		<li className={styles.rankRow}>
			<span className={clsx(styles.rankRow__rank, styles[`score--${tone}`])} aria-hidden="true">
				{rank}
			</span>
			{body}
		</li>
	);
};

export default AnswerResult;
