import { FC, ReactNode, useState } from 'react';
import styles from '../CompoundQuestion.module.scss';

interface PhaseSectionProps {
	summary: string;
	isCompleted: boolean;
	children: ReactNode;
}

const PhaseSection: FC<PhaseSectionProps> = ({ summary, isCompleted, children }) => {
	const [isExpanded, setIsExpanded] = useState(!isCompleted);

	if (!isCompleted) {
		return <div className={styles.phaseSection}>{children}</div>;
	}

	return (
		<div className={styles.phaseSectionCompleted}>
			<button
				className={styles.phaseSummaryStrip}
				onClick={() => setIsExpanded((prev) => !prev)}
				aria-expanded={isExpanded}
			>
				<span className={styles.phaseSummaryIcon}>&#10003;</span>
				<span className={styles.phaseSummaryText}>{summary}</span>
				<span className={`${styles.phaseSummaryChevron} ${isExpanded ? styles.phaseSummaryChevronOpen : ''}`}>
					&#9662;
				</span>
			</button>
			{isExpanded && <div className={styles.phaseSectionContent}>{children}</div>}
		</div>
	);
};

export default PhaseSection;
