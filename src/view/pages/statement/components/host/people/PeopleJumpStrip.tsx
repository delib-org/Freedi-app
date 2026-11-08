import { FC } from 'react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { Chip } from '@/view/components/atomic/atoms/Chip';
import { PeopleAnchor } from '../hostHubLogic';
import styles from '../PeopleSection.module.scss';

export interface JumpTarget {
	anchor: PeopleAnchor;
	label: string;
	count?: number;
	/** Something waits for the host here; the count is emphasised. */
	needsAttention?: boolean;
}

interface PeopleJumpStripProps {
	targets: ReadonlyArray<JumpTarget>;
	onJump: (anchor: PeopleAnchor) => void;
}

/**
 * Desktop jump strip (design §3.2): one chip per visible subsection, with
 * its count. Buttons, not links, so phones (where it is hidden) get no
 * duplicate anchors in the tab order.
 */
const PeopleJumpStrip: FC<PeopleJumpStripProps> = ({ targets, onJump }) => {
	const { t } = useTranslation();

	return (
		<nav className={styles.jump} aria-label={t('people.sections')}>
			{targets.map(({ anchor, label, count, needsAttention }) => (
				<Chip
					key={anchor}
					label={label}
					count={count}
					className={needsAttention ? styles.jumpChipAttention : undefined}
					onClick={() => onJump(anchor)}
				/>
			))}
		</nav>
	);
};

export default PeopleJumpStrip;
