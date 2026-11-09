import { FC, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { Statement } from '@freedi/shared-types';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { isSummaryObsolete } from '@/helpers/summaryObsolete';
import Text from '@/view/components/text/Text';
import styles from './ChatQuestionSummary.module.scss';

interface Props {
	statement: Statement;
}

// Sub-pixel rounding can make scrollHeight exceed clientHeight by a fraction.
const CLAMP_TOLERANCE_PX = 1;

/**
 * The question's one summary (statement.summary) as an "Answer:" preview in its
 * chat card: the first few lines, with "Read more" only when the text really is
 * cut off. Renders nothing when there is no summary.
 */
const ChatQuestionSummary: FC<Props> = ({ statement }) => {
	const { t } = useTranslation();
	const [isExpanded, setIsExpanded] = useState(false);
	const [isCutOff, setIsCutOff] = useState(false);
	const bodyRef = useRef<HTMLDivElement>(null);
	const textRef = useRef<HTMLDivElement>(null);
	const bodyId = useId();
	const summary = statement.summary ?? '';
	const hasSummary = summary.trim().length > 0;

	// A new summary starts collapsed (also stops "Show less" lingering on short text).
	useEffect(() => {
		setIsExpanded(false);
	}, [summary]);

	// Measure on layout, and again whenever anything that changes the text height
	// happens: the body's width, the content's own size, web fonts arriving.
	// While expanded the text is not clamped, so the last result is kept.
	useLayoutEffect(() => {
		const body = bodyRef.current;
		const text = textRef.current;
		if (!hasSummary || isExpanded || !body || !text) return;

		let isActive = true;
		const measure = (): void => {
			if (!isActive) return;
			setIsCutOff(body.scrollHeight - body.clientHeight > CLAMP_TOLERANCE_PX);
		};

		measure();
		document.fonts?.ready.then(measure).catch(() => undefined);

		if (typeof ResizeObserver === 'undefined') {
			return () => {
				isActive = false;
			};
		}

		const observer = new ResizeObserver(measure);
		observer.observe(body);
		observer.observe(text);

		return () => {
			isActive = false;
			observer.disconnect();
		};
	}, [summary, hasSummary, isExpanded]);

	if (!hasSummary) return null;

	const showToggle = isCutOff || isExpanded;

	return (
		// Touches and clicks here belong to the preview, not to the card's swipe or tap.
		<div
			className={styles.chatQuestionSummary}
			onTouchStart={(e) => e.stopPropagation()}
			onTouchEnd={(e) => e.stopPropagation()}
			onClick={(e) => e.stopPropagation()}
		>
			<span className={styles.chatQuestionSummary__label}>{t('chatQuestion.answerLabel')}</span>
			<div className={styles.chatQuestionSummary__content}>
				<div
					id={bodyId}
					ref={bodyRef}
					className={`${styles.chatQuestionSummary__body} ${isExpanded ? '' : styles['chatQuestionSummary__body--clamped']}`}
				>
					<div ref={textRef}>
						<Text description={summary} enableMarkdown={true} />
					</div>
				</div>
				{isExpanded && isSummaryObsolete(statement) && (
					<p className={styles.chatQuestionSummary__note} data-testid="summary-obsolete">
						{t('Agreed proposals have changed since the last summary.')}
					</p>
				)}
				{showToggle && (
					<button
						type="button"
						className={styles.chatQuestionSummary__toggle}
						aria-expanded={isExpanded}
						aria-controls={bodyId}
						onClick={() => setIsExpanded((expanded) => !expanded)}
					>
						{isExpanded ? t('Show less') : t('Read more')}
					</button>
				)}
			</div>
		</div>
	);
};

export default ChatQuestionSummary;
