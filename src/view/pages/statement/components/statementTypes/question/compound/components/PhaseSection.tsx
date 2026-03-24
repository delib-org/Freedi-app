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

	if (!isCompleted) {
		return (
			<div className={styles.phaseSection}>
				<h2 className={styles.phaseH2}>{title}</h2>
				{children}
			</div>
		);
	}

	return (
		<div className={styles.phaseSectionCompleted}>
			<button
				className={styles.phaseSummaryStrip}
				onClick={() => setIsExpanded((prev) => !prev)}
				aria-expanded={isExpanded}
			>
				<span className={styles.phaseSummaryIcon}>&#10003;</span>
				<div className={styles.phaseSummaryContent}>
					<h2 className={styles.phaseSummaryTitle}>{title}</h2>
					{summary !== title && (
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
