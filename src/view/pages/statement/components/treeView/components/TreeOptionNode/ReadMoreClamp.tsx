import { FC, ReactNode, useId, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import styles from './ReadMoreClamp.module.scss';

interface Props {
	children: ReactNode;
	/** Changes when the text changes: a new text starts collapsed. */
	contentKey?: string;
}

// Sub-pixel rounding can make scrollHeight exceed clientHeight by a fraction.
const CLAMP_TOLERANCE_PX = 1;

/**
 * An answer's body in the discussion tree: cut to 2 lines, with the same
 * "Read more" / "Show less" toggle the chat question summary uses (shown only
 * when the text really is cut off). The clamp sits on this one block, so it
 * works for a description and for paragraph children rendered as <p>.
 */
const ReadMoreClamp: FC<Props> = ({ children, contentKey }) => {
	const { t } = useTranslation();
	const [isExpanded, setIsExpanded] = useState(false);
	const [isCutOff, setIsCutOff] = useState(false);
	const bodyRef = useRef<HTMLDivElement>(null);
	const bodyId = useId();

	useLayoutEffect(() => {
		setIsExpanded(false);
	}, [contentKey]);

	// While expanded the text is not clamped, so the last measurement is kept.
	useLayoutEffect(() => {
		const body = bodyRef.current;
		if (isExpanded || !body) return;

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

		return () => {
			isActive = false;
			observer.disconnect();
		};
	}, [contentKey, isExpanded]);

	const showToggle = isCutOff || isExpanded;

	return (
		<div className={styles.readMoreClamp}>
			<div
				id={bodyId}
				ref={bodyRef}
				className={`${styles.readMoreClamp__body} ${isExpanded ? '' : styles['readMoreClamp__body--clamped']}`}
			>
				{children}
			</div>
			{showToggle && (
				<button
					type="button"
					className={styles.readMoreClamp__toggle}
					aria-expanded={isExpanded}
					aria-controls={bodyId}
					onClick={() => setIsExpanded((expanded) => !expanded)}
				>
					{isExpanded ? t('Show less') : t('Read more')}
				</button>
			)}
		</div>
	);
};

export default ReadMoreClamp;
