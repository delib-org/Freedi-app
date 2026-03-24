import { FC, ReactNode, useState } from 'react';
import styles from '../CompoundQuestion.module.scss';

interface PhaseSectionProps {
	title: string;
	summary: string;
	isCompleted: boolean;
	children: ReactNode;
}

const PhaseSection: FC<PhaseSectionProps> = ({ title, summary, isCompleted, children }) => {
	const [isExpanded, setIsExpanded] = useState(!isCompleted);

	const stripClass = isCompleted
		? styles.phaseSummaryStrip
		: `${styles.phaseSummaryStrip} ${styles.phaseSummaryStripActive}`;

	const iconContent = isCompleted ? '\u2713' : '\u25CF';

	return (
		<div className={styles.phaseSectionCompleted}>
			<button
				className={stripClass}
				onClick={() => setIsExpanded((prev) => !prev)}
				aria-expanded={isExpanded}
			>
				<span className={isCompleted ? styles.phaseSummaryIcon : styles.phaseSummaryIconActive}>
					{iconContent}
				</span>
				<div className={styles.phaseSummaryContent}>
					<h2 className={styles.phaseSummaryTitle}>{title}</h2>
					{summary && (
						<span className={styles.phaseSummarySubtext}>{summary}</span>
					)}
				</div>
				<span className={`${styles.phaseSummaryChevron} ${isExpanded ? styles.phaseSummaryChevronOpen : ''}`}>
					&#9662;
				</span>
			</button>
			{isExpanded && <div className={styles.phaseSectionContent}>{children}</div>}
		</div>
	);
};

export default PhaseSection;
