import { FC } from 'react';
import { Statement } from '@freedi/shared-types';
import { Button } from '@/view/components/atomic/atoms/Button';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { renderInlineMarkdown } from '@/helpers/inlineMarkdownHelpers';
import { getParagraphsText } from '@/utils/paragraphUtils';
import styles from './AddStatementSheet.module.scss';

interface SimilarAnswersInlineProps {
	similar: Statement[];
	onSupport: (statement: Statement) => void;
	onContinue: () => void;
	onBack: () => void;
}

/** Similar existing answers shown under the draft; supporting one replaces creating a duplicate. */
const SimilarAnswersInline: FC<SimilarAnswersInlineProps> = ({
	similar,
	onSupport,
	onContinue,
	onBack,
}) => {
	const { t } = useTranslation();

	return (
		<section className={styles.similar} aria-label={t('question.sheet.similarFound')}>
			<h4 className={styles.similarTitle}>{t('question.sheet.similarFound')}</h4>
			<ul className={styles.similarList}>
				{similar.map((statement, index) => {
					const description = getParagraphsText(statement.paragraphs);
					const supporters = statement.totalEvaluators || 0;

					return (
						<li
							key={statement.statementId}
							className={styles.similarItem}
							data-testid="similar-answer"
						>
							<div className={styles.similarText}>
								<p className={styles.similarHeadline}>
									{renderInlineMarkdown(statement.statement)}
								</p>
								{description && <p className={styles.similarDescription}>{description}</p>}
								{supporters > 0 && (
									<span className={styles.similarMeta}>
										{t('question.sheet.supporters').replace('{{count}}', String(supporters))}
									</span>
								)}
							</div>
							<Button
								text={t('question.sheet.supportInstead')}
								variant={index === 0 ? 'primary' : 'secondary'}
								size="small"
								onClick={() => onSupport(statement)}
								id={`support-instead-${statement.statementId}`}
								className="support-instead"
							/>
						</li>
					);
				})}
			</ul>
			<div className={styles.similarActions}>
				<Button text={t('question.sheet.back')} variant="secondary" size="small" onClick={onBack} />
				<Button
					text={t('question.sheet.continueMine')}
					variant="primary"
					size="small"
					onClick={onContinue}
					id="continue-mine"
				/>
			</div>
		</section>
	);
};

export default SimilarAnswersInline;
