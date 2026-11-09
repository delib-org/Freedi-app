import { FC, useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Statement } from '@freedi/shared-types';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { isSummaryObsolete } from '@/helpers/summaryObsolete';
import Collapse from '@/view/components/atomic/molecules/Collapse/Collapse';
import Text from '@/view/components/text/Text';
import styles from './ChatQuestionSummary.module.scss';

interface Props {
	statement: Statement;
}

/**
 * The question's one summary (statement.summary) as an accordion in its chat
 * card. Closed by default; renders nothing when there is no summary.
 */
const ChatQuestionSummary: FC<Props> = ({ statement }) => {
	const { t } = useTranslation();
	const [isOpen, setIsOpen] = useState(false);
	const bodyId = useId();
	const summary = statement.summary ?? '';

	if (summary.trim().length === 0) return null;

	return (
		// Touches here belong to the accordion, not to the card's swipe-to-change-type.
		<div
			className={styles.chatQuestionSummary}
			onTouchStart={(e) => e.stopPropagation()}
			onTouchEnd={(e) => e.stopPropagation()}
		>
			<button
				type="button"
				className={styles.chatQuestionSummary__header}
				aria-expanded={isOpen}
				aria-controls={bodyId}
				onClick={() => setIsOpen((open) => !open)}
			>
				<span>{t('Summary')}</span>
				<ChevronDown
					className={`${styles.chatQuestionSummary__chevron} ${isOpen ? styles['chatQuestionSummary__chevron--open'] : ''}`}
					aria-hidden="true"
				/>
			</button>
			<Collapse id={bodyId} isOpen={isOpen}>
				<div className={styles.chatQuestionSummary__body}>
					<Text description={summary} enableMarkdown={true} />
					{isSummaryObsolete(statement) && (
						<p className={styles.chatQuestionSummary__note} data-testid="summary-obsolete">
							{t('Agreed proposals have changed since the last summary.')}
						</p>
					)}
				</div>
			</Collapse>
		</div>
	);
};

export default ChatQuestionSummary;
