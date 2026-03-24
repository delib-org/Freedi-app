import { FC, ReactNode, useState } from 'react';
import { Check, Circle, ChevronDown } from 'lucide-react';
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

	return (
		<div className={styles.phaseSectionCompleted}>
			<button
				className={stripClass}
				onClick={() => setIsExpanded((prev) => !prev)}
				aria-expanded={isExpanded}
			>
				<span className={isCompleted ? styles.phaseSummaryIcon : styles.phaseSummaryIconActive}>
					{isCompleted ? <Check size={14} /> : <Circle size={8} />}
				</span>
				<div className={styles.phaseSummaryContent}>
					<h2 className={styles.phaseSummaryTitle}>{title}</h2>
					{summary && (
						<span className={styles.phaseSummarySubtext}>{summary}</span>
					)}
				</div>
				<span className={`${styles.phaseSummaryChevron} ${isExpanded ? styles.phaseSummaryChevronOpen : ''}`}>
					<ChevronDown size={16} />
				</span>
			</button>
			{isExpanded && <div className={styles.phaseSectionContent}>{children}</div>}
		</div>
	);
};

export default PhaseSection;
