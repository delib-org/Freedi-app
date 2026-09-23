import { FC, ReactNode, useId } from 'react';
import { ChevronDown, ChevronUp, LucideIcon } from 'lucide-react';
import clsx from 'clsx';
import { HostHubSectionId } from './hostHubLogic';
import styles from './HostHub.module.scss';

interface HostHubCardProps {
	id: HostHubSectionId;
	title: string;
	description: string;
	icon: LucideIcon;
	expanded: boolean;
	onToggle: (id: HostHubSectionId) => void;
	children: ReactNode;
}

/**
 * One collapsible section card of the Host hub. Controlled: the hub owns the
 * expanded set so `?section=` deep links and analytics see every change.
 */
const HostHubCard: FC<HostHubCardProps> = ({
	id,
	title,
	description,
	icon: Icon,
	expanded,
	onToggle,
	children,
}) => {
	const bodyId = useId();

	return (
		<section
			id={`host-hub-${id}`}
			className={clsx(styles.card, expanded && styles['card--open'])}
			data-testid={`host-hub-section-${id}`}
			data-expanded={expanded}
		>
			<h2 className={styles.cardHeading}>
				<button
					type="button"
					className={styles.cardToggle}
					aria-expanded={expanded}
					aria-controls={bodyId}
					onClick={() => onToggle(id)}
				>
					<span className={styles.cardIcon} aria-hidden="true">
						<Icon size={20} />
					</span>
					<span className={styles.cardText}>
						<span className={styles.cardTitle}>{title}</span>
						<span className={styles.cardDescription}>{description}</span>
					</span>
					<span className={styles.cardChevron} aria-hidden="true">
						{expanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
					</span>
				</button>
			</h2>
			{expanded && (
				<div id={bodyId} className={styles.cardBody}>
					{children}
				</div>
			)}
		</section>
	);
};

export default HostHubCard;
